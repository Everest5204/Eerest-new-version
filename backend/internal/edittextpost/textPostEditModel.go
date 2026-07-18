package edittextpost

import (
	"errors"
	"time"

	"everest-backend/internal/textpost"
)

const (
	maxEditTextLength = 650

	maxEditTextRequestBodySize int64 =
		64 << 10 // 64 KB
)

var (
	ErrTextPostNotFound = errors.New(
		"text post not found",
	)

	ErrTextPostConflict = errors.New(
		"text post was changed from another session",
	)

	ErrInvalidTextPost = errors.New(
		"invalid text post",
	)

	ErrTextPostUpdateFailed = errors.New(
		"text post update failed",
	)
)

// EditTextPostRequest represents the JSON body
// received from the frontend PATCH request.
type EditTextPostRequest struct {
	Text    string `json:"text"`
	Caption string `json:"caption"`

	TextBackground textpost.TextBackground `json:"text_background"`

	// Background keeps compatibility with older
	// text post request formats.
	Background textpost.TextBackground `json:"background"`

	TextColor string `json:"text_color"`
	TextStyle string `json:"text_style"`

	// Used for atomic conflict protection.
	ExpectedUpdatedAt string `json:"expected_updated_at"`
}

// EditTextPostInput contains validated data passed
// from the Handler to the Service.
type EditTextPostInput struct {
	AuthUserID string
	PostID     string

	Text string

	TextBackground textpost.TextBackground
	TextColor      string
	TextStyle      string

	ExpectedUpdatedAt time.Time
}

// TextPostEditResponse is used for both opening
// and successfully saving the Edit Text Post page.
type TextPostEditResponse struct {
	Post textpost.TextFeedPost `json:"post"`
}

// TextPostEditErrorResponse keeps every edit
// endpoint error response consistent.
type TextPostEditErrorResponse struct {
	Error string `json:"error"`
}