package textpost

import (
	"encoding/json"
	"net/http"
	"strconv"

	"everest-backend/internal/middleware"
)

const (
	defaultTextPostRequestLimit int64 = 6
	maxTextPostRequestLimit     int64 = 20
	maxTextPostBodySize               = 64 << 10
)

type TextPostHandler struct {
	Service *TextPostService
}

type textPostErrorResponse struct {
	Error string `json:"error"`
}

func NewTextPostHandler(
	service *TextPostService,
) *TextPostHandler {
	return &TextPostHandler{
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

func setTextPostJSONHeaders(
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

func writeTextPostJSON(
	w http.ResponseWriter,
	statusCode int,
	data any,
) {
	setTextPostJSONHeaders(w)
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

func writeTextPostError(
	w http.ResponseWriter,
	statusCode int,
	message string,
) {
	writeTextPostJSON(
		w,
		statusCode,
		textPostErrorResponse{
			Error: message,
		},
	)
}

func textPostMethodNotAllowed(
	w http.ResponseWriter,
	allowedMethod string,
) {
	w.Header().Set(
		"Allow",
		allowedMethod,
	)

	writeTextPostError(
		w,
		http.StatusMethodNotAllowed,
		"Method not allowed",
	)
}

func getTextPostPaginationQuery(
	r *http.Request,
) (int64, string) {
	limit := defaultTextPostRequestLimit

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
			parsedLimit <=
				maxTextPostRequestLimit {
			limit = parsedLimit
		}
	}

	cursor :=
		r.URL.Query().Get("cursor")

	return limit, cursor
}

func (handler *TextPostHandler) CreateTextPost(
	w http.ResponseWriter,
	r *http.Request,
) {
	if r.Method != http.MethodPost {
		textPostMethodNotAllowed(
			w,
			http.MethodPost,
		)

		return
	}

	userID, ok := getAuthUserID(r)

	if !ok {
		writeTextPostError(
			w,
			http.StatusUnauthorized,
			"Unauthorized",
		)

		return
	}

	r.Body = http.MaxBytesReader(
		w,
		r.Body,
		maxTextPostBodySize,
	)

	defer r.Body.Close()

	var request CreateTextPostRequest

	if err := json.NewDecoder(r.Body).
		Decode(&request); err != nil {
		writeTextPostError(
			w,
			http.StatusBadRequest,
			"Invalid request body",
		)

		return
	}

	createdPost, err :=
		handler.Service.CreateTextPost(
			r.Context(),
			userID,
			request,
		)

	if err != nil {
		writeTextPostError(
			w,
			http.StatusBadRequest,
			err.Error(),
		)

		return
	}

	writeTextPostJSON(
		w,
		http.StatusCreated,
		CreateTextPostResponse{
			Post: *createdPost,
		},
	)
}

func (handler *TextPostHandler) GetFeedPosts(
	w http.ResponseWriter,
	r *http.Request,
) {
	if r.Method != http.MethodGet {
		textPostMethodNotAllowed(
			w,
			http.MethodGet,
		)

		return
	}

	/*
	 * এই viewer ID দিয়ে service Home feed-এর
	 * is_self এবং is_following calculate করবে।
	 */
	viewerUserID, ok :=
		getAuthUserID(r)

	if !ok {
		writeTextPostError(
			w,
			http.StatusUnauthorized,
			"Unauthorized",
		)

		return
	}

	limit, cursor :=
		getTextPostPaginationQuery(r)

	response, err :=
		handler.Service.GetFeedPosts(
			r.Context(),
			viewerUserID,
			limit,
			cursor,
		)

	if err != nil {
		writeTextPostError(
			w,
			http.StatusInternalServerError,
			err.Error(),
		)

		return
	}

	writeTextPostJSON(
		w,
		http.StatusOK,
		response,
	)
}

func (handler *TextPostHandler) GetMyPosts(
	w http.ResponseWriter,
	r *http.Request,
) {
	if r.Method != http.MethodGet {
		textPostMethodNotAllowed(
			w,
			http.MethodGet,
		)

		return
	}

	userID, ok := getAuthUserID(r)

	if !ok {
		writeTextPostError(
			w,
			http.StatusUnauthorized,
			"Unauthorized",
		)

		return
	}

	limit, cursor :=
		getTextPostPaginationQuery(r)

	response, err :=
		handler.Service.GetUserPosts(
			r.Context(),
			userID,
			limit,
			cursor,
		)

	if err != nil {
		writeTextPostError(
			w,
			http.StatusInternalServerError,
			err.Error(),
		)

		return
	}

	writeTextPostJSON(
		w,
		http.StatusOK,
		response,
	)
}

func (handler *TextPostHandler) GetUserPosts(
	w http.ResponseWriter,
	r *http.Request,
) {
	if r.Method != http.MethodGet {
		textPostMethodNotAllowed(
			w,
			http.MethodGet,
		)

		return
	}

	_, authenticated :=
		getAuthUserID(r)

	if !authenticated {
		writeTextPostError(
			w,
			http.StatusUnauthorized,
			"Unauthorized",
		)

		return
	}

	userID :=
		r.URL.Query().Get("user_id")

	if userID == "" {
		writeTextPostError(
			w,
			http.StatusBadRequest,
			"user_id is required",
		)

		return
	}

	limit, cursor :=
		getTextPostPaginationQuery(r)

	response, err :=
		handler.Service.GetUserPosts(
			r.Context(),
			userID,
			limit,
			cursor,
		)

	if err != nil {
		writeTextPostError(
			w,
			http.StatusInternalServerError,
			err.Error(),
		)

		return
	}

	writeTextPostJSON(
		w,
		http.StatusOK,
		response,
	)
}