package postdelete

import (
	"context"
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"everest-backend/internal/config"
)

const (
	cloudinaryDeleteResourceImage = "image"
	cloudinaryDeleteResourceVideo = "video"

	cloudinaryDeleteHTTPTimeout = 45 * time.Second

	cloudinaryDeleteMaxResponseBytes int64 = 1 << 20
)

type CloudinaryDeleteService struct {
	cloudName string
	apiKey    string
	apiSecret string
	client    *http.Client
}

type cloudinaryDeleteResponse struct {
	Result string `json:"result"`

	Error struct {
		Message string `json:"message"`
	} `json:"error"`
}

func NewCloudinaryDeleteService(
	cfg config.Config,
) (*CloudinaryDeleteService, error) {
	if strings.TrimSpace(
		cfg.CloudinaryCloudName,
	) == "" {
		return nil, errors.New(
			"cloudinary cloud name is missing",
		)
	}

	if strings.TrimSpace(
		cfg.CloudinaryAPIKey,
	) == "" {
		return nil, errors.New(
			"cloudinary api key is missing",
		)
	}

	if strings.TrimSpace(
		cfg.CloudinaryAPISecret,
	) == "" {
		return nil, errors.New(
			"cloudinary api secret is missing",
		)
	}

	return &CloudinaryDeleteService{
		cloudName: strings.TrimSpace(
			cfg.CloudinaryCloudName,
		),
		apiKey: strings.TrimSpace(
			cfg.CloudinaryAPIKey,
		),
		apiSecret: strings.TrimSpace(
			cfg.CloudinaryAPISecret,
		),
		client: &http.Client{
			Timeout: cloudinaryDeleteHTTPTimeout,
		},
	}, nil
}

// DeleteMedia permanently deletes one Cloudinary asset.
// "not found" is treated as success so retrying is safe.
func (service *CloudinaryDeleteService) DeleteMedia(
	ctx context.Context,
	publicID string,
	resourceType string,
) error {
	if service == nil || service.client == nil {
		return errors.New(
			"cloudinary delete service is not initialized",
		)
	}

	publicID = strings.TrimSpace(publicID)
	if publicID == "" {
		return errors.New(
			"cloudinary public id is required",
		)
	}

	cleanResourceType, err :=
		normalizeCloudinaryDeleteResourceType(
			resourceType,
		)
	if err != nil {
		return err
	}

	timestamp := time.Now().Unix()

	signature := service.createDeleteSignature(
		publicID,
		timestamp,
	)

	form := url.Values{}
	form.Set("public_id", publicID)
	form.Set(
		"timestamp",
		fmt.Sprintf("%d", timestamp),
	)
	form.Set("api_key", service.apiKey)
	form.Set("signature", signature)
	form.Set("invalidate", "true")

	deleteURL := fmt.Sprintf(
		"https://api.cloudinary.com/v1_1/%s/%s/destroy",
		service.cloudName,
		cleanResourceType,
	)

	request, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		deleteURL,
		strings.NewReader(form.Encode()),
	)
	if err != nil {
		return err
	}

	request.Header.Set(
		"Content-Type",
		"application/x-www-form-urlencoded",
	)
	request.Header.Set(
		"Accept",
		"application/json",
	)
	request.Header.Set(
		"Cache-Control",
		"no-store",
	)

	response, err := service.client.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()

	var result cloudinaryDeleteResponse

	responseReader := io.LimitReader(
		response.Body,
		cloudinaryDeleteMaxResponseBytes,
	)

	if err = json.NewDecoder(
		responseReader,
	).Decode(&result); err != nil {
		return fmt.Errorf(
			"cloudinary delete response decode failed: %w",
			err,
		)
	}

	if response.StatusCode < http.StatusOK ||
		response.StatusCode >=
			http.StatusMultipleChoices {
		if result.Error.Message != "" {
			return fmt.Errorf(
				"cloudinary delete failed: %s",
				result.Error.Message,
			)
		}

		return fmt.Errorf(
			"cloudinary delete failed with status %d",
			response.StatusCode,
		)
	}

	switch strings.ToLower(
		strings.TrimSpace(result.Result),
	) {
	case "ok", "not found":
		return nil

	default:
		return fmt.Errorf(
			"unexpected cloudinary delete result: %s",
			result.Result,
		)
	}
}

func (service *CloudinaryDeleteService) createDeleteSignature(
	publicID string,
	timestamp int64,
) string {
	signatureBase := fmt.Sprintf(
		"invalidate=true&public_id=%s&timestamp=%d%s",
		publicID,
		timestamp,
		service.apiSecret,
	)

	hash := sha1.Sum(
		[]byte(signatureBase),
	)

	return hex.EncodeToString(hash[:])
}

func normalizeCloudinaryDeleteResourceType(
	resourceType string,
) (string, error) {
	cleanType := strings.ToLower(
		strings.TrimSpace(resourceType),
	)

	// Older image posts may have empty media_type.
	if cleanType == "" {
		return cloudinaryDeleteResourceImage, nil
	}

	switch cleanType {
	case cloudinaryDeleteResourceImage:
		return cloudinaryDeleteResourceImage, nil

	case cloudinaryDeleteResourceVideo:
		return cloudinaryDeleteResourceVideo, nil

	default:
		return "", errors.New(
			"invalid cloudinary delete resource type",
		)
	}
}