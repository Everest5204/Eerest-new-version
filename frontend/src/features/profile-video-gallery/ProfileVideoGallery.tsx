import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type SyntheticEvent,
  type TouchEvent as ReactTouchEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  ChevronUp,
  Play,
  X,
} from "lucide-react";

import ReelPlayer from "../../components/Reels/ReelPlayer";
import useBackDismiss from "../../hooks/useBackDismiss";
import type { FeedPost } from "../../services/postService";
import {
  buildProfileVideoList,
  type ProfileVideo,
} from "./profileVideoGallery.utils";

import "./ProfileVideoGallery.css";

type ProfileVideoGalleryProps = {
  posts: FeedPost[];
  ownerName: string;
};

type VideoSelection = {
  video: ProfileVideo;
  index: number;
};

type ProfileVideoTileProps = {
  video: ProfileVideo;
  index: number;
  totalVideos: number;
  priority: boolean;
  onOpen: (
    video: ProfileVideo,
    index: number,
    trigger: HTMLButtonElement,
  ) => void;
};

const SWIPE_DISTANCE = 58;
const FALLBACK_LOAD_MARGIN = "480px";

const ProfileVideoTile = memo(
  ({
    video,
    index,
    totalVideos,
    priority,
    onOpen,
  }: ProfileVideoTileProps) => {
    const tileRef =
      useRef<HTMLButtonElement | null>(null);

    const [posterFailed, setPosterFailed] =
      useState(false);

    const [posterReady, setPosterReady] =
      useState(false);

    const [
      videoPreviewReady,
      setVideoPreviewReady,
    ] = useState(false);

    const [loadFallback, setLoadFallback] =
      useState(priority);

    const showPoster =
      Boolean(video.posterURL) && !posterFailed;

    useEffect(() => {
      if (showPoster || loadFallback) {
        return;
      }

      const target = tileRef.current;

      if (!target) {
        return;
      }

      if (
        typeof window.IntersectionObserver !==
        "function"
      ) {
        const loadFrame =
          window.requestAnimationFrame(() => {
            setLoadFallback(true);
          });

        return () =>
          window.cancelAnimationFrame(loadFrame);
      }

      const observer = new IntersectionObserver(
        (entries) => {
          if (!entries[0]?.isIntersecting) {
            return;
          }

          setLoadFallback(true);
          observer.disconnect();
        },
        {
          rootMargin: FALLBACK_LOAD_MARGIN,
          threshold: 0.01,
        },
      );

      observer.observe(target);

      return () => observer.disconnect();
    }, [loadFallback, showPoster]);

    const handleVideoMetadata = useCallback(
      (
        event: SyntheticEvent<HTMLVideoElement>,
      ) => {
        const preview = event.currentTarget;

        try {
          preview.currentTime = Math.min(
            0.1,
            Number.isFinite(preview.duration)
              ? preview.duration / 2
              : 0.1,
          );
        } catch {
          setVideoPreviewReady(true);
        }
      },
      [],
    );

    const mediaReady = showPoster
      ? posterReady
      : videoPreviewReady;

    return (
      <button
        ref={tileRef}
        type="button"
        className="profileVideoTile"
        onClick={(event) =>
          onOpen(
            video,
            index,
            event.currentTarget,
          )
        }
        aria-label={`Open video ${
          index + 1
        } of ${totalVideos}`}
      >
        <span
          className={`profileVideoPlaceholder ${
            mediaReady ? "isHidden" : ""
          }`}
          aria-hidden="true"
        >
          <Play
            size={28}
            fill="currentColor"
          />
        </span>

        {showPoster ? (
          <img
            className={`profileVideoPreview ${
              posterReady ? "isReady" : ""
            }`}
            src={video.posterURL}
            alt=""
            loading={
              priority ? "eager" : "lazy"
            }
            decoding="async"
            draggable={false}
            onLoad={() =>
              setPosterReady(true)
            }
            onError={() => {
              setPosterReady(false);
              setPosterFailed(true);
            }}
          />
        ) : loadFallback ? (
          <video
            className={`profileVideoPreview ${
              videoPreviewReady
                ? "isReady"
                : ""
            }`}
            src={video.url}
            preload="metadata"
            muted
            playsInline
            tabIndex={-1}
            aria-hidden="true"
            onLoadedMetadata={
              handleVideoMetadata
            }
            onLoadedData={() =>
              setVideoPreviewReady(true)
            }
          />
        ) : null}

        <span
          className="profileVideoTileShade"
          aria-hidden="true"
        />

        <span
          className="profileVideoPlayBadge"
          aria-hidden="true"
        >
          <Play
            size={17}
            fill="currentColor"
          />
        </span>
      </button>
    );
  },
);

ProfileVideoTile.displayName =
  "ProfileVideoTile";

export const ProfileVideoGallerySkeleton =
  () => {
    return (
      <div
        className="profileVideoSkeletonGrid"
        aria-label="Loading videos"
        aria-busy="true"
      >
        {Array.from({ length: 9 }).map(
          (_, index) => (
            <span key={index} />
          ),
        )}
      </div>
    );
  };

export const ProfileVideoGallery = ({
  posts,
  ownerName,
}: ProfileVideoGalleryProps) => {
  const videos = useMemo(
    () => buildProfileVideoList(posts),
    [posts],
  );

  const [selection, setSelection] =
    useState<VideoSelection | null>(null);

  const [muted, setMuted] = useState(false);

  const closeButtonRef =
    useRef<HTMLButtonElement | null>(null);

  const restoreFocusRef =
    useRef<HTMLButtonElement | null>(null);

  const touchStartRef = useRef<{
    x: number;
    y: number;
  } | null>(null);

  const viewerIndex = useMemo(() => {
    if (!selection) {
      return -1;
    }

    const currentIndex = videos.findIndex(
      (video) =>
        video.key === selection.video.key,
    );

    return currentIndex >= 0
      ? currentIndex
      : selection.index;
  }, [selection, videos]);

  const selectedVideo =
    selection &&
    videos[viewerIndex]?.key ===
      selection.video.key
      ? videos[viewerIndex]
      : selection?.video ?? null;

  const viewerOpen = Boolean(selectedVideo);

  const closeViewer = useCallback(() => {
    setSelection(null);
  }, []);

  const { dismiss } = useBackDismiss({
    isOpen: viewerOpen,
    onDismiss: closeViewer,
    stateKey: "profile-video-viewer",
  });

  const openViewer = useCallback(
    (
      video: ProfileVideo,
      index: number,
      trigger: HTMLButtonElement,
    ) => {
      restoreFocusRef.current = trigger;
      setMuted(false);
      setSelection({
        video,
        index,
      });
    },
    [],
  );

  const showPrevious = useCallback(() => {
    if (viewerIndex <= 0) {
      return;
    }

    const previousVideo =
      videos[viewerIndex - 1];

    if (previousVideo) {
      setSelection({
        video: previousVideo,
        index: viewerIndex - 1,
      });
    }
  }, [videos, viewerIndex]);

  const showNext = useCallback(() => {
    if (
      viewerIndex < 0 ||
      viewerIndex >= videos.length - 1
    ) {
      return;
    }

    const nextVideo =
      videos[viewerIndex + 1];

    if (nextVideo) {
      setSelection({
        video: nextVideo,
        index: viewerIndex + 1,
      });
    }
  }, [videos, viewerIndex]);

  useEffect(() => {
    if (!viewerOpen) {
      return;
    }

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow = "hidden";

    const focusFrame =
      window.requestAnimationFrame(() => {
        closeButtonRef.current?.focus();
      });

    return () => {
      document.body.style.overflow =
        previousOverflow;

      window.cancelAnimationFrame(
        focusFrame,
      );

      window.requestAnimationFrame(() => {
        restoreFocusRef.current?.focus();
      });
    };
  }, [viewerOpen]);

  useEffect(() => {
    if (!viewerOpen) {
      return;
    }

    const handleKeyDown = (
      event: KeyboardEvent,
    ) => {
      if (event.key === "Escape") {
        event.preventDefault();
        dismiss();
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        showPrevious();
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        showNext();
      }
    };

    window.addEventListener(
      "keydown",
      handleKeyDown,
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleKeyDown,
      );
    };
  }, [
    dismiss,
    showNext,
    showPrevious,
    viewerOpen,
  ]);

  const handleTouchStart = useCallback(
    (
      event: ReactTouchEvent<HTMLDivElement>,
    ) => {
      touchStartRef.current =
        event.touches.length === 1
          ? {
              x:
                event.touches[0]
                  ?.clientX ?? 0,
              y:
                event.touches[0]
                  ?.clientY ?? 0,
            }
          : null;
    },
    [],
  );

  const handleTouchEnd = useCallback(
    (
      event: ReactTouchEvent<HTMLDivElement>,
    ) => {
      const startPoint =
        touchStartRef.current;

      touchStartRef.current = null;

      if (
        !startPoint ||
        event.changedTouches.length !== 1
      ) {
        return;
      }

      const touch =
        event.changedTouches[0];

      const distanceX =
        (touch?.clientX ??
          startPoint.x) - startPoint.x;

      const distanceY =
        (touch?.clientY ??
          startPoint.y) - startPoint.y;

      if (
        Math.abs(distanceY) <
          SWIPE_DISTANCE ||
        Math.abs(distanceY) <=
          Math.abs(distanceX)
      ) {
        return;
      }

      if (distanceY > 0) {
        showPrevious();
      } else {
        showNext();
      }
    },
    [showNext, showPrevious],
  );

  if (videos.length === 0) {
    return null;
  }

  const viewer =
    selectedVideo &&
    typeof document !== "undefined"
      ? createPortal(
          <div
            className="profileVideoViewer"
            role="dialog"
            aria-modal="true"
            aria-label={`${ownerName}'s video viewer`}
          >
            <div
              className="profileVideoViewerShell"
              onTouchStart={
                handleTouchStart
              }
              onTouchEnd={handleTouchEnd}
            >
              <ReelPlayer
                key={selectedVideo.key}
                src={selectedVideo.url}
                posterUrl={
                  selectedVideo.posterURL ||
                  undefined
                }
                isActive
                muted={muted}
                shouldPreload
                className="profileVideoViewerPlayer"
                onMutedChange={setMuted}
              />

              <header className="profileVideoViewerHeader">
                <button
                  ref={closeButtonRef}
                  type="button"
                  className="profileVideoViewerClose"
                  onClick={dismiss}
                  aria-label="Close video viewer"
                >
                  <X size={25} />
                </button>

                <strong aria-live="polite">
                  {viewerIndex + 1} /{" "}
                  {videos.length}
                </strong>
              </header>

              {selectedVideo.caption ? (
                <div
                  className="profileVideoViewerCaption"
                  dir="auto"
                >
                  {selectedVideo.caption}
                </div>
              ) : null}

              {viewerIndex > 0 ? (
                <button
                  type="button"
                  className="profileVideoViewerNav previous"
                  onClick={showPrevious}
                  aria-label="View previous video"
                >
                  <ChevronUp size={27} />
                </button>
              ) : null}

              {viewerIndex <
              videos.length - 1 ? (
                <button
                  type="button"
                  className="profileVideoViewerNav next"
                  onClick={showNext}
                  aria-label="View next video"
                >
                  <ChevronDown size={27} />
                </button>
              ) : null}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <section
        className="profileVideoGallery"
        aria-label={`${ownerName}'s videos`}
      >
        <div className="profileVideoGrid">
          {videos.map(
            (video, index) => (
              <ProfileVideoTile
                key={video.key}
                video={video}
                index={index}
                totalVideos={
                  videos.length
                }
                priority={index < 6}
                onOpen={openViewer}
              />
            ),
          )}
        </div>
      </section>

      {viewer}
    </>
  );
};