import type {
  FeedPost,
  MediaItem,
} from "../../services/postService";

export type ProfileVideo = {
  key: string;
  postID: string;
  url: string;
  posterURL: string;
  caption: string;
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

const getPostVideoMedia = (
  post: FeedPost,
): MediaItem[] => {
  const mediaVideos = post.media
    .filter(
      (mediaItem) =>
        mediaItem.type === "video" &&
        Boolean(mediaItem.url.trim()),
    )
    .sort(
      (firstMedia, secondMedia) =>
        firstMedia.order - secondMedia.order,
    );

  if (mediaVideos.length > 0) {
    return mediaVideos;
  }

  const legacyVideoURL =
    post.media_type === "video"
      ? post.media_url?.trim() ?? ""
      : "";

  if (!legacyVideoURL) {
    return [];
  }

  return [
    {
      url: legacyVideoURL,
      id: post.media_id?.trim() ?? "",
      type: "video",
      order: 0,
    },
  ];
};

export const getProfileVideoPosterURL = (
  videoURL: string,
): string => {
  const cleanURL = videoURL.trim();
  const uploadSegment = "/video/upload/";

  const uploadIndex = cleanURL.indexOf(
    uploadSegment,
  );

  if (uploadIndex < 0) {
    return "";
  }

  const prefixEnd =
    uploadIndex + uploadSegment.length;

  const prefix = cleanURL.slice(
    0,
    prefixEnd,
  );

  const assetPath = cleanURL
    .slice(prefixEnd)
    .split("?", 1)[0];

  const lastSlashIndex =
    assetPath.lastIndexOf("/");

  const lastDotIndex =
    assetPath.lastIndexOf(".");

  if (lastDotIndex <= lastSlashIndex) {
    return "";
  }

  const assetWithoutExtension =
    assetPath.slice(0, lastDotIndex);

  return (
    `${prefix}` +
    "so_auto,c_fill,g_auto,w_480,h_854," +
    `f_auto,q_auto/${assetWithoutExtension}.jpg`
  );
};

export const buildProfileVideoList = (
  posts: FeedPost[],
): ProfileVideo[] => {
  return [...posts]
    .sort(
      (firstPost, secondPost) =>
        getCreatedTime(secondPost) -
        getCreatedTime(firstPost),
    )
    .flatMap((post) =>
      getPostVideoMedia(post).map(
        (mediaItem, mediaIndex) => {
          const videoURL =
            mediaItem.url.trim();

          return {
            key:
              `${post.id}:` +
              `${mediaItem.id || mediaIndex}:` +
              videoURL,
            postID: post.id,
            url: videoURL,
            posterURL:
              getProfileVideoPosterURL(
                videoURL,
              ),
            caption:
              post.caption?.trim() ||
              post.text?.trim() ||
              "",
          };
        },
      ),
    );
};

export const hasProfileVideos = (
  posts: FeedPost[],
): boolean => {
  return posts.some(
    (post) =>
      getPostVideoMedia(post).length > 0,
  );
};