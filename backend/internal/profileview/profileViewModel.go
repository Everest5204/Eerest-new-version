package profileview

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// Database থেকে কেবল public-safe profile fields নেওয়া হবে।
type profileDocument struct {
	ID              bson.ObjectID `bson:"_id"`
	FirstName       string        `bson:"first_name"`
	LastName        string        `bson:"last_name"`
	ProfileTitle    string        `bson:"profile_title,omitempty"`
	Bio             string        `bson:"bio,omitempty"`
	FollowersCount  int64         `bson:"followers_count,omitempty"`
	FollowingCount  int64         `bson:"following_count,omitempty"`
	PostsCount      int64         `bson:"posts_count,omitempty"`
	ProfileImageURL string        `bson:"profile_image_url,omitempty"`
	CoverImageURL   string        `bson:"cover_image_url,omitempty"`
}

// একজন user কাকে follow করছে তার database relation।
type followDocument struct {
	ID          bson.ObjectID `bson:"_id,omitempty"`
	FollowerID  bson.ObjectID `bson:"follower_id"`
	FollowingID bson.ObjectID `bson:"following_id"`
	CreatedAt   time.Time     `bson:"created_at"`
}

// Frontend-এর জন্য safe profile response।
type Profile struct {
	ID              string `json:"id"`
	FirstName       string `json:"first_name"`
	LastName        string `json:"last_name"`
	ProfileTitle    string `json:"profile_title,omitempty"`
	Bio             string `json:"bio"`
	FollowersCount  int64  `json:"followers_count"`
	FollowingCount  int64  `json:"following_count"`
	PostsCount      int64  `json:"posts_count"`
	ProfileImageURL string `json:"profile_image_url,omitempty"`
	CoverImageURL   string `json:"cover_image_url,omitempty"`
	IsSelf          bool   `json:"is_self"`
	IsFollowing     bool   `json:"is_following"`
	CanMessage      bool   `json:"can_message"`
}

type ProfileResponse struct {
	Profile Profile `json:"profile"`
}

type FollowMutationResponse struct {
	IsFollowing    bool  `json:"is_following"`
	FollowersCount int64 `json:"followers_count"`
}

type ErrorResponse struct {
	Error string `json:"error"`
}