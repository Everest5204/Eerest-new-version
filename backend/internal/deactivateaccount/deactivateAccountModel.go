package deactivateaccount

import (
	"context"
	"errors"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

var (
	ErrInvalidRequest   = errors.New("confirm deactivation and enter your current password")
	ErrWrongPassword    = errors.New("current password is incorrect")
	ErrPasswordRequired = errors.New("set a password using Forgot password before deactivating this account")
	ErrSessionExpired   = errors.New("your session changed; please sign in again")
	ErrDeleting         = errors.New("account deletion is already in progress")
	ErrRateLimited      = errors.New("too many attempts; please wait one minute")
	ErrUnavailable      = errors.New("deactivation could not be confirmed; retry with the same request")
)

type Request struct {
	Confirm         bool   `json:"confirm"`
	CurrentPassword string `json:"current_password"`
	OperationID     string `json:"operation_id"`
}

type Response struct {
	Status        string    `json:"status"`
	OperationID   string    `json:"operation_id"`
	DeactivatedAt time.Time `json:"deactivated_at"`
}

type Account struct {
	ID                     bson.ObjectID `bson:"_id"`
	PasswordHash           string        `bson:"password"`
	DeletionRequested      bool          `bson:"deletion_requested"`
	Deactivated            bool          `bson:"deactivated"`
	SessionVersion         int64         `bson:"session_version"`
	DeactivatedAt          time.Time     `bson:"deactivated_at"`
	OperationID            string        `bson:"deactivation_operation_id"`
	PreviousSessionVersion int64         `bson:"deactivation_previous_session_version"`
}

type accountStore interface {
	Read(context.Context, bson.ObjectID) (Account, error)
	TakeAttempt(context.Context, bson.ObjectID, time.Time) (bool, error)
	Deactivate(context.Context, Account, string, time.Time) (Account, error)
}
