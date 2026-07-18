import {
  memo,
  useCallback,
} from "react";

import { EyeOff } from "lucide-react";

import PostActionButton from "../shared/PostActionButton";

import type {
  PostActionToastTone,
} from "../shared/PostActionToast";

type HidePostActionProps = {
  postID: string;

  onCloseMenu: () => void;

  onNotify: (
    message: string,
    tone?: PostActionToastTone
  ) => void;
};

const HidePostAction = ({
  postID,
  onCloseMenu,
  onNotify,
}: HidePostActionProps) => {
  const handleHidePost =
    useCallback(() => {
      onCloseMenu();

      if (!postID.trim()) {
        onNotify(
          "Unable to identify this post.",
          "error"
        );

        return;
      }

      onNotify(
        "This feature will be available in a few days.",
        "info"
      );
    }, [
      onCloseMenu,
      onNotify,
      postID,
    ]);

  return (
    <PostActionButton
      icon={
        <EyeOff
          size={20}
          strokeWidth={2.3}
        />
      }
      label="Hide post"
      aria-label="Hide post"
      onClick={handleHidePost}
    />
  );
};

export default memo(
  HidePostAction
);