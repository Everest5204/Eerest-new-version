package reportpost

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"everest-backend/internal/middleware"
)

const testOwner = "507f1f77bcf86cd799439011"
const testPost = "507f1f77bcf86cd799439012"
const testRequest = "0f30e8f5-1d69-4a8d-9fa9-f69c1f0a4b52"

func validRequest() Request {
	return Request{PostID: testPost, PostSource: "text", Reason: "spam", RequestID: testRequest}
}

type fakeStore struct {
	calls      int
	auth       session
	submission submission
	response   *Response
	err        error
}

func (s *fakeStore) Submit(_ context.Context, auth session, p submission, _ time.Time) (*Response, error) {
	s.calls++
	s.auth = auth
	s.submission = p
	return s.response, s.err
}
func (s *fakeStore) Receipt(_ context.Context, auth session, _ string) (*Response, error) {
	s.calls++
	s.auth = auth
	return s.response, s.err
}
func fakeService() (*Service, *fakeStore) {
	store := &fakeStore{response: &Response{Report: Receipt{ID: testPost, RequestID: testRequest, PostID: testPost, PostSource: "text", Reason: "spam", Status: "pending", ReceivedAt: time.Now().UTC()}}}
	return NewService(store), store
}

func TestValidReasonsUnicodeDetailsAndAuthenticatedScope(t *testing.T) {
	s, store := fakeService()
	for reason := range reasons {
		req := validRequest()
		req.Reason = reason
		req.Details = "  " + strings.Repeat("😀", 1000) + "  "
		if _, err := s.Submit(context.Background(), testOwner, 7, req); err != nil {
			t.Fatal(reason, err)
		}
		if store.auth.owner.Hex() != testOwner || store.auth.version != 7 || store.submission.Details != strings.TrimSpace(req.Details) {
			t.Fatal("incorrect owner or details")
		}
	}
	if _, err := s.Receipt(context.Background(), testOwner, 7, testRequest); err != nil || store.auth.version != 7 {
		t.Fatal("invalid receipt scope", err)
	}
}
func TestInvalidInputsNeverReachTheStore(t *testing.T) {
	s, store := fakeService()
	for _, change := range []func(*Request){
		func(r *Request) { r.PostID = "bad" }, func(r *Request) { r.PostID = strings.Repeat("0", 24) },
		func(r *Request) { r.PostSource = "text_posts" }, func(r *Request) { r.Reason = "unknown" },
		func(r *Request) { r.RequestID = "old-id" }, func(r *Request) { r.Details = strings.Repeat("😀", 1001) },
		func(r *Request) { r.Details = "not\x00allowed" }, func(r *Request) { r.Details = string([]byte{0xff}) },
	} {
		req := validRequest()
		change(&req)
		if _, err := s.Submit(context.Background(), testOwner, 0, req); !errors.Is(err, ErrInput) {
			t.Fatal("invalid input accepted", req, err)
		}
	}
	for _, owner := range []string{"bad", strings.Repeat("0", 24)} {
		if _, err := s.Submit(context.Background(), owner, 0, validRequest()); !errors.Is(err, ErrSession) {
			t.Fatal("invalid identity accepted")
		}
	}
	if _, err := s.Submit(context.Background(), testOwner, -1, validRequest()); !errors.Is(err, ErrSession) {
		t.Fatal("invalid session version accepted")
	}
	if _, err := s.Receipt(context.Background(), testOwner, 0, "not-a-uuid"); !errors.Is(err, ErrInput) {
		t.Fatal("invalid receipt accepted")
	}
	if store.calls != 0 {
		t.Fatal("invalid input reached storage")
	}
}
func handle(h http.HandlerFunc, body string, auth bool) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodPost, "/api/reports/posts", strings.NewReader(body))
	if auth {
		ctx := context.WithValue(r.Context(), middleware.UserIDKey, testOwner)
		ctx = context.WithValue(ctx, middleware.SessionVersionKey, int64(3))
		r = r.WithContext(ctx)
	}
	w := httptest.NewRecorder()
	h(w, r)
	return w
}

const requestJSON = `{"post_id":"507f1f77bcf86cd799439012","post_source":"text","reason":"spam","details":"","request_id":"0f30e8f5-1d69-4a8d-9fa9-f69c1f0a4b52"}`

func TestHandlerRejectsSpoofedFieldsMissingAuthAndMalformedBodies(t *testing.T) {
	s, store := fakeService()
	h := NewHandler(s)
	for _, body := range []string{requestJSON + ` {}`, strings.Replace(requestJSON, `"details":""`, `"details":"","reporter_id":"spoof"`, 1),
		strings.Replace(requestJSON, `"details":""`, `"details":"","status":"reviewed"`, 1), strings.Repeat("a", 8193), `[]`, `{}`} {
		if w := handle(h.Submit, body, true); w.Code != 400 {
			t.Fatal("malformed body accepted", w.Code)
		}
	}
	if w := handle(h.Submit, requestJSON, false); w.Code != 401 {
		t.Fatal("missing auth accepted")
	}
	if store.calls != 0 {
		t.Fatal("malformed request reached storage")
	}
}
func TestHandlerReceiptPrivacyStatusesAndErrorSanitization(t *testing.T) {
	s, store := fakeService()
	h := NewHandler(s)
	w := handle(h.Submit, requestJSON, true)
	if w.Code != 201 || w.Header().Get("Cache-Control") != "private, no-store" || store.auth.version != 3 {
		t.Fatal("invalid receipt")
	}
	for _, field := range []string{"reporter_id", "reported_user_id", "details", "snapshot", "moderation_notes"} {
		if strings.Contains(w.Body.String(), field) {
			t.Fatal("private receipt exposed", field)
		}
	}
	store.response.AlreadyReported = true
	if w = handle(h.Submit, requestJSON, true); w.Code != 200 {
		t.Fatal("duplicate did not return receipt")
	}
	for err, status := range map[error]int{ErrSession: 401, ErrPost: 404, ErrOwnPost: 403, ErrConflict: 409, ErrRateLimit: 429, ErrUnavailable: 503, errors.New("mongodb password=secret"): 503} {
		store.err = err
		w = handle(h.Submit, requestJSON, true)
		if w.Code != status || strings.Contains(w.Body.String(), "password") || (status == 429 && w.Header().Get("Retry-After") == "") {
			t.Fatal("invalid or unsafe error", status, w.Body.String())
		}
	}
}
