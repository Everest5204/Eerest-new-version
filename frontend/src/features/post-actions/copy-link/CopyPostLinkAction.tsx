import {
  memo,
  useCallback,
} from "react";

import { Link } from "lucide-react";

import PostActionButton from "../shared/PostActionButton";

import type {
  PostActionToastTone,
} from "../shared/PostActionToast";

import {
  copyPostLink,
} from "./copyPostLink";

type CopyPostLinkActionProps = {
  postID: string;

  onCloseMenu: () => void;

  onNotify: (
    message: string,
    tone?: PostActionToastTone
  ) => void;
};

const CopyPostLinkAction = ({
  postID,
  onCloseMenu,
  onNotify,
}: CopyPostLinkActionProps) => {
  const handleCopyLink =
    useCallback(async () => {
      onCloseMenu();

      try {
        await copyPostLink(postID);

        onNotify(
          "Post link copied.",
          "success"
        );
      } catch {
        onNotify(
          "Unable to copy post link. Please try again.",
          "error"
        );
      }
    }, [
      onCloseMenu,
      onNotify,
      postID,
    ]);

  return (
    <PostActionButton
      icon={
        <Link
          size={20}
          strokeWidth={2.3}
        />
      }
      label="Copy link"
      aria-label="Copy post link"
      onClick={() => {
        void handleCopyLink();
      }}
    />
  );
};

export default memo(
  CopyPostLinkAction
);