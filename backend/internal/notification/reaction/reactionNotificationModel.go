package reaction

import "go.mongodb.org/mongo-driver/v2/bson"

// CreateReactionNotificationInput is passed by the backend reaction mutation
// after saving a new reaction, using the same MongoDB transaction context.
// It is an internal service input, not a client notification-creation request.
// The service reads the saved reaction type and the post owner from MongoDB.
type CreateReactionNotificationInput struct {
	// ReactionID is the persisted post_reactions._id, not a notification ID.
	// Reuse it when retrying the same source reaction's notification.
	ReactionID bson.ObjectID

	// PostID identifies the post receiving the reaction.
	PostID bson.ObjectID

	// UserID is the authenticated user who performed the reaction.
	// The service verifies it against the saved reaction's user_id.
	UserID bson.ObjectID
}

// reactionDocument projects the existing post_reactions fields needed to verify
// the source action. Reaction types remain owned by the reaction section.
type reactionDocument struct {
	ID           bson.ObjectID `bson:"_id"`
	PostID       bson.ObjectID `bson:"post_id"`
	UserID       bson.ObjectID `bson:"user_id"`
	ReactionType string        `bson:"reaction_type"`
}

// postDocument projects the existing posts fields needed to find the recipient
// and check soft deletion. Notification storage and API models stay in core.
type postDocument struct {
	ID        bson.ObjectID `bson:"_id"`
	UserID    bson.ObjectID `bson:"user_id"`
	IsDeleted bool          `bson:"is_deleted"`
}
