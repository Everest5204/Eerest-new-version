import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import "./ResetPassword.css";

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL?.trim() ||
  "http://localhost:5000"
).replace(/\/+$/, "");

const REQUEST_TIMEOUT_MS = 30_000;

const UNCONFIRMED_MESSAGE =
  "We couldn't confirm whether your password changed. Try signing in with your new password before requesting another code.";

type ResetSession = {
  emailOrPhone: string;
  code: string;
};

const readResetSession = (): ResetSession | null => {
  try {
    const emailOrPhone =
      sessionStorage.getItem("resetEmailOrPhone") || "";

    const code =
      sessionStorage.getItem("resetCode") || "";

    const isVerified =
      sessionStorage.getItem("resetVerified") === "true";

    if (
      !emailOrPhone ||
      !isVerified ||
      !/^[0-9]{6}$/.test(code)
    ) {
      return null;
    }

    return {
      emailOrPhone,
      code,
    };
  } catch {
    return null;
  }
};

const clearResetSession = (
  expectedSession?: ResetSession
) => {
  try {
    if (
      expectedSession &&
      (
        sessionStorage.getItem("resetEmailOrPhone") !==
          expectedSession.emailOrPhone ||
        sessionStorage.getItem("resetCode") !==
          expectedSession.code
      )
    ) {
      return;
    }

    sessionStorage.removeItem("resetVerified");
    sessionStorage.removeItem("resetCode");
    sessionStorage.removeItem("resetEmailOrPhone");
  } catch {
    // Storage cleanup must not hide a confirmed password reset.
  }
};

const getErrorMessage = (
  responseText: string,
  fallback: string
): string => {
  const text = responseText.trim();

  if (!text || text.startsWith("<")) {
    return fallback;
  }

  try {
    const data: unknown = JSON.parse(text);

    if (
      typeof data === "object" &&
      data !== null &&
      !Array.isArray(data)
    ) {
      const record = data as Record<string, unknown>;

      for (const key of ["message", "error"]) {
        const value = record[key];

        if (typeof value === "string" && value.trim()) {
          return value.trim().slice(0, 300);
        }
      }
    }

    return fallback;
  } catch {
    return text.slice(0, 300);
  }
};

const ResetPassword = () => {
  const navigate = useNavigate();

  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const requestRef = useRef<AbortController | null>(null);
  const redirectTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!readResetSession()) {
      navigate("/forgot-password", {
        replace: true,
      });
    }

    return () => {
      requestRef.current?.abort();
      requestRef.current = null;

      if (redirectTimerRef.current !== null) {
        window.clearTimeout(redirectTimerRef.current);
        redirectTimerRef.current = null;
      }
    };
  }, [navigate]);

  const leaveResetPage = (
    path: "/login" | "/forgot-password"
  ) => {
    requestRef.current?.abort();
    requestRef.current = null;

    if (redirectTimerRef.current !== null) {
      window.clearTimeout(redirectTimerRef.current);
      redirectTimerRef.current = null;
    }

    clearResetSession();
    setNewPassword("");

    navigate(path, {
      replace: true,
    });
  };

  const handleResetPassword = async (
    event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    if (requestRef.current || success) {
      return;
    }

    setError("");

    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    if (new TextEncoder().encode(newPassword).length > 72) {
      setError(
        "Your password is too long. Please use a shorter password."
      );
      return;
    }

    const resetSession = readResetSession();

    if (!resetSession) {
      setError(
        "Your reset session is unavailable. Please request a new code."
      );
      return;
    }

    const controller = new AbortController();

    requestRef.current = controller;
    setIsLoading(true);

    const timeoutId = window.setTimeout(() => {
      controller.abort();
    }, REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/auth/reset-password`,
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email_or_phone: resetSession.emailOrPhone,
            code: resetSession.code,
            new_password: newPassword,
          }),
          cache: "no-store",
          credentials: "omit",
          redirect: "error",
          signal: controller.signal,
        }
      );

      const responseText = await response.text();

      if (requestRef.current !== controller) {
        return;
      }

      if (controller.signal.aborted) {
        setError(UNCONFIRMED_MESSAGE);
        return;
      }

      if (response.status !== 200) {
        setError(
          getErrorMessage(
            responseText,
            "Unable to reset your password. Please try again."
          )
        );
        return;
      }

      let responseData: unknown;

      try {
        responseData = JSON.parse(responseText);
      } catch {
        setError(UNCONFIRMED_MESSAGE);
        return;
      }

      if (
        typeof responseData !== "object" ||
        responseData === null ||
        Array.isArray(responseData) ||
        !("message" in responseData) ||
        typeof responseData.message !== "string" ||
        !responseData.message.trim()
      ) {
        setError(UNCONFIRMED_MESSAGE);
        return;
      }

      clearResetSession(resetSession);
      setNewPassword("");

      setSuccess(
        "Your password has been reset successfully. Please sign in with your new password."
      );

      redirectTimerRef.current = window.setTimeout(() => {
        redirectTimerRef.current = null;

        navigate("/login", {
          replace: true,
        });
      }, 1500);
    } catch {
      if (requestRef.current !== controller) {
        return;
      }

      setError(UNCONFIRMED_MESSAGE);
    } finally {
      window.clearTimeout(timeoutId);

      if (requestRef.current === controller) {
        requestRef.current = null;
        setIsLoading(false);
      }
    }
  };

  return (
    <div className="resetPage">
      <div className="resetContainer">
        <h1 className="resetLogo">Mongosky</h1>

        <h2>New password</h2>

        <p className="resetText">
          To successfully complete the password reset process
          for your account, please enter your new password below.
        </p>

        <form
          className="resetForm"
          onSubmit={handleResetPassword}
          aria-busy={isLoading}
        >
          <input
            id="reset-new-password"
            name="new_password"
            type="password"
            autoComplete="new-password"
            placeholder="Enter new password"
            aria-label="New password"
            aria-describedby={error ? "reset-error" : undefined}
            className="resetField"
            value={newPassword}
            disabled={isLoading || Boolean(success)}
            required
            minLength={6}
            onChange={(event) => {
              setNewPassword(event.target.value);
              setError("");
            }}
          />

          {error && (
            <p
              id="reset-error"
              className="resetError"
              role="alert"
            >
              {error}
            </p>
          )}

          {success && (
            <p
              className="resetSuccess"
              role="status"
            >
              {success}
            </p>
          )}

          <button
            className="resetBtn"
            type="submit"
            disabled={isLoading || Boolean(success)}
            aria-label={
              isLoading ? "Resetting password" : "Continue"
            }
          >
            {isLoading ? (
              <span
                className="resetSpinner"
                aria-hidden="true"
              />
            ) : success ? (
              "Password reset"
            ) : (
              "Continue"
            )}
          </button>
        </form>

        {error && !success && (
          <div>
            <button
              type="button"
              className="resetBack"
              disabled={isLoading}
              onClick={() => {
                leaveResetPage("/forgot-password");
              }}
            >
              Request a new code
            </button>
          </div>
        )}

        <div>
          <button
            type="button"
            className="resetBack"
            onClick={() => {
              leaveResetPage("/login");
            }}
          >
            Back to signin
          </button>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;