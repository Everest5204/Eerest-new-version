package reaction

import (
	"context"
	"errors"
	"strings"
	"time"

	notification "everest-backend/internal/notification/core"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

const reactionNotificationTimeout = 5 * time.Second

var (
	ErrInvalidReactionID            = errors.New("invalid reaction id")
	ErrInvalidPostID                = errors.New("invalid post id")
	ErrReactionNotFound             = errors.New("reaction not found")
	ErrReactionMismatch             = errors.New("reaction does not match notification input")
	ErrReactionPostNotFound         = errors.New("reaction post is missing or deleted")
	ErrReactionTransactionRequired  = errors.New("reaction notification requires an active reaction transaction")
	ErrReactionServiceNotConfigured = errors.New("reaction notification service is not configured")
)

type Service struct {
	reactionsCollection *mongo.Collection
	postsCollection     *mongo.Collection
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
		service.reactionsCollection = database.Collection("post_reactions")
		service.postsCollection = database.Collection("posts")
	}
	return service
}

// Create records a newly inserted post reaction's notification.
// Call it inside the reaction mutation's transaction, only when a reaction was
// inserted, and return any error to WithTransaction so the mutation can be retried.
// The boolean means inserted, not committed. The core watcher owns realtime
// delivery after commit; this method does not publish events itself.
func (service *Service) Create(
	ctx context.Context,
	input CreateReactionNotificationInput,
) (bool, error) {
	if err := ctx.Err(); err != nil {
		return false, err
	}
	if input.ReactionID.IsZero() {
		return false, ErrInvalidReactionID
	}
	if input.PostID.IsZero() {
		return false, ErrInvalidPostID
	}
	if input.UserID.IsZero() {
		return false, notification.ErrInvalidUserID
	}
	if service == nil || service.reactionsCollection == nil ||
		service.postsCollection == nil || service.notificationService == nil {
		return false, ErrReactionServiceNotConfigured
	}

	session := mongo.SessionFromContext(ctx)
	if session == nil || !session.TransactionRunning() {
		return false, ErrReactionTransactionRequired
	}
	if session.Client() != service.reactionsCollection.Database().Client() {
		return false, mongo.ErrWrongClient
	}

	// Keep the caller's session and any earlier deadline. MongoDB transaction
	// operations run sequentially; both lookups use the existing _id indexes.
	dbCtx, cancel := context.WithTimeout(ctx, reactionNotificationTimeout)
	defer cancel()

	var savedReaction reactionDocument
	err := service.reactionsCollection.FindOne(
		dbCtx,
		bson.M{"_id": input.ReactionID},
		options.FindOne().SetProjection(bson.M{
			"_id":           1,
			"post_id":       1,
			"user_id":       1,
			"reaction_type": 1,
		}),
	).Decode(&savedReaction)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return false, ErrReactionNotFound
	}
	if err != nil {
		return false, err
	}
	if savedReaction.ID != input.ReactionID ||
		savedReaction.PostID != input.PostID ||
		savedReaction.UserID != input.UserID {
		return false, ErrReactionMismatch
	}

	// The reaction mutation validates allowed values before saving. Read its value
	// directly instead of maintaining another list of reaction types here.
	if strings.TrimSpace(savedReaction.ReactionType) == "" {
		return false, notification.ErrInvalidNotification
	}

	var post postDocument
	err = service.postsCollection.FindOne(
		dbCtx,
		bson.M{"_id": savedReaction.PostID},
		options.FindOne().SetProjection(bson.M{
			"_id":        1,
			"user_id":    1,
			"is_deleted": 1,
		}),
	).Decode(&post)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return false, ErrReactionPostNotFound
	}
	if err != nil {
		// Keep driver error labels so WithTransaction can retry transient failures.
		return false, err
	}
	if post.ID != savedReaction.PostID || post.IsDeleted {
		return false, ErrReactionPostNotFound
	}
	if post.UserID.IsZero() {
		return false, notification.ErrInvalidUserID
	}
	if post.UserID == savedReaction.UserID {
		return false, nil
	}

	return service.notificationService.Create(dbCtx, notification.CreateNotificationInput{
		ActorID:     savedReaction.UserID,
		RecipientID: post.UserID,
		Type:        notification.TypePostReaction,
		// Retries keep the same key and preserve the existing notification's read state.
		// Removing a reaction and inserting a new one gives it a new source ID and key.
		EventKey:     "post_reaction:" + savedReaction.ID.Hex(),
		PostID:       &savedReaction.PostID,
		ReactionType: savedReaction.ReactionType,
	})
}