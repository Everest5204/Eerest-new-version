package personaldetails

import (
	"context"
	"math"
	"strings"
	"time"
)

type Store interface {
	Get(context.Context, string, int64) (*Details, error)
	Update(context.Context, string, int64, patch) (*Details, error)
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

func (s *Service) Update(ctx context.Context, owner string, version int64, req PatchRequest) (*Details, error) {
	if req.ExpectedRevision == nil || *req.ExpectedRevision < 0 || *req.ExpectedRevision == math.MaxInt64 || (req.BirthDate == nil && req.Gender == nil) {
		return nil, ErrInput
	}
	p := patch{revision: *req.ExpectedRevision}
	if req.BirthDate != nil {
		value := *req.BirthDate
		if value != "" {
			date, err := time.Parse("2006-01-02", value)
			if err != nil || date.Year() < 1900 || date.After(s.clock().UTC()) {
				return nil, ErrInput
			}
		}
		p.birth = &value
	}
	if req.Gender != nil {
		value := strings.ToLower(strings.TrimSpace(*req.Gender))
		switch value {
		case "", "male", "female", "other":
		default:
			return nil, ErrInput
		}
		p.gender = &value
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	return s.store.Update(ctx, owner, version, p)
}
