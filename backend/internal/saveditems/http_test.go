package saveditems

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"everest-backend/internal/middleware"
	notification "everest-backend/internal/notification/core"
	"github.com/golang-jwt/jwt/v5"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func httpFixture(t *testing.T) (*http.ServeMux, *Service, *memoryStore, Auth, Auth, string) {
	t.Helper()
	s, m, a, b, _ := setup()
	hub := notification.NewHub()
	t.Cleanup(hub.Close)
	mux := http.NewServeMux()
	RegisterRoutes(mux, NewHandler(s, hub), "secret")
	token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{"userId": a.Owner.Hex(), "exp": time.Now().Add(time.Hour).Unix()}).SignedString([]byte("secret"))
	if err != nil {
		t.Fatal(err)
	}
	return mux, s, m, a, b, token
}
func call(mux *http.ServeMux, token, method, path, body string, version bool) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	r.Header.Set("Authorization", "Bearer "+token)
	if version {
		r = r.WithContext(context.WithValue(r.Context(), middleware.SessionVersionKey, int64(0)))
	}
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, r)
	return w
}
func TestHTTPRequiresValidJWTAndAccountVersion(t *testing.T) {
	mux, _, _, _, _, token := httpFixture(t)
	for _, c := range []struct {
		token   string
		version bool
	}{{"invalid", true}, {token, false}} {
		w := call(mux, c.token, "GET", "/api/saved-items", "", c.version)
		if w.Code != 401 {
			t.Fatal(w.Code, w.Body.String())
		}
	}
}
func TestHTTPQueryCannotSelectAnotherOwner(t *testing.T) {
	mux, _, _, _, b, token := httpFixture(t)
	for _, path := range []string{"/api/saved-items?owner_id=" + b.Owner.Hex(), "/api/saved-items?kind=all&kind=videos", "/api/saved-items/status?post_id=" + b.Owner.Hex() + "&owner_id=" + b.Owner.Hex()} {
		w := call(mux, token, "GET", path, "", true)
		if w.Code != 400 {
			t.Fatal(path, w.Code)
		}
	}
	w := call(mux, token, "GET", "/api/saved-items", "", true)
	if w.Code != 200 || w.Header().Get("Cache-Control") != "private, no-store" {
		t.Fatal(w.Code, w.Header())
	}
}
func TestHTTPStrictBoundedSaveBody(t *testing.T) {
	mux, _, m, _, _, token := httpFixture(t)
	var id string
	for pid := range m.posts {
		id = pid.Hex()
	}
	valid := `{"saved":true,"expected_revision":0,"request_id":"00000000-0000-4000-8000-000000000001"}`
	for _, body := range []string{`{}`, `{"saved":true}`, valid + ` {}`, strings.Replace(valid, "\"saved\":true", "\"saved\":true,\"owner_id\":\"evil\"", 1), strings.Repeat(" ", 2049) + valid} {
		w := call(mux, token, "PUT", "/api/saved-items/"+id, body, true)
		if w.Code != 400 {
			t.Fatal(w.Code, w.Body.String())
		}
	}
	if m.changes != 0 {
		t.Fatal("bad body changed database")
	}
	w := call(mux, token, "PUT", "/api/saved-items/"+id, valid, true)
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	var state State
	if json.Unmarshal(w.Body.Bytes(), &state) != nil || !state.Saved || state.Revision != 1 {
		t.Fatal(w.Body.String())
	}
	w = call(mux, token, "PUT", "/api/saved-items/"+id, strings.Replace(valid, "000000000001", "000000000002", 1), true)
	if w.Code != 409 || m.changes != 1 {
		t.Fatal(w.Code, m.changes)
	}
}
func TestHTTPResolveIsBoundedAndOwned(t *testing.T) {
	mux, s, m, a, b, token := httpFixture(t)
	var id string
	for pid := range m.posts {
		id = pid.Hex()
	}
	_, err := s.Update(context.Background(), b, id, request(true, 0, 1))
	if err != nil {
		t.Fatal(err)
	}
	w := call(mux, token, "POST", "/api/saved-items/resolve", `{"post_ids":["`+id+`"]}`, true)
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	var result Resolved
	_ = json.Unmarshal(w.Body.Bytes(), &result)
	if len(result.Items) != 0 || result.Owner != a.Owner.Hex() {
		t.Fatal(result)
	}
	for _, body := range []string{`{"post_ids":[]}`, `{"post_ids":["` + id + `","` + id + `"]}`, `{"post_ids":["not-an-id"]}`} {
		if w := call(mux, token, "POST", "/api/saved-items/resolve", body, true); w.Code != 400 {
			t.Fatal(w.Code)
		}
	}
}
func TestHTTPStreamContainsOnlyOwnerRevisionAndStopsOnRevocation(t *testing.T) {
	mux, s, m, a, b, token := httpFixture(t)
	hub := notification.NewHub()
	defer hub.Close()
	mux = http.NewServeMux()
	RegisterRoutes(mux, NewHandler(s, hub), "secret")
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mux.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), middleware.SessionVersionKey, int64(0))))
	}))
	defer server.Close()
	req, _ := http.NewRequest("GET", server.URL+"/api/saved-items/stream", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	client := http.Client{Timeout: 3 * time.Second}
	response, e := client.Do(req)
	if e != nil {
		t.Fatal(e)
	}
	defer response.Body.Close()
	r := bufio.NewReader(response.Body)
	event, e := r.ReadString('\n')
	if e != nil || event != "event: saved.changed\n" {
		t.Fatal(event, e)
	}
	data, _ := r.ReadString('\n')
	_, _ = r.ReadString('\n')
	if !strings.Contains(data, a.Owner.Hex()) || strings.Contains(data, b.Owner.Hex()) || !strings.Contains(data, `"revision":0`) {
		t.Fatal(data)
	}
	m.mu.Lock()
	m.versions[a.Owner] = 1
	m.mu.Unlock()
	hub.Notify(a.Owner)
	_, e = r.ReadString('\n')
	if !errors.Is(e, io.EOF) {
		t.Fatal("revoked stream stayed open", e)
	}
}
func TestResolveRedactsUnavailablePostsAndPreservesOtherAccounts(t *testing.T) {
	s, m, a, b, id := setup()
	ctx := context.Background()
	_, _ = s.Update(ctx, a, id.Hex(), request(true, 0, 1))
	_, _ = s.Update(ctx, b, id.Hex(), request(true, 0, 2))
	m.mu.Lock()
	m.hidden[id] = true
	m.mu.Unlock()
	result, e := s.Resolve(ctx, a, []string{id.Hex()})
	if e != nil || len(result.Items) != 1 || result.Items[0].Available || result.Items[0].Author != nil || result.Items[0].Thumbnail != "" {
		t.Fatal(result, e)
	}
	_, e = s.Update(ctx, a, id.Hex(), request(false, 1, 3))
	if e != nil {
		t.Fatal(e)
	}
	result, e = s.Resolve(ctx, a, []string{id.Hex()})
	if e != nil || len(result.Items) != 0 {
		t.Fatal(result, e)
	}
	other, _ := s.State(ctx, b, id.Hex())
	if !other.Saved {
		t.Fatal("other bookmark removed")
	}
}
