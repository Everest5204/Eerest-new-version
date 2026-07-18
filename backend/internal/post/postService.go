package post

import (
	"context"
	"encoding/base64"
	"errors"
	"mime/multipart"
	"strings"
	"time"

	"everest-backend/internal/config"
	"everest-backend/internal/profilemedia"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

const (
	defaultFeedLimit = 6
	maxFeedLimit     = 20

	maxImagePostCount = 10
	maxImageFileSize  = 15 << 20
	maxVideoFileSize  = 200 << 20
)

type PostService struct {
	postsCollection *mongo.Collection
	usersCollection *mongo.Collection
	cloudinary      *profilemedia.CloudinaryService
}

func NewPostService(
	db *mongo.Database,
	cfg config.Config,
) (*PostService, error) {
	cloudinaryService, err := profilemedia.NewCloudinaryService(cfg)
	if err != nil {
		return nil, err
	}

	return &PostService{
		postsCollection: db.Collection("posts"),
		usersCollection: db.Collection("users"),
		cloudinary:      cloudinaryService,
	}, nil
}

func (service *PostService) CreateIndexes(
	ctx context.Context,
) error {
	indexModels := []mongo.IndexModel{
		{
			Keys: bson.D{
				{Key: "created_at", Value: -1},
				{Key: "_id", Value: -1},
			},
			Options: options.Index().
				SetName("feed_cursor_index"),
		},
		{
			Keys: bson.D{
				{Key: "user_id", Value: 1},
				{Key: "created_at", Value: -1},
				{Key: "_id", Value: -1},
			},
			Options: options.Index().
				SetName("user_posts_cursor_index"),
		},
		{
			Keys: bson.D{
				{Key: "is_deleted", Value: 1},
				{Key: "created_at", Value: -1},
				{Key: "_id", Value: -1},
			},
			Options: options.Index().
				SetName("active_feed_cursor_index"),
		},
	}

	_, err := service.postsCollection.
		Indexes().
		CreateMany(
			ctx,
			indexModels,
		)

	return err
}

func (service *PostService) CreateMediaPost(
	ctx context.Context,
	userID string,
	caption string,
	files []*multipart.FileHeader,
) (*FeedPost, error) {
	objectID, err := bson.ObjectIDFromHex(
		strings.TrimSpace(userID),
	)
	if err != nil {
		return nil, errors.New(
			"invalid user id",
		)
	}

	if len(files) == 0 {
		return nil, errors.New(
			"media file is required",
		)
	}

	firstMediaType, _, err := getMediaType(
		files[0],
	)
	if err != nil {
		return nil, err
	}

	postType := PostTypeImage

	if firstMediaType == MediaTypeVideo {
		postType = PostTypeVideo
	}

	if firstMediaType == MediaTypeVideo &&
		len(files) > 1 {
		return nil, errors.New(
			"video post supports only one video",
		)
	}

	if firstMediaType == MediaTypeImage &&
		len(files) > maxImagePostCount {
		return nil, errors.New(
			"maximum 10 images allowed",
		)
	}

	mediaItems := make(
		[]MediaItem,
		0,
		len(files),
	)

	folder := "everest/posts/" + objectID.Hex()

	for index, fileHeader := range files {
		mediaType, resourceType, mediaTypeErr :=
			getMediaType(fileHeader)

		if mediaTypeErr != nil {
			return nil, mediaTypeErr
		}

		if mediaType != firstMediaType {
			return nil, errors.New(
				"mixed image and video post is not allowed",
			)
		}

		if mediaType == MediaTypeImage &&
			fileHeader.Size > maxImageFileSize {
			return nil, errors.New(
				"image file is too large",
			)
		}

		if mediaType == MediaTypeVideo &&
			fileHeader.Size > maxVideoFileSize {
			return nil, errors.New(
				"video file is too large",
			)
		}

		file, openErr := fileHeader.Open()
		if openErr != nil {
			return nil, openErr
		}

		uploadResult, uploadErr :=
			service.cloudinary.UploadMedia(
				file,
				folder,
				resourceType,
				fileHeader.Filename,
			)

		closeErr := file.Close()

		if uploadErr != nil {
			return nil, uploadErr
		}

		if closeErr != nil {
			return nil, closeErr
		}

		mediaItems = append(
			mediaItems,
			MediaItem{
				URL:   uploadResult.SecureURL,
				ID:    uploadResult.PublicID,
				Type:  mediaType,
				Order: index,
			},
		)
	}

	if len(mediaItems) == 0 {
		return nil, errors.New(
			"media upload failed",
		)
	}

	now := time.Now().UTC()

	postItem := Post{
		ID:     bson.NewObjectID(),
		UserID: objectID,

		Type:    postType,
		Caption: strings.TrimSpace(caption),

		Media: mediaItems,

		MediaURL:  mediaItems[0].URL,
		MediaID:   mediaItems[0].ID,
		MediaType: firstMediaType,

		LikesCount:    0,
		CommentsCount: 0,
		SharesCount:   0,

		IsDeleted: false,

		CreatedAt: now,
		UpdatedAt: now,
	}

	dbCtx, cancel := context.WithTimeout(
		ctx,
		10*time.Second,
	)
	defer cancel()

	_, err = service.postsCollection.InsertOne(
		dbCtx,
		postItem,
	)
	if err != nil {
		return nil, err
	}

	_, _ = service.usersCollection.UpdateOne(
		dbCtx,
		bson.M{
			"_id": objectID,
		},
		bson.M{
			"$inc": bson.M{
				"posts_count": 1,
			},
			"$set": bson.M{
				"updated_at": now,
			},
		},
	)

	postUser, err := service.getPostUserByID(
		dbCtx,
		objectID,
	)
	if err != nil {
		return nil, err
	}

	return &FeedPost{
		ID:     postItem.ID,
		UserID: postItem.UserID,

		User: postUser,

		Type:    postItem.Type,
		Caption: postItem.Caption,

		Media: postItem.Media,

		MediaURL:  postItem.MediaURL,
		MediaID:   postItem.MediaID,
		MediaType: postItem.MediaType,

		LikesCount:    postItem.LikesCount,
		CommentsCount: postItem.CommentsCount,
		SharesCount:   postItem.SharesCount,

		IsDeleted: postItem.IsDeleted,

		CreatedAt: postItem.CreatedAt,
		UpdatedAt: postItem.UpdatedAt,
	}, nil
}

// GetFeedPosts returns only normal Home Feed media posts.
//
// Video posts are excluded because videos are displayed through the
// dedicated Reels feed. GetUserPosts remains unchanged, so video posts
// continue to appear as normal posts on Profile Feed.
func (service *PostService) GetFeedPosts(
	ctx context.Context,
	limit int64,
	cursor string,
) (*PostsResponse, error) {
	filter := bson.M{
		"is_deleted": bson.M{
			"$ne": true,
		},
		"type": bson.M{
			"$ne": PostTypeVideo,
		},
	}

	return service.getPosts(
		ctx,
		filter,
		limit,
		cursor,
	)
}

func (service *PostService) GetUserPosts(
	ctx context.Context,
	userID string,
	limit int64,
	cursor string,
) (*PostsResponse, error) {
	objectID, err := bson.ObjectIDFromHex(
		strings.TrimSpace(userID),
	)
	if err != nil {
		return nil, errors.New(
			"invalid user id",
		)
	}

	filter := bson.M{
		"user_id": objectID,
		"is_deleted": bson.M{
			"$ne": true,
		},
	}

	return service.getPosts(
		ctx,
		filter,
		limit,
		cursor,
	)
}

func (service *PostService) getPosts(
	ctx context.Context,
	baseFilter bson.M,
	limit int64,
	cursor string,
) (*PostsResponse, error) {
	if limit <= 0 || limit > maxFeedLimit {
		limit = defaultFeedLimit
	}

	dbCtx, cancel := context.WithTimeout(
		ctx,
		5*time.Second,
	)
	defer cancel()

	filter := bson.M{}

	for key, value := range baseFilter {
		filter[key] = value
	}

	cleanCursor := strings.TrimSpace(cursor)

	if cleanCursor != "" {
		cursorTime, cursorID, err :=
			decodeCursor(cleanCursor)

		if err == nil {
			filter["$or"] = bson.A{
				bson.M{
					"created_at": bson.M{
						"$lt": cursorTime,
					},
				},
				bson.M{
					"created_at": cursorTime,
					"_id": bson.M{
						"$lt": cursorID,
					},
				},
			}
		}
	}

	findOptions := options.Find().
		SetSort(
			bson.D{
				{Key: "created_at", Value: -1},
				{Key: "_id", Value: -1},
			},
		).
		SetLimit(limit + 1)

	cursorResult, err :=
		service.postsCollection.Find(
			dbCtx,
			filter,
			findOptions,
		)
	if err != nil {
		return nil, err
	}
	defer cursorResult.Close(dbCtx)

	posts := make(
		[]Post,
		0,
		limit+1,
	)

	if err = cursorResult.All(
		dbCtx,
		&posts,
	); err != nil {
		return nil, err
	}

	hasMore := int64(len(posts)) > limit

	if hasMore {
		posts = posts[:limit]
	}

	feedPosts := make(
		[]FeedPost,
		0,
		len(posts),
	)

	userIDsMap := make(
		map[bson.ObjectID]struct{},
	)

	for _, item := range posts {
		if item.UserID.IsZero() {
			continue
		}

		userIDsMap[item.UserID] = struct{}{}
	}

	userIDs := make(
		[]bson.ObjectID,
		0,
		len(userIDsMap),
	)

	for userID := range userIDsMap {
		userIDs = append(
			userIDs,
			userID,
		)
	}

	usersMap, err := service.getUsersMap(
		dbCtx,
		userIDs,
	)
	if err != nil {
		return nil, err
	}

	for _, item := range posts {
		postUser := usersMap[item.UserID]

		if postUser.ID.IsZero() {
			postUser.ID = item.UserID
		}

		feedPosts = append(
			feedPosts,
			FeedPost{
				ID:     item.ID,
				UserID: item.UserID,

				User: postUser,

				Type:    item.Type,
				Caption: item.Caption,

				Media: item.Media,

				MediaURL:  item.MediaURL,
				MediaID:   item.MediaID,
				MediaType: item.MediaType,

				LikesCount:    item.LikesCount,
				CommentsCount: item.CommentsCount,
				SharesCount:   item.SharesCount,

				IsDeleted: item.IsDeleted,

				CreatedAt: item.CreatedAt,
				UpdatedAt: item.UpdatedAt,
			},
		)
	}

	nextCursor := ""

	if hasMore && len(posts) > 0 {
		lastPost := posts[len(posts)-1]

		nextCursor = encodeCursor(
			lastPost.CreatedAt,
			lastPost.ID,
		)
	}

	return &PostsResponse{
		Posts:      feedPosts,
		NextCursor: nextCursor,
		HasMore:    hasMore,
	}, nil
}

func (service *PostService) getPostUserByID(
	ctx context.Context,
	userID bson.ObjectID,
) (PostUser, error) {
	var user PostUser

	err := service.usersCollection.FindOne(
		ctx,
		bson.M{
			"_id": userID,
		},
		options.FindOne().
			SetProjection(
				bson.M{
					"_id":               1,
					"first_name":        1,
					"last_name":         1,
					"profile_image_url": 1,
				},
			),
	).Decode(&user)

	if err != nil {
		return PostUser{}, err
	}

	return user, nil
}

func (service *PostService) getUsersMap(
	ctx context.Context,
	userIDs []bson.ObjectID,
) (map[bson.ObjectID]PostUser, error) {
	usersMap := make(
		map[bson.ObjectID]PostUser,
	)

	if len(userIDs) == 0 {
		return usersMap, nil
	}

	cursorResult, err :=
		service.usersCollection.Find(
			ctx,
			bson.M{
				"_id": bson.M{
					"$in": userIDs,
				},
			},
			options.Find().
				SetProjection(
					bson.M{
						"_id":               1,
						"first_name":        1,
						"last_name":         1,
						"profile_image_url": 1,
					},
				),
		)
	if err != nil {
		return nil, err
	}
	defer cursorResult.Close(ctx)

	users := make(
		[]PostUser,
		0,
		len(userIDs),
	)

	if err = cursorResult.All(
		ctx,
		&users,
	); err != nil {
		return nil, err
	}

	for _, item := range users {
		usersMap[item.ID] = item
	}

	return usersMap, nil
}

func getMediaType(
	fileHeader *multipart.FileHeader,
) (string, string, error) {
	if fileHeader == nil {
		return "", "", errors.New(
			"media file is required",
		)
	}

	contentType := strings.ToLower(
		strings.TrimSpace(
			fileHeader.Header.Get(
				"Content-Type",
			),
		),
	)

	fileName := strings.ToLower(
		strings.TrimSpace(
			fileHeader.Filename,
		),
	)

	if strings.HasPrefix(
		contentType,
		"image/",
	) || hasImageExtension(fileName) {
		return MediaTypeImage, "image", nil
	}

	if strings.HasPrefix(
		contentType,
		"video/",
	) || hasVideoExtension(fileName) {
		return MediaTypeVideo, "video", nil
	}

	return "", "", errors.New(
		"only image or video media is allowed",
	)
}

func hasImageExtension(
	fileName string,
) bool {
	return strings.HasSuffix(fileName, ".jpg") ||
		strings.HasSuffix(fileName, ".jpeg") ||
		strings.HasSuffix(fileName, ".png") ||
		strings.HasSuffix(fileName, ".webp") ||
		strings.HasSuffix(fileName, ".gif")
}

func hasVideoExtension(
	fileName string,
) bool {
	return strings.HasSuffix(fileName, ".mp4") ||
		strings.HasSuffix(fileName, ".mov") ||
		strings.HasSuffix(fileName, ".webm") ||
		strings.HasSuffix(fileName, ".mkv")
}

func encodeCursor(
	createdAt time.Time,
	id bson.ObjectID,
) string {
	rawCursor :=
		createdAt.UTC().
			Format(time.RFC3339Nano) +
			"|" +
			id.Hex()

	return base64.RawURLEncoding.
		EncodeToString(
			[]byte(rawCursor),
		)
}

func decodeCursor(
	cursor string,
) (time.Time, bson.ObjectID, error) {
	decodedBytes, err :=
		base64.RawURLEncoding.
			DecodeString(
				strings.TrimSpace(cursor),
			)
	if err != nil {
		return time.Time{},
			bson.NilObjectID,
			err
	}

	parts := strings.SplitN(
		string(decodedBytes),
		"|",
		2,
	)

	if len(parts) != 2 {
		return time.Time{},
			bson.NilObjectID,
			errors.New(
				"invalid cursor",
			)
	}

	createdAt, err := time.Parse(
		time.RFC3339Nano,
		parts[0],
	)
	if err != nil {
		return time.Time{},
			bson.NilObjectID,
			err
	}

	objectID, err := bson.ObjectIDFromHex(
		parts[1],
	)
	if err != nil {
		return time.Time{},
			bson.NilObjectID,
			err
	}

	return createdAt,
		objectID,
		nil
}
