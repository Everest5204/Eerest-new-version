package changename

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
		middleware.AuthMiddleware(
			jwtSecret,
		)

	mux.Handle(
		"GET /api/user/name",
		authenticate(
			http.HandlerFunc(
				handler.GetNameStatus,
			),
		),
	)

	mux.Handle(
		"PATCH /api/user/name",
		authenticate(
			http.HandlerFunc(
				handler.ChangeName,
			),
		),
	)
}