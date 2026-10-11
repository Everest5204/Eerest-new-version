package personaldetails

import (
	"encoding/json"
	"errors"
	"everest-backend/internal/middleware"
	"io"
	"net/http"
)

type Handler struct{ service *Service }

func NewHandler(service *Service) *Handler { return &Handler{service: service} }
func RegisterRoutes(mux *http.ServeMux, h *Handler, secret string) {
	auth := middleware.AuthMiddleware(secret)
	mux.Handle("GET /api/user/personal-details", auth(http.HandlerFunc(h.Get)))
	mux.Handle("PATCH /api/user/personal-details", auth(http.HandlerFunc(h.Update)))
}
func session(r *http.Request) (string, int64, bool) {
	owner, ok := r.Context().Value(middleware.UserIDKey).(string)
	version, hasVersion := r.Context().Value(middleware.SessionVersionKey).(int64)
	return owner, version, ok && owner != "" && hasVersion && version >= 0
}
func write(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
func fail(w http.ResponseWriter, err error) {
	status, message := http.StatusServiceUnavailable, "Could not confirm your details. Please refresh and try again."
	switch {
	case errors.Is(err, ErrSession):
		status, message = http.StatusUnauthorized, ErrSession.Error()
	case errors.Is(err, ErrConflict):
		status, message = http.StatusConflict, ErrConflict.Error()
	case errors.Is(err, ErrInput):
		status, message = http.StatusBadRequest, ErrInput.Error()
	}
	write(w, status, map[string]string{"error": message})
}
func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	owner, version, ok := session(r)
	if !ok {
		fail(w, ErrSession)
		return
	}
	value, err := h.service.Get(r.Context(), owner, version)
	if err != nil {
		fail(w, err)
		return
	}
	write(w, http.StatusOK, map[string]any{"details": value})
}
func (h *Handler) Update(w http.ResponseWriter, r *http.Request) {
	owner, version, ok := session(r)
	if !ok {
		fail(w, ErrSession)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 2048)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	var req PatchRequest
	if decoder.Decode(&req) != nil {
		fail(w, ErrInput)
		return
	}
	var extra any
	if decoder.Decode(&extra) != io.EOF {
		fail(w, ErrInput)
		return
	}
	value, err := h.service.Update(r.Context(), owner, version, req)
	if err != nil {
		fail(w, err)
		return
	}
	write(w, http.StatusOK, map[string]any{"details": value})
}
