import api from "./api";

type UnknownRecord = Record<string, unknown>;

export type ReelUser = {
  id: string;
  first_name: string;
  last_name: string;
  display_name?: string;
  username?: string;
  profile_image_url: string;
};

export type ReelMedia = {
  url: string;
  id: string;
  type: "video";
  order: number;
  poster_url: string;
};

export type Reel = {
  id: string;
  user_id: string;
  user: ReelUser;
  type: "video";
  caption: string;
  media: ReelMedia[];
  media_url: string;
  media_id: string;
  media_type: "video";
  likes_count: number;
  comments_count: number;
  shares_count: number;
  current_user_reaction: string;
  is_loved_by_me: boolean;
  created_at: string;
  updated_at: string;
};

export type ReelsResponse = {
  reels: Reel[];
  next_cursor: string;
  has_more: boolean;
};

const DEFAULT_REELS_LIMIT = 6;
const MAX_REELS_LIMIT = 20;

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-cache, no-store, must-revalidate",
  Pragma: "no-cache",
} as const;

const toRecord = (value: unknown): UnknownRecord => {
  if (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  ) {
    return value as UnknownRecord;
  }

  return {};
};

const normalizeString = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
};

const getStringValue = (
  record: UnknownRecord,
  keys: readonly string[],
): string => {
  for (const key of keys) {
    const value = normalizeString(record[key]);

    if (value) {
      return value;
    }
  }

  return "";
};

const normalizeID = (value: unknown): string => {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "object" && value !== null) {
    const objectValue = toRecord(value);

    return getStringValue(objectValue, [
      "$oid",
      "hex",
      "id",
      "_id",
    ]);
  }

  return String(value).trim();
};

const normalizeCount = (value: unknown): number => {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return 0;
  }

  return Math.max(0, Math.floor(numberValue));
};

const normalizeBoolean = (value: unknown): boolean => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) && value !== 0;
  }

  if (typeof value === "string") {
    const normalizedValue = value.trim().toLowerCase();

    if (["true", "1", "yes", "on"].includes(normalizedValue)) {
      return true;
    }

    if (
      ["", "false", "0", "no", "off", "null", "undefined"].includes(
        normalizedValue,
      )
    ) {
      return false;
    }
  }

  return false;
};

const normalizeReelsLimit = (limit: number): number => {
  if (!Number.isFinite(limit) || limit <= 0) {
    return DEFAULT_REELS_LIMIT;
  }

  return Math.min(Math.floor(limit), MAX_REELS_LIMIT);
};

const normalizeReelUser = (
  user: unknown,
  fallbackUserID = "",
): ReelUser => {
  const rawUser = toRecord(user);

  const firstName = getStringValue(rawUser, [
    "first_name",
    "firstName",
  ]);

  const lastName = getStringValue(rawUser, [
    "last_name",
    "lastName",
  ]);

  const username = getStringValue(rawUser, [
    "username",
    "user_name",
  ]).replace(/^@+/, "");

  const combinedName = [firstName, lastName]
    .filter(Boolean)
    .join(" ");

  const displayName =
    getStringValue(rawUser, [
      "display_name",
      "displayName",
      "full_name",
      "fullName",
      "name",
    ]) ||
    combinedName ||
    username;

  return {
    id:
      normalizeID(
        rawUser.id ??
          rawUser._id ??
          rawUser.user_id ??
          rawUser.userId,
      ) || fallbackUserID,

    first_name: firstName,
    last_name: lastName,
    display_name: displayName,
    username,

    profile_image_url: getStringValue(rawUser, [
      "profile_image_url",
      "profileImageURL",
      "profileImageUrl",
      "profile_picture",
      "profile_image",
      "profile_photo",
      "avatar_url",
      "avatar",
      "photo_url",
      "image",
    ]),
  };
};

const normalizeReelMediaItem = (
  mediaItem: unknown,
  index: number,
): ReelMedia | null => {
  const rawMedia = toRecord(mediaItem);

  if (Object.keys(rawMedia).length === 0) {
    return null;
  }

  const mediaURL = getStringValue(rawMedia, [
    "url",
    "media_url",
    "video_url",
    "secure_url",
  ]);

  if (!mediaURL) {
    return null;
  }

  const mediaType = getStringValue(rawMedia, ["type", "media_type"])
    .toLowerCase();

  if (mediaType && mediaType !== "video") {
    return null;
  }

  return {
    url: mediaURL,

    id:
      normalizeID(rawMedia.id ?? rawMedia._id) ||
      getStringValue(rawMedia, ["media_id", "public_id"]),

    type: "video",

    order: normalizeCount(rawMedia.order ?? index),

    poster_url: getStringValue(rawMedia, [
      "poster_url",
      "thumbnail_url",
      "thumbnail",
      "poster",
    ]),
  };
};

const normalizeReelMedia = (reel: UnknownRecord): ReelMedia[] => {
  const rawMedia = Array.isArray(reel.media) ? reel.media : [];

  const normalizedMedia = rawMedia
    .map(normalizeReelMediaItem)
    .filter((mediaItem): mediaItem is ReelMedia => mediaItem !== null)
    .sort(
      (firstMedia, secondMedia) => firstMedia.order - secondMedia.order,
    );

  if (normalizedMedia.length > 0) {
    return normalizedMedia;
  }

  const legacyMediaURL = getStringValue(reel, [
    "media_url",
    "video_url",
  ]);

  if (!legacyMediaURL) {
    return [];
  }

  return [
    {
      url: legacyMediaURL,
      id: normalizeID(reel.media_id),
      type: "video",
      order: 0,
      poster_url: getStringValue(reel, [
        "poster_url",
        "thumbnail_url",
        "thumbnail",
      ]),
    },
  ];
};

export const normalizeReel = (reelData: unknown): Reel | null => {
  const rawReel = toRecord(reelData);

  if (Object.keys(rawReel).length === 0) {
    return null;
  }

  const reelID = normalizeID(rawReel.id ?? rawReel._id);

  if (!reelID) {
    return null;
  }

  const rawUser = toRecord(rawReel.user);

  const userID = normalizeID(
    rawReel.user_id ??
      rawReel.userId ??
      rawUser.id ??
      rawUser._id ??
      rawUser.user_id ??
      rawUser.userId,
  );

  const media = normalizeReelMedia(rawReel);

  if (media.length === 0) {
    return null;
  }

  const currentUserReaction = getStringValue(rawReel, [
    "current_user_reaction",
    "currentUserReaction",
  ]).toLowerCase();

  return {
    id: reelID,
    user_id: userID,
    user: normalizeReelUser(rawReel.user, userID),
    type: "video",

    caption: getStringValue(rawReel, [
      "caption",
      "text_content",
      "content",
      "text",
    ]),

    media,

    media_url:
      getStringValue(rawReel, ["media_url", "video_url"]) ||
      media[0].url,

    media_id: normalizeID(rawReel.media_id) || media[0].id,
    media_type: "video",

    likes_count: normalizeCount(
      rawReel.likes_count ??
        rawReel.like_count ??
        rawReel.reactions_count,
    ),

    comments_count: normalizeCount(
      rawReel.comments_count ?? rawReel.comment_count,
    ),

    shares_count: normalizeCount(
      rawReel.shares_count ?? rawReel.share_count,
    ),

    current_user_reaction: currentUserReaction,

    is_loved_by_me:
      normalizeBoolean(
        rawReel.is_loved_by_me ?? rawReel.isLovedByMe,
      ) || currentUserReaction === "love",

    created_at: getStringValue(rawReel, ["created_at", "createdAt"]),
    updated_at: getStringValue(rawReel, ["updated_at", "updatedAt"]),
  };
};

const getResponseContainer = (responseData: unknown): UnknownRecord => {
  const rawResponse = toRecord(responseData);

  if (Array.isArray(rawResponse.reels)) {
    return rawResponse;
  }

  const nestedData = toRecord(rawResponse.data);

  if (Array.isArray(nestedData.reels)) {
    return nestedData;
  }

  return rawResponse;
};

const normalizeReelsResponse = (responseData: unknown): ReelsResponse => {
  const responseContainer = getResponseContainer(responseData);

  const rawReels = Array.isArray(responseContainer.reels)
    ? responseContainer.reels
    : [];

  const reels = rawReels
    .map(normalizeReel)
    .filter((reelItem): reelItem is Reel => reelItem !== null);

  return {
    reels,
    next_cursor: getStringValue(responseContainer, [
      "next_cursor",
      "nextCursor",
    ]),
    has_more: normalizeBoolean(
      responseContainer.has_more ?? responseContainer.hasMore,
    ),
  };
};

export const getReels = async (
  cursor = "",
  limit = DEFAULT_REELS_LIMIT,
  signal?: AbortSignal,
): Promise<ReelsResponse> => {
  const cleanCursor = cursor.trim();

  const response = await api.get("/reels", {
    signal,
    params: {
      limit: normalizeReelsLimit(limit),
      ...(cleanCursor ? { cursor: cleanCursor } : {}),
      t: Date.now(),
    },
    headers: NO_CACHE_HEADERS,
  });

  return normalizeReelsResponse(response.data);
};

export const getReelByID = async (
  reelID: string,
  signal?: AbortSignal,
): Promise<Reel> => {
  const cleanReelID = reelID.trim();

  if (!cleanReelID) {
    throw new Error("Reel id is required");
  }

  const response = await api.get(
    `/reels/${encodeURIComponent(cleanReelID)}`,
    {
      signal,
      params: {
        t: Date.now(),
      },
      headers: NO_CACHE_HEADERS,
    },
  );

  const rawResponse = toRecord(response.data);
  const nestedData = toRecord(rawResponse.data);

  const reel = normalizeReel(
    rawResponse.reel ?? nestedData.reel ?? rawResponse,
  );

  if (!reel) {
    throw new Error("Invalid reel response");
  }

  return reel;
};

export const getPrimaryReelMedia = (reel: Reel): ReelMedia | null => {
  return reel.media.find((mediaItem) => Boolean(mediaItem.url)) ?? null;
};