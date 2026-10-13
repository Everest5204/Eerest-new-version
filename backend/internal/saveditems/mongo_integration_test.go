package saveditems

import (
	"context"
	"errors"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"go.mongodb.org/mongo-driver/v2/mongo/readpref"
	"os"
	"sync"
	"testing"
	"time"
)

// Opt-in only: creates and drops a uniquely named disposable database. Requires
// a local/test replica set; never reuses the database named in the connection URI.
func TestMongoSavedItemsIntegration(t *testing.T) {
	uri := os.Getenv("MONGOSKY_SAVED_ITEMS_TEST_URI")
	if uri == "" {
		t.Skip("set MONGOSKY_SAVED_ITEMS_TEST_URI to a disposable MongoDB replica set")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	client, e := mongo.Connect(options.Client().ApplyURI(uri).SetServerSelectionTimeout(5 * time.Second))
	if e != nil {
		t.Fatal("test Mongo client could not initialize")
	}
	defer client.Disconnect(context.Background())
	if client.Ping(ctx, readpref.Primary()) != nil {
		t.Fatal("test Mongo replica set is unreachable")
	}
	db := client.Database("mongosky_saved_test_" + bson.NewObjectID().Hex())
	defer db.Drop(context.Background())
	store := NewMongoStore(db)
	if e = store.EnsureIndexes(ctx); e != nil {
		t.Fatal(e)
	}
	owner, author := bson.NewObjectID(), bson.NewObjectID()
	a, b := Auth{owner, 0}, Auth{author, 0}
	id := bson.NewObjectID()
	if _, e = db.Collection("users").InsertMany(ctx, []any{bson.M{"_id": owner, "first_name": "Owner"}, bson.M{"_id": author, "first_name": "Author"}}); e != nil {
		t.Fatal(e)
	}
	if _, e = db.Collection("posts").InsertOne(ctx, bson.M{"_id": id, "user_id": author, "type": "text", "text": "searchable live caption", "created_at": time.Now().UTC()}); e != nil {
		t.Fatal(e)
	}
	service := NewService(store, "local-test-secret")
	t.Run("atomic save replay and revision", func(t *testing.T) {
		req := request(true, 0, 1)
		var wg sync.WaitGroup
		errs := make(chan error, 8)
		for range 8 {
			wg.Add(1)
			go func() {
				defer wg.Done()
				state, e := service.Update(ctx, a, id.Hex(), req)
				if e == nil && (!state.Saved || state.Revision != 1) {
					e = ErrUnavailable
				}
				errs <- e
			}()
		}
		wg.Wait()
		close(errs)
		for e := range errs {
			if e != nil {
				t.Fatal(e)
			}
		}
		count, e := store.records.CountDocuments(ctx, bson.M{"user_id": owner, "post_id": id})
		if e != nil || count != 1 {
			t.Fatal(count, e)
		}
		revision, e := store.OwnerRevision(ctx, a)
		if e != nil || revision != 1 {
			t.Fatal(revision, e)
		}
	})
	t.Run("private live search and target", func(t *testing.T) {
		page, e := service.List(ctx, a, Query{Kind: "all", Search: "searchable", Limit: 20})
		if e != nil || len(page.Items) != 1 || !page.Items[0].Available {
			t.Fatal(page, e)
		}
		other, e := service.List(ctx, b, Query{Kind: "all", Limit: 20})
		if e != nil || len(other.Items) != 0 {
			t.Fatal(other, e)
		}
		target, e := service.Target(ctx, a, id.Hex())
		if e != nil || target.Post.ID != id || target.Post.User.ID != author {
			t.Fatal(target, e)
		}
		if _, e = db.Collection("posts").UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"text": "edited current text"}}); e != nil {
			t.Fatal(e)
		}
		page, e = service.List(ctx, a, Query{Kind: "all", Search: "searchable", Limit: 20})
		if e != nil || len(page.Items) != 0 {
			t.Fatal(page, e)
		}
	})
	t.Run("unavailable author is redacted and removable", func(t *testing.T) {
		if _, e = db.Collection("users").UpdateOne(ctx, bson.M{"_id": author}, bson.M{"$set": bson.M{"deactivated": true}}); e != nil {
			t.Fatal(e)
		}
		rows, e := service.Resolve(ctx, a, []string{id.Hex()})
		if e != nil || len(rows.Items) != 1 || rows.Items[0].Available || rows.Items[0].Author != nil {
			t.Fatal(rows, e)
		}
		if _, e = service.Target(ctx, a, id.Hex()); !errors.Is(e, ErrPost) {
			t.Fatal(e)
		}
		state, e := service.Update(ctx, a, id.Hex(), request(false, 1, 2))
		if e != nil || state.Saved || state.Revision != 2 {
			t.Fatal(state, e)
		}
		if _, e = db.Collection("users").UpdateOne(ctx, bson.M{"_id": author}, bson.M{"$set": bson.M{"deactivated": false}}); e != nil {
			t.Fatal(e)
		}
		state, e = service.Update(ctx, a, id.Hex(), request(true, 2, 3))
		if e != nil || !state.Saved || state.Revision != 3 {
			t.Fatal(state, e)
		}
		if _, e = service.Update(ctx, a, id.Hex(), request(false, 1, 2)); !errors.Is(e, ErrConflict) {
			t.Fatal("stale removal replay", e)
		}
	})
	t.Run("revoked session cannot read or mutate", func(t *testing.T) {
		if _, e = db.Collection("users").UpdateOne(ctx, bson.M{"_id": owner}, bson.M{"$set": bson.M{"session_version": int64(1)}}); e != nil {
			t.Fatal(e)
		}
		if _, e = service.State(ctx, a, id.Hex()); !errors.Is(e, ErrSession) {
			t.Fatal(e)
		}
		if _, e = service.Update(ctx, a, id.Hex(), request(false, 3, 4)); !errors.Is(e, ErrSession) {
			t.Fatal(e)
		}
		stored, e := store.Read(ctx, Auth{owner, 1}, id)
		if e != nil || !stored.Saved || stored.Revision != 3 {
			t.Fatal(stored, e)
		}
	})
}
