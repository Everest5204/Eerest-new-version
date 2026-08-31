import {
  memo,
} from "react";

import "./VerifiedBadge.css";

export type VerifiedBadgeSize =
  | "xs"
  | "sm"
  | "md"
  | "lg";

type VerifiedBadgeProps = {
  size?: VerifiedBadgeSize;
  className?: string;
  label?: string;
};

const VerifiedBadgeComponent = ({
  size = "sm",
  className = "",
  label = "Verified account",
}: VerifiedBadgeProps) => {
  const rootClassName = [
    "verified-badge",
    `verified-badge--${size}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <svg
      className={rootClassName}
      viewBox="0 0 24 24"
      role="img"
      aria-label={label}
      focusable="false"
      data-verified-badge="true"
    >
      <title>{label}</title>

      <path
        className="verified-badge__seal"
        d="
          M23 12
          L20.56 9.21
          L20.9 5.52
          L17.29 4.7
          L15.4 1.5
          L12 2.96
          L8.6 1.5
          L6.71 4.69
          L3.1 5.51
          L3.44 9.2
          L1 12
          L3.44 14.79
          L3.1 18.48
          L6.71 19.3
          L8.6 22.5
          L12 21.04
          L15.4 22.5
          L17.29 19.31
          L20.9 18.49
          L20.56 14.8
          Z
        "
      />

      <path
        className="verified-badge__check"
        d="
          M10.09 16.17
          L6.5 12.58
          L7.91 11.17
          L10.09 13.34
          L16.09 7.34
          L17.5 8.76
          Z
        "
      />
    </svg>
  );
};

export const VerifiedBadge =
  memo(
    VerifiedBadgeComponent,
  );

VerifiedBadge.displayName =
  "VerifiedBadge";

export default VerifiedBadge;