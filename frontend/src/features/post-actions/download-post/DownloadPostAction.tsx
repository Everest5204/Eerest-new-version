import {
  memo,
  useCallback,
} from "react";

import { Download } from "lucide-react";

import type {
  MediaItem,
} from "../../../services/postService";

import PostActionButton from "../shared/PostActionButton";

import type {
  PostActionToastTone,
} from "../shared/PostActionToast";

import {
  downloadPost,
} from "./downloadPost";

type DownloadPostActionProps = {
  postID: string;
  mediaItems: MediaItem[];
  caption: string;
  textPostContent: string;

  onCloseMenu: () => void;

  onNotify: (
    message: string,
    tone?: PostActionToastTone
  ) => void;
};

const DownloadPostAction = ({
  postID,
  mediaItems,
  caption,
  textPostContent,
  onCloseMenu,
  onNotify,
}: DownloadPostActionProps) => {
  const handleDownloadPost =
    useCallback(async () => {
      onCloseMenu();

      onNotify(
        "Preparing post download...",
        "info"
      );

      try {
        const result =
          await downloadPost({
            postID,
            mediaItems,
            caption,
            textPostContent,
          });

        if (
          result.failedFiles > 0
        ) {
          const downloadedLabel =
            result.downloadedFiles === 1
              ? "file"
              : "files";

          const failedLabel =
            result.failedFiles === 1
              ? "file"
              : "files";

          onNotify(
            `${result.downloadedFiles} ${downloadedLabel} downloaded. ` +
              `${result.failedFiles} ${failedLabel} could not be downloaded.`,
            "info"
          );

          return;
        }

        const successMessage =
          result.downloadedFiles > 1
            ? `${result.downloadedFiles} files downloaded.`
            : "Post downloaded.";

        onNotify(
          successMessage,
          "success"
        );
      } catch {
        onNotify(
          "Unable to download post. Please try again.",
          "error"
        );
      }
    }, [
      caption,
      mediaItems,
      onCloseMenu,
      onNotify,
      postID,
      textPostContent,
    ]);

  return (
    <PostActionButton
      icon={
        <Download
          size={20}
          strokeWidth={2.3}
        />
      }
      label="Download post"
      aria-label="Download post"
      onClick={() => {
        void handleDownloadPost();
      }}
    />
  );
};

export default memo(
  DownloadPostAction
);