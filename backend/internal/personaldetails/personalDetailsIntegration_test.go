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
	updated, err := service.Update(ctx, id.Hex(), 0, PatchRequest{ExpectedRevision: ptr(int64(0)), Shared: SharedDetails{"hometown": "Dhaka"}})
	if err != nil || updated.Revision != 1 || updated.Shared["hometown"] != "Dhaka" || updated.BirthDate != d.BirthDate {
		t.Fatal("partial update failed", err, updated)
	}
	if _, err = service.Update(ctx, id.Hex(), 0, PatchRequest{ExpectedRevision: ptr(int64(0)), Shared: SharedDetails{"skills": "Go"}}); !errors.Is(err, ErrConflict) {
		t.Fatal("stale write was accepted", err)
	}
	updated, err = service.Update(ctx, id.Hex(), 0, PatchRequest{ExpectedRevision: ptr(int64(1)), Shared: SharedDetails{"hometown": "Dhaka"}})
	if err != nil || updated.Revision != 1 {
		t.Fatal("no-op incremented version", err)
	}
	updated, err = service.Update(ctx, id.Hex(), 0, PatchRequest{ExpectedRevision: ptr(int64(1)), Shared: SharedDetails{"hometown": ""}})
	if err != nil || updated.Shared["hometown"] != "" || updated.BirthDate != d.BirthDate || updated.Revision != 2 {
		t.Fatal("shared detail removal failed", err)
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
		if _, err = service.Update(ctx, id.Hex(), 0, PatchRequest{ExpectedRevision: ptr(int64(2)), Shared: SharedDetails{"hometown": "Khulna"}}); !errors.Is(err, ErrSession) {
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
			_, err := service.Update(ctx, id.Hex(), 0, PatchRequest{ExpectedRevision: ptr(int64(0)), Shared: SharedDetails{"hometown": "Dhaka"}})
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
	if err != nil || d.Revision != 1 || d.Shared["hometown"] != "Dhaka" || d.Gender != "male" {
		t.Fatal("incorrect final state", err, d)
	}
}

func TestReviewRequestsAreAtomicIdempotentAndDoNotChangeIdentity(t *testing.T) {
	db := database(t)
	ctx := context.Background()
	id := bson.NewObjectID()
	_, err := db.Collection("users").InsertOne(ctx, bson.M{"_id": id, "gender": "male", "birth_year": 2000, "birth_month": 2, "birth_day": 29, "email_or_phone": "private@example.com"})
	if err != nil {
		t.Fatal(err)
	}
	service := NewService(NewMongoStore(db))
	req := validReview()
	req.Field = "gender"
	req.ProposedValue = "female"
	var wg sync.WaitGroup
	for i := 0; i < 12; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := service.Submit(ctx, id.Hex(), 0, req); err != nil {
				t.Errorf("idempotent retry failed: %v", err)
			}
		}()
	}
	wg.Wait()
	d, err := service.Get(ctx, id.Hex(), 0)
	if err != nil || d.Revision != 1 || d.Gender != "male" || d.BirthDate != "2000-02-29" || len(d.Requests) != 1 || d.Requests[0].Status != "pending" {
		t.Fatal("review request changed identity or duplicated", d, err)
	}
	other := req
	other.RequestID = "22222222-2222-4222-8222-222222222222"
	other.ExpectedRevision = ptr(int64(1))
	other.ProposedValue = "other"
	if _, err = service.Submit(ctx, id.Hex(), 0, other); !errors.Is(err, ErrPending) {
		t.Fatal("second pending request accepted", err)
	}
	changedPayload := req
	changedPayload.Reason = "Different reason for the same request identifier."
	if _, err = service.Submit(ctx, id.Hex(), 0, changedPayload); !errors.Is(err, ErrInput) {
		t.Fatal("idempotency key reused", err)
	}
	pub, err := service.Public(ctx, id.Hex(), 0, id.Hex())
	if err != nil || pub.Gender != "male" {
		t.Fatal("unapproved value exposed", pub, err)
	}
	// Staff updates the canonical field and review status in one atomic document write.
	_, err = db.Collection("users").UpdateOne(ctx, bson.M{"_id": id, "personal_details_requests.gender.id": req.RequestID, "personal_details_requests.gender.status": "pending"}, bson.M{"$set": bson.M{"gender": "female", "personal_details_requests.gender.status": "approved", "personal_details_requests.gender.reviewed_at": time.Now().UTC()}, "$inc": bson.M{"personal_details_revision": int64(1)}})
	if err != nil {
		t.Fatal(err)
	}
	d, err = service.Get(ctx, id.Hex(), 0)
	if err != nil || d.Gender != "female" || d.Revision != 2 || d.Requests[0].Status != "approved" {
		t.Fatal("approval not reflected", err)
	}
	other.ExpectedRevision = ptr(int64(2))
	if _, err = service.Submit(ctx, id.Hex(), 0, other); err != nil {
		t.Fatal("new request after decision failed", err)
	}
	var raw struct {
		History []ChangeRequest `bson:"personal_details_request_history"`
	}
	_ = db.Collection("users").FindOne(ctx, bson.M{"_id": id}).Decode(&raw)
	if len(raw.History) != 1 || raw.History[0].Status != "approved" {
		t.Fatal("request history missing")
	}
}

func TestPublicDetailsRespectVisibilitySessionAndWhitelist(t *testing.T) {
	db := database(t)
	ctx := context.Background()
	viewer, target := bson.NewObjectID(), bson.NewObjectID()
	_, err := db.Collection("users").InsertMany(ctx, []any{bson.M{"_id": viewer}, bson.M{"_id": target, "email_or_phone": "private@example.com", "personal_details": bson.M{"contact": "shared@example.com", "skills": "Go", "password": "must not escape"}}})
	if err != nil {
		t.Fatal(err)
	}
	service := NewService(NewMongoStore(db))
	p, err := service.Public(ctx, viewer.Hex(), 0, target.Hex())
	if err != nil || p.Shared["contact"] != "shared@example.com" || len(p.Shared) != 2 {
		t.Fatal("whitelist failed", p, err)
	}
	if _, err = service.Public(ctx, viewer.Hex(), 1, target.Hex()); !errors.Is(err, ErrSession) {
		t.Fatal("revoked viewer allowed", err)
	}
	_, _ = db.Collection("users").UpdateOne(ctx, bson.M{"_id": target}, bson.M{"$set": bson.M{"deactivated": true}})
	if _, err = service.Public(ctx, viewer.Hex(), 0, target.Hex()); !errors.Is(err, ErrNotFound) {
		t.Fatal("inactive user exposed", err)
	}
}
