import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";

import { useNavigate } from "react-router-dom";

import {
  ChangeNameAPIError,
  getNameStatus,
  updateName,
  type NameStatus,
} from "./changeNameService";

import "./ChangeNamePage.css";

const normalizeName = (
  value: string,
): string => {
  return value.trim().replace(/\s+/g, " ");
};

const getCombinedNameLength = (
  firstName: string,
  lastName: string,
): number => {
  const combinedName =
    `${firstName}${lastName}`.replace(
      /\s+/g,
      "",
    );

  return Array.from(combinedName).length;
};

const formatRemainingTime = (
  milliseconds: number,
): string => {
  const totalSeconds = Math.max(
    0,
    Math.ceil(milliseconds / 1000),
  );

  const days = Math.floor(
    totalSeconds / 86400,
  );

  const hours = Math.floor(
    (totalSeconds % 86400) / 3600,
  );

  const minutes = Math.floor(
    (totalSeconds % 3600) / 60,
  );

  const seconds = totalSeconds % 60;

  const parts: string[] = [];

  if (days > 0) {
    parts.push(
      `${days} ${days === 1 ? "day" : "days"}`,
    );
  }

  if (hours > 0 || days > 0) {
    parts.push(
      `${hours} ${
        hours === 1 ? "hour" : "hours"
      }`,
    );
  }

  if (
    minutes > 0 ||
    hours > 0 ||
    days > 0
  ) {
    parts.push(
      `${minutes} ${
        minutes === 1
          ? "minute"
          : "minutes"
      }`,
    );
  }

  parts.push(
    `${seconds} ${
      seconds === 1
        ? "second"
        : "seconds"
    }`,
  );

  return parts.join(", ");
};

const formatAvailableDate = (
  value?: string,
): string => {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat(
    undefined,
    {
      dateStyle: "long",
      timeStyle: "short",
    },
  ).format(date);
};

const ChangeNamePage = () => {
  const navigate = useNavigate();

  const [nameStatus, setNameStatus] =
    useState<NameStatus | null>(null);

  const [firstName, setFirstName] =
    useState("");

  const [lastName, setLastName] =
    useState("");

  const [
    initialFirstName,
    setInitialFirstName,
  ] = useState("");

  const [
    initialLastName,
    setInitialLastName,
  ] = useState("");

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState("");

  const [
    successMessage,
    setSuccessMessage,
  ] = useState("");

  const [currentTime, setCurrentTime] =
    useState(() => Date.now());

  useEffect(() => {
    let isActive = true;

    const loadCurrentName = async () => {
      try {
        setLoading(true);
        setErrorMessage("");

        const status =
          await getNameStatus();

        if (!isActive) {
          return;
        }

        setNameStatus(status);
        setFirstName(status.first_name);
        setLastName(status.last_name);

        setInitialFirstName(
          status.first_name,
        );

        setInitialLastName(
          status.last_name,
        );

        setCurrentTime(Date.now());
      } catch (error) {
        if (!isActive) {
          return;
        }

        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to load your name",
        );
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    };

    void loadCurrentName();

    return () => {
      isActive = false;
    };
  }, []);

  const nextChangeTime = useMemo(() => {
    const value =
      nameStatus?.next_change_at;

    if (!value) {
      return 0;
    }

    const timestamp =
      new Date(value).getTime();

    return Number.isNaN(timestamp)
      ? 0
      : timestamp;
  }, [nameStatus?.next_change_at]);

  const remainingMilliseconds =
    Math.max(
      0,
      nextChangeTime - currentTime,
    );

  const isLocked =
    nextChangeTime > 0 &&
    remainingMilliseconds > 0;

  useEffect(() => {
    if (!isLocked) {
      return;
    }

    const intervalID =
      window.setInterval(() => {
        setCurrentTime(Date.now());
      }, 1000);

    return () => {
      window.clearInterval(intervalID);
    };
  }, [isLocked]);

  const normalizedFirstName =
    normalizeName(firstName);

  const normalizedLastName =
    normalizeName(lastName);

  const combinedNameLength =
    getCombinedNameLength(
      normalizedFirstName,
      normalizedLastName,
    );

  const validationMessage = useMemo(() => {
    if (
      !normalizedFirstName ||
      !normalizedLastName
    ) {
      return "First name and last name are required.";
    }

    if (combinedNameLength > 30) {
      return "First name and last name together cannot exceed 30 characters.";
    }

    return "";
  }, [
    combinedNameLength,
    normalizedFirstName,
    normalizedLastName,
  ]);

  const hasChanged =
    normalizedFirstName !==
      normalizeName(initialFirstName) ||
    normalizedLastName !==
      normalizeName(initialLastName);

  const canSave =
    !loading &&
    !saving &&
    !isLocked &&
    hasChanged &&
    !validationMessage;

  const handleFirstNameChange =
    useCallback(
      (
        event:
          ChangeEvent<HTMLInputElement>,
      ) => {
        setFirstName(event.target.value);
        setErrorMessage("");
        setSuccessMessage("");
      },
      [],
    );

  const handleLastNameChange =
    useCallback(
      (
        event:
          ChangeEvent<HTMLInputElement>,
      ) => {
        setLastName(event.target.value);
        setErrorMessage("");
        setSuccessMessage("");
      },
      [],
    );

  const handleCancel = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    if (!canSave) {
      return;
    }

    try {
      setSaving(true);
      setErrorMessage("");
      setSuccessMessage("");

      const updatedStatus =
        await updateName({
          first_name:
            normalizedFirstName,
          last_name:
            normalizedLastName,
        });

      setNameStatus(updatedStatus);

      setFirstName(
        updatedStatus.first_name,
      );

      setLastName(
        updatedStatus.last_name,
      );

      setInitialFirstName(
        updatedStatus.first_name,
      );

      setInitialLastName(
        updatedStatus.last_name,
      );

      setCurrentTime(Date.now());

      setSuccessMessage(
        "Your profile name has been updated.",
      );
    } catch (error) {
      if (
        error instanceof
          ChangeNameAPIError &&
        error.nextChangeAt
      ) {
        setNameStatus(
          (currentStatus) => ({
            first_name:
              currentStatus?.first_name ??
              initialFirstName,

            last_name:
              currentStatus?.last_name ??
              initialLastName,

            can_change: false,

            last_changed_at:
              currentStatus
                ?.last_changed_at,

            next_change_at:
              error.nextChangeAt,
          }),
        );

        setCurrentTime(Date.now());
      }

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to update your name",
      );
    } finally {
      setSaving(false);
    }
  };

  const availableDate =
    formatAvailableDate(
      nameStatus?.next_change_at,
    );

  return (
    <main className="change-name-page">
      <header className="change-name-header">
        <span className="change-name-brand">
          Mongosky
        </span>
      </header>

      <section className="change-name-content">
        <div className="change-name-introduction">
          <h1>Change Name</h1>

          <p>
            Profile name can be changed a
            limited number of times. After
            changing your name, you must wait
            30 days to change it again.
          </p>
        </div>

        {loading ? (
          <div
            className="change-name-loading"
            role="status"
            aria-live="polite"
          >
            <span
              className="change-name-spinner"
              aria-hidden="true"
            />

            <span>
              Loading your name...
            </span>
          </div>
        ) : (
          <form
            className="change-name-form"
            onSubmit={handleSubmit}
            noValidate
          >
            {isLocked && (
              <div
                className="change-name-lock-message"
                role="status"
                aria-live="polite"
              >
                <strong>
                  You cannot change your name
                  right now.
                </strong>

                <span>
                  You can change it again in{" "}
                  {formatRemainingTime(
                    remainingMilliseconds,
                  )}.
                </span>

                {availableDate && (
                  <span>
                    Available after{" "}
                    {availableDate}.
                  </span>
                )}
              </div>
            )}

            <div className="change-name-field">
              <label htmlFor="first-name">
                First name
              </label>

              <input
                id="first-name"
                name="first_name"
                type="text"
                value={firstName}
                onChange={
                  handleFirstNameChange
                }
                readOnly={isLocked}
                autoComplete="given-name"
                maxLength={30}
              />
            </div>

            <div className="change-name-field">
              <label htmlFor="last-name">
                Last name
              </label>

              <input
                id="last-name"
                name="last_name"
                type="text"
                value={lastName}
                onChange={
                  handleLastNameChange
                }
                readOnly={isLocked}
                autoComplete="family-name"
                maxLength={30}
              />
            </div>

            {!isLocked &&
              hasChanged &&
              validationMessage && (
                <p
                  className="change-name-error"
                  role="alert"
                >
                  {validationMessage}
                </p>
              )}

            {errorMessage && (
              <p
                className="change-name-error"
                role="alert"
              >
                {errorMessage}
              </p>
            )}

            {successMessage && (
              <p
                className="change-name-success"
                role="status"
              >
                {successMessage}
              </p>
            )}

            <button
              className="change-name-save-button"
              type="submit"
              disabled={!canSave}
            >
              {saving
                ? "Saving..."
                : "Save Changes"}
            </button>

            <button
              className="change-name-cancel-button"
              type="button"
              onClick={handleCancel}
              disabled={saving}
            >
              Cancel
            </button>
          </form>
        )}
      </section>
    </main>
  );
};

export default ChangeNamePage;