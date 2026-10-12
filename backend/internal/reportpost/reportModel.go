// Package reportpost owns private post-report intake and its moderation queue.
package reportpost

import (
	"errors"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

const MaxDetailsCharacters = 1000
const ReportsPerHour = 10

var (
	ErrInput           = errors.New("Check the report reason and details.")
	ErrSession         = errors.New("Please sign in again.")
	ErrPost            = errors.New("This post is no longer available.")
	ErrOwnPost         = errors.New("You can edit or delete your own post.")
	ErrConflict        = errors.New("This request belongs to another report.")
	ErrRateLimit       = errors.New("You have sent several reports. Please try again later.")
	ErrUnavailable     = errors.New("Reports are temporarily unavailable. Please try again.")
	ErrReceiptNotFound = errors.New("No receipt was found yet.")
)

var reasons = map[string]bool{
	"spam": true, "harassment": true, "hate_speech": true,
	"violence": true, "nudity": true, "scam": true,
	"false_information": true, "self_harm": true, "other": true,
}

type Request struct {
	PostID     string `json:"post_id"`
	PostSource string `json:"post_source"`
	Reason     string `json:"reason"`
	Details    string `json:"details"`
	RequestID  string `json:"request_id"`
}

// Receipts never expose the reporter, post author, details or moderation notes.
type Receipt struct {
	ID         string    `json:"id"`
	RequestID  string    `json:"request_id"`
	PostID     string    `json:"post_id"`
	PostSource string    `json:"post_source"`
	Reason     string    `json:"reason"`
	Status     string    `json:"status"`
	ReceivedAt time.Time `json:"received_at"`
}

type Response struct {
	Report          Receipt `json:"report"`
	AlreadyReported bool    `json:"already_reported"`
}

type session struct {
	owner   bson.ObjectID
	version int64
}
type submission struct {
	Request
	postID bson.ObjectID
}

type snapshot struct {
	Type      string    `bson:"type"`
	Text      string    `bson:"text"`
	Media     []media   `bson:"media,omitempty"`
	CreatedAt time.Time `bson:"created_at"`
	UpdatedAt time.Time `bson:"updated_at"`
}
type media struct {
	URL  string `bson:"url"`
	Type string `bson:"type"`
}
type record struct {
	ID         bson.ObjectID `bson:"_id"`
	ReporterID bson.ObjectID `bson:"reporter_id"`
	AuthorID   bson.ObjectID `bson:"reported_user_id"`
	PostID     bson.ObjectID `bson:"post_id"`
	PostSource string        `bson:"post_source"`
	RequestID  string        `bson:"request_id"`
	Reason     string        `bson:"reason"`
	Details    string        `bson:"details"`
	Status     string        `bson:"status"`
	Snapshot   snapshot      `bson:"snapshot"`
	CreatedAt  time.Time     `bson:"created_at"`
	UpdatedAt  time.Time     `bson:"updated_at"`
}

func response(r record, duplicate bool) *Response {
	return &Response{Report: Receipt{ID: r.ID.Hex(), RequestID: r.RequestID, PostID: r.PostID.Hex(),
		PostSource: r.PostSource, Reason: r.Reason, Status: r.Status, ReceivedAt: r.CreatedAt}, AlreadyReported: duplicate}
}
