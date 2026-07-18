package reels

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

const (
	ReelPostType  = "video"
	ReelMediaType = "video"
)

// ReelMedia represents the video attached to a reel.
type ReelMedia struct {
	URL       string `bson:"url" json:"url"`
	ID        string `bson:"id" json:"id"`
	Type      string `bson:"type" json:"type"`
	Order     int    `bson:"order" json:"order"`
	PosterURL string `bson:"-" json:"poster_url,omitempty"`
}

// ReelUser contains only the author information needed by the Reels UI.
type ReelUser struct {
	ID bson.ObjectID `bson:"_id,omitempty" json:"id"`

	FirstName string `bson:"first_name" json:"first_name"`
	LastName  string `bson:"last_name" json:"last_name"`

	ProfileImageURL string `bson:"profile_image_url,omitempty" json:"profile_image_url,omitempty"`
}

// Reel is the public API response for a single video post.
type Reel struct {
	ID     bson.ObjectID `bson:"_id,omitempty" json:"id"`
	UserID bson.ObjectID `bson:"user_id" json:"user_id"`

	User ReelUser `bson:"-" json:"user"`

	Type    string `bson:"type" json:"type"`
	Caption string `bson:"caption,omitempty" json:"caption,omitempty"`

	Media []ReelMedia `bson:"media,omitempty" json:"media"`

	// Legacy media fields are retained for older video posts.
	MediaURL  string `bson:"media_url,omitempty" json:"media_url,omitempty"`
	MediaID   string `bson:"media_id,omitempty" json:"media_id,omitempty"`
	MediaType string `bson:"media_type,omitempty" json:"media_type,omitempty"`

	LikesCount    int64 `bson:"likes_count" json:"likes_count"`
	CommentsCount int64 `bson:"comments_count" json:"comments_count"`
	SharesCount   int64 `bson:"shares_count" json:"shares_count"`

	CurrentUserReaction string `bson:"-" json:"current_user_reaction"`
	IsLovedByMe         bool   `bson:"-" json:"is_loved_by_me"`

	CreatedAt time.Time `bson:"created_at" json:"created_at"`
	UpdatedAt time.Time `bson:"updated_at" json:"updated_at"`
}

// ReelsResponse is returned by the cursor-paginated Reels feed endpoint.
type ReelsResponse struct {
	Reels      []Reel `json:"reels"`
	NextCursor string `json:"next_cursor"`
	HasMore    bool   `json:"has_more"`
}

// ReelResponse is returned when one specific reel is requested.
type ReelResponse struct {
	Reel Reel `json:"reel"`
}

// reelPostDocument represents the existing posts collection document.
type reelPostDocument struct {
	ID     bson.ObjectID `bson:"_id,omitempty"`
	UserID bson.ObjectID `bson:"user_id"`

	Type    string `bson:"type"`
	Caption string `bson:"caption,omitempty"`

	Media []ReelMedia `bson:"media,omitempty"`

	MediaURL  string `bson:"media_url,omitempty"`
	MediaID   string `bson:"media_id,omitempty"`
	MediaType string `bson:"media_type,omitempty"`

	LikesCount    int64 `bson:"likes_count"`
	CommentsCount int64 `bson:"comments_count"`
	SharesCount   int64 `bson:"shares_count"`

	IsDeleted bool `bson:"is_deleted"`

	CreatedAt time.Time `bson:"created_at"`
	UpdatedAt time.Time `bson:"updated_at"`
}

// reelReactionDocument is used for batch-loading the signed-in user's
// reaction state without making one database request for every reel.
type reelReactionDocument struct {
	PostID       bson.ObjectID `bson:"post_id"`
	ReactionType string        `bson:"reaction_type"`
}
