package reels

import (
	"context"
	"encoding/base64"
	"errors"
	"everest-backend/internal/accountstate"
	"strings"
	"sync"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

const (
	defaultReelsLimit int64 = 6
	maxReelsLimit     int64 = 20

	reelsDatabaseTimeout = 6 * time.Second
	reelLoveReaction     = "love"
)

var ErrReelNotFound = errors.New("reel not found")

type ReelsService struct {
	postsCollection     *mongo.Collection
	usersCollection     *mongo.Collection
	reactionsCollection *mongo.Collection
}

func NewReelsService(db *mongo.Database) *ReelsService {
	return &ReelsService{
		postsCollection:     db.Collection("posts"),
		usersCollection:     db.Collection("users"),
		reactionsCollection: db.Collection("post_reactions"),
	}
}

// CreateIndexes creates the compound index used by the Reels feed.
//
// The index allows MongoDB to:
//  1. Select only video posts.
//  2. Exclude deleted posts.
//  3. Sort and paginate without scanning the entire posts collection.
func (service *ReelsService) CreateIndexes(ctx context.Context) error {
	indexes := []mongo.IndexModel{
		{
			Keys: bson.D{
				{Key: "type", Value: 1},
				{Key: "is_deleted", Value: 1},
				{Key: "created_at", Value: -1},
				{Key: "_id", Value: -1},
			},
			Options: options.Index().
				SetName("reels_feed_cursor_index"),
		},
	}

	_, err := service.postsCollection.Indexes().CreateMany(ctx, indexes)
	return err
}

// GetReels returns video posts directly from MongoDB using cursor pagination.
func (service *ReelsService) GetReels(
	ctx context.Context,
	authUserID string,
	limit int64,
	cursorValue string,
) (*ReelsResponse, error) {
	userObjectID, err := bson.ObjectIDFromHex(strings.TrimSpace(authUserID))
	if err != nil {
		return nil, errors.New("invalid authenticated user id")
	}

	limit = normalizeReelsLimit(limit)

	dbCtx, cancel := context.WithTimeout(ctx, reelsDatabaseTimeout)
	defer cancel()

	filter := bson.M{
		"type": ReelPostType,
		"is_deleted": bson.M{
			"$ne": true,
		},
	}

	if strings.TrimSpace(cursorValue) != "" {
		cursorTime, cursorID, cursorErr := decodeReelsCursor(cursorValue)
		if cursorErr != nil {
			return nil, errors.New("invalid reels cursor")
		}

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

	resultCursor, err := service.postsCollection.Aggregate(dbCtx, accountstate.VisiblePostPipeline(filter, limit+1, reelPostProjection()))
	if err != nil {
		return nil, err
	}
	defer resultCursor.Close(dbCtx)

	postDocuments := make([]reelPostDocument, 0, limit+1)

	if err = resultCursor.All(dbCtx, &postDocuments); err != nil {
		return nil, err
	}

	hasMore := int64(len(postDocuments)) > limit

	if hasMore {
		postDocuments = postDocuments[:limit]
	}

	reelItems, err := service.buildReelItems(
		dbCtx,
		userObjectID,
		postDocuments,
	)
	if err != nil {
		return nil, err
	}

	nextCursor := ""

	if hasMore && len(postDocuments) > 0 {
		lastPost := postDocuments[len(postDocuments)-1]

		nextCursor = encodeReelsCursor(
			lastPost.CreatedAt,
			lastPost.ID,
		)
	}

	return &ReelsResponse{
		Reels:      reelItems,
		NextCursor: nextCursor,
		HasMore:    hasMore,
	}, nil
}

// GetReelByID returns one selected reel directly from MongoDB.
func (service *ReelsService) GetReelByID(
	ctx context.Context,
	authUserID string,
	reelID string,
) (*Reel, error) {
	userObjectID, err := bson.ObjectIDFromHex(strings.TrimSpace(authUserID))
	if err != nil {
		return nil, errors.New("invalid authenticated user id")
	}

	reelObjectID, err := bson.ObjectIDFromHex(strings.TrimSpace(reelID))
	if err != nil {
		return nil, errors.New("invalid reel id")
	}

	dbCtx, cancel := context.WithTimeout(ctx, reelsDatabaseTimeout)
	defer cancel()

	filter := bson.M{
		"_id":  reelObjectID,
		"type": ReelPostType,
		"is_deleted": bson.M{
			"$ne": true,
		},
	}

	var postDocument reelPostDocument

	err = service.postsCollection.FindOne(
		dbCtx,
		filter,
		options.FindOne().SetProjection(reelPostProjection()),
	).Decode(&postDocument)

	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, ErrReelNotFound
	}

	if err != nil {
		return nil, err
	}

	reelItems, err := service.buildReelItems(
		dbCtx,
		userObjectID,
		[]reelPostDocument{postDocument},
	)
	if err != nil {
		return nil, err
	}

	if len(reelItems) == 0 {
		return nil, ErrReelNotFound
	}

	return &reelItems[0], nil
}

// buildReelItems loads authors and current-user reactions in two parallel,
// batched MongoDB queries.
//
// It avoids making separate database requests for every individual reel.
func (service *ReelsService) buildReelItems(
	ctx context.Context,
	authUserID bson.ObjectID,
	postDocuments []reelPostDocument,
) ([]Reel, error) {
	if len(postDocuments) == 0 {
		return make([]Reel, 0), nil
	}

	userIDs := uniqueReelUserIDs(postDocuments)
	postIDs := reelPostIDs(postDocuments)

	var (
		usersMap     map[bson.ObjectID]ReelUser
		reactionsMap map[bson.ObjectID]string

		usersErr     error
		reactionsErr error

		waitGroup sync.WaitGroup
	)

	waitGroup.Add(2)

	go func() {
		defer waitGroup.Done()

		usersMap, usersErr = service.loadReelUsers(
			ctx,
			userIDs,
		)
	}()

	go func() {
		defer waitGroup.Done()

		reactionsMap, reactionsErr = service.loadCurrentUserReactions(
			ctx,
			authUserID,
			postIDs,
		)
	}()

	waitGroup.Wait()

	if usersErr != nil {
		return nil, usersErr
	}

	if reactionsErr != nil {
		return nil, reactionsErr
	}

	reelItems := make([]Reel, 0, len(postDocuments))

	for _, postDocument := range postDocuments {
		user := usersMap[postDocument.UserID]

		if user.ID.IsZero() {
			continue
		}

		reactionType := reactionsMap[postDocument.ID]

		mediaItems := normalizeReelMedia(postDocument)

		reelItems = append(reelItems, Reel{
			ID:     postDocument.ID,
			UserID: postDocument.UserID,

			User: user,

			Type:    ReelPostType,
			Caption: postDocument.Caption,

			Media: mediaItems,

			MediaURL:  postDocument.MediaURL,
			MediaID:   postDocument.MediaID,
			MediaType: ReelMediaType,

			LikesCount:    postDocument.LikesCount,
			CommentsCount: postDocument.CommentsCount,
			SharesCount:   postDocument.SharesCount,

			CurrentUserReaction: reactionType,
			IsLovedByMe:         reactionType == reelLoveReaction,

			CreatedAt: postDocument.CreatedAt,
			UpdatedAt: postDocument.UpdatedAt,
		})
	}

	return reelItems, nil
}

// loadReelUsers loads every author in one MongoDB query.
func (service *ReelsService) loadReelUsers(
	ctx context.Context,
	userIDs []bson.ObjectID,
) (map[bson.ObjectID]ReelUser, error) {
	usersMap := make(map[bson.ObjectID]ReelUser)

	if len(userIDs) == 0 {
		return usersMap, nil
	}

	resultCursor, err := service.usersCollection.Find(
		ctx,
		accountstate.ActiveFilter(bson.M{
			"_id": bson.M{
				"$in": userIDs,
			},
		}),
		options.Find().SetProjection(bson.M{
			"_id":               1,
			"first_name":        1,
			"last_name":         1,
			"profile_image_url": 1,
		}),
	)
	if err != nil {
		return nil, err
	}
	defer resultCursor.Close(ctx)

	users := make([]ReelUser, 0, len(userIDs))

	if err = resultCursor.All(ctx, &users); err != nil {
		return nil, err
	}

	for _, user := range users {
		usersMap[user.ID] = user
	}

	return usersMap, nil
}

// loadCurrentUserReactions loads the signed-in user's reaction for every
// visible reel in one MongoDB query.
func (service *ReelsService) loadCurrentUserReactions(
	ctx context.Context,
	authUserID bson.ObjectID,
	postIDs []bson.ObjectID,
) (map[bson.ObjectID]string, error) {
	reactionsMap := make(map[bson.ObjectID]string)

	if len(postIDs) == 0 {
		return reactionsMap, nil
	}

	resultCursor, err := service.reactionsCollection.Find(
		ctx,
		bson.M{
			"user_id": authUserID,
			"post_id": bson.M{
				"$in": postIDs,
			},
		},
		options.Find().SetProjection(bson.M{
			"post_id":       1,
			"reaction_type": 1,
		}),
	)
	if err != nil {
		return nil, err
	}
	defer resultCursor.Close(ctx)

	reactions := make([]reelReactionDocument, 0, len(postIDs))

	if err = resultCursor.All(ctx, &reactions); err != nil {
		return nil, err
	}

	for _, reaction := range reactions {
		reactionsMap[reaction.PostID] = reaction.ReactionType
	}

	return reactionsMap, nil
}

func uniqueReelUserIDs(
	postDocuments []reelPostDocument,
) []bson.ObjectID {
	uniqueIDs := make(map[bson.ObjectID]struct{})

	for _, postDocument := range postDocuments {
		if postDocument.UserID.IsZero() {
			continue
		}

		uniqueIDs[postDocument.UserID] = struct{}{}
	}

	userIDs := make([]bson.ObjectID, 0, len(uniqueIDs))

	for userID := range uniqueIDs {
		userIDs = append(userIDs, userID)
	}

	return userIDs
}

func reelPostIDs(
	postDocuments []reelPostDocument,
) []bson.ObjectID {
	postIDs := make([]bson.ObjectID, 0, len(postDocuments))

	for _, postDocument := range postDocuments {
		if postDocument.ID.IsZero() {
			continue
		}

		postIDs = append(postIDs, postDocument.ID)
	}

	return postIDs
}

func normalizeReelMedia(
	postDocument reelPostDocument,
) []ReelMedia {
	mediaItems := make([]ReelMedia, 0, 1)

	for _, mediaItem := range postDocument.Media {
		if strings.TrimSpace(mediaItem.URL) == "" {
			continue
		}

		if mediaItem.Type != "" && mediaItem.Type != ReelMediaType {
			continue
		}

		mediaItem.Type = ReelMediaType
		mediaItem.PosterURL = createCloudinaryVideoPoster(mediaItem.URL)

		mediaItems = append(mediaItems, mediaItem)
	}

	if len(mediaItems) > 0 {
		return mediaItems
	}

	legacyMediaURL := strings.TrimSpace(postDocument.MediaURL)

	if legacyMediaURL == "" {
		return make([]ReelMedia, 0)
	}

	return []ReelMedia{
		{
			URL:       legacyMediaURL,
			ID:        postDocument.MediaID,
			Type:      ReelMediaType,
			Order:     0,
			PosterURL: createCloudinaryVideoPoster(legacyMediaURL),
		},
	}
}

// createCloudinaryVideoPoster generates a lightweight representative frame.
//
// No poster is stored in localStorage or application cache. Cloudinary serves
// the generated image while MongoDB remains the Reel data source.
func createCloudinaryVideoPoster(videoURL string) string {
	cleanURL := strings.TrimSpace(videoURL)

	const marker = "/video/upload/"

	markerIndex := strings.Index(cleanURL, marker)
	if markerIndex < 0 {
		return ""
	}

	prefixEnd := markerIndex + len(marker)

	prefix := cleanURL[:prefixEnd]
	assetPath := cleanURL[prefixEnd:]

	if queryIndex := strings.Index(assetPath, "?"); queryIndex >= 0 {
		assetPath = assetPath[:queryIndex]
	}

	lastSlashIndex := strings.LastIndex(assetPath, "/")
	lastDotIndex := strings.LastIndex(assetPath, ".")

	if lastDotIndex <= lastSlashIndex {
		return ""
	}

	assetWithoutExtension := assetPath[:lastDotIndex]

	return prefix +
		"so_auto,c_fill,g_auto,w_480,h_854,f_auto,q_auto/" +
		assetWithoutExtension +
		".jpg"
}

func reelPostProjection() bson.M {
	return bson.M{
		"_id":            1,
		"user_id":        1,
		"type":           1,
		"caption":        1,
		"media":          1,
		"media_url":      1,
		"media_id":       1,
		"media_type":     1,
		"likes_count":    1,
		"comments_count": 1,
		"shares_count":   1,
		"is_deleted":     1,
		"created_at":     1,
		"updated_at":     1,
	}
}

func normalizeReelsLimit(limit int64) int64 {
	if limit <= 0 {
		return defaultReelsLimit
	}

	if limit > maxReelsLimit {
		return maxReelsLimit
	}

	return limit
}

func encodeReelsCursor(
	createdAt time.Time,
	reelID bson.ObjectID,
) string {
	rawCursor := createdAt.UTC().Format(time.RFC3339Nano) +
		"|" +
		reelID.Hex()

	return base64.RawURLEncoding.EncodeToString(
		[]byte(rawCursor),
	)
}

func decodeReelsCursor(
	cursorValue string,
) (time.Time, bson.ObjectID, error) {
	decodedCursor, err := base64.RawURLEncoding.DecodeString(
		strings.TrimSpace(cursorValue),
	)
	if err != nil {
		return time.Time{}, bson.NilObjectID, err
	}

	cursorParts := strings.SplitN(
		string(decodedCursor),
		"|",
		2,
	)

	if len(cursorParts) != 2 {
		return time.Time{}, bson.NilObjectID, errors.New(
			"invalid cursor format",
		)
	}

	createdAt, err := time.Parse(
		time.RFC3339Nano,
		cursorParts[0],
	)
	if err != nil {
		return time.Time{}, bson.NilObjectID, err
	}

	reelID, err := bson.ObjectIDFromHex(cursorParts[1])
	if err != nil {
		return time.Time{}, bson.NilObjectID, err
	}

	return createdAt, reelID, nil
}
