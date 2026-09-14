import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import "./ForgotPassword.css";

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL?.trim() ||
  "${import.meta.env.VITE_API_URL}"
).replace(/\/+$/, "");

const REQUEST_TIMEOUT_MS = 30_000;

const clearResetSession = () => {
  sessionStorage.removeItem("resetEmailOrPhone");
  sessionStorage.removeItem("resetVerified");
  sessionStorage.removeItem("resetCode");
};

const getErrorMessage = (responseText: string): string => {
  const fallback =
    "Unable to send a verification code. Please try again.";

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

const ForgotPassword = () => {
  const navigate = useNavigate();

  const [emailOrPhone, setEmailOrPhone] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      requestRef.current?.abort();
      requestRef.current = null;
    };
  }, []);

  const handleContinue = async (
    event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    if (requestRef.current) {
      return;
    }

    setError("");

    const normalizedEmail = emailOrPhone.trim().toLowerCase();

    if (!normalizedEmail) {
      setError("Please enter your email address.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError("Please enter a valid email address.");
      return;
    }

    try {
      clearResetSession();
    } catch {
      setError(
        "Browser storage is unavailable. Please allow site storage and try again."
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
        `${API_BASE_URL}/api/auth/forgot-password`,
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email_or_phone: normalizedEmail,
          }),
          cache: "no-store",
          credentials: "omit",
          redirect: "error",
          signal: controller.signal,
        }
      );

      const responseText = await response.text();

      if (
        requestRef.current !== controller ||
        controller.signal.aborted
      ) {
        return;
      }

      if (response.status !== 200) {
        setError(getErrorMessage(responseText));
        return;
      }

      try {
        sessionStorage.setItem(
          "resetEmailOrPhone",
          normalizedEmail
        );
      } catch {
        setError(
          "Your reset session could not be saved. Please allow site storage and try again."
        );
        return;
      }

      navigate("/verification-code");
    } catch {
      if (requestRef.current !== controller) {
        return;
      }

      if (controller.signal.aborted) {
        setError(
          "The request timed out. Please try again after 60 seconds."
        );
        return;
      }

      setError(
        "Unable to connect to the server. Please check your connection and try again."
      );
    } finally {
      window.clearTimeout(timeoutId);

      if (requestRef.current === controller) {
        requestRef.current = null;
        setIsLoading(false);
      }
    }
  };

  const goBackToSignin = () => {
    requestRef.current?.abort();
    requestRef.current = null;

    try {
      clearResetSession();
    } catch {
      // Keep navigation available when browser storage is blocked.
    }

    navigate("/login", {
      replace: true,
    });
  };

  return (
    <div className="forgotPage">
      <div className="forgotContainer">
        <h1 className="forgotLogo">Mongosky</h1>

        <h2>Forgot your password?</h2>

        <p className="forgotText">
          Enter the email address used for your account and we
          will send you a verification code.
        </p>

        <form
          className="forgotForm"
          onSubmit={handleContinue}
          aria-busy={isLoading}
        >
          <input
            id="forgot-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="Email address"
            aria-label="Email address"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "forgot-error" : undefined}
            className="forgotField"
            value={emailOrPhone}
            disabled={isLoading}
            required
            onChange={(event) => {
              setEmailOrPhone(event.target.value);
              setError("");
            }}
          />

          {error && (
            <p
              id="forgot-error"
              className="forgotError"
              role="alert"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            className="forgotBtn"
            disabled={isLoading}
          >
            {isLoading ? "Sending code..." : "Continue"}
          </button>
        </form>

        <button
          type="button"
          className="forgotBack"
          onClick={goBackToSignin}
        >
          Back to signin
        </button>
      </div>
    </div>
  );
};

export default ForgotPassword;