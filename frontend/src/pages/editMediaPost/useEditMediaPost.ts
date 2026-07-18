import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";

import {
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";

import {
  getEditableMediaPost,
  getPostEditErrorMessage,
  updateMediaPost,
} from "../../services/postEditService";

import type {
  FeedPost,
  MediaItem,
} from "../../services/postService";

import {
  usePostEditActions,
} from "./PostEditContext";

export type ExistingEditMedia = {
  key: string;
  source: "existing";

  url: string;
  id: string;
  mediaKey: string;

  type: "image" | "video";
};

export type NewEditMedia = {
  key: string;
  source: "new";

  url: string;
  id: string;

  type: "image" | "video";

  file: File;
};

export type EditMediaItem =
  | ExistingEditMedia
  | NewEditMedia;

type EditMediaLocationState = {
  post?: FeedPost;
  returnTo?: string;
};

type EditMediaBaseline = {
  caption: string;
  mediaIdentities: string[];
};

const MAX_CAPTION_LENGTH = 2200;

const MAX_IMAGE_COUNT = 10;

const MAX_IMAGE_SIZE =
  15 * 1024 * 1024;

const MAX_VIDEO_SIZE =
  200 * 1024 * 1024;

const IMAGE_MIME_TYPES =
  new Set([
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/gif",
  ]);

const VIDEO_MIME_TYPES =
  new Set([
    "video/mp4",
    "video/quicktime",
    "video/webm",
    "video/x-matroska",
  ]);

const IMAGE_EXTENSIONS =
  new Set([
    "jpg",
    "jpeg",
    "png",
    "webp",
    "gif",
  ]);

const VIDEO_EXTENSIONS =
  new Set([
    "mp4",
    "mov",
    "webm",
    "mkv",
  ]);

let localMediaSequence = 0;

const getFileExtension = (
  fileName: string
): string => {
  const extension =
    fileName
      .toLowerCase()
      .split(".")
      .pop();

  return extension ?? "";
};

const getFileMediaType = (
  file: File
): "image" | "video" | null => {
  const mimeType =
    file.type
      .toLowerCase()
      .trim();

  if (
    IMAGE_MIME_TYPES.has(mimeType)
  ) {
    return "image";
  }

  if (
    VIDEO_MIME_TYPES.has(mimeType)
  ) {
    return "video";
  }

  const extension =
    getFileExtension(file.name);

  if (
    IMAGE_EXTENSIONS.has(extension)
  ) {
    return "image";
  }

  if (
    VIDEO_EXTENSIONS.has(extension)
  ) {
    return "video";
  }

  return null;
};

const validateFileSize = (
  file: File,
  mediaType: "image" | "video"
): string => {
  if (file.size <= 0) {
    return "Media file is empty";
  }

  if (
    mediaType === "image" &&
    file.size > MAX_IMAGE_SIZE
  ) {
    return "Each image must be 15 MB or smaller";
  }

  if (
    mediaType === "video" &&
    file.size > MAX_VIDEO_SIZE
  ) {
    return "Video must be 200 MB or smaller";
  }

  return "";
};

const getExistingMediaKey = (
  media: MediaItem
): string => {
  return (
    media.id?.trim() ||
    media.url?.trim() ||
    ""
  );
};

const getPostMedia = (
  post: FeedPost
): MediaItem[] => {
  if (
    Array.isArray(post.media) &&
    post.media.length > 0
  ) {
    return [...post.media]
      .filter(
        (media) =>
          Boolean(media.url?.trim())
      )
      .sort(
        (first, second) =>
          first.order - second.order
      );
  }

  if (post.media_url?.trim()) {
    return [
      {
        url: post.media_url,
        id: post.media_id ?? "",
        type:
          post.media_type ===
          "video"
            ? "video"
            : "image",
        order: 0,
      },
    ];
  }

  return [];
};

const createExistingMedia = (
  post: FeedPost
): EditMediaItem[] => {
  return getPostMedia(post).map(
    (media, index) => {
      const mediaKey =
        getExistingMediaKey(media);

      return {
        key:
          `existing-${mediaKey}-${index}`,
        source: "existing" as const,

        url: media.url,
        id: media.id ?? "",
        mediaKey,

        type:
          media.type === "video"
            ? ("video" as const)
            : ("image" as const),
      };
    }
  );
};

const createNewMedia = (
  file: File,
  type: "image" | "video"
): NewEditMedia => {
  const key =
    `new-edit-media-${Date.now()}-${
      ++localMediaSequence
    }`;

  return {
    key,
    source: "new",

    url: URL.createObjectURL(file),
    id: "",

    type,
    file,
  };
};

const getMediaIdentity = (
  media: EditMediaItem
): string => {
  if (
    media.source === "existing"
  ) {
    return `existing:${media.mediaKey}`;
  }

  return `new:${media.key}`;
};

const createBaseline = (
  post: FeedPost,
  mediaItems: EditMediaItem[]
): EditMediaBaseline => {
  return {
    caption:
      post.caption?.trim() ?? "",

    mediaIdentities:
      mediaItems.map(
        getMediaIdentity
      ),
  };
};

const arraysMatch = (
  first: string[],
  second: string[]
): boolean => {
  return (
    first.length ===
      second.length &&
    first.every(
      (value, index) =>
        value === second[index]
    )
  );
};

const toOptimisticMedia = (
  mediaItems: EditMediaItem[]
): MediaItem[] => {
  return mediaItems.map(
    (media, index) => ({
      url: media.url,

      id:
        media.source ===
        "existing"
          ? media.id
          : `local:${media.key}`,

      type: media.type,
      order: index,
    })
  );
};

const releaseNewMediaURLs = (
  mediaItems: EditMediaItem[]
) => {
  mediaItems.forEach((media) => {
    if (
      media.source === "new"
    ) {
      URL.revokeObjectURL(
        media.url
      );
    }
  });
};

const getSafeReturnPath = (
  returnTo: string | undefined
): string => {
  const cleanPath =
    returnTo?.trim() ?? "";

  if (
    cleanPath.startsWith("/") &&
    !cleanPath.startsWith("//")
  ) {
    return cleanPath;
  }

  return "/";
};

export const useEditMediaPost = () => {
  const navigate = useNavigate();

  const location = useLocation();

  const { postId = "" } =
    useParams();

  const {
    beginOptimisticEdit,
    commitOptimisticEdit,
    rollbackOptimisticEdit,
  } = usePostEditActions();

  const routeState =
    location.state as
      | EditMediaLocationState
      | null;

  const routePost =
    routeState?.post?.id === postId
      ? routeState.post
      : null;

  const returnPath =
    getSafeReturnPath(
      routeState?.returnTo
    );

  const initialMedia =
    useMemo(
      () =>
        routePost
          ? createExistingMedia(
              routePost
            )
          : [],
      [routePost]
    );

  const mediaItemsRef =
    useRef<EditMediaItem[]>(
      initialMedia
    );

  const saveStartedRef =
    useRef(false);

  const [
    post,
    setPost,
  ] = useState<FeedPost | null>(
    routePost
  );

  const [
    caption,
    setCaptionState,
  ] = useState(
    routePost?.caption ?? ""
  );

  const [
    mediaItems,
    setMediaItemsState,
  ] = useState<EditMediaItem[]>(
    initialMedia
  );

  const [
    baseline,
    setBaseline,
  ] =
    useState<EditMediaBaseline | null>(
      routePost
        ? createBaseline(
            routePost,
            initialMedia
          )
        : null
    );

  const [
    activeIndex,
    setActiveIndex,
  ] = useState(0);

  const [
    loading,
    setLoading,
  ] = useState(!routePost);

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [
    editorError,
    setEditorError,
  ] = useState("");

  const replaceMediaItems =
    useCallback(
      (
        nextMediaItems:
          EditMediaItem[]
      ) => {
        mediaItemsRef.current =
          nextMediaItems;

        setMediaItemsState(
          nextMediaItems
        );
      },
      []
    );

  const hydratePost =
    useCallback(
      (loadedPost: FeedPost) => {
        const loadedMedia =
          createExistingMedia(
            loadedPost
          );

        releaseNewMediaURLs(
          mediaItemsRef.current
        );

        setPost(loadedPost);

        setCaptionState(
          loadedPost.caption ?? ""
        );

        replaceMediaItems(
          loadedMedia
        );

        setBaseline(
          createBaseline(
            loadedPost,
            loadedMedia
          )
        );

        setActiveIndex(0);
        setEditorError("");
      },
      [replaceMediaItems]
    );

  // A directly opened edit URL has no
  // router state, so it loads the post
  // from the real database.
  useEffect(() => {
    if (routePost) {
      return;
    }

    if (!postId.trim()) {
      setLoading(false);

      setEditorError(
        "Valid post id is required"
      );

      return;
    }

    const abortController =
      new AbortController();

    setLoading(true);

    getEditableMediaPost(
      postId,
      abortController.signal
    )
      .then((loadedPost) => {
        if (
          abortController.signal
            .aborted
        ) {
          return;
        }

        hydratePost(loadedPost);
      })
      .catch((error: unknown) => {
        if (
          abortController.signal
            .aborted
        ) {
          return;
        }

        setEditorError(
          getPostEditErrorMessage(
            error
          )
        );
      })
      .finally(() => {
        if (
          !abortController.signal
            .aborted
        ) {
          setLoading(false);
        }
      });

    return () => {
      abortController.abort();
    };
  }, [
    hydratePost,
    postId,
    routePost,
  ]);

  useEffect(() => {
    return () => {
      releaseNewMediaURLs(
        mediaItemsRef.current
      );
    };
  }, []);

  const activeMedia =
    mediaItems[activeIndex];

  const mediaType =
    mediaItems[0]?.type;

  const hasChanges =
    useMemo(() => {
      if (!baseline || !post) {
        return false;
      }

      const currentIdentities =
        mediaItems.map(
          getMediaIdentity
        );

      return (
        caption.trim() !==
          baseline.caption ||
        !arraysMatch(
          currentIdentities,
          baseline.mediaIdentities
        )
      );
    }, [
      baseline,
      caption,
      mediaItems,
      post,
    ]);

  const canSave =
    Boolean(post) &&
    hasChanges &&
    mediaItems.length > 0 &&
    !loading &&
    !saving;

  const canAddMore =
    mediaItems.length === 0 ||
    (
      mediaType === "image" &&
      mediaItems.length <
        MAX_IMAGE_COUNT
    );

  const inputAccept =
    mediaType === "image"
      ? "image/jpeg,image/png,image/webp,image/gif"
      : "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm,video/x-matroska";

  const allowMultiple =
    mediaType !== "video";

  const changeCaption =
    useCallback(
      (nextCaption: string) => {
        setEditorError("");

        setCaptionState(
          nextCaption.slice(
            0,
            MAX_CAPTION_LENGTH
          )
        );
      },
      []
    );

  const handleFileSelection =
    useCallback(
      (
        event:
          ChangeEvent<HTMLInputElement>
      ) => {
        const selectedFiles =
          Array.from(
            event.target.files ?? []
          );

        event.target.value = "";

        setEditorError("");

        if (
          selectedFiles.length === 0
        ) {
          return;
        }

        const selectedMedia =
          selectedFiles.map(
            (file) => ({
              file,
              type:
                getFileMediaType(file),
            })
          );

        const unsupportedFile =
          selectedMedia.find(
            (item) =>
              item.type === null
          );

        if (unsupportedFile) {
          setEditorError(
            "Only JPG, PNG, WEBP, GIF, MP4, MOV, WEBM or MKV files are allowed"
          );

          return;
        }

        const typedMedia =
          selectedMedia as Array<{
            file: File;
            type:
              | "image"
              | "video";
          }>;

        const selectedType =
          typedMedia[0].type;

        const hasMixedTypes =
          typedMedia.some(
            (item) =>
              item.type !==
              selectedType
          );

        if (hasMixedTypes) {
          setEditorError(
            "Images and videos cannot be mixed in one post"
          );

          return;
        }

        if (
          mediaType &&
          selectedType !==
            mediaType
        ) {
          setEditorError(
            "Remove the current media before changing its type"
          );

          return;
        }

        if (
          mediaType === "video"
        ) {
          setEditorError(
            "A video post can contain only one video"
          );

          return;
        }

        if (
          selectedType ===
            "video" &&
          typedMedia.length !== 1
        ) {
          setEditorError(
            "A video post can contain only one video"
          );

          return;
        }

        const finalMediaCount =
          mediaItems.length +
          typedMedia.length;

        if (
          selectedType ===
            "image" &&
          finalMediaCount >
            MAX_IMAGE_COUNT
        ) {
          setEditorError(
            `A post can contain up to ${MAX_IMAGE_COUNT} images`
          );

          return;
        }

        for (
          const item of typedMedia
        ) {
          const sizeError =
            validateFileSize(
              item.file,
              item.type
            );

          if (sizeError) {
            setEditorError(
              sizeError
            );

            return;
          }
        }

        const newMedia =
          typedMedia.map(
            (item) =>
              createNewMedia(
                item.file,
                item.type
              )
          );

        const nextMedia =
          mediaItems.length > 0
            ? [
                ...mediaItems,
                ...newMedia,
              ]
            : newMedia;

        const nextActiveIndex =
          mediaItems.length > 0
            ? mediaItems.length
            : 0;

        replaceMediaItems(
          nextMedia
        );

        setActiveIndex(
          nextActiveIndex
        );
      },
      [
        mediaItems,
        mediaType,
        replaceMediaItems,
      ]
    );

  const removeActiveMedia =
    useCallback(() => {
      const selectedMedia =
        mediaItems[activeIndex];

      if (!selectedMedia) {
        return;
      }

      setEditorError("");

      if (
        selectedMedia.source ===
        "new"
      ) {
        URL.revokeObjectURL(
          selectedMedia.url
        );
      }

      const nextMedia =
        mediaItems.filter(
          (_, index) =>
            index !== activeIndex
        );

      replaceMediaItems(
        nextMedia
      );

      setActiveIndex(
        Math.max(
          0,
          Math.min(
            activeIndex,
            nextMedia.length - 1
          )
        )
      );
    }, [
      activeIndex,
      mediaItems,
      replaceMediaItems,
    ]);

  const selectMedia =
    useCallback(
      (index: number) => {
        if (
          index < 0 ||
          index >=
            mediaItems.length
        ) {
          return;
        }

        setActiveIndex(index);
      },
      [mediaItems.length]
    );

  const closeEditor =
    useCallback(() => {
      if (
        hasChanges &&
        !window.confirm(
          "Discard your unsaved changes?"
        )
      ) {
        return;
      }

      releaseNewMediaURLs(
        mediaItemsRef.current
      );

      mediaItemsRef.current = [];

      navigate(returnPath, {
        replace: true,
      });
    }, [
      hasChanges,
      navigate,
      returnPath,
    ]);

  const savePost =
    useCallback(() => {
      if (
        !post ||
        !canSave ||
        saveStartedRef.current
      ) {
        return;
      }

      const optimisticMedia =
        toOptimisticMedia(
          mediaItems
        );

      const firstMedia =
        optimisticMedia[0];

      if (!firstMedia) {
        setEditorError(
          "A media post needs at least one image or video"
        );

        return;
      }

      saveStartedRef.current = true;

      setSaving(true);
      setEditorError("");

      const cleanCaption =
        caption.trim();

      const optimisticPost:
        FeedPost = {
          ...post,

          type: firstMedia.type,

          caption: cleanCaption,
          text: cleanCaption,

          media: optimisticMedia,

          media_url:
            firstMedia.url,

          media_id:
            firstMedia.id,

          media_type:
            firstMedia.type,

          updated_at:
            new Date().toISOString(),
        };

      const keepMediaKeys =
        mediaItems
          .filter(
            (
              media
            ): media is ExistingEditMedia =>
              media.source ===
              "existing"
          )
          .map(
            (media) =>
              media.mediaKey
          );

      const newFiles =
        mediaItems
          .filter(
            (
              media
            ): media is NewEditMedia =>
              media.source === "new"
          )
          .map(
            (media) =>
              media.file
          );

      const temporaryURLs =
        mediaItems
          .filter(
            (
              media
            ): media is NewEditMedia =>
              media.source === "new"
          )
          .map(
            (media) =>
              media.url
          );

      const operationId =
        beginOptimisticEdit(
          post,
          optimisticPost
        );

      const updateRequest =
        updateMediaPost({
          postId: post.id,

          caption: cleanCaption,

          expectedUpdatedAt:
            post.updated_at,

          keepMediaKeys,
          newFiles,
        });

      // The Context now owns the
      // temporary preview URLs.
      // Prevent unmount cleanup from
      // removing them too early.
      mediaItemsRef.current = [];

      // Return to Feed/Profile immediately.
      navigate(returnPath, {
        replace: true,
      });

      void updateRequest
        .then((savedPost) => {
          commitOptimisticEdit(
            post.id,
            operationId,
            savedPost
          );
        })
        .catch(
          (error: unknown) => {
            console.error(
              "Media post edit failed:",
              getPostEditErrorMessage(
                error
              )
            );

            rollbackOptimisticEdit(
              post.id,
              operationId
            );
          }
        )
        .finally(() => {
          temporaryURLs.forEach(
            (url) => {
              URL.revokeObjectURL(
                url
              );
            }
          );
        });
    }, [
      beginOptimisticEdit,
      canSave,
      caption,
      commitOptimisticEdit,
      mediaItems,
      navigate,
      post,
      returnPath,
      rollbackOptimisticEdit,
    ]);

  return {
    post,

    caption,
    changeCaption,

    mediaItems,
    activeMedia,
    activeIndex,
    selectMedia,

    mediaType,

    loading,
    saving,

    editorError,

    hasChanges,
    canSave,
    canAddMore,

    inputAccept,
    allowMultiple,

    maxCaptionLength:
      MAX_CAPTION_LENGTH,

    handleFileSelection,
    removeActiveMedia,

    closeEditor,
    savePost,
  };
};