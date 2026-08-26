import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiEye, FiEyeOff } from "react-icons/fi";
import { googleAuthUser, signupUser } from "../../services/authService";
import "./Signup.css";

declare global {
  interface Window {
    google: any;
  }
}

const Signup = () => {
  const navigate = useNavigate();

  const [step, setStep] = useState<1 | 2>(1);
  const [isLoading, setIsLoading] = useState(false);

  const [emailOrPhone, setEmailOrPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [stepOneError, setStepOneError] = useState("");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [gender, setGender] = useState("");
  const [month, setMonth] = useState("");
  const [day, setDay] = useState("");
  const [year, setYear] = useState("");
  const [stepTwoError, setStepTwoError] = useState("");
  const [isSignupLoading, setIsSignupLoading] = useState(false);

  const stepRef = useRef<1 | 2>(1);

  const months = useMemo(
    () => Array.from({ length: 12 }, (_, index) => index + 1),
    []
  );

  const years = useMemo(
    () => Array.from({ length: 36 }, (_, index) => 1980 + index),
    []
  );

  const days = useMemo(() => {
    if (!month || !year) {
      return Array.from({ length: 31 }, (_, index) => index + 1);
    }

    const totalDays = new Date(Number(year), Number(month), 0).getDate();

    return Array.from({ length: totalDays }, (_, index) => index + 1);
  }, [month, year]);

  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  useEffect(() => {
    if (day && Number(day) > days.length) {
      setDay("");
    }
  }, [day, days.length]);

  useEffect(() => {
    const handleBackButton = () => {
      if (stepRef.current === 2) {
        setStep(1);
        return;
      }

      navigate(-1);
    };

    window.addEventListener("popstate", handleBackButton);

    return () => {
      window.removeEventListener("popstate", handleBackButton);
    };
  }, [navigate]);

  const hasSequentialPattern = (value: string): boolean => {
    const text = value.toLowerCase();

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
      for (let index = 0; index <= sequence.length - 4; index += 1) {
        if (text.includes(sequence.slice(index, index + 4))) {
          return true;
        }
      }

      return false;
    });
  };

  const isValidEmailOrPhone = (value: string): boolean => {
    const cleanValue = value.trim();

    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanValue);
    const isBangladeshPhone = /^(?:\+8801|01)[3-9]\d{8}$/.test(cleanValue);

    return isEmail || isBangladeshPhone;
  };

  const closeOrBackStep = () => {
    if (step === 2) {
      setStep(1);
      return;
    }

    navigate(-1);
  };

  const stopClose = (event: React.MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
  };

  const goToLoginPage = () => {
    navigate("/login", { replace: true });
  };

  const handleGoogleSignup = () => {
    setStepOneError("");

    if (!window.google) {
      setStepOneError("Google service is still loading. Please try again.");
      return;
    }

    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
      scope: "email profile openid",

      callback: async (response: any) => {
        try {
          setIsLoading(true);

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
            setStepOneError("Google signup failed");
            return;
          }

          const authResponse = await googleAuthUser({
            email: googleUser.email,
            first_name: googleUser.given_name || "",
            last_name: googleUser.family_name || "",
          });

          if (!authResponse.needs_signup) {
            sessionStorage.setItem("token", authResponse.token);

            navigate("/", {
              replace: true,
            });

            return;
          }

          setEmailOrPhone(googleUser.email);
          setFirstName(googleUser.given_name || "");
          setLastName(googleUser.family_name || "");
          setPassword("google-auth-user");

          setStep(2);

          window.history.pushState({ signupStep: 2 }, "");
        } catch {
          setStepOneError("Google signup failed");
        } finally {
          setIsLoading(false);
        }
      },
    });

    client.requestAccessToken();
  };

  const handleGetStarted = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStepOneError("");

    if (!isValidEmailOrPhone(emailOrPhone)) {
      setStepOneError("Enter a valid email or Bangladesh phone number");
      return;
    }

    if (password.length < 6) {
      setStepOneError("Password must be at least 6 characters");
      return;
    }

    if (hasSequentialPattern(password)) {
      setStepOneError("Password cannot contain sequential letters or digits");
      return;
    }

    setIsLoading(true);

    setTimeout(() => {
      setIsLoading(false);
      setStep(2);
      window.history.pushState({ signupStep: 2 }, "");
    }, 800);
  };

  const handleSignup = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStepTwoError("");

    const totalNameLength = `${firstName}${lastName}`.replace(/\s/g, "").length;

    if (!firstName.trim() || !lastName.trim()) {
      setStepTwoError("First name and last name are required");
      return;
    }

    if (totalNameLength > 30) {
      setStepTwoError(
        "First name and last name together cannot be more than 30 characters"
      );
      return;
    }

    if (!gender) {
      setStepTwoError("Please select your gender");
      return;
    }

    if (!month || !day || !year) {
      setStepTwoError("Please select your full birthdate");
      return;
    }

    try {
      setIsSignupLoading(true);

      const response = await signupUser({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email_or_phone: emailOrPhone.trim(),
        password,
        gender,
        birth_month: Number(month),
        birth_day: Number(day),
        birth_year: Number(year),
      });

      sessionStorage.setItem("token", response.token);

      navigate("/signup-success", { replace: true });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Signup failed";
      setStepTwoError(message);
    } finally {
      setIsSignupLoading(false);
    }
  };

  return (
    <div className="signupPage" onClick={closeOrBackStep}>
      <div className="signupContainer" onClick={stopClose}>
        <h2 className="signupLogo">Mongosky</h2>
        <h1>Create a new account</h1>

        {step === 1 && (
          <>
            <button
              className="googleBtn"
              type="button"
              onClick={handleGoogleSignup}
              disabled={isLoading}
            >
              <img
                src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                alt="Google"
                className="googleIcon"
              />

              <span>Continue with Google</span>
            </button>

            <div className="signupDivider">
              <span></span>
              <p>or</p>
              <span></span>
            </div>

            <form className="signupForm" onSubmit={handleGetStarted}>
              <input
                className="signupField"
                type="text"
                placeholder="Email or Phone"
                value={emailOrPhone}
                onChange={(event) => setEmailOrPhone(event.target.value)}
              />

              <div className="signupPasswordBox">
                <input
                  className="signupField signupPasswordField"
                  type={showPassword ? "text" : "password"}
                  placeholder="Password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />

                <button
                  type="button"
                  className="signupEyeBtn"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <FiEyeOff /> : <FiEye />}
                </button>
              </div>

              {stepOneError && <p className="signupError">{stepOneError}</p>}

              <label className="signupCheck">
                <input type="checkbox" required />
                <span>I agree to Terms and Conditions</span>
              </label>

              <button className="signupBtn" type="submit" disabled={isLoading}>
                {isLoading ? <span className="signupSpinner"></span> : "Get started"}
              </button>

              <p className="signupLogin">
                Already have an account?{" "}

                <button type="button" onClick={goToLoginPage}>
                  Sign In
                </button>
              </p>
            </form>
          </>
        )}

        {step === 2 && (
          <form className="signupForm" onSubmit={handleSignup}>
            <input
              className="signupField"
              type="text"
              placeholder="First name"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
            />

            <input
              className="signupField"
              type="text"
              placeholder="Last name"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
            />

            <select
              className="signupField"
              value={gender}
              onChange={(event) => setGender(event.target.value)}
            >
              <option value="">Gender</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>

            <div className="signupBirthTitle">Birthdate</div>

            <div className="signupBirthFields">
              <select
                className="signupField"
                value={month}
                onChange={(event) => setMonth(event.target.value)}
              >
                <option value="">Month</option>

                {months.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>

              <select
                className="signupField"
                value={day}
                onChange={(event) => setDay(event.target.value)}
              >
                <option value="">Day</option>

                {days.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>

              <select
                className="signupField"
                value={year}
                onChange={(event) => setYear(event.target.value)}
              >
                <option value="">Year</option>

                {years.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>

            {stepTwoError && <p className="signupError">{stepTwoError}</p>}

            <button className="signupBtn" type="submit" disabled={isSignupLoading}>
              {isSignupLoading ? <span className="signupSpinner"></span> : "Sign Up"}
            </button>

            <p className="signupLogin">
              Already have an account?{" "}

              <button type="button" onClick={goToLoginPage}>
                Sign In
              </button>
            </p>
          </form>
        )}
      </div>
    </div>
  );
};

export default Signup;