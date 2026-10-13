package myactivity

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"everest-backend/internal/middleware"
	notification "everest-backend/internal/notification/core"
	"github.com/golang-jwt/jwt/v5"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"
)

func activityDB(t *testing.T) (*Service, bson.ObjectID, bson.ObjectID) {
	t.Helper()
	uri := os.Getenv("MONGOSKY_ACTIVITY_TEST_URI")
	if uri == "" {
		t.Skip("Set a disposable MongoDB URI in MONGOSKY_ACTIVITY_TEST_URI")
	}
	c, e := mongo.Connect(options.Client().ApplyURI(uri))
	if e != nil {
		t.Fatal(e)
	}
	db := c.Database("mongosky_activity_test_" + bson.NewObjectID().Hex())
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		db.Drop(ctx)
		c.Disconnect(ctx)
	})
	s := NewService(db, "secret")
	if e = s.EnsureIndexes(context.Background()); e != nil {
		t.Fatal(e)
	}
	if e = s.EnsureIndexes(context.Background()); e != nil {
		t.Fatal("index reinstall", e)
	}
	a, b := bson.NewObjectID(), bson.NewObjectID()
	_, e = db.Collection("users").InsertMany(context.Background(), []any{bson.M{"_id": a, "first_name": "Owner", "email": "private@example.com"}, bson.M{"_id": b, "first_name": "Other", "password": "SECRET"}})
	if e != nil {
		t.Fatal(e)
	}
	return s, a, b
}
func insert(t *testing.T, s *Service, col string, row bson.M) bson.ObjectID {
	t.Helper()
	id := bson.NewObjectID()
	if v, ok := row["_id"].(bson.ObjectID); ok {
		id = v
	}
	row["_id"] = id
	if _, e := s.db.Collection(col).InsertOne(context.Background(), row); e != nil {
		t.Fatal(e)
	}
	return id
}
func TestMongoTimelinePagingIsolationAndIndexedQueries(t *testing.T) {
	s, owner, other := activityDB(t)
	ctx := context.Background()
	at := time.Now().Add(-time.Hour).UTC().Truncate(time.Millisecond)
	seen := map[string]bool{}
	ownpost := insert(t, s, "posts", bson.M{"user_id": owner, "type": "text", "text": "Own", "created_at": at, "updated_at": at})
	post := insert(t, s, "posts", bson.M{"user_id": other, "type": "video", "caption": "Original", "media": bson.A{bson.M{"url": "https://example.com/a.mp4", "type": "video"}}, "created_at": at, "updated_at": at})
	liked := insert(t, s, "comments", bson.M{"post_id": post, "user_id": other, "text": "Comment", "created_at": at})
	for n := 0; n < 8; n++ {
		for _, src := range sources {
			row := bson.M{src.owner: owner, "created_at": at, "post_id": post, "comment_id": liked, "following_id": other, "reaction_type": "love", "text": "My comment"}
			if src.kind == "post" {
				row["type"] = "text"
			}
			insert(t, s, src.collection, row)
		}
	}
	insert(t, s, "posts", bson.M{"user_id": owner, "created_at": at, "type": "text", "is_deleted": true})
	q := Query{Category: "all", Limit: 7}
	pages := 0
	for {
		p, e := s.List(ctx, owner, q)
		if e != nil {
			t.Fatal(e)
		}
		pages++
		if len(p.Items) > 7 {
			t.Fatal("unbounded")
		}
		for i, item := range p.Items {
			k := item.Kind + ":" + item.ID
			if seen[k] {
				t.Fatal("duplicate", k)
			}
			seen[k] = true
			if !item.Available {
				t.Fatal("unexpected tombstone", item)
			}
			if i > 0 && !less(record{Created: p.Items[i-1].At, Kind: p.Items[i-1].Kind, ID: mustID(p.Items[i-1].ID)}, record{Created: item.At, Kind: item.Kind, ID: mustID(item.ID)}) {
				t.Fatal("order")
			}
		}
		if pages == 1 && (p.Counts["posts"] != 9 || p.Counts["reactions"] != 16 || p.Counts["comments"] != 8 || p.Counts["connections"] != 8) {
			t.Fatal(p.Counts)
		}
		if !p.HasMore {
			break
		}
		q.Cursor = p.NextCursor
		if pages == 1 {
			insert(t, s, "posts", bson.M{"user_id": owner, "type": "text", "created_at": time.Now().Add(time.Minute)})
		}
		if pages > 10 {
			t.Fatal("pagination loop")
		}
	}
	if len(seen) != 41 {
		t.Fatal("missing entries", len(seen))
	}
	if !seen["post:"+ownpost.Hex()] || seen["post:"+post.Hex()] {
		t.Fatal("ownership")
	}
	for _, src := range sources {
		f := filter(owner, src, Query{Category: "all", Limit: 20}, position{AsOf: time.Now()}, false)
		var exp bson.M
		e := s.db.RunCommand(ctx, bson.D{{Key: "explain", Value: bson.M{"find": src.collection, "filter": f, "sort": bson.D{{Key: "created_at", Value: -1}, {Key: "_id", Value: -1}}, "limit": 21}}, {Key: "verbosity", Value: "queryPlanner"}}).Decode(&exp)
		if e != nil {
			t.Fatal(e)
		}
		raw, _ := json.Marshal(exp["queryPlanner"])
		if strings.Contains(string(raw), `"stage":"SORT"`) || strings.Contains(string(raw), `"stage":"COLLSCAN"`) {
			t.Fatal("unindexed timeline", src.kind, string(raw))
		}
	}
}
func mustID(v string) bson.ObjectID { id, _ := bson.ObjectIDFromHex(v); return id }
func TestMongoTargetsDatesAndHiddenContent(t *testing.T) {
	s, a, b := activityDB(t)
	ctx := context.Background()
	at := time.Now().Add(-time.Hour).UTC().Truncate(time.Millisecond)
	pid := insert(t, s, "posts", bson.M{"user_id": b, "type": "text", "text": "Public post", "created_at": at, "updated_at": at})
	rid := insert(t, s, "post_reactions", bson.M{"user_id": a, "post_id": pid, "reaction_type": "love", "created_at": at})
	q := Query{Category: "reactions", Limit: 20, From: at, Before: at.Add(time.Second)}
	p, e := s.List(ctx, a, q)
	if e != nil || len(p.Items) != 1 {
		t.Fatal(p, e)
	}
	q.From = at.Add(time.Millisecond)
	p, e = s.List(ctx, a, q)
	if e != nil || len(p.Items) != 0 {
		t.Fatal("date boundary", p, e)
	}
	target, e := s.Target(ctx, a, "reaction", rid)
	if e != nil || target.Post == nil || target.Post.User.FirstName != "Other" || target.Post.IsSelf {
		t.Fatal(target, e)
	}
	encoded, _ := json.Marshal(target)
	if strings.Contains(string(encoded), "SECRET") || strings.Contains(string(encoded), "private@example.com") {
		t.Fatal("user privacy")
	}
	if _, e = s.Target(ctx, b, "reaction", rid); !errors.Is(e, ErrUnavailable) {
		t.Fatal("cross-account lookup", e)
	}
	_, e = s.db.Collection("users").UpdateOne(ctx, bson.M{"_id": b}, bson.M{"$set": bson.M{"deactivated": true}})
	if e != nil {
		t.Fatal(e)
	}
	p, e = s.List(ctx, a, Query{Category: "all", Limit: 20})
	if e != nil || p.Items[0].Available || p.Items[0].Author != nil || strings.Contains(p.Items[0].Text, "Public") {
		t.Fatal("hidden preview", p, e)
	}
	if _, e = s.Target(ctx, a, "reaction", rid); !errors.Is(e, ErrUnavailable) {
		t.Fatal("hidden target", e)
	}
}
func TestMongoHTTPAuthenticationAndLiveStream(t *testing.T) {
	s, a, b := activityDB(t)
	hub := notification.NewHub()
	defer hub.Close()
	mux := http.NewServeMux()
	RegisterRoutes(mux, NewHandler(s, hub), "secret")
	access, e := middleware.NewAccountAccessMiddleware(s.db, "secret")
	if e != nil {
		t.Fatal(e)
	}
	srv := httptest.NewServer(access(TrackChanges(mux, hub, "secret")))
	defer srv.Close()
	token, _ := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{"userId": a.Hex(), "exp": time.Now().Add(time.Hour).Unix(), "session_version": 0}).SignedString([]byte("secret"))
	r, _ := http.NewRequest("GET", srv.URL+"/api/my-activity", nil)
	response, e := http.DefaultClient.Do(r)
	if e != nil {
		t.Fatal(e)
	}
	response.Body.Close()
	if response.StatusCode != 401 {
		t.Fatal("unauthenticated access")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	r, _ = http.NewRequestWithContext(ctx, "GET", srv.URL+"/api/my-activity/stream", nil)
	r.Header.Set("Authorization", "Bearer "+token)
	response, e = http.DefaultClient.Do(r)
	if e != nil {
		t.Fatal(e)
	}
	defer response.Body.Close()
	if response.StatusCode != 200 {
		t.Fatal("stream", response.StatusCode)
	}
	reader := bufio.NewReader(response.Body)
	readFrame := func() string {
		var lines strings.Builder
		for {
			line, e := reader.ReadString('\n')
			if e != nil {
				t.Fatal(e)
			}
			lines.WriteString(line)
			if line == "\n" {
				return lines.String()
			}
		}
	}
	first := readFrame()
	if !strings.Contains(first, a.Hex()) || strings.Contains(first, b.Hex()) {
		t.Fatal("stream isolation", first)
	}
	hub.Notify(a)
	if frame := readFrame(); !strings.Contains(frame, "activity.changed") {
		t.Fatal(frame)
	}
	if e = s.checkSession(context.Background(), a, 0); e != nil {
		t.Fatal(e)
	}
	_, e = s.db.Collection("users").UpdateOne(context.Background(), bson.M{"_id": a}, bson.M{"$set": bson.M{"session_version": int64(1)}})
	if e != nil {
		t.Fatal(e)
	}
	if e = s.checkSession(context.Background(), a, 0); e == nil {
		t.Fatal("revoked stream session")
	}
}
