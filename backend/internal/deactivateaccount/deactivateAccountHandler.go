package deactivateaccount

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"everest-backend/internal/middleware"
)

type Handler struct{ service *Service }

func NewHandler(service *Service) *Handler { return &Handler{service: service} }

func RegisterRoutes(mux *http.ServeMux, handler *Handler, jwtSecret string) {
	mux.Handle("/api/auth/deactivate-account", middleware.AuthMiddleware(jwtSecret)(http.HandlerFunc(handler.Deactivate)))
}

func (h *Handler) Deactivate(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST")
		writeError(w, 405, "Method not allowed")
		return
	}
	userID, ok := r.Context().Value(middleware.UserIDKey).(string)
	version, hasVersion := r.Context().Value(middleware.SessionVersionKey).(int64)
	if !ok || !hasVersion {
		writeError(w, 401, ErrSessionExpired.Error())
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	var request Request
	if decoder.Decode(&request) != nil {
		writeError(w, 400, "Invalid request body")
		return
	}
	var extra any
	if decoder.Decode(&extra) != io.EOF {
		writeError(w, 400, "Invalid request body")
		return
	}
	response, err := h.service.Deactivate(r.Context(), userID, version, request)
	if err != nil {
		status := 503
		message := ErrUnavailable.Error()
		switch {
		case errors.Is(err, ErrInvalidRequest):
			status, message = 400, err.Error()
		case errors.Is(err, ErrWrongPassword), errors.Is(err, ErrPasswordRequired):
			status, message = 403, err.Error()
		case errors.Is(err, ErrSessionExpired):
			status, message = 401, err.Error()
		case errors.Is(err, ErrDeleting):
			status, message = 409, err.Error()
		case errors.Is(err, ErrRateLimited):
			status, message = 429, err.Error()
			w.Header().Set("Retry-After", "60")
		}
		writeError(w, status, message)
		return
	}
	_ = json.NewEncoder(w).Encode(response)
}

func writeError(w http.ResponseWriter, status int, message string) {
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": message})
}
