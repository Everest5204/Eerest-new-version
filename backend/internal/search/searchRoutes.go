package search

import (
	"net/http"

	"everest-backend/internal/middleware"
)

func RegisterRoutes(
	mux *http.ServeMux,
	handler *Handler,
	jwtSecret string,
) {
	mux.Handle(
		"/api/search/users",
		middleware.AuthMiddleware(
			jwtSecret,
		)(
			http.HandlerFunc(
				handler.SearchUsers,
			),
		),
	)
}