package myactivity

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"go.mongodb.org/mongo-driver/v2/bson"
	"strings"
	"time"
)

type cursorCodec struct{ key [32]byte }

func newCodec(secret string) cursorCodec {
	return cursorCodec{sha256.Sum256([]byte("mongosky:my_activity:v1:" + secret))}
}
func (c cursorCodec) encode(p position) string {
	body, _ := json.Marshal(p)
	mac := hmac.New(sha256.New, c.key[:])
	mac.Write(body)
	return base64.RawURLEncoding.EncodeToString(body) + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}
func (c cursorCodec) decode(token string, owner bson.ObjectID, q Query, now time.Time) (position, error) {
	var p position
	parts := strings.Split(token, ".")
	if len(parts) != 2 || len(token) > 2048 {
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
	mac := hmac.New(sha256.New, c.key[:])
	mac.Write(body)
	if !hmac.Equal(sig, mac.Sum(nil)) {
		return p, ErrInput
	}
	if json.Unmarshal(body, &p) != nil {
		return p, ErrInput
	}
	_, kindOK := sourceFor(p.Kind)
	id, e := bson.ObjectIDFromHex(p.ID)
	if p.Version != 1 || p.Owner != owner.Hex() || p.Category != q.Category || !p.From.Equal(q.From) || !p.Before.Equal(q.Before) || !kindOK || e != nil || id.IsZero() || p.At.IsZero() || p.AsOf.IsZero() || p.At.After(p.AsOf) || p.AsOf.After(now.Add(time.Minute)) || now.Sub(p.AsOf) > 24*time.Hour {
		return position{}, ErrInput
	}
	return p, nil
}
