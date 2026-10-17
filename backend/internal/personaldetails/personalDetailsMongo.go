package personaldetails

import (
	"context"
	"errors"
	"everest-backend/internal/accountstate"
	"everest-backend/internal/changename"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"go.mongodb.org/mongo-driver/v2/mongo/readconcern"
	"go.mongodb.org/mongo-driver/v2/mongo/readpref"
	"go.mongodb.org/mongo-driver/v2/mongo/writeconcern"
)

type MongoStore struct{ users *mongo.Collection }

func NewMongoStore(db *mongo.Database) *MongoStore {
	return &MongoStore{users: db.Collection("users", options.Collection().SetReadConcern(readconcern.Majority()).SetReadPreference(readpref.Primary()).SetWriteConcern(writeconcern.Majority()))}
}

type document struct {
	ID            bson.ObjectID            `bson:"_id"`
	FirstName     string                   `bson:"first_name"`
	LastName      string                   `bson:"last_name"`
	Contact       string                   `bson:"email_or_phone"`
	EmailVerified bool                     `bson:"email_verified"`
	ImageURL      string                   `bson:"profile_image_url"`
	Gender        string                   `bson:"gender"`
	BirthYear     int                      `bson:"birth_year"`
	BirthMonth    int                      `bson:"birth_month"`
	BirthDay      int                      `bson:"birth_day"`
	Revision      int64                    `bson:"personal_details_revision"`
	NameChangedAt *time.Time               `bson:"name_changed_at"`
	Shared        SharedDetails            `bson:"personal_details"`
	Requests      map[string]ChangeRequest `bson:"personal_details_requests"`
}

var publicProjection = bson.M{"_id": 1, "first_name": 1, "last_name": 1, "profile_image_url": 1, "gender": 1, "birth_year": 1, "birth_month": 1, "birth_day": 1, "personal_details": 1}
var projection = func() bson.M {
	p := bson.M{}
	for key, value := range publicProjection {
		p[key] = value
	}
	for _, key := range []string{"email_or_phone", "email_verified", "personal_details_revision", "name_changed_at", "personal_details_requests"} {
		p[key] = 1
	}
	return p
}()

func sharedDetails(values SharedDetails) SharedDetails {
	out := SharedDetails{}
	for key := range fieldLimits {
		if value := values[key]; value != "" {
			out[key] = value
		}
	}
	return out
}
func birthDate(d document) string {
	if d.BirthYear < 1900 || d.BirthMonth < 1 || d.BirthMonth > 12 || d.BirthDay < 1 {
		return ""
	}
	date := time.Date(d.BirthYear, time.Month(d.BirthMonth), d.BirthDay, 0, 0, 0, 0, time.UTC)
	if date.Year() != d.BirthYear || int(date.Month()) != d.BirthMonth || date.Day() != d.BirthDay || date.After(time.Now().UTC()) {
		return ""
	}
	return date.Format("2006-01-02")
}
func details(d document) *Details {
	out := &Details{ID: d.ID.Hex(), FirstName: d.FirstName, LastName: d.LastName, Contact: d.Contact,
		EmailVerified: d.EmailVerified, ImageURL: d.ImageURL, Gender: d.Gender, BirthDate: birthDate(d),
		Revision: d.Revision, NameCanChange: true, Shared: sharedDetails(d.Shared), Requests: []ChangeRequest{}}
	for _, key := range []string{"birth_date", "gender"} {
		if request, ok := d.Requests[key]; ok {
			out.Requests = append(out.Requests, request)
		}
	}
	if d.NameChangedAt != nil {
		next := d.NameChangedAt.Add(changename.NameChangeCooldown)
		out.NameNextChangeAt, out.NameCanChange = &next, !time.Now().UTC().Before(next)
	}
	return out
}
func ownerFilter(owner string, version int64) (bson.M, error) {
	id, err := bson.ObjectIDFromHex(owner)
	if err != nil || id.IsZero() || version < 0 {
		return nil, ErrSession
	}
	return accountstate.ActiveFilter(bson.M{"_id": id, "$and": bson.A{accountstate.VersionFilter(version)}}), nil
}
func withRevision(filter bson.M, revision int64) bson.M {
	match := bson.M{"personal_details_revision": revision}
	if revision == 0 {
		match = bson.M{"$or": bson.A{bson.M{"personal_details_revision": int64(0)}, bson.M{"personal_details_revision": bson.M{"$exists": false}}}}
	}
	filter["$and"] = append(filter["$and"].(bson.A), match)
	return filter
}
func (s *MongoStore) Get(ctx context.Context, owner string, version int64) (*Details, error) {
	filter, err := ownerFilter(owner, version)
	if err != nil {
		return nil, err
	}
	var d document
	err = s.users.FindOne(ctx, filter, options.FindOne().SetProjection(projection)).Decode(&d)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, ErrSession
	}
	if err != nil {
		return nil, err
	}
	return details(d), nil
}
func (s *MongoStore) Public(ctx context.Context, viewer string, version int64, target string) (*PublicDetails, error) {
	filter, err := ownerFilter(viewer, version)
	if err != nil {
		return nil, err
	}
	if err = s.users.FindOne(ctx, filter, options.FindOne().SetProjection(bson.M{"_id": 1})).Err(); errors.Is(err, mongo.ErrNoDocuments) {
		return nil, ErrSession
	} else if err != nil {
		return nil, err
	}
	id, err := bson.ObjectIDFromHex(target)
	if err != nil || id.IsZero() {
		return nil, ErrNotFound
	}
	var d document
	err = s.users.FindOne(ctx, accountstate.ActiveFilter(bson.M{"_id": id}), options.FindOne().SetProjection(publicProjection)).Decode(&d)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &PublicDetails{ID: d.ID.Hex(), FirstName: d.FirstName, LastName: d.LastName, ImageURL: d.ImageURL, BirthDate: birthDate(d), Gender: d.Gender, Shared: sharedDetails(d.Shared)}, nil
}
func (s *MongoStore) write(ctx context.Context, owner string, version int64, filter, update bson.M) (*Details, error) {
	var d document
	err := s.users.FindOneAndUpdate(ctx, filter, update, options.FindOneAndUpdate().SetReturnDocument(options.After).SetProjection(projection)).Decode(&d)
	if errors.Is(err, mongo.ErrNoDocuments) {
		if _, checkErr := s.Get(ctx, owner, version); checkErr != nil {
			return nil, checkErr
		}
		return nil, ErrConflict
	}
	if err != nil {
		return nil, err
	}
	return details(d), nil
}
func (s *MongoStore) Update(ctx context.Context, owner string, version int64, p patch) (*Details, error) {
	filter, err := ownerFilter(owner, version)
	if err != nil {
		return nil, err
	}
	current, err := s.Get(ctx, owner, version)
	if err != nil {
		return nil, err
	}
	if current.Revision != p.revision {
		return nil, ErrConflict
	}
	set := bson.M{}
	for key, value := range p.values {
		if current.Shared[key] != value {
			set["personal_details."+key] = value
		}
	}
	if len(set) == 0 {
		return current, nil
	}
	set["updated_at"] = time.Now().UTC()
	return s.write(ctx, owner, version, withRevision(filter, p.revision), bson.M{"$set": set, "$inc": bson.M{"personal_details_revision": int64(1)}})
}
func (s *MongoStore) Submit(ctx context.Context, owner string, version int64, req ReviewRequest, now time.Time) (*Details, error) {
	filter, err := ownerFilter(owner, version)
	if err != nil {
		return nil, err
	}
	current, err := s.Get(ctx, owner, version)
	if err != nil {
		return nil, err
	}
	var previous *ChangeRequest
	for i := range current.Requests {
		r := &current.Requests[i]
		if r.ID == req.RequestID {
			if r.Field == req.Field && r.ProposedValue == req.ProposedValue && r.Reason == req.Reason {
				return current, nil
			}
			return nil, ErrInput
		}
		if r.Field == req.Field {
			previous = r
		}
	}
	if previous != nil && previous.Status == "pending" {
		return nil, ErrPending
	}
	if current.Revision != *req.ExpectedRevision {
		return nil, ErrConflict
	}
	before := current.Gender
	if req.Field == "birth_date" {
		before = current.BirthDate
	}
	if before == req.ProposedValue {
		return nil, ErrInput
	}
	request := ChangeRequest{ID: req.RequestID, Field: req.Field, CurrentValue: before, ProposedValue: req.ProposedValue, Reason: req.Reason, Status: "pending", CreatedAt: now}
	path := "personal_details_requests." + req.Field
	withRevision(filter, *req.ExpectedRevision)
	filter[path+".status"] = bson.M{"$ne": "pending"}
	update := bson.M{"$set": bson.M{path: request, "updated_at": now}, "$inc": bson.M{"personal_details_revision": int64(1)}}
	if previous != nil {
		update["$push"] = bson.M{"personal_details_request_history": bson.M{"$each": bson.A{previous}, "$slice": -20}}
	}
	result, err := s.write(ctx, owner, version, filter, update)
	// A response lost after commit, or two identical retries, must not duplicate a request.
	if errors.Is(err, ErrConflict) {
		latest, readErr := s.Get(ctx, owner, version)
		if readErr != nil {
			return nil, readErr
		}
		for _, r := range latest.Requests {
			if r.ID == req.RequestID && r.Field == req.Field && r.ProposedValue == req.ProposedValue && r.Reason == req.Reason {
				return latest, nil
			}
			if r.Field == req.Field && r.Status == "pending" {
				return nil, ErrPending
			}
		}
	}
	return result, err
}
