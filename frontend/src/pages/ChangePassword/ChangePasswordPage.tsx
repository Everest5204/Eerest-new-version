import { useState } from "react";

import {
  Link,
  useNavigate,
} from "react-router-dom";

import {
  ArrowLeft,
  Eye,
  EyeOff,
  LoaderCircle,
} from "lucide-react";

import { useChangePassword } from "./useChangePassword";

type PasswordInputProps = {
  id: string;
  label: string;
  value: string;
  autoComplete: "current-password" | "new-password";
  disabled: boolean;
  onValueChange: (value: string) => void;
};

const PasswordInput = ({
  id,
  label,
  value,
  autoComplete,
  disabled,
  onValueChange,
}: PasswordInputProps) => {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="tw:relative tw:w-full">
      <label
        htmlFor={id}
        className="tw:sr-only"
      >
        {label}
      </label>

      <input
        id={id}
        name={id}
        type={showPassword ? "text" : "password"}
        value={value}
        placeholder={label}
        autoComplete={autoComplete}
        autoCapitalize="none"
        spellCheck={false}
        required
        disabled={disabled}
        aria-describedby="change-password-help"
        onChange={(event) =>
          onValueChange(event.target.value)
        }
        className="tw:block tw:h-[62px] tw:w-full
          tw:appearance-none tw:rounded-2xl tw:border
          tw:border-solid tw:border-zinc-200 tw:bg-white
          tw:py-4 tw:pl-4 tw:pr-14 tw:font-sans
          tw:text-base tw:leading-6 tw:text-zinc-900
          tw:placeholder:text-zinc-500
          tw:transition-colors tw:duration-150
          tw:focus:border-green-700
          tw:focus:outline-2 tw:focus:outline-solid
          tw:focus:outline-offset-2 tw:focus:outline-green-700
          tw:disabled:cursor-wait tw:disabled:bg-zinc-50
          tw:motion-reduce:transition-none"
      />

      <button
        type="button"
        disabled={disabled}
        aria-label={
          showPassword
            ? `Hide ${label.toLowerCase()}`
            : `Show ${label.toLowerCase()}`
        }
        aria-controls={id}
        onClick={() =>
          setShowPassword((previousValue) => !previousValue)
        }
        className="tw:absolute tw:inset-y-2 tw:right-1
          tw:flex tw:w-11 tw:items-center tw:justify-center
          tw:rounded-xl tw:border-0 tw:bg-transparent
          tw:p-0 tw:text-zinc-500 tw:cursor-pointer
          tw:touch-manipulation tw:hover:text-zinc-800
          tw:focus-visible:outline-2
          tw:focus-visible:outline-solid
          tw:focus-visible:outline-green-700
          tw:disabled:cursor-wait tw:disabled:opacity-50"
      >
        {showPassword ? (
          <EyeOff
            size={20}
            aria-hidden="true"
          />
        ) : (
          <Eye
            size={20}
            aria-hidden="true"
          />
        )}
      </button>
    </div>
  );
};

export const ChangePasswordPage = () => {
  const navigate = useNavigate();

  const {
    values,
    updateField,
    handleSubmit,
    isSubmitting,
    error,
    success,
  } = useChangePassword();

  return (
    <main
      aria-labelledby="change-password-title"
      className="tw:min-h-dvh tw:w-full tw:bg-white
        tw:font-sans tw:text-zinc-900"
    >
      <div
        className="tw:mx-auto tw:w-full tw:max-w-xl
          tw:px-5 tw:pt-5 tw:pb-12
          tw:sm:px-8 tw:sm:pt-7"
      >
        <header className="tw:flex tw:items-center tw:gap-2">
          <button
            type="button"
            aria-label="Return to previous page"
            onClick={() => navigate(-1)}
            className="tw:flex tw:h-11 tw:w-11
              tw:shrink-0 tw:items-center tw:justify-center
              tw:rounded-full tw:border-0 tw:bg-transparent
              tw:p-0 tw:text-zinc-900 tw:cursor-pointer
              tw:touch-manipulation tw:hover:bg-zinc-100
              tw:focus-visible:outline-2
              tw:focus-visible:outline-solid
              tw:focus-visible:outline-offset-2
              tw:focus-visible:outline-green-700"
          >
            <ArrowLeft
              size={23}
              strokeWidth={2}
              aria-hidden="true"
            />
          </button>

          <h1
            id="change-password-title"
            className="tw:m-0 tw:text-2xl tw:font-semibold
              tw:leading-8 tw:tracking-tight"
          >
            Change password
          </h1>
        </header>

        <p
          id="change-password-help"
          className="tw:mt-5 tw:text-sm tw:font-medium
            tw:leading-6 tw:text-zinc-700 tw:sm:text-base"
        >
          You can use this password to log in to your account.
          Your new password must be at least 6 characters.
        </p>

        <form
          noValidate
          onSubmit={handleSubmit}
          aria-busy={isSubmitting}
          className="tw:mt-5 tw:w-full tw:max-w-sm"
        >
          <div className="tw:flex tw:flex-col tw:gap-3">
            <PasswordInput
              id="change-current-password"
              label="Current password"
              value={values.currentPassword}
              autoComplete="current-password"
              disabled={isSubmitting}
              onValueChange={(value) =>
                updateField("currentPassword", value)
              }
            />

            <PasswordInput
              id="change-new-password"
              label="New password"
              value={values.newPassword}
              autoComplete="new-password"
              disabled={isSubmitting}
              onValueChange={(value) =>
                updateField("newPassword", value)
              }
            />

            <PasswordInput
              id="change-confirm-password"
              label="Re-type new password"
              value={values.confirmPassword}
              autoComplete="new-password"
              disabled={isSubmitting}
              onValueChange={(value) =>
                updateField("confirmPassword", value)
              }
            />
          </div>

          {error && (
            <p
              role="alert"
              className="tw:mt-4 tw:rounded-xl tw:bg-red-50
                tw:p-3 tw:text-sm tw:leading-5 tw:text-red-700"
            >
              {error}
            </p>
          )}

          {success && (
            <p
              role="status"
              className="tw:mt-4 tw:rounded-xl tw:bg-green-50
                tw:p-3 tw:text-sm tw:leading-5 tw:text-green-800"
            >
              {success}
            </p>
          )}

          <Link
            to="/forgot-password"
            className="tw:mt-3 tw:inline-flex tw:min-h-11
              tw:items-center tw:rounded-sm tw:text-sm
              tw:font-semibold tw:text-blue-600 tw:no-underline
              tw:touch-manipulation tw:hover:underline
              tw:focus-visible:outline-2
              tw:focus-visible:outline-solid
              tw:focus-visible:outline-offset-2
              tw:focus-visible:outline-blue-600"
          >
            Forgot your password?
          </Link>

          <button
            type="submit"
            disabled={isSubmitting}
            className="tw:mt-1 tw:flex tw:min-h-12 tw:w-full
              tw:items-center tw:justify-center tw:gap-2
              tw:rounded-full tw:border-0 tw:bg-green-700
              tw:px-5 tw:py-3 tw:font-sans tw:text-base
              tw:font-semibold tw:leading-6 tw:text-white
              tw:cursor-pointer tw:touch-manipulation
              tw:transition-colors tw:duration-150
              tw:hover:bg-green-800 tw:active:bg-green-900
              tw:focus-visible:outline-2
              tw:focus-visible:outline-solid
              tw:focus-visible:outline-offset-2
              tw:focus-visible:outline-green-700
              tw:disabled:cursor-wait tw:disabled:opacity-60
              tw:motion-reduce:transition-none"
          >
            {isSubmitting && (
              <LoaderCircle
                size={20}
                aria-hidden="true"
                className="tw:shrink-0 tw:animate-spin
                  tw:motion-reduce:animate-none"
              />
            )}

            {isSubmitting
              ? "Changing password..."
              : "Change password"}
          </button>
        </form>
      </div>
    </main>
  );
};