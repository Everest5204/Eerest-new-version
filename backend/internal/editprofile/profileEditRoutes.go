package editprofile

import (
	"net/http"

	"everest-backend/internal/middleware"
)

const profileEditRoute =
	"/api/profile/edit"

func RegisterProfileEditRoutes(
	mux *http.ServeMux,
	handler *ProfileEditHandler,
	jwtSecret string,
) {
	if mux == nil {
		panic(
			"profile edit routes: mux is nil",
		)
	}

	if handler == nil {
		panic(
			"profile edit routes: handler is nil",
		)
	}

	protectedHandler :=
		middleware.AuthMiddleware(
			jwtSecret,
		)(
			http.HandlerFunc(
				handler.ProfileEditor,
			),
		)

	// Handles:
	// GET   /api/profile/edit
	// PATCH /api/profile/edit
	mux.Handle(
		profileEditRoute,
		protectedHandler,
	)
}