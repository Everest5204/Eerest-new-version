package post

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"everest-backend/internal/middleware"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

const sharedTestPostID = "123456789012345678901234"
const sharedTestViewerID = "aaaaaaaaaaaaaaaaaaaaaaaa"

func TestSharedPostTextFormattingSurvivesDatabaseDecodeAndResponse(t *testing.T) {
	id, _ := bson.ObjectIDFromHex(sharedTestPostID)
	viewer, _ := bson.ObjectIDFromHex(sharedTestViewerID)
	raw, err := bson.Marshal(bson.M{"_id": id, "user_id": viewer, "type": "text", "text": "Shared text", "caption": "Shared text", "text_background": bson.M{"kind": "solid", "value": "#123456"}, "text_color": "#ffffff", "text_style": "bold_center"})
	if err != nil {
		t.Fatal(err)
	}
	var record sharedPostRecord
	if err := bson.Unmarshal(raw, &record); err != nil {
		t.Fatal(err)
	}
	post := sharedPostResponse(record, PostUser{ID: viewer, FirstName: "Example"}, true, true)
	data, err := json.Marshal(post)
	if err != nil {
		t.Fatal(err)
	}
	var result map[string]any
	if err := json.Unmarshal(data, &result); err != nil {
		t.Fatal(err)
	}
	if result["id"] != sharedTestPostID || result["text"] != "Shared text" || result["text_style"] != "bold_center" {
		t.Fatalf("Missing copied text post fields: %s", data)
	}
	if result["text_background"].(map[string]any)["value"] != "#123456" {
		t.Fatalf("Background lost: %s", data)
	}
	if post.IsFollowing || !post.IsSelf {
		t.Fatal("Self relationship must match existing feed policy")
	}
}

func TestSharedPostMediaResponsePreservesMediaWithoutTextBackground(t *testing.T) {
	post := sharedPostResponse(sharedPostRecord{Post: Post{Type: PostTypeImage, Caption: "Photo", Media: []MediaItem{{URL: "https://example.com/photo.jpg", Type: MediaTypeImage}}}}, PostUser{}, false, true)
	data, err := json.Marshal(post)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(data), "text_background") || !strings.Contains(string(data), "photo.jpg") {
		t.Fatalf("Invalid media response: %s", data)
	}
	if !post.IsFollowing {
		t.Fatal("Viewer follow state was lost")
	}
}

func TestSharedPostHandlerAuthIDMethodsAndErrors(t *testing.T) {
	cases := []struct {
		name, method, viewer, id string
		readError                error
		want, calls              int
	}{
		{"missing session", "GET", "", sharedTestPostID, nil, 401, 0},
		{"bad viewer", "GET", "not-an-id", sharedTestPostID, nil, 401, 0},
		{"invalid ID", "GET", sharedTestViewerID, "bad", nil, 400, 0},
		{"zero ID", "GET", sharedTestViewerID, "000000000000000000000000", nil, 400, 0},
		{"wrong method", "POST", sharedTestViewerID, sharedTestPostID, nil, 405, 0},
		{"deleted or invisible", "GET", sharedTestViewerID, sharedTestPostID, errSharedPostUnavailable, 404, 1},
		{"missing document", "GET", sharedTestViewerID, sharedTestPostID, mongo.ErrNoDocuments, 404, 1},
		{"database failure", "GET", sharedTestViewerID, sharedTestPostID, errors.New("database private detail"), 500, 1},
		{"valid post", "GET", sharedTestViewerID, sharedTestPostID, nil, 200, 1},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			r := httptest.NewRequest(tc.method, "/api/posts/"+tc.id, nil)
			r.SetPathValue("postID", tc.id)
			if tc.viewer != "" {
				r = r.WithContext(context.WithValue(r.Context(), middleware.UserIDKey, tc.viewer))
			}
			w := httptest.NewRecorder()
			calls := 0
			serveSharedPost(w, r, func(_ context.Context, id, viewer string) (*SharedLinkPost, error) {
				calls++
				if id != tc.id || viewer != tc.viewer {
					t.Fatal("Wrong ID/viewer passed to lookup")
				}
				return &SharedLinkPost{}, tc.readError
			})
			if w.Code != tc.want || calls != tc.calls {
				t.Fatalf("status=%d calls=%d, want %d/%d", w.Code, calls, tc.want, tc.calls)
			}
			if !strings.Contains(w.Header().Get("Cache-Control"), "no-store") {
				t.Fatal("Copied private post response must not be cached")
			}
			if strings.Contains(w.Body.String(), "database private detail") {
				t.Fatal("Database error detail leaked")
			}
			if tc.want == 405 && w.Header().Get("Allow") != "GET" {
				t.Fatal("Missing allowed method")
			}
		})
	}
}

func TestSharedPostRouteDoesNotShadowExistingRoutes(t *testing.T) {
	mux := http.NewServeMux()
	RegisterPostRoutes(mux, &PostHandler{}, "test-secret")
	for path, want := range map[string]string{
		"/api/posts/feed": "/api/posts/feed", "/api/posts/me": "/api/posts/me", "/api/posts/user": "/api/posts/user",
		"/api/posts/home": "/api/posts/home", "/api/posts/home/events": "/api/posts/home/events",
		"/api/posts/" + sharedTestPostID: "/api/posts/{postID}",
	} {
		_, pattern := mux.Handler(httptest.NewRequest("GET", path, nil))
		if pattern != want {
			t.Fatalf("%s matched %s, want %s", path, pattern, want)
		}
	}
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, httptest.NewRequest("GET", "/api/posts/"+sharedTestPostID, nil))
	if w.Code != 401 {
		t.Fatal("Copied post endpoint must require authorization")
	}
}

func TestSharedPostServiceRejectsInvalidIDBeforeDatabase(t *testing.T) {
	service := &PostService{}
	for _, id := range []string{"", "bad", "000000000000000000000000", "123456789012345678901234/extra"} {
		_, err := service.GetSharedLinkPost(context.Background(), id, sharedTestViewerID)
		if !errors.Is(err, errSharedPostID) {
			t.Fatalf("invalid ID accepted: %q", id)
		}
	}
}
