package follow

import (
	"context"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// Handler connects the backend follow mutation to the notification service.
type Handler struct {
	service *Service
}

func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

// HandleCreatedFollow runs after a new user_follows record has been inserted,
// inside the same active transaction. The caller must return its error to
// WithTransaction so notification failures can abort or retry the whole action.
// The IDs come from the authenticated follow mutation and its inserted record.
func (handler *Handler) HandleCreatedFollow(
	ctx context.Context,
	followID bson.ObjectID,
	followerID bson.ObjectID,
	followingID bson.ObjectID,
) error {
	if handler == nil || handler.service == nil {
		return ErrFollowServiceNotConfigured
	}

	// Preserve the original session context and driver errors. A duplicate event
	// is a successful no-op; the core watcher delivers notifications after commit.
	_, err := handler.service.Create(ctx, CreateFollowNotificationInput{
		FollowID:    followID,
		FollowerID:  followerID,
		FollowingID: followingID,
	})
	return err
}