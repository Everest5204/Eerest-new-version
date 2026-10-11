package textpost

import (
	"context"
	"encoding/base64"
	"errors"
	"everest-backend/internal/accountstate"
	"strings"
	"time"
	"unicode/utf8"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

const (
	defaultTextPostLimit = 6
	maxTextPostLimit     = 20
	maxTextLength        = 650

	defaultTextColor = "#111827"
	defaultBgColor   = "#ffffff"
)

type TextPostService struct {
	postsCollection   *mongo.Collection
	usersCollection   *mongo.Collection
	followsCollection *mongo.Collection
}

type textFeedFollowDocument struct {
	FollowingID bson.ObjectID `bson:"following_id"`
}

func NewTextPostService(
	db *mongo.Database,
) *TextPostService {
	return &TextPostService{
		postsCollection:   db.Collection("posts"),
		usersCollection:   db.Collection("users"),
		followsCollection: db.Collection("user_follows"),
	}
}

func (service *TextPostService) CreateIndexes(
	ctx context.Context,
) error {
	indexModels := []mongo.IndexModel{
		{
			Keys: bson.D{
				{Key: "type", Value: 1},
				{Key: "is_deleted", Value: 1},
				{Key: "created_at", Value: -1},
				{Key: "_id", Value: -1},
			},
			Options: options.Index().
				SetName("text_feed_cursor_index"),
		},
		{
			Keys: bson.D{
				{Key: "user_id", Value: 1},
				{Key: "type", Value: 1},
				{Key: "is_deleted", Value: 1},
				{Key: "created_at", Value: -1},
				{Key: "_id", Value: -1},
			},
			Options: options.Index().
				SetName(
					"user_text_posts_cursor_index",
				),
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

func (service *TextPostService) CreateTextPost(
	ctx context.Context,
	userID string,
	request CreateTextPostRequest,
) (*TextFeedPost, error) {
	objectID, err := bson.ObjectIDFromHex(
		strings.TrimSpace(userID),
	)

	if err != nil {
		return nil, errors.New(
			"invalid user id",
		)
	}

	text := strings.TrimSpace(
		request.Text,
	)

	if text == "" {
		text = strings.TrimSpace(
			request.Caption,
		)
	}

	if text == "" {
		return nil, errors.New(
			"text is required",
		)
	}

	if utf8.RuneCountInString(text) >
		maxTextLength {
		return nil, errors.New(
			"text is too long",
		)
	}

	background := normalizeTextBackground(
		request.TextBackground,
	)

	if background.Value == "" {
		background = normalizeTextBackground(
			request.Background,
		)
	}

	textColor := normalizeTextColor(
		request.TextColor,
	)

	textStyle := normalizeTextStyle(
		request.TextStyle,
	)

	now := time.Now().UTC()

	postItem := TextPost{
		ID:     bson.NewObjectID(),
		UserID: objectID,

		Type:    PostTypeText,
		Caption: text,
		Text:    text,

		TextBackground: background,
		TextColor:      textColor,
		TextStyle:      textStyle,

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

	postUser, err :=
		service.getTextPostUserByID(
			dbCtx,
			objectID,
		)

	if err != nil {
		return nil, err
	}

	return &TextFeedPost{
		ID:     postItem.ID,
		UserID: postItem.UserID,

		User: postUser,

		IsSelf:      true,
		IsFollowing: false,

		Type:    postItem.Type,
		Caption: postItem.Caption,
		Text:    postItem.Text,

		TextBackground: postItem.TextBackground,
		TextColor:      postItem.TextColor,
		TextStyle:      postItem.TextStyle,

		LikesCount:    postItem.LikesCount,
		CommentsCount: postItem.CommentsCount,
		SharesCount:   postItem.SharesCount,

		IsDeleted: postItem.IsDeleted,

		CreatedAt: postItem.CreatedAt,
		UpdatedAt: postItem.UpdatedAt,
	}, nil
}

func (service *TextPostService) GetFeedPosts(
	ctx context.Context,
	viewerUserID string,
	limit int64,
	cursor string,
) (*TextPostsResponse, error) {
	viewerID, err := bson.ObjectIDFromHex(
		strings.TrimSpace(viewerUserID),
	)

	if err != nil {
		return nil, errors.New(
			"invalid viewer user id",
		)
	}

	filter := bson.M{
		"type": PostTypeText,
		"is_deleted": bson.M{
			"$ne": true,
		},
	}

	return service.getPosts(
		ctx,
		filter,
		limit,
		cursor,
		viewerID,
	)
}

func (service *TextPostService) GetUserPosts(
	ctx context.Context,
	userID string,
	limit int64,
	cursor string,
) (*TextPostsResponse, error) {
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
		"type":    PostTypeText,
		"is_deleted": bson.M{
			"$ne": true,
		},
	}

	return service.getPosts(
		ctx,
		filter,
		limit,
		cursor,
		bson.NilObjectID,
	)
}

func (service *TextPostService) getPosts(
	ctx context.Context,
	baseFilter bson.M,
	limit int64,
	cursor string,
	viewerID bson.ObjectID,
) (*TextPostsResponse, error) {
	if limit <= 0 ||
		limit > maxTextPostLimit {
		limit = defaultTextPostLimit
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

	cleanCursor :=
		strings.TrimSpace(cursor)

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

	cursorResult, err := service.postsCollection.Aggregate(dbCtx, accountstate.VisiblePostPipeline(filter, limit+1, nil))

	if err != nil {
		return nil, err
	}

	defer cursorResult.Close(dbCtx)

	posts := make(
		[]TextPost,
		0,
		limit+1,
	)

	if err = cursorResult.All(
		dbCtx,
		&posts,
	); err != nil {
		return nil, err
	}

	hasMore :=
		int64(len(posts)) > limit

	if hasMore {
		posts = posts[:limit]
	}

	userIDsMap := make(
		map[bson.ObjectID]struct{},
	)

	for _, item := range posts {
		if item.UserID.IsZero() {
			continue
		}

		userIDsMap[item.UserID] =
			struct{}{}
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

	usersMap, err :=
		service.getUsersMap(
			dbCtx,
			userIDs,
		)

	if err != nil {
		return nil, err
	}

	/*
	 * পুরো text feed page-এর follow state
	 * একটি indexed batch query দিয়ে load হয়।
	 */
	followingUserIDs, err :=
		service.getFollowingUserIDs(
			dbCtx,
			viewerID,
			userIDs,
		)

	if err != nil {
		return nil, err
	}

	feedPosts := make(
		[]TextFeedPost,
		0,
		len(posts),
	)

	for _, item := range posts {
		postUser :=
			usersMap[item.UserID]

		if postUser.ID.IsZero() {
			continue
		}

		isSelf :=
			!viewerID.IsZero() &&
				item.UserID == viewerID

		_, isFollowing :=
			followingUserIDs[item.UserID]

		if isSelf {
			isFollowing = false
		}

		feedPosts = append(
			feedPosts,
			TextFeedPost{
				ID:     item.ID,
				UserID: item.UserID,

				User: postUser,

				IsSelf:      isSelf,
				IsFollowing: isFollowing,

				Type:    item.Type,
				Caption: item.Caption,
				Text:    item.Text,

				TextBackground: item.TextBackground,
				TextColor:      item.TextColor,
				TextStyle:      item.TextStyle,

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
		lastPost :=
			posts[len(posts)-1]

		nextCursor = encodeCursor(
			lastPost.CreatedAt,
			lastPost.ID,
		)
	}

	return &TextPostsResponse{
		Posts:      feedPosts,
		NextCursor: nextCursor,
		HasMore:    hasMore,
	}, nil
}

func (
	service *TextPostService,
) getTextPostUserByID(
	ctx context.Context,
	userID bson.ObjectID,
) (TextPostUser, error) {
	var user TextPostUser

	err := service.usersCollection.FindOne(
		ctx,
		accountstate.ActiveFilter(bson.M{
			"_id": userID,
		}),
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
		return TextPostUser{}, err
	}

	return user, nil
}

func (service *TextPostService) getUsersMap(
	ctx context.Context,
	userIDs []bson.ObjectID,
) (map[bson.ObjectID]TextPostUser, error) {
	usersMap := make(
		map[bson.ObjectID]TextPostUser,
	)

	if len(userIDs) == 0 {
		return usersMap, nil
	}

	cursorResult, err :=
		service.usersCollection.Find(
			ctx,
			accountstate.ActiveFilter(bson.M{
				"_id": bson.M{
					"$in": userIDs,
				},
			}),
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
		[]TextPostUser,
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

func (
	service *TextPostService,
) getFollowingUserIDs(
	ctx context.Context,
	viewerID bson.ObjectID,
	userIDs []bson.ObjectID,
) (map[bson.ObjectID]struct{}, error) {
	followingUserIDs := make(
		map[bson.ObjectID]struct{},
		len(userIDs),
	)

	if viewerID.IsZero() ||
		len(userIDs) == 0 {
		return followingUserIDs, nil
	}

	cursorResult, err :=
		service.followsCollection.Find(
			ctx,
			bson.M{
				"follower_id": viewerID,
				"following_id": bson.M{
					"$in": userIDs,
				},
			},
			options.Find().
				SetProjection(
					bson.M{
						"_id":          0,
						"following_id": 1,
					},
				),
		)

	if err != nil {
		return nil, err
	}

	defer cursorResult.Close(ctx)

	relations := make(
		[]textFeedFollowDocument,
		0,
		len(userIDs),
	)

	if err = cursorResult.All(
		ctx,
		&relations,
	); err != nil {
		return nil, err
	}

	for _, relation := range relations {
		followingUserIDs[relation.FollowingID] = struct{}{}
	}

	return followingUserIDs, nil
}

func normalizeTextBackground(
	background TextBackground,
) TextBackground {
	kind :=
		strings.TrimSpace(background.Kind)

	value :=
		strings.TrimSpace(background.Value)

	if value == "" {
		return TextBackground{
			Kind:  TextBackgroundPlain,
			Value: defaultBgColor,
		}
	}

	switch kind {
	case TextBackgroundSolid,
		TextBackgroundGradient,
		TextBackgroundImage,
		TextBackgroundPlain:
	default:
		kind = TextBackgroundPlain
	}

	return TextBackground{
		Kind:  kind,
		Value: value,
	}
}

func normalizeTextColor(
	color string,
) string {
	cleanColor :=
		strings.TrimSpace(color)

	if cleanColor == "" {
		return defaultTextColor
	}

	return cleanColor
}

func normalizeTextStyle(
	style string,
) string {
	switch strings.TrimSpace(style) {
	case TextStyleNormalCenter:
		return TextStyleNormalCenter

	case TextStyleBoldLeft:
		return TextStyleBoldLeft

	case TextStyleNormalLeft:
		return TextStyleNormalLeft

	default:
		return TextStyleBoldCenter
	}
}

func encodeCursor(
	createdAt time.Time,
	id bson.ObjectID,
) string {
	raw :=
		createdAt.UTC().
			Format(time.RFC3339Nano) +
			"|" +
			id.Hex()

	return base64.RawURLEncoding.
		EncodeToString(
			[]byte(raw),
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

	objectID, err :=
		bson.ObjectIDFromHex(
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
