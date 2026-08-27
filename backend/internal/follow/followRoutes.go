package follow

import (
	"net/http"

	"everest-backend/internal/middleware"
)

func RegisterRoutes(
	mux *http.ServeMux,
	handler *Handler,
	jwtSecret string,
) {
	authenticate :=
		middleware.AuthMiddleware(jwtSecret)

	mux.Handle(
		"GET /api/follow/followers",
		authenticate(
			http.HandlerFunc(
				handler.GetFollowers,
			),
		),
	)

	mux.Handle(
		"GET /api/follow/following",
		authenticate(
			http.HandlerFunc(
				handler.GetFollowing,
			),
		),
	)
}