package user

import (
	"context"
	"errors"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

type UserService struct {
	Collection *mongo.Collection
}

func NewUserService(
	db *mongo.Database,
) *UserService {
	return &UserService{
		Collection: db.Collection("users"),
	}
}

func (service *UserService) CreateIndexes(
	ctx context.Context,
) error {
	indexModels := []mongo.IndexModel{
		{
			Keys: bson.D{
				{
					Key:   "email_or_phone",
					Value: 1,
				},
			},
			Options: options.Index().
				SetUnique(true).
				SetSparse(true).
				SetName("unique_email_or_phone"),
		},
		{
			Keys: bson.D{
				{
					Key:   "google_subject",
					Value: 1,
				},
			},
			Options: options.Index().
				SetUnique(true).
				SetSparse(true).
				SetName("unique_google_subject"),
		},
	}

	_, err := service.Collection.
		Indexes().
		CreateMany(
			ctx,
			indexModels,
		)

	return err
}

func (service *UserService) GetUserByID(
	ctx context.Context,
	userID string,
) (*User, error) {
	objectID, err := bson.ObjectIDFromHex(
		userID,
	)

	if err != nil {
		return nil, errors.New(
			"invalid user id",
		)
	}

	ctx, cancel := context.WithTimeout(
		ctx,
		3*time.Second,
	)
	defer cancel()

	var user User

	err = service.Collection.FindOne(
		ctx,
		bson.M{
			"_id": objectID,
		},
		options.FindOne().SetProjection(
			bson.M{
				"password": 0,
			},
		),
	).Decode(&user)

	if err != nil {
		if errors.Is(
			err,
			mongo.ErrNoDocuments,
		) {
			return nil, errors.New(
				"user not found",
			)
		}

		return nil, err
	}

	user.Password = ""

	return &user, nil
}

func (service *UserService) GetUserByEmailOrPhone(
	ctx context.Context,
	emailOrPhone string,
) (*User, error) {
	emailOrPhone = strings.TrimSpace(
		emailOrPhone,
	)

	ctx, cancel := context.WithTimeout(
		ctx,
		3*time.Second,
	)
	defer cancel()

	var user User

	err := service.Collection.FindOne(
		ctx,
		bson.M{
			"email_or_phone": emailOrPhone,
		},
		options.FindOne().SetProjection(
			bson.M{
				"password": 0,
			},
		),
	).Decode(&user)

	if err != nil {
		if errors.Is(
			err,
			mongo.ErrNoDocuments,
		) {
			return nil, errors.New(
				"user not found",
			)
		}

		return nil, err
	}

	user.Password = ""

	return &user, nil
}

func (service *UserService) GetUserByEmail(
	ctx context.Context,
	email string,
) (*User, error) {
	return service.GetUserByEmailOrPhone(
		ctx,
		strings.TrimSpace(
			strings.ToLower(
				email,
			),
		),
	)
}

func (service *UserService) GetUserByPhone(
	ctx context.Context,
	phone string,
) (*User, error) {
	return service.GetUserByEmailOrPhone(
		ctx,
		strings.TrimSpace(
			phone,
		),
	)
}