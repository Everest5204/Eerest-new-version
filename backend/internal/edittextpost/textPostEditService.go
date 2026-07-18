package edittextpost

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"everest-backend/internal/textpost"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

const (
	textPostEditDatabaseTimeout =
		8 * time.Second

	maxEditBackgroundValueLength =
		4096

	maxEditTextColorLength = 64

	defaultEditTextColor = "#111827"

	defaultEditDesignedTextColor =
		"#ffffff"

	defaultEditBackgroundColor =
		"#ffffff"
)

type TextPostEditService struct {
	postsCollection *mongo.Collection
	usersCollection *mongo.Collection
}

func NewTextPostEditService(
	db *mongo.Database,
) (*TextPostEditService, error) {
	if db == nil {
		return nil, errors.New(
			"database is required",
		)
	}

	return &TextPostEditService{
		postsCollection:
			db.Collection("posts"),

		usersCollection:
			db.Collection("users"),
	}, nil
}

// GetEditableTextPost returns only an active
// text post owned by the authenticated user.
func (
	service *TextPostEditService,
) GetEditableTextPost(
	ctx context.Context,
	authUserID string,
	postID string,
) (*TextPostEditResponse, error) {
	userObjectID, postObjectID, err :=
		parseTextPostEditIDs(
			authUserID,
			postID,
		)
	if err != nil {
		return nil, err
	}

	dbCtx, cancel :=
		context.WithTimeout(
			ctx,
			textPostEditDatabaseTimeout,
		)
	defer cancel()

	postDocument, err :=
		service.getOwnedTextPost(
			dbCtx,
			userObjectID,
			postObjectID,
		)
	if err != nil {
		return nil, err
	}

	postUser, err :=
		service.getTextPostUser(
			dbCtx,
			userObjectID,
		)
	if err != nil {
		return nil,
			textPostEditUpdateError(
				err,
			)
	}

	return &TextPostEditResponse{
		Post: buildEditedTextFeedPost(
			*postDocument,
			postUser,
		),
	}, nil
}

// EditTextPost replaces the previous text design
// using one atomic MongoDB operation.
func (
	service *TextPostEditService,
) EditTextPost(
	ctx context.Context,
	input EditTextPostInput,
) (*TextPostEditResponse, error) {
	userObjectID, postObjectID, err :=
		parseTextPostEditIDs(
			input.AuthUserID,
			input.PostID,
		)
	if err != nil {
		return nil, err
	}

	text := strings.TrimSpace(
		input.Text,
	)

	if text == "" {
		return nil,
			invalidTextPostError(
				"text post cannot be empty",
			)
	}

	if utf8.RuneCountInString(text) >
		maxEditTextLength {
		return nil,
			invalidTextPostError(
				fmt.Sprintf(
					"text cannot contain more than %d characters",
					maxEditTextLength,
				),
			)
	}

	if input.ExpectedUpdatedAt.IsZero() {
		return nil,
			invalidTextPostError(
				"post version is required",
			)
	}

	background, err :=
		normalizeEditTextBackground(
			input.TextBackground,
		)
	if err != nil {
		return nil, err
	}

	textColor, err :=
		normalizeEditTextColor(
			input.TextColor,
			background.Kind,
		)
	if err != nil {
		return nil, err
	}

	textStyle :=
		normalizeEditTextStyle(
			input.TextStyle,
		)

	readCtx, cancelRead :=
		context.WithTimeout(
			ctx,
			textPostEditDatabaseTimeout,
		)

	currentPost, err :=
		service.getOwnedTextPost(
			readCtx,
			userObjectID,
			postObjectID,
		)
	if err != nil {
		cancelRead()
		return nil, err
	}

	if !currentPost.UpdatedAt.Equal(
		input.ExpectedUpdatedAt,
	) {
		cancelRead()
		return nil,
			ErrTextPostConflict
	}

	postUser, err :=
		service.getTextPostUser(
			readCtx,
			userObjectID,
		)

	cancelRead()

	if err != nil {
		return nil,
			textPostEditUpdateError(
				err,
			)
	}

	now := time.Now().UTC()

	// _id is already indexed by MongoDB,
	// so owner lookup and update remain fast.
	filter := bson.M{
		"_id":     postObjectID,
		"user_id": userObjectID,
		"type":    textpost.PostTypeText,

		"is_deleted": bson.M{
			"$ne": true,
		},

		// Prevents an older browser tab
		// from overwriting a newer edit.
		"updated_at":
			currentPost.UpdatedAt,
	}

	// $set completely replaces the previous
	// text/background/style fields while keeping
	// reactions, comments and created_at intact.
	update := bson.M{
		"$set": bson.M{
			"type":
				textpost.PostTypeText,

			"text":    text,
			"caption": text,

			"text_background":
				background,

			"text_color":
				textColor,

			"text_style":
				textStyle,

			"updated_at": now,
		},
	}

	writeCtx, cancelWrite :=
		context.WithTimeout(
			ctx,
			textPostEditDatabaseTimeout,
		)
	defer cancelWrite()

	var updatedPost textpost.TextPost

	err = service.postsCollection.
		FindOneAndUpdate(
			writeCtx,
			filter,
			update,
			options.
				FindOneAndUpdate().
				SetReturnDocument(
					options.After,
				),
		).
		Decode(&updatedPost)

	if errors.Is(
		err,
		mongo.ErrNoDocuments,
	) {
		return nil,
			ErrTextPostConflict
	}

	if err != nil {
		return nil,
			textPostEditUpdateError(
				err,
			)
	}

	return &TextPostEditResponse{
		Post: buildEditedTextFeedPost(
			updatedPost,
			postUser,
		),
	}, nil
}

func (
	service *TextPostEditService,
) getOwnedTextPost(
	ctx context.Context,
	userID bson.ObjectID,
	postID bson.ObjectID,
) (*textpost.TextPost, error) {
	var postDocument textpost.TextPost

	err := service.postsCollection.
		FindOne(
			ctx,
			bson.M{
				"_id":     postID,
				"user_id": userID,

				"type":
					textpost.PostTypeText,

				"is_deleted": bson.M{
					"$ne": true,
				},
			},
		).
		Decode(&postDocument)

	if errors.Is(
		err,
		mongo.ErrNoDocuments,
	) {
		return nil,
			ErrTextPostNotFound
	}

	if err != nil {
		return nil,
			textPostEditUpdateError(
				err,
			)
	}

	return &postDocument, nil
}

func (
	service *TextPostEditService,
) getTextPostUser(
	ctx context.Context,
	userID bson.ObjectID,
) (
	textpost.TextPostUser,
	error,
) {
	var postUser textpost.TextPostUser

	err := service.usersCollection.
		FindOne(
			ctx,
			bson.M{
				"_id": userID,
			},
			options.FindOne().
				SetProjection(
					bson.M{
						"first_name": 1,
						"last_name":  1,

						"profile_image_url": 1,
					},
				),
		).
		Decode(&postUser)

	return postUser, err
}

func parseTextPostEditIDs(
	authUserID string,
	postID string,
) (
	bson.ObjectID,
	bson.ObjectID,
	error,
) {
	userObjectID, err :=
		bson.ObjectIDFromHex(
			strings.TrimSpace(
				authUserID,
			),
		)
	if err != nil {
		return bson.NilObjectID,
			bson.NilObjectID,
			errors.New(
				"invalid authenticated user id",
			)
	}

	postObjectID, err :=
		bson.ObjectIDFromHex(
			strings.TrimSpace(
				postID,
			),
		)
	if err != nil {
		return bson.NilObjectID,
			bson.NilObjectID,
			errors.New(
				"invalid text post id",
			)
	}

	return userObjectID,
		postObjectID,
		nil
}

func normalizeEditTextBackground(
	background textpost.TextBackground,
) (
	textpost.TextBackground,
	error,
) {
	kind := strings.TrimSpace(
		background.Kind,
	)

	value := strings.TrimSpace(
		background.Value,
	)

	switch kind {
	case textpost.TextBackgroundPlain:
		// Selecting no background clears
		// every previous design value.
		return textpost.TextBackground{
			Kind:
				textpost.TextBackgroundPlain,

			Value:
				defaultEditBackgroundColor,
		}, nil

	case textpost.TextBackgroundSolid,
		textpost.TextBackgroundGradient,
		textpost.TextBackgroundImage:
		if value == "" {
			return textpost.TextBackground{
				Kind:
					textpost.TextBackgroundPlain,

				Value:
					defaultEditBackgroundColor,
			}, nil
		}

	default:
		return nilTextBackground(),
			invalidTextPostError(
				"invalid text background",
			)
	}

	if utf8.RuneCountInString(value) >
		maxEditBackgroundValueLength {
		return nilTextBackground(),
			invalidTextPostError(
				"background value is too long",
			)
	}

	return textpost.TextBackground{
		Kind:  kind,
		Value: value,
	}, nil
}

func normalizeEditTextColor(
	color string,
	backgroundKind string,
) (string, error) {
	cleanColor := strings.TrimSpace(
		color,
	)

	if cleanColor == "" {
		if backgroundKind ==
			textpost.TextBackgroundPlain {
			return defaultEditTextColor,
				nil
		}

		return defaultEditDesignedTextColor,
			nil
	}

	if utf8.RuneCountInString(
		cleanColor,
	) > maxEditTextColorLength {
		return "",
			invalidTextPostError(
				"text color is too long",
			)
	}

	return cleanColor, nil
}

func normalizeEditTextStyle(
	style string,
) string {
	switch strings.TrimSpace(
		style,
	) {
	case textpost.TextStyleNormalCenter:
		return textpost.TextStyleNormalCenter

	case textpost.TextStyleBoldLeft:
		return textpost.TextStyleBoldLeft

	case textpost.TextStyleNormalLeft:
		return textpost.TextStyleNormalLeft

	default:
		return textpost.TextStyleBoldCenter
	}
}

func nilTextBackground() (
	textpost.TextBackground,
) {
	return textpost.TextBackground{}
}

func buildEditedTextFeedPost(
	postDocument textpost.TextPost,
	postUser textpost.TextPostUser,
) textpost.TextFeedPost {
	return textpost.TextFeedPost{
		ID: postDocument.ID,

		UserID:
			postDocument.UserID,

		User: postUser,

		Type:
			postDocument.Type,

		Caption:
			postDocument.Caption,

		Text:
			postDocument.Text,

		TextBackground:
			postDocument.TextBackground,

		TextColor:
			postDocument.TextColor,

		TextStyle:
			postDocument.TextStyle,

		LikesCount:
			postDocument.LikesCount,

		CommentsCount:
			postDocument.CommentsCount,

		SharesCount:
			postDocument.SharesCount,

		IsDeleted:
			postDocument.IsDeleted,

		CreatedAt:
			postDocument.CreatedAt,

		UpdatedAt:
			postDocument.UpdatedAt,
	}
}

func invalidTextPostError(
	message string,
) error {
	return fmt.Errorf(
		"%w: %s",
		ErrInvalidTextPost,
		message,
	)
}

func textPostEditUpdateError(
	err error,
) error {
	if err == nil {
		return ErrTextPostUpdateFailed
	}

	return fmt.Errorf(
		"%w: %v",
		ErrTextPostUpdateFailed,
		err,
	)
}