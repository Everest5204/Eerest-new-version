import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  useNavigate,
  useParams,
} from "react-router-dom";

import CommentSection from "../../components/Comment/CommentSection";
import ReelCard from "../../components/Reels/ReelCard";

import useBackDismiss from "../../hooks/useBackDismiss";
import useReelsFeed from "../../hooks/useReelsFeed";

import type {
  Reel,
} from "../../services/reelsService";

import "./Reels.css";

const REELS_PAGE_SIZE = 8;
const ACTIVE_REEL_THRESHOLD = 0.5;

type ReelOverrides = Record<string, Reel>;

type ShareCapableNavigator = Navigator & {
  share?: (data: {
    title?: string;
    text?: string;
    url?: string;
  }) => Promise<void>;
};

type UnknownRecord = Record<string, unknown>;

const toRecord = (
  value: unknown,
): UnknownRecord => {
  if (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  ) {
    return value as UnknownRecord;
  }

  return {};
};

const getStringValue = (
  record: UnknownRecord,
  keys: readonly string[],
): string => {
  for (const key of keys) {
    const value = record[key];

    if (
      typeof value === "string" &&
      value.trim()
    ) {
      return value.trim();
    }
  }

  return "";
};

const getNumberValue = (
  record: UnknownRecord,
  keys: readonly string[],
): number => {
  for (const key of keys) {
    const numberValue = Number(record[key]);

    if (Number.isFinite(numberValue)) {
      return Math.max(
        0,
        Math.floor(numberValue),
      );
    }
  }

  return 0;
};

const getErrorMessage = (
  error: unknown,
): string => {
  if (
    error instanceof Error &&
    error.message.trim()
  ) {
    return error.message;
  }

  if (
    typeof error === "string" &&
    error.trim()
  ) {
    return error;
  }

  return "Reels load করা যায়নি।";
};

const Reels = () => {
  const navigate = useNavigate();

  const {
    reelID: routeReelID = "",
  } = useParams<{
    reelID?: string;
  }>();

  const initialReelID =
    routeReelID.trim();

  const scrollContainerRef =
    useRef<HTMLDivElement | null>(null);

  const loadMoreTargetRef =
    useRef<HTMLDivElement | null>(null);

  const initialScrollCompletedRef =
    useRef(false);

  const [activeReelID, setActiveReelID] =
    useState(initialReelID);

  /*
   * Home Feed থেকে Reel open করলে active video soundসহ
   * শুরু হবে। এই shared state শুধু active Reel-এ প্রযোজ্য;
   * inactive Reelগুলো ReelPlayer নিজে pause করে রাখে।
   */
  const [muted, setMuted] =
    useState(false);

  const [
    reelOverrides,
    setReelOverrides,
  ] = useState<ReelOverrides>({});

  const [
    commentReelID,
    setCommentReelID,
  ] = useState("");

  const [
    shareMessage,
    setShareMessage,
  ] = useState("");

  const {
    reels,
    loading,
    loadingMore,
    initialLoaded,
    error,
    hasMore,
    refresh,
    loadMore,
  } = useReelsFeed({
    initialReelID:
      initialReelID || undefined,
    pageSize: REELS_PAGE_SIZE,
  });

  /*
   * Love এবং comment-এর latest server response শুধু
   * বর্তমান screen-এর React state-এ রাখা হয়।
   * কোনো persistent cache/storage ব্যবহার হয় না।
   */
  const displayReels = useMemo(() => {
    return reels.map((reel) => {
      const override =
        reelOverrides[reel.id];

      if (!override) {
        return reel;
      }

      return {
        ...reel,
        ...override,
      } as Reel;
    });
  }, [reelOverrides, reels]);

  const reelIdentityKey = useMemo(() => {
    return displayReels
      .map((reel) => reel.id)
      .join("|");
  }, [displayReels]);

  const activeReelIndex = useMemo(() => {
    const index = displayReels.findIndex(
      (reel) =>
        reel.id === activeReelID,
    );

    return index >= 0 ? index : 0;
  }, [activeReelID, displayReels]);

  const commentReel = useMemo(() => {
    if (!commentReelID) {
      return null;
    }

    return (
      displayReels.find(
        (reel) =>
          reel.id === commentReelID,
      ) ?? null
    );
  }, [commentReelID, displayReels]);

  const closeComments =
    useCallback(() => {
      setCommentReelID("");
    }, []);

  useBackDismiss({
    isOpen: Boolean(commentReelID),
    onDismiss: closeComments,
    stateKey: "reel-comments",
  });

  /*
   * Full-screen Reels page-এর নিচে body scroll বন্ধ।
   */
  useEffect(() => {
    const previousBodyOverflow =
      document.body.style.overflow;

    const previousRootOverflow =
      document.documentElement.style
        .overflow;

    const previousOverscrollBehavior =
      document.documentElement.style
        .overscrollBehavior;

    const previousTitle =
      document.title;

    document.body.style.overflow =
      "hidden";

    document.documentElement.style
      .overflow = "hidden";

    document.documentElement.style
      .overscrollBehavior = "none";

    document.title = "Reels | Everest";

    return () => {
      document.body.style.overflow =
        previousBodyOverflow;

      document.documentElement.style
        .overflow = previousRootOverflow;

      document.documentElement.style
        .overscrollBehavior =
        previousOverscrollBehavior;

      document.title = previousTitle;
    };
  }, []);

  /*
   * URL-এর selected Reel পরিবর্তন হলে initial scroll
   * আবার করার অনুমতি দেওয়া হবে।
   */
  useEffect(() => {
    initialScrollCompletedRef.current =
      false;

    if (initialReelID) {
      setActiveReelID(initialReelID);
    }
  }, [initialReelID]);

  /*
   * কোনো selected ID না থাকলে প্রথম Reel active হবে।
   * URL-এর ID invalid হলে initial load শেষে safe fallback হবে।
   */
  useEffect(() => {
    if (displayReels.length === 0) {
      return;
    }

    if (!activeReelID) {
      setActiveReelID(
        displayReels[0].id,
      );

      return;
    }

    if (!initialLoaded) {
      return;
    }

    const activeReelExists =
      displayReels.some(
        (reel) =>
          reel.id === activeReelID,
      );

    if (activeReelExists) {
      return;
    }

    initialScrollCompletedRef.current =
      true;

    setActiveReelID(
      displayReels[0].id,
    );
  }, [
    activeReelID,
    displayReels,
    initialLoaded,
  ]);

  /*
   * Home preview থেকে নির্দিষ্ট Reel open করলে সেই
   * Reel-এর position-এ যাওয়া হবে।
   */
  useEffect(() => {
    if (
      initialScrollCompletedRef.current ||
      displayReels.length === 0
    ) {
      return;
    }

    const container =
      scrollContainerRef.current;

    if (!container) {
      return;
    }

    const targetReelID =
      initialReelID ||
      displayReels[0].id;

    const slides =
      container.querySelectorAll<HTMLElement>(
        '[data-reel-slide="true"]',
      );

    const targetSlide =
      Array.from(slides).find(
        (slide) =>
          slide.dataset.reelId ===
          targetReelID,
      );

    if (!targetSlide) {
      return;
    }

    const animationFrameID =
      window.requestAnimationFrame(() => {
        const containerRect =
          container.getBoundingClientRect();

        const targetRect =
          targetSlide.getBoundingClientRect();

        const targetTop =
          container.scrollTop +
          targetRect.top -
          containerRect.top;

        container.scrollTo({
          top: targetTop,
          behavior: "auto",
        });

        setActiveReelID(targetReelID);

        initialScrollCompletedRef.current =
          true;
      });

    return () => {
      window.cancelAnimationFrame(
        animationFrameID,
      );
    };
  }, [
    displayReels,
    initialReelID,
    reelIdentityKey,
  ]);

  /*
   * সবচেয়ে বেশি visible Reel-টিই active হবে।
   * ফলে একই সময়ে কেবল একটি video play করবে।
   */
  useEffect(() => {
    const container =
      scrollContainerRef.current;

    if (
      !container ||
      displayReels.length === 0
    ) {
      return;
    }

    const slides =
      container.querySelectorAll<HTMLElement>(
        '[data-reel-slide="true"]',
      );

    const visibilityRatios =
      new Map<string, number>();

    let updateFrameID: number | null =
      null;

    const updateActiveReel = () => {
      updateFrameID = null;

      let mostVisibleReelID = "";
      let highestRatio = 0;

      visibilityRatios.forEach(
        (ratio, reelID) => {
          if (ratio > highestRatio) {
            highestRatio = ratio;
            mostVisibleReelID = reelID;
          }
        },
      );

      if (
        !mostVisibleReelID ||
        highestRatio <
          ACTIVE_REEL_THRESHOLD
      ) {
        return;
      }

      setActiveReelID(
        (currentReelID) =>
          currentReelID ===
          mostVisibleReelID
            ? currentReelID
            : mostVisibleReelID,
      );
    };

    const observer =
      new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            const element =
              entry.target as HTMLElement;

            const reelID =
              element.dataset.reelId;

            if (!reelID) {
              return;
            }

            visibilityRatios.set(
              reelID,
              entry.isIntersecting
                ? entry.intersectionRatio
                : 0,
            );
          });

          if (updateFrameID === null) {
            updateFrameID =
              window.requestAnimationFrame(
                updateActiveReel,
              );
          }
        },
        {
          root: container,
          rootMargin: "0px",
          threshold: [
            0,
            0.25,
            0.5,
            0.75,
            1,
          ],
        },
      );

    slides.forEach((slide) => {
      const reelID =
        slide.dataset.reelId;

      if (reelID) {
        visibilityRatios.set(
          reelID,
          0,
        );
      }

      observer.observe(slide);
    });

    return () => {
      observer.disconnect();

      if (updateFrameID !== null) {
        window.cancelAnimationFrame(
          updateFrameID,
        );
      }

      visibilityRatios.clear();
    };
  }, [
    displayReels.length,
    reelIdentityKey,
  ]);

  /*
   * শেষ Reel-এর কাছাকাছি পৌঁছালে cursor দিয়ে পরের
   * database page load হবে।
   */
  useEffect(() => {
    const container =
      scrollContainerRef.current;

    const target =
      loadMoreTargetRef.current;

    if (
      !container ||
      !target ||
      !hasMore
    ) {
      return;
    }

    const observer =
      new IntersectionObserver(
        (entries) => {
          if (
            entries[0]?.isIntersecting &&
            !loadingMore
          ) {
            void loadMore();
          }
        },
        {
          root: container,
          rootMargin: "100% 0px",
          threshold: 0.01,
        },
      );

    observer.observe(target);

    return () => {
      observer.disconnect();
    };
  }, [
    hasMore,
    loadMore,
    loadingMore,
    reelIdentityKey,
  ]);

  useEffect(() => {
    if (!shareMessage) {
      return;
    }

    const timeoutID =
      window.setTimeout(() => {
        setShareMessage("");
      }, 3200);

    return () => {
      window.clearTimeout(timeoutID);
    };
  }, [shareMessage]);

  const handleBack = useCallback(() => {
    const historyState = toRecord(
      window.history.state,
    );

    const historyIndex = Number(
      historyState.idx,
    );

    if (
      Number.isFinite(historyIndex) &&
      historyIndex > 0
    ) {
      navigate(-1);
      return;
    }

    navigate("/", {
      replace: true,
    });
  }, [navigate]);

  const handleMutedChange =
    useCallback((nextMuted: boolean) => {
      setMuted(nextMuted);
    }, []);

  const handleReelChange =
    useCallback((nextReel: Reel) => {
      setReelOverrides(
        (currentOverrides) => ({
          ...currentOverrides,
          [nextReel.id]: nextReel,
        }),
      );
    }, []);

  const handleOpenComments =
    useCallback((reel: Reel) => {
      setCommentReelID(reel.id);
    }, []);

  const handleCommentCountChange =
    useCallback(
      (
        reelID: string,
        nextCount: number,
      ) => {
        const safeCount = Math.max(
          0,
          Number.isFinite(nextCount)
            ? Math.floor(nextCount)
            : 0,
        );

        setReelOverrides(
          (currentOverrides) => {
            const sourceReel =
              currentOverrides[reelID] ??
              reels.find(
                (reel) =>
                  reel.id === reelID,
              );

            if (!sourceReel) {
              return currentOverrides;
            }

            const nextReel = {
              ...sourceReel,
              comments_count: safeCount,
            } as Reel;

            return {
              ...currentOverrides,
              [reelID]: nextReel,
            };
          },
        );
      },
      [reels],
    );

  const handleShare =
    useCallback(async (reel: Reel) => {
      const shareNavigator =
        window.navigator as
          ShareCapableNavigator;

      if (!shareNavigator.share) {
        setShareMessage(
          "এই browser-এ native Share support নেই।",
        );

        return;
      }

      const reelRecord = toRecord(reel);

      const caption = getStringValue(
        reelRecord,
        [
          "caption",
          "text_content",
          "content",
          "text",
        ],
      );

      const reelURL = new URL(
        `/reels/${encodeURIComponent(
          reel.id,
        )}`,
        window.location.origin,
      ).toString();

      try {
        await shareNavigator.share({
          title: "Everest Reel",
          text: caption || undefined,
          url: reelURL,
        });
      } catch (shareError) {
        if (
          shareError instanceof DOMException &&
          shareError.name === "AbortError"
        ) {
          return;
        }

        setShareMessage(
          "Reel share করা যায়নি।",
        );
      }
    }, []);

  const handleRefresh =
    useCallback(async () => {
      initialScrollCompletedRef.current =
        false;

      setReelOverrides({});
      setCommentReelID("");
      setShareMessage("");

      setActiveReelID(
        initialReelID,
      );

      await refresh();
    }, [initialReelID, refresh]);

  const initialLoading =
    loading &&
    displayReels.length === 0;

  const pageErrorMessage = error
    ? getErrorMessage(error)
    : "";

  const commentCount = commentReel
    ? getNumberValue(
        toRecord(commentReel),
        [
          "comments_count",
          "comment_count",
        ],
      )
    : 0;

  return (
    <main
      className="reels-page"
      aria-label="Reels"
    >
      <header className="reels-page__header">
        <button
          type="button"
          className="reels-page__back-button"
          aria-label="Go back"
          onClick={handleBack}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="m15 18-6-6 6-6"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        <h1>Reels</h1>
      </header>

      <div
        ref={scrollContainerRef}
        className="reels-page__scroller"
        aria-busy={initialLoading}
      >
        {displayReels.map(
          (reel, index) => {
            const isActive =
              reel.id === activeReelID &&
              !commentReelID;

            const shouldPreload =
              Math.abs(
                index - activeReelIndex,
              ) <= 1;

            return (
              <section
                key={reel.id}
                className="reels-page__slide"
                data-reel-slide="true"
                data-reel-id={reel.id}
              >
                <div className="reels-page__card-shell">
                  <ReelCard
                    reel={reel}
                    isActive={isActive}
                    muted={muted}
                    shouldPreload={
                      shouldPreload
                    }
                    onMutedChange={
                      handleMutedChange
                    }
                    onComment={
                      handleOpenComments
                    }
                    onShare={handleShare}
                    onReelChange={
                      handleReelChange
                    }
                  />
                </div>
              </section>
            );
          },
        )}

        {initialLoading && (
          <section
            className="reels-page__slide"
            aria-label="Loading Reels"
          >
            <div className="reels-page__loading">
              <span className="reels-page__loading-spinner" />
              <span>Loading Reels...</span>
            </div>
          </section>
        )}

        {initialLoaded &&
          !initialLoading &&
          displayReels.length === 0 && (
            <section className="reels-page__state">
              {pageErrorMessage ? (
                <>
                  <h2>Reels load হয়নি</h2>
                  <p>{pageErrorMessage}</p>

                  <button
                    type="button"
                    onClick={() => {
                      void handleRefresh();
                    }}
                  >
                    আবার চেষ্টা করুন
                  </button>
                </>
              ) : (
                <>
                  <h2>No Reels yet</h2>
                  <p>
                    নতুন video upload হলে এখানে
                    দেখা যাবে।
                  </p>
                </>
              )}
            </section>
          )}

        {displayReels.length > 0 &&
          pageErrorMessage && (
            <div
              className="reels-page__load-error"
              role="alert"
            >
              <span>{pageErrorMessage}</span>

              <button
                type="button"
                onClick={() => {
                  void handleRefresh();
                }}
              >
                Retry
              </button>
            </div>
          )}

        <div
          ref={loadMoreTargetRef}
          className="reels-page__load-more-target"
          aria-hidden="true"
        />

        {loadingMore && (
          <div
            className="reels-page__loading-more"
            role="status"
          >
            <span />
            Loading more...
          </div>
        )}
      </div>

      {shareMessage && (
        <button
          type="button"
          className="reels-page__toast"
          role="status"
          onClick={() =>
            setShareMessage("")
          }
        >
          <span>{shareMessage}</span>
          <span aria-hidden="true">×</span>
        </button>
      )}

      {commentReel && (
        <CommentSection
          postId={commentReel.id}
          open={true}
          commentsCount={commentCount}
          onClose={closeComments}
          onCommentCountChange={(
            nextCount,
          ) =>
            handleCommentCountChange(
              commentReel.id,
              nextCount,
            )
          }
        />
      )}
    </main>
  );
};

export default memo(Reels);