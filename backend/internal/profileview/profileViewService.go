package profileview

import (
	"context"
	"errors"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"go.mongodb.org/mongo-driver/v2/mongo/writeconcern"
)

const profileOperationTimeout = 5 * time.Second

var (
	ErrInvalidUserID = errors.New(
		"invalid user id",
	)

	ErrUserNotFound = errors.New(
		"user not found",
	)

	ErrCannotFollowSelf = errors.New(
		"you cannot follow yourself",
	)
)

type Service struct {
	client            *mongo.Client
	usersCollection   *mongo.Collection
	followsCollection *mongo.Collection
}

func NewService(
	database *mongo.Database,
) *Service {
	return &Service{
		client: database.Client(),

		usersCollection: database.Collection(
			"users",
		),

		followsCollection: database.Collection(
			"user_follows",
		),
	}
}

func (service *Service) CreateIndexes(
	ctx context.Context,
) error {
	_, err := service.followsCollection.
		Indexes().
		CreateMany(
			ctx,
			[]mongo.IndexModel{
				{
					Keys: bson.D{
						{
							Key:   "follower_id",
							Value: 1,
						},
						{
							Key:   "following_id",
							Value: 1,
						},
					},
					Options: options.Index().
						SetUnique(true).
						SetName(
							"unique_user_follow_relationship",
						),
				},
				{
					Keys: bson.D{
						{
							Key:   "following_id",
							Value: 1,
						},
						{
							Key:   "created_at",
							Value: -1,
						},
					},
					Options: options.Index().
						SetName(
							"followers_cursor_index",
						),
				},
				{
					Keys: bson.D{
						{
							Key:   "follower_id",
							Value: 1,
						},
						{
							Key:   "created_at",
							Value: -1,
						},
					},
					Options: options.Index().
						SetName(
							"following_cursor_index",
						),
				},
			},
		)

	return err
}

func (service *Service) GetProfile(
	ctx context.Context,
	viewerUserID string,
	profileUserID string,
) (*Profile, error) {
	viewerID, err := parseUserID(
		viewerUserID,
	)
	if err != nil {
		return nil, err
	}

	targetID, err := parseUserID(
		profileUserID,
	)
	if err != nil {
		return nil, err
	}

	databaseCtx, cancel := context.WithTimeout(
		ctx,
		profileOperationTimeout,
	)
	defer cancel()

	var document profileDocument

	err = service.usersCollection.FindOne(
		databaseCtx,
		bson.M{
			"_id": targetID,
		},
		options.FindOne().SetProjection(
			bson.M{
				"_id":               1,
				"first_name":        1,
				"last_name":         1,
				"profile_title":     1,
				"followers_count":   1,
				"following_count":   1,
				"posts_count":       1,
				"profile_image_url": 1,
				"cover_image_url":   1,
			},
		),
	).Decode(
		&document,
	)
	if err != nil {
		if errors.Is(
			err,
			mongo.ErrNoDocuments,
		) {
			return nil, ErrUserNotFound
		}

		return nil, err
	}

	isSelf := viewerID == targetID
	isFollowing := false

	if !isSelf {
		var followRelation struct {
			ID bson.ObjectID `bson:"_id"`
		}

		err = service.followsCollection.FindOne(
			databaseCtx,
			bson.M{
				"follower_id":  viewerID,
				"following_id": targetID,
			},
			options.FindOne().SetProjection(
				bson.M{
					"_id": 1,
				},
			),
		).Decode(
			&followRelation,
		)

		switch {
		case err == nil:
			isFollowing = true

		case errors.Is(
			err,
			mongo.ErrNoDocuments,
		):
			isFollowing = false

		default:
			return nil, err
		}
	}

	profile := &Profile{
		ID: document.ID.Hex(),

		FirstName: document.FirstName,
		LastName:  document.LastName,

		ProfileTitle: document.ProfileTitle,

		FollowersCount: document.FollowersCount,
		FollowingCount: document.FollowingCount,
		PostsCount:     document.PostsCount,

		ProfileImageURL: document.ProfileImageURL,
		CoverImageURL:   document.CoverImageURL,

		IsSelf:      isSelf,
		IsFollowing: isFollowing,
		CanMessage:  !isSelf,
	}

	return profile, nil
}

func (service *Service) Follow(
	ctx context.Context,
	viewerUserID string,
	profileUserID string,
) (*FollowMutationResponse, error) {
	return service.setFollowState(
		ctx,
		viewerUserID,
		profileUserID,
		true,
	)
}

func (service *Service) Unfollow(
	ctx context.Context,
	viewerUserID string,
	profileUserID string,
) (*FollowMutationResponse, error) {
	return service.setFollowState(
		ctx,
		viewerUserID,
		profileUserID,
		false,
	)
}

func (service *Service) setFollowState(
	ctx context.Context,
	viewerUserID string,
	profileUserID string,
	shouldFollow bool,
) (*FollowMutationResponse, error) {
	viewerID, err := parseUserID(
		viewerUserID,
	)
	if err != nil {
		return nil, err
	}

	targetID, err := parseUserID(
		profileUserID,
	)
	if err != nil {
		return nil, err
	}

	if viewerID == targetID {
		return nil, ErrCannotFollowSelf
	}

	transactionCtx, cancel := context.WithTimeout(
		ctx,
		profileOperationTimeout,
	)
	defer cancel()

	session, err := service.client.StartSession()
	if err != nil {
		return nil, err
	}
	defer session.EndSession(
		context.Background(),
	)

	transactionOptions := options.Transaction().
		SetWriteConcern(
			writeconcern.Majority(),
		)

	result, err := session.WithTransaction(
		transactionCtx,
		func(
			sessionCtx context.Context,
		) (any, error) {
			if err := service.ensureUserExists(
				sessionCtx,
				viewerID,
			); err != nil {
				return nil, err
			}

			if err := service.ensureUserExists(
				sessionCtx,
				targetID,
			); err != nil {
				return nil, err
			}

			if shouldFollow {
				created, createErr :=
					service.createFollow(
						sessionCtx,
						viewerID,
						targetID,
					)
				if createErr != nil {
					return nil, createErr
				}

				if created {
					if updateErr :=
						service.incrementFollowCounts(
							sessionCtx,
							viewerID,
							targetID,
							1,
						); updateErr != nil {
						return nil, updateErr
					}
				}
			} else {
				deleted, deleteErr :=
					service.deleteFollow(
						sessionCtx,
						viewerID,
						targetID,
					)
				if deleteErr != nil {
					return nil, deleteErr
				}

				if deleted {
					if updateErr :=
						service.incrementFollowCounts(
							sessionCtx,
							viewerID,
							targetID,
							-1,
						); updateErr != nil {
						return nil, updateErr
					}
				}
			}

			followersCount, countErr :=
				service.getFollowersCount(
					sessionCtx,
					targetID,
				)
			if countErr != nil {
				return nil, countErr
			}

			response := &FollowMutationResponse{
				IsFollowing: shouldFollow,

				FollowersCount: followersCount,
			}

			return response, nil
		},
		transactionOptions,
	)
	if err != nil {
		return nil, err
	}

	response, valid :=
		result.(*FollowMutationResponse)

	if !valid {
		return nil, errors.New(
			"invalid follow transaction response",
		)
	}

	return response, nil
}

func (service *Service) createFollow(
	ctx context.Context,
	viewerID bson.ObjectID,
	targetID bson.ObjectID,
) (bool, error) {
	result, err := service.followsCollection.UpdateOne(
		ctx,
		bson.M{
			"follower_id":  viewerID,
			"following_id": targetID,
		},
		bson.M{
			"$setOnInsert": bson.M{
				"_id": bson.NewObjectID(),

				"follower_id":  viewerID,
				"following_id": targetID,

				"created_at": time.Now().UTC(),
			},
		},
		options.UpdateOne().SetUpsert(
			true,
		),
	)
	if err != nil {
		return false, err
	}

	return result.UpsertedCount == 1, nil
}

func (service *Service) deleteFollow(
	ctx context.Context,
	viewerID bson.ObjectID,
	targetID bson.ObjectID,
) (bool, error) {
	result, err := service.followsCollection.DeleteOne(
		ctx,
		bson.M{
			"follower_id":  viewerID,
			"following_id": targetID,
		},
	)
	if err != nil {
		return false, err
	}

	return result.DeletedCount == 1, nil
}

func (service *Service) incrementFollowCounts(
	ctx context.Context,
	viewerID bson.ObjectID,
	targetID bson.ObjectID,
	delta int64,
) error {
	updatedAt := time.Now().UTC()

	targetUpdateResult, err :=
		service.usersCollection.UpdateOne(
			ctx,
			bson.M{
				"_id": targetID,
			},
			buildSafeCountUpdate(
				"followers_count",
				delta,
				updatedAt,
			),
		)
	if err != nil {
		return err
	}

	if targetUpdateResult.MatchedCount != 1 {
		return ErrUserNotFound
	}

	viewerUpdateResult, err :=
		service.usersCollection.UpdateOne(
			ctx,
			bson.M{
				"_id": viewerID,
			},
			buildSafeCountUpdate(
				"following_count",
				delta,
				updatedAt,
			),
		)
	if err != nil {
		return err
	}

	if viewerUpdateResult.MatchedCount != 1 {
		return ErrUserNotFound
	}

	return nil
}

func buildSafeCountUpdate(
	field string,
	delta int64,
	updatedAt time.Time,
) mongo.Pipeline {
	currentValue := bson.D{
		{
			Key: "$ifNull",
			Value: bson.A{
				"$" + field,
				int64(0),
			},
		},
	}

	nextValue := bson.D{
		{
			Key: "$add",
			Value: bson.A{
				currentValue,
				delta,
			},
		},
	}

	return mongo.Pipeline{
		bson.D{
			{
				Key: "$set",
				Value: bson.D{
					{
						Key: field,
						Value: bson.D{
							{
								Key: "$max",
								Value: bson.A{
									int64(0),
									nextValue,
								},
							},
						},
					},
					{
						Key: "updated_at",

						Value: updatedAt,
					},
				},
			},
		},
	}
}

func (service *Service) ensureUserExists(
	ctx context.Context,
	userID bson.ObjectID,
) error {
	err := service.usersCollection.FindOne(
		ctx,
		bson.M{
			"_id": userID,
		},
		options.FindOne().SetProjection(
			bson.M{
				"_id": 1,
			},
		),
	).Err()

	if errors.Is(
		err,
		mongo.ErrNoDocuments,
	) {
		return ErrUserNotFound
	}

	return err
}

func (service *Service) getFollowersCount(
	ctx context.Context,
	userID bson.ObjectID,
) (int64, error) {
	var document struct {
		FollowersCount int64 `bson:"followers_count,omitempty"`
	}

	err := service.usersCollection.FindOne(
		ctx,
		bson.M{
			"_id": userID,
		},
		options.FindOne().SetProjection(
			bson.M{
				"followers_count": 1,
			},
		),
	).Decode(
		&document,
	)
	if err != nil {
		if errors.Is(
			err,
			mongo.ErrNoDocuments,
		) {
			return 0, ErrUserNotFound
		}

		return 0, err
	}

	if document.FollowersCount < 0 {
		return 0, nil
	}

	return document.FollowersCount, nil
}

func parseUserID(
	value string,
) (bson.ObjectID, error) {
	cleanUserID := strings.TrimSpace(
		value,
	)

	objectID, err := bson.ObjectIDFromHex(
		cleanUserID,
	)
	if err != nil {
		return bson.NilObjectID, ErrInvalidUserID
	}

	return objectID, nil
}