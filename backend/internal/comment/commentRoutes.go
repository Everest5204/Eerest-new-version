package comment

import (
	"net/http"

	"everest-backend/internal/middleware"
)

func RegisterCommentRoutes(
	mux *http.ServeMux,
	handler *CommentHandler,
	jwtSecret string,
) {
	authMiddleware := middleware.AuthMiddleware(jwtSecret)

	mux.Handle(
		"/api/comments",
		authMiddleware(
			http.HandlerFunc(handler.Comments),
		),
	)

	mux.Handle(
		"/api/comments/replies",
		authMiddleware(
			http.HandlerFunc(handler.GetReplies),
		),
	)

	mux.Handle(
		"/api/comments/",
		authMiddleware(
			http.HandlerFunc(handler.CommentItem),
		),
	)
}