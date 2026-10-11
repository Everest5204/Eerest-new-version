package personaldetails

import (
	"context"
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
func ptr[T any](v T) *T { return &v }
func testService() (*Service, *memoryStore) {
	m := &memoryStore{}
	s := NewService(m)
	s.clock = func() time.Time { return time.Date(2026, 10, 11, 12, 0, 0, 0, time.UTC) }
	return s, m
}
func TestBirthdayValidationAndOptionalRemoval(t *testing.T) {
	s, m := testService()
	for _, date := range []string{"2025-02-29", "2026-11-01", "1899-12-31", "2000-2-3", "invalid"} {
		_, err := s.Update(context.Background(), "owner", 3, PatchRequest{ExpectedRevision: ptr(int64(0)), BirthDate: &date})
		if !errors.Is(err, ErrInput) {
			t.Fatalf("accepted %q", date)
		}
	}
	if m.calls != 0 {
		t.Fatal("invalid data reached the store")
	}
	for _, date := range []string{"2000-02-29", "2026-10-11", ""} {
		_, err := s.Update(context.Background(), "owner", 3, PatchRequest{ExpectedRevision: ptr(int64(0)), BirthDate: &date})
		if err != nil || *m.last.birth != date {
			t.Fatal("valid birthday/removal rejected", err)
		}
	}
}
func TestGenderAndRevisionValidation(t *testing.T) {
	s, m := testService()
	for _, req := range []PatchRequest{{Gender: ptr("male")}, {ExpectedRevision: ptr(int64(-1)), Gender: ptr("female")}, {ExpectedRevision: ptr(int64(0))}, {ExpectedRevision: ptr(int64(0)), Gender: ptr("unknown")}} {
		if _, err := s.Update(context.Background(), "owner", 2, req); !errors.Is(err, ErrInput) {
			t.Fatal("invalid patch accepted")
		}
	}
	if m.calls != 0 {
		t.Fatal("invalid data reached the store")
	}
	for _, gender := range []string{"male", "female", "other", ""} {
		if _, err := s.Update(context.Background(), "owner", 2, PatchRequest{ExpectedRevision: ptr(int64(4)), Gender: &gender}); err != nil || *m.last.gender != gender || m.owner != "owner" || m.version != 2 {
			t.Fatal("incorrect scope or gender", err)
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
func TestHandlerRejectsIdentityEditsAndMalformedBodies(t *testing.T) {
	s, m := testService()
	h := NewHandler(s)
	for _, body := range []string{`{"expected_revision":0,"email_or_phone":"attacker@example.com"}`, `{"expected_revision":0,"first_name":"New"}`, `{"expected_revision":0,"gender":"female"} {}`, `{"expected_revision":0,"gender":null}`, `{"expected_revision":"0","gender":"male"}`, strings.Repeat("a", 2049)} {
		w := request(h.Update, body, true)
		if w.Code != 400 {
			t.Fatalf("status %d for %q", w.Code, body)
		}
	}
	if m.calls != 0 {
		t.Fatal("invalid request wrote details")
	}
	if w := request(h.Update, `{"expected_revision":0,"gender":"female"}`, false); w.Code != 401 {
		t.Fatal("missing authenticated session accepted")
	}
}
func TestHandlerReturnsPrivateResponseAndAuthenticatedScope(t *testing.T) {
	s, m := testService()
	m.value = Details{ID: "owner", Contact: "private@example.com"}
	h := NewHandler(s)
	w := request(h.Update, `{"expected_revision":0,"gender":"female"}`, true)
	if w.Code != 200 || w.Header().Get("Cache-Control") != "private, no-store" || m.owner != "owner" || m.version != 2 || !strings.Contains(w.Body.String(), `"details"`) {
		t.Fatal("invalid private response", w.Body.String())
	}
}
