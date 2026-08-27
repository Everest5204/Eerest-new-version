import {
  memo,
  type MouseEvent,
} from "react";

import type {
  ProfileConnectionUser,
} from "./profileConnections.types";

type ProfileConnectionButtonProps = {
  user: ProfileConnectionUser;
  isPending: boolean;

  onToggle: (
    userID: string,
  ) => Promise<void> | void;
};

const getButtonLabel = (
  user: ProfileConnectionUser,
): string => {
  if (user.is_following) {
    return "Following";
  }

  if (user.follows_you) {
    return "Follow Back";
  }

  return "Follow";
};

const ProfileConnectionButtonComponent = ({
  user,
  isPending,
  onToggle,
}: ProfileConnectionButtonProps) => {
  if (user.is_self) {
    return null;
  }

  const buttonLabel = getButtonLabel(user);

  const fullName = [
    user.first_name,
    user.last_name,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  const actionLabel = user.is_following
    ? `Unfollow ${fullName || "this user"}`
    : `Follow ${fullName || "this user"}`;

  const buttonClasses = [
    "profile-connection-button",

    user.is_following
      ? "profile-connection-button--following"
      : "profile-connection-button--follow",

    !user.is_following && user.follows_you
      ? "profile-connection-button--follow-back"
      : "",

    isPending
      ? "profile-connection-button--pending"
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  const handleClick = (
    event: MouseEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    if (isPending) {
      return;
    }

    void onToggle(user.id);
  };

  return (
    <button
      type="button"
      className={buttonClasses}
      disabled={isPending}
      aria-label={actionLabel}
      aria-pressed={user.is_following}
      aria-busy={isPending}
      onClick={handleClick}
    >
      {isPending && (
        <span
          className="profile-connection-button__spinner"
          aria-hidden="true"
        />
      )}

      <span
        className={
          "profile-connection-button__label"
        }
      >
        {buttonLabel}
      </span>
    </button>
  );
};

export const ProfileConnectionButton = memo(
  ProfileConnectionButtonComponent,
);

ProfileConnectionButton.displayName =
  "ProfileConnectionButton";

export default ProfileConnectionButton;