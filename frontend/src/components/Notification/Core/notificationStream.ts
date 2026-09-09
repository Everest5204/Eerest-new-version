import api from "../../../services/api";

import {
  NotificationResponseError,
  parseNotificationErrorResponse,
  parseNotificationListResponse,
} from "./notificationService";

import type { NotificationListResponse } from "./notification.types";

const INITIAL_RETRY_MS = 1_000;
const MAX_RETRY_MS = 30_000;
const CONNECT_TIMEOUT_MS = 15_000;
const IDLE_TIMEOUT_MS = 45_000; // Backend heartbeats arrive every 15 seconds.
const MAX_EVENT_CHARACTERS = 1_048_576;

export type NotificationStreamStatus =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "offline"
  | "unauthorized"
  | "error"
  | "closed";

export interface NotificationStreamOptions {
  /** Capture the authenticated sessionStorage token when the provider starts. */
  readonly token: string;
  readonly onSnapshot: (snapshot: NotificationListResponse) => void;
  readonly onStatusChange?: (status: NotificationStreamStatus) => void;
  readonly onError?: (error: Error) => void;
  readonly signal?: AbortSignal;
}

class StreamFailure extends Error {
  readonly retryable: boolean;

  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = "NotificationStreamError";
    this.retryable = retryable;
  }
}

// One owner per browser tab: NotificationProvider, not individual feature rows.
let activeCleanup: (() => void) | undefined;

/**
 * Starts the authenticated SSE connection and returns an idempotent cleanup.
 * Return that cleanup from the provider's effect. Restart when its token changes.
 * Snapshots replace the first page; they must not be appended as new events.
 */
export const startNotificationStream = (
  options: NotificationStreamOptions,
): (() => void) => {
  activeCleanup?.();

  const token = options.token;
  const browser = typeof window === "undefined" ? undefined : window;
  const page = typeof document === "undefined" ? undefined : document;
  let stopped = false;
  let attempt: AbortController | undefined;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let wakeRetry: (() => void) | undefined;
  let finishRetry: (() => void) | undefined;
  let status: NotificationStreamStatus | undefined;
  let lastActivity = Date.now();
  let serverRetryMs = INITIAL_RETRY_MS;
  let failures = 0;

  const cleanup = () => {
    if (stopped) return;
    stopped = true;
    attempt?.abort();
    clearTimeout(watchdog);
    clearTimeout(retryTimer);
    finishRetry?.();
    browser?.removeEventListener("online", handleResume);
    browser?.removeEventListener("offline", handleOffline);
    browser?.removeEventListener("pageshow", handleResume);
    browser?.removeEventListener("storage", handleSessionChange);
    page?.removeEventListener("visibilitychange", handleVisibility);
    options.signal?.removeEventListener("abort", cleanup);
    if (activeCleanup === cleanup) activeCleanup = undefined;
  };

  // Consumer mistakes must not cause an endless network retry loop.
  const notify = <T,>(callback: ((value: T) => void) | undefined, value: T) => {
    if (stopped) return;
    try {
      callback?.(value);
    } catch (error) {
      console.error("Notification stream callback failed", error);
      cleanup();
    }
  };

  const setStatus = (next: NotificationStreamStatus) => {
    if (stopped || status === next) return;
    status = next;
    notify(options.onStatusChange, next);
  };

  const sessionIsCurrent = (): boolean => {
    if (stopped) return false;
    if (sessionStorage.getItem("token") === token) return true;
    setStatus("closed");
    cleanup();
    return false;
  };

  function handleSessionChange() {
    sessionIsCurrent();
  }

  function handleResume() {
    if (!sessionIsCurrent()) return;
    // Timers can be suspended while a phone sleeps or a tab is in the background.
    if (attempt && Date.now() - lastActivity >= IDLE_TIMEOUT_MS) {
      attempt.abort();
    }
    wakeRetry?.();
  }

  function handleVisibility() {
    if (page?.visibilityState === "visible") handleResume();
  }

  function handleOffline() {
    if (!sessionIsCurrent()) return;
    // navigator.onLine is only a hint. Continue bounded retries even if it stays false.
    setStatus("offline");
    attempt?.abort();
  }

  const waitForRetry = (delay: number, notBefore: number): Promise<void> =>
    new Promise((resolve) => {
      if (stopped) {
        resolve();
        return;
      }
      const finish = () => {
        clearTimeout(retryTimer);
        retryTimer = undefined;
        wakeRetry = undefined;
        finishRetry = undefined;
        resolve();
      };
      finishRetry = finish;
      wakeRetry = () => {
        // A browser online event must not bypass an HTTP Retry-After cooldown.
        if (Date.now() >= notBefore) finish();
      };
      retryTimer = setTimeout(finish, Math.max(delay, notBefore - Date.now()));
    });

  const run = async () => {
    if (stopped) return;
    if (!token) {
      setStatus("unauthorized");
      cleanup();
      return;
    }

    while (sessionIsCurrent()) {
      setStatus(failures === 0 ? "connecting" : "reconnecting");
      if (stopped) return;
      const controller = new AbortController();
      attempt = controller;
      let receivedSnapshot = false;
      let retryNotBefore = 0;
      let problem: Error | undefined;
      let timedOut = false;

      const armWatchdog = (milliseconds: number) => {
        clearTimeout(watchdog);
        watchdog = setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, milliseconds);
      };
      lastActivity = Date.now();
      armWatchdog(CONNECT_TIMEOUT_MS);

      try {
        // Fetch is used because EventSource cannot set the Bearer header.
        // Reuse the existing API URL; never put the token in a URL or query string.
        const response = await fetch(api.getUri({ url: "/notifications/stream" }), {
          method: "GET",
          headers: {
            Accept: "text/event-stream",
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
          credentials: "omit",
          redirect: "error",
          signal: controller.signal,
        });

        if (!sessionIsCurrent()) return;
        if (response.status === 401) {
          // A late response from an old login must never clear a newer token.
          if (sessionStorage.getItem("token") === token) {
            sessionStorage.removeItem("token");
          }
          notify(options.onError, new StreamFailure("Your session has expired. Please sign in again.", false));
          setStatus("unauthorized");
          cleanup();
          return;
        }
        if (response.status === 204) {
          setStatus("closed");
          cleanup();
          return;
        }
        if (!response.ok) {
          retryNotBefore = readRetryAfter(response.headers.get("Retry-After"));
          const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
          throw new StreamFailure(`Notification connection failed (HTTP ${response.status}).`, retryable);
        }
        const contentType = response.headers.get("Content-Type")?.split(";", 1)[0]?.trim().toLowerCase();
        if (response.status !== 200 || contentType !== "text/event-stream" || !response.body) {
          throw new StreamFailure("The notification server returned an invalid stream.", false);
        }

        armWatchdog(IDLE_TIMEOUT_MS);
        await readNotificationStream(
          response.body,
          controller.signal,
          () => {
            lastActivity = Date.now();
            armWatchdog(IDLE_TIMEOUT_MS);
          },
          (eventName, data) => {
            if (!sessionIsCurrent()) return;
            if (eventName !== "notifications.snapshot" && eventName !== "notifications.error") return;
            let payload: unknown;
            try {
              payload = JSON.parse(data);
            } catch {
              throw new StreamFailure("The notification server returned invalid event data.", false);
            }

            if (eventName === "notifications.error") {
              throw new StreamFailure(parseNotificationErrorResponse(payload).error, true);
            }
            const snapshot = parseNotificationListResponse(payload);
            receivedSnapshot = true;
            failures = 0;
            setStatus("connected");
            // A status callback may have stopped this connection or changed login.
            if (sessionIsCurrent()) notify(options.onSnapshot, snapshot);
          },
          (milliseconds) => {
            serverRetryMs = Math.max(INITIAL_RETRY_MS, Math.min(milliseconds, MAX_RETRY_MS));
          },
        );
        if (!receivedSnapshot && !stopped) {
          problem = new StreamFailure("Notification connection closed before receiving data.", true);
        }
      } catch (error) {
        if (stopped) return;
        problem = timedOut
          ? new StreamFailure("Notification connection timed out.", true)
          : error instanceof Error ? error : new Error("Unable to connect to notifications.");
      } finally {
        clearTimeout(watchdog);
        watchdog = undefined;
        controller.abort();
        if (attempt === controller) attempt = undefined;
      }

      if (!sessionIsCurrent()) return;
      if (problem) {
        notify(options.onError, problem);
        if (problem instanceof NotificationResponseError || (problem instanceof StreamFailure && !problem.retryable)) {
          setStatus("error");
          cleanup();
          return;
        }
      }
      if (stopped) return;

      failures = Math.min(failures + 1, 6);
      const delay = Math.min(serverRetryMs * 2 ** (failures - 1), MAX_RETRY_MS);
      const jitter = Math.random() * Math.min(delay * 0.2, 1_000);
      setStatus(typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "reconnecting");
      // EOF after a snapshot is normal: the backend rotates streams every 75s.
      await waitForRetry(delay + jitter, retryNotBefore);
    }
  };

  activeCleanup = cleanup;
  browser?.addEventListener("online", handleResume);
  browser?.addEventListener("offline", handleOffline);
  browser?.addEventListener("pageshow", handleResume);
  browser?.addEventListener("storage", handleSessionChange);
  page?.addEventListener("visibilitychange", handleVisibility);
  options.signal?.addEventListener("abort", cleanup, { once: true });

  if (options.signal?.aborted) {
    cleanup();
  } else {
    // Defer callbacks until the provider has received its cleanup function.
    void Promise.resolve().then(run).catch((error: unknown) => {
      if (!stopped) {
        notify(options.onError, error instanceof Error ? error : new Error("Notification stream failed."));
        setStatus("error");
        cleanup();
      }
    });
  }
  return cleanup;
};

const readRetryAfter = (value: string | null): number => {
  if (!value) return 0;
  const text = value.trim();
  const deadline = /^\d+$/.test(text) ? Date.now() + Number(text) * 1_000 : Date.parse(text);
  if (!Number.isFinite(deadline)) return 0;
  // Keep setTimeout within its supported range, even for an invalid huge header.
  return Math.min(Math.max(Date.now(), deadline), Date.now() + 2_147_483_647);
};

/** Handles UTF-8/chunk boundaries, LF, CRLF, CR, comments and multiline data. */
const readNotificationStream = async (
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  onActivity: () => void,
  onEvent: (eventName: string, data: string) => void,
  onRetry: (milliseconds: number) => void,
): Promise<void> => {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let pendingLine = "";
  let eventName = "";
  let dataLines: string[] = [];
  let dataSize = 0;
  let skipLF = false;

  const processLine = (line: string) => {
    if (line.length + dataSize > MAX_EVENT_CHARACTERS) {
      throw new StreamFailure("Notification event exceeds the supported size.", false);
    }
    if (line === "") {
      const name = eventName;
      const data = dataLines.join("\n");
      const hasData = dataLines.length > 0;
      eventName = "";
      dataLines = [];
      dataSize = 0;
      if (hasData) onEvent(name || "message", data);
      return;
    }
    if (line.startsWith(":")) return;
    const colon = line.indexOf(":");
    const field = colon < 0 ? line : line.slice(0, colon);
    let value = colon < 0 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);

    switch (field) {
      case "event":
        eventName = value;
        break;
      case "data":
        dataLines.push(value);
        dataSize += value.length + 1;
        break;
      case "retry": {
        const milliseconds = /^\d+$/.test(value) ? Number(value) : NaN;
        if (Number.isSafeInteger(milliseconds)) onRetry(milliseconds);
        break;
      }
      // No Last-Event-ID replay contract: reconnects receive a database snapshot.
    }
  };

  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done || signal.aborted) break;
      onActivity();
      const text = decoder.decode(value, { stream: true });
      if (!text) continue;
      let start = skipLF && text[0] === "\n" ? 1 : 0;
      skipLF = false;

      for (let index = start; index < text.length; index++) {
        const character = text[index];
        if (character !== "\n" && character !== "\r") continue;
        processLine(pendingLine + text.slice(start, index));
        pendingLine = "";
        if (signal.aborted) return;
        if (character === "\r") {
          if (text[index + 1] === "\n") index++;
          else if (index === text.length - 1) skipLF = true;
        }
        start = index + 1;
      }
      pendingLine += text.slice(start);
      if (pendingLine.length + dataSize + eventName.length > MAX_EVENT_CHARACTERS) {
        throw new StreamFailure("Notification event exceeds the supported size.", false);
      }
    }
    // An unterminated event at EOF is incomplete. Discard it and reconnect.
  } finally {
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
};