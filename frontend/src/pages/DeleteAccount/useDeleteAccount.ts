import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";

import {
  DeleteAccountError,
  getAccountDeletionStatus,
  requestAccountDeletion,
} from "./deleteAccountService";

type DeletionStatus =
  | "idle"
  | "submitting"
  | "processing"
  | "deleted";

const POLL_INTERVAL_MS = 2000;
const POLL_RETRY_INTERVAL_MS = 10000;

// A later login must not be affected by an older deletion request.
function hasDifferentSession(originalToken: string): boolean {
  const currentToken = sessionStorage.getItem("token");

  return currentToken !== null && currentToken !== originalToken;
}

function clearOwnedSession(originalToken: string): boolean {
  if (hasDifferentSession(originalToken)) {
    return false;
  }

  sessionStorage.removeItem("token");
  return true;
}

export function useDeleteAccount() {
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);

  const [status, setStatus] = useState<DeletionStatus>("idle");
  const [error, setError] = useState("");

  const mountedRef = useRef(false);
  const busyRef = useRef(false);
  const statusRef = useRef<DeletionStatus>("idle");

  const requestTokenRef = useRef<string | null>(null);
  const acceptedRef = useRef(false);

  const pollControllerRef = useRef<AbortController | null>(null);
  const pollTimerRef = useRef<number | null>(null);

  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);

  const updateStatus = useCallback((nextStatus: DeletionStatus) => {
    statusRef.current = nextStatus;
    busyRef.current = nextStatus !== "idle";

    if (mountedRef.current) {
      setStatus(nextStatus);
    }
  }, []);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current !== null) {
      window.clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }

    pollControllerRef.current?.abort();
    pollControllerRef.current = null;
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      stopPolling();

      // Closing the dialog cannot cancel an accepted backend job.
      // Leave the protected pages if the user closes it after acceptance.
      const token = requestTokenRef.current;

      if (acceptedRef.current && token) {
        acceptedRef.current = false;

        if (clearOwnedSession(token)) {
          navigateRef.current("/signup", {
            replace: true,
          });
        }
      }
    };
  }, [stopPolling]);

  const monitorDeletion = useCallback(
    async function poll(
      deletionToken: string,
      originalToken: string,
      signal: AbortSignal,
    ): Promise<void> {
      if (signal.aborted || !mountedRef.current) {
        return;
      }

      if (hasDifferentSession(originalToken)) {
        stopPolling();
        acceptedRef.current = false;
        updateStatus("idle");

        setError(
          "Your sign-in has changed. Close this message and reopen it for your current account.",
        );
        return;
      }

      let nextPollDelay = POLL_INTERVAL_MS;

      try {
        const progress = await getAccountDeletionStatus(
          deletionToken,
          signal,
        );

        if (signal.aborted || !mountedRef.current) {
          return;
        }

        if (hasDifferentSession(originalToken)) {
          stopPolling();
          acceptedRef.current = false;
          updateStatus("idle");

          setError(
            "Your sign-in has changed. Close this message and reopen it for your current account.",
          );
          return;
        }

        if (progress.status === "deleted") {
          stopPolling();
          setError("");
          updateStatus("deleted");
          return;
        }

        // An accepted or processing job is not a completed deletion.
        setError("");
      } catch (cause: unknown) {
        if (signal.aborted || !mountedRef.current) {
          return;
        }

        if (
          cause instanceof DeleteAccountError &&
          [400, 401, 403, 404, 410, 422].includes(cause.status)
        ) {
          stopPolling();

          // Never interpret a missing endpoint, an expired receipt,
          // or an authorization error as successful deletion.
          setError(
            "Deletion progress could not be verified. No completion confirmation has been received. An accepted deletion request may still be running.",
          );
          return;
        }

        setError(
          "We could not check deletion progress. We will try again shortly.",
        );

        nextPollDelay = POLL_RETRY_INTERVAL_MS;
      }

      if (signal.aborted || !mountedRef.current) {
        return;
      }

      pollTimerRef.current = window.setTimeout(() => {
        pollTimerRef.current = null;

        void poll(
          deletionToken,
          originalToken,
          signal,
        );
      }, nextPollDelay);
    },
    [stopPolling, updateStatus],
  );

  const submitDeletion = useCallback(
    async (currentPassword: string): Promise<void> => {
      // The ref blocks rapid repeated clicks before React renders.
      if (!mountedRef.current || busyRef.current) {
        return;
      }

      if (currentPassword.length === 0) {
        setError("Enter your current password to continue.");
        return;
      }

      const token = sessionStorage.getItem("token");

      if (!token) {
        setError("Your session has expired. Please sign in again.");
        return;
      }

      if (
        requestTokenRef.current !== null &&
        requestTokenRef.current !== token
      ) {
        setError(
          "Your sign-in has changed. Close this message and reopen it for your current account.",
        );
        return;
      }

      requestTokenRef.current = token;
      acceptedRef.current = false;

      stopPolling();
      setError("");
      updateStatus("submitting");

      try {
        // Pass the exact password only to the request.
        // Never write it to browser storage or logs.
        //
        // The service must use this captured token, rather than
        // reading a potentially different token later.
        const response = await requestAccountDeletion(
          currentPassword,
          token,
        );

        if (hasDifferentSession(token)) {
          if (mountedRef.current) {
            updateStatus("idle");
            setError(
              "Your sign-in has changed. The new session has not been changed.",
            );
          }
          return;
        }

        acceptedRef.current = true;

        // The confirmation request is allowed to finish even if
        // the dialog was closed while it was being submitted.
        if (!mountedRef.current) {
          acceptedRef.current = false;

          if (clearOwnedSession(token)) {
            window.location.replace("/signup");
          }
          return;
        }

        updateStatus("processing");

        const controller = new AbortController();
        pollControllerRef.current = controller;

        void monitorDeletion(
          response.deletion_token,
          token,
          controller.signal,
        );
      } catch (cause: unknown) {
        if (!mountedRef.current) {
          return;
        }

        if (hasDifferentSession(token)) {
          updateStatus("idle");
          setError(
            "Your sign-in has changed. Close this message and reopen it for your current account.",
          );
          return;
        }

        updateStatus("idle");

        if (cause instanceof DeleteAccountError) {
          if (cause.status === 401) {
            if (clearOwnedSession(token)) {
              navigateRef.current("/signup", {
                replace: true,
              });
            }
            return;
          }

          // Incorrect-password responses must use 403,
          // so they leave the current sign-in intact.
          setError(cause.message);
          return;
        }

        setError(
          "We could not confirm your deletion request. Please try again.",
        );
      }
    },
    [monitorDeletion, stopPolling, updateStatus],
  );

  const finishDeletion = useCallback(() => {
    if (statusRef.current !== "deleted") {
      return;
    }

    const token = requestTokenRef.current;

    stopPolling();
    acceptedRef.current = false;

    if (!token || !clearOwnedSession(token)) {
      if (mountedRef.current) {
        setError(
          "Your sign-in has changed. The new session has not been changed.",
        );
        updateStatus("idle");
      }
      return;
    }

    // Load a fresh application document after confirmed deletion,
    // clearing the current page and its in-memory UI state.
    window.location.replace("/signup");
  }, [stopPolling, updateStatus]);

  return {
    status,
    error,
    submitDeletion,
    finishDeletion,
  };
}