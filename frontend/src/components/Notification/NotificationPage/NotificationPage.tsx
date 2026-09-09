import { useCallback, useRef } from "react";

import { Bell, ChevronLeft, LoaderCircle, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { CommentNotification } from "../Comment";
import type { NotificationItem } from "../Core/notification.types";
import { useNotifications } from "../Core/useNotifications";
import { FollowNotification } from "../Follow";
import { ReactionNotification } from "../Reaction";

import "./NotificationPage.css";

const NotificationPage = () => {
  const navigate = useNavigate();
  const pendingReadIDs = useRef(new Set<string>());

  const {
    items,
    hasLoaded,
    hasMore,
    isLoading,
    isLoadingMore,
    isMarkingRead,
    streamStatus,
    error,
    loadMoreError,
    markReadError,
    refresh,
    loadMore,
    markRead,
  } = useNotifications();

  const sessionExpired = streamStatus === "unauthorized";
  const sessionClosed = streamStatus === "closed";
  const sessionUnavailable = sessionExpired || sessionClosed;

  const handleBack = useCallback(() => {
    if (window.history.length > 1) {
      void navigate(-1);
      return;
    }

    void navigate("/", { replace: true });
  }, [navigate]);

  const handleRefresh = useCallback(() => {
    if (sessionClosed) {
      window.location.reload();
      return;
    }

    // The shared provider exposes request errors for the page to display.
    void refresh().catch(() => undefined);
  }, [refresh, sessionClosed]);

  const handleLoadMore = useCallback(() => {
    void loadMore().catch(() => undefined);
  }, [loadMore]);

  const handleSelect = useCallback((notification: NotificationItem) => {
    if (!notification.is_read && !pendingReadIDs.current.has(notification.id)) {
      pendingReadIDs.current.add(notification.id);

      // Save through the provider, which also updates the shared unread count.
      // Repeated taps on the same pending item do not queue extra writes.
      void markRead([notification.id])
        .catch(() => undefined)
        .finally(() => {
          pendingReadIDs.current.delete(notification.id);
        });
    }

if (notification.actor?.id) {
  void navigate(
    `/profile/${encodeURIComponent(notification.actor.id)}`,
    { replace: true },
  );
}
  }, [markRead, navigate]);

  const connectionMessage = streamStatus === "offline"
    ? "You're offline. Notifications will update when you're back online."
    : streamStatus === "reconnecting"
      ? "Reconnecting to notifications…"
      : streamStatus === "error"
        ? "Live updates are unavailable. Refresh to try again."
        : null;

  return (
    <main className="notification-page" aria-labelledby="notification-page-title">
      <header className="notification-page__header">
        <button
          className="notification-page__icon-button"
          type="button"
          aria-label="Go back"
          onClick={handleBack}
        >
          <ChevronLeft size={25} strokeWidth={2} aria-hidden="true" />
        </button>

        <h1 id="notification-page-title" className="notification-page__title">
          Notification
        </h1>

        <button
          className="notification-page__icon-button"
          type="button"
          aria-label={isLoading ? "Refreshing notifications" : "Refresh notifications"}
          disabled={isLoading || sessionExpired}
          onClick={handleRefresh}
        >
          <RefreshCw
            className={isLoading ? "notification-page__spinner" : undefined}
            size={20}
            strokeWidth={1.8}
            aria-hidden="true"
          />
        </button>
      </header>

      <div className="notification-page__content">
        {!sessionUnavailable && connectionMessage && (
          <p className="notification-page__notice" role="status">
            {connectionMessage}
          </p>
        )}

        {!sessionUnavailable && hasLoaded && error && (
          <p className="notification-page__notice notification-page__notice--error" role="alert">
            Couldn't refresh notifications. Please try again.
          </p>
        )}

        {!sessionUnavailable && markReadError && (
          <p className="notification-page__notice notification-page__notice--error" role="alert">
            Couldn't mark the notification as read. Tap it again to retry.
          </p>
        )}

        <span className="notification-page__sr-only" role="status">
          {isMarkingRead ? "Saving notification read status" : ""}
        </span>

        {sessionExpired ? (
          <div className="notification-page__state" role="status">
            <p className="notification-page__state-title">Please sign in again</p>
            <p className="notification-page__state-description">
              Your session has expired.
            </p>
            <button
              className="notification-page__button"
              type="button"
              onClick={() => { void navigate("/login", { replace: true }); }}
            >
              Sign in
            </button>
          </div>
        ) : sessionClosed ? (
          <div className="notification-page__state" role="status">
            <p className="notification-page__state-title">Refresh to continue</p>
            <p className="notification-page__state-description">
              Refresh the page to reconnect to your notifications.
            </p>
            <button className="notification-page__button" type="button" onClick={handleRefresh}>
              Refresh page
            </button>
          </div>
        ) : !hasLoaded ? (
          error ? (
            <div className="notification-page__state" role="alert">
              <p className="notification-page__state-title">Couldn't load notifications</p>
              <p className="notification-page__state-description">
                Please check your connection and try again.
              </p>
              <button
                className="notification-page__button"
                type="button"
                disabled={isLoading}
                onClick={handleRefresh}
              >
                {isLoading ? "Loading…" : "Try again"}
              </button>
            </div>
          ) : (
            <div className="notification-page__state" role="status">
              <LoaderCircle
                className="notification-page__spinner"
                size={28}
                strokeWidth={1.8}
                aria-hidden="true"
              />
              <p className="notification-page__state-description">Loading notifications…</p>
            </div>
          )
        ) : items.length === 0 ? (
          <div className="notification-page__state notification-page__state--empty" role="status">
            <Bell className="notification-page__empty-icon" size={64} strokeWidth={1.4} aria-hidden="true" />
            <p className="notification-page__state-title">No notification yet</p>
          </div>
        ) : (
          <ul className="notification-page__list" aria-label="Notifications">
            {items.map((notification) => (
              <li className="notification-page__item" key={notification.id}>
                {notification.type === "post_reaction" ? (
                  <ReactionNotification notification={notification} onSelect={handleSelect} />
                ) : notification.type === "post_comment" ||
                  notification.type === "comment_reply" ||
                  notification.type === "comment_love" ? (
                  <CommentNotification notification={notification} onSelect={handleSelect} />
                ) : (
                  <FollowNotification notification={notification} onSelect={handleSelect} />
                )}
              </li>
            ))}
          </ul>
        )}

        {!sessionUnavailable && hasLoaded && hasMore && (
          <div className="notification-page__pagination">
            {loadMoreError && (
              <p className="notification-page__notice notification-page__notice--error" role="alert">
                Couldn't load older notifications. Please try again.
              </p>
            )}
            <button
              className="notification-page__button"
              type="button"
              disabled={isLoadingMore || isLoading}
              onClick={handleLoadMore}
            >
              {isLoadingMore ? "Loading…" : loadMoreError ? "Try again" : "Load more"}
            </button>
          </div>
        )}
      </div>
    </main>
  );
};

export default NotificationPage;