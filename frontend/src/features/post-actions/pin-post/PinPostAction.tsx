import {
  memo,
  useCallback,
} from "react";

import { Pin } from "lucide-react";

import PostActionButton from "../shared/PostActionButton";

import type {
  PostActionToastTone,
} from "../shared/PostActionToast";

type PinPostActionProps = {
  postID: string;

  onCloseMenu: () => void;

  onNotify: (
    message: string,
    tone?: PostActionToastTone
  ) => void;
};

const PinPostAction = ({
  postID,
  onCloseMenu,
  onNotify,
}: PinPostActionProps) => {
  const handlePinPost =
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
        <Pin
          size={20}
          strokeWidth={2.3}
        />
      }
      label="Pin post"
      aria-label="Pin post"
      onClick={handlePinPost}
    />
  );
};

export default memo(
  PinPostAction
);