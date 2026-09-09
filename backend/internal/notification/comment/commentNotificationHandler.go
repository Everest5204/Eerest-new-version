package comment

import (
	"context"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// Handler connects the backend comment mutation to the notification service.
type Handler struct {
	service *Service
}

func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

// HandleCreatedComment runs after a new comment or reply has been inserted
// into comments, inside the same active transaction. The caller must return
// its error to WithTransaction so failures can abort or retry the whole action.
// The IDs come from the authenticated comment mutation and its inserted record.
func (handler *Handler) HandleCreatedComment(
	ctx context.Context,
	commentID bson.ObjectID,
	postID bson.ObjectID,
	userID bson.ObjectID,
) error {
	if handler == nil || handler.service == nil {
		return ErrCommentServiceNotConfigured
	}

	// Preserve the original session context and driver errors. The service resolves
	// comment versus reply from saved data. Duplicate events are successful no-ops.
	_, err := handler.service.Create(ctx, CreateCommentNotificationInput{
		CommentID: commentID,
		PostID:    postID,
		UserID:    userID,
	})
	return err
}






// HandleCreatedCommentLove runs after inserting a new love,
// within the same transaction as the comment love action.
func (handler *Handler) HandleCreatedCommentLove(
	ctx context.Context,
	loveID bson.ObjectID,
	commentID bson.ObjectID,
	userID bson.ObjectID,
) error {
	if handler == nil || handler.service == nil {
		return ErrCommentServiceNotConfigured
	}

	_, err := handler.service.CreateLove(
		ctx,
		CreateCommentLoveNotificationInput{
			LoveID:    loveID,
			CommentID: commentID,
			UserID:    userID,
		},
	)

	return err
}