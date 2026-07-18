import {
  useCallback,
  useEffect,
  useRef,
} from "react";

const FEED_SCROLL_STATE_KEY =
  "__everest_feed_scroll__";

const MAX_RESTORE_FRAMES = 60;

type HistoryStateRecord = Record<string, unknown>;

type ScrollPosition = {
  pageKey: string;
  x: number;
  y: number;
};

type HistoryEntryIdentity = {
  routerKey: string | null;
  routerIndex: number | null;
  url: string;
};

export type UseFeedScrollRestorationOptions = {
  pageKey?: string;
  ready?: boolean;
  enabled?: boolean;
};

const toHistoryStateRecord = (
  value: unknown,
): HistoryStateRecord => {
  if (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  ) {
    return value as HistoryStateRecord;
  }

  return {};
};

const getCurrentURL = (): string => {
  return (
    window.location.pathname +
    window.location.search +
    window.location.hash
  );
};

const getHistoryEntryIdentity =
  (): HistoryEntryIdentity => {
    const state = toHistoryStateRecord(
      window.history.state,
    );

    return {
      routerKey:
        typeof state.key === "string"
          ? state.key
          : null,

      routerIndex:
        typeof state.idx === "number"
          ? state.idx
          : null,

      url: getCurrentURL(),
    };
  };

const isSameHistoryEntry = (
  expected: HistoryEntryIdentity,
  current: HistoryEntryIdentity,
): boolean => {
  if (
    expected.routerKey !== null ||
    current.routerKey !== null
  ) {
    return (
      expected.routerKey !== null &&
      expected.routerKey === current.routerKey
    );
  }

  if (
    expected.routerIndex !== null ||
    current.routerIndex !== null
  ) {
    return (
      expected.routerIndex !== null &&
      expected.routerIndex ===
        current.routerIndex
    );
  }

  return expected.url === current.url;
};

const createEntryToken = (
  pageKey: string,
  identity: HistoryEntryIdentity,
): string => {
  return [
    pageKey,
    identity.routerKey ?? "",
    identity.routerIndex ?? "",
    identity.url,
  ].join(":");
};

const getSavedScrollPosition = (
  pageKey: string,
): ScrollPosition | null => {
  const historyState = toHistoryStateRecord(
    window.history.state,
  );

  const value =
    historyState[FEED_SCROLL_STATE_KEY];

  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return null;
  }

  const scrollState =
    value as HistoryStateRecord;

  if (scrollState.pageKey !== pageKey) {
    return null;
  }

  const x = Number(scrollState.x);
  const y = Number(scrollState.y);

  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y)
  ) {
    return null;
  }

  return {
    pageKey,
    x: Math.max(0, Math.round(x)),
    y: Math.max(0, Math.round(y)),
  };
};

const writeScrollPosition = (
  pageKey: string,
  x: number,
  y: number,
  expectedEntry: HistoryEntryIdentity,
): void => {
  const currentEntry =
    getHistoryEntryIdentity();

  if (
    !isSameHistoryEntry(
      expectedEntry,
      currentEntry,
    )
  ) {
    return;
  }

  const nextPosition: ScrollPosition = {
    pageKey,
    x: Math.max(0, Math.round(x)),
    y: Math.max(0, Math.round(y)),
  };

  const currentPosition =
    getSavedScrollPosition(pageKey);

  if (
    currentPosition?.x === nextPosition.x &&
    currentPosition?.y === nextPosition.y
  ) {
    return;
  }

  const currentState = toHistoryStateRecord(
    window.history.state,
  );

  try {
    window.history.replaceState(
      {
        ...currentState,
        [FEED_SCROLL_STATE_KEY]:
          nextPosition,
      },
      "",
      window.location.href,
    );
  } catch {
    // Browser history unavailable হলে app চলতে থাকবে।
  }
};

export const useFeedScrollRestoration = ({
  pageKey = "home-feed",
  ready = true,
  enabled = true,
}: UseFeedScrollRestorationOptions = {}) => {
  const restoredEntryRef =
    useRef<string | null>(null);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !enabled ||
      !(
        "scrollRestoration" in
        window.history
      )
    ) {
      return;
    }

    const previousBehavior =
      window.history.scrollRestoration;

    window.history.scrollRestoration =
      "manual";

    return () => {
      window.history.scrollRestoration =
        previousBehavior;
    };
  }, [enabled]);

  /*
   * Scroll event প্রতি replaceState না চালিয়ে
   * প্রতি animation frame-এ সর্বোচ্চ একবার save হয়।
   */
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !enabled
    ) {
      return;
    }

    const entryIdentity =
      getHistoryEntryIdentity();

    let animationFrameID: number | null =
      null;

    let pendingPosition: {
      x: number;
      y: number;
    } | null = null;

    const flushPosition = () => {
      animationFrameID = null;

      if (!pendingPosition) {
        return;
      }

      const position = pendingPosition;
      pendingPosition = null;

      writeScrollPosition(
        pageKey,
        position.x,
        position.y,
        entryIdentity,
      );
    };

    const handleScroll = () => {
      pendingPosition = {
        x: window.scrollX,
        y: window.scrollY,
      };

      if (animationFrameID !== null) {
        return;
      }

      animationFrameID =
        window.requestAnimationFrame(
          flushPosition,
        );
    };

    window.addEventListener(
      "scroll",
      handleScroll,
      {
        passive: true,
      },
    );

    return () => {
      window.removeEventListener(
        "scroll",
        handleScroll,
      );

      if (animationFrameID !== null) {
        window.cancelAnimationFrame(
          animationFrameID,
        );

        animationFrameID = null;
      }

      if (pendingPosition) {
        writeScrollPosition(
          pageKey,
          pendingPosition.x,
          pendingPosition.y,
          entryIdentity,
        );
      }
    };
  }, [enabled, pageKey]);

  /*
   * Feed-এর প্রয়োজনীয় database data render হওয়ার
   * পর ready=true হলে position restore হবে।
   */
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !enabled ||
      !ready
    ) {
      return;
    }

    const savedPosition =
      getSavedScrollPosition(pageKey);

    if (!savedPosition) {
      return;
    }

    const entryIdentity =
      getHistoryEntryIdentity();

    const entryToken = createEntryToken(
      pageKey,
      entryIdentity,
    );

    if (
      restoredEntryRef.current === entryToken
    ) {
      return;
    }

    let frameID: number | null = null;
    let attemptCount = 0;
    let cancelled = false;
    let listenersAttached = true;

    const removeInteractionListeners = () => {
      if (!listenersAttached) {
        return;
      }

      listenersAttached = false;

      window.removeEventListener(
        "wheel",
        stopRestoration,
      );

      window.removeEventListener(
        "touchstart",
        stopRestoration,
      );

      window.removeEventListener(
        "pointerdown",
        stopRestoration,
      );

      window.removeEventListener(
        "keydown",
        stopRestoration,
      );
    };

    const finishRestoration = () => {
      cancelled = true;

      if (frameID !== null) {
        window.cancelAnimationFrame(frameID);
        frameID = null;
      }

      removeInteractionListeners();
    };

    function stopRestoration() {
      finishRestoration();
    }

    const restorePosition = () => {
      frameID = null;

      if (cancelled) {
        return;
      }

      if (attemptCount === 0) {
        restoredEntryRef.current =
          entryToken;
      }

      attemptCount += 1;

      const documentHeight = Math.max(
        document.documentElement.scrollHeight,
        document.body?.scrollHeight ?? 0,
      );

      const maximumScrollY = Math.max(
        0,
        documentHeight - window.innerHeight,
      );

      const availableTargetY = Math.min(
        savedPosition.y,
        maximumScrollY,
      );

      window.scrollTo({
        left: savedPosition.x,
        top: availableTargetY,
        behavior: "auto",
      });

      const fullTargetAvailable =
        maximumScrollY >= savedPosition.y;

      const targetReached =
        Math.abs(
          window.scrollY - savedPosition.y,
        ) <= 2;

      if (
        (fullTargetAvailable &&
          targetReached) ||
        attemptCount >= MAX_RESTORE_FRAMES
      ) {
        finishRestoration();
        return;
      }

      frameID =
        window.requestAnimationFrame(
          restorePosition,
        );
    };

    window.addEventListener(
      "wheel",
      stopRestoration,
      {
        passive: true,
      },
    );

    window.addEventListener(
      "touchstart",
      stopRestoration,
      {
        passive: true,
      },
    );

    window.addEventListener(
      "pointerdown",
      stopRestoration,
      {
        passive: true,
      },
    );

    window.addEventListener(
      "keydown",
      stopRestoration,
    );

    frameID =
      window.requestAnimationFrame(
        restorePosition,
      );

    return finishRestoration;
  }, [enabled, pageKey, ready]);

  const saveScrollPosition =
    useCallback(() => {
      if (
        typeof window === "undefined" ||
        !enabled
      ) {
        return;
      }

      const entryIdentity =
        getHistoryEntryIdentity();

      writeScrollPosition(
        pageKey,
        window.scrollX,
        window.scrollY,
        entryIdentity,
      );
    }, [enabled, pageKey]);

  const restoreScrollPosition =
    useCallback((): boolean => {
      if (
        typeof window === "undefined" ||
        !enabled
      ) {
        return false;
      }

      const savedPosition =
        getSavedScrollPosition(pageKey);

      if (!savedPosition) {
        return false;
      }

      window.scrollTo({
        left: savedPosition.x,
        top: savedPosition.y,
        behavior: "auto",
      });

      return true;
    }, [enabled, pageKey]);

  const clearScrollPosition =
    useCallback(() => {
      if (typeof window === "undefined") {
        return;
      }

      const currentState =
        toHistoryStateRecord(
          window.history.state,
        );

      if (
        !(
          FEED_SCROLL_STATE_KEY in
          currentState
        )
      ) {
        return;
      }

      const nextState = {
        ...currentState,
      };

      delete nextState[
        FEED_SCROLL_STATE_KEY
      ];

      try {
        window.history.replaceState(
          nextState,
          "",
          window.location.href,
        );
      } catch {
        // Browser history unavailable হলেও app চলবে।
      }
    }, []);

  return {
    saveScrollPosition,
    restoreScrollPosition,
    clearScrollPosition,
  };
};

export default useFeedScrollRestoration;