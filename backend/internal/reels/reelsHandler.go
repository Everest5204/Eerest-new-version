package reels

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"

	"everest-backend/internal/middleware"
)

type ReelsHandler struct {
	Service *ReelsService
}

type reelsErrorResponse struct {
	Error string `json:"error"`
}

func NewReelsHandler(service *ReelsService) *ReelsHandler {
	return &ReelsHandler{
		Service: service,
	}
}

// GetReels handles:
//
//	GET /api/reels?cursor=&limit=6
func (handler *ReelsHandler) GetReels(
	w http.ResponseWriter,
	r *http.Request,
) {
	if r.Method != http.MethodGet {
		reelsMethodNotAllowed(w, http.MethodGet)
		return
	}

	authUserID, ok := getReelsAuthUserID(r)
	if !ok {
		writeReelsError(
			w,
			http.StatusUnauthorized,
			"Unauthorized",
		)
		return
	}

	limit, err := parseReelsLimit(
		r.URL.Query().Get("limit"),
	)
	if err != nil {
		writeReelsError(
			w,
			http.StatusBadRequest,
			err.Error(),
		)
		return
	}

	cursorValue := strings.TrimSpace(
		r.URL.Query().Get("cursor"),
	)

	response, err := handler.Service.GetReels(
		r.Context(),
		authUserID,
		limit,
		cursorValue,
	)
	if err != nil {
		if isInvalidReelsRequestError(err) {
			writeReelsError(
				w,
				http.StatusBadRequest,
				err.Error(),
			)
			return
		}

		log.Printf(
			"Reels feed load failed: %v",
			err,
		)

		writeReelsError(
			w,
			http.StatusInternalServerError,
			"Failed to load reels",
		)
		return
	}

	writeReelsJSON(
		w,
		http.StatusOK,
		response,
	)
}

// GetReelByID handles:
//
//	GET /api/reels/{reelId}
func (handler *ReelsHandler) GetReelByID(
	w http.ResponseWriter,
	r *http.Request,
) {
	if r.Method != http.MethodGet {
		reelsMethodNotAllowed(w, http.MethodGet)
		return
	}

	authUserID, ok := getReelsAuthUserID(r)
	if !ok {
		writeReelsError(
			w,
			http.StatusUnauthorized,
			"Unauthorized",
		)
		return
	}

	reelID := extractReelID(r.URL.Path)
	if reelID == "" {
		writeReelsError(
			w,
			http.StatusBadRequest,
			"reel id is required",
		)
		return
	}

	reelItem, err := handler.Service.GetReelByID(
		r.Context(),
		authUserID,
		reelID,
	)
	if err != nil {
		switch {
		case errors.Is(err, ErrReelNotFound):
			writeReelsError(
				w,
				http.StatusNotFound,
				"Reel not found",
			)

		case isInvalidReelsRequestError(err):
			writeReelsError(
				w,
				http.StatusBadRequest,
				err.Error(),
			)

		default:
			log.Printf(
				"Single reel load failed for %s: %v",
				reelID,
				err,
			)

			writeReelsError(
				w,
				http.StatusInternalServerError,
				"Failed to load reel",
			)
		}

		return
	}

	writeReelsJSON(
		w,
		http.StatusOK,
		ReelResponse{
			Reel: *reelItem,
		},
	)
}

func getReelsAuthUserID(
	r *http.Request,
) (string, bool) {
	userIDValue := r.Context().Value(
		middleware.UserIDKey,
	)

	userID, ok := userIDValue.(string)

	userID = strings.TrimSpace(userID)

	if !ok || userID == "" {
		return "", false
	}

	return userID, true
}

func parseReelsLimit(
	limitValue string,
) (int64, error) {
	cleanLimit := strings.TrimSpace(limitValue)

	if cleanLimit == "" {
		return defaultReelsLimit, nil
	}

	limit, err := strconv.ParseInt(
		cleanLimit,
		10,
		64,
	)
	if err != nil {
		return 0, errors.New(
			"limit must be a valid number",
		)
	}

	if limit <= 0 {
		return 0, errors.New(
			"limit must be greater than zero",
		)
	}

	if limit > maxReelsLimit {
		return 0, errors.New(
			"maximum reels limit is 20",
		)
	}

	return limit, nil
}

func extractReelID(requestPath string) string {
	const routePrefix = "/api/reels/"

	if !strings.HasPrefix(
		requestPath,
		routePrefix,
	) {
		return ""
	}

	reelID := strings.TrimSpace(
		strings.TrimPrefix(
			requestPath,
			routePrefix,
		),
	)

	if reelID == "" {
		return ""
	}

	// Prevent unsupported nested paths such as:
	// /api/reels/id/anything
	if strings.Contains(reelID, "/") {
		return ""
	}

	return reelID
}

func isInvalidReelsRequestError(
	err error,
) bool {
	if err == nil {
		return false
	}

	errorMessage := strings.ToLower(
		strings.TrimSpace(err.Error()),
	)

	return strings.HasPrefix(
		errorMessage,
		"invalid",
	)
}

func setReelsResponseHeaders(
	w http.ResponseWriter,
) {
	w.Header().Set(
		"Content-Type",
		"application/json; charset=utf-8",
	)

	// Every Reels API response must come directly from the backend/database.
	w.Header().Set(
		"Cache-Control",
		"no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
	)

	w.Header().Set(
		"Pragma",
		"no-cache",
	)

	w.Header().Set(
		"Expires",
		"0",
	)

	w.Header().Set(
		"Surrogate-Control",
		"no-store",
	)

	w.Header().Set(
		"X-Content-Type-Options",
		"nosniff",
	)
}

func writeReelsJSON(
	w http.ResponseWriter,
	statusCode int,
	data any,
) {
	setReelsResponseHeaders(w)

	w.WriteHeader(statusCode)

	if err := json.NewEncoder(w).Encode(data); err != nil {
		log.Printf(
			"Reels JSON response encode failed: %v",
			err,
		)
	}
}

func writeReelsError(
	w http.ResponseWriter,
	statusCode int,
	message string,
) {
	writeReelsJSON(
		w,
		statusCode,
		reelsErrorResponse{
			Error: message,
		},
	)
}

func reelsMethodNotAllowed(
	w http.ResponseWriter,
	allowedMethod string,
) {
	w.Header().Set(
		"Allow",
		allowedMethod,
	)

	writeReelsError(
		w,
		http.StatusMethodNotAllowed,
		"Method not allowed",
	)
}
