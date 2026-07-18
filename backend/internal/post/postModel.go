package post

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

const (
	PostTypeText               = "text"
	PostTypeImage              = "image"
	PostTypeVideo              = "video"
	PostTypeProfilePhotoUpdate = "profile_photo_update"
	PostTypeCoverPhotoUpdate   = "cover_photo_update"

	MediaTypeImage = "image"
	MediaTypeVideo = "video"
)

type MediaItem struct {
	URL   string `bson:"url" json:"url"`
	ID    string `bson:"id" json:"id"`
	Type  string `bson:"type" json:"type"`
	Order int    `bson:"order" json:"order"`
}

type Post struct {
	ID     bson.ObjectID `bson:"_id,omitempty" json:"id"`
	UserID bson.ObjectID `bson:"user_id" json:"user_id"`

	Type    string `bson:"type" json:"type"`
	Caption string `bson:"caption,omitempty" json:"caption,omitempty"`

	Media []MediaItem `bson:"media,omitempty" json:"media,omitempty"`

	MediaURL  string `bson:"media_url,omitempty" json:"media_url,omitempty"`
	MediaID   string `bson:"media_id,omitempty" json:"media_id,omitempty"`
	MediaType string `bson:"media_type,omitempty" json:"media_type,omitempty"`

	LikesCount    int64 `bson:"likes_count" json:"likes_count"`
	CommentsCount int64 `bson:"comments_count" json:"comments_count"`
	SharesCount   int64 `bson:"shares_count" json:"shares_count"`

	IsDeleted bool `bson:"is_deleted" json:"is_deleted"`

	CreatedAt time.Time `bson:"created_at" json:"created_at"`
	UpdatedAt time.Time `bson:"updated_at" json:"updated_at"`
}

type PostUser struct {
	ID bson.ObjectID `bson:"_id,omitempty" json:"id"`

	FirstName string `bson:"first_name" json:"first_name"`
	LastName  string `bson:"last_name" json:"last_name"`

	ProfileImageURL string `bson:"profile_image_url,omitempty" json:"profile_image_url,omitempty"`
}

type FeedPost struct {
	ID     bson.ObjectID `bson:"_id,omitempty" json:"id"`
	UserID bson.ObjectID `bson:"user_id" json:"user_id"`

	User PostUser `bson:"user" json:"user"`

	Type    string `bson:"type" json:"type"`
	Caption string `bson:"caption,omitempty" json:"caption,omitempty"`

	Media []MediaItem `bson:"media,omitempty" json:"media,omitempty"`

	MediaURL  string `bson:"media_url,omitempty" json:"media_url,omitempty"`
	MediaID   string `bson:"media_id,omitempty" json:"media_id,omitempty"`
	MediaType string `bson:"media_type,omitempty" json:"media_type,omitempty"`

	LikesCount    int64 `bson:"likes_count" json:"likes_count"`
	CommentsCount int64 `bson:"comments_count" json:"comments_count"`
	SharesCount   int64 `bson:"shares_count" json:"shares_count"`

	IsDeleted bool `bson:"is_deleted" json:"is_deleted"`

	CreatedAt time.Time `bson:"created_at" json:"created_at"`
	UpdatedAt time.Time `bson:"updated_at" json:"updated_at"`
}

type CreateMediaPostResponse struct {
	Post FeedPost `json:"post"`
}

type PostsResponse struct {
	Posts      []FeedPost `json:"posts"`
	NextCursor string     `json:"next_cursor"`
	HasMore    bool       `json:"has_more"`
}