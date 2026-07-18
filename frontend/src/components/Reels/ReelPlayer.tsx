import { memo, useCallback, useEffect, useRef } from "react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";

import useReelPlayback from "../../hooks/useReelPlayback";

import "./ReelPlayer.css";

const DOUBLE_TAP_DELAY_MS = 280;
const MAX_TAP_DURATION_MS = 450;
const TAP_MOVE_TOLERANCE_PX = 14;
const DOUBLE_TAP_DISTANCE_PX = 56;

type TapPoint = {
  x: number;
  y: number;
  timestamp: number;
};

type PointerStart = {
  pointerID: number;
  x: number;
  y: number;
  timestamp: number;
};

export type ReelPlayerProps = {
  src: string;
  posterUrl?: string | null;
  isActive: boolean;
  muted: boolean;
  shouldPreload?: boolean;
  className?: string;
  onMutedChange?: (muted: boolean) => void;
  onDoubleTap?: () => void | Promise<void>;
};

const isControlTarget = (
  target: EventTarget | null,
): boolean =>
  target instanceof Element &&
  target.closest(
    '[data-reel-control="true"]',
  ) !== null;

const runSafely = (
  task: () => void | Promise<void>,
): void => {
  void Promise.resolve()
    .then(task)
    .catch(() => undefined);
};

const ReelPlayer = memo(
  ({
    src,
    posterUrl,
    isActive,
    muted,
    shouldPreload = false,
    className = "",
    onMutedChange,
    onDoubleTap,
  }: ReelPlayerProps) => {
    const {
      videoRef,
      isPlaying,
      isBuffering,
      hasStarted,
      playbackError,
      play,
    } = useReelPlayback({
      isActive,
      muted,
      sourceKey: src,
    });

    const pointerStartRef =
      useRef<PointerStart | null>(null);

    const lastTapRef =
      useRef<TapPoint | null>(null);

    const singleTapTimerRef =
      useRef<number | null>(null);

    const clearPendingTap = useCallback(() => {
      if (
        singleTapTimerRef.current !== null
      ) {
        window.clearTimeout(
          singleTapTimerRef.current,
        );

        singleTapTimerRef.current = null;
      }

      lastTapRef.current = null;
    }, []);

    useEffect(() => {
      if (!isActive) {
        pointerStartRef.current = null;
        clearPendingTap();
      }
    }, [clearPendingTap, isActive]);

    useEffect(
      () => () => {
        clearPendingTap();
      },
      [clearPendingTap],
    );

    const runPlay = useCallback(() => {
      if (!isActive) {
        return;
      }

      runSafely(play);
    }, [isActive, play]);

    const runTogglePlayback =
      useCallback(() => {
        if (!isActive) {
          return;
        }

        const video = videoRef.current;

        if (!video) {
          return;
        }

        if (
          !video.paused &&
          !video.ended
        ) {
          video.pause();
          return;
        }

        runSafely(async () => {
          if (video.ended) {
            video.currentTime = 0;
          }

          await play();
        });
      }, [isActive, play, videoRef]);

    const runRestart = useCallback(() => {
      if (!isActive) {
        return;
      }

      const video = videoRef.current;

      if (!video) {
        return;
      }

      runSafely(async () => {
        if (video.error) {
          video.load();
        } else {
          video.currentTime = 0;
        }

        await play();
      });
    }, [isActive, play, videoRef]);

    const triggerDoubleTap =
      useCallback(() => {
        if (
          !isActive ||
          !onDoubleTap
        ) {
          return;
        }

        runSafely(onDoubleTap);
      }, [isActive, onDoubleTap]);

    const handlePointerDown =
      useCallback(
        (
          event: ReactPointerEvent<HTMLDivElement>,
        ) => {
          if (
            !isActive ||
            !event.isPrimary ||
            event.button !== 0 ||
            isControlTarget(event.target)
          ) {
            return;
          }

          pointerStartRef.current = {
            pointerID: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            timestamp: event.timeStamp,
          };
        },
        [isActive],
      );

    const handlePointerMove =
      useCallback(
        (
          event: ReactPointerEvent<HTMLDivElement>,
        ) => {
          const pointerStart =
            pointerStartRef.current;

          if (
            !pointerStart ||
            pointerStart.pointerID !==
              event.pointerId
          ) {
            return;
          }

          const movementDistance =
            Math.hypot(
              event.clientX -
                pointerStart.x,
              event.clientY -
                pointerStart.y,
            );

          if (
            movementDistance >
            TAP_MOVE_TOLERANCE_PX
          ) {
            pointerStartRef.current =
              null;

            clearPendingTap();
          }
        },
        [clearPendingTap],
      );

    const handlePointerUp =
      useCallback(
        (
          event: ReactPointerEvent<HTMLDivElement>,
        ) => {
          const pointerStart =
            pointerStartRef.current;

          pointerStartRef.current = null;

          if (
            !isActive ||
            !pointerStart ||
            pointerStart.pointerID !==
              event.pointerId ||
            isControlTarget(event.target)
          ) {
            return;
          }

          const tapDuration =
            event.timeStamp -
            pointerStart.timestamp;

          const movementDistance =
            Math.hypot(
              event.clientX -
                pointerStart.x,
              event.clientY -
                pointerStart.y,
            );

          if (
            tapDuration >
              MAX_TAP_DURATION_MS ||
            movementDistance >
              TAP_MOVE_TOLERANCE_PX
          ) {
            return;
          }

          const currentTap: TapPoint = {
            x: event.clientX,
            y: event.clientY,
            timestamp: event.timeStamp,
          };

          const previousTap =
            lastTapRef.current;

          const isDoubleTap =
            previousTap !== null &&
            currentTap.timestamp -
              previousTap.timestamp <=
              DOUBLE_TAP_DELAY_MS &&
            Math.hypot(
              currentTap.x -
                previousTap.x,
              currentTap.y -
                previousTap.y,
            ) <=
              DOUBLE_TAP_DISTANCE_PX;

          if (isDoubleTap) {
            clearPendingTap();
            triggerDoubleTap();
            return;
          }

          lastTapRef.current =
            currentTap;

          if (
            singleTapTimerRef.current !==
            null
          ) {
            window.clearTimeout(
              singleTapTimerRef.current,
            );
          }

          singleTapTimerRef.current =
            window.setTimeout(() => {
              singleTapTimerRef.current =
                null;

              lastTapRef.current = null;

              runTogglePlayback();
            }, DOUBLE_TAP_DELAY_MS);
        },
        [
          clearPendingTap,
          isActive,
          runTogglePlayback,
          triggerDoubleTap,
        ],
      );

    const handlePointerCancel =
      useCallback(() => {
        pointerStartRef.current = null;
        clearPendingTap();
      }, [clearPendingTap]);

    const handlePlayButtonClick =
      useCallback(
        (
          event: ReactMouseEvent<HTMLButtonElement>,
        ) => {
          event.stopPropagation();
          runPlay();
        },
        [runPlay],
      );

    const handleRetryClick =
      useCallback(
        (
          event: ReactMouseEvent<HTMLButtonElement>,
        ) => {
          event.stopPropagation();
          runRestart();
        },
        [runRestart],
      );

    const handleMutedClick =
      useCallback(
        (
          event: ReactMouseEvent<HTMLButtonElement>,
        ) => {
          event.stopPropagation();

          onMutedChange?.(!muted);
        },
        [muted, onMutedChange],
      );

    const handleVideoKeyDown =
      useCallback(
        (
          event: ReactKeyboardEvent<HTMLVideoElement>,
        ) => {
          if (
            event.key !== " " &&
            event.key !== "Enter"
          ) {
            return;
          }

          event.preventDefault();
          runTogglePlayback();
        },
        [runTogglePlayback],
      );

    const preloadMode = isActive
      ? "auto"
      : shouldPreload
        ? "metadata"
        : "none";

    const rootClassName = [
      "reel-player",
      isActive
        ? "reel-player--active"
        : "",
      isPlaying
        ? "reel-player--playing"
        : "reel-player--paused",
      className,
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <div
        className={rootClassName}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={
          handlePointerCancel
        }
      >
        <video
          ref={videoRef}
          className="reel-player__video"
          src={src}
          poster={
            posterUrl || undefined
          }
          preload={preloadMode}
          muted={muted}
          playsInline
          controls={false}
          tabIndex={0}
          aria-label="Reel video"
          onKeyDown={
            handleVideoKeyDown
          }
          onDragStart={(event) =>
            event.preventDefault()
          }
        />

        {isBuffering && isActive && (
          <div
            className="reel-player__loading"
            aria-live="polite"
            aria-label="Video loading"
          >
            <span className="reel-player__spinner" />
          </div>
        )}

        {isActive &&
          !isPlaying &&
          !isBuffering &&
          !playbackError && (
            <button
              type="button"
              className="reel-player__play-button"
              data-reel-control="true"
              aria-label={
                hasStarted
                  ? "Resume video"
                  : "Play video"
              }
              onClick={
                handlePlayButtonClick
              }
            >
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M8 5v14l11-7L8 5Z" />
              </svg>
            </button>
          )}

        {isActive &&
          playbackError && (
            <div
              className="reel-player__error"
              role="alert"
            >
              <p className="reel-player__error-message">
                {playbackError}
              </p>

              <button
                type="button"
                className="reel-player__retry-button"
                data-reel-control="true"
                onClick={
                  handleRetryClick
                }
              >
                আবার চেষ্টা করুন
              </button>
            </div>
          )}

        {onMutedChange && (
          <button
            type="button"
            className="reel-player__sound-button"
            data-reel-control="true"
            aria-label={
              muted
                ? "Turn sound on"
                : "Mute video"
            }
            aria-pressed={!muted}
            onClick={handleMutedClick}
          >
            {muted ? (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M11 5 6.5 9H3v6h3.5L11 19V5Z"
                  fill="currentColor"
                />

                <path
                  d="m16 9 5 5m0-5-5 5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M11 5 6.5 9H3v6h3.5L11 19V5Z"
                  fill="currentColor"
                />

                <path
                  d="M15 9.5a4 4 0 0 1 0 5M18 7a7 7 0 0 1 0 10"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            )}
          </button>
        )}
      </div>
    );
  },
);

ReelPlayer.displayName =
  "ReelPlayer";

export default ReelPlayer;