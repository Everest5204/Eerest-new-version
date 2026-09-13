package deleteaccount

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"
	"strings"

	"everest-backend/internal/middleware"
)

const maxDeleteAccountRequestBodyBytes = 4096

type Handler struct {
	service *Service
}

func NewHandler(service *Service) *Handler {
	return &Handler{
		service: service,
	}
}

func (handler *Handler) DeleteAccount(
	w http.ResponseWriter,
	r *http.Request,
) {
	if r.Method != http.MethodDelete {
		w.Header().Set("Allow", http.MethodDelete)
		writeDeleteAccountError(
			w,
			http.StatusMethodNotAllowed,
			"Method not allowed.",
		)
		return
	}

	userID, ok := r.Context().
		Value(middleware.UserIDKey).
		(string)

	if !ok || strings.TrimSpace(userID) == "" {
		w.Header().Set("WWW-Authenticate", "Bearer")
		writeDeleteAccountError(
			w,
			http.StatusUnauthorized,
			"Please sign in to continue.",
		)
		return
	}

	if handler == nil || handler.service == nil {
		writeDeleteAccountServiceError(w, ErrDeletionUnavailable)
		return
	}

	contentType, _, err := mime.ParseMediaType(
		r.Header.Get("Content-Type"),
	)
	if err != nil ||
		!strings.EqualFold(contentType, "application/json") {
		writeDeleteAccountError(
			w,
			http.StatusUnsupportedMediaType,
			"Content-Type must be application/json.",
		)
		return
	}

	r.Body = http.MaxBytesReader(
		w,
		r.Body,
		maxDeleteAccountRequestBodyBytes,
	)
	defer r.Body.Close()

	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()

	var request DeleteAccountRequest

	if err := decoder.Decode(&request); err != nil {
		writeDeleteAccountBodyError(w, err)
		return
	}

	// Reject additional JSON values after the request object.
	var additionalValue any

	if err := decoder.Decode(&additionalValue); err != io.EOF {
		writeDeleteAccountBodyError(w, err)
		return
	}

	response, err := handler.service.RequestDeletion(
		r.Context(),
		userID,
		request,
	)
	if err != nil {
		writeDeleteAccountServiceError(w, err)
		return
	}

	if response == nil {
		writeDeleteAccountError(
			w,
			http.StatusInternalServerError,
			"We could not confirm your deletion request.",
		)
		return
	}

	// Accepted means background cleanup is pending.
	// It must not be presented as completed deletion.
	writeDeleteAccountJSON(
		w,
		http.StatusAccepted,
		response,
	)
}

func (handler *Handler) GetDeletionStatus(
	w http.ResponseWriter,
	r *http.Request,
) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", http.MethodGet)
		writeDeleteAccountError(
			w,
			http.StatusMethodNotAllowed,
			"Method not allowed.",
		)
		return
	}

	deletionToken, ok := readDeleteAccountStatusToken(r)
	if !ok {
		writeDeleteAccountServiceError(
			w,
			ErrInvalidDeletionToken,
		)
		return
	}

	if handler == nil || handler.service == nil {
		writeDeleteAccountServiceError(w, ErrDeletionUnavailable)
		return
	}

	// This service validates the dedicated deletion receipt.
	// A normal login token cannot authorize this endpoint.
	response, err := handler.service.GetDeletionStatus(
		r.Context(),
		deletionToken,
	)
	if err != nil {
		writeDeleteAccountServiceError(w, err)
		return
	}

	if response == nil {
		writeDeleteAccountServiceError(
			w,
			ErrDeletionStatusUnavailable,
		)
		return
	}

	writeDeleteAccountJSON(
		w,
		http.StatusOK,
		response,
	)
}

func readDeleteAccountStatusToken(
	r *http.Request,
) (string, bool) {
	headers := r.Header.Values("Authorization")

	// Reject missing or ambiguous authorization headers.
	if len(headers) != 1 {
		return "", false
	}

	parts := strings.Fields(headers[0])

	if len(parts) != 2 ||
		!strings.EqualFold(parts[0], "Bearer") {
		return "", false
	}

	return parts[1], true
}

func writeDeleteAccountServiceError(
	w http.ResponseWriter,
	err error,
) {
	statusCode := http.StatusInternalServerError
	message := "We could not confirm the result of this request. Please try again."

	switch {
	case errors.Is(err, ErrConfirmationRequired):
		statusCode = http.StatusBadRequest
		message = "Please confirm that you want to delete your account."

	case errors.Is(err, ErrCurrentPasswordRequired):
		statusCode = http.StatusBadRequest
		message = "Please enter your current password."

	case errors.Is(err, ErrInvalidCurrentPassword):
		// Keep the existing login session when the password is wrong.
		statusCode = http.StatusForbidden
		message = "Your current password is incorrect. Please try again."

	case errors.Is(err, ErrPasswordNotConfigured):
		statusCode = http.StatusConflict
		message = "This account does not have a password configured."

	case errors.Is(err, ErrInvalidUserID),
		errors.Is(err, ErrUserNotFound):
		statusCode = http.StatusUnauthorized
		message = "Your session is no longer valid. Please sign in again."
		w.Header().Set("WWW-Authenticate", "Bearer")

	case errors.Is(err, ErrExpiredDeletionToken):
		statusCode = http.StatusGone
		message = "Your deletion status token has expired. Completion cannot be confirmed with this token."

	case errors.Is(err, ErrInvalidDeletionToken):
		statusCode = http.StatusUnauthorized
		message = "A valid deletion status token is required."
		w.Header().Set(
			"WWW-Authenticate",
			`Bearer error="invalid_token"`,
		)

	case errors.Is(err, ErrDeletionStatusUnavailable):
		statusCode = http.StatusServiceUnavailable
		message = "Deletion progress is temporarily unavailable. Please try again."

	case errors.Is(err, ErrDeletionUnavailable):
		statusCode = http.StatusServiceUnavailable
		message = "Account deletion is temporarily unavailable. Please try again."

	case errors.Is(err, context.DeadlineExceeded),
		errors.Is(err, context.Canceled):
		statusCode = http.StatusServiceUnavailable
		message = "We could not confirm the result of this request in time. Please try again."
	}

	// Never expose database errors, password hashes, or tokens.
	writeDeleteAccountError(w, statusCode, message)
}

func writeDeleteAccountBodyError(
	w http.ResponseWriter,
	err error,
) {
	var sizeError *http.MaxBytesError

	if errors.As(err, &sizeError) {
		writeDeleteAccountError(
			w,
			http.StatusRequestEntityTooLarge,
			"The request body is too large.",
		)
		return
	}

	writeDeleteAccountError(
		w,
		http.StatusBadRequest,
		"Send one valid JSON object containing confirm and current_password.",
	)
}

func writeDeleteAccountError(
	w http.ResponseWriter,
	statusCode int,
	message string,
) {
	writeDeleteAccountJSON(
		w,
		statusCode,
		map[string]string{
			"error": message,
		},
	)
}

func writeDeleteAccountJSON(
	w http.ResponseWriter,
	statusCode int,
	payload any,
) {
	w.Header().Set(
		"Content-Type",
		"application/json; charset=utf-8",
	)
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")

	w.WriteHeader(statusCode)

	_ = json.NewEncoder(w).Encode(payload)
}