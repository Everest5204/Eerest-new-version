import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  getReelByID,
  getReels,
  type Reel,
} from "../services/reelsService";

type UseReelsFeedOptions = {
  initialReelID?: string;
  pageSize?: number;
};

type ReelUpdater = (
  currentReel: Reel
) => Reel;

type UseReelsFeedResult = {
  reels: Reel[];

  loading: boolean;
  loadingMore: boolean;
  initialLoaded: boolean;

  error: string;

  hasMore: boolean;
  nextCursor: string;

  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;

  updateReel: (
    reelID: string,
    updater: ReelUpdater
  ) => void;
};

const DEFAULT_PAGE_SIZE = 6;

const getErrorMessage = (
  error: unknown
): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return "Failed to load reels";
};

const mergeUniqueReels = (
  existingReels: Reel[],
  incomingReels: Reel[]
): Reel[] => {
  const reelsMap = new Map<
    string,
    Reel
  >();

  existingReels.forEach(
    (reelItem) => {
      if (!reelItem.id) {
        return;
      }

      reelsMap.set(
        reelItem.id,
        reelItem
      );
    }
  );

  incomingReels.forEach(
    (reelItem) => {
      if (!reelItem.id) {
        return;
      }

      const existingReel =
        reelsMap.get(reelItem.id);

      reelsMap.set(
        reelItem.id,
        existingReel
          ? {
              ...existingReel,
              ...reelItem,

              user: {
                ...existingReel.user,
                ...reelItem.user,
              },

              media:
                reelItem.media.length > 0
                  ? reelItem.media
                  : existingReel.media,
            }
          : reelItem
      );
    }
  );

  return Array.from(
    reelsMap.values()
  );
};

const putSelectedReelFirst = (
  selectedReel: Reel | null,
  feedReels: Reel[]
): Reel[] => {
  if (!selectedReel?.id) {
    return mergeUniqueReels(
      [],
      feedReels
    );
  }

  const remainingReels =
    feedReels.filter(
      (reelItem) =>
        reelItem.id !==
        selectedReel.id
    );

  return [
    selectedReel,
    ...remainingReels,
  ];
};

export const useReelsFeed = (
  options: UseReelsFeedOptions = {}
): UseReelsFeedResult => {
  const {
    initialReelID = "",
    pageSize = DEFAULT_PAGE_SIZE,
  } = options;

  const cleanInitialReelID =
    initialReelID.trim();

  const initialRequestControllerRef =
    useRef<AbortController | null>(
      null
    );

  const loadMoreControllerRef =
    useRef<AbortController | null>(
      null
    );

  const initialRequestSequenceRef =
    useRef(0);

  const loadingMoreRef =
    useRef(false);

  const hasMoreRef =
    useRef(false);

  const nextCursorRef =
    useRef("");

  const [reels, setReels] =
    useState<Reel[]>([]);

  const [loading, setLoading] =
    useState(false);

  const [
    loadingMore,
    setLoadingMore,
  ] = useState(false);

  const [
    initialLoaded,
    setInitialLoaded,
  ] = useState(false);

  const [error, setError] =
    useState("");

  const [hasMore, setHasMore] =
    useState(false);

  const [
    nextCursor,
    setNextCursor,
  ] = useState("");

  const updatePaginationState =
    useCallback(
      (
        cursorValue: string,
        moreAvailable: boolean
      ) => {
        const cleanCursor =
          cursorValue.trim();

        nextCursorRef.current =
          cleanCursor;

        hasMoreRef.current =
          moreAvailable;

        setNextCursor(
          cleanCursor
        );

        setHasMore(
          moreAvailable
        );
      },
      []
    );

  const stopInitialRequest =
    useCallback(() => {
      initialRequestControllerRef.current?.
        abort();

      initialRequestControllerRef.current =
        null;
    }, []);

  const stopLoadMoreRequest =
    useCallback(() => {
      loadMoreControllerRef.current?.
        abort();

      loadMoreControllerRef.current =
        null;

      loadingMoreRef.current =
        false;

      setLoadingMore(false);
    }, []);

  const refresh =
    useCallback(async () => {
      stopInitialRequest();
      stopLoadMoreRequest();

      const requestSequence =
        initialRequestSequenceRef.current +
        1;

      initialRequestSequenceRef.current =
        requestSequence;

      const controller =
        new AbortController();

      initialRequestControllerRef.current =
        controller;

      setLoading(true);
      setInitialLoaded(false);
      setError("");
      setReels([]);

      updatePaginationState(
        "",
        false
      );

      try {
        const feedRequest =
          getReels(
            "",
            pageSize,
            controller.signal
          );

        const selectedReelRequest =
          cleanInitialReelID
            ? getReelByID(
                cleanInitialReelID,
                controller.signal
              )
            : Promise.resolve(
                null
              );

        const [
          feedResult,
          selectedReelResult,
        ] = await Promise.allSettled([
          feedRequest,
          selectedReelRequest,
        ]);

        if (
          controller.signal.aborted ||
          requestSequence !==
            initialRequestSequenceRef.current
        ) {
          return;
        }

        const feedResponse =
          feedResult.status ===
          "fulfilled"
            ? feedResult.value
            : null;

        const selectedReel =
          selectedReelResult.status ===
          "fulfilled"
            ? selectedReelResult.value
            : null;

        if (
          !feedResponse &&
          !selectedReel
        ) {
          const requestError =
            feedResult.status ===
            "rejected"
              ? feedResult.reason
              : selectedReelResult.status ===
                  "rejected"
                ? selectedReelResult.reason
                : new Error(
                    "Failed to load reels"
                  );

          throw requestError;
        }

        const nextReels =
          putSelectedReelFirst(
            selectedReel,
            feedResponse?.reels ?? []
          );

        setReels(nextReels);

        updatePaginationState(
          feedResponse?.next_cursor ??
            "",
          Boolean(
            feedResponse?.has_more
          )
        );
      } catch (requestError) {
        if (
          controller.signal.aborted
        ) {
          return;
        }

        setError(
          getErrorMessage(
            requestError
          )
        );

        setReels([]);

        updatePaginationState(
          "",
          false
        );
      } finally {
        if (
          requestSequence ===
          initialRequestSequenceRef.current
        ) {
          setLoading(false);
          setInitialLoaded(true);

          if (
            initialRequestControllerRef.current ===
            controller
          ) {
            initialRequestControllerRef.current =
              null;
          }
        }
      }
    }, [
      cleanInitialReelID,
      pageSize,
      stopInitialRequest,
      stopLoadMoreRequest,
      updatePaginationState,
    ]);

  const loadMore =
    useCallback(async () => {
      if (
        loadingMoreRef.current ||
        !hasMoreRef.current
      ) {
        return;
      }

      const cursorValue =
        nextCursorRef.current;

      if (!cursorValue) {
        return;
      }

      const controller =
        new AbortController();

      loadMoreControllerRef.current =
        controller;

      loadingMoreRef.current = true;
      setLoadingMore(true);
      setError("");

      try {
        const response =
          await getReels(
            cursorValue,
            pageSize,
            controller.signal
          );

        if (
          controller.signal.aborted
        ) {
          return;
        }

        setReels(
          (currentReels) =>
            mergeUniqueReels(
              currentReels,
              response.reels
            )
        );

        updatePaginationState(
          response.next_cursor,
          response.has_more
        );
      } catch (requestError) {
        if (
          controller.signal.aborted
        ) {
          return;
        }

        setError(
          getErrorMessage(
            requestError
          )
        );
      } finally {
        if (
          loadMoreControllerRef.current ===
          controller
        ) {
          loadMoreControllerRef.current =
            null;

          loadingMoreRef.current =
            false;

          setLoadingMore(false);
        }
      }
    }, [
      pageSize,
      updatePaginationState,
    ]);

  const updateReel =
    useCallback(
      (
        reelID: string,
        updater: ReelUpdater
      ) => {
        const cleanReelID =
          reelID.trim();

        if (!cleanReelID) {
          return;
        }

        setReels(
          (currentReels) =>
            currentReels.map(
              (reelItem) =>
                reelItem.id ===
                cleanReelID
                  ? updater(
                      reelItem
                    )
                  : reelItem
            )
        );
      },
      []
    );

  useEffect(() => {
    void refresh();

    return () => {
      stopInitialRequest();
      stopLoadMoreRequest();
    };
  }, [
    refresh,
    stopInitialRequest,
    stopLoadMoreRequest,
  ]);

  return {
    reels,

    loading,
    loadingMore,
    initialLoaded,

    error,

    hasMore,
    nextCursor,

    refresh,
    loadMore,

    updateReel,
  };
};

export default useReelsFeed;