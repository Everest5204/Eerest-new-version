import {
  useId,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  BadgeCheck,
  Eye,
  EyeOff,
  Heart,
  Image as ImageIcon,
  Info,
  LockKeyhole,
  MessageCircle,
  Trash2,
  TriangleAlert,
  UserRound,
  Users,
} from "lucide-react";

import { DeleteAccountDialog } from "./DeleteAccountDialog";

const deletionItems = [
  {
    icon: UserRound,
    text: "Your profile information, profile photo and cover photo",
  },
  {
    icon: ImageIcon,
    text: "Your posts, uploaded photos and videos",
  },
  {
    icon: Users,
    text: "Your followers and following list",
  },
  {
    icon: MessageCircle,
    text: "Your comments, replies and AI chat history",
  },
  {
    icon: BadgeCheck,
    text: "Your verification badge and account details",
  },
  {
    icon: Heart,
    text: "Your reactions and account-related notifications",
  },
];

export function DeleteAccountPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const passwordId = useId();
  const passwordErrorId = useId();
  const passwordInputRef = useRef<HTMLInputElement | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleBack = () => {
    if (location.key === "default") {
      navigate("/settings", { replace: true });
      return;
    }

    navigate(-1);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isDialogOpen) {
      return;
    }

    // Preserve the exact password, including any spaces.
    if (currentPassword.length === 0) {
      setPasswordError("Enter your current password to continue.");
      passwordInputRef.current?.focus();
      return;
    }

    setPasswordError("");
    setShowPassword(false);
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setCurrentPassword("");
    setPasswordError("");
    setShowPassword(false);
  };

  return (
    <div className="tw:min-h-dvh tw:bg-white tw:font-sans tw:text-slate-900">
      <header className="tw:bg-white">
        <div className="tw:mx-auto tw:grid tw:min-h-14 tw:w-full tw:max-w-md tw:grid-cols-[44px_1fr_44px] tw:items-center tw:px-2">
          <button
            type="button"
            onClick={handleBack}
            aria-label="Go back"
            className="tw:flex tw:size-11 tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-full tw:border-0 tw:bg-transparent tw:text-slate-900 tw:transition-colors tw:touch-manipulation tw:hover:bg-slate-100 tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:focus-visible:outline-slate-700"
          >
            <ArrowLeft
              size={22}
              strokeWidth={2}
              aria-hidden="true"
            />
          </button>

          <h1 className="tw:m-0 tw:text-center tw:text-lg tw:font-semibold">
            Delete Account
          </h1>

          <span aria-hidden="true" />
        </div>
      </header>

      <main className="tw:mx-auto tw:w-full tw:max-w-md tw:px-4 tw:pt-2 tw:pb-[calc(1.5rem+env(safe-area-inset-bottom))] tw:sm:px-6">
        <div className="tw:text-center">
          <div className="tw:mx-auto tw:flex tw:size-20 tw:items-center tw:justify-center tw:rounded-full tw:bg-red-50">
            <Trash2
              size={42}
              strokeWidth={1.8}
              className="tw:text-red-600"
              aria-hidden="true"
            />
          </div>

          <h2 className="tw:m-0 tw:mt-3 tw:text-2xl tw:font-bold tw:leading-8 tw:tracking-tight">
            Delete Your Account
          </h2>

          <p className="tw:m-0 tw:mt-2 tw:text-sm tw:leading-6 tw:text-slate-500">
            We&apos;re sorry to see you go. Please read the information
            below before deleting your account.
          </p>
        </div>

        <section
          aria-labelledby="delete-account-warning"
          className="tw:mt-5 tw:flex tw:items-start tw:gap-3 tw:rounded-xl tw:bg-red-50 tw:p-4"
        >
          <TriangleAlert
            size={25}
            className="tw:mt-0.5 tw:shrink-0 tw:fill-red-600 tw:text-white"
            aria-hidden="true"
          />

          <div className="tw:min-w-0">
            <h3
              id="delete-account-warning"
              className="tw:m-0 tw:text-sm tw:font-semibold tw:leading-5 tw:text-red-600"
            >
              This action cannot be undone
            </h3>

            <p className="tw:m-0 tw:mt-1 tw:text-xs tw:leading-5 tw:text-slate-600">
              Your account and associated data will be removed from
              our active systems. Deleted accounts have no restore
              option in Mongosky.
            </p>
          </div>
        </section>

        <section
          aria-labelledby="delete-account-data"
          className="tw:mt-5 tw:px-2"
        >
          <h3
            id="delete-account-data"
            className="tw:m-0 tw:text-sm tw:font-semibold"
          >
            What will be deleted?
          </h3>

          <ul className="tw:m-0 tw:mt-3 tw:list-none tw:space-y-3 tw:p-0">
            {deletionItems.map((item) => {
              const Icon = item.icon;

              return (
                <li
                  key={item.text}
                  className="tw:flex tw:items-start tw:gap-3"
                >
                  <Icon
                    size={18}
                    strokeWidth={1.8}
                    className="tw:mt-0.5 tw:shrink-0 tw:text-slate-500"
                    aria-hidden="true"
                  />

                  <span className="tw:text-xs tw:leading-5 tw:text-slate-600">
                    {item.text}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <section
          aria-labelledby="delete-account-information"
          className="tw:mt-5 tw:flex tw:items-start tw:gap-3 tw:rounded-xl tw:border tw:border-solid tw:border-blue-100 tw:bg-blue-50 tw:p-4"
        >
          <Info
            size={24}
            className="tw:mt-0.5 tw:shrink-0 tw:fill-blue-600 tw:text-white"
            aria-hidden="true"
          />

          <div className="tw:min-w-0">
            <h3
              id="delete-account-information"
              className="tw:m-0 tw:text-sm tw:font-semibold tw:text-blue-600"
            >
              Before you delete
            </h3>

            <p className="tw:m-0 tw:mt-1 tw:text-xs tw:leading-5 tw:text-slate-600">
              Save anything you want to keep. Cleanup may take time.
              Copies in backups or saved by other people may remain
              after deletion from active systems.
            </p>
          </div>
        </section>

        <form
          onSubmit={handleSubmit}
          noValidate
          className="tw:mt-5"
        >
          <label
            htmlFor={passwordId}
            className="tw:block tw:text-xs tw:font-semibold tw:leading-5"
          >
            To confirm, please enter your password
          </label>

          <div className="tw:relative tw:mt-2">
            <LockKeyhole
              size={18}
              className="tw:pointer-events-none tw:absolute tw:top-1/2 tw:left-3 tw:-translate-y-1/2 tw:text-slate-500"
              aria-hidden="true"
            />

            <input
              ref={passwordInputRef}
              id={passwordId}
              name="currentPassword"
              type={showPassword ? "text" : "password"}
              value={currentPassword}
              onChange={(event) => {
                setCurrentPassword(event.target.value);
                setPasswordError("");
              }}
              autoComplete="current-password"
              autoCapitalize="none"
              spellCheck={false}
              required
              disabled={isDialogOpen}
              placeholder="Enter your password"
              aria-invalid={Boolean(passwordError)}
              aria-describedby={
                passwordError ? passwordErrorId : undefined
              }
              className="tw:min-h-12 tw:w-full tw:rounded-xl tw:border tw:border-solid tw:border-slate-200 tw:bg-white tw:py-3 tw:pr-12 tw:pl-10 tw:font-sans tw:text-base tw:text-slate-900 tw:placeholder:text-sm tw:placeholder:text-slate-400 tw:focus:border-red-400 tw:focus:outline-2 tw:focus:outline-offset-1 tw:focus:outline-red-100 tw:disabled:opacity-70"
            />

            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              disabled={isDialogOpen}
              aria-label={
                showPassword ? "Hide password" : "Show password"
              }
              aria-controls={passwordId}
              aria-pressed={showPassword}
              className="tw:absolute tw:top-1/2 tw:right-1 tw:flex tw:size-10 tw:-translate-y-1/2 tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-lg tw:border-0 tw:bg-transparent tw:text-slate-500 tw:touch-manipulation tw:hover:text-slate-800 tw:focus-visible:outline-2 tw:focus-visible:outline-slate-500"
            >
              {showPassword ? (
                <EyeOff size={19} aria-hidden="true" />
              ) : (
                <Eye size={19} aria-hidden="true" />
              )}
            </button>
          </div>

          {passwordError && (
            <p
              id={passwordErrorId}
              role="alert"
              className="tw:m-0 tw:mt-2 tw:text-xs tw:leading-5 tw:text-red-600"
            >
              {passwordError}
            </p>
          )}

          <button
            type="submit"
            disabled={isDialogOpen}
            aria-haspopup="dialog"
            className="tw:mt-4 tw:flex tw:min-h-12 tw:w-full tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-xl tw:border-0 tw:bg-red-500 tw:px-4 tw:py-3 tw:font-sans tw:text-sm tw:font-semibold tw:text-white tw:transition-colors tw:touch-manipulation tw:hover:bg-red-600 tw:active:bg-red-700 tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:focus-visible:outline-red-600 tw:disabled:cursor-default tw:disabled:opacity-60"
          >
            Delete My Account
          </button>
        </form>

        <button
          type="button"
          onClick={handleBack}
          className="tw:mx-auto tw:mt-3 tw:flex tw:min-h-11 tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-lg tw:border-0 tw:bg-transparent tw:px-6 tw:font-sans tw:text-sm tw:font-medium tw:text-slate-500 tw:touch-manipulation tw:hover:text-slate-800 tw:focus-visible:outline-2 tw:focus-visible:outline-slate-500"
        >
          Cancel
        </button>
      </main>

      {isDialogOpen && (
        <DeleteAccountDialog
          currentPassword={currentPassword}
          onClose={handleCloseDialog}
        />
      )}
    </div>
  );
}