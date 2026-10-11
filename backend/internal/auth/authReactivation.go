package auth

import (
	"context"
	"errors"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"time"

	"everest-backend/internal/accountstate"
	"go.mongodb.org/mongo-driver/v2/bson"
)

// Called only after password or Google identity verification, never by /me,
// token restoration, a feed request, or password-reset operations.
func (service *AuthService) reactivateVerifiedAccount(ctx context.Context, candidate *User, googleSubject string) error {
	if !candidate.Deactivated {
		return nil
	}
	filter := accountstate.VersionFilter(candidate.SessionVersion)
	filter["_id"] = candidate.ID
	filter["deactivated"] = true
	filter["deletion_requested"] = bson.M{"$ne": true}
	if googleSubject != "" {
		filter["google_subject"] = googleSubject
	} else {
		filter["password"] = candidate.Password
	}
	result, err := service.Collection.UpdateOne(ctx, filter, bson.M{
		"$set":   bson.M{"deactivated": false, "reactivated_at": time.Now().UTC()},
		"$inc":   bson.M{"session_version": int64(1)},
		"$unset": bson.M{"deactivated_at": "", "deactivation_operation_id": "", "deactivation_previous_session_version": ""},
	})
	if err != nil {
		return ErrAuthAccountStatusUnavailable
	}
	if result.MatchedCount != 1 {
		return ErrAuthAccountUnavailable
	}
	return nil
}

// Resetting a password remains available while paused, and does not reactivate.
func (service *AuthService) findResettableAuthUser(ctx context.Context, id bson.ObjectID) (*User, error) {
	var user User
	err := service.Collection.FindOne(ctx, bson.M{"_id": id, "deletion_requested": bson.M{"$ne": true}}).Decode(&user)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, ErrAuthAccountUnavailable
	}
	if err != nil {
		return nil, ErrAuthAccountStatusUnavailable
	}
	return &user, nil
}
