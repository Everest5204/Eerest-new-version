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

	// Copied links use one post ID. Existing literal feed/me/user routes remain more specific.
	mux.Handle(
		"/api/posts/{postID}",
		authMiddleware(http.HandlerFunc(handler.GetSharedPost)),
	)

	mux.Handle("/api/posts/home", authMiddleware(http.HandlerFunc(handler.GetHomeFeed)))
	mux.Handle("/api/posts/home/events", authMiddleware(http.HandlerFunc(handler.Service.StreamHomeFeed)))

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
