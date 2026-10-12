package pinpost

import (
	"encoding/json"
	"errors"
	"everest-backend/internal/middleware"
	"io"
	"net/http"
)

type Handler struct{ service *Service }

func NewHandler(service *Service) *Handler { return &Handler{service} }
func RegisterRoutes(mux *http.ServeMux, h *Handler, secret string) {
	auth := middleware.AuthMiddleware(secret)
	mux.Handle("GET /api/post-pins/users/{user_id}", auth(http.HandlerFunc(h.Read)))
	mux.Handle("PUT /api/post-pins/me", auth(http.HandlerFunc(h.Update)))
	mux.Handle("GET /api/post-pins/operations/{request_id}", auth(http.HandlerFunc(h.Receipt)))
}
func authenticated(r *http.Request) (string, int64, bool) {
	id, ok := r.Context().Value(middleware.UserIDKey).(string)
	v, valid := r.Context().Value(middleware.SessionVersionKey).(int64)
	return id, v, ok && id != "" && valid && v >= 0
}
func write(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
func (h *Handler) fail(w http.ResponseWriter, err error) {
	status, message := 503, ErrUnavailable.Error()
	for _, entry := range []struct {
		err    error
		status int
	}{{ErrInput, 400}, {ErrSession, 401}, {ErrOwner, 403}, {ErrPost, 404}, {ErrProfile, 404}, {ErrConflict, 409}, {ErrReceipt, 404}, {ErrRateLimit, 429}} {
		if errors.Is(err, entry.err) {
			status, message = entry.status, entry.err.Error()
			break
		}
	}
	if status == 429 {
		w.Header().Set("Retry-After", "60")
	}
	write(w, status, map[string]string{"error": message})
}
func (h *Handler) Read(w http.ResponseWriter, r *http.Request) {
	id, v, ok := authenticated(r)
	if !ok {
		h.fail(w, ErrSession)
		return
	}
	value, err := h.service.Read(r.Context(), id, v, r.PathValue("user_id"))
	if err != nil {
		h.fail(w, err)
		return
	}
	write(w, 200, value)
}
func (h *Handler) Update(w http.ResponseWriter, r *http.Request) {
	id, v, ok := authenticated(r)
	if !ok {
		h.fail(w, ErrSession)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 2048)
	d := json.NewDecoder(r.Body)
	d.DisallowUnknownFields()
	var req Request
	if d.Decode(&req) != nil {
		h.fail(w, ErrInput)
		return
	}
	if err := d.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		h.fail(w, ErrInput)
		return
	}
	value, err := h.service.Update(r.Context(), id, v, req)
	if err != nil {
		h.fail(w, err)
		return
	}
	write(w, 200, value)
}
func (h *Handler) Receipt(w http.ResponseWriter, r *http.Request) {
	id, v, ok := authenticated(r)
	if !ok {
		h.fail(w, ErrSession)
		return
	}
	value, err := h.service.Receipt(r.Context(), id, v, r.PathValue("request_id"))
	if err != nil {
		h.fail(w, err)
		return
	}
	write(w, 200, value)
}
