import {
  memo,
  useCallback,
  useState,
  type MouseEvent,
} from "react";
import { Trash2 } from "lucide-react";

import DeletePostModal from "./DeletePostModal";
import type { DeletePostResponse } from "../../services/DeletePostService";
import { useDeletePost } from "./useDeletePost";

export const DELETE_POST_OPTIMISTIC_EVENT =
  "everest:delete-post-optimistic";

export const DELETE_POST_SUCCESS_EVENT =
  "everest:delete-post-success";

export const DELETE_POST_ROLLBACK_EVENT =
  "everest:delete-post-rollback";

type DeletePostActionProps = {
  postID: string;
  accessToken?: string;

  onDeleteModalOpenChange?: (
    open: boolean
  ) => void;

  onPostDeleted?: (
    postID: string,
    response: DeletePostResponse
  ) => void;
};

const dispatchDeletePostEvent = (
  eventName: string,
  postID: string,
  response?: DeletePostResponse
) => {
  window.dispatchEvent(
    new CustomEvent(eventName, {
      detail: {
        postID,
        response,
      },
    })
  );
};

const DeletePostAction = ({
  postID,
  accessToken,
  onDeleteModalOpenChange,
  onPostDeleted,
}: DeletePostActionProps) => {
  const [deleteModalOpen, setDeleteModalOpen] =
    useState(false);

  const {
    isDeleting,
    deleteError,
    confirmDeletePost,
    resetDeletePostError,
  } = useDeletePost({
    postID,
    accessToken,
  });

  const openDeleteModal = (
    event: MouseEvent<HTMLButtonElement>
  ) => {
    event.preventDefault();
    event.stopPropagation();

    resetDeletePostError();
    setDeleteModalOpen(true);
    onDeleteModalOpenChange?.(true);
  };

  const closeDeleteModal = useCallback(() => {
    if (isDeleting) return;

    resetDeletePostError();
    setDeleteModalOpen(false);
    onDeleteModalOpenChange?.(false);
  }, [
    isDeleting,
    onDeleteModalOpenChange,
    resetDeletePostError,
  ]);

  const handleConfirmDelete =
    useCallback(async () => {
      // Start the backend request first.
      const deleteRequest =
        confirmDeletePost();

      // Instantly remove every visible copy
      // of this post from Feed/Profile Feed.
      dispatchDeletePostEvent(
        DELETE_POST_OPTIMISTIC_EVENT,
        postID
      );

      const response = await deleteRequest;

      if (!response?.deleted) {
        // Restore the post if database deletion fails.
        dispatchDeletePostEvent(
          DELETE_POST_ROLLBACK_EVENT,
          postID
        );

        return;
      }

      dispatchDeletePostEvent(
        DELETE_POST_SUCCESS_EVENT,
        postID,
        response
      );

      onPostDeleted?.(postID, response);
    }, [
      confirmDeletePost,
      onPostDeleted,
      postID,
    ]);

  return (
    <>
      <button
        type="button"
        role="menuitem"
        className="postOptionsMenuItem danger"
        onClick={openDeleteModal}
        aria-haspopup="dialog"
        aria-expanded={deleteModalOpen}
      >
        <span className="postOptionsMenuIcon">
          <Trash2
            size={20}
            strokeWidth={2.3}
            aria-hidden="true"
          />
        </span>

        <span>Delete post</span>
      </button>

      <DeletePostModal
        open={deleteModalOpen}
        isDeleting={isDeleting}
        deleteError={deleteError}
        onCancel={closeDeleteModal}
        onConfirm={handleConfirmDelete}
      />
    </>
  );
};

export default memo(DeletePostAction);