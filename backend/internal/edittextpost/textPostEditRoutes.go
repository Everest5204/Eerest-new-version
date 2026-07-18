package edittextpost

import (
	"net/http"

	"everest-backend/internal/middleware"
)

const textPostEditBaseRoute = "/api/text-posts/edit"

func RegisterTextPostEditRoutes(
	mux *http.ServeMux,
	handler *TextPostEditHandler,
	jwtSecret string,
) {
	if mux == nil {
		panic("text post edit routes: mux is nil")
	}

	if handler == nil {
		panic("text post edit routes: handler is nil")
	}

	protectedHandler := middleware.AuthMiddleware(jwtSecret)(
		http.HandlerFunc(handler.TextPostEditor),
	)

	// Handles: /api/text-posts/edit
	mux.Handle(textPostEditBaseRoute, protectedHandler)

	// Handles: /api/text-posts/edit/:postId
	mux.Handle(textPostEditRoutePrefix, protectedHandler)
}