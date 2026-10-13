package saveditems

import (
	"context"
	"errors"
	"fmt"
	"go.mongodb.org/mongo-driver/v2/bson"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"
)

type memoryStore struct {
	mu       sync.Mutex
	records  map[string]Record
	posts    map[bson.ObjectID]Post
	hidden   map[bson.ObjectID]bool
	versions map[bson.ObjectID]int64
	changes  int
}

func memory() *memoryStore {
	return &memoryStore{records: map[string]Record{}, posts: map[bson.ObjectID]Post{}, hidden: map[bson.ObjectID]bool{}, versions: map[bson.ObjectID]int64{}}
}
func key(a Auth, id bson.ObjectID) string { return a.Owner.Hex() + ":" + id.Hex() }
func (m *memoryStore) CheckSession(_ context.Context, a Auth) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	v, ok := m.versions[a.Owner]
	if !ok || v != a.Version {
		return ErrSession
	}
	return nil
}
func (m *memoryStore) Read(_ context.Context, a Auth, id bson.ObjectID) (Record, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	r, ok := m.records[key(a, id)]
	if !ok {
		r = Record{Owner: a.Owner, PostID: id}
	}
	return r, nil
}
func (m *memoryStore) Update(_ context.Context, a Auth, id bson.ObjectID, q Request, now time.Time) (Record, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if v, ok := m.versions[a.Owner]; !ok || v != a.Version {
		return Record{}, ErrSession
	}
	r, ok := m.records[key(a, id)]
	if !ok {
		r = Record{Owner: a.Owner, PostID: id}
	}
	if r.LastRequest == q.RequestID {
		if r.LastExpected != *q.ExpectedRevision || r.LastDesired != *q.Saved {
			return Record{}, ErrConflict
		}
		return r, nil
	}
	if r.Revision != *q.ExpectedRevision {
		return Record{}, ErrConflict
	}
	if !ok && !*q.Saved {
		return r, nil
	}
	p, exists := m.posts[id]
	if *q.Saved && (!exists || m.hidden[id]) {
		return Record{}, ErrPost
	}
	if r.ID.IsZero() {
		r.ID = bson.NewObjectID()
	}
	if *q.Saved && !r.Saved {
		r.SavedAt = now
	}
	r.Saved = *q.Saved
	r.Kind = contentKind(p.Type)
	r.Revision++
	r.UpdatedAt = now
	r.LastRequest = q.RequestID
	r.LastExpected = *q.ExpectedRevision
	r.LastDesired = *q.Saved
	m.records[key(a, id)] = r
	m.changes++
	return r, nil
}
func (m *memoryStore) List(_ context.Context, a Auth, q Query, p Position) ([]joined, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	rows := []joined{}
	after, _ := objectID(p.ID)
	for _, r := range m.records {
		if r.Owner != a.Owner || !r.Saved || r.SavedAt.After(p.AsOf) || (q.Kind != "all" && r.Kind != q.Kind) {
			continue
		}
		if q.Cursor != "" && (r.SavedAt.After(p.At) || r.SavedAt.Equal(p.At) && r.ID.Hex() >= after.Hex()) {
			continue
		}
		j := joined{Record: r}
		post, exists := m.posts[r.PostID]
		if exists && !m.hidden[r.PostID] {
			j.Posts = []Post{post}
			j.Authors = []Author{post.User}
		}
		if q.Search != "" {
			if len(j.Posts) == 0 {
				continue
			}
			hay := strings.ToLower(post.Text + " " + post.Caption + " " + post.User.FirstName + " " + post.User.LastName)
			match := true
			for _, term := range strings.Fields(q.Search) {
				if !strings.Contains(hay, strings.ToLower(term)) {
					match = false
				}
			}
			if !match {
				continue
			}
		}
		rows = append(rows, j)
	}
	sort.Slice(rows, func(i, j int) bool {
		if !rows[i].SavedAt.Equal(rows[j].SavedAt) {
			return rows[i].SavedAt.After(rows[j].SavedAt)
		}
		return rows[i].ID.Hex() > rows[j].ID.Hex()
	})
	if len(rows) > q.Limit+1 {
		rows = rows[:q.Limit+1]
	}
	return rows, nil
}
func (m *memoryStore) Target(_ context.Context, a Auth, id bson.ObjectID) (*Post, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	r := m.records[key(a, id)]
	p, ok := m.posts[id]
	if !r.Saved || !ok || m.hidden[id] {
		return nil, ErrPost
	}
	p.IsSelf = p.UserID == a.Owner
	return &p, nil
}
func setup() (*Service, *memoryStore, Auth, Auth, bson.ObjectID) {
	m := memory()
	a, b := Auth{bson.NewObjectID(), 0}, Auth{bson.NewObjectID(), 0}
	m.versions[a.Owner] = 0
	m.versions[b.Owner] = 0
	id := bson.NewObjectID()
	m.posts[id] = Post{ID: id, UserID: b.Owner, User: Author{ID: b.Owner, FirstName: "Other", LastName: "User"}, Type: "text", Text: "Current text"}
	return NewService(m, "secret"), m, a, b, id
}
func request(saved bool, rev int64, n int) Request {
	return Request{&saved, &rev, fmt.Sprintf("00000000-0000-4000-8000-%012x", n)}
}
func TestPrivateSaveUnsaveAndTarget(t *testing.T) {
	s, m, a, b, id := setup()
	ctx := context.Background()
	v, e := s.State(ctx, a, id.Hex())
	if e != nil || v.Saved || v.Revision != 0 {
		t.Fatal(v, e)
	}
	v, e = s.Update(ctx, a, id.Hex(), request(true, 0, 1))
	if e != nil || !v.Saved || v.Revision != 1 {
		t.Fatal(v, e)
	}
	other, e := s.State(ctx, b, id.Hex())
	if e != nil || other.Saved {
		t.Fatal("other account saw bookmark")
	}
	if _, e = s.Target(ctx, b, id.Hex()); !errors.Is(e, ErrPost) {
		t.Fatal("other account opened saved target", e)
	}
	target, e := s.Target(ctx, a, id.Hex())
	if e != nil || target.Post.IsSelf || target.Post.Text != "Current text" {
		t.Fatal(target, e)
	}
	v, e = s.Update(ctx, a, id.Hex(), request(false, 1, 2))
	if e != nil || v.Saved || v.SavedAt != nil {
		t.Fatal(v, e)
	}
	if _, e = s.Target(ctx, a, id.Hex()); !errors.Is(e, ErrPost) {
		t.Fatal(e)
	}
	if _, ok := m.posts[id]; !ok {
		t.Fatal("unsave deleted original post")
	}
}
func TestDuplicateRequestAndStaleReplayCannotUndoResave(t *testing.T) {
	s, m, a, _, id := setup()
	ctx := context.Background()
	first := request(true, 0, 1)
	if _, e := s.Update(ctx, a, id.Hex(), first); e != nil {
		t.Fatal(e)
	}
	if _, e := s.Update(ctx, a, id.Hex(), first); e != nil {
		t.Fatal(e)
	}
	if m.changes != 1 {
		t.Fatal("duplicate write")
	}
	if _, e := s.Update(ctx, a, id.Hex(), request(false, 1, 2)); e != nil {
		t.Fatal(e)
	}
	if _, e := s.Update(ctx, a, id.Hex(), request(true, 2, 3)); e != nil {
		t.Fatal(e)
	}
	if _, e := s.Update(ctx, a, id.Hex(), first); !errors.Is(e, ErrConflict) {
		t.Fatal("old replay applied", e)
	}
	state, _ := s.State(ctx, a, id.Hex())
	if !state.Saved || state.Revision != 3 {
		t.Fatal(state)
	}
}
func TestConcurrentSameRequestHasOneRecord(t *testing.T) {
	s, m, a, _, id := setup()
	q := request(true, 0, 1)
	var wg sync.WaitGroup
	for n := 0; n < 32; n++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, e := s.Update(context.Background(), a, id.Hex(), q); e != nil {
				t.Error(e)
			}
		}()
	}
	wg.Wait()
	if len(m.records) != 1 || m.changes != 1 {
		t.Fatal("non-idempotent", len(m.records), m.changes)
	}
}
func TestConcurrentDifferentRequestsRequireFreshRevision(t *testing.T) {
	s, m, a, _, id := setup()
	var wg sync.WaitGroup
	var mu sync.Mutex
	success, conflicts := 0, 0
	for n := 1; n <= 16; n++ {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			_, e := s.Update(context.Background(), a, id.Hex(), request(true, 0, n))
			mu.Lock()
			defer mu.Unlock()
			if e == nil {
				success++
			} else if errors.Is(e, ErrConflict) {
				conflicts++
			} else {
				t.Error(e)
			}
		}(n)
	}
	wg.Wait()
	if success != 1 || conflicts != 15 || m.changes != 1 {
		t.Fatal(success, conflicts)
	}
}
func TestTimestampKeptForSameSavedStateAndChangedOnResave(t *testing.T) {
	s, _, a, _, id := setup()
	ctx := context.Background()
	at := time.Now().UTC()
	s.now = func() time.Time { return at }
	one, _ := s.Update(ctx, a, id.Hex(), request(true, 0, 1))
	s.now = func() time.Time { return at.Add(time.Hour) }
	two, _ := s.Update(ctx, a, id.Hex(), request(true, 1, 2))
	if !one.SavedAt.Equal(*two.SavedAt) {
		t.Fatal("duplicate save reordered list")
	}
	s.Update(ctx, a, id.Hex(), request(false, 2, 3))
	three, _ := s.Update(ctx, a, id.Hex(), request(true, 3, 4))
	if !three.SavedAt.After(*one.SavedAt) {
		t.Fatal("resave did not become recent")
	}
}
func TestUnavailablePostRetainsOnlyRemovablePrivateReference(t *testing.T) {
	s, m, a, _, id := setup()
	ctx := context.Background()
	s.Update(ctx, a, id.Hex(), request(true, 0, 1))
	m.hidden[id] = true
	p, e := s.List(ctx, a, Query{Kind: "all", Limit: 20})
	if e != nil || len(p.Items) != 1 || p.Items[0].Available || p.Items[0].Author != nil || p.Items[0].Thumbnail != "" || strings.Contains(p.Items[0].Text, "Current") {
		t.Fatal(p, e)
	}
	if _, e = s.Target(ctx, a, id.Hex()); !errors.Is(e, ErrPost) {
		t.Fatal(e)
	}
	if _, e = s.Update(ctx, a, id.Hex(), request(false, 1, 2)); e != nil {
		t.Fatal("cannot remove unavailable reference", e)
	}
}
func TestPaginationSearchAndAccountIsolation(t *testing.T) {
	s, m, a, b, _ := setup()
	ctx := context.Background()
	now := time.Now().UTC().Truncate(time.Millisecond)
	s.now = func() time.Time { return now }
	for n := 0; n < 61; n++ {
		id := bson.NewObjectID()
		typ := "image"
		if n%3 == 0 {
			typ = "video"
		}
		if n%3 == 1 {
			typ = "text"
		}
		m.posts[id] = Post{ID: id, UserID: b.Owner, User: Author{ID: b.Owner, FirstName: "Nora"}, Type: typ, Text: fmt.Sprintf("Text %d", n), Caption: "Unique literal [find]"}
		s.Update(ctx, a, id.Hex(), request(true, 0, n+1))
		if n == 0 {
			s.Update(ctx, b, id.Hex(), request(true, 0, 1000))
		}
	}
	q := Query{Kind: "all", Limit: 7}
	seen := map[string]bool{}
	for pages := 0; ; pages++ {
		p, e := s.List(ctx, a, q)
		if e != nil {
			t.Fatal(e)
		}
		for _, v := range p.Items {
			if seen[v.PostID] {
				t.Fatal("duplicate")
			}
			seen[v.PostID] = true
		}
		if !p.HasMore {
			break
		}
		q.Cursor = p.Cursor
		if pages > 12 {
			t.Fatal("loop")
		}
	}
	if len(seen) != 61 {
		t.Fatal(len(seen))
	}
	p, e := s.List(ctx, b, Query{Kind: "all", Limit: 20})
	if e != nil || len(p.Items) != 1 {
		t.Fatal("scope", p, e)
	}
	p, e = s.List(ctx, a, Query{Kind: "videos", Search: "[find] Nora", Limit: 50})
	if e != nil || len(p.Items) != 21 {
		t.Fatal("full owned search", len(p.Items), e)
	}
}
func TestRevokedSessionCannotReadOrWrite(t *testing.T) {
	s, m, a, _, id := setup()
	m.versions[a.Owner] = 1
	ctx := context.Background()
	if _, e := s.State(ctx, a, id.Hex()); !errors.Is(e, ErrSession) {
		t.Fatal(e)
	}
	if _, e := s.Update(ctx, a, id.Hex(), request(true, 0, 1)); !errors.Is(e, ErrSession) {
		t.Fatal(e)
	}
	if m.changes != 0 {
		t.Fatal("revoked write")
	}
}
func TestUnsaveMissingRecordIsIdempotentAndDoesNotCreateGarbage(t *testing.T) {
	s, m, a, _, _ := setup()
	id := bson.NewObjectID()
	v, e := s.Update(context.Background(), a, id.Hex(), request(false, 0, 1))
	if e != nil || v.Saved || v.Revision != 0 || len(m.records) != 0 {
		t.Fatal(v, e)
	}
}

func (m *memoryStore) OwnerRevision(_ context.Context, a Auth) (int64, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var n int64
	for _, r := range m.records {
		if r.Owner == a.Owner {
			n += r.Revision
		}
	}
	return n, nil
}
func (m *memoryStore) Resolve(ctx context.Context, a Auth, ids []bson.ObjectID) ([]joined, error) {
	rows, e := m.List(ctx, a, Query{Kind: "all", Limit: 50}, Position{AsOf: time.Now().Add(time.Hour)})
	if e != nil {
		return nil, e
	}
	selected := map[bson.ObjectID]bool{}
	for _, id := range ids {
		selected[id] = true
	}
	out := []joined{}
	for _, r := range rows {
		if selected[r.PostID] {
			out = append(out, r)
		}
	}
	return out, nil
}
