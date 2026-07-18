package auth

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"math/big"
	"net/smtp"
	"os"
	"strconv"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

type AuthService struct {
	Collection *mongo.Collection
}

func NewAuthService(db *mongo.Database) *AuthService {
	return &AuthService{
		Collection: db.Collection("users"),
	}
}

func (service *AuthService) Signup(request SignupRequest) (*User, error) {
	ctx, cancel := context.WithTimeout(
		context.Background(),
		10*time.Second,
	)

	defer cancel()

	emailOrPhone := strings.TrimSpace(
		request.EmailOrPhone,
	)

	existingUser := service.Collection.FindOne(
		ctx,
		bson.M{
			"email_or_phone": emailOrPhone,
		},
	)

	if existingUser.Err() == nil {
		return nil, errors.New(
			"account already exists",
		)
	}

	hashedPassword, err := bcrypt.GenerateFromPassword(
		[]byte(request.Password),
		bcrypt.DefaultCost,
	)

	if err != nil {
		return nil, errors.New(
			"failed to hash password",
		)
	}

	user := User{
		ID:           bson.NewObjectID(),
		FirstName:    strings.TrimSpace(request.FirstName),
		LastName:     strings.TrimSpace(request.LastName),
		EmailOrPhone: emailOrPhone,
		Password:     string(hashedPassword),
		Gender:       request.Gender,
		BirthMonth:   request.BirthMonth,
		BirthDay:     request.BirthDay,
		BirthYear:    request.BirthYear,
		CreatedAt:    time.Now(),
	}

	_, err = service.Collection.InsertOne(
		ctx,
		user,
	)

	if err != nil {
		return nil, errors.New(
			"failed to create account",
		)
	}

	user.Password = ""

	return &user, nil
}

func (service *AuthService) Login(
	request LoginRequest,
) (*User, error) {
	ctx, cancel := context.WithTimeout(
		context.Background(),
		10*time.Second,
	)

	defer cancel()

	var user User

	err := service.Collection.FindOne(
		ctx,
		bson.M{
			"email_or_phone": strings.TrimSpace(
				request.EmailOrPhone,
			),
		},
	).Decode(&user)

	if err != nil {
		return nil, errors.New(
			"No account found with this email or phone",
		)
	}

	err = bcrypt.CompareHashAndPassword(
		[]byte(user.Password),
		[]byte(request.Password),
	)

	if err != nil {
		return nil, errors.New(
			"Invalid password",
		)
	}

	user.Password = ""

	return &user, nil
}

func (service *AuthService) GoogleAuth(
	request GoogleAuthRequest,
) (*User, bool, error) {
	ctx, cancel := context.WithTimeout(
		context.Background(),
		10*time.Second,
	)

	defer cancel()

	email := strings.TrimSpace(request.Email)

	var user User

	err := service.Collection.FindOne(
		ctx,
		bson.M{
			"email_or_phone": email,
		},
	).Decode(&user)

	if err != nil {
		if err == mongo.ErrNoDocuments {
			return nil, true, nil
		}

		return nil, false, errors.New(
			"google authentication failed",
		)
	}

	user.Password = ""

	return &user, false, nil
}

func (service *AuthService) ForgotPassword(
	request ForgotPasswordRequest,
) error {
	ctx, cancel := context.WithTimeout(
		context.Background(),
		10*time.Second,
	)

	defer cancel()

	emailOrPhone := strings.TrimSpace(
		request.EmailOrPhone,
	)

	var user User

	err := service.Collection.FindOne(
		ctx,
		bson.M{
			"email_or_phone": emailOrPhone,
		},
	).Decode(&user)

	if err != nil {
		return errors.New(
			"No account found with this email or phone",
		)
	}

	codeLength := 6

	if !strings.Contains(emailOrPhone, "@") {
		codeLength = 5
	}

	code, err := generateResetCode(codeLength)

	if err != nil {
		return errors.New(
			"failed to create verification code",
		)
	}

	expireTime := time.Now().Add(
		10 * time.Minute,
	)

	_, err = service.Collection.UpdateOne(
		ctx,
		bson.M{
			"_id": user.ID,
		},
		bson.M{
			"$set": bson.M{
				"reset_code":        code,
				"reset_code_exp_at": expireTime,
			},
		},
	)

	if err != nil {
		return errors.New(
			"failed to create verification code",
		)
	}

	if strings.Contains(emailOrPhone, "@") {
		if err := sendResetCodeEmail(
			emailOrPhone,
			code,
		); err != nil {
			return errors.New(
				"failed to send verification code",
			)
		}

		return nil
	}

	return errors.New(
		"Phone OTP is not available yet. Please use your email to reset password.",
	)
}

func (service *AuthService) VerifyResetCode(
	request VerifyResetCodeRequest,
) error {
	ctx, cancel := context.WithTimeout(
		context.Background(),
		10*time.Second,
	)

	defer cancel()

	var user User

	err := service.Collection.FindOne(
		ctx,
		bson.M{
			"email_or_phone": strings.TrimSpace(
				request.EmailOrPhone,
			),
		},
	).Decode(&user)

	if err != nil {
		return errors.New(
			"No account found with this email or phone",
		)
	}

	if user.ResetCode != request.Code {
		return errors.New(
			"Invalid verification code",
		)
	}

	if time.Now().After(
		user.ResetCodeExpAt,
	) {
		return errors.New(
			"Verification code expired",
		)
	}

	return nil
}

func (service *AuthService) ResetPassword(
	request ResetPasswordRequest,
) error {
	ctx, cancel := context.WithTimeout(
		context.Background(),
		10*time.Second,
	)

	defer cancel()

	emailOrPhone := strings.TrimSpace(
		request.EmailOrPhone,
	)

	if len(request.NewPassword) < 6 {
		return errors.New(
			"Password must be at least 6 characters",
		)
	}

	hashedPassword, err := bcrypt.GenerateFromPassword(
		[]byte(request.NewPassword),
		bcrypt.DefaultCost,
	)

	if err != nil {
		return errors.New(
			"failed to reset password",
		)
	}

	result, err := service.Collection.UpdateOne(
		ctx,
		bson.M{
			"email_or_phone": emailOrPhone,
			"reset_code": bson.M{
				"$ne": "",
			},
			"reset_code_exp_at": bson.M{
				"$gt": time.Now(),
			},
		},
		bson.M{
			"$set": bson.M{
				"password": string(hashedPassword),
			},
			"$unset": bson.M{
				"reset_code":        "",
				"reset_code_exp_at": "",
			},
		},
	)

	if err != nil {
		return errors.New(
			"failed to reset password",
		)
	}

	if result.MatchedCount == 0 {
		return errors.New(
			"Reset session expired. Please try again",
		)
	}

	return nil
}

func (service *AuthService) GetUserByID(
	userID string,
) (*User, error) {
	ctx, cancel := context.WithTimeout(
		context.Background(),
		10*time.Second,
	)

	defer cancel()

	objectID, err := bson.ObjectIDFromHex(
		userID,
	)

	if err != nil {
		return nil, errors.New(
			"invalid user id",
		)
	}

	var user User

	err = service.Collection.FindOne(
		ctx,
		bson.M{
			"_id": objectID,
		},
	).Decode(&user)

	if err != nil {
		return nil, errors.New(
			"user not found",
		)
	}

	user.Password = ""

	return &user, nil
}

func generateResetCode(
	length int,
) (string, error) {
	maxValue := int64(1)

	for index := 0; index < length; index++ {
		maxValue *= 10
	}

	number, err := rand.Int(
		rand.Reader,
		big.NewInt(maxValue),
	)

	if err != nil {
		return "", err
	}

	format := fmt.Sprintf(
		"%%0%dd",
		length,
	)

	return fmt.Sprintf(
		format,
		number.Int64(),
	), nil
}

func sendResetCodeEmail(
	to string,
	code string,
) error {
	host := os.Getenv("SMTP_HOST")
	port := os.Getenv("SMTP_PORT")
	email := os.Getenv("SMTP_EMAIL")
	password := os.Getenv("SMTP_PASSWORD")

	if host == "" ||
		port == "" ||
		email == "" ||
		password == "" {
		return errors.New(
			"missing smtp configuration",
		)
	}

	portNumber, err := strconv.Atoi(port)

	if err != nil || portNumber <= 0 {
		return errors.New(
			"invalid smtp port",
		)
	}

	auth := smtp.PlainAuth(
		"",
		email,
		password,
		host,
	)

	subject := "Everest Password Reset Verification Code"

	body := fmt.Sprintf(
		"Your Everest verification code is: %s\n\nThis code will expire in 10 minutes.\n\nIf you did not request this, please ignore this email.",
		code,
	)

	message := []byte(
		"From: Everest <" + email + ">\r\n" +
			"To: " + to + "\r\n" +
			"Subject: " + subject + "\r\n" +
			"MIME-Version: 1.0\r\n" +
			"Content-Type: text/plain; charset=UTF-8\r\n" +
			"\r\n" +
			body,
	)

	return smtp.SendMail(
		host+":"+port,
		auth,
		email,
		[]string{to},
		message,
	)
}