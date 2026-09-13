package changepassword

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
		"/api/auth/change-password",
		middleware.AuthMiddleware(jwtSecret)(
			http.HandlerFunc(
				handler.ChangePassword,
			),
		),
	)
}