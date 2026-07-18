package reaction

import (
	"encoding/json"
	"net/http"
	"strings"

	"everest-backend/internal/middleware"
)

type ReactionHandler struct {
	Service *ReactionService
}

func NewReactionHandler(service *ReactionService) *ReactionHandler {
	return &ReactionHandler{
		Service: service,
	}
}

func getAuthUserID(r *http.Request) (string, bool) {
	userIDValue := r.Context().Value(middleware.UserIDKey)

	userID, ok := userIDValue.(string)
	if !ok || strings.TrimSpace(userID) == "" {
		return "", false
	}

	return userID, true
}

func writeJSON(w http.ResponseWriter, statusCode int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(statusCode)

	_ = json.NewEncoder(w).Encode(data)
}

func writeError(w http.ResponseWriter, statusCode int, message string) {
	writeJSON(w, statusCode, map[string]any{
		"error": message,
	})
}

func methodNotAllowed(w http.ResponseWriter, method string) {
	w.Header().Set("Allow", method)
	writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
}

func normalizeReactionFilter(value string) string {
	reactionType := strings.ToLower(strings.TrimSpace(value))

	if reactionType == "" {
		return "all"
	}

	switch reactionType {
	case "all", "love", "haha", "wow", "sad", "angry":
		return reactionType
	default:
		return ""
	}
}

func (handler *ReactionHandler) GetPostSummary(
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

	postID := strings.TrimSpace(r.URL.Query().Get("post_id"))
	if postID == "" {
		writeError(w, http.StatusBadRequest, "post_id is required")
		return
	}

	summary, err := handler.Service.GetPostSummary(
		r.Context(),
		userID,
		postID,
	)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, summary)
}

func (handler *ReactionHandler) GetReactionUsers(
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

	postID := strings.TrimSpace(r.URL.Query().Get("post_id"))
	if postID == "" {
		writeError(w, http.StatusBadRequest, "post_id is required")
		return
	}

	reactionType := normalizeReactionFilter(r.URL.Query().Get("type"))
	if reactionType == "" {
		writeError(w, http.StatusBadRequest, "Invalid reaction type")
		return
	}

	response, err := handler.Service.GetReactionUsers(
		r.Context(),
		userID,
		postID,
		reactionType,
	)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, response)
}

func (handler *ReactionHandler) SetReaction(
	w http.ResponseWriter,
	r *http.Request,
) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w, http.MethodPost)
		return
	}

	userID, ok := getAuthUserID(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var request SetReactionRequest

	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	request.PostID = strings.TrimSpace(request.PostID)
	request.ReactionType = strings.ToLower(strings.TrimSpace(request.ReactionType))

	if request.PostID == "" {
		writeError(w, http.StatusBadRequest, "post_id is required")
		return
	}

	response, err := handler.Service.SetReaction(
		r.Context(),
		userID,
		request.PostID,
		request.ReactionType,
	)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, response)
}

func (handler *ReactionHandler) RemoveReaction(
	w http.ResponseWriter,
	r *http.Request,
) {
	if r.Method != http.MethodDelete {
		methodNotAllowed(w, http.MethodDelete)
		return
	}

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

	response, err := handler.Service.RemoveReaction(
		r.Context(),
		userID,
		postID,
	)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, response)
}