package deleteaccount

import (
	"context"
	"errors"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"go.mongodb.org/mongo-driver/v2/mongo/readconcern"
	"go.mongodb.org/mongo-driver/v2/mongo/writeconcern"
)

const (
	deletionDataBatchSize = 25
	deletionTxTimeout    = 25 * time.Second
)

type deletionDataRow struct {
	ID          bson.ObjectID  `bson:"_id"`
	PostID      bson.ObjectID  `bson:"post_id"`
	CommentID   bson.ObjectID  `bson:"comment_id"`
	ParentID    *bson.ObjectID `bson:"parent_id"`
	FollowerID  bson.ObjectID  `bson:"follower_id"`
	FollowingID bson.ObjectID  `bson:"following_id"`
}

type deletionDataFilter struct {
	collection string
	filter     bson.M
}

type deletionBatchCleanup func(
	context.Context,
	[]deletionDataRow,
) error

// This stage requires account writes and writes targeting the
// deleting account's content to have been blocked by integration.
func (service *Service) deleteAccountData(
	ctx context.Context,
	job deletionJob,
) error {
	if err := service.deleteAccountPosts(ctx, job); err != nil {
		return err
	}

	owned := bson.M{"user_id": job.ID}

	steps := []struct {
		collection string
		filter     bson.M
		cleanup    deletionBatchCleanup
	}{
		{
			collection: "comments",
			filter:     owned,
			cleanup: func(txCtx context.Context, rows []deletionDataRow) error {
				return service.cleanupDeletedComments(txCtx, rows, true)
			},
		},
		{
			collection: "post_reactions",
			filter:     owned,
			cleanup:    service.cleanupDeletedReactions,
		},
		{
			collection: "comment_loves",
			filter:     owned,
			cleanup:    service.cleanupDeletedCommentLoves,
		},
		{
			collection: "user_follows",
			filter: bson.M{
				"$or": bson.A{
					bson.M{"follower_id": job.ID},
					bson.M{"following_id": job.ID},
				},
			},
			cleanup: func(txCtx context.Context, rows []deletionDataRow) error {
				return service.cleanupDeletedFollows(txCtx, rows, job.ID)
			},
		},
		{
			collection: "ai_conversations",
			filter:     owned,
			cleanup: func(txCtx context.Context, rows []deletionDataRow) error {
				_, err := service.db.Collection("ai_messages").DeleteMany(
					txCtx,
					bson.M{
						"conversation_id": bson.M{
							"$in": deletionDataIDs(rows),
						},
					},
				)
				return err
			},
		},
		{
			collection: "ai_messages",
			filter:     owned,
		},
		{
			collection: "notifications",
			filter: bson.M{
				"$or": bson.A{
					bson.M{"actor_id": job.ID},
					bson.M{"recipient_id": job.ID},
				},
			},
		},
		// Saved references and revision tombstones belong to the deleting account.
		{collection: "saved_posts", filter: owned},
		{
			collection: "verified_badges",
			filter:     owned,
		},
	}

	for _, step := range steps {
		if err := service.purgeDeletionRows(
			ctx,
			job,
			step.collection,
			step.filter,
			step.cleanup,
		); err != nil {
			return err
		}
	}

	return service.finishAccountDeletion(ctx, job)
}

// Retain each post until its dependent records are removed.
// A retry can therefore still discover unfinished post cleanup.
func (service *Service) deleteAccountPosts(
	ctx context.Context,
	job deletionJob,
) error {
	posts := service.db.Collection("posts")

	for {
		if err := ctx.Err(); err != nil {
			return err
		}

		var post deletionDataRow

		err := posts.FindOne(
			ctx,
			bson.M{"user_id": job.ID},
			options.FindOne().SetProjection(bson.M{"_id": 1}),
		).Decode(&post)

		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil
		}
		if err != nil {
			return err
		}

		postFilter := bson.M{"post_id": post.ID}

		if err := service.purgeDeletionRows(
			ctx,
			job,
			"comments",
			postFilter,
			func(txCtx context.Context, rows []deletionDataRow) error {
				return service.cleanupDeletedComments(txCtx, rows, false)
			},
		); err != nil {
			return err
		}

		for _, collection := range []string{
			"post_reactions",
			"notifications",
		} {
			if err := service.purgeDeletionRows(
				ctx,
				job,
				collection,
				postFilter,
				nil,
			); err != nil {
				return err
			}
		}

		err = service.withDeletionTransaction(
			ctx,
			job,
			func(txCtx context.Context) error {
				for _, collection := range []string{
					"comments",
					"post_reactions",
					"notifications",
				} {
					if err := service.requireDeletionEmpty(
						txCtx,
						collection,
						postFilter,
					); err != nil {
						return err
					}
				}

				_, err := posts.DeleteOne(
					txCtx,
					bson.M{
						"_id":     post.ID,
						"user_id": job.ID,
					},
				)
				return err
			},
		)
		if err != nil {
			return err
		}
	}
}

// Delete a bounded group and repair its relationships in the same
// transaction. A failed transaction does not leave counters half-updated.
func (service *Service) purgeDeletionRows(
	ctx context.Context,
	job deletionJob,
	collectionName string,
	filter bson.M,
	cleanup deletionBatchCleanup,
) error {
	collection := service.db.Collection(collectionName)

	for {
		done := false

		err := service.withDeletionTransaction(
			ctx,
			job,
			func(txCtx context.Context) error {
				cursor, err := collection.Find(
					txCtx,
					filter,
					options.Find().
						SetLimit(deletionDataBatchSize).
						SetProjection(bson.M{
							"_id":          1,
							"post_id":      1,
							"comment_id":   1,
							"parent_id":    1,
							"follower_id":  1,
							"following_id": 1,
						}),
				)
				if err != nil {
					return err
				}
				defer cursor.Close(txCtx)

				var rows []deletionDataRow
				if err := cursor.All(txCtx, &rows); err != nil {
					return err
				}

				// Reset on every invocation because MongoDB can
				// retry the transaction callback.
				done = len(rows) == 0
				if done {
					return nil
				}

				_, err = collection.DeleteMany(
					txCtx,
					bson.M{
						"_id": bson.M{"$in": deletionDataIDs(rows)},
					},
				)
				if err != nil {
					return err
				}

				if cleanup != nil {
					return cleanup(txCtx, rows)
				}

				return nil
			},
		)
		if err != nil {
			return err
		}

		if done {
			return nil
		}
	}
}

func (service *Service) cleanupDeletedComments(
	ctx context.Context,
	rows []deletionDataRow,
	preserveReplies bool,
) error {
	ids := deletionDataIDs(rows)

	_, err := service.db.Collection("comment_loves").DeleteMany(
		ctx,
		bson.M{"comment_id": bson.M{"$in": ids}},
	)
	if err != nil {
		return err
	}

	_, err = service.db.Collection("notifications").DeleteMany(
		ctx,
		bson.M{
			"$or": bson.A{
				bson.M{"comment_id": bson.M{"$in": ids}},
				bson.M{"parent_id": bson.M{"$in": ids}},
			},
		},
	)
	if err != nil {
		return err
	}

	if !preserveReplies {
		return nil
	}

	// Keep surviving replies on other users' posts visible by
	// promoting them to root comments.
	_, err = service.db.Collection("comments").UpdateMany(
		ctx,
		bson.M{"parent_id": bson.M{"$in": ids}},
		bson.M{
			"$unset": bson.M{"parent_id": ""},
			"$set":   bson.M{"updated_at": time.Now().UTC()},
		},
	)
	if err != nil {
		return err
	}

	postIDs := make(map[bson.ObjectID]struct{})
	parentIDs := make(map[bson.ObjectID]struct{})

	for _, row := range rows {
		postIDs[row.PostID] = struct{}{}

		if row.ParentID != nil {
			parentIDs[*row.ParentID] = struct{}{}
		}
	}

	for postID := range postIDs {
		if err := service.syncDeletionCount(
			ctx,
			"posts",
			postID,
			"comments_count",
			"comments",
			bson.M{
				"post_id":    postID,
				"is_deleted": bson.M{"$ne": true},
			},
		); err != nil {
			return err
		}
	}

	for parentID := range parentIDs {
		if err := service.syncDeletionCount(
			ctx,
			"comments",
			parentID,
			"replies_count",
			"comments",
			bson.M{
				"parent_id":  parentID,
				"is_deleted": bson.M{"$ne": true},
			},
		); err != nil {
			return err
		}
	}

	return nil
}

func (service *Service) cleanupDeletedReactions(
	ctx context.Context,
	rows []deletionDataRow,
) error {
	postIDs := make(map[bson.ObjectID]struct{})

	for _, row := range rows {
		postIDs[row.PostID] = struct{}{}
	}

	for postID := range postIDs {
		if err := service.syncDeletionCount(
			ctx,
			"posts",
			postID,
			"likes_count",
			"post_reactions",
			bson.M{"post_id": postID},
		); err != nil {
			return err
		}
	}

	return nil
}

func (service *Service) cleanupDeletedCommentLoves(
	ctx context.Context,
	rows []deletionDataRow,
) error {
	commentIDs := make(map[bson.ObjectID]struct{})

	for _, row := range rows {
		commentIDs[row.CommentID] = struct{}{}
	}

	for commentID := range commentIDs {
		if err := service.syncDeletionCount(
			ctx,
			"comments",
			commentID,
			"loves_count",
			"comment_loves",
			bson.M{"comment_id": commentID},
		); err != nil {
			return err
		}
	}

	return nil
}

func (service *Service) cleanupDeletedFollows(
	ctx context.Context,
	rows []deletionDataRow,
	deletedUserID bson.ObjectID,
) error {
	userIDs := make(map[bson.ObjectID]struct{})

	for _, row := range rows {
		userIDs[row.FollowerID] = struct{}{}
		userIDs[row.FollowingID] = struct{}{}
	}

	delete(userIDs, deletedUserID)

	for userID := range userIDs {
		if err := service.syncDeletionCount(
			ctx,
			"users",
			userID,
			"followers_count",
			"user_follows",
			bson.M{"following_id": userID},
		); err != nil {
			return err
		}

		if err := service.syncDeletionCount(
			ctx,
			"users",
			userID,
			"following_count",
			"user_follows",
			bson.M{"follower_id": userID},
		); err != nil {
			return err
		}
	}

	return nil
}

// Recalculate from remaining records instead of decrementing a
// previously stored value, so retries cannot subtract twice.
func (service *Service) syncDeletionCount(
	ctx context.Context,
	targetCollection string,
	targetID bson.ObjectID,
	targetField string,
	sourceCollection string,
	sourceFilter bson.M,
) error {
	if targetID.IsZero() {
		return nil
	}

	count, err := service.db.Collection(sourceCollection).CountDocuments(
		ctx,
		sourceFilter,
	)
	if err != nil {
		return err
	}

	_, err = service.db.Collection(targetCollection).UpdateOne(
		ctx,
		bson.M{"_id": targetID},
		bson.M{
			"$set": bson.M{
				targetField: count,
				"updated_at": time.Now().UTC(),
			},
		},
	)
	return err
}

func (service *Service) withDeletionTransaction(
	ctx context.Context,
	job deletionJob,
	action func(context.Context) error,
) error {
	txCtx, cancel := context.WithTimeout(ctx, deletionTxTimeout)
	defer cancel()

	session, err := service.db.Client().StartSession()
	if err != nil {
		return err
	}
	defer session.EndSession(context.Background())

	_, err = session.WithTransaction(
		txCtx,
		func(transactionCtx context.Context) (any, error) {
			now := time.Now().UTC()

			filter := deletionLeaseFilter(job)
			filter["stage"] = deletionStageDeleteData

			// Writing the job inside every transaction fences out
			// an old worker after ownership changes.
			//
			// cleanup_revision is temporary internal job metadata;
			// it is removed with the completed job.
			result, err := service.jobs.UpdateOne(
				transactionCtx,
				filter,
				bson.M{
					"$inc": bson.M{"cleanup_revision": 1},
					"$set": bson.M{
						"lease_until": now.Add(deletionLeaseDuration),
						"updated_at":  now,
					},
				},
			)
			if err != nil {
				return nil, err
			}

			if result.MatchedCount != 1 {
				return nil, errDeletionLeaseLost
			}

			if err := action(transactionCtx); err != nil {
				return nil, err
			}

			return nil, nil
		},
		options.Transaction().
			SetReadConcern(readconcern.Snapshot()).
			SetWriteConcern(writeconcern.Majority()),
	)

	return err
}

func (service *Service) finishAccountDeletion(
	ctx context.Context,
	job deletionJob,
) error {
	return service.withDeletionTransaction(
		ctx,
		job,
		func(txCtx context.Context) error {
			owned := bson.M{"user_id": job.ID}

			checks := []deletionDataFilter{
				{"posts", owned},
				{"comments", owned},
				{"post_reactions", owned},
				{"comment_loves", owned},
				{"ai_conversations", owned},
				{"ai_messages", owned},
				{"verified_badges", owned},
				{deletionMediaCollection, owned},
				{
					"user_follows",
					bson.M{
						"$or": bson.A{
							bson.M{"follower_id": job.ID},
							bson.M{"following_id": job.ID},
						},
					},
				},
				{
					"notifications",
					bson.M{
						"$or": bson.A{
							bson.M{"actor_id": job.ID},
							bson.M{"recipient_id": job.ID},
						},
					},
				},
			}

			for _, check := range checks {
				if err := service.requireDeletionEmpty(
					txCtx,
					check.collection,
					check.filter,
				); err != nil {
					return err
				}
			}

			accountResult, err := service.users.DeleteOne(
				txCtx,
				bson.M{
					"_id":                job.ID,
					"deletion_requested": true,
				},
			)
			if err != nil {
				return err
			}

			if accountResult.DeletedCount != 1 {
				return errors.New(
					"account is missing or is not marked for deletion",
				)
			}

			jobResult, err := service.jobs.DeleteOne(
				txCtx,
				deletionLeaseFilter(job),
			)
			if err != nil {
				return err
			}

			if jobResult.DeletedCount != 1 {
				return errDeletionLeaseLost
			}

			return nil
		},
	)
}

func (service *Service) requireDeletionEmpty(
	ctx context.Context,
	collection string,
	filter bson.M,
) error {
	err := service.db.Collection(collection).FindOne(
		ctx,
		filter,
		options.FindOne().SetProjection(bson.M{"_id": 1}),
	).Err()

	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil
	}
	if err != nil {
		return err
	}

	return errors.New(
		"account deletion still has related records to clean up",
	)
}

func deletionDataIDs(rows []deletionDataRow) []bson.ObjectID {
	ids := make([]bson.ObjectID, 0, len(rows))

	for _, row := range rows {
		ids = append(ids, row.ID)
	}

	return ids
}