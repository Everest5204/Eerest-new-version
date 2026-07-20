package search

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
)

const (
	defaultResultLimit = 12
	maximumResultLimit = 20
	maximumQueryLength = 80
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

func (handler *Handler) SearchUsers(
	w http.ResponseWriter,
	r *http.Request,
) {
	if r.Method != http.MethodGet {
		http.Error(
			w,
			"Method not allowed",
			http.StatusMethodNotAllowed,
		)

		return
	}

	query := strings.Join(
		strings.Fields(
			r.URL.Query().Get("q"),
		),
		" ",
	)

	if len([]rune(query)) >
		maximumQueryLength {

		http.Error(
			w,
			"Search query is too long",
			http.StatusBadRequest,
		)

		return
	}

	limit := parseResultLimit(
		r.URL.Query().Get("limit"),
	)

	users, err := handler.service.SearchUsers(
		r.Context(),
		query,
		int64(limit),
	)

	if err != nil {
		http.Error(
			w,
			"Unable to search users",
			http.StatusInternalServerError,
		)

		return
	}

	// Search responses should always come from the live database.
	w.Header().Set(
		"Cache-Control",
		"no-store",
	)

	writeJSON(
		w,
		http.StatusOK,
		UsersResponse{
			Users: users,
			Count: len(users),
			Query: query,
		},
	)
}

func parseResultLimit(
	rawLimit string,
) int {
	limit, err := strconv.Atoi(
		rawLimit,
	)

	if err != nil || limit < 1 {
		return defaultResultLimit
	}

	if limit > maximumResultLimit {
		return maximumResultLimit
	}

	return limit
}

func writeJSON(
	w http.ResponseWriter,
	statusCode int,
	payload any,
) {
	w.Header().Set(
		"Content-Type",
		"application/json; charset=utf-8",
	)

	w.WriteHeader(statusCode)

	_ = json.NewEncoder(w).Encode(
		payload,
	)
}