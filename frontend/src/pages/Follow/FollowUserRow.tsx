import { memo, useEffect, useMemo, useState } from "react";
import { UserRound } from "lucide-react";

import FollowButton from "../../components/Follow/FollowButton.tsx";
import { ProfileLink } from "../../profileView";

import type { FollowUser } from "./follow.types";

type FollowUserRowProps = {
  user: FollowUser;
  isPending: boolean;
  onToggleFollow: (user: FollowUser) => void;
};

const FollowUserRow = ({
  user,
  isPending,
  onToggleFollow,
}: FollowUserRowProps) => {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [user.profile_image_url]);

  const fullName = useMemo(() => {
    const name = [user.first_name, user.last_name]
      .filter(Boolean)
      .join(" ")
      .trim();

    return name || "Mongoksy user";
  }, [user.first_name, user.last_name]);

  const secondaryText =
    user.profile_title ||
    (user.follows_you ? "Follows you" : "Mongoksy member");

  return (
    <article className="followUserRow">
      <ProfileLink
        userID={user.id}
        className="followUserIdentity"
        ariaLabel={`Open ${fullName}'s profile`}
      >
        <div className="followUserAvatar" aria-hidden="true">
          <UserRound size={25} strokeWidth={1.7} />

          {user.profile_image_url && !imageFailed ? (
            <img
              src={user.profile_image_url}
              alt=""
              loading="lazy"
              decoding="async"
              onError={() => setImageFailed(true)}
            />
          ) : null}
        </div>

        <div className="followUserText">
          <strong>{fullName}</strong>
          <span>{secondaryText}</span>
        </div>
      </ProfileLink>

      {!user.is_self ? (
        <FollowButton
          isFollowing={user.is_following}
          followsYou={user.follows_you}
          isPending={isPending}
          onClick={() => onToggleFollow(user)}
        />
      ) : null}
    </article>
  );
};

export default memo(FollowUserRow);