package reportpost

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"everest-backend/internal/middleware"

	"github.com/golang-jwt/jwt/v5"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

func database(t *testing.T) (*mongo.Database, *MongoStore, *Service, bson.ObjectID, bson.ObjectID) {
	t.Helper()
	uri := os.Getenv("MONGOSKY_REPORT_POST_TEST_URI")
	if uri == "" {
		t.Skip("Set a disposable local MongoDB replica-set URI")
	}
	client, err := mongo.Connect(options.Client().ApplyURI(uri))
	if err != nil {
		t.Fatal(err)
	}
	db := client.Database("mongosky_report_test_" + bson.NewObjectID().Hex())
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = db.Drop(ctx)
		_ = client.Disconnect(ctx)
	})
	store := NewMongoStore(db)
	if err = store.CreateIndexes(context.Background()); err != nil {
		t.Fatal(err)
	}
	owner, author := bson.NewObjectID(), bson.NewObjectID()
	if _, err = db.Collection("users").InsertMany(context.Background(), []any{bson.M{"_id": owner, "first_name": "Reporter", "password": "retained"}, bson.M{"_id": author, "first_name": "Author"}}); err != nil {
		t.Fatal(err)
	}
	return db, store, NewService(store), owner, author
}
func post(t *testing.T, db *mongo.Database, author bson.ObjectID, kind string) bson.ObjectID {
	t.Helper()
	id := bson.NewObjectID()
	now := time.Now().UTC()
	_, err := db.Collection("posts").InsertOne(context.Background(), bson.M{
		"_id": id, "user_id": author, "type": kind, "text": "original text", "caption": "original caption", "likes_count": 12, "comments_count": 5,
		"media": bson.A{bson.M{"url": "https://cdn.example.com/image.jpg", "type": "image"}}, "created_at": now, "updated_at": now})
	if err != nil {
		t.Fatal(err)
	}
	return id
}
func operation(i int) string { return fmt.Sprintf("0f30e8f5-1d69-4a8d-9fa9-%012x", i) }
func payload(id bson.ObjectID, kind string, i int) Request {
	return Request{PostID: id.Hex(), PostSource: kind, Reason: "spam", Details: "optional details", RequestID: operation(i)}
}

func TestMongoReportsBothPostSourcesAndRetainsPrivateEvidence(t *testing.T) {
	db, _, service, owner, author := database(t)
	ctx := context.Background()
	for i, kind := range []string{"text", "image", "video", "profile_photo_update", "cover_photo_update"} {
		id := post(t, db, author, kind)
		source := "media"
		if kind == "text" {
			source = "text"
		}
		req := payload(id, source, i+1)
		result, err := service.Submit(ctx, owner.Hex(), 0, req)
		if err != nil || result.AlreadyReported || result.Report.Status != "pending" || result.Report.PostSource != source {
			t.Fatal("invalid new receipt", err, result)
		}
		var stored record
		if err = db.Collection("post_reports").FindOne(ctx, bson.M{"post_id": id}).Decode(&stored); err != nil {
			t.Fatal(err)
		}
		if stored.ReporterID != owner || stored.AuthorID != author || stored.Details != req.Details || stored.Snapshot.Type != kind || len(stored.Snapshot.Media) != 1 {
			t.Fatal("missing private evidence")
		}
		expected := "original caption"
		if kind == "text" {
			expected = "original text"
		}
		if stored.Snapshot.Text != expected {
			t.Fatal("incorrect evidence")
		}
		var raw bson.M
		if err = db.Collection("posts").FindOne(ctx, bson.M{"_id": id}).Decode(&raw); err != nil || raw["likes_count"] != int32(12) || raw["comments_count"] != int32(5) || raw["is_deleted"] == true {
			t.Fatal("report modified the post", err)
		}
		if _, err = service.Receipt(ctx, author.Hex(), 0, req.RequestID); !errors.Is(err, ErrReceiptNotFound) {
			t.Fatal("receipt exposed to author", err)
		}
		if _, err = db.Collection("posts").UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"is_deleted": true, "caption": "edited"}}); err != nil {
			t.Fatal(err)
		}
		retry, err := service.Submit(ctx, owner.Hex(), 0, req)
		if err != nil || !retry.AlreadyReported || retry.Report.ID != result.Report.ID {
			t.Fatal("lost receipt retry failed after removal", err)
		}
	}
}
func TestMongoDuplicateReportsAndRequestReuseNeverCreateMoreRows(t *testing.T) {
	db, _, service, owner, author := database(t)
	ctx := context.Background()
	id := post(t, db, author, "text")
	req := payload(id, "text", 1)
	first, err := service.Submit(ctx, owner.Hex(), 0, req)
	if err != nil {
		t.Fatal(err)
	}
	duplicate := req
	duplicate.RequestID = operation(2)
	duplicate.Reason = "harassment"
	duplicate.Details = "different concern"
	second, err := service.Submit(ctx, owner.Hex(), 0, duplicate)
	if err != nil || !second.AlreadyReported || second.Report.ID != first.Report.ID || second.Report.Reason != "spam" {
		t.Fatal("duplicate changed original report", err)
	}
	reuse := req
	reuse.Details = "changed after sending"
	if _, err = service.Submit(ctx, owner.Hex(), 0, reuse); !errors.Is(err, ErrConflict) {
		t.Fatal("request reuse accepted", err)
	}
	reuse = req
	reuse.PostID = post(t, db, author, "text").Hex()
	if _, err = service.Submit(ctx, owner.Hex(), 0, reuse); !errors.Is(err, ErrConflict) {
		t.Fatal("request reused for another post", err)
	}
	count, err := db.Collection("post_reports").CountDocuments(ctx, bson.M{})
	if err != nil || count != 1 {
		t.Fatal("duplicate rows", count, err)
	}
	var bucket bson.M
	if err = db.Collection("post_report_limits").FindOne(ctx, bson.M{}).Decode(&bucket); err != nil || bucket["count"] != int32(1) {
		t.Fatal("duplicates consumed quota", bucket, err)
	}
}
func TestMongoUnavailableOwnPostsAndRevokedSessionsCannotCreateReports(t *testing.T) {
	db, _, service, owner, author := database(t)
	ctx := context.Background()
	own := post(t, db, owner, "text")
	if _, err := service.Submit(ctx, owner.Hex(), 0, payload(own, "text", 1)); !errors.Is(err, ErrOwnPost) {
		t.Fatal("own post accepted", err)
	}
	id := post(t, db, author, "text")
	if _, err := service.Submit(ctx, owner.Hex(), 0, payload(id, "media", 2)); !errors.Is(err, ErrPost) {
		t.Fatal("spoofed source accepted", err)
	}
	if _, err := service.Submit(ctx, owner.Hex(), 0, payload(bson.NewObjectID(), "text", 3)); !errors.Is(err, ErrPost) {
		t.Fatal("missing post accepted", err)
	}
	users := db.Collection("users")
	for _, change := range []bson.M{{"deactivated": true}, {"deactivated": false, "deletion_requested": true}, {"deletion_requested": false, "session_version": int64(1)}} {
		_, _ = users.UpdateOne(ctx, bson.M{"_id": owner}, bson.M{"$set": change})
		if _, err := service.Submit(ctx, owner.Hex(), 0, payload(id, "text", 4)); !errors.Is(err, ErrSession) {
			t.Fatal("revoked session accepted", err)
		}
	}
	_, _ = users.UpdateOne(ctx, bson.M{"_id": author}, bson.M{"$set": bson.M{"deactivated": true}})
	if _, err := service.Submit(ctx, owner.Hex(), 1, payload(id, "text", 5)); !errors.Is(err, ErrPost) {
		t.Fatal("hidden author's post accepted", err)
	}
	count, _ := db.Collection("post_reports").CountDocuments(ctx, bson.M{})
	if count != 0 {
		t.Fatal("invalid request wrote a report")
	}
}
func TestMongoConcurrentDuplicatesAreIdempotentAndChargeOnce(t *testing.T) {
	db, _, service, owner, author := database(t)
	ctx := context.Background()
	id := post(t, db, author, "image")
	var wg sync.WaitGroup
	ids := make(chan string, 12)
	for i := 1; i <= 12; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			result, err := service.Submit(ctx, owner.Hex(), 0, payload(id, "media", i))
			if err != nil {
				t.Error(err)
				return
			}
			ids <- result.Report.ID
		}(i)
	}
	wg.Wait()
	close(ids)
	unique := map[string]bool{}
	for id := range ids {
		unique[id] = true
	}
	if len(unique) != 1 {
		t.Fatal("multiple receipts", unique)
	}
	count, _ := db.Collection("post_reports").CountDocuments(ctx, bson.M{})
	if count != 1 {
		t.Fatal("duplicate rows", count)
	}
	var bucket bson.M
	_ = db.Collection("post_report_limits").FindOne(ctx, bson.M{}).Decode(&bucket)
	if bucket["count"] != int32(1) {
		t.Fatal("duplicate quota", bucket)
	}
}
func TestMongoHourlyRateLimitIsDurableAndRollsBackRejectedReport(t *testing.T) {
	db, _, service, owner, author := database(t)
	ctx := context.Background()
	now := time.Date(2026, 10, 12, 10, 20, 0, 0, time.UTC)
	service.clock = func() time.Time { return now }
	for i := 1; i <= ReportsPerHour; i++ {
		if _, err := service.Submit(ctx, owner.Hex(), 0, payload(post(t, db, author, "text"), "text", i)); err != nil {
			t.Fatal(err)
		}
	}
	id := post(t, db, author, "text")
	req := payload(id, "text", 100)
	if _, err := service.Submit(ctx, owner.Hex(), 0, req); !errors.Is(err, ErrRateLimit) {
		t.Fatal("limit did not reject", err)
	}
	count, _ := db.Collection("post_reports").CountDocuments(ctx, bson.M{})
	if count != ReportsPerHour {
		t.Fatal("rate-limited report was saved", count)
	}
	var bucket bson.M
	_ = db.Collection("post_report_limits").FindOne(ctx, bson.M{}).Decode(&bucket)
	if bucket["count"] != int32(ReportsPerHour) {
		t.Fatal("rejection consumed quota", bucket)
	}
	now = now.Add(time.Hour)
	if _, err := service.Submit(ctx, owner.Hex(), 0, req); err != nil {
		t.Fatal("next hour stayed limited", err)
	}
}
func TestMongoMissingUniqueIndexesFailsClosed(t *testing.T) {
	db, _, _, owner, author := database(t)
	id := post(t, db, author, "text")
	store := NewMongoStore(db)
	service := NewService(store)
	if _, err := service.Submit(context.Background(), owner.Hex(), 0, payload(id, "text", 1)); !errors.Is(err, ErrUnavailable) {
		t.Fatal("unsafe index fallback accepted")
	}
}

func TestMongoConcurrentDistinctPostsRespectTheSharedHourlyQuota(t *testing.T) {
	db, _, service, owner, author := database(t)
	ctx := context.Background()
	now := time.Now().UTC()
	service.clock = func() time.Time { return now }
	requests := make([]Request, 12)
	for i := range requests {
		requests[i] = payload(post(t, db, author, "text"), "text", i+1)
	}
	results := make(chan error, len(requests))
	var wg sync.WaitGroup
	for _, request := range requests {
		wg.Add(1)
		go func(request Request) {
			defer wg.Done()
			_, err := service.Submit(ctx, owner.Hex(), 0, request)
			results <- err
		}(request)
	}
	wg.Wait()
	close(results)
	saved, limited := 0, 0
	for err := range results {
		if err == nil {
			saved++
		} else if errors.Is(err, ErrRateLimit) {
			limited++
		} else {
			t.Fatal("unexpected concurrent quota result", err)
		}
	}
	if saved != ReportsPerHour || limited != 2 {
		t.Fatal("incorrect shared quota", saved, limited)
	}
	count, _ := db.Collection("post_reports").CountDocuments(ctx, bson.M{})
	if count != ReportsPerHour {
		t.Fatal("quota exceeded", count)
	}
}

func TestHTTPReportRoutesVerifyJWTSessionAndPrivateReceiptOwnership(t *testing.T) {
	db, _, service, owner, author := database(t)
	id := post(t, db, author, "text")
	mux := http.NewServeMux()
	secret := "disposable-test-signing-key-only"
	RegisterRoutes(mux, NewHandler(service), secret)
	accountAccess, err := middleware.NewAccountAccessMiddleware(db, secret)
	if err != nil {
		t.Fatal(err)
	}
	handler := accountAccess(mux)
	token := func(user bson.ObjectID) string {
		value, err := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{"userId": user.Hex(), "session_version": 0, "exp": time.Now().Add(time.Hour).Unix()}).SignedString([]byte(secret))
		if err != nil {
			t.Fatal(err)
		}
		return value
	}
	call := func(method, path, body, bearer string) *httptest.ResponseRecorder {
		request := httptest.NewRequest(method, path, strings.NewReader(body))
		if bearer != "" {
			request.Header.Set("Authorization", "Bearer "+bearer)
		}
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, request)
		return w
	}
	body := strings.Replace(requestJSON, testPost, id.Hex(), 1)
	if w := call("POST", "/api/reports/posts", body, ""); w.Code != 401 {
		t.Fatal("unauthenticated route accepted", w.Code)
	}
	if w := call("POST", "/api/reports/posts", body, token(owner)); w.Code != 201 || w.Header().Get("Cache-Control") != "private, no-store" {
		t.Fatal("authenticated route failed", w.Code, w.Body.String())
	}
	if w := call("GET", "/api/reports/posts/"+testRequest, "", token(owner)); w.Code != 200 {
		t.Fatal("owned receipt failed", w.Code)
	}
	if w := call("GET", "/api/reports/posts/"+testRequest, "", token(author)); w.Code != 404 {
		t.Fatal("author saw receipt", w.Code)
	}
	_, _ = db.Collection("users").UpdateOne(context.Background(), bson.M{"_id": owner}, bson.M{"$set": bson.M{"session_version": int64(1)}})
	if w := call("GET", "/api/reports/posts/"+testRequest, "", token(owner)); w.Code != 401 {
		t.Fatal("revoked token read receipt", w.Code)
	}
}
