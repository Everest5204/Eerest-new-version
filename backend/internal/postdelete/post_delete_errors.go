package postdelete

import "errors"

var (
	// Request validation errors.
	ErrDeletePostInvalidID = errors.New("invalid post id")

	// Post lookup errors.
	ErrDeletePostNotFound = errors.New("post not found")

	// Authorization errors.
	ErrDeletePostForbidden = errors.New(
		"you are not allowed to delete this post",
	)

	// Cloudinary cleanup errors.
	ErrDeletePostMediaCleanup = errors.New(
		"post media cleanup failed",
	)

	// MongoDB cleanup errors.
	ErrDeletePostDatabaseCleanup = errors.New(
		"post database cleanup failed",
	)
)