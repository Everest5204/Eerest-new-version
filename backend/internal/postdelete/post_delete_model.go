package postdelete

import "go.mongodb.org/mongo-driver/v2/bson"

// deletePostMediaItem contains only the media information
// required while permanently deleting a post.
type deletePostMediaItem struct {
	PublicID     string `bson:"id"`
	ResourceType string `bson:"type"`
}

// deletePostDocument is a lightweight MongoDB projection.
// The complete post document does not need to be loaded.
type deletePostDocument struct {
	ID     bson.ObjectID `bson:"_id"`
	UserID bson.ObjectID `bson:"user_id"`

	Media []deletePostMediaItem `bson:"media,omitempty"`

	// Supports older posts that used a single media object.
	MediaID   string `bson:"media_id,omitempty"`
	MediaType string `bson:"media_type,omitempty"`

	IsDeleted bool `bson:"is_deleted"`
}

// deleteCommentDocument is used to collect comment IDs
// before deleting comment_loves.
type deleteCommentDocument struct {
	ID bson.ObjectID `bson:"_id"`
}

// deleteMediaTarget represents one unique Cloudinary asset.
type deleteMediaTarget struct {
	PublicID     string
	ResourceType string
}

// DeletePostResponse is returned only after the database
// deletion operation finishes successfully.
type DeletePostResponse struct {
	Deleted bool   `json:"deleted"`
	PostID  string `json:"post_id"`

	DeletedComments     int64 `json:"deleted_comments"`
	DeletedCommentLoves int64 `json:"deleted_comment_loves"`
	DeletedReactions    int64 `json:"deleted_reactions"`
	DeletedMedia        int   `json:"deleted_media"`
}