import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./ForgotPassword.css";

const ForgotPassword = () => {
  const navigate = useNavigate();

  const [emailOrPhone, setEmailOrPhone] =
    useState("");

  const [error, setError] =
    useState("");

  const [isLoading, setIsLoading] =
    useState(false);

  const handleContinue = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    setError("");

    if (!emailOrPhone.trim()) {
      setError(
        "Please enter your email or phone"
      );

      return;
    }

    try {
      setIsLoading(true);

      const response = await fetch(
        "http://localhost:5000/api/auth/forgot-password",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            email_or_phone:
              emailOrPhone.trim(),
          }),
        }
      );

      const text =
        await response.text();

      let data: any = {};

      try {
        data = text
          ? JSON.parse(text)
          : {};
      } catch {
        data = {
          message: text,
        };
      }

      if (!response.ok) {
        setError(
          data.message ||
            "No account found with this email or phone"
        );

        return;
      }

      sessionStorage.setItem(
        "resetEmailOrPhone",
        emailOrPhone.trim()
      );

      navigate(
        "/verification-code",
        {
          replace: true,
        }
      );
    } catch {
      setError(
        "Something went wrong"
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="forgotPage">
      <div className="forgotContainer">
        <h1 className="forgotLogo">
          Everest
        </h1>

        <h2>
          Forgot your password?
        </h2>

        <p className="forgotText">
          Enter the email or phone used
          for your account and we will
          send you a verification code.
        </p>

        <form
          className="forgotForm"
          onSubmit={handleContinue}
        >
          <input
            type="text"
            placeholder="Email or phone"
            className="forgotField"
            value={emailOrPhone}
            onChange={(event) =>
              setEmailOrPhone(
                event.target.value
              )
            }
          />

          {error && (
            <p className="forgotError">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="forgotBtn"
            disabled={isLoading}
          >
            {isLoading
              ? "Please wait..."
              : "Continue"}
          </button>
        </form>

        <button
          className="forgotBack"
          onClick={() =>
            navigate("/login", {
              replace: true,
            })
          }
        >
          Back to signin
        </button>
      </div>
    </div>
  );
};

export default ForgotPassword;