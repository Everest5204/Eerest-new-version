package ai

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"

	"everest-backend/internal/middleware"
)

const maxAIRequestBodyBytes = 16 << 10

type AIHandler struct {
	service *AIService
}

type errorResponse struct {
	Error string `json:"error"`
}

func NewAIHandler(
	service *AIService,
) *AIHandler {
	return &AIHandler{
		service: service,
	}
}

func RegisterAIRoutes(
	mux *http.ServeMux,
	handler *AIHandler,
	jwtSecret string,
) {
	requireAuth :=
		middleware.AuthMiddleware(
			jwtSecret,
		)

	mux.Handle(
		"/api/ai/chats",
		requireAuth(
			http.HandlerFunc(
				handler.Chats,
			),
		),
	)

	mux.Handle(
		"/api/ai/chats/",
		requireAuth(
			http.HandlerFunc(
				handler.ChatItem,
			),
		),
	)

	mux.Handle(
		"/api/ai/messages",
		requireAuth(
			http.HandlerFunc(
				handler.SendMessage,
			),
		),
	)
}

func (handler *AIHandler) Chats(
	w http.ResponseWriter,
	r *http.Request,
) {
	userID, ok := getAuthenticatedUserID(
		r,
	)

	if !ok {
		writeAIError(
			w,
			http.StatusUnauthorized,
			"Unauthorized",
		)
		return
	}

	switch r.Method {
	case http.MethodGet:
		chats, err :=
			handler.service.ListChats(
				r.Context(),
				userID,
			)

		if err != nil {
			writeServiceError(w, err)
			return
		}

		writeAIJSON(
			w,
			http.StatusOK,
			ChatsResponse{
				Chats: chats,
			},
		)

	case http.MethodDelete:
		if err :=
			handler.service.ClearChats(
				r.Context(),
				userID,
			); err != nil {

			writeServiceError(w, err)
			return
		}

		writeAIJSON(
			w,
			http.StatusOK,
			DeleteResponse{
				Deleted: true,
			},
		)

	default:
		methodNotAllowed(
			w,
			"GET, DELETE",
		)
	}
}

func (handler *AIHandler) ChatItem(
	w http.ResponseWriter,
	r *http.Request,
) {
	userID, ok := getAuthenticatedUserID(
		r,
	)

	if !ok {
		writeAIError(
			w,
			http.StatusUnauthorized,
			"Unauthorized",
		)
		return
	}

	conversationID, action, ok :=
		parseChatPath(r.URL.Path)

	if !ok {
		writeAIError(
			w,
			http.StatusNotFound,
			"AI chat route not found",
		)
		return
	}

	if action == "messages" {
		if r.Method != http.MethodGet {
			methodNotAllowed(
				w,
				http.MethodGet,
			)
			return
		}

		messages, err :=
			handler.service.GetMessages(
				r.Context(),
				userID,
				conversationID,
			)

		if err != nil {
			writeServiceError(w, err)
			return
		}

		writeAIJSON(
			w,
			http.StatusOK,
			MessagesResponse{
				Messages: messages,
			},
		)

		return
	}

	if action != "" {
		writeAIError(
			w,
			http.StatusNotFound,
			"AI chat route not found",
		)
		return
	}

	if r.Method != http.MethodDelete {
		methodNotAllowed(
			w,
			http.MethodDelete,
		)
		return
	}

	if err := handler.service.DeleteChat(
		r.Context(),
		userID,
		conversationID,
	); err != nil {
		writeServiceError(w, err)
		return
	}

	writeAIJSON(
		w,
		http.StatusOK,
		DeleteResponse{
			Deleted: true,
		},
	)
}

func (handler *AIHandler) SendMessage(
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

	userID, ok := getAuthenticatedUserID(
		r,
	)

	if !ok {
		writeAIError(
			w,
			http.StatusUnauthorized,
			"Unauthorized",
		)
		return
	}

	var request SendMessageRequest

	if !decodeAIRequest(
		w,
		r,
		&request,
	) {
		return
	}

	cleanMessage := strings.TrimSpace(
		request.Message,
	)

	if cleanMessage == "" {
		writeAIError(
			w,
			http.StatusBadRequest,
			"Message is required",
		)
		return
	}

	if len([]rune(cleanMessage)) >
		maxMessageLength {

		writeAIError(
			w,
			http.StatusBadRequest,
			"Message is too long",
		)
		return
	}

	flusher, ok :=
		w.(http.Flusher)

	if !ok {
		writeAIError(
			w,
			http.StatusInternalServerError,
			"Streaming is unavailable",
		)
		return
	}

	w.Header().Set(
		"Content-Type",
		"text/event-stream; charset=utf-8",
	)

	w.Header().Set(
		"Cache-Control",
		"no-cache, no-store, no-transform",
	)

	w.Header().Set(
		"X-Accel-Buffering",
		"no",
	)

	w.Header().Set(
		"X-Content-Type-Options",
		"nosniff",
	)

	w.WriteHeader(http.StatusOK)

	if _, err := io.WriteString(
		w,
		": connected\n\n",
	); err != nil {
		return
	}

	flusher.Flush()

	emit := func(
		event string,
		payload any,
	) error {
		eventData, err :=
			json.Marshal(payload)

		if err != nil {
			return err
		}

		if _, err := fmt.Fprintf(
			w,
			"event: %s\ndata: %s\n\n",
			event,
			eventData,
		); err != nil {
			return err
		}

		flusher.Flush()
		return nil
	}

	err := handler.service.StreamMessage(
		r.Context(),
		userID,
		SendMessageRequest{
			ConversationID: strings.TrimSpace(
				request.ConversationID,
			),

			Message: cleanMessage,
		},
		emit,
	)

	if err == nil ||
		errors.Is(
			err,
			r.Context().Err(),
		) {

		return
	}

	log.Printf(
		"Everest AI stream failed: %v",
		err,
	)

	_ = emit(
		"error",
		errorResponse{
			Error: safeServiceErrorMessage(
				err,
			),
		},
	)
}

func getAuthenticatedUserID(
	r *http.Request,
) (string, bool) {
	value := r.Context().Value(
		middleware.UserIDKey,
	)

	userID, ok := value.(string)

	return userID, ok &&
		strings.TrimSpace(userID) != ""
}

func parseChatPath(
	path string,
) (
	conversationID string,
	action string,
	ok bool,
) {
	remainder := strings.Trim(
		strings.TrimPrefix(
			path,
			"/api/ai/chats/",
		),
		"/",
	)

	if remainder == "" {
		return "", "", false
	}

	parts := strings.Split(
		remainder,
		"/",
	)

	switch len(parts) {
	case 1:
		return parts[0], "", true
	case 2:
		if parts[1] == "messages" {
			return parts[0],
				"messages",
				true
		}
	}

	return "", "", false
}

func decodeAIRequest(
	w http.ResponseWriter,
	r *http.Request,
	target any,
) bool {
	r.Body = http.MaxBytesReader(
		w,
		r.Body,
		maxAIRequestBodyBytes,
	)
	defer r.Body.Close()

	decoder := json.NewDecoder(
		r.Body,
	)

	decoder.DisallowUnknownFields()

	if err := decoder.Decode(
		target,
	); err != nil {
		writeAIError(
			w,
			http.StatusBadRequest,
			"Invalid request body",
		)
		return false
	}

	if err := decoder.Decode(
		&struct{}{},
	); !errors.Is(err, io.EOF) {
		writeAIError(
			w,
			http.StatusBadRequest,
			"Request body must contain one JSON object",
		)
		return false
	}

	return true
}

func writeServiceError(
	w http.ResponseWriter,
	err error,
) {
	statusCode := http.StatusInternalServerError

	switch {
	case errors.Is(
		err,
		errInvalidUserID,
	):
		statusCode = http.StatusUnauthorized

	case errors.Is(
		err,
		errInvalidConversation,
	),
		errors.Is(
			err,
			errMessageRequired,
		),
		errors.Is(
			err,
			errMessageTooLong,
		):

		statusCode = http.StatusBadRequest

	case errors.Is(
		err,
		errConversationNotFound,
	):
		statusCode = http.StatusNotFound
	}

	log.Printf(
		"Everest AI request failed: %v",
		err,
	)

	writeAIError(
		w,
		statusCode,
		safeServiceErrorMessage(err),
	)
}

func safeServiceErrorMessage(
	err error,
) string {
	switch {
	case errors.Is(
		err,
		errInvalidUserID,
	):
		return "Unauthorized"

	case errors.Is(
		err,
		errInvalidConversation,
	):
		return "Invalid chat id"

	case errors.Is(
		err,
		errConversationNotFound,
	):
		return "Chat not found"

	case errors.Is(
		err,
		errMessageRequired,
	):
		return "Message is required"

	case errors.Is(
		err,
		errMessageTooLong,
	):
		return "Message is too long"

	case errors.Is(
		err,
		errGeminiNotConfigured,
	):
		return "Everest AI is not configured yet"

	case errors.Is(
		err,
		errGeminiUnavailable,
	):
		return "Everest AI is temporarily unavailable"

	default:
		return "Everest AI could not complete the request"
	}
}

func methodNotAllowed(
	w http.ResponseWriter,
	allowedMethods string,
) {
	w.Header().Set(
		"Allow",
		allowedMethods,
	)

	writeAIError(
		w,
		http.StatusMethodNotAllowed,
		"Method not allowed",
	)
}

func writeAIError(
	w http.ResponseWriter,
	statusCode int,
	message string,
) {
	writeAIJSON(
		w,
		statusCode,
		errorResponse{
			Error: message,
		},
	)
}

func writeAIJSON(
	w http.ResponseWriter,
	statusCode int,
	payload any,
) {
	w.Header().Set(
		"Content-Type",
		"application/json; charset=utf-8",
	)

	w.Header().Set(
		"Cache-Control",
		"no-store",
	)

	w.Header().Set(
		"X-Content-Type-Options",
		"nosniff",
	)

	w.WriteHeader(statusCode)

	if err := json.NewEncoder(w).
		Encode(payload); err != nil {

		log.Printf(
			"Everest AI JSON encode failed: %v",
			err,
		)
	}
}