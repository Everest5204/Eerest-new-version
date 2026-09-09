package notification

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"mime"
	"net/http"
	"strconv"
	"strings"

	"everest-backend/internal/middleware"

	"go.mongodb.org/mongo-driver/v2/mongo"
)

const maxNotificationRequestBodyBytes int64 = 16 << 10

type Handler struct {
	service *Service
}

type notificationErrorResponse struct {
	Error string `json:"error"`
}

func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

func (handler *Handler) GetNotifications(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireNotificationRequest(w, r, http.MethodGet)
	if !ok {
		return
	}

	limit, err := parseNotificationListLimit(r.URL.Query().Get("limit"))
	if err != nil {
		writeNotificationError(w, http.StatusBadRequest, err.Error())
		return
	}

	response, err := handler.service.GetNotifications(
		r.Context(),
		userID,
		strings.TrimSpace(r.URL.Query().Get("cursor")),
		limit,
	)
	if err != nil {
		writeNotificationServiceError(w, r, err)
		return
	}
	writeNotificationJSON(w, http.StatusOK, response)
}

func (handler *Handler) GetUnreadCount(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireNotificationRequest(w, r, http.MethodGet)
	if !ok {
		return
	}

	response, err := handler.service.GetUnreadCount(r.Context(), userID)
	if err != nil {
		writeNotificationServiceError(w, r, err)
		return
	}
	writeNotificationJSON(w, http.StatusOK, response)
}

func (handler *Handler) MarkRead(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireNotificationRequest(w, r, http.MethodPatch)
	if !ok {
		return
	}

	request, ok := decodeNotificationReadRequest(w, r)
	if !ok {
		return
	}

	response, err := handler.service.MarkRead(r.Context(), userID, *request)
	if err != nil {
		writeNotificationServiceError(w, r, err)
		return
	}
	writeNotificationJSON(w, http.StatusOK, response)
}

func requireNotificationRequest(
	w http.ResponseWriter,
	r *http.Request,
	method string,
) (string, bool) {
	if r.Method != method {
		w.Header().Set("Allow", method)
		writeNotificationError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return "", false
	}

	userID, ok := getNotificationAuthenticatedUserID(r)
	if !ok {
		writeNotificationError(w, http.StatusUnauthorized, "Unauthorized")
		return "", false
	}
	return userID, true
}

// The recipient comes exclusively from the existing authentication middleware.
func getNotificationAuthenticatedUserID(r *http.Request) (string, bool) {
	value, ok := r.Context().Value(middleware.UserIDKey).(string)
	if !ok {
		return "", false
	}
	id, err := parseNotificationUserID(value)
	if err != nil {
		return "", false
	}
	return id.Hex(), true
}

func parseNotificationListLimit(value string) (int64, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return DefaultListLimit, nil
	}
	limit, err := strconv.ParseInt(value, 10, 64)
	if err != nil || limit <= 0 {
		return 0, errors.New("limit must be a positive number")
	}
	return NormalizeListLimit(limit), nil
}

func decodeNotificationReadRequest(
	w http.ResponseWriter,
	r *http.Request,
) (*MarkNotificationsReadRequest, bool) {
	mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || mediaType != "application/json" {
		writeNotificationError(w, http.StatusUnsupportedMediaType, "Content-Type must be application/json")
		return nil, false
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxNotificationRequestBodyBytes)
	defer r.Body.Close()
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()

	var request *MarkNotificationsReadRequest
	if err := decoder.Decode(&request); err != nil {
		writeNotificationBodyError(w, err)
		return nil, false
	}
	if request == nil {
		writeNotificationError(w, http.StatusBadRequest, "Request body must be a JSON object")
		return nil, false
	}

	// Reject a second JSON value and trailing non-whitespace data.
	if err := decoder.Decode(new(any)); err != io.EOF {
		if err != nil {
			writeNotificationBodyError(w, err)
		} else {
			writeNotificationError(w, http.StatusBadRequest, "Request body must contain one JSON object")
		}
		return nil, false
	}
	return request, true
}

func writeNotificationBodyError(w http.ResponseWriter, err error) {
	var sizeError *http.MaxBytesError
	if errors.As(err, &sizeError) {
		writeNotificationError(w, http.StatusRequestEntityTooLarge, "Notification request body is too large")
		return
	}
	writeNotificationError(w, http.StatusBadRequest, "Invalid notification request body")
}

func writeNotificationServiceError(w http.ResponseWriter, r *http.Request, err error) {
	if errors.Is(r.Context().Err(), context.Canceled) {
		return
	}

	switch {
	case errors.Is(err, ErrInvalidUserID):
		writeNotificationError(w, http.StatusUnauthorized, "Unauthorized")
	case errors.Is(err, ErrInvalidCursor),
		errors.Is(err, ErrInvalidNotificationID),
		errors.Is(err, ErrInvalidReadRequest):
		writeNotificationError(w, http.StatusBadRequest, err.Error())
	case errors.Is(err, context.DeadlineExceeded), mongo.IsTimeout(err):
		writeNotificationError(w, http.StatusGatewayTimeout, "Notification request timed out")
	default:
		log.Printf("notification request failed: %v", err)
		writeNotificationError(w, http.StatusInternalServerError, "Unable to process notification request")
	}
}

func writeNotificationError(w http.ResponseWriter, statusCode int, message string) {
	writeNotificationJSON(w, statusCode, notificationErrorResponse{Error: message})
}

func writeNotificationJSON(w http.ResponseWriter, statusCode int, payload any) {
	data, err := json.Marshal(payload)
	if err != nil {
		log.Printf("notification response encoding failed: %v", err)
		statusCode = http.StatusInternalServerError
		data = []byte(`{"error":"Unable to encode notification response"}`)
	}

	headers := w.Header()
	headers.Set("Content-Type", "application/json; charset=utf-8")
	headers.Set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0")
	headers.Set("Pragma", "no-cache")
	headers.Set("Expires", "0")
	headers.Set("Surrogate-Control", "no-store")
	headers.Set("X-Content-Type-Options", "nosniff")
	headers.Add("Vary", "Authorization")

	w.WriteHeader(statusCode)
	if _, err := w.Write(append(data, '\n')); err != nil {
		log.Printf("notification response write failed: %v", err)
	}
}