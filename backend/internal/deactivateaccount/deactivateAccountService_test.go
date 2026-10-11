package deactivateaccount

import (
	"context"
	"errors"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"golang.org/x/crypto/bcrypt"
)

const testOperation = "12345678-1234-4234-8234-123456789abc"
const testOtherOperation = "12345678-1234-4234-8234-123456789abd"

type fakeStore struct {
	account     Account
	attempts    int
	writes      int
	beforeWrite func(*fakeStore)
	unavailable bool
}

func (s *fakeStore) Read(context.Context, bson.ObjectID) (Account, error) {
	if s.unavailable {
		return Account{}, ErrUnavailable
	}
	return s.account, nil
}
func (s *fakeStore) TakeAttempt(context.Context, bson.ObjectID, time.Time) (bool, error) {
	s.attempts++
	return s.attempts <= 5, nil
}
func (s *fakeStore) Deactivate(_ context.Context, original Account, operation string, now time.Time) (Account, error) {
	if s.beforeWrite != nil {
		s.beforeWrite(s)
	}
	if s.account.DeletionRequested || s.account.Deactivated || s.account.PasswordHash != original.PasswordHash || s.account.SessionVersion != original.SessionVersion {
		return Account{}, ErrUnavailable
	}
	s.writes++
	s.account.Deactivated = true
	s.account.DeactivatedAt = now
	s.account.OperationID = operation
	s.account.PreviousSessionVersion = original.SessionVersion
	s.account.SessionVersion++
	return s.account, nil
}
func serviceFixture(t *testing.T) (*Service, *fakeStore, Request) {
	t.Helper()
	hash, err := bcrypt.GenerateFromPassword([]byte(" exact password "), bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	store := &fakeStore{account: Account{ID: bson.NewObjectID(), PasswordHash: string(hash)}}
	return &Service{store: store, now: func() time.Time { return time.Date(2026, 10, 11, 1, 2, 3, 0, time.UTC) }}, store, Request{Confirm: true, CurrentPassword: " exact password ", OperationID: testOperation}
}
func TestConfirmationAndExactPassword(t *testing.T) {
	s, store, req := serviceFixture(t)
	req.Confirm = false
	if _, err := s.Deactivate(context.Background(), store.account.ID.Hex(), 0, req); !errors.Is(err, ErrInvalidRequest) {
		t.Fatal(err)
	}
	req.Confirm = true
	req.CurrentPassword = "exact password"
	if _, err := s.Deactivate(context.Background(), store.account.ID.Hex(), 0, req); !errors.Is(err, ErrWrongPassword) {
		t.Fatal(err)
	}
	if store.writes != 0 || store.account.Deactivated {
		t.Fatal("unconfirmed or wrong-password request changed account")
	}
}
func TestSameOperationRetryIsIdempotent(t *testing.T) {
	s, store, req := serviceFixture(t)
	first, err := s.Deactivate(context.Background(), store.account.ID.Hex(), 0, req)
	if err != nil {
		t.Fatal(err)
	}
	second, err := s.Deactivate(context.Background(), store.account.ID.Hex(), 0, req)
	if err != nil {
		t.Fatal(err)
	}
	if *first != *second || store.writes != 1 || store.account.SessionVersion != 1 {
		t.Fatal("retry changed account twice")
	}
	req.OperationID = testOtherOperation
	if _, err := s.Deactivate(context.Background(), store.account.ID.Hex(), 0, req); !errors.Is(err, ErrSessionExpired) {
		t.Fatal(err)
	}
}
func TestOldOperationCannotDeactivateReactivatedAccount(t *testing.T) {
	s, store, req := serviceFixture(t)
	_, err := s.Deactivate(context.Background(), store.account.ID.Hex(), 0, req)
	if err != nil {
		t.Fatal(err)
	}
	store.account.Deactivated = false
	store.account.SessionVersion = 2
	if _, err := s.Deactivate(context.Background(), store.account.ID.Hex(), 0, req); !errors.Is(err, ErrSessionExpired) {
		t.Fatal(err)
	}
	if store.account.Deactivated || store.writes != 1 {
		t.Fatal("revoked token affected new session")
	}
}
func TestConcurrentPasswordDeletionAndVersionChangesAreRejected(t *testing.T) {
	for _, change := range []func(*fakeStore){func(s *fakeStore) { s.account.PasswordHash = "changed" }, func(s *fakeStore) { s.account.DeletionRequested = true }, func(s *fakeStore) { s.account.SessionVersion++ }} {
		s, store, req := serviceFixture(t)
		store.beforeWrite = change
		if _, err := s.Deactivate(context.Background(), store.account.ID.Hex(), 0, req); err == nil {
			t.Fatal("concurrent change incorrectly accepted")
		}
		if store.writes != 0 {
			t.Fatal("concurrent change was overwritten")
		}
	}
}
func TestRateLimitAndDatabaseFailureNeverReportSuccess(t *testing.T) {
	s, store, req := serviceFixture(t)
	store.attempts = 5
	if _, err := s.Deactivate(context.Background(), store.account.ID.Hex(), 0, req); !errors.Is(err, ErrRateLimited) {
		t.Fatal(err)
	}
	store.unavailable = true
	if _, err := s.Deactivate(context.Background(), store.account.ID.Hex(), 0, req); !errors.Is(err, ErrUnavailable) {
		t.Fatal(err)
	}
	if store.writes != 0 {
		t.Fatal("failure modified account")
	}
}
