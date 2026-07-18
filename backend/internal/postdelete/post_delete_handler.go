package postdelete

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"everest-backend/internal/middleware"
)

type PostDeleteHandler struct {
	Service *PostDeleteService
}

type postDeleteErrorResponse struct {
	Error string `json:"error"`
}

func NewPostDeleteHandler(
	service *PostDeleteService,
) *PostDeleteHandler {
	return &PostDeleteHandler{
		Service: service,
	}
}

func (handler *PostDeleteHandler) DeletePost(
	w http.ResponseWriter,
	r *http.Request,
	postID string,
) {
	if r.Method != http.MethodDelete {
		w.Header().Set("Allow", http.MethodDelete)

		writePostDeleteError(
			w,
			http.StatusMethodNotAllowed,
			"Method not allowed",
		)
		return
	}

	authUserID, ok := getPostDeleteAuthUserID(r)
	if !ok {
		writePostDeleteError(
			w,
			http.StatusUnauthorized,
			"Unauthorized",
		)
		return
	}

	postID = strings.TrimSpace(postID)
	if postID == "" {
		writePostDeleteError(
			w,
			http.StatusBadRequest,
			"post id is required",
		)
		return
	}

	if handler == nil || handler.Service == nil {
		writePostDeleteError(
			w,
			http.StatusServiceUnavailable,
			"Delete post service is unavailable",
		)
		return
	}

	response, err := handler.Service.DeletePost(
		r.Context(),
		authUserID,
		postID,
	)
	if err != nil {
		handler.handlePostDeleteError(w, err)
		return
	}

	writePostDeleteJSON(
		w,
		http.StatusOK,
		response,
	)
}

func (handler *PostDeleteHandler) handlePostDeleteError(
	w http.ResponseWriter,
	err error,
) {
	switch {
	case errors.Is(err, ErrDeletePostInvalidID):
		writePostDeleteError(
			w,
			http.StatusBadRequest,
			"Invalid post id",
		)

	case errors.Is(err, ErrDeletePostNotFound):
		writePostDeleteError(
			w,
			http.StatusNotFound,
			"Post not found",
		)

	case errors.Is(err, ErrDeletePostForbidden):
		writePostDeleteError(
			w,
			http.StatusForbidden,
			"You are not allowed to delete this post",
		)

	case errors.Is(err, ErrDeletePostMediaCleanup):
		writePostDeleteError(
			w,
			http.StatusBadGateway,
			"Post media cleanup failed. Please try again",
		)

	case errors.Is(err, context.DeadlineExceeded):
		writePostDeleteError(
			w,
			http.StatusGatewayTimeout,
			"Post deletion timed out. Please try again",
		)

	case errors.Is(err, context.Canceled):
		writePostDeleteError(
			w,
			http.StatusRequestTimeout,
			"Post deletion was cancelled",
		)

	case errors.Is(err, ErrDeletePostDatabaseCleanup):
		writePostDeleteError(
			w,
			http.StatusInternalServerError,
			"Post database cleanup failed. Please try again",
		)

	default:
		writePostDeleteError(
			w,
			http.StatusInternalServerError,
			"Unable to delete post. Please try again",
		)
	}
}

func getPostDeleteAuthUserID(
	r *http.Request,
) (string, bool) {
	if r == nil {
		return "", false
	}

	userIDValue := r.Context().Value(
		middleware.UserIDKey,
	)

	userID, ok := userIDValue.(string)
	if !ok {
		return "", false
	}

	userID = strings.TrimSpace(userID)
	if userID == "" {
		return "", false
	}

	return userID, true
}

func setPostDeleteJSONHeaders(w http.ResponseWriter) {
	w.Header().Set(
		"Content-Type",
		"application/json; charset=utf-8",
	)

	// Prevent browser, proxy and CDN caching.
	w.Header().Set(
		"Cache-Control",
		"no-store, no-cache, must-revalidate, proxy-revalidate",
	)
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("Expires", "0")
	w.Header().Set("Surrogate-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
}

func writePostDeleteJSON(
	w http.ResponseWriter,
	statusCode int,
	data any,
) {
	setPostDeleteJSONHeaders(w)
	w.WriteHeader(statusCode)

	_ = json.NewEncoder(w).Encode(data)
}

func writePostDeleteError(
	w http.ResponseWriter,
	statusCode int,
	message string,
) {
	writePostDeleteJSON(
		w,
		statusCode,
		postDeleteErrorResponse{
			Error: message,
		},
	)
}