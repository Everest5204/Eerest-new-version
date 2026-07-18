import {
  memo,
  useCallback,
} from "react";

import { Bookmark } from "lucide-react";

import PostActionButton from "../shared/PostActionButton";

import type {
  PostActionToastTone,
} from "../shared/PostActionToast";

type SavePostActionProps = {
  postID: string;

  onCloseMenu: () => void;

  onNotify: (
    message: string,
    tone?: PostActionToastTone
  ) => void;
};

const SavePostAction = ({
  postID,
  onCloseMenu,
  onNotify,
}: SavePostActionProps) => {
  const handleSavePost =
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
        <Bookmark
          size={20}
          strokeWidth={2.3}
        />
      }
      label="Save post"
      aria-label="Save post"
      onClick={handleSavePost}
    />
  );
};

export default memo(
  SavePostAction
);