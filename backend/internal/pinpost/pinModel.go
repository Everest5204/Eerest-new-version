// Package pinpost owns one durable, ownership-checked profile pin per account.
package pinpost

import (
	"errors"
	"go.mongodb.org/mongo-driver/v2/bson"
	"time"
)

var (
	ErrInput       = errors.New("Check the post and try again.")
	ErrSession     = errors.New("Please sign in again.")
	ErrOwner       = errors.New("You can only pin your own posts.")
	ErrPost        = errors.New("This post is no longer available.")
	ErrProfile     = errors.New("This profile is unavailable.")
	ErrConflict    = errors.New("Your profile pin changed. Refresh it before trying again.")
	ErrReceipt     = errors.New("This update has not been received yet.")
	ErrRateLimit   = errors.New("Too many pin updates. Please wait a minute.")
	ErrUnavailable = errors.New("Could not update your profile pin. Please try again.")
)

type Request struct {
	PostID           string `json:"post_id" bson:"post_id"`
	PostSource       string `json:"post_source" bson:"post_source"`
	Pinned           *bool  `json:"pinned" bson:"pinned"`
	ExpectedRevision *int64 `json:"expected_revision" bson:"expected_revision"`
	RequestID        string `json:"request_id" bson:"request_id"`
}
type Snapshot struct {
	OwnerID    string     `json:"owner_id"`
	Revision   int64      `json:"revision"`
	PostSource string     `json:"post_source"`
	Post       any        `json:"post"`
	PinnedAt   *time.Time `json:"pinned_at"`
}
type Receipt struct {
	OwnerID          string `json:"owner_id" bson:"owner_id"`
	RequestID        string `json:"request_id" bson:"request_id"`
	PostID           string `json:"post_id" bson:"post_id"`
	PostSource       string `json:"post_source" bson:"post_source"`
	Pinned           bool   `json:"pinned" bson:"pinned"`
	ExpectedRevision int64  `json:"expected_revision" bson:"expected_revision"`
	ResultRevision   int64  `json:"result_revision" bson:"result_revision"`
}
type Response struct {
	Receipt Receipt   `json:"receipt"`
	Current *Snapshot `json:"current"`
}
type auth struct {
	owner   bson.ObjectID
	version int64
}
type record struct {
	Owner    bson.ObjectID `bson:"_id"`
	Post     bson.ObjectID `bson:"post_id"`
	Source   string        `bson:"post_source"`
	Revision int64         `bson:"revision"`
	PinnedAt time.Time     `bson:"pinned_at"`
	Window   time.Time     `bson:"rate_window"`
	Changes  int           `bson:"rate_changes"`
}
type operation struct {
	ID        string    `bson:"_id"`
	Receipt   Receipt   `bson:"receipt"`
	CreatedAt time.Time `bson:"created_at"`
}
