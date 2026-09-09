package reaction

import (
	"context"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// Handler connects the backend reaction mutation to the notification service.
type Handler struct {
	service *Service
}

func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

// HandleCreatedReaction runs after a new post_reactions record has been inserted,
// inside the same active transaction. The caller must return its error to
// WithTransaction so notification failures can abort or retry the whole action.
// The IDs come from the authenticated reaction mutation and its inserted record.
func (handler *Handler) HandleCreatedReaction(
	ctx context.Context,
	reactionID bson.ObjectID,
	postID bson.ObjectID,
	userID bson.ObjectID,
) error {
	if handler == nil || handler.service == nil {
		return ErrReactionServiceNotConfigured
	}

	// Preserve the original session context and driver errors. A duplicate event
	// is a successful no-op; the core watcher delivers notifications after commit.
	_, err := handler.service.Create(ctx, CreateReactionNotificationInput{
		ReactionID: reactionID,
		PostID:     postID,
		UserID:     userID,
	})
	return err
}