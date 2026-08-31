import {
  memo,
  useMemo,
  useRef,
} from "react";

import {
  ImagePlus,
  LoaderCircle,
  User,
  X,
} from "lucide-react";

import {
  useEditMediaPost,
} from "./useEditMediaPost";
import { VerifiedName } from "../../components/VerifiedBadge";

import "./EditMediaPost.css";

const EditMediaPost = () => {
  const mediaInputRef =
    useRef<HTMLInputElement | null>(
      null
    );

  const {
    post,

    caption,
    changeCaption,

    mediaItems,
    activeMedia,
    activeIndex,
    selectMedia,

    mediaType,

    loading,
    saving,

    editorError,

    canSave,
    canAddMore,

    inputAccept,
    allowMultiple,

    maxCaptionLength,

    handleFileSelection,
    removeActiveMedia,

    closeEditor,
    savePost,
  } = useEditMediaPost();

  const fullName = useMemo(() => {
    if (!post) {
      return "";
    }

    return `${post.user?.first_name ?? ""} ${
      post.user?.last_name ?? ""
    }`.trim();
  }, [post]);

  const openMediaPicker = () => {
    if (saving) {
      return;
    }

    mediaInputRef.current?.click();
  };

  if (loading) {
    return (
      <main
        className="editMediaPage"
        aria-busy="true"
      >
        <header className="editMediaHeader">
          <button
            type="button"
            className="editMediaCloseButton"
            onClick={closeEditor}
            aria-label="Close edit post"
          >
            <X
              size={26}
              strokeWidth={2.2}
            />
          </button>

          <h1>Edit post</h1>

          <span
            className="editMediaHeaderSpace"
            aria-hidden="true"
          />
        </header>

        <section
          className="editMediaLoadingState"
          role="status"
          aria-live="polite"
        >
          <LoaderCircle
            className="editMediaLoadingIcon"
            size={34}
          />

          <strong>
            Loading post…
          </strong>
        </section>
      </main>
    );
  }

  if (!post) {
    return (
      <main className="editMediaPage">
        <header className="editMediaHeader">
          <button
            type="button"
            className="editMediaCloseButton"
            onClick={closeEditor}
            aria-label="Close edit post"
          >
            <X
              size={26}
              strokeWidth={2.2}
            />
          </button>

          <h1>Edit post</h1>

          <span
            className="editMediaHeaderSpace"
            aria-hidden="true"
          />
        </header>

        <section
          className="editMediaUnavailableState"
          role="alert"
        >
          <strong>
            Post unavailable
          </strong>

          <p>
            {editorError ||
              "This post cannot be edited."}
          </p>

          <button
            type="button"
            onClick={closeEditor}
          >
            Go back
          </button>
        </section>
      </main>
    );
  }

  return (
    <main
      className="editMediaPage"
      aria-busy={saving}
    >
      <input
        ref={mediaInputRef}
        className="editMediaFileInput"
        type="file"
        accept={inputAccept}
        multiple={allowMultiple}
        onChange={
          handleFileSelection
        }
        tabIndex={-1}
      />

      <header className="editMediaHeader">
        <button
          type="button"
          className="editMediaCloseButton"
          onClick={closeEditor}
          disabled={saving}
          aria-label="Close edit post"
        >
          <X
            size={26}
            strokeWidth={2.2}
          />
        </button>

        <h1>Edit post</h1>

        <button
          type="button"
          className="editMediaSaveButton"
          onClick={savePost}
          disabled={!canSave}
        >
          {saving
            ? "Saving…"
            : "Save"}
        </button>
      </header>

      <section className="editMediaAuthor">
        <div className="editMediaAvatar">
          {post.user
            ?.profile_image_url ? (
            <img
              src={
                post.user
                  .profile_image_url
              }
              alt={
                fullName ||
                "Everest user"
              }
            />
          ) : (
            <User
              size={24}
              strokeWidth={3.5}
              aria-hidden="true"
            />
          )}
        </div>

      <VerifiedName
        as="strong"
         userID={
        post.user_id ||
        post.user?.id ||
       ""
      }

  name={fullName}
  fallback="Everest User"
  badgeSize="sm"
/>
      </section>

      <section className="editMediaCaptionSection">
        <textarea
          className="editMediaCaptionInput"
          value={caption}
          placeholder="Write a caption…"
          maxLength={
            maxCaptionLength
          }
          disabled={saving}
          onChange={(event) => {
            changeCaption(
              event.target.value
            );
          }}
          aria-label="Post caption"
        />

        <span
          className={`editMediaCaptionCounter ${
            caption.length >= 2000
              ? "visible"
              : ""
          }`}
          aria-live="polite"
        >
          {caption.length}/
          {maxCaptionLength}
        </span>
      </section>

      {activeMedia ? (
        <>
          <section className="editMediaPreviewSection">
            {mediaItems.length >
            1 ? (
              <span className="editMediaPositionCounter">
                {activeIndex + 1}/
                {mediaItems.length}
              </span>
            ) : null}

            <button
              type="button"
              className="editMediaRemoveButton"
              onClick={
                removeActiveMedia
              }
              disabled={saving}
              aria-label="Remove selected media"
            >
              <X
                size={24}
                strokeWidth={2.3}
              />
            </button>

            {activeMedia.type ===
            "video" ? (
              <video
                key={
                  activeMedia.key
                }
                src={
                  activeMedia.url
                }
                controls
                playsInline
                preload="metadata"
              >
                Your browser does not
                support video.
              </video>
            ) : (
              <img
                key={
                  activeMedia.key
                }
                src={
                  activeMedia.url
                }
                alt="Post media preview"
              />
            )}
          </section>

          {mediaItems.length > 1 &&
          mediaType === "image" ? (
            <section
              className="editMediaThumbnails"
              aria-label="Post images"
            >
              {mediaItems.map(
                (
                  media,
                  index
                ) => (
                  <button
                    key={
                      media.key
                    }
                    type="button"
                    className={`editMediaThumbnailButton ${
                      activeIndex ===
                      index
                        ? "active"
                        : ""
                    }`}
                    onClick={() => {
                      selectMedia(
                        index
                      );
                    }}
                    disabled={
                      saving
                    }
                    aria-label={`Preview image ${
                      index + 1
                    }`}
                    aria-pressed={
                      activeIndex ===
                      index
                    }
                  >
                    <img
                      src={
                        media.url
                      }
                      alt=""
                    />
                  </button>
                )
              )}
            </section>
          ) : null}
        </>
      ) : (
        <button
          type="button"
          className="editMediaEmptyPicker"
          onClick={
            openMediaPicker
          }
          disabled={saving}
        >
          <span className="editMediaPickerIcon">
            <ImagePlus
              size={31}
              strokeWidth={1.9}
            />
          </span>

          <strong>
            Add an image or video
          </strong>

          <small>
            A media post needs at
            least one file
          </small>
        </button>
      )}

      {editorError ? (
        <p
          className="editMediaErrorMessage"
          role="alert"
        >
          {editorError}
        </p>
      ) : null}

      {activeMedia &&
      canAddMore ? (
        <button
          type="button"
          className="editMediaAddMoreButton"
          onClick={
            openMediaPicker
          }
          disabled={saving}
        >
          <span className="editMediaAddMoreIcon">
            <ImagePlus
              size={24}
              strokeWidth={1.9}
            />
          </span>

          <strong>
            Add more
          </strong>

          <small>
            {mediaType ===
            "image"
              ? `${mediaItems.length}/10 selected`
              : "Select media"}
          </small>
        </button>
      ) : null}
    </main>
  );
};

export default memo(
  EditMediaPost
);