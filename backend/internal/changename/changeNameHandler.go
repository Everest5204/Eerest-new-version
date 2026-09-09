package changename

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"time"

	"everest-backend/internal/middleware"
)

const maximumRequestBodySize = 16 * 1024

type Handler struct {
	service *Service
}

func NewHandler(
	service *Service,
) *Handler {
	return &Handler{
		service: service,
	}
}

func getAuthenticatedUserID(
	request *http.Request,
) (string, bool) {
	userIDValue := request.Context().Value(
		middleware.UserIDKey,
	)

	userID, ok := userIDValue.(string)

	if !ok || userID == "" {
		return "", false
	}

	return userID, true
}

func (handler *Handler) GetNameStatus(
	writer http.ResponseWriter,
	request *http.Request,
) {
	if request.Method != http.MethodGet {
		writer.Header().Set(
			"Allow",
			http.MethodGet,
		)

		writeError(
			writer,
			http.StatusMethodNotAllowed,
			"method not allowed",
			nil,
		)

		return
	}

	userID, authenticated :=
		getAuthenticatedUserID(request)

	if !authenticated {
		writeError(
			writer,
			http.StatusUnauthorized,
			"unauthorized",
			nil,
		)

		return
	}

	status, err :=
		handler.service.GetNameStatus(
			request.Context(),
			userID,
		)

	if err != nil {
		writeServiceError(
			writer,
			err,
			nil,
		)

		return
	}

	writeJSON(
		writer,
		http.StatusOK,
		NameStatusResponse{
			Name: *status,
		},
	)
}

func (handler *Handler) ChangeName(
	writer http.ResponseWriter,
	request *http.Request,
) {
	if request.Method != http.MethodPatch {
		writer.Header().Set(
			"Allow",
			http.MethodPatch,
		)

		writeError(
			writer,
			http.StatusMethodNotAllowed,
			"method not allowed",
			nil,
		)

		return
	}

	userID, authenticated :=
		getAuthenticatedUserID(request)

	if !authenticated {
		writeError(
			writer,
			http.StatusUnauthorized,
			"unauthorized",
			nil,
		)

		return
	}

	request.Body = http.MaxBytesReader(
		writer,
		request.Body,
		maximumRequestBodySize,
	)

	decoder := json.NewDecoder(
		request.Body,
	)

	decoder.DisallowUnknownFields()

	var changeRequest ChangeNameRequest

	if err := decoder.Decode(
		&changeRequest,
	); err != nil {
		writeError(
			writer,
			http.StatusBadRequest,
			"invalid request body",
			nil,
		)

		return
	}

	if err := decoder.Decode(
		&struct{}{},
	); !errors.Is(err, io.EOF) {
		writeError(
			writer,
			http.StatusBadRequest,
			"request body must contain one JSON object",
			nil,
		)

		return
	}

	status, err :=
		handler.service.ChangeName(
			request.Context(),
			userID,
			changeRequest,
		)

	if err != nil {
		writeServiceError(
			writer,
			err,
			status,
		)

		return
	}

	writeJSON(
		writer,
		http.StatusOK,
		NameStatusResponse{
			Name: *status,
		},
	)
}

func writeServiceError(
	writer http.ResponseWriter,
	err error,
	status *NameStatus,
) {
	switch {
	case errors.Is(err, ErrInvalidUserID),
		errors.Is(err, ErrNameRequired),
		errors.Is(err, ErrNameTooLong),
		errors.Is(err, ErrNameUnchanged):
		writeError(
			writer,
			http.StatusBadRequest,
			err.Error(),
			nil,
		)

	case errors.Is(err, ErrUserNotFound):
		writeError(
			writer,
			http.StatusNotFound,
			err.Error(),
			nil,
		)

	case errors.Is(err, ErrNameChangeLocked):
		var nextChangeAt *time.Time

		if status != nil {
			nextChangeAt =
				status.NextChangeAt
		}

		writeError(
			writer,
			http.StatusConflict,
			err.Error(),
			nextChangeAt,
		)

	default:
		writeError(
			writer,
			http.StatusInternalServerError,
			"unable to process name request",
			nil,
		)
	}
}

func writeError(
	writer http.ResponseWriter,
	statusCode int,
	message string,
	nextChangeAt *time.Time,
) {
	writeJSON(
		writer,
		statusCode,
		ErrorResponse{
			Error:        message,
			NextChangeAt: nextChangeAt,
		},
	)
}

func writeJSON(
	writer http.ResponseWriter,
	statusCode int,
	value any,
) {
	writer.Header().Set(
		"Content-Type",
		"application/json",
	)

	writer.Header().Set(
		"Cache-Control",
		"no-store, max-age=0",
	)

	writer.Header().Set(
		"Pragma",
		"no-cache",
	)

	writer.WriteHeader(statusCode)

	_ = json.NewEncoder(writer).Encode(
		value,
	)
}