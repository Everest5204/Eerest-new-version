package profilemedia

import (
	"log"
	"net/http"

	"everest-backend/internal/middleware"
)

func RegisterProfileMediaRoutes(
	mux *http.ServeMux,
	handler *ProfileMediaHandler,
	jwtSecret string,
) {
	authMiddleware := middleware.AuthMiddleware(jwtSecret)

	mux.Handle(
		"/api/profile-media/profile-image",
		authMiddleware(
			http.HandlerFunc(func(
				w http.ResponseWriter,
				r *http.Request,
			) {
				log.Println("PROFILE IMAGE ROUTE HIT")
				handler.UploadProfileImage(w, r)
			}),
		),
	)

	mux.Handle(
		"/api/profile-media/cover-image",
		authMiddleware(
			http.HandlerFunc(func(
				w http.ResponseWriter,
				r *http.Request,
			) {
				log.Println("COVER IMAGE ROUTE HIT")
				handler.UploadCoverImage(w, r)
			}),
		),
	)
}