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

	CloudinaryCloudName string
	CloudinaryAPIKey    string
	CloudinaryAPISecret string
}

func LoadConfig() Config {
	err := godotenv.Load()

	if err != nil {
		log.Println(".env file not found")
	}

	config := Config{
		Port: getEnv("PORT", "5000"),

		MongoURI: getEnv("MONGODB_URI", ""),
		DBName:   getEnv("DB_NAME", ""),

		JWTSecret: getEnv("JWT_SECRET", ""),

		CloudinaryCloudName: getEnv("CLOUDINARY_CLOUD_NAME", ""),
		CloudinaryAPIKey:    getEnv("CLOUDINARY_API_KEY", ""),
		CloudinaryAPISecret: getEnv("CLOUDINARY_API_SECRET", ""),
	}

	log.Println("CLOUDINARY NAME:", config.CloudinaryCloudName)
	log.Println("CLOUDINARY KEY:", config.CloudinaryAPIKey)

	return config
}

func getEnv(key string, fallback string) string {
	value := os.Getenv(key)

	if value == "" {
		return fallback
	}

	return value
}