package post

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"everest-backend/internal/middleware"
	"everest-backend/internal/textpost"
	"go.mongodb.org/mongo-driver/v2/bson"
)

func TestHomeCursorValidation(t *testing.T) {
	for _, bad := range []string{"!", "a", strings.Repeat("x", 2049), encodeCursor(time.Time{}, bson.NewObjectID()), encodeCursor(time.Now(), bson.NilObjectID)} {
		if _, err := homeFilter(bad); !errors.Is(err, ErrHomeCursor) {
			t.Fatalf("accepted invalid cursor %q", bad)
		}
	}
	id := bson.NewObjectID()
	stamp := time.UnixMilli(1700000000123).UTC()
	filter, err := homeFilter(encodeCursor(stamp, id))
	if err != nil {
		t.Fatal(err)
	}
	branches := filter["$or"].(bson.A)
	if branches[1].(bson.M)["_id"].(bson.M)["$lt"] != id {
		t.Fatal("cursor lost ID tie breaker")
	}
}

func TestHomePipelineChecksVisibilityBeforeLimit(t *testing.T) {
	filter, _ := homeFilter("")
	p := homePipeline(filter, 9)
	if p[1][0].Key != "$sort" || p[2][0].Key != "$lookup" || p[3][0].Key != "$unwind" || p[4][0].Key != "$limit" {
		t.Fatalf("unexpected pipeline order: %v", p)
	}
	lookup := p[2][0].Value.(bson.M)
	if lookup["foreignField"] != "_id" {
		t.Fatal("author lookup must use users ID index")
	}
	projection := p[5][0].Value.(bson.M)
	for _, secret := range []string{"password", "password_hash", "email", "google_id"} {
		if _, ok := projection[secret]; ok {
			t.Fatalf("projected private field %s", secret)
		}
	}
}

func TestHomeBackgroundJSONIsAnObject(t *testing.T) {
	bytes, err := bson.Marshal(bson.M{"_id": bson.NewObjectID(), "type": "text", "text_background": bson.M{"kind": "solid", "value": "#123456"}})
	if err != nil {
		t.Fatal(err)
	}
	var post HomeFeedPost
	if err := bson.Unmarshal(bytes, &post); err != nil {
		t.Fatal(err)
	}
	if post.TextBackground == nil || post.TextBackground.Kind != textpost.TextBackgroundSolid {
		t.Fatal("lost background")
	}
	encoded, err := json.Marshal(post)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(encoded), `"text_background":{"kind":"solid","value":"#123456"}`) {
		t.Fatalf("background is not a JSON object: %s", encoded)
	}
}

func TestHomeHubBoundedAndCoalesces(t *testing.T) {
	h := newHomeFeedHub()
	c, cleanup, ok := h.subscribe()
	if !ok {
		t.Fatal("subscribe failed")
	}
	var wg sync.WaitGroup
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 100; j++ {
				h.publish()
			}
		}()
	}
	wg.Wait()
	if len(c) != 1 {
		t.Fatalf("unbounded pending events: %d", len(c))
	}
	cleanup()
	cleanup()
	if len(h.listeners) != 0 {
		t.Fatal("subscriber leaked")
	}
	for i := 0; i < 4096; i++ {
		if _, _, ok := h.subscribe(); !ok {
			t.Fatal("early capacity limit")
		}
	}
	if _, _, ok := h.subscribe(); ok {
		t.Fatal("capacity was not bounded")
	}
}

func TestHomeHandlerRejectsInvalidViewportBeforeDB(t *testing.T) {
	h := &PostHandler{}
	for _, ids := range []string{"bad", strings.Repeat("0", 24), strings.TrimSuffix(strings.Repeat(bson.NewObjectID().Hex()+",", 9), ",")} {
		r := httptest.NewRequest(http.MethodGet, "/api/posts/home?visible_ids="+ids, nil)
		r = r.WithContext(context.WithValue(r.Context(), middleware.UserIDKey, bson.NewObjectID().Hex()))
		w := httptest.NewRecorder()
		h.GetHomeFeed(w, r)
		if w.Code != http.StatusBadRequest {
			t.Fatalf("status %d", w.Code)
		}
	}
}

func TestHomeStreamCancelsAndCleansUp(t *testing.T) {
	s := &PostService{home: newHomeFeedHub()}
	ctx, cancel := context.WithCancel(context.WithValue(context.Background(), middleware.UserIDKey, bson.NewObjectID().Hex()))
	r := httptest.NewRequest(http.MethodGet, "/api/posts/home/events", nil).WithContext(ctx)
	w := httptest.NewRecorder()
	done := make(chan struct{})
	go func() { defer close(done); s.StreamHomeFeed(w, r) }()
	cancel()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("stream ignored cancellation")
	}
	if len(s.home.listeners) != 0 {
		t.Fatal("stream leaked listener")
	}
	if !strings.Contains(w.Body.String(), "feed.ready") {
		t.Fatal("no handshake")
	}
}
