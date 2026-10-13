package myactivity

import (
	"context"
	"encoding/json"
	"errors"
	"everest-backend/internal/middleware"
	notification "everest-backend/internal/notification/core"
	"fmt"
	"go.mongodb.org/mongo-driver/v2/bson"
	"net/http"
	"strconv"
	"time"
)

type Handler struct {
	service *Service
	hub     *notification.Hub
}

func NewHandler(service *Service, hub *notification.Hub) *Handler { return &Handler{service, hub} }
func RegisterRoutes(mux *http.ServeMux, h *Handler, secret string) {
	auth := middleware.AuthMiddleware(secret)
	mux.Handle("GET /api/my-activity", auth(http.HandlerFunc(h.list)))
	mux.Handle("GET /api/my-activity/target", auth(http.HandlerFunc(h.target)))
	mux.Handle("GET /api/my-activity/stream", auth(http.HandlerFunc(h.stream)))
}
func owner(r *http.Request) (bson.ObjectID, bool) {
	s, ok := r.Context().Value(middleware.UserIDKey).(string)
	id, e := bson.ObjectIDFromHex(s)
	return id, ok && e == nil && !id.IsZero()
}
func write(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}
func fail(w http.ResponseWriter, e error) {
	status := http.StatusServiceUnavailable
	message := "Could not load your activity. Please try again."
	if errors.Is(e, ErrInput) {
		status = 400
		message = "Invalid activity filter or cursor. Refresh and try again."
	}
	if errors.Is(e, ErrUnavailable) {
		status = 404
		message = "This activity is no longer available."
	}
	write(w, status, map[string]string{"error": message})
}
func parseQuery(r *http.Request) (Query, error) {
	v := r.URL.Query()
	q := Query{Category: v.Get("category"), Limit: 20, Cursor: v.Get("cursor")}
	if q.Category == "" {
		q.Category = "all"
	}
	// Reject duplicate parameters to keep cursor/filter binding unambiguous.
	for k, values := range v {
		if len(values) != 1 || (k != "category" && k != "limit" && k != "cursor" && k != "from" && k != "before") {
			return q, ErrInput
		}
	}
	var e error
	if v.Get("limit") != "" {
		q.Limit, e = strconv.Atoi(v.Get("limit"))
		if e != nil {
			return q, ErrInput
		}
	}
	if v.Get("from") != "" {
		q.From, e = time.Parse(time.RFC3339Nano, v.Get("from"))
		if e != nil {
			return q, ErrInput
		}
	}
	if v.Get("before") != "" {
		q.Before, e = time.Parse(time.RFC3339Nano, v.Get("before"))
		if e != nil {
			return q, ErrInput
		}
	}
	return q, validate(q)
}
func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	id, ok := owner(r)
	if !ok {
		write(w, 401, map[string]string{"error": "Please sign in again."})
		return
	}
	q, e := parseQuery(r)
	if e != nil {
		fail(w, e)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()
	page, e := h.service.List(ctx, id, q)
	if e != nil {
		fail(w, e)
		return
	}
	write(w, 200, page)
}
func (h *Handler) target(w http.ResponseWriter, r *http.Request) {
	id, ok := owner(r)
	if !ok {
		write(w, 401, map[string]string{"error": "Please sign in again."})
		return
	}
	v := r.URL.Query()
	if len(v) != 2 || len(v["id"]) != 1 || len(v["kind"]) != 1 {
		fail(w, ErrInput)
		return
	}
	recordID, e := bson.ObjectIDFromHex(v.Get("id"))
	if e != nil || recordID.IsZero() {
		fail(w, ErrInput)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()
	t, e := h.service.Target(ctx, id, v.Get("kind"), recordID)
	if e != nil {
		fail(w, e)
		return
	}
	write(w, 200, t)
}

// The stream carries owner-scoped invalidations, not private post payloads.
// Rotate before the existing server's 90-second write timeout.
func (h *Handler) stream(w http.ResponseWriter, r *http.Request) {
	id, ok := owner(r)
	version, versionOK := r.Context().Value(middleware.SessionVersionKey).(int64)
	if !ok || !versionOK {
		write(w, 401, map[string]string{"error": "Please sign in again."})
		return
	}
	check := func() bool {
		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()
		return h.service.checkSession(ctx, id, version) == nil
	}
	if !check() {
		write(w, 401, map[string]string{"error": "Please sign in again."})
		return
	}
	if _, ok := w.(http.Flusher); !ok {
		write(w, 503, map[string]string{"error": "Live updates are temporarily unavailable."})
		return
	}
	signals, cleanup, e := h.hub.Subscribe(r.Context(), id)
	if e != nil {
		fail(w, e)
		return
	}
	defer cleanup()
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Accel-Buffering", "no")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	c := http.NewResponseController(w)
	heart := time.NewTicker(15 * time.Second)
	defer heart.Stop()
	rotate := time.NewTimer(75 * time.Second)
	defer rotate.Stop()
	send := func(frame string) bool {
		_ = c.SetWriteDeadline(time.Now().Add(8 * time.Second))
		if _, e := fmt.Fprint(w, frame); e != nil {
			return false
		}
		return c.Flush() == nil
	}
	for {
		select {
		case <-r.Context().Done():
			return
		case <-rotate.C:
			return
		case _, open := <-signals:
			if !open || !check() {
				return
			}
			if !send("event: activity.changed\ndata: {\"owner_id\":\"" + id.Hex() + "\"}\n\n") {
				return
			}
		case <-heart.C:
			if !check() || !send(": keep-alive\n\n") {
				return
			}
		}
	}
}
