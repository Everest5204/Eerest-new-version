package post

import (
	"context"
	"errors"
	"strings"
	"time"

	"everest-backend/internal/accountstate"
	"everest-backend/internal/textpost"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

var ErrHomeCursor = errors.New("invalid home feed cursor")

// One ordered stream replaces the mobile client's two independent feed reads.
// Existing web endpoints and their cursor formats remain unchanged.
type HomeFeedPost struct {
	Post           `bson:",inline"`
	User           PostUser                 `bson:"user" json:"user"`
	IsSelf         bool                     `bson:"-" json:"is_self"`
	IsFollowing    bool                     `bson:"-" json:"is_following"`
	Text           string                   `bson:"text,omitempty" json:"text,omitempty"`
	TextBackground *textpost.TextBackground `bson:"text_background,omitempty" json:"text_background,omitempty"`
	TextColor      string                   `bson:"text_color,omitempty" json:"text_color,omitempty"`
	TextStyle      string                   `bson:"text_style,omitempty" json:"text_style,omitempty"`
}

type HomeFeedResponse struct {
	Posts        []HomeFeedPost `json:"posts"`
	NextCursor   string         `json:"next_cursor"`
	HasMore      bool           `json:"has_more"`
	VisiblePosts []HomeFeedPost `json:"visible_posts,omitempty"`
	MissingIDs   []string       `json:"missing_ids,omitempty"`
}

func homeFilter(cursor string) (bson.M, error) {
	filter := bson.M{"is_deleted": bson.M{"$ne": true}, "type": bson.M{"$ne": PostTypeVideo}, "media_type": bson.M{"$ne": MediaTypeVideo}, "media.type": bson.M{"$ne": MediaTypeVideo}}
	if cursor = strings.TrimSpace(cursor); cursor != "" {
		if len(cursor) > 2048 {
			return nil, ErrHomeCursor
		}
		stamp, id, err := decodeCursor(cursor)
		if err != nil || id.IsZero() || stamp.IsZero() {
			return nil, ErrHomeCursor
		}
		filter["$or"] = bson.A{bson.M{"created_at": bson.M{"$lt": stamp}}, bson.M{"created_at": stamp, "_id": bson.M{"$lt": id}}}
	}
	return filter, nil
}

// The indexed sort streams candidates. Account visibility is checked BEFORE the
// limit, so deactivated/deleting authors cannot break page boundaries. Author
// data comes from this same join rather than a second users round trip.
func homePipeline(filter bson.M, limit int64) mongo.Pipeline {
	return mongo.Pipeline{
		bson.D{{Key: "$match", Value: filter}},
		bson.D{{Key: "$sort", Value: bson.D{{Key: "created_at", Value: -1}, {Key: "_id", Value: -1}}}},
		bson.D{{Key: "$lookup", Value: bson.M{"from": "users", "localField": "user_id", "foreignField": "_id", "as": "user", "pipeline": mongo.Pipeline{
			bson.D{{Key: "$match", Value: accountstate.ActiveFilter(bson.M{})}},
			bson.D{{Key: "$project", Value: bson.M{"_id": 1, "first_name": 1, "last_name": 1, "profile_image_url": 1}}},
		}}}},
		bson.D{{Key: "$unwind", Value: "$user"}},
		bson.D{{Key: "$limit", Value: limit}},
		bson.D{{Key: "$project", Value: bson.M{"_id": 1, "user_id": 1, "user": 1, "type": 1, "caption": 1, "text": 1, "text_background": 1, "text_color": 1, "text_style": 1, "media": 1, "media_url": 1, "media_id": 1, "media_type": 1, "likes_count": 1, "comments_count": 1, "shares_count": 1, "is_deleted": 1, "created_at": 1, "updated_at": 1}}},
	}
}

func (service *PostService) GetHomeFeed(ctx context.Context, viewer string, limit int64, cursor string, visible []bson.ObjectID) (*HomeFeedResponse, error) {
	viewerID, err := bson.ObjectIDFromHex(viewer)
	if err != nil || viewerID.IsZero() {
		return nil, errors.New("invalid viewer")
	}
	if limit < 1 || limit > maxFeedLimit {
		limit = defaultFeedLimit
	}
	filter, err := homeFilter(cursor)
	if err != nil {
		return nil, err
	}
	dbCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	posts, err := service.homeRows(dbCtx, filter, limit+1, true)
	if err != nil {
		return nil, err
	}
	hasMore := int64(len(posts)) > limit
	if hasMore {
		posts = posts[:limit]
	}
	response := &HomeFeedResponse{Posts: posts, HasMore: hasMore}
	if hasMore {
		last := posts[len(posts)-1]
		response.NextCursor = encodeCursor(last.CreatedAt, last.ID)
	}
	if len(visible) > 0 {
		if len(visible) > 8 {
			return nil, errors.New("too many visible posts")
		}
		visibleFilter, _ := homeFilter("")
		visibleFilter["_id"] = bson.M{"$in": visible}
		response.VisiblePosts, err = service.homeRows(dbCtx, visibleFilter, int64(len(visible)), false)
		if err != nil {
			return nil, err
		}
		found := make(map[bson.ObjectID]bool, len(response.VisiblePosts))
		for _, post := range response.VisiblePosts {
			found[post.ID] = true
		}
		for _, id := range visible {
			if !found[id] {
				response.MissingIDs = append(response.MissingIDs, id.Hex())
			}
		}
	}
	// One indexed follow query for head AND viewport; never one query per card.
	ids := make([]bson.ObjectID, 0, len(posts)+len(response.VisiblePosts))
	seen := map[bson.ObjectID]bool{}
	for _, rows := range [][]HomeFeedPost{posts, response.VisiblePosts} {
		for _, p := range rows {
			if !seen[p.UserID] {
				ids = append(ids, p.UserID)
				seen[p.UserID] = true
			}
		}
	}
	following, err := service.getFollowingUserIDs(dbCtx, viewerID, ids)
	if err != nil {
		return nil, err
	}
	for _, rows := range [][]HomeFeedPost{response.Posts, response.VisiblePosts} {
		for i := range rows {
			rows[i].IsSelf = rows[i].UserID == viewerID
			_, follows := following[rows[i].UserID]
			rows[i].IsFollowing = follows && !rows[i].IsSelf
		}
	}
	return response, nil
}

func (service *PostService) homeRows(ctx context.Context, filter bson.M, limit int64, ordered bool) ([]HomeFeedPost, error) {
	opts := options.Aggregate().SetAllowDiskUse(false).SetBatchSize(int32(limit))
	if ordered {
		opts.SetHint("feed_cursor_index")
	}
	rows, err := service.postsCollection.Aggregate(ctx, homePipeline(filter, limit), opts)
	if err != nil {
		return nil, err
	}
	defer rows.Close(ctx)
	posts := make([]HomeFeedPost, 0, limit)
	if err := rows.All(ctx, &posts); err != nil {
		return nil, err
	}
	return posts, nil
}
