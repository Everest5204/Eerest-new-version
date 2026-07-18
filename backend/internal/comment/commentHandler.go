package comment

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"everest-backend/internal/middleware"
)

const (
	defaultCommentsLimit        int64 = 10
	maxCommentsLimit           int64 = 30
	maxCommentRequestBodyBytes       = 32 << 10
)

type CommentHandler struct {
	Service *CommentService
}

type errorResponse struct {
	Error string `json:"error"`
}

func NewCommentHandler(service *CommentService) *CommentHandler {
	return &CommentHandler{
		Service: service,
	}
}

func getAuthUserID(r *http.Request) (string, bool) {
	userIDValue := r.Context().Value(middleware.UserIDKey)

	userID, ok := userIDValue.(string)
	if !ok || userID == "" {
		return "", false
	}

	return userID, true
}

func setJSONHeaders(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("Expires", "0")
	w.Header().Set("Surrogate-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
}

func writeJSON(w http.ResponseWriter, statusCode int, data any) {
	setJSONHeaders(w)
	w.WriteHeader(statusCode)

	if err := json.NewEncoder(w).Encode(data); err != nil {
		http.Error(w, "JSON encode failed", http.StatusInternalServerError)
	}
}

func writeError(w http.ResponseWriter, statusCode int, message string) {
	writeJSON(w, statusCode, errorResponse{
		Error: message,
	})
}

func methodNotAllowed(w http.ResponseWriter, allowedMethods string) {
	w.Header().Set("Allow", allowedMethods)
	writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
}

func getPaginationQuery(r *http.Request) (int64, string) {
	limit := defaultCommentsLimit

	limitQuery := r.URL.Query().Get("limit")
	if limitQuery != "" {
		parsedLimit, err := strconv.ParseInt(limitQuery, 10, 64)
		if err == nil && parsedLimit > 0 && parsedLimit <= maxCommentsLimit {
			limit = parsedLimit
		}
	}

	cursor := r.URL.Query().Get("cursor")

	return limit, cursor
}

func decodeJSONBody(w http.ResponseWriter, r *http.Request, target any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, maxCommentRequestBodyBytes)
	defer r.Body.Close()

	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()

	if err := decoder.Decode(target); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return false
	}

	return true
}

func (handler *CommentHandler) Comments(
	w http.ResponseWriter,
	r *http.Request,
) {
	switch r.Method {
	case http.MethodGet:
		handler.GetComments(w, r)
	case http.MethodPost:
		handler.CreateComment(w, r)
	default:
		methodNotAllowed(w, "GET, POST")
	}
}

func (handler *CommentHandler) GetComments(
	w http.ResponseWriter,
	r *http.Request,
) {
	userID, ok := getAuthUserID(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	postID := strings.TrimSpace(r.URL.Query().Get("post_id"))
	if postID == "" {
		writeError(w, http.StatusBadRequest, "post_id is required")
		return
	}

	limit, cursor := getPaginationQuery(r)

	response, err := handler.Service.GetComments(
		r.Context(),
		userID,
		postID,
		limit,
		cursor,
	)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, response)
}

func (handler *CommentHandler) GetReplies(
	w http.ResponseWriter,
	r *http.Request,
) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w, http.MethodGet)
		return
	}

	userID, ok := getAuthUserID(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	parentID := strings.TrimSpace(r.URL.Query().Get("parent_id"))
	if parentID == "" {
		writeError(w, http.StatusBadRequest, "parent_id is required")
		return
	}

	limit, cursor := getPaginationQuery(r)

	response, err := handler.Service.GetReplies(
		r.Context(),
		userID,
		parentID,
		limit,
		cursor,
	)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, response)
}

func (handler *CommentHandler) CreateComment(
	w http.ResponseWriter,
	r *http.Request,
) {
	userID, ok := getAuthUserID(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var request CreateCommentRequest
	if !decodeJSONBody(w, r, &request) {
		return
	}

	response, err := handler.Service.CreateComment(
		r.Context(),
		userID,
		request,
	)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(w, http.StatusCreated, response)
}

func (handler *CommentHandler) CommentItem(
	w http.ResponseWriter,
	r *http.Request,
) {
	commentID, action, ok := parseCommentItemPath(r.URL.Path)
	if !ok {
		writeError(w, http.StatusNotFound, "Comment route not found")
		return
	}

	if action == "love" {
		if r.Method != http.MethodPost {
			methodNotAllowed(w, http.MethodPost)
			return
		}

		handler.ToggleCommentLove(w, r, commentID)
		return
	}

	if action != "" {
		writeError(w, http.StatusNotFound, "Comment route not found")
		return
	}

	switch r.Method {
	case http.MethodPatch:
		handler.UpdateComment(w, r, commentID)
	case http.MethodDelete:
		handler.DeleteComment(w, r, commentID)
	default:
		methodNotAllowed(w, "PATCH, DELETE")
	}
}

func (handler *CommentHandler) UpdateComment(
	w http.ResponseWriter,
	r *http.Request,
	commentID string,
) {
	userID, ok := getAuthUserID(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var request UpdateCommentRequest
	if !decodeJSONBody(w, r, &request) {
		return
	}

	response, err := handler.Service.UpdateComment(
		r.Context(),
		userID,
		commentID,
		request,
	)
	if err != nil {
		if strings.Contains(err.Error(), "owner") {
			writeError(w, http.StatusForbidden, err.Error())
			return
		}

		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, response)
}

func (handler *CommentHandler) DeleteComment(
	w http.ResponseWriter,
	r *http.Request,
	commentID string,
) {
	userID, ok := getAuthUserID(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	response, err := handler.Service.DeleteComment(
		r.Context(),
		userID,
		commentID,
	)
	if err != nil {
		if strings.Contains(err.Error(), "owner") {
			writeError(w, http.StatusForbidden, err.Error())
			return
		}

		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, response)
}

func (handler *CommentHandler) ToggleCommentLove(
	w http.ResponseWriter,
	r *http.Request,
	commentID string,
) {
	userID, ok := getAuthUserID(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	response, err := handler.Service.ToggleCommentLove(
		r.Context(),
		userID,
		commentID,
	)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, response)
}

func parseCommentItemPath(path string) (string, string, bool) {
	cleanPath := strings.Trim(strings.TrimPrefix(path, "/api/comments/"), "/")
	if cleanPath == "" {
		return "", "", false
	}

	parts := strings.Split(cleanPath, "/")
	if len(parts) == 1 {
		return parts[0], "", parts[0] != ""
	}

	if len(parts) == 2 && parts[1] == "love" {
		return parts[0], parts[1], parts[0] != ""
	}

	return "", "", false
}