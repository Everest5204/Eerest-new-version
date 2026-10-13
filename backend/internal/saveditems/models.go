// Package saveditems owns private bookmarks, never copies of a user's feed.
package saveditems

import (
	"context"
	"errors"
	"go.mongodb.org/mongo-driver/v2/bson"
	"math"
	"regexp"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

var (
	ErrInput       = errors.New("Check the saved item request and try again.")
	ErrSession     = errors.New("Your session has expired. Please sign in again.")
	ErrPost        = errors.New("This saved post is no longer available.")
	ErrConflict    = errors.New("Saved status changed in another session. Refresh and try again.")
	ErrUnavailable = errors.New("Saved Items is temporarily unavailable. Please try again.")
)

type Auth struct {
	Owner   bson.ObjectID
	Version int64
}
type Request struct {
	Saved            *bool  `json:"saved"`
	ExpectedRevision *int64 `json:"expected_revision"`
	RequestID        string `json:"request_id"`
}
type Record struct {
	ID           bson.ObjectID `bson:"_id,omitempty"`
	Owner        bson.ObjectID `bson:"user_id"`
	PostID       bson.ObjectID `bson:"post_id"`
	Kind         string        `bson:"kind"`
	Saved        bool          `bson:"saved"`
	Revision     int64         `bson:"revision"`
	SavedAt      time.Time     `bson:"saved_at"`
	UpdatedAt    time.Time     `bson:"updated_at"`
	LastRequest  string        `bson:"last_request"`
	LastExpected int64         `bson:"last_expected"`
	LastDesired  bool          `bson:"last_desired"`
}
type State struct {
	Owner    string     `json:"owner_id"`
	PostID   string     `json:"post_id"`
	Saved    bool       `json:"saved"`
	Revision int64      `json:"revision"`
	SavedAt  *time.Time `json:"saved_at"`
}
type Author struct {
	ID        bson.ObjectID `bson:"_id" json:"id"`
	FirstName string        `bson:"first_name" json:"first_name"`
	LastName  string        `bson:"last_name" json:"last_name"`
	Image     string        `bson:"profile_image_url" json:"profile_image_url,omitempty"`
}
type Media struct {
	URL   string `bson:"url" json:"url"`
	ID    string `bson:"id" json:"id"`
	Type  string `bson:"type" json:"type"`
	Order int    `bson:"order" json:"order"`
}
type Post struct {
	ID         bson.ObjectID `bson:"_id" json:"id"`
	UserID     bson.ObjectID `bson:"user_id" json:"user_id"`
	User       Author        `bson:"-" json:"user"`
	Type       string        `bson:"type" json:"type"`
	Caption    string        `bson:"caption" json:"caption,omitempty"`
	Text       string        `bson:"text" json:"text,omitempty"`
	Background struct {
		Kind  string `bson:"kind" json:"kind"`
		Value string `bson:"value" json:"value"`
	} `bson:"text_background" json:"text_background"`
	TextColor string    `bson:"text_color" json:"text_color,omitempty"`
	TextStyle string    `bson:"text_style" json:"text_style,omitempty"`
	Media     []Media   `bson:"media" json:"media,omitempty"`
	MediaURL  string    `bson:"media_url" json:"media_url,omitempty"`
	MediaID   string    `bson:"media_id" json:"media_id,omitempty"`
	MediaType string    `bson:"media_type" json:"media_type,omitempty"`
	Likes     int64     `bson:"likes_count" json:"likes_count"`
	Comments  int64     `bson:"comments_count" json:"comments_count"`
	Shares    int64     `bson:"shares_count" json:"shares_count"`
	Created   time.Time `bson:"created_at" json:"created_at"`
	Updated   time.Time `bson:"updated_at" json:"updated_at"`
	IsSelf    bool      `bson:"-" json:"is_self"`
	Following bool      `bson:"-" json:"is_following"`
}
type Item struct {
	ID        string    `json:"id"`
	PostID    string    `json:"post_id"`
	Kind      string    `json:"kind"`
	Revision  int64     `json:"revision"`
	SavedAt   time.Time `json:"saved_at"`
	Available bool      `json:"available"`
	Title     string    `json:"title"`
	Text      string    `json:"text"`
	Author    *Author   `json:"author,omitempty"`
	Thumbnail string    `json:"thumbnail,omitempty"`
}
type Query struct {
	Kind, Search, Cursor string
	Limit                int
}
type Position struct {
	V      int       `json:"v"`
	Owner  string    `json:"o"`
	Kind   string    `json:"k"`
	Search string    `json:"q"`
	AsOf   time.Time `json:"s"`
	At     time.Time `json:"a"`
	ID     string    `json:"i"`
}
type Page struct {
	ChangeRevision int64  `json:"change_revision"`
	Owner          string `json:"owner_id"`
	Items          []Item `json:"items"`
	HasMore        bool   `json:"has_more"`
	Cursor         string `json:"next_cursor"`
}
type Resolved struct {
	Owner string `json:"owner_id"`
	Items []Item `json:"items"`
}

type Target struct {
	Owner string `json:"owner_id"`
	Post  *Post  `json:"post"`
}
type joined struct {
	Record  `bson:",inline"`
	Posts   []Post   `bson:"post"`
	Authors []Author `bson:"author"`
}
type Store interface {
	CheckSession(context.Context, Auth) error
	OwnerRevision(context.Context, Auth) (int64, error)
	Resolve(context.Context, Auth, []bson.ObjectID) ([]joined, error)
	Read(context.Context, Auth, bson.ObjectID) (Record, error)
	Update(context.Context, Auth, bson.ObjectID, Request, time.Time) (Record, error)
	List(context.Context, Auth, Query, Position) ([]joined, error)
	Target(context.Context, Auth, bson.ObjectID) (*Post, error)
}

func snapshot(r Record) State {
	s := State{Owner: r.Owner.Hex(), PostID: r.PostID.Hex(), Saved: r.Saved, Revision: r.Revision}
	if r.Saved {
		at := r.SavedAt
		s.SavedAt = &at
	}
	return s
}
func validKind(v string) bool { return v == "all" || v == "text" || v == "photos" || v == "videos" }
func contentKind(v string) string {
	switch v {
	case "text":
		return "text"
	case "video":
		return "videos"
	case "image", "profile_photo_update", "cover_photo_update":
		return "photos"
	}
	return ""
}

var uuid = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)

func validRequest(r Request) bool {
	return r.Saved != nil && r.ExpectedRevision != nil && *r.ExpectedRevision >= 0 && *r.ExpectedRevision < math.MaxInt64 && uuid.MatchString(r.RequestID)
}
func objectID(v string) (bson.ObjectID, error) {
	id, e := bson.ObjectIDFromHex(v)
	if e != nil || id.IsZero() {
		return bson.NilObjectID, ErrInput
	}
	return id, nil
}
func normalize(q Query) (Query, error) {
	q.Search = strings.Join(strings.Fields(q.Search), " ")
	if !validKind(q.Kind) || q.Limit < 1 || q.Limit > 50 || len(q.Cursor) > 2048 || utf8.RuneCountInString(q.Search) > 80 {
		return q, ErrInput
	}
	for _, r := range q.Search {
		if unicode.IsControl(r) {
			return q, ErrInput
		}
	}
	return q, nil
}
func clip(v string, n int) string {
	r := []rune(strings.TrimSpace(v))
	if len(r) > n {
		return string(r[:n]) + "…"
	}
	return string(r)
}
