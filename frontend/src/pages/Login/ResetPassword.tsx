import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./ResetPassword.css";

const ResetPassword = () => {
  const navigate = useNavigate();

  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const isVerified =
      sessionStorage.getItem("resetVerified");

    if (!isVerified) {
      navigate("/forgot-password", {
        replace: true,
      });
    }
  }, [navigate]);

  const goBackToSignin = () => {
    sessionStorage.removeItem("resetEmailOrPhone");
    sessionStorage.removeItem("resetVerified");

    navigate("/login", {
      replace: true,
    });
  };

  const handleResetPassword = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    setError("");
    setSuccess("");

    if (newPassword.trim().length < 6) {
      setError(
        "Password must be at least 6 characters"
      );
      return;
    }

    const emailOrPhone =
      sessionStorage.getItem(
        "resetEmailOrPhone"
      );

    if (!emailOrPhone) {
      setError(
        "Reset session expired. Please try again."
      );
      return;
    }

    try {
      setIsLoading(true);

      const response = await fetch(
        "http://localhost:5000/api/auth/reset-password",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            email_or_phone: emailOrPhone,
            new_password: newPassword,
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
            "Password reset failed"
        );
        return;
      }

      sessionStorage.removeItem(
        "resetEmailOrPhone"
      );

      sessionStorage.removeItem(
        "resetVerified"
      );

      setSuccess(
        "Your password reset successfully"
      );

      setTimeout(() => {
        navigate("/", {
          replace: true,
        });
      }, 1200);
    } catch {
      setError("Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="resetPage">
      <div className="resetContainer">
        <h1 className="resetLogo">
          Everest
        </h1>

        <h2>
          New password
        </h2>

        <p className="resetText">
          To successfully complete the
          password reset process for
          your account, please enter
          your new password below.
        </p>

        <form
          className="resetForm"
          onSubmit={
            handleResetPassword
          }
        >
          <input
            type="password"
            placeholder="Enter new password"
            className="resetField"
            value={newPassword}
            onChange={(event) =>
              setNewPassword(
                event.target.value
              )
            }
          />

          {error && (
            <p className="resetError">
              {error}
            </p>
          )}

          {success && (
            <p className="resetSuccess">
              {success}
            </p>
          )}

          <button
            className="resetBtn"
            type="submit"
            disabled={isLoading}
          >
            {isLoading ? (
              <span className="resetSpinner"></span>
            ) : (
              "Continue"
            )}
          </button>
        </form>

        <button
          type="button"
          className="resetBack"
          onClick={
            goBackToSignin
          }
        >
          Back to signin
        </button>
      </div>
    </div>
  );
};

export default ResetPassword;