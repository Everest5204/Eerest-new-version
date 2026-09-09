package comment

import "go.mongodb.org/mongo-driver/v2/bson"

// CreateCommentNotificationInput is passed by the backend comment mutation
// after inserting a comment or reply, using the same MongoDB transaction context.
// It is an internal service input, not a client notification-creation request.
// The service resolves the notification type and recipient from the saved data.
type CreateCommentNotificationInput struct {
	// CommentID is the persisted comments._id, not a notification ID.
	// Reuse it when retrying the same comment's notification.
	CommentID bson.ObjectID

	// PostID identifies the post containing the comment or reply.
	PostID bson.ObjectID

	// UserID is the authenticated user who wrote the comment or reply.
	// The service verifies it against the saved comment's user_id.
	UserID bson.ObjectID
}

// commentDocument projects the existing comments fields needed to verify the
// source action and, for replies, the parent comment and its owner.
type commentDocument struct {
	ID        bson.ObjectID  `bson:"_id"`
	PostID    bson.ObjectID  `bson:"post_id"`
	UserID    bson.ObjectID  `bson:"user_id"`
	ParentID  *bson.ObjectID `bson:"parent_id,omitempty"`
	IsDeleted bool           `bson:"is_deleted"`
}

// postDocument projects the existing posts fields needed to check availability
// and find the recipient of a top-level comment notification.
// Notification storage and API models stay in core.
type postDocument struct {
	ID        bson.ObjectID `bson:"_id"`
	UserID    bson.ObjectID `bson:"user_id"`
	IsDeleted bool          `bson:"is_deleted"`
}






// CreateCommentLoveNotificationInput comes from the backend love
// mutation after insertion, within the same transaction.
// LoveID must remain unchanged during transaction retries.
type CreateCommentLoveNotificationInput struct {
	LoveID    bson.ObjectID
	CommentID bson.ObjectID
	UserID    bson.ObjectID
}

// commentLoveDocument reads the saved comment_loves record.
type commentLoveDocument struct {
	ID        bson.ObjectID `bson:"_id"`
	CommentID bson.ObjectID `bson:"comment_id"`
	UserID    bson.ObjectID `bson:"user_id"`
}