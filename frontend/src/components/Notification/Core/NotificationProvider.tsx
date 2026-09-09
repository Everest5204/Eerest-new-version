import { useEffect, useMemo, useSyncExternalStore } from "react";

import type { ReactNode } from "react";

import {
  NotificationContext,
  NotificationUnreadCountContext,
} from "./NotificationContext";

import type { NotificationContextValue } from "./NotificationContext";
import type {
  MarkNotificationsReadResponse,
  NotificationItem,
  NotificationListResponse,
} from "./notification.types";

import { getNotifications, markNotificationsRead } from "./notificationService";
import { startNotificationStream } from "./notificationStream";

export interface NotificationProviderProps {
  readonly children: ReactNode;

  /** Pass the current sessionStorage token from the authenticated route. */
  readonly token: string | null;
}

type NotificationState = Omit<
  NotificationContextValue,
  "refresh" | "loadMore" | "markRead"
>;

interface ListRequest {
  readonly controller: AbortController;
  readonly promise: Promise<void>;
}

/** Mount once around the authenticated Outlet, so page navigation keeps its connection. */
const NotificationProvider = ({ children, token }: NotificationProviderProps) => {
  // Construction is pure. A changed login gets an empty store before rendering children.
  const store = useMemo(() => createNotificationStore(token), [token]);
  const value = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );

  useEffect(() => store.connect(), [store]);

  return (
    <NotificationUnreadCountContext.Provider value={value.unreadCount}>
      <NotificationContext.Provider value={value}>
        {children}
      </NotificationContext.Provider>
    </NotificationUnreadCountContext.Provider>
  );
};

export default NotificationProvider;

/** One store per authenticated provider; no network work happens during render. */
function createNotificationStore(token: string | null) {
  const initialState: NotificationState = {
    items: [],
    unreadCount: 0,
    hasLoaded: false,
    hasMore: false,
    isLoading: Boolean(token),
    isLoadingMore: false,
    isMarkingRead: false,
    streamStatus: token ? "connecting" : "unauthorized",
    error: null,
    loadMoreError: null,
    markReadError: null,
    streamError: null,
  };

  const initialSnapshot: NotificationContextValue = {
    ...initialState,
    refresh,
    loadMore,
    markRead,
  };
  let snapshot = initialSnapshot;
  const listeners = new Set<() => void>();
  const controllers = new Set<AbortController>();
  let active = false;
  let lifecycle = 0;
  let streamGeneration = 0;
  let dataVersion = 0;
  let paginationVersion = 0;
  let cursor: string | undefined;
  let stopStream: (() => void) | undefined;
  let refreshRequest: ListRequest | undefined;
  let moreRequest: ListRequest | undefined;
  let readQueue: Promise<void> = Promise.resolve();
  let pendingReads = 0;

  function update(patch: Partial<NotificationState>) {
    const keys = Object.keys(patch) as (keyof NotificationState)[];
    if (keys.every((key) => Object.is(snapshot[key], patch[key]))) return;
    snapshot = { ...snapshot, ...patch };
    for (const listener of listeners) listener();
  }

  function cancelRefresh() {
    refreshRequest?.controller.abort();
    refreshRequest = undefined;
    update({ isLoading: false });
  }

  function cancelMore() {
    paginationVersion += 1;
    moreRequest?.controller.abort();
    moreRequest = undefined;
    update({ isLoadingMore: false });
  }

  function finishRefresh(controller: AbortController, run: number) {
    controllers.delete(controller);
    if (refreshRequest?.controller !== controller) return;
    refreshRequest = undefined;
    if (isCurrent(run)) update({ isLoading: false });
  }

  function finishMore(controller: AbortController, run: number) {
    controllers.delete(controller);
    if (moreRequest?.controller !== controller) return;
    moreRequest = undefined;
    if (isCurrent(run)) update({ isLoadingMore: false });
  }

  function disconnect() {
    active = false;
    lifecycle += 1;
    streamGeneration += 1;
    stopStream?.();
    stopStream = undefined;
    for (const controller of controllers) controller.abort();
    controllers.clear();
    refreshRequest = undefined;
    moreRequest = undefined;
    pendingReads = 0;
    readQueue = Promise.resolve();
    window.removeEventListener("storage", checkSession);
    window.removeEventListener("focus", checkSession);
    window.removeEventListener("pageshow", checkSession);
    document.removeEventListener("visibilitychange", checkSession);
  }

  function endSession(status: "unauthorized" | "closed") {
    disconnect();
    cursor = undefined;
    update({ ...initialState, isLoading: false, streamStatus: status });
  }

  function isCurrent(run: number): boolean {
    if (!active || lifecycle !== run) return false;
    if (!token || sessionStorage.getItem("token") !== token) {
      endSession(sessionStorage.getItem("token") ? "closed" : "unauthorized");
      return false;
    }
    return true;
  }

  function checkSession() {
    isCurrent(lifecycle);
  }

  function assertCurrent(run: number) {
    if (!isCurrent(run)) throw cancelledRequest();
  }

  function restartStream() {
    const run = lifecycle;
    if (!isCurrent(run) || !token) return;
    const generation = ++streamGeneration;
    stopStream?.();
    stopStream = startNotificationStream({
      token,
      onSnapshot: (page) => {
        if (generation !== streamGeneration || !isCurrent(run)) return;
        const reset = Boolean(refreshRequest);
        cancelRefresh();
        dataVersion += 1;
        applyFirstPage(page, !reset);
        update({ streamError: null });
      },
      onStatusChange: (status) => {
        if (generation !== streamGeneration || !active || lifecycle !== run) return;
        if (status === "unauthorized") {
          endSession("unauthorized");
          return;
        }
        if (isCurrent(run)) update({ streamStatus: status });
      },
      onError: (error) => {
        if (generation === streamGeneration && isCurrent(run)) {
          update({ streamError: error });
        }
      },
    });
  }

  function applyFirstPage(page: NotificationListResponse, preserveTail: boolean) {
    const previous = new Map(snapshot.items.map((item) => [item.id, item]));
    const firstPage = page.items.map((item) => keepReadState(item, previous.get(item.id)));
    const lastID = firstPage.at(-1)?.id;
    const boundary = snapshot.items.findIndex((item) => item.id === lastID);
    const tail = preserveTail && page.has_more && boundary >= 0
      ? snapshot.items.slice(boundary + 1)
      : [];

    if (tail.length > 0) {
      // The shared boundary proves the cached tail is contiguous with this page.
      const ids = new Set(firstPage.map((item) => item.id));
      update({
        items: [...firstPage, ...tail.filter((item) => !ids.has(item.id))],
        unreadCount: page.unread_count,
        hasLoaded: true,
        error: null,
      });
      return;
    }

    // No overlapping boundary: reset rather than hide an unseen gap between pages.
    cancelMore();
    cursor = page.next_cursor;
    update({
      items: firstPage,
      unreadCount: page.unread_count,
      hasLoaded: true,
      hasMore: page.has_more,
      error: null,
      loadMoreError: null,
    });
  }

  function refresh(): Promise<void> {
    const run = lifecycle;
    if (!isCurrent(run)) return Promise.reject(cancelledRequest());
    if (refreshRequest) return refreshRequest.promise;
    if (snapshot.streamStatus === "error" || snapshot.streamStatus === "closed") {
      restartStream();
    }
    cancelMore();
    const controller = new AbortController();
    const version = dataVersion;
    controllers.add(controller);
    update({ isLoading: true, error: null, loadMoreError: null });

    const promise = (async () => {
      try {
        const page = await getNotifications({ signal: controller.signal });
        if (!isCurrent(run) || controller.signal.aborted || version !== dataVersion) return;
        dataVersion += 1;
        applyFirstPage(page, false);
      } catch (cause) {
        if (!isCurrent(run) || controller.signal.aborted) return;
        const error = asError(cause);
        update({ error });
        throw error;
      } finally {
        finishRefresh(controller, run);
      }
    })();
    refreshRequest = { controller, promise };
    return promise;
  }

  function loadMore(): Promise<void> {
    const run = lifecycle;
    if (!isCurrent(run)) return Promise.reject(cancelledRequest());
    if (moreRequest) return moreRequest.promise;
    if (refreshRequest || !snapshot.hasLoaded || !snapshot.hasMore || !cursor) {
      return Promise.resolve();
    }
    const position = cursor;
    const version = paginationVersion;
    const controller = new AbortController();
    controllers.add(controller);
    update({ isLoadingMore: true, loadMoreError: null });

    const promise = (async () => {
      try {
        const page = await getNotifications({ cursor: position, signal: controller.signal });
        if (!isCurrent(run) || controller.signal.aborted || version !== paginationVersion) return;
        if (page.has_more && page.next_cursor === position) {
          throw new Error("The notification server returned a repeated cursor.");
        }
        const ids = new Set(snapshot.items.map((item) => item.id));
        cursor = page.next_cursor;
        update({
          items: [...snapshot.items, ...page.items.filter((item) => !ids.has(item.id))],
          hasMore: page.has_more,
          loadMoreError: null,
        });
        // This older-page request must not overwrite the live badge count.
      } catch (cause) {
        if (!isCurrent(run) || controller.signal.aborted) return;
        const error = asError(cause);
        update({ loadMoreError: error });
        throw error;
      } finally {
        finishMore(controller, run);
      }
    })();
    moreRequest = { controller, promise };
    return promise;
  }

  function markRead(notificationIDs: readonly string[]): Promise<MarkNotificationsReadResponse> {
    const run = lifecycle;
    if (!isCurrent(run)) return Promise.reject(cancelledRequest());
    const ids = [...notificationIDs];
    pendingReads += 1;
    update({ isMarkingRead: true, markReadError: null });

    // Serialize writes so responses cannot restore an older unread count.
    const task = readQueue.then(async () => {
      assertCurrent(run);
      const controller = new AbortController();
      const version = dataVersion;
      controllers.add(controller);
      try {
        const response = await markNotificationsRead(
          { notification_ids: ids },
          { signal: controller.signal },
        );
        assertCurrent(run);
        controller.signal.throwIfAborted();
        const acknowledged = new Set(ids.map((id) => id.trim().toLowerCase()));
        const count = version === dataVersion ? response.unread_count : snapshot.unreadCount;
        dataVersion += 1;
        cancelRefresh();
        cancelMore();
        update({
          items: snapshot.items.map((item) => (
            acknowledged.has(item.id) && !item.is_read ? { ...item, is_read: true } : item
          )),
          unreadCount: count,
          markReadError: null,
        });

        // A fresh stream reads after the committed write. Discard older in-flight frames.
        // Server snapshots supply read_at/updated_at; do not invent client timestamps.
        restartStream();
        return response;
      } catch (cause) {
        if (!isCurrent(run) || controller.signal.aborted) throw cancelledRequest();
        const error = asError(cause);
        update({ markReadError: error });
        throw error;
      } finally {
        controllers.delete(controller);
      }
    });
    readQueue = task.then(() => undefined, () => undefined);

    return task.finally(() => {
      if (!isCurrent(run)) return;
      pendingReads -= 1;
      update({ isMarkingRead: pendingReads > 0 });
    });
  }

  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => initialSnapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    connect: () => {
      active = true;
      lifecycle += 1;
      const run = lifecycle;
      cursor = undefined;
      update(initialState);
      if (isCurrent(run)) {
        window.addEventListener("storage", checkSession);
        window.addEventListener("focus", checkSession);
        window.addEventListener("pageshow", checkSession);
        document.addEventListener("visibilitychange", checkSession);
        restartStream();
        // Initial REST and SSE race for the first result; the stream cancels a late REST.
        void refresh().catch(() => undefined);
      }
      return () => {
        if (lifecycle === run) disconnect();
      };
    },
  };
}

function keepReadState(item: NotificationItem, previous: NotificationItem | undefined): NotificationItem {
  if (!previous?.is_read || item.is_read) return item;
  // There is no mark-unread action: a delayed snapshot cannot undo a confirmed read.
  return {
    ...item,
    is_read: true,
    ...(previous.read_at ? { read_at: previous.read_at } : {}),
  };
}

function cancelledRequest(): DOMException {
  return new DOMException("The notification session is no longer active.", "AbortError");
}

function asError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error("Unable to update notifications.");
}