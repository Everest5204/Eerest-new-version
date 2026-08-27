import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  followConnectionUser,
  getProfileConnections,
  subscribeToProfileConnectionEvents,
  unfollowConnectionUser,
} from "./profileConnectionsService";

import type {
  ProfileConnectionOwner,
  ProfileConnectionTab,
  ProfileConnectionUser,
} from "./profileConnections.types";

const PAGE_SIZE = 20;
const MAX_REFRESH_SIZE = 50;
const REALTIME_REFRESH_DELAY = 300;

export type UseProfileConnectionsResult = {
  owner: ProfileConnectionOwner | null;
  items: ProfileConnectionUser[];

  followersCount: number;
  followingCount: number;

  hasMore: boolean;
  isInitialLoading: boolean;
  isLoadingMore: boolean;

  error: string;

  loadMore: () => Promise<void>;
  reload: () => Promise<void>;

  toggleConnection: (
    userID: string,
  ) => Promise<void>;

  isActionPending: (
    userID: string,
  ) => boolean;

  clearError: () => void;
};

const isAbortError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") {
    return false;
  }

  const requestError = error as {
    name?: unknown;
    code?: unknown;
  };

  return (
    requestError.name === "AbortError" ||
    requestError.code === "ERR_CANCELED"
  );
};

const getErrorMessage = (
  error: unknown,
  fallbackMessage: string,
): string => {
  if (!error || typeof error !== "object") {
    return fallbackMessage;
  }

  const requestError = error as {
    message?: unknown;
    response?: {
      data?: unknown;
    };
  };

  const responseData =
    requestError.response?.data;

  if (
    responseData &&
    typeof responseData === "object"
  ) {
    const apiError = responseData as {
      error?: unknown;
    };

    if (
      typeof apiError.error === "string" &&
      apiError.error.trim()
    ) {
      return apiError.error.trim();
    }
  }

  if (
    typeof requestError.message === "string" &&
    requestError.message.trim()
  ) {
    return requestError.message.trim();
  }

  return fallbackMessage;
};

const mergeConnectionUsers = (
  currentItems: ProfileConnectionUser[],
  incomingItems: ProfileConnectionUser[],
): ProfileConnectionUser[] => {
  const incomingByID = new Map(
    incomingItems.map((item) => [
      item.id,
      item,
    ]),
  );

  const existingIDs = new Set(
    currentItems.map((item) => item.id),
  );

  const mergedItems = currentItems.map(
    (item) =>
      incomingByID.get(item.id) ?? item,
  );

  for (const item of incomingItems) {
    if (!existingIDs.has(item.id)) {
      existingIDs.add(item.id);
      mergedItems.push(item);
    }
  }

  return mergedItems;
};

const getRefreshLimit = (
  currentItemCount: number,
): number => {
  return Math.min(
    MAX_REFRESH_SIZE,
    Math.max(PAGE_SIZE, currentItemCount),
  );
};

export const useProfileConnections = (
  ownerUserID: string,
  tab: ProfileConnectionTab,
): UseProfileConnectionsResult => {
  const normalizedOwnerUserID =
    ownerUserID.trim();

  const requestKey =
    `${normalizedOwnerUserID}:${tab}`;

  const requestKeyRef = useRef(requestKey);
  requestKeyRef.current = requestKey;

  const ownerRef =
    useRef<ProfileConnectionOwner | null>(
      null,
    );

  const itemsRef =
    useRef<ProfileConnectionUser[]>([]);

  const nextCursorRef = useRef("");
  const hasMoreRef = useRef(false);

  const firstPageInFlightRef =
    useRef(false);

  const loadMoreInFlightRef =
    useRef(false);

  const firstPageControllerRef =
    useRef<AbortController | null>(null);

  const loadMoreControllerRef =
    useRef<AbortController | null>(null);

  const actionControllersRef = useRef(
    new Map<string, AbortController>(),
  );

  const realtimeTimerRef = useRef<
    ReturnType<typeof setTimeout> | undefined
  >(undefined);

  const [owner, setOwner] =
    useState<ProfileConnectionOwner | null>(
      null,
    );

  const [items, setItems] = useState<
    ProfileConnectionUser[]
  >([]);

  const [
    followersCount,
    setFollowersCount,
  ] = useState(0);

  const [
    followingCount,
    setFollowingCount,
  ] = useState(0);

  const [hasMore, setHasMore] =
    useState(false);

  const [
    isInitialLoading,
    setIsInitialLoading,
  ] = useState(true);

  const [
    isLoadingMore,
    setIsLoadingMore,
  ] = useState(false);

  const [error, setError] = useState("");

  const [
    pendingUserIDs,
    setPendingUserIDs,
  ] = useState<ReadonlySet<string>>(
    new Set(),
  );

  const applyOwner = useCallback(
    (nextOwner: ProfileConnectionOwner) => {
      ownerRef.current = nextOwner;
      setOwner(nextOwner);
    },
    [],
  );

  const applyItems = useCallback(
    (nextItems: ProfileConnectionUser[]) => {
      itemsRef.current = nextItems;
      setItems(nextItems);
    },
    [],
  );

  const applyPagination = useCallback(
    (
      nextCursor: string,
      nextHasMore: boolean,
    ) => {
      nextCursorRef.current = nextCursor;
      hasMoreRef.current = nextHasMore;

      setHasMore(nextHasMore);
    },
    [],
  );

  const loadFirstPage = useCallback(
    async (
      silent = false,
      limit = PAGE_SIZE,
    ): Promise<void> => {
      if (!normalizedOwnerUserID) {
        if (!silent) {
          setError(
            "A valid profile user ID is required",
          );

          setIsInitialLoading(false);
        }

        return;
      }

      const activeRequestKey =
        `${normalizedOwnerUserID}:${tab}`;

      firstPageControllerRef.current?.abort();
      loadMoreControllerRef.current?.abort();

      loadMoreControllerRef.current = null;
      loadMoreInFlightRef.current = false;
      setIsLoadingMore(false);

      const controller =
        new AbortController();

      firstPageControllerRef.current =
        controller;

      firstPageInFlightRef.current = true;

      if (!silent) {
        setIsInitialLoading(true);
        setError("");
      }

      try {
        const response =
          await getProfileConnections(
            normalizedOwnerUserID,
            tab,
            "",
            limit,
            controller.signal,
          );

        if (
          controller.signal.aborted ||
          requestKeyRef.current !==
            activeRequestKey
        ) {
          return;
        }

        applyOwner(response.owner);
        applyItems(response.items);

        setFollowersCount(
          response.followers_count,
        );

        setFollowingCount(
          response.following_count,
        );

        applyPagination(
          response.next_cursor ?? "",
          response.has_more,
        );
      } catch (requestError) {
        if (
          isAbortError(requestError) ||
          controller.signal.aborted ||
          requestKeyRef.current !==
            activeRequestKey
        ) {
          return;
        }

        if (!silent) {
          setError(
            getErrorMessage(
              requestError,
              "Unable to load profile connections",
            ),
          );
        }
      } finally {
        if (
          firstPageControllerRef.current ===
          controller
        ) {
          firstPageControllerRef.current =
            null;

          firstPageInFlightRef.current =
            false;

          if (
            requestKeyRef.current ===
            activeRequestKey
          ) {
            setIsInitialLoading(false);
          }
        }
      }
    },
    [
      applyItems,
      applyOwner,
      applyPagination,
      normalizedOwnerUserID,
      tab,
    ],
  );

  const loadMore =
    useCallback(async (): Promise<void> => {
      if (
        !normalizedOwnerUserID ||
        !hasMoreRef.current ||
        !nextCursorRef.current ||
        firstPageInFlightRef.current ||
        loadMoreInFlightRef.current
      ) {
        return;
      }

      const activeRequestKey =
        `${normalizedOwnerUserID}:${tab}`;

      const activeCursor =
        nextCursorRef.current;

      const controller =
        new AbortController();

      loadMoreControllerRef.current =
        controller;

      loadMoreInFlightRef.current = true;

      setIsLoadingMore(true);
      setError("");

      try {
        const response =
          await getProfileConnections(
            normalizedOwnerUserID,
            tab,
            activeCursor,
            PAGE_SIZE,
            controller.signal,
          );

        if (
          controller.signal.aborted ||
          requestKeyRef.current !==
            activeRequestKey
        ) {
          return;
        }

        applyOwner(response.owner);

        const mergedItems =
          mergeConnectionUsers(
            itemsRef.current,
            response.items,
          );

        applyItems(mergedItems);

        setFollowersCount(
          response.followers_count,
        );

        setFollowingCount(
          response.following_count,
        );

        applyPagination(
          response.next_cursor ?? "",
          response.has_more,
        );
      } catch (requestError) {
        if (
          isAbortError(requestError) ||
          controller.signal.aborted ||
          requestKeyRef.current !==
            activeRequestKey
        ) {
          return;
        }

        setError(
          getErrorMessage(
            requestError,
            "Unable to load more connections",
          ),
        );
      } finally {
        if (
          loadMoreControllerRef.current ===
          controller
        ) {
          loadMoreControllerRef.current =
            null;

          loadMoreInFlightRef.current =
            false;

          if (
            requestKeyRef.current ===
            activeRequestKey
          ) {
            setIsLoadingMore(false);
          }
        }
      }
    }, [
      applyItems,
      applyOwner,
      applyPagination,
      normalizedOwnerUserID,
      tab,
    ]);

  const toggleConnection = useCallback(
    async (userID: string): Promise<void> => {
      const cleanUserID = userID.trim();

      if (
        !cleanUserID ||
        actionControllersRef.current.has(
          cleanUserID,
        )
      ) {
        return;
      }

      const selectedUser =
        itemsRef.current.find(
          (item) => item.id === cleanUserID,
        );

      if (!selectedUser || selectedUser.is_self) {
        return;
      }

      const activeRequestKey =
        requestKeyRef.current;

      const shouldFollow =
        !selectedUser.is_following;

      const controller =
        new AbortController();

      actionControllersRef.current.set(
        cleanUserID,
        controller,
      );

      setPendingUserIDs((currentIDs) => {
        const nextIDs = new Set(currentIDs);
        nextIDs.add(cleanUserID);

        return nextIDs;
      });

      setError("");

      try {
        const response = shouldFollow
          ? await followConnectionUser(
              cleanUserID,
              controller.signal,
            )
          : await unfollowConnectionUser(
              cleanUserID,
              controller.signal,
            );

        if (
          controller.signal.aborted ||
          requestKeyRef.current !==
            activeRequestKey
        ) {
          return;
        }

        const nextItems =
          itemsRef.current.map((item) => {
            if (item.id !== cleanUserID) {
              return item;
            }

            return {
              ...item,
              is_following:
                response.is_following,
            };
          });

        applyItems(nextItems);

        const currentOwner =
          ownerRef.current;

        if (
          currentOwner?.is_self &&
          selectedUser.is_following !==
            response.is_following
        ) {
          const countDifference =
            response.is_following ? 1 : -1;

          setFollowingCount(
            (currentCount) =>
              Math.max(
                0,
                currentCount +
                  countDifference,
              ),
          );
        }
      } catch (requestError) {
        if (
          isAbortError(requestError) ||
          controller.signal.aborted ||
          requestKeyRef.current !==
            activeRequestKey
        ) {
          return;
        }

        setError(
          getErrorMessage(
            requestError,
            shouldFollow
              ? "Unable to follow this user"
              : "Unable to unfollow this user",
          ),
        );
      } finally {
        if (
          actionControllersRef.current.get(
            cleanUserID,
          ) === controller
        ) {
          actionControllersRef.current.delete(
            cleanUserID,
          );

          setPendingUserIDs(
            (currentIDs) => {
              const nextIDs =
                new Set(currentIDs);

              nextIDs.delete(cleanUserID);

              return nextIDs;
            },
          );
        }
      }
    },
    [applyItems],
  );

  const reload =
    useCallback(async (): Promise<void> => {
      await loadFirstPage(
        false,
        getRefreshLimit(
          itemsRef.current.length,
        ),
      );
    }, [loadFirstPage]);

  const isActionPending = useCallback(
    (userID: string): boolean =>
      pendingUserIDs.has(userID),
    [pendingUserIDs],
  );

  const clearError = useCallback(() => {
    setError("");
  }, []);

  useEffect(() => {
    firstPageControllerRef.current?.abort();
    loadMoreControllerRef.current?.abort();

    for (const controller of
      actionControllersRef.current.values()) {
      controller.abort();
    }

    actionControllersRef.current.clear();

    ownerRef.current = null;
    itemsRef.current = [];

    nextCursorRef.current = "";
    hasMoreRef.current = false;

    firstPageInFlightRef.current = false;
    loadMoreInFlightRef.current = false;

    setOwner(null);
    setItems([]);

    setFollowersCount(0);
    setFollowingCount(0);

    setHasMore(false);
    setIsLoadingMore(false);
    setPendingUserIDs(new Set());
    setError("");

    void loadFirstPage(false, PAGE_SIZE);

    return () => {
      firstPageControllerRef.current?.abort();
      loadMoreControllerRef.current?.abort();

      for (const controller of
        actionControllersRef.current.values()) {
        controller.abort();
      }

      actionControllersRef.current.clear();
    };
  }, [requestKey, loadFirstPage]);

  useEffect(() => {
    const unsubscribe =
      subscribeToProfileConnectionEvents(
        (event) => {
          const currentOwnerID =
            ownerRef.current?.id ?? "";

          const eventMatchesOwner =
            event.actor_user_id ===
              currentOwnerID ||
            event.target_user_id ===
              currentOwnerID;

          const eventMatchesVisibleUser =
            itemsRef.current.some(
              (item) =>
                item.id ===
                  event.actor_user_id ||
                item.id ===
                  event.target_user_id,
            );

          if (
            currentOwnerID &&
            !eventMatchesOwner &&
            !eventMatchesVisibleUser
          ) {
            return;
          }

          if (realtimeTimerRef.current) {
            clearTimeout(
              realtimeTimerRef.current,
            );
          }

          realtimeTimerRef.current =
            setTimeout(() => {
              void loadFirstPage(
                true,
                getRefreshLimit(
                  itemsRef.current.length,
                ),
              );
            }, REALTIME_REFRESH_DELAY);
        },
      );

    return () => {
      unsubscribe();

      if (realtimeTimerRef.current) {
        clearTimeout(
          realtimeTimerRef.current,
        );

        realtimeTimerRef.current =
          undefined;
      }
    };
  }, [loadFirstPage]);

  return {
    owner,
    items,

    followersCount,
    followingCount,

    hasMore,
    isInitialLoading,
    isLoadingMore,

    error,

    loadMore,
    reload,

    toggleConnection,
    isActionPending,
    clearError,
  };
};