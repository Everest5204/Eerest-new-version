import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./VerificationCode.css";

const VerificationCode = () => {
  const navigate = useNavigate();

  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);

  useEffect(() => {
    const emailOrPhone = sessionStorage.getItem("resetEmailOrPhone");

    if (!emailOrPhone) {
      navigate("/forgot-password", {
        replace: true,
      });
    }
  }, [navigate]);

  const goBackToSignin = () => {
    sessionStorage.removeItem("resetEmailOrPhone");
    sessionStorage.removeItem("resetVerified");

    navigate("/login");
  };

  const handleContinue = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    setError("");
    setSuccess("");

    const emailOrPhone = sessionStorage.getItem("resetEmailOrPhone");

    if (!emailOrPhone) {
      setError("Reset session expired. Please try again.");
      return;
    }

    if (!code.trim()) {
      setError("Please enter verification code");
      return;
    }

    try {
      setIsLoading(true);

      const response = await fetch(
        "http://localhost:5000/api/auth/verify-reset-code",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email_or_phone: emailOrPhone,
            code: code.trim(),
          }),
        }
      );

      const text = await response.text();

      let data: any = {};

      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { message: text };
      }

      if (!response.ok) {
        setError(data.message || "Invalid verification code");
        return;
      }

      sessionStorage.setItem("resetVerified", "true");
      setSuccess("Verification successful");

      navigate("/reset-password");
    } catch {
      setError("Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    const emailOrPhone = sessionStorage.getItem("resetEmailOrPhone");

    if (!emailOrPhone) {
      setError("Reset session expired. Please try again.");
      return;
    }

    try {
      setIsResending(true);
      setError("");
      setSuccess("");

      const response = await fetch(
        "http://localhost:5000/api/auth/forgot-password",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email_or_phone: emailOrPhone,
          }),
        }
      );

      const text = await response.text();

      let data: any = {};

      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { message: text };
      }

      if (!response.ok) {
        setError(data.message || "Failed to resend code");
        return;
      }

      setSuccess("Verification code resent");
    } catch {
      setError("Something went wrong");
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="verifyPage">
      <div className="verifyContainer">
        <h1 className="verifyLogo">Mongosky</h1>

        <h2>Verification Code</h2>

        <p className="verifyText">
          We have sent a verification code to your email. Please enter the code
          below to recover your password.
        </p>

        <form className="verifyForm" onSubmit={handleContinue}>
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            placeholder="Enter verification code"
            className="verifyField"
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />

          {error && <p className="verifyError">{error}</p>}
          {success && <p className="verifySuccess">{success}</p>}

          <button className="verifyBtn" type="submit" disabled={isLoading}>
            {isLoading ? <span className="verifySpinner"></span> : "Continue"}
          </button>
        </form>

        <div className="verifyBottom">
          <button type="button" className="verifyBack" onClick={goBackToSignin}>
            Back to signin
          </button>

          <button
            type="button"
            className="verifyResend"
            onClick={handleResendCode}
            disabled={isResending}
          >
            {isResending ? "Resending..." : "Resend code"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default VerificationCode;