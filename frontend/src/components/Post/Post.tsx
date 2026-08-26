import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { MessageCircle, Send, User, X } from "lucide-react";
import type { FeedPost, MediaItem } from "../../services/postService";
import PostOptionsMenu from "./PostOptionsMenu";
import PostReactions from "../Reactions/PostReactions";
import CommentSection from "../Comment/CommentSection";
import { ProfileLink } from "../../profileView";

import {useEditedPost,} from "../../pages/editMediaPost/PostEditContext";

import "./Post.css";

type PostProps = {
  post: FeedPost;
};

type CaptionPart =
  | {
      type: "text";
      value: string;
    }
  | {
      type: "hashtag";
      value: string;
    }
  | {
      type: "link";
      value: string;
      href: string;
    };

const CAPTION_PREVIEW_LIMIT = 260;

const captionTokenRegex =
  /(https?:\/\/[^\s]+|www\.[^\s]+|(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?:\/[^\s]*)?|#[\p{L}\p{N}_]+)/gu;

const getFullName = (post: FeedPost) => {
  return `${post.user?.first_name ?? ""} ${post.user?.last_name ?? ""}`.trim();
};

const getPostActionText = (type: string) => {
  if (type === "profile_photo_update") return "updated profile picture";
  if (type === "cover_photo_update") return "updated cover photo";

  return "";
};

const getTimeAgo = (dateString: string) => {
  if (!dateString) return "";

  const postDate = new Date(dateString);
  const diffMs = Date.now() - postDate.getTime();

  if (!Number.isFinite(diffMs)) return "";

  const diffSeconds = Math.max(0, Math.floor(diffMs / 1000));
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffMonths = Math.floor(diffDays / 30);

  if (diffMonths > 0) {
    return `${diffMonths} month${diffMonths > 1 ? "s" : ""} ago`;
  }

  if (diffDays > 0) {
    return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
  }

  if (diffHours > 0) {
    return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  }

  if (diffMinutes > 0) {
    return `${diffMinutes} minute${diffMinutes > 1 ? "s" : ""} ago`;
  }

  return "Just now";
};

const getPostMedia = (post: FeedPost): MediaItem[] => {
  if (Array.isArray(post.media) && post.media.length > 0) {
    return [...post.media]
      .filter((item) => Boolean(item.url))
      .sort((a, b) => a.order - b.order);
  }

  if (post.media_url) {
    return [
      {
        url: post.media_url,
        id: post.media_id ?? "",
        type: post.media_type === "video" ? "video" : "image",
        order: 0,
      },
    ];
  }

  return [];
};

const isHashtag = (value: string) => value.startsWith("#");

const normalizeLinkHref = (value: string) => {
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }

  return `https://${value}`;
};

const parseCaption = (text: string): CaptionPart[] => {
  const parts: CaptionPart[] = [];
  let lastIndex = 0;

  text.replace(captionTokenRegex, (match, _group, offset: number) => {
    if (offset > lastIndex) {
      parts.push({
        type: "text",
        value: text.slice(lastIndex, offset),
      });
    }

    const cleanedMatch = match.trim();

    if (isHashtag(cleanedMatch)) {
      parts.push({
        type: "hashtag",
        value: cleanedMatch,
      });
    } else {
      parts.push({
        type: "link",
        value: cleanedMatch,
        href: normalizeLinkHref(cleanedMatch),
      });
    }

    lastIndex = offset + match.length;

    return match;
  });

  if (lastIndex < text.length) {
    parts.push({
      type: "text",
      value: text.slice(lastIndex),
    });
  }

  return parts;
};

const getCaptionPreview = (caption: string) => {
  if (caption.length <= CAPTION_PREVIEW_LIMIT) {
    return caption;
  }

  const sliced = caption.slice(0, CAPTION_PREVIEW_LIMIT);
  const lastSpaceIndex = sliced.lastIndexOf(" ");

  if (lastSpaceIndex > 180) {
    return sliced.slice(0, lastSpaceIndex).trimEnd();
  }

  return sliced.trimEnd();
};

const getTextPostContent = (post: FeedPost) => {
  return String(post.text ?? post.caption ?? "").trim();
};

const getTextPostClassName = (post: FeedPost, content: string) => {
  const style = post.text_style ?? "bold_center";
  const lengthClass =
    content.length > 260 ? "small" : content.length > 150 ? "medium" : "large";

  if (style === "normal_center") {
    return `postTextCard normal center ${lengthClass}`;
  }

  if (style === "bold_left") {
    return `postTextCard bold left ${lengthClass}`;
  }

  if (style === "normal_left") {
    return `postTextCard normal left ${lengthClass}`;
  }

  return `postTextCard bold center ${lengthClass}`;
};

const getTextPostStyle = (post: FeedPost): CSSProperties => {
  const backgroundKind = post.text_background?.kind ?? "plain";
  const backgroundValue = post.text_background?.value?.trim() || "#ffffff";
  const textColor = post.text_color?.trim() || "#111827";

  if (backgroundKind === "image") {
    return {
      color: textColor,
      backgroundImage: `url("${backgroundValue}")`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
      backgroundColor: "#111827",
    };
  }

  return {
    color: textColor,
    background: backgroundValue,
  };
};

const getSafeCount = (count: unknown) => {
  const numberValue = Number(count);
  return Number.isFinite(numberValue) ? Math.max(0, numberValue) : 0;
};

const getCommentButtonText = (count: number) => {
  const safeCount = getSafeCount(count);

  if (safeCount <= 0) return "Comment";
  if (safeCount === 1) return "1 Comment";

  return `${safeCount} Comments`;
};

const getPostShareURL = (postId: string) => {
  return `${window.location.origin}/post/${postId}`;
};

const CaptionText = ({ caption }: { caption: string }) => {
  const [expanded, setExpanded] = useState(false);

  const isLongCaption = caption.length > CAPTION_PREVIEW_LIMIT;
  const visibleCaption =
    isLongCaption && !expanded ? getCaptionPreview(caption) : caption;

  const captionParts = useMemo(() => {
    return parseCaption(visibleCaption);
  }, [visibleCaption]);

  const renderPart = (part: CaptionPart, index: number): ReactNode => {
    if (part.type === "text") {
      return <span key={`${part.type}-${index}`}>{part.value}</span>;
    }

    if (part.type === "hashtag") {
      const tag = part.value.slice(1);

      return (
        <a
          key={`${part.type}-${part.value}-${index}`}
          className="postCaptionHashtag"
          href={`/hashtag/${encodeURIComponent(tag)}`}
          onClick={(event) => {
            event.stopPropagation();
          }}
        >
          {part.value}
        </a>
      );
    }

    return (
      <a
        key={`${part.type}-${part.value}-${index}`}
        className="postCaptionLink"
        href={part.href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        {part.value}
      </a>
    );
  };

  return (
    <div className="postCaption">
      {captionParts.map(renderPart)}

      {isLongCaption ? (
        <>
          {!expanded ? <span>... </span> : <span> </span>}

          <button
            type="button"
            className="postCaptionSeeMore"
            onClick={() => setExpanded((previous) => !previous)}
          >
            {expanded ? "See less" : "See more"}
          </button>
        </>
      ) : null}
    </div>
  );
};

const Post = ({
  post: sourcePost,
}: PostProps) => {
  const post =
    useEditedPost(sourcePost);
  const viewerTrackRef = useRef<HTMLDivElement | null>(null);

  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

const [commentSectionOpen, setCommentSectionOpen] =
  useState(false);

const [
  deletedFromDatabase,
  setDeletedFromDatabase,
] = useState(false);

const [localCommentsCount, setLocalCommentsCount] =
  useState(
    getSafeCount(post.comments_count)
  );

  const fullName = getFullName(post) || "Everest User";
  const actionText = getPostActionText(post.type);
  const timeAgo = getTimeAgo(post.created_at);
  const profileImageURL = post.user?.profile_image_url?.trim() || "";
  const authorUserID = String(
    post.user_id || post.user?.id || ""
  ).trim();

  const caption = post.caption?.trim() || "";
  const textPostContent = useMemo(() => getTextPostContent(post), [post]);
  const isTextPost = post.type === "text" && textPostContent.length > 0;

  const mediaItems = useMemo(() => getPostMedia(post), [post]);
  const visibleMedia = mediaItems.slice(0, 4);
  const hiddenCount = Math.max(0, mediaItems.length - 4);

  const gridClassName = useMemo(() => {
    const count = mediaItems.length;

    if (count <= 1) return "single";
    if (count === 2) return "two";
    if (count === 3) return "three";

    return "four";
  }, [mediaItems.length]);

  useEffect(() => {
    setLocalCommentsCount(getSafeCount(post.comments_count));
  }, [post.comments_count]);

  useEffect(() => {
  const getEventPostID = (
    event: Event
  ): string => {
    const deleteEvent =
      event as CustomEvent<{
        postID?: string;
      }>;

    return String(
      deleteEvent.detail?.postID ?? ""
    ).trim();
  };

  const isMatchingPost = (
    event: Event
  ): boolean => {
    const eventPostID =
      getEventPostID(event);

    const currentPostID = String(
      post.id ?? ""
    ).trim();

    return (
      eventPostID !== "" &&
      currentPostID !== "" &&
      eventPostID === currentPostID
    );
  };

  const handleOptimisticDelete = (
    event: Event
  ) => {
    if (isMatchingPost(event)) {
      setDeletedFromDatabase(true);
    }
  };

  const handleDeleteSuccess = (
    event: Event
  ) => {
    if (isMatchingPost(event)) {
      setDeletedFromDatabase(true);
    }
  };

  const handleDeleteRollback = (
    event: Event
  ) => {
    if (isMatchingPost(event)) {
      setDeletedFromDatabase(false);
    }
  };

  window.addEventListener(
    "everest:delete-post-optimistic",
    handleOptimisticDelete
  );

  window.addEventListener(
    "everest:delete-post-success",
    handleDeleteSuccess
  );

  window.addEventListener(
    "everest:delete-post-rollback",
    handleDeleteRollback
  );

  return () => {
    window.removeEventListener(
      "everest:delete-post-optimistic",
      handleOptimisticDelete
    );

    window.removeEventListener(
      "everest:delete-post-success",
      handleDeleteSuccess
    );

    window.removeEventListener(
      "everest:delete-post-rollback",
      handleDeleteRollback
    );
  };
}, [post.id]);

  const openViewer = useCallback((index: number) => {
    setViewerIndex(index);
    setViewerOpen(true);
  }, []);

  const closeViewer = useCallback(() => {
    setViewerOpen(false);
  }, []);

  const openCommentSection = useCallback(() => {
    setCommentSectionOpen(true);
  }, []);

  const closeCommentSection = useCallback(() => {
    setCommentSectionOpen(false);
  }, []);

  const handleCommentCountChange = useCallback((count: number) => {
    setLocalCommentsCount(getSafeCount(count));
  }, []);

  const handleNativeShare = useCallback(async () => {
    const shareURL = getPostShareURL(post.id);
    const shareTitle = fullName ? `${fullName}'s post on Everest` : "Everest post";
    const shareText = caption || textPostContent || "Check this post on Everest";

    try {
      if (navigator.share) {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: shareURL,
        });

        return;
      }

      await navigator.clipboard.writeText(shareURL);
    } catch {
      // User cancelled share panel or clipboard failed.
    }
  }, [caption, fullName, post.id, textPostContent]);

  useEffect(() => {
    if (!viewerOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [viewerOpen]);

  useEffect(() => {
    if (!viewerOpen) return;

    const timeoutID = window.setTimeout(() => {
      const track = viewerTrackRef.current;
      const target = track?.children[viewerIndex] as HTMLElement | undefined;

      target?.scrollIntoView({
        behavior: "auto",
        inline: "center",
        block: "nearest",
      });
    }, 0);

    return () => {
      window.clearTimeout(timeoutID);
    };
  }, [viewerIndex, viewerOpen]);

  useEffect(() => {
    if (!viewerOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeViewer();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeViewer, viewerOpen]);

  const handleViewerScroll = useCallback(() => {
    const track = viewerTrackRef.current;
    if (!track) return;

    const width = track.clientWidth;
    if (width <= 0) return;

    const nextIndex = Math.round(track.scrollLeft / width);
    setViewerIndex(Math.max(0, Math.min(nextIndex, mediaItems.length - 1)));
  }, [mediaItems.length]);

  const renderMediaItem = (
    item: MediaItem,
    index: number,
    mode: "grid" | "viewer"
  ) => {
    if (item.type === "video") {
      return (
        <video
          src={item.url}
          controls={mode === "viewer"}
          muted={mode === "grid"}
          playsInline
          preload="metadata"
        />
      );
    }

    return (
      <img
        src={item.url}
        alt={caption || `Post media ${index + 1}`}
        loading={mode === "grid" ? "lazy" : "eager"}
        decoding="async"
      />
    );
  };


  if (deletedFromDatabase) {
  return null;
}

  return (
    <article className="postCard">
      <header className="postHeader">
        <div className="postAuthor">
          <ProfileLink
            userID={authorUserID}
            ariaLabel={`Open ${fullName}'s profile`}
            style={{
              display: "flex",
              flexShrink: 0,
              borderRadius: "50%",
            }}
          >
            <div className="postAvatar">
              {profileImageURL ? (
                <img src={profileImageURL} alt={fullName} />
              ) : (
                <User size={22} strokeWidth={1.8} />
              )}
            </div>
          </ProfileLink>

          <div className="postAuthorText">
            <div className="postAuthorTop">
              <ProfileLink
                userID={authorUserID}
                ariaLabel={`Open ${fullName}'s profile`}
                style={{
                  display: "block",
                  minWidth: 0,
                  overflow: "hidden",
                }}
              >
                <h3>{fullName}</h3>
              </ProfileLink>

              <button type="button" className="postFollowBtn">
                Follow
              </button>
            </div>

            <p>
              {actionText || "shared a post"}
              {timeAgo ? <span>{timeAgo}</span> : null}
            </p>
          </div>
        </div>

        <PostOptionsMenu
          post={post}
          mediaItems={mediaItems}
          caption={caption}
          textPostContent={textPostContent}
        />
      </header>

      {!isTextPost && caption && !actionText ? (
        <CaptionText caption={caption} />
      ) : null}

      {isTextPost ? (
        <section className="postTextWrapper">
          <div
            className={getTextPostClassName(post, textPostContent)}
            style={getTextPostStyle(post)}
          >
            <div className="postTextInner">{textPostContent}</div>
          </div>
        </section>
      ) : null}

      {mediaItems.length > 0 ? (
        <section className={`postMediaGrid ${gridClassName}`}>
          {visibleMedia.map((item, index) => {
            const showOverlay = index === 3 && hiddenCount > 0;

            return (
              <button
                key={`${item.id || item.url}-${index}`}
                type="button"
                className="postMediaTile"
                onClick={() => openViewer(index)}
                aria-label={`Open media ${index + 1}`}
              >
                {renderMediaItem(item, index, "grid")}

                {showOverlay ? (
                  <span className="postMediaMoreOverlay">+{hiddenCount}</span>
                ) : null}
              </button>
            );
          })}
        </section>
      ) : null}

      <footer className="postActions">
        <PostReactions post={post} />

        <button type="button" onClick={openCommentSection}>
          <MessageCircle size={22} strokeWidth={1.9} />
          <span>{getCommentButtonText(localCommentsCount)}</span>
        </button>

        <button type="button" onClick={handleNativeShare}>
          <Send size={21} strokeWidth={1.9} />
          <span>Share</span>
        </button>
      </footer>

      {viewerOpen ? (
        <div className="postMediaViewer" role="dialog" aria-modal="true">
          <header className="postMediaViewerHeader">
            <button
              type="button"
              className="postMediaViewerClose"
              onClick={closeViewer}
              aria-label="Close media viewer"
            >
              <X size={25} />
            </button>

            {mediaItems.length > 1 ? (
              <strong>
                {viewerIndex + 1}/{mediaItems.length}
              </strong>
            ) : null}
          </header>

          <div
            ref={viewerTrackRef}
            className="postMediaViewerTrack"
            onScroll={handleViewerScroll}
          >
            {mediaItems.map((item, index) => (
              <section
                key={`${item.id || item.url}-viewer-${index}`}
                className="postMediaViewerSlide"
              >
                {renderMediaItem(item, index, "viewer")}
              </section>
            ))}
          </div>
        </div>
      ) : null}

      <CommentSection
        postId={post.id}
        open={commentSectionOpen}
        commentsCount={localCommentsCount}
        onClose={closeCommentSection}
        onCommentCountChange={handleCommentCountChange}
      />
    </article>
  );
};

export default memo(Post);