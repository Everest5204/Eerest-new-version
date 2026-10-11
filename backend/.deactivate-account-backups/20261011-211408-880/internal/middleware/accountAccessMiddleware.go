package middleware

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"go.mongodb.org/mongo-driver/v2/mongo/readconcern"
	"go.mongodb.org/mongo-driver/v2/mongo/readpref"
)

const (
	accountAccessQueryTimeout          = 5 * time.Second
	accountAccessMaxAuthorizationBytes = 8192
)

type accountAccessTokenClaims struct {
	UserID string `json:"userId"`
	jwt.RegisteredClaims
}

func NewAccountAccessMiddleware(
	db *mongo.Database,
	jwtSecret string,
) (func(http.Handler) http.Handler, error) {
	if db == nil {
		return nil, errors.New(
			"account access middleware: database is required",
		)
	}

	if strings.TrimSpace(jwtSecret) == "" {
		return nil, errors.New(
			"account access middleware: JWT secret is required",
		)
	}

	jwtKey := []byte(jwtSecret)

	users := db.Collection(
		"users",
		options.Collection().
			SetReadConcern(readconcern.Majority()).
			SetReadPreference(readpref.Primary()),
	)

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(
			w http.ResponseWriter,
			r *http.Request,
		) {
			if r.Method == http.MethodOptions ||
				!strings.HasPrefix(r.URL.Path, "/api/") {
				next.ServeHTTP(w, r)
				return
			}

			// This endpoint validates its dedicated deletion receipt.
			if r.URL.Path == "/api/auth/delete-account/status" {
				next.ServeHTTP(w, r)
				return
			}

			authorization := r.Header.Values("Authorization")

			// Public endpoints keep their existing authentication rules.
			// Protected endpoints still require AuthMiddleware.
			if len(authorization) == 0 {
				next.ServeHTTP(w, r)
				return
			}

			userID, valid := parseAccountAccessUserID(
				authorization,
				jwtKey,
			)
			if !valid {
				writeAccountAccessError(
					w,
					http.StatusUnauthorized,
					"Your session is invalid or expired. Please sign in again.",
				)
				return
			}

			checkCtx, cancel := context.WithTimeout(
				r.Context(),
				accountAccessQueryTimeout,
			)

			var account struct {
				DeletionRequested bool `bson:"deletion_requested"`
			}

			err := users.FindOne(
				checkCtx,
				bson.D{
					{Key: "_id", Value: userID},
				},
				options.FindOne().SetProjection(bson.D{
					{Key: "_id", Value: 0},
					{Key: "deletion_requested", Value: 1},
				}),
			).Decode(&account)

			cancel()

			if errors.Is(err, mongo.ErrNoDocuments) {
				writeAccountAccessError(
					w,
					http.StatusUnauthorized,
					"Your session is no longer valid. Please sign in again.",
				)
				return
			}

			// Do not allow access when account state cannot be verified.
			if err != nil {
				writeAccountAccessError(
					w,
					http.StatusServiceUnavailable,
					"We could not verify your account. Please try again.",
				)
				return
			}

			isDeletionRetry :=
				r.Method == http.MethodDelete &&
					r.URL.Path == "/api/auth/delete-account"

			if account.DeletionRequested && !isDeletionRetry {
				// A 403 response preserves the session while the
				// deletion dialog checks progress with its receipt.
				writeAccountAccessError(
					w,
					http.StatusForbidden,
					"Account deletion is in progress. This account can no longer be used.",
				)
				return
			}

			// The deletion handler still verifies the password
			// and confirmation when a request is retried.
			next.ServeHTTP(w, r)
		})
	}, nil
}

func parseAccountAccessUserID(
	authorization []string,
	jwtKey []byte,
) (bson.ObjectID, bool) {
	if len(authorization) != 1 {
		return bson.NilObjectID, false
	}

	if len(authorization[0]) > accountAccessMaxAuthorizationBytes {
		return bson.NilObjectID, false
	}

	parts := strings.Fields(authorization[0])

	if len(parts) != 2 ||
		!strings.EqualFold(parts[0], "Bearer") {
		return bson.NilObjectID, false
	}

	claims := &accountAccessTokenClaims{}

	token, err := jwt.ParseWithClaims(
		parts[1],
		claims,
		func(_ *jwt.Token) (any, error) {
			return jwtKey, nil
		},
		jwt.WithValidMethods([]string{
			jwt.SigningMethodHS256.Alg(),
		}),
		jwt.WithExpirationRequired(),
		jwt.WithIssuedAt(),
		jwt.WithLeeway(5*time.Second),
	)
	if err != nil || token == nil || !token.Valid {
		return bson.NilObjectID, false
	}

	userID, err := bson.ObjectIDFromHex(claims.UserID)
	if err != nil || userID == bson.NilObjectID {
		return bson.NilObjectID, false
	}

	return userID, true
}

func writeAccountAccessError(
	w http.ResponseWriter,
	statusCode int,
	message string,
) {
	w.Header().Set(
		"Content-Type",
		"application/json; charset=utf-8",
	)
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")

	if statusCode == http.StatusUnauthorized {
		w.Header().Set(
			"WWW-Authenticate",
			`Bearer error="invalid_token"`,
		)
	}

	w.WriteHeader(statusCode)

	_ = json.NewEncoder(w).Encode(map[string]string{
		"error": message,
	})
}