import {
  useCallback,
  useEffect,
  useRef,
  type MouseEvent,
} from "react";
import { createPortal } from "react-dom";

import "./DeletePostModal.css";

type DeletePostModalProps = {
  open: boolean;
  isDeleting: boolean;
  deleteError: string;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
};

const DeletePostModal = ({
  open,
  isDeleting,
  deleteError,
  onCancel,
  onConfirm,
}: DeletePostModalProps) => {
  const dialogRef =
    useRef<HTMLDivElement | null>(null);

  const cancelButtonRef =
    useRef<HTMLButtonElement | null>(null);

  const onCancelRef = useRef(onCancel);
  const isDeletingRef = useRef(isDeleting);
  const historyActiveRef = useRef(false);

  useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);

  useEffect(() => {
    isDeletingRef.current = isDeleting;
  }, [isDeleting]);

  const closeDeleteModal = useCallback(() => {
    if (isDeletingRef.current) return;

    if (historyActiveRef.current) {
      historyActiveRef.current = false;
      window.history.back();
    }

    onCancelRef.current();
  }, []);

  useEffect(() => {
    if (!open) return;

    const currentState =
      window.history.state &&
      typeof window.history.state === "object"
        ? window.history.state
        : {};

    window.history.pushState(
      {
        ...currentState,
        everestDeletePostModal: true,
      },
      "",
      window.location.href
    );

    historyActiveRef.current = true;

    const handleMobileBack = () => {
      if (!historyActiveRef.current) return;

      historyActiveRef.current = false;

      if (isDeletingRef.current) {
        window.history.pushState(
          {
            everestDeletePostModal: true,
          },
          "",
          window.location.href
        );

        historyActiveRef.current = true;
        return;
      }

      onCancelRef.current();
    };

    window.addEventListener(
      "popstate",
      handleMobileBack
    );

    return () => {
      window.removeEventListener(
        "popstate",
        handleMobileBack
      );

      if (historyActiveRef.current) {
        historyActiveRef.current = false;
        window.history.back();
      }
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow = "hidden";

    const animationFrame =
      window.requestAnimationFrame(() => {
        cancelButtonRef.current?.focus();
      });

    return () => {
      window.cancelAnimationFrame(
        animationFrame
      );

      document.body.style.overflow =
        previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (
      event: KeyboardEvent
    ) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDeleteModal();
      }

      if (
        event.key === "Tab" &&
        dialogRef.current
      ) {
        const buttons = Array.from(
          dialogRef.current.querySelectorAll<
            HTMLButtonElement
          >("button:not([disabled])")
        );

        if (buttons.length === 0) return;

        const firstButton = buttons[0];
        const lastButton =
          buttons[buttons.length - 1];

        if (
          event.shiftKey &&
          document.activeElement === firstButton
        ) {
          event.preventDefault();
          lastButton.focus();
        } else if (
          !event.shiftKey &&
          document.activeElement === lastButton
        ) {
          event.preventDefault();
          firstButton.focus();
        }
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
  }, [closeDeleteModal, open]);

  const handleBackdropClick = (
    event: MouseEvent<HTMLDivElement>
  ) => {
    if (event.target === event.currentTarget) {
      closeDeleteModal();
    }
  };

  if (!open) return null;

  return createPortal(
    <div
      className="deletePostBackdrop"
      onMouseDown={handleBackdropClick}
    >
      <div
        ref={dialogRef}
        className="deletePostModal"
        role="alertdialog"
        aria-modal="true"
        aria-describedby="deletePostMessage"
        aria-busy={isDeleting}
        tabIndex={-1}
        onMouseDown={(event) =>
          event.stopPropagation()
        }
      >
        <p
          id="deletePostMessage"
          className="deletePostModalMessage"
        >
          Are you sure you want to delete this post?
        </p>

        {deleteError ? (
          <span
            className="deletePostSrOnly"
            role="alert"
          >
            {deleteError}
          </span>
        ) : null}

        <div className="deletePostActions">
          <button
            ref={cancelButtonRef}
            type="button"
            className="deletePostCancelButton"
            onClick={closeDeleteModal}
            disabled={isDeleting}
          >
            Cancel
          </button>

          <button
            type="button"
            className="deletePostConfirmButton"
            onClick={() => {
              if (!isDeleting) {
                void onConfirm();
              }
            }}
            disabled={isDeleting}
          >
            Delete
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default DeletePostModal;