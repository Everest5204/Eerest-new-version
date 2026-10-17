package personaldetails

import (
	"context"
	"math"
	"regexp"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

type Store interface {
	Get(context.Context, string, int64) (*Details, error)
	Update(context.Context, string, int64, patch) (*Details, error)
	Public(context.Context, string, int64, string) (*PublicDetails, error)
	Submit(context.Context, string, int64, ReviewRequest, time.Time) (*Details, error)
}

type Service struct {
	store Store
	clock func() time.Time
}

func NewService(store Store) *Service {
	return &Service{store: store, clock: func() time.Time { return time.Now().UTC() }}
}

func (s *Service) Get(ctx context.Context, owner string, version int64) (*Details, error) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	return s.store.Get(ctx, owner, version)
}

func (s *Service) Public(ctx context.Context, viewer string, version int64, target string) (*PublicDetails, error) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	return s.store.Public(ctx, viewer, version, target)
}

func validRevision(r *int64) bool { return r != nil && *r >= 0 && *r < math.MaxInt64 }

func cleanText(value string, limit int, multiline bool) (string, bool) {
	if !utf8.ValidString(value) {
		return "", false
	}
	value = strings.TrimSpace(strings.ReplaceAll(value, "\r\n", "\n"))
	if utf8.RuneCountInString(value) > limit {
		return "", false
	}
	for _, r := range value {
		if unicode.IsControl(r) && !(multiline && (r == '\n' || r == '\t')) {
			return "", false
		}
	}
	return value, true
}

func (s *Service) Update(ctx context.Context, owner string, version int64, req PatchRequest) (*Details, error) {
	if req.BirthDate != nil || req.Gender != nil {
		return nil, ErrReviewRequired
	}
	if !validRevision(req.ExpectedRevision) || len(req.Shared) == 0 || len(req.Shared) > len(fieldLimits) {
		return nil, ErrInput
	}
	values := SharedDetails{}
	for key, raw := range req.Shared {
		limit, known := fieldLimits[key]
		value, valid := cleanText(raw, limit, true)
		if !known || !valid {
			return nil, ErrInput
		}
		if key == "marital_status" {
			switch value {
			case "", "single", "in_relationship", "engaged", "married", "separated", "divorced", "widowed", "prefer_not_to_say":
			default:
				return nil, ErrInput
			}
		}
		values[key] = value
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	return s.store.Update(ctx, owner, version, patch{revision: *req.ExpectedRevision, values: values})
}

var requestIDPattern = regexp.MustCompile(`^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$`)

func (s *Service) Submit(ctx context.Context, owner string, version int64, req ReviewRequest) (*Details, error) {
	if !validRevision(req.ExpectedRevision) || !requestIDPattern.MatchString(req.RequestID) {
		return nil, ErrInput
	}
	reason, valid := cleanText(req.Reason, 1000, true)
	if !valid || utf8.RuneCountInString(reason) < 10 {
		return nil, ErrInput
	}
	req.Reason = reason
	switch req.Field {
	case "birth_date":
		if req.ProposedValue != "" {
			date, err := time.Parse("2006-01-02", req.ProposedValue)
			if err != nil || date.Format("2006-01-02") != req.ProposedValue || date.Year() < 1900 || date.After(s.clock().UTC()) {
				return nil, ErrInput
			}
		}
	case "gender":
		switch req.ProposedValue {
		case "", "male", "female", "other":
		default:
			return nil, ErrInput
		}
	default:
		return nil, ErrInput
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	return s.store.Submit(ctx, owner, version, req, s.clock().UTC())
}
