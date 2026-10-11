// Package accountstate centralizes visibility and login-session rules.
package accountstate

import (
	"context"
	"errors"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

var ErrUnavailable = errors.New("account unavailable")

// Missing fields on existing accounts mean active/version zero. Never backfill
// every user or duplicate posts when an account temporarily changes state.
func ActiveFilter(filter bson.M) bson.M {
	result := make(bson.M, len(filter)+2)
	for key, value := range filter {
		result[key] = value
	}
	result["deactivated"] = bson.M{"$ne": true}
	result["deletion_requested"] = bson.M{"$ne": true}
	return result
}

func VersionFilter(version int64) bson.M {
	if version == 0 {
		return bson.M{"$or": bson.A{bson.M{"session_version": int64(0)}, bson.M{"session_version": bson.M{"$exists": false}}}}
	}
	return bson.M{"session_version": version}
}

func RequireActive(ctx context.Context, users *mongo.Collection, id bson.ObjectID) error {
	err := users.FindOne(ctx, ActiveFilter(bson.M{"_id": id}), options.FindOne().SetProjection(bson.M{"_id": 1})).Err()
	if errors.Is(err, mongo.ErrNoDocuments) {
		return ErrUnavailable
	}
	return err
}

func RequireVisiblePost(ctx context.Context, posts, users *mongo.Collection, id bson.ObjectID) error {
	var post struct {
		UserID bson.ObjectID `bson:"user_id"`
	}
	err := posts.FindOne(ctx, bson.M{"_id": id, "is_deleted": bson.M{"$ne": true}}, options.FindOne().SetProjection(bson.M{"user_id": 1})).Decode(&post)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return ErrUnavailable
	}
	if err != nil {
		return err
	}
	return RequireActive(ctx, users, post.UserID)
}

// Visibility is applied before limit, so hidden posts do not create empty pages
// or broken cursors. Both joins use the existing users._id index.
func VisiblePostPipeline(filter bson.M, limit int64, projection bson.M) mongo.Pipeline {
	pipeline := mongo.Pipeline{
		bson.D{{Key: "$match", Value: filter}},
		bson.D{{Key: "$sort", Value: bson.D{{Key: "created_at", Value: -1}, {Key: "_id", Value: -1}}}},
		bson.D{{Key: "$lookup", Value: bson.M{
			"from": "users", "localField": "user_id", "foreignField": "_id", "as": "_visible_account",
			"pipeline": mongo.Pipeline{bson.D{{Key: "$match", Value: ActiveFilter(bson.M{})}}, bson.D{{Key: "$project", Value: bson.M{"_id": 1}}}},
		}}},
		bson.D{{Key: "$match", Value: bson.M{"_visible_account.0": bson.M{"$exists": true}}}},
		bson.D{{Key: "$unset", Value: "_visible_account"}},
		bson.D{{Key: "$limit", Value: limit}},
	}
	if len(projection) > 0 {
		pipeline = append(pipeline, bson.D{{Key: "$project", Value: projection}})
	}
	return pipeline
}
