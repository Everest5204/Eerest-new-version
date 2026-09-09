package editprofile

import (
	"errors"

	"go.mongodb.org/mongo-driver/v2/bson"
)

const (
	maxProfileBioLength = 100

	maxProfileEditRequestBodySize int64 =
		16 << 10 // 16 KB
)

var (
	ErrProfileNotFound = errors.New(
		"profile not found",
	)

	ErrInvalidProfile = errors.New(
		"invalid profile",
	)

	ErrProfileUpdateFailed = errors.New(
		"profile update failed",
	)
)

// profileDocument contains only the MongoDB fields
// required by the Edit Profile section.
type profileDocument struct {
	ID bson.ObjectID `bson:"_id"`

	FirstName string `bson:"first_name"`
	LastName  string `bson:"last_name"`
	Bio       string `bson:"bio,omitempty"`

	ProfileImageURL string `bson:"profile_image_url,omitempty"`
	CoverImageURL   string `bson:"cover_image_url,omitempty"`
}

// ProfileEditRequest represents the frontend PATCH request.
type ProfileEditRequest struct {
	Bio *string `json:"bio"`
}

// ProfileEditInput contains validated data passed
// from the handler to the service.
type ProfileEditInput struct {
	AuthUserID string
	Bio        string
}

// EditableProfile contains only the safe fields
// required by the Edit Profile page.
type EditableProfile struct {
	ID string `json:"id"`

	FirstName string `json:"first_name"`
	LastName  string `json:"last_name"`
	Bio       string `json:"bio"`

	ProfileImageURL string `json:"profile_image_url"`
	CoverImageURL   string `json:"cover_image_url"`
}

// ProfileEditResponse is returned when opening
// or successfully saving the Edit Profile page.
type ProfileEditResponse struct {
	Profile EditableProfile `json:"profile"`
}

// ProfileEditErrorResponse keeps API errors consistent.
type ProfileEditErrorResponse struct {
	Error string `json:"error"`
}