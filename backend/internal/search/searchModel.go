package search

import "go.mongodb.org/mongo-driver/v2/bson"

type UserResult struct {
	ID              string `json:"id"`
	FirstName       string `json:"first_name"`
	LastName        string `json:"last_name"`
	ProfileImageURL string `json:"profile_image_url,omitempty"`
	ProfileTitle    string `json:"profile_title,omitempty"`
}

type UsersResponse struct {
	Users []UserResult `json:"users"`
	Count int          `json:"count"`
	Query string       `json:"query"`
}

type userDocument struct {
	ID              bson.ObjectID `bson:"_id"`
	FirstName       string        `bson:"first_name"`
	LastName        string        `bson:"last_name"`
	ProfileImageURL string        `bson:"profile_image_url"`
	ProfileTitle    string        `bson:"profile_title"`
}