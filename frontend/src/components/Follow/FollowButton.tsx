import {
  LoaderCircle,
  UserCheck,
  UserPlus,
} from "lucide-react";

type FollowButtonProps = {
  isFollowing?: boolean;
  followsYou?: boolean;
  isPending?: boolean;
  onClick: () => void;
};

const FollowButton = ({
  isFollowing = false,
  followsYou = false,
  isPending = false,
  onClick,
}: FollowButtonProps) => {
  const label = isPending
    ? "Please wait"
    : isFollowing
      ? "Following"
      : followsYou
        ? "Follow Back"
        : "Follow";

  const buttonState = isFollowing
    ? "following"
    : followsYou
      ? "follow-back"
      : "follow";

  const className = [
    "followActionButton",
    isFollowing ? "isFollowing" : "",
    followsYou && !isFollowing ? "isFollowBack" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      aria-pressed={isFollowing}
      data-state={buttonState}
      disabled={isPending}
      onClick={onClick}
    >
      {isPending ? (
        <LoaderCircle
          className="followActionSpinner"
          size={18}
          aria-hidden="true"
        />
      ) : isFollowing ? (
        <UserCheck size={18} aria-hidden="true" />
      ) : (
        <UserPlus size={18} aria-hidden="true" />
      )}

      <span>{label}</span>
    </button>
  );
};

export default FollowButton;