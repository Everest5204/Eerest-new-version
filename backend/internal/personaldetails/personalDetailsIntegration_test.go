package personaldetails

import (
	"context"
	"errors"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func database(t *testing.T) *mongo.Database {
	t.Helper()
	uri := os.Getenv("MONGOSKY_PERSONAL_DETAILS_TEST_URI")
	if uri == "" {
		t.Skip("Set a disposable MongoDB URI for integration tests")
	}
	client, err := mongo.Connect(options.Client().ApplyURI(uri))
	if err != nil {
		t.Fatal(err)
	}
	db := client.Database("mongosky_personal_details_test_" + bson.NewObjectID().Hex())
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = db.Drop(ctx)
		_ = client.Disconnect(ctx)
	})
	return db
}
func TestPrivateDetailsUpdateRetentionAndSessionGate(t *testing.T) {
	db := database(t)
	id := bson.NewObjectID()
	ctx := context.Background()
	users := db.Collection("users")
	_, err := users.InsertOne(ctx, bson.M{"_id": id, "first_name": "Mongosky", "last_name": "User", "email_or_phone": "private@example.com", "email_verified": true, "password": "retained password hash", "google_subject": "retained google id", "gender": "male", "birth_year": 2000, "birth_month": 2, "birth_day": 29, "posts_count": 7, "bio": "retained bio", "name_changed_at": time.Now().UTC()})
	if err != nil {
		t.Fatal(err)
	}
	service := NewService(NewMongoStore(db))
	d, err := service.Get(ctx, id.Hex(), 0)
	if err != nil || d.Revision != 0 || d.BirthDate != "2000-02-29" || d.NameCanChange || d.NameNextChangeAt == nil {
		t.Fatal("legacy read failed", err, d)
	}
	updated, err := service.Update(ctx, id.Hex(), 0, PatchRequest{ExpectedRevision: ptr(int64(0)), Gender: ptr("female")})
	if err != nil || updated.Revision != 1 || updated.Gender != "female" || updated.BirthDate != d.BirthDate {
		t.Fatal("partial update failed", err, updated)
	}
	if _, err = service.Update(ctx, id.Hex(), 0, PatchRequest{ExpectedRevision: ptr(int64(0)), BirthDate: ptr("1999-01-01")}); !errors.Is(err, ErrConflict) {
		t.Fatal("stale write was accepted", err)
	}
	updated, err = service.Update(ctx, id.Hex(), 0, PatchRequest{ExpectedRevision: ptr(int64(1)), Gender: ptr("female")})
	if err != nil || updated.Revision != 1 {
		t.Fatal("no-op incremented version", err)
	}
	updated, err = service.Update(ctx, id.Hex(), 0, PatchRequest{ExpectedRevision: ptr(int64(1)), BirthDate: ptr("")})
	if err != nil || updated.BirthDate != "" || updated.Revision != 2 {
		t.Fatal("birthday removal failed", err)
	}
	var raw bson.M
	if err = users.FindOne(ctx, bson.M{"_id": id}).Decode(&raw); err != nil {
		t.Fatal(err)
	}
	for key, value := range map[string]any{"email_or_phone": "private@example.com", "password": "retained password hash", "google_subject": "retained google id", "posts_count": int32(7), "bio": "retained bio", "first_name": "Mongosky"} {
		if raw[key] != value {
			t.Fatalf("unrelated field %s changed: %v", key, raw[key])
		}
	}
	if _, err = service.Get(ctx, bson.NewObjectID().Hex(), 0); !errors.Is(err, ErrSession) {
		t.Fatal("another/missing account exposed", err)
	}
	for _, state := range []bson.M{{"deactivated": true}, {"deactivated": false, "deletion_requested": true}, {"deletion_requested": false, "session_version": int64(1)}} {
		if _, err = users.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": state}); err != nil {
			t.Fatal(err)
		}
		if _, err = service.Get(ctx, id.Hex(), 0); !errors.Is(err, ErrSession) {
			t.Fatal("revoked account was readable", err)
		}
		if _, err = service.Update(ctx, id.Hex(), 0, PatchRequest{ExpectedRevision: ptr(int64(2)), Gender: ptr("male")}); !errors.Is(err, ErrSession) {
			t.Fatal("revoked account was editable", err)
		}
	}
	if _, err = service.Get(ctx, id.Hex(), 1); err != nil {
		t.Fatal("new valid session rejected", err)
	}
	encoded, _ := bson.MarshalExtJSON(raw, false, false)
	if !strings.Contains(string(encoded), "retained password hash") {
		t.Fatal("fixture retention check failed")
	}
}
func TestConcurrentDetailsWritesDoNotOverwriteNewerRevision(t *testing.T) {
	db := database(t)
	id := bson.NewObjectID()
	ctx := context.Background()
	_, err := db.Collection("users").InsertOne(ctx, bson.M{"_id": id, "gender": "male"})
	if err != nil {
		t.Fatal(err)
	}
	service := NewService(NewMongoStore(db))
	var succeeded atomic.Int32
	var conflicted atomic.Int32
	var wg sync.WaitGroup
	for i := 0; i < 12; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := service.Update(ctx, id.Hex(), 0, PatchRequest{ExpectedRevision: ptr(int64(0)), Gender: ptr("female")})
			if err == nil {
				succeeded.Add(1)
			} else if errors.Is(err, ErrConflict) {
				conflicted.Add(1)
			} else {
				t.Errorf("unexpected write error: %v", err)
			}
		}()
	}
	wg.Wait()
	if succeeded.Load() != 1 || conflicted.Load() != 11 {
		t.Fatalf("writes=%d conflicts=%d", succeeded.Load(), conflicted.Load())
	}
	d, err := service.Get(ctx, id.Hex(), 0)
	if err != nil || d.Revision != 1 || d.Gender != "female" {
		t.Fatal("incorrect final state", err, d)
	}
}
