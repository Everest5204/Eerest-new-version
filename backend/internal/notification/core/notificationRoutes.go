package notification

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
		"GET /api/notifications",
		authenticate(http.HandlerFunc(handler.GetNotifications)),
	)

	mux.Handle(
		"GET /api/notifications/unread-count",
		authenticate(http.HandlerFunc(handler.GetUnreadCount)),
	)

	mux.Handle(
		"PATCH /api/notifications/read",
		authenticate(http.HandlerFunc(handler.MarkRead)),
	)
}

// Register after constructing the realtime stream handler at startup.
func RegisterStreamRoute(
	mux *http.ServeMux,
	streamHandler http.Handler,
	jwtSecret string,
) {
	authenticate := middleware.AuthMiddleware(jwtSecret)

	mux.Handle(
		"GET /api/notifications/stream",
		authenticate(streamHandler),
	)
}