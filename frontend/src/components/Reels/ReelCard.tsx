import { memo, useCallback, useEffect, useState } from "react";

import type { MouseEvent } from "react";

import { User } from "lucide-react";

import useReelLove from "../../hooks/useReelLove";

import type { ReelLoveState } from "../../hooks/useReelLove";

import { getPrimaryReelMedia } from "../../services/reelsService";

import type { Reel } from "../../services/reelsService";

import ReelActions from "./ReelActions";
import ReelHeartAnimation from "./ReelHeartAnimation";
import ReelPlayer from "./ReelPlayer";
import { VerifiedName } from "../VerifiedBadge";

import "./ReelCard.css";

type AsyncReelHandler = (reel: Reel) => void | Promise<void>;

type ProfileHandler = (userID: string) => void | Promise<void>;

type UnknownRecord = Record<string, unknown>;

export type ReelCardProps = {
  reel: Reel;
  isActive: boolean;
  muted: boolean;

  shouldPreload?: boolean;
  className?: string;

  onMutedChange: (muted: boolean) => void;
  onComment: AsyncReelHandler;
  onShare: AsyncReelHandler;

  onProfile?: ProfileHandler;
  onReelChange?: (reel: Reel) => void;
};

const toRecord = (value: unknown): UnknownRecord => {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as UnknownRecord;
  }

  return {};
};

const getStringValue = (
  record: UnknownRecord,
  keys: readonly string[],
): string => {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
};

const getNumberValue = (
  record: UnknownRecord,
  keys: readonly string[],
): number => {
  for (const key of keys) {
    const numberValue = Number(record[key]);

    if (Number.isFinite(numberValue)) {
      return Math.max(0, Math.floor(numberValue));
    }
  }

  return 0;
};

const runProfileHandler = (handler: ProfileHandler, userID: string): void => {
  void Promise.resolve(handler(userID)).catch(() => undefined);
};

const ReelCard = memo(
  ({
    reel,
    isActive,
    muted,
    shouldPreload = false,
    className = "",
    onMutedChange,
    onComment,
    onShare,
    onProfile,
    onReelChange,
  }: ReelCardProps) => {
    const [captionExpanded, setCaptionExpanded] = useState(false);

    const [avatarFailed, setAvatarFailed] = useState(false);

    const reelRecord = toRecord(reel);
    const userRecord = toRecord(reelRecord.user);

    const media = getPrimaryReelMedia(reel);

    const firstName = getStringValue(userRecord, ["first_name", "firstName"]);

    const lastName = getStringValue(userRecord, ["last_name", "lastName"]);

    const combinedName = [firstName, lastName].filter(Boolean).join(" ");

    const username = getStringValue(userRecord, [
      "username",
      "user_name",
    ]).replace(/^@+/, "");

    const displayName =
      getStringValue(userRecord, [
        "display_name",
        "displayName",
        "full_name",
        "fullName",
        "name",
      ]) ||
      combinedName ||
      username ||
      "Everest User";

    const userID =
      getStringValue(userRecord, ["id", "_id", "user_id", "userId"]) ||
      getStringValue(reelRecord, ["user_id", "userId"]);

    const avatarUrl = getStringValue(userRecord, [
      "profile_image_url",
      "profileImageURL",
      "profileImageUrl",
      "profile_picture",
      "profile_image",
      "profile_photo",
      "avatar_url",
      "avatar",
      "photo_url",
      "image",
    ]);

    const caption = getStringValue(reelRecord, [
      "caption",
      "text_content",
      "content",
      "text",
    ]);

    const commentsCount = getNumberValue(reelRecord, [
      "comments_count",
      "comment_count",
    ]);

    const captionNeedsExpansion = caption.length > 120;

    useEffect(() => {
      setCaptionExpanded(false);
      setAvatarFailed(false);
    }, [reel.id, avatarUrl]);

    const handleLoveStateChange = useCallback(
      (loveState: ReelLoveState) => {
        if (!onReelChange) {
          return;
        }

        const nextReel = {
          ...reel,
          is_loved_by_me: loveState.isLoved,
          likes_count: loveState.likesCount,
          current_user_reaction: loveState.currentUserReaction,
        } as Reel;

        onReelChange(nextReel);
      },
      [onReelChange, reel],
    );

    const {
      isLoved,
      likesCount,
      saving: lovePending,
      error: loveError,
      heartAnimationKey,
      toggleLove,
      loveFromDoubleTap,
      clearError: clearLoveError,
    } = useReelLove({
      reel,
      onChange: handleLoveStateChange,
    });

    const handleComment = useCallback(() => {
      return onComment(reel);
    }, [onComment, reel]);

    const handleShare = useCallback(() => {
      return onShare(reel);
    }, [onShare, reel]);

    const handleProfileClick = useCallback(() => {
      if (!onProfile || !userID) {
        return;
      }

      runProfileHandler(onProfile, userID);
    }, [onProfile, userID]);

    const toggleCaption = useCallback(
      (event: MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();

        setCaptionExpanded((currentValue) => !currentValue);
      },
      [],
    );

    const rootClassName = [
      "reel-card",
      isActive ? "reel-card--active" : "reel-card--inactive",
      className,
    ]
      .filter(Boolean)
      .join(" ");

    const profileContent = (
      <>
        {avatarUrl && !avatarFailed ? (
          <img
            className="reel-card__avatar"
            src={avatarUrl}
            alt=""
            loading={isActive ? "eager" : "lazy"}
            decoding="async"
            draggable={false}
            onError={() => setAvatarFailed(true)}
          />
        ) : (
          <span
            className="reel-card__avatar reel-card__avatar--fallback"
            aria-hidden="true"
          >
            <User
              size={22}
               strokeWidth={3.5}
            />
          </span>
        )}

        <span className="reel-card__identity">
          <strong className="reel-card__display-name">
           <VerifiedName
           userID={userID}
           name={displayName}
           badgeSize="sm"
         />
    </strong>

          {username && <span className="reel-card__username">@{username}</span>}
        </span>
      </>
    );

    return (
      <article
        className={rootClassName}
        data-reel-card="true"
        data-reel-id={reel.id}
        aria-label={`Reel by ${displayName}`}
      >
        {media ? (
          <ReelPlayer
            src={media.url}
            posterUrl={media.poster_url || undefined}
            isActive={isActive}
            muted={muted}
            shouldPreload={shouldPreload}
            onMutedChange={onMutedChange}
            onDoubleTap={loveFromDoubleTap}
          />
        ) : (
          <div className="reel-card__unavailable" role="status">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M3 3 21 21M10.6 6H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12M15 6h3a2 2 0 0 1 2 2v8c0 .4-.1.8-.3 1.1M9 10l6 4"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>

            <p>Video unavailable</p>
          </div>
        )}

        <div className="reel-card__gradient" aria-hidden="true" />

        <ReelHeartAnimation animationKey={heartAnimationKey} />

        {media && (
          <ReelActions
            isLoved={isLoved}
            likesCount={likesCount}
            commentsCount={commentsCount}
            lovePending={lovePending}
            onLove={toggleLove}
            onComment={handleComment}
            onShare={handleShare}
          />
        )}

        <div className="reel-card__details">
          {onProfile && userID ? (
            <button
              type="button"
              className="reel-card__profile reel-card__profile--button"
              data-reel-control="true"
              aria-label={`Open ${displayName}'s profile`}
              onClick={handleProfileClick}
            >
              {profileContent}
            </button>
          ) : (
            <div className="reel-card__profile">{profileContent}</div>
          )}

          {caption && (
            <div className="reel-card__caption-wrapper">
              <p
                className={[
                  "reel-card__caption",
                  captionExpanded ? "reel-card__caption--expanded" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {caption}
              </p>

              {captionNeedsExpansion && (
                <button
                  type="button"
                  className="reel-card__caption-toggle"
                  data-reel-control="true"
                  aria-expanded={captionExpanded}
                  onClick={toggleCaption}
                >
                  {captionExpanded ? "less" : "more"}
                </button>
              )}
            </div>
          )}
        </div>

        {loveError && isActive && (
          <button
            type="button"
            className="reel-card__error-toast"
            data-reel-control="true"
            role="alert"
            onClick={clearLoveError}
          >
            <span>{loveError}</span>
            <span aria-hidden="true">×</span>
          </button>
        )}
      </article>
    );
  },
);

ReelCard.displayName = "ReelCard";

export default ReelCard;