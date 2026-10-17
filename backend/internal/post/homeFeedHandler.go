package post

import (
	"errors"
	"go.mongodb.org/mongo-driver/v2/bson"
	"net/http"
	"strings"
)

func (handler *PostHandler) GetHomeFeed(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w, http.MethodGet)
		return
	}
	viewer, ok := getAuthUserID(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	var visible []bson.ObjectID
	seen := map[bson.ObjectID]bool{}
	if raw := r.URL.Query().Get("visible_ids"); raw != "" {
		parts := strings.Split(raw, ",")
		if len(parts) > 8 {
			writeError(w, http.StatusBadRequest, "At most 8 visible IDs are allowed")
			return
		}
		for _, part := range parts {
			id, err := bson.ObjectIDFromHex(part)
			if err != nil || id.IsZero() {
				writeError(w, http.StatusBadRequest, "Invalid visible ID")
				return
			}
			if !seen[id] {
				visible = append(visible, id)
				seen[id] = true
			}
		}
	}
	limit, cursor := getPaginationQuery(r)
	response, err := handler.Service.GetHomeFeed(r.Context(), viewer, limit, cursor, visible)
	if errors.Is(err, ErrHomeCursor) {
		writeError(w, http.StatusBadRequest, "Invalid feed cursor. Refresh the feed.")
		return
	}
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "Feed is temporarily unavailable. Please retry.")
		return
	}
	writeJSON(w, http.StatusOK, response)
}
