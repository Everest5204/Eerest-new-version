package deactivateaccount

import (
	"context"
	"errors"
	"fmt"
	"time"

	"everest-backend/internal/accountstate"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"go.mongodb.org/mongo-driver/v2/mongo/readconcern"
	"go.mongodb.org/mongo-driver/v2/mongo/readpref"
	"go.mongodb.org/mongo-driver/v2/mongo/writeconcern"
)

type mongoStore struct{ users, attempts *mongo.Collection }

func newMongoStore(db *mongo.Database) *mongoStore {
	opts := options.Collection().SetReadPreference(readpref.Primary()).SetReadConcern(readconcern.Majority()).SetWriteConcern(writeconcern.Majority())
	return &mongoStore{users: db.Collection("users", opts), attempts: db.Collection("account_deactivation_attempts", opts)}
}

func (s *mongoStore) ensureIndexes(ctx context.Context) error {
	_, err := s.attempts.Indexes().CreateOne(ctx, mongo.IndexModel{Keys: bson.D{{Key: "expires_at", Value: 1}}, Options: options.Index().SetName("deactivation_attempt_expiry").SetExpireAfterSeconds(0)})
	return err
}

func (s *mongoStore) Read(ctx context.Context, id bson.ObjectID) (Account, error) {
	var account Account
	err := s.users.FindOne(ctx, bson.M{"_id": id}, options.FindOne().SetProjection(bson.M{"_id": 1, "password": 1, "deletion_requested": 1, "deactivated": 1, "session_version": 1, "deactivated_at": 1, "deactivation_operation_id": 1, "deactivation_previous_session_version": 1})).Decode(&account)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return Account{}, ErrSessionExpired
	}
	if err != nil {
		return Account{}, ErrUnavailable
	}
	return account, nil
}

// Fixed windows use server time and durable counters across backend instances.
// TTL is only cleanup; expiry never depends on the asynchronous TTL monitor.
func (s *mongoStore) TakeAttempt(ctx context.Context, id bson.ObjectID, now time.Time) (bool, error) {
	key := fmt.Sprintf("%s:%d", id.Hex(), now.Unix()/60)
	var doc struct {
		Attempts int64 `bson:"attempts"`
	}
	filter := bson.M{"_id": key}
	update := bson.M{"$inc": bson.M{"attempts": int64(1)}, "$setOnInsert": bson.M{"expires_at": now.Add(2 * time.Minute)}}
	err := s.attempts.FindOneAndUpdate(ctx, filter, update, options.FindOneAndUpdate().SetUpsert(true).SetReturnDocument(options.After)).Decode(&doc)
	if mongo.IsDuplicateKeyError(err) {
		err = s.attempts.FindOneAndUpdate(ctx, filter, bson.M{"$inc": bson.M{"attempts": int64(1)}}, options.FindOneAndUpdate().SetReturnDocument(options.After)).Decode(&doc)
	}
	return doc.Attempts <= 5, err
}

func (s *mongoStore) Deactivate(ctx context.Context, original Account, operation string, now time.Time) (Account, error) {
	filter := accountstate.ActiveFilter(accountstate.VersionFilter(original.SessionVersion))
	filter["_id"] = original.ID
	filter["password"] = original.PasswordHash
	update := bson.M{
		"$set":   bson.M{"deactivated": true, "deactivated_at": now, "deactivation_operation_id": operation, "deactivation_previous_session_version": original.SessionVersion},
		"$inc":   bson.M{"session_version": int64(1)},
		"$unset": bson.M{"reset_code": "", "reset_code_exp_at": "", "reset_code_id": "", "reset_code_requested_at": "", "reset_code_attempts": ""},
	}
	var updated Account
	err := s.users.FindOneAndUpdate(ctx, filter, update, options.FindOneAndUpdate().SetReturnDocument(options.After)).Decode(&updated)
	return updated, err
}
