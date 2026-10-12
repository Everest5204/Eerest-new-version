package reportpost

import (
	"context"
	"regexp"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"go.mongodb.org/mongo-driver/v2/bson"
)

var objectIDPattern = regexp.MustCompile(`^[a-f0-9]{24}$`)
var requestIDPattern = regexp.MustCompile(`^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$`)

type Store interface {
	Submit(context.Context, session, submission, time.Time) (*Response, error)
	Receipt(context.Context, session, string) (*Response, error)
}
type Service struct {
	store Store
	clock func() time.Time
}

func NewService(store Store) *Service {
	return &Service{store: store, clock: func() time.Time { return time.Now().UTC() }}
}

func identity(owner string, version int64) (session, error) {
	if !objectIDPattern.MatchString(owner) || version < 0 {
		return session{}, ErrSession
	}
	id, _ := bson.ObjectIDFromHex(owner)
	if id.IsZero() {
		return session{}, ErrSession
	}
	return session{owner: id, version: version}, nil
}
func (s *Service) Submit(ctx context.Context, owner string, version int64, req Request) (*Response, error) {
	auth, err := identity(owner, version)
	if err != nil {
		return nil, err
	}
	if !objectIDPattern.MatchString(req.PostID) || !requestIDPattern.MatchString(req.RequestID) ||
		(req.PostSource != "text" && req.PostSource != "media") || !reasons[req.Reason] {
		return nil, ErrInput
	}
	id, _ := bson.ObjectIDFromHex(req.PostID)
	if id.IsZero() {
		return nil, ErrInput
	}
	req.Details = strings.TrimSpace(req.Details)
	if !utf8.ValidString(req.Details) || utf8.RuneCountInString(req.Details) > MaxDetailsCharacters {
		return nil, ErrInput
	}
	for _, r := range req.Details {
		if unicode.IsControl(r) && r != '\n' && r != '\t' && r != '\r' {
			return nil, ErrInput
		}
	}
	ctx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	return s.store.Submit(ctx, auth, submission{Request: req, postID: id}, s.clock().UTC())
}
func (s *Service) Receipt(ctx context.Context, owner string, version int64, requestID string) (*Response, error) {
	auth, err := identity(owner, version)
	if err != nil {
		return nil, err
	}
	if !requestIDPattern.MatchString(requestID) {
		return nil, ErrInput
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	return s.store.Receipt(ctx, auth, requestID)
}
func (s *Service) retryAfter() int {
	now := s.clock().UTC()
	return max(1, int(now.Truncate(time.Hour).Add(time.Hour).Sub(now).Seconds()))
}
