package verifiedbadge

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
)

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

func (handler *Handler) ResolveBadges(
	writer http.ResponseWriter,
	request *http.Request,
) {
	if request.Method != http.MethodPost {
		writer.Header().Set(
			"Allow",
			http.MethodPost,
		)

		writeErrorResponse(
			writer,
			http.StatusMethodNotAllowed,
			"method not allowed",
		)

		return
	}

	request.Body = http.MaxBytesReader(
		writer,
		request.Body,
		maxResolveRequestBodySize,
	)

	decoder := json.NewDecoder(
		request.Body,
	)

	decoder.DisallowUnknownFields()

	var payload ResolveBadgesRequest

	if err := decoder.Decode(
		&payload,
	); err != nil {
		writeDecodeError(
			writer,
			err,
		)

		return
	}

	// Reject multiple JSON objects or unexpected trailing data.
	if err := decoder.Decode(
		&struct{}{},
	); err != io.EOF {
		writeDecodeError(
			writer,
			err,
		)

		return
	}

	badges, err :=
		handler.service.ResolveBadges(
			request.Context(),
			payload.UserIDs,
		)

	if err != nil {
		switch {
		case errors.Is(
			err,
			ErrUserIDsRequired,
		):
			writeErrorResponse(
				writer,
				http.StatusBadRequest,
				ErrUserIDsRequired.Error(),
			)

		case errors.Is(
			err,
			ErrTooManyUserIDs,
		):
			writeErrorResponse(
				writer,
				http.StatusBadRequest,
				ErrTooManyUserIDs.Error(),
			)

		case errors.Is(
			err,
			ErrInvalidUserID,
		):
			writeErrorResponse(
				writer,
				http.StatusBadRequest,
				ErrInvalidUserID.Error(),
			)

		case errors.Is(
			err,
			context.Canceled,
		):
			return

		case errors.Is(
			err,
			context.DeadlineExceeded,
		):
			writeErrorResponse(
				writer,
				http.StatusGatewayTimeout,
				"badge request timed out",
			)

		default:
			writeErrorResponse(
				writer,
				http.StatusInternalServerError,
				"unable to resolve verified badges",
			)
		}

		return
	}

	writer.Header().Set(
		"Cache-Control",
		"private, no-store, no-cache, must-revalidate",
	)

	writeJSONResponse(
		writer,
		http.StatusOK,
		ResolveBadgesResponse{
			Badges: badges,
		},
	)
}

func writeDecodeError(
	writer http.ResponseWriter,
	err error,
) {
	var maxBytesError *http.MaxBytesError

	if errors.As(
		err,
		&maxBytesError,
	) {
		writeErrorResponse(
			writer,
			http.StatusRequestEntityTooLarge,
			"request body is too large",
		)

		return
	}

	writeErrorResponse(
		writer,
		http.StatusBadRequest,
		"invalid request body",
	)
}

func writeErrorResponse(
	writer http.ResponseWriter,
	statusCode int,
	message string,
) {
	writeJSONResponse(
		writer,
		statusCode,
		ErrorResponse{
			Error: message,
		},
	)
}

func writeJSONResponse(
	writer http.ResponseWriter,
	statusCode int,
	payload any,
) {
	writer.Header().Set(
		"Content-Type",
		"application/json; charset=utf-8",
	)

	writer.WriteHeader(
		statusCode,
	)

	_ = json.NewEncoder(
		writer,
	).Encode(
		payload,
	)
}