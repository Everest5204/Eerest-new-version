package comment

import (
	"context"
	"encoding/base64"
	"errors"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

const (
	defaultCommentLimit  = 10
	maxCommentLimit      = 30
	maxCommentTextLength = 2000
)

type CommentService struct {
	commentsCollection     *mongo.Collection
	commentLovesCollection *mongo.Collection
	postsCollection        *mongo.Collection
	usersCollection        *mongo.Collection
}

func NewCommentService(db *mongo.Database) *CommentService {
	return &CommentService{
		commentsCollection:     db.Collection("comments"),
		commentLovesCollection: db.Collection("comment_loves"),
		postsCollection:        db.Collection("posts"),
		usersCollection:        db.Collection("users"),
	}
}

func (service *CommentService) CreateIndexes(ctx context.Context) error {
	commentIndexes := []mongo.IndexModel{
		{
			Keys: bson.D{
				{Key: "post_id", Value: 1},
				{Key: "parent_id", Value: 1},
				{Key: "is_deleted", Value: 1},
				{Key: "created_at", Value: -1},
				{Key: "_id", Value: -1},
			},
			Options: options.Index().SetName("comments_post_parent_cursor_index"),
		},
		{
			Keys: bson.D{
				{Key: "parent_id", Value: 1},
				{Key: "is_deleted", Value: 1},
				{Key: "created_at", Value: -1},
				{Key: "_id", Value: -1},
			},
			Options: options.Index().SetName("comments_parent_cursor_index"),
		},
		{
			Keys: bson.D{
				{Key: "user_id", Value: 1},
				{Key: "created_at", Value: -1},
			},
			Options: options.Index().SetName("comments_user_index"),
		},
	}

	if _, err := service.commentsCollection.Indexes().CreateMany(ctx, commentIndexes); err != nil {
		return err
	}

	loveIndexes := []mongo.IndexModel{
		{
			Keys: bson.D{
				{Key: "comment_id", Value: 1},
				{Key: "user_id", Value: 1},
			},
			Options: options.Index().
				SetName("unique_comment_love_index").
				SetUnique(true),
		},
		{
			Keys: bson.D{
				{Key: "user_id", Value: 1},
				{Key: "created_at", Value: -1},
			},
			Options: options.Index().SetName("comment_loves_user_index"),
		},
	}

	_, err := service.commentLovesCollection.Indexes().CreateMany(ctx, loveIndexes)
	return err
}

func (service *CommentService) GetComments(
	ctx context.Context,
	authUserID string,
	postID string,
	limit int64,
	cursor string,
) (*CommentsResponse, error) {
	userObjectID, err := bson.ObjectIDFromHex(authUserID)
	if err != nil {
		return nil, errors.New("invalid user id")
	}

	postObjectID, err := bson.ObjectIDFromHex(postID)
	if err != nil {
		return nil, errors.New("invalid post id")
	}

	if err := service.ensurePostExists(ctx, postObjectID); err != nil {
		return nil, err
	}

	filter := bson.M{
		"post_id":    postObjectID,
		"is_deleted": bson.M{"$ne": true},
		"$or": bson.A{
			bson.M{"parent_id": bson.M{"$exists": false}},
			bson.M{"parent_id": nil},
		},
	}

	return service.getCommentsByFilter(ctx, userObjectID, filter, limit, cursor)
}

func (service *CommentService) GetReplies(
	ctx context.Context,
	authUserID string,
	parentID string,
	limit int64,
	cursor string,
) (*CommentsResponse, error) {
	userObjectID, err := bson.ObjectIDFromHex(authUserID)
	if err != nil {
		return nil, errors.New("invalid user id")
	}

	parentObjectID, err := bson.ObjectIDFromHex(parentID)
	if err != nil {
		return nil, errors.New("invalid comment id")
	}

	parentComment, err := service.getCommentByID(ctx, parentObjectID, true)
	if err != nil {
		return nil, err
	}

	filter := bson.M{
		"post_id":    parentComment.PostID,
		"parent_id":  parentObjectID,
		"is_deleted": bson.M{"$ne": true},
	}

	return service.getCommentsByFilter(ctx, userObjectID, filter, limit, cursor)
}

func (service *CommentService) CreateComment(
	ctx context.Context,
	authUserID string,
	request CreateCommentRequest,
) (*CreateCommentResponse, error) {
	userObjectID, err := bson.ObjectIDFromHex(authUserID)
	if err != nil {
		return nil, errors.New("invalid user id")
	}

	postObjectID, err := bson.ObjectIDFromHex(request.PostID)
	if err != nil {
		return nil, errors.New("invalid post id")
	}

	text, err := cleanCommentText(request.Text)
	if err != nil {
		return nil, err
	}

	if err := service.ensurePostExists(ctx, postObjectID); err != nil {
		return nil, err
	}

	var parentObjectID *bson.ObjectID

	if strings.TrimSpace(request.ParentID) != "" {
		parsedParentID, err := bson.ObjectIDFromHex(request.ParentID)
		if err != nil {
			return nil, errors.New("invalid parent comment id")
		}

		parentComment, err := service.getCommentByID(ctx, parsedParentID, true)
		if err != nil {
			return nil, err
		}

		if parentComment.PostID != postObjectID {
			return nil, errors.New("parent comment does not belong to this post")
		}

		parentObjectID = &parsedParentID
	}

	now := time.Now().UTC()

	commentItem := Comment{
		ID:           bson.NewObjectID(),
		PostID:       postObjectID,
		UserID:       userObjectID,
		ParentID:     parentObjectID,
		Text:         text,
		LovesCount:   0,
		RepliesCount: 0,
		IsDeleted:    false,
		CreatedAt:    now,
		UpdatedAt:    now,
	}

	dbCtx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()

	if _, err := service.commentsCollection.InsertOne(dbCtx, commentItem); err != nil {
		return nil, err
	}

	if parentObjectID != nil {
		_ = service.syncRepliesCount(dbCtx, *parentObjectID)
	}

	commentsCount, err := service.syncPostCommentsCount(dbCtx, postObjectID)
	if err != nil {
		return nil, err
	}

	feedComment, err := service.buildSingleFeedComment(dbCtx, userObjectID, commentItem)
	if err != nil {
		return nil, err
	}

	return &CreateCommentResponse{
		Comment:       feedComment,
		CommentsCount: commentsCount,
	}, nil
}

func (service *CommentService) UpdateComment(
	ctx context.Context,
	authUserID string,
	commentID string,
	request UpdateCommentRequest,
) (*UpdateCommentResponse, error) {
	userObjectID, err := bson.ObjectIDFromHex(authUserID)
	if err != nil {
		return nil, errors.New("invalid user id")
	}

	commentObjectID, err := bson.ObjectIDFromHex(commentID)
	if err != nil {
		return nil, errors.New("invalid comment id")
	}

	text, err := cleanCommentText(request.Text)
	if err != nil {
		return nil, err
	}

	dbCtx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()

	existingComment, err := service.getCommentByID(dbCtx, commentObjectID, true)
	if err != nil {
		return nil, err
	}

	if existingComment.UserID != userObjectID {
		return nil, errors.New("only comment owner can edit this comment")
	}

	var updatedComment Comment

	err = service.commentsCollection.FindOneAndUpdate(
		dbCtx,
		bson.M{
			"_id":        commentObjectID,
			"user_id":    userObjectID,
			"is_deleted": bson.M{"$ne": true},
		},
		bson.M{
			"$set": bson.M{
				"text":       text,
				"updated_at": time.Now().UTC(),
			},
		},
		options.FindOneAndUpdate().SetReturnDocument(options.After),
	).Decode(&updatedComment)
	if err != nil {
		return nil, err
	}

	feedComment, err := service.buildSingleFeedComment(dbCtx, userObjectID, updatedComment)
	if err != nil {
		return nil, err
	}

	return &UpdateCommentResponse{
		Comment: feedComment,
	}, nil
}

func (service *CommentService) DeleteComment(
	ctx context.Context,
	authUserID string,
	commentID string,
) (*DeleteCommentResponse, error) {
	userObjectID, err := bson.ObjectIDFromHex(authUserID)
	if err != nil {
		return nil, errors.New("invalid user id")
	}

	commentObjectID, err := bson.ObjectIDFromHex(commentID)
	if err != nil {
		return nil, errors.New("invalid comment id")
	}

	dbCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	existingComment, err := service.getCommentByID(dbCtx, commentObjectID, true)
	if err != nil {
		return nil, err
	}

	if existingComment.UserID != userObjectID {
		return nil, errors.New("only comment owner can delete this comment")
	}

	commentIDsToDelete, err := service.collectCommentTreeIDs(dbCtx, commentObjectID)
	if err != nil {
		return nil, err
	}

	if len(commentIDsToDelete) == 0 {
		commentIDsToDelete = []bson.ObjectID{commentObjectID}
	}

	now := time.Now().UTC()

	_, err = service.commentsCollection.UpdateMany(
		dbCtx,
		bson.M{
			"_id": bson.M{
				"$in": commentIDsToDelete,
			},
			"is_deleted": bson.M{"$ne": true},
		},
		bson.M{
			"$set": bson.M{
				"text":          "",
				"is_deleted":    true,
				"updated_at":    now,
				"loves_count":   int64(0),
				"replies_count": int64(0),
			},
		},
	)
	if err != nil {
		return nil, err
	}

	_, _ = service.commentLovesCollection.DeleteMany(
		dbCtx,
		bson.M{
			"comment_id": bson.M{
				"$in": commentIDsToDelete,
			},
		},
	)

	if existingComment.ParentID != nil {
		_ = service.syncRepliesCount(dbCtx, *existingComment.ParentID)
	}

	commentsCount, err := service.syncPostCommentsCount(dbCtx, existingComment.PostID)
	if err != nil {
		return nil, err
	}

	return &DeleteCommentResponse{
		Deleted:       true,
		CommentsCount: commentsCount,
	}, nil
}

func (service *CommentService) ToggleCommentLove(
	ctx context.Context,
	authUserID string,
	commentID string,
) (*ToggleCommentLoveResponse, error) {
	userObjectID, err := bson.ObjectIDFromHex(authUserID)
	if err != nil {
		return nil, errors.New("invalid user id")
	}

	commentObjectID, err := bson.ObjectIDFromHex(commentID)
	if err != nil {
		return nil, errors.New("invalid comment id")
	}

	dbCtx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()

	if _, err := service.getCommentByID(dbCtx, commentObjectID, true); err != nil {
		return nil, err
	}

	loveFilter := bson.M{
		"comment_id": commentObjectID,
		"user_id":    userObjectID,
	}

	var existingLove CommentLove

	err = service.commentLovesCollection.FindOne(dbCtx, loveFilter).Decode(&existingLove)
	if err == nil {
		_, deleteErr := service.commentLovesCollection.DeleteOne(dbCtx, loveFilter)
		if deleteErr != nil {
			return nil, deleteErr
		}

		lovesCount, updateErr := service.syncCommentLovesCount(dbCtx, commentObjectID)
		if updateErr != nil {
			return nil, updateErr
		}

		return &ToggleCommentLoveResponse{
			Loved:      false,
			LovesCount: lovesCount,
		}, nil
	}

	if !errors.Is(err, mongo.ErrNoDocuments) {
		return nil, err
	}

	loveItem := CommentLove{
		ID:        bson.NewObjectID(),
		CommentID: commentObjectID,
		UserID:    userObjectID,
		CreatedAt: time.Now().UTC(),
	}

	_, err = service.commentLovesCollection.InsertOne(dbCtx, loveItem)
	if err != nil && !mongo.IsDuplicateKeyError(err) {
		return nil, err
	}

	lovesCount, err := service.syncCommentLovesCount(dbCtx, commentObjectID)
	if err != nil {
		return nil, err
	}

	return &ToggleCommentLoveResponse{
		Loved:      true,
		LovesCount: lovesCount,
	}, nil
}

func (service *CommentService) getCommentsByFilter(
	ctx context.Context,
	authUserID bson.ObjectID,
	baseFilter bson.M,
	limit int64,
	cursor string,
) (*CommentsResponse, error) {
	if limit <= 0 || limit > maxCommentLimit {
		limit = defaultCommentLimit
	}

	dbCtx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()

	filter := bson.M{}
	for key, value := range baseFilter {
		filter[key] = value
	}

	if cursor != "" {
		cursorTime, cursorID, err := decodeCommentCursor(cursor)
		if err == nil {
			filter["$and"] = bson.A{
				bson.M{
					"$or": bson.A{
						bson.M{"created_at": bson.M{"$lt": cursorTime}},
						bson.M{
							"created_at": cursorTime,
							"_id":        bson.M{"$lt": cursorID},
						},
					},
				},
			}
		}
	}

	findOptions := options.Find().
		SetSort(bson.D{
			{Key: "created_at", Value: -1},
			{Key: "_id", Value: -1},
		}).
		SetLimit(limit + 1)

	cursorResult, err := service.commentsCollection.Find(dbCtx, filter, findOptions)
	if err != nil {
		return nil, err
	}
	defer cursorResult.Close(dbCtx)

	var comments []Comment
	if err = cursorResult.All(dbCtx, &comments); err != nil {
		return nil, err
	}

	hasMore := int64(len(comments)) > limit
	if hasMore {
		comments = comments[:limit]
	}

	feedComments, err := service.buildFeedComments(dbCtx, authUserID, comments)
	if err != nil {
		return nil, err
	}

	nextCursor := ""
	if hasMore && len(comments) > 0 {
		lastComment := comments[len(comments)-1]
		nextCursor = encodeCommentCursor(lastComment.CreatedAt, lastComment.ID)
	}

	return &CommentsResponse{
		Comments:   feedComments,
		NextCursor: nextCursor,
		HasMore:    hasMore,
	}, nil
}

func (service *CommentService) buildSingleFeedComment(
	ctx context.Context,
	authUserID bson.ObjectID,
	item Comment,
) (FeedComment, error) {
	comments, err := service.buildFeedComments(ctx, authUserID, []Comment{item})
	if err != nil {
		return FeedComment{}, err
	}

	if len(comments) == 0 {
		return FeedComment{}, errors.New("comment not found")
	}

	return comments[0], nil
}

func (service *CommentService) buildFeedComments(
	ctx context.Context,
	authUserID bson.ObjectID,
	comments []Comment,
) ([]FeedComment, error) {
	if len(comments) == 0 {
		return []FeedComment{}, nil
	}

	userIDsMap := make(map[bson.ObjectID]bool)
	commentIDs := make([]bson.ObjectID, 0, len(comments))

	for _, item := range comments {
		userIDsMap[item.UserID] = true
		commentIDs = append(commentIDs, item.ID)
	}

	userIDs := make([]bson.ObjectID, 0, len(userIDsMap))
	for userID := range userIDsMap {
		userIDs = append(userIDs, userID)
	}

	usersMap, err := service.getUsersMap(ctx, userIDs)
	if err != nil {
		return nil, err
	}

	lovedMap, err := service.getLovedByMeMap(ctx, authUserID, commentIDs)
	if err != nil {
		return nil, err
	}

	feedComments := make([]FeedComment, 0, len(comments))

	for _, item := range comments {
		commentUser := usersMap[item.UserID]
		if commentUser.ID == bson.NilObjectID {
			commentUser.ID = item.UserID
		}

		feedComments = append(feedComments, FeedComment{
			ID:           item.ID,
			PostID:       item.PostID,
			UserID:       item.UserID,
			ParentID:     item.ParentID,
			User:         commentUser,
			Text:         item.Text,
			LovesCount:   item.LovesCount,
			RepliesCount: item.RepliesCount,
			IsLovedByMe:  lovedMap[item.ID],
			CanModify:    item.UserID == authUserID,
			IsDeleted:    item.IsDeleted,
			CreatedAt:    item.CreatedAt,
			UpdatedAt:    item.UpdatedAt,
		})
	}

	return feedComments, nil
}

func (service *CommentService) getUsersMap(
	ctx context.Context,
	userIDs []bson.ObjectID,
) (map[bson.ObjectID]CommentUser, error) {
	usersMap := make(map[bson.ObjectID]CommentUser)

	if len(userIDs) == 0 {
		return usersMap, nil
	}

	cursorResult, err := service.usersCollection.Find(
		ctx,
		bson.M{
			"_id": bson.M{
				"$in": userIDs,
			},
		},
		options.Find().SetProjection(bson.M{
			"first_name":        1,
			"last_name":         1,
			"profile_image_url": 1,
		}),
	)
	if err != nil {
		return nil, err
	}
	defer cursorResult.Close(ctx)

	var users []CommentUser
	if err = cursorResult.All(ctx, &users); err != nil {
		return nil, err
	}

	for _, item := range users {
		usersMap[item.ID] = item
	}

	return usersMap, nil
}

func (service *CommentService) getLovedByMeMap(
	ctx context.Context,
	authUserID bson.ObjectID,
	commentIDs []bson.ObjectID,
) (map[bson.ObjectID]bool, error) {
	lovedMap := make(map[bson.ObjectID]bool)

	if len(commentIDs) == 0 || authUserID == bson.NilObjectID {
		return lovedMap, nil
	}

	cursorResult, err := service.commentLovesCollection.Find(
		ctx,
		bson.M{
			"user_id": authUserID,
			"comment_id": bson.M{
				"$in": commentIDs,
			},
		},
		options.Find().SetProjection(bson.M{
			"comment_id": 1,
		}),
	)
	if err != nil {
		return nil, err
	}
	defer cursorResult.Close(ctx)

	var loves []CommentLove
	if err = cursorResult.All(ctx, &loves); err != nil {
		return nil, err
	}

	for _, item := range loves {
		lovedMap[item.CommentID] = true
	}

	return lovedMap, nil
}

func (service *CommentService) ensurePostExists(
	ctx context.Context,
	postID bson.ObjectID,
) error {
	err := service.postsCollection.FindOne(
		ctx,
		bson.M{
			"_id":        postID,
			"is_deleted": bson.M{"$ne": true},
		},
		options.FindOne().SetProjection(bson.M{
			"_id": 1,
		}),
	).Err()

	if errors.Is(err, mongo.ErrNoDocuments) {
		return errors.New("post not found")
	}

	return err
}

func (service *CommentService) getCommentByID(
	ctx context.Context,
	commentID bson.ObjectID,
	activeOnly bool,
) (Comment, error) {
	filter := bson.M{
		"_id": commentID,
	}

	if activeOnly {
		filter["is_deleted"] = bson.M{"$ne": true}
	}

	var item Comment

	err := service.commentsCollection.FindOne(ctx, filter).Decode(&item)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return Comment{}, errors.New("comment not found")
	}

	if err != nil {
		return Comment{}, err
	}

	return item, nil
}

func (service *CommentService) collectCommentTreeIDs(
	ctx context.Context,
	rootID bson.ObjectID,
) ([]bson.ObjectID, error) {
	allIDs := []bson.ObjectID{rootID}
	currentParentIDs := []bson.ObjectID{rootID}

	for len(currentParentIDs) > 0 {
		cursorResult, err := service.commentsCollection.Find(
			ctx,
			bson.M{
				"parent_id": bson.M{
					"$in": currentParentIDs,
				},
				"is_deleted": bson.M{"$ne": true},
			},
			options.Find().SetProjection(bson.M{
				"_id": 1,
			}),
		)
		if err != nil {
			return nil, err
		}

		var children []Comment
		if err = cursorResult.All(ctx, &children); err != nil {
			_ = cursorResult.Close(ctx)
			return nil, err
		}

		if err = cursorResult.Close(ctx); err != nil {
			return nil, err
		}

		if len(children) == 0 {
			break
		}

		nextParentIDs := make([]bson.ObjectID, 0, len(children))

		for _, child := range children {
			allIDs = append(allIDs, child.ID)
			nextParentIDs = append(nextParentIDs, child.ID)
		}

		currentParentIDs = nextParentIDs
	}

	return allIDs, nil
}

func (service *CommentService) syncPostCommentsCount(
	ctx context.Context,
	postID bson.ObjectID,
) (int64, error) {
	count, err := service.commentsCollection.CountDocuments(
		ctx,
		bson.M{
			"post_id":    postID,
			"is_deleted": bson.M{"$ne": true},
		},
	)
	if err != nil {
		return 0, err
	}

	_, err = service.postsCollection.UpdateOne(
		ctx,
		bson.M{"_id": postID},
		bson.M{
			"$set": bson.M{
				"comments_count": count,
				"updated_at":     time.Now().UTC(),
			},
		},
	)
	if err != nil {
		return 0, err
	}

	return count, nil
}

func (service *CommentService) syncRepliesCount(
	ctx context.Context,
	commentID bson.ObjectID,
) error {
	count, err := service.commentsCollection.CountDocuments(
		ctx,
		bson.M{
			"parent_id":  commentID,
			"is_deleted": bson.M{"$ne": true},
		},
	)
	if err != nil {
		return err
	}

	_, err = service.commentsCollection.UpdateOne(
		ctx,
		bson.M{"_id": commentID},
		bson.M{
			"$set": bson.M{
				"replies_count": count,
				"updated_at":    time.Now().UTC(),
			},
		},
	)

	return err
}

func (service *CommentService) syncCommentLovesCount(
	ctx context.Context,
	commentID bson.ObjectID,
) (int64, error) {
	count, err := service.commentLovesCollection.CountDocuments(
		ctx,
		bson.M{"comment_id": commentID},
	)
	if err != nil {
		return 0, err
	}

	_, err = service.commentsCollection.UpdateOne(
		ctx,
		bson.M{"_id": commentID},
		bson.M{
			"$set": bson.M{
				"loves_count": count,
				"updated_at":  time.Now().UTC(),
			},
		},
	)
	if err != nil {
		return 0, err
	}

	return count, nil
}

func cleanCommentText(text string) (string, error) {
	cleanText := strings.TrimSpace(text)

	if cleanText == "" {
		return "", errors.New("comment text is required")
	}

	if len([]rune(cleanText)) > maxCommentTextLength {
		return "", errors.New("comment text is too long")
	}

	return cleanText, nil
}

func encodeCommentCursor(createdAt time.Time, id bson.ObjectID) string {
	raw := createdAt.UTC().Format(time.RFC3339Nano) + "|" + id.Hex()
	return base64.RawURLEncoding.EncodeToString([]byte(raw))
}

func decodeCommentCursor(cursor string) (time.Time, bson.ObjectID, error) {
	decodedBytes, err := base64.RawURLEncoding.DecodeString(cursor)
	if err != nil {
		return time.Time{}, bson.NilObjectID, err
	}

	parts := strings.Split(string(decodedBytes), "|")
	if len(parts) != 2 {
		return time.Time{}, bson.NilObjectID, errors.New("invalid cursor")
	}

	createdAt, err := time.Parse(time.RFC3339Nano, parts[0])
	if err != nil {
		return time.Time{}, bson.NilObjectID, err
	}

	objectID, err := bson.ObjectIDFromHex(parts[1])
	if err != nil {
		return time.Time{}, bson.NilObjectID, err
	}

	return createdAt, objectID, nil
}