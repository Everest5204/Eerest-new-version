package notification

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

const (
	DefaultListLimit int64 = 20
	MaxListLimit     int64 = 50
)

// NotificationType identifies the action behind a notification.
type NotificationType string

const (
	TypePostReaction NotificationType = "post_reaction"
	TypePostComment  NotificationType = "post_comment"
	TypeCommentReply NotificationType = "comment_reply"
	TypeCommentLove  NotificationType = "comment_love"
	TypeFollow       NotificationType = "follow"
	TypeFollowBack   NotificationType = "follow_back"
)

func (kind NotificationType) IsValid() bool {
	switch kind {
	case TypePostReaction,
		TypePostComment,
		TypeCommentReply,
		TypeCommentLove,
		TypeFollow,
		TypeFollowBack:
		return true
	default:
		return false
	}
}

// notificationDocument is the database representation.
// API responses use NotificationItem.
type notificationDocument struct {
	ID bson.ObjectID `bson:"_id,omitempty"`

	RecipientID bson.ObjectID `bson:"recipient_id"`
	ActorID     bson.ObjectID `bson:"actor_id"`

	Type NotificationType `bson:"type"`

	// Stable key for identifying retries of the same source action.
	EventKey string `bson:"event_key"`

	PostID   *bson.ObjectID `bson:"post_id,omitempty"`
	CommentID *bson.ObjectID `bson:"comment_id,omitempty"`
	ParentID *bson.ObjectID `bson:"parent_id,omitempty"`

	ReactionType string `bson:"reaction_type,omitempty"`

	IsRead bool       `bson:"is_read"`
	ReadAt *time.Time `bson:"read_at,omitempty"`

	CreatedAt time.Time `bson:"created_at"`
	UpdatedAt time.Time `bson:"updated_at"`
}

// CreateNotificationInput is used by backend feature services.
// It is not a client-facing notification creation request.
type CreateNotificationInput struct {
	RecipientID bson.ObjectID
	ActorID     bson.ObjectID

	Type NotificationType

	// Reuse this key when retrying the same logical action.
	EventKey string

	PostID    *bson.ObjectID
	CommentID *bson.ObjectID
	ParentID  *bson.ObjectID

	ReactionType string
}

// Only these public user fields are needed for notification rows.
type notificationActorDocument struct {
	ID              bson.ObjectID `bson:"_id"`
	FirstName       string        `bson:"first_name"`
	LastName        string        `bson:"last_name"`
	ProfileImageURL string        `bson:"profile_image_url,omitempty"`
	ProfileTitle    string        `bson:"profile_title,omitempty"`
}

type NotificationActor struct {
	ID              string `json:"id"`
	FirstName       string `json:"first_name"`
	LastName        string `json:"last_name"`
	ProfileImageURL string `json:"profile_image_url,omitempty"`
	ProfileTitle    string `json:"profile_title,omitempty"`
}

// NotificationItem is the frontend representation.
type NotificationItem struct {
	ID   string           `json:"id"`
	Type NotificationType `json:"type"`

	ActorID string `json:"actor_id"`

	// Null if the actor's account is no longer available.
	Actor *NotificationActor `json:"actor"`

	PostID    string `json:"post_id,omitempty"`
	CommentID string `json:"comment_id,omitempty"`
	ParentID  string `json:"parent_id,omitempty"`

	ReactionType string `json:"reaction_type,omitempty"`

	IsRead bool       `json:"is_read"`
	ReadAt *time.Time `json:"read_at,omitempty"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type NotificationListResponse struct {
	Items []NotificationItem `json:"items"`

	NextCursor string `json:"next_cursor,omitempty"`
	HasMore    bool   `json:"has_more"`

	UnreadCount int64 `json:"unread_count"`
}

type UnreadCountResponse struct {
	UnreadCount int64 `json:"unread_count"`
}

// The authenticated user can mark their own notifications as read.
type MarkNotificationsReadRequest struct {
	NotificationIDs []string `json:"notification_ids"`
}

type MarkNotificationsReadResponse struct {
	ModifiedCount int64 `json:"modified_count"`
	UnreadCount   int64 `json:"unread_count"`
}