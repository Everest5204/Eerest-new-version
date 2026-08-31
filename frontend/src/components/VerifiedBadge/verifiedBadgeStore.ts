import {
  resolveVerifiedBadges,
  VERIFIED_BADGE_BATCH_LIMIT,
  type VerifiedBadgeType,
} from "./verifiedBadgeService";

export type VerifiedBadgeStatus =
  | "idle"
  | "loading"
  | "ready"
  | "error";

export type VerifiedBadgeSnapshot =
  Readonly<{
    status: VerifiedBadgeStatus;
    badgeType:
      | VerifiedBadgeType
      | null;
  }>;

type BadgeCacheEntry = {
  snapshot: VerifiedBadgeSnapshot;
  expiresAt: number;
  retryAt: number;
};

type BadgeListener = () => void;

const CACHE_TTL_MS =
  60_000;

const ERROR_RETRY_DELAY_MS =
  15_000;

const USER_ID_PATTERN =
  /^[a-f\d]{24}$/i;

const EMPTY_SNAPSHOT:
  VerifiedBadgeSnapshot =
  Object.freeze({
    status: "idle",
    badgeType: null,
  });

const badgeCache =
  new Map<
    string,
    BadgeCacheEntry
  >();

const listenersByUserID =
  new Map<
    string,
    Set<BadgeListener>
  >();

const queuedUserIDs =
  new Set<string>();

const inFlightUserIDs =
  new Set<string>();

const refreshTimers =
  new Map<
    string,
    ReturnType<typeof setTimeout>
  >();

let flushScheduled =
  false;

const normalizeUserID = (
  value: string,
): string => {
  const userID =
    value.trim();

  return USER_ID_PATTERN.test(
    userID,
  )
    ? userID.toLowerCase()
    : "";
};

const createSnapshot = (
  status: VerifiedBadgeStatus,
  badgeType:
    | VerifiedBadgeType
    | null,
): VerifiedBadgeSnapshot => {
  return Object.freeze({
    status,
    badgeType,
  });
};

const notifyUser = (
  userID: string,
): void => {
  const listeners =
    listenersByUserID.get(
      userID,
    );

  if (!listeners) {
    return;
  }

  for (
    const listener
    of listeners
  ) {
    listener();
  }
};

const clearRefreshTimer = (
  userID: string,
): void => {
  const timer =
    refreshTimers.get(
      userID,
    );

  if (timer === undefined) {
    return;
  }

  clearTimeout(
    timer,
  );

  refreshTimers.delete(
    userID,
  );
};

const scheduleRefresh = (
  userID: string,
  delay: number,
): void => {
  clearRefreshTimer(
    userID,
  );

  const listeners =
    listenersByUserID.get(
      userID,
    );

  if (
    !listeners ||
    listeners.size === 0
  ) {
    return;
  }

  const timer =
    setTimeout(
      () => {
        refreshTimers.delete(
          userID,
        );

        requestVerifiedBadge(
          userID,
          true,
        );
      },
      Math.max(
        0,
        delay,
      ),
    );

  refreshTimers.set(
    userID,
    timer,
  );
};

const scheduleFromCache = (
  userID: string,
): void => {
  const entry =
    badgeCache.get(
      userID,
    );

  if (!entry) {
    return;
  }

  const currentTime =
    Date.now();

  if (
    entry.snapshot.status ===
    "ready"
  ) {
    scheduleRefresh(
      userID,
      entry.expiresAt -
        currentTime,
    );

    return;
  }

  if (
    entry.snapshot.status ===
    "error"
  ) {
    scheduleRefresh(
      userID,
      entry.retryAt -
        currentTime,
    );
  }
};

const setCacheEntry = (
  userID: string,
  entry: BadgeCacheEntry,
): void => {
  badgeCache.set(
    userID,
    entry,
  );

  notifyUser(
    userID,
  );
};

const resolveBatch = async (
  userIDs: string[],
): Promise<void> => {
  try {
    const badges =
      await resolveVerifiedBadges(
        userIDs,
      );

    const badgeTypeByUserID =
      new Map<
        string,
        VerifiedBadgeType
      >();

    for (
      const badge
      of badges
    ) {
      const userID =
        normalizeUserID(
          badge.user_id,
        );

      if (!userID) {
        continue;
      }

      badgeTypeByUserID.set(
        userID,
        badge.badge_type,
      );
    }

    const currentTime =
      Date.now();

    for (
      const userID
      of userIDs
    ) {
      const badgeType =
        badgeTypeByUserID.get(
          userID,
        ) ?? null;

      setCacheEntry(
        userID,
        {
          snapshot:
            createSnapshot(
              "ready",
              badgeType,
            ),

          expiresAt:
            currentTime +
            CACHE_TTL_MS,

          retryAt: 0,
        },
      );

      scheduleRefresh(
        userID,
        CACHE_TTL_MS,
      );
    }
  } catch {
    const currentTime =
      Date.now();

    for (
      const userID
      of userIDs
    ) {
      const previousEntry =
        badgeCache.get(
          userID,
        );

      setCacheEntry(
        userID,
        {
          snapshot:
            createSnapshot(
              "error",
              previousEntry
                ?.snapshot
                .badgeType ??
                null,
            ),

          expiresAt: 0,

          retryAt:
            currentTime +
            ERROR_RETRY_DELAY_MS,
        },
      );

      scheduleRefresh(
        userID,
        ERROR_RETRY_DELAY_MS,
      );
    }
  } finally {
    for (
      const userID
      of userIDs
    ) {
      inFlightUserIDs.delete(
        userID,
      );
    }
  }
};

const flushQueue = (): void => {
  flushScheduled =
    false;

  const batch =
    Array.from(
      queuedUserIDs,
    ).slice(
      0,
      VERIFIED_BADGE_BATCH_LIMIT,
    );

  if (
    batch.length === 0
  ) {
    return;
  }

  for (
    const userID
    of batch
  ) {
    queuedUserIDs.delete(
      userID,
    );

    inFlightUserIDs.add(
      userID,
    );
  }

  void resolveBatch(
    batch,
  );

  if (
    queuedUserIDs.size > 0
  ) {
    scheduleQueueFlush();
  }
};

const scheduleQueueFlush =
  (): void => {
    if (flushScheduled) {
      return;
    }

    flushScheduled =
      true;

    queueMicrotask(
      flushQueue,
    );
  };

export const requestVerifiedBadge = (
  rawUserID: string,
  force = false,
): void => {
  const userID =
    normalizeUserID(
      rawUserID,
    );

  if (!userID) {
    return;
  }

  const currentTime =
    Date.now();

  const existingEntry =
    badgeCache.get(
      userID,
    );

  if (!force) {
    if (
      existingEntry
        ?.snapshot.status ===
        "ready" &&
      existingEntry.expiresAt >
        currentTime
    ) {
      scheduleFromCache(
        userID,
      );

      return;
    }

    if (
      existingEntry
        ?.snapshot.status ===
        "error" &&
      existingEntry.retryAt >
        currentTime
    ) {
      scheduleFromCache(
        userID,
      );

      return;
    }
  }

  if (
    queuedUserIDs.has(
      userID,
    ) ||
    inFlightUserIDs.has(
      userID,
    )
  ) {
    return;
  }

  setCacheEntry(
    userID,
    {
      snapshot:
        createSnapshot(
          "loading",
          existingEntry
            ?.snapshot
            .badgeType ??
            null,
        ),

      expiresAt:
        existingEntry
          ?.expiresAt ??
        0,

      retryAt: 0,
    },
  );

  queuedUserIDs.add(
    userID,
  );

  scheduleQueueFlush();
};

export const getVerifiedBadgeSnapshot =
  (
    rawUserID: string,
  ): VerifiedBadgeSnapshot => {
    const userID =
      normalizeUserID(
        rawUserID,
      );

    if (!userID) {
      return EMPTY_SNAPSHOT;
    }

    return (
      badgeCache.get(
        userID,
      )?.snapshot ??
      EMPTY_SNAPSHOT
    );
  };

export const subscribeToVerifiedBadge =
  (
    rawUserID: string,
    listener: BadgeListener,
  ): (() => void) => {
    const userID =
      normalizeUserID(
        rawUserID,
      );

    if (!userID) {
      return () => undefined;
    }

    const listeners =
      listenersByUserID.get(
        userID,
      ) ??
      new Set<BadgeListener>();

    listeners.add(
      listener,
    );

    listenersByUserID.set(
      userID,
      listeners,
    );

    scheduleFromCache(
      userID,
    );

    return () => {
      const activeListeners =
        listenersByUserID.get(
          userID,
        );

      activeListeners?.delete(
        listener,
      );

      if (
        !activeListeners ||
        activeListeners.size === 0
      ) {
        listenersByUserID.delete(
          userID,
        );

        clearRefreshTimer(
          userID,
        );
      }
    };
  };

export const invalidateVerifiedBadge =
  (
    rawUserID: string,
  ): void => {
    const userID =
      normalizeUserID(
        rawUserID,
      );

    if (!userID) {
      return;
    }

    badgeCache.delete(
      userID,
    );

    clearRefreshTimer(
      userID,
    );

    notifyUser(
      userID,
    );

    if (
      listenersByUserID.has(
        userID,
      )
    ) {
      requestVerifiedBadge(
        userID,
        true,
      );
    }
  };

export const clearVerifiedBadgeCache =
  (): void => {
    const affectedUserIDs =
      new Set<string>([
        ...badgeCache.keys(),
        ...listenersByUserID.keys(),
      ]);

    badgeCache.clear();
    queuedUserIDs.clear();

    for (
      const userID
      of refreshTimers.keys()
    ) {
      clearRefreshTimer(
        userID,
      );
    }

    for (
      const userID
      of affectedUserIDs
    ) {
      notifyUser(
        userID,
      );
    }
  };