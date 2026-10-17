package post

import (
	"context"
	"errors"
	"fmt"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"net/http"
	"sync"
	"time"
)

// One database watcher per API process, bounded subscribers and coalesced
// invalidations. Clients fetch authenticated data; events contain no post data.
type HomeFeedHub struct {
	mu        sync.Mutex
	listeners map[chan struct{}]struct{}
}

func newHomeFeedHub() *HomeFeedHub { return &HomeFeedHub{listeners: make(map[chan struct{}]struct{})} }

func (h *HomeFeedHub) subscribe() (chan struct{}, func(), bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if len(h.listeners) >= 4096 {
		return nil, func() {}, false
	}
	c := make(chan struct{}, 1)
	h.listeners[c] = struct{}{}
	return c, func() { h.mu.Lock(); delete(h.listeners, c); h.mu.Unlock() }, true
}

func (h *HomeFeedHub) publish() {
	h.mu.Lock()
	defer h.mu.Unlock()
	for c := range h.listeners {
		select {
		case c <- struct{}{}:
		default:
		}
	}
}

func (service *PostService) StreamHomeFeed(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w, http.MethodGet)
		return
	}
	if _, ok := getAuthUserID(r); !ok {
		writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	if _, ok := w.(http.Flusher); !ok {
		writeError(w, http.StatusServiceUnavailable, "Streaming unavailable")
		return
	}
	c, cleanup, ok := service.home.subscribe()
	if !ok {
		w.Header().Set("Retry-After", "30")
		writeError(w, http.StatusServiceUnavailable, "Retry feed updates later")
		return
	}
	defer cleanup()
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("X-Accel-Buffering", "no")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	control := http.NewResponseController(w)
	send := func(frame string) bool {
		_ = control.SetWriteDeadline(time.Now().Add(8 * time.Second))
		if _, err := fmt.Fprint(w, frame); err != nil {
			return false
		}
		return control.Flush() == nil
	}
	if !send("event: feed.ready\ndata: {}\n\n") {
		return
	}
	heart := time.NewTicker(15 * time.Second)
	defer heart.Stop()
	// Account access middleware revalidates each new connection. A stream
	// carries only public invalidations and rotates to recheck authentication.
	rotate := time.NewTimer(75 * time.Second)
	defer rotate.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case <-rotate.C:
			return
		case <-heart.C:
			if !send(": keep-alive\n\n") {
				return
			}
		case <-c:
			if !send("event: feed.changed\ndata: {}\n\n") {
				return
			}
		}
	}
}

// A single database-level stream also observes author visibility changes.
// Standalone MongoDB deployments cannot watch: the client retains jittered
// foreground reconciliation, and this loop retries with bounded backoff.
func (service *PostService) WatchHomeFeed(ctx context.Context) {
	dirty := make(chan struct{}, 1)
	watchCtx, cancel := context.WithCancel(ctx)
	defer cancel()
	go func() {
		ticker := time.NewTicker(2 * time.Second)
		defer ticker.Stop()
		pending := false
		for {
			select {
			case <-watchCtx.Done():
				return
			case <-dirty:
				pending = true
			case <-ticker.C:
				if pending {
					pending = false
					service.home.publish()
				}
			}
		}
	}()
	var resume bson.Raw
	backoff := time.Second
	for ctx.Err() == nil {
		opts := options.ChangeStream().SetMaxAwaitTime(2 * time.Second).SetBatchSize(100)
		if len(resume) > 0 {
			opts.SetResumeAfter(resume)
		}
		pipeline := mongo.Pipeline{bson.D{{Key: "$match", Value: bson.M{"$or": bson.A{
			bson.M{"ns.coll": "posts", "operationType": bson.M{"$in": bson.A{"insert", "update", "replace", "delete"}}},
			bson.M{"ns.coll": "users", "operationType": bson.M{"$in": bson.A{"delete", "replace"}}},
			bson.M{"ns.coll": "users", "operationType": "update", "$or": bson.A{
				bson.M{"updateDescription.updatedFields.deactivated": bson.M{"$exists": true}},
				bson.M{"updateDescription.updatedFields.deletion_requested": bson.M{"$exists": true}},
				bson.M{"updateDescription.updatedFields.first_name": bson.M{"$exists": true}},
				bson.M{"updateDescription.updatedFields.last_name": bson.M{"$exists": true}},
				bson.M{"updateDescription.updatedFields.profile_image_url": bson.M{"$exists": true}},
			}},
		}}}}}
		stream, err := service.postsCollection.Database().Watch(ctx, pipeline, opts)
		if err == nil {
			select {
			case dirty <- struct{}{}:
			default:
			}
			backoff = time.Second
			for stream.Next(ctx) {
				resume = append(bson.Raw(nil), stream.ResumeToken()...)
				select {
				case dirty <- struct{}{}:
				default:
				}
			}
			err = stream.Err()
			closeCtx, closeCancel := context.WithTimeout(context.Background(), 3*time.Second)
			_ = stream.Close(closeCtx)
			closeCancel()
			var command mongo.CommandError
			if errors.As(err, &command) && (command.Code == 286 || command.Code == 260) {
				resume = nil
			}
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
