/**
 * JSON contracts shared by the notification API, stream and feature components.
 * Field names match the Go backend. Dates stay as RFC 3339 strings in state.
 * Runtime response validation belongs in notificationService.ts.
 */

export interface NotificationActor {
  readonly id: string;
  readonly first_name: string;
  readonly last_name: string;
  readonly profile_image_url?: string;
}

interface NotificationItemBase {
  readonly id: string;
  readonly actor_id: string;

  /** The backend sends null when the actor cannot be found. */
  readonly actor: NotificationActor | null;

  readonly is_read: boolean;
  readonly read_at?: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface ReactionNotificationItem extends NotificationItemBase {
  readonly type: "post_reaction";
  readonly post_id: string;

  /** Reaction values are owned and validated by the reaction section. */
  readonly reaction_type: string;

  readonly comment_id?: never;
  readonly parent_id?: never;
}

export interface PostCommentNotificationItem extends NotificationItemBase {
  readonly type: "post_comment";
  readonly post_id: string;
  readonly comment_id: string;
  readonly parent_id?: never;
  readonly reaction_type?: never;
}

export interface CommentReplyNotificationItem extends NotificationItemBase {
  readonly type: "comment_reply";
  readonly post_id: string;
  readonly comment_id: string;
  readonly parent_id: string;
  readonly reaction_type?: never;
}

export interface CommentLoveNotificationItem extends NotificationItemBase {
  readonly type: "comment_love";
  readonly post_id: string;
  readonly comment_id: string;
  readonly parent_id?: string;
  readonly reaction_type: "love";
}

export type CommentNotificationItem =
  | PostCommentNotificationItem
  | CommentReplyNotificationItem
  | CommentLoveNotificationItem;

interface FollowNotificationItemBase extends NotificationItemBase {
  readonly post_id?: never;
  readonly comment_id?: never;
  readonly parent_id?: never;
  readonly reaction_type?: never;
}

export interface NewFollowNotificationItem extends FollowNotificationItemBase {
  readonly type: "follow";
}

export interface FollowBackNotificationItem extends FollowNotificationItemBase {
  readonly type: "follow_back";
}

export type FollowNotificationItem =
  | NewFollowNotificationItem
  | FollowBackNotificationItem;

export type NotificationItem =
  | ReactionNotificationItem
  | CommentNotificationItem
  | FollowNotificationItem;

export type NotificationType = NotificationItem["type"];

export interface NotificationListResponse {
  /** An empty list is [], never null. */
  readonly items: readonly NotificationItem[];

  /** Opaque server cursor; omitted when no next page exists. */
  readonly next_cursor?: string;
  readonly has_more: boolean;

  /** Full unread count, independent of this page and the UI's 9+ badge. */
  readonly unread_count: number;
}

export interface UnreadCountResponse {
  readonly unread_count: number;
}

export interface MarkNotificationsReadRequest {
  /** The backend accepts 1–100 IDs and limits changes to the current user. */
  readonly notification_ids: readonly string[];
}

export interface MarkNotificationsReadResponse {
  readonly modified_count: number;
  readonly unread_count: number;
}

export interface NotificationErrorResponse {
  readonly error: string;
}

export interface NotificationStreamEventMap {
  /** Current first page and unread count; this is not a single new item. */
  readonly "notifications.snapshot": NotificationListResponse;
  readonly "notifications.error": NotificationErrorResponse;
}

export type NotificationStreamEventName = keyof NotificationStreamEventMap;

/** Parsed SSE event. The backend places the name in the SSE event field. */
export type NotificationStreamEvent = {
  [Name in NotificationStreamEventName]: {
    readonly type: Name;
    readonly data: NotificationStreamEventMap[Name];
  };
}[NotificationStreamEventName];
