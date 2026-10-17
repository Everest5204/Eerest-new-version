package profilemedia

import (
	"bytes"
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"path/filepath"
	"time"

	"everest-backend/internal/config"
)

const (
	cloudinaryResourceImage = "image"
	cloudinaryResourceVideo = "video"

	defaultUploadTimeout = 45 * time.Second
)

type CloudinaryService struct {
	cloudName string
	apiKey    string
	apiSecret string
	client    *http.Client
}

type CloudinaryUploadResult struct {
	SecureURL    string
	PublicID     string
	ResourceType string
	Width        int
	Height       int
}

type cloudinaryUploadResponse struct {
	SecureURL string `json:"secure_url"`
	URL       string `json:"url"`
	PublicID  string `json:"public_id"`
	Width     int    `json:"width"`
	Height    int    `json:"height"`
	Error     struct {
		Message string `json:"message"`
	} `json:"error"`
}

func NewCloudinaryService(cfg config.Config) (*CloudinaryService, error) {
	if cfg.CloudinaryCloudName == "" ||
		cfg.CloudinaryAPIKey == "" ||
		cfg.CloudinaryAPISecret == "" {
		return nil, errors.New("missing cloudinary configuration")
	}

	return &CloudinaryService{
		cloudName: cfg.CloudinaryCloudName,
		apiKey:    cfg.CloudinaryAPIKey,
		apiSecret: cfg.CloudinaryAPISecret,
		client: &http.Client{
			Timeout: defaultUploadTimeout,
		},
	}, nil
}

func (service *CloudinaryService) UploadImage(
	file multipart.File,
	folder string,
) (*CloudinaryUploadResult, error) {
	return service.UploadMedia(
		file,
		folder,
		cloudinaryResourceImage,
		"",
	)
}

func (service *CloudinaryService) UploadVideo(
	file multipart.File,
	folder string,
) (*CloudinaryUploadResult, error) {
	return service.UploadMedia(
		file,
		folder,
		cloudinaryResourceVideo,
		"",
	)
}

func (service *CloudinaryService) UploadMedia(
	file multipart.File,
	folder string,
	resourceType string,
	fileName string,
) (*CloudinaryUploadResult, error) {
	if service == nil {
		return nil, errors.New("cloudinary service is not initialized")
	}

	if file == nil {
		return nil, errors.New("media file is required")
	}

	if folder == "" {
		return nil, errors.New("cloudinary folder is required")
	}

	if resourceType != cloudinaryResourceImage && resourceType != cloudinaryResourceVideo {
		return nil, errors.New("invalid cloudinary resource type")
	}

	timestamp := time.Now().Unix()

	signature := service.createUploadSignature(folder, timestamp)

	body, contentType, err := service.createUploadBody(
		file,
		folder,
		fileName,
		timestamp,
		signature,
	)
	if err != nil {
		return nil, err
	}

	uploadURL := fmt.Sprintf(
		"https://api.cloudinary.com/v1_1/%s/%s/upload",
		service.cloudName,
		resourceType,
	)

	request, err := http.NewRequest(http.MethodPost, uploadURL, body)
	if err != nil {
		return nil, err
	}

	request.Header.Set("Content-Type", contentType)

	response, err := service.client.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()

	var result cloudinaryUploadResponse

	if err = json.NewDecoder(response.Body).Decode(&result); err != nil {
		return nil, err
	}

	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		if result.Error.Message != "" {
			return nil, fmt.Errorf("cloudinary upload failed: %s", result.Error.Message)
		}

		return nil, fmt.Errorf("cloudinary upload failed with status %d", response.StatusCode)
	}

	mediaURL := result.SecureURL
	if mediaURL == "" {
		mediaURL = result.URL
	}

	if mediaURL == "" {
		return nil, errors.New("cloudinary upload returned empty media url")
	}

	if result.PublicID == "" {
		return nil, errors.New("cloudinary upload returned empty public id")
	}

	return &CloudinaryUploadResult{
		SecureURL:    mediaURL,
		PublicID:     result.PublicID,
		ResourceType: resourceType,
		Width:        result.Width,
		Height:       result.Height,
	}, nil
}

func (service *CloudinaryService) createUploadSignature(
	folder string,
	timestamp int64,
) string {
	signatureBase := fmt.Sprintf(
		"folder=%s&timestamp=%d%s",
		folder,
		timestamp,
		service.apiSecret,
	)

	hash := sha1.Sum([]byte(signatureBase))

	return hex.EncodeToString(hash[:])
}

func (service *CloudinaryService) createUploadBody(
	file multipart.File,
	folder string,
	fileName string,
	timestamp int64,
	signature string,
) (*bytes.Buffer, string, error) {
	var body bytes.Buffer

	writer := multipart.NewWriter(&body)

	uploadFileName := cleanUploadFileName(fileName, timestamp)

	fileWriter, err := writer.CreateFormFile("file", uploadFileName)
	if err != nil {
		return nil, "", err
	}

	if _, err = io.Copy(fileWriter, file); err != nil {
		return nil, "", err
	}

	fields := map[string]string{
		"api_key":   service.apiKey,
		"timestamp": fmt.Sprintf("%d", timestamp),
		"folder":    folder,
		"signature": signature,
	}

	for key, value := range fields {
		if err = writer.WriteField(key, value); err != nil {
			return nil, "", err
		}
	}

	if err = writer.Close(); err != nil {
		return nil, "", err
	}

	return &body, writer.FormDataContentType(), nil
}

func cleanUploadFileName(fileName string, timestamp int64) string {
	if fileName == "" {
		return fmt.Sprintf("everest-%d", timestamp)
	}

	cleanName := filepath.Base(fileName)

	if cleanName == "." || cleanName == "/" || cleanName == "\\" {
		return fmt.Sprintf("everest-%d", timestamp)
	}

	return cleanName
}
