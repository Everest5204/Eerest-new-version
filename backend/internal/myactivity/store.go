package myactivity

import (
	"context"
	"errors"
	"everest-backend/internal/accountstate"
	"fmt"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"sort"
	"strings"
	"sync"
	"time"
)

type Service struct {
	db    *mongo.Database
	codec cursorCodec
	now   func() time.Time
}

func NewService(db *mongo.Database, secret string) *Service {
	return &Service{db, newCodec(secret), time.Now}
}

// Reuse an identical existing index regardless of its name, avoiding conflicts.
func (s *Service) EnsureIndexes(ctx context.Context) error {
	for _, src := range sources {
		keys := bson.D{{Key: src.owner, Value: 1}, {Key: "created_at", Value: -1}, {Key: "_id", Value: -1}}
		cur, err := s.db.Collection(src.collection).Indexes().List(ctx)
		if err != nil {
			var command mongo.CommandError
			if !errors.As(err, &command) || command.Code != 26 {
				return err
			}
			_, err = s.db.Collection(src.collection).Indexes().CreateOne(ctx, mongo.IndexModel{Keys: keys, Options: options.Index().SetName("my_activity_" + src.kind + "_v1")})
			if err != nil {
				return err
			}
			continue
		}
		exists := false
		for cur.Next(ctx) {
			var row struct {
				Key     bson.D `bson:"key"`
				Sparse  bool   `bson:"sparse"`
				Partial bson.M `bson:"partialFilterExpression"`
			}
			if err = cur.Decode(&row); err != nil {
				cur.Close(ctx)
				return err
			}
			if fmt.Sprint(row.Key) == fmt.Sprint(keys) && !row.Sparse && len(row.Partial) == 0 {
				exists = true
			}
		}
		err = cur.Err()
		cur.Close(ctx)
		if err != nil {
			return err
		}
		if exists {
			continue
		}
		_, err = s.db.Collection(src.collection).Indexes().CreateOne(ctx, mongo.IndexModel{Keys: keys, Options: options.Index().SetName("my_activity_" + src.kind + "_v1")})
		if err != nil {
			return err
		}
	}
	return nil
}
func filter(owner bson.ObjectID, src source, q Query, p position, after bool) bson.M {
	f := bson.M{src.owner: owner}
	if src.live {
		f["is_deleted"] = bson.M{"$ne": true}
	}
	r := bson.M{"$lte": p.AsOf}
	if !q.From.IsZero() {
		r["$gte"] = q.From
	}
	if !q.Before.IsZero() {
		r["$lt"] = q.Before
	}
	f["created_at"] = r
	if after {
		parts := bson.A{bson.M{"created_at": bson.M{"$lt": p.At}}}
		if src.kind > p.Kind {
			parts = append(parts, bson.M{"created_at": p.At})
		}
		if src.kind == p.Kind {
			id, _ := bson.ObjectIDFromHex(p.ID)
			parts = append(parts, bson.M{"created_at": p.At, "_id": bson.M{"$lt": id}})
		}
		f["$or"] = parts
	}
	return f
}
func less(a, b record) bool {
	if !a.Created.Equal(b.Created) {
		return a.Created.After(b.Created)
	}
	if a.Kind != b.Kind {
		return a.Kind < b.Kind
	}
	return a.ID.Hex() > b.ID.Hex()
}

func (s *Service) List(ctx context.Context, owner bson.ObjectID, q Query) (Page, error) {
	page := Page{Owner: owner.Hex(), Items: []Item{}, Counts: map[string]int64{"posts": 0, "reactions": 0, "comments": 0, "connections": 0}}
	if q.Cursor != "" {
		page.Counts = nil
	}
	if owner.IsZero() || validate(q) != nil {
		return page, ErrInput
	}
	now := s.now().UTC().Truncate(time.Millisecond)
	p := position{Version: 1, Owner: owner.Hex(), Category: q.Category, From: q.From, Before: q.Before, AsOf: now}
	var err error
	if q.Cursor != "" {
		p, err = s.codec.decode(q.Cursor, owner, q, now)
		if err != nil {
			return page, err
		}
	}
	var rows []record
	var mu sync.Mutex
	var wg sync.WaitGroup
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	for _, src := range sources {
		wg.Add(1)
		go func(src source) {
			defer wg.Done()
			var batch []record
			var count int64
			var e error
			// Count once on a refreshed head, not again for every older page.
			// Counts refer to the chosen date range across all categories.
			if q.Cursor == "" {
				count, e = s.db.Collection(src.collection).CountDocuments(ctx, filter(owner, src, q, p, false))
			}
			if e == nil && (q.Category == "all" || q.Category == src.category) {
				cur, x := s.db.Collection(src.collection).Find(ctx, filter(owner, src, q, p, q.Cursor != ""), options.Find().SetSort(bson.D{{Key: "created_at", Value: -1}, {Key: "_id", Value: -1}}).SetLimit(int64(q.Limit+1)).SetProjection(bson.M{"_id": 1, "user_id": 1, "post_id": 1, "comment_id": 1, "parent_id": 1, "following_id": 1, "created_at": 1, "text": 1, "reaction_type": 1}))
				if x != nil {
					e = x
				} else {
					e = cur.All(ctx, &batch)
					cur.Close(ctx)
					for i := range batch {
						batch[i].Kind = src.kind
					}
				}
			}
			mu.Lock()
			defer mu.Unlock()
			if e != nil {
				if err == nil {
					err = e
					cancel()
				}
				return
			}
			if q.Cursor == "" {
				page.Counts[src.category] += count
			}
			rows = append(rows, batch...)
		}(src)
	}
	wg.Wait()
	if err != nil {
		return page, err
	}
	sort.Slice(rows, func(i, j int) bool { return less(rows[i], rows[j]) })
	page.HasMore = len(rows) > q.Limit
	if page.HasMore {
		rows = rows[:q.Limit]
		last := rows[len(rows)-1]
		p.At = last.Created
		p.Kind = last.Kind
		p.ID = last.ID.Hex()
		page.NextCursor = s.codec.encode(p)
	}
	page.Items, err = s.previews(ctx, owner, rows)
	return page, err
}

func loadMap[T any](ctx context.Context, col *mongo.Collection, ids []bson.ObjectID, filterFn func(bson.M) bson.M, getID func(T) bson.ObjectID) (map[bson.ObjectID]T, error) {
	result := map[bson.ObjectID]T{}
	if len(ids) == 0 {
		return result, nil
	}
	f := bson.M{"_id": bson.M{"$in": ids}}
	if filterFn != nil {
		f = filterFn(f)
	}
	cur, err := col.Find(ctx, f)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)
	var rows []T
	if err = cur.All(ctx, &rows); err != nil {
		return nil, err
	}
	for _, v := range rows {
		result[getID(v)] = v
	}
	return result, nil
}
func live(f bson.M) bson.M { f["is_deleted"] = bson.M{"$ne": true}; return f }
func clip(v string, n int) string {
	r := []rune(strings.TrimSpace(v))
	if len(r) > n {
		return string(r[:n]) + "…"
	}
	return string(r)
}
func previewText(p post) string {
	if p.Text != "" {
		return clip(p.Text, 180)
	}
	return clip(p.Caption, 180)
}
func photo(p post) string {
	for _, m := range p.Media {
		if m.Type == "image" && strings.HasPrefix(m.URL, "https://") {
			return m.URL
		}
	}
	if p.MediaType == "image" && strings.HasPrefix(p.MediaURL, "https://") {
		return p.MediaURL
	}
	return ""
}
func (s *Service) previews(ctx context.Context, owner bson.ObjectID, rows []record) ([]Item, error) {
	commentIDs := []bson.ObjectID{}
	postIDs := []bson.ObjectID{}
	userIDs := []bson.ObjectID{}
	for _, r := range rows {
		switch r.Kind {
		case "post":
			postIDs = append(postIDs, r.ID)
		case "comment_love":
			commentIDs = append(commentIDs, r.CommentID)
		case "follow":
			userIDs = append(userIDs, r.FollowingID)
		default:
			postIDs = append(postIDs, r.PostID)
		}
	}
	comments, err := loadMap[record](ctx, s.db.Collection("comments"), commentIDs, live, func(v record) bson.ObjectID { return v.ID })
	if err != nil {
		return nil, err
	}
	for _, c := range comments {
		postIDs = append(postIDs, c.PostID)
		userIDs = append(userIDs, c.UserID)
	}
	posts, err := loadMap[post](ctx, s.db.Collection("posts"), postIDs, live, func(v post) bson.ObjectID { return v.ID })
	if err != nil {
		return nil, err
	}
	for _, p := range posts {
		userIDs = append(userIDs, p.UserID)
	}
	users, err := loadMap[actor](ctx, s.db.Collection("users"), userIDs, accountstate.ActiveFilter, func(v actor) bson.ObjectID { return v.ID })
	if err != nil {
		return nil, err
	}
	items := make([]Item, 0, len(rows))
	for _, r := range rows {
		src, _ := sourceFor(r.Kind)
		item := Item{ID: r.ID.Hex(), Kind: r.Kind, Category: src.category, At: r.Created, Action: "none"}
		var pid bson.ObjectID
		switch r.Kind {
		case "post":
			pid = r.ID
			item.Title = "Shared a post"
			item.Action = "delete_post"
		case "reaction":
			pid = r.PostID
			item.Title = "Reacted " + r.Reaction + " to a post"
			item.Action = "remove_reaction"
		case "comment":
			pid = r.PostID
			item.Title = "Commented on a post"
			if !r.ParentID.IsZero() {
				item.Title = "Replied to a comment"
			}
			item.Text = clip(r.Text, 180)
			item.Action = "delete_comment"
		case "comment_love":
			c, ok := comments[r.CommentID]
			_, active := users[c.UserID]
			if ok && active {
				pid = c.PostID
				item.Text = clip(c.Text, 180)
			}
			item.Title = "Liked a comment"
		case "follow":
			u, ok := users[r.FollowingID]
			item.Title = "Followed an account"
			if ok {
				item.Author = &u
				item.Available = true
			}
		}
		if r.Kind != "follow" {
			p, ok := posts[pid]
			u, active := users[p.UserID]
			item.Available = ok && active
			if item.Available {
				item.PostID = pid.Hex()
				item.Author = &u
				item.Thumbnail = photo(p)
				if item.Text == "" {
					item.Text = previewText(p)
				}
				if r.Kind == "post" && p.Type == "video" {
					item.Title = "Shared a video"
				}
			} else {
				item.Text = "This content is no longer available."
				item.Thumbnail = ""
				item.Author = nil
			}
		}
		// Own comments can still be removed when the original post disappears.
		if !item.Available && r.Kind != "comment" {
			item.Action = "none"
		}
		items = append(items, item)
	}
	return items, nil
}

func (s *Service) Target(ctx context.Context, owner bson.ObjectID, kind string, id bson.ObjectID) (Target, error) {
	t := Target{Owner: owner.Hex(), Kind: kind, ID: id.Hex()}
	src, ok := sourceFor(kind)
	if !ok || owner.IsZero() || id.IsZero() {
		return t, ErrInput
	}
	f := bson.M{"_id": id, src.owner: owner}
	if src.live {
		f = live(f)
	}
	var r record
	if err := s.db.Collection(src.collection).FindOne(ctx, f).Decode(&r); err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return t, ErrUnavailable
		}
		return t, err
	}
	if kind == "follow" {
		var u actor
		if err := s.db.Collection("users").FindOne(ctx, accountstate.ActiveFilter(bson.M{"_id": r.FollowingID})).Decode(&u); err != nil {
			if errors.Is(err, mongo.ErrNoDocuments) {
				return t, ErrUnavailable
			}
			return t, err
		}
		t.Profile = &u
		return t, nil
	}
	pid := r.PostID
	if kind == "post" {
		pid = id
	}
	if kind == "comment" {
		t.CommentID = id.Hex()
	}
	if kind == "comment_love" {
		var c record
		if err := s.db.Collection("comments").FindOne(ctx, live(bson.M{"_id": r.CommentID})).Decode(&c); err != nil {
			if errors.Is(err, mongo.ErrNoDocuments) {
				return t, ErrUnavailable
			}
			return t, err
		}
		if err := accountstate.RequireActive(ctx, s.db.Collection("users"), c.UserID); err != nil {
			if errors.Is(err, accountstate.ErrUnavailable) {
				return t, ErrUnavailable
			}
			return t, err
		}
		pid = c.PostID
		t.CommentID = c.ID.Hex()
	}
	if err := accountstate.RequireVisiblePost(ctx, s.db.Collection("posts"), s.db.Collection("users"), pid); err != nil {
		if errors.Is(err, accountstate.ErrUnavailable) {
			return t, ErrUnavailable
		}
		return t, err
	}
	var p post
	if err := s.db.Collection("posts").FindOne(ctx, live(bson.M{"_id": pid})).Decode(&p); err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return t, ErrUnavailable
		}
		return t, err
	}
	if err := s.db.Collection("users").FindOne(ctx, accountstate.ActiveFilter(bson.M{"_id": p.UserID})).Decode(&p.User); err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return t, ErrUnavailable
		}
		return t, err
	}
	p.IsSelf = p.UserID == owner
	if !p.IsSelf {
		e := s.db.Collection("user_follows").FindOne(ctx, bson.M{"follower_id": owner, "following_id": p.UserID}, options.FindOne().SetProjection(bson.M{"_id": 1})).Err()
		if e != nil && !errors.Is(e, mongo.ErrNoDocuments) {
			return t, e
		}
		p.Following = e == nil
	}
	t.Post = &p
	return t, nil
}

func (s *Service) checkSession(ctx context.Context, owner bson.ObjectID, version int64) error {
	f := accountstate.ActiveFilter(bson.M{"_id": owner})
	for k, v := range accountstate.VersionFilter(version) {
		f[k] = v
	}
	e := s.db.Collection("users").FindOne(ctx, f, options.FindOne().SetProjection(bson.M{"_id": 1})).Err()
	if errors.Is(e, mongo.ErrNoDocuments) {
		return accountstate.ErrUnavailable
	}
	return e
}
