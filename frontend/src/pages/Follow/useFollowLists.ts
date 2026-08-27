import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  followUser,
  getFollowList,
  subscribeToFollowEvents,
  unfollowUser,
} from "./followService";

import type {
  FollowTab,
  FollowUser,
} from "./follow.types";

const FOLLOW_PAGE_SIZE = 20;
const REALTIME_REFRESH_DELAY_MS = 100;

type ApiErrorShape = {
  message?: unknown;
  response?: {
    data?: {
      error?: unknown;
    };
  };
};

const getErrorMessage = (
  error: unknown,
  fallback: string,
) => {
  const apiError = error as ApiErrorShape;
  const responseError =
    apiError.response?.data?.error;

  if (
    typeof responseError === "string" &&
    responseError.trim()
  ) {
    return responseError;
  }

  if (
    typeof apiError.message === "string" &&
    apiError.message.trim()
  ) {
    return apiError.message;
  }

  return fallback;
};

const appendUniqueUsers = (
  currentItems: FollowUser[],
  nextItems: FollowUser[],
) => {
  const seenUserIDs = new Set(
    currentItems.map((item) => item.id),
  );

  return [
    ...currentItems,
    ...nextItems.filter((item) => {
      if (seenUserIDs.has(item.id)) {
        return false;
      }

      seenUserIDs.add(item.id);
      return true;
    }),
  ];
};

export const useFollowLists = (
  activeTab: FollowTab,
) => {
  const [items, setItems] = useState<FollowUser[]>(
    [],
  );
  const [followersCount, setFollowersCount] =
    useState(0);
  const [followingCount, setFollowingCount] =
    useState(0);
  const [nextCursor, setNextCursor] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] =
    useState(false);
  const [error, setError] = useState<string | null>(
    null,
  );
  const [pendingUserIDs, setPendingUserIDs] =
    useState<Set<string>>(() => new Set());

  const requestControllerRef =
    useRef<AbortController | null>(null);
  const actionControllersRef = useRef(
    new Map<string, AbortController>(),
  );
  const requestVersionRef = useRef(0);
  const realtimeRefreshTimerRef =
    useRef<number | null>(null);

  const loadFirstPage = useCallback(
    async (silent = false) => {
      requestControllerRef.current?.abort();

      const controller = new AbortController();
      const requestVersion =
        ++requestVersionRef.current;

      requestControllerRef.current = controller;

      if (!silent) {
        setIsLoading(true);
      }

      setError(null);

      try {
        const response = await getFollowList(
          activeTab,
          "",
          FOLLOW_PAGE_SIZE,
          controller.signal,
        );

        if (
          controller.signal.aborted ||
          requestVersion !==
            requestVersionRef.current
        ) {
          return;
        }

        setItems(response.items);
        setNextCursor(
          response.next_cursor ?? "",
        );
        setHasMore(response.has_more);
        setFollowersCount(
          response.followers_count,
        );
        setFollowingCount(
          response.following_count,
        );
      } catch (requestError: unknown) {
        if (!controller.signal.aborted) {
          setError(
            getErrorMessage(
              requestError,
              "Unable to load follow data",
            ),
          );
        }
      } finally {
        if (
          requestVersion ===
          requestVersionRef.current
        ) {
          setIsLoading(false);
        }
      }
    },
    [activeTab],
  );

  const scheduleRealtimeRefresh = useCallback(() => {
    if (realtimeRefreshTimerRef.current !== null) {
      window.clearTimeout(
        realtimeRefreshTimerRef.current,
      );
    }

    realtimeRefreshTimerRef.current =
      window.setTimeout(() => {
        realtimeRefreshTimerRef.current = null;
        void loadFirstPage(true);
      }, REALTIME_REFRESH_DELAY_MS);
  }, [loadFirstPage]);

  useEffect(() => {
    setItems([]);
    setNextCursor("");
    setHasMore(false);
    setError(null);

    void loadFirstPage();

    return () => {
      requestControllerRef.current?.abort();
    };
  }, [activeTab, loadFirstPage]);

  useEffect(() => {
    return subscribeToFollowEvents(() => {
      scheduleRealtimeRefresh();
    });
  }, [scheduleRealtimeRefresh]);

  useEffect(() => {
    const refreshVisiblePage = () => {
      if (
        document.visibilityState === "visible"
      ) {
        scheduleRealtimeRefresh();
      }
    };

    window.addEventListener(
      "focus",
      refreshVisiblePage,
    );
    document.addEventListener(
      "visibilitychange",
      refreshVisiblePage,
    );

    return () => {
      window.removeEventListener(
        "focus",
        refreshVisiblePage,
      );
      document.removeEventListener(
        "visibilitychange",
        refreshVisiblePage,
      );
    };
  }, [scheduleRealtimeRefresh]);

  useEffect(() => {
    return () => {
      requestControllerRef.current?.abort();

      for (
        const controller of
        actionControllersRef.current.values()
      ) {
        controller.abort();
      }

      actionControllersRef.current.clear();

      if (
        realtimeRefreshTimerRef.current !== null
      ) {
        window.clearTimeout(
          realtimeRefreshTimerRef.current,
        );
      }
    };
  }, []);

  const loadMore = useCallback(async () => {
    if (
      isLoading ||
      isLoadingMore ||
      !hasMore ||
      !nextCursor
    ) {
      return;
    }

    const controller = new AbortController();
    const requestVersion =
      ++requestVersionRef.current;

    requestControllerRef.current?.abort();
    requestControllerRef.current = controller;
    setIsLoadingMore(true);

    try {
      const response = await getFollowList(
        activeTab,
        nextCursor,
        FOLLOW_PAGE_SIZE,
        controller.signal,
      );

      if (
        controller.signal.aborted ||
        requestVersion !== requestVersionRef.current
      ) {
        return;
      }

      setItems((currentItems) =>
        appendUniqueUsers(
          currentItems,
          response.items,
        ),
      );
      setNextCursor(
        response.next_cursor ?? "",
      );
      setHasMore(response.has_more);
      setFollowersCount(
        response.followers_count,
      );
      setFollowingCount(
        response.following_count,
      );
    } catch (requestError: unknown) {
      if (!controller.signal.aborted) {
        setError(
          getErrorMessage(
            requestError,
            "Unable to load more users",
          ),
        );
      }
    } finally {
      if (
        requestVersion ===
        requestVersionRef.current
      ) {
        setIsLoadingMore(false);
      }
    }
  }, [
    activeTab,
    hasMore,
    isLoading,
    isLoadingMore,
    nextCursor,
  ]);

  const toggleFollow = useCallback(
    async (user: FollowUser) => {
      if (
        user.is_self ||
        actionControllersRef.current.has(user.id)
      ) {
        return;
      }

      const controller = new AbortController();
      actionControllersRef.current.set(
        user.id,
        controller,
      );

      setPendingUserIDs((currentIDs) => {
        const nextIDs = new Set(currentIDs);
        nextIDs.add(user.id);
        return nextIDs;
      });
      setError(null);

      try {
        if (user.is_following) {
          await unfollowUser(
            user.id,
            controller.signal,
          );
        } else {
          await followUser(
            user.id,
            controller.signal,
          );
        }

        if (!controller.signal.aborted) {
          await loadFirstPage(true);
        }
      } catch (requestError: unknown) {
        if (!controller.signal.aborted) {
          setError(
            getErrorMessage(
              requestError,
              user.is_following
                ? "Unable to unfollow this user"
                : "Unable to follow this user",
            ),
          );
        }
      } finally {
        actionControllersRef.current.delete(
          user.id,
        );

        setPendingUserIDs((currentIDs) => {
          const nextIDs = new Set(currentIDs);
          nextIDs.delete(user.id);
          return nextIDs;
        });
      }
    },
    [loadFirstPage],
  );

  const refresh = useCallback(() => {
    void loadFirstPage();
  }, [loadFirstPage]);

  return {
    items,
    followersCount,
    followingCount,
    hasMore,
    isLoading,
    isLoadingMore,
    error,
    pendingUserIDs,
    loadMore,
    refresh,
    toggleFollow,
  };
};

export default useFollowLists;
