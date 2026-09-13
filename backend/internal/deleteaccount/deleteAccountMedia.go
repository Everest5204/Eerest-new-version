package deleteaccount

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"go.mongodb.org/mongo-driver/v2/mongo/readconcern"
	"go.mongodb.org/mongo-driver/v2/mongo/readpref"
	"go.mongodb.org/mongo-driver/v2/mongo/writeconcern"
)

const (
	accountMediaBatchSize = 100
	accountMediaWorkers   = 4
)

type accountMediaProfile struct {
	ProfileImageID  string `bson:"profile_image_id"`
	ProfileImageURL string `bson:"profile_image_url"`
	CoverImageID    string `bson:"cover_image_id"`
	CoverImageURL   string `bson:"cover_image_url"`
}

type accountMediaItem struct {
	ID   string `bson:"id"`
	URL  string `bson:"url"`
	Type string `bson:"type"`
}

type accountMediaPost struct {
	Type      string             `bson:"type"`
	Media     []accountMediaItem `bson:"media"`
	MediaID   string             `bson:"media_id"`
	MediaURL  string             `bson:"media_url"`
	MediaType string             `bson:"media_type"`
}

// Update the job and its media queue in the same transaction.
// Writing the job first prevents an old owner from committing queue changes
// after another worker has claimed the job.
func (service *Service) withAccountMediaLease(
	ctx context.Context,
	job deletionJob,
	stage deletionStage,
	operation func(context.Context) error,
) error {
	if err := ctx.Err(); err != nil {
		return err
	}

	if job.ID.IsZero() || job.LeaseToken == "" || job.Stage != stage {
		return errDeletionLeaseLost
	}

	operationCtx, cancel := context.WithTimeout(ctx, deletionOperationTimeout)
	defer cancel()

	session, err := service.db.Client().StartSession()
	if err != nil {
		return fmt.Errorf("start account media session: %w", err)
	}
	defer func() {
		closeCtx, closeCancel := context.WithTimeout(
			context.Background(), deletionOperationTimeout,
		)
		defer closeCancel()
		session.EndSession(closeCtx)
	}()

	_, err = session.WithTransaction(
		operationCtx,
		func(txCtx context.Context) (any, error) {
			filter := deletionLeaseFilter(job)
			filter["stage"] = stage
			now := time.Now().UTC()

			result, err := service.jobs.UpdateOne(txCtx, filter, bson.M{
				"$inc": bson.M{"cleanup_revision": int64(1)},
				"$set": bson.M{
					"lease_until": now.Add(deletionLeaseDuration),
					"updated_at":  now,
				},
			})
			if err != nil {
				return nil, err
			}
			if result.MatchedCount != 1 {
				return nil, errDeletionLeaseLost
			}

			return nil, operation(txCtx)
		},
		options.Transaction().
			SetReadConcern(readconcern.Snapshot()).
			SetWriteConcern(writeconcern.Majority()).
			SetReadPreference(readpref.Primary()),
	)
	if err != nil {
		return fmt.Errorf("account media transaction: %w", err)
	}

	return nil
}

// Account writes, including uploads already in progress, must be blocked
// before collection starts. Keep source documents until collection finishes.
func (service *Service) collectAccountMedia(
	ctx context.Context,
	job deletionJob,
) error {
	userID := job.ID
	pending := make([]mongo.WriteModel, 0, accountMediaBatchSize)

	flush := func() error {
		if len(pending) == 0 {
			return nil
		}

		err := service.withAccountMediaLease(
			ctx, job, deletionStageCollectMedia,
			func(txCtx context.Context) error {
				_, err := service.media.BulkWrite(
					txCtx, pending, options.BulkWrite().SetOrdered(true),
				)
				return err
			},
		)
		if err != nil {
			return fmt.Errorf("record account media: %w", err)
		}

		pending = pending[:0]
		return nil
	}

	addMedia := func(publicID, mediaURL, resourceType string) error {
		publicID = strings.TrimSpace(publicID)
		mediaURL = strings.TrimSpace(mediaURL)
		resourceType = strings.ToLower(strings.TrimSpace(resourceType))

		if publicID == "" {
			if mediaURL != "" {
				return errors.New(
					"media URL exists without a public ID; " +
						"ownership must be resolved before deletion",
				)
			}
			return nil
		}
		if resourceType != "image" && resourceType != "video" {
			return errors.New(
				"account media has an unsupported or missing resource type",
			)
		}

		filter := bson.M{
			"user_id":       userID,
			"public_id":     publicID,
			"resource_type": resourceType,
		}
		model := mongo.NewUpdateOneModel().
			SetFilter(filter).
			SetUpdate(bson.M{
				"$setOnInsert": bson.M{
					"_id":           bson.NewObjectID(),
					"user_id":       userID,
					"public_id":     publicID,
					"resource_type": resourceType,
					"created_at":    time.Now().UTC(),
				},
			}).
			SetUpsert(true)

		pending = append(pending, model)
		if len(pending) >= accountMediaBatchSize {
			return flush()
		}
		return nil
	}

	var profile accountMediaProfile
	err := service.withAccountMediaLease(
		ctx, job, deletionStageCollectMedia,
		func(txCtx context.Context) error {
			return service.users.FindOne(
				txCtx,
				bson.M{"_id": userID, "deletion_requested": true},
				options.FindOne().SetProjection(bson.M{
					"profile_image_id":  1,
					"profile_image_url": 1,
					"cover_image_id":    1,
					"cover_image_url":   1,
				}),
			).Decode(&profile)
		},
	)
	if err != nil {
		return fmt.Errorf("read account media references: %w", err)
	}

	if err := addMedia(profile.ProfileImageID, profile.ProfileImageURL, "image"); err != nil {
		return err
	}
	if err := addMedia(profile.CoverImageID, profile.CoverImageURL, "image"); err != nil {
		return err
	}

	// Hidden and soft-deleted posts can still reference stored assets.
	cursor, err := service.db.Collection("posts").Find(
		ctx, bson.M{"user_id": userID},
		options.Find().
			SetBatchSize(accountMediaBatchSize).
			SetProjection(bson.M{
				"type": 1, "media": 1,
				"media_id": 1, "media_url": 1, "media_type": 1,
			}),
	)
	if err != nil {
		return fmt.Errorf("read account post media: %w", err)
	}
	defer func() {
		closeCtx, cancel := context.WithTimeout(
			context.Background(), deletionOperationTimeout,
		)
		defer cancel()
		_ = cursor.Close(closeCtx)
	}()

	for cursor.Next(ctx) {
		var post accountMediaPost
		if err := cursor.Decode(&post); err != nil {
			return fmt.Errorf("decode account post media: %w", err)
		}

		for _, item := range post.Media {
			if err := addMedia(item.ID, item.URL, item.Type); err != nil {
				return err
			}
		}

		// Older posts store one asset outside the media array.
		resourceType := strings.ToLower(strings.TrimSpace(post.MediaType))
		if resourceType == "" {
			switch strings.ToLower(strings.TrimSpace(post.Type)) {
			case "image", "profile_photo_update", "cover_photo_update":
				resourceType = "image"
			case "video":
				resourceType = "video"
			}
		}
		if err := addMedia(post.MediaID, post.MediaURL, resourceType); err != nil {
			return err
		}
	}
	if err := cursor.Err(); err != nil {
		return fmt.Errorf("iterate account post media: %w", err)
	}

	return flush()
}

func (service *Service) deleteAccountMedia(
	ctx context.Context,
	job deletionJob,
) error {
	for {
		var targets []deletionMedia
		err := service.withAccountMediaLease(
			ctx, job, deletionStageDeleteMedia,
			func(txCtx context.Context) error {
				cursor, err := service.media.Find(
					txCtx, bson.M{"user_id": job.ID},
					options.Find().
						SetSort(bson.D{{Key: "_id", Value: 1}}).
						SetLimit(accountMediaBatchSize),
				)
				if err != nil {
					return err
				}
				defer cursor.Close(txCtx)

				var batch []deletionMedia
				if err := cursor.All(txCtx, &batch); err != nil {
					return err
				}
				targets = batch
				return nil
			},
		)
		if err != nil {
			return fmt.Errorf("read pending account media: %w", err)
		}
		if len(targets) == 0 {
			return nil
		}
		if err := service.deleteAccountMediaBatch(ctx, job, targets); err != nil {
			return err
		}
	}
}

func (service *Service) deleteAccountMediaBatch(
	ctx context.Context,
	job deletionJob,
	targets []deletionMedia,
) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if job.ID.IsZero() || job.LeaseToken == "" || job.Stage != deletionStageDeleteMedia {
		return errDeletionLeaseLost
	}
	if len(targets) == 0 {
		return nil
	}

	for _, target := range targets {
		if target.ID.IsZero() || target.UserID != job.ID ||
			strings.TrimSpace(target.PublicID) == "" ||
			(target.ResourceType != "image" && target.ResourceType != "video") {
			return errors.New("account media target has invalid ownership or metadata")
		}
	}

	batchCtx, cancelBatch := context.WithCancel(ctx)
	defer cancelBatch()

	type mediaResult struct {
		target deletionMedia
		err    error
	}
	tasks := make(chan deletionMedia, len(targets))
	results := make(chan mediaResult, len(targets))
	for _, target := range targets {
		tasks <- target
	}
	close(tasks)

	var workers sync.WaitGroup
	workerCount := min(accountMediaWorkers, len(targets))
	workers.Add(workerCount)
	for index := 0; index < workerCount; index++ {
		go func() {
			defer workers.Done()
			for target := range tasks {
				if err := batchCtx.Err(); err != nil {
					results <- mediaResult{target: target, err: err}
					return
				}

				if err := service.renewDeletionLease(batchCtx, job); err != nil {
					results <- mediaResult{target: target, err: err}
					cancelBatch()
					return
				}

				// Keep external requests outside MongoDB transactions.
				// DeleteMedia must accept "not found" as a successful retry.
				err := service.mediaDeleter.DeleteMedia(
					batchCtx, target.PublicID, target.ResourceType,
				)
				if err != nil {
					err = fmt.Errorf("delete account media from storage: %w", err)
				}
				results <- mediaResult{target: target, err: err}
			}
		}()
	}

	workers.Wait()
	close(results)

	completed := make([]mongo.WriteModel, 0, len(targets))
	var failures []error
	for result := range results {
		if result.err != nil {
			failures = append(failures, result.err)
			continue
		}
		completed = append(completed, mongo.NewDeleteOneModel().SetFilter(bson.M{
			"_id":           result.target.ID,
			"user_id":       job.ID,
			"public_id":     result.target.PublicID,
			"resource_type": result.target.ResourceType,
		}))
	}

	if len(completed) > 0 {
		// An old owner may finish an in-flight storage request, but it
		// cannot remove queue entries after its lease has changed.
		err := service.withAccountMediaLease(
			ctx, job, deletionStageDeleteMedia,
			func(txCtx context.Context) error {
				_, err := service.media.BulkWrite(
					txCtx, completed, options.BulkWrite().SetOrdered(true),
				)
				return err
			},
		)
		if err != nil {
			failures = append(failures,
				fmt.Errorf("clear completed account media targets: %w", err),
			)
		}
	}

	if err := ctx.Err(); err != nil {
		failures = append(failures, err)
	}
	return errors.Join(failures...)
}