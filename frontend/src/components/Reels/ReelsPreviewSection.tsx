import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import type {
  KeyboardEvent as ReactKeyboardEvent,
} from "react";

import {
  useNavigate,
} from "react-router-dom";

import useReelsFeed from "../../hooks/useReelsFeed";

import type {
  Reel,
} from "../../services/reelsService";

import ReelPreviewCard from "./ReelPreviewCard";

import "./ReelsPreviewSection.css";

type OpenReelHandler = (
  reel: Reel,
) => void | Promise<void>;

type OpenAllReelsHandler = (
) => void | Promise<void>;

export type ReelsPreviewSectionProps = {
  limit?: number;
  className?: string;

  onOpenReel?: OpenReelHandler;
  onOpenAll?: OpenAllReelsHandler;
};

type HorizontalScrollState = {
  canScrollLeft: boolean;
  canScrollRight: boolean;
};

const PREVIEW_SKELETON_IDS = [
  1,
  2,
  3,
  4,
  5,
] as const;

const normalizeLimit = (
  limit: number,
): number => {
  if (!Number.isFinite(limit)) {
    return 10;
  }

  return Math.min(
    20,
    Math.max(4, Math.floor(limit)),
  );
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

const ReelsPreviewSection = ({
  limit = 10,
  className = "",
  onOpenReel,
  onOpenAll,
}: ReelsPreviewSectionProps) => {
  const navigate = useNavigate();
  const sectionTitleID = useId();

  const trackRef =
    useRef<HTMLDivElement | null>(null);

  const [scrollState, setScrollState] =
    useState<HorizontalScrollState>({
      canScrollLeft: false,
      canScrollRight: false,
    });

  const pageSize = normalizeLimit(limit);

  const {
    reels,
    loading,
    initialLoaded,
    error,
    refresh,
  } = useReelsFeed({
    pageSize,
  });

  const updateHorizontalScrollState =
    useCallback(() => {
      const track = trackRef.current;

      if (!track) {
        return;
      }

      const maximumScrollLeft = Math.max(
        0,
        track.scrollWidth -
          track.clientWidth,
      );

      const nextState = {
        canScrollLeft:
          track.scrollLeft > 3,

        canScrollRight:
          track.scrollLeft <
          maximumScrollLeft - 3,
      };

      setScrollState((currentState) => {
        if (
          currentState.canScrollLeft ===
            nextState.canScrollLeft &&
          currentState.canScrollRight ===
            nextState.canScrollRight
        ) {
          return currentState;
        }

        return nextState;
      });
    }, []);

  useEffect(() => {
    const track = trackRef.current;

    if (!track) {
      return;
    }

    let animationFrameID: number | null =
      null;

    const scheduleUpdate = () => {
      if (animationFrameID !== null) {
        return;
      }

      animationFrameID =
        window.requestAnimationFrame(() => {
          animationFrameID = null;

          updateHorizontalScrollState();
        });
    };

    track.addEventListener(
      "scroll",
      scheduleUpdate,
      {
        passive: true,
      },
    );

    window.addEventListener(
      "resize",
      scheduleUpdate,
      {
        passive: true,
      },
    );

    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(scheduleUpdate)
        : null;

    resizeObserver?.observe(track);

    scheduleUpdate();

    return () => {
      track.removeEventListener(
        "scroll",
        scheduleUpdate,
      );

      window.removeEventListener(
        "resize",
        scheduleUpdate,
      );

      resizeObserver?.disconnect();

      if (animationFrameID !== null) {
        window.cancelAnimationFrame(
          animationFrameID,
        );
      }
    };
  }, [
    loading,
    reels.length,
    updateHorizontalScrollState,
  ]);

  const scrollPreview = useCallback(
    (direction: -1 | 1) => {
      const track = trackRef.current;

      if (!track) {
        return;
      }

      const prefersReducedMotion =
        window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        ).matches;

      const scrollDistance = Math.max(
        180,
        Math.floor(
          track.clientWidth * 0.82,
        ),
      );

      track.scrollBy({
        left: direction * scrollDistance,
        behavior: prefersReducedMotion
          ? "auto"
          : "smooth",
      });
    },
    [],
  );

  const handleTrackKeyDown = useCallback(
    (
      event: ReactKeyboardEvent<HTMLDivElement>,
    ) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        scrollPreview(-1);
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        scrollPreview(1);
      }
    },
    [scrollPreview],
  );

  const handleOpenReel = useCallback(
    (
      reel: Reel,
    ): void | Promise<void> => {
      if (onOpenReel) {
        return onOpenReel(reel);
      }

      navigate(
        `/reels/${encodeURIComponent(
          reel.id,
        )}`,
      );
    },
    [navigate, onOpenReel],
  );

  const handleOpenAll =
    useCallback((): void | Promise<void> => {
      if (onOpenAll) {
        return onOpenAll();
      }

      navigate("/reels");
    }, [navigate, onOpenAll]);

  const handleRetry = useCallback(() => {
    void refresh();
  }, [refresh]);

  const isInitialLoading =
    loading && reels.length === 0;

  const errorMessage = error
    ? getErrorMessage(error)
    : "";

  /*
   * Database-এ কোনো video post না থাকলে Home Feed-এ
   * খালি Reels section দেখানো হবে না।
   */
  if (
    initialLoaded &&
    reels.length === 0 &&
    !errorMessage
  ) {
    return null;
  }

  const rootClassName = [
    "reels-preview-section",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section
      className={rootClassName}
      aria-labelledby={sectionTitleID}
      aria-busy={isInitialLoading}
    >
      <header className="reels-preview-section__header">
        <button
          type="button"
          className="reels-preview-section__title-button"
          aria-label="Open all Reels"
          onClick={() => {
            void Promise.resolve(
              handleOpenAll(),
            ).catch(() => undefined);
          }}
        >
          <svg
            className="reels-preview-section__title-icon"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <rect
              x="3"
              y="4"
              width="18"
              height="16"
              rx="3"
              stroke="currentColor"
              strokeWidth="1.8"
            />

            <path
              d="m7 4 3.5 4M13 4l3.5 4M3 9h18"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />

            <path
              d="m10 12 5 3-5 3v-6Z"
              fill="currentColor"
            />
          </svg>

          <span
            id={sectionTitleID}
            className="reels-preview-section__title"
          >
            Reels
          </span>
        </button>

        <div className="reels-preview-section__header-actions">
          <button
            type="button"
            className="reels-preview-section__see-all"
            onClick={() => {
              void Promise.resolve(
                handleOpenAll(),
              ).catch(() => undefined);
            }}
          >
            See all
          </button>

          <div
            className="reels-preview-section__desktop-navigation"
            aria-label="Reels preview navigation"
          >
            <button
              type="button"
              className="reels-preview-section__arrow"
              disabled={
                !scrollState.canScrollLeft
              }
              aria-label="Previous Reels"
              onClick={() =>
                scrollPreview(-1)
              }
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="m15 18-6-6 6-6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>

            <button
              type="button"
              className="reels-preview-section__arrow"
              disabled={
                !scrollState.canScrollRight
              }
              aria-label="Next Reels"
              onClick={() =>
                scrollPreview(1)
              }
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="m9 18 6-6-6-6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {errorMessage &&
      reels.length === 0 ? (
        <div
          className="reels-preview-section__error"
          role="alert"
        >
          <p>{errorMessage}</p>

          <button
            type="button"
            onClick={handleRetry}
          >
            আবার চেষ্টা করুন
          </button>
        </div>
      ) : (
        <div
          ref={trackRef}
          className="reels-preview-section__track"
          role="list"
          tabIndex={0}
          aria-label="Reels previews"
          onKeyDown={handleTrackKeyDown}
        >
          {isInitialLoading
            ? PREVIEW_SKELETON_IDS.map(
                (skeletonID) => (
                  <div
                    key={skeletonID}
                    className="reel-preview-card reel-preview-card--skeleton"
                    role="listitem"
                    aria-hidden="true"
                  >
                    <span className="reel-preview-card__skeleton-shimmer" />
                  </div>
                ),
              )
            : reels
                .slice(0, pageSize)
                .map((reel, index) => (
                  <div
                    key={reel.id}
                    className="reels-preview-section__list-item"
                    role="listitem"
                  >
                    <ReelPreviewCard
                      reel={reel}
                      priority={index < 2}
                      onOpen={handleOpenReel}
                    />
                  </div>
                ))}
        </div>
      )}
    </section>
  );
};

export default ReelsPreviewSection;