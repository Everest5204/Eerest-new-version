package postdelete

import (
	"net/http"
	"strings"

	"everest-backend/internal/middleware"
)

const postDeleteRoutePrefix = "/api/posts/delete/"

func RegisterPostDeleteRoutes(
	mux *http.ServeMux,
	handler *PostDeleteHandler,
	jwtSecret string,
) {
	authMiddleware := middleware.AuthMiddleware(jwtSecret)

	deleteRouteHandler := authMiddleware(
		http.HandlerFunc(
			func(w http.ResponseWriter, r *http.Request) {
				if r.Method != http.MethodDelete {
					handler.DeletePost(w, r, "")
					return
				}

				postID, ok := parsePostDeletePath(
					r.URL.Path,
				)
				if !ok {
					writePostDeleteError(
						w,
						http.StatusBadRequest,
						"Valid post id is required",
					)
					return
				}

				handler.DeletePost(
					w,
					r,
					postID,
				)
			},
		),
	)

	// Handles: DELETE /api/posts/delete/{postID}
	mux.Handle(
		postDeleteRoutePrefix,
		deleteRouteHandler,
	)

	// Handles a request where post ID is missing.
	mux.Handle(
		"/api/posts/delete",
		deleteRouteHandler,
	)
}

func parsePostDeletePath(
	requestPath string,
) (string, bool) {
	if !strings.HasPrefix(
		requestPath,
		postDeleteRoutePrefix,
	) {
		return "", false
	}

	postID := strings.TrimSpace(
		strings.TrimPrefix(
			requestPath,
			postDeleteRoutePrefix,
		),
	)

	postID = strings.Trim(postID, "/")

	if postID == "" {
		return "", false
	}

	// Reject extra path sections.
	if strings.Contains(postID, "/") {
		return "", false
	}

	return postID, true
}