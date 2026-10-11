package personaldetails

import (
	"errors"
	"time"
)

var (
	ErrSession  = errors.New("Please sign in again.")
	ErrConflict = errors.New("Your details changed elsewhere. Refresh before saving.")
	ErrInput    = errors.New("Choose a valid birthday or gender.")
)

// Private account data; contact cannot be changed through this endpoint.
type Details struct {
	ID               string     `json:"id"`
	FirstName        string     `json:"first_name"`
	LastName         string     `json:"last_name"`
	Contact          string     `json:"email_or_phone"`
	EmailVerified    bool       `json:"email_verified"`
	ImageURL         string     `json:"profile_image_url"`
	BirthDate        string     `json:"birth_date"`
	Gender           string     `json:"gender"`
	Revision         int64      `json:"revision"`
	NameCanChange    bool       `json:"name_can_change"`
	NameNextChangeAt *time.Time `json:"name_next_change_at,omitempty"`
}

type PatchRequest struct {
	ExpectedRevision *int64  `json:"expected_revision"`
	BirthDate        *string `json:"birth_date,omitempty"`
	Gender           *string `json:"gender,omitempty"`
}

type patch struct {
	birth    *string
	gender   *string
	revision int64
}
