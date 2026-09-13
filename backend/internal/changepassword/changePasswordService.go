package changepassword

import (
	"context"
	"errors"
	"fmt"
	"time"
	"unicode/utf8"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"golang.org/x/crypto/bcrypt"
)

const passwordOperationTimeout = 10 * time.Second

var (
	ErrInvalidUserID = errors.New(
		"invalid user ID",
	)

	ErrUserNotFound = errors.New(
		"account not found",
	)

	ErrCurrentPasswordRequired = errors.New(
		"please enter your current password",
	)

	ErrCurrentPasswordIncorrect = errors.New(
		"current password is incorrect",
	)

	ErrPasswordNotSet = errors.New(
		"this account does not have a password yet",
	)

	ErrPasswordTooShort = errors.New(
		"new password must be at least 6 characters",
	)

	ErrPasswordTooLong = errors.New(
		"new password is too long",
	)

	ErrPasswordMismatch = errors.New(
		"new passwords do not match",
	)

	ErrSamePassword = errors.New(
		"new password must be different from your current password",
	)

	ErrPasswordChanged = errors.New(
		"your password has already changed; please try again with your current password",
	)
)

type Service struct {
	collection *mongo.Collection
}

func NewService(db *mongo.Database) *Service {
	return &Service{
		collection: db.Collection("users"),
	}
}

func (service *Service) ChangePassword(
	parentCtx context.Context,
	userID string,
	request ChangePasswordRequest,
) error {
	objectID, err := bson.ObjectIDFromHex(userID)

	if err != nil || objectID.IsZero() {
		return ErrInvalidUserID
	}

	if request.CurrentPassword == "" {
		return ErrCurrentPasswordRequired
	}

	if utf8.RuneCountInString(request.NewPassword) < 6 {
		return ErrPasswordTooShort
	}

	// bcrypt accepts passwords up to 72 bytes.
	if len(request.NewPassword) > 72 {
		return ErrPasswordTooLong
	}

	if request.NewPassword != request.ConfirmPassword {
		return ErrPasswordMismatch
	}

	ctx, cancel := context.WithTimeout(
		parentCtx,
		passwordOperationTimeout,
	)
	defer cancel()

	var account struct {
		Password string `bson:"password" json:"-"`
	}

	err = service.collection.FindOne(
		ctx,
		bson.M{
			"_id": objectID,
		},
	).Decode(&account)

	if errors.Is(err, mongo.ErrNoDocuments) {
		return ErrUserNotFound
	}

	if err != nil {
		return fmt.Errorf(
			"load password record: %w",
			err,
		)
	}

	if account.Password == "" {
		return ErrPasswordNotSet
	}

	if len(request.CurrentPassword) > 72 {
		return ErrCurrentPasswordIncorrect
	}

	err = bcrypt.CompareHashAndPassword(
		[]byte(account.Password),
		[]byte(request.CurrentPassword),
	)

	if errors.Is(err, bcrypt.ErrMismatchedHashAndPassword) {
		return ErrCurrentPasswordIncorrect
	}

	if err != nil {
		return fmt.Errorf(
			"verify current password: %w",
			err,
		)
	}

	if request.NewPassword == request.CurrentPassword {
		return ErrSamePassword
	}

	hashedPassword, err := bcrypt.GenerateFromPassword(
		[]byte(request.NewPassword),
		bcrypt.DefaultCost,
	)

	if err != nil {
		return fmt.Errorf(
			"hash new password: %w",
			err,
		)
	}

	// Only update if the verified password is still current.
	result, err := service.collection.UpdateOne(
		ctx,
		bson.M{
			"_id":      objectID,
			"password": account.Password,
		},
		bson.M{
			"$set": bson.M{
				"password": string(hashedPassword),
			},
			"$unset": bson.M{
				"reset_code":        "",
				"reset_code_exp_at": "",
			},
		},
	)

	if err != nil {
		return fmt.Errorf(
			"update password: %w",
			err,
		)
	}

	if result.MatchedCount == 0 {
		return ErrPasswordChanged
	}

	return nil
}