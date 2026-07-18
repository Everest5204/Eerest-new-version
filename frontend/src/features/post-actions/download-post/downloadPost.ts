import type {
  MediaItem,
} from "../../../services/postService";

export type DownloadPostInput = {
  postID: string;
  mediaItems: MediaItem[];
  caption?: string;
  textPostContent?: string;
  signal?: AbortSignal;
};

export type DownloadPostResult = {
  downloadedFiles: number;
  failedFiles: number;
};

export class DownloadPostError extends Error {
  constructor(message: string) {
    super(message);

    this.name = "DownloadPostError";
  }
}

const MIME_EXTENSION_MAP: Record<
  string,
  string
> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

const sanitizeFilePart = (
  value: string
): string => {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
};

const getExtensionFromURL = (
  mediaURL: string
): string => {
  try {
    const pathname =
      new URL(
        mediaURL,
        window.location.origin
      ).pathname;

    const match = pathname.match(
      /\.([a-zA-Z0-9]{2,5})$/
    );

    return match?.[1]
      ?.toLowerCase() ?? "";
  } catch {
    return "";
  }
};

const createDownloadLink = (
  url: string,
  fileName: string
) => {
  const link =
    document.createElement("a");

  link.href = url;
  link.download = fileName;
  link.rel = "noopener noreferrer";
  link.style.display = "none";

  document.body.appendChild(link);

  link.click();
  link.remove();
};

const downloadBlob = (
  blob: Blob,
  fileName: string
) => {
  const objectURL =
    URL.createObjectURL(blob);

  createDownloadLink(
    objectURL,
    fileName
  );

  window.setTimeout(() => {
    URL.revokeObjectURL(
      objectURL
    );
  }, 1500);
};

const getMediaFileName = (
  postID: string,
  mediaItem: MediaItem,
  index: number,
  totalItems: number,
  blobType?: string
): string => {
  const safePostID =
    sanitizeFilePart(postID) ||
    "post";

  const mimeExtension =
    blobType
      ? MIME_EXTENSION_MAP[
          blobType
            .split(";")[0]
            .trim()
            .toLowerCase()
        ]
      : "";

  const extension =
    mimeExtension ||
    getExtensionFromURL(
      mediaItem.url
    ) ||
    (
      mediaItem.type === "video"
        ? "mp4"
        : "jpg"
    );

  const itemNumber =
    totalItems > 1
      ? `-${index + 1}`
      : "";

  return (
    `everest-post-${safePostID}` +
    `${itemNumber}.${extension}`
  );
};

const downloadMediaItem = async (
  postID: string,
  mediaItem: MediaItem,
  index: number,
  totalItems: number,
  signal?: AbortSignal
) => {
  const mediaURL =
    mediaItem.url?.trim();

  if (!mediaURL) {
    throw new DownloadPostError(
      "Media URL is unavailable"
    );
  }

  const response = await fetch(
    mediaURL,
    {
      signal,
      mode: "cors",
    }
  );

  if (!response.ok) {
    throw new DownloadPostError(
      "Unable to download media"
    );
  }

  const mediaBlob =
    await response.blob();

  const fileName =
    getMediaFileName(
      postID,
      mediaItem,
      index,
      totalItems,
      mediaBlob.type
    );

  downloadBlob(
    mediaBlob,
    fileName
  );
};

const waitBetweenDownloads = () =>
  new Promise<void>((resolve) => {
    window.setTimeout(
      resolve,
      180
    );
  });

export const downloadPost = async ({
  postID,
  mediaItems,
  caption = "",
  textPostContent = "",
  signal,
}: DownloadPostInput): Promise<DownloadPostResult> => {
  if (
    typeof window === "undefined" ||
    typeof document === "undefined"
  ) {
    throw new DownloadPostError(
      "Download is unavailable"
    );
  }

  const cleanPostID =
    postID.trim();

  if (!cleanPostID) {
    throw new DownloadPostError(
      "Post id is required"
    );
  }

  const validMediaItems =
    mediaItems.filter(
      (item) =>
        Boolean(item?.url?.trim())
    );

  if (
    validMediaItems.length === 0
  ) {
    const postText =
      textPostContent.trim() ||
      caption.trim() ||
      "Everest post";

    const textBlob = new Blob(
      [postText],
      {
        type:
          "text/plain;charset=utf-8",
      }
    );

    const safePostID =
      sanitizeFilePart(
        cleanPostID
      ) || "post";

    downloadBlob(
      textBlob,
      `everest-post-${safePostID}.txt`
    );

    return {
      downloadedFiles: 1,
      failedFiles: 0,
    };
  }

  let downloadedFiles = 0;
  let failedFiles = 0;

  for (
    let index = 0;
    index <
    validMediaItems.length;
    index += 1
  ) {
    if (signal?.aborted) {
      throw new DOMException(
        "Download cancelled",
        "AbortError"
      );
    }

    try {
      await downloadMediaItem(
        cleanPostID,
        validMediaItems[index],
        index,
        validMediaItems.length,
        signal
      );

      downloadedFiles += 1;
    } catch {
      failedFiles += 1;
    }

    if (
      index <
      validMediaItems.length - 1
    ) {
      await waitBetweenDownloads();
    }
  }

  if (downloadedFiles === 0) {
    throw new DownloadPostError(
      "Unable to download this post"
    );
  }

  return {
    downloadedFiles,
    failedFiles,
  };
};