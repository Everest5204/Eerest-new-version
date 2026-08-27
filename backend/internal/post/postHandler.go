package post

import (
	"encoding/json"
	"net/http"
	"strconv"

	"everest-backend/internal/middleware"
)

const (
	defaultPostLimit        int64 = 6
	maxPostLimit           int64 = 20
	maxMediaPostRequestSize      = 250 << 20
)

type PostHandler struct {
	Service *PostService
}

type errorResponse struct {
	Error string `json:"error"`
}

func NewPostHandler(
	service *PostService,
) *PostHandler {
	return &PostHandler{
		Service: service,
	}
}

func getAuthUserID(
	r *http.Request,
) (string, bool) {
	userIDValue := r.Context().
		Value(middleware.UserIDKey)

	userID, ok := userIDValue.(string)

	if !ok || userID == "" {
		return "", false
	}

	return userID, true
}

func setJSONHeaders(
	w http.ResponseWriter,
) {
	w.Header().Set(
		"Content-Type",
		"application/json",
	)

	w.Header().Set(
		"Cache-Control",
		"no-store, no-cache, must-revalidate, proxy-revalidate",
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

func writeJSON(
	w http.ResponseWriter,
	statusCode int,
	data any,
) {
	setJSONHeaders(w)
	w.WriteHeader(statusCode)

	if err := json.NewEncoder(w).
		Encode(data); err != nil {
		http.Error(
			w,
			"JSON encode failed",
			http.StatusInternalServerError,
		)
	}
}

func writeError(
	w http.ResponseWriter,
	statusCode int,
	message string,
) {
	writeJSON(
		w,
		statusCode,
		errorResponse{
			Error: message,
		},
	)
}

func methodNotAllowed(
	w http.ResponseWriter,
	allowedMethod string,
) {
	w.Header().Set(
		"Allow",
		allowedMethod,
	)

	writeError(
		w,
		http.StatusMethodNotAllowed,
		"Method not allowed",
	)
}

func getPaginationQuery(
	r *http.Request,
) (int64, string) {
	limit := defaultPostLimit

	limitQuery :=
		r.URL.Query().Get("limit")

	if limitQuery != "" {
		parsedLimit, err := strconv.ParseInt(
			limitQuery,
			10,
			64,
		)

		if err == nil &&
			parsedLimit > 0 &&
			parsedLimit <= maxPostLimit {
			limit = parsedLimit
		}
	}

	cursor :=
		r.URL.Query().Get("cursor")

	return limit, cursor
}

func (handler *PostHandler) CreateMediaPost(
	w http.ResponseWriter,
	r *http.Request,
) {
	if r.Method != http.MethodPost {
		methodNotAllowed(
			w,
			http.MethodPost,
		)

		return
	}

	userID, ok := getAuthUserID(r)

	if !ok {
		writeError(
			w,
			http.StatusUnauthorized,
			"Unauthorized",
		)

		return
	}

	r.Body = http.MaxBytesReader(
		w,
		r.Body,
		maxMediaPostRequestSize,
	)

	if err := r.ParseMultipartForm(
		maxMediaPostRequestSize,
	); err != nil {
		writeError(
			w,
			http.StatusBadRequest,
			"Invalid media upload",
		)

		return
	}

	if r.MultipartForm != nil {
		defer r.MultipartForm.RemoveAll()
	}

	if r.MultipartForm == nil ||
		r.MultipartForm.File == nil {
		writeError(
			w,
			http.StatusBadRequest,
			"media is required",
		)

		return
	}

	files :=
		r.MultipartForm.File["media"]

	if len(files) == 0 {
		writeError(
			w,
			http.StatusBadRequest,
			"media is required",
		)

		return
	}

	caption := r.FormValue("caption")

	createdPost, err :=
		handler.Service.CreateMediaPost(
			r.Context(),
			userID,
			caption,
			files,
		)

	if err != nil {
		writeError(
			w,
			http.StatusBadRequest,
			err.Error(),
		)

		return
	}

	writeJSON(
		w,
		http.StatusCreated,
		map[string]any{
			"post": createdPost,
		},
	)
}

func (handler *PostHandler) GetFeedPosts(
	w http.ResponseWriter,
	r *http.Request,
) {
	if r.Method != http.MethodGet {
		methodNotAllowed(
			w,
			http.MethodGet,
		)

		return
	}

	/*
	 * এই signed-in viewer ID দিয়েই service
	 * is_self এবং is_following calculate করবে।
	 */
	viewerUserID, ok := getAuthUserID(r)

	if !ok {
		writeError(
			w,
			http.StatusUnauthorized,
			"Unauthorized",
		)

		return
	}

	limit, cursor :=
		getPaginationQuery(r)

	response, err :=
		handler.Service.GetFeedPosts(
			r.Context(),
			viewerUserID,
			limit,
			cursor,
		)

	if err != nil {
		writeError(
			w,
			http.StatusInternalServerError,
			err.Error(),
		)

		return
	}

	writeJSON(
		w,
		http.StatusOK,
		response,
	)
}

func (handler *PostHandler) GetMyPosts(
	w http.ResponseWriter,
	r *http.Request,
) {
	if r.Method != http.MethodGet {
		methodNotAllowed(
			w,
			http.MethodGet,
		)

		return
	}

	userID, ok := getAuthUserID(r)

	if !ok {
		writeError(
			w,
			http.StatusUnauthorized,
			"Unauthorized",
		)

		return
	}

	limit, cursor :=
		getPaginationQuery(r)

	response, err :=
		handler.Service.GetUserPosts(
			r.Context(),
			userID,
			limit,
			cursor,
		)

	if err != nil {
		writeError(
			w,
			http.StatusInternalServerError,
			err.Error(),
		)

		return
	}

	writeJSON(
		w,
		http.StatusOK,
		response,
	)
}

func (handler *PostHandler) GetUserPosts(
	w http.ResponseWriter,
	r *http.Request,
) {
	if r.Method != http.MethodGet {
		methodNotAllowed(
			w,
			http.MethodGet,
		)

		return
	}

	_, authenticated :=
		getAuthUserID(r)

	if !authenticated {
		writeError(
			w,
			http.StatusUnauthorized,
			"Unauthorized",
		)

		return
	}

	userID :=
		r.URL.Query().Get("user_id")

	if userID == "" {
		writeError(
			w,
			http.StatusBadRequest,
			"user_id is required",
		)

		return
	}

	limit, cursor :=
		getPaginationQuery(r)

	response, err :=
		handler.Service.GetUserPosts(
			r.Context(),
			userID,
			limit,
			cursor,
		)

	if err != nil {
		writeError(
			w,
			http.StatusInternalServerError,
			err.Error(),
		)

		return
	}

	writeJSON(
		w,
		http.StatusOK,
		response,
	)
}