package personaldetails

import (
	"context"
	"encoding/json"
	"errors"
	"everest-backend/internal/middleware"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

type memoryStore struct {
	calls   int
	value   Details
	last    patch
	owner   string
	version int64
	review  ReviewRequest
	public  PublicDetails
}

func (m *memoryStore) Get(_ context.Context, owner string, version int64) (*Details, error) {
	m.owner, m.version = owner, version
	return &m.value, nil
}
func (m *memoryStore) Update(_ context.Context, owner string, version int64, p patch) (*Details, error) {
	m.calls++
	m.owner, m.version, m.last = owner, version, p
	return &m.value, nil
}
func (m *memoryStore) Public(_ context.Context, owner string, version int64, target string) (*PublicDetails, error) {
	m.owner, m.version = owner, version
	return &m.public, nil
}
func (m *memoryStore) Submit(_ context.Context, owner string, version int64, req ReviewRequest, now time.Time) (*Details, error) {
	m.calls++
	m.owner, m.version, m.review = owner, version, req
	return &m.value, nil
}
func ptr[T any](v T) *T { return &v }
func testService() (*Service, *memoryStore) {
	m := &memoryStore{}
	s := NewService(m)
	s.clock = func() time.Time { return time.Date(2026, 10, 11, 12, 0, 0, 0, time.UTC) }
	return s, m
}
func TestIdentityEditsAlwaysRequireReview(t *testing.T) {
	s, m := testService()
	for _, req := range []PatchRequest{
		{ExpectedRevision: ptr(int64(0)), Gender: ptr("female")},
		{ExpectedRevision: ptr(int64(0)), BirthDate: ptr("2000-02-29")},
		{ExpectedRevision: ptr(int64(0)), Gender: ptr(""), Shared: SharedDetails{"hometown": "Dhaka"}},
	} {
		if _, err := s.Update(context.Background(), "owner", 2, req); !errors.Is(err, ErrReviewRequired) {
			t.Fatal("identity write accepted", err)
		}
	}
	if m.calls != 0 {
		t.Fatal("identity edit reached store")
	}
}
func TestSharedFieldValidationAndAuthenticatedScope(t *testing.T) {
	s, m := testService()
	for key, limit := range fieldLimits {
		value := "Test"
		if key == "marital_status" {
			value = "married"
		}
		if _, err := s.Update(context.Background(), "owner", 3, PatchRequest{ExpectedRevision: ptr(int64(4)), Shared: SharedDetails{key: value}}); err != nil || m.last.values[key] != value || m.owner != "owner" || m.version != 3 {
			t.Fatal(key, err)
		}
		if _, err := s.Update(context.Background(), "owner", 3, PatchRequest{ExpectedRevision: ptr(int64(4)), Shared: SharedDetails{key: strings.Repeat("ব", limit+1)}}); !errors.Is(err, ErrInput) {
			t.Fatal("accepted overlong field", key)
		}
	}
	for _, req := range []PatchRequest{{Shared: SharedDetails{"hometown": "Dhaka"}}, {ExpectedRevision: ptr(int64(-1)), Shared: SharedDetails{"hometown": "Dhaka"}}, {ExpectedRevision: ptr(int64(0))},
		{ExpectedRevision: ptr(int64(0)), Shared: SharedDetails{"gender": "male"}}, {ExpectedRevision: ptr(int64(0)), Shared: SharedDetails{"$set": "bad"}},
		{ExpectedRevision: ptr(int64(0)), Shared: SharedDetails{"hometown": "x\x00y"}}, {ExpectedRevision: ptr(int64(0)), Shared: SharedDetails{"marital_status": "unknown"}}} {
		if _, err := s.Update(context.Background(), "owner", 3, req); !errors.Is(err, ErrInput) {
			t.Fatal("accepted invalid patch", err)
		}
	}
	_, err := s.Update(context.Background(), "owner", 3, PatchRequest{ExpectedRevision: ptr(int64(4)), Shared: SharedDetails{"education": "  University\n2022–2026  ", "contact": ""}})
	if err != nil || m.last.values["education"] != "University\n2022–2026" || m.last.values["contact"] != "" {
		t.Fatal("normalization/removal failed", err)
	}
}
func validReview() ReviewRequest {
	return ReviewRequest{ExpectedRevision: ptr(int64(0)), RequestID: "11111111-1111-4111-8111-111111111111", Field: "birth_date", ProposedValue: "2000-02-29", Reason: "My registration date was entered incorrectly."}
}
func TestReviewValidation(t *testing.T) {
	s, m := testService()
	for _, date := range []string{"2025-02-29", "2026-11-01", "1899-12-31", "2000-2-3", "invalid"} {
		req := validReview()
		req.ProposedValue = date
		if _, err := s.Submit(context.Background(), "owner", 3, req); !errors.Is(err, ErrInput) {
			t.Fatal("invalid birthday accepted", date)
		}
	}
	for _, alter := range []func(*ReviewRequest){func(r *ReviewRequest) { r.RequestID = "bad" }, func(r *ReviewRequest) { r.Reason = "short" }, func(r *ReviewRequest) { r.Field = "hometown" }, func(r *ReviewRequest) { r.ExpectedRevision = nil }, func(r *ReviewRequest) { r.Field = "gender"; r.ProposedValue = "invalid" }, func(r *ReviewRequest) { r.Reason = "Invalid\x00control character" }} {
		req := validReview()
		alter(&req)
		if _, err := s.Submit(context.Background(), "owner", 3, req); !errors.Is(err, ErrInput) {
			t.Fatal("invalid request accepted", req)
		}
	}
	if m.calls != 0 {
		t.Fatal("invalid request reached store")
	}
	for _, value := range []string{"2000-02-29", "2026-10-11", ""} {
		req := validReview()
		req.ProposedValue = value
		if _, err := s.Submit(context.Background(), "owner", 3, req); err != nil {
			t.Fatal("valid birthday request rejected", err)
		}
	}
	for _, value := range []string{"male", "female", "other", ""} {
		req := validReview()
		req.Field = "gender"
		req.ProposedValue = value
		if _, err := s.Submit(context.Background(), "owner", 3, req); err != nil || m.review.ProposedValue != value {
			t.Fatal("valid gender request rejected", err)
		}
	}
}
func request(h http.HandlerFunc, body string, authenticated bool) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodPatch, "/api/user/personal-details", strings.NewReader(body))
	if authenticated {
		ctx := context.WithValue(r.Context(), middleware.UserIDKey, "owner")
		ctx = context.WithValue(ctx, middleware.SessionVersionKey, int64(2))
		r = r.WithContext(ctx)
	}
	w := httptest.NewRecorder()
	h(w, r)
	return w
}
func TestHandlersRejectMalformedUnauthorizedAndProtectedFields(t *testing.T) {
	s, m := testService()
	h := NewHandler(s)
	for _, body := range []string{`{"expected_revision":0,"email_or_phone":"attacker@example.com"}`, `{"expected_revision":0,"first_name":"New"}`, `{"expected_revision":0,"personal_details":{"contact":42}}`, `{"expected_revision":0,"personal_details":{"contact":null}}`, `{"expected_revision":0,"personal_details":{"hometown":"Dhaka"}} {}`, `{"expected_revision":0,"personal_details":null}`, `{"expected_revision":"0","personal_details":{"hometown":"Dhaka"}}`, strings.Repeat("a", 32769)} {
		if w := request(h.Update, body, true); w.Code != 400 {
			t.Fatalf("status=%d body=%q", w.Code, body)
		}
	}
	for _, body := range []string{`{"expected_revision":0,"gender":"female"}`, `{"expected_revision":0,"birth_date":"2000-01-01"}`} {
		if w := request(h.Update, body, true); w.Code != 403 {
			t.Fatal("legacy identity API accepted", w.Code)
		}
	}
	if m.calls != 0 {
		t.Fatal("malformed request wrote data")
	}
	for _, h := range []http.HandlerFunc{h.Update, h.Get, h.Submit, h.Public} {
		if w := request(h, `{}`, false); w.Code != 401 {
			t.Fatal("unauthenticated access accepted")
		}
	}
}
func TestPublicInfoNeverSerializesPrivateAccountOrRequests(t *testing.T) {
	s, m := testService()
	h := NewHandler(s)
	m.value = Details{ID: "owner", Contact: "private@example.com", Requests: []ChangeRequest{{Reason: "private review reason"}}}
	m.public = PublicDetails{ID: "target", FirstName: "Public", Shared: SharedDetails{"contact": "public@example.com", "hometown": "Dhaka"}}
	w := request(h.Public, "", true)
	if w.Code != 200 || w.Header().Get("Cache-Control") != "private, no-store" || m.owner != "owner" || m.version != 2 {
		t.Fatal("wrong public response", w.Code)
	}
	body := w.Body.String()
	for _, key := range []string{"email_or_phone", "email_verified", "change_requests", "private@example.com", "private review reason", "name_next_change_at"} {
		if strings.Contains(body, key) {
			t.Fatal("private data leaked", key)
		}
	}
	if !strings.Contains(body, "public@example.com") {
		t.Fatal("explicit shared contact missing")
	}
	var parsed map[string]any
	if json.Unmarshal(w.Body.Bytes(), &parsed) != nil {
		t.Fatal("invalid JSON")
	}
}
func TestRealtimeFilterIgnoresUnrelatedFeedChanges(t *testing.T) {
	for _, key := range []string{"personal_details.hometown", "personal_details_requests.gender.status", "birth_day", "deactivated", "session_version"} {
		if !relevantChange(key) {
			t.Fatal("missed info invalidation", key)
		}
	}
	for _, key := range []string{"followers_count", "posts_count", "bio", "updated_at"} {
		if relevantChange(key) {
			t.Fatal("unrelated change triggers refresh", key)
		}
	}
}

func TestDeploymentProbeAndProtectedInfoRoute(t *testing.T) {
	service, _ := testService()
	mux := http.NewServeMux()
	RegisterRoutes(mux, NewHandler(service), "test-secret")
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/personal-details/status", nil))
	if w.Code != 200 || w.Header().Get("X-Mongosky-Personal-Details-Version") != "3" || !strings.Contains(w.Body.String(), `"personal_details_version":3`) {
		t.Fatal("deployment probe does not expose the feature version", w.Code, w.Body.String())
	}
	w = httptest.NewRecorder()
	mux.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/users/111111111111111111111111/info", nil))
	if w.Code != 401 {
		t.Fatal("Info route is absent or not authenticated", w.Code)
	}
}

func TestMobileSharedPayloadAndUnavailableErrorContract(t *testing.T) {
	service, store := testService()
	store.value = Details{ID: "owner", Shared: SharedDetails{"nationality": "Bangladesh", "job_title": "Developer"}}
	h := NewHandler(service)
	w := request(h.Update, `{"expected_revision":0,"personal_details":{"nationality":"Bangladesh","job_title":"Developer","languages":"Bangla, English, Japanese, Korean"}}`, true)
	if w.Code != 200 || store.last.values["nationality"] != "Bangladesh" || store.last.values["job_title"] != "Developer" || !strings.Contains(w.Body.String(), `"personal_details_version":3`) {
		t.Fatal("mobile field contract rejected", w.Code, w.Body.String())
	}
	w = httptest.NewRecorder()
	fail(w, ErrNotFound)
	if w.Code != 404 || !strings.Contains(w.Body.String(), `"code":"profile_unavailable"`) {
		t.Fatal("missing profile is indistinguishable from a missing route", w.Body.String())
	}
}
