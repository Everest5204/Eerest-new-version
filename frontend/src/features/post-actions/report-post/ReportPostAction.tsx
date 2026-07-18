import {
  memo,
  useCallback,
} from "react";

import {
  Flag,
} from "lucide-react";

import PostActionButton from "../shared/PostActionButton";

import type {
  PostActionToastTone,
} from "../shared/PostActionToast";

type ReportPostActionProps = {
  postID: string;
  onCloseMenu: () => void;

  onNotify: (
    message: string,
    tone?: PostActionToastTone
  ) => void;
};

const COMING_SOON_MESSAGE =
  "This feature will be available in a few days.";

const ReportPostAction = ({
  postID,
  onCloseMenu,
  onNotify,
}: ReportPostActionProps) => {
  const handleReport =
    useCallback(() => {
      onCloseMenu();

      if (!postID.trim()) {
        onNotify(
          "Post is unavailable.",
          "error"
        );

        return;
      }

      onNotify(
        COMING_SOON_MESSAGE,
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
        <Flag
          size={20}
          strokeWidth={2.3}
        />
      }
      label="Report"
      onClick={handleReport}
    />
  );
};

export default memo(
  ReportPostAction
);