import api from "./api";

export type CommentUser = {
  id?: string;
  first_name: string;
  last_name: string;
  profile_image_url?: string;
};

export type FeedComment = {
  id: string;
  post_id: string;
  user_id: string;
  parent_id?: string;

  user: CommentUser;

  text: string;

  loves_count: number;
  replies_count: number;

  is_loved_by_me: boolean;
  can_modify: boolean;

  is_deleted: boolean;

  created_at: string;
  updated_at: string;
};

export type CommentsResponse = {
  comments: FeedComment[];
  next_cursor: string;
  has_more: boolean;
};

export type CreateCommentResponse = {
  comment: FeedComment;
  comments_count: number;
};

export type UpdateCommentResponse = {
  comment: FeedComment;
};

export type DeleteCommentResponse = {
  deleted: boolean;
  comments_count: number;
};

export type ToggleCommentLoveResponse = {
  loved: boolean;
  loves_count: number;
};

const normalizeID = (value: unknown): string => {
  if (!value) return "";

  if (typeof value === "string") return value;

  if (typeof value === "object") {
    const objectValue = value as Record<string, unknown>;

    if (typeof objectValue.$oid === "string") {
      return objectValue.$oid;
    }

    if (typeof objectValue.hex === "string") {
      return objectValue.hex;
    }
  }

  return String(value);
};

const normalizeString = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";

  return String(value);
};

const normalizeNumber = (value: unknown): number => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
};

const normalizeBoolean = (value: unknown): boolean => {
  return Boolean(value);
};

export const normalizeComment = (comment: any): FeedComment => {
  return {
    id: normalizeID(comment?.id ?? comment?._id),
    post_id: normalizeID(comment?.post_id),
    user_id: normalizeID(comment?.user_id),
    parent_id: normalizeID(comment?.parent_id) || undefined,

    user: {
      id: normalizeID(comment?.user?.id ?? comment?.user?._id),
      first_name: normalizeString(comment?.user?.first_name),
      last_name: normalizeString(comment?.user?.last_name),
      profile_image_url: normalizeString(comment?.user?.profile_image_url),
    },

    text: normalizeString(comment?.text),

    loves_count: normalizeNumber(comment?.loves_count),
    replies_count: normalizeNumber(comment?.replies_count),

    is_loved_by_me: normalizeBoolean(comment?.is_loved_by_me),
    can_modify: normalizeBoolean(comment?.can_modify),

    is_deleted: normalizeBoolean(comment?.is_deleted),

    created_at: normalizeString(comment?.created_at),
    updated_at: normalizeString(comment?.updated_at),
  };
};

const normalizeCommentsResponse = (data: any): CommentsResponse => {
  const comments = Array.isArray(data?.comments) ? data.comments : [];

  return {
    comments: comments
      .map(normalizeComment)
      .filter((comment: FeedComment) => Boolean(comment.id)),
    next_cursor: normalizeString(data?.next_cursor),
    has_more: normalizeBoolean(data?.has_more),
  };
};

export const getPostComments = async (
  postId: string,
  cursor = "",
  limit = 10
): Promise<CommentsResponse> => {
  const response = await api.get("/comments", {
    params: {
      post_id: postId,
      limit,
      ...(cursor ? { cursor } : {}),
      t: Date.now(),
    },
  });

  return normalizeCommentsResponse(response.data);
};

export const getCommentReplies = async (
  parentId: string,
  cursor = "",
  limit = 10
): Promise<CommentsResponse> => {
  const response = await api.get("/comments/replies", {
    params: {
      parent_id: parentId,
      limit,
      ...(cursor ? { cursor } : {}),
      t: Date.now(),
    },
  });

  return normalizeCommentsResponse(response.data);
};

export const createComment = async (
  postId: string,
  text: string,
  parentId = ""
): Promise<CreateCommentResponse> => {
  const cleanText = text.trim();

  if (!postId) {
    throw new Error("Post id is required");
  }

  if (!cleanText) {
    throw new Error("Comment text is required");
  }

  const response = await api.post(
    "/comments",
    {
      post_id: postId,
      parent_id: parentId || undefined,
      text: cleanText,
    },
    {
      params: {
        t: Date.now(),
      },
    }
  );

  return {
    comment: normalizeComment(response.data?.comment),
    comments_count: normalizeNumber(response.data?.comments_count),
  };
};

export const updateComment = async (
  commentId: string,
  text: string
): Promise<UpdateCommentResponse> => {
  const cleanText = text.trim();

  if (!commentId) {
    throw new Error("Comment id is required");
  }

  if (!cleanText) {
    throw new Error("Comment text is required");
  }

  const response = await api.patch(
    `/comments/${commentId}`,
    {
      text: cleanText,
    },
    {
      params: {
        t: Date.now(),
      },
    }
  );

  return {
    comment: normalizeComment(response.data?.comment),
  };
};

export const deleteComment = async (
  commentId: string
): Promise<DeleteCommentResponse> => {
  if (!commentId) {
    throw new Error("Comment id is required");
  }

  const response = await api.delete(`/comments/${commentId}`, {
    params: {
      t: Date.now(),
    },
  });

  return {
    deleted: Boolean(response.data?.deleted),
    comments_count: normalizeNumber(response.data?.comments_count),
  };
};

export const toggleCommentLove = async (
  commentId: string
): Promise<ToggleCommentLoveResponse> => {
  if (!commentId) {
    throw new Error("Comment id is required");
  }

  const response = await api.post(
    `/comments/${commentId}/love`,
    {},
    {
      params: {
        t: Date.now(),
      },
    }
  );

  return {
    loved: Boolean(response.data?.loved),
    loves_count: normalizeNumber(response.data?.loves_count),
  };
};