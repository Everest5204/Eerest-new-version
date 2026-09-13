const DEFAULT_API_BASE_URL = "http://localhost:5000";

// Matches the URL convention in services/authService.ts.
const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL?.trim() || DEFAULT_API_BASE_URL
).replace(/\/+$/, "");

const DELETE_REQUEST_TIMEOUT_MS = 45000;
const STATUS_REQUEST_TIMEOUT_MS = 15000;

export interface DeleteAccountAcceptedResponse {
  readonly status: "accepted";
  readonly message: string;
  readonly deletion_token: string;
}

export interface DeleteAccountProgressResponse {
  readonly status: "processing" | "deleted";
}

export class DeleteAccountError extends Error {
  readonly status: number;

  constructor(message: string, status = 0) {
    super(message);

    this.name = "DeleteAccountError";
    this.status = status;
  }
}

type DeletionRequestOptions = {
  path: string;
  method: "DELETE" | "GET";
  token: string;
  timeoutMs: number;
  failureMessage: string;
  signal?: AbortSignal;
  body?: {
    confirm: true;
    current_password: string;
  };
};

type DeletionHTTPResponse = {
  status: number;
  data: unknown;
};

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function getErrorMessage(
  data: unknown,
  fallback: string,
): string {
  if (!isRecord(data)) {
    return fallback;
  }

  for (const field of ["message", "error"]) {
    const value = data[field];

    if (typeof value === "string" && value.trim()) {
      return value.trim().slice(0, 300);
    }
  }

  return fallback;
}

async function sendDeletionRequest(
  options: DeletionRequestOptions,
): Promise<DeletionHTTPResponse> {
  const {
    path,
    method,
    token,
    timeoutMs,
    failureMessage,
    signal,
    body,
  } = options;

  if (!token.trim()) {
    throw new DeleteAccountError(
      "Authorization is required.",
      401,
    );
  }

  if (signal?.aborted) {
    throw new DOMException(
      "The request was cancelled.",
      "AbortError",
    );
  }

  const controller = new AbortController();
  let timedOut = false;

  const cancelRequest = () => {
    controller.abort();
  };

  signal?.addEventListener("abort", cancelRequest, {
    once: true,
  });

  const timeoutID = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const headers = new Headers({
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    });

    if (body !== undefined) {
      headers.set("Content-Type", "application/json");
    }

    // Use the token supplied by the caller.
    // Do not replace it with a newer session's token.
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
    });

    const responseText = await response.text();
    let data: unknown = null;
    let validJSON = false;

    if (responseText) {
      try {
        data = JSON.parse(responseText);
        validJSON = true;
      } catch {
        validJSON = false;
      }
    }

    if (!response.ok) {
      throw new DeleteAccountError(
        getErrorMessage(data, failureMessage),
        response.status,
      );
    }

    if (!validJSON) {
      throw new DeleteAccountError(
        "The server returned an unexpected response. The result could not be confirmed.",
        502,
      );
    }

    return {
      status: response.status,
      data,
    };
  } catch (cause: unknown) {
    if (signal?.aborted) {
      throw new DOMException(
        "The request was cancelled.",
        "AbortError",
      );
    }

    if (timedOut) {
      throw new DeleteAccountError(
        `The request timed out. ${failureMessage}`,
      );
    }

    if (cause instanceof DeleteAccountError) {
      throw cause;
    }

    // Do not expose request headers, credentials or raw network errors.
    throw new DeleteAccountError(failureMessage);
  } finally {
    window.clearTimeout(timeoutID);
    signal?.removeEventListener("abort", cancelRequest);
  }
}

export async function requestAccountDeletion(
  currentPassword: string,
  authToken: string,
): Promise<DeleteAccountAcceptedResponse> {
  if (currentPassword.length === 0) {
    throw new DeleteAccountError(
      "Enter your current password to continue.",
      400,
    );
  }

  const response = await sendDeletionRequest({
    path: "/api/auth/delete-account",
    method: "DELETE",
    token: authToken,
    timeoutMs: DELETE_REQUEST_TIMEOUT_MS,
    failureMessage:
      "We could not confirm your deletion request. Please try again.",
    body: {
      confirm: true,
      current_password: currentPassword,
    },
  });

  const data = response.data;

  if (
    response.status !== 202 ||
    !isRecord(data) ||
    data.status !== "accepted" ||
    typeof data.deletion_token !== "string" ||
    !data.deletion_token.trim() ||
    data.deletion_token.length > 4096
  ) {
    throw new DeleteAccountError(
      "Your request may have been accepted, but deletion progress could not be verified.",
      502,
    );
  }

  return {
    status: "accepted",
    deletion_token: data.deletion_token.trim(),
    message:
      typeof data.message === "string" && data.message.trim()
        ? data.message
        : "Your account deletion request has been accepted.",
  };
}

export async function getAccountDeletionStatus(
  deletionToken: string,
  signal?: AbortSignal,
): Promise<DeleteAccountProgressResponse> {
  const response = await sendDeletionRequest({
    path: "/api/auth/delete-account/status",
    method: "GET",
    token: deletionToken,
    timeoutMs: STATUS_REQUEST_TIMEOUT_MS,
    signal,
    failureMessage: "Deletion progress could not be verified.",
  });

  const data = response.data;

  if (
    response.status !== 200 ||
    !isRecord(data) ||
    (data.status !== "processing" && data.status !== "deleted")
  ) {
    throw new DeleteAccountError(
      "The server did not provide a valid deletion status.",
      502,
    );
  }

  return {
    status: data.status,
  };
}