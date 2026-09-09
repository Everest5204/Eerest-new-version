import api from "../../../services/api";

import type {
  MarkNotificationsReadRequest,
  MarkNotificationsReadResponse,
  NotificationActor,
  NotificationErrorResponse,
  NotificationItem,
  NotificationListResponse,
  UnreadCountResponse,
} from "./notification.types";

// These limits match the notification backend.
export const DEFAULT_NOTIFICATION_LIST_LIMIT = 20;
export const MAX_NOTIFICATION_LIST_LIMIT = 50;
export const MAX_NOTIFICATION_READ_BATCH_SIZE = 100;

const MAX_NOTIFICATION_CURSOR_LENGTH = 128;
const OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/;
const ZERO_OBJECT_ID = "000000000000000000000000";
const DATE_TIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

export interface NotificationRequestOptions {
  readonly signal?: AbortSignal;
}

export interface NotificationListOptions extends NotificationRequestOptions {
  readonly cursor?: string;
  readonly limit?: number;
}

export class NotificationResponseError extends Error {
  constructor() {
    super("The notification server returned an invalid response.");
    this.name = "NotificationResponseError";
  }
}

// Authentication, base URL, timeout and HTTP errors stay with the shared client.
// This service does not cache data or start a realtime connection.
export const getNotifications = async (
  options: NotificationListOptions = {},
): Promise<NotificationListResponse> => {
  options.signal?.throwIfAborted();
  const limit = normalizeListLimit(options.limit);
  const cursor = options.cursor?.trim() ?? "";
  if (cursor.length > MAX_NOTIFICATION_CURSOR_LENGTH) {
    throw new TypeError("Invalid notification cursor.");
  }

  const response = await api.get<unknown>("/notifications", {
    ...requestConfig(options),
    params: { limit, ...(cursor ? { cursor } : {}) },
  });

  options.signal?.throwIfAborted();
  return parseNotificationListResponse(response.data);
};

export const getNotificationUnreadCount = async (
  options: NotificationRequestOptions = {},
): Promise<UnreadCountResponse> => {
  options.signal?.throwIfAborted();
  const response = await api.get<unknown>(
    "/notifications/unread-count",
    requestConfig(options),
  );

  options.signal?.throwIfAborted();
  const data = response.data;
  if (!isRecord(data) || !isCount(data.unread_count)) {
    throw new NotificationResponseError();
  }
  return { unread_count: data.unread_count };
};

export const markNotificationsRead = async (
  request: MarkNotificationsReadRequest,
  options: NotificationRequestOptions = {},
): Promise<MarkNotificationsReadResponse> => {
  options.signal?.throwIfAborted();
  const notificationIDs = normalizeNotificationIDs(request.notification_ids);
  const body: MarkNotificationsReadRequest = {
    notification_ids: notificationIDs,
  };

  const response = await api.patch<unknown>(
    "/notifications/read",
    body,
    requestConfig(options),
  );

  options.signal?.throwIfAborted();
  const data = response.data;
  if (
    !isRecord(data) ||
    !isCount(data.modified_count) ||
    data.modified_count > notificationIDs.length ||
    !isCount(data.unread_count)
  ) {
    throw new NotificationResponseError();
  }

  return {
    modified_count: data.modified_count,
    unread_count: data.unread_count,
  };
};

/** Shared by the list request and notifications.snapshot SSE events. */
export const parseNotificationListResponse = (
  data: unknown,
): NotificationListResponse => {
  if (
    !isRecord(data) ||
    !Array.isArray(data.items) ||
    data.items.length > MAX_NOTIFICATION_LIST_LIMIT ||
    !data.items.every(isNotificationItem) ||
    typeof data.has_more !== "boolean" ||
    !isCount(data.unread_count)
  ) {
    throw new NotificationResponseError();
  }

  const ids = new Set(data.items.map((item) => item.id));
  if (ids.size !== data.items.length) {
    throw new NotificationResponseError();
  }

  const page = {
    items: data.items,
    has_more: data.has_more,
    unread_count: data.unread_count,
  };

  if (data.has_more) {
    if (
      data.items.length === 0 ||
      typeof data.next_cursor !== "string" ||
      data.next_cursor.length === 0 ||
      data.next_cursor.length > MAX_NOTIFICATION_CURSOR_LENGTH
    ) {
      throw new NotificationResponseError();
    }
    return { ...page, next_cursor: data.next_cursor };
  }

  // The backend omits next_cursor when there is no further page.
  if (data.next_cursor !== undefined) {
    throw new NotificationResponseError();
  }
  return page;
};

/** Parses notifications.error events without replacing the last good snapshot. */
export const parseNotificationErrorResponse = (
  data: unknown,
): NotificationErrorResponse => {
  if (
    !isRecord(data) ||
    typeof data.error !== "string" ||
    data.error.trim().length === 0
  ) {
    throw new NotificationResponseError();
  }
  return { error: data.error };
};

const requestConfig = ({ signal }: NotificationRequestOptions) => ({
  headers: { Accept: "application/json" },
  ...(signal ? { signal } : {}),
});

const normalizeListLimit = (limit = DEFAULT_NOTIFICATION_LIST_LIMIT): number => {
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw new RangeError("Notification limit must be a positive integer.");
  }
  return Math.min(limit, MAX_NOTIFICATION_LIST_LIMIT);
};

const normalizeNotificationIDs = (ids: readonly string[]): string[] => {
  // Match the backend's batch limit before deduplication.
  if (
    !Array.isArray(ids) ||
    ids.length === 0 ||
    ids.length > MAX_NOTIFICATION_READ_BATCH_SIZE
  ) {
    throw new RangeError("Provide between 1 and 100 notification IDs.");
  }

  const uniqueIDs = new Set<string>();
  for (const value of ids) {
    if (typeof value !== "string") {
      throw new TypeError("Invalid notification ID.");
    }
    const id = value.trim().toLowerCase();
    if (!isObjectID(id)) {
      throw new TypeError("Invalid notification ID.");
    }
    uniqueIDs.add(id);
  }
  return [...uniqueIDs];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

const isObjectID = (value: unknown): value is string =>
  typeof value === "string" &&
  OBJECT_ID_PATTERN.test(value) &&
  value !== ZERO_OBJECT_ID;

const isDateTime = (value: unknown): value is string =>
  typeof value === "string" &&
  DATE_TIME_PATTERN.test(value) &&
  Number.isFinite(Date.parse(value));

const isNotificationActor = (value: unknown): value is NotificationActor =>
  isRecord(value) &&
  isObjectID(value.id) &&
  typeof value.first_name === "string" &&
  typeof value.last_name === "string" &&
  (value.profile_image_url === undefined ||
    typeof value.profile_image_url === "string");

const isNotificationItem = (value: unknown): value is NotificationItem => {
  if (
    !isRecord(value) ||
    !isObjectID(value.id) ||
    !isObjectID(value.actor_id) ||
    typeof value.is_read !== "boolean" ||
    !isDateTime(value.created_at) ||
    !isDateTime(value.updated_at) ||
    (value.read_at !== undefined && !isDateTime(value.read_at))
  ) {
    return false;
  }
  if (
    value.actor !== null &&
    (!isNotificationActor(value.actor) || value.actor.id !== value.actor_id)
  ) {
    return false;
  }

  switch (value.type) {
    case "post_reaction":
      return (
        isObjectID(value.post_id) &&
        typeof value.reaction_type === "string" &&
        value.reaction_type.trim().length > 0 &&
        value.comment_id === undefined &&
        value.parent_id === undefined
      );
case "post_comment":
  return (
    isObjectID(value.post_id) &&
    isObjectID(value.comment_id) &&
    value.parent_id === undefined &&
    value.reaction_type === undefined
  );

case "comment_love":
  return (
    isObjectID(value.post_id) &&
    isObjectID(value.comment_id) &&
    value.reaction_type === "love" &&
    (
      value.parent_id === undefined ||
      (
        isObjectID(value.parent_id) &&
        value.parent_id !== value.comment_id
      )
    )
  );
  
    case "comment_reply":
      return (
        isObjectID(value.post_id) &&
        isObjectID(value.comment_id) &&
        isObjectID(value.parent_id) &&
        value.comment_id !== value.parent_id &&
        value.reaction_type === undefined
      );
    case "follow":
    case "follow_back":
      return (
        value.post_id === undefined &&
        value.comment_id === undefined &&
        value.parent_id === undefined &&
        value.reaction_type === undefined
      );
    default:
      return false;
  }
};