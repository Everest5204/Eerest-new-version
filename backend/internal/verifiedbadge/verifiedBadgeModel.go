package verifiedbadge

import (
	"errors"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

type BadgeType string

const (
	verifiedBadgeCollection = "verified_badges"

	badgeTypeVerified BadgeType = "verified"

	maxResolveUserIDs              = 200
	maxResolveRequestBodySize int64 = 64 << 10 // 64 KB
)

var (
	ErrUserIDsRequired = errors.New(
		"at least one user id is required",
	)

	ErrTooManyUserIDs = errors.New(
		"too many user ids",
	)

	ErrInvalidUserID = errors.New(
		"one or more user ids are invalid",
	)
)

// badgeDocument represents one database-assigned badge.
// One user can have only one record for each badge type.
type badgeDocument struct {
	ID bson.ObjectID `bson:"_id,omitempty"`

	UserID bson.ObjectID `bson:"user_id"`

	BadgeType BadgeType `bson:"badge_type"`

	IsActive bool `bson:"is_active"`

	CreatedAt time.Time `bson:"created_at"`
	UpdatedAt time.Time `bson:"updated_at"`
}

// ResolveBadgesRequest accepts all currently visible user IDs
// in one request to prevent N+1 API calls.
type ResolveBadgesRequest struct {
	UserIDs []string `json:"user_ids"`
}

// ResolvedBadge contains only public-safe badge information.
type ResolvedBadge struct {
	UserID string `json:"user_id"`

	BadgeType BadgeType `json:"badge_type"`
}

// ResolveBadgesResponse contains active database-assigned badges.
// A requested user missing from this list has no active badge.
type ResolveBadgesResponse struct {
	Badges []ResolvedBadge `json:"badges"`
}

type ErrorResponse struct {
	Error string `json:"error"`
}