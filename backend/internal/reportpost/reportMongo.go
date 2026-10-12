package reportpost

import (
	"context"
	"errors"
	"fmt"
	"sync/atomic"
	"time"

	"everest-backend/internal/accountstate"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"go.mongodb.org/mongo-driver/v2/mongo/readconcern"
	"go.mongodb.org/mongo-driver/v2/mongo/readpref"
	"go.mongodb.org/mongo-driver/v2/mongo/writeconcern"
)

type MongoStore struct {
	client                        *mongo.Client
	users, posts, reports, limits *mongo.Collection
	ready                         atomic.Bool
}

func NewMongoStore(db *mongo.Database) *MongoStore {
	opts := options.Collection().SetReadPreference(readpref.Primary()).SetReadConcern(readconcern.Majority()).SetWriteConcern(writeconcern.Majority())
	return &MongoStore{client: db.Client(), users: db.Collection("users", opts), posts: db.Collection("posts", opts),
		reports: db.Collection("post_reports", opts), limits: db.Collection("post_report_limits", opts)}
}

// Intake stays unavailable if its unique indexes cannot be installed. The rest
// of the app can still start; no successful response depends on a best-effort index.
func (s *MongoStore) CreateIndexes(ctx context.Context) error {
	_, err := s.reports.Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "reporter_id", Value: 1}, {Key: "post_id", Value: 1}}, Options: options.Index().SetName("one_report_per_user_post").SetUnique(true)},
		{Keys: bson.D{{Key: "reporter_id", Value: 1}, {Key: "request_id", Value: 1}}, Options: options.Index().SetName("owned_report_request").SetUnique(true)},
		{Keys: bson.D{{Key: "status", Value: 1}, {Key: "created_at", Value: 1}, {Key: "_id", Value: 1}}, Options: options.Index().SetName("moderation_queue")},
	})
	if err != nil {
		return err
	}
	_, err = s.limits.Indexes().CreateOne(ctx, mongo.IndexModel{Keys: bson.D{{Key: "expires_at", Value: 1}}, Options: options.Index().SetName("report_limit_expiry").SetExpireAfterSeconds(0)})
	if err == nil {
		s.ready.Store(true)
	}
	return err
}
func (s *MongoStore) requireSession(ctx context.Context, auth session) error {
	filter := accountstate.ActiveFilter(bson.M{"_id": auth.owner, "$and": bson.A{accountstate.VersionFilter(auth.version)}})
	err := s.users.FindOne(ctx, filter, options.FindOne().SetProjection(bson.M{"_id": 1})).Err()
	if errors.Is(err, mongo.ErrNoDocuments) {
		return ErrSession
	}
	return err
}
func (s *MongoStore) read(ctx context.Context, filter bson.M) (record, error) {
	var r record
	err := s.reports.FindOne(ctx, filter).Decode(&r)
	return r, err
}
func same(r record, p submission) bool {
	return r.PostID == p.postID && r.PostSource == p.PostSource && r.Reason == p.Reason && r.Details == p.Details
}
func (s *MongoStore) existing(ctx context.Context, auth session, p submission) (*Response, error) {
	r, err := s.read(ctx, bson.M{"reporter_id": auth.owner, "request_id": p.RequestID})
	if err == nil {
		if !same(r, p) {
			return nil, ErrConflict
		}
		return response(r, true), nil
	}
	if !errors.Is(err, mongo.ErrNoDocuments) {
		return nil, err
	}
	r, err = s.read(ctx, bson.M{"reporter_id": auth.owner, "post_id": p.postID})
	if err == nil {
		if r.PostSource != p.PostSource {
			return nil, ErrPost
		}
		return response(r, true), nil
	}
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, nil
	}
	return nil, err
}

type postDocument struct {
	ID        bson.ObjectID `bson:"_id"`
	AuthorID  bson.ObjectID `bson:"user_id"`
	Type      string        `bson:"type"`
	Caption   string        `bson:"caption"`
	Text      string        `bson:"text"`
	Media     []media       `bson:"media"`
	MediaURL  string        `bson:"media_url"`
	MediaType string        `bson:"media_type"`
	CreatedAt time.Time     `bson:"created_at"`
	UpdatedAt time.Time     `bson:"updated_at"`
}

func bounded(value string, limit int) string {
	r := []rune(value)
	if len(r) > limit {
		return string(r[:limit])
	}
	return value
}
func (s *MongoStore) target(ctx context.Context, auth session, p submission) (postDocument, error) {
	var post postDocument
	err := s.posts.FindOne(ctx, bson.M{"_id": p.postID, "is_deleted": bson.M{"$ne": true}}, options.FindOne().SetProjection(bson.M{
		"_id": 1, "user_id": 1, "type": 1, "caption": 1, "text": 1, "media": 1, "media_url": 1, "media_type": 1, "created_at": 1, "updated_at": 1})).Decode(&post)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return post, ErrPost
	}
	if err != nil {
		return post, err
	}
	if (post.Type == "text") != (p.PostSource == "text") || post.AuthorID.IsZero() {
		return post, ErrPost
	}
	if post.AuthorID == auth.owner {
		return post, ErrOwnPost
	}
	if err = accountstate.RequireActive(ctx, s.users, post.AuthorID); errors.Is(err, accountstate.ErrUnavailable) {
		return post, ErrPost
	}
	return post, err
}
func (s *MongoStore) takeQuota(ctx context.Context, owner bson.ObjectID, now time.Time) error {
	key := fmt.Sprintf("%s:%d", owner.Hex(), now.Unix()/3600)
	var value struct {
		Count int `bson:"count"`
	}
	err := s.limits.FindOneAndUpdate(ctx, bson.M{"_id": key}, bson.M{"$inc": bson.M{"count": 1}, "$setOnInsert": bson.M{
		"reporter_id": owner, "expires_at": now.Truncate(time.Hour).Add(2 * time.Hour)}}, options.FindOneAndUpdate().SetUpsert(true).SetReturnDocument(options.After)).Decode(&value)
	if err != nil {
		return err
	}
	if value.Count > ReportsPerHour {
		return ErrRateLimit
	}
	return nil
}
func (s *MongoStore) Submit(ctx context.Context, auth session, p submission, now time.Time) (*Response, error) {
	if !s.ready.Load() {
		return nil, ErrUnavailable
	}
	tx, err := s.client.StartSession()
	if err != nil {
		return nil, err
	}
	defer tx.EndSession(context.Background())
	var out *Response
	_, err = tx.WithTransaction(ctx, func(ctx context.Context) (any, error) {
		if err := s.requireSession(ctx, auth); err != nil {
			return nil, err
		}
		prior, err := s.existing(ctx, auth, p)
		if err != nil {
			return nil, err
		}
		if prior != nil {
			out = prior
			return nil, nil
		}
		post, err := s.target(ctx, auth, p)
		if err != nil {
			return nil, err
		}
		if err = s.takeQuota(ctx, auth.owner, now); err != nil {
			return nil, err
		}
		content := post.Caption
		if post.Type == "text" && post.Text != "" {
			content = post.Text
		}
		evidence := append([]media(nil), post.Media...)
		if len(evidence) == 0 && post.MediaURL != "" {
			evidence = []media{{URL: post.MediaURL, Type: post.MediaType}}
		}
		if len(evidence) > 10 {
			evidence = evidence[:10]
		}
		for i := range evidence {
			evidence[i].URL = bounded(evidence[i].URL, 4096)
			evidence[i].Type = bounded(evidence[i].Type, 40)
		}
		r := record{ID: bson.NewObjectID(), ReporterID: auth.owner, AuthorID: post.AuthorID, PostID: p.postID, PostSource: p.PostSource,
			RequestID: p.RequestID, Reason: p.Reason, Details: p.Details, Status: "pending", CreatedAt: now, UpdatedAt: now,
			Snapshot: snapshot{Type: post.Type, Text: bounded(content, 2000), Media: evidence, CreatedAt: post.CreatedAt, UpdatedAt: post.UpdatedAt}}
		if _, err = s.reports.InsertOne(ctx, r); err != nil {
			return nil, err
		}
		out = response(r, false)
		return nil, nil
	}, options.Transaction().SetReadConcern(readconcern.Snapshot()).SetWriteConcern(writeconcern.Majority()).SetReadPreference(readpref.Primary()))
	// Two concurrent requests can race on either unique key. The aborted
	// transaction also rolls back its quota; return only an owned durable receipt.
	if mongo.IsDuplicateKeyError(err) {
		if authErr := s.requireSession(ctx, auth); authErr != nil {
			return nil, authErr
		}
		prior, readErr := s.existing(ctx, auth, p)
		if readErr != nil {
			return nil, readErr
		}
		if prior != nil {
			return prior, nil
		}
	}
	if err != nil {
		return nil, err
	}
	if out == nil {
		return nil, ErrUnavailable
	}
	return out, nil
}
func (s *MongoStore) Receipt(ctx context.Context, auth session, requestID string) (*Response, error) {
	if !s.ready.Load() {
		return nil, ErrUnavailable
	}
	if err := s.requireSession(ctx, auth); err != nil {
		return nil, err
	}
	r, err := s.read(ctx, bson.M{"reporter_id": auth.owner, "request_id": requestID})
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, ErrReceiptNotFound
	}
	if err != nil {
		return nil, err
	}
	return response(r, true), nil
}
