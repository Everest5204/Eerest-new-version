package profilemedia

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

type ProfileMediaPost struct {
	ID bson.ObjectID `bson:"_id,omitempty" json:"id"`

	UserID bson.ObjectID `bson:"user_id" json:"user_id"`

	Type    string `bson:"type" json:"type"`
	Caption string `bson:"caption" json:"caption"`

	MediaURL  string `bson:"media_url" json:"media_url"`
	MediaID   string `bson:"media_id" json:"media_id"`
	MediaType string `bson:"media_type" json:"media_type"`

	LikesCount    int64 `bson:"likes_count" json:"likes_count"`
	CommentsCount int64 `bson:"comments_count" json:"comments_count"`

	CreatedAt time.Time `bson:"created_at" json:"created_at"`
	UpdatedAt time.Time `bson:"updated_at" json:"updated_at"`
}