package search

import (
	"context"
	"everest-backend/internal/accountstate"
	"regexp"
	"strings"
	"time"
	"unicode"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

const searchTimeout = 2 * time.Second

type Service struct {
	collection *mongo.Collection
}

func NewService(db *mongo.Database) *Service {
	return &Service{
		collection: db.Collection("users"),
	}
}

// CreateIndexes creates search-only indexes on existing user fields.
// It does not change any user document.
func (service *Service) CreateIndexes(
	ctx context.Context,
) error {
	indexModels := []mongo.IndexModel{
		{
			Keys: bson.D{
				{Key: "first_name", Value: 1},
				{Key: "_id", Value: 1},
			},
			Options: options.Index().SetName(
				"user_search_first_name_v1",
			),
		},
		{
			Keys: bson.D{
				{Key: "last_name", Value: 1},
				{Key: "_id", Value: 1},
			},
			Options: options.Index().SetName(
				"user_search_last_name_v1",
			),
		},
		{
			Keys: bson.D{
				{Key: "first_name", Value: 1},
				{Key: "last_name", Value: 1},
				{Key: "_id", Value: 1},
			},
			Options: options.Index().SetName(
				"user_search_full_name_v1",
			),
		},
	}

	_, err := service.collection.
		Indexes().
		CreateMany(
			ctx,
			indexModels,
		)

	return err
}

func (service *Service) SearchUsers(
	ctx context.Context,
	query string,
	limit int64,
) ([]UserResult, error) {
	normalizedQuery := normalizeQuery(query)

	if normalizedQuery == "" {
		return []UserResult{}, nil
	}

	searchContext, cancel := context.WithTimeout(
		ctx,
		searchTimeout,
	)
	defer cancel()

	filter := accountstate.ActiveFilter(buildNameFilter(
		normalizedQuery,
	))

	findOptions := options.Find().
		SetProjection(
			bson.M{
				"_id":               1,
				"first_name":        1,
				"last_name":         1,
				"profile_image_url": 1,
				"profile_title":     1,
			},
		).
		SetLimit(limit)

	cursor, err := service.collection.Find(
		searchContext,
		filter,
		findOptions,
	)

	if err != nil {
		return nil, err
	}

	defer cursor.Close(searchContext)

	documents := make(
		[]userDocument,
		0,
		limit,
	)

	if err := cursor.All(
		searchContext,
		&documents,
	); err != nil {
		return nil, err
	}

	users := make(
		[]UserResult,
		0,
		len(documents),
	)

	for _, document := range documents {
		users = append(
			users,
			UserResult{
				ID: document.ID.Hex(),

				FirstName: document.FirstName,

				LastName: document.LastName,

				ProfileImageURL: document.ProfileImageURL,

				ProfileTitle: document.ProfileTitle,
			},
		)
	}

	return users, nil
}

func normalizeQuery(
	value string,
) string {
	return strings.Join(
		strings.Fields(value),
		" ",
	)
}

func buildNameFilter(
	query string,
) bson.M {
	filters := bson.A{}

	filters = append(
		filters,
		buildPrefixFilters(
			"first_name",
			query,
		)...,
	)

	filters = append(
		filters,
		buildPrefixFilters(
			"last_name",
			query,
		)...,
	)

	words := strings.Fields(query)

	if len(words) > 1 {
		firstPart := words[0]

		lastPart := strings.Join(
			words[1:],
			" ",
		)

		// Search: Mahbub Alam
		filters = appendCombinedNameFilters(
			filters,
			firstPart,
			lastPart,
		)

		// Search: Alam Mahbub
		filters = appendCombinedNameFilters(
			filters,
			lastPart,
			firstPart,
		)
	}

	return bson.M{
		"$or": filters,
	}
}

func appendCombinedNameFilters(
	filters bson.A,
	firstNameQuery string,
	lastNameQuery string,
) bson.A {
	firstNameFilters := buildPrefixFilters(
		"first_name",
		firstNameQuery,
	)

	lastNameFilters := buildPrefixFilters(
		"last_name",
		lastNameQuery,
	)

	for _, firstNameFilter := range firstNameFilters {

		for _, lastNameFilter := range lastNameFilters {

			filters = append(
				filters,
				bson.M{
					"$and": bson.A{
						firstNameFilter,
						lastNameFilter,
					},
				},
			)
		}
	}

	return filters
}

func buildPrefixFilters(
	field string,
	value string,
) bson.A {
	variants := buildCaseVariants(
		value,
	)

	filters := make(
		bson.A,
		0,
		len(variants),
	)

	for _, variant := range variants {
		filters = append(
			filters,
			bson.M{
				field: bson.Regex{
					Pattern: "^" +
						regexp.QuoteMeta(
							variant,
						),
				},
			},
		)
	}

	return filters
}

func buildCaseVariants(
	value string,
) []string {
	lowercaseValue := strings.ToLower(
		value,
	)

	values := []string{
		value,
		lowercaseValue,
		strings.ToUpper(value),
		uppercaseFirst(
			lowercaseValue,
		),
	}

	variants := make(
		[]string,
		0,
		len(values),
	)

	seen := make(
		map[string]struct{},
		len(values),
	)

	for _, candidate := range values {
		if candidate == "" {
			continue
		}

		if _, exists := seen[candidate]; exists {
			continue
		}

		seen[candidate] = struct{}{}

		variants = append(
			variants,
			candidate,
		)
	}

	return variants
}

func uppercaseFirst(
	value string,
) string {
	characters := []rune(value)

	if len(characters) == 0 {
		return ""
	}

	characters[0] = unicode.ToUpper(
		characters[0],
	)

	return string(characters)
}
