package verifiedbadge

import (
	"context"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

const badgeResolveTimeout = 3 * time.Second

type Service struct {
	collection *mongo.Collection
}

func NewService(
	database *mongo.Database,
) *Service {
	return &Service{
		collection: database.Collection(
			verifiedBadgeCollection,
		),
	}
}

// CreateIndexes keeps badge resolution fast and prevents
// duplicate badge records for the same user and badge type.
func (service *Service) CreateIndexes(
	ctx context.Context,
) error {
	indexes := []mongo.IndexModel{
		{
			Keys: bson.D{
				{Key: "user_id", Value: 1},
				{Key: "badge_type", Value: 1},
			},
			Options: options.Index().
				SetUnique(true).
				SetName(
					"unique_verified_badge_user_type",
				),
		},
		{
			Keys: bson.D{
				{Key: "badge_type", Value: 1},
				{Key: "is_active", Value: 1},
				{Key: "user_id", Value: 1},
			},
			Options: options.Index().
				SetName(
					"active_verified_badge_resolve",
				),
		},
	}

	_, err := service.collection.
		Indexes().
		CreateMany(
			ctx,
			indexes,
		)

	return err
}

// ResolveBadges loads all active verified badges
// for the requested users in one indexed MongoDB query.
func (service *Service) ResolveBadges(
	ctx context.Context,
	userIDs []string,
) ([]ResolvedBadge, error) {
	objectIDs, err := normalizeUserIDs(
		userIDs,
	)
	if err != nil {
		return nil, err
	}

	databaseContext, cancel :=
		context.WithTimeout(
			ctx,
			badgeResolveTimeout,
		)
	defer cancel()

	cursor, err := service.collection.Find(
		databaseContext,
		bson.M{
			"user_id": bson.M{
				"$in": objectIDs,
			},
			"badge_type": badgeTypeVerified,
			"is_active":  true,
		},
		options.Find().
			SetProjection(
				bson.M{
					"_id":        0,
					"user_id":    1,
					"badge_type": 1,
				},
			).
			SetSort(
				bson.D{
					{Key: "user_id", Value: 1},
				},
			),
	)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(
		databaseContext,
	)

	documents := make(
		[]badgeDocument,
		0,
		len(objectIDs),
	)

	if err = cursor.All(
		databaseContext,
		&documents,
	); err != nil {
		return nil, err
	}

	badges := make(
		[]ResolvedBadge,
		0,
		len(documents),
	)

	for _, document := range documents {
		if document.UserID == bson.NilObjectID {
			continue
		}

		badges = append(
			badges,
			ResolvedBadge{
				UserID: document.UserID.Hex(),

				BadgeType:
					document.BadgeType,
			},
		)
	}

	return badges, nil
}

// normalizeUserIDs validates, cleans and removes duplicate IDs
// before the database query is executed.
func normalizeUserIDs(
	values []string,
) ([]bson.ObjectID, error) {
	if len(values) == 0 {
		return nil, ErrUserIDsRequired
	}

	if len(values) > maxResolveUserIDs {
		return nil, ErrTooManyUserIDs
	}

	uniqueIDs := make(
		map[bson.ObjectID]struct{},
		len(values),
	)

	objectIDs := make(
		[]bson.ObjectID,
		0,
		len(values),
	)

	for _, value := range values {
		cleanUserID := strings.TrimSpace(
			value,
		)

		if cleanUserID == "" {
			return nil, ErrInvalidUserID
		}

		objectID, err :=
			bson.ObjectIDFromHex(
				cleanUserID,
			)
		if err != nil ||
			objectID == bson.NilObjectID {
			return nil, ErrInvalidUserID
		}

		if _, exists :=
			uniqueIDs[objectID]; exists {
			continue
		}

		uniqueIDs[objectID] =
			struct{}{}

		objectIDs = append(
			objectIDs,
			objectID,
		)
	}

	if len(objectIDs) == 0 {
		return nil, ErrUserIDsRequired
	}

	return objectIDs, nil
}