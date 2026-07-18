package profilemedia

import (
	"encoding/json"
	"log"
	"net/http"

	"everest-backend/internal/middleware"
)

type ProfileMediaHandler struct {
	service *ProfileMediaService
}

func NewProfileMediaHandler(
	service *ProfileMediaService,
) *ProfileMediaHandler {
	return &ProfileMediaHandler{
		service: service,
	}
}

func getAuthUserID(r *http.Request) (string, bool) {
	userIDValue := r.Context().Value(middleware.UserIDKey)

	userID, ok := userIDValue.(string)
	if !ok || userID == "" {
		return "", false
	}

	return userID, true
}

func writeJSON(w http.ResponseWriter, statusCode int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(data)
}

func (handler *ProfileMediaHandler) UploadProfileImage(
	w http.ResponseWriter,
	r *http.Request,
) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID, ok := getAuthUserID(r)
	if !ok {
		http.Error(w, "Unauthorized user", http.StatusUnauthorized)
		return
	}

	log.Println("PROFILE USER ID:", userID)

	file, _, err := r.FormFile("profile_image")
	if err != nil {
		log.Println("PROFILE FILE ERROR:", err)
		http.Error(w, "Profile image is required", http.StatusBadRequest)
		return
	}
	defer file.Close()

	log.Println("PROFILE FILE RECEIVED")
	log.Println("START PROFILE CLOUDINARY UPLOAD")

	updatedUser, err := handler.service.UploadProfileImage(userID, file)
	if err != nil {
		log.Println("PROFILE IMAGE UPLOAD ERROR:", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	log.Println("PROFILE IMAGE UPLOAD SUCCESS")

	writeJSON(w, http.StatusOK, updatedUser)
}

func (handler *ProfileMediaHandler) UploadCoverImage(
	w http.ResponseWriter,
	r *http.Request,
) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID, ok := getAuthUserID(r)
	if !ok {
		http.Error(w, "Unauthorized user", http.StatusUnauthorized)
		return
	}

	log.Println("COVER USER ID:", userID)

	file, _, err := r.FormFile("cover_image")
	if err != nil {
		log.Println("COVER FILE ERROR:", err)
		http.Error(w, "Cover image is required", http.StatusBadRequest)
		return
	}
	defer file.Close()

	log.Println("COVER FILE RECEIVED")
	log.Println("START COVER CLOUDINARY UPLOAD")

	updatedUser, err := handler.service.UploadCoverImage(userID, file)
	if err != nil {
		log.Println("COVER IMAGE UPLOAD ERROR:", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	log.Println("COVER IMAGE UPLOAD SUCCESS")

	writeJSON(w, http.StatusOK, updatedUser)
}