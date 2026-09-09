package follow

import "go.mongodb.org/mongo-driver/v2/bson"

// CreateFollowNotificationInput is passed by the backend follow mutation after
// inserting a new relationship, using the same MongoDB transaction context.
// It is an internal service input, not a client notification-creation request.
// The service derives the event key and checks the reverse relationship to
// determine whether this is a follow or follow_back notification.
type CreateFollowNotificationInput struct {
	// FollowID is the persisted user_follows._id, not a notification ID.
	// Reuse it when retrying the same relationship's notification.
	FollowID bson.ObjectID

	// FollowerID is the user who performed the follow action (notification actor).
	FollowerID bson.ObjectID

	// FollowingID is the user being followed (notification recipient).
	FollowingID bson.ObjectID
}

// followDocument projects the existing user_follows relationship fields needed
// to verify the source action. Notification storage and API models stay in core.
type followDocument struct {
	ID          bson.ObjectID `bson:"_id"`
	FollowerID  bson.ObjectID `bson:"follower_id"`
	FollowingID bson.ObjectID `bson:"following_id"`
}
