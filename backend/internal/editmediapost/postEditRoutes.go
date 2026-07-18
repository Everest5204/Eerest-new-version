package editmediapost

import (
	"net/http"

	"everest-backend/internal/middleware"
)

const mediaPostEditBaseRoute = "/api/posts/media/edit"

func RegisterPostEditRoutes(
	mux *http.ServeMux,
	handler *PostEditHandler,
	jwtSecret string,
) {
	if mux == nil {
		panic("edit media post route requires a valid ServeMux")
	}

	if handler == nil {
		panic("edit media post route requires a valid handler")
	}

	protectedEditHandler :=
		middleware.AuthMiddleware(
			jwtSecret,
		)(
			http.HandlerFunc(
				handler.MediaPostEditor,
			),
		)

	// Handles:
	// GET   /api/posts/media/edit/{postID}
	// PATCH /api/posts/media/edit/{postID}
	mux.Handle(
		mediaPostEditRoutePrefix,
		protectedEditHandler,
	)

	// Handles a request where the post ID is missing
	// and returns a controlled 400 response.
	mux.Handle(
		mediaPostEditBaseRoute,
		protectedEditHandler,
	)
}