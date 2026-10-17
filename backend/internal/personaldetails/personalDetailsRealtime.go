package personaldetails

import (
	"context"
	"errors"
	notification "everest-backend/internal/notification/core"
	"fmt"
	"net/http"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

func relevantChange(key string) bool {
	switch key {
	case "first_name", "last_name", "name_changed_at", "profile_image_url", "gender", "birth_year", "birth_month", "birth_day", "email_or_phone", "email_verified", "personal_details_revision", "deactivated", "deletion_requested", "session_version":
		return true
	}
	return key == "personal_details" || key == "personal_details_requests" || strings.HasPrefix(key, "personal_details.") || strings.HasPrefix(key, "personal_details_requests.")
}

// One MongoDB watcher per server, shared by all open Details/Info pages.
// The stream contains invalidations only, never account fields or review reasons.
func (s *MongoStore) Watch(ctx context.Context, hub *notification.Hub) {
	var resume bson.Raw
	backoff := time.Second
	for ctx.Err() == nil {
		opts := options.ChangeStream().SetMaxAwaitTime(time.Second).SetBatchSize(100)
		if len(resume) > 0 {
			opts.SetResumeAfter(resume)
		}
		stream, err := s.users.Watch(ctx, mongo.Pipeline{bson.D{{Key: "$project", Value: bson.M{"_id": 1, "operationType": 1, "documentKey": 1, "updateDescription.updatedFields": 1, "updateDescription.removedFields": 1}}}}, opts)
		if err == nil {
			hub.NotifyAll()
			backoff = time.Second
			for stream.Next(ctx) {
				var event struct {
					Operation string `bson:"operationType"`
					Key       struct {
						ID bson.ObjectID `bson:"_id"`
					} `bson:"documentKey"`
					Update struct {
						Fields  bson.M   `bson:"updatedFields"`
						Removed []string `bson:"removedFields"`
					} `bson:"updateDescription"`
				}
				if stream.Decode(&event) != nil {
					break
				}
				resume = append(bson.Raw(nil), stream.ResumeToken()...)
				relevant := event.Operation != "update"
				for key := range event.Update.Fields {
					relevant = relevant || relevantChange(key)
				}
				for _, key := range event.Update.Removed {
					relevant = relevant || relevantChange(key)
				}
				if relevant && !event.Key.ID.IsZero() {
					hub.Notify(event.Key.ID)
				}
			}
			err = stream.Err()
			closeCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			_ = stream.Close(closeCtx)
			cancel()
			var command mongo.CommandError
			if errors.As(err, &command) && (command.Code == 286 || command.Code == 260) {
				resume = nil
			}
		}
		if ctx.Err() != nil {
			return
		}
		timer := time.NewTimer(backoff)
		select {
		case <-ctx.Done():
			timer.Stop()
			return
		case <-timer.C:
		}
		backoff *= 2
		if backoff > 30*time.Second {
			backoff = 30 * time.Second
		}
	}
}

func (h *Handler) Stream(w http.ResponseWriter, r *http.Request) {
	owner, version, ok := session(r)
	if !ok {
		fail(w, ErrSession)
		return
	}
	target := r.PathValue("userID")
	private := target == ""
	if private {
		target = owner
	}
	check := func() error {
		if private {
			_, err := h.service.Get(r.Context(), owner, version)
			return err
		}
		_, err := h.service.Public(r.Context(), owner, version, target)
		return err
	}
	if err := check(); err != nil {
		fail(w, err)
		return
	}
	id, err := bson.ObjectIDFromHex(target)
	if err != nil {
		fail(w, ErrNotFound)
		return
	}
	if _, ok := w.(http.Flusher); !ok {
		fail(w, errors.New("stream unsupported"))
		return
	}
	changes, cleanup, err := h.hub.Subscribe(r.Context(), id)
	if err != nil {
		fail(w, err)
		return
	}
	defer cleanup()
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("X-Accel-Buffering", "no")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	controller := http.NewResponseController(w)
	send := func(frame string) bool {
		_ = controller.SetWriteDeadline(time.Now().Add(8 * time.Second))
		if _, err := fmt.Fprint(w, frame); err != nil {
			return false
		}
		return controller.Flush() == nil
	}
	heartbeat := time.NewTicker(15 * time.Second)
	defer heartbeat.Stop()
	rotate := time.NewTimer(75 * time.Second)
	defer rotate.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case <-rotate.C:
			return
		case _, open := <-changes:
			if !open {
				return
			}
			if err := check(); err != nil {
				send("event: details.unavailable\ndata: {}\n\n")
				return
			}
			if !send("event: details.changed\ndata: {}\n\n") {
				return
			}
		case <-heartbeat.C:
			if err := check(); err != nil {
				send("event: details.unavailable\ndata: {}\n\n")
				return
			}
			// Reconciliation also covers a watcher outage and standalone MongoDB.
			if !send("event: details.check\ndata: {}\n\n") {
				return
			}
		}
	}
}
