import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Link,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  GoogleLogin,
  type CredentialResponse,
} from "@react-oauth/google";
import { FiEye, FiEyeOff } from "react-icons/fi";

import {
  googleAuthUser,
  googleSignupUser,
  signupUser,
} from "../../services/authService";

import { sharedLinkAuthURL, sharedLinkReturn } from "../../features/shared-links/sharedLinkDestination";

import "./Signup.css";

type SignupMethod = "manual" | "google";

interface GoogleSignupNavigationState {
  googleSignup?: boolean;
  googleCredential?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const Signup = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = sharedLinkReturn(location);

  const [step, setStep] = useState<1 | 2>(1);
  const stepRef = useRef<1 | 2>(1);
  const googleNavigationHandledRef = useRef(false);

  const [signupMethod, setSignupMethod] =
    useState<SignupMethod>("manual");

  const [emailOrPhone, setEmailOrPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [policyAccepted, setPolicyAccepted] = useState(false);

  const [googleCredential, setGoogleCredential] = useState("");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [gender, setGender] = useState("");
  const [month, setMonth] = useState("");
  const [day, setDay] = useState("");
  const [year, setYear] = useState("");

  const [stepOneError, setStepOneError] = useState("");
  const [stepTwoError, setStepTwoError] = useState("");

  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isSignupLoading, setIsSignupLoading] = useState(false);

  const years = useMemo(() => {
    const currentYear = new Date().getFullYear();

    return Array.from(
      { length: currentYear - 1899 },
      (_, index) => currentYear - index
    );
  }, []);

  const days = useMemo(() => {
    if (!month || !year) {
      return Array.from(
        { length: 31 },
        (_, index) => index + 1
      );
    }

    const totalDays = new Date(
      Number(year),
      Number(month),
      0
    ).getDate();

    return Array.from(
      { length: totalDays },
      (_, index) => index + 1
    );
  }, [month, year]);

  useEffect(() => {
    if (day && Number(day) > days.length) {
      setDay("");
    }
  }, [day, days.length]);

  useEffect(() => {
    const handleMobileBack = () => {
      if (stepRef.current === 2) {
        stepRef.current = 1;
        setStep(1);
        setStepTwoError("");
      }
    };

    window.addEventListener("popstate", handleMobileBack);

    return () => {
      window.removeEventListener(
        "popstate",
        handleMobileBack
      );
    };
  }, []);

  useEffect(() => {
    if (googleNavigationHandledRef.current) {
      return;
    }

    const navigationState =
      location.state as GoogleSignupNavigationState | null;

    if (!navigationState?.googleSignup) {
      return;
    }

    googleNavigationHandledRef.current = true;

    const credential =
      typeof navigationState.googleCredential === "string"
        ? navigationState.googleCredential.trim()
        : "";

    const verifiedEmail =
      typeof navigationState.email === "string"
        ? navigationState.email.trim()
        : "";

    const googleFirstName =
      typeof navigationState.firstName === "string"
        ? navigationState.firstName
        : "";

    const googleLastName =
      typeof navigationState.lastName === "string"
        ? navigationState.lastName
        : "";

    if (!credential || !verifiedEmail) {
      setStepOneError(
        "Your Google signup session is invalid. Please try again."
      );
      return;
    }

    setSignupMethod("google");
    setGoogleCredential(credential);
    setEmailOrPhone(verifiedEmail);
    setFirstName(googleFirstName);
    setLastName(googleLastName);
    setPassword("");
    setPolicyAccepted(false);
    setStepOneError("");
    setStepTwoError("");

    const currentHistoryState: Record<string, unknown> =
      typeof window.history.state === "object" &&
      window.history.state !== null
        ? { ...window.history.state }
        : {};

    if (currentHistoryState.signupStep !== 2) {
      window.history.pushState(
        {
          ...currentHistoryState,
          signupStep: 2,
        },
        "",
        window.location.href
      );
    }

    stepRef.current = 2;
    setStep(2);
  }, [location.state]);

  const openDetailsStep = () => {
    const currentHistoryState =
      typeof window.history.state === "object" &&
      window.history.state !== null
        ? window.history.state
        : {};

    window.history.pushState(
      {
        ...currentHistoryState,
        signupStep: 2,
      },
      "",
      window.location.href
    );

    stepRef.current = 2;
    setStep(2);
  };

  const returnToFirstStep = () => {
    if (stepRef.current === 2) {
      window.history.back();
    }
  };

  const goToLoginPage = () => {
    navigate(sharedLinkAuthURL("/login", returnTo), { replace: true });
  };

  const hasSequentialPattern = (
    value: string
  ): boolean => {
    const normalizedValue = value.toLowerCase();

    const sequences = [
      "0123456789",
      "9876543210",
      "০১২৩৪৫৬৭৮৯",
      "৯৮৭৬৫৪৩২১০",
      "abcdefghijklmnopqrstuvwxyz",
      "zyxwvutsrqponmlkjihgfedcba",
      "qwertyuiop",
      "poiuytrewq",
      "asdfghjkl",
      "lkjhgfdsa",
      "zxcvbnm",
      "mnbvcxz",
      "অআইঈউঊঋএঐওঔ",
      "কখগঘঙচছজঝঞ",
      "টঠডঢণতথদধন",
      "পফবভমযরলশষসহ",
    ];

    return sequences.some((sequence) => {
      for (
        let index = 0;
        index <= sequence.length - 4;
        index += 1
      ) {
        if (
          normalizedValue.includes(
            sequence.slice(index, index + 4)
          )
        ) {
          return true;
        }
      }

      return false;
    });
  };

  const isValidEmailOrPhone = (
    value: string
  ): boolean => {
    const normalizedValue = value.trim();

    const isEmail =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        normalizedValue
      );

    const isBangladeshPhone =
      /^(?:\+8801|01)[3-9]\d{8}$/.test(
        normalizedValue
      );

    return isEmail || isBangladeshPhone;
  };

  const isValidBirthdate = (): boolean => {
    if (!month || !day || !year) {
      return false;
    }

    const selectedYear = Number(year);
    const selectedMonth = Number(month);
    const selectedDay = Number(day);

    const birthdate = new Date(
      selectedYear,
      selectedMonth - 1,
      selectedDay
    );

    const isRealDate =
      birthdate.getFullYear() === selectedYear &&
      birthdate.getMonth() === selectedMonth - 1 &&
      birthdate.getDate() === selectedDay;

    return isRealDate && birthdate <= new Date();
  };

  const handleGoogleSuccess = async (
    credentialResponse: CredentialResponse
  ) => {
    setStepOneError("");

    const credential =
      credentialResponse.credential?.trim();

    if (!credential) {
      setStepOneError(
        "Google did not provide a valid authentication credential."
      );
      return;
    }

    try {
      setIsGoogleLoading(true);

      const authResponse = await googleAuthUser({
        credential,
      });

      if (!authResponse.needs_signup) {
        if (!authResponse.token) {
          throw new Error(
            "Authentication token was not returned."
          );
        }

        sessionStorage.setItem(
          "token",
          authResponse.token
        );

        navigate(returnTo ?? "/", { replace: true });
        return;
      }

      if (!authResponse.profile?.email) {
        throw new Error(
          "Verified Google profile information was not returned."
        );
      }

      setSignupMethod("google");
      setGoogleCredential(credential);

      setEmailOrPhone(authResponse.profile.email);
      setFirstName(
        authResponse.profile.first_name || ""
      );
      setLastName(
        authResponse.profile.last_name || ""
      );

      setPassword("");
      setPolicyAccepted(false);
      setStepTwoError("");

      openDetailsStep();
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Google authentication failed.";

      setStepOneError(message);
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleGoogleError = () => {
    setStepOneError(
      "Google authentication was cancelled or failed. Please try again."
    );
  };

  const handleGetStarted = (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();
    setStepOneError("");

    const normalizedEmailOrPhone =
      emailOrPhone.trim();

    if (
      !isValidEmailOrPhone(normalizedEmailOrPhone)
    ) {
      setStepOneError(
        "Enter a valid email or Bangladesh phone number."
      );
      return;
    }

    if (password.length < 6) {
      setStepOneError(
        "Password must be at least 6 characters."
      );
      return;
    }

    if (hasSequentialPattern(password)) {
      setStepOneError(
        "Password cannot contain sequential letters or digits."
      );
      return;
    }

    if (!policyAccepted) {
      setStepOneError(
        "Please agree to the Privacy Policy before continuing."
      );
      return;
    }

    setSignupMethod("manual");
    setGoogleCredential("");
    setEmailOrPhone(normalizedEmailOrPhone);
    setStepTwoError("");

    openDetailsStep();
  };

  const handleSignup = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();
    setStepTwoError("");

    const normalizedFirstName = firstName.trim();
    const normalizedLastName = lastName.trim();

    const totalNameLength =
      `${normalizedFirstName}${normalizedLastName}`.replace(
        /\s/g,
        ""
      ).length;

    if (
      !normalizedFirstName ||
      !normalizedLastName
    ) {
      setStepTwoError(
        "First name and last name are required."
      );
      return;
    }

    if (totalNameLength > 30) {
      setStepTwoError(
        "First name and last name together cannot exceed 30 characters."
      );
      return;
    }

    if (!gender) {
      setStepTwoError("Please select your gender.");
      return;
    }

    if (!isValidBirthdate()) {
      setStepTwoError(
        "Please select a valid birthdate."
      );
      return;
    }

    if (
      signupMethod === "google" &&
      !googleCredential
    ) {
      setStepTwoError(
        "Your Google authentication session is missing. Please go back and try again."
      );
      return;
    }

    if (
      signupMethod === "google" &&
      !policyAccepted
    ) {
      setStepTwoError(
        "Please agree to the Privacy Policy before creating your account."
      );
      return;
    }

    try {
      setIsSignupLoading(true);

      const commonProfileData = {
        first_name: normalizedFirstName,
        last_name: normalizedLastName,
        gender,
        birth_month: Number(month),
        birth_day: Number(day),
        birth_year: Number(year),
      };

      const response =
        signupMethod === "google"
          ? await googleSignupUser({
              credential: googleCredential,
              ...commonProfileData,
            })
          : await signupUser({
              email_or_phone:
                emailOrPhone.trim(),
              password,
              ...commonProfileData,
            });

      if (!response.token) {
        throw new Error(
          "Authentication token was not returned."
        );
      }

      sessionStorage.setItem(
        "token",
        response.token
      );

      navigate(returnTo ?? "/signup-success", {
        replace: true,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Account creation failed.";

      setStepTwoError(message);
    } finally {
      setIsSignupLoading(false);
    }
  };

  return (
    <main className="signupPage">
      <div className="signupContainer">
        {step === 2 && (
          <button
            className="signupBackBtn"
            type="button"
            onClick={returnToFirstStep}
            aria-label="Go back to the previous step"
          >
            ‹
          </button>
        )}

        <h2 className="signupLogo">Mongosky</h2>

        <h1>
          {step === 1
            ? "Create a new account"
            : "Complete your profile"}
        </h1>

        {step === 1 && (
          <>
            <div
              className="googleButtonShell"
              aria-busy={isGoogleLoading}
            >
              {isGoogleLoading ? (
                <button
                  className="googleBtn"
                  type="button"
                  disabled
                >
                  <span className="signupSpinner" />
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
                  width={String(
                    Math.max(
                      200,
                      Math.min(
                        window.innerWidth - 34,
                        350
                      )
                    )
                  )}
                />
              )}
            </div>

            <div
              className="signupDivider"
              aria-hidden="true"
            >
              <span />
              <p>or</p>
              <span />
            </div>

            <form
              className="signupForm"
              onSubmit={handleGetStarted}
              noValidate
            >
              <input
                className="signupField"
                type="text"
                inputMode="email"
                autoComplete="username"
                placeholder="Email or Phone"
                aria-label="Email or phone"
                value={emailOrPhone}
                onChange={(event) =>
                  setEmailOrPhone(
                    event.target.value
                  )
                }
                disabled={isGoogleLoading}
              />

              <div className="signupPasswordBox">
                <input
                  className="signupField signupPasswordField"
                  type={
                    showPassword
                      ? "text"
                      : "password"
                  }
                  autoComplete="new-password"
                  placeholder="Password"
                  aria-label="Password"
                  value={password}
                  onChange={(event) =>
                    setPassword(
                      event.target.value
                    )
                  }
                  disabled={isGoogleLoading}
                />

                <button
                  type="button"
                  className="signupEyeBtn"
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
                  disabled={isGoogleLoading}
                >
                  {showPassword ? (
                    <FiEyeOff />
                  ) : (
                    <FiEye />
                  )}
                </button>
              </div>

              {stepOneError && (
                <p
                  className="signupError"
                  role="alert"
                  aria-live="polite"
                >
                  {stepOneError}
                </p>
              )}

              <div className="signupCheck">
                <input
                  id="signup-policy-agreement"
                  type="checkbox"
                  checked={policyAccepted}
                  onChange={(event) =>
                    setPolicyAccepted(
                      event.target.checked
                    )
                  }
                  disabled={isGoogleLoading}
                />

                <p id="signup-policy-text">
                  <label htmlFor="signup-policy-agreement">
                    I agree to the{" "}
                  </label>

                  <Link
                    className="signupLegalLink"
                    to="/privacy-policy"
                  >
                    Privacy Policy
                  </Link>

                  <span> and have read </span>

                  <Link
                    className="signupLegalLink"
                    to="/about"
                  >
                    About Us
                  </Link>

                  <span>.</span>
                </p>
              </div>

              <button
                className="signupBtn"
                type="submit"
                disabled={isGoogleLoading}
              >
                Get started
              </button>

              <p className="signupLogin">
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={goToLoginPage}
                >
                  Sign In
                </button>
              </p>
            </form>
          </>
        )}

        {step === 2 && (
          <form
            className="signupForm"
            onSubmit={handleSignup}
            noValidate
          >
            {signupMethod === "google" && (
              <>
                <input
                  className="signupField signupVerifiedEmail"
                  type="email"
                  value={emailOrPhone}
                  aria-label="Verified Google email"
                  readOnly
                />

                <p className="signupVerifiedText">
                  Email verified securely by Google
                </p>
              </>
            )}

            <input
              className="signupField"
              type="text"
              autoComplete="given-name"
              placeholder="First name"
              aria-label="First name"
              value={firstName}
              onChange={(event) =>
                setFirstName(event.target.value)
              }
              maxLength={30}
            />

            <input
              className="signupField"
              type="text"
              autoComplete="family-name"
              placeholder="Last name"
              aria-label="Last name"
              value={lastName}
              onChange={(event) =>
                setLastName(event.target.value)
              }
              maxLength={30}
            />

            <select
              className="signupField"
              aria-label="Gender"
              value={gender}
              onChange={(event) =>
                setGender(event.target.value)
              }
            >
              <option value="">Gender</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>

            <div className="signupBirthTitle">
              Birthdate
            </div>

            <div className="signupBirthFields">
              <select
                className="signupField"
                aria-label="Birth month"
                value={month}
                onChange={(event) =>
                  setMonth(event.target.value)
                }
              >
                <option value="">Month</option>

                {MONTHS.map(
                  (monthName, index) => (
                    <option
                      key={monthName}
                      value={index + 1}
                    >
                      {monthName}
                    </option>
                  )
                )}
              </select>

              <select
                className="signupField"
                aria-label="Birth day"
                value={day}
                onChange={(event) =>
                  setDay(event.target.value)
                }
              >
                <option value="">Day</option>

                {days.map((item) => (
                  <option
                    key={item}
                    value={item}
                  >
                    {item}
                  </option>
                ))}
              </select>

              <select
                className="signupField"
                aria-label="Birth year"
                value={year}
                onChange={(event) =>
                  setYear(event.target.value)
                }
              >
                <option value="">Year</option>

                {years.map((item) => (
                  <option
                    key={item}
                    value={item}
                  >
                    {item}
                  </option>
                ))}
              </select>
            </div>

            {signupMethod === "google" && (
              <div className="signupCheck">
                <input
                  id="google-signup-policy-agreement"
                  type="checkbox"
                  checked={policyAccepted}
                  onChange={(event) =>
                    setPolicyAccepted(
                      event.target.checked
                    )
                  }
                />

                <p>
                  <label htmlFor="google-signup-policy-agreement">
                    I agree to the{" "}
                  </label>

                  <Link
                    className="signupLegalLink"
                    to="/privacy-policy"
                  >
                    Privacy Policy
                  </Link>

                  <span> and have read </span>

                  <Link
                    className="signupLegalLink"
                    to="/about"
                  >
                    About Us
                  </Link>

                  <span>.</span>
                </p>
              </div>
            )}

            {stepTwoError && (
              <p
                className="signupError"
                role="alert"
                aria-live="polite"
              >
                {stepTwoError}
              </p>
            )}

            <button
              className="signupBtn"
              type="submit"
              disabled={isSignupLoading}
            >
              {isSignupLoading ? (
                <span className="signupSpinner" />
              ) : (
                "Sign Up"
              )}
            </button>

            <p className="signupLogin">
              Already have an account?{" "}
              <button
                type="button"
                onClick={goToLoginPage}
                disabled={isSignupLoading}
              >
                Sign In
              </button>
            </p>
          </form>
        )}
      </div>
    </main>
  );
};

export default Signup;