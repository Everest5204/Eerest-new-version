package reportpost

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"

	"everest-backend/internal/middleware"
)

type Handler struct{ service *Service }

func NewHandler(service *Service) *Handler { return &Handler{service: service} }
func RegisterRoutes(mux *http.ServeMux, h *Handler, secret string) {
	auth := middleware.AuthMiddleware(secret)
	mux.Handle("POST /api/reports/posts", auth(http.HandlerFunc(h.Submit)))
	mux.Handle("GET /api/reports/posts/{request_id}", auth(http.HandlerFunc(h.Receipt)))
}
func authenticated(r *http.Request) (string, int64, bool) {
	owner, ok := r.Context().Value(middleware.UserIDKey).(string)
	version, valid := r.Context().Value(middleware.SessionVersionKey).(int64)
	return owner, version, ok && owner != "" && valid && version >= 0
}
func write(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
func (h *Handler) fail(w http.ResponseWriter, err error) {
	status, message := http.StatusServiceUnavailable, ErrUnavailable.Error()
	switch {
	case errors.Is(err, ErrInput):
		status, message = 400, ErrInput.Error()
	case errors.Is(err, ErrSession):
		status, message = 401, ErrSession.Error()
	case errors.Is(err, ErrOwnPost):
		status, message = 403, ErrOwnPost.Error()
	case errors.Is(err, ErrPost):
		status, message = 404, ErrPost.Error()
	case errors.Is(err, ErrReceiptNotFound):
		status, message = 404, ErrReceiptNotFound.Error()
	case errors.Is(err, ErrConflict):
		status, message = 409, ErrConflict.Error()
	case errors.Is(err, ErrRateLimit):
		status, message = 429, ErrRateLimit.Error()
		w.Header().Set("Retry-After", strconv.Itoa(h.service.retryAfter()))
	}
	write(w, status, map[string]string{"error": message})
}
func (h *Handler) Submit(w http.ResponseWriter, r *http.Request) {
	owner, version, ok := authenticated(r)
	if !ok {
		h.fail(w, ErrSession)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 8192)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	var req Request
	if err := decoder.Decode(&req); err != nil {
		h.fail(w, ErrInput)
		return
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		h.fail(w, ErrInput)
		return
	}
	result, err := h.service.Submit(r.Context(), owner, version, req)
	if err != nil {
		h.fail(w, err)
		return
	}
	status := 201
	if result.AlreadyReported {
		status = 200
	}
	write(w, status, result)
}
func (h *Handler) Receipt(w http.ResponseWriter, r *http.Request) {
	owner, version, ok := authenticated(r)
	if !ok {
		h.fail(w, ErrSession)
		return
	}
	result, err := h.service.Receipt(r.Context(), owner, version, r.PathValue("request_id"))
	if err != nil {
		h.fail(w, err)
		return
	}
	write(w, 200, result)
}
