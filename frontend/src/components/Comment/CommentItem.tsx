import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  Heart,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Trash2,
  User,
} from "lucide-react";
import {
  createComment,
  deleteComment,
  getCommentReplies,
  toggleCommentLove,
  updateComment,
  type FeedComment,
} from "../../services/commentService";
import { ProfileLink } from "../../profileView";
import { VerifiedName } from "../VerifiedBadge";
import CommentInput from "./CommentInput";

type CommentItemProps = {
  comment: FeedComment;
  postId: string;
  level?: number;
  onCommentCountChange?: (count: number) => void;
  onUpdated?: (comment: FeedComment) => void;
  onDeleted?: (commentID: string, parentID?: string) => void;
};

const MAX_VISUAL_REPLY_DEPTH = 5;

const getFullName = (comment: FeedComment) => {
  return `${comment.user?.first_name ?? ""} ${
    comment.user?.last_name ?? ""
  }`.trim();
};

const getTimeAgo = (dateString: string) => {
  if (!dateString) return "";

  const commentDate = new Date(dateString);
  const diffMs = Date.now() - commentDate.getTime();

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

const CommentItem = ({
  comment,
  postId,
  level = 0,
  onCommentCountChange,
  onUpdated,
  onDeleted,
}: CommentItemProps) => {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const historyPushedRef = useRef(false);
  const closingByBackButtonRef = useRef(false);

  const [item, setItem] = useState(comment);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [replying, setReplying] = useState(false);

  const lovePendingRef = useRef(false);
  const [lovePending, setLovePending] = useState(false);

  const [repliesOpen, setRepliesOpen] = useState(false);
  const [repliesLoaded, setRepliesLoaded] = useState(false);
  const [repliesLoading, setRepliesLoading] = useState(false);
  const [replies, setReplies] = useState<FeedComment[]>([]);
  const [repliesCursor, setRepliesCursor] = useState("");
  const [repliesHasMore, setRepliesHasMore] = useState(false);

  const fullName = getFullName(item) || "Everest User";
  const profileImageURL = item.user?.profile_image_url?.trim() || "";
  const commentUserID = String(
    item.user_id || item.user?.id || ""
  ).trim();
  const timeAgo = getTimeAgo(item.created_at);

  const isNestedReply = level > 0;
  const visualLevel = Math.min(level, MAX_VISUAL_REPLY_DEPTH);

  const itemStyle: CSSProperties | undefined =
    level > 1
      ? {
          marginLeft: Math.min(visualLevel * 4, 20),
        }
      : undefined;

  useEffect(() => {
    setItem(comment);
  }, [comment]);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
  }, []);

  const toggleMenu = useCallback(() => {
    setMenuOpen((previous) => !previous);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;

      if (menuRef.current?.contains(target)) return;
      if (menuButtonRef.current?.contains(target)) return;

      closeMenu();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenu();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeMenu, menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;

    closingByBackButtonRef.current = false;

    const currentState =
      window.history.state && typeof window.history.state === "object"
        ? window.history.state
        : {};

    window.history.pushState(
      {
        ...currentState,
        everestCommentMenuOpen: true,
      },
      "",
      window.location.href
    );

    historyPushedRef.current = true;

    const handleBackButton = () => {
      closingByBackButtonRef.current = true;
      historyPushedRef.current = false;
      setMenuOpen(false);
    };

    window.addEventListener("popstate", handleBackButton);

    return () => {
      window.removeEventListener("popstate", handleBackButton);

      if (historyPushedRef.current && !closingByBackButtonRef.current) {
        historyPushedRef.current = false;
        window.history.back();
      }
    };
  }, [menuOpen]);

  const loadReplies = useCallback(
    async (cursor = "") => {
      try {
        setRepliesLoading(true);

        const response = await getCommentReplies(item.id, cursor, 10);

        setReplies((previous) => {
          if (!cursor) return response.comments;

          const existingIDs = new Set(previous.map((reply) => reply.id));
          const newReplies = response.comments.filter(
            (reply) => !existingIDs.has(reply.id)
          );

          return [...previous, ...newReplies];
        });

        setRepliesCursor(response.next_cursor);
        setRepliesHasMore(response.has_more);
        setRepliesLoaded(true);
        setRepliesOpen(true);
      } finally {
        setRepliesLoading(false);
      }
    },
    [item.id]
  );

  const handleToggleReplies = async () => {
    if (repliesOpen) {
      setRepliesOpen(false);
      return;
    }

    if (!repliesLoaded) {
      await loadReplies("");
      return;
    }

    setRepliesOpen(true);
  };

 const handleLove = async () => {
  if (lovePendingRef.current) return;

  lovePendingRef.current = true;
  setLovePending(true);

  const previousLoved = item.is_loved_by_me;
  const previousCount = item.loves_count;

  setItem((current) => ({
    ...current,
    is_loved_by_me: !previousLoved,
    loves_count: Math.max(
      0,
      previousCount + (previousLoved ? -1 : 1),
    ),
  }));

  try {
    const response = await toggleCommentLove(item.id);

    setItem((current) => ({
      ...current,
      is_loved_by_me: response.loved,
      loves_count: response.loves_count,
    }));
  } catch {
    setItem((current) => ({
      ...current,
      is_loved_by_me: previousLoved,
      loves_count: previousCount,
    }));
  } finally {
    lovePendingRef.current = false;
    setLovePending(false);
  }
};

  const handleUpdate = async (text: string) => {
    const response = await updateComment(item.id, text);

    setItem(response.comment);
    setEditing(false);
    onUpdated?.(response.comment);
  };

const handleDelete = async () => {
  closeMenu();

  const response = await deleteComment(item.id);

  if (response.deleted) {
    onCommentCountChange?.(response.comments_count);
    onDeleted?.(item.id, item.parent_id);
  }
};

  const handleReplySubmit = async (text: string) => {
    const response = await createComment(postId, text, item.id);

    setReplies((previous) => [response.comment, ...previous]);
    setRepliesOpen(true);
    setRepliesLoaded(true);

    setItem((current) => ({
      ...current,
      replies_count: current.replies_count + 1,
    }));

    setReplying(false);
    onCommentCountChange?.(response.comments_count);
  };

  const handleChildReplyDeleted = (commentID: string) => {
    setReplies((previous) =>
      previous.filter((reply) => reply.id !== commentID)
    );

    setItem((current) => ({
      ...current,
      replies_count: Math.max(0, current.replies_count - 1),
    }));
  };

  const handleChildReplyUpdated = (updatedReply: FeedComment) => {
    setReplies((previous) =>
      previous.map((reply) =>
        reply.id === updatedReply.id ? updatedReply : reply
      )
    );
  };

  return (
    <article
      className={`commentItem ${isNestedReply ? "reply" : "main"}`}
      style={itemStyle}
    >
      <ProfileLink
        userID={commentUserID}
        ariaLabel={`Open ${fullName}'s profile`}
        style={{
          display: "flex",
          flexShrink: 0,
          borderRadius: "50%",
        }}
      >
        <div className="commentAvatar">
          {profileImageURL ? (
            <img src={profileImageURL} alt={fullName} />
          ) : (
            <User size={19} strokeWidth={3.5} />
          )}
        </div>
      </ProfileLink>

      <div className="commentBody">
        <div className="commentBubble">
          <div className="commentTopLine">
            <ProfileLink
              userID={commentUserID}
              ariaLabel={`Open ${fullName}'s profile`}
              style={{
                display: "block",
                minWidth: 0,
              }}
            >
              <VerifiedName
               as="strong"
               userID={commentUserID}
               name={fullName}
               badgeSize="xs"
              />
            </ProfileLink>

            {item.can_modify ? (
              <div className="commentMenuRoot" ref={menuRef}>
                <button
                  ref={menuButtonRef}
                  type="button"
                  className={`commentMenuButton ${menuOpen ? "active" : ""}`}
                  aria-label="Comment options"
                  aria-expanded={menuOpen}
                  onClick={toggleMenu}
                >
                  <MoreHorizontal size={18} strokeWidth={2.2} />
                </button>

                {menuOpen ? (
                  <div className="commentMenu" role="menu">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        closeMenu();
                        setEditing(true);
                      }}
                    >
                      <Pencil size={17} strokeWidth={2.2} />
                      <span>Edit</span>
                    </button>

                    <button
                      type="button"
                      role="menuitem"
                      className="danger"
                      onClick={() => {
                        void handleDelete();
                      }}
                    >
                      <Trash2 size={17} strokeWidth={2.2} />
                      <span>Delete</span>
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          {editing ? (
            <CommentInput
              initialValue={item.text}
              submitLabel="Save"
              autoFocus
              onSubmit={handleUpdate}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <p className="commentText">{item.text}</p>
          )}
        </div>

        <div className="commentMeta">
          {timeAgo ? <span>{timeAgo}</span> : null}

 
<button
  type="button"
  className={item.is_loved_by_me ? "active" : ""}
  disabled={lovePending}
  aria-pressed={item.is_loved_by_me}
  aria-label={
    item.is_loved_by_me
      ? "Remove love from comment"
      : "Love this comment"
  }
  onClick={() => {
    void handleLove();
  }}
>
  <Heart
    size={15}
    strokeWidth={2.3}
    fill={item.is_loved_by_me ? "currentColor" : "none"}
    aria-hidden="true"
  />
  <span>
    {item.loves_count > 0 ? item.loves_count : "Love"}
  </span>
</button>


          <button
            type="button"
            onClick={() => setReplying((previous) => !previous)}
          >
            <MessageCircle size={15} strokeWidth={2.3} />
            <span>Reply</span>
          </button>
        </div>

        {replying ? (
          <div className="commentReplyInput">
            <CommentInput
              placeholder={`Reply to ${fullName}...`}
              submitLabel="Reply"
              autoFocus
              onSubmit={handleReplySubmit}
              onCancel={() => setReplying(false)}
            />
          </div>
        ) : null}

        {item.replies_count > 0 ? (
          <div className="commentReplies">
            <button
              type="button"
              className="commentRepliesToggle"
              onClick={() => {
                void handleToggleReplies();
              }}
              disabled={repliesLoading}
            >
              {repliesOpen
                ? "Hide replies"
                : `View ${item.replies_count} ${
                    item.replies_count > 1 ? "replies" : "reply"
                  }`}
            </button>

            {repliesOpen ? (
              <div className="commentRepliesList">
                {replies.map((reply) => (
                  <CommentItem
                    key={reply.id}
                    comment={reply}
                    postId={postId}
                    level={level + 1}
                    onCommentCountChange={onCommentCountChange}
                    onUpdated={handleChildReplyUpdated}
                    onDeleted={handleChildReplyDeleted}
                  />
                ))}

                {repliesHasMore ? (
                  <button
                    type="button"
                    className="commentLoadMoreReplies"
                    onClick={() => {
                      void loadReplies(repliesCursor);
                    }}
                    disabled={repliesLoading}
                  >
                    {repliesLoading ? "Loading..." : "Load more replies"}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
};

export default CommentItem;