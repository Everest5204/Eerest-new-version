package deleteaccount

import (
	"context"
	"errors"
	"log"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

const (
	deletionPollInterval      = 5 * time.Second
	deletionLeaseDuration     = 90 * time.Second
	deletionHeartbeatInterval = 20 * time.Second
	deletionOperationTimeout  = 10 * time.Second
	deletionMaxRetryDelay     = 5 * time.Minute
)

var errDeletionLeaseLost = errors.New(
	"account deletion worker lease is no longer valid",
)

// RunWorker runs until the server cancels its context.
// Start it after EnsureIndexes succeeds.
func (service *Service) RunWorker(ctx context.Context) {
	for {
		if ctx.Err() != nil {
			return
		}

		job, err := service.claimDeletionJob(ctx)

		if err == nil {
			service.runDeletionJob(ctx, *job)
			continue
		}

		if ctx.Err() != nil {
			return
		}

		if !errors.Is(err, mongo.ErrNoDocuments) {
			log.Print(
				"account deletion worker could not claim a job; retrying",
			)
		}

		timer := time.NewTimer(deletionPollInterval)

		select {
		case <-ctx.Done():
			timer.Stop()
			return

		case <-timer.C:
		}
	}
}

// Claim one queued job or reclaim a processing job whose lease expired.
// The atomic update gives this worker a new ownership token.
func (service *Service) claimDeletionJob(
	ctx context.Context,
) (*deletionJob, error) {
	operationCtx, cancel := context.WithTimeout(
		ctx,
		deletionOperationTimeout,
	)
	defer cancel()

	now := time.Now().UTC()
	leaseUntil := now.Add(deletionLeaseDuration)
	leaseToken := bson.NewObjectID().Hex()

	filter := bson.M{
		"$or": bson.A{
			bson.M{
				"status": bson.M{
					"$in": bson.A{
						deletionStatusQueued,
						deletionStatusRetry,
					},
				},
				"next_attempt_at": bson.M{"$lte": now},
			},
			bson.M{
				"status":      deletionStatusProcessing,
				"lease_until": bson.M{"$lte": now},
			},
		},
	}

	update := bson.M{
		"$set": bson.M{
			"status":      deletionStatusProcessing,
			"lease_token": leaseToken,
			"lease_until": leaseUntil,
			"updated_at":  now,
		},
		"$inc": bson.M{
			"attempts": 1,
		},
	}

	var job deletionJob

	err := service.jobs.FindOneAndUpdate(
		operationCtx,
		filter,
		update,
		options.FindOneAndUpdate().
			SetSort(bson.D{
				{Key: "next_attempt_at", Value: 1},
				{Key: "created_at", Value: 1},
			}).
			SetReturnDocument(options.After),
	).Decode(&job)
	if err != nil {
		return nil, err
	}

	return &job, nil
}

func (service *Service) runDeletionJob(
	ctx context.Context,
	job deletionJob,
) {
	jobCtx, cancelJob := context.WithCancel(ctx)
	heartbeatDone := make(chan struct{})

	go func() {
		defer close(heartbeatDone)

		service.keepDeletionLease(
			jobCtx,
			job,
			cancelJob,
		)
	}()

	runErr := service.runDeletionStages(jobCtx, job)

	cancelJob()
	<-heartbeatDone

	if runErr == nil || ctx.Err() != nil {
		return
	}

	if errors.Is(runErr, errDeletionLeaseLost) {
		return
	}

	// This update also checks ownership. A worker that has lost
	// its lease cannot overwrite another worker's progress.
	if err := service.scheduleDeletionRetry(ctx, job); err != nil {
		if !errors.Is(err, errDeletionLeaseLost) && ctx.Err() == nil {
			log.Print(
				"account deletion retry could not be scheduled; " +
					"the expired lease will allow recovery",
			)
		}
	}
}

// Renew ownership while storage or database cleanup is running.
// Cancel the job immediately if ownership cannot be renewed.
func (service *Service) keepDeletionLease(
	ctx context.Context,
	job deletionJob,
	cancelJob context.CancelFunc,
) {
	ticker := time.NewTicker(deletionHeartbeatInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return

		case <-ticker.C:
			if err := service.renewDeletionLease(ctx, job); err != nil {
				cancelJob()
				return
			}
		}
	}
}

func (service *Service) renewDeletionLease(
	ctx context.Context,
	job deletionJob,
) error {
	operationCtx, cancel := context.WithTimeout(
		ctx,
		deletionOperationTimeout,
	)
	defer cancel()

	now := time.Now().UTC()

	result, err := service.jobs.UpdateOne(
		operationCtx,
		deletionLeaseFilter(job),
		bson.M{
			"$set": bson.M{
				"lease_until": now.Add(deletionLeaseDuration),
				"updated_at":  now,
			},
		},
	)
	if err != nil {
		return err
	}

	if result.MatchedCount != 1 {
		return errDeletionLeaseLost
	}

	return nil
}

func (service *Service) runDeletionStages(
	ctx context.Context,
	job deletionJob,
) error {
	for {
		if err := ctx.Err(); err != nil {
			return err
		}

		switch job.Stage {
		case deletionStageCollectMedia:
			if err := service.collectAccountMedia(ctx, job); err != nil {
				return err
			}

			if err := service.advanceDeletionStage(
				ctx,
				job,
				deletionStageDeleteMedia,
			); err != nil {
				return err
			}

			job.Stage = deletionStageDeleteMedia

		case deletionStageDeleteMedia:
			if err := service.deleteAccountMedia(ctx, job); err != nil {
				return err
			}

			if err := service.advanceDeletionStage(
				ctx,
				job,
				deletionStageDeleteData,
			); err != nil {
				return err
			}

			job.Stage = deletionStageDeleteData

		case deletionStageDeleteData:
			// The database cleanup implementation must verify the
			// lease and remove the account and job only after all
			// required cleanup has succeeded.
			return service.deleteAccountData(ctx, job)

		default:
			return errors.New(
				"account deletion job has an unknown stage",
			)
		}
	}
}

func (service *Service) advanceDeletionStage(
	ctx context.Context,
	job deletionJob,
	nextStage deletionStage,
) error {
	operationCtx, cancel := context.WithTimeout(
		ctx,
		deletionOperationTimeout,
	)
	defer cancel()

	filter := deletionLeaseFilter(job)
	filter["stage"] = job.Stage

	result, err := service.jobs.UpdateOne(
		operationCtx,
		filter,
		bson.M{
			"$set": bson.M{
				"stage":      nextStage,
				"updated_at": time.Now().UTC(),
			},
			"$unset": bson.M{
				"last_error_code": "",
			},
		},
	)
	if err != nil {
		return err
	}

	if result.MatchedCount != 1 {
		return errDeletionLeaseLost
	}

	return nil
}

func (service *Service) scheduleDeletionRetry(
	ctx context.Context,
	job deletionJob,
) error {
	operationCtx, cancel := context.WithTimeout(
		ctx,
		deletionOperationTimeout,
	)
	defer cancel()

	now := time.Now().UTC()

	result, err := service.jobs.UpdateOne(
		operationCtx,
		deletionLeaseFilter(job),
		bson.M{
			"$set": bson.M{
				"status": deletionStatusRetry,
				"next_attempt_at": now.Add(
					deletionRetryDelay(job.Attempts),
				),
				"last_error_code": "deletion_retry_required",
				"updated_at":      now,
			},
			"$unset": bson.M{
				"lease_token": "",
				"lease_until": "",
			},
		},
	)
	if err != nil {
		return err
	}

	if result.MatchedCount != 1 {
		return errDeletionLeaseLost
	}

	return nil
}

func deletionLeaseFilter(job deletionJob) bson.M {
	return bson.M{
		"_id":         job.ID,
		"status":      deletionStatusProcessing,
		"lease_token": job.LeaseToken,
		"lease_until": bson.M{
			"$gt": time.Now().UTC(),
		},
	}
}

func deletionRetryDelay(attempts int64) time.Duration {
	delay := deletionPollInterval

	for attempt := int64(1); attempt < attempts; attempt++ {
		if delay >= deletionMaxRetryDelay {
			return deletionMaxRetryDelay
		}

		delay *= 2
	}

	if delay > deletionMaxRetryDelay {
		return deletionMaxRetryDelay
	}

	return delay
}