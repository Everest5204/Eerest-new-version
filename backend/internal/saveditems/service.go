package saveditems

import (
	"context"
	"go.mongodb.org/mongo-driver/v2/bson"
	"net/url"
	"strings"
	"time"
)

type Service struct {
	store Store
	codec codec
	now   func() time.Time
}

func NewService(store Store, secret string) *Service {
	return &Service{store, newCodec(secret), time.Now}
}
func (s *Service) check(ctx context.Context, a Auth) error {
	if a.Owner.IsZero() || a.Version < 0 {
		return ErrSession
	}
	return s.store.CheckSession(ctx, a)
}
func (s *Service) State(ctx context.Context, a Auth, id string) (State, error) {
	pid, e := objectID(id)
	if e != nil {
		return State{}, e
	}
	if e = s.check(ctx, a); e != nil {
		return State{}, e
	}
	r, e := s.store.Read(ctx, a, pid)
	if e != nil {
		return State{}, e
	}
	if r.Owner != a.Owner || r.PostID != pid {
		return State{}, ErrUnavailable
	}
	return snapshot(r), nil
}
func (s *Service) Update(ctx context.Context, a Auth, id string, req Request) (State, error) {
	pid, e := objectID(id)
	if e != nil || !validRequest(req) {
		return State{}, ErrInput
	}
	if e = s.check(ctx, a); e != nil {
		return State{}, e
	}
	r, e := s.store.Update(ctx, a, pid, req, s.now().UTC().Truncate(time.Millisecond))
	if e != nil {
		return State{}, e
	}
	if r.Owner != a.Owner || r.PostID != pid {
		return State{}, ErrUnavailable
	}
	return snapshot(r), nil
}
func (s *Service) List(ctx context.Context, a Auth, q Query) (Page, error) {
	page := Page{Owner: a.Owner.Hex(), Items: []Item{}}
	q, e := normalize(q)
	if e != nil {
		return page, e
	}
	if e = s.check(ctx, a); e != nil {
		return page, e
	}
	now := s.now().UTC().Truncate(time.Millisecond)
	p := Position{V: 1, Owner: a.Owner.Hex(), Kind: q.Kind, Search: q.Search, AsOf: now}
	if q.Cursor != "" {
		p, e = s.codec.decode(q.Cursor, a, q, now)
		if e != nil {
			return page, e
		}
	}
	page.ChangeRevision, e = s.store.OwnerRevision(ctx, a)
	if e != nil {
		return page, e
	}
	rows, e := s.store.List(ctx, a, q, p)
	if e != nil {
		return page, e
	}
	if len(rows) > q.Limit+1 {
		return page, ErrUnavailable
	}
	page.HasMore = len(rows) > q.Limit
	if page.HasMore {
		rows = rows[:q.Limit]
		last := rows[len(rows)-1]
		p.At = last.SavedAt
		p.ID = last.ID.Hex()
		page.Cursor = s.codec.encode(p)
	}
	page.Items, e = itemsFromRows(a, rows)
	if e != nil {
		return page, e
	}
	return page, nil
}
func (s *Service) Target(ctx context.Context, a Auth, id string) (Target, error) {
	pid, e := objectID(id)
	if e != nil {
		return Target{}, e
	}
	if e = s.check(ctx, a); e != nil {
		return Target{}, e
	}
	p, e := s.store.Target(ctx, a, pid)
	if e != nil {
		return Target{}, e
	}
	if p == nil || p.ID != pid || p.User.ID != p.UserID {
		return Target{}, ErrUnavailable
	}
	return Target{Owner: a.Owner.Hex(), Post: p}, nil
}
func thumbnail(p Post) string {
	for _, m := range p.Media {
		if m.Type == "image" && secure(m.URL) {
			return m.URL
		}
		if m.Type == "video" {
			if v := videoPoster(m.URL); v != "" {
				return v
			}
		}
	}
	if p.MediaType == "image" && secure(p.MediaURL) {
		return p.MediaURL
	}
	if p.Type == "video" {
		return videoPoster(p.MediaURL)
	}
	return ""
}
func secure(v string) bool {
	u, e := url.Parse(v)
	return e == nil && u.Scheme == "https" && u.Hostname() != "" && u.User == nil
}
func videoPoster(v string) string {
	u, e := url.Parse(v)
	if e != nil || !secure(v) || u.Host != "res.cloudinary.com" || u.RawQuery != "" || u.Fragment != "" {
		return ""
	}
	marker := "/video/upload/"
	i := strings.Index(u.Path, marker)
	if i < 0 {
		return ""
	}
	split := i + len(marker)
	asset := u.Path[split:]
	if asset == "" || strings.HasPrefix(asset, "s--") {
		return ""
	}
	if j := strings.LastIndex(asset, "."); j > strings.LastIndex(asset, "/") {
		asset = asset[:j] + ".jpg"
	}
	u.Path = u.Path[:split] + "so_0,c_limit,w_320,f_jpg,q_auto/" + asset
	u.RawPath = ""
	return u.String()
}

func itemsFromRows(a Auth, rows []joined) ([]Item, error) {
	items := make([]Item, 0, len(rows))
	for _, r := range rows {
		if r.Owner != a.Owner || !r.Saved || r.PostID.IsZero() || r.ID.IsZero() || r.Revision < 1 || r.SavedAt.IsZero() || !validKind(r.Kind) || r.Kind == "all" {
			return nil, ErrUnavailable
		}
		item := Item{ID: r.ID.Hex(), PostID: r.PostID.Hex(), Kind: r.Kind, Revision: r.Revision, SavedAt: r.SavedAt, Title: "Unavailable post", Text: "This post is no longer available."}
		if len(r.Posts) == 1 && len(r.Authors) == 1 && r.Posts[0].ID == r.PostID && r.Posts[0].UserID == r.Authors[0].ID {
			post, author := r.Posts[0], r.Authors[0]
			item.Available = true
			item.Author = &author
			item.Text = clip(post.Caption, 220)
			if post.Type == "text" {
				item.Text = clip(post.Text, 220)
				if item.Text == "" {
					item.Text = clip(post.Caption, 220)
				}
			}
			switch post.Type {
			case "text":
				item.Title = "Text post"
			case "video":
				item.Title = "Video"
			case "profile_photo_update":
				item.Title = "Profile photo"
			case "cover_photo_update":
				item.Title = "Cover photo"
			default:
				item.Title = "Photo post"
			}
			item.Thumbnail = thumbnail(post)
		}
		items = append(items, item)
	}
	return items, nil
}
func (s *Service) Resolve(ctx context.Context, a Auth, ids []string) (Resolved, error) {
	result := Resolved{Owner: a.Owner.Hex(), Items: []Item{}}
	if len(ids) == 0 || len(ids) > 20 {
		return result, ErrInput
	}
	parsed := make([]bson.ObjectID, 0, len(ids))
	seen := map[bson.ObjectID]bool{}
	for _, v := range ids {
		id, e := objectID(v)
		if e != nil || seen[id] {
			return result, ErrInput
		}
		seen[id] = true
		parsed = append(parsed, id)
	}
	if e := s.check(ctx, a); e != nil {
		return result, e
	}
	rows, e := s.store.Resolve(ctx, a, parsed)
	if e != nil {
		return result, e
	}
	if len(rows) > len(parsed) {
		return result, ErrUnavailable
	}
	returned := map[bson.ObjectID]bool{}
	for _, row := range rows {
		if !seen[row.PostID] || returned[row.PostID] {
			return result, ErrUnavailable
		}
		returned[row.PostID] = true
	}
	result.Items, e = itemsFromRows(a, rows)
	return result, e
}
