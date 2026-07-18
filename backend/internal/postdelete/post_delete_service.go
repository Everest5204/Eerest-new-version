package postdelete

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"everest-backend/internal/config"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"go.mongodb.org/mongo-driver/v2/mongo/writeconcern"
)

const (
	postDeleteStageTimeout       = 10 * time.Second
	postDeleteDatabaseTimeout    = 30 * time.Second
	postDeleteMediaTimeout       = 60 * time.Second
	postDeleteMediaWorkers       = 4
	postDeleteCommentBatchSize   = 500
	deleteMediaResourceImage     = "image"
	deleteMediaResourceVideo     = "video"
)

type PostDeleteService struct {
	client *mongo.Client

	postsCollection        *mongo.Collection
	commentsCollection     *mongo.Collection
	commentLovesCollection *mongo.Collection
	reactionsCollection    *mongo.Collection
	usersCollection        *mongo.Collection

	cloudinary *CloudinaryDeleteService
}

type deletePostDatabaseResult struct {
	DeletedComments     int64
	DeletedCommentLoves int64
	DeletedReactions    int64
	DeletedPost         int64
}

func NewPostDeleteService(
	db *mongo.Database,
	cfg config.Config,
) (*PostDeleteService, error) {
	if db == nil {
		return nil, errors.New("mongodb database is required")
	}

	cloudinaryService, err :=
	NewCloudinaryDeleteService(cfg)
	if err != nil {
		return nil, err
	}

	return &PostDeleteService{
		client: db.Client(),

		postsCollection:        db.Collection("posts"),
		commentsCollection:     db.Collection("comments"),
		commentLovesCollection: db.Collection("comment_loves"),
		reactionsCollection:    db.Collection("post_reactions"),
		usersCollection:        db.Collection("users"),

		cloudinary: cloudinaryService,
	}, nil
}

func (service *PostDeleteService) DeletePost(
	ctx context.Context,
	authUserID string,
	postID string,
) (*DeletePostResponse, error) {
	if service == nil {
		return nil, ErrDeletePostDatabaseCleanup
	}

	userObjectID, err := bson.ObjectIDFromHex(
		strings.TrimSpace(authUserID),
	)
	if err != nil {
		return nil, ErrDeletePostForbidden
	}

	postObjectID, err := bson.ObjectIDFromHex(
		strings.TrimSpace(postID),
	)
	if err != nil {
		return nil, ErrDeletePostInvalidID
	}

	// First transaction:
	// Verify ownership and hide the post from every feed.
	postDocument, err := service.stagePostForDelete(
		ctx,
		userObjectID,
		postObjectID,
	)
	if err != nil {
		return nil, err
	}

	mediaTargets := buildDeleteMediaTargets(postDocument)

	// Delete Cloudinary assets concurrently for better performance.
	mediaCtx, cancelMedia := context.WithTimeout(
		ctx,
		postDeleteMediaTimeout,
	)
	defer cancelMedia()

	deletedMedia, err := service.deletePostMedia(
		mediaCtx,
		mediaTargets,
	)
	if err != nil {
		return nil, fmt.Errorf(
			"%w: %v",
			ErrDeletePostMediaCleanup,
			err,
		)
	}

	// Second transaction:
	// Permanently remove every related MongoDB document.
	databaseResult, err := service.deletePostDatabaseRecords(
		ctx,
		postDocument,
	)
	if err != nil {
		return nil, err
	}

	return &DeletePostResponse{
		Deleted: true,
		PostID:  postDocument.ID.Hex(),

		DeletedComments: databaseResult.DeletedComments,
		DeletedCommentLoves: databaseResult.
			DeletedCommentLoves,
		DeletedReactions: databaseResult.DeletedReactions,
		DeletedMedia:     deletedMedia,
	}, nil
}

func (service *PostDeleteService) stagePostForDelete(
	ctx context.Context,
	userID bson.ObjectID,
	postID bson.ObjectID,
) (*deletePostDocument, error) {
	stageCtx, cancel := context.WithTimeout(
		ctx,
		postDeleteStageTimeout,
	)
	defer cancel()

	session, err := service.client.StartSession()
	if err != nil {
		return nil, fmt.Errorf(
			"%w: %v",
			ErrDeletePostDatabaseCleanup,
			err,
		)
	}
	defer session.EndSession(context.Background())

	transactionOptions := options.Transaction().
		SetWriteConcern(writeconcern.Majority())

	result, err := session.WithTransaction(
		stageCtx,
		func(transactionCtx context.Context) (any, error) {
			var postDocument deletePostDocument

			findErr := service.postsCollection.FindOne(
				transactionCtx,
				bson.M{
					"_id": postID,
				},
				options.FindOne().SetProjection(bson.M{
					"_id":        1,
					"user_id":    1,
					"media":      1,
					"media_id":   1,
					"media_type": 1,
					"is_deleted": 1,
				}),
			).Decode(&postDocument)

			if errors.Is(findErr, mongo.ErrNoDocuments) {
				return nil, ErrDeletePostNotFound
			}

			if findErr != nil {
				return nil, findErr
			}

			if postDocument.UserID != userID {
				return nil, ErrDeletePostForbidden
			}

			_, updateErr := service.postsCollection.UpdateOne(
				transactionCtx,
				bson.M{
					"_id":     postID,
					"user_id": userID,
				},
				bson.M{
					"$set": bson.M{
						"is_deleted": true,
						"updated_at": time.Now().UTC(),
					},
				},
			)
			if updateErr != nil {
				return nil, updateErr
			}

			return &postDocument, nil
		},
		transactionOptions,
	)
	if err != nil {
		if errors.Is(err, ErrDeletePostNotFound) ||
			errors.Is(err, ErrDeletePostForbidden) {
			return nil, err
		}

		return nil, fmt.Errorf(
			"%w: %v",
			ErrDeletePostDatabaseCleanup,
			err,
		)
	}

	postDocument, ok := result.(*deletePostDocument)
	if !ok || postDocument == nil {
		return nil, ErrDeletePostDatabaseCleanup
	}

	return postDocument, nil
}

func (service *PostDeleteService) deletePostDatabaseRecords(
	ctx context.Context,
	postDocument *deletePostDocument,
) (*deletePostDatabaseResult, error) {
	databaseCtx, cancel := context.WithTimeout(
		ctx,
		postDeleteDatabaseTimeout,
	)
	defer cancel()

	session, err := service.client.StartSession()
	if err != nil {
		return nil, fmt.Errorf(
			"%w: %v",
			ErrDeletePostDatabaseCleanup,
			err,
		)
	}
	defer session.EndSession(context.Background())

	transactionOptions := options.Transaction().
		SetWriteConcern(writeconcern.Majority())

	result, err := session.WithTransaction(
		databaseCtx,
		func(transactionCtx context.Context) (any, error) {
			return service.deletePostTransaction(
				transactionCtx,
				postDocument,
			)
		},
		transactionOptions,
	)
	if err != nil {
		return nil, fmt.Errorf(
			"%w: %v",
			ErrDeletePostDatabaseCleanup,
			err,
		)
	}

	databaseResult, ok := result.(*deletePostDatabaseResult)
	if !ok || databaseResult == nil {
		return nil, ErrDeletePostDatabaseCleanup
	}

	return databaseResult, nil
}

func (service *PostDeleteService) deletePostTransaction(
	ctx context.Context,
	postDocument *deletePostDocument,
) (*deletePostDatabaseResult, error) {
	commentIDs, err := service.getPostCommentIDs(
		ctx,
		postDocument.ID,
	)
	if err != nil {
		return nil, err
	}

	deletedCommentLoves, err :=
		service.deletePostCommentLoves(
			ctx,
			commentIDs,
		)
	if err != nil {
		return nil, err
	}

	commentsResult, err := service.commentsCollection.DeleteMany(
		ctx,
		bson.M{
			"post_id": postDocument.ID,
		},
	)
	if err != nil {
		return nil, err
	}

	reactionsResult, err := service.reactionsCollection.DeleteMany(
		ctx,
		bson.M{
			"post_id": postDocument.ID,
		},
	)
	if err != nil {
		return nil, err
	}

	postResult, err := service.postsCollection.DeleteOne(
		ctx,
		bson.M{
			"_id":     postDocument.ID,
			"user_id": postDocument.UserID,
		},
	)
	if err != nil {
		return nil, err
	}

	// Only the request that physically deletes the post
	// is allowed to decrease posts_count.
	if postResult.DeletedCount > 0 {
		_, err = service.usersCollection.UpdateOne(
			ctx,
			bson.M{
				"_id": postDocument.UserID,
				"posts_count": bson.M{
					"$gt": 0,
				},
			},
			bson.M{
				"$inc": bson.M{
					"posts_count": -1,
				},
				"$set": bson.M{
					"updated_at": time.Now().UTC(),
				},
			},
		)
		if err != nil {
			return nil, err
		}
	}

	return &deletePostDatabaseResult{
		DeletedComments:     commentsResult.DeletedCount,
		DeletedCommentLoves: deletedCommentLoves,
		DeletedReactions:    reactionsResult.DeletedCount,
		DeletedPost:         postResult.DeletedCount,
	}, nil
}

func (service *PostDeleteService) getPostCommentIDs(
	ctx context.Context,
	postID bson.ObjectID,
) ([]bson.ObjectID, error) {
	cursor, err := service.commentsCollection.Find(
		ctx,
		bson.M{
			"post_id": postID,
		},
		options.Find().SetProjection(bson.M{
			"_id": 1,
		}),
	)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var commentDocuments []deleteCommentDocument

	if err = cursor.All(ctx, &commentDocuments); err != nil {
		return nil, err
	}

	commentIDs := make(
		[]bson.ObjectID,
		0,
		len(commentDocuments),
	)

	for _, commentDocument := range commentDocuments {
		commentIDs = append(
			commentIDs,
			commentDocument.ID,
		)
	}

	return commentIDs, nil
}

func (service *PostDeleteService) deletePostCommentLoves(
	ctx context.Context,
	commentIDs []bson.ObjectID,
) (int64, error) {
	if len(commentIDs) == 0 {
		return 0, nil
	}

	var deletedCount int64

	for start := 0; start < len(commentIDs); start += postDeleteCommentBatchSize {
		end := start + postDeleteCommentBatchSize

		if end > len(commentIDs) {
			end = len(commentIDs)
		}

		result, err := service.commentLovesCollection.DeleteMany(
			ctx,
			bson.M{
				"comment_id": bson.M{
					"$in": commentIDs[start:end],
				},
			},
		)
		if err != nil {
			return deletedCount, err
		}

		deletedCount += result.DeletedCount
	}

	return deletedCount, nil
}

func (service *PostDeleteService) deletePostMedia(
	ctx context.Context,
	targets []deleteMediaTarget,
) (int, error) {
	if len(targets) == 0 {
		return 0, nil
	}

	workerCount := postDeleteMediaWorkers
	if len(targets) < workerCount {
		workerCount = len(targets)
	}

	jobs := make(chan deleteMediaTarget)
	results := make(chan error, len(targets))

	var waitGroup sync.WaitGroup

	worker := func() {
		defer waitGroup.Done()

		for target := range jobs {
			err := service.cloudinary.DeleteMedia(
				ctx,
				target.PublicID,
				target.ResourceType,
			)

			if err != nil {
				results <- fmt.Errorf(
					"media %s: %w",
					target.PublicID,
					err,
				)
				continue
			}

			results <- nil
		}
	}

	waitGroup.Add(workerCount)

	for index := 0; index < workerCount; index++ {
		go worker()
	}

	go func() {
		for _, target := range targets {
			jobs <- target
		}

		close(jobs)
		waitGroup.Wait()
		close(results)
	}()

	deletedCount := 0
	var firstError error

	for resultErr := range results {
		if resultErr != nil {
			if firstError == nil {
				firstError = resultErr
			}

			continue
		}

		deletedCount++
	}

	if firstError != nil {
		return deletedCount, firstError
	}

	return deletedCount, nil
}

func buildDeleteMediaTargets(
	postDocument *deletePostDocument,
) []deleteMediaTarget {
	if postDocument == nil {
		return nil
	}

	targets := make([]deleteMediaTarget, 0)
	seenTargets := make(map[string]struct{})

	addTarget := func(publicID string, resourceType string) {
		publicID = strings.TrimSpace(publicID)
		if publicID == "" {
			return
		}

		resourceType = normalizeDeleteMediaType(resourceType)

		targetKey := resourceType + ":" + publicID
		if _, exists := seenTargets[targetKey]; exists {
			return
		}

		seenTargets[targetKey] = struct{}{}

		targets = append(targets, deleteMediaTarget{
			PublicID:     publicID,
			ResourceType: resourceType,
		})
	}

	for _, mediaItem := range postDocument.Media {
		addTarget(
			mediaItem.PublicID,
			mediaItem.ResourceType,
		)
	}

	// Supports older posts that used media_id.
	addTarget(
		postDocument.MediaID,
		postDocument.MediaType,
	)

	return targets
}

func normalizeDeleteMediaType(resourceType string) string {
	if strings.EqualFold(
		strings.TrimSpace(resourceType),
		deleteMediaResourceVideo,
	) {
		return deleteMediaResourceVideo
	}

	return deleteMediaResourceImage
}