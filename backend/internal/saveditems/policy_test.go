package saveditems

import (
	"encoding/json"
	"go.mongodb.org/mongo-driver/v2/bson"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestCursorBoundToOwnerKindAndSearch(t *testing.T) {
	now := time.Now().UTC()
	a := Auth{bson.NewObjectID(), 0}
	q := Query{Kind: "photos", Search: "topic", Limit: 20}
	p := Position{V: 1, Owner: a.Owner.Hex(), Kind: q.Kind, Search: q.Search, AsOf: now, At: now.Add(-time.Minute), ID: bson.NewObjectID().Hex()}
	c := newCodec("secret")
	token := c.encode(p)
	if _, e := c.decode(token, a, q, now); e != nil {
		t.Fatal(e)
	}
	for _, tc := range []struct {
		name, token string
		a           Auth
		q           Query
		at          time.Time
		codec       codec
	}{{"other owner", token, Auth{bson.NewObjectID(), 0}, q, now, c}, {"type", token, a, Query{Kind: "all", Search: "topic", Limit: 20}, now, c}, {"search", token, a, Query{Kind: "photos", Search: "other", Limit: 20}, now, c}, {"tamper", token + "x", a, q, now, c}, {"wrong key", token, a, q, now, newCodec("other")}, {"expired", token, a, q, now.Add(25 * time.Hour), c}} {
		t.Run(tc.name, func(t *testing.T) {
			if _, e := tc.codec.decode(tc.token, tc.a, tc.q, tc.at); e == nil {
				t.Fatal("invalid cursor accepted")
			}
		})
	}
}
func TestFilterAndMutationValidation(t *testing.T) {
	for _, path := range []string{"?kind=unknown", "?user_id=other", "?limit=0", "?limit=51", "?kind=all&kind=text", "?q=" + strings.Repeat("a", 81)} {
		t.Run(path, func(t *testing.T) {
			if _, e := query(httptest.NewRequest("GET", "/api/saved-items"+path, nil)); e == nil {
				t.Fatal("bad filter accepted")
			}
		})
	}
	if validRequest(Request{}) {
		t.Fatal("missing fields accepted")
	}
	q := request(true, 0, 1)
	q.RequestID = "not a uuid"
	if validRequest(q) {
		t.Fatal("bad request id")
	}
	q = request(true, -1, 1)
	if validRequest(q) {
		t.Fatal("negative revision")
	}
}
func TestLiveSearchBeforeLimitAndPlainBrowsingBeforeLookups(t *testing.T) {
	a := Auth{bson.NewObjectID(), 0}
	p := Position{AsOf: time.Now()}
	for _, search := range []string{"", "a.* [literal]"} {
		pipe := listPipeline(a, Query{Kind: "all", Search: search, Limit: 20}, p)
		raw, _ := json.Marshal(pipe)
		text := string(raw)
		lookup := strings.Index(text, "$lookup")
		limit := strings.Index(text, "$limit")
		if search == "" && limit > lookup {
			t.Fatal("unbounded default lookups")
		}
		if search != "" && limit < lookup {
			t.Fatal("search only loaded first page")
		}
		if !strings.Contains(text, a.Owner.Hex()) {
			t.Fatal("owner missing")
		}
		if search != "" && !strings.Contains(text, `a\\.\\*`) {
			t.Fatal("regex not escaped", text)
		}
	}
}
func TestOnlySafeVideoPosterURLsAreGenerated(t *testing.T) {
	good := videoPoster("https://res.cloudinary.com/demo/video/upload/v123/example.mp4")
	if !strings.Contains(good, "w_320") || !strings.HasSuffix(good, "example.jpg") {
		t.Fatal(good)
	}
	for _, v := range []string{"http://res.cloudinary.com/demo/video/upload/a.mp4", "https://user@res.cloudinary.com/demo/video/upload/a.mp4", "https://cdn.example.com/video/upload/a.mp4", "https://res.cloudinary.com/demo/video/upload/s--signed--/a.mp4"} {
		if videoPoster(v) != "" {
			t.Fatal("unsafe poster", v)
		}
	}
}
