import {
  forwardRef,
  memo,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";

export type PostActionButtonProps =
  Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    "children"
  > & {
    icon: ReactNode;
    label: string;
    danger?: boolean;
  };

const PostActionButton = forwardRef<
  HTMLButtonElement,
  PostActionButtonProps
>(
  (
    {
      icon,
      label,
      danger = false,
      className = "",
      disabled,
      type = "button",
      role = "menuitem",
      ...buttonProps
    },
    ref
  ) => {
    const buttonClassName = [
      "postOptionsMenuItem",
      danger ? "danger" : "",
      className,
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <button
        ref={ref}
        type={type}
        role={role}
        className={buttonClassName}
        disabled={disabled}
        aria-disabled={
          disabled ? true : undefined
        }
        {...buttonProps}
      >
        <span
          className="postOptionsMenuIcon"
          aria-hidden="true"
        >
          {icon}
        </span>

        <span>{label}</span>
      </button>
    );
  }
);

PostActionButton.displayName =
  "PostActionButton";

export default memo(PostActionButton);