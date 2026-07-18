package post

import (
	"net/http"

	"everest-backend/internal/middleware"
)

func RegisterPostRoutes(
	mux *http.ServeMux,
	handler *PostHandler,
	jwtSecret string,
) {
	authMiddleware := middleware.AuthMiddleware(jwtSecret)

	mux.Handle(
		"/api/posts/media",
		authMiddleware(
			http.HandlerFunc(handler.CreateMediaPost),
		),
	)

	mux.Handle(
		"/api/posts/feed",
		authMiddleware(
			http.HandlerFunc(handler.GetFeedPosts),
		),
	)

	mux.Handle(
		"/api/posts/me",
		authMiddleware(
			http.HandlerFunc(handler.GetMyPosts),
		),
	)

	mux.Handle(
		"/api/posts/user",
		authMiddleware(
			http.HandlerFunc(handler.GetUserPosts),
		),
	)
}