package post

import (
	"context"
	"os"
	"sync/atomic"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/event"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

func testHomeMongo(t *testing.T, monitors ...*event.CommandMonitor) (*PostService, *mongo.Database) {
	t.Helper()
	uri := os.Getenv("MONGOSKY_FEED_TEST_URI")
	if uri == "" {
		t.Skip("set MONGOSKY_FEED_TEST_URI to an isolated MongoDB replica set")
	}
	opts := options.Client().ApplyURI(uri)
	if len(monitors) > 0 {
		opts.SetMonitor(monitors[0])
	}
	client, err := mongo.Connect(opts)
	if err != nil {
		t.Fatal(err)
	}
	db := client.Database("home_feed_test_" + bson.NewObjectID().Hex())
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = db.Drop(ctx)
		_ = client.Disconnect(ctx)
	})
	s := &PostService{postsCollection: db.Collection("posts"), usersCollection: db.Collection("users"), followsCollection: db.Collection("user_follows"), home: newHomeFeedHub()}
	if err := s.CreateIndexes(context.Background()); err != nil {
		t.Fatal(err)
	}
	return s, db
}

func TestHomeFeedMongoMixedPaginationAndVisibility(t *testing.T) {
	s, db := testHomeMongo(t)
	ctx := context.Background()
	viewer, author, hidden := bson.NewObjectID(), bson.NewObjectID(), bson.NewObjectID()
	_, err := db.Collection("users").InsertMany(ctx, []any{bson.M{"_id": viewer, "first_name": "Me"}, bson.M{"_id": author, "first_name": "Author", "email": "private@example.test"}, bson.M{"_id": hidden, "deactivated": true}})
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Collection("user_follows").InsertOne(ctx, bson.M{"follower_id": viewer, "following_id": author})
	if err != nil {
		t.Fatal(err)
	}
	stamp := time.Now().UTC().Truncate(time.Millisecond)
	docs := []any{}
	for i := 0; i < 14; i++ {
		kind := "image"
		if i%2 == 0 {
			kind = "text"
		}
		docs = append(docs, bson.M{"_id": bson.NewObjectID(), "user_id": author, "type": kind, "created_at": stamp, "updated_at": stamp, "is_deleted": false, "text": "hello", "text_background": bson.M{"kind": "solid", "value": "#123456"}})
	}
	for i := 0; i < 20; i++ {
		docs = append(docs, bson.M{"_id": bson.NewObjectID(), "user_id": hidden, "type": "image", "created_at": stamp.Add(time.Minute)})
	}
	for _, extra := range []bson.M{
		{"type": "video"}, {"type": "image", "media_type": "video"}, {"type": "image", "media": bson.A{bson.M{"type": "video"}}}, {"type": "text", "is_deleted": true},
	} {
		extra["_id"] = bson.NewObjectID()
		extra["user_id"] = author
		extra["created_at"] = stamp.Add(time.Minute)
		docs = append(docs, extra)
	}
	if _, err := db.Collection("posts").InsertMany(ctx, docs); err != nil {
		t.Fatal(err)
	}
	seen := map[bson.ObjectID]bool{}
	cursor := ""
	var first HomeFeedPost
	for page := 0; page < 10; page++ {
		response, err := s.GetHomeFeed(ctx, viewer.Hex(), 6, cursor, nil)
		if err != nil {
			t.Fatal(err)
		}
		if page == 0 {
			if len(response.Posts) != 6 {
				t.Fatalf("hidden authors caused a short first page: %d", len(response.Posts))
			}
			first = response.Posts[0]
		}
		for i, post := range response.Posts {
			if seen[post.ID] || !post.IsFollowing || post.IsSelf || post.User.FirstName != "Author" {
				t.Fatalf("invalid row: %+v", post)
			}
			if i > 0 && response.Posts[i-1].ID.Hex() <= post.ID.Hex() {
				t.Fatal("timestamp tie order lost")
			}
			seen[post.ID] = true
		}
		if !response.HasMore {
			break
		}
		if response.NextCursor == "" || response.NextCursor == cursor {
			t.Fatal("cursor stalled")
		}
		cursor = response.NextCursor
	}
	if len(seen) != 14 {
		t.Fatalf("expected 14 visible non-video posts, got %d", len(seen))
	}
	if _, err := db.Collection("posts").UpdateOne(ctx, bson.M{"_id": first.ID}, bson.M{"$set": bson.M{"is_deleted": true}}); err != nil {
		t.Fatal(err)
	}
	response, err := s.GetHomeFeed(ctx, viewer.Hex(), 8, "", []bson.ObjectID{first.ID})
	if err != nil || len(response.MissingIDs) != 1 || response.MissingIDs[0] != first.ID.Hex() {
		t.Fatalf("deleted visible row was not reconciled: %+v, %v", response, err)
	}
	if _, err := db.Collection("users").UpdateOne(ctx, bson.M{"_id": author}, bson.M{"$set": bson.M{"deletion_requested": true}}); err != nil {
		t.Fatal(err)
	}
	response, err = s.GetHomeFeed(ctx, viewer.Hex(), 8, "", nil)
	if err != nil || len(response.Posts) != 0 {
		t.Fatalf("deleting author is visible: %+v, %v", response, err)
	}
}

func TestHomeFeedMongoWatcher(t *testing.T) {
	s, db := testHomeMongo(t)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	c, cleanup, _ := s.home.subscribe()
	defer cleanup()
	done := make(chan struct{})
	go func() { defer close(done); s.WatchHomeFeed(ctx) }()
	select {
	case <-c:
	case <-time.After(10 * time.Second):
		t.Fatal("watcher did not start")
	}
	if _, err := db.Collection("posts").InsertOne(ctx, bson.M{"type": "text"}); err != nil {
		t.Fatal(err)
	}
	select {
	case <-c:
	case <-time.After(6 * time.Second):
		t.Fatal("insert did not invalidate feed")
	}
	author := bson.NewObjectID()
	if _, err := db.Collection("users").InsertOne(ctx, bson.M{"_id": author}); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Collection("users").UpdateOne(ctx, bson.M{"_id": author}, bson.M{"$set": bson.M{"deactivated": true}}); err != nil {
		t.Fatal(err)
	}
	select {
	case <-c:
	case <-time.After(6 * time.Second):
		t.Fatal("account visibility did not invalidate feed")
	}
	cancel()
	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("watcher ignored cancellation")
	}
}

func TestHomeFeedMongoStartupQueryBudget(t *testing.T) {
	var reads atomic.Int64
	monitor := &event.CommandMonitor{Started: func(_ context.Context, e *event.CommandStartedEvent) {
		if e.CommandName == "aggregate" || e.CommandName == "find" || e.CommandName == "getMore" {
			reads.Add(1)
		}
	}}
	s, db := testHomeMongo(t, monitor)
	ctx := context.Background()
	author := bson.NewObjectID()
	if _, err := db.Collection("users").InsertOne(ctx, bson.M{"_id": author}); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Collection("posts").InsertOne(ctx, bson.M{"user_id": author, "type": "text", "created_at": time.Now()}); err != nil {
		t.Fatal(err)
	}
	reads.Store(0)
	if _, err := s.GetHomeFeed(ctx, author.Hex(), 8, "", nil); err != nil {
		t.Fatal(err)
	}
	if got := reads.Load(); got != 2 {
		t.Fatalf("startup feed performed %d database reads; expected 1 aggregation + 1 follow batch", got)
	}
}
