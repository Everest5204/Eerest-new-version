package profileconnections

import "go.mongodb.org/mongo-driver/v2/bson"

const (
	// Keeps the first mobile response small and fast.
	DefaultListLimit int64 = 20

	// Prevents unexpectedly large MongoDB queries.
	MaxListLimit int64 = 50
)

// Identifies which profile relationship list is requested.
type ListKind string

const (
	FollowersList ListKind = "followers"
	FollowingList ListKind = "following"
)

func (kind ListKind) IsValid() bool {
	return kind == FollowersList ||
		kind == FollowingList
}

// One user_follows relationship:
// FollowerID follows FollowingID.
type connectionDocument struct {
	ID bson.ObjectID `bson:"_id"`

	FollowerID bson.ObjectID `bson:"follower_id"`

	FollowingID bson.ObjectID `bson:"following_id"`
}

// Public user data required for one list row.
type connectionUserDocument struct {
	ID bson.ObjectID `bson:"_id"`

	FirstName string `bson:"first_name"`

	LastName string `bson:"last_name"`

	ProfileTitle string `bson:"profile_title,omitempty"`

	ProfileImageURL string `bson:"profile_image_url,omitempty"`
}

// Profile owner information and stored counts.
type connectionOwnerDocument struct {
	ID bson.ObjectID `bson:"_id"`

	FirstName string `bson:"first_name"`

	LastName string `bson:"last_name"`

	ProfileTitle string `bson:"profile_title,omitempty"`

	ProfileImageURL string `bson:"profile_image_url,omitempty"`

	FollowersCount int64 `bson:"followers_count,omitempty"`

	FollowingCount int64 `bson:"following_count,omitempty"`
}

// Public information for the profile whose list is open.
type ConnectionOwner struct {
	ID string `json:"id"`

	FirstName string `json:"first_name"`

	LastName string `json:"last_name"`

	ProfileTitle string `json:"profile_title,omitempty"`

	ProfileImageURL string `json:"profile_image_url,omitempty"`

	// Whether the signed-in visitor owns this profile.
	IsSelf bool `json:"is_self"`
}

// One Followers/Following list row.
type ConnectionUser struct {
	ID string `json:"id"`

	FirstName string `json:"first_name"`

	LastName string `json:"last_name"`

	ProfileTitle string `json:"profile_title,omitempty"`

	ProfileImageURL string `json:"profile_image_url,omitempty"`

	// Signed-in visitor already follows this user.
	IsFollowing bool `json:"is_following"`

	// This user already follows the signed-in visitor.
	// When IsFollowing is false, UI shows Follow Back.
	FollowsYou bool `json:"follows_you"`

	// No action button will appear on the visitor's own row.
	IsSelf bool `json:"is_self"`
}

// Direct MongoDB cursor-paginated response.
type ConnectionListResponse struct {
	Owner ConnectionOwner `json:"owner"`

	// Service always returns a non-null array.
	Items []ConnectionUser `json:"items"`

	NextCursor string `json:"next_cursor,omitempty"`

	HasMore bool `json:"has_more"`

	FollowersCount int64 `json:"followers_count"`

	FollowingCount int64 `json:"following_count"`
}

type ErrorResponse struct {
	Error string `json:"error"`
}