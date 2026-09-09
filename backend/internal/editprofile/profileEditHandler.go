package editprofile

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"strings"

	"everest-backend/internal/middleware"
)

type ProfileEditHandler struct {
	Service *ProfileEditService
}

func NewProfileEditHandler(
	service *ProfileEditService,
) *ProfileEditHandler {
	return &ProfileEditHandler{
		Service: service,
	}
}

// ProfileEditor handles:
//
// GET   /api/profile/edit
// PATCH /api/profile/edit
func (
	handler *ProfileEditHandler,
) ProfileEditor(
	w http.ResponseWriter,
	r *http.Request,
) {
	authUserID, ok :=
		getProfileEditAuthenticatedUserID(
			r,
		)
	if !ok {
		writeProfileEditError(
			w,
			http.StatusUnauthorized,
			"Unauthorized",
		)
		return
	}

	if handler == nil ||
		handler.Service == nil {
		writeProfileEditError(
			w,
			http.StatusInternalServerError,
			"Profile edit service is unavailable",
		)
		return
	}

	switch r.Method {
	case http.MethodGet:
		handler.getEditableProfile(
			w,
			r,
			authUserID,
		)

	case http.MethodPatch:
		handler.updateProfile(
			w,
			r,
			authUserID,
		)

	default:
		w.Header().Set(
			"Allow",
			"GET, PATCH",
		)

		writeProfileEditError(
			w,
			http.StatusMethodNotAllowed,
			"Method not allowed",
		)
	}
}

func (
	handler *ProfileEditHandler,
) getEditableProfile(
	w http.ResponseWriter,
	r *http.Request,
	authUserID string,
) {
	response, err :=
		handler.Service.
			GetEditableProfile(
				r.Context(),
				authUserID,
			)

	if err != nil {
		handleProfileEditServiceError(
			w,
			err,
		)
		return
	}

	writeProfileEditJSON(
		w,
		http.StatusOK,
		response,
	)
}

func (
	handler *ProfileEditHandler,
) updateProfile(
	w http.ResponseWriter,
	r *http.Request,
	authUserID string,
) {
	request, ok :=
		decodeProfileEditRequest(
			w,
			r,
		)
	if !ok {
		return
	}

	response, err :=
		handler.Service.UpdateProfile(
			r.Context(),
			ProfileEditInput{
				AuthUserID:
					authUserID,

				Bio:
					*request.Bio,
			},
		)

	if err != nil {
		handleProfileEditServiceError(
			w,
			err,
		)
		return
	}

	writeProfileEditJSON(
		w,
		http.StatusOK,
		response,
	)
}

func decodeProfileEditRequest(
	w http.ResponseWriter,
	r *http.Request,
) (ProfileEditRequest, bool) {
	r.Body = http.MaxBytesReader(
		w,
		r.Body,
		maxProfileEditRequestBodySize,
	)
	defer r.Body.Close()

	decoder := json.NewDecoder(
		r.Body,
	)

	decoder.DisallowUnknownFields()

	var request ProfileEditRequest

	if err := decoder.Decode(
		&request,
	); err != nil {
		var maxBytesError *http.MaxBytesError

		if errors.As(
			err,
			&maxBytesError,
		) {
			writeProfileEditError(
				w,
				http.StatusRequestEntityTooLarge,
				"Profile edit request is too large",
			)
			return ProfileEditRequest{},
				false
		}

		writeProfileEditError(
			w,
			http.StatusBadRequest,
			"Invalid request body",
		)
		return ProfileEditRequest{},
			false
	}

	if err := decoder.Decode(
		&struct{}{},
	); !errors.Is(err, io.EOF) {
		var maxBytesError *http.MaxBytesError

		if errors.As(
			err,
			&maxBytesError,
		) {
			writeProfileEditError(
				w,
				http.StatusRequestEntityTooLarge,
				"Profile edit request is too large",
			)
			return ProfileEditRequest{},
				false
		}

		writeProfileEditError(
			w,
			http.StatusBadRequest,
			"Request body must contain one JSON object",
		)
		return ProfileEditRequest{},
			false
	}

	if request.Bio == nil {
		writeProfileEditError(
			w,
			http.StatusBadRequest,
			"Bio is required",
		)
		return ProfileEditRequest{},
			false
	}

	return request, true
}

func getProfileEditAuthenticatedUserID(
	r *http.Request,
) (string, bool) {
	userID, ok := r.Context().
		Value(middleware.UserIDKey).
		(string)

	userID = strings.TrimSpace(
		userID,
	)

	return userID,
		ok && userID != ""
}

func handleProfileEditServiceError(
	w http.ResponseWriter,
	err error,
) {
	switch {
	case errors.Is(
		err,
		ErrInvalidProfile,
	):
		writeProfileEditError(
			w,
			http.StatusBadRequest,
			cleanProfileEditErrorMessage(
				err,
			),
		)

	case errors.Is(
		err,
		ErrProfileNotFound,
	):
		writeProfileEditError(
			w,
			http.StatusNotFound,
			"Profile not found",
		)

	case errors.Is(
		err,
		ErrProfileUpdateFailed,
	):
		log.Printf(
			"profile update failed: %v",
			err,
		)

		writeProfileEditError(
			w,
			http.StatusInternalServerError,
			"Unable to update profile",
		)

	default:
		log.Printf(
			"profile edit request failed: %v",
			err,
		)

		writeProfileEditError(
			w,
			http.StatusInternalServerError,
			"Unable to process profile request",
		)
	}
}

func cleanProfileEditErrorMessage(
	err error,
) string {
	message := strings.TrimSpace(
		err.Error(),
	)

	message = strings.TrimSpace(
		strings.TrimPrefix(
			message,
			ErrInvalidProfile.Error()+
				":",
		),
	)

	if message == "" {
		return "Invalid profile data"
	}

	return message
}

func writeProfileEditError(
	w http.ResponseWriter,
	statusCode int,
	message string,
) {
	writeProfileEditJSON(
		w,
		statusCode,
		ProfileEditErrorResponse{
			Error: message,
		},
	)
}

func writeProfileEditJSON(
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
		"Vary",
		"Authorization",
	)

	w.Header().Set(
		"X-Content-Type-Options",
		"nosniff",
	)

	w.WriteHeader(
		statusCode,
	)

	_ = json.NewEncoder(
		w,
	).Encode(payload)
}