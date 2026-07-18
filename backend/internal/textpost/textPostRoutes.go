package textpost

import (
	"net/http"

	"everest-backend/internal/middleware"
)

func RegisterTextPostRoutes(
	mux *http.ServeMux,
	handler *TextPostHandler,
	jwtSecret string,
) {
	authMiddleware := middleware.AuthMiddleware(jwtSecret)

	mux.Handle(
		"/api/text-posts",
		authMiddleware(
			http.HandlerFunc(handler.CreateTextPost),
		),
	)

	mux.Handle(
		"/api/text-posts/feed",
		authMiddleware(
			http.HandlerFunc(handler.GetFeedPosts),
		),
	)

	mux.Handle(
		"/api/text-posts/me",
		authMiddleware(
			http.HandlerFunc(handler.GetMyPosts),
		),
	)

	mux.Handle(
		"/api/text-posts/user",
		authMiddleware(
			http.HandlerFunc(handler.GetUserPosts),
		),
	)
}