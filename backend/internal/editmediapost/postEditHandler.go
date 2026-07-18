package editmediapost

import (
	"encoding/json"
	"errors"
	"log"
	"mime/multipart"
	"net/http"
	"strings"
	"time"

	"everest-backend/internal/middleware"
)

const mediaPostEditRoutePrefix = "/api/posts/media/edit/"

type PostEditHandler struct {
	Service *PostEditService
}

func NewPostEditHandler(
	service *PostEditService,
) *PostEditHandler {
	return &PostEditHandler{
		Service: service,
	}
}

// MediaPostEditor handles both opening and saving the editor.
//
// GET   /api/posts/media/edit/{postID}
// PATCH /api/posts/media/edit/{postID}
func (handler *PostEditHandler) MediaPostEditor(
	w http.ResponseWriter,
	r *http.Request,
) {
	authUserID, ok :=
		getEditAuthenticatedUserID(r)

	if !ok {
		writeEditError(
			w,
			http.StatusUnauthorized,
			"Unauthorized",
		)
		return
	}

	postID, ok := getEditPostIDFromPath(
		r.URL.Path,
	)

	if !ok {
		writeEditError(
			w,
			http.StatusBadRequest,
			"Valid post id is required",
		)
		return
	}

	switch r.Method {
	case http.MethodGet:
		handler.getEditablePost(
			w,
			r,
			authUserID,
			postID,
		)

	case http.MethodPatch:
		handler.updateMediaPost(
			w,
			r,
			authUserID,
			postID,
		)

	default:
		w.Header().Set(
			"Allow",
			"GET, PATCH",
		)

		writeEditError(
			w,
			http.StatusMethodNotAllowed,
			"Method not allowed",
		)
	}
}

func (handler *PostEditHandler) getEditablePost(
	w http.ResponseWriter,
	r *http.Request,
	authUserID string,
	postID string,
) {
	if handler == nil || handler.Service == nil {
		writeEditError(
			w,
			http.StatusInternalServerError,
			"Edit post service is unavailable",
		)
		return
	}

	response, err :=
		handler.Service.GetEditablePost(
			r.Context(),
			authUserID,
			postID,
		)

	if err != nil {
		handlePostEditError(w, err)
		return
	}

	writeEditJSON(
		w,
		http.StatusOK,
		response,
	)
}

func (handler *PostEditHandler) updateMediaPost(
	w http.ResponseWriter,
	r *http.Request,
	authUserID string,
	postID string,
) {
	if handler == nil || handler.Service == nil {
		writeEditError(
			w,
			http.StatusInternalServerError,
			"Edit post service is unavailable",
		)
		return
	}

	r.Body = http.MaxBytesReader(
		w,
		r.Body,
		maxMediaEditRequestSize,
	)

	err := r.ParseMultipartForm(
		maxMediaEditRequestSize,
	)

	if err != nil {
		var maxBytesError *http.MaxBytesError

		if errors.As(err, &maxBytesError) {
			writeEditError(
				w,
				http.StatusRequestEntityTooLarge,
				"Media edit request is too large",
			)
			return
		}

		writeEditError(
			w,
			http.StatusBadRequest,
			"Invalid media edit request",
		)
		return
	}

	if r.MultipartForm != nil {
		defer func() {
			if removeError :=
				r.MultipartForm.RemoveAll();
				removeError != nil {
				log.Printf(
					"edit post temporary files cleanup failed: %v",
					removeError,
				)
			}
		}()
	}

	caption := r.FormValue("caption")

	expectedUpdatedAt, err :=
		parseExpectedUpdatedAt(
			r.FormValue(
				"expected_updated_at",
			),
		)

	if err != nil {
		writeEditError(
			w,
			http.StatusBadRequest,
			err.Error(),
		)
		return
	}

	var keepMediaKeys []string
	var newFiles []*multipart.FileHeader

	if r.MultipartForm != nil {
		keepMediaKeys =
			r.MultipartForm.Value[
				"keep_media_key",
			]

		newFiles =
			r.MultipartForm.File["media"]
	}

	if len(keepMediaKeys) >
		maxEditImageCount {
		writeEditError(
			w,
			http.StatusBadRequest,
			"Too many existing media items",
		)
		return
	}

	if len(newFiles) >
		maxEditImageCount {
		writeEditError(
			w,
			http.StatusBadRequest,
			"Too many new media files",
		)
		return
	}

	response, err :=
		handler.Service.EditMediaPost(
			r.Context(),
			EditMediaPostInput{
				AuthUserID: authUserID,
				PostID:     postID,

				Caption: caption,

				KeepMediaKeys: keepMediaKeys,
				NewFiles:      newFiles,

				ExpectedUpdatedAt:
					expectedUpdatedAt,
			},
		)

	if err != nil {
		handlePostEditError(w, err)
		return
	}

	writeEditJSON(
		w,
		http.StatusOK,
		response,
	)
}

func getEditAuthenticatedUserID(
	r *http.Request,
) (string, bool) {
	if r == nil {
		return "", false
	}

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

func getEditPostIDFromPath(
	requestPath string,
) (string, bool) {
	if !strings.HasPrefix(
		requestPath,
		mediaPostEditRoutePrefix,
	) {
		return "", false
	}

	postID := strings.Trim(
		strings.TrimSpace(
			strings.TrimPrefix(
				requestPath,
				mediaPostEditRoutePrefix,
			),
		),
		"/",
	)

	if postID == "" ||
		strings.Contains(postID, "/") {
		return "", false
	}

	return postID, true
}

func parseExpectedUpdatedAt(
	value string,
) (time.Time, error) {
	cleanValue := strings.TrimSpace(value)

	if cleanValue == "" {
		return time.Time{}, errors.New(
			"post version is required",
		)
	}

	updatedAt, err := time.Parse(
		time.RFC3339Nano,
		cleanValue,
	)

	if err != nil {
		return time.Time{}, errors.New(
			"invalid post version",
		)
	}

	return updatedAt.UTC(), nil
}

func handlePostEditError(
	w http.ResponseWriter,
	err error,
) {
	switch {
	case errors.Is(
		err,
		ErrMediaPostNotFound,
	):
		writeEditError(
			w,
			http.StatusNotFound,
			"Media post not found",
		)

	case errors.Is(
		err,
		ErrMediaPostConflict,
	):
		writeEditError(
			w,
			http.StatusConflict,
			"This post was updated elsewhere. Refresh and try again.",
		)

	case errors.Is(
		err,
		ErrInvalidMediaSelection,
	):
		writeEditError(
			w,
			http.StatusBadRequest,
			getPublicEditError(err),
		)

	case errors.Is(
		err,
		ErrMediaPostUpdateFailed,
	):
		log.Printf(
			"media post update failed: %v",
			err,
		)

		writeEditError(
			w,
			http.StatusInternalServerError,
			"Media post update failed",
		)

	default:
		writeEditError(
			w,
			http.StatusBadRequest,
			getPublicEditError(err),
		)
	}
}

func getPublicEditError(
	err error,
) string {
	if err == nil {
		return "Invalid request"
	}

	message := strings.TrimSpace(
		err.Error(),
	)

	if message == "" {
		return "Invalid request"
	}

	// Removes the internal sentinel error prefix.
	if separatorIndex :=
		strings.Index(message, ": ");
		separatorIndex >= 0 {
		publicMessage := strings.TrimSpace(
			message[separatorIndex+2:],
		)

		if publicMessage != "" {
			return publicMessage
		}
	}

	return message
}

func writeEditError(
	w http.ResponseWriter,
	statusCode int,
	message string,
) {
	writeEditJSON(
		w,
		statusCode,
		ErrorResponse{
			Error: message,
		},
	)
}

func writeEditJSON(
	w http.ResponseWriter,
	statusCode int,
	data any,
) {
	w.Header().Set(
		"Content-Type",
		"application/json; charset=utf-8",
	)

	w.Header().Set(
		"Cache-Control",
		"no-store, no-cache, must-revalidate",
	)

	w.Header().Set(
		"X-Content-Type-Options",
		"nosniff",
	)

	w.WriteHeader(statusCode)

	if err := json.NewEncoder(w).Encode(data);
		err != nil {
		log.Printf(
			"edit post JSON response failed: %v",
			err,
		)
	}
}