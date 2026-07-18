import axios, {
  type AxiosProgressEvent,
} from "axios";

import api from "./api";

import {
  normalizePost,
  type FeedPost,
} from "./postService";

type PostEditAPIResponse = {
  post?: unknown;
};

type PostEditAPIError = {
  error?: string;
};

export type UpdateMediaPostPayload = {
  postId: string;
  caption: string;

  expectedUpdatedAt: string;

  keepMediaKeys: string[];
  newFiles: File[];

  signal?: AbortSignal;

  onUploadProgress?: (
    percentage: number
  ) => void;
};

const POST_EDIT_TIMEOUT = 90_000;

const normalizePostID = (
  postId: string
): string => {
  const cleanPostID = postId.trim();

  if (!cleanPostID) {
    throw new Error("Post id is required");
  }

  return cleanPostID;
};

const normalizeExpectedUpdatedAt = (
  updatedAt: string
): string => {
  const cleanUpdatedAt = updatedAt.trim();

  if (!cleanUpdatedAt) {
    throw new Error("Post version is required");
  }

  const timestamp = new Date(
    cleanUpdatedAt
  );

  if (
    Number.isNaN(timestamp.getTime())
  ) {
    throw new Error(
      "Invalid post version"
    );
  }

  return timestamp.toISOString();
};

const getPostFromResponse = (
  data: PostEditAPIResponse
): FeedPost => {
  const normalizedPost = normalizePost(
    data?.post ?? data
  );

  if (!normalizedPost.id) {
    throw new Error(
      "Invalid media post response"
    );
  }

  return normalizedPost;
};

// Loads the newest post directly from MongoDB
// when the Edit Media Post page opens.
export const getEditableMediaPost =
  async (
    postId: string,
    signal?: AbortSignal
  ): Promise<FeedPost> => {
    const cleanPostID =
      normalizePostID(postId);

    const response =
      await api.get<PostEditAPIResponse>(
        `/posts/media/edit/${encodeURIComponent(
          cleanPostID
        )}`,
        {
          signal,

          params: {
            // Prevents browser/proxy cache.
            t: Date.now(),
          },
        }
      );

    return getPostFromResponse(
      response.data
    );
  };

// Sends only changed media information.
// Existing media files are not uploaded again.
export const updateMediaPost =
  async ({
    postId,
    caption,
    expectedUpdatedAt,
    keepMediaKeys,
    newFiles,
    signal,
    onUploadProgress,
  }: UpdateMediaPostPayload): Promise<FeedPost> => {
    const cleanPostID =
      normalizePostID(postId);

    const cleanUpdatedAt =
      normalizeExpectedUpdatedAt(
        expectedUpdatedAt
      );

    const uniqueKeepMediaKeys = [
      ...new Set(
        keepMediaKeys
          .map((key) => key.trim())
          .filter(Boolean)
      ),
    ];

    if (
      uniqueKeepMediaKeys.length > 10
    ) {
      throw new Error(
        "Too many existing media items"
      );
    }

    if (newFiles.length > 10) {
      throw new Error(
        "Too many new media files"
      );
    }

    const formData = new FormData();

    formData.append(
      "caption",
      caption.trim()
    );

    formData.append(
      "expected_updated_at",
      cleanUpdatedAt
    );

    uniqueKeepMediaKeys.forEach(
      (mediaKey) => {
        formData.append(
          "keep_media_key",
          mediaKey
        );
      }
    );

    newFiles.forEach((file) => {
      formData.append(
        "media",
        file,
        file.name
      );
    });

    const response =
      await api.patch<PostEditAPIResponse>(
        `/posts/media/edit/${encodeURIComponent(
          cleanPostID
        )}`,
        formData,
        {
          signal,

          timeout: POST_EDIT_TIMEOUT,

          params: {
            t: Date.now(),
          },

          // Do not manually set multipart Content-Type.
          // Axios automatically adds the correct boundary.
          onUploadProgress: (
            progressEvent: AxiosProgressEvent
          ) => {
            if (
              !onUploadProgress ||
              !progressEvent.total
            ) {
              return;
            }

            const percentage = Math.min(
              100,
              Math.round(
                (progressEvent.loaded * 100) /
                  progressEvent.total
              )
            );

            onUploadProgress(
              percentage
            );
          },
        }
      );

    return getPostFromResponse(
      response.data
    );
  };

export const getPostEditErrorMessage =
  (error: unknown): string => {
    if (
      axios.isCancel(error) ||
      (
        error instanceof DOMException &&
        error.name === "AbortError"
      )
    ) {
      return "Request cancelled";
    }

    if (
      axios.isAxiosError<PostEditAPIError>(
        error
      )
    ) {
      const serverMessage =
        error.response?.data?.error?.trim();

      if (serverMessage) {
        return serverMessage;
      }

      if (
        error.response?.status === 409
      ) {
        return "This post was updated elsewhere. Refresh and try again.";
      }

      if (
        error.response?.status === 404
      ) {
        return "Media post not found";
      }

      if (
        error.response?.status === 413
      ) {
        return "Selected media is too large";
      }

      if (
        error.code === "ECONNABORTED"
      ) {
        return "Upload took too long. Please check your connection.";
      }

      if (!error.response) {
        return "Could not connect to the server";
      }
    }

    if (error instanceof Error) {
      return (
        error.message ||
        "Media post update failed"
      );
    }

    return "Media post update failed";
  };