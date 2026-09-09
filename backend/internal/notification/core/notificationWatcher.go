package notification

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"math/rand/v2"
	"sync/atomic"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

const (
	notificationWatchOpenTimeout  = 15 * time.Second
	notificationWatchCloseTimeout = 5 * time.Second
	notificationWatchRetryInitial = time.Second
	notificationWatchRetryMaximum = 30 * time.Second
	notificationWatchHealthyTime  = 30 * time.Second
)

var (
	ErrWatcherAlreadyRunning             = errors.New("notification watcher is already running")
	ErrChangeStreamsUnavailable          = errors.New("realtime notifications require a MongoDB replica set or sharded cluster")
	ErrNotificationCollectionInvalidated = errors.New("notification collection was dropped, renamed or invalidated; restore the collection and its indexes before restarting the watcher")
)

type notificationChangeStream interface {
	Next(context.Context) bool
	Decode(any) error
	ResumeToken() bson.Raw
	Err() error
	Close(context.Context) error
}

type notificationChange struct {
	OperationType string `bson:"operationType"`
	FullDocument  *struct {
		RecipientID bson.ObjectID `bson:"recipient_id"`
	} `bson:"fullDocument"`
	UpdateDescription struct {
		UpdatedFields bson.Raw `bson:"updatedFields"`
		RemovedFields []string `bson:"removedFields"`
	} `bson:"updateDescription"`
}

// Watcher observes committed changes in the shared notifications collection.
// Create one per backend process and share its Hub with every StreamHandler.
// A watcher never creates notifications or sends database documents to clients.
type Watcher struct {
	hub        *Hub
	running    atomic.Bool
	openStream func(context.Context, bson.Raw) (notificationChangeStream, error)
}

func NewWatcher(service *Service, hub *Hub) *Watcher {
	return &Watcher{
		hub: hub,
		openStream: func(ctx context.Context, resumeToken bson.Raw) (notificationChangeStream, error) {
			if service == nil || service.notificationsCollection == nil {
				return nil, errors.New("notification watcher requires an initialized service")
			}
			openCtx, cancel := context.WithTimeout(ctx, notificationWatchOpenTimeout)
			defer cancel()

			watchOptions := options.ChangeStream().
				SetFullDocument(options.UpdateLookup).
				SetBatchSize(100).
				SetMaxAwaitTime(time.Second)
			if len(resumeToken) != 0 {
				watchOptions.SetResumeAfter(resumeToken)
			}

			// Preserve the event's _id resume token. Do not filter on fullDocument:
			// an update lookup can return null after a concurrent deletion.
			pipeline := mongo.Pipeline{
				bson.D{{Key: "$project", Value: bson.D{
					{Key: "_id", Value: 1},
					{Key: "operationType", Value: 1},
					{Key: "fullDocument.recipient_id", Value: 1},
					{Key: "updateDescription.updatedFields.recipient_id", Value: 1},
					{Key: "updateDescription.removedFields", Value: 1},
				}}},
			}
			return service.notificationsCollection.Watch(openCtx, pipeline, watchOptions)
		},
	}
}

// Run blocks until ctx is canceled or a non-retryable setup/database error occurs.
// Call it once in a server-lifetime goroutine, after Service.CreateIndexes succeeds.
// Handle its returned error; cancellation is a normal shutdown and returns nil.
// Use the server lifetime context, not a request or short startup-timeout context.
func (watcher *Watcher) Run(ctx context.Context) error {
	if !watcher.running.CompareAndSwap(false, true) {
		return ErrWatcherAlreadyRunning
	}
	defer watcher.running.Store(false)
	if watcher.hub == nil || watcher.openStream == nil {
		return errors.New("notification watcher requires an initialized service and hub")
	}

	var resumeToken bson.Raw
	retryDelay := notificationWatchRetryInitial
	for ctx.Err() == nil {
		stream, err := watcher.openStream(ctx, resumeToken)
		if err == nil {
			connectedAt := time.Now()
			// Open first, then reconcile. Changes during each snapshot remain
			// observable through this cursor, including after a server restart.
			watcher.hub.NotifyAll()
			resumeToken, err = watcher.consume(ctx, stream, resumeToken)
			closeNotificationChangeStream(stream)
			if time.Since(connectedAt) >= notificationWatchHealthyTime {
				retryDelay = notificationWatchRetryInitial
			}
		}
		if ctx.Err() != nil {
			return nil
		}
		if err == nil {
			err = io.EOF
		}

		resetToken, retry, watchErr := classifyNotificationWatchError(err, len(resumeToken) != 0)
		if !retry {
			return fmt.Errorf("notification watcher stopped: %w", watchErr)
		}
		if resetToken {
			// Notifications are stored records, not transient SSE messages.
			// If oplog history expired, a fresh cursor plus NotifyAll reloads
			// current state instead of pretending old events were replayed.
			resumeToken = nil
			log.Printf("notification watcher resume point unavailable; reopening and reconciling: %v", watchErr)
		} else {
			log.Printf("notification watcher interrupted; reconnecting: %v", watchErr)
		}

		// Jitter prevents multiple backend instances retrying in lockstep.
		delay := retryDelay/2 + time.Duration(rand.Int64N(int64(retryDelay/2)+1))
		if err := waitForNotificationWatchRetry(ctx, delay); err != nil {
			return nil
		}
		retryDelay = min(retryDelay*2, notificationWatchRetryMaximum)
	}
	return nil
}

func (watcher *Watcher) consume(
	ctx context.Context,
	stream notificationChangeStream,
	resumeToken bson.Raw,
) (bson.Raw, error) {
	for stream.Next(ctx) {
		if ctx.Err() != nil {
			return resumeToken, ctx.Err()
		}
		var change notificationChange
		if err := stream.Decode(&change); err != nil {
			watcher.hub.NotifyAll()
			return resumeToken, fmt.Errorf("decode notification change: %w", err)
		}
		if err := watcher.publishChange(change); err != nil {
			return resumeToken, err
		}
		resumeToken = copyNotificationResumeToken(stream, resumeToken)
	}
	// Empty getMore batches can advance the driver's post-batch resume token.
	return copyNotificationResumeToken(stream, resumeToken), stream.Err()
}

func (watcher *Watcher) publishChange(change notificationChange) error {
	switch change.OperationType {
	case "insert", "update":
		if change.FullDocument == nil || change.FullDocument.RecipientID.IsZero() || notificationRecipientChanged(change) {
			// The document may have been deleted before updateLookup. Reload
			// each connected user's own state; do not guess the old recipient.
			watcher.hub.NotifyAll()
		} else {
			watcher.hub.Notify(change.FullDocument.RecipientID)
		}
	case "replace", "delete":
		// A replacement can change ownership; deletes have no fullDocument.
		// No pre-image collection setting or unbounded recipient cache needed.
		watcher.hub.NotifyAll()
	case "drop", "rename", "dropDatabase", "invalidate":
		watcher.hub.NotifyAll()
		return ErrNotificationCollectionInvalidated
	}
	return nil
}

func notificationRecipientChanged(change notificationChange) bool {
	if _, err := change.UpdateDescription.UpdatedFields.LookupErr("recipient_id"); err == nil {
		return true
	}
	for _, field := range change.UpdateDescription.RemovedFields {
		if field == "recipient_id" {
			return true
		}
	}
	return false
}

func copyNotificationResumeToken(stream notificationChangeStream, previous bson.Raw) bson.Raw {
	if token := stream.ResumeToken(); len(token) != 0 {
		return append(bson.Raw(nil), token...)
	}
	return previous
}

func closeNotificationChangeStream(stream notificationChangeStream) {
	// Shutdown cancellation must not prevent releasing the server cursor.
	ctx, cancel := context.WithTimeout(context.Background(), notificationWatchCloseTimeout)
	defer cancel()
	if err := stream.Close(ctx); err != nil {
		log.Printf("notification watcher cursor cleanup failed: %v", err)
	}
}

func classifyNotificationWatchError(err error, hasResumeToken bool) (resetToken, retry bool, result error) {
	var serverErr mongo.ServerError
	if errors.As(err, &serverErr) {
		if serverErr.HasErrorCode(40573) {
			return false, false, fmt.Errorf("%w: %v", ErrChangeStreamsUnavailable, err)
		}
		if hasResumeToken && (serverErr.HasErrorCode(136) || serverErr.HasErrorCode(260) || serverErr.HasErrorCode(280) || serverErr.HasErrorCode(286)) {
			return true, true, err
		}
		if serverErr.HasErrorLabel("ResumableChangeStreamError") {
			return false, true, err
		}
		// Cursor loss and transient server/topology errors also occur while
		// opening a cursor, before change-stream error labels are available.
		for _, code := range []int{6, 7, 43, 63, 89, 91, 133, 150, 189, 234, 262, 9001, 10107, 11600, 11602, 13388, 13435, 13436} {
			if serverErr.HasErrorCode(code) {
				return false, true, err
			}
		}
	}
	if errors.Is(err, io.EOF) || mongo.IsNetworkError(err) || mongo.IsTimeout(err) {
		return false, true, err
	}
	// Authentication, authorization and invalid configuration need attention;
	// repeatedly retrying them would hide a broken realtime setup.
	return false, false, err
}

func waitForNotificationWatchRetry(ctx context.Context, delay time.Duration) error {
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}