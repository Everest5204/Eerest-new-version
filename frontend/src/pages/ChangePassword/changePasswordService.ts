import axios from "axios";

import api from "../../services/api";

export type ChangePasswordRequest = {
  current_password: string;
  new_password: string;
  confirm_password: string;
};

export type ChangePasswordResponse = {
  message: string;
};

export class ChangePasswordError extends Error {
  readonly status: number | undefined;

  constructor(
    message: string,
    status?: number,
  ) {
    super(message);

    this.name = "ChangePasswordError";
    this.status = status;
  }
}

const getErrorMessage = (
  data: unknown,
  fallback: string,
): string => {
  if (typeof data === "string" && data.trim()) {
    return data.trim();
  }

  if (typeof data === "object" && data !== null) {
    if (
      "message" in data &&
      typeof data.message === "string" &&
      data.message.trim()
    ) {
      return data.message.trim();
    }

    if (
      "error" in data &&
      typeof data.error === "string" &&
      data.error.trim()
    ) {
      return data.error.trim();
    }
  }

  return fallback;
};

export const changePassword = async (
  request: ChangePasswordRequest,
  signal?: AbortSignal,
): Promise<ChangePasswordResponse> => {
  try {
    const response =
      await api.post<ChangePasswordResponse>(
        "/auth/change-password",
        request,
        {
          signal,
        },
      );

    return response.data;
  } catch (error: unknown) {
    if (signal?.aborted || axios.isCancel(error)) {
      throw new DOMException(
        "Request cancelled.",
        "AbortError",
      );
    }

    if (axios.isAxiosError(error)) {
      const status = error.response?.status;

      if (status === 401) {
        throw new ChangePasswordError(
          "Your session has expired. Please sign in again.",
          status,
        );
      }

      const isTimeout =
        error.code === "ECONNABORTED" ||
        error.code === "ETIMEDOUT";

      const fallback = isTimeout
        ? "The request timed out. Please check your connection and try again."
        : !error.response
          ? "Unable to connect to the server. Please check your connection."
          : "Unable to change your password. Please try again.";

      throw new ChangePasswordError(
        getErrorMessage(
          error.response?.data,
          fallback,
        ),
        status,
      );
    }

    throw new ChangePasswordError(
      "Something went wrong. Please try again.",
    );
  }
};