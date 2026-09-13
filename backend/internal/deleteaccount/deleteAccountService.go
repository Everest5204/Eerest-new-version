package deleteaccount

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"errors"
	"fmt"
	"strings"
	"time"

	"everest-backend/internal/config"
	"everest-backend/internal/postdelete"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"go.mongodb.org/mongo-driver/v2/mongo/readconcern"
	"go.mongodb.org/mongo-driver/v2/mongo/writeconcern"
)

const (
	deletionStatusTokenIssuer   = "mongosky"
	deletionStatusTokenAudience = "account-deletion-status"
	deletionStatusTokenLifetime = 7 * 24 * time.Hour

	deletionStatusKeyLabel = "mongosky:account-deletion:status:v1"
)

var (
	ErrInvalidUserID = errors.New(
		"invalid authenticated user ID",
	)

	ErrConfirmationRequired = errors.New(
		"please confirm account deletion",
	)

	ErrCurrentPasswordRequired = errors.New(
		"current password is required",
	)

	ErrInvalidCurrentPassword = errors.New(
		"current password is incorrect",
	)

	ErrPasswordNotConfigured = errors.New(
		"this account does not have a password",
	)

	ErrUserNotFound = errors.New(
		"account not found",
	)

	ErrDeletionUnavailable = errors.New(
		"account deletion is temporarily unavailable",
	)
)

type Service struct {
	db *mongo.Database

	users *mongo.Collection
	jobs  *mongo.Collection
	media *mongo.Collection

	mediaDeleter *postdelete.CloudinaryDeleteService

	statusTokenKey []byte
}

type deletionPasswordDocument struct {
	PasswordHash string `bson:"password"`
}

func NewService(
	db *mongo.Database,
	cfg config.Config,
) (*Service, error) {
	if db == nil {
		return nil, errors.New(
			"delete account database is not initialized",
		)
	}

	if strings.TrimSpace(cfg.JWTSecret) == "" {
		return nil, errors.New(
			"JWT secret is required for account deletion",
		)
	}

	mediaDeleter, err := postdelete.NewCloudinaryDeleteService(cfg)
	if err != nil {
		return nil, fmt.Errorf(
			"initialize account media deletion: %w",
			err,
		)
	}

	// Derive a separate signing key for deletion-status tokens.
	// These tokens must not authenticate normal account requests.
	keyMAC := hmac.New(
		sha256.New,
		[]byte(cfg.JWTSecret),
	)
	_, _ = keyMAC.Write([]byte(deletionStatusKeyLabel))

	durableCollectionOptions := options.Collection().
		SetWriteConcern(writeconcern.Majority())

	return &Service{
		db:    db,
		users: db.Collection("users"),
		jobs: db.Collection(
			deletionJobsCollection,
			durableCollectionOptions,
		),
		media: db.Collection(
			deletionMediaCollection,
			durableCollectionOptions,
		),
		mediaDeleter:   mediaDeleter,
		statusTokenKey: keyMAC.Sum(nil),
	}, nil
}

// Call during server startup before accepting deletion requests.
func (service *Service) EnsureIndexes(
	ctx context.Context,
) error {
	if service == nil || service.jobs == nil || service.media == nil {
		return ErrDeletionUnavailable
	}

	_, err := service.jobs.Indexes().CreateOne(
		ctx,
		mongo.IndexModel{
			Keys: bson.D{
				{Key: "status", Value: 1},
				{Key: "next_attempt_at", Value: 1},
				{Key: "lease_until", Value: 1},
			},
			Options: options.Index().
				SetName("account_deletion_worker_queue"),
		},
	)
	if err != nil {
		return fmt.Errorf(
			"create account deletion queue index: %w",
			err,
		)
	}

	_, err = service.media.Indexes().CreateOne(
		ctx,
		mongo.IndexModel{
			Keys: bson.D{
				{Key: "user_id", Value: 1},
				{Key: "public_id", Value: 1},
				{Key: "resource_type", Value: 1},
			},
			Options: options.Index().
				SetName("account_deletion_unique_media").
				SetUnique(true),
		},
	)
	if err != nil {
		return fmt.Errorf(
			"create account deletion media index: %w",
			err,
		)
	}

	return nil
}

func (service *Service) RequestDeletion(
	ctx context.Context,
	authenticatedUserID string,
	request DeleteAccountRequest,
) (*DeleteAccountResponse, error) {
	if service == nil ||
		service.db == nil ||
		service.users == nil ||
		service.jobs == nil ||
		len(service.statusTokenKey) == 0 {
		return nil, ErrDeletionUnavailable
	}

	if !request.Confirm {
		return nil, ErrConfirmationRequired
	}

	if request.CurrentPassword == "" {
		return nil, ErrCurrentPasswordRequired
	}

	// Existing account passwords use bcrypt.
	// Do not trim or otherwise modify the supplied password.
	if len(request.CurrentPassword) > 72 {
		return nil, ErrInvalidCurrentPassword
	}

	userID, err := bson.ObjectIDFromHex(
		strings.TrimSpace(authenticatedUserID),
	)
	if err != nil || userID.IsZero() {
		return nil, ErrInvalidUserID
	}

	requestCtx, cancel := context.WithTimeout(
		ctx,
		15*time.Second,
	)
	defer cancel()

	var account deletionPasswordDocument

	err = service.users.FindOne(
		requestCtx,
		bson.M{"_id": userID},
		options.FindOne().SetProjection(bson.M{
			"password": 1,
		}),
	).Decode(&account)

	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, ErrUserNotFound
	}
	if err != nil {
		return nil, fmt.Errorf(
			"read account password for deletion: %w",
			err,
		)
	}

	if account.PasswordHash == "" {
		return nil, ErrPasswordNotConfigured
	}

	passwordErr := bcrypt.CompareHashAndPassword(
		[]byte(account.PasswordHash),
		[]byte(request.CurrentPassword),
	)

	if err := requestCtx.Err(); err != nil {
		return nil, err
	}

	if errors.Is(passwordErr, bcrypt.ErrMismatchedHashAndPassword) {
		return nil, ErrInvalidCurrentPassword
	}
	if passwordErr != nil {
		return nil, fmt.Errorf(
			"verify account password for deletion: %w",
			passwordErr,
		)
	}

	// Prepare the receipt before committing.
	// It is returned to the client only after the transaction succeeds.
	deletionToken, err := service.createDeletionStatusToken(userID)
	if err != nil {
		return nil, fmt.Errorf(
			"create account deletion status token: %w",
			err,
		)
	}

	session, err := service.db.Client().StartSession()
	if err != nil {
		return nil, fmt.Errorf(
			"start account deletion session: %w",
			err,
		)
	}
	defer session.EndSession(context.Background())

	_, err = session.WithTransaction(
		requestCtx,
		func(transactionCtx context.Context) (any, error) {
			now := time.Now().UTC()

			// Match the exact hash that was verified.
			// A concurrent password change invalidates this request.
			accountResult, updateErr := service.users.UpdateOne(
				transactionCtx,
				bson.M{
					"_id":      userID,
					"password": account.PasswordHash,
				},
				bson.M{
					"$set": bson.M{
						"deletion_requested": true,
						"updated_at":         now,
					},
					"$unset": bson.M{
						"reset_code":        "",
						"reset_code_exp_at": "",
					},
				},
			)
			if updateErr != nil {
				return nil, updateErr
			}

			if accountResult.MatchedCount != 1 {
				findErr := service.users.FindOne(
					transactionCtx,
					bson.M{"_id": userID},
					options.FindOne().SetProjection(bson.M{
						"_id": 1,
					}),
				).Err()

				if errors.Is(findErr, mongo.ErrNoDocuments) {
					return nil, ErrUserNotFound
				}
				if findErr != nil {
					return nil, findErr
				}

				return nil, ErrInvalidCurrentPassword
			}

			job := deletionJob{
				ID:            userID,
				Status:        deletionStatusQueued,
				Stage:         deletionStageCollectMedia,
				Attempts:      0,
				NextAttemptAt: now,
				CreatedAt:     now,
				UpdatedAt:     now,
			}

			// Repeated requests retain the existing job's progress.
			_, queueErr := service.jobs.UpdateOne(
				transactionCtx,
				bson.M{"_id": userID},
				bson.M{
					"$setOnInsert": job,
				},
				options.UpdateOne().SetUpsert(true),
			)
			if queueErr != nil {
				return nil, queueErr
			}

			return nil, nil
		},
		options.Transaction().
			SetReadConcern(readconcern.Snapshot()).
			SetWriteConcern(writeconcern.Majority()),
	)
	if err != nil {
		switch {
		case errors.Is(err, ErrUserNotFound):
			return nil, ErrUserNotFound

		case errors.Is(err, ErrInvalidCurrentPassword):
			return nil, ErrInvalidCurrentPassword

		default:
			return nil, fmt.Errorf(
				"record account deletion request: %w",
				err,
			)
		}
	}

	return &DeleteAccountResponse{
		Message: "Your account deletion request has been accepted. " +
			"Cleanup will continue in the background.",
		Status:        "accepted",
		DeletionToken: deletionToken,
	}, nil
}

// A signed receipt authorizes reading deletion progress only.
// It contains no password and uses a separate signing key.
func (service *Service) createDeletionStatusToken(
	userID bson.ObjectID,
) (string, error) {
	now := time.Now().UTC()

	claims := jwt.RegisteredClaims{
		Issuer:  deletionStatusTokenIssuer,
		Subject: userID.Hex(),
		Audience: jwt.ClaimStrings{
			deletionStatusTokenAudience,
		},
		IssuedAt: jwt.NewNumericDate(now),
		ExpiresAt: jwt.NewNumericDate(
			now.Add(deletionStatusTokenLifetime),
		),
	}

	token := jwt.NewWithClaims(
		jwt.SigningMethodHS256,
		claims,
	)

	return token.SignedString(service.statusTokenKey)
}