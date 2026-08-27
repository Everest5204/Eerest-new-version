package profileconnections

import (
	"net/http"

	"everest-backend/internal/middleware"
)

func RegisterRoutes(
	mux *http.ServeMux,
	handler *Handler,
	jwtSecret string,
) {
	authenticate := middleware.AuthMiddleware(jwtSecret)

	mux.Handle(
		"GET /api/profile-connections/{userID}/followers",
		authenticate(
			http.HandlerFunc(handler.GetFollowers),
		),
	)

	mux.Handle(
		"GET /api/profile-connections/{userID}/following",
		authenticate(
			http.HandlerFunc(handler.GetFollowing),
		),
	)
}