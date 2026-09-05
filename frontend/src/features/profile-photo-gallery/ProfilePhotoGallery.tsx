import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type TouchEvent as ReactTouchEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";

import useBackDismiss from "../../hooks/useBackDismiss";
import type { FeedPost } from "../../services/postService";
import {
  buildProfilePhotoList,
  getProfilePhotoThumbnailURL,
  type ProfilePhoto,
} from "./profilePhotoGallery.utils";

import "./ProfilePhotoGallery.css";

type ProfilePhotoGalleryProps = {
  posts: FeedPost[];
  ownerName: string;
};

type PhotoSelection = {
  photo: ProfilePhoto;
  index: number;
};

const SWIPE_DISTANCE = 52;

export const ProfilePhotoGallerySkeleton = () => {
  return (
    <div
      className="profilePhotoSkeletonGrid"
      aria-label="Loading photos"
      aria-busy="true"
    >
      {Array.from({ length: 7 }).map(
        (_, index) => (
          <span key={index} />
        ),
      )}
    </div>
  );
};

export const ProfilePhotoGallery = ({
  posts,
  ownerName,
}: ProfilePhotoGalleryProps) => {
  const photos = useMemo(
    () => buildProfilePhotoList(posts),
    [posts],
  );

  const [selection, setSelection] =
    useState<PhotoSelection | null>(null);

  const closeButtonRef =
    useRef<HTMLButtonElement | null>(null);

  const restoreFocusRef =
    useRef<HTMLButtonElement | null>(null);

  const touchStartXRef = useRef<number | null>(
    null,
  );

  const viewerIndex = useMemo(
    () => {
      if (!selection) {
        return -1;
      }

      const currentIndex = photos.findIndex(
        (photo) =>
          photo.key === selection.photo.key,
      );

      return currentIndex >= 0
        ? currentIndex
        : selection.index;
    },
    [photos, selection],
  );

  const selectedPhoto =
    selection &&
    photos[viewerIndex]?.key ===
      selection.photo.key
      ? photos[viewerIndex]
      : selection?.photo ?? null;

  const viewerOpen = Boolean(selectedPhoto);

  const closeViewer = useCallback(() => {
    setSelection(null);
  }, []);

  const { dismiss } = useBackDismiss({
    isOpen: viewerOpen,
    onDismiss: closeViewer,
    stateKey: "profile-photo-viewer",
  });

  const openViewer = useCallback(
    (
      photo: ProfilePhoto,
      photoIndex: number,
      trigger: HTMLButtonElement,
    ) => {
      restoreFocusRef.current = trigger;
      setSelection({
        photo,
        index: photoIndex,
      });
    },
    [],
  );

  const showPrevious = useCallback(() => {
    if (viewerIndex <= 0) {
      return;
    }

    const previousPhoto = photos[viewerIndex - 1];

    if (previousPhoto) {
      setSelection({
        photo: previousPhoto,
        index: viewerIndex - 1,
      });
    }
  }, [photos, viewerIndex]);

  const showNext = useCallback(() => {
    if (
      viewerIndex < 0 ||
      viewerIndex >= photos.length - 1
    ) {
      return;
    }

    const nextPhoto = photos[viewerIndex + 1];

    if (nextPhoto) {
      setSelection({
        photo: nextPhoto,
        index: viewerIndex + 1,
      });
    }
  }, [photos, viewerIndex]);

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

      window.cancelAnimationFrame(focusFrame);

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

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        showPrevious();
        return;
      }

      if (event.key === "ArrowRight") {
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

  useEffect(() => {
    if (!selectedPhoto) {
      return;
    }

    const adjacentPhotos = [
      photos[viewerIndex - 1],
      photos[viewerIndex + 1],
    ].filter(
      (photo): photo is ProfilePhoto =>
        Boolean(photo),
    );

    adjacentPhotos.forEach((photo) => {
      const image = new Image();
      image.src = photo.url;
    });
  }, [photos, selectedPhoto, viewerIndex]);

  const handleTouchStart = useCallback(
    (event: ReactTouchEvent<HTMLDivElement>) => {
      touchStartXRef.current =
        event.touches.length === 1
          ? event.touches[0]?.clientX ?? null
          : null;
    },
    [],
  );

  const handleTouchEnd = useCallback(
    (event: ReactTouchEvent<HTMLDivElement>) => {
      const startX = touchStartXRef.current;
      touchStartXRef.current = null;

      if (
        startX === null ||
        event.changedTouches.length !== 1
      ) {
        return;
      }

      const endX =
        event.changedTouches[0]?.clientX ??
        startX;

      const distance = endX - startX;

      if (Math.abs(distance) < SWIPE_DISTANCE) {
        return;
      }

      if (distance > 0) {
        showPrevious();
      } else {
        showNext();
      }
    },
    [showNext, showPrevious],
  );

  if (photos.length === 0) {
    return null;
  }

  const viewer =
    selectedPhoto &&
    typeof document !== "undefined"
      ? createPortal(
          <div
            className="profilePhotoViewer"
            role="dialog"
            aria-modal="true"
            aria-label={`${ownerName}'s photo viewer`}
          >
            <header className="profilePhotoViewerHeader">
              <button
                ref={closeButtonRef}
                type="button"
                className="profilePhotoViewerClose"
                onClick={dismiss}
                aria-label="Close photo viewer"
              >
                <X size={25} />
              </button>

              <strong aria-live="polite">
                {viewerIndex + 1} / {photos.length}
              </strong>
            </header>

            <div
              className="profilePhotoViewerStage"
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
            >
              <img
                key={selectedPhoto.key}
                src={selectedPhoto.url}
                alt={`${ownerName}'s photo ${
                  viewerIndex + 1
                }`}
                loading="eager"
                decoding="async"
                draggable="false"
              />
            </div>

            {viewerIndex > 0 ? (
              <button
                type="button"
                className="profilePhotoViewerNav previous"
                onClick={showPrevious}
                aria-label="View previous photo"
              >
                <ChevronLeft size={30} />
              </button>
            ) : null}

            {viewerIndex < photos.length - 1 ? (
              <button
                type="button"
                className="profilePhotoViewerNav next"
                onClick={showNext}
                aria-label="View next photo"
              >
                <ChevronRight size={30} />
              </button>
            ) : null}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <section
        className="profilePhotoGallery"
        aria-label={`${ownerName}'s photos`}
      >
        <div className="profilePhotoGrid">
          {photos.map((photo, index) => {
            const thumbnailURL =
              getProfilePhotoThumbnailURL(
                photo.url,
              );

            return (
              <button
                key={photo.key}
                type="button"
                className="profilePhotoTile"
                onClick={(event) =>
                  openViewer(
                    photo,
                    index,
                    event.currentTarget,
                  )
                }
                aria-label={`Open photo ${
                  index + 1
                } of ${photos.length}`}
              >
                <img
                  src={thumbnailURL}
                  alt=""
                  loading={
                    index < 4 ? "eager" : "lazy"
                  }
                  decoding="async"
                  draggable="false"
                  onError={(event) => {
                    const image = event.currentTarget;

                    if (
                      image.dataset.fallback !==
                      "true"
                    ) {
                      image.dataset.fallback = "true";
                      image.src = photo.url;
                    }
                  }}
                />
              </button>
            );
          })}
        </div>
      </section>

      {viewer}
    </>
  );
};