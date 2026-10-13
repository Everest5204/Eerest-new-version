package saveditems

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"strings"
	"time"
)

type codec struct{ key [32]byte }

func newCodec(secret string) codec {
	return codec{sha256.Sum256([]byte("mongosky:saved_items:v1:" + secret))}
}
func (c codec) encode(p Position) string {
	body, _ := json.Marshal(p)
	m := hmac.New(sha256.New, c.key[:])
	m.Write(body)
	return base64.RawURLEncoding.EncodeToString(body) + "." + base64.RawURLEncoding.EncodeToString(m.Sum(nil))
}
func (c codec) decode(token string, a Auth, q Query, now time.Time) (Position, error) {
	var p Position
	parts := strings.Split(token, ".")
	if len(token) > 2048 || len(parts) != 2 {
		return p, ErrInput
	}
	body, e := base64.RawURLEncoding.DecodeString(parts[0])
	if e != nil {
		return p, ErrInput
	}
	sig, e := base64.RawURLEncoding.DecodeString(parts[1])
	if e != nil {
		return p, ErrInput
	}
	m := hmac.New(sha256.New, c.key[:])
	m.Write(body)
	if !hmac.Equal(sig, m.Sum(nil)) || json.Unmarshal(body, &p) != nil {
		return p, ErrInput
	}
	_, e = objectID(p.ID)
	if e != nil || p.V != 1 || p.Owner != a.Owner.Hex() || p.Kind != q.Kind || p.Search != q.Search || p.At.IsZero() || p.AsOf.IsZero() || p.At.After(p.AsOf) || p.AsOf.After(now.Add(time.Minute)) || now.Sub(p.AsOf) > 24*time.Hour {
		return Position{}, ErrInput
	}
	return p, nil
}
