// Package myactivity exposes the signed-in user's existing activity records.
// It deliberately does not duplicate posts, reactions or connection history.
package myactivity

import (
	"errors"
	"go.mongodb.org/mongo-driver/v2/bson"
	"time"
)

var ErrInput = errors.New("invalid activity request")
var ErrUnavailable = errors.New("activity is no longer available")

type source struct {
	kind, category, collection, owner string
	live                              bool
}

var sources = []source{
	{"comment", "comments", "comments", "user_id", true},
	{"comment_love", "reactions", "comment_loves", "user_id", false},
	{"follow", "connections", "user_follows", "follower_id", false},
	{"post", "posts", "posts", "user_id", true},
	{"reaction", "reactions", "post_reactions", "user_id", false},
}

type Query struct {
	Category     string
	From, Before time.Time
	Limit        int
	Cursor       string
}
type position struct {
	Version  int       `json:"v"`
	Owner    string    `json:"o"`
	Category string    `json:"c"`
	From     time.Time `json:"f"`
	Before   time.Time `json:"b"`
	AsOf     time.Time `json:"s"`
	At       time.Time `json:"a"`
	Kind     string    `json:"k"`
	ID       string    `json:"i"`
}
type actor struct {
	ID        bson.ObjectID `bson:"_id" json:"id"`
	FirstName string        `bson:"first_name" json:"first_name"`
	LastName  string        `bson:"last_name" json:"last_name"`
	Image     string        `bson:"profile_image_url" json:"profile_image_url,omitempty"`
}
type media struct {
	URL   string `bson:"url" json:"url"`
	ID    string `bson:"id" json:"id"`
	Type  string `bson:"type" json:"type"`
	Order int    `bson:"order" json:"order"`
}

// Only public post fields are decoded and returned; no raw BSON or user email.
type post struct {
	ID         bson.ObjectID `bson:"_id" json:"id"`
	UserID     bson.ObjectID `bson:"user_id" json:"user_id"`
	User       actor         `bson:"-" json:"user"`
	Type       string        `bson:"type" json:"type"`
	Caption    string        `bson:"caption" json:"caption,omitempty"`
	Text       string        `bson:"text" json:"text,omitempty"`
	Background struct {
		Kind  string `bson:"kind" json:"kind"`
		Value string `bson:"value" json:"value"`
	} `bson:"text_background" json:"text_background"`
	TextColor string    `bson:"text_color" json:"text_color,omitempty"`
	TextStyle string    `bson:"text_style" json:"text_style,omitempty"`
	Media     []media   `bson:"media" json:"media,omitempty"`
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
type record struct {
	ID          bson.ObjectID `bson:"_id"`
	UserID      bson.ObjectID `bson:"user_id"`
	PostID      bson.ObjectID `bson:"post_id"`
	CommentID   bson.ObjectID `bson:"comment_id"`
	ParentID    bson.ObjectID `bson:"parent_id"`
	FollowingID bson.ObjectID `bson:"following_id"`
	Created     time.Time     `bson:"created_at"`
	Text        string        `bson:"text"`
	Reaction    string        `bson:"reaction_type"`
	Deleted     bool          `bson:"is_deleted"`
	Kind        string        `bson:"-"`
}
type Item struct {
	ID        string    `json:"id"`
	Kind      string    `json:"kind"`
	Category  string    `json:"category"`
	At        time.Time `json:"created_at"`
	Title     string    `json:"title"`
	Text      string    `json:"text"`
	Author    *actor    `json:"author,omitempty"`
	Thumbnail string    `json:"thumbnail,omitempty"`
	PostID    string    `json:"post_id,omitempty"`
	Available bool      `json:"available"`
	Action    string    `json:"action"`
}
type Page struct {
	Owner      string           `json:"owner_id"`
	Items      []Item           `json:"items"`
	Counts     map[string]int64 `json:"counts,omitempty"`
	HasMore    bool             `json:"has_more"`
	NextCursor string           `json:"next_cursor"`
}
type Target struct {
	Owner     string `json:"owner_id"`
	Kind      string `json:"kind"`
	ID        string `json:"id"`
	Post      *post  `json:"post,omitempty"`
	Profile   *actor `json:"profile,omitempty"`
	CommentID string `json:"comment_id,omitempty"`
}

func sourceFor(kind string) (source, bool) {
	for _, s := range sources {
		if s.kind == kind {
			return s, true
		}
	}
	return source{}, false
}
func validCategory(c string) bool {
	return c == "all" || c == "posts" || c == "reactions" || c == "comments" || c == "connections"
}
func validate(q Query) error {
	if !validCategory(q.Category) || q.Limit < 1 || q.Limit > 50 || len(q.Cursor) > 2048 {
		return ErrInput
	}
	if !q.From.IsZero() && !q.Before.IsZero() && !q.From.Before(q.Before) {
		return ErrInput
	}
	if (!q.From.IsZero() && q.From.Year() < 1970) || (!q.Before.IsZero() && q.Before.Year() < 1970) {
		return ErrInput
	}
	return nil
}
