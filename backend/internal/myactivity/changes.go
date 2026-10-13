package myactivity

import (
	"everest-backend/internal/middleware"
	notification "everest-backend/internal/notification/core"
	"github.com/golang-jwt/jwt/v5"
	"go.mongodb.org/mongo-driver/v2/bson"
	"net/http"
	"strings"
)

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusWriter) WriteHeader(status int) {
	if w.status == 0 {
		w.status = status
		w.ResponseWriter.WriteHeader(status)
	}
}
func (w *statusWriter) Write(data []byte) (int, error) {
	if w.status == 0 {
		w.WriteHeader(200)
	}
	return w.ResponseWriter.Write(data)
}
func (w *statusWriter) Unwrap() http.ResponseWriter { return w.ResponseWriter }
func changesActivity(r *http.Request) bool {
	if r.Method != "POST" && r.Method != "PUT" && r.Method != "PATCH" && r.Method != "DELETE" {
		return false
	}
	p := r.URL.Path
	if p == "/api/reactions" || p == "/api/comments" || p == "/api/text-posts" || p == "/api/posts/media" {
		return true
	}
	for _, prefix := range []string{"/api/posts/delete/", "/api/posts/media/edit/", "/api/text-posts/edit/", "/api/comments/"} {
		if strings.HasPrefix(p, prefix) {
			return true
		}
	}
	return strings.HasPrefix(p, "/api/users/") && strings.HasSuffix(p, "/follow")
}

// Place inside AccountAccessMiddleware. Signal only successful, committed
// mutations; never refresh for failed writes, badge resolution or GET/SSE.
// Foreground reconciliation covers writes on other server replicas.
func TrackChanges(next http.Handler, hub *notification.Hub, secret string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, verified := r.Context().Value(middleware.SessionVersionKey).(int64)
		if !verified || !changesActivity(r) {
			next.ServeHTTP(w, r)
			return
		}
		recorder := &statusWriter{ResponseWriter: w}
		next.ServeHTTP(recorder, r)
		if recorder.status < 200 || recorder.status >= 300 {
			return
		}
		var claims struct {
			UserID string `json:"userId"`
			jwt.RegisteredClaims
		}
		parts := strings.Fields(r.Header.Get("Authorization"))
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
			return
		}
		token, e := jwt.ParseWithClaims(parts[1], &claims, func(*jwt.Token) (any, error) { return []byte(secret), nil }, jwt.WithValidMethods([]string{"HS256"}), jwt.WithExpirationRequired())
		if e != nil || !token.Valid {
			return
		}
		id, e := bson.ObjectIDFromHex(claims.UserID)
		if e == nil && !id.IsZero() {
			hub.Notify(id)
		}
	})
}
