package pinpost

import (
	"context"
	"encoding/json"
	"errors"
	"everest-backend/internal/middleware"
	"fmt"
	"github.com/golang-jwt/jwt/v5"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"
)

func database(t *testing.T) (*mongo.Database, *MongoStore, *Service, bson.ObjectID, bson.ObjectID) {
	t.Helper()
	uri := os.Getenv("MONGOSKY_PIN_POST_TEST_URI")
	if uri == "" {
		t.Skip("Set a disposable MongoDB replica-set URI")
	}
	c, err := mongo.Connect(options.Client().ApplyURI(uri))
	if err != nil {
		t.Fatal(err)
	}
	db := c.Database("mongosky_pin_test_" + bson.NewObjectID().Hex())
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = db.Drop(ctx)
		_ = c.Disconnect(ctx)
	})
	s := NewMongoStore(db)
	if err = s.CreateIndexes(context.Background()); err != nil {
		t.Fatal(err)
	}
	owner, other := bson.NewObjectID(), bson.NewObjectID()
	_, err = db.Collection("users").InsertMany(context.Background(), []any{bson.M{"_id": owner, "first_name": "Owner", "password": "private"}, bson.M{"_id": other, "first_name": "Viewer"}})
	if err != nil {
		t.Fatal(err)
	}
	return db, s, NewService(s), owner, other
}
func createPost(t *testing.T, db *mongo.Database, owner bson.ObjectID, kind string) bson.ObjectID {
	t.Helper()
	id := bson.NewObjectID()
	now := time.Now().UTC()
	_, err := db.Collection("posts").InsertOne(context.Background(), bson.M{"_id": id, "user_id": owner, "type": kind, "text": "Test post", "caption": "caption", "media": bson.A{bson.M{"url": "https://cdn.example.com/image.jpg", "type": "image"}}, "likes_count": 12, "comments_count": 5, "created_at": now, "updated_at": now})
	if err != nil {
		t.Fatal(err)
	}
	return id
}
func request(id bson.ObjectID, source string, pinned bool, revision int64, i int) Request {
	return Request{PostID: id.Hex(), PostSource: source, Pinned: &pinned, ExpectedRevision: &revision, RequestID: fmt.Sprintf("0f30e8f5-1d69-4a8d-9fa9-%012x", i)}
}
func TestMongoPinReplaceAndUnpinAcrossSources(t *testing.T) {
	db, _, service, owner, viewer := database(t)
	ctx := context.Background()
	revision := int64(0)
	for i, kind := range []string{"text", "image", "video", "profile_photo_update", "cover_photo_update"} {
		id := createPost(t, db, owner, kind)
		source := "media"
		if kind == "text" {
			source = "text"
		}
		update, err := service.Update(ctx, owner.Hex(), 0, request(id, source, true, revision, i+1))
		if err != nil {
			t.Fatal(err)
		}
		revision++
		if update.Current.Revision != revision || update.Current.PostSource != source || update.Current.PinnedAt == nil || update.Current.Post == nil {
			t.Fatal("missing pin", update)
		}
		public, err := service.Read(ctx, viewer.Hex(), 0, owner.Hex())
		if err != nil || public.Post == nil {
			t.Fatal("public pin missing", err)
		}
		raw, _ := json.Marshal(public)
		if strings.Contains(string(raw), "password") || strings.Contains(string(raw), "request_id") {
			t.Fatal("private data leaked")
		}
		var unchanged bson.M
		_ = db.Collection("posts").FindOne(ctx, bson.M{"_id": id}).Decode(&unchanged)
		if unchanged["likes_count"] != int32(12) || unchanged["comments_count"] != int32(5) {
			t.Fatal("pin changed counts")
		}
		count, _ := db.Collection("profile_post_pins").CountDocuments(ctx, bson.M{})
		if count != 1 {
			t.Fatal("more than one pin", count)
		}
		if i == 4 {
			result, err := service.Update(ctx, owner.Hex(), 0, request(id, source, false, revision, 10))
			if err != nil || result.Current.Post != nil || result.Current.Revision != revision+1 {
				t.Fatal("unpin failed", err)
			}
		}
	}
}
func TestMongoReceiptReplayNeverRestoresPreviousPin(t *testing.T) {
	db, _, service, owner, other := database(t)
	ctx := context.Background()
	first := createPost(t, db, owner, "text")
	second := createPost(t, db, owner, "image")
	original := request(first, "text", true, 0, 1)
	if _, err := service.Update(ctx, owner.Hex(), 0, original); err != nil {
		t.Fatal(err)
	}
	if _, err := service.Update(ctx, owner.Hex(), 0, request(second, "media", true, 1, 2)); err != nil {
		t.Fatal(err)
	}
	retry, err := service.Update(ctx, owner.Hex(), 0, original)
	if err != nil || retry.Receipt.ResultRevision != 1 || retry.Current.Revision != 2 || retry.Current.PostSource != "media" {
		t.Fatal("old retry overwrote pin", err)
	}
	if _, err = service.Receipt(ctx, other.Hex(), 0, original.RequestID); !errors.Is(err, ErrReceipt) {
		t.Fatal("other viewer read receipt", err)
	}
	forged := original
	forged.PostID = second.Hex()
	if _, err = service.Update(ctx, owner.Hex(), 0, forged); !errors.Is(err, ErrConflict) {
		t.Fatal("request reuse accepted", err)
	}
	if _, err = service.Update(ctx, owner.Hex(), 0, request(first, "text", false, 2, 3)); !errors.Is(err, ErrConflict) {
		t.Fatal("wrong unpin removed current pin", err)
	}
	count, _ := db.Collection("post_pin_operations").CountDocuments(ctx, bson.M{})
	if count != 2 {
		t.Fatal("duplicate operation rows", count)
	}
}
func TestMongoConcurrentDuplicatePinWritesOnce(t *testing.T) {
	db, _, service, owner, _ := database(t)
	id := createPost(t, db, owner, "text")
	req := request(id, "text", true, 0, 1)
	var wg sync.WaitGroup
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			value, err := service.Update(context.Background(), owner.Hex(), 0, req)
			if err != nil || value.Receipt.ResultRevision != 1 {
				t.Error("duplicate", err)
			}
		}()
	}
	wg.Wait()
	value, err := service.Read(context.Background(), owner.Hex(), 0, owner.Hex())
	if err != nil || value.Revision != 1 {
		t.Fatal("revision advanced twice", err)
	}
	count, _ := db.Collection("post_pin_operations").CountDocuments(context.Background(), bson.M{})
	if count != 1 {
		t.Fatal("duplicate receipts", count)
	}
}
func TestMongoConcurrentDifferentPinsAcceptOnlyOneRevision(t *testing.T) {
	db, _, service, owner, _ := database(t)
	ids := []bson.ObjectID{}
	for i := 0; i < 10; i++ {
		ids = append(ids, createPost(t, db, owner, "text"))
	}
	var wg sync.WaitGroup
	accepted := make(chan bool, 10)
	for i, id := range ids {
		wg.Add(1)
		go func(i int, id bson.ObjectID) {
			defer wg.Done()
			_, err := service.Update(context.Background(), owner.Hex(), 0, request(id, "text", true, 0, i+1))
			if err == nil {
				accepted <- true
			} else if !errors.Is(err, ErrConflict) {
				t.Error(err)
			}
		}(i, id)
	}
	wg.Wait()
	close(accepted)
	if len(accepted) != 1 {
		t.Fatal("concurrent stale revisions accepted", len(accepted))
	}
}
func TestMongoOwnerVisibilityAndRevokedSessionChecks(t *testing.T) {
	db, _, service, owner, other := database(t)
	ctx := context.Background()
	foreign := createPost(t, db, other, "text")
	own := createPost(t, db, owner, "text")
	if _, err := service.Update(ctx, owner.Hex(), 0, request(foreign, "text", true, 0, 1)); !errors.Is(err, ErrOwner) {
		t.Fatal("foreign post pinned", err)
	}
	if _, err := service.Update(ctx, owner.Hex(), 0, request(foreign, "text", false, 0, 9)); !errors.Is(err, ErrOwner) {
		t.Fatal("foreign unpin accepted", err)
	}
	if _, err := service.Update(ctx, owner.Hex(), 0, request(own, "media", true, 0, 2)); !errors.Is(err, ErrPost) {
		t.Fatal("source spoof accepted", err)
	}
	if _, err := service.Update(ctx, owner.Hex(), 0, request(bson.NewObjectID(), "text", true, 0, 3)); !errors.Is(err, ErrPost) {
		t.Fatal("missing post accepted", err)
	}
	_, _ = db.Collection("posts").UpdateOne(ctx, bson.M{"_id": own}, bson.M{"$set": bson.M{"is_hidden": true}})
	if _, err := service.Update(ctx, owner.Hex(), 0, request(own, "text", true, 0, 4)); !errors.Is(err, ErrPost) {
		t.Fatal("hidden post accepted", err)
	}
	_, _ = db.Collection("posts").UpdateOne(ctx, bson.M{"_id": own}, bson.M{"$set": bson.M{"is_hidden": false}})
	if _, err := service.Update(ctx, owner.Hex(), 0, request(own, "text", true, 0, 5)); err != nil {
		t.Fatal(err)
	}
	_, _ = db.Collection("posts").UpdateOne(ctx, bson.M{"_id": own}, bson.M{"$set": bson.M{"is_deleted": true}})
	value, err := service.Read(ctx, other.Hex(), 0, owner.Hex())
	if err != nil || value.Post != nil {
		t.Fatal("deleted pin exposed", err)
	}
	if _, err := service.Update(ctx, owner.Hex(), 0, request(own, "text", false, 1, 6)); err != nil {
		t.Fatal("deleted post could not be unpinned", err)
	}
	for _, change := range []bson.M{{"deactivated": true}, {"deactivated": false, "deletion_requested": true}, {"deletion_requested": false, "session_version": int64(1)}} {
		_, _ = db.Collection("users").UpdateOne(ctx, bson.M{"_id": owner}, bson.M{"$set": change})
		if _, err := service.Read(ctx, owner.Hex(), 0, owner.Hex()); !errors.Is(err, ErrSession) {
			t.Fatal("revoked session read pin", err)
		}
		if _, err := service.Update(ctx, owner.Hex(), 0, request(own, "text", true, 2, 7)); !errors.Is(err, ErrSession) {
			t.Fatal("revoked session wrote pin", err)
		}
	}
}
func TestMongoPinRoutesAuthenticateAndRejectMalformedBodies(t *testing.T) {
	db, _, service, owner, other := database(t)
	id := createPost(t, db, owner, "text")
	mux := http.NewServeMux()
	RegisterRoutes(mux, NewHandler(service), "test-secret")
	access, err := middleware.NewAccountAccessMiddleware(db, "test-secret")
	if err != nil {
		t.Fatal(err)
	}
	handler := access(mux)
	token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{"userId": owner.Hex(), "session_version": int64(0), "exp": time.Now().Add(time.Hour).Unix()}).SignedString([]byte("test-secret"))
	if err != nil {
		t.Fatal(err)
	}
	send := func(method, path, body, bearer string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, path, strings.NewReader(body))
		if bearer != "" {
			r.Header.Set("Authorization", "Bearer "+bearer)
		}
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		return w
	}
	body, _ := json.Marshal(request(id, "text", true, 0, 1))
	if w := send("PUT", "/api/post-pins/me", string(body), ""); w.Code != 401 {
		t.Fatal("missing auth accepted", w.Code)
	}
	for _, bad := range []string{`{}`, string(body) + ` {}`, strings.Replace(string(body), `"pinned":true`, `"pinned":null`, 1), strings.TrimSuffix(string(body), "}") + `,"owner_id":"` + other.Hex() + `"}`, strings.Repeat("x", 4096)} {
		if w := send("PUT", "/api/post-pins/me", bad, token); w.Code != 400 {
			t.Fatal("malformed accepted", w.Code, w.Body.String())
		}
	}
	w := send("PUT", "/api/post-pins/me", string(body), token)
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	if w.Header().Get("Cache-Control") != "private, no-store" {
		t.Fatal("cacheable mutation")
	}
	w = send("GET", "/api/post-pins/users/"+owner.Hex(), "", token)
	if w.Code != 200 || !strings.Contains(w.Body.String(), id.Hex()) {
		t.Fatal("pin read missing", w.Body.String())
	}
	w = send("GET", "/api/post-pins/operations/"+request(id, "text", true, 0, 1).RequestID, "", token)
	if w.Code != 200 {
		t.Fatal("receipt route failed", w.Body.String())
	}
}
func TestMongoIndexSetupFailsClosed(t *testing.T) {
	db, _, _, owner, _ := database(t)
	store := NewMongoStore(db)
	service := NewService(store)
	if _, err := service.Read(context.Background(), owner.Hex(), 0, owner.Hex()); !errors.Is(err, ErrUnavailable) {
		t.Fatal("missing indexes accepted", err)
	}
}
