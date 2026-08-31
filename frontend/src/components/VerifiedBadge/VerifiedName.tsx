import {
  memo,
  type CSSProperties,
} from "react";

import {
  useVerifiedBadge,
} from "./useVerifiedBadge";

import VerifiedBadge, {
  type VerifiedBadgeSize,
} from "./VerifiedBadge";

import "./VerifiedBadge.css";

type VerifiedNameElement =
  | "span"
  | "strong"
  | "h1"
  | "h2"
  | "h3"
  | "p";

type VerifiedNameProps = {
  userID?: string;
  name: string;
  fallback?: string;

  as?: VerifiedNameElement;

  badgeSize?: VerifiedBadgeSize;

  className?: string;
  textClassName?: string;
  badgeClassName?: string;

  title?: string;
  ariaLabel?: string;

  style?: CSSProperties;
};

const VerifiedNameComponent = ({
  userID = "",
  name,
  fallback = "Everest User",

  as = "span",

  badgeSize = "sm",

  className = "",
  textClassName = "",
  badgeClassName = "",

  title,
  ariaLabel,

  style,
}: VerifiedNameProps) => {
  const {
    isVerified,
  } = useVerifiedBadge(
    userID,
  );

  const displayName =
    name.trim() ||
    fallback;

  const Tag = as;

  const rootClassName = [
    "verified-name",

    isVerified
      ? "verified-name--active"
      : "",

    className,
  ]
    .filter(Boolean)
    .join(" ");

  const nameTextClassName = [
    "verified-name__text",
    textClassName,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Tag
      className={rootClassName}
      style={style}
      title={title}
      aria-label={ariaLabel}
      data-user-id={
        userID || undefined
      }
      data-verified={
        isVerified
          ? "true"
          : "false"
      }
    >
      <span
        className={
          nameTextClassName
        }
      >
        {displayName}
      </span>

      {isVerified ? (
        <VerifiedBadge
          size={badgeSize}
          className={
            badgeClassName
          }
          label={`${displayName} is verified`}
        />
      ) : null}
    </Tag>
  );
};

export const VerifiedName =
  memo(
    VerifiedNameComponent,
  );

VerifiedName.displayName =
  "VerifiedName";

export default VerifiedName;