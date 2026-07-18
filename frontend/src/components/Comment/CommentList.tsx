import { MessageCircle } from "lucide-react";
import type { FeedComment } from "../../services/commentService";
import CommentItem from "./CommentItem";

type CommentListProps = {
  postId: string;
  comments: FeedComment[];
  loading?: boolean;
  loadingMore?: boolean;
  hasMore?: boolean;
  emptyText?: string;
  onLoadMore?: () => Promise<void> | void;
  onCommentCountChange?: (count: number) => void;
  onCommentUpdated?: (comment: FeedComment) => void;
  onCommentDeleted?: (commentID: string, parentID?: string) => void;
};

const CommentList = ({
  postId,
  comments,
  loading = false,
  loadingMore = false,
  hasMore = false,
  emptyText = "No comments yet",
  onLoadMore,
  onCommentCountChange,
  onCommentUpdated,
  onCommentDeleted,
}: CommentListProps) => {
  if (loading && comments.length === 0) {
    return (
      <div className="commentListState">
        <span>Loading comments...</span>
      </div>
    );
  }

  if (!loading && comments.length === 0) {
    return (
      <div className="commentEmptyState">
        <div className="commentEmptyStateIcon">
          <MessageCircle size={42} strokeWidth={2.1} />
        </div>

        <h4>{emptyText}</h4>
        <p>Be the first to share your thoughts.</p>
      </div>
    );
  }

  return (
    <div className="commentList">
      {comments.map((comment) => (
        <CommentItem
          key={comment.id}
          comment={comment}
          postId={postId}
          level={0}
          onCommentCountChange={onCommentCountChange}
          onUpdated={onCommentUpdated}
          onDeleted={onCommentDeleted}
        />
      ))}

      {hasMore ? (
        <button
          type="button"
          className="commentLoadMoreButton"
          disabled={loadingMore}
          onClick={() => {
            void onLoadMore?.();
          }}
        >
          {loadingMore ? "Loading..." : "Load more comments"}
        </button>
      ) : null}
    </div>
  );
};

export default CommentList;