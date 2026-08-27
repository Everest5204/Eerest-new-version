import api from "./api";

export type PostUser = {
  id?: string;
  first_name: string;
  last_name: string;
  profile_image_url?: string;
};

export type MediaItem = {
  url: string;
  id: string;
  type: "image" | "video";
  order: number;
};

export type TextPostBackgroundKind =
  | "plain"
  | "solid"
  | "gradient"
  | "image";

export type TextPostBackground = {
  kind: TextPostBackgroundKind;
  value: string;
};

export type FeedPost = {
  id: string;
  user_id: string;
  user: PostUser;

  is_self: boolean;
  is_following: boolean;

  type: string;
  caption?: string;
  text?: string;

  media: MediaItem[];

  media_url?: string;
  media_id?: string;
  media_type?: "image" | "video" | string;

  text_background?: TextPostBackground;
  text_color?: string;
  text_style?: string;

  likes_count: number;
  comments_count: number;
  shares_count: number;

  created_at: string;
  updated_at: string;
};

export type PostsResponse = {
  posts: FeedPost[];
  next_cursor: string;
  has_more: boolean;
};

const DEFAULT_TEXT_BACKGROUND: TextPostBackground = {
  kind: "plain",
  value: "#ffffff",
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
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;

  if (typeof value === "string") {
    return value.trim().toLowerCase() === "true";
  }

  return false;
};

const normalizeMediaType = (
  type: unknown
): "image" | "video" => {
  return type === "video" ? "video" : "image";
};

const normalizeTextBackgroundKind = (
  kind: unknown
): TextPostBackgroundKind => {
  if (kind === "solid") return "solid";
  if (kind === "gradient") return "gradient";
  if (kind === "image") return "image";

  return "plain";
};

const guessTextBackgroundKind = (
  value: string
): TextPostBackgroundKind => {
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

  if (
    cleanValue === "#ffffff" ||
    cleanValue === "white"
  ) {
    return "plain";
  }

  return "solid";
};

const normalizeTextBackground = (
  background: unknown
): TextPostBackground => {
  if (!background) {
    return DEFAULT_TEXT_BACKGROUND;
  }

  if (typeof background === "string") {
    const value = background.trim();

    if (!value) {
      return DEFAULT_TEXT_BACKGROUND;
    }

    return {
      kind: guessTextBackgroundKind(value),
      value,
    };
  }

  if (typeof background === "object") {
    const backgroundObject =
      background as Partial<TextPostBackground>;

    const value = normalizeString(
      backgroundObject.value
    ).trim();

    if (!value) {
      return DEFAULT_TEXT_BACKGROUND;
    }

    return {
      kind: normalizeTextBackgroundKind(
        backgroundObject.kind
      ),
      value,
    };
  }

  return DEFAULT_TEXT_BACKGROUND;
};

const normalizeMediaItem = (
  item: unknown,
  index: number
): MediaItem => {
  const mediaItem = item as Partial<MediaItem>;

  return {
    url: normalizeString(mediaItem?.url).trim(),
    id: normalizeString(mediaItem?.id).trim(),
    type: normalizeMediaType(mediaItem?.type),
    order: normalizeNumber(mediaItem?.order ?? index),
  };
};

const normalizeMediaList = (post: any): MediaItem[] => {
  if (
    Array.isArray(post?.media) &&
    post.media.length > 0
  ) {
    return post.media
      .map(normalizeMediaItem)
      .filter((item: MediaItem) => Boolean(item.url))
      .sort(
        (a: MediaItem, b: MediaItem) =>
          a.order - b.order
      );
  }

  const legacyMediaURL = normalizeString(
    post?.media_url
  ).trim();

  if (legacyMediaURL) {
    return [
      {
        url: legacyMediaURL,
        id: normalizeString(post?.media_id).trim(),
        type: normalizeMediaType(post?.media_type),
        order: 0,
      },
    ];
  }

  return [];
};

export const normalizePost = (post: any): FeedPost => {
  const media = normalizeMediaList(post);

  const caption = normalizeString(
    post?.caption
  ).trim();

  const text = normalizeString(
    post?.text ?? caption
  ).trim();

  const textBackground =
    post?.text_background ??
    post?.textBackground ??
    post?.background;

  return {
    id: normalizeID(post?.id ?? post?._id),
    user_id: normalizeID(post?.user_id),

    user: {
      id: normalizeID(
        post?.user?.id ?? post?.user?._id
      ),
      first_name: normalizeString(
        post?.user?.first_name
      ),
      last_name: normalizeString(
        post?.user?.last_name
      ),
      profile_image_url: normalizeString(
        post?.user?.profile_image_url
      ),
    },

    is_self: normalizeBoolean(post?.is_self),
    is_following: normalizeBoolean(
      post?.is_following
    ),

    type: normalizeString(
      post?.type ||
        (text && media.length === 0 ? "text" : "")
    ),

    caption,
    text,

    media,

    media_url: normalizeString(
      post?.media_url ?? media[0]?.url ?? ""
    ),

    media_id: normalizeString(
      post?.media_id ?? media[0]?.id ?? ""
    ),

    media_type: normalizeString(
      post?.media_type ?? media[0]?.type ?? ""
    ),

    text_background:
      normalizeTextBackground(textBackground),

    text_color: normalizeString(
      post?.text_color ??
        post?.textColor ??
        "#111827"
    ),

    text_style: normalizeString(
      post?.text_style ??
        post?.textStyle ??
        "bold_center"
    ),

    likes_count: normalizeNumber(
      post?.likes_count
    ),

    comments_count: normalizeNumber(
      post?.comments_count
    ),

    shares_count: normalizeNumber(
      post?.shares_count
    ),

    created_at: normalizeString(
      post?.created_at
    ),

    updated_at: normalizeString(
      post?.updated_at
    ),
  };
};

const normalizePostsResponse = (
  data: any
): PostsResponse => {
  const posts = Array.isArray(data?.posts)
    ? data.posts
    : [];

  return {
    posts: posts
      .map(normalizePost)
      .filter(
        (post: FeedPost) => Boolean(post.id)
      ),

    next_cursor: normalizeString(
      data?.next_cursor
    ),

    has_more: Boolean(data?.has_more),
  };
};

export const createMediaPost = async (
  caption: string,
  files: File[]
): Promise<FeedPost> => {
  const cleanCaption = caption.trim();

  if (
    !Array.isArray(files) ||
    files.length === 0
  ) {
    throw new Error("Media file is required");
  }

  const formData = new FormData();

  formData.append("caption", cleanCaption);

  files.forEach((file) => {
    formData.append("media", file);
  });

  const response = await api.post(
    "/posts/media",
    formData,
    {
      params: {
        t: Date.now(),
      },
    }
  );

  const createdPost = normalizePost(
    response.data?.post ?? response.data
  );

  if (!createdPost.id) {
    throw new Error("Media post create failed");
  }

  return createdPost;
};

export const getFeedPosts = async (
  cursor = "",
  limit = 6
): Promise<PostsResponse> => {
  const response = await api.get(
    "/posts/feed",
    {
      params: {
        limit,
        ...(cursor ? { cursor } : {}),
        t: Date.now(),
      },
    }
  );

  return normalizePostsResponse(response.data);
};

export const getProfilePosts = async (
  cursor = "",
  limit = 6
): Promise<PostsResponse> => {
  const response = await api.get(
    "/posts/me",
    {
      params: {
        limit,
        ...(cursor ? { cursor } : {}),
        t: Date.now(),
      },
    }
  );

  return normalizePostsResponse(response.data);
};

export const getUserPosts = async (
  userId: string,
  cursor = "",
  limit = 6
): Promise<PostsResponse> => {
  const response = await api.get(
    "/posts/user",
    {
      params: {
        user_id: userId,
        limit,
        ...(cursor ? { cursor } : {}),
        t: Date.now(),
      },
    }
  );

  return normalizePostsResponse(response.data);
};