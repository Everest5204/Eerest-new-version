package follow

import (
	"context"
	"errors"
	"time"

	notification "everest-backend/internal/notification/core"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

const followNotificationTimeout = 5 * time.Second

var (
	ErrInvalidFollowID            = errors.New("invalid follow id")
	ErrFollowNotFound             = errors.New("follow relationship not found")
	ErrFollowMismatch             = errors.New("follow relationship does not match notification input")
	ErrFollowTransactionRequired  = errors.New("follow notification requires an active follow transaction")
	ErrFollowServiceNotConfigured = errors.New("follow notification service is not configured")
)

type Service struct {
	followsCollection   *mongo.Collection
	notificationService *notification.Service
}

// NewService reuses the shared notification service. Both services must use the
// same database and MongoDB client. Create the core notification indexes at startup.
func NewService(
	database *mongo.Database,
	notificationService *notification.Service,
) *Service {
	service := &Service{notificationService: notificationService}
	if database != nil {
		service.followsCollection = database.Collection("user_follows")
	}
	return service
}

// Create records a newly inserted follow relationship's notification.
// Call it inside the existing follow transaction, only when the follow was created,
// and return any error to WithTransaction so the entire mutation can be retried.
// The boolean means inserted, not committed. Realtime delivery is owned by the
// core watcher after commit; this method does not publish events itself.
func (service *Service) Create(
	ctx context.Context,
	input CreateFollowNotificationInput,
) (bool, error) {
	if err := ctx.Err(); err != nil {
		return false, err
	}
	if input.FollowID.IsZero() {
		return false, ErrInvalidFollowID
	}
	if input.FollowerID.IsZero() || input.FollowingID.IsZero() {
		return false, notification.ErrInvalidUserID
	}
	if input.FollowerID == input.FollowingID {
		return false, nil
	}
	if service == nil || service.followsCollection == nil || service.notificationService == nil {
		return false, ErrFollowServiceNotConfigured
	}

	session := mongo.SessionFromContext(ctx)
	if session == nil || !session.TransactionRunning() {
		return false, ErrFollowTransactionRequired
	}
	if session.Client() != service.followsCollection.Database().Client() {
		return false, mongo.ErrWrongClient
	}

	// Keep the caller's session and any earlier deadline. Transactions use sequential
	// operations, so the reverse lookup and notification write follow this lookup.
	dbCtx, cancel := context.WithTimeout(ctx, followNotificationTimeout)
	defer cancel()

	var relationship followDocument
	err := service.followsCollection.FindOne(
		dbCtx,
		bson.M{"_id": input.FollowID},
		options.FindOne().SetProjection(bson.M{
			"_id":          1,
			"follower_id":  1,
			"following_id": 1,
		}),
	).Decode(&relationship)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return false, ErrFollowNotFound
	}
	if err != nil {
		return false, err
	}
	if relationship.ID != input.FollowID ||
		relationship.FollowerID != input.FollowerID ||
		relationship.FollowingID != input.FollowingID {
		return false, ErrFollowMismatch
	}

	// The existing unique (follower_id, following_id) index serves this lookup.
	reverseErr := service.followsCollection.FindOne(
		dbCtx,
		bson.M{
			"follower_id":  relationship.FollowingID,
			"following_id": relationship.FollowerID,
		},
		options.FindOne().SetProjection(bson.M{"_id": 1}),
	).Err()

	kind := notification.TypeFollow
	switch {
	case reverseErr == nil:
		kind = notification.TypeFollowBack
	case errors.Is(reverseErr, mongo.ErrNoDocuments):
		// The recipient was not already following the actor in this transaction.
	default:
		// Preserve driver error labels so WithTransaction can handle transient failures.
		return false, reverseErr
	}

	return service.notificationService.Create(dbCtx, notification.CreateNotificationInput{
		ActorID:     relationship.FollowerID,
		RecipientID: relationship.FollowingID,
		Type:        kind,
		// A retry keeps the same key, even if follow-back classification later changes.
		// An unfollow followed by a new follow has a new relationship ID and event key.
		EventKey: "follow:" + relationship.ID.Hex(),
	})
}
