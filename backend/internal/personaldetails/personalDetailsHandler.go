package personaldetails

import (
	"encoding/json"
	"errors"
	"everest-backend/internal/middleware"
	notification "everest-backend/internal/notification/core"
	"io"
	"net/http"
)

type Handler struct {
	service *Service
	hub     *notification.Hub
}

func NewHandler(service *Service) *Handler { return &Handler{service: service} }
func NewLiveHandler(service *Service, hub *notification.Hub) *Handler {
	return &Handler{service: service, hub: hub}
}
func RegisterRoutes(mux *http.ServeMux, h *Handler, secret string) {
	// Public capability probe contains no account data and permits deployment verification.
	mux.HandleFunc("GET /api/personal-details/status", func(w http.ResponseWriter, r *http.Request) {
		write(w, http.StatusOK, map[string]any{"personal_details_version": 3, "shared_details": true, "identity_review": true, "public_info": true})
	})
	auth := middleware.AuthMiddleware(secret)
	mux.Handle("GET /api/user/personal-details", auth(http.HandlerFunc(h.Get)))
	mux.Handle("PATCH /api/user/personal-details", auth(http.HandlerFunc(h.Update)))
	mux.Handle("POST /api/user/personal-details/change-requests", auth(http.HandlerFunc(h.Submit)))
	mux.Handle("GET /api/users/{userID}/info", auth(http.HandlerFunc(h.Public)))
	if h.hub != nil {
		mux.Handle("GET /api/user/personal-details/events", auth(http.HandlerFunc(h.Stream)))
		mux.Handle("GET /api/users/{userID}/info/events", auth(http.HandlerFunc(h.Stream)))
	}
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
	w.Header().Set("X-Mongosky-Personal-Details-Version", "3")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
func fail(w http.ResponseWriter, err error) {
	status, message, code := http.StatusServiceUnavailable, "Could not confirm your details. Please refresh and try again.", "details_unavailable"
	switch {
	case errors.Is(err, ErrSession):
		status, message, code = http.StatusUnauthorized, ErrSession.Error(), "session_expired"
	case errors.Is(err, ErrConflict):
		status, message, code = http.StatusConflict, ErrConflict.Error(), "revision_conflict"
	case errors.Is(err, ErrInput):
		status, message, code = http.StatusBadRequest, ErrInput.Error(), "invalid_details"
	case errors.Is(err, ErrReviewRequired):
		status, message, code = http.StatusForbidden, ErrReviewRequired.Error(), "review_required"
	case errors.Is(err, ErrPending):
		status, message, code = http.StatusConflict, ErrPending.Error(), "request_pending"
	case errors.Is(err, ErrNotFound):
		status, message, code = http.StatusNotFound, ErrNotFound.Error(), "profile_unavailable"
	}
	write(w, status, map[string]string{"error": message, "code": code})
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
	write(w, http.StatusOK, map[string]any{"personal_details_version": 3, "details": value})
}
func (h *Handler) Update(w http.ResponseWriter, r *http.Request) {
	owner, version, ok := session(r)
	if !ok {
		fail(w, ErrSession)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 32768)
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
	write(w, http.StatusOK, map[string]any{"personal_details_version": 3, "details": value})
}

func (h *Handler) Public(w http.ResponseWriter, r *http.Request) {
	owner, version, ok := session(r)
	if !ok {
		fail(w, ErrSession)
		return
	}
	value, err := h.service.Public(r.Context(), owner, version, r.PathValue("userID"))
	if err != nil {
		fail(w, err)
		return
	}
	write(w, http.StatusOK, map[string]any{"personal_details_version": 3, "info": value})
}

func (h *Handler) Submit(w http.ResponseWriter, r *http.Request) {
	owner, version, ok := session(r)
	if !ok {
		fail(w, ErrSession)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 8192)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	var req ReviewRequest
	if decoder.Decode(&req) != nil {
		fail(w, ErrInput)
		return
	}
	var extra any
	if decoder.Decode(&extra) != io.EOF {
		fail(w, ErrInput)
		return
	}
	value, err := h.service.Submit(r.Context(), owner, version, req)
	if err != nil {
		fail(w, err)
		return
	}
	write(w, http.StatusOK, map[string]any{"personal_details_version": 3, "details": value})
}
