import {
  useCallback,
  useEffect,
  useId,
  useRef,
} from "react";
import { createPortal } from "react-dom";
import {
  CircleCheck,
  LoaderCircle,
  Trash2,
} from "lucide-react";

import { useBackDismiss } from "../../hooks/useBackDismiss";
import { useDeleteAccount } from "./useDeleteAccount";

type DeleteAccountDialogProps = {
  currentPassword: string;
  onClose: () => void;
};

export function DeleteAccountDialog({
  currentPassword,
  onClose,
}: DeleteAccountDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const discardButtonRef = useRef<HTMLButtonElement | null>(null);
  const continueButtonRef = useRef<HTMLButtonElement | null>(null);

  const titleId = useId();
  const descriptionId = useId();

  const {
    status,
    error,
    submitDeletion,
    finishDeletion,
  } = useDeleteAccount();

  const isSubmitting = status === "submitting";
  const isProcessing = status === "processing";

  // This status must come from confirmed backend completion.
  // A 202 Accepted response alone must never set it.
  const isDeleted = status === "deleted";

  const isBusy = isSubmitting || isProcessing;

  const handleDismiss = useCallback(() => {
    if (isDeleted) {
      finishDeletion();
      return;
    }

    onClose();
  }, [isDeleted, finishDeletion, onClose]);

  const { dismiss } = useBackDismiss({
    isOpen: true,
    onDismiss: handleDismiss,
    stateKey: "delete-account-confirmation",
  });

  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) {
      return;
    }

    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    if (!dialog.open) {
      dialog.showModal();
    }

    discardButtonRef.current?.focus({
      preventScroll: true,
    });

    return () => {
      if (dialog.open) {
        dialog.close();
      }

      document.body.style.overflow = previousOverflow;

      if (
        previouslyFocused instanceof HTMLElement &&
        previouslyFocused.isConnected
      ) {
        previouslyFocused.focus({
          preventScroll: true,
        });
      }
    };
  }, []);

  useEffect(() => {
    if (isDeleted) {
      continueButtonRef.current?.focus({
        preventScroll: true,
      });
    }
  }, [isDeleted]);

  return createPortal(
    <dialog
      ref={dialogRef}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault();
        dismiss();
      }}
      className="tw:fixed tw:inset-0 tw:m-auto tw:max-h-[calc(100dvh_-_2rem)] tw:w-[calc(100%_-_2rem)] tw:max-w-sm tw:overflow-y-auto tw:overscroll-contain tw:rounded-3xl tw:border-0 tw:bg-white tw:p-6 tw:font-sans tw:text-slate-900 tw:shadow-2xl tw:backdrop:bg-black/45"
    >
      <div
        className={`tw:mx-auto tw:mb-4 tw:flex tw:size-16 tw:items-center tw:justify-center tw:rounded-full ${
          isDeleted
            ? "tw:bg-emerald-50 tw:text-emerald-600"
            : isBusy
              ? "tw:bg-slate-50 tw:text-slate-500"
              : "tw:bg-red-50 tw:text-red-600"
        }`}
      >
        {isDeleted ? (
          <CircleCheck
            size={34}
            strokeWidth={1.8}
            aria-hidden="true"
          />
        ) : isBusy ? (
          <LoaderCircle
            size={32}
            strokeWidth={1.8}
            className="tw:animate-spin tw:motion-reduce:animate-none"
            aria-hidden="true"
          />
        ) : (
          <Trash2
            size={30}
            strokeWidth={1.8}
            aria-hidden="true"
          />
        )}
      </div>

      <div aria-live="polite" aria-atomic="true">
        <h2
          id={titleId}
          className="tw:m-0 tw:text-center tw:text-xl tw:font-semibold tw:leading-7 tw:tracking-tight"
        >
          {isDeleted
            ? "Account deleted"
            : isProcessing
              ? "Deleting your account"
              : isSubmitting
                ? "Submitting your request"
                : "Delete your account?"}
        </h2>

        <div
          id={descriptionId}
          className="tw:mt-3 tw:space-y-3 tw:text-center"
        >
          {isDeleted ? (
            <p className="tw:m-0 tw:text-[15px] tw:leading-6 tw:text-slate-700">
              Your account has been permanently deleted.
            </p>
          ) : isProcessing ? (
            <>
              <p className="tw:m-0 tw:text-sm tw:leading-6 tw:text-slate-600">
                Your request has been accepted. We are removing
                your account and its associated data.
              </p>

              <p className="tw:m-0 tw:text-sm tw:leading-6 tw:text-slate-600">
                This message will update when cleanup finishes.
                Closing it will not cancel an accepted deletion
                request.
              </p>
            </>
          ) : isSubmitting ? (
            <p className="tw:m-0 tw:text-sm tw:leading-6 tw:text-slate-600">
              Checking your password and submitting your deletion
              request. Please wait.
            </p>
          ) : (
            <>
              <p className="tw:m-0 tw:text-[15px] tw:leading-6 tw:text-slate-700">
                Are you sure you want to permanently delete your
                Mongosky account?
              </p>

              <p className="tw:m-0 tw:text-sm tw:leading-6 tw:text-slate-600">
                Your password will be verified before deletion
                starts. Your account and its associated data will
                be removed from our active systems.
              </p>

              <p className="tw:m-0 tw:text-sm tw:leading-6 tw:text-slate-600">
                Deleted accounts have no restore option in
                Mongosky. Deletion may take time to complete.
              </p>
            </>
          )}
        </div>
      </div>

      {error && !isDeleted && (
        <p
          role="alert"
          className="tw:m-0 tw:mt-4 tw:rounded-xl tw:border tw:border-solid tw:border-red-100 tw:bg-red-50 tw:px-3 tw:py-3 tw:text-sm tw:leading-6 tw:text-red-800"
        >
          {error}
        </p>
      )}

      {isDeleted ? (
        <button
          ref={continueButtonRef}
          type="button"
          onClick={finishDeletion}
          className="tw:mt-6 tw:flex tw:min-h-12 tw:w-full tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-xl tw:border-0 tw:bg-emerald-600 tw:px-4 tw:py-3 tw:font-sans tw:text-sm tw:font-semibold tw:text-white tw:transition-colors tw:touch-manipulation tw:hover:bg-emerald-700 tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:focus-visible:outline-emerald-600"
        >
          Continue
        </button>
      ) : (
        <div className="tw:mt-6 tw:grid tw:grid-cols-2 tw:gap-3">
          <button
            ref={discardButtonRef}
            type="button"
            onClick={dismiss}
            className="tw:flex tw:min-h-12 tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-xl tw:border-0 tw:bg-slate-100 tw:px-3 tw:py-3 tw:font-sans tw:text-sm tw:font-semibold tw:text-slate-700 tw:transition-colors tw:touch-manipulation tw:hover:bg-slate-200 tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:focus-visible:outline-slate-600"
          >
            {isBusy ? "Close" : "Discard"}
          </button>

          <button
            type="button"
            disabled={isBusy}
            aria-busy={isBusy}
            onClick={() => {
              if (!isBusy) {
                void submitDeletion(currentPassword);
              }
            }}
            className="tw:flex tw:min-h-12 tw:cursor-pointer tw:items-center tw:justify-center tw:gap-2 tw:rounded-xl tw:border-0 tw:bg-red-600 tw:px-3 tw:py-3 tw:font-sans tw:text-sm tw:font-semibold tw:text-white tw:transition-colors tw:touch-manipulation tw:hover:bg-red-700 tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:focus-visible:outline-red-600 tw:disabled:cursor-wait tw:disabled:opacity-60"
          >
            {isBusy && (
              <LoaderCircle
                size={16}
                className="tw:shrink-0 tw:animate-spin tw:motion-reduce:animate-none"
                aria-hidden="true"
              />
            )}

            {isProcessing
              ? "Deleting…"
              : isSubmitting
                ? "Submitting…"
                : "Delete"}
          </button>
        </div>
      )}
    </dialog>,
    document.body,
  );
}