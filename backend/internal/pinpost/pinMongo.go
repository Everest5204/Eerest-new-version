package pinpost

import (
	"context"
	"errors"
	"everest-backend/internal/accountstate"
	"everest-backend/internal/post"
	"everest-backend/internal/textpost"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"go.mongodb.org/mongo-driver/v2/mongo/readconcern"
	"go.mongodb.org/mongo-driver/v2/mongo/readpref"
	"go.mongodb.org/mongo-driver/v2/mongo/writeconcern"
	"sync/atomic"
	"time"
)

type MongoStore struct {
	client                         *mongo.Client
	users, posts, pins, operations *mongo.Collection
	ready                          atomic.Bool
}

func NewMongoStore(db *mongo.Database) *MongoStore {
	o := options.Collection().SetReadPreference(readpref.Primary()).SetReadConcern(readconcern.Majority()).SetWriteConcern(writeconcern.Majority())
	return &MongoStore{client: db.Client(), users: db.Collection("users", o), posts: db.Collection("posts", o), pins: db.Collection("profile_post_pins", o), operations: db.Collection("post_pin_operations", o)}
}
func (s *MongoStore) CreateIndexes(ctx context.Context) error {
	// _id is the unique owner key for pins and owner/request key for receipts.
	// Receipts last 30 days. The persistent monotonically increasing pin revision
	// also rejects old retries after their receipt expires; there is no ABA reset.
	_, err := s.operations.Indexes().CreateOne(ctx, mongo.IndexModel{Keys: bson.D{{Key: "receipt.owner_id", Value: 1}, {Key: "created_at", Value: -1}}, Options: options.Index().SetName("owned_pin_operations")})
	if err == nil {
		_, err = s.operations.Indexes().CreateOne(ctx, mongo.IndexModel{Keys: bson.D{{Key: "created_at", Value: 1}}, Options: options.Index().SetName("pin_receipt_retention").SetExpireAfterSeconds(30 * 24 * 60 * 60)})
	}
	if err == nil {
		s.ready.Store(true)
	}
	return err
}
func (s *MongoStore) requireSession(ctx context.Context, a auth) error {
	err := s.users.FindOne(ctx, accountstate.ActiveFilter(bson.M{"_id": a.owner, "$and": bson.A{accountstate.VersionFilter(a.version)}}), options.FindOne().SetProjection(bson.M{"_id": 1})).Err()
	if errors.Is(err, mongo.ErrNoDocuments) {
		return ErrSession
	}
	return err
}
func (s *MongoStore) pin(ctx context.Context, id bson.ObjectID) (record, error) {
	value := record{Owner: id}
	err := s.pins.FindOne(ctx, bson.M{"_id": id}).Decode(&value)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return record{Owner: id}, nil
	}
	return value, err
}
func (s *MongoStore) target(ctx context.Context, owner, id bson.ObjectID, source string) (bson.Raw, error) {
	var raw bson.Raw
	err := s.posts.FindOne(ctx, bson.M{"_id": id, "is_deleted": bson.M{"$ne": true}, "is_hidden": bson.M{"$ne": true}, "hidden": bson.M{"$ne": true}}).Decode(&raw)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, ErrPost
	}
	if err != nil {
		return nil, err
	}
	if stored, ok := raw.Lookup("user_id").ObjectIDOK(); !ok || stored != owner {
		return nil, ErrOwner
	}
	kind, _ := raw.Lookup("type").StringValueOK()
	if (source == "text" && kind != "text") || (source == "media" && kind != "image" && kind != "video" && kind != "profile_photo_update" && kind != "cover_photo_update") {
		return nil, ErrPost
	}
	return raw, nil
}
func (s *MongoStore) Read(ctx context.Context, a auth, id bson.ObjectID) (*Snapshot, error) {
	if !s.ready.Load() {
		return nil, ErrUnavailable
	}
	if err := s.requireSession(ctx, a); err != nil {
		return nil, err
	}
	var user post.PostUser
	err := s.users.FindOne(ctx, accountstate.ActiveFilter(bson.M{"_id": id}), options.FindOne().SetProjection(bson.M{"_id": 1, "first_name": 1, "last_name": 1, "profile_image_url": 1})).Decode(&user)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, ErrProfile
	}
	if err != nil {
		return nil, err
	}
	value, err := s.pin(ctx, id)
	if err != nil {
		return nil, err
	}
	result := &Snapshot{OwnerID: id.Hex(), Revision: value.Revision, PostSource: ""}
	if value.Post.IsZero() {
		return result, nil
	}
	raw, err := s.target(ctx, id, value.Post, value.Source)
	if errors.Is(err, ErrPost) || errors.Is(err, ErrOwner) {
		return result, nil
	}
	if err != nil {
		return nil, err
	}
	result.PostSource = value.Source
	result.PinnedAt = &value.PinnedAt
	if value.Source == "text" {
		var row textpost.TextFeedPost
		if err = bson.Unmarshal(raw, &row); err != nil {
			return nil, err
		}
		row.User = textpost.TextPostUser{ID: user.ID, FirstName: user.FirstName, LastName: user.LastName, ProfileImageURL: user.ProfileImageURL}
		row.IsSelf = id == a.owner
		result.Post = row
	} else {
		var row post.FeedPost
		if err = bson.Unmarshal(raw, &row); err != nil {
			return nil, err
		}
		row.User = user
		row.IsSelf = id == a.owner
		result.Post = row
	}
	return result, nil
}
func operationKey(a auth, id string) string { return a.owner.Hex() + ":" + id }
func matches(receipt Receipt, req Request) bool {
	return receipt.PostID == req.PostID && receipt.PostSource == req.PostSource && receipt.Pinned == *req.Pinned && receipt.ExpectedRevision == *req.ExpectedRevision
}
func (s *MongoStore) Update(ctx context.Context, a auth, req Request, now time.Time) (*Response, error) {
	if !s.ready.Load() {
		return nil, ErrUnavailable
	}
	tx, err := s.client.StartSession()
	if err != nil {
		return nil, err
	}
	defer tx.EndSession(context.Background())
	var receipt Receipt
	_, err = tx.WithTransaction(ctx, func(ctx context.Context) (any, error) {
		if err := s.requireSession(ctx, a); err != nil {
			return nil, err
		}
		var previous operation
		err := s.operations.FindOne(ctx, bson.M{"_id": operationKey(a, req.RequestID)}).Decode(&previous)
		if err == nil {
			if !matches(previous.Receipt, req) {
				return nil, ErrConflict
			}
			receipt = previous.Receipt
			return nil, nil
		}
		if !errors.Is(err, mongo.ErrNoDocuments) {
			return nil, err
		}
		current, err := s.pin(ctx, a.owner)
		if err != nil {
			return nil, err
		}
		if current.Revision != *req.ExpectedRevision {
			return nil, ErrConflict
		}
		id, _ := objectID(req.PostID)
		window, changes := now.Truncate(time.Minute), 1
		if current.Window.Equal(window) {
			changes = current.Changes + 1
		}
		if changes > 30 {
			return nil, ErrRateLimit
		}
		next := record{Owner: a.owner, Revision: current.Revision + 1, Window: window, Changes: changes}
		if *req.Pinned {
			if _, err = s.target(ctx, a.owner, id, req.PostSource); err != nil {
				return nil, err
			}
			next.Post = id
			next.Source = req.PostSource
			next.PinnedAt = now
		} else {
			if current.Post.IsZero() {
				if _, err = s.target(ctx, a.owner, id, req.PostSource); err != nil {
					return nil, err
				}
			} else if current.Post != id || current.Source != req.PostSource {
				return nil, ErrConflict
			}
		}
		opts := options.Replace().SetUpsert(current.Revision == 0)
		changed, err := s.pins.ReplaceOne(ctx, bson.M{"_id": a.owner, "revision": current.Revision}, next, opts)
		if err != nil {
			return nil, err
		}
		if changed.MatchedCount == 0 && changed.UpsertedCount == 0 {
			return nil, ErrConflict
		}
		receipt = Receipt{OwnerID: a.owner.Hex(), RequestID: req.RequestID, PostID: req.PostID, PostSource: req.PostSource, Pinned: *req.Pinned, ExpectedRevision: current.Revision, ResultRevision: next.Revision}
		_, err = s.operations.InsertOne(ctx, operation{ID: operationKey(a, req.RequestID), Receipt: receipt, CreatedAt: now})
		return nil, err
	}, options.Transaction().SetReadConcern(readconcern.Snapshot()).SetWriteConcern(writeconcern.Majority()))
	if mongo.IsDuplicateKeyError(err) {
		if read, found := s.Receipt(ctx, a, req.RequestID); found == nil && matches(read.Receipt, req) {
			return read, nil
		}
		return nil, ErrConflict
	}
	if err != nil {
		return nil, err
	}
	snapshot, err := s.Read(ctx, a, a.owner)
	if err != nil {
		return nil, err
	}
	return &Response{Receipt: receipt, Current: snapshot}, nil
}
func (s *MongoStore) Receipt(ctx context.Context, a auth, id string) (*Response, error) {
	if !s.ready.Load() {
		return nil, ErrUnavailable
	}
	if err := s.requireSession(ctx, a); err != nil {
		return nil, err
	}
	var value operation
	err := s.operations.FindOne(ctx, bson.M{"_id": operationKey(a, id)}).Decode(&value)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, ErrReceipt
	}
	if err != nil {
		return nil, err
	}
	snapshot, err := s.Read(ctx, a, a.owner)
	if err != nil {
		return nil, err
	}
	return &Response{Receipt: value.Receipt, Current: snapshot}, nil
}
