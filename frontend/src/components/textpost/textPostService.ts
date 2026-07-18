import api from "../../services/api";
import {
  normalizePost,
  type FeedPost,
  type PostsResponse,
} from "../../services/postService";

export type TextPostBackgroundKind = "plain" | "solid" | "gradient" | "image";

export type TextPostBackground = {
  kind: TextPostBackgroundKind;
  value: string;
};

export type TextPostStyle =
  | "bold_center"
  | "normal_center"
  | "bold_left"
  | "normal_left";

export type CreateTextPostPayload = {
  text: string;
  background: TextPostBackground;
  text_color: string;
  text_style: TextPostStyle;
};

export type TextFeedPost = FeedPost & {
  text_background?: TextPostBackground;
  text_color?: string;
  text_style?: TextPostStyle;
};

export type TextPostsResponse = {
  posts: TextFeedPost[];
  next_cursor: string;
  has_more: boolean;
};

const DEFAULT_TEXT_BACKGROUND: TextPostBackground = {
  kind: "plain",
  value: "#ffffff",
};

const DEFAULT_TEXT_COLOR = "#111827";

const normalizeBackgroundKind = (kind: unknown): TextPostBackgroundKind => {
  if (kind === "solid") return "solid";
  if (kind === "gradient") return "gradient";
  if (kind === "image") return "image";

  return "plain";
};

const guessBackgroundKind = (value: string): TextPostBackgroundKind => {
  const cleanValue = value.trim().toLowerCase();

  if (!cleanValue) return "plain";

  if (
    cleanValue.includes("linear-gradient") ||
    cleanValue.includes("radial-gradient") ||
    cleanValue.includes("gradient")
  ) {
    return "gradient";
  }

  if (
    cleanValue.startsWith("http://") ||
    cleanValue.startsWith("https://") ||
    cleanValue.startsWith("/") ||
    cleanValue.startsWith("data:image/")
  ) {
    return "image";
  }

  return "solid";
};

const normalizeTextBackground = (background: unknown): TextPostBackground => {
  if (!background) {
    return DEFAULT_TEXT_BACKGROUND;
  }

  if (typeof background === "string") {
    const value = background.trim();

    if (!value) {
      return DEFAULT_TEXT_BACKGROUND;
    }

    return {
      kind: guessBackgroundKind(value),
      value,
    };
  }

  if (typeof background === "object") {
    const backgroundObject = background as Partial<TextPostBackground>;
    const value = String(backgroundObject.value ?? "").trim();

    if (!value) {
      return DEFAULT_TEXT_BACKGROUND;
    }

    return {
      kind: normalizeBackgroundKind(backgroundObject.kind),
      value,
    };
  }

  return DEFAULT_TEXT_BACKGROUND;
};

const normalizeTextStyle = (style: unknown): TextPostStyle => {
  if (style === "normal_center") return "normal_center";
  if (style === "bold_left") return "bold_left";
  if (style === "normal_left") return "normal_left";

  return "bold_center";
};

export const normalizeTextPost = (post: unknown): TextFeedPost => {
  const rawPost = post as any;
  const normalizedPost = normalizePost(rawPost) as TextFeedPost;

  const caption = String(
    rawPost?.caption ?? rawPost?.text ?? normalizedPost.caption ?? ""
  ).trim();

  return {
    ...normalizedPost,
    type: rawPost?.type ?? "text",
    caption,
    text_background: normalizeTextBackground(
      rawPost?.text_background ?? rawPost?.textBackground ?? rawPost?.background
    ),
    text_color: rawPost?.text_color ?? rawPost?.textColor ?? DEFAULT_TEXT_COLOR,
    text_style: normalizeTextStyle(rawPost?.text_style ?? rawPost?.textStyle),
  };
};

const normalizeTextPostsResponse = (data: unknown): TextPostsResponse => {
  const rawData = data as any;
  const posts = Array.isArray(rawData?.posts) ? rawData.posts : [];

  return {
    posts: posts
      .map(normalizeTextPost)
      .filter((post: TextFeedPost) => Boolean(post.id)),
    next_cursor: rawData?.next_cursor ?? "",
    has_more: Boolean(rawData?.has_more),
  };
};

const buildCreateTextPostBody = (payload: CreateTextPostPayload) => {
  const text = payload.text.trim();

  return {
    type: "text",
    text,
    caption: text,
    text_background: payload.background,
    background: payload.background,
    text_color: payload.text_color,
    text_style: payload.text_style,
  };
};

export const createTextPost = async (
  payload: CreateTextPostPayload
): Promise<TextFeedPost> => {
  const text = payload.text.trim();

  if (!text) {
    throw new Error("Text post cannot be empty");
  }

  const response = await api.post(
    "/text-posts",
    buildCreateTextPostBody({
      ...payload,
      text,
    }),
    {
      params: {
        t: Date.now(),
      },
    }
  );

  const createdPost = normalizeTextPost(response.data?.post ?? response.data);

  if (!createdPost.id) {
    throw new Error("Text post create failed");
  }

  return createdPost;
};

export const getTextFeedPosts = async (
  cursor = "",
  limit = 6
): Promise<TextPostsResponse> => {
  const response = await api.get("/text-posts/feed", {
    params: {
      limit,
      ...(cursor ? { cursor } : {}),
      t: Date.now(),
    },
  });

  return normalizeTextPostsResponse(response.data);
};

export const getMyTextPosts = async (
  cursor = "",
  limit = 6
): Promise<TextPostsResponse> => {
  const response = await api.get("/text-posts/me", {
    params: {
      limit,
      ...(cursor ? { cursor } : {}),
      t: Date.now(),
    },
  });

  return normalizeTextPostsResponse(response.data);
};

export const getUserTextPosts = async (
  userId: string,
  cursor = "",
  limit = 6
): Promise<TextPostsResponse> => {
  const response = await api.get("/text-posts/user", {
    params: {
      user_id: userId,
      limit,
      ...(cursor ? { cursor } : {}),
      t: Date.now(),
    },
  });

  return normalizeTextPostsResponse(response.data);
};

export const convertTextPostsResponseToFeedResponse = (
  response: TextPostsResponse
): PostsResponse => {
  return {
    posts: response.posts,
    next_cursor: response.next_cursor,
    has_more: response.has_more,
  };
};