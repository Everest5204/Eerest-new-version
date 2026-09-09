import { memo, useState } from "react";

import { VerifiedName } from "../../VerifiedBadge";

import { Heart, MessageCircle, Reply, UserRound } from "lucide-react";

import type { CommentNotificationItem } from "../Core/notification.types";

import "./CommentNotification.css";

export interface CommentNotificationProps {
  readonly notification: CommentNotificationItem;

  /** The page handles navigation and mark-read errors through the shared provider. */
  readonly onSelect: (notification: CommentNotificationItem) => void;

  /** Optional relative time from the page's shared clock; no timer runs per row. */
  readonly timeLabel?: string;
}

const dateFormatter = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
});

const CommentNotification = memo(function CommentNotification({
  notification,
  onSelect,
  timeLabel,
}: CommentNotificationProps) {
  const [failedImageURL, setFailedImageURL] = useState<string | null>(null);
  const actor = notification.actor;
  const actorName = actor
    ? [actor.first_name.trim(), actor.last_name.trim()].filter(Boolean).join(" ") || "Someone"
    : "Someone";
  const imageURL = actor?.profile_image_url?.trim() ?? "";
  const showImage = Boolean(imageURL) && imageURL !== failedImageURL;
const isReply = notification.type === "comment_reply";
const isLove = notification.type === "comment_love";
const isUnread = !notification.is_read;

const actionText = isLove
  ? notification.parent_id
    ? "loved your reply"
    : "loved your comment"
  : isReply
    ? "replied to your comment"
    : "commented on your post";

const CommentIcon = isLove
  ? Heart
  : isReply
    ? Reply
    : MessageCircle;

  const createdAt = new Date(notification.created_at);
  const hasValidDate = Number.isFinite(createdAt.getTime());
  const fullTime = hasValidDate ? dateFormatter.format(createdAt) : "Time unavailable";
  const displayTime = timeLabel?.trim() || fullTime;

  const className = [
    "comment-notification",
    isUnread ? "comment-notification--unread" : "",
    isReply ? "comment-notification--reply" : "",
  ].filter(Boolean).join(" ");

  return (
    <button
      className={className}
      type="button"
      aria-label={`${isUnread ? "Unread. " : ""}${actorName} ${actionText}. ${fullTime}.`}
      onClick={() => onSelect(notification)}
    >
      <span className="comment-notification__avatar" aria-hidden="true">
        {showImage ? (
          <img
            key={imageURL}
            className="comment-notification__avatar-image"
            src={imageURL}
            alt=""
            width={48}
            height={48}
            loading="lazy"
            decoding="async"
            draggable={false}
            onError={() => setFailedImageURL(imageURL)}
          />
        ) : (
          <span className="comment-notification__avatar-fallback">
            <UserRound size={25} strokeWidth={1.8} />
          </span>
        )}

        <span className="comment-notification__type-icon">
          <CommentIcon
  size={14}
  strokeWidth={2.3}
  color={isLove ? "#e11d48" : "currentColor"}
  fill={isLove ? "currentColor" : "none"}
/>
        </span>
      </span>

      <span className="comment-notification__content">
        <span className="comment-notification__message">
<bdi>
  <VerifiedName
    as="strong"
    userID={actor?.id ?? ""}
    name={actorName}
    fallback="Someone"
    badgeSize="xs"
    className="comment-notification__name"
  />
</bdi>{" "}
          {actionText}.
        </span>

        <time
          className="comment-notification__time"
          dateTime={hasValidDate ? notification.created_at : undefined}
          title={fullTime}
        >
          {displayTime}
        </time>
      </span>

      {isUnread && (
        <span className="comment-notification__unread-dot" aria-hidden="true" />
      )}
    </button>
  );
});

export default CommentNotification;