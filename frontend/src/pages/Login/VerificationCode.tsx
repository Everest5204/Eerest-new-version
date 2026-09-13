import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./VerificationCode.css";

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL?.trim() ||
  "http://localhost:5000"
).replace(/\/+$/, "");

const REQUEST_TIMEOUT_MS = 30_000;

type RequestAction = "verify" | "resend";

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

const VerificationCode = () => {
  const navigate = useNavigate();

  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [pendingAction, setPendingAction] =
    useState<RequestAction | null>(null);

  const requestRef = useRef<AbortController | null>(null);

  const isBusy = pendingAction !== null;

  useEffect(() => {
    try {
      const emailOrPhone =
        sessionStorage.getItem("resetEmailOrPhone");

      if (!emailOrPhone) {
        navigate("/forgot-password", {
          replace: true,
        });
      }
    } catch {
      navigate("/forgot-password", {
        replace: true,
      });
    }

    return () => {
      requestRef.current?.abort();
      requestRef.current = null;
    };
  }, [navigate]);

  const handleRequest = async (action: RequestAction) => {
    if (requestRef.current) {
      return;
    }

    setError("");
    setSuccess("");

    const normalizedCode = code.trim();

    if (
      action === "verify" &&
      !/^[0-9]{6}$/.test(normalizedCode)
    ) {
      setError("Please enter the 6-digit verification code.");
      return;
    }

    let emailOrPhone: string;

    try {
      emailOrPhone =
        sessionStorage.getItem("resetEmailOrPhone") || "";

      if (!emailOrPhone) {
        navigate("/forgot-password", {
          replace: true,
        });
        return;
      }

      sessionStorage.removeItem("resetVerified");
      sessionStorage.removeItem("resetCode");
    } catch {
      setError(
        "Browser storage is unavailable. Please allow site storage and try again."
      );
      return;
    }

    const controller = new AbortController();

    requestRef.current = controller;
    setPendingAction(action);

    const timeoutId = window.setTimeout(() => {
      controller.abort();
    }, REQUEST_TIMEOUT_MS);

    try {
      const path =
        action === "verify"
          ? "/api/auth/verify-reset-code"
          : "/api/auth/forgot-password";

      const payload =
        action === "verify"
          ? {
              email_or_phone: emailOrPhone,
              code: normalizedCode,
            }
          : {
              email_or_phone: emailOrPhone,
            };

      const response = await fetch(
        `${API_BASE_URL}${path}`,
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
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
        setError(
          getErrorMessage(
            responseText,
            action === "verify"
              ? "Unable to verify this code. Please try again."
              : "Unable to resend the code. Please try again."
          )
        );
        return;
      }

      try {
        const currentEmail =
          sessionStorage.getItem("resetEmailOrPhone");

        if (currentEmail !== emailOrPhone) {
          setError(
            "Your reset session has changed. Please start again."
          );
          return;
        }

        if (action === "verify") {
          sessionStorage.setItem(
            "resetCode",
            normalizedCode
          );

          sessionStorage.setItem(
            "resetVerified",
            "true"
          );
        }
      } catch {
        setError(
          "Your reset session could not be saved. Please allow site storage and try again."
        );
        return;
      }

      if (action === "verify") {
        navigate("/reset-password");
        return;
      }

      setCode("");

      setSuccess(
        "A new verification code has been sent to your email."
      );
    } catch {
      if (requestRef.current !== controller) {
        return;
      }

      if (controller.signal.aborted) {
        setError(
          action === "resend"
            ? "The request timed out. Please try again after 60 seconds."
            : "Verification timed out. Please try again."
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
        setPendingAction(null);
      }
    }
  };

  const goBackToSignin = () => {
    requestRef.current?.abort();
    requestRef.current = null;

    try {
      sessionStorage.removeItem("resetEmailOrPhone");
      sessionStorage.removeItem("resetVerified");
      sessionStorage.removeItem("resetCode");
    } catch {
      // Keep navigation available when browser storage is blocked.
    }

    navigate("/login", {
      replace: true,
    });
  };

  return (
    <div className="verifyPage">
      <div className="verifyContainer">
        <h1 className="verifyLogo">Mongosky</h1>

        <h2>Verification Code</h2>

        <p className="verifyText">
          We have sent a verification code to your email.
          Please enter the code below to recover your password.
        </p>

        <form
          className="verifyForm"
          aria-busy={isBusy}
          onSubmit={(event) => {
            event.preventDefault();
            void handleRequest("verify");
          }}
        >
          <input
            id="verification-code"
            name="verification_code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="Enter verification code"
            aria-label="6-digit verification code"
            aria-describedby={
              error ? "verification-error" : undefined
            }
            className="verifyField"
            value={code}
            disabled={isBusy}
            required
            onChange={(event) => {
              setCode(event.target.value);
              setError("");
              setSuccess("");
            }}
          />

          {error && (
            <p
              id="verification-error"
              className="verifyError"
              role="alert"
            >
              {error}
            </p>
          )}

          {success && (
            <p
              className="verifySuccess"
              role="status"
            >
              {success}
            </p>
          )}

          <button
            className="verifyBtn"
            type="submit"
            disabled={isBusy}
            aria-label={
              pendingAction === "verify"
                ? "Verifying code"
                : "Continue"
            }
          >
            {pendingAction === "verify" ? (
              <span
                className="verifySpinner"
                aria-hidden="true"
              />
            ) : (
              "Continue"
            )}
          </button>
        </form>

        <div className="verifyBottom">
          <button
            type="button"
            className="verifyBack"
            onClick={goBackToSignin}
          >
            Back to signin
          </button>

          <button
            type="button"
            className="verifyResend"
            disabled={isBusy}
            onClick={() => {
              void handleRequest("resend");
            }}
          >
            {pendingAction === "resend"
              ? "Resending..."
              : "Resend code"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default VerificationCode;