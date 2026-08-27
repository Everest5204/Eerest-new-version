import {
  memo,
  useEffect,
  useState,
} from "react";

import ProfileConnectionButton from "./ProfileConnectionButton";

import type {
  ProfileConnectionUser,
} from "./profileConnections.types";

type ProfileConnectionRowProps = {
  user: ProfileConnectionUser;
  isActionPending: boolean;

  onOpenProfile: (
    userID: string,
  ) => void;

  onToggleConnection: (
    userID: string,
  ) => Promise<void> | void;
};

const getFullName = (
  user: ProfileConnectionUser,
): string => {
  const fullName = [
    user.first_name,
    user.last_name,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  return fullName || "Everest User";
};

const getInitials = (
  user: ProfileConnectionUser,
): string => {
  const firstInitial =
    user.first_name.trim().charAt(0);

  const lastInitial =
    user.last_name.trim().charAt(0);

  const initials =
    `${firstInitial}${lastInitial}`
      .trim()
      .toUpperCase();

  return initials || "U";
};

const ProfileConnectionRowComponent = ({
  user,
  isActionPending,
  onOpenProfile,
  onToggleConnection,
}: ProfileConnectionRowProps) => {
  const [imageFailed, setImageFailed] =
    useState(false);

  const fullName = getFullName(user);
  const initials = getInitials(user);

  const profileImageURL =
    user.profile_image_url?.trim() ?? "";

  const profileTitle =
    user.profile_title?.trim() ?? "";

  const showProfileImage =
    Boolean(profileImageURL) && !imageFailed;

  useEffect(() => {
    setImageFailed(false);
  }, [profileImageURL]);

  const handleOpenProfile = () => {
    onOpenProfile(user.id);
  };

  return (
    <article className="profile-connection-row">
      <button
        type="button"
        className="profile-connection-row__identity"
        aria-label={`Open ${fullName}'s profile`}
        onClick={handleOpenProfile}
      >
        <span
          className="profile-connection-row__avatar"
          aria-hidden="true"
        >
          {showProfileImage ? (
            <img
              className={
                "profile-connection-row__avatar-image"
              }
              src={profileImageURL}
              alt=""
              loading="lazy"
              decoding="async"
              onError={() =>
                setImageFailed(true)
              }
            />
          ) : (
            <span
              className={
                "profile-connection-row__avatar-fallback"
              }
            >
              {initials}
            </span>
          )}
        </span>

        <span className="profile-connection-row__details">
          <span className="profile-connection-row__name-line">
            <span className="profile-connection-row__name">
              {fullName}
            </span>

            {user.is_self && (
              <span className="profile-connection-row__self-badge">
                You
              </span>
            )}
          </span>

          {profileTitle && (
            <span className="profile-connection-row__title">
              {profileTitle}
            </span>
          )}

          {!user.is_self &&
            user.follows_you && (
              <span className="profile-connection-row__relationship">
                Follows you
              </span>
            )}
        </span>
      </button>

      <div className="profile-connection-row__action">
        <ProfileConnectionButton
          user={user}
          isPending={isActionPending}
          onToggle={onToggleConnection}
        />
      </div>
    </article>
  );
};

export const ProfileConnectionRow = memo(
  ProfileConnectionRowComponent,
);

ProfileConnectionRow.displayName =
  "ProfileConnectionRow";

export default ProfileConnectionRow;