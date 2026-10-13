package saveditems

import (
	"context"
	"errors"
	notification "everest-backend/internal/notification/core"
	"fmt"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"net/http"
	"time"
)

func (h *Handler) stream(w http.ResponseWriter, r *http.Request) {
	a, e := authenticated(r)
	if e != nil {
		fail(w, e)
		return
	}
	check := func() error {
		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()
		return h.service.check(ctx, a)
	}
	if e = check(); e != nil {
		fail(w, e)
		return
	}
	if _, ok := w.(http.Flusher); !ok {
		fail(w, ErrUnavailable)
		return
	}
	signals, cleanup, e := h.hub.Subscribe(r.Context(), a.Owner)
	if e != nil {
		fail(w, e)
		return
	}
	defer cleanup()
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("X-Accel-Buffering", "no")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	c := http.NewResponseController(w)
	heart := time.NewTicker(15 * time.Second)
	defer heart.Stop()
	rotate := time.NewTimer(75 * time.Second)
	defer rotate.Stop()
	send := func(frame string) bool {
		_ = c.SetWriteDeadline(time.Now().Add(8 * time.Second))
		if _, e := fmt.Fprint(w, frame); e != nil {
			return false
		}
		return c.Flush() == nil
	}
	for {
		select {
		case <-r.Context().Done():
			return
		case <-rotate.C:
			return
		case _, open := <-signals:
			if !open || check() != nil {
				return
			}
			versionCtx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
			revision, err := h.service.store.OwnerRevision(versionCtx, a)
			cancel()
			if err != nil {
				return
			}
			if !send(fmt.Sprintf("event: saved.changed\ndata: {\"owner_id\":\"%s\",\"revision\":%d}\n\n", a.Owner.Hex(), revision)) {
				return
			}
		case <-heart.C:
			if check() != nil || !send(": keep-alive\n\n") {
				return
			}
		}
	}
}

// Watch committed bookmark changes across server replicas. The foreground
// client's reconciliation also covers post edits/deletions and watcher outages.
func (s *MongoStore) Watch(ctx context.Context, hub *notification.Hub) {
	var resume bson.Raw
	backoff := time.Second
	for ctx.Err() == nil {
		opts := options.ChangeStream().SetFullDocument(options.UpdateLookup).SetMaxAwaitTime(time.Second).SetBatchSize(50)
		if len(resume) > 0 {
			opts.SetResumeAfter(resume)
		}
		stream, e := s.records.Watch(ctx, mongo.Pipeline{bson.D{{Key: "$project", Value: bson.M{"_id": 1, "operationType": 1, "fullDocument.user_id": 1}}}}, opts)
		if e == nil {
			hub.NotifyAll()
			backoff = time.Second
			for stream.Next(ctx) {
				var event struct {
					Operation string `bson:"operationType"`
					Doc       *struct {
						Owner bson.ObjectID `bson:"user_id"`
					} `bson:"fullDocument"`
				}
				if stream.Decode(&event) != nil {
					break
				}
				resume = append(bson.Raw(nil), stream.ResumeToken()...)
				if event.Doc != nil && !event.Doc.Owner.IsZero() {
					hub.Notify(event.Doc.Owner)
				} else {
					hub.NotifyAll()
				}
			}
			e = stream.Err()
			closeCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			_ = stream.Close(closeCtx)
			cancel()
			var command mongo.CommandError
			if errors.As(e, &command) && (command.Code == 286 || command.Code == 260) {
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
		backoff = (backoff * 2)
		if backoff > 30*time.Second {
			backoff = 30 * time.Second
		}
	}
}
