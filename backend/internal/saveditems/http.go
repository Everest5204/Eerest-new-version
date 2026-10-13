package saveditems

import (
	"context"
	"encoding/json"
	"errors"
	"everest-backend/internal/middleware"
	notification "everest-backend/internal/notification/core"
	"io"
	"net/http"
	"strconv"
	"time"
)

type Handler struct {
	service *Service
	hub     *notification.Hub
}

func NewHandler(s *Service, h *notification.Hub) *Handler { return &Handler{s, h} }
func RegisterRoutes(mux *http.ServeMux, h *Handler, secret string) {
	auth := middleware.AuthMiddleware(secret)
	for path, fn := range map[string]http.HandlerFunc{"GET /api/saved-items": h.list, "GET /api/saved-items/status": h.state, "GET /api/saved-items/post": h.target, "PUT /api/saved-items/{post_id}": h.update, "GET /api/saved-items/stream": h.stream, "POST /api/saved-items/resolve": h.resolve} {
		mux.Handle(path, auth(fn))
	}
}
func authenticated(r *http.Request) (Auth, error) {
	id, _ := r.Context().Value(middleware.UserIDKey).(string)
	owner, e := objectID(id)
	version, ok := r.Context().Value(middleware.SessionVersionKey).(int64)
	if e != nil || !ok || version < 0 {
		return Auth{}, ErrSession
	}
	return Auth{owner, version}, nil
}
func write(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
func fail(w http.ResponseWriter, e error) {
	status, message := 503, ErrUnavailable.Error()
	for _, v := range []struct {
		err    error
		status int
	}{{ErrInput, 400}, {ErrSession, 401}, {ErrPost, 404}, {ErrConflict, 409}} {
		if errors.Is(e, v.err) {
			status, message = v.status, v.err.Error()
			break
		}
	}
	write(w, status, map[string]string{"error": message})
}
func query(r *http.Request) (Query, error) {
	v := r.URL.Query()
	q := Query{Kind: v.Get("kind"), Search: v.Get("q"), Cursor: v.Get("cursor"), Limit: 20}
	if q.Kind == "" {
		q.Kind = "all"
	}
	for k, values := range v {
		if len(values) != 1 || (k != "kind" && k != "q" && k != "limit" && k != "cursor") {
			return q, ErrInput
		}
	}
	if v.Get("limit") != "" {
		var e error
		q.Limit, e = strconv.Atoi(v.Get("limit"))
		if e != nil {
			return q, ErrInput
		}
	}
	return normalize(q)
}
func queryID(r *http.Request) (string, error) {
	v := r.URL.Query()
	if len(v) != 1 || len(v["post_id"]) != 1 {
		return "", ErrInput
	}
	id := v.Get("post_id")
	if _, e := objectID(id); e != nil {
		return "", e
	}
	return id, nil
}
func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	a, e := authenticated(r)
	if e != nil {
		fail(w, e)
		return
	}
	q, e := query(r)
	if e != nil {
		fail(w, e)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()
	p, e := h.service.List(ctx, a, q)
	if e != nil {
		fail(w, e)
		return
	}
	write(w, 200, p)
}
func (h *Handler) state(w http.ResponseWriter, r *http.Request) {
	a, e := authenticated(r)
	if e != nil {
		fail(w, e)
		return
	}
	id, e := queryID(r)
	if e != nil {
		fail(w, e)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()
	s, e := h.service.State(ctx, a, id)
	if e != nil {
		fail(w, e)
		return
	}
	write(w, 200, s)
}
func (h *Handler) target(w http.ResponseWriter, r *http.Request) {
	a, e := authenticated(r)
	if e != nil {
		fail(w, e)
		return
	}
	id, e := queryID(r)
	if e != nil {
		fail(w, e)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()
	t, e := h.service.Target(ctx, a, id)
	if e != nil {
		fail(w, e)
		return
	}
	write(w, 200, t)
}
func (h *Handler) update(w http.ResponseWriter, r *http.Request) {
	a, e := authenticated(r)
	if e != nil {
		fail(w, e)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 2048)
	d := json.NewDecoder(r.Body)
	d.DisallowUnknownFields()
	var req Request
	if d.Decode(&req) != nil || !errors.Is(d.Decode(&struct{}{}), io.EOF) {
		fail(w, ErrInput)
		return
	}
	if len(r.URL.RawQuery) != 0 {
		fail(w, ErrInput)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 12*time.Second)
	defer cancel()
	s, e := h.service.Update(ctx, a, r.PathValue("post_id"), req)
	if e != nil {
		fail(w, e)
		return
	}
	h.hub.Notify(a.Owner)
	write(w, 200, s)
}

func (h *Handler) resolve(w http.ResponseWriter, r *http.Request) {
	a, e := authenticated(r)
	if e != nil {
		fail(w, e)
		return
	}
	if r.URL.RawQuery != "" {
		fail(w, ErrInput)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 2048)
	d := json.NewDecoder(r.Body)
	d.DisallowUnknownFields()
	var body struct {
		IDs []string `json:"post_ids"`
	}
	if d.Decode(&body) != nil || !errors.Is(d.Decode(&struct{}{}), io.EOF) {
		fail(w, ErrInput)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()
	value, e := h.service.Resolve(ctx, a, body.IDs)
	if e != nil {
		fail(w, e)
		return
	}
	write(w, 200, value)
}
