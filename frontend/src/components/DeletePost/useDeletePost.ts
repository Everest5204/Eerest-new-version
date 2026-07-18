import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  DeletePostRequestError,
  deletePostFromDatabase,
  type DeletePostResponse,
} from "../../services/DeletePostService";

type UseDeletePostOptions = {
  postID: string;
  accessToken?: string;

  onDeleted?: (
    response: DeletePostResponse
  ) => void;
};

type UseDeletePostResult = {
  isDeleting: boolean;
  deleteError: string;

  confirmDeletePost: () => Promise<
    DeletePostResponse | null
  >;

  resetDeletePostError: () => void;
};

const getDeletePostClientError = (
  error: unknown
): string => {
  if (
    error instanceof DeletePostRequestError
  ) {
    return error.message;
  }

  if (
    error instanceof Error &&
    error.message
  ) {
    return error.message;
  }

  return "Unable to delete post. Please try again";
};

export const useDeletePost = ({
  postID,
  accessToken,
  onDeleted,
}: UseDeletePostOptions): UseDeletePostResult => {
  const [isDeleting, setIsDeleting] =
    useState(false);

  const [deleteError, setDeleteError] =
    useState("");

  const mountedRef = useRef(true);
  const deletingRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      // The post may disappear from the UI
      // before MongoDB cleanup finishes.
      // Never cancel the database request here.
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setDeleteError("");
  }, [postID]);

  const resetDeletePostError =
    useCallback(() => {
      if (!mountedRef.current) return;

      setDeleteError("");
    }, []);

  const confirmDeletePost =
    useCallback(async () => {
      const cleanPostID = postID.trim();

      if (
        !cleanPostID ||
        deletingRef.current
      ) {
        return null;
      }

      deletingRef.current = true;

      if (mountedRef.current) {
        setIsDeleting(true);
        setDeleteError("");
      }

      try {
        // This request continues even if the
        // Post component disappears from UI.
        const response =
          await deletePostFromDatabase(
            cleanPostID,
            {
              accessToken,
            }
          );

        if (response.deleted) {
          onDeleted?.(response);
        }

        return response;
      } catch (error) {
        if (mountedRef.current) {
          setDeleteError(
            getDeletePostClientError(error)
          );
        }

        return null;
      } finally {
        deletingRef.current = false;

        if (mountedRef.current) {
          setIsDeleting(false);
        }
      }
    }, [
      accessToken,
      onDeleted,
      postID,
    ]);

  return {
    isDeleting,
    deleteError,
    confirmDeletePost,
    resetDeletePostError,
  };
};