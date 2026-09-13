package deleteaccount

import (
	"net/http"

	"everest-backend/internal/middleware"
)

func RegisterRoutes(
	mux *http.ServeMux,
	handler *Handler,
	jwtSecret string,
) {
	authMiddleware := middleware.AuthMiddleware(jwtSecret)

	// Requires the user's login token.
	// The handler also verifies the current password.
	mux.Handle(
		"/api/auth/delete-account",
		authMiddleware(
			http.HandlerFunc(handler.DeleteAccount),
		),
	)

	// Uses the dedicated deletion token.
	// Status remains accessible after the user is deleted.
	mux.HandleFunc(
		"/api/auth/delete-account/status",
		handler.GetDeletionStatus,
	)
}