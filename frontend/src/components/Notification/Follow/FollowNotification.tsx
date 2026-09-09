import { memo, useState } from "react";
import { VerifiedName } from "../../VerifiedBadge";

import { UserCheck, UserPlus, UserRound } from "lucide-react";

import type { FollowNotificationItem } from "../Core/notification.types";

import "./FollowNotification.css";

export interface FollowNotificationProps {
  readonly notification: FollowNotificationItem;

  /** The page handles navigation and mark-read errors through the shared provider. */
  readonly onSelect: (notification: FollowNotificationItem) => void;

  /** Optional relative time from the page's shared clock; no timer runs per row. */
  readonly timeLabel?: string;
}

const dateFormatter = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
});

const FollowNotification = memo(function FollowNotification({
  notification,
  onSelect,
  timeLabel,
}: FollowNotificationProps) {
  const [failedImageURL, setFailedImageURL] = useState<string | null>(null);
  const actor = notification.actor;
  const actorName = actor
    ? [actor.first_name.trim(), actor.last_name.trim()].filter(Boolean).join(" ") || "Someone"
    : "Someone";
  const imageURL = actor?.profile_image_url?.trim() ?? "";
  const showImage = Boolean(imageURL) && imageURL !== failedImageURL;
  const isFollowBack = notification.type === "follow_back";
  const isUnread = !notification.is_read;
  const actionText = isFollowBack ? "followed you back" : "started following you";
  const FollowIcon = isFollowBack ? UserCheck : UserPlus;

  const createdAt = new Date(notification.created_at);
  const hasValidDate = Number.isFinite(createdAt.getTime());
  const fullTime = hasValidDate ? dateFormatter.format(createdAt) : "Time unavailable";
  const displayTime = timeLabel?.trim() || fullTime;

  const className = [
    "follow-notification",
    isUnread ? "follow-notification--unread" : "",
    isFollowBack ? "follow-notification--follow-back" : "",
  ].filter(Boolean).join(" ");

  return (
    <button
      className={className}
      type="button"
      aria-label={`${isUnread ? "Unread. " : ""}${actorName} ${actionText}. ${fullTime}.`}
      onClick={() => onSelect(notification)}
    >
      <span className="follow-notification__avatar" aria-hidden="true">
        {showImage ? (
          <img
            key={imageURL}
            className="follow-notification__avatar-image"
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
          <span className="follow-notification__avatar-fallback">
            <UserRound size={25} strokeWidth={1.8} />
          </span>
        )}

        <span className="follow-notification__type-icon">
          <FollowIcon size={14} strokeWidth={2.3} />
        </span>
      </span>

      <span className="follow-notification__content">
        <span className="follow-notification__message">
<bdi>
  <VerifiedName
    as="strong"
    userID={actor?.id ?? ""}
    name={actorName}
    fallback="Someone"
    badgeSize="xs"
    className="follow-notification__name"
  />
</bdi>{" "}
          {actionText}.
        </span>

        <time
          className="follow-notification__time"
          dateTime={hasValidDate ? notification.created_at : undefined}
          title={fullTime}
        >
          {displayTime}
        </time>
      </span>

      {isUnread && (
        <span className="follow-notification__unread-dot" aria-hidden="true" />
      )}
    </button>
  );
});

export default FollowNotification;
