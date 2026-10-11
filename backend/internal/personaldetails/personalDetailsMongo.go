package personaldetails

import (
	"context"
	"errors"
	"everest-backend/internal/accountstate"
	"everest-backend/internal/changename"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"go.mongodb.org/mongo-driver/v2/mongo/readconcern"
	"go.mongodb.org/mongo-driver/v2/mongo/readpref"
	"go.mongodb.org/mongo-driver/v2/mongo/writeconcern"
	"time"
)

type MongoStore struct{ users *mongo.Collection }

func NewMongoStore(db *mongo.Database) *MongoStore {
	return &MongoStore{users: db.Collection("users", options.Collection().SetReadConcern(readconcern.Majority()).SetReadPreference(readpref.Primary()).SetWriteConcern(writeconcern.Majority()))}
}

type document struct {
	ID            bson.ObjectID `bson:"_id"`
	FirstName     string        `bson:"first_name"`
	LastName      string        `bson:"last_name"`
	Contact       string        `bson:"email_or_phone"`
	EmailVerified bool          `bson:"email_verified"`
	ImageURL      string        `bson:"profile_image_url"`
	Gender        string        `bson:"gender"`
	BirthYear     int           `bson:"birth_year"`
	BirthMonth    int           `bson:"birth_month"`
	BirthDay      int           `bson:"birth_day"`
	Revision      int64         `bson:"personal_details_revision"`
	NameChangedAt *time.Time    `bson:"name_changed_at"`
}

var projection = bson.M{"_id": 1, "first_name": 1, "last_name": 1, "email_or_phone": 1, "email_verified": 1, "profile_image_url": 1, "gender": 1, "birth_year": 1, "birth_month": 1, "birth_day": 1, "personal_details_revision": 1, "name_changed_at": 1}

func details(d document) *Details {
	now := time.Now().UTC()
	out := &Details{ID: d.ID.Hex(), FirstName: d.FirstName, LastName: d.LastName, Contact: d.Contact, EmailVerified: d.EmailVerified, ImageURL: d.ImageURL, Gender: d.Gender, Revision: d.Revision, NameCanChange: true}
	if d.BirthYear >= 1900 && d.BirthMonth >= 1 && d.BirthMonth <= 12 && d.BirthDay >= 1 {
		date := time.Date(d.BirthYear, time.Month(d.BirthMonth), d.BirthDay, 0, 0, 0, 0, time.UTC)
		if date.Year() == d.BirthYear && int(date.Month()) == d.BirthMonth && date.Day() == d.BirthDay && !date.After(now) {
			out.BirthDate = date.Format("2006-01-02")
		}
	}
	if d.NameChangedAt != nil {
		next := d.NameChangedAt.Add(changename.NameChangeCooldown)
		out.NameNextChangeAt = &next
		out.NameCanChange = !now.Before(next)
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
	if (p.birth == nil || *p.birth == current.BirthDate) && (p.gender == nil || *p.gender == current.Gender) {
		return current, nil
	}
	revision := bson.M{"personal_details_revision": p.revision}
	if p.revision == 0 {
		revision = bson.M{"$or": bson.A{bson.M{"personal_details_revision": int64(0)}, bson.M{"personal_details_revision": bson.M{"$exists": false}}}}
	}
	filter["$and"] = append(filter["$and"].(bson.A), revision)
	set := bson.M{"updated_at": time.Now().UTC()}
	if p.gender != nil {
		set["gender"] = *p.gender
	}
	if p.birth != nil {
		y, m, d := 0, 0, 0
		if *p.birth != "" {
			date, _ := time.Parse("2006-01-02", *p.birth)
			y, m, d = date.Year(), int(date.Month()), date.Day()
		}
		set["birth_year"], set["birth_month"], set["birth_day"] = y, m, d
	}
	var updated document
	err = s.users.FindOneAndUpdate(ctx, filter, bson.M{"$set": set, "$inc": bson.M{"personal_details_revision": int64(1)}}, options.FindOneAndUpdate().SetReturnDocument(options.After).SetProjection(projection)).Decode(&updated)
	if errors.Is(err, mongo.ErrNoDocuments) {
		if _, readErr := s.Get(ctx, owner, version); readErr != nil {
			return nil, readErr
		}
		return nil, ErrConflict
	}
	if err != nil {
		return nil, err
	}
	return details(updated), nil
}
