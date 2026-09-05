import type {
  FeedPost,
  MediaItem,
} from "../../services/postService";

export type ProfilePhoto = {
  key: string;
  url: string;
};

const getCreatedTime = (
  post: FeedPost,
): number => {
  const createdTime = new Date(
    post.created_at,
  ).getTime();

  return Number.isFinite(createdTime)
    ? createdTime
    : 0;
};

const getPostImages = (
  post: FeedPost,
): MediaItem[] => {
  const mediaItems = Array.isArray(post.media)
    ? post.media
    : [];

  const images = mediaItems
    .filter(
      (mediaItem) =>
        mediaItem.type === "image" &&
        Boolean(mediaItem.url?.trim()),
    )
    .sort(
      (firstMedia, secondMedia) =>
        firstMedia.order - secondMedia.order,
    );

  if (images.length > 0) {
    return images;
  }

  const legacyURL = post.media_url?.trim() ?? "";
  const isLegacyImage =
    post.media_type !== "video" &&
    post.type !== "video";

  if (!legacyURL || !isLegacyImage) {
    return [];
  }

  return [
    {
      url: legacyURL,
      id: post.media_id?.trim() ?? "",
      type: "image",
      order: 0,
    },
  ];
};

export const buildProfilePhotoList = (
  posts: FeedPost[],
): ProfilePhoto[] => {
  return [...posts]
    .sort(
      (firstPost, secondPost) =>
        getCreatedTime(secondPost) -
        getCreatedTime(firstPost),
    )
    .flatMap((post) =>
      getPostImages(post).map(
        (mediaItem, mediaIndex) => ({
          key: `${post.id}:${
            mediaItem.id || mediaIndex
          }:${mediaItem.url}`,
          url: mediaItem.url.trim(),
        }),
      ),
    );
};

export const getProfilePhotoThumbnailURL = (
  imageURL: string,
): string => {
  const uploadSegment = "/image/upload/";

  if (
    !imageURL.includes("res.cloudinary.com") ||
    !imageURL.includes(uploadSegment)
  ) {
    return imageURL;
  }

  return imageURL.replace(
    uploadSegment,
    `${uploadSegment}f_auto,q_auto:eco,c_limit,w_960/`,
  );
};

export const hasProfilePhotos = (
  posts: FeedPost[],
): boolean => {
  return posts.some(
    (post) => getPostImages(post).length > 0,
  );
};