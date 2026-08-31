package verifiedbadge

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
		"POST /api/verified-badges/resolve",
		authenticate(
			http.HandlerFunc(
				handler.ResolveBadges,
			),
		),
	)
}