import api from "../../services/api";

import {
  followProfile,
  unfollowProfile,
} from "../../profileView/profileViewService";

import type {
  FollowActionResponse,
  FollowListResponse,
  FollowRealtimeEvent,
  FollowTab,
  FollowUser,
} from "./follow.types";

const NO_CACHE_HEADERS = {
  "Cache-Control":
    "no-store, no-cache, must-revalidate",
  Pragma: "no-cache",
};

const REALTIME_RECONNECT_DELAY_MS = 1_200;

const normalizeUser = (
  value: Partial<FollowUser>,
): FollowUser => ({
  id: String(value.id ?? ""),
  first_name: String(value.first_name ?? ""),
  last_name: String(value.last_name ?? ""),
  profile_title: String(value.profile_title ?? ""),
  profile_image_url: String(
    value.profile_image_url ?? "",
  ),
  is_following: Boolean(value.is_following),
  follows_you: Boolean(value.follows_you),
  is_self: Boolean(value.is_self),
});

const normalizeListResponse = (
  value: Partial<FollowListResponse>,
): FollowListResponse => ({
  items: Array.isArray(value.items)
    ? value.items
        .map(normalizeUser)
        .filter((item) => item.id)
    : [],

  next_cursor:
    typeof value.next_cursor === "string"
      ? value.next_cursor
      : "",

  has_more: Boolean(value.has_more),

  followers_count: Math.max(
    0,
    Number(value.followers_count) || 0,
  ),

  following_count: Math.max(
    0,
    Number(value.following_count) || 0,
  ),
});

export const getFollowList = async (
  tab: FollowTab,
  cursor = "",
  limit = 20,
  signal?: AbortSignal,
): Promise<FollowListResponse> => {
  const response = await api.get<FollowListResponse>(
    `/follow/${tab}`,
    {
      signal,
      headers: NO_CACHE_HEADERS,
      params: {
        limit,
        ...(cursor ? { cursor } : {}),
        t: Date.now(),
      },
    },
  );

  return normalizeListResponse(
    response.data ?? {},
  );
};

export const followUser = async (
  userID: string,
  signal?: AbortSignal,
): Promise<FollowActionResponse> => {
  return followProfile(userID, signal);
};

export const unfollowUser = async (
  userID: string,
  signal?: AbortSignal,
): Promise<FollowActionResponse> => {
  return unfollowProfile(userID, signal);
};

const getProgressResponseText = (
  progressEvent: unknown,
): string => {
  const nativeEvent = (
    progressEvent as {
      event?: {
        target?: EventTarget | null;
      };
    }
  ).event;

  if (!nativeEvent) {
    return "";
  }

  const target = nativeEvent.target;

  if (
    target instanceof XMLHttpRequest &&
    typeof target.responseText === "string"
  ) {
    return target.responseText;
  }

  return "";
};

const readFollowEvent = (
  block: string,
): FollowRealtimeEvent | null => {
  let eventName = "";
  const dataLines: string[] = [];

  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) {
      eventName = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  if (
    eventName !== "follow-change" ||
    dataLines.length === 0
  ) {
    return null;
  }

  try {
    const value = JSON.parse(
      dataLines.join("\n"),
    ) as Partial<FollowRealtimeEvent>;

    if (
      value.type !== "follow.changed" ||
      typeof value.actor_user_id !== "string" ||
      typeof value.target_user_id !== "string"
    ) {
      return null;
    }

    return value as FollowRealtimeEvent;
  } catch {
    return null;
  }
};

export const subscribeToFollowEvents = (
  onEvent: (event: FollowRealtimeEvent) => void,
): (() => void) => {
  let disposed = false;
  let activeController: AbortController | null =
    null;
  let reconnectTimer: number | null = null;

  const connect = async () => {
    if (disposed) {
      return;
    }

    const controller = new AbortController();
    activeController = controller;

    let processedLength = 0;
    let pendingText = "";

    try {
      await api.get("/follow/events", {
        signal: controller.signal,
        timeout: 0,
        responseType: "text",
        headers: {
          ...NO_CACHE_HEADERS,
          Accept: "text/event-stream",
        },
        params: {
          t: Date.now(),
        },
        onDownloadProgress: (progressEvent) => {
          const responseText =
            getProgressResponseText(progressEvent);

          if (
            !responseText ||
            responseText.length <= processedLength
          ) {
            return;
          }

          pendingText += responseText.slice(
            processedLength,
          );
          processedLength = responseText.length;

          pendingText = pendingText.replace(
            /\r\n/g,
            "\n",
          );

          const blocks = pendingText.split("\n\n");
          pendingText = blocks.pop() ?? "";

          for (const block of blocks) {
            const event = readFollowEvent(block);

            if (event) {
              onEvent(event);
            }
          }
        },
      });
    } catch {
      // Network changes are handled by the reconnect below.
    }

    if (
      disposed ||
      controller.signal.aborted
    ) {
      return;
    }

    reconnectTimer = window.setTimeout(
      () => {
        void connect();
      },
      REALTIME_RECONNECT_DELAY_MS,
    );
  };

  void connect();

  return () => {
    disposed = true;
    activeController?.abort();

    if (reconnectTimer !== null) {
      window.clearTimeout(reconnectTimer);
    }
  };
};
