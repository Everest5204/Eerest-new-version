package pinpost

import (
	"context"
	"go.mongodb.org/mongo-driver/v2/bson"
	"regexp"
	"time"
)

type Store interface {
	Read(context.Context, auth, bson.ObjectID) (*Snapshot, error)
	Update(context.Context, auth, Request, time.Time) (*Response, error)
	Receipt(context.Context, auth, string) (*Response, error)
}
type Service struct {
	store Store
	now   func() time.Time
}

func NewService(store Store) *Service { return &Service{store: store, now: time.Now} }

var idPattern = regexp.MustCompile(`^[a-f0-9]{24}$`)
var requestPattern = regexp.MustCompile(`^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$`)

func objectID(value string) (bson.ObjectID, error) {
	if !idPattern.MatchString(value) {
		return bson.NilObjectID, ErrInput
	}
	id, err := bson.ObjectIDFromHex(value)
	if err != nil || id.IsZero() {
		return bson.NilObjectID, ErrInput
	}
	return id, nil
}
func session(owner string, version int64) (auth, error) {
	id, err := objectID(owner)
	if err != nil || version < 0 {
		return auth{}, ErrSession
	}
	return auth{id, version}, nil
}
func (s *Service) Read(ctx context.Context, owner string, version int64, target string) (*Snapshot, error) {
	a, err := session(owner, version)
	if err != nil {
		return nil, err
	}
	id, err := objectID(target)
	if err != nil {
		return nil, err
	}
	return s.store.Read(ctx, a, id)
}
func (s *Service) Update(ctx context.Context, owner string, version int64, req Request) (*Response, error) {
	a, err := session(owner, version)
	if err != nil {
		return nil, err
	}
	if _, err = objectID(req.PostID); err != nil {
		return nil, err
	}
	if !requestPattern.MatchString(req.RequestID) || (req.PostSource != "text" && req.PostSource != "media") || req.Pinned == nil || req.ExpectedRevision == nil || *req.ExpectedRevision < 0 || *req.ExpectedRevision >= 9_007_199_254_740_990 {
		return nil, ErrInput
	}
	return s.store.Update(ctx, a, req, s.now().UTC())
}
func (s *Service) Receipt(ctx context.Context, owner string, version int64, id string) (*Response, error) {
	a, err := session(owner, version)
	if err != nil {
		return nil, err
	}
	if !requestPattern.MatchString(id) {
		return nil, ErrInput
	}
	return s.store.Receipt(ctx, a, id)
}
