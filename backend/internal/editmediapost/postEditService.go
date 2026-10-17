package editmediapost

import (
	"context"
	"errors"
	"fmt"
	"log"
	"mime/multipart"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"everest-backend/internal/config"
	"everest-backend/internal/post"
	"everest-backend/internal/postdelete"
	"everest-backend/internal/profilemedia"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

const (
	editDatabaseTimeout = 10 * time.Second

	editMediaUploadWorkers = 3

	editCleanupTimeout     = 45 * time.Second
	editCleanupMaxAttempts = 3
)

type PostEditService struct {
	postsCollection *mongo.Collection
	usersCollection *mongo.Collection

	cloudinaryUpload *profilemedia.CloudinaryService
	cloudinaryDelete *postdelete.CloudinaryDeleteService
}

func NewPostEditService(
	db *mongo.Database,
	cfg config.Config,
) (*PostEditService, error) {
	if db == nil {
		return nil, errors.New("database is required")
	}

	uploadService, err :=
		profilemedia.NewCloudinaryService(cfg)
	if err != nil {
		return nil, err
	}

	deleteService, err :=
		postdelete.NewCloudinaryDeleteService(cfg)
	if err != nil {
		return nil, err
	}

	return &PostEditService{
		postsCollection: db.Collection("posts"),
		usersCollection: db.Collection("users"),

		cloudinaryUpload: uploadService,
		cloudinaryDelete: deleteService,
	}, nil
}

// GetEditablePost loads only a media post owned by the authenticated user.
func (service *PostEditService) GetEditablePost(
	ctx context.Context,
	authUserID string,
	postID string,
) (*GetEditablePostResponse, error) {
	userObjectID, postObjectID, err :=
		parseEditPostIDs(authUserID, postID)
	if err != nil {
		return nil, err
	}

	dbCtx, cancel := context.WithTimeout(
		ctx,
		editDatabaseTimeout,
	)
	defer cancel()

	postDocument, err := service.getOwnedMediaPost(
		dbCtx,
		userObjectID,
		postObjectID,
	)
	if err != nil {
		return nil, err
	}

	postUser, err := service.getPostUser(
		dbCtx,
		userObjectID,
	)
	if err != nil {
		return nil, editUpdateError(err)
	}

	return &GetEditablePostResponse{
		Post: buildEditedFeedPost(
			*postDocument,
			postUser,
		),
	}, nil
}

// EditMediaPost performs one atomic MongoDB update.
// Old Cloudinary media is deleted only after the database update succeeds.
func (service *PostEditService) EditMediaPost(
	ctx context.Context,
	input EditMediaPostInput,
) (*EditMediaPostResponse, error) {
	userObjectID, postObjectID, err :=
		parseEditPostIDs(
			input.AuthUserID,
			input.PostID,
		)
	if err != nil {
		return nil, err
	}

	caption := strings.TrimSpace(input.Caption)

	if utf8.RuneCountInString(caption) >
		maxEditCaptionLength {
		return nil, fmt.Errorf(
			"caption cannot contain more than %d characters",
			maxEditCaptionLength,
		)
	}

	if input.ExpectedUpdatedAt.IsZero() {
		return nil, errors.New(
			"post version is required",
		)
	}

	readCtx, cancelRead := context.WithTimeout(
		ctx,
		editDatabaseTimeout,
	)

	currentPost, err := service.getOwnedMediaPost(
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
		return nil, ErrMediaPostConflict
	}

	postUser, err := service.getPostUser(
		readCtx,
		userObjectID,
	)
	cancelRead()

	if err != nil {
		return nil, editUpdateError(err)
	}

	storedMedia := getStoredPostMedia(*currentPost)

	retainedMedia, removedMedia :=
		splitEditPostMedia(
			storedMedia,
			input.KeepMediaKeys,
		)

	newMediaType, err :=
		validateEditedMedia(
			retainedMedia,
			input.NewFiles,
		)
	if err != nil {
		return nil, err
	}

	uploadedMedia, err :=
		service.uploadNewMedia(
			input.AuthUserID,
			newMediaType,
			input.NewFiles,
		)
	if err != nil {
		return nil, err
	}

	finalMedia := make(
		[]post.MediaItem,
		0,
		len(retainedMedia)+len(uploadedMedia),
	)

	finalMedia = append(
		finalMedia,
		retainedMedia...,
	)

	finalMedia = append(
		finalMedia,
		uploadedMedia...,
	)

	if len(finalMedia) == 0 {
		service.cleanupMediaAsync(
			uploadedMedia,
			"empty edit rollback",
		)

		return nil, invalidMediaError(
			"a media post must contain an image or video",
		)
	}

	for index := range finalMedia {
		finalMedia[index].Order = index
	}

	postType := post.PostTypeImage

	if finalMedia[0].Type == post.MediaTypeVideo {
		postType = post.PostTypeVideo
	}

	now := time.Now().UTC()

	// Using the original updated_at value makes the write atomic.
	// A second tab cannot silently overwrite a newer edit.
	filter := bson.M{
		"_id":     postObjectID,
		"user_id": userObjectID,

		"type": bson.M{
			"$in": bson.A{
				post.PostTypeImage,
				post.PostTypeVideo,
			},
		},

		"is_deleted": bson.M{
			"$ne": true,
		},

		"updated_at": currentPost.UpdatedAt,
	}

	update := bson.M{
		"$set": bson.M{
			"type":    postType,
			"caption": caption,
			"media":   finalMedia,

			// Legacy fields remain synchronized with
			// the first item in the media array.
			"media_url":  finalMedia[0].URL,
			"media_id":   finalMedia[0].ID,
			"media_type": finalMedia[0].Type,

			"updated_at": now,
		},
	}

	writeCtx, cancelWrite := context.WithTimeout(
		ctx,
		editDatabaseTimeout,
	)
	defer cancelWrite()

	var updatedPost post.Post

	err = service.postsCollection.FindOneAndUpdate(
		writeCtx,
		filter,
		update,
		options.FindOneAndUpdate().
			SetReturnDocument(options.After),
	).Decode(&updatedPost)

	if err != nil {
		// Newly uploaded files are no longer needed if
		// MongoDB could not save the edit.
		service.cleanupMediaAsync(
			uploadedMedia,
			"database edit rollback",
		)

		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, ErrMediaPostConflict
		}

		return nil, editUpdateError(err)
	}

	// MongoDB now contains only the final media list.
	// Old Cloudinary media is removed in the background,
	// so cleanup does not delay the API response.
	service.cleanupMediaAsync(
		removedMedia,
		"replaced media cleanup",
	)

	return &EditMediaPostResponse{
		Post: buildEditedFeedPost(
			updatedPost,
			postUser,
		),
	}, nil
}

func (service *PostEditService) getOwnedMediaPost(
	ctx context.Context,
	userID bson.ObjectID,
	postID bson.ObjectID,
) (*post.Post, error) {
	var postDocument post.Post

	err := service.postsCollection.FindOne(
		ctx,
		bson.M{
			"_id":     postID,
			"user_id": userID,

			"type": bson.M{
				"$in": bson.A{
					post.PostTypeImage,
					post.PostTypeVideo,
				},
			},

			"is_deleted": bson.M{
				"$ne": true,
			},
		},
	).Decode(&postDocument)

	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, ErrMediaPostNotFound
	}

	if err != nil {
		return nil, editUpdateError(err)
	}

	return &postDocument, nil
}

func (service *PostEditService) getPostUser(
	ctx context.Context,
	userID bson.ObjectID,
) (post.PostUser, error) {
	var user post.PostUser

	err := service.usersCollection.FindOne(
		ctx,
		bson.M{
			"_id": userID,
		},
		options.FindOne().SetProjection(
			bson.M{
				"first_name":        1,
				"last_name":         1,
				"profile_image_url": 1,
			},
		),
	).Decode(&user)

	return user, err
}

func parseEditPostIDs(
	authUserID string,
	postID string,
) (bson.ObjectID, bson.ObjectID, error) {
	userObjectID, err := bson.ObjectIDFromHex(
		strings.TrimSpace(authUserID),
	)
	if err != nil {
		return bson.NilObjectID,
			bson.NilObjectID,
			errors.New("invalid authenticated user id")
	}

	postObjectID, err := bson.ObjectIDFromHex(
		strings.TrimSpace(postID),
	)
	if err != nil {
		return bson.NilObjectID,
			bson.NilObjectID,
			errors.New("invalid post id")
	}

	return userObjectID, postObjectID, nil
}

func getStoredPostMedia(
	postDocument post.Post,
) []post.MediaItem {
	if len(postDocument.Media) > 0 {
		media := append(
			[]post.MediaItem(nil),
			postDocument.Media...,
		)

		sort.SliceStable(
			media,
			func(first int, second int) bool {
				return media[first].Order <
					media[second].Order
			},
		)

		for index := range media {
			media[index].Order = index
			media[index].Type =
				normalizeEditMediaType(
					media[index].Type,
				)
		}

		return media
	}

	if strings.TrimSpace(
		postDocument.MediaURL,
	) == "" {
		return nil
	}

	return []post.MediaItem{
		{
			URL: strings.TrimSpace(
				postDocument.MediaURL,
			),
			ID: strings.TrimSpace(
				postDocument.MediaID,
			),
			Type: normalizeEditMediaType(
				postDocument.MediaType,
			),
			Order: 0,
		},
	}
}

func splitEditPostMedia(
	storedMedia []post.MediaItem,
	keepMediaKeys []string,
) ([]post.MediaItem, []post.MediaItem) {
	keepSet := make(
		map[string]struct{},
		len(keepMediaKeys),
	)

	for _, mediaKey := range keepMediaKeys {
		cleanKey := strings.TrimSpace(mediaKey)

		if cleanKey != "" {
			keepSet[cleanKey] = struct{}{}
		}
	}

	retainedMedia := make(
		[]post.MediaItem,
		0,
		len(storedMedia),
	)

	removedMedia := make(
		[]post.MediaItem,
		0,
		len(storedMedia),
	)

	for _, mediaItem := range storedMedia {
		mediaKey := getEditMediaKey(mediaItem)

		if _, exists := keepSet[mediaKey]; exists {
			retainedMedia = append(
				retainedMedia,
				mediaItem,
			)
			continue
		}

		removedMedia = append(
			removedMedia,
			mediaItem,
		)
	}

	return retainedMedia, removedMedia
}

func validateEditedMedia(
	retainedMedia []post.MediaItem,
	newFiles []*multipart.FileHeader,
) (string, error) {
	selectedType := ""

	for _, mediaItem := range retainedMedia {
		itemType := normalizeEditMediaType(
			mediaItem.Type,
		)

		if selectedType == "" {
			selectedType = itemType
		}

		if selectedType != itemType {
			return "", invalidMediaError(
				"images and videos cannot be mixed",
			)
		}
	}

	newMediaType := ""

	for _, fileHeader := range newFiles {
		if fileHeader == nil ||
			fileHeader.Size <= 0 {
			return "", invalidMediaError(
				"media file is empty",
			)
		}

		mediaType, err :=
			detectEditMediaType(fileHeader)
		if err != nil {
			return "", err
		}

		if mediaType == post.MediaTypeImage &&
			fileHeader.Size > maxEditImageSize {
			return "", invalidMediaError(
				"each image must be 15 MB or smaller",
			)
		}

		if mediaType == post.MediaTypeVideo &&
			fileHeader.Size > maxEditVideoSize {
			return "", invalidMediaError(
				"video must be 200 MB or smaller",
			)
		}

		if newMediaType == "" {
			newMediaType = mediaType
		}

		if newMediaType != mediaType {
			return "", invalidMediaError(
				"images and videos cannot be mixed",
			)
		}
	}

	if selectedType != "" &&
		newMediaType != "" &&
		selectedType != newMediaType {
		return "", invalidMediaError(
			"remove the current media before changing its type",
		)
	}

	finalType := selectedType

	if finalType == "" {
		finalType = newMediaType
	}

	finalMediaCount :=
		len(retainedMedia) + len(newFiles)

	if finalMediaCount == 0 {
		return "", invalidMediaError(
			"a media post must contain an image or video",
		)
	}

	if finalType == post.MediaTypeVideo &&
		finalMediaCount > maxEditVideoCount {
		return "", invalidMediaError(
			"a video post can contain only one video",
		)
	}

	if finalType == post.MediaTypeImage &&
		finalMediaCount > maxEditImageCount {
		return "", invalidMediaError(
			"a post can contain up to 10 images",
		)
	}

	return newMediaType, nil
}

func detectEditMediaType(
	fileHeader *multipart.FileHeader,
) (string, error) {
	contentType := strings.ToLower(
		strings.TrimSpace(
			fileHeader.Header.Get("Content-Type"),
		),
	)

	if separatorIndex :=
		strings.Index(contentType, ";"); separatorIndex >= 0 {
		contentType = contentType[:separatorIndex]
	}

	switch contentType {
	case "image/jpeg",
		"image/jpg",
		"image/png",
		"image/webp",
		"image/gif":
		return post.MediaTypeImage, nil

	case "video/mp4",
		"video/quicktime",
		"video/webm",
		"video/x-matroska":
		return post.MediaTypeVideo, nil
	}

	extension := strings.ToLower(
		filepath.Ext(fileHeader.Filename),
	)

	switch extension {
	case ".jpg", ".jpeg", ".png", ".webp", ".gif":
		return post.MediaTypeImage, nil

	case ".mp4", ".mov", ".webm", ".mkv":
		return post.MediaTypeVideo, nil
	}

	return "", invalidMediaError(
		"only image or video files are allowed",
	)
}

// uploadNewMedia uploads up to three images concurrently.
// The result order remains the same as the user's selection order.
func (service *PostEditService) uploadNewMedia(
	authUserID string,
	mediaType string,
	files []*multipart.FileHeader,
) ([]post.MediaItem, error) {
	if len(files) == 0 {
		return nil, nil
	}

	folder := "everest/posts/" +
		strings.TrimSpace(authUserID)

	uploadedMedia := make(
		[]post.MediaItem,
		len(files),
	)

	jobs := make(chan int)
	workerCount := editMediaUploadWorkers

	if len(files) < workerCount {
		workerCount = len(files)
	}

	var waitGroup sync.WaitGroup
	var errorOnce sync.Once
	var firstUploadError error

	setUploadError := func(uploadError error) {
		if uploadError == nil {
			return
		}

		errorOnce.Do(func() {
			firstUploadError = uploadError
		})
	}

	for worker := 0; worker < workerCount; worker++ {
		waitGroup.Add(1)

		go func() {
			defer waitGroup.Done()

			for fileIndex := range jobs {
				fileHeader := files[fileIndex]

				file, openError :=
					fileHeader.Open()
				if openError != nil {
					setUploadError(openError)
					continue
				}

				uploadResult, uploadError :=
					service.cloudinaryUpload.UploadMedia(
						file,
						folder,
						mediaType,
						fileHeader.Filename,
					)

				closeError := file.Close()

				if uploadError != nil {
					setUploadError(uploadError)
					continue
				}

				uploadedMedia[fileIndex] =
					post.MediaItem{
						URL: strings.TrimSpace(
							uploadResult.SecureURL,
						),
						ID: strings.TrimSpace(
							uploadResult.PublicID,
						),
						Type:   mediaType,
						Order:  fileIndex,
						Width:  uploadResult.Width,
						Height: uploadResult.Height,
					}

				if closeError != nil {
					setUploadError(closeError)
				}
			}
		}()
	}

	for fileIndex := range files {
		jobs <- fileIndex
	}

	close(jobs)
	waitGroup.Wait()

	if firstUploadError != nil {
		successfullyUploaded :=
			filterUploadedMedia(uploadedMedia)

		service.cleanupMediaAsync(
			successfullyUploaded,
			"partial upload rollback",
		)

		return nil, firstUploadError
	}

	return uploadedMedia, nil
}

func filterUploadedMedia(
	media []post.MediaItem,
) []post.MediaItem {
	filtered := make(
		[]post.MediaItem,
		0,
		len(media),
	)

	for _, mediaItem := range media {
		if strings.TrimSpace(mediaItem.ID) == "" {
			continue
		}

		filtered = append(filtered, mediaItem)
	}

	return filtered
}

func (service *PostEditService) cleanupMediaAsync(
	media []post.MediaItem,
	reason string,
) {
	if service == nil ||
		service.cloudinaryDelete == nil ||
		len(media) == 0 {
		return
	}

	uniqueMedia := make(
		[]post.MediaItem,
		0,
		len(media),
	)

	seenMedia := make(
		map[string]struct{},
		len(media),
	)

	for _, mediaItem := range media {
		publicID := strings.TrimSpace(
			mediaItem.ID,
		)

		if publicID == "" {
			continue
		}

		mediaType := normalizeEditMediaType(
			mediaItem.Type,
		)

		uniqueKey := mediaType + ":" + publicID

		if _, exists :=
			seenMedia[uniqueKey]; exists {
			continue
		}

		seenMedia[uniqueKey] = struct{}{}

		mediaItem.ID = publicID
		mediaItem.Type = mediaType

		uniqueMedia = append(
			uniqueMedia,
			mediaItem,
		)
	}

	if len(uniqueMedia) == 0 {
		return
	}

	go func(items []post.MediaItem) {
		for _, mediaItem := range items {
			var cleanupError error

			for attempt := 1; attempt <= editCleanupMaxAttempts; attempt++ {
				cleanupCtx, cancel :=
					context.WithTimeout(
						context.Background(),
						editCleanupTimeout,
					)

				cleanupError =
					service.cloudinaryDelete.DeleteMedia(
						cleanupCtx,
						mediaItem.ID,
						mediaItem.Type,
					)

				cancel()

				if cleanupError == nil {
					break
				}

				if attempt <
					editCleanupMaxAttempts {
					time.Sleep(
						time.Duration(attempt) *
							time.Second,
					)
				}
			}

			if cleanupError != nil {
				log.Printf(
					"edit media cleanup failed (%s, %s): %v",
					reason,
					mediaItem.ID,
					cleanupError,
				)
			}
		}
	}(uniqueMedia)
}

func getEditMediaKey(
	mediaItem post.MediaItem,
) string {
	if publicID :=
		strings.TrimSpace(mediaItem.ID); publicID != "" {
		return publicID
	}

	return strings.TrimSpace(mediaItem.URL)
}

func normalizeEditMediaType(
	mediaType string,
) string {
	if mediaType == post.MediaTypeVideo {
		return post.MediaTypeVideo
	}

	return post.MediaTypeImage
}

func buildEditedFeedPost(
	postDocument post.Post,
	user post.PostUser,
) post.FeedPost {
	return post.FeedPost{
		ID:     postDocument.ID,
		UserID: postDocument.UserID,

		User: user,

		Type:    postDocument.Type,
		Caption: postDocument.Caption,

		Media: getStoredPostMedia(postDocument),

		MediaURL:  postDocument.MediaURL,
		MediaID:   postDocument.MediaID,
		MediaType: postDocument.MediaType,

		LikesCount:    postDocument.LikesCount,
		CommentsCount: postDocument.CommentsCount,
		SharesCount:   postDocument.SharesCount,

		IsDeleted: postDocument.IsDeleted,

		CreatedAt: postDocument.CreatedAt,
		UpdatedAt: postDocument.UpdatedAt,
	}
}

func invalidMediaError(
	message string,
) error {
	return fmt.Errorf(
		"%w: %s",
		ErrInvalidMediaSelection,
		message,
	)
}

func editUpdateError(
	err error,
) error {
	if err == nil {
		return ErrMediaPostUpdateFailed
	}

	return fmt.Errorf(
		"%w: %v",
		ErrMediaPostUpdateFailed,
		err,
	)
}
