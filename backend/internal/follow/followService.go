package follow

import (
	"context"
	"errors"
	"everest-backend/internal/accountstate"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

const followDatabaseTimeout = 5 * time.Second

var (
	ErrInvalidUserID = errors.New("invalid user id")
	ErrInvalidCursor = errors.New("invalid follow list cursor")
	ErrInvalidList   = errors.New("invalid follow list type")
	ErrUserNotFound  = errors.New("user not found")
)

type Service struct {
	usersCollection   *mongo.Collection
	followsCollection *mongo.Collection
}

type relationPage struct {
	relations  []followDocument
	nextCursor string
	hasMore    bool
}

type relationPageResult struct {
	page *relationPage
	err  error
}

type followCountsResult struct {
	counts followCountsDocument
	err    error
}

type followUsersResult struct {
	users map[bson.ObjectID]followUserDocument
	err   error
}

type followStateResult struct {
	userIDs map[bson.ObjectID]struct{}
	err     error
}

func NewService(database *mongo.Database) *Service {
	return &Service{
		usersCollection: database.Collection("users"),
		followsCollection: database.Collection(
			"user_follows",
		),
	}
}

// CreateIndexes keeps every list and relationship-state query index-backed.
func (service *Service) CreateIndexes(ctx context.Context) error {
	indexModels := []mongo.IndexModel{
		{
			Keys: bson.D{
				{Key: "follower_id", Value: 1},
				{Key: "following_id", Value: 1},
			},
			Options: options.Index().
				SetUnique(true).
				SetName("unique_user_follow_relationship"),
		},
		{
			Keys: bson.D{
				{Key: "following_id", Value: 1},
				{Key: "_id", Value: -1},
			},
			Options: options.Index().
				SetName("followers_object_id_cursor_index"),
		},
		{
			Keys: bson.D{
				{Key: "follower_id", Value: 1},
				{Key: "_id", Value: -1},
			},
			Options: options.Index().
				SetName("following_object_id_cursor_index"),
		},
		{
			Keys: bson.D{
				{Key: "following_id", Value: 1},
				{Key: "follower_id", Value: 1},
			},
			Options: options.Index().
				SetName("reverse_follow_relationship_lookup"),
		},
	}

	_, err := service.followsCollection.
		Indexes().CreateMany(ctx, indexModels)

	return err
}

func NormalizeListLimit(limit int64) int64 {
	if limit <= 0 {
		return DefaultListLimit
	}

	if limit > MaxListLimit {
		return MaxListLimit
	}

	return limit
}

func (service *Service) GetFollowers(
	ctx context.Context,
	viewerUserID string,
	cursor string,
	limit int64,
) (*FollowListResponse, error) {
	return service.getFollowList(
		ctx,
		viewerUserID,
		FollowersList,
		cursor,
		limit,
	)
}

func (service *Service) GetFollowing(
	ctx context.Context,
	viewerUserID string,
	cursor string,
	limit int64,
) (*FollowListResponse, error) {
	return service.getFollowList(
		ctx,
		viewerUserID,
		FollowingList,
		cursor,
		limit,
	)
}

func (service *Service) getFollowList(
	ctx context.Context,
	viewerUserID string,
	kind ListKind,
	cursor string,
	limit int64,
) (*FollowListResponse, error) {
	if !kind.IsValid() {
		return nil, ErrInvalidList
	}

	viewerID, err := parseUserID(viewerUserID)
	if err != nil {
		return nil, err
	}

	cursorID, hasCursor, err := parseCursor(cursor)
	if err != nil {
		return nil, err
	}

	limit = NormalizeListLimit(limit)

	databaseCtx, cancel := context.WithTimeout(
		ctx,
		followDatabaseTimeout,
	)
	defer cancel()

	// The indexed relation page and the two tab counts are independent, so
	// they are loaded concurrently to reduce database round-trip latency.
	pageChannel := make(chan relationPageResult, 1)
	countsChannel := make(chan followCountsResult, 1)

	go func() {
		page, pageErr := service.getRelationPage(
			databaseCtx,
			viewerID,
			kind,
			cursorID,
			hasCursor,
			limit,
		)

		pageChannel <- relationPageResult{
			page: page,
			err:  pageErr,
		}
	}()

	go func() {
		counts, countsErr := service.getFollowCounts(
			databaseCtx,
			viewerID,
		)

		countsChannel <- followCountsResult{
			counts: counts,
			err:    countsErr,
		}
	}()

	pageResult := <-pageChannel
	countsResult := <-countsChannel

	if pageResult.err != nil {
		return nil, pageResult.err
	}

	if countsResult.err != nil {
		return nil, countsResult.err
	}

	response := &FollowListResponse{
		Items: make([]FollowUser, 0),

		NextCursor: pageResult.page.nextCursor,
		HasMore:    pageResult.page.hasMore,

		FollowersCount: countsResult.counts.FollowersCount,
		FollowingCount: countsResult.counts.FollowingCount,
	}

	candidateIDs := getCandidateUserIDs(
		pageResult.page.relations,
		kind,
	)

	if len(candidateIDs) == 0 {
		return response, nil
	}

	// User data and the opposite-direction relationship state are also
	// fetched as two indexed batch queries instead of N+1 per-user queries.
	usersChannel := make(chan followUsersResult, 1)
	stateChannel := make(chan followStateResult, 1)

	go func() {
		users, usersErr := service.getUsersMap(
			databaseCtx,
			candidateIDs,
		)

		usersChannel <- followUsersResult{
			users: users,
			err:   usersErr,
		}
	}()

	go func() {
		userIDs, stateErr :=
			service.getOppositeRelationshipSet(
				databaseCtx,
				viewerID,
				candidateIDs,
				kind,
			)

		stateChannel <- followStateResult{
			userIDs: userIDs,
			err:     stateErr,
		}
	}()

	usersResult := <-usersChannel
	stateResult := <-stateChannel

	if usersResult.err != nil {
		return nil, usersResult.err
	}

	if stateResult.err != nil {
		return nil, stateResult.err
	}

	response.Items = buildFollowUsers(
		candidateIDs,
		viewerID,
		kind,
		usersResult.users,
		stateResult.userIDs,
	)

	return response, nil
}

func (service *Service) getRelationPage(
	ctx context.Context,
	viewerID bson.ObjectID,
	kind ListKind,
	cursorID bson.ObjectID,
	hasCursor bool,
	limit int64,
) (*relationPage, error) {
	ownerField := "following_id"

	if kind == FollowingList {
		ownerField = "follower_id"
	}

	filter := bson.M{
		ownerField: viewerID,
	}

	if hasCursor {
		filter["_id"] = bson.M{
			"$lt": cursorID,
		}
	}

	findOptions := options.Find().
		SetProjection(bson.M{
			"_id":          1,
			"follower_id":  1,
			"following_id": 1,
		}).
		SetSort(bson.D{
			{Key: "_id", Value: -1},
		}).
		SetLimit(limit + 1)

	resultCursor, err := service.followsCollection.Find(
		ctx,
		filter,
		findOptions,
	)
	if err != nil {
		return nil, err
	}
	defer resultCursor.Close(ctx)

	relations := make(
		[]followDocument,
		0,
		limit+1,
	)

	if err = resultCursor.All(ctx, &relations); err != nil {
		return nil, err
	}

	hasMore := int64(len(relations)) > limit

	if hasMore {
		relations = relations[:limit]
	}

	nextCursor := ""

	if hasMore && len(relations) > 0 {
		nextCursor = relations[len(relations)-1].ID.Hex()
	}

	return &relationPage{
		relations:  relations,
		nextCursor: nextCursor,
		hasMore:    hasMore,
	}, nil
}

func (service *Service) getFollowCounts(
	ctx context.Context,
	viewerID bson.ObjectID,
) (followCountsDocument, error) {
	var counts followCountsDocument

	err := service.usersCollection.FindOne(
		ctx,
		accountstate.ActiveFilter(bson.M{
			"_id": viewerID,
		}),
		options.FindOne().SetProjection(bson.M{
			"followers_count": 1,
			"following_count": 1,
		}),
	).Decode(&counts)

	if errors.Is(err, mongo.ErrNoDocuments) {
		return followCountsDocument{}, ErrUserNotFound
	}

	if err != nil {
		return followCountsDocument{}, err
	}

	if counts.FollowersCount < 0 {
		counts.FollowersCount = 0
	}

	if counts.FollowingCount < 0 {
		counts.FollowingCount = 0
	}

	return counts, nil
}

func (service *Service) getUsersMap(
	ctx context.Context,
	userIDs []bson.ObjectID,
) (map[bson.ObjectID]followUserDocument, error) {
	usersMap := make(
		map[bson.ObjectID]followUserDocument,
		len(userIDs),
	)

	if len(userIDs) == 0 {
		return usersMap, nil
	}

	resultCursor, err := service.usersCollection.Find(
		ctx,
		accountstate.ActiveFilter(bson.M{
			"_id": bson.M{
				"$in": userIDs,
			},
		}),
		options.Find().SetProjection(bson.M{
			"_id":               1,
			"first_name":        1,
			"last_name":         1,
			"profile_title":     1,
			"profile_image_url": 1,
		}),
	)
	if err != nil {
		return nil, err
	}
	defer resultCursor.Close(ctx)

	users := make(
		[]followUserDocument,
		0,
		len(userIDs),
	)

	if err = resultCursor.All(ctx, &users); err != nil {
		return nil, err
	}

	for _, item := range users {
		usersMap[item.ID] = item
	}

	return usersMap, nil
}

func (service *Service) getOppositeRelationshipSet(
	ctx context.Context,
	viewerID bson.ObjectID,
	candidateIDs []bson.ObjectID,
	kind ListKind,
) (map[bson.ObjectID]struct{}, error) {
	userIDs := make(
		map[bson.ObjectID]struct{},
		len(candidateIDs),
	)

	if len(candidateIDs) == 0 {
		return userIDs, nil
	}

	filter := bson.M{}
	projection := bson.M{
		"_id": 0,
	}

	if kind == FollowersList {
		// Which followers does the viewer already follow back?
		filter["follower_id"] = viewerID
		filter["following_id"] = bson.M{
			"$in": candidateIDs,
		}
		projection["following_id"] = 1
	} else {
		// Which followed users also follow the viewer?
		filter["following_id"] = viewerID
		filter["follower_id"] = bson.M{
			"$in": candidateIDs,
		}
		projection["follower_id"] = 1
	}

	resultCursor, err := service.followsCollection.Find(
		ctx,
		filter,
		options.Find().SetProjection(projection),
	)
	if err != nil {
		return nil, err
	}
	defer resultCursor.Close(ctx)

	relations := make([]followDocument, 0)

	if err = resultCursor.All(ctx, &relations); err != nil {
		return nil, err
	}

	for _, relation := range relations {
		if kind == FollowersList {
			userIDs[relation.FollowingID] = struct{}{}
		} else {
			userIDs[relation.FollowerID] = struct{}{}
		}
	}

	return userIDs, nil
}

func getCandidateUserIDs(
	relations []followDocument,
	kind ListKind,
) []bson.ObjectID {
	userIDs := make(
		[]bson.ObjectID,
		0,
		len(relations),
	)

	for _, relation := range relations {
		if kind == FollowersList {
			userIDs = append(userIDs, relation.FollowerID)
		} else {
			userIDs = append(userIDs, relation.FollowingID)
		}
	}

	return userIDs
}

func buildFollowUsers(
	orderedUserIDs []bson.ObjectID,
	viewerID bson.ObjectID,
	kind ListKind,
	usersMap map[bson.ObjectID]followUserDocument,
	oppositeRelationshipSet map[bson.ObjectID]struct{},
) []FollowUser {
	items := make(
		[]FollowUser,
		0,
		len(orderedUserIDs),
	)

	for _, userID := range orderedUserIDs {
		userDocument, exists := usersMap[userID]
		if !exists {
			continue
		}

		_, hasOppositeRelationship :=
			oppositeRelationshipSet[userID]

		isFollowing := kind == FollowingList
		followsYou := kind == FollowersList

		if kind == FollowersList {
			isFollowing = hasOppositeRelationship
		} else {
			followsYou = hasOppositeRelationship
		}

		items = append(items, FollowUser{
			ID:              userDocument.ID.Hex(),
			FirstName:       userDocument.FirstName,
			LastName:        userDocument.LastName,
			ProfileTitle:    userDocument.ProfileTitle,
			ProfileImageURL: userDocument.ProfileImageURL,
			IsFollowing:     isFollowing,
			FollowsYou:      followsYou,
			IsSelf:          userDocument.ID == viewerID,
		})
	}

	return items
}

func parseUserID(value string) (bson.ObjectID, error) {
	objectID, err := bson.ObjectIDFromHex(
		strings.TrimSpace(value),
	)
	if err != nil {
		return bson.NilObjectID, ErrInvalidUserID
	}

	return objectID, nil
}

func parseCursor(
	value string,
) (bson.ObjectID, bool, error) {
	cleanCursor := strings.TrimSpace(value)

	if cleanCursor == "" {
		return bson.NilObjectID, false, nil
	}

	objectID, err := bson.ObjectIDFromHex(cleanCursor)
	if err != nil {
		return bson.NilObjectID, false, ErrInvalidCursor
	}

	return objectID, true, nil
}
