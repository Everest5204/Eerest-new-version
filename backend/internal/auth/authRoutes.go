package auth

import (
	"net/http"

	"everest-backend/internal/middleware"
	"everest-backend/internal/user"
)

func RegisterAuthRoutes(
	mux *http.ServeMux,
	authHandler *AuthHandler,
	userHandler *user.UserHandler,
	jwtSecret string,
) {
	mux.HandleFunc("/api/auth/signup", authHandler.Signup)
	mux.HandleFunc("/api/auth/login", authHandler.Login)
	mux.HandleFunc("/api/auth/google", authHandler.GoogleAuth)
	mux.HandleFunc("/api/auth/me", authHandler.Me)

	mux.HandleFunc("/api/auth/forgot-password", authHandler.ForgotPassword)
	mux.HandleFunc("/api/auth/verify-reset-code", authHandler.VerifyResetCode)
	mux.HandleFunc("/api/auth/reset-password", authHandler.ResetPassword)

	mux.Handle(
		"/api/user/me",
		middleware.AuthMiddleware(jwtSecret)(
			http.HandlerFunc(userHandler.GetCurrentUser),
		),
	)
}