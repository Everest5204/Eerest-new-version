import {
  memo,
  useEffect,
} from "react";

import {
  CircleAlert,
  CircleCheck,
  Info,
  X,
} from "lucide-react";

import { createPortal } from "react-dom";

import "./PostActionToast.css";

export type PostActionToastTone =
  | "info"
  | "success"
  | "error";

type PostActionToastProps = {
  open: boolean;
  message: string;

  tone?: PostActionToastTone;
  duration?: number;

  onClose: () => void;
};

const DEFAULT_DURATION = 2800;

const PostActionToast = ({
  open,
  message,
  tone = "info",
  duration = DEFAULT_DURATION,
  onClose,
}: PostActionToastProps) => {
  const cleanMessage = message.trim();

  const safeDuration =
    Number.isFinite(duration) && duration >= 1000
      ? duration
      : DEFAULT_DURATION;

  useEffect(() => {
    if (!open || !cleanMessage) {
      return;
    }

    const timeoutID = window.setTimeout(
      onClose,
      safeDuration
    );

    return () => {
      window.clearTimeout(timeoutID);
    };
  }, [
    cleanMessage,
    onClose,
    open,
    safeDuration,
  ]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (
      event: KeyboardEvent
    ) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };
  }, [
    onClose,
    open,
  ]);

  if (
    !open ||
    !cleanMessage ||
    typeof document === "undefined"
  ) {
    return null;
  }

  const icon =
    tone === "success" ? (
      <CircleCheck
        size={21}
        strokeWidth={2.2}
        aria-hidden="true"
      />
    ) : tone === "error" ? (
      <CircleAlert
        size={21}
        strokeWidth={2.2}
        aria-hidden="true"
      />
    ) : (
      <Info
        size={21}
        strokeWidth={2.2}
        aria-hidden="true"
      />
    );

  return createPortal(
    <div className="postActionToastViewport">
      <div
        className={`postActionToast postActionToast--${tone}`}
        role={
          tone === "error"
            ? "alert"
            : "status"
        }
        aria-live={
          tone === "error"
            ? "assertive"
            : "polite"
        }
        aria-atomic="true"
      >
        <span className="postActionToastIcon">
          {icon}
        </span>

        <p className="postActionToastMessage">
          {cleanMessage}
        </p>

        <button
          type="button"
          className="postActionToastClose"
          onClick={onClose}
          aria-label="Close message"
        >
          <X
            size={19}
            strokeWidth={2.2}
            aria-hidden="true"
          />
        </button>
      </div>
    </div>,
    document.body
  );
};

export default memo(PostActionToast);