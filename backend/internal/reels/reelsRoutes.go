package reels

import (
	"net/http"

	"everest-backend/internal/middleware"
)

// RegisterReelsRoutes registers all authenticated Reels endpoints.
//
// Available endpoints:
//
//	GET /api/reels
//	GET /api/reels/{reelId}
func RegisterReelsRoutes(
	mux *http.ServeMux,
	handler *ReelsHandler,
	jwtSecret string,
) {
	authMiddleware := middleware.AuthMiddleware(
		jwtSecret,
	)

	// Cursor-paginated Reels feed.
	mux.Handle(
		"/api/reels",
		authMiddleware(
			http.HandlerFunc(
				handler.GetReels,
			),
		),
	)

	// One selected Reel by its MongoDB post ID.
	mux.Handle(
		"/api/reels/",
		authMiddleware(
			http.HandlerFunc(
				handler.GetReelByID,
			),
		),
	)
}
