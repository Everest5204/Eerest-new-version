import { createContext } from "react";

import type {
  MarkNotificationsReadResponse,
  NotificationItem,
} from "./notification.types";

import type { NotificationStreamStatus } from "./notificationStream";

/** Public state and actions owned by the authenticated NotificationProvider. */
export interface NotificationContextValue {
  readonly items: readonly NotificationItem[];

  /** Full server count. Only the badge UI formats values above nine as "9+". */
  readonly unreadCount: number;

  /** Show the empty state only after a successful first page or stream snapshot. */
  readonly hasLoaded: boolean;
  readonly hasMore: boolean;

  /** First-page requests, including manual refresh; keep existing items visible. */
  readonly isLoading: boolean;
  readonly isLoadingMore: boolean;

  /** True while at least one mark-read request is pending. */
  readonly isMarkingRead: boolean;

  readonly streamStatus: NotificationStreamStatus;

  /** Initial-load or refresh failure. A failure must not clear valid items. */
  readonly error: Error | null;
  readonly loadMoreError: Error | null;
  readonly markReadError: Error | null;
  readonly streamError: Error | null;

  /** Reload the first page and unread count. Rejects on request failure. */
  readonly refresh: () => Promise<void>;

  /** Load the next cursor page; resolves without a request when none remains. */
  readonly loadMore: () => Promise<void>;

  /**
   * Persist a batch of 1–100 notification IDs through the existing API.
   * Rejects on validation or request failure; callers must handle rejection.
   */
  readonly markRead: (
    notificationIds: readonly string[],
  ) => Promise<MarkNotificationsReadResponse>;
}

// A null default lets useNotifications report a missing provider explicitly.
export const NotificationContext =
  createContext<NotificationContextValue | null>(null);

NotificationContext.displayName = "NotificationContext";

/**
 * Navbar subscribes to this scalar value without subscribing to list updates.
 * The provider supplies the same unreadCount here and in NotificationContext.
 */
export const NotificationUnreadCountContext = createContext<number | null>(null);

NotificationUnreadCountContext.displayName = "NotificationUnreadCountContext";
