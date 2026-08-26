package config

import (
	"log"
	"os"

	"github.com/joho/godotenv"
)

type Config struct {
	Port string

	MongoURI string
	DBName   string

	JWTSecret string

	GeminiAPIKey string
	GeminiModel  string

	CloudinaryCloudName string
	CloudinaryAPIKey    string
	CloudinaryAPISecret string
}

func LoadConfig() Config {
	loadEnvFile(".env")
	loadEnvFile(".env.ai")

	config := Config{
		Port: getEnv("PORT", "5000"),

		MongoURI: getEnv("MONGODB_URI", ""),
		DBName:   getEnv("DB_NAME", ""),

		JWTSecret: getEnv("JWT_SECRET", ""),

		GeminiAPIKey: getEnv("GEMINI_API_KEY", ""),
		GeminiModel: getEnv(
			"GEMINI_MODEL",
			"gemini-3.5-flash-lite",
		),

		CloudinaryCloudName: getEnv("CLOUDINARY_CLOUD_NAME", ""),
		CloudinaryAPIKey:    getEnv("CLOUDINARY_API_KEY", ""),
		CloudinaryAPISecret: getEnv("CLOUDINARY_API_SECRET", ""),
	}

	return config
}

func loadEnvFile(path string) {
	if err := godotenv.Load(path); err != nil &&
		!os.IsNotExist(err) {

		log.Printf(
			"Unable to load %s: %v",
			path,
			err,
		)
	}
}

func getEnv(key string, fallback string) string {
	value := os.Getenv(key)

	if value == "" {
		return fallback
	}

	return value
}