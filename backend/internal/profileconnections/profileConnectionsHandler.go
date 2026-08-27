package profileconnections

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

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

func (handler *Handler) GetFollowers(
	w http.ResponseWriter,
	r *http.Request,
) {
	handler.getConnectionList(w, r, FollowersList)
}

func (handler *Handler) GetFollowing(
	w http.ResponseWriter,
	r *http.Request,
) {
	handler.getConnectionList(w, r, FollowingList)
}

func (handler *Handler) getConnectionList(
	w http.ResponseWriter,
	r *http.Request,
	kind ListKind,
) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", http.MethodGet)

		writeConnectionError(
			w,
			http.StatusMethodNotAllowed,
			"Method not allowed",
		)
		return
	}

	viewerUserID, authenticated :=
		getAuthenticatedUserID(r)

	if !authenticated {
		writeConnectionError(
			w,
			http.StatusUnauthorized,
			"Unauthorized",
		)
		return
	}

	ownerUserID := strings.TrimSpace(
		r.PathValue("userID"),
	)

	if strings.EqualFold(ownerUserID, "me") {
		ownerUserID = viewerUserID
	}

	limit, err := parseConnectionListLimit(
		r.URL.Query().Get("limit"),
	)
	if err != nil {
		writeConnectionError(
			w,
			http.StatusBadRequest,
			err.Error(),
		)
		return
	}

	cursor := strings.TrimSpace(
		r.URL.Query().Get("cursor"),
	)

	var response *ConnectionListResponse

	switch kind {
	case FollowersList:
		response, err = handler.service.GetFollowers(
			r.Context(),
			viewerUserID,
			ownerUserID,
			cursor,
			limit,
		)

	case FollowingList:
		response, err = handler.service.GetFollowing(
			r.Context(),
			viewerUserID,
			ownerUserID,
			cursor,
			limit,
		)

	default:
		err = ErrInvalidList
	}

	if err != nil {
		writeConnectionServiceError(w, err)
		return
	}

	writeConnectionJSON(
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

	userID = strings.TrimSpace(userID)

	return userID, ok && userID != ""
}

func parseConnectionListLimit(
	value string,
) (int64, error) {
	cleanValue := strings.TrimSpace(value)

	if cleanValue == "" {
		return DefaultListLimit, nil
	}

	limit, err := strconv.ParseInt(
		cleanValue,
		10,
		64,
	)
	if err != nil || limit <= 0 {
		return 0, errors.New(
			"limit must be a positive number",
		)
	}

	return NormalizeListLimit(limit), nil
}

func writeConnectionServiceError(
	w http.ResponseWriter,
	err error,
) {
	switch {
	case errors.Is(err, ErrInvalidViewerUserID),
		errors.Is(err, ErrInvalidOwnerUserID),
		errors.Is(err, ErrInvalidCursor),
		errors.Is(err, ErrInvalidList):
		writeConnectionError(
			w,
			http.StatusBadRequest,
			err.Error(),
		)

	case errors.Is(err, ErrOwnerNotFound):
		writeConnectionError(
			w,
			http.StatusNotFound,
			err.Error(),
		)

	case errors.Is(err, context.DeadlineExceeded):
		writeConnectionError(
			w,
			http.StatusGatewayTimeout,
			"Connection list request timed out",
		)

	case errors.Is(err, context.Canceled):
		return

	default:
		writeConnectionError(
			w,
			http.StatusInternalServerError,
			"Unable to load profile connections",
		)
	}
}

func writeConnectionError(
	w http.ResponseWriter,
	statusCode int,
	message string,
) {
	writeConnectionJSON(
		w,
		statusCode,
		ErrorResponse{
			Error: message,
		},
	)
}

func writeConnectionJSON(
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
		"no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
	)

	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("Expires", "0")
	w.Header().Set("Surrogate-Control", "no-store")
	w.Header().Set("Vary", "Authorization")
	w.Header().Set("X-Content-Type-Options", "nosniff")

	w.WriteHeader(statusCode)

	_ = json.NewEncoder(w).Encode(payload)
}