package profileview

import (
	"encoding/json"
	"errors"
	"net/http"

	"everest-backend/internal/middleware"
)

type Handler struct {
	service *Service
}

func NewHandler(service *Service) *Handler {
	return &Handler{
		service: service,
	}
}

func (handler *Handler) GetProfile(
	w http.ResponseWriter,
	r *http.Request,
) {
	viewerUserID, authenticated := getAuthenticatedUserID(r)

	if !authenticated {
		writeProfileError(
			w,
			http.StatusUnauthorized,
			"Unauthorized",
		)

		return
	}

	profile, err := handler.service.GetProfile(
		r.Context(),
		viewerUserID,
		r.PathValue("userID"),
	)

	if err != nil {
		writeProfileServiceError(w, err)
		return
	}

	writeProfileJSON(
		w,
		http.StatusOK,
		ProfileResponse{
			Profile: *profile,
		},
	)
}

func (handler *Handler) Follow(
	w http.ResponseWriter,
	r *http.Request,
) {
	viewerUserID, authenticated := getAuthenticatedUserID(r)

	if !authenticated {
		writeProfileError(
			w,
			http.StatusUnauthorized,
			"Unauthorized",
		)

		return
	}

	response, err := handler.service.Follow(
		r.Context(),
		viewerUserID,
		r.PathValue("userID"),
	)

	if err != nil {
		writeProfileServiceError(w, err)
		return
	}

	writeProfileJSON(
		w,
		http.StatusOK,
		response,
	)
}

func (handler *Handler) Unfollow(
	w http.ResponseWriter,
	r *http.Request,
) {
	viewerUserID, authenticated := getAuthenticatedUserID(r)

	if !authenticated {
		writeProfileError(
			w,
			http.StatusUnauthorized,
			"Unauthorized",
		)

		return
	}

	response, err := handler.service.Unfollow(
		r.Context(),
		viewerUserID,
		r.PathValue("userID"),
	)

	if err != nil {
		writeProfileServiceError(w, err)
		return
	}

	writeProfileJSON(
		w,
		http.StatusOK,
		response,
	)
}

func getAuthenticatedUserID(
	r *http.Request,
) (string, bool) {
	userID, ok := r.Context().
		Value(middleware.UserIDKey).
		(string)

	return userID, ok && userID != ""
}

func writeProfileServiceError(
	w http.ResponseWriter,
	err error,
) {
	switch {
	case errors.Is(err, ErrInvalidUserID):
		writeProfileError(
			w,
			http.StatusBadRequest,
			err.Error(),
		)

	case errors.Is(err, ErrCannotFollowSelf):
		writeProfileError(
			w,
			http.StatusBadRequest,
			err.Error(),
		)

	case errors.Is(err, ErrUserNotFound):
		writeProfileError(
			w,
			http.StatusNotFound,
			err.Error(),
		)

	default:
		writeProfileError(
			w,
			http.StatusInternalServerError,
			"Unable to process profile request",
		)
	}
}

func writeProfileError(
	w http.ResponseWriter,
	statusCode int,
	message string,
) {
	writeProfileJSON(
		w,
		statusCode,
		ErrorResponse{
			Error: message,
		},
	)
}

// Profile responses browser, proxy বা service worker cache করবে না।
func writeProfileJSON(
	w http.ResponseWriter,
	statusCode int,
	payload any,
) {
	w.Header().Set(
		"Content-Type",
		"application/json; charset=utf-8",
	)

	w.Header().Set(
		"Cache-Control",
		"no-store, no-cache, must-revalidate, proxy-revalidate",
	)

	w.Header().Set(
		"Pragma",
		"no-cache",
	)

	w.Header().Set(
		"Expires",
		"0",
	)

	w.Header().Set(
		"Surrogate-Control",
		"no-store",
	)

	w.Header().Set(
		"Vary",
		"Authorization",
	)

	w.Header().Set(
		"X-Content-Type-Options",
		"nosniff",
	)

	w.WriteHeader(statusCode)

	_ = json.NewEncoder(w).Encode(payload)
}