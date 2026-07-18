import axios from "axios";

import api from "./api";
import {
  normalizeTextPost,
  type TextFeedPost,
  type TextPostBackground,
  type TextPostStyle,
} from "../components/textpost/textPostService";

const TEXT_POST_EDIT_ENDPOINT = "/text-posts/edit";
const MAX_TEXT_LENGTH = 650;

type TextPostEditResponse = {
  post?: unknown;
  error?: string;
};

export type UpdateTextPostPayload = {
  postId: string;
  text: string;
  background: TextPostBackground;
  textColor: string;
  textStyle: TextPostStyle;
  expectedUpdatedAt: string;
};

const createEditEndpoint = (postId: string): string => {
  const cleanPostId = postId.trim();

  if (!cleanPostId) {
    throw new Error("Text post ID is required");
  }

  return `${TEXT_POST_EDIT_ENDPOINT}/${encodeURIComponent(cleanPostId)}`;
};

const normalizeEditResponse = (
  data: TextPostEditResponse | unknown
): TextFeedPost => {
  const responseData = data as TextPostEditResponse;
  const post = normalizeTextPost(responseData?.post ?? data);

  if (!post.id) {
    throw new Error("Invalid text post response");
  }

  return post;
};

const validateUpdatePayload = (
  payload: UpdateTextPostPayload
): UpdateTextPostPayload => {
  const text = payload.text.trim();

  if (!text) {
    throw new Error("Text post cannot be empty");
  }

  if (text.length > MAX_TEXT_LENGTH) {
    throw new Error(
      `Text post cannot be longer than ${MAX_TEXT_LENGTH} characters`
    );
  }

  if (!payload.expectedUpdatedAt.trim()) {
    throw new Error("Text post update time is missing");
  }

  return {
    ...payload,
    postId: payload.postId.trim(),
    text,
    textColor: payload.textColor.trim() || "#111827",
    expectedUpdatedAt: payload.expectedUpdatedAt.trim(),
  };
};

/**
 * MongoDB থেকে edit করার জন্য post-এর সর্বশেষ data আনে।
 */
export const getEditableTextPost = async (
  postId: string,
  signal?: AbortSignal
): Promise<TextFeedPost> => {
  const response = await api.get<TextPostEditResponse>(
    createEditEndpoint(postId),
    {
      signal,
      params: {
        t: Date.now(),
      },
    }
  );

  return normalizeEditResponse(response.data);
};

/**
 * Text post-এর আগের text/background/style সম্পূর্ণ replace করে।
 * Database update backend-এ atomic operation হিসেবে হবে।
 */
export const updateTextPost = async (
  input: UpdateTextPostPayload
): Promise<TextFeedPost> => {
  const payload = validateUpdatePayload(input);

  const response = await api.patch<TextPostEditResponse>(
    createEditEndpoint(payload.postId),
    {
      text: payload.text,
      caption: payload.text,

      text_background: payload.background,
      background: payload.background,

      text_color: payload.textColor,
      text_style: payload.textStyle,

      expected_updated_at: payload.expectedUpdatedAt,
    },
    {
      params: {
        t: Date.now(),
      },
    }
  );

  const updatedPost = normalizeEditResponse(response.data);

  if (updatedPost.id !== payload.postId) {
    throw new Error("Updated text post ID does not match");
  }

  return updatedPost;
};

export const isTextPostEditConflict = (error: unknown): boolean => {
  return axios.isAxiosError(error) && error.response?.status === 409;
};

export const isTextPostEditRequestCancelled = (error: unknown): boolean => {
  return axios.isCancel(error) || (error as { name?: string })?.name === "CanceledError";
};

export const getTextPostEditErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    const responseData = error.response?.data as
      | TextPostEditResponse
      | undefined;

    if (typeof responseData?.error === "string" && responseData.error.trim()) {
      return responseData.error.trim();
    }

    if (error.response?.status === 401) {
      return "Please log in again";
    }

    if (error.response?.status === 403) {
      return "You cannot edit this post";
    }

    if (error.response?.status === 404) {
      return "Text post not found";
    }

    if (error.response?.status === 409) {
      return "Post has changed. Please reopen it and try again";
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "Text post update failed";
};