package comment

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

type Comment struct {
	ID     bson.ObjectID `bson:"_id,omitempty" json:"id"`
	PostID bson.ObjectID `bson:"post_id" json:"post_id"`
	UserID bson.ObjectID `bson:"user_id" json:"user_id"`

	// Empty parent_id = main comment
	// parent_id exists = reply comment
	ParentID *bson.ObjectID `bson:"parent_id,omitempty" json:"parent_id,omitempty"`

	Text string `bson:"text" json:"text"`

	LovesCount   int64 `bson:"loves_count" json:"loves_count"`
	RepliesCount int64 `bson:"replies_count" json:"replies_count"`

	IsDeleted bool `bson:"is_deleted" json:"is_deleted"`

	CreatedAt time.Time `bson:"created_at" json:"created_at"`
	UpdatedAt time.Time `bson:"updated_at" json:"updated_at"`
}

type CommentLove struct {
	ID        bson.ObjectID `bson:"_id,omitempty" json:"id"`
	CommentID bson.ObjectID `bson:"comment_id" json:"comment_id"`
	UserID    bson.ObjectID `bson:"user_id" json:"user_id"`

	CreatedAt time.Time `bson:"created_at" json:"created_at"`
}

type CommentUser struct {
	ID bson.ObjectID `bson:"_id,omitempty" json:"id"`

	FirstName string `bson:"first_name" json:"first_name"`
	LastName  string `bson:"last_name" json:"last_name"`

	ProfileImageURL string `bson:"profile_image_url,omitempty" json:"profile_image_url,omitempty"`
}

type FeedComment struct {
	ID     bson.ObjectID `bson:"_id,omitempty" json:"id"`
	PostID bson.ObjectID `bson:"post_id" json:"post_id"`
	UserID bson.ObjectID `bson:"user_id" json:"user_id"`

	ParentID *bson.ObjectID `bson:"parent_id,omitempty" json:"parent_id,omitempty"`

	User CommentUser `bson:"user" json:"user"`

	Text string `bson:"text" json:"text"`

	LovesCount   int64 `bson:"loves_count" json:"loves_count"`
	RepliesCount int64 `bson:"replies_count" json:"replies_count"`

	IsLovedByMe bool `bson:"is_loved_by_me" json:"is_loved_by_me"`
	CanModify   bool `bson:"can_modify" json:"can_modify"`

	IsDeleted bool `bson:"is_deleted" json:"is_deleted"`

	CreatedAt time.Time `bson:"created_at" json:"created_at"`
	UpdatedAt time.Time `bson:"updated_at" json:"updated_at"`
}

type CreateCommentRequest struct {
	PostID   string `json:"post_id"`
	ParentID string `json:"parent_id,omitempty"`
	Text     string `json:"text"`
}

type UpdateCommentRequest struct {
	Text string `json:"text"`
}

type CommentsResponse struct {
	Comments   []FeedComment `json:"comments"`
	NextCursor string        `json:"next_cursor"`
	HasMore    bool          `json:"has_more"`
}

type CreateCommentResponse struct {
	Comment       FeedComment `json:"comment"`
	CommentsCount int64       `json:"comments_count"`
}

type UpdateCommentResponse struct {
	Comment FeedComment `json:"comment"`
}

type DeleteCommentResponse struct {
	Deleted       bool  `json:"deleted"`
	CommentsCount int64 `json:"comments_count"`
}

type ToggleCommentLoveResponse struct {
	Loved      bool  `json:"loved"`
	LovesCount int64 `json:"loves_count"`
}