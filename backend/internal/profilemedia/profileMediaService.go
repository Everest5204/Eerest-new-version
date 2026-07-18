package profilemedia

import (
	"context"
	"errors"
	"mime/multipart"
	"time"

	"everest-backend/internal/config"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

type ProfileMediaService struct {
	usersCollection *mongo.Collection
	postsCollection *mongo.Collection
	cloudinary      *CloudinaryService
}

func NewProfileMediaService(
	database *mongo.Database,
	cfg config.Config,
) (*ProfileMediaService, error) {
	cloudinaryService, err := NewCloudinaryService(cfg)
	if err != nil {
		return nil, err
	}

	return &ProfileMediaService{
		usersCollection: database.Collection("users"),
		postsCollection: database.Collection("posts"),
		cloudinary:      cloudinaryService,
	}, nil
}

func (service *ProfileMediaService) UploadProfileImage(
	userID string,
	file multipart.File,
) (*UpdatedUserResponse, error) {
	return service.handleUpload(
		userID,
		file,
		ProfileImageFolder,
		ProfileImageType,
		ProfilePhotoPostType,
		"updated profile picture",
	)
}

func (service *ProfileMediaService) UploadCoverImage(
	userID string,
	file multipart.File,
) (*UpdatedUserResponse, error) {
	return service.handleUpload(
		userID,
		file,
		CoverImageFolder,
		CoverImageType,
		CoverPhotoPostType,
		"updated cover photo",
	)
}

func (service *ProfileMediaService) handleUpload(
	userID string,
	file multipart.File,
	folder string,
	mediaType string,
	postType string,
	caption string,
) (*UpdatedUserResponse, error) {
	objectID, err := bson.ObjectIDFromHex(userID)
	if err != nil {
		return nil, errors.New("invalid user id")
	}

	now := time.Now()

	uploadResult, err := service.cloudinary.UploadImage(
		file,
		folder,
	)
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(
		context.Background(),
		20*time.Second,
	)
	defer cancel()

	updateData := bson.M{
		"updated_at": now,
	}

	if mediaType == ProfileImageType {
		updateData["profile_image_url"] = uploadResult.SecureURL
		updateData["profile_image_id"] = uploadResult.PublicID
	}

	if mediaType == CoverImageType {
		updateData["cover_image_url"] = uploadResult.SecureURL
		updateData["cover_image_id"] = uploadResult.PublicID
	}

	updateResult, err := service.usersCollection.UpdateOne(
		ctx,
		bson.M{"_id": objectID},
		bson.M{"$set": updateData},
	)
	if err != nil {
		return nil, err
	}

	if updateResult.MatchedCount == 0 {
		return nil, errors.New("user not found")
	}

	post := ProfileMediaPost{
		ID:            bson.NewObjectID(),
		UserID:        objectID,
		Type:          postType,
		Caption:       caption,
		MediaURL:      uploadResult.SecureURL,
		MediaID:       uploadResult.PublicID,
		MediaType:     "image",
		LikesCount:    0,
		CommentsCount: 0,
		CreatedAt:     now,
		UpdatedAt:     now,
	}

	_, err = service.postsCollection.InsertOne(
		ctx,
		post,
	)
	if err != nil {
		return nil, err
	}

	return &UpdatedUserResponse{
		ID: objectID.Hex(),

		ProfileImageURL: getStringValue(
			updateData,
			"profile_image_url",
		),
		ProfileImageID: getStringValue(
			updateData,
			"profile_image_id",
		),

		CoverImageURL: getStringValue(
			updateData,
			"cover_image_url",
		),
		CoverImageID: getStringValue(
			updateData,
			"cover_image_id",
		),
	}, nil
}

func getStringValue(
	data bson.M,
	key string,
) string {
	value, ok := data[key].(string)
	if !ok {
		return ""
	}

	return value
}