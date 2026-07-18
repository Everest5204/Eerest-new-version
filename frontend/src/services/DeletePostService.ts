import axios from "axios";

import api from "./api";

export type DeletePostResponse = {
  deleted: boolean;
  post_id: string;

  deleted_comments: number;
  deleted_comment_loves: number;
  deleted_reactions: number;
  deleted_media: number;
};

export type DeletePostRequestOptions = {
  accessToken?: string;
  signal?: AbortSignal;
};

type DeletePostErrorResponse = {
  error?: string;
};

export class DeletePostRequestError extends Error {
  statusCode: number;

  constructor(
    message: string,
    statusCode: number
  ) {
    super(message);

    this.name = "DeletePostRequestError";
    this.statusCode = statusCode;
  }
}

const getDeletePostErrorMessage = (
  statusCode: number,
  serverMessage?: string
) => {
  if (serverMessage?.trim()) {
    return serverMessage.trim();
  }

  switch (statusCode) {
    case 400:
      return "Invalid post request";

    case 401:
      return "Please log in again";

    case 403:
      return "You are not allowed to delete this post";

    case 404:
      return "Post not found";

    case 502:
      return "Post media cleanup failed. Please try again";

    case 504:
      return "Post deletion timed out. Please try again";

    default:
      return "Unable to delete post. Please try again";
  }
};

export const deletePostFromDatabase = async (
  postID: string,
  options: DeletePostRequestOptions = {}
): Promise<DeletePostResponse> => {
  const cleanPostID = postID.trim();

  if (!cleanPostID) {
    throw new DeletePostRequestError(
      "Post id is required",
      400
    );
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
  };

  // Normally api.ts automatically adds the token.
  // This supports an in-memory token if provided later.
  const accessToken =
    options.accessToken?.trim();

  if (accessToken) {
    headers.Authorization =
      `Bearer ${accessToken}`;
  }

  try {
    const response =
      await api.delete<DeletePostResponse>(
        `/posts/delete/${encodeURIComponent(
          cleanPostID
        )}`,
        {
          headers,
          signal: options.signal,
        }
      );

    const responseData = response.data;

    if (
      !responseData ||
      responseData.deleted !== true ||
      responseData.post_id !== cleanPostID
    ) {
      throw new DeletePostRequestError(
        "Invalid delete response from server",
        500
      );
    }

    return responseData;
  } catch (error) {
    if (
      error instanceof DeletePostRequestError
    ) {
      throw error;
    }

    if (axios.isCancel(error)) {
      throw new DOMException(
        "Delete request cancelled",
        "AbortError"
      );
    }

    if (
      axios.isAxiosError<DeletePostErrorResponse>(
        error
      )
    ) {
      const statusCode =
        error.response?.status ?? 0;

      const serverMessage =
        error.response?.data?.error;

      throw new DeletePostRequestError(
        getDeletePostErrorMessage(
          statusCode,
          serverMessage
        ),
        statusCode
      );
    }

    throw new DeletePostRequestError(
      "Network error. Please check your connection",
      0
    );
  }
};