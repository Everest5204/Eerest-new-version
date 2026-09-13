package changepassword

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"

	"everest-backend/internal/middleware"
)

const changePasswordMaxBodyBytes int64 = 4096

type Handler struct {
	service *Service
}

func NewHandler(service *Service) *Handler {
	return &Handler{
		service: service,
	}
}

func (handler *Handler) ChangePassword(
	w http.ResponseWriter,
	r *http.Request,
) {
	if r.Method != http.MethodPost {
		w.Header().Set(
			"Allow",
			http.MethodPost,
		)

		writeChangePasswordError(
			w,
			http.StatusMethodNotAllowed,
			"Method not allowed.",
		)
		return
	}

	// Identify the signed-in user through the auth middleware.
	userID, ok := r.Context().Value(
		middleware.UserIDKey,
	).(string)

	if !ok || userID == "" {
		writeChangePasswordError(
			w,
			http.StatusUnauthorized,
			"Please sign in again.",
		)
		return
	}

	r.Body = http.MaxBytesReader(
		w,
		r.Body,
		changePasswordMaxBodyBytes,
	)
	defer r.Body.Close()

	var request ChangePasswordRequest

	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()

	if err := decoder.Decode(&request); err != nil {
		var sizeError *http.MaxBytesError

		if errors.As(err, &sizeError) {
			writeChangePasswordError(
				w,
				http.StatusRequestEntityTooLarge,
				"The submitted form is too large.",
			)
			return
		}

		writeChangePasswordError(
			w,
			http.StatusBadRequest,
			"Invalid request body.",
		)
		return
	}

	// Accept exactly one JSON value.
	if err := decoder.Decode(new(any)); err != io.EOF {
		writeChangePasswordError(
			w,
			http.StatusBadRequest,
			"Invalid request body.",
		)
		return
	}

	err := handler.service.ChangePassword(
		r.Context(),
		userID,
		request,
	)

	if err != nil {
		switch {
		case errors.Is(err, ErrInvalidUserID),
			errors.Is(err, ErrUserNotFound):
			writeChangePasswordError(
				w,
				http.StatusUnauthorized,
				"Please sign in again.",
			)

		case errors.Is(err, ErrCurrentPasswordIncorrect):
			// A wrong current password must not clear the login token.
			writeChangePasswordError(
				w,
				http.StatusForbidden,
				"Current password is incorrect.",
			)

		case errors.Is(err, ErrCurrentPasswordRequired),
			errors.Is(err, ErrPasswordNotSet),
			errors.Is(err, ErrPasswordTooShort),
			errors.Is(err, ErrPasswordTooLong),
			errors.Is(err, ErrPasswordMismatch),
			errors.Is(err, ErrSamePassword):
			writeChangePasswordError(
				w,
				http.StatusBadRequest,
				err.Error(),
			)

		case errors.Is(err, ErrPasswordChanged):
			writeChangePasswordError(
				w,
				http.StatusConflict,
				err.Error(),
			)

		default:
			// Never log request bodies or plaintext passwords.
			log.Printf(
				"Change password failed: %v",
				err,
			)

			writeChangePasswordError(
				w,
				http.StatusInternalServerError,
				"Unable to change your password. Please try again.",
			)
		}

		return
	}

	writeChangePasswordJSON(
		w,
		http.StatusOK,
		ChangePasswordResponse{
			Message: "Your password has been changed successfully.",
		},
	)
}

func writeChangePasswordError(
	w http.ResponseWriter,
	status int,
	message string,
) {
	writeChangePasswordJSON(
		w,
		status,
		map[string]string{
			"message": message,
		},
	)
}

func writeChangePasswordJSON(
	w http.ResponseWriter,
	status int,
	payload any,
) {
	w.Header().Set(
		"Content-Type",
		"application/json; charset=utf-8",
	)

	w.Header().Set(
		"Cache-Control",
		"no-store",
	)

	w.WriteHeader(status)

	_ = json.NewEncoder(w).Encode(payload)
}