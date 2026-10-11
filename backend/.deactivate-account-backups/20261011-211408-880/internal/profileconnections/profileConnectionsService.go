package profileconnections

import (
	"context"
	"errors"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

const connectionDatabaseTimeout = 5 * time.Second

var (
	ErrInvalidViewerUserID = errors.New("invalid viewer user id")
	ErrInvalidOwnerUserID  = errors.New("invalid profile user id")
	ErrInvalidCursor       = errors.New("invalid connection list cursor")
	ErrInvalidList         = errors.New("invalid connection list type")
	ErrOwnerNotFound       = errors.New("profile user not found")
)

type Service struct {
	usersCollection       *mongo.Collection
	connectionsCollection *mongo.Collection
}

type connectionPage struct {
	relations  []connectionDocument
	nextCursor string
	hasMore    bool
}

type ownerResult struct {
	owner connectionOwnerDocument
	err   error
}

type pageResult struct {
	page *connectionPage
	err  error
}

type usersResult struct {
	users map[bson.ObjectID]connectionUserDocument
	err   error
}

type connectionStateSets struct {
	visitorFollowing map[bson.ObjectID]struct{}
	followsVisitor   map[bson.ObjectID]struct{}
}

type statesResult struct {
	states connectionStateSets
	err    error
}

func NewService(database *mongo.Database) *Service {
	return &Service{
		usersCollection:       database.Collection("users"),
		connectionsCollection: database.Collection("user_follows"),
	}
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
	ownerUserID string,
	cursor string,
	limit int64,
) (*ConnectionListResponse, error) {
	return service.getConnectionList(
		ctx,
		viewerUserID,
		ownerUserID,
		FollowersList,
		cursor,
		limit,
	)
}

func (service *Service) GetFollowing(
	ctx context.Context,
	viewerUserID string,
	ownerUserID string,
	cursor string,
	limit int64,
) (*ConnectionListResponse, error) {
	return service.getConnectionList(
		ctx,
		viewerUserID,
		ownerUserID,
		FollowingList,
		cursor,
		limit,
	)
}

func (service *Service) getConnectionList(
	ctx context.Context,
	viewerUserID string,
	ownerUserID string,
	kind ListKind,
	cursor string,
	limit int64,
) (*ConnectionListResponse, error) {
	if !kind.IsValid() {
		return nil, ErrInvalidList
	}

	viewerID, err := parseViewerUserID(viewerUserID)
	if err != nil {
		return nil, err
	}

	ownerID, err := parseOwnerUserID(ownerUserID)
	if err != nil {
		return nil, err
	}

	cursorID, hasCursor, err := parseConnectionCursor(cursor)
	if err != nil {
		return nil, err
	}

	limit = NormalizeListLimit(limit)

	databaseCtx, cancel := context.WithTimeout(
		ctx,
		connectionDatabaseTimeout,
	)
	defer cancel()

	ownerChannel := make(chan ownerResult, 1)
	pageChannel := make(chan pageResult, 1)

	go func() {
		owner, ownerErr := service.getOwner(databaseCtx, ownerID)
		ownerChannel <- ownerResult{
			owner: owner,
			err:   ownerErr,
		}
	}()

	go func() {
		page, pageErr := service.getConnectionPage(
			databaseCtx,
			ownerID,
			kind,
			cursorID,
			hasCursor,
			limit,
		)

		pageChannel <- pageResult{
			page: page,
			err:  pageErr,
		}
	}()

	loadedOwner := <-ownerChannel
	loadedPage := <-pageChannel

	if loadedOwner.err != nil {
		return nil, loadedOwner.err
	}

	if loadedPage.err != nil {
		return nil, loadedPage.err
	}

	owner := loadedOwner.owner
	page := loadedPage.page

	response := &ConnectionListResponse{
		Owner: ConnectionOwner{
			ID:              owner.ID.Hex(),
			FirstName:       owner.FirstName,
			LastName:        owner.LastName,
			ProfileTitle:    owner.ProfileTitle,
			ProfileImageURL: owner.ProfileImageURL,
			IsSelf:          owner.ID == viewerID,
		},
		Items: make([]ConnectionUser, 0),

		NextCursor: page.nextCursor,
		HasMore:    page.hasMore,

		FollowersCount: nonNegativeCount(owner.FollowersCount),
		FollowingCount: nonNegativeCount(owner.FollowingCount),
	}

	candidateIDs := getCandidateUserIDs(page.relations, kind)
	if len(candidateIDs) == 0 {
		return response, nil
	}

	usersChannel := make(chan usersResult, 1)
	statesChannel := make(chan statesResult, 1)

	go func() {
		users, usersErr := service.getUsersMap(
			databaseCtx,
			candidateIDs,
		)

		usersChannel <- usersResult{
			users: users,
			err:   usersErr,
		}
	}()

	go func() {
		states, statesErr := service.getConnectionStates(
			databaseCtx,
			viewerID,
			candidateIDs,
		)

		statesChannel <- statesResult{
			states: states,
			err:    statesErr,
		}
	}()

	loadedUsers := <-usersChannel
	loadedStates := <-statesChannel

	if loadedUsers.err != nil {
		return nil, loadedUsers.err
	}

	if loadedStates.err != nil {
		return nil, loadedStates.err
	}

	response.Items = buildConnectionUsers(
		candidateIDs,
		viewerID,
		loadedUsers.users,
		loadedStates.states,
	)

	return response, nil
}

func (service *Service) getOwner(
	ctx context.Context,
	ownerID bson.ObjectID,
) (connectionOwnerDocument, error) {
	var owner connectionOwnerDocument

	err := service.usersCollection.FindOne(
		ctx,
		bson.M{
			"_id": ownerID,
		},
		options.FindOne().SetProjection(bson.M{
			"_id":               1,
			"first_name":        1,
			"last_name":         1,
			"profile_title":     1,
			"profile_image_url": 1,
			"followers_count":   1,
			"following_count":   1,
		}),
	).Decode(&owner)

	if errors.Is(err, mongo.ErrNoDocuments) {
		return connectionOwnerDocument{}, ErrOwnerNotFound
	}

	if err != nil {
		return connectionOwnerDocument{}, err
	}

	return owner, nil
}

func (service *Service) getConnectionPage(
	ctx context.Context,
	ownerID bson.ObjectID,
	kind ListKind,
	cursorID bson.ObjectID,
	hasCursor bool,
	limit int64,
) (*connectionPage, error) {
	ownerField := "following_id"

	if kind == FollowingList {
		ownerField = "follower_id"
	}

	filter := bson.M{
		ownerField: ownerID,
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
			{
				Key:   "_id",
				Value: -1,
			},
		}).
		SetLimit(limit + 1)

	resultCursor, err := service.connectionsCollection.Find(
		ctx,
		filter,
		findOptions,
	)
	if err != nil {
		return nil, err
	}
	defer resultCursor.Close(ctx)

	relations := make([]connectionDocument, 0, limit+1)

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

	return &connectionPage{
		relations:  relations,
		nextCursor: nextCursor,
		hasMore:    hasMore,
	}, nil
}

func (service *Service) getUsersMap(
	ctx context.Context,
	userIDs []bson.ObjectID,
) (map[bson.ObjectID]connectionUserDocument, error) {
	usersMap := make(
		map[bson.ObjectID]connectionUserDocument,
		len(userIDs),
	)

	if len(userIDs) == 0 {
		return usersMap, nil
	}

	resultCursor, err := service.usersCollection.Find(
		ctx,
		bson.M{
			"_id": bson.M{
				"$in": userIDs,
			},
		},
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
		[]connectionUserDocument,
		0,
		len(userIDs),
	)

	if err = resultCursor.All(ctx, &users); err != nil {
		return nil, err
	}

	for _, user := range users {
		usersMap[user.ID] = user
	}

	return usersMap, nil
}

func (service *Service) getConnectionStates(
	ctx context.Context,
	viewerID bson.ObjectID,
	candidateIDs []bson.ObjectID,
) (connectionStateSets, error) {
	states := connectionStateSets{
		visitorFollowing: make(
			map[bson.ObjectID]struct{},
			len(candidateIDs),
		),
		followsVisitor: make(
			map[bson.ObjectID]struct{},
			len(candidateIDs),
		),
	}

	if len(candidateIDs) == 0 {
		return states, nil
	}

	filter := bson.M{
		"$or": bson.A{
			bson.M{
				"follower_id": viewerID,
				"following_id": bson.M{
					"$in": candidateIDs,
				},
			},
			bson.M{
				"following_id": viewerID,
				"follower_id": bson.M{
					"$in": candidateIDs,
				},
			},
		},
	}

	resultCursor, err := service.connectionsCollection.Find(
		ctx,
		filter,
		options.Find().SetProjection(bson.M{
			"_id":          0,
			"follower_id":  1,
			"following_id": 1,
		}),
	)
	if err != nil {
		return connectionStateSets{}, err
	}
	defer resultCursor.Close(ctx)

	relations := make(
		[]connectionDocument,
		0,
		len(candidateIDs)*2,
	)

	if err = resultCursor.All(ctx, &relations); err != nil {
		return connectionStateSets{}, err
	}

	for _, relation := range relations {
		if relation.FollowerID == viewerID {
			states.visitorFollowing[relation.FollowingID] = struct{}{}
		}

		if relation.FollowingID == viewerID {
			states.followsVisitor[relation.FollowerID] = struct{}{}
		}
	}

	return states, nil
}

func getCandidateUserIDs(
	relations []connectionDocument,
	kind ListKind,
) []bson.ObjectID {
	userIDs := make(
		[]bson.ObjectID,
		0,
		len(relations),
	)

	seen := make(
		map[bson.ObjectID]struct{},
		len(relations),
	)

	for _, relation := range relations {
		candidateID := relation.FollowerID

		if kind == FollowingList {
			candidateID = relation.FollowingID
		}

		if candidateID.IsZero() {
			continue
		}

		if _, exists := seen[candidateID]; exists {
			continue
		}

		seen[candidateID] = struct{}{}
		userIDs = append(userIDs, candidateID)
	}

	return userIDs
}

func buildConnectionUsers(
	orderedUserIDs []bson.ObjectID,
	viewerID bson.ObjectID,
	usersMap map[bson.ObjectID]connectionUserDocument,
	states connectionStateSets,
) []ConnectionUser {
	items := make(
		[]ConnectionUser,
		0,
		len(orderedUserIDs),
	)

	for _, userID := range orderedUserIDs {
		user, exists := usersMap[userID]
		if !exists {
			continue
		}

		_, isFollowing := states.visitorFollowing[userID]
		_, followsYou := states.followsVisitor[userID]

		items = append(items, ConnectionUser{
			ID:              user.ID.Hex(),
			FirstName:       user.FirstName,
			LastName:        user.LastName,
			ProfileTitle:    user.ProfileTitle,
			ProfileImageURL: user.ProfileImageURL,
			IsFollowing:     isFollowing,
			FollowsYou:      followsYou,
			IsSelf:          user.ID == viewerID,
		})
	}

	return items
}

func nonNegativeCount(value int64) int64 {
	if value < 0 {
		return 0
	}

	return value
}

func parseViewerUserID(value string) (bson.ObjectID, error) {
	objectID, err := bson.ObjectIDFromHex(
		strings.TrimSpace(value),
	)
	if err != nil {
		return bson.NilObjectID, ErrInvalidViewerUserID
	}

	return objectID, nil
}

func parseOwnerUserID(value string) (bson.ObjectID, error) {
	objectID, err := bson.ObjectIDFromHex(
		strings.TrimSpace(value),
	)
	if err != nil {
		return bson.NilObjectID, ErrInvalidOwnerUserID
	}

	return objectID, nil
}

func parseConnectionCursor(
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