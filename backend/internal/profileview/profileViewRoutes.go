package profileview

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
		"GET /api/users/{userID}/profile",
		authenticate(http.HandlerFunc(handler.GetProfile)),
	)

	mux.Handle(
		"PUT /api/users/{userID}/follow",
		authenticate(http.HandlerFunc(handler.Follow)),
	)

	mux.Handle(
		"DELETE /api/users/{userID}/follow",
		authenticate(http.HandlerFunc(handler.Unfollow)),
	)
}