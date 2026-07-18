import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import {
  createComment,
  getPostComments,
  type FeedComment,
} from "../../services/commentService";
import CommentInput from "./CommentInput";
import CommentList from "./CommentList";
import "./CommentSection.css";

type CommentSectionProps = {
  postId: string;
  open: boolean;
  commentsCount?: number;
  onClose: () => void;
  onCommentCountChange?: (count: number) => void;
};

const mergeUniqueComments = (
  previous: FeedComment[],
  incoming: FeedComment[]
) => {
  const existingIDs = new Set(previous.map((comment) => comment.id));

  return [
    ...previous,
    ...incoming.filter((comment) => !existingIDs.has(comment.id)),
  ];
};

const CommentSection = ({
  postId,
  open,
  onClose,
  onCommentCountChange,
}: CommentSectionProps) => {
  const [comments, setComments] = useState<FeedComment[]>([]);

  const [nextCursor, setNextCursor] = useState("");
  const [hasMore, setHasMore] = useState(false);

  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const updateCommentsCount = useCallback(
    (count: number) => {
      const safeCount = Math.max(0, Number.isFinite(count) ? count : 0);
      onCommentCountChange?.(safeCount);
    },
    [onCommentCountChange]
  );

  const loadComments = useCallback(
    async (cursor = "") => {
      if (!postId) return;

      try {
        setError("");

        if (cursor) {
          setLoadingMore(true);
        } else {
          setLoading(true);
        }

        const response = await getPostComments(postId, cursor, 10);

        setComments((previous) => {
          if (!cursor) return response.comments;

          return mergeUniqueComments(previous, response.comments);
        });

        setNextCursor(response.next_cursor);
        setHasMore(response.has_more);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to load comments";
        setError(message);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [postId]
  );

  useEffect(() => {
    if (!open || !postId) return;

    setComments([]);
    setNextCursor("");
    setHasMore(false);
    setError("");

    void loadComments("");
  }, [loadComments, open, postId]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  const handleCreateComment = async (text: string) => {
    if (!postId) return;

    try {
      setCreating(true);
      setError("");

      const response = await createComment(postId, text);

      setComments((previous) => [response.comment, ...previous]);
      updateCommentsCount(response.comments_count);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create comment";
      setError(message);
      throw err;
    } finally {
      setCreating(false);
    }
  };

  const handleCommentUpdated = (updatedComment: FeedComment) => {
    setComments((previous) =>
      previous.map((comment) =>
        comment.id === updatedComment.id ? updatedComment : comment
      )
    );
  };

  const handleCommentDeleted = (commentID: string, parentID?: string) => {
    if (parentID) return;

    setComments((previous) =>
      previous.filter((comment) => comment.id !== commentID)
    );
  };

  const handleLoadMore = async () => {
    if (!nextCursor || loadingMore) return;

    await loadComments(nextCursor);
  };

  if (!open) return null;

  return (
    <div
      className="commentSectionOverlay"
      role="dialog"
      aria-modal="true"
      aria-label="Comments"
    >
      <section className="commentSectionPanel">
        <header className="commentSectionHeader">
          <h3>Comments</h3>

          <button
            type="button"
            className="commentSectionClose"
            aria-label="Close comments"
            onClick={onClose}
          >
            <X size={26} strokeWidth={2.1} />
          </button>
        </header>

        <div className="commentSectionContent">
          {error ? (
            <div className="commentSectionError">
              <span>{error}</span>
              <button
                type="button"
                onClick={() => {
                  setError("");
                  void loadComments("");
                }}
              >
                Try again
              </button>
            </div>
          ) : null}

          <CommentList
            postId={postId}
            comments={comments}
            loading={loading}
            loadingMore={loadingMore}
            hasMore={hasMore}
            emptyText="No comments yet"
            onLoadMore={handleLoadMore}
            onCommentCountChange={updateCommentsCount}
            onCommentUpdated={handleCommentUpdated}
            onCommentDeleted={handleCommentDeleted}
          />
        </div>

        <div className="commentSectionComposer">
          <CommentInput
            placeholder="Write a comment..."
            disabled={creating}
            onSubmit={handleCreateComment}
          />
        </div>
      </section>
    </div>
  );
};

export default CommentSection;