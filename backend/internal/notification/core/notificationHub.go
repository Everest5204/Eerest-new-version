package notification

import (
	"context"
	"errors"
	"sync"

	"go.mongodb.org/mongo-driver/v2/bson"
)

var ErrHubClosed = errors.New("notification hub is closed")

// Hub distributes database-change signals to this server's active connections.
// Create one shared Hub per server and use it for every notification section.
type Hub struct {
	mu            sync.RWMutex
	subscriptions map[bson.ObjectID]map[*hubSubscription]struct{}
	closed        bool
}

type hubSubscription struct {
	changes     chan struct{}
	stopContext func() bool
}

func NewHub() *Hub {
	return &Hub{
		subscriptions: make(map[bson.ObjectID]map[*hubSubscription]struct{}),
	}
}

// Subscribe returns a signal channel and an idempotent cleanup function.
// The caller should defer cleanup and reload database state after each signal.
// Canceling ctx also removes the subscription automatically.
func (hub *Hub) Subscribe(
	ctx context.Context,
	recipientID bson.ObjectID,
) (<-chan struct{}, func(), error) {
	if recipientID.IsZero() {
		return nil, nil, ErrInvalidUserID
	}

	hub.mu.Lock()
	defer hub.mu.Unlock()

	if hub.closed {
		return nil, nil, ErrHubClosed
	}
	if err := ctx.Err(); err != nil {
		return nil, nil, err
	}
	if hub.subscriptions == nil {
		hub.subscriptions = make(map[bson.ObjectID]map[*hubSubscription]struct{})
	}
	if hub.subscriptions[recipientID] == nil {
		hub.subscriptions[recipientID] = make(map[*hubSubscription]struct{})
	}

	subscription := &hubSubscription{
		changes: make(chan struct{}, 1),
	}
	hub.subscriptions[recipientID][subscription] = struct{}{}

	// AfterFunc runs asynchronously, including for an already-canceled context.
	// Register it under the lock so cleanup always sees an initialized entry.
	subscription.stopContext = context.AfterFunc(ctx, func() {
		hub.unsubscribe(recipientID, subscription)
	})

	// Register before requesting the initial refresh, so later changes remain
	// observable while the subscriber loads its first database snapshot.
	subscription.changes <- struct{}{}

	cleanup := func() {
		hub.unsubscribe(recipientID, subscription)
	}
	return subscription.changes, cleanup, nil
}

// Notify signals every connection belonging to the recipient.
// Call this for committed database changes, never inside a pending transaction.
func (hub *Hub) Notify(recipientID bson.ObjectID) {
	hub.mu.RLock()
	defer hub.mu.RUnlock()

	if hub.closed {
		return
	}
	for subscription := range hub.subscriptions[recipientID] {
		signalSubscription(subscription)
	}
}

// NotifyAll requests reconciliation after a database watcher reconnects.
// Each connection reloads only its own authenticated user's database state.
func (hub *Hub) NotifyAll() {
	hub.mu.RLock()
	defer hub.mu.RUnlock()

	if hub.closed {
		return
	}
	for _, subscriptions := range hub.subscriptions {
		for subscription := range subscriptions {
			signalSubscription(subscription)
		}
	}
}

// Close stops all subscriptions during server shutdown. It is safe to repeat.
func (hub *Hub) Close() {
	hub.mu.Lock()
	defer hub.mu.Unlock()

	if hub.closed {
		return
	}
	hub.closed = true
	for _, subscriptions := range hub.subscriptions {
		for subscription := range subscriptions {
			subscription.stopContext()
			close(subscription.changes)
		}
	}
	hub.subscriptions = nil
}

func (hub *Hub) unsubscribe(recipientID bson.ObjectID, subscription *hubSubscription) {
	hub.mu.Lock()
	defer hub.mu.Unlock()

	subscriptions := hub.subscriptions[recipientID]
	if _, exists := subscriptions[subscription]; !exists {
		return
	}

	delete(subscriptions, subscription)
	if len(subscriptions) == 0 {
		delete(hub.subscriptions, recipientID)
	}
	subscription.stopContext()
	close(subscription.changes)
}

// The caller holds hub.mu while signaling or closing subscription channels.
// One pending refresh is enough: notification records remain in the database.
func signalSubscription(subscription *hubSubscription) {
	select {
	case subscription.changes <- struct{}{}:
	default:
	}
}