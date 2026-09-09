import { useContext } from "react";

import {
  NotificationContext,
  NotificationUnreadCountContext,
} from "./NotificationContext";

import type { NotificationContextValue } from "./NotificationContext";

/** Read the notification list, loading states and provider-owned actions. */
export const useNotifications = (): NotificationContextValue => {
  const context = useContext(NotificationContext);

  if (context === null) {
    throw new Error("useNotifications must be used within NotificationProvider.");
  }

  return context;
};

/** Read the full unread count for the Navbar badge. Formatting belongs in the UI. */
export const useNotificationUnreadCount = (): number => {
  const unreadCount = useContext(NotificationUnreadCountContext);

  // Zero is a valid count; only null indicates that the provider is missing.
  if (unreadCount === null) {
    throw new Error(
      "useNotificationUnreadCount must be used within NotificationProvider.",
    );
  }

  return unreadCount;
};