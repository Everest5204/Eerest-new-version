import type {
  CSSProperties,
  MouseEventHandler,
  ReactNode,
} from "react";

import { Link } from "react-router-dom";

type ProfileLinkProps = {
  userID?: string | null;
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
  title?: string;
  style?: CSSProperties;
  stopPropagation?: boolean;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
};

const baseLinkStyle: CSSProperties = {
  color: "inherit",
  textDecoration: "none",
};

const ProfileLink = ({
  userID,
  children,
  className,
  ariaLabel,
  title,
  style,
  stopPropagation = true,
  onClick,
}: ProfileLinkProps) => {
  const cleanUserID = userID?.trim() ?? "";

  if (!cleanUserID) {
    return (
      <span
        className={className}
        style={style}
        title={title}
      >
        {children}
      </span>
    );
  }

  const handleClick: MouseEventHandler<HTMLAnchorElement> = (
    event,
  ) => {
    if (stopPropagation) {
      event.stopPropagation();
    }

    onClick?.(event);
  };

  return (
    <Link
      to={`/profile/${encodeURIComponent(cleanUserID)}`}
      className={className}
      aria-label={ariaLabel}
      title={title}
      style={{
        ...baseLinkStyle,
        ...style,
      }}
      onClick={handleClick}
    >
      {children}
    </Link>
  );
};

export default ProfileLink;