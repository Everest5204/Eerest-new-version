package reaction

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

const (
	ReactionAll   = "all"
	ReactionLove  = "love"
	ReactionHaha  = "haha"
	ReactionWow   = "wow"
	ReactionSad   = "sad"
	ReactionAngry = "angry"
)

var AllowedReactionTypes = map[string]bool{
	ReactionLove:  true,
	ReactionHaha:  true,
	ReactionWow:   true,
	ReactionSad:   true,
	ReactionAngry: true,
}

var AllowedReactionFilters = map[string]bool{
	ReactionAll:   true,
	ReactionLove:  true,
	ReactionHaha:  true,
	ReactionWow:   true,
	ReactionSad:   true,
	ReactionAngry: true,
}

type Reaction struct {
	ID bson.ObjectID `bson:"_id,omitempty" json:"id"`

	PostID bson.ObjectID `bson:"post_id" json:"post_id"`
	UserID bson.ObjectID `bson:"user_id" json:"user_id"`

	ReactionType string `bson:"reaction_type" json:"reaction_type"`

	CreatedAt time.Time `bson:"created_at" json:"created_at"`
	UpdatedAt time.Time `bson:"updated_at" json:"updated_at"`
}

type ReactionUser struct {
	ID string `json:"id"`

	FirstName string `json:"first_name"`
	LastName  string `json:"last_name"`

	ProfileImageURL string `json:"profile_image_url,omitempty"`
}

type ReactionCounts map[string]int64

type PostReactionSummary struct {
	Total int64 `json:"total"`

	Counts       ReactionCounts `json:"counts"`
	TopReactions []string       `json:"top_reactions"`

	CurrentUserReaction string        `json:"current_user_reaction"`
	FirstReactor        *ReactionUser `json:"first_reactor,omitempty"`
}

type SetReactionRequest struct {
	PostID       string `json:"post_id"`
	ReactionType string `json:"reaction_type"`
}

type SetReactionResponse struct {
	ReactionType string               `json:"reaction_type"`
	Summary      *PostReactionSummary `json:"summary"`
}

type DeleteReactionResponse struct {
	ReactionType string               `json:"reaction_type"`
	Summary      *PostReactionSummary `json:"summary"`
}

type ReactionUserItem struct {
	ID string `json:"id"`

	ReactionType string       `json:"reaction_type"`
	User         ReactionUser `json:"user"`
}

type ReactionUsersResponse struct {
	Items []ReactionUserItem `json:"items"`

	Counts ReactionCounts `json:"counts"`
	Total  int64          `json:"total"`
}

type reactionUserDocument struct {
	ID bson.ObjectID `bson:"_id,omitempty"`

	FirstName string `bson:"first_name,omitempty"`
	LastName  string `bson:"last_name,omitempty"`

	ProfileImageURL string `bson:"profile_image_url,omitempty"`
}

type reactionWithUserDocument struct {
	ID bson.ObjectID `bson:"_id,omitempty"`

	PostID bson.ObjectID `bson:"post_id"`
	UserID bson.ObjectID `bson:"user_id"`

	ReactionType string `bson:"reaction_type"`

	CreatedAt time.Time `bson:"created_at"`
	UpdatedAt time.Time `bson:"updated_at"`

	User *reactionUserDocument `bson:"user,omitempty"`
}