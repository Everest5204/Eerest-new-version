package edittextpost

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"everest-backend/internal/middleware"
)

const textPostEditRoutePrefix =
	"/api/text-posts/edit/"

type TextPostEditHandler struct {
	Service *TextPostEditService
}

func NewTextPostEditHandler(
	service *TextPostEditService,
) *TextPostEditHandler {
	return &TextPostEditHandler{
		Service: service,
	}
}

// TextPostEditor handles:
//
// GET   /api/text-posts/edit/{postID}
// PATCH /api/text-posts/edit/{postID}
func (
	handler *TextPostEditHandler,
) TextPostEditor(
	w http.ResponseWriter,
	r *http.Request,
) {
	authUserID, ok :=
		getTextEditAuthenticatedUserID(
			r,
		)
	if !ok {
		writeTextEditError(
			w,
			http.StatusUnauthorized,
			"Unauthorized",
		)
		return
	}

	postID, ok :=
		getTextEditPostIDFromPath(
			r.URL.Path,
		)
	if !ok {
		writeTextEditError(
			w,
			http.StatusBadRequest,
			"Valid text post id is required",
		)
		return
	}

	switch r.Method {
	case http.MethodGet:
		handler.getEditableTextPost(
			w,
			r,
			authUserID,
			postID,
		)

	case http.MethodPatch:
		handler.updateTextPost(
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

		writeTextEditError(
			w,
			http.StatusMethodNotAllowed,
			"Method not allowed",
		)
	}
}

func (
	handler *TextPostEditHandler,
) getEditableTextPost(
	w http.ResponseWriter,
	r *http.Request,
	authUserID string,
	postID string,
) {
	if handler == nil ||
		handler.Service == nil {
		writeTextEditError(
			w,
			http.StatusInternalServerError,
			"Text post edit service is unavailable",
		)
		return
	}

	response, err :=
		handler.Service.
			GetEditableTextPost(
				r.Context(),
				authUserID,
				postID,
			)

	if err != nil {
		handleTextPostEditError(
			w,
			err,
		)
		return
	}

	writeTextEditJSON(
		w,
		http.StatusOK,
		response,
	)
}

func (
	handler *TextPostEditHandler,
) updateTextPost(
	w http.ResponseWriter,
	r *http.Request,
	authUserID string,
	postID string,
) {
	if handler == nil ||
		handler.Service == nil {
		writeTextEditError(
			w,
			http.StatusInternalServerError,
			"Text post edit service is unavailable",
		)
		return
	}

	r.Body = http.MaxBytesReader(
		w,
		r.Body,
		maxEditTextRequestBodySize,
	)

	defer r.Body.Close()

	decoder := json.NewDecoder(
		r.Body,
	)

	var request EditTextPostRequest

	if err := decoder.Decode(
		&request,
	); err != nil {
		var maxBytesError *http.MaxBytesError

		if errors.As(
			err,
			&maxBytesError,
		) {
			writeTextEditError(
				w,
				http.StatusRequestEntityTooLarge,
				"Text post edit request is too large",
			)
			return
		}

		writeTextEditError(
			w,
			http.StatusBadRequest,
			"Invalid request body",
		)
		return
	}

	// Rejects multiple JSON objects in
	// the same request body.
	if err := decoder.Decode(
		&struct{}{},
	); !errors.Is(err, io.EOF) {
		writeTextEditError(
			w,
			http.StatusBadRequest,
			"Request body must contain one JSON object",
		)
		return
	}

	text := strings.TrimSpace(
		request.Text,
	)

	if text == "" {
		text = strings.TrimSpace(
			request.Caption,
		)
	}

	background :=
		request.TextBackground

	if strings.TrimSpace(
		background.Value,
	) == "" {
		background =
			request.Background
	}

	expectedUpdatedAt, err :=
		parseTextEditUpdatedAt(
			request.ExpectedUpdatedAt,
		)

	if err != nil {
		writeTextEditError(
			w,
			http.StatusBadRequest,
			err.Error(),
		)
		return
	}

	response, err :=
		handler.Service.EditTextPost(
			r.Context(),
			EditTextPostInput{
				AuthUserID:
					authUserID,

				PostID:
					postID,

				Text:
					text,

				TextBackground:
					background,

				TextColor:
					request.TextColor,

				TextStyle:
					request.TextStyle,

				ExpectedUpdatedAt:
					expectedUpdatedAt,
			},
		)

	if err != nil {
		handleTextPostEditError(
			w,
			err,
		)
		return
	}

	writeTextEditJSON(
		w,
		http.StatusOK,
		response,
	)
}

func getTextEditAuthenticatedUserID(
	r *http.Request,
) (string, bool) {
	if r == nil {
		return "", false
	}

	userIDValue :=
		r.Context().Value(
			middleware.UserIDKey,
		)

	userID, ok :=
		userIDValue.(string)

	if !ok {
		return "", false
	}

	userID = strings.TrimSpace(
		userID,
	)

	if userID == "" {
		return "", false
	}

	return userID, true
}

func getTextEditPostIDFromPath(
	requestPath string,
) (string, bool) {
	if !strings.HasPrefix(
		requestPath,
		textPostEditRoutePrefix,
	) {
		return "", false
	}

	postID := strings.Trim(
		strings.TrimSpace(
			strings.TrimPrefix(
				requestPath,
				textPostEditRoutePrefix,
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

func parseTextEditUpdatedAt(
	value string,
) (time.Time, error) {
	cleanValue := strings.TrimSpace(
		value,
	)

	if cleanValue == "" {
		return time.Time{},
			errors.New(
				"post version is required",
			)
	}

	updatedAt, err := time.Parse(
		time.RFC3339Nano,
		cleanValue,
	)

	if err != nil {
		return time.Time{},
			errors.New(
				"invalid post version",
			)
	}

	return updatedAt.UTC(), nil
}

func handleTextPostEditError(
	w http.ResponseWriter,
	err error,
) {
	switch {
	case errors.Is(
		err,
		ErrTextPostNotFound,
	):
		writeTextEditError(
			w,
			http.StatusNotFound,
			"Text post not found",
		)

	case errors.Is(
		err,
		ErrTextPostConflict,
	):
		writeTextEditError(
			w,
			http.StatusConflict,
			"This text post was updated elsewhere. Refresh and try again.",
		)

	case errors.Is(
		err,
		ErrInvalidTextPost,
	):
		writeTextEditError(
			w,
			http.StatusBadRequest,
			getPublicTextEditError(
				err,
			),
		)

	case errors.Is(
		err,
		ErrTextPostUpdateFailed,
	):
		log.Printf(
			"text post edit failed: %v",
			err,
		)

		writeTextEditError(
			w,
			http.StatusInternalServerError,
			"Text post update failed",
		)

	default:
		writeTextEditError(
			w,
			http.StatusBadRequest,
			getPublicTextEditError(
				err,
			),
		)
	}
}

func getPublicTextEditError(
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

	// Removes an internal sentinel
	// error prefix from public messages.
	if separatorIndex :=
		strings.Index(
			message,
			": ",
		);
		separatorIndex >= 0 {
		publicMessage :=
			strings.TrimSpace(
				message[
					separatorIndex+2:
				],
			)

		if publicMessage != "" {
			return publicMessage
		}
	}

	return message
}

func writeTextEditError(
	w http.ResponseWriter,
	statusCode int,
	message string,
) {
	writeTextEditJSON(
		w,
		statusCode,
		TextPostEditErrorResponse{
			Error: message,
		},
	)
}

func writeTextEditJSON(
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
		"Pragma",
		"no-cache",
	)

	w.Header().Set(
		"Expires",
		"0",
	)

	w.Header().Set(
		"X-Content-Type-Options",
		"nosniff",
	)

	w.WriteHeader(statusCode)

	if err := json.NewEncoder(
		w,
	).Encode(data); err != nil {
		log.Printf(
			"text post edit JSON response failed: %v",
			err,
		)
	}
}