package personaldetails

import (
	"encoding/json"
	"errors"
	"time"
)

var (
	ErrSession        = errors.New("Please sign in again.")
	ErrConflict       = errors.New("Your details changed elsewhere. Refresh before saving.")
	ErrInput          = errors.New("Check your details and try again.")
	ErrReviewRequired = errors.New("Birthday and gender changes require a review request.")
	ErrPending        = errors.New("A request for this detail is already pending review.")
	ErrNotFound       = errors.New("This profile is unavailable.")
)

// Only fields explicitly entered here are shared. Account contact is separate.
type SharedDetails map[string]string

func (d *SharedDetails) UnmarshalJSON(data []byte) error {
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}
	values := SharedDetails{}
	for key, encoded := range raw {
		if string(encoded) == "null" {
			return ErrInput
		}
		var value string
		if err := json.Unmarshal(encoded, &value); err != nil {
			return err
		}
		values[key] = value
	}
	*d = values
	return nil
}

var fieldLimits = map[string]int{
	"marital_status": 32, "hometown": 120, "current_city": 120,
	"nationality": 120, "languages": 300, "education": 1000,
	"workplace": 300, "job_title": 160, "skills": 1000, "contact": 500,
}

type ChangeRequest struct {
	ID            string     `json:"id" bson:"id"`
	Field         string     `json:"field" bson:"field"`
	CurrentValue  string     `json:"current_value" bson:"current_value"`
	ProposedValue string     `json:"proposed_value" bson:"proposed_value"`
	Reason        string     `json:"reason" bson:"reason"`
	Status        string     `json:"status" bson:"status"`
	CreatedAt     time.Time  `json:"created_at" bson:"created_at"`
	ReviewedAt    *time.Time `json:"reviewed_at,omitempty" bson:"reviewed_at,omitempty"`
	ReviewNote    string     `json:"review_note,omitempty" bson:"review_note,omitempty"`
	ReviewedBy    string     `json:"-" bson:"reviewed_by,omitempty"`
}

// Private response. Never serialize this type from the public Info endpoint.
type Details struct {
	ID               string          `json:"id"`
	FirstName        string          `json:"first_name"`
	LastName         string          `json:"last_name"`
	Contact          string          `json:"email_or_phone"`
	EmailVerified    bool            `json:"email_verified"`
	ImageURL         string          `json:"profile_image_url"`
	BirthDate        string          `json:"birth_date"`
	Gender           string          `json:"gender"`
	Revision         int64           `json:"revision"`
	NameCanChange    bool            `json:"name_can_change"`
	NameNextChangeAt *time.Time      `json:"name_next_change_at,omitempty"`
	Shared           SharedDetails   `json:"personal_details"`
	Requests         []ChangeRequest `json:"change_requests"`
}

type PublicDetails struct {
	ID        string        `json:"id"`
	FirstName string        `json:"first_name"`
	LastName  string        `json:"last_name"`
	ImageURL  string        `json:"profile_image_url"`
	BirthDate string        `json:"birth_date"`
	Gender    string        `json:"gender"`
	Shared    SharedDetails `json:"personal_details"`
}

type PatchRequest struct {
	ExpectedRevision *int64        `json:"expected_revision"`
	Shared           SharedDetails `json:"personal_details"`
	// Recognize old clients and reject identity writes explicitly.
	BirthDate *string `json:"birth_date,omitempty"`
	Gender    *string `json:"gender,omitempty"`
}

type ReviewRequest struct {
	ExpectedRevision *int64 `json:"expected_revision"`
	RequestID        string `json:"request_id"`
	Field            string `json:"field"`
	ProposedValue    string `json:"proposed_value"`
	Reason           string `json:"reason"`
}

type patch struct {
	values   SharedDetails
	revision int64
}
