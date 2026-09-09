package comment

import (
	"context"
	"errors"
	"time"

	notification "everest-backend/internal/notification/core"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

const commentNotificationTimeout = 5 * time.Second

var (
	ErrInvalidCommentLoveID        = errors.New("invalid comment love id")
	ErrCommentLoveNotFound         = errors.New("comment love is missing")
	ErrCommentLoveMismatch         = errors.New("comment love does not match notification input")
	ErrInvalidCommentID            = errors.New("invalid comment id")
	ErrInvalidPostID               = errors.New("invalid post id")
	ErrInvalidParentCommentID      = errors.New("invalid parent comment id")
	ErrCommentNotFound             = errors.New("comment is missing or deleted")
	ErrCommentMismatch             = errors.New("comment does not match notification input")
	ErrCommentPostNotFound         = errors.New("comment post is missing or deleted")
	ErrParentCommentNotFound       = errors.New("parent comment is missing or deleted")
	ErrParentCommentMismatch       = errors.New("parent comment does not match the reply's post or parent id")
	ErrCommentTransactionRequired  = errors.New("comment notification requires an active comment transaction")
	ErrCommentServiceNotConfigured = errors.New("comment notification service is not configured")
)

type Service struct {
	commentsCollection     *mongo.Collection
	commentLovesCollection *mongo.Collection
	postsCollection        *mongo.Collection
	notificationService    *notification.Service
}

// NewService reuses the shared notification service. Both services must use the
// same database and MongoDB client. Create the core notification indexes at startup.
func NewService(
	database *mongo.Database,
	notificationService *notification.Service,
) *Service {
	service := &Service{notificationService: notificationService}
	if database != nil {
		service.commentsCollection = database.Collection("comments")
		service.commentLovesCollection = database.Collection("comment_loves")
		service.postsCollection = database.Collection("posts")
	}
	return service
}

// Create records a newly inserted comment or reply's notification.
// Call it inside the comment mutation's transaction and return any error to
// WithTransaction so notification failures can abort or retry the whole action.
// The boolean means inserted, not committed. The core watcher owns realtime
// delivery after commit; this method does not publish events itself.
func (service *Service) Create(
	ctx context.Context,
	input CreateCommentNotificationInput,
) (bool, error) {
	if err := ctx.Err(); err != nil {
		return false, err
	}
	if input.CommentID.IsZero() {
		return false, ErrInvalidCommentID
	}
	if input.PostID.IsZero() {
		return false, ErrInvalidPostID
	}
	if input.UserID.IsZero() {
		return false, notification.ErrInvalidUserID
	}
	if service == nil || service.commentsCollection == nil ||
		service.postsCollection == nil || service.notificationService == nil {
		return false, ErrCommentServiceNotConfigured
	}

	session := mongo.SessionFromContext(ctx)
	if session == nil || !session.TransactionRunning() {
		return false, ErrCommentTransactionRequired
	}
	if session.Client() != service.commentsCollection.Database().Client() {
		return false, mongo.ErrWrongClient
	}

	// Preserve the caller's session and any earlier deadline. Transaction operations
	// run sequentially; all source lookups use the existing _id indexes.
	dbCtx, cancel := context.WithTimeout(ctx, commentNotificationTimeout)
	defer cancel()

	savedComment, err := service.findComment(dbCtx, input.CommentID)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return false, ErrCommentNotFound
	}
	if err != nil {
		return false, err
	}
	if savedComment.ID != input.CommentID ||
		savedComment.PostID != input.PostID ||
		savedComment.UserID != input.UserID {
		return false, ErrCommentMismatch
	}
	if savedComment.IsDeleted {
		return false, ErrCommentNotFound
	}
	if savedComment.ParentID != nil &&
		(savedComment.ParentID.IsZero() || *savedComment.ParentID == savedComment.ID) {
		return false, ErrInvalidParentCommentID
	}

	var post postDocument
	err = service.postsCollection.FindOne(
		dbCtx,
		bson.M{"_id": savedComment.PostID},
		options.FindOne().SetProjection(bson.M{
			"_id":        1,
			"user_id":    1,
			"is_deleted": 1,
		}),
	).Decode(&post)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return false, ErrCommentPostNotFound
	}
	if err != nil {
		return false, err
	}
	if post.ID != savedComment.PostID || post.IsDeleted {
		return false, ErrCommentPostNotFound
	}
	if post.UserID.IsZero() {
		return false, notification.ErrInvalidUserID
	}

	notificationInput := notification.CreateNotificationInput{
		ActorID:     savedComment.UserID,
		RecipientID: post.UserID,
		Type:        notification.TypePostComment,
		// One stable source key for both kinds. Retrying a comment or reply preserves
		// the existing notification and its read state through the core's upsert.
		EventKey:  "comment:" + savedComment.ID.Hex(),
		PostID:    &savedComment.PostID,
		CommentID: &savedComment.ID,
	}

	if savedComment.ParentID != nil {
		parent, err := service.findComment(dbCtx, *savedComment.ParentID)
		if errors.Is(err, mongo.ErrNoDocuments) {
			return false, ErrParentCommentNotFound
		}
		if err != nil {
			// Preserve driver error labels so WithTransaction can retry transient failures.
			return false, err
		}
		if parent.ID != *savedComment.ParentID || parent.PostID != savedComment.PostID {
			return false, ErrParentCommentMismatch
		}
		if parent.IsDeleted {
			return false, ErrParentCommentNotFound
		}
		if parent.UserID.IsZero() {
			return false, notification.ErrInvalidUserID
		}

		// Replies notify the immediate parent comment's author, including replies
		// to other replies. The post owner may also be the actor or parent author.
		notificationInput.Type = notification.TypeCommentReply
		notificationInput.RecipientID = parent.UserID
		notificationInput.ParentID = &parent.ID
	}

	if notificationInput.RecipientID == notificationInput.ActorID {
		return false, nil
	}
	return service.notificationService.Create(dbCtx, notificationInput)
}

func (service *Service) findComment(
	ctx context.Context,
	commentID bson.ObjectID,
) (*commentDocument, error) {
	var document commentDocument
	err := service.commentsCollection.FindOne(
		ctx,
		bson.M{"_id": commentID},
		options.FindOne().SetProjection(bson.M{
			"_id":        1,
			"post_id":    1,
			"user_id":    1,
			"parent_id":  1,
			"is_deleted": 1,
		}),
	).Decode(&document)
	if err != nil {
		return nil, err
	}
	return &document, nil
}

// CreateLove verifies a saved love inside the caller's transaction.
// The caller must propagate errors so the love and notification
// succeed or roll back together.
func (service *Service) CreateLove(
	ctx context.Context,
	input CreateCommentLoveNotificationInput,
) (bool, error) {
	if err := ctx.Err(); err != nil {
		return false, err
	}

	if input.LoveID.IsZero() {
		return false, ErrInvalidCommentLoveID
	}

	if input.CommentID.IsZero() {
		return false, ErrInvalidCommentID
	}

	if input.UserID.IsZero() {
		return false, notification.ErrInvalidUserID
	}

	if service == nil ||
		service.commentLovesCollection == nil ||
		service.commentsCollection == nil ||
		service.postsCollection == nil ||
		service.notificationService == nil {
		return false, ErrCommentServiceNotConfigured
	}

	session := mongo.SessionFromContext(ctx)

	if session == nil || !session.TransactionRunning() {
		return false, ErrCommentTransactionRequired
	}

	if session.Client() != service.commentLovesCollection.Database().Client() {
		return false, mongo.ErrWrongClient
	}

	dbCtx, cancel := context.WithTimeout(
		ctx,
		commentNotificationTimeout,
	)
	defer cancel()

	var savedLove commentLoveDocument

	err := service.commentLovesCollection.FindOne(
		dbCtx,
		bson.M{"_id": input.LoveID},
		options.FindOne().SetProjection(bson.M{
			"_id":        1,
			"comment_id": 1,
			"user_id":    1,
		}),
	).Decode(&savedLove)

	if errors.Is(err, mongo.ErrNoDocuments) {
		return false, ErrCommentLoveNotFound
	}

	if err != nil {
		return false, err
	}

	if savedLove.ID != input.LoveID ||
		savedLove.CommentID != input.CommentID ||
		savedLove.UserID != input.UserID {
		return false, ErrCommentLoveMismatch
	}

	savedComment, err := service.findComment(
		dbCtx,
		savedLove.CommentID,
	)

	if errors.Is(err, mongo.ErrNoDocuments) {
		return false, ErrCommentNotFound
	}

	if err != nil {
		return false, err
	}

	if savedComment.ID != input.CommentID {
		return false, ErrCommentMismatch
	}

	if savedComment.IsDeleted {
		return false, ErrCommentNotFound
	}

	if savedComment.UserID.IsZero() {
		return false, notification.ErrInvalidUserID
	}

	if savedComment.PostID.IsZero() {
		return false, ErrInvalidPostID
	}

	if savedComment.ParentID != nil &&
		(savedComment.ParentID.IsZero() ||
			*savedComment.ParentID == savedComment.ID) {
		return false, ErrInvalidParentCommentID
	}

	var post postDocument

	err = service.postsCollection.FindOne(
		dbCtx,
		bson.M{"_id": savedComment.PostID},
		options.FindOne().SetProjection(bson.M{
			"_id":        1,
			"is_deleted": 1,
		}),
	).Decode(&post)

	if errors.Is(err, mongo.ErrNoDocuments) {
		return false, ErrCommentPostNotFound
	}

	if err != nil {
		return false, err
	}

	if post.ID != savedComment.PostID || post.IsDeleted {
		return false, ErrCommentPostNotFound
	}

	// Loving your own comment does not create a notification.
	if savedComment.UserID == savedLove.UserID {
		return false, nil
	}

	return service.notificationService.Create(
		dbCtx,
		notification.CreateNotificationInput{
			RecipientID:  savedComment.UserID,
			ActorID:      savedLove.UserID,
			Type:         notification.TypeCommentLove,
			EventKey:     "comment_love:" + savedLove.ID.Hex(),
			PostID:       &savedComment.PostID,
			CommentID:    &savedComment.ID,
			ParentID:     savedComment.ParentID,
			ReactionType: "love",
		},
	)
}