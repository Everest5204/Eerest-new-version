package pinpost

import (
	"context"
	"errors"
	"go.mongodb.org/mongo-driver/v2/bson"
	"testing"
	"time"
)

type fakeStore struct{ calls int }

func (s *fakeStore) Read(context.Context, auth, bson.ObjectID) (*Snapshot, error) {
	s.calls++
	return nil, nil
}
func (s *fakeStore) Update(context.Context, auth, Request, time.Time) (*Response, error) {
	s.calls++
	return nil, nil
}
func (s *fakeStore) Receipt(context.Context, auth, string) (*Response, error) {
	s.calls++
	return nil, nil
}
func TestInvalidPinInputNeverReachesStorage(t *testing.T) {
	store := &fakeStore{}
	service := NewService(store)
	owner, id := bson.NewObjectID(), bson.NewObjectID()
	valid := request(id, "text", true, 0, 1)
	cases := []Request{valid, valid, valid, valid, valid, valid}
	cases[0].Pinned = nil
	cases[1].ExpectedRevision = nil
	cases[2].PostID = "000000000000000000000000"
	cases[3].PostSource = "story"
	cases[4].RequestID = "bad"
	negative := int64(-1)
	cases[5].ExpectedRevision = &negative
	for _, req := range cases {
		if _, err := service.Update(context.Background(), owner.Hex(), 0, req); !errors.Is(err, ErrInput) {
			t.Fatal("invalid payload accepted", err)
		}
	}
	if _, err := service.Update(context.Background(), owner.Hex(), -1, valid); !errors.Is(err, ErrSession) {
		t.Fatal("invalid session accepted", err)
	}
	if store.calls != 0 {
		t.Fatal("invalid request reached storage")
	}
}
func TestMongoRateLimitAndExpiredReceiptsKeepRevisionsSafe(t *testing.T) {
	db, _, service, owner, _ := database(t)
	ctx := context.Background()
	id := createPost(t, db, owner, "text")
	// Keep the receipt timestamp current so Mongo's TTL monitor does not remove it during validation.
	fixedTime := time.Now().UTC().Truncate(time.Minute).Add(10 * time.Second)
	service.now = func() time.Time { return fixedTime }
	first := request(id, "text", true, 0, 1)
	for i := 1; i <= 30; i++ {
		if _, err := service.Update(ctx, owner.Hex(), 0, request(id, "text", true, int64(i-1), i)); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := service.Update(ctx, owner.Hex(), 0, request(id, "text", true, 30, 31)); !errors.Is(err, ErrRateLimit) {
		t.Fatal("shared rate limit missing", err)
	}
	retry, err := service.Update(ctx, owner.Hex(), 0, first)
	if err != nil || retry.Current.Revision != 30 {
		t.Fatal("duplicate consumed rate quota", err)
	}
	_, _ = db.Collection("post_pin_operations").DeleteOne(ctx, bson.M{"_id": owner.Hex() + ":" + first.RequestID})
	if _, err := service.Update(ctx, owner.Hex(), 0, first); !errors.Is(err, ErrConflict) {
		t.Fatal("expired old receipt replayed mutation", err)
	}
	value, err := service.Read(ctx, owner.Hex(), 0, owner.Hex())
	if err != nil || value.Revision != 30 {
		t.Fatal("rate rejection changed pin", err)
	}
}
