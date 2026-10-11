package middleware

import (
	"github.com/golang-jwt/jwt/v5"
	"go.mongodb.org/mongo-driver/v2/bson"
	"testing"
	"time"
)

func TestAccountSessionVersionsAndJWTValidation(t *testing.T) {
	id := bson.NewObjectID()
	key := []byte("local-test-key")
	for _, version := range []any{nil, int64(0), int64(2), int64(-1), "2", 1.5} {
		claims := jwt.MapClaims{"userId": id.Hex(), "iat": time.Now().Unix(), "exp": time.Now().Add(time.Hour).Unix()}
		if version != nil {
			claims["session_version"] = version
		}
		token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(key)
		if err != nil {
			t.Fatal(err)
		}
		got, number, ok := parseAccountAccessSession([]string{"Bearer " + token}, key)
		valid := version == nil || version == int64(0) || version == int64(2)
		if ok != valid {
			t.Fatalf("version %v valid=%v", version, ok)
		}
		if valid && (got != id || number < 0) {
			t.Fatal("invalid session parsed")
		}
		if version == int64(2) && number != 2 {
			t.Fatal("version lost")
		}
	}
	claims := jwt.MapClaims{"userId": id.Hex(), "exp": time.Now().Add(time.Hour).Unix()}
	wrongAlgorithm, _ := jwt.NewWithClaims(jwt.SigningMethodHS512, claims).SignedString(key)
	if _, _, ok := parseAccountAccessSession([]string{"Bearer " + wrongAlgorithm}, key); ok {
		t.Fatal("wrong algorithm accepted")
	}
	valid, _ := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(key)
	if _, _, ok := parseAccountAccessSession([]string{"Bearer " + valid, "Bearer " + valid}, key); ok {
		t.Fatal("duplicate authorization accepted")
	}
	if _, _, ok := parseAccountAccessSession([]string{"Bearer " + valid}, []byte("wrong")); ok {
		t.Fatal("wrong signature accepted")
	}
}
