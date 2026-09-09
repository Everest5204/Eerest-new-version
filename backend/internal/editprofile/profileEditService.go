package editprofile

import (
	"context"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

const profileEditDatabaseTimeout =
	5 * time.Second

type ProfileEditService struct {
	usersCollection *mongo.Collection
}

func NewProfileEditService(
	database *mongo.Database,
) *ProfileEditService {
	return &ProfileEditService{
		usersCollection: database.Collection(
			"users",
		),
	}
}

// GetEditableProfile loads only the fields required
// by the Edit Profile page.
func (
	service *ProfileEditService,
) GetEditableProfile(
	ctx context.Context,
	authUserID string,
) (*ProfileEditResponse, error) {
	userObjectID, err :=
		parseProfileEditUserID(
			authUserID,
		)
	if err != nil {
		return nil, err
	}

	databaseCtx, cancel :=
		context.WithTimeout(
			ctx,
			profileEditDatabaseTimeout,
		)
	defer cancel()

	var document profileDocument

	err = service.usersCollection.FindOne(
		databaseCtx,
		bson.M{
			"_id": userObjectID,
		},
		options.FindOne().SetProjection(
			profileEditProjection(),
		),
	).Decode(&document)

	if err != nil {
		if err == mongo.ErrNoDocuments {
			return nil,
				ErrProfileNotFound
		}

		return nil, fmt.Errorf(
			"load editable profile: %w",
			err,
		)
	}

	return createProfileEditResponse(
		document,
	), nil
}

// UpdateProfile updates the bio with one atomic
// MongoDB operation and returns the updated profile.
func (
	service *ProfileEditService,
) UpdateProfile(
	ctx context.Context,
	input ProfileEditInput,
) (*ProfileEditResponse, error) {
	userObjectID, err :=
		parseProfileEditUserID(
			input.AuthUserID,
		)
	if err != nil {
		return nil, err
	}

	bio, err :=
		normalizeProfileBio(
			input.Bio,
		)
	if err != nil {
		return nil, err
	}

	databaseCtx, cancel :=
		context.WithTimeout(
			ctx,
			profileEditDatabaseTimeout,
		)
	defer cancel()

	var document profileDocument

	err = service.usersCollection.
		FindOneAndUpdate(
			databaseCtx,
			bson.M{
				"_id": userObjectID,
			},
			bson.M{
				"$set": bson.M{
					"bio": bio,

					"updated_at":
						time.Now().UTC(),
				},
			},
			options.FindOneAndUpdate().
				SetReturnDocument(
					options.After,
				).
				SetProjection(
					profileEditProjection(),
				),
		).
		Decode(&document)

	if err != nil {
		if err == mongo.ErrNoDocuments {
			return nil,
				ErrProfileNotFound
		}

		return nil, fmt.Errorf(
			"%w: %v",
			ErrProfileUpdateFailed,
			err,
		)
	}

	return createProfileEditResponse(
		document,
	), nil
}

func parseProfileEditUserID(
	userID string,
) (bson.ObjectID, error) {
	cleanUserID :=
		strings.TrimSpace(userID)

	if cleanUserID == "" {
		return bson.NilObjectID,
			fmt.Errorf(
				"%w: user id is required",
				ErrInvalidProfile,
			)
	}

	objectID, err :=
		bson.ObjectIDFromHex(
			cleanUserID,
		)
	if err != nil {
		return bson.NilObjectID,
			fmt.Errorf(
				"%w: invalid user id",
				ErrInvalidProfile,
			)
	}

	return objectID, nil
}

func normalizeProfileBio(
	value string,
) (string, error) {
	normalizedValue :=
		strings.ReplaceAll(
			value,
			"\r\n",
			"\n",
		)

	normalizedValue =
		strings.ReplaceAll(
			normalizedValue,
			"\r",
			"\n",
		)

	bio := strings.TrimSpace(
		normalizedValue,
	)

	if utf8.RuneCountInString(
		bio,
	) > maxProfileBioLength {
		return "", fmt.Errorf(
			"%w: bio cannot contain more than %d characters",
			ErrInvalidProfile,
			maxProfileBioLength,
		)
	}

	return bio, nil
}

func profileEditProjection() bson.M {
	return bson.M{
		"_id":               1,
		"first_name":        1,
		"last_name":         1,
		"bio":               1,
		"profile_image_url": 1,
		"cover_image_url":   1,
	}
}

func createProfileEditResponse(
	document profileDocument,
) *ProfileEditResponse {
	return &ProfileEditResponse{
		Profile: EditableProfile{
			ID: document.ID.Hex(),

			FirstName:
				document.FirstName,

			LastName:
				document.LastName,

			Bio:
				document.Bio,

			ProfileImageURL:
				document.ProfileImageURL,

			CoverImageURL:
				document.CoverImageURL,
		},
	}
}