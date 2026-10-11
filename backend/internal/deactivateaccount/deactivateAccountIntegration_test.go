package deactivateaccount

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"sync"
	"testing"
	"time"

	"everest-backend/internal/accountstate"
	"everest-backend/internal/auth"
	"everest-backend/internal/middleware"
	"everest-backend/internal/profileview"
	"everest-backend/internal/search"
	"github.com/golang-jwt/jwt/v5"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"golang.org/x/crypto/bcrypt"
)

func mongoFixture(t *testing.T) *mongo.Database {
	t.Helper()
	uri := os.Getenv("MONGOSKY_DEACTIVATE_TEST_URI")
	if uri == "" {
		t.Skip("Set MONGOSKY_DEACTIVATE_TEST_URI to a disposable local MongoDB instance")
	}
	client, err := mongo.Connect(options.Client().ApplyURI(uri))
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := client.Ping(ctx, nil); err != nil {
		t.Fatal(err)
	}
	db := client.Database("mongosky_deactivate_test_" + bson.NewObjectID().Hex())
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = db.Drop(ctx)
		_ = client.Disconnect(ctx)
	})
	return db
}

func TestMongoFullDeactivationAndPasswordReactivation(t *testing.T) {
	db := mongoFixture(t)
	ctx := context.Background()
	id := bson.NewObjectID()
	other := bson.NewObjectID()
	hash, _ := bcrypt.GenerateFromPassword([]byte(" correct password "), bcrypt.MinCost)
	_, err := db.Collection("users").InsertMany(ctx, []any{
		bson.M{"_id": id, "first_name": "PauseTest", "last_name": "User", "email_or_phone": "pause@example.test", "password": string(hash), "reset_code": "old-reset", "posts_count": 4},
		bson.M{"_id": other, "first_name": "ActiveTest", "last_name": "User"},
	})
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 4; i++ {
		_, err = db.Collection("posts").InsertOne(ctx, bson.M{"_id": bson.NewObjectID(), "user_id": id, "created_at": time.Now().Add(time.Duration(i) * time.Second), "caption": "kept", "type": "photo"})
		if err != nil {
			t.Fatal(err)
		}
	}
	_, _ = db.Collection("posts").InsertOne(ctx, bson.M{"_id": bson.NewObjectID(), "user_id": other, "created_at": time.Now().Add(-time.Hour), "caption": "visible", "type": "photo"})
	service, err := NewService(db)
	if err != nil {
		t.Fatal(err)
	}
	if err := service.EnsureIndexes(ctx); err != nil {
		t.Fatal(err)
	}
	key := "test-secret-only-no-live-account"
	oldToken, _ := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{"userId": id.Hex(), "exp": time.Now().Add(time.Hour).Unix(), "iat": time.Now().Unix()}).SignedString([]byte(key))
	mux := http.NewServeMux()
	RegisterRoutes(mux, NewHandler(service), key)
	authHandler := auth.NewAuthHandler(auth.NewAuthService(db, ""), key)
	mux.HandleFunc("/api/auth/login", authHandler.Login)
	mux.HandleFunc("/api/auth/me", authHandler.Me)
	mux.HandleFunc("/api/protected", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(204) })
	gate, err := middleware.NewAccountAccessMiddleware(db, key)
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(gate(mux))
	defer server.Close()
	request := func(path, token string, body any) (int, map[string]any) {
		t.Helper()
		var payload []byte
		if body != nil {
			payload, _ = json.Marshal(body)
		}
		method := "GET"
		if body != nil {
			method = "POST"
		}
		req, _ := http.NewRequest(method, server.URL+path, bytes.NewReader(payload))
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		resp, err := server.Client().Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		var value map[string]any
		_ = json.NewDecoder(resp.Body).Decode(&value)
		return resp.StatusCode, value
	}
	req := Request{Confirm: true, CurrentPassword: "wrong", OperationID: testOperation}
	if code, _ := request("/api/auth/deactivate-account", oldToken, req); code != 403 {
		t.Fatal("wrong password status", code)
	}
	if code, _ := request("/api/protected", oldToken, nil); code != 204 {
		t.Fatal("wrong password revoked session", code)
	}
	req.CurrentPassword = " correct password "
	if code, result := request("/api/auth/deactivate-account", oldToken, req); code != 200 || result["status"] != "deactivated" {
		t.Fatal(code, result)
	}
	if code, _ := request("/api/protected", oldToken, nil); code != 401 {
		t.Fatal("old session still usable", code)
	}
	if code, _ := request("/api/auth/deactivate-account", oldToken, req); code != 200 {
		t.Fatal("lost-response retry", code)
	}
	users, err := search.NewService(db).SearchUsers(ctx, "PauseTest", 10)
	if err != nil || len(users) != 0 {
		t.Fatal("search leaked paused account", users, err)
	}
	if _, err := profileview.NewService(db, nil).GetProfile(ctx, other.Hex(), id.Hex()); err == nil {
		t.Fatal("profile exposed paused account")
	}
	cursor, err := db.Collection("posts").Aggregate(ctx, accountstate.VisiblePostPipeline(bson.M{}, 2, nil))
	if err != nil {
		t.Fatal(err)
	}
	var visible []bson.M
	if err = cursor.All(ctx, &visible); err != nil {
		t.Fatal(err)
	}
	if len(visible) != 1 || visible[0]["user_id"] != other {
		t.Fatal("hidden rows broke visibility/limit", visible)
	}
	var user bson.M
	_ = db.Collection("users").FindOne(ctx, bson.M{"_id": id}).Decode(&user)
	if user["password"] != string(hash) || user["posts_count"] != int32(4) || user["reset_code"] != nil {
		t.Fatal("data retention/reset invalidation", user)
	}
	if code, _ := request("/api/auth/login", oldToken, map[string]string{"email_or_phone": "pause@example.test", "password": "wrong"}); code != 401 {
		t.Fatal("wrong login accepted", code)
	}
	if code, result := request("/api/auth/login", oldToken, map[string]string{"email_or_phone": "pause@example.test", "password": " correct password "}); code != 200 {
		t.Fatal("correct login did not reactivate", code, result)
	} else {
		newToken, _ := result["token"].(string)
		if newToken == "" {
			t.Fatal("missing new session")
		}
		if code, _ := request("/api/protected", newToken, nil); code != 204 {
			t.Fatal("new session rejected", code)
		}
	}
	if code, _ := request("/api/protected", oldToken, nil); code != 401 {
		t.Fatal("old token revived", code)
	}
	if code, _ := request("/api/auth/deactivate-account", oldToken, req); code != 401 {
		t.Fatal("old operation affected new login", code)
	}
	users, err = search.NewService(db).SearchUsers(ctx, "PauseTest", 10)
	if err != nil || len(users) != 1 {
		t.Fatal("reactivation did not restore search", users, err)
	}
	count, _ := db.Collection("posts").CountDocuments(ctx, bson.M{"user_id": id})
	if count != 4 {
		t.Fatal("data deleted during pause", count)
	}
}

func TestMongoConcurrentAttemptsAndCompareAndSwap(t *testing.T) {
	db := mongoFixture(t)
	store := newMongoStore(db)
	ctx := context.Background()
	id := bson.NewObjectID()
	now := time.Now().UTC()
	var wg sync.WaitGroup
	var mu sync.Mutex
	allowed := 0
	var failures []error
	for i := 0; i < 16; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			ok, err := store.TakeAttempt(ctx, id, now)
			mu.Lock()
			defer mu.Unlock()
			if err != nil {
				failures = append(failures, err)
			}
			if ok && err == nil {
				allowed++
			}
		}()
	}
	wg.Wait()
	if allowed != 5 || len(failures) > 0 {
		t.Fatal("distributed rate limit", allowed, failures)
	}
	if ok, err := store.TakeAttempt(ctx, id, now.Add(time.Minute)); err != nil || !ok {
		t.Fatal("rate window did not reset", ok, err)
	}
	hash, _ := bcrypt.GenerateFromPassword([]byte("password"), bcrypt.MinCost)
	_, _ = db.Collection("users").InsertOne(ctx, bson.M{"_id": id, "password": string(hash)})
	original, _ := store.Read(ctx, id)
	_, _ = db.Collection("users").UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"password": "changed"}})
	if _, err := store.Deactivate(ctx, original, testOperation, now); err == nil {
		t.Fatal("password race overwritten")
	}
	fmt.Println("MongoDB: atomic transitions, durable rate limits, visibility, and session revocation verified")
}
