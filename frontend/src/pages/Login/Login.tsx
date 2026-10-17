import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { sharedLinkAuthURL, sharedLinkReturn } from "../../features/shared-links/sharedLinkDestination";
import {
  GoogleLogin,
  type CredentialResponse,
} from "@react-oauth/google";
import { FiEye, FiEyeOff } from "react-icons/fi";

import {
  googleAuthUser,
  loginUser,
} from "../../services/authService";

import "./Login.css";

const Login = () => {
  const navigate = useNavigate();
  const returnTo = sharedLinkReturn(useLocation());

  const googleButtonWidth = Math.max(
    200,
    Math.min(window.innerWidth - 34, 350)
  );

  const [showPassword, setShowPassword] = useState(false);
  const [emailOrPhone, setEmailOrPhone] = useState("");
  const [password, setPassword] = useState("");

  const [loginError, setLoginError] = useState("");
  const [isLoginLoading, setIsLoginLoading] = useState(false);

  const closeLoginPage = () => {
    if (!isLoginLoading) {
      navigate(-1);
    }
  };

  const stopClose = (
    event: React.MouseEvent<HTMLDivElement>
  ) => {
    event.stopPropagation();
  };

  const goToSignupPage = () => {
    navigate(sharedLinkAuthURL("/signup", returnTo), { replace: true });
  };

  const saveTokenAndEnterApp = (token?: string) => {
    if (!token) {
      throw new Error(
        "Authentication token was not returned."
      );
    }

    sessionStorage.setItem("token", token);
    navigate(returnTo ?? "/", { replace: true });
  };

  const handleGoogleSuccess = async (
    credentialResponse: CredentialResponse
  ) => {
    setLoginError("");

    const credential =
      credentialResponse.credential?.trim();

    if (!credential) {
      setLoginError(
        "Google did not provide a valid authentication credential."
      );
      return;
    }

    try {
      setIsLoginLoading(true);

      const authResponse = await googleAuthUser({
        credential,
      });

      if (!authResponse.needs_signup) {
        saveTokenAndEnterApp(authResponse.token);
        return;
      }

      const googleProfile = authResponse.profile;

      if (!googleProfile?.email) {
        throw new Error(
          "Verified Google profile information was not returned."
        );
      }

      navigate(sharedLinkAuthURL("/signup", returnTo), {
        replace: true,
        state: {
          googleSignup: true,
          googleCredential: credential,
          email: googleProfile.email,
          firstName: googleProfile.first_name || "",
          lastName: googleProfile.last_name || "",
        },
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Google login failed.";

      setLoginError(message);
    } finally {
      setIsLoginLoading(false);
    }
  };

  const handleGoogleError = () => {
    setLoginError(
      "Google authentication was cancelled or failed. Please try again."
    );
  };

  const handleLogin = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();
    setLoginError("");

    const normalizedEmailOrPhone =
      emailOrPhone.trim();

    if (!normalizedEmailOrPhone) {
      setLoginError(
        "Please enter your email or phone."
      );
      return;
    }

    if (!password) {
      setLoginError("Please enter your password.");
      return;
    }

    try {
      setIsLoginLoading(true);

      const response = await loginUser({
        email_or_phone: normalizedEmailOrPhone,
        password,
      });

      saveTokenAndEnterApp(response.token);
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Login failed.";

      setLoginError(message);
    } finally {
      setIsLoginLoading(false);
    }
  };

  return (
    <main
      className="loginPage"
      onClick={closeLoginPage}
    >
      <div
        className="loginContainer"
        onClick={stopClose}
      >
        <h2 className="loginLogo">Mongosky</h2>

        <h1>Sign In to your Account</h1>

        <div
          className="loginGoogleShell"
          aria-busy={isLoginLoading}
        >
          {isLoginLoading ? (
            <button
              className="loginGoogleBtn"
              type="button"
              disabled
            >
              <span className="loginSpinner" />
              <span>Connecting to Google</span>
            </button>
          ) : (
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={handleGoogleError}
              theme="outline"
              size="large"
              shape="rectangular"
              text="continue_with"
              logo_alignment="left"
              width={String(googleButtonWidth)}
            />
          )}
        </div>

        <div
          className="loginDivider"
          aria-hidden="true"
        >
          <span />
          <p>or</p>
          <span />
        </div>

        <form
          className="loginForm"
          onSubmit={handleLogin}
          noValidate
        >
          <input
            className="loginField"
            type="text"
            inputMode="email"
            autoComplete="username"
            placeholder="Email or Phone"
            aria-label="Email or phone"
            value={emailOrPhone}
            onChange={(event) =>
              setEmailOrPhone(event.target.value)
            }
            disabled={isLoginLoading}
          />

          <div className="loginPasswordBox">
            <input
              className="loginField loginPasswordField"
              type={
                showPassword ? "text" : "password"
              }
              autoComplete="current-password"
              placeholder="Password"
              aria-label="Password"
              value={password}
              onChange={(event) =>
                setPassword(event.target.value)
              }
              disabled={isLoginLoading}
            />

            <button
              type="button"
              className="loginEyeBtn"
              onClick={() =>
                setShowPassword(
                  (current) => !current
                )
              }
              aria-label={
                showPassword
                  ? "Hide password"
                  : "Show password"
              }
              disabled={isLoginLoading}
            >
              {showPassword ? (
                <FiEyeOff />
              ) : (
                <FiEye />
              )}
            </button>
          </div>

          {loginError && (
            <p
              className="loginError"
              role="alert"
              aria-live="polite"
            >
              {loginError}
            </p>
          )}

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
              disabled={isLoginLoading}
            >
              Forgotten password?
            </button>
          </div>

          <button
            className="loginBtn"
            type="submit"
            disabled={isLoginLoading}
          >
            {isLoginLoading ? (
              <span className="loginSpinner" />
            ) : (
              "Sign In"
            )}
          </button>

          <p className="loginSignup">
            Do not have an account?{" "}
            <button
              type="button"
              onClick={goToSignupPage}
              disabled={isLoginLoading}
            >
              Sign Up
            </button>
          </p>
        </form>
      </div>
    </main>
  );
};

export default Login;