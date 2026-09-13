import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";

import { useNavigate } from "react-router-dom";

import {
  changePassword,
  ChangePasswordError,
} from "./changePasswordService";

type PasswordForm = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

type PasswordField = keyof PasswordForm;

const INITIAL_VALUES: PasswordForm = {
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
};

const validateForm = (
  values: PasswordForm,
): string => {
  if (!values.currentPassword) {
    return "Please enter your current password.";
  }

  if (!values.newPassword) {
    return "Please enter your new password.";
  }

  if (Array.from(values.newPassword).length < 6) {
    return "New password must be at least 6 characters.";
  }

  if (
    new TextEncoder().encode(values.newPassword).length > 72
  ) {
    return "New password is too long.";
  }

  if (!values.confirmPassword) {
    return "Please re-type your new password.";
  }

  if (values.newPassword !== values.confirmPassword) {
    return "New passwords do not match.";
  }

  if (values.newPassword === values.currentPassword) {
    return "New password must be different from your current password.";
  }

  return "";
};

export const useChangePassword = () => {
  const navigate = useNavigate();

  const [values, setValues] =
    useState<PasswordForm>(INITIAL_VALUES);

  const [isSubmitting, setIsSubmitting] =
    useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const requestRef =
    useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      const activeRequest = requestRef.current;

      requestRef.current = null;
      activeRequest?.abort();
    };
  }, []);

  const updateField = useCallback(
    (
      field: PasswordField,
      value: string,
    ) => {
      if (requestRef.current) {
        return;
      }

      setValues((previousValues) => ({
        ...previousValues,
        [field]: value,
      }));

      setError("");
      setSuccess("");
    },
    [],
  );

  const handleSubmit = useCallback(
    async (
      event: FormEvent<HTMLFormElement>,
    ): Promise<void> => {
      event.preventDefault();

      // Block duplicate requests, including rapid clicks.
      if (requestRef.current) {
        return;
      }

      setError("");
      setSuccess("");

      const validationError = validateForm(values);

      if (validationError) {
        setError(validationError);
        return;
      }

      const controller = new AbortController();

      requestRef.current = controller;
      setIsSubmitting(true);

      try {
        const response = await changePassword(
          {
            current_password: values.currentPassword,
            new_password: values.newPassword,
            confirm_password: values.confirmPassword,
          },
          controller.signal,
        );

        if (
          controller.signal.aborted ||
          requestRef.current !== controller
        ) {
          return;
        }

        setValues(INITIAL_VALUES);

        setSuccess(
          response.message ||
            "Your password has been changed successfully.",
        );
      } catch (caughtError: unknown) {
        if (
          controller.signal.aborted ||
          requestRef.current !== controller
        ) {
          return;
        }

        if (
          caughtError instanceof Error &&
          caughtError.name === "AbortError"
        ) {
          return;
        }

        if (
          caughtError instanceof ChangePasswordError &&
          caughtError.status === 401
        ) {
          setValues(INITIAL_VALUES);

          navigate("/login", {
            replace: true,
          });

          return;
        }

        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to change your password. Please try again.",
        );
      } finally {
        if (requestRef.current === controller) {
          requestRef.current = null;
          setIsSubmitting(false);
        }
      }
    },
    [navigate, values],
  );

  return {
    values,
    updateField,
    handleSubmit,
    isSubmitting,
    error,
    success,
  };
};