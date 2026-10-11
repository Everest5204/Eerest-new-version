package auth

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"go.mongodb.org/mongo-driver/v2/bson"
)

type AuthHandler struct {
	Service   *AuthService
	JWTSecret string
}

func NewAuthHandler(
	service *AuthService,
	jwtSecret string,
) *AuthHandler {
	return &AuthHandler{
		Service: service,

		// Use the same key bytes as the shared authentication middleware.
		JWTSecret: jwtSecret,
	}
}

func (handler *AuthHandler) Signup(
	w http.ResponseWriter,
	r *http.Request,
) {
	if r.Method != http.MethodPost {
		handleMethodNotAllowed(w, http.MethodPost)
		return
	}

	var request SignupRequest

	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeAuthError(
			w,
			http.StatusBadRequest,
			"Invalid request body",
		)
		return
	}

	user, err := handler.Service.Signup(request)
	if err != nil {
		writeAuthServiceError(
			w,
			err,
			http.StatusBadRequest,
		)
		return
	}

	if user == nil {
		writeAuthError(
			w,
			http.StatusInternalServerError,
			"Failed to create account",
		)
		return
	}

	token, err := handler.generateToken(user.ID.Hex(), user.SessionVersion)
	if err != nil {
		writeAuthError(
			w,
			http.StatusInternalServerError,
			"Failed to create token",
		)
		return
	}

	setAuthResponseHeaders(w)
	w.WriteHeader(http.StatusCreated)

	_ = json.NewEncoder(w).Encode(AuthResponse{
		Token: token,
		User:  *user,
	})
}

func (handler *AuthHandler) Login(
	w http.ResponseWriter,
	r *http.Request,
) {
	if r.Method != http.MethodPost {
		handleMethodNotAllowed(w, http.MethodPost)
		return
	}

	var request LoginRequest

	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeAuthError(
			w,
			http.StatusBadRequest,
			"Invalid request body",
		)
		return
	}

	user, err := handler.Service.Login(request)
	if err != nil {
		writeAuthServiceError(
			w,
			err,
			http.StatusUnauthorized,
		)
		return
	}

	if user == nil {
		writeAuthError(
			w,
			http.StatusInternalServerError,
			"Login failed",
		)
		return
	}

	token, err := handler.generateToken(user.ID.Hex(), user.SessionVersion)
	if err != nil {
		writeAuthError(
			w,
			http.StatusInternalServerError,
			"Failed to create token",
		)
		return
	}

	setAuthResponseHeaders(w)

	_ = json.NewEncoder(w).Encode(AuthResponse{
		Token: token,
		User:  *user,
	})
}

func (handler *AuthHandler) GoogleAuth(
	w http.ResponseWriter,
	r *http.Request,
) {
	if r.Method != http.MethodPost {
		handleMethodNotAllowed(w, http.MethodPost)
		return
	}

	var request GoogleAuthRequest

	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeAuthError(
			w,
			http.StatusBadRequest,
			"Invalid request body",
		)
		return
	}

	user, profile, needsSignup, err :=
		handler.Service.GoogleAuth(request)

	if err != nil {
		writeAuthServiceError(
			w,
			err,
			http.StatusUnauthorized,
		)
		return
	}

	if needsSignup {
		setAuthResponseHeaders(w)

		_ = json.NewEncoder(w).Encode(GoogleAuthResponse{
			Profile:     profile,
			NeedsSignup: true,
		})
		return
	}

	if user == nil {
		writeAuthError(
			w,
			http.StatusInternalServerError,
			"Google authentication failed",
		)
		return
	}

	token, err := handler.generateToken(user.ID.Hex(), user.SessionVersion)
	if err != nil {
		writeAuthError(
			w,
			http.StatusInternalServerError,
			"Failed to create token",
		)
		return
	}

	setAuthResponseHeaders(w)

	_ = json.NewEncoder(w).Encode(GoogleAuthResponse{
		Token:       token,
		User:        user,
		NeedsSignup: false,
	})
}

func (handler *AuthHandler) GoogleSignup(
	w http.ResponseWriter,
	r *http.Request,
) {
	if r.Method != http.MethodPost {
		handleMethodNotAllowed(w, http.MethodPost)
		return
	}

	var request GoogleSignupRequest

	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeAuthError(
			w,
			http.StatusBadRequest,
			"Invalid request body",
		)
		return
	}

	user, err := handler.Service.GoogleSignup(request)
	if err != nil {
		writeAuthServiceError(
			w,
			err,
			http.StatusBadRequest,
		)
		return
	}

	if user == nil {
		writeAuthError(
			w,
			http.StatusInternalServerError,
			"Failed to create Google account",
		)
		return
	}

	token, err := handler.generateToken(user.ID.Hex(), user.SessionVersion)
	if err != nil {
		writeAuthError(
			w,
			http.StatusInternalServerError,
			"Failed to create token",
		)
		return
	}

	setAuthResponseHeaders(w)
	w.WriteHeader(http.StatusCreated)

	_ = json.NewEncoder(w).Encode(AuthResponse{
		Token: token,
		User:  *user,
	})
}

func (handler *AuthHandler) ForgotPassword(
	w http.ResponseWriter,
	r *http.Request,
) {
	if r.Method != http.MethodPost {
		handleMethodNotAllowed(w, http.MethodPost)
		return
	}

	var request ForgotPasswordRequest

	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeAuthError(
			w,
			http.StatusBadRequest,
			"Invalid request body",
		)
		return
	}

	if err := handler.Service.ForgotPassword(request); err != nil {
		writeAuthServiceError(
			w,
			err,
			http.StatusBadRequest,
		)
		return
	}

	setAuthResponseHeaders(w)

	_ = json.NewEncoder(w).Encode(map[string]string{
		"message": "Verification code sent",
	})
}

func (handler *AuthHandler) VerifyResetCode(
	w http.ResponseWriter,
	r *http.Request,
) {
	if r.Method != http.MethodPost {
		handleMethodNotAllowed(w, http.MethodPost)
		return
	}

	var request VerifyResetCodeRequest

	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeAuthError(
			w,
			http.StatusBadRequest,
			"Invalid request body",
		)
		return
	}

	if err := handler.Service.VerifyResetCode(request); err != nil {
		writeAuthServiceError(
			w,
			err,
			http.StatusBadRequest,
		)
		return
	}

	setAuthResponseHeaders(w)

	_ = json.NewEncoder(w).Encode(map[string]string{
		"message": "Verification successful",
	})
}

func (handler *AuthHandler) ResetPassword(
	w http.ResponseWriter,
	r *http.Request,
) {
	if r.Method != http.MethodPost {
		handleMethodNotAllowed(w, http.MethodPost)
		return
	}

	var request ResetPasswordRequest

	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeAuthError(
			w,
			http.StatusBadRequest,
			"Invalid request body",
		)
		return
	}

	if err := handler.Service.ResetPassword(request); err != nil {
		writeAuthServiceError(
			w,
			err,
			http.StatusBadRequest,
		)
		return
	}

	setAuthResponseHeaders(w)

	_ = json.NewEncoder(w).Encode(map[string]string{
		"message": "Your password reset successfully",
	})
}

func (handler *AuthHandler) Me(
	w http.ResponseWriter,
	r *http.Request,
) {
	if r.Method != http.MethodGet {
		handleMethodNotAllowed(w, http.MethodGet)
		return
	}

	authorization := r.Header.Values("Authorization")

	if len(authorization) != 1 {
		writeAuthUnauthorized(w, "Unauthorized")
		return
	}

	parts := strings.Fields(authorization[0])

	if len(parts) != 2 ||
		!strings.EqualFold(parts[0], "Bearer") {
		writeAuthUnauthorized(w, "Unauthorized")
		return
	}

	token, err := jwt.Parse(
		parts[1],
		func(token *jwt.Token) (interface{}, error) {
			if token.Method != jwt.SigningMethodHS256 {
				return nil, errors.New(
					"unexpected signing method",
				)
			}

			return []byte(handler.JWTSecret), nil
		},
		jwt.WithValidMethods([]string{
			jwt.SigningMethodHS256.Alg(),
		}),
		jwt.WithExpirationRequired(),
		jwt.WithIssuedAt(),
		jwt.WithLeeway(5*time.Second),
	)

	if err != nil || token == nil || !token.Valid {
		writeAuthUnauthorized(w, "Invalid token")
		return
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		writeAuthUnauthorized(w, "Invalid token claims")
		return
	}

	userID, ok := claims["userId"].(string)
	if !ok || userID == "" {
		writeAuthUnauthorized(w, "Invalid user id")
		return
	}

	objectID, err := bson.ObjectIDFromHex(userID)
	if err != nil || objectID == bson.NilObjectID {
		writeAuthUnauthorized(w, "Invalid user id")
		return
	}

	ctx, cancel := context.WithTimeout(
		r.Context(),
		authOperationTimeout,
	)
	defer cancel()

	// Verify the account still exists and is available.
	user, err := handler.Service.findActiveAuthUser(
		ctx,
		objectID,
	)
	if err != nil {
		writeAuthServiceError(
			w,
			err,
			http.StatusServiceUnavailable,
		)
		return
	}

	user.Password = ""

	setAuthResponseHeaders(w)

	_ = json.NewEncoder(w).Encode(user)
}

func (handler *AuthHandler) generateToken(
	userID string, sessionVersion int64,
) (string, error) {
	if strings.TrimSpace(handler.JWTSecret) == "" {
		return "", errors.New(
			"JWT secret is not configured",
		)
	}

	now := time.Now().UTC()

	claims := jwt.MapClaims{
		"userId":          userID,
		"session_version": sessionVersion,
		"sub":             userID,
		"iat":             now.Unix(),
		"exp":             now.Add(7 * 24 * time.Hour).Unix(),
	}

	token := jwt.NewWithClaims(
		jwt.SigningMethodHS256,
		claims,
	)

	return token.SignedString(
		[]byte(handler.JWTSecret),
	)
}

func writeAuthServiceError(
	w http.ResponseWriter,
	err error,
	fallbackStatus int,
) {
	statusCode := fallbackStatus
	message := err.Error()

	switch {
	case errors.Is(err, ErrAuthAccountUnavailable):
		statusCode = http.StatusForbidden
		message = ErrAuthAccountUnavailable.Error()

	case errors.Is(err, ErrAuthAccountStatusUnavailable):
		statusCode = http.StatusServiceUnavailable
		message = ErrAuthAccountStatusUnavailable.Error()

	case errors.Is(err, context.DeadlineExceeded),
		errors.Is(err, context.Canceled):
		statusCode = http.StatusServiceUnavailable
		message = "The request could not be completed in time. Please try again."
	}

	writeAuthError(w, statusCode, message)
}

func writeAuthUnauthorized(
	w http.ResponseWriter,
	message string,
) {
	w.Header().Set(
		"WWW-Authenticate",
		`Bearer error="invalid_token"`,
	)

	writeAuthError(
		w,
		http.StatusUnauthorized,
		message,
	)
}

func writeAuthError(
	w http.ResponseWriter,
	statusCode int,
	message string,
) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")

	http.Error(w, message, statusCode)
}

func setAuthResponseHeaders(
	w http.ResponseWriter,
) {
	w.Header().Set(
		"Content-Type",
		"application/json; charset=utf-8",
	)
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
}

func handleMethodNotAllowed(
	w http.ResponseWriter,
	allowedMethod string,
) {
	w.Header().Set("Allow", allowedMethod)

	writeAuthError(
		w,
		http.StatusMethodNotAllowed,
		"Method not allowed",
	)
}
