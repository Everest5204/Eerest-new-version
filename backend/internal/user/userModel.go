package user

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

type User struct {
	ID bson.ObjectID `bson:"_id,omitempty" json:"id"`

	FirstName    string `bson:"first_name" json:"first_name"`
	LastName     string `bson:"last_name" json:"last_name"`
	EmailOrPhone string `bson:"email_or_phone" json:"email_or_phone"`

	EmailVerified bool   `bson:"email_verified,omitempty" json:"email_verified"`
	GoogleSubject string `bson:"google_subject,omitempty" json:"-"`

	Password string `bson:"password,omitempty" json:"-"`

	Gender     string `bson:"gender,omitempty" json:"gender,omitempty"`
	BirthMonth int    `bson:"birth_month,omitempty" json:"birth_month,omitempty"`
	BirthDay   int    `bson:"birth_day,omitempty" json:"birth_day,omitempty"`
	BirthYear  int    `bson:"birth_year,omitempty" json:"birth_year,omitempty"`

	FollowersCount int64 `bson:"followers_count,omitempty" json:"followers_count"`
	FollowingCount int64 `bson:"following_count,omitempty" json:"following_count"`
	PostsCount     int64 `bson:"posts_count,omitempty" json:"posts_count"`

	Bio string `bson:"bio,omitempty" json:"bio"`

	ProfileImageURL string `bson:"profile_image_url,omitempty" json:"profile_image_url,omitempty"`
	ProfileImageID  string `bson:"profile_image_id,omitempty" json:"profile_image_id,omitempty"`

	CoverImageURL string `bson:"cover_image_url,omitempty" json:"cover_image_url,omitempty"`
	CoverImageID  string `bson:"cover_image_id,omitempty" json:"cover_image_id,omitempty"`

	CreatedAt time.Time `bson:"created_at" json:"created_at"`
	UpdatedAt time.Time `bson:"updated_at,omitempty" json:"updated_at,omitempty"`
}