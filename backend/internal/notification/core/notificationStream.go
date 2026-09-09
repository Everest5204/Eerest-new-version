package notification

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"
)

const (
	notificationStreamHeartbeat      = 15 * time.Second
	notificationStreamLifetime       = 75 * time.Second
	notificationStreamWriteTimeout   = 10 * time.Second
	notificationStreamRefreshSpacing = 100 * time.Millisecond
	notificationStreamRetryMillis    = 1000

	notificationSnapshotEvent    = "notifications.snapshot"
	notificationStreamErrorEvent = "notifications.error"
)

type notificationSnapshotReader interface {
	GetNotifications(context.Context, string, string, int64) (*NotificationListResponse, error)
}

type StreamHandler struct {
	service           notificationSnapshotReader
	hub               *Hub
	heartbeatInterval time.Duration
	maxDuration       time.Duration
}

var _ http.Handler = (*StreamHandler)(nil)

func NewStreamHandler(service *Service, hub *Hub) *StreamHandler {
	return &StreamHandler{
		service:           service,
		hub:               hub,
		heartbeatInterval: notificationStreamHeartbeat,
		maxDuration:       notificationStreamLifetime,
	}
}

// ServeHTTP sends first-page snapshots and the current unread count.
// The frontend replaces its first-page snapshot; it must not append each event
// as a new notification. Older pages remain available through the list API.
func (handler *StreamHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireNotificationRequest(w, r, http.MethodGet)
	if !ok {
		return
	}
	recipientID, err := parseNotificationUserID(userID)
	if err != nil {
		writeNotificationServiceError(w, r, err)
		return
	}

	// Rotate before the existing server's 90-second write timeout.
	// A reconnect passes through authentication and receives a fresh snapshot.
	ctx, cancel := context.WithTimeout(r.Context(), handler.maxDuration)
	defer cancel()
	changes, cleanup, err := handler.hub.Subscribe(ctx, recipientID)
	if err != nil {
		if errors.Is(err, ErrHubClosed) {
			w.Header().Set("Retry-After", "1")
			writeNotificationError(w, http.StatusServiceUnavailable, "Notification stream is restarting")
		} else if ctx.Err() == nil {
			writeNotificationServiceError(w, r, err)
		}
		return
	}
	defer cleanup()

	controller := http.NewResponseController(w)
	streamDeadline, _ := ctx.Deadline()
	if err := controller.SetWriteDeadline(streamDeadline); err != nil {
		log.Printf("notification stream deadline setup failed: %v", err)
		writeNotificationError(w, http.StatusInternalServerError, "Realtime notifications are currently unavailable")
		return
	}

	headers := w.Header()
	headers.Set("Content-Type", "text/event-stream; charset=utf-8")
	headers.Set("Cache-Control", "no-store, no-cache, must-revalidate, no-transform")
	headers.Set("Pragma", "no-cache")
	headers.Set("Expires", "0")
	headers.Set("Surrogate-Control", "no-store")
	headers.Set("X-Accel-Buffering", "no")
	headers.Set("X-Content-Type-Options", "nosniff")
	headers.Add("Vary", "Authorization")

	opening := fmt.Sprintf("retry: %d\n: connected\n\n", notificationStreamRetryMillis)
	if err := writeNotificationStreamFrame(ctx, w, controller, []byte(opening)); err != nil {
		return
	}

	heartbeat := time.NewTicker(handler.heartbeatInterval)
	defer heartbeat.Stop()
	var nextRefresh time.Time

	for {
		select {
		case <-ctx.Done():
			return
		case _, open := <-changes:
			if !open {
				return
			}
			if err := waitForNotificationRefresh(ctx, nextRefresh); err != nil {
				return
			}

			// Coalesce changes received during the short refresh spacing window.
			// Changes arriving during the database read queue the next refresh.
			select {
			case _, open := <-changes:
				if !open {
					return
				}
			default:
			}
			if ctx.Err() != nil {
				return
			}

			snapshot, err := handler.service.GetNotifications(ctx, userID, "", DefaultListLimit)
			if err != nil {
				if ctx.Err() == nil {
					log.Printf("notification stream snapshot failed: %v", err)
					_ = writeNotificationStreamEvent(ctx, w, controller, notificationStreamErrorEvent,
						notificationErrorResponse{Error: "Unable to refresh notifications"})
				}
				return
			}
			if err := writeNotificationStreamEvent(ctx, w, controller, notificationSnapshotEvent, snapshot); err != nil {
				return
			}
			nextRefresh = time.Now().Add(notificationStreamRefreshSpacing)

		case <-heartbeat.C:
			if err := writeNotificationStreamFrame(ctx, w, controller, []byte(": keep-alive\n\n")); err != nil {
				return
			}
		}
	}
}

func waitForNotificationRefresh(ctx context.Context, notBefore time.Time) error {
	delay := time.Until(notBefore)
	if delay <= 0 {
		return ctx.Err()
	}
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

func writeNotificationStreamEvent(
	ctx context.Context,
	w http.ResponseWriter,
	controller *http.ResponseController,
	eventName string,
	payload any,
) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	frame := fmt.Appendf(nil, "event: %s\ndata: %s\n\n", eventName, data)
	return writeNotificationStreamFrame(ctx, w, controller, frame)
}

func writeNotificationStreamFrame(
	ctx context.Context,
	w http.ResponseWriter,
	controller *http.ResponseController,
	frame []byte,
) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	writeDeadline := time.Now().Add(notificationStreamWriteTimeout)
	streamDeadline, hasDeadline := ctx.Deadline()
	if hasDeadline && streamDeadline.Before(writeDeadline) {
		writeDeadline = streamDeadline
	}
	if err := controller.SetWriteDeadline(writeDeadline); err != nil {
		return err
	}
	n, err := w.Write(frame)
	if err != nil {
		return err
	}
	if n != len(frame) {
		return io.ErrShortWrite
	}
	if err := controller.Flush(); err != nil {
		return err
	}

	// Restore the stream lifetime deadline while idle. Leaving the shorter
	// per-write deadline active could expire before the next heartbeat.
	return controller.SetWriteDeadline(streamDeadline)
}