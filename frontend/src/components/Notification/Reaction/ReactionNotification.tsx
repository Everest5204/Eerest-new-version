import { memo, useState } from "react";
import { VerifiedName } from "../../VerifiedBadge";

import { Bell, UserRound } from "lucide-react";

import {
  REACTION_META,
  type ReactionType,
} from "../../../services/reactionService";

import type { ReactionNotificationItem } from "../Core/notification.types";

import "./ReactionNotification.css";

export interface ReactionNotificationProps {
  readonly notification: ReactionNotificationItem;

  /** The page handles navigation and mark-read errors through the shared provider. */
  readonly onSelect: (notification: ReactionNotificationItem) => void;

  /** Optional relative time from the page's shared clock; no timer runs per row. */
  readonly timeLabel?: string;
}

const dateFormatter = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
});

const isKnownReactionType = (value: string): value is ReactionType =>
  Object.hasOwn(REACTION_META, value);

const ReactionNotification = memo(function ReactionNotification({
  notification,
  onSelect,
  timeLabel,
}: ReactionNotificationProps) {
  const [failedImageURL, setFailedImageURL] = useState<string | null>(null);
  const actor = notification.actor;
  const actorName = actor
    ? [actor.first_name.trim(), actor.last_name.trim()].filter(Boolean).join(" ") || "Someone"
    : "Someone";
  const imageURL = actor?.profile_image_url?.trim() ?? "";
  const showImage = Boolean(imageURL) && imageURL !== failedImageURL;
  const isUnread = !notification.is_read;

  const reactionType = notification.reaction_type;
  const reactionMeta = isKnownReactionType(reactionType)
    ? REACTION_META[reactionType]
    : null;
  const isLove = reactionType === "love";
  const actionText = isLove ? "loved your post" : "reacted to your post";
  const accessibleAction = !isLove && reactionMeta
    ? `${actionText} with ${reactionMeta.label}`
    : actionText;

  const createdAt = new Date(notification.created_at);
  const hasValidDate = Number.isFinite(createdAt.getTime());
  const fullTime = hasValidDate ? dateFormatter.format(createdAt) : "Time unavailable";
  const displayTime = timeLabel?.trim() || fullTime;

  const className = [
    "reaction-notification",
    isUnread ? "reaction-notification--unread" : "",
  ].filter(Boolean).join(" ");

  return (
    <button
      className={className}
      type="button"
      aria-label={`${isUnread ? "Unread. " : ""}${actorName} ${accessibleAction}. ${fullTime}.`}
      onClick={() => onSelect(notification)}
    >
      <span className="reaction-notification__avatar" aria-hidden="true">
        {showImage ? (
          <img
            key={imageURL}
            className="reaction-notification__avatar-image"
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
          <span className="reaction-notification__avatar-fallback">
            <UserRound size={25} strokeWidth={1.8} />
          </span>
        )}

        <span className="reaction-notification__type-icon">
          {reactionMeta ? (
            <span className="reaction-notification__emoji">
              {reactionMeta.emoji}
            </span>
          ) : (
            <Bell size={14} strokeWidth={2} />
          )}
        </span>
      </span>

      <span className="reaction-notification__content">
        <span className="reaction-notification__message">
          <bdi>
  <VerifiedName
    as="strong"
    userID={actor?.id ?? ""}
    name={actorName}
    fallback="Someone"
    badgeSize="xs"
    className="reaction-notification__name"
  />
</bdi>{" "}
          {actionText}.
        </span>

        <time
          className="reaction-notification__time"
          dateTime={hasValidDate ? notification.created_at : undefined}
          title={fullTime}
        >
          {displayTime}
        </time>
      </span>

      {isUnread && (
        <span className="reaction-notification__unread-dot" aria-hidden="true" />
      )}
    </button>
  );
});

export default ReactionNotification;
