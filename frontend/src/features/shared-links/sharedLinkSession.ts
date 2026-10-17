import { sharedLinkDestination } from "./sharedLinkDestination";

const CHANNEL = "mongosky:shared-link-session:v1";
const REQUEST = "request-shared-link-session";
const RESPONSE = "shared-link-session";
const validToken = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 8192 && !/\s/.test(value);

/** Same-origin, in-memory tab handshake. Does not persist a token or put it in a URL. */
export const listenForSharedLinkSession = (): (() => void) => {
  if (typeof BroadcastChannel === "undefined") return () => {};
  let channel: BroadcastChannel;
  try { channel = new BroadcastChannel(CHANNEL); } catch { return () => {}; }
  channel.onmessage = (event: MessageEvent<unknown>) => {
    const value = event.data;
    if (!value || typeof value !== "object") return;
    const message = value as Record<string, unknown>;
    if (message.type !== REQUEST || typeof message.requestID !== "string" ||
      message.requestID.length > 100 || !sharedLinkDestination(message.destination)) return;
    try {
      const token = sessionStorage.getItem("token");
      if (validToken(token)) channel.postMessage({ type: RESPONSE, requestID: message.requestID, token });
    } catch { /* Restricted browser storage cannot provide a session. */ }
  };
  return () => channel.close();
};

export const restoreSharedLinkSession = (destination: string, signal: AbortSignal): Promise<string | null> => {
  const current = sessionStorage.getItem("token");
  if (validToken(current)) return Promise.resolve(current);
  if (!sharedLinkDestination(destination) || typeof BroadcastChannel === "undefined" || signal.aborted) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const channel = new BroadcastChannel(CHANNEL);
    const requestID = crypto.randomUUID();
    const tokens = new Set<string>();
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      channel.close();
      if (signal.aborted) { resolve(null); return; }
      try {
        const existing = sessionStorage.getItem("token");
        if (validToken(existing)) { resolve(existing); return; }
        // Several accounts in different tabs require explicit account selection/sign-in.
        const token = tokens.size === 1 ? [...tokens][0] : null;
        if (token) sessionStorage.setItem("token", token);
        resolve(token);
      } catch { resolve(null); }
    };
    const timer = setTimeout(finish, 250);
    signal.addEventListener("abort", finish, { once: true });
    channel.onmessage = (event: MessageEvent<unknown>) => {
      if (!event.data || typeof event.data !== "object") return;
      const message = event.data as Record<string, unknown>;
      if (message.type === RESPONSE && message.requestID === requestID && validToken(message.token)) tokens.add(message.token);
    };
    channel.postMessage({ type: REQUEST, requestID, destination });
  });
};
