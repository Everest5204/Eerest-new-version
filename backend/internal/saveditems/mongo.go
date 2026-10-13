package saveditems

import (
	"context"
	"errors"
	"everest-backend/internal/accountstate"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"go.mongodb.org/mongo-driver/v2/mongo/readconcern"
	"go.mongodb.org/mongo-driver/v2/mongo/readpref"
	"go.mongodb.org/mongo-driver/v2/mongo/writeconcern"
	"regexp"
	"strings"
	"time"
)

const collectionName = "saved_posts"

type MongoStore struct {
	db                    *mongo.Database
	users, posts, records *mongo.Collection
}

func NewMongoStore(db *mongo.Database) *MongoStore {
	o := options.Collection().SetReadPreference(readpref.Primary()).SetReadConcern(readconcern.Majority()).SetWriteConcern(writeconcern.Majority())
	return &MongoStore{db, db.Collection("users", o), db.Collection("posts", o), db.Collection(collectionName, o)}
}
func (s *MongoStore) EnsureIndexes(ctx context.Context) error {
	_, e := s.records.Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "user_id", Value: 1}, {Key: "post_id", Value: 1}}, Options: options.Index().SetName("saved_user_post_unique_v1").SetUnique(true)},
		{Keys: bson.D{{Key: "user_id", Value: 1}, {Key: "saved", Value: 1}, {Key: "saved_at", Value: -1}, {Key: "_id", Value: -1}}, Options: options.Index().SetName("saved_recent_v1")},
		{Keys: bson.D{{Key: "user_id", Value: 1}, {Key: "saved", Value: 1}, {Key: "kind", Value: 1}, {Key: "saved_at", Value: -1}, {Key: "_id", Value: -1}}, Options: options.Index().SetName("saved_kind_recent_v1")},
	})
	return e
}
func sessionFilter(a Auth) bson.M {
	return accountstate.ActiveFilter(bson.M{"_id": a.Owner, "$and": bson.A{accountstate.VersionFilter(a.Version)}})
}
func (s *MongoStore) CheckSession(ctx context.Context, a Auth) error {
	e := s.users.FindOne(ctx, sessionFilter(a), options.FindOne().SetProjection(bson.M{"_id": 1})).Err()
	if errors.Is(e, mongo.ErrNoDocuments) {
		return ErrSession
	}
	return e
}
func (s *MongoStore) Read(ctx context.Context, a Auth, id bson.ObjectID) (Record, error) {
	r := Record{Owner: a.Owner, PostID: id}
	e := s.records.FindOne(ctx, bson.M{"user_id": a.Owner, "post_id": id}).Decode(&r)
	if errors.Is(e, mongo.ErrNoDocuments) {
		return Record{Owner: a.Owner, PostID: id}, nil
	}
	return r, e
}
func visible(f bson.M) bson.M {
	f["is_deleted"] = bson.M{"$ne": true}
	f["is_hidden"] = bson.M{"$ne": true}
	f["hidden"] = bson.M{"$ne": true}
	return f
}
func (s *MongoStore) kind(ctx context.Context, id bson.ObjectID) (string, error) {
	var p struct {
		UserID bson.ObjectID `bson:"user_id"`
		Type   string        `bson:"type"`
	}
	e := s.posts.FindOne(ctx, visible(bson.M{"_id": id}), options.FindOne().SetProjection(bson.M{"user_id": 1, "type": 1})).Decode(&p)
	if errors.Is(e, mongo.ErrNoDocuments) {
		return "", ErrPost
	}
	if e != nil {
		return "", e
	}
	kind := contentKind(p.Type)
	if kind == "" {
		return "", ErrPost
	}
	e = accountstate.RequireActive(ctx, s.users, p.UserID)
	if errors.Is(e, accountstate.ErrUnavailable) {
		return "", ErrPost
	}
	return kind, e
}
func (s *MongoStore) Update(ctx context.Context, a Auth, id bson.ObjectID, req Request, now time.Time) (Record, error) {
	tx, e := s.db.Client().StartSession()
	if e != nil {
		return Record{}, e
	}
	defer tx.EndSession(context.Background())
	var result Record
	_, e = tx.WithTransaction(ctx, func(ctx context.Context) (any, error) {
		if e := s.CheckSession(ctx, a); e != nil {
			return nil, e
		}
		current, e := s.Read(ctx, a, id)
		if e != nil {
			return nil, e
		}
		if current.LastRequest == req.RequestID {
			if current.LastExpected != *req.ExpectedRevision || current.LastDesired != *req.Saved {
				return nil, ErrConflict
			}
			result = current
			return nil, nil
		}
		if current.Revision != *req.ExpectedRevision {
			return nil, ErrConflict
		}
		if current.ID.IsZero() && !*req.Saved {
			result = current
			return nil, nil
		}
		kind := current.Kind
		if *req.Saved {
			kind, e = s.kind(ctx, id)
			if e != nil {
				return nil, e
			}
		}
		// A write to the same account document fences deactivation, revocation
		// and deletion. A concurrent account change aborts/retries this transaction.
		fence, e := s.users.UpdateOne(ctx, sessionFilter(a), bson.M{"$inc": bson.M{"saved_items_revision": int64(1)}})
		if e != nil {
			return nil, e
		}
		if fence.MatchedCount != 1 {
			return nil, ErrSession
		}
		at := current.SavedAt
		if *req.Saved && !current.Saved {
			at = now
		}
		f := bson.M{"user_id": a.Owner, "post_id": id, "revision": *req.ExpectedRevision}
		u := bson.M{"$set": bson.M{"saved": *req.Saved, "kind": kind, "saved_at": at, "updated_at": now, "last_request": req.RequestID, "last_expected": *req.ExpectedRevision, "last_desired": *req.Saved}, "$setOnInsert": bson.M{"created_at": now}, "$inc": bson.M{"revision": int64(1)}}
		e = s.records.FindOneAndUpdate(ctx, f, u, options.FindOneAndUpdate().SetUpsert(current.ID.IsZero()).SetReturnDocument(options.After)).Decode(&result)
		if errors.Is(e, mongo.ErrNoDocuments) || mongo.IsDuplicateKeyError(e) {
			return nil, ErrConflict
		}
		return nil, e
	}, options.Transaction().SetReadConcern(readconcern.Snapshot()).SetWriteConcern(writeconcern.Majority()))
	return result, e
}

func listFilter(a Auth, q Query, p Position) bson.M {
	f := bson.M{"user_id": a.Owner, "saved": true, "saved_at": bson.M{"$lte": p.AsOf}}
	if q.Kind != "all" {
		f["kind"] = q.Kind
	}
	if q.Cursor != "" {
		id, _ := objectID(p.ID)
		f["$or"] = bson.A{bson.M{"saved_at": bson.M{"$lt": p.At}}, bson.M{"saved_at": p.At, "_id": bson.M{"$lt": id}}}
	}
	return f
}
func previewLookups() mongo.Pipeline {
	return mongo.Pipeline{
		bson.D{{Key: "$lookup", Value: bson.M{"from": "posts", "localField": "post_id", "foreignField": "_id", "as": "post", "pipeline": mongo.Pipeline{
			bson.D{{Key: "$match", Value: visible(bson.M{})}},
			bson.D{{Key: "$project", Value: bson.M{"_id": 1, "user_id": 1, "type": 1, "caption": 1, "text": 1, "media": bson.M{"$slice": bson.A{bson.M{"$ifNull": bson.A{"$media", bson.A{}}}, 1}}, "media_url": 1, "media_type": 1}}},
		}}}},
		bson.D{{Key: "$lookup", Value: bson.M{"from": "users", "localField": "post.user_id", "foreignField": "_id", "as": "author", "pipeline": mongo.Pipeline{
			bson.D{{Key: "$match", Value: accountstate.ActiveFilter(bson.M{})}},
			bson.D{{Key: "$project", Value: bson.M{"_id": 1, "first_name": 1, "last_name": 1, "profile_image_url": 1}}},
		}}}},
	}
}
func listPipeline(a Auth, q Query, p Position) mongo.Pipeline {
	pipeline := mongo.Pipeline{bson.D{{Key: "$match", Value: listFilter(a, q, p)}}, bson.D{{Key: "$sort", Value: bson.D{{Key: "saved_at", Value: -1}, {Key: "_id", Value: -1}}}}}
	limit := bson.D{{Key: "$limit", Value: int64(q.Limit + 1)}}
	// Normal browsing limits before lookups. Search matches live post/author
	// data before limiting, so it searches the entire owned saved set.
	if q.Search == "" {
		pipeline = append(pipeline, limit)
	}
	pipeline = append(pipeline, previewLookups()...)
	if q.Search != "" {
		terms := bson.A{bson.M{"post.0": bson.M{"$exists": true}}, bson.M{"author.0": bson.M{"$exists": true}}}
		for _, word := range strings.Fields(q.Search) {
			rx := bson.Regex{Pattern: regexp.QuoteMeta(word), Options: "i"}
			terms = append(terms, bson.M{"$or": bson.A{bson.M{"post.text": rx}, bson.M{"post.caption": rx}, bson.M{"author.first_name": rx}, bson.M{"author.last_name": rx}}})
		}
		pipeline = append(pipeline, bson.D{{Key: "$match", Value: bson.M{"$and": terms}}}, limit)
	}
	pipeline = append(pipeline, bson.D{{Key: "$project", Value: bson.M{"_id": 1, "user_id": 1, "post_id": 1, "saved": 1, "kind": 1, "saved_at": 1, "revision": 1, "post": 1, "author": 1}}})
	return pipeline
}
func (s *MongoStore) List(ctx context.Context, a Auth, q Query, p Position) ([]joined, error) {
	cur, e := s.records.Aggregate(ctx, listPipeline(a, q, p))
	if e != nil {
		return nil, e
	}
	defer cur.Close(ctx)
	var rows []joined
	e = cur.All(ctx, &rows)
	return rows, e
}
func (s *MongoStore) Target(ctx context.Context, a Auth, id bson.ObjectID) (*Post, error) {
	r, e := s.Read(ctx, a, id)
	if e != nil {
		return nil, e
	}
	if !r.Saved {
		return nil, ErrPost
	}
	if _, e = s.kind(ctx, id); e != nil {
		return nil, e
	}
	var p Post
	e = s.posts.FindOne(ctx, visible(bson.M{"_id": id})).Decode(&p)
	if errors.Is(e, mongo.ErrNoDocuments) {
		return nil, ErrPost
	}
	if e != nil {
		return nil, e
	}
	e = s.users.FindOne(ctx, accountstate.ActiveFilter(bson.M{"_id": p.UserID}), options.FindOne().SetProjection(bson.M{"_id": 1, "first_name": 1, "last_name": 1, "profile_image_url": 1})).Decode(&p.User)
	if errors.Is(e, mongo.ErrNoDocuments) {
		return nil, ErrPost
	}
	if e != nil {
		return nil, e
	}
	p.IsSelf = p.UserID == a.Owner
	if !p.IsSelf {
		e = s.db.Collection("user_follows").FindOne(ctx, bson.M{"follower_id": a.Owner, "following_id": p.UserID}, options.FindOne().SetProjection(bson.M{"_id": 1})).Err()
		if e != nil && !errors.Is(e, mongo.ErrNoDocuments) {
			return nil, e
		}
		p.Following = e == nil
	}
	return &p, nil
}

func (s *MongoStore) OwnerRevision(ctx context.Context, a Auth) (int64, error) {
	var row struct {
		Revision int64 `bson:"saved_items_revision"`
	}
	e := s.users.FindOne(ctx, sessionFilter(a), options.FindOne().SetProjection(bson.M{"saved_items_revision": 1})).Decode(&row)
	if errors.Is(e, mongo.ErrNoDocuments) {
		return 0, ErrSession
	}
	return row.Revision, e
}
func (s *MongoStore) Resolve(ctx context.Context, a Auth, ids []bson.ObjectID) ([]joined, error) {
	pipeline := mongo.Pipeline{bson.D{{Key: "$match", Value: bson.M{"user_id": a.Owner, "saved": true, "post_id": bson.M{"$in": ids}}}}, bson.D{{Key: "$sort", Value: bson.D{{Key: "saved_at", Value: -1}, {Key: "_id", Value: -1}}}}, bson.D{{Key: "$limit", Value: int64(20)}}}
	pipeline = append(pipeline, previewLookups()...)
	cur, e := s.records.Aggregate(ctx, pipeline)
	if e != nil {
		return nil, e
	}
	defer cur.Close(ctx)
	var rows []joined
	e = cur.All(ctx, &rows)
	return rows, e
}
