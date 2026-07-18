package auth

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

type User struct {
	ID             bson.ObjectID `bson:"_id,omitempty" json:"id"`
	FirstName      string        `bson:"first_name" json:"first_name"`
	LastName       string        `bson:"last_name" json:"last_name"`
	EmailOrPhone   string        `bson:"email_or_phone" json:"email_or_phone"`
	Password       string        `bson:"password,omitempty" json:"-"`
	Gender         string        `bson:"gender" json:"gender"`
	BirthMonth     int           `bson:"birth_month" json:"birth_month"`
	BirthDay       int           `bson:"birth_day" json:"birth_day"`
	BirthYear      int           `bson:"birth_year" json:"birth_year"`
	ResetCode      string        `bson:"reset_code,omitempty" json:"-"`
	ResetCodeExpAt time.Time     `bson:"reset_code_exp_at,omitempty" json:"-"`
	CreatedAt      time.Time     `bson:"created_at" json:"created_at"`
}

type SignupRequest struct {
	FirstName    string `json:"first_name"`
	LastName     string `json:"last_name"`
	EmailOrPhone string `json:"email_or_phone"`
	Password     string `json:"password"`
	Gender       string `json:"gender"`
	BirthMonth   int    `json:"birth_month"`
	BirthDay     int    `json:"birth_day"`
	BirthYear    int    `json:"birth_year"`
}

type LoginRequest struct {
	EmailOrPhone string `json:"email_or_phone"`
	Password     string `json:"password"`
}

type GoogleAuthRequest struct {
	Email     string `json:"email"`
	FirstName string `json:"first_name"`
	LastName  string `json:"last_name"`
}

type ForgotPasswordRequest struct {
	EmailOrPhone string `json:"email_or_phone"`
}

type VerifyResetCodeRequest struct {
	EmailOrPhone string `json:"email_or_phone"`
	Code         string `json:"code"`
}

type ResetPasswordRequest struct {
	EmailOrPhone string `json:"email_or_phone"`
	NewPassword  string `json:"new_password"`
}

type AuthResponse struct {
	Token string `json:"token"`
	User  User   `json:"user"`
}

type GoogleAuthResponse struct {
	Token       string `json:"token,omitempty"`
	User        User   `json:"user,omitempty"`
	NeedsSignup bool   `json:"needs_signup"`
}