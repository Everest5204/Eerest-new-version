package follow

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

const (
	// Mobile-এ দ্রুত initial response দেওয়ার জন্য।
	DefaultListLimit int64 = 20

	// অতিরিক্ত বড় database request বন্ধ করার জন্য।
	MaxListLimit int64 = 50
)

// কোন Follow list request করা হয়েছে।
type ListKind string

const (
	FollowersList ListKind = "followers"
	FollowingList ListKind = "following"
)

func (kind ListKind) IsValid() bool {
	return kind == FollowersList || kind == FollowingList
}

// Database relationship:
// FollowerID user, FollowingID user-কে follow করছে।
type followDocument struct {
	ID          bson.ObjectID `bson:"_id,omitempty"`
	FollowerID  bson.ObjectID `bson:"follower_id"`
	FollowingID bson.ObjectID `bson:"following_id"`
	CreatedAt   time.Time     `bson:"created_at"`
}

// Database থেকে শুধু public এবং নিরাপদ user data নেওয়া হবে।
type followUserDocument struct {
	ID              bson.ObjectID `bson:"_id"`
	FirstName       string        `bson:"first_name"`
	LastName        string        `bson:"last_name"`
	ProfileTitle    string        `bson:"profile_title,omitempty"`
	ProfileImageURL string        `bson:"profile_image_url,omitempty"`
}

// দুটি tab-এর live count।
type followCountsDocument struct {
	FollowersCount int64 `bson:"followers_count,omitempty"`
	FollowingCount int64 `bson:"following_count,omitempty"`
}

// Frontend-এর প্রতিটি user row।
type FollowUser struct {
	ID              string `json:"id"`
	FirstName       string `json:"first_name"`
	LastName        string `json:"last_name"`
	ProfileTitle    string `json:"profile_title,omitempty"`
	ProfileImageURL string `json:"profile_image_url,omitempty"`

	// Signed-in user ইতিমধ্যে তাকে follow করছে কি না।
	IsFollowing bool `json:"is_following"`

	// Follow Back button দেখানোর জন্য।
	FollowsYou bool `json:"follows_you"`

	// নিজের account হলে Follow button দেখানো হবে না।
	IsSelf bool `json:"is_self"`
}

// Cursor pagination-সহ ultra-fast list response।
type FollowListResponse struct {
	Items []FollowUser `json:"items"`

	NextCursor string `json:"next_cursor,omitempty"`
	HasMore    bool   `json:"has_more"`

	FollowersCount int64 `json:"followers_count"`
	FollowingCount int64 `json:"following_count"`
}

type ErrorResponse struct {
	Error string `json:"error"`
}