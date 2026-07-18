package reaction

import (
	"net/http"

	"everest-backend/internal/middleware"
)

func RegisterReactionRoutes(
	mux *http.ServeMux,
	handler *ReactionHandler,
	jwtSecret string,
) {
	authMiddleware := middleware.AuthMiddleware(jwtSecret)

	mux.Handle(
		"/api/reactions/post",
		authMiddleware(
			http.HandlerFunc(handler.GetPostSummary),
		),
	)

	mux.Handle(
		"/api/reactions/users",
		authMiddleware(
			http.HandlerFunc(handler.GetReactionUsers),
		),
	)

	mux.Handle(
		"/api/reactions",
		authMiddleware(
			http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				switch r.Method {
				case http.MethodPost:
					handler.SetReaction(w, r)
				case http.MethodDelete:
					handler.RemoveReaction(w, r)
				default:
					w.Header().Set("Allow", "POST, DELETE")
					writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
				}
			}),
		),
	)
}