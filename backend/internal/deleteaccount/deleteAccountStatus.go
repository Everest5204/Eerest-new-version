package deleteaccount

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"go.mongodb.org/mongo-driver/v2/mongo/readconcern"
	"go.mongodb.org/mongo-driver/v2/mongo/readpref"
	"go.mongodb.org/mongo-driver/v2/mongo/writeconcern"
)

const (
	deletionStatusReadTimeout   = 8 * time.Second
	deletionStatusTokenLeeway   = 5 * time.Second
	maxDeletionStatusTokenSize = 4096
)

var (
	ErrInvalidDeletionToken = errors.New(
		"invalid account deletion status token",
	)

	ErrExpiredDeletionToken = errors.New(
		"account deletion status token has expired",
	)

	ErrDeletionStatusUnavailable = errors.New(
		"account deletion status is temporarily unavailable",
	)
)

// GetDeletionStatus accepts a deletion receipt, not a login token.
func (service *Service) GetDeletionStatus(
	ctx context.Context,
	rawToken string,
) (*DeleteAccountStatusResponse, error) {
	if service == nil ||
		service.db == nil ||
		service.users == nil ||
		service.jobs == nil ||
		len(service.statusTokenKey) == 0 {
		return nil, ErrDeletionUnavailable
	}

	userID, err := service.parseDeletionStatusToken(rawToken)
	if err != nil {
		return nil, err
	}

	readCtx, cancel := context.WithTimeout(
		ctx,
		deletionStatusReadTimeout,
	)
	defer cancel()

	session, err := service.db.Client().StartSession()
	if err != nil {
		return nil, fmt.Errorf(
			"%w: %w",
			ErrDeletionStatusUnavailable,
			err,
		)
	}
	defer session.EndSession(readCtx)

	transactionOptions := options.Transaction().
		SetReadConcern(readconcern.Snapshot()).
		SetReadPreference(readpref.Primary()).
		SetWriteConcern(writeconcern.Majority())

	result, err := session.WithTransaction(
		readCtx,
		func(txCtx context.Context) (any, error) {
			return service.readDeletionProgress(txCtx, userID)
		},
		transactionOptions,
	)
	if err != nil {
		return nil, fmt.Errorf(
			"%w: %w",
			ErrDeletionStatusUnavailable,
			err,
		)
	}

	progress, ok := result.(DeleteAccountProgressStatus)
	if !ok {
		return nil, ErrDeletionStatusUnavailable
	}

	return &DeleteAccountStatusResponse{
		Status: progress,
	}, nil
}

func (service *Service) parseDeletionStatusToken(
	rawToken string,
) (bson.ObjectID, error) {
	encodedToken := strings.TrimSpace(rawToken)

	if encodedToken == "" ||
		len(encodedToken) > maxDeletionStatusTokenSize {
		return bson.NilObjectID, ErrInvalidDeletionToken
	}

	claims := &jwt.RegisteredClaims{}

	token, err := jwt.ParseWithClaims(
		encodedToken,
		claims,
		func(_ *jwt.Token) (any, error) {
			return service.statusTokenKey, nil
		},
		jwt.WithValidMethods([]string{
			jwt.SigningMethodHS256.Alg(),
		}),
		jwt.WithIssuer(deletionStatusTokenIssuer),
		jwt.WithAudience(deletionStatusTokenAudience),
		jwt.WithExpirationRequired(),
		jwt.WithIssuedAt(),
		jwt.WithLeeway(deletionStatusTokenLeeway),
	)
	if err != nil {
		if errors.Is(err, jwt.ErrTokenExpired) {
			return bson.NilObjectID, ErrExpiredDeletionToken
		}

		return bson.NilObjectID, ErrInvalidDeletionToken
	}

	if token == nil ||
		!token.Valid ||
		claims.IssuedAt == nil ||
		claims.ExpiresAt == nil {
		return bson.NilObjectID, ErrInvalidDeletionToken
	}

	if !claims.ExpiresAt.Time.After(claims.IssuedAt.Time) {
		return bson.NilObjectID, ErrInvalidDeletionToken
	}

	userID, err := bson.ObjectIDFromHex(claims.Subject)
	if err != nil || userID == bson.NilObjectID {
		return bson.NilObjectID, ErrInvalidDeletionToken
	}

	return userID, nil
}

// Both reads must run inside the same snapshot transaction.
func (service *Service) readDeletionProgress(
	ctx context.Context,
	userID bson.ObjectID,
) (DeleteAccountProgressStatus, error) {
	filter := bson.D{
		{Key: "_id", Value: userID},
	}

	var job deletionJob

	jobErr := service.jobs.FindOne(
		ctx,
		filter,
		options.FindOne().SetProjection(bson.D{
			{Key: "_id", Value: 1},
			{Key: "status", Value: 1},
			{Key: "stage", Value: 1},
		}),
	).Decode(&job)

	jobMissing := errors.Is(jobErr, mongo.ErrNoDocuments)

	if jobErr != nil && !jobMissing {
		return "", jobErr
	}

	var user struct {
		DeletionRequested bool `bson:"deletion_requested"`
	}

	userErr := service.users.FindOne(
		ctx,
		filter,
		options.FindOne().SetProjection(bson.D{
			{Key: "_id", Value: 1},
			{Key: "deletion_requested", Value: 1},
		}),
	).Decode(&user)

	userMissing := errors.Is(userErr, mongo.ErrNoDocuments)

	if userErr != nil && !userMissing {
		return "", userErr
	}

	// A signed receipt is returned only after acceptance commits.
	// Final cleanup removes the user and job in one transaction.
	if jobMissing && userMissing {
		return DeleteAccountProgressDeleted, nil
	}

	// An inconsistent state must never be reported as completed.
	if jobMissing || userMissing || !user.DeletionRequested {
		return "", ErrDeletionStatusUnavailable
	}

	switch job.Status {
	case deletionStatusQueued,
		deletionStatusProcessing,
		deletionStatusRetry:
		// These states all mean cleanup is still pending.
	default:
		return "", ErrDeletionStatusUnavailable
	}

	switch job.Stage {
	case deletionStageCollectMedia,
		deletionStageDeleteMedia,
		deletionStageDeleteData:
		return DeleteAccountProgressProcessing, nil
	default:
		return "", ErrDeletionStatusUnavailable
	}
}