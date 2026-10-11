package deactivateaccount

import (
	"context"
	"errors"
	"regexp"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"golang.org/x/crypto/bcrypt"
)

var operationPattern = regexp.MustCompile(`^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$`)

type Service struct {
	store accountStore
	now   func() time.Time
}

func NewService(db *mongo.Database) (*Service, error) {
	if db == nil {
		return nil, errors.New("deactivate account: database is required")
	}
	return &Service{store: newMongoStore(db), now: func() time.Time { return time.Now().UTC() }}, nil
}

func (s *Service) EnsureIndexes(ctx context.Context) error {
	store, ok := s.store.(*mongoStore)
	if !ok {
		return nil
	}
	return store.ensureIndexes(ctx)
}

// Only a verified password plus a matching session may change the account.
// A repeated operation can confirm its result without undoing deactivation.
func (s *Service) Deactivate(ctx context.Context, userID string, version int64, request Request) (*Response, error) {
	if !request.Confirm || request.CurrentPassword == "" || len(request.CurrentPassword) > 72 || !operationPattern.MatchString(request.OperationID) {
		return nil, ErrInvalidRequest
	}
	id, err := bson.ObjectIDFromHex(userID)
	if err != nil || id.IsZero() || version < 0 {
		return nil, ErrSessionExpired
	}
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	account, err := s.store.Read(ctx, id)
	if err != nil {
		return nil, err
	}
	if account.DeletionRequested {
		return nil, ErrDeleting
	}
	isRetry := account.Deactivated && account.OperationID == request.OperationID && account.PreviousSessionVersion == version && account.SessionVersion == version+1
	if (!account.Deactivated && account.SessionVersion != version) || (account.Deactivated && !isRetry) {
		return nil, ErrSessionExpired
	}
	allowed, err := s.store.TakeAttempt(ctx, id, s.now())
	if err != nil {
		return nil, ErrUnavailable
	}
	if !allowed {
		return nil, ErrRateLimited
	}
	if account.PasswordHash == "" {
		return nil, ErrPasswordRequired
	}
	if bcrypt.CompareHashAndPassword([]byte(account.PasswordHash), []byte(request.CurrentPassword)) != nil {
		return nil, ErrWrongPassword
	}
	if err := ctx.Err(); err != nil {
		return nil, ErrUnavailable
	}
	if isRetry {
		return result(account), nil
	}
	updated, err := s.store.Deactivate(ctx, account, request.OperationID, s.now())
	if err != nil {
		// A concurrent identical request may have already committed.
		latest, readErr := s.store.Read(ctx, id)
		if readErr == nil && latest.Deactivated && !latest.DeletionRequested && latest.OperationID == request.OperationID && latest.PreviousSessionVersion == version && latest.SessionVersion == version+1 && latest.PasswordHash == account.PasswordHash {
			return result(latest), nil
		}
		return nil, ErrUnavailable
	}
	return result(updated), nil
}

func result(account Account) *Response {
	return &Response{Status: "deactivated", OperationID: account.OperationID, DeactivatedAt: account.DeactivatedAt}
}
