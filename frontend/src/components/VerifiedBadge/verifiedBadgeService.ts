import api from "../../services/api";

export type VerifiedBadgeType =
  | "verified";

export type ResolvedVerifiedBadge = {
  user_id: string;
  badge_type: VerifiedBadgeType;
};

type ResolveVerifiedBadgesResponse = {
  badges?: unknown[];
};

export const VERIFIED_BADGE_BATCH_LIMIT =
  200;

const NO_CACHE_HEADERS = {
  "Cache-Control":
    "private, no-store, no-cache, must-revalidate",
  Pragma: "no-cache",
} as const;

const normalizeString = (
  value: unknown,
): string => {
  return typeof value === "string"
    ? value.trim()
    : "";
};

const normalizeUserIDs = (
  userIDs: readonly string[],
): string[] => {
  const uniqueUserIDs =
    new Set<string>();

  for (const userID of userIDs) {
    const cleanUserID =
      normalizeString(userID);

    if (cleanUserID) {
      uniqueUserIDs.add(
        cleanUserID,
      );
    }
  }

  return Array.from(
    uniqueUserIDs,
  );
};

const normalizeBadge = (
  value: unknown,
): ResolvedVerifiedBadge | null => {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return null;
  }

  const badge =
    value as Record<string, unknown>;

  const userID =
    normalizeString(
      badge.user_id,
    );

  const badgeType =
    normalizeString(
      badge.badge_type,
    );

  if (
    !userID ||
    badgeType !== "verified"
  ) {
    return null;
  }

  return {
    user_id: userID,
    badge_type: "verified",
  };
};

export const resolveVerifiedBadges =
  async (
    userIDs: readonly string[],
    signal?: AbortSignal,
  ): Promise<
    ResolvedVerifiedBadge[]
  > => {
    const normalizedUserIDs =
      normalizeUserIDs(
        userIDs,
      );

    if (
      normalizedUserIDs.length === 0
    ) {
      return [];
    }

    if (
      normalizedUserIDs.length >
      VERIFIED_BADGE_BATCH_LIMIT
    ) {
      throw new RangeError(
        `A maximum of ${VERIFIED_BADGE_BATCH_LIMIT} user IDs can be resolved at once`,
      );
    }

    const response =
      await api.post<ResolveVerifiedBadgesResponse>(
        "/verified-badges/resolve",
        {
          user_ids:
            normalizedUserIDs,
        },
        {
          signal,
          headers:
            NO_CACHE_HEADERS,
        },
      );

    const rawBadges =
      Array.isArray(
        response.data?.badges,
      )
        ? response.data.badges
        : [];

    const uniqueBadges =
      new Map<
        string,
        ResolvedVerifiedBadge
      >();

    for (
      const rawBadge
      of rawBadges
    ) {
      const badge =
        normalizeBadge(
          rawBadge,
        );

      if (!badge) {
        continue;
      }

      uniqueBadges.set(
        badge.user_id,
        badge,
      );
    }

    return Array.from(
      uniqueBadges.values(),
    );
  };