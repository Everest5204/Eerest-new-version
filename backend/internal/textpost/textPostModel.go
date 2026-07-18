package textpost

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

const (
	PostTypeText = "text"

	TextBackgroundPlain    = "plain"
	TextBackgroundSolid    = "solid"
	TextBackgroundGradient = "gradient"
	TextBackgroundImage    = "image"

	TextStyleBoldCenter   = "bold_center"
	TextStyleNormalCenter = "normal_center"
	TextStyleBoldLeft     = "bold_left"
	TextStyleNormalLeft   = "normal_left"
)

type TextBackground struct {
	Kind  string `bson:"kind" json:"kind"`
	Value string `bson:"value" json:"value"`
}

type TextPost struct {
	ID     bson.ObjectID `bson:"_id,omitempty" json:"id"`
	UserID bson.ObjectID `bson:"user_id" json:"user_id"`

	Type    string `bson:"type" json:"type"`
	Caption string `bson:"caption" json:"caption"`
	Text    string `bson:"text" json:"text"`

	TextBackground TextBackground `bson:"text_background" json:"text_background"`
	TextColor      string         `bson:"text_color" json:"text_color"`
	TextStyle      string         `bson:"text_style" json:"text_style"`

	LikesCount    int64 `bson:"likes_count" json:"likes_count"`
	CommentsCount int64 `bson:"comments_count" json:"comments_count"`
	SharesCount   int64 `bson:"shares_count" json:"shares_count"`

	IsDeleted bool `bson:"is_deleted" json:"is_deleted"`

	CreatedAt time.Time `bson:"created_at" json:"created_at"`
	UpdatedAt time.Time `bson:"updated_at" json:"updated_at"`
}

type TextPostUser struct {
	ID bson.ObjectID `bson:"_id,omitempty" json:"id"`

	FirstName string `bson:"first_name" json:"first_name"`
	LastName  string `bson:"last_name" json:"last_name"`

	ProfileImageURL string `bson:"profile_image_url,omitempty" json:"profile_image_url,omitempty"`
}

type TextFeedPost struct {
	ID     bson.ObjectID `bson:"_id,omitempty" json:"id"`
	UserID bson.ObjectID `bson:"user_id" json:"user_id"`

	User TextPostUser `bson:"user" json:"user"`

	Type    string `bson:"type" json:"type"`
	Caption string `bson:"caption" json:"caption"`
	Text    string `bson:"text" json:"text"`

	TextBackground TextBackground `bson:"text_background" json:"text_background"`
	TextColor      string         `bson:"text_color" json:"text_color"`
	TextStyle      string         `bson:"text_style" json:"text_style"`

	LikesCount    int64 `bson:"likes_count" json:"likes_count"`
	CommentsCount int64 `bson:"comments_count" json:"comments_count"`
	SharesCount   int64 `bson:"shares_count" json:"shares_count"`

	IsDeleted bool `bson:"is_deleted" json:"is_deleted"`

	CreatedAt time.Time `bson:"created_at" json:"created_at"`
	UpdatedAt time.Time `bson:"updated_at" json:"updated_at"`
}

type CreateTextPostRequest struct {
	Text           string         `json:"text"`
	Caption        string         `json:"caption"`
	TextBackground TextBackground `json:"text_background"`
	Background     TextBackground `json:"background"`
	TextColor      string         `json:"text_color"`
	TextStyle      string         `json:"text_style"`
}

type CreateTextPostResponse struct {
	Post TextFeedPost `json:"post"`
}

type TextPostsResponse struct {
	Posts      []TextFeedPost `json:"posts"`
	NextCursor string         `json:"next_cursor"`
	HasMore    bool           `json:"has_more"`
}