package post

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"everest-backend/internal/accountstate"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

var errSharedPostID = errors.New("invalid shared post ID")
var errSharedPostUnavailable = errors.New("shared post unavailable")

// Separate read model: copied text links retain their text/background without changing feed responses.
type sharedTextBackground struct {
	Kind  string `bson:"kind" json:"kind"`
	Value string `bson:"value" json:"value"`
}

type sharedPostRecord struct {
	Post           `bson:",inline"`
	Text           string                `bson:"text"`
	TextBackground *sharedTextBackground `bson:"text_background"`
	TextColor      string                `bson:"text_color"`
	TextStyle      string                `bson:"text_style"`
}

type SharedLinkPost struct {
	FeedPost
	Text           string                `json:"text,omitempty"`
	TextBackground *sharedTextBackground `json:"text_background,omitempty"`
	TextColor      string                `json:"text_color,omitempty"`
	TextStyle      string                `json:"text_style,omitempty"`
}

// One indexed ID lookup; account visibility matches the existing feed's policy.
func (service *PostService) GetSharedLinkPost(ctx context.Context, postID, viewerID string) (*SharedLinkPost, error) {
	id, err := bson.ObjectIDFromHex(strings.TrimSpace(postID))
	if err != nil || id.IsZero() {
		return nil, errSharedPostID
	}
	viewer, err := bson.ObjectIDFromHex(viewerID)
	if err != nil || viewer.IsZero() {
		return nil, errSharedPostID
	}
	dbCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	pipeline := accountstate.VisiblePostPipeline(bson.M{"_id": id, "is_deleted": bson.M{"$ne": true}}, 1, nil)
	cursor, err := service.postsCollection.Aggregate(dbCtx, pipeline)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(dbCtx)
	if !cursor.Next(dbCtx) {
		if err := cursor.Err(); err != nil {
			return nil, err
		}
		return nil, errSharedPostUnavailable
	}
	var record sharedPostRecord
	if err := cursor.Decode(&record); err != nil {
		return nil, err
	}
	user, err := service.getPostUserByID(dbCtx, record.UserID)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, errSharedPostUnavailable
	}
	if err != nil {
		return nil, err
	}
	following, err := service.getFollowingUserIDs(dbCtx, viewer, []bson.ObjectID{record.UserID})
	if err != nil {
		return nil, err
	}
	_, isFollowing := following[record.UserID]
	return sharedPostResponse(record, user, viewer == record.UserID, isFollowing), nil
}

func sharedPostResponse(record sharedPostRecord, user PostUser, isSelf, isFollowing bool) *SharedLinkPost {
	return &SharedLinkPost{
		FeedPost: FeedPost{
			ID: record.ID, UserID: record.UserID, User: user,
			IsSelf: isSelf, IsFollowing: !isSelf && isFollowing,
			Type: record.Type, Caption: record.Caption, Media: record.Media,
			MediaURL: record.MediaURL, MediaID: record.MediaID, MediaType: record.MediaType,
			LikesCount: record.LikesCount, CommentsCount: record.CommentsCount, SharesCount: record.SharesCount,
			CreatedAt: record.CreatedAt, UpdatedAt: record.UpdatedAt,
		},
		Text: record.Text, TextBackground: record.TextBackground,
		TextColor: record.TextColor, TextStyle: record.TextStyle,
	}
}

func (handler *PostHandler) GetSharedPost(w http.ResponseWriter, r *http.Request) {
	serveSharedPost(w, r, handler.Service.GetSharedLinkPost)
}

func serveSharedPost(w http.ResponseWriter, r *http.Request, read func(context.Context, string, string) (*SharedLinkPost, error)) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w, http.MethodGet)
		return
	}
	viewer, ok := getAuthUserID(r)
	viewerID, viewerError := bson.ObjectIDFromHex(viewer)
	if !ok || viewerError != nil || viewerID.IsZero() {
		writeError(w, http.StatusUnauthorized, "Please sign in again.")
		return
	}
	id := r.PathValue("postID")
	parsed, err := bson.ObjectIDFromHex(id)
	if err != nil || parsed.IsZero() {
		writeError(w, http.StatusBadRequest, "Invalid post link.")
		return
	}
	post, err := read(r.Context(), id, viewer)
	switch {
	case errors.Is(err, errSharedPostUnavailable), errors.Is(err, mongo.ErrNoDocuments):
		writeError(w, http.StatusNotFound, "This post is unavailable or has been deleted.")
	case errors.Is(err, errSharedPostID):
		writeError(w, http.StatusBadRequest, "Invalid post link.")
	case err != nil:
		writeError(w, http.StatusInternalServerError, "Could not load this post. Please try again.")
	default:
		writeJSON(w, http.StatusOK, struct {
			Post *SharedLinkPost `json:"post"`
		}{Post: post})
	}
}
