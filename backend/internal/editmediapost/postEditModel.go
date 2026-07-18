package editmediapost

import (
	"errors"
	"mime/multipart"
	"time"

	"everest-backend/internal/post"
)

const (
	maxEditCaptionLength = 2200

	maxEditImageCount = 10
	maxEditVideoCount = 1

	maxEditImageSize int64 = 15 << 20  // 15 MB
	maxEditVideoSize int64 = 200 << 20 // 200 MB

	maxMediaEditRequestSize int64 = 250 << 20 // 250 MB
)

var (
	ErrMediaPostNotFound = errors.New("media post not found")

	ErrMediaPostConflict = errors.New(
		"post was changed from another session",
	)

	ErrInvalidMediaSelection = errors.New(
		"invalid media selection",
	)

	ErrMediaPostUpdateFailed = errors.New(
		"media post update failed",
	)
)

// EditMediaPostInput contains the validated data that will be sent
// from the HTTP handler to the edit service.
type EditMediaPostInput struct {
	AuthUserID string
	PostID     string

	Caption string

	// IDs or URLs of the existing media that the user wants to keep.
	KeepMediaKeys []string

	// Newly selected image or video files.
	NewFiles []*multipart.FileHeader

	// Prevents an older browser tab from overwriting a newer edit.
	ExpectedUpdatedAt time.Time
}

// EditMediaPostResponse is returned after MongoDB successfully
// saves the edited post.
type EditMediaPostResponse struct {
	Post post.FeedPost `json:"post"`
}

// GetEditablePostResponse is used when opening or refreshing
// the Edit Media Post page.
type GetEditablePostResponse struct {
	Post post.FeedPost `json:"post"`
}

// ErrorResponse keeps every API error response consistent.
type ErrorResponse struct {
	Error string `json:"error"`
}