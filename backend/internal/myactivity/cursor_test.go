package myactivity

import (
	"context"
	"everest-backend/internal/middleware"
	notification "everest-backend/internal/notification/core"
	"github.com/golang-jwt/jwt/v5"
	"go.mongodb.org/mongo-driver/v2/bson"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestCursorPrivacyAndFilters(t *testing.T) {
	now := time.Date(2026, 10, 13, 0, 0, 0, 0, time.UTC)
	owner := bson.NewObjectID()
	q := Query{Category: "all", Limit: 20, From: now.Add(-24 * time.Hour)}
	p := position{Version: 1, Owner: owner.Hex(), Category: q.Category, From: q.From, AsOf: now, At: now.Add(-time.Minute), Kind: "post", ID: bson.NewObjectID().Hex()}
	c := newCodec("secret")
	token := c.encode(p)
	if _, err := c.decode(token, owner, q, now); err != nil {
		t.Fatal(err)
	}
	tests := []struct {
		name, token string
		owner       bson.ObjectID
		q           Query
		now         time.Time
		codec       cursorCodec
	}{
		{"other owner", token, bson.NewObjectID(), q, now, c}, {"changed category", token, owner, Query{Category: "posts", Limit: 20, From: q.From}, now, c},
		{"changed date", token, owner, Query{Category: "all", Limit: 20}, now, c}, {"tamper", token + "x", owner, q, now, c},
		{"wrong key", token, owner, q, now, newCodec("other")}, {"expired", token, owner, q, now.Add(25 * time.Hour), c},
		{"unbounded", strings.Repeat("a", 2049), owner, q, now, c},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if _, e := tt.codec.decode(tt.token, tt.owner, tt.q, tt.now); e == nil {
				t.Fatal("accepted invalid cursor")
			}
		})
	}
}
func TestParseFilters(t *testing.T) {
	for _, path := range []string{"?limit=0", "?limit=51", "?category=someone", "?owner_id=other", "?category=all&category=posts", "?from=bad", "?from=2026-10-14T00:00:00Z&before=2026-10-13T00:00:00Z"} {
		t.Run(path, func(t *testing.T) {
			_, e := parseQuery(httptest.NewRequest("GET", "/api/my-activity"+path, nil))
			if e == nil {
				t.Fatal("accepted invalid query")
			}
		})
	}
	q, e := parseQuery(httptest.NewRequest("GET", "/api/my-activity?category=comments&limit=20&from=2026-10-12T00:00:00Z", nil))
	if e != nil || q.Category != "comments" {
		t.Fatal(q, e)
	}
}
func TestChangesOnlyNotifySuccessfulOwner(t *testing.T) {
	h := notification.NewHub()
	defer h.Close()
	a, b := bson.NewObjectID(), bson.NewObjectID()
	ca, done, _ := h.Subscribe(context.Background(), a)
	defer done()
	cb, doneB, _ := h.Subscribe(context.Background(), b)
	defer doneB()
	<-ca
	<-cb
	token, _ := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{"userId": a.Hex(), "exp": time.Now().Add(time.Hour).Unix()}).SignedString([]byte("test"))
	for _, tc := range []struct {
		method, path string
		status       int
		signal       bool
	}{{"POST", "/api/posts/media", 201, true}, {"PATCH", "/api/posts/media/edit/1", 200, true}, {"POST", "/api/reactions", 200, true}, {"DELETE", "/api/comments/1", 200, true}, {"PUT", "/api/users/1/follow", 200, true}, {"POST", "/api/reactions", 500, false}, {"POST", "/api/verified-badges/resolve", 200, false}, {"GET", "/api/my-activity", 200, false}} {
		r := httptest.NewRequest(tc.method, tc.path, nil)
		r.Header.Set("Authorization", "Bearer "+token)
		r = r.WithContext(context.WithValue(r.Context(), middleware.SessionVersionKey, int64(0)))
		TrackChanges(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(tc.status) }), h, "test").ServeHTTP(httptest.NewRecorder(), r)
		select {
		case <-ca:
			if !tc.signal {
				t.Fatal("unexpected signal", tc)
			}
		default:
			if tc.signal {
				t.Fatal("missing signal", tc)
			}
		}
		select {
		case <-cb:
			t.Fatal("other user's activity notified")
		default:
		}
	}
}
func TestOrderingIncludesKindAndID(t *testing.T) {
	at := time.Now()
	id := bson.NewObjectID()
	a := record{ID: id, Created: at, Kind: "comment"}
	b := a
	b.Kind = "post"
	if !less(a, b) || less(b, a) {
		t.Fatal("cross-source tie lost")
	}
	b = a
	b.ID = bson.NewObjectID()
	if !less(b, a) {
		t.Fatal("ID order lost")
	}
}
