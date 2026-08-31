import {
  useCallback,
  useEffect,
  useSyncExternalStore,
} from "react";

import type {
  VerifiedBadgeType,
} from "./verifiedBadgeService";

import {
  getVerifiedBadgeSnapshot,
  requestVerifiedBadge,
  subscribeToVerifiedBadge,
  type VerifiedBadgeStatus,
} from "./verifiedBadgeStore";

export type UseVerifiedBadgeResult = {
  isVerified: boolean;

  badgeType:
    | VerifiedBadgeType
    | null;

  status: VerifiedBadgeStatus;

  isLoading: boolean;

  refresh: () => void;
};

export const useVerifiedBadge = (
  rawUserID?: string,
): UseVerifiedBadgeResult => {
  const userID =
    rawUserID?.trim() ?? "";

  const subscribe =
    useCallback(
      (
        listener: () => void,
      ) => {
        return subscribeToVerifiedBadge(
          userID,
          listener,
        );
      },
      [userID],
    );

  const getSnapshot =
    useCallback(
      () => {
        return getVerifiedBadgeSnapshot(
          userID,
        );
      },
      [userID],
    );

  const snapshot =
    useSyncExternalStore(
      subscribe,
      getSnapshot,
      getSnapshot,
    );

  useEffect(() => {
    if (!userID) {
      return;
    }

    requestVerifiedBadge(
      userID,
    );
  }, [userID]);

  const refresh =
    useCallback(() => {
      if (!userID) {
        return;
      }

      requestVerifiedBadge(
        userID,
        true,
      );
    }, [userID]);

  return {
    isVerified:
      snapshot.badgeType ===
      "verified",

    badgeType:
      snapshot.badgeType,

    status:
      snapshot.status,

    isLoading:
      snapshot.status ===
      "loading",

    refresh,
  };
};