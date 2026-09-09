package changename

import (
	"context"
	"errors"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

const nameOperationTimeout = 5 * time.Second

var (
	ErrInvalidUserID = errors.New("invalid user id")

	ErrUserNotFound = errors.New(
		"user not found",
	)

	ErrNameRequired = errors.New(
		"first name and last name are required",
	)

	ErrNameTooLong = errors.New(
		"first name and last name together cannot exceed 30 characters",
	)

	ErrNameUnchanged = errors.New(
		"please change your first name or last name",
	)

	ErrNameChangeLocked = errors.New(
		"name cannot be changed yet",
	)
)

type Service struct {
	collection *mongo.Collection
}

type nameDocument struct {
	FirstName     string     `bson:"first_name"`
	LastName      string     `bson:"last_name"`
	NameChangedAt *time.Time `bson:"name_changed_at,omitempty"`
}

func NewService(
	database *mongo.Database,
) *Service {
	return &Service{
		collection: database.Collection("users"),
	}
}

func normalizeName(
	value string,
) string {
	return strings.Join(
		strings.Fields(value),
		" ",
	)
}

func validateName(
	firstName string,
	lastName string,
) error {
	if firstName == "" || lastName == "" {
		return ErrNameRequired
	}

	combinedName := strings.Join(
		strings.Fields(
			firstName + lastName,
		),
		"",
	)

	if len([]rune(combinedName)) > 30 {
		return ErrNameTooLong
	}

	return nil
}

func buildNameStatus(
	document nameDocument,
	now time.Time,
) NameStatus {
	status := NameStatus{
		FirstName:     document.FirstName,
		LastName:      document.LastName,
		CanChange:     true,
		LastChangedAt: document.NameChangedAt,
	}

	if document.NameChangedAt == nil {
		return status
	}

	nextChangeAt := document.
		NameChangedAt.
		Add(NameChangeCooldown)

	status.NextChangeAt = &nextChangeAt
	status.CanChange = !now.Before(nextChangeAt)

	return status
}

func (service *Service) getNameDocument(
	ctx context.Context,
	userID bson.ObjectID,
) (*nameDocument, error) {
	requestContext, cancel :=
		context.WithTimeout(
			ctx,
			nameOperationTimeout,
		)

	defer cancel()

	var document nameDocument

	err := service.collection.FindOne(
		requestContext,
		bson.M{
			"_id": userID,
		},
		options.FindOne().SetProjection(
			bson.M{
				"first_name":      1,
				"last_name":       1,
				"name_changed_at": 1,
			},
		),
	).Decode(&document)

	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, ErrUserNotFound
	}

	if err != nil {
		return nil, err
	}

	return &document, nil
}

func (service *Service) GetNameStatus(
	ctx context.Context,
	userID string,
) (*NameStatus, error) {
	objectID, err :=
		bson.ObjectIDFromHex(userID)

	if err != nil {
		return nil, ErrInvalidUserID
	}

	document, err :=
		service.getNameDocument(
			ctx,
			objectID,
		)

	if err != nil {
		return nil, err
	}

	now := time.Now().UTC()

	status := buildNameStatus(
		*document,
		now,
	)

	return &status, nil
}

func (service *Service) ChangeName(
	ctx context.Context,
	userID string,
	request ChangeNameRequest,
) (*NameStatus, error) {
	objectID, err :=
		bson.ObjectIDFromHex(userID)

	if err != nil {
		return nil, ErrInvalidUserID
	}

	firstName := normalizeName(
		request.FirstName,
	)

	lastName := normalizeName(
		request.LastName,
	)

	if err := validateName(
		firstName,
		lastName,
	); err != nil {
		return nil, err
	}

	currentDocument, err :=
		service.getNameDocument(
			ctx,
			objectID,
		)

	if err != nil {
		return nil, err
	}

	if currentDocument.FirstName == firstName &&
		currentDocument.LastName == lastName {
		return nil, ErrNameUnchanged
	}

	now := time.Now().UTC()
	cooldownLimit :=
		now.Add(-NameChangeCooldown)

	requestContext, cancel :=
		context.WithTimeout(
			ctx,
			nameOperationTimeout,
		)

	defer cancel()

	filter := bson.M{
		"_id": objectID,
		"$and": bson.A{
			bson.M{
				"$or": bson.A{
					bson.M{
						"name_changed_at": bson.M{
							"$exists": false,
						},
					},
					bson.M{
						"name_changed_at": nil,
					},
					bson.M{
						"name_changed_at": bson.M{
							"$lte": cooldownLimit,
						},
					},
				},
			},
			bson.M{
				"$or": bson.A{
					bson.M{
						"first_name": bson.M{
							"$ne": firstName,
						},
					},
					bson.M{
						"last_name": bson.M{
							"$ne": lastName,
						},
					},
				},
			},
		},
	}

	update := bson.M{
		"$set": bson.M{
			"first_name":      firstName,
			"last_name":       lastName,
			"name_changed_at": now,
			"updated_at":      now,
		},
	}

	var updatedDocument nameDocument

	err = service.collection.FindOneAndUpdate(
		requestContext,
		filter,
		update,
		options.FindOneAndUpdate().
			SetReturnDocument(options.After).
			SetProjection(
				bson.M{
					"first_name":      1,
					"last_name":       1,
					"name_changed_at": 1,
				},
			),
	).Decode(&updatedDocument)

	if err == nil {
		status := buildNameStatus(
			updatedDocument,
			now,
		)

		return &status, nil
	}

	if !errors.Is(err, mongo.ErrNoDocuments) {
		return nil, err
	}

	latestDocument, latestError :=
		service.getNameDocument(
			ctx,
			objectID,
		)

	if latestError != nil {
		return nil, latestError
	}

	if latestDocument.FirstName == firstName &&
		latestDocument.LastName == lastName {
		return nil, ErrNameUnchanged
	}

	latestStatus := buildNameStatus(
		*latestDocument,
		now,
	)

	if !latestStatus.CanChange {
		return &latestStatus, ErrNameChangeLocked
	}

	return nil, errors.New(
		"unable to update name",
	)
}