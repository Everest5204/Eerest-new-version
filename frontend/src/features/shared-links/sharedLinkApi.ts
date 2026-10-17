import { normalizePost, type FeedPost } from "../../services/postService";

const BASE = (import.meta.env.VITE_API_BASE_URL?.trim() || import.meta.env.VITE_API_URL?.trim() ||
  "https://api.mongosky.com").replace(/\/+$/, "");

export class SharedLinkError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

async function read(path: string, token: string, signal: AbortSignal): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  const timeout = setTimeout(() => controller.abort(new Error("The request timed out. Please try again.")), 10000);
  try {
    const response = await fetch(`${BASE}${path}`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      signal: controller.signal, cache: "no-store",
    });
    if (!response.ok) {
      const message = response.status === 404 ? "This post is unavailable or has been deleted." :
        response.status === 401 ? "Please sign in again." :
        response.status === 403 ? "You do not have access to this content." : "Could not load this link. Please try again.";
      throw new SharedLinkError(response.status, message);
    }
    const body: unknown = await response.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Could not read this link. Please try again.");
    return body as Record<string, unknown>;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
  }
}

export async function validateSharedSession(token: string, signal: AbortSignal): Promise<void> {
  const user = await read("/api/auth/me", token, signal);
  if (typeof user.id !== "string" || !/^[a-f\d]{24}$/i.test(user.id)) throw new Error("Could not confirm your session. Please try again.");
}

export async function readSharedPost(id: string, token: string, signal: AbortSignal): Promise<FeedPost> {
  if (!/^[a-f\d]{24}$/i.test(id)) throw new SharedLinkError(404, "This post link is invalid.");
  const response = await read(`/api/posts/${encodeURIComponent(id)}`, token, signal);
  const post = normalizePost(response.post);
  if (post.id.toLowerCase() !== id.toLowerCase() || !post.user_id) throw new Error("Could not read this post. Please try again.");
  return post;
}
