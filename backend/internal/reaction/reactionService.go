package reaction

import (
	"context"
	"errors"
	"sort"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

const (
	reactionDBTimeout         = 5 * time.Second
	reactionCounterTimeout    = 3 * time.Second
	reactionTopReactionsLimit = 2
)

type ReactionService struct {
	reactionsCollection *mongo.Collection
	usersCollection     *mongo.Collection
	postsCollection     *mongo.Collection
}

func NewReactionService(db *mongo.Database) *ReactionService {
	return &ReactionService{
		reactionsCollection: db.Collection("post_reactions"),
		usersCollection:     db.Collection("users"),
		postsCollection:     db.Collection("posts"),
	}
}

func (service *ReactionService) CreateIndexes(ctx context.Context) error {
	indexModels := []mongo.IndexModel{
		{
			Keys: bson.D{
				{Key: "post_id", Value: 1},
				{Key: "user_id", Value: 1},
			},
			Options: options.Index().
				SetName("unique_post_user_reaction_index").
				SetUnique(true),
		},
		{
			Keys: bson.D{
				{Key: "post_id", Value: 1},
				{Key: "reaction_type", Value: 1},
			},
			Options: options.Index().
				SetName("post_reaction_type_count_index"),
		},
		{
			Keys: bson.D{
				{Key: "post_id", Value: 1},
				{Key: "created_at", Value: 1},
				{Key: "_id", Value: 1},
			},
			Options: options.Index().
				SetName("first_reactor_lookup_index"),
		},
		{
			Keys: bson.D{
				{Key: "post_id", Value: 1},
				{Key: "reaction_type", Value: 1},
				{Key: "updated_at", Value: -1},
				{Key: "_id", Value: -1},
			},
			Options: options.Index().
				SetName("post_reaction_users_list_index"),
		},
		{
			Keys: bson.D{
				{Key: "user_id", Value: 1},
				{Key: "updated_at", Value: -1},
			},
			Options: options.Index().
				SetName("user_reactions_index"),
		},
	}

	_, err := service.reactionsCollection.Indexes().CreateMany(
		ctx,
		indexModels,
	)

	return err
}

func (service *ReactionService) SetReaction(
	ctx context.Context,
	userID string,
	postID string,
	reactionType string,
) (*SetReactionResponse, error) {
	cleanReactionType, err := validateReactionType(reactionType)
	if err != nil {
		return nil, err
	}

	userObjectID, err := bson.ObjectIDFromHex(strings.TrimSpace(userID))
	if err != nil {
		return nil, errors.New("invalid user id")
	}

	postObjectID, err := bson.ObjectIDFromHex(strings.TrimSpace(postID))
	if err != nil {
		return nil, errors.New("invalid post id")
	}

	now := time.Now().UTC()

	dbCtx, cancel := context.WithTimeout(ctx, reactionDBTimeout)
	defer cancel()

	_, err = service.reactionsCollection.UpdateOne(
		dbCtx,
		bson.M{
			"post_id": postObjectID,
			"user_id": userObjectID,
		},
		bson.M{
			"$set": bson.M{
				"reaction_type": cleanReactionType,
				"updated_at":    now,
			},
			"$setOnInsert": bson.M{
				"post_id":    postObjectID,
				"user_id":    userObjectID,
				"created_at": now,
			},
		},
		options.UpdateOne().SetUpsert(true),
	)
	if err != nil {
		return nil, err
	}

	summary, err := service.GetPostSummary(ctx, userID, postID)
	if err != nil {
		return nil, err
	}

	service.updatePostReactionCounter(ctx, postObjectID, summary.Total)

	return &SetReactionResponse{
		ReactionType: summary.CurrentUserReaction,
		Summary:      summary,
	}, nil
}

func (service *ReactionService) RemoveReaction(
	ctx context.Context,
	userID string,
	postID string,
) (*DeleteReactionResponse, error) {
	userObjectID, err := bson.ObjectIDFromHex(strings.TrimSpace(userID))
	if err != nil {
		return nil, errors.New("invalid user id")
	}

	postObjectID, err := bson.ObjectIDFromHex(strings.TrimSpace(postID))
	if err != nil {
		return nil, errors.New("invalid post id")
	}

	dbCtx, cancel := context.WithTimeout(ctx, reactionDBTimeout)
	defer cancel()

	_, err = service.reactionsCollection.DeleteOne(
		dbCtx,
		bson.M{
			"post_id": postObjectID,
			"user_id": userObjectID,
		},
	)
	if err != nil {
		return nil, err
	}

	summary, err := service.GetPostSummary(ctx, userID, postID)
	if err != nil {
		return nil, err
	}

	service.updatePostReactionCounter(ctx, postObjectID, summary.Total)

	return &DeleteReactionResponse{
		ReactionType: "",
		Summary:      summary,
	}, nil
}

func (service *ReactionService) GetPostSummary(
	ctx context.Context,
	userID string,
	postID string,
) (*PostReactionSummary, error) {
	userObjectID, err := bson.ObjectIDFromHex(strings.TrimSpace(userID))
	if err != nil {
		return nil, errors.New("invalid user id")
	}

	postObjectID, err := bson.ObjectIDFromHex(strings.TrimSpace(postID))
	if err != nil {
		return nil, errors.New("invalid post id")
	}

	dbCtx, cancel := context.WithTimeout(ctx, reactionDBTimeout)
	defer cancel()

	counts, err := service.getReactionCounts(dbCtx, postObjectID)
	if err != nil {
		return nil, err
	}

	currentReaction, err := service.getCurrentUserReaction(
		dbCtx,
		postObjectID,
		userObjectID,
	)
	if err != nil {
		return nil, err
	}

	firstReactor, err := service.getFirstReactor(dbCtx, postObjectID)
	if err != nil {
		return nil, err
	}

	total := getReactionTotal(counts)

	return &PostReactionSummary{
		Total:               total,
		Counts:              counts,
		TopReactions:        buildTopReactions(counts),
		CurrentUserReaction: currentReaction,
		FirstReactor:        firstReactor,
	}, nil
}

func (service *ReactionService) GetReactionUsers(
	ctx context.Context,
	userID string,
	postID string,
	reactionFilter string,
) (*ReactionUsersResponse, error) {
	_, err := bson.ObjectIDFromHex(strings.TrimSpace(userID))
	if err != nil {
		return nil, errors.New("invalid user id")
	}

	postObjectID, err := bson.ObjectIDFromHex(strings.TrimSpace(postID))
	if err != nil {
		return nil, errors.New("invalid post id")
	}

	cleanFilter, err := validateReactionFilter(reactionFilter)
	if err != nil {
		return nil, err
	}

	dbCtx, cancel := context.WithTimeout(ctx, reactionDBTimeout)
	defer cancel()

	counts, err := service.getReactionCounts(dbCtx, postObjectID)
	if err != nil {
		return nil, err
	}

	items, err := service.getReactionUserItems(dbCtx, postObjectID, cleanFilter)
	if err != nil {
		return nil, err
	}

	return &ReactionUsersResponse{
		Items:  items,
		Counts: counts,
		Total:  getReactionTotal(counts),
	}, nil
}

func (service *ReactionService) getReactionUserItems(
	ctx context.Context,
	postID bson.ObjectID,
	reactionFilter string,
) ([]ReactionUserItem, error) {
	match := bson.M{
		"post_id": postID,
	}

	if reactionFilter != ReactionAll {
		match["reaction_type"] = reactionFilter
	}

	pipeline := bson.A{
		bson.M{
			"$match": match,
		},
		bson.M{
			"$sort": bson.D{
				{Key: "updated_at", Value: -1},
				{Key: "_id", Value: -1},
			},
		},
		bson.M{
			"$lookup": bson.M{
				"from":         "users",
				"localField":   "user_id",
				"foreignField": "_id",
				"as":           "user",
			},
		},
		bson.M{
			"$unwind": bson.M{
				"path":                       "$user",
				"preserveNullAndEmptyArrays": true,
			},
		},
		bson.M{
			"$project": bson.M{
				"_id":           1,
				"post_id":       1,
				"user_id":       1,
				"reaction_type": 1,
				"created_at":    1,
				"updated_at":    1,

				"user._id":               1,
				"user.first_name":        1,
				"user.last_name":         1,
				"user.profile_image_url": 1,
			},
		},
	}

	cursor, err := service.reactionsCollection.Aggregate(ctx, pipeline)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var documents []reactionWithUserDocument

	if err = cursor.All(ctx, &documents); err != nil {
		return nil, err
	}

	items := make([]ReactionUserItem, 0, len(documents))

	for _, document := range documents {
		item, ok := buildReactionUserItem(document)
		if !ok {
			continue
		}

		items = append(items, item)
	}

	return items, nil
}

func buildReactionUserItem(document reactionWithUserDocument) (ReactionUserItem, bool) {
	reactionType, err := validateReactionType(document.ReactionType)
	if err != nil {
		return ReactionUserItem{}, false
	}

	user := ReactionUser{
		ID: document.UserID.Hex(),
	}

	if document.User != nil {
		if document.User.ID.Hex() != "" {
			user.ID = document.User.ID.Hex()
		}

		user.FirstName = document.User.FirstName
		user.LastName = document.User.LastName
		user.ProfileImageURL = document.User.ProfileImageURL
	}

	return ReactionUserItem{
		ID:           document.ID.Hex(),
		ReactionType: reactionType,
		User:         user,
	}, true
}

func (service *ReactionService) getReactionCounts(
	ctx context.Context,
	postID bson.ObjectID,
) (ReactionCounts, error) {
	pipeline := bson.A{
		bson.M{
			"$match": bson.M{
				"post_id": postID,
			},
		},
		bson.M{
			"$group": bson.M{
				"_id":   "$reaction_type",
				"count": bson.M{"$sum": 1},
			},
		},
	}

	cursor, err := service.reactionsCollection.Aggregate(ctx, pipeline)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	type reactionCountResult struct {
		ID    string `bson:"_id"`
		Count int64  `bson:"count"`
	}

	var results []reactionCountResult

	if err = cursor.All(ctx, &results); err != nil {
		return nil, err
	}

	counts := emptyReactionCounts()

	for _, item := range results {
		validReactionType, err := validateReactionType(item.ID)
		if err == nil {
			counts[validReactionType] = item.Count
		}
	}

	return counts, nil
}

func (service *ReactionService) getCurrentUserReaction(
	ctx context.Context,
	postID bson.ObjectID,
	userID bson.ObjectID,
) (string, error) {
	type currentReactionResult struct {
		ReactionType string `bson:"reaction_type"`
	}

	var result currentReactionResult

	err := service.reactionsCollection.FindOne(
		ctx,
		bson.M{
			"post_id": postID,
			"user_id": userID,
		},
		options.FindOne().SetProjection(bson.M{
			"reaction_type": 1,
		}),
	).Decode(&result)

	if errors.Is(err, mongo.ErrNoDocuments) {
		return "", nil
	}

	if err != nil {
		return "", err
	}

	validReactionType, err := validateReactionType(result.ReactionType)
	if err != nil {
		return "", nil
	}

	return validReactionType, nil
}

func (service *ReactionService) getFirstReactor(
	ctx context.Context,
	postID bson.ObjectID,
) (*ReactionUser, error) {
	type firstReactionResult struct {
		UserID bson.ObjectID `bson:"user_id"`
	}

	var firstReaction firstReactionResult

	err := service.reactionsCollection.FindOne(
		ctx,
		bson.M{
			"post_id": postID,
		},
		options.FindOne().
			SetSort(bson.D{
				{Key: "created_at", Value: 1},
				{Key: "_id", Value: 1},
			}).
			SetProjection(bson.M{
				"user_id": 1,
			}),
	).Decode(&firstReaction)

	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, nil
	}

	if err != nil {
		return nil, err
	}

	return service.getReactionUser(ctx, firstReaction.UserID)
}

func (service *ReactionService) getReactionUser(
	ctx context.Context,
	userID bson.ObjectID,
) (*ReactionUser, error) {
	type userResult struct {
		ID bson.ObjectID `bson:"_id"`

		FirstName string `bson:"first_name"`
		LastName  string `bson:"last_name"`

		ProfileImageURL string `bson:"profile_image_url,omitempty"`
	}

	var user userResult

	err := service.usersCollection.FindOne(
		ctx,
		bson.M{
			"_id": userID,
		},
		options.FindOne().SetProjection(bson.M{
			"first_name":        1,
			"last_name":         1,
			"profile_image_url": 1,
		}),
	).Decode(&user)

	if errors.Is(err, mongo.ErrNoDocuments) {
		return &ReactionUser{
			ID: userID.Hex(),
		}, nil
	}

	if err != nil {
		return nil, err
	}

	return &ReactionUser{
		ID:              user.ID.Hex(),
		FirstName:       user.FirstName,
		LastName:        user.LastName,
		ProfileImageURL: user.ProfileImageURL,
	}, nil
}

func (service *ReactionService) updatePostReactionCounter(
	ctx context.Context,
	postID bson.ObjectID,
	total int64,
) {
	dbCtx, cancel := context.WithTimeout(ctx, reactionCounterTimeout)
	defer cancel()

	_, _ = service.postsCollection.UpdateOne(
		dbCtx,
		bson.M{
			"_id": postID,
		},
		bson.M{
			"$set": bson.M{
				"likes_count": total,
				"updated_at":  time.Now().UTC(),
			},
		},
	)
}

func emptyReactionCounts() ReactionCounts {
	return ReactionCounts{
		ReactionLove:  0,
		ReactionHaha:  0,
		ReactionWow:   0,
		ReactionSad:   0,
		ReactionAngry: 0,
	}
}

func getReactionTotal(counts ReactionCounts) int64 {
	total := int64(0)

	for _, count := range counts {
		total += count
	}

	return total
}

func validateReactionType(value string) (string, error) {
	reactionType := strings.ToLower(strings.TrimSpace(value))

	switch reactionType {
	case ReactionLove, ReactionHaha, ReactionWow, ReactionSad, ReactionAngry:
		return reactionType, nil
	default:
		return "", errors.New("invalid reaction type")
	}
}

func validateReactionFilter(value string) (string, error) {
	reactionFilter := strings.ToLower(strings.TrimSpace(value))

	if reactionFilter == "" {
		return ReactionAll, nil
	}

	if reactionFilter == ReactionAll {
		return ReactionAll, nil
	}

	return validateReactionType(reactionFilter)
}

func buildTopReactions(counts ReactionCounts) []string {
	type reactionRank struct {
		Type  string
		Count int64
	}

	ranks := []reactionRank{
		{Type: ReactionLove, Count: counts[ReactionLove]},
		{Type: ReactionHaha, Count: counts[ReactionHaha]},
		{Type: ReactionWow, Count: counts[ReactionWow]},
		{Type: ReactionSad, Count: counts[ReactionSad]},
		{Type: ReactionAngry, Count: counts[ReactionAngry]},
	}

	sort.SliceStable(ranks, func(i, j int) bool {
		return ranks[i].Count > ranks[j].Count
	})

	topReactions := make([]string, 0, reactionTopReactionsLimit)

	for _, item := range ranks {
		if item.Count <= 0 {
			continue
		}

		topReactions = append(topReactions, item.Type)

		if len(topReactions) == reactionTopReactionsLimit {
			break
		}
	}

	return topReactions
}