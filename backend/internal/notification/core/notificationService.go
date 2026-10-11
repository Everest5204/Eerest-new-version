package notification

import (
	"context"
	"encoding/base64"
	"errors"
	"everest-backend/internal/accountstate"
	"fmt"
	"strconv"
	"strings"
	"sync"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

const (
	notificationDatabaseTimeout = 5 * time.Second
	notificationIndexTimeout    = 30 * time.Second
	MaxReadBatchSize            = 100
)

var (
	ErrInvalidUserID         = errors.New("invalid user id")
	ErrInvalidCursor         = errors.New("invalid notification cursor")
	ErrInvalidNotification   = errors.New("invalid notification data")
	ErrInvalidNotificationID = errors.New("invalid notification id")
	ErrInvalidReadRequest    = errors.New("provide between 1 and 100 notification ids")
)

type Service struct {
	notificationsCollection *mongo.Collection
	usersCollection         *mongo.Collection
}

type notificationCursor struct {
	CreatedAt time.Time
	ID        bson.ObjectID
}

func NewService(database *mongo.Database) *Service {
	return &Service{
		notificationsCollection: database.Collection("notifications"),
		usersCollection:         database.Collection("users"),
	}
}

// Call once during startup, before accepting notification writes.
func (service *Service) CreateIndexes(ctx context.Context) error {
	dbCtx, cancel := context.WithTimeout(ctx, notificationIndexTimeout)
	defer cancel()

	_, err := service.notificationsCollection.Indexes().CreateMany(
		dbCtx,
		[]mongo.IndexModel{
			{
				Keys: bson.D{
					{Key: "recipient_id", Value: 1},
					{Key: "event_key", Value: 1},
				},
				Options: options.Index().
					SetName("notification_recipient_event_unique").
					SetUnique(true),
			},
			{
				Keys: bson.D{
					{Key: "recipient_id", Value: 1},
					{Key: "created_at", Value: -1},
					{Key: "_id", Value: -1},
				},
				Options: options.Index().
					SetName("notification_recipient_created_cursor"),
			},
			{
				Keys: bson.D{
					{Key: "recipient_id", Value: 1},
					{Key: "is_read", Value: 1},
					{Key: "_id", Value: 1},
				},
				Options: options.Index().
					SetName("notification_recipient_unread"),
			},
		},
	)
	return err
}

// Create preserves the caller's transaction context.
// Its boolean result means inserted, not transaction committed.
func (service *Service) Create(
	ctx context.Context,
	input CreateNotificationInput,
) (bool, error) {
	input.EventKey = strings.TrimSpace(input.EventKey)
	input.ReactionType = strings.TrimSpace(input.ReactionType)
	if err := validateNotificationInput(input); err != nil {
		return false, err
	}
	if input.RecipientID == input.ActorID {
		return false, nil
	}

	dbCtx, cancel := context.WithTimeout(ctx, notificationDatabaseTimeout)
	defer cancel()

	now := time.Now().UTC().Truncate(time.Millisecond)
	document := notificationDocument{
		ID:           bson.NewObjectID(),
		RecipientID:  input.RecipientID,
		ActorID:      input.ActorID,
		Type:         input.Type,
		EventKey:     input.EventKey,
		PostID:       input.PostID,
		CommentID:    input.CommentID,
		ParentID:     input.ParentID,
		ReactionType: input.ReactionType,
		IsRead:       false,
		CreatedAt:    now,
		UpdatedAt:    now,
	}

	// Existing events remain unchanged, including their read state.
	result, err := service.notificationsCollection.UpdateOne(
		dbCtx,
		bson.M{"recipient_id": input.RecipientID, "event_key": input.EventKey},
		bson.M{"$setOnInsert": document},
		options.UpdateOne().SetUpsert(true),
	)
	if err != nil {
		// Write errors must reach the caller, including transaction failures.
		return false, err
	}
	return result.UpsertedCount == 1, nil
}

func (service *Service) GetNotifications(
	ctx context.Context,
	userID string,
	cursor string,
	limit int64,
) (*NotificationListResponse, error) {
	recipientID, err := parseNotificationUserID(userID)
	if err != nil {
		return nil, err
	}
	position, err := parseNotificationCursor(cursor)
	if err != nil {
		return nil, err
	}
	limit = NormalizeListLimit(limit)
	dbCtx, cancel := context.WithTimeout(ctx, notificationDatabaseTimeout)
	defer cancel()

	var unreadCount int64
	var countErr error
	var wait sync.WaitGroup

	// Explicit MongoDB sessions must not be used concurrently.
	parallel := mongo.SessionFromContext(dbCtx) == nil
	if parallel {
		wait.Add(1)
		go func() {
			defer wait.Done()
			unreadCount, countErr = service.countUnread(dbCtx, recipientID)
		}()
	}

	response, pageErr := service.getNotificationPage(dbCtx, recipientID, position, limit)
	if pageErr != nil {
		cancel()
	}
	if parallel {
		wait.Wait()
	} else if pageErr == nil {
		unreadCount, countErr = service.countUnread(dbCtx, recipientID)
	}
	if pageErr != nil {
		return nil, pageErr
	}
	if countErr != nil {
		return nil, countErr
	}
	response.UnreadCount = unreadCount
	return response, nil
}

func (service *Service) GetUnreadCount(
	ctx context.Context,
	userID string,
) (*UnreadCountResponse, error) {
	recipientID, err := parseNotificationUserID(userID)
	if err != nil {
		return nil, err
	}
	dbCtx, cancel := context.WithTimeout(ctx, notificationDatabaseTimeout)
	defer cancel()
	count, err := service.countUnread(dbCtx, recipientID)
	if err != nil {
		return nil, err
	}
	return &UnreadCountResponse{UnreadCount: count}, nil
}

func (service *Service) MarkRead(
	ctx context.Context,
	userID string,
	request MarkNotificationsReadRequest,
) (*MarkNotificationsReadResponse, error) {
	recipientID, err := parseNotificationUserID(userID)
	if err != nil {
		return nil, err
	}
	ids, err := parseNotificationReadIDs(request.NotificationIDs)
	if err != nil {
		return nil, err
	}
	dbCtx, cancel := context.WithTimeout(ctx, notificationDatabaseTimeout)
	defer cancel()
	now := time.Now().UTC().Truncate(time.Millisecond)

	result, err := service.notificationsCollection.UpdateMany(
		dbCtx,
		bson.M{
			"recipient_id": recipientID,
			"_id":          bson.M{"$in": ids},
			"is_read":      false,
		},
		bson.M{"$set": bson.M{
			"is_read": true, "read_at": now, "updated_at": now,
		}},
	)
	if err != nil {
		return nil, err
	}
	count, err := service.countUnread(dbCtx, recipientID)
	if err != nil {
		return nil, err
	}
	return &MarkNotificationsReadResponse{
		ModifiedCount: result.ModifiedCount,
		UnreadCount:   count,
	}, nil
}

func (service *Service) getNotificationPage(
	ctx context.Context,
	recipientID bson.ObjectID,
	position *notificationCursor,
	limit int64,
) (*NotificationListResponse, error) {
	filter := bson.M{"recipient_id": recipientID}
	if position != nil {
		filter["$or"] = bson.A{
			bson.M{"created_at": bson.M{"$lt": position.CreatedAt}},
			bson.M{
				"created_at": position.CreatedAt,
				"_id":        bson.M{"$lt": position.ID},
			},
		}
	}
	cursor, err := service.notificationsCollection.Find(
		ctx,
		filter,
		options.Find().
			SetSort(bson.D{{Key: "created_at", Value: -1}, {Key: "_id", Value: -1}}).
			SetLimit(limit+1).
			SetBatchSize(int32(limit+1)),
	)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	var documents []notificationDocument
	if err := cursor.All(ctx, &documents); err != nil {
		return nil, err
	}

	response := &NotificationListResponse{
		Items:   make([]NotificationItem, 0, len(documents)),
		HasMore: int64(len(documents)) > limit,
	}
	if response.HasMore {
		documents = documents[:int(limit)]
		response.NextCursor = encodeNotificationCursor(documents[len(documents)-1])
	}
	actors, err := service.getActors(ctx, documents)
	if err != nil {
		return nil, err
	}
	for _, document := range documents {
		response.Items = append(response.Items, toNotificationItem(document, actors[document.ActorID]))
	}
	return response, nil
}

func (service *Service) getActors(
	ctx context.Context,
	documents []notificationDocument,
) (map[bson.ObjectID]*NotificationActor, error) {
	actors := make(map[bson.ObjectID]*NotificationActor)
	ids := make([]bson.ObjectID, 0, len(documents))
	seen := make(map[bson.ObjectID]struct{}, len(documents))
	for _, document := range documents {
		if _, exists := seen[document.ActorID]; exists {
			continue
		}
		seen[document.ActorID] = struct{}{}
		ids = append(ids, document.ActorID)
	}
	if len(ids) == 0 {
		return actors, nil
	}
	cursor, err := service.usersCollection.Find(
		ctx,
		accountstate.ActiveFilter(bson.M{"_id": bson.M{"$in": ids}}),
		options.Find().SetProjection(bson.M{
			"_id":               1,
			"first_name":        1,
			"last_name":         1,
			"profile_image_url": 1,
			"profile_title":     1,
		}).SetBatchSize(int32(len(ids))),
	)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	var users []notificationActorDocument
	if err := cursor.All(ctx, &users); err != nil {
		return nil, err
	}
	for _, user := range users {
		actors[user.ID] = &NotificationActor{
			ID:              user.ID.Hex(),
			FirstName:       user.FirstName,
			LastName:        user.LastName,
			ProfileImageURL: user.ProfileImageURL,
			ProfileTitle:    user.ProfileTitle,
		}
	}
	return actors, nil
}

func (service *Service) countUnread(ctx context.Context, recipientID bson.ObjectID) (int64, error) {
	return service.notificationsCollection.CountDocuments(ctx, bson.M{
		"recipient_id": recipientID,
		"is_read":      false,
	})
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

func parseNotificationUserID(value string) (bson.ObjectID, error) {
	id, err := bson.ObjectIDFromHex(strings.TrimSpace(value))
	if err != nil || id.IsZero() {
		return bson.NilObjectID, ErrInvalidUserID
	}
	return id, nil
}

func parseNotificationReadIDs(values []string) ([]bson.ObjectID, error) {
	if len(values) == 0 || len(values) > MaxReadBatchSize {
		return nil, ErrInvalidReadRequest
	}
	ids := make([]bson.ObjectID, 0, len(values))
	seen := make(map[bson.ObjectID]struct{}, len(values))
	for _, value := range values {
		id, err := bson.ObjectIDFromHex(strings.TrimSpace(value))
		if err != nil || id.IsZero() {
			return nil, ErrInvalidNotificationID
		}
		if _, exists := seen[id]; !exists {
			seen[id] = struct{}{}
			ids = append(ids, id)
		}
	}
	return ids, nil
}

func validateNotificationInput(input CreateNotificationInput) error {
	if input.RecipientID.IsZero() || input.ActorID.IsZero() {
		return ErrInvalidUserID
	}
	if !input.Type.IsValid() || input.EventKey == "" || len(input.EventKey) > 256 {
		return ErrInvalidNotification
	}
	for _, id := range []*bson.ObjectID{input.PostID, input.CommentID, input.ParentID} {
		if id != nil && id.IsZero() {
			return ErrInvalidNotification
		}
	}
	valid := false
	switch input.Type {
	case TypeFollow, TypeFollowBack:
		valid = input.PostID == nil && input.CommentID == nil && input.ParentID == nil && input.ReactionType == ""
	case TypePostReaction:
		// Allowed reaction values are validated by the reaction section.

		valid = input.PostID != nil && input.CommentID == nil && input.ParentID == nil && input.ReactionType != ""

	case TypePostComment:
		valid = input.PostID != nil && input.CommentID != nil && input.ParentID == nil && input.ReactionType == ""

	case TypeCommentLove:
		valid = input.PostID != nil &&
			input.CommentID != nil &&
			input.ReactionType == "love"

		if valid && input.ParentID != nil &&
			*input.CommentID == *input.ParentID {
			valid = false
		}
	case TypeCommentReply:
		valid = input.PostID != nil && input.CommentID != nil && input.ParentID != nil && input.ReactionType == ""
		if valid && *input.CommentID == *input.ParentID {
			valid = false
		}
	}
	if !valid {
		return ErrInvalidNotification
	}
	return nil
}

func encodeNotificationCursor(document notificationDocument) string {
	value := fmt.Sprintf("1:%d:%s", document.CreatedAt.UnixMilli(), document.ID.Hex())
	return base64.RawURLEncoding.EncodeToString([]byte(value))
}

func parseNotificationCursor(value string) (*notificationCursor, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil, nil
	}
	if len(value) > 128 {
		return nil, ErrInvalidCursor
	}
	decoded, err := base64.RawURLEncoding.DecodeString(value)
	if err != nil {
		return nil, ErrInvalidCursor
	}
	parts := strings.Split(string(decoded), ":")
	if len(parts) != 3 || parts[0] != "1" {
		return nil, ErrInvalidCursor
	}
	milliseconds, err := strconv.ParseInt(parts[1], 10, 64)
	if err != nil || milliseconds <= 0 || milliseconds > 253402300799999 {
		return nil, ErrInvalidCursor
	}
	id, err := bson.ObjectIDFromHex(parts[2])
	if err != nil || id.IsZero() {
		return nil, ErrInvalidCursor
	}
	return &notificationCursor{CreatedAt: time.UnixMilli(milliseconds).UTC(), ID: id}, nil
}

func toNotificationItem(document notificationDocument, actor *NotificationActor) NotificationItem {
	return NotificationItem{
		ID:           document.ID.Hex(),
		Type:         document.Type,
		ActorID:      document.ActorID.Hex(),
		Actor:        actor,
		PostID:       notificationTargetID(document.PostID),
		CommentID:    notificationTargetID(document.CommentID),
		ParentID:     notificationTargetID(document.ParentID),
		ReactionType: document.ReactionType,
		IsRead:       document.IsRead,
		ReadAt:       document.ReadAt,
		CreatedAt:    document.CreatedAt,
		UpdatedAt:    document.UpdatedAt,
	}
}

func notificationTargetID(id *bson.ObjectID) string {
	if id == nil || id.IsZero() {
		return ""
	}
	return id.Hex()
}
func (service *Service) checkStreamSession(ctx context.Context, userID string, version int64) error {
	id, err := parseNotificationUserID(userID)
	if err != nil {
		return err
	}
	filter := accountstate.ActiveFilter(accountstate.VersionFilter(version))
	filter["_id"] = id
	checkCtx, cancel := context.WithTimeout(ctx, notificationDatabaseTimeout)
	defer cancel()
	return service.usersCollection.FindOne(checkCtx, filter, options.FindOne().SetProjection(bson.M{"_id": 1})).Err()
}
