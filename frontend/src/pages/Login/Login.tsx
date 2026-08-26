import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiEye, FiEyeOff } from "react-icons/fi";
import { googleAuthUser, loginUser } from "../../services/authService";
import "./Login.css";

declare global {
  interface Window {
    google: any;
  }
}

const Login = () => {
  const navigate = useNavigate();

  const [showPassword, setShowPassword] = useState(false);

  const [emailOrPhone, setEmailOrPhone] = useState("");
  const [password, setPassword] = useState("");

  const [loginError, setLoginError] = useState("");
  const [loginSuccess, setLoginSuccess] = useState("");

  const [isLoginLoading, setIsLoginLoading] = useState(false);

  const closeLoginPage = () => {
    navigate(-1);
  };

  const stopClose = (event: React.MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
  };

  const goToSignupPage = () => {
    navigate("/signup", { replace: true });
  };

  const handleGoogleLogin = () => {
    setLoginError("");
    setLoginSuccess("");

    if (!window.google) {
      setLoginError("Google service is still loading. Please try again.");
      return;
    }

    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
      scope: "email profile openid",

      callback: async (response: any) => {
        try {
          setIsLoginLoading(true);

          const userResponse = await fetch(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            {
              headers: {
                Authorization: `Bearer ${response.access_token}`,
              },
            }
          );

          const googleUser = await userResponse.json();

          if (!googleUser?.email) {
            setLoginError("Google login failed");
            return;
          }

          const authResponse = await googleAuthUser({
            email: googleUser.email,
            first_name: googleUser.given_name || "",
            last_name: googleUser.family_name || "",
          });

          if (authResponse.needs_signup) {
            navigate("/signup", {
              replace: true,
              state: {
                googleSignup: true,
                email: googleUser.email,
                firstName: googleUser.given_name || "",
                lastName: googleUser.family_name || "",
              },
            });
            return;
          }

          sessionStorage.setItem("token", authResponse.token);

          setLoginSuccess("Google login successful");

          setTimeout(() => {
            navigate("/", { replace: true });
          }, 700);
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : "Google login failed";

          setLoginError(message);
        } finally {
          setIsLoginLoading(false);
        }
      },
    });

    client.requestAccessToken();
  };

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setLoginError("");
    setLoginSuccess("");

    if (!emailOrPhone.trim()) {
      setLoginError("Please enter your email or phone");
      return;
    }

    if (!password.trim()) {
      setLoginError("Please enter your password");
      return;
    }

    try {
      setIsLoginLoading(true);

      const response = await loginUser({
        email_or_phone: emailOrPhone.trim(),
        password,
      });

      sessionStorage.setItem("token", response.token);

      setLoginSuccess("Your login successful");

      setTimeout(() => {
        navigate("/", { replace: true });
      }, 700);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Login failed";

      setLoginError(message);
    } finally {
      setIsLoginLoading(false);
    }
  };

  return (
    <div className="loginPage" onClick={closeLoginPage}>
      <div className="loginContainer" onClick={stopClose}>
        <h2 className="loginLogo">Mongosky</h2>

        <h1>Sign In to your Account</h1>

        <button
          className="loginGoogleBtn"
          type="button"
          onClick={handleGoogleLogin}
          disabled={isLoginLoading}
        >
          <img
            src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
            alt="Google"
            className="loginGoogleIcon"
          />

          <span>Continue with Google</span>
        </button>

        <div className="loginDivider">
          <span></span>
          <p>or</p>
          <span></span>
        </div>

        <form className="loginForm" onSubmit={handleLogin}>
          <input
            className="loginField"
            type="text"
            placeholder="Email or Phone"
            value={emailOrPhone}
            onChange={(event) => setEmailOrPhone(event.target.value)}
          />

          <div className="loginPasswordBox">
            <input
              className="loginField loginPasswordField"
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />

            <button
              type="button"
              className="loginEyeBtn"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <FiEyeOff /> : <FiEye />}
            </button>
          </div>

          {loginError && <p className="loginError">{loginError}</p>}
          {loginSuccess && <p className="loginSuccess">{loginSuccess}</p>}

          <div className="loginOptions">
            <label>
              <input type="checkbox" />
              <span>Remember me</span>
            </label>

            <button
              type="button"
              onClick={() =>
                navigate("/forgot-password", {
                  replace: true,
                })
              }
            >
              Forgotten password?
            </button>
          </div>

          <button className="loginBtn" type="submit" disabled={isLoginLoading}>
            {isLoginLoading ? <span className="loginSpinner"></span> : "Sign In"}
          </button>

          <p className="loginSignup">
            Do not have an account?
            <button type="button" onClick={goToSignupPage}>
              Sign Up
            </button>
          </p>
        </form>
      </div>
    </div>
  );
};

export default Login;