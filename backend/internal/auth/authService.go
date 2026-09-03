package auth

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"log"
	"math/big"
	"net/smtp"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"golang.org/x/crypto/bcrypt"
	"google.golang.org/api/idtoken"
)

const authOperationTimeout = 10 * time.Second

var (
	emailPattern = regexp.MustCompile(
		`^[^\s@]+@[^\s@]+\.[^\s@]+$`,
	)

	bangladeshPhonePattern = regexp.MustCompile(
		`^(\+8801|01)[3-9][0-9]{8}$`,
	)
)

type AuthService struct {
	Collection     *mongo.Collection
	GoogleClientID string

	googleValidator    *idtoken.Validator
	googleValidatorErr error
}

type googleIdentity struct {
	Subject   string
	Email     string
	FirstName string
	LastName  string
}

func NewAuthService(
	db *mongo.Database,
	googleClientID string,
) *AuthService {
	validator, validatorErr := idtoken.NewValidator(
		context.Background(),
	)

	return &AuthService{
		Collection:         db.Collection("users"),
		GoogleClientID:     strings.TrimSpace(googleClientID),
		googleValidator:    validator,
		googleValidatorErr: validatorErr,
	}
}

func (service *AuthService) Signup(
	request SignupRequest,
) (*User, error) {
	ctx, cancel := context.WithTimeout(
		context.Background(),
		authOperationTimeout,
	)
	defer cancel()

	emailOrPhone := normalizeEmailOrPhone(
		request.EmailOrPhone,
	)

	if !isValidEmailOrPhone(emailOrPhone) {
		return nil, errors.New(
			"enter a valid email or Bangladesh phone number",
		)
	}

	if len(request.Password) < 6 {
		return nil, errors.New(
			"password must be at least 6 characters",
		)
	}

	if err := validateProfile(
		request.FirstName,
		request.LastName,
		request.Gender,
		request.BirthMonth,
		request.BirthDay,
		request.BirthYear,
	); err != nil {
		return nil, err
	}

	existingResult := service.Collection.FindOne(
		ctx,
		bson.M{
			"email_or_phone": emailOrPhone,
		},
	)

	switch err := existingResult.Err(); {
	case err == nil:
		return nil, errors.New(
			"account already exists",
		)

	case !errors.Is(err, mongo.ErrNoDocuments):
		return nil, errors.New(
			"failed to check existing account",
		)
	}

	hashedPassword, err := bcrypt.GenerateFromPassword(
		[]byte(request.Password),
		bcrypt.DefaultCost,
	)

	if err != nil {
		return nil, errors.New(
			"failed to secure password",
		)
	}

	user := User{
		ID:           bson.NewObjectID(),
		FirstName:    strings.TrimSpace(request.FirstName),
		LastName:     strings.TrimSpace(request.LastName),
		EmailOrPhone: emailOrPhone,
		Password:     string(hashedPassword),

		Gender:     strings.ToLower(strings.TrimSpace(request.Gender)),
		BirthMonth: request.BirthMonth,
		BirthDay:   request.BirthDay,
		BirthYear:  request.BirthYear,

		EmailVerified: false,
		CreatedAt:     time.Now().UTC(),
	}

	_, err = service.Collection.InsertOne(
		ctx,
		user,
	)

	if err != nil {
		if mongo.IsDuplicateKeyError(err) {
			return nil, errors.New(
				"account already exists",
			)
		}

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
		authOperationTimeout,
	)
	defer cancel()

	emailOrPhone := normalizeEmailOrPhone(
		request.EmailOrPhone,
	)

	var user User

	err := service.Collection.FindOne(
		ctx,
		bson.M{
			"email_or_phone": emailOrPhone,
		},
	).Decode(&user)

	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, errors.New(
			"no account found with this email or phone",
		)
	}

	if err != nil {
		return nil, errors.New(
			"login failed",
		)
	}

	if user.Password == "" {
		return nil, errors.New(
			"please continue with Google to sign in",
		)
	}

	err = bcrypt.CompareHashAndPassword(
		[]byte(user.Password),
		[]byte(request.Password),
	)

	if err != nil {
		return nil, errors.New(
			"invalid password",
		)
	}

	user.Password = ""

	return &user, nil
}

func (service *AuthService) GoogleAuth(
	request GoogleAuthRequest,
) (*User, *GoogleProfile, bool, error) {
	ctx, cancel := context.WithTimeout(
		context.Background(),
		authOperationTimeout,
	)
	defer cancel()

	identity, err := service.verifyGoogleCredential(
		ctx,
		request.Credential,
	)

	if err != nil {
		return nil, nil, false, err
	}

	var user User

	err = service.Collection.FindOne(
		ctx,
		bson.M{
			"google_subject": identity.Subject,
		},
	).Decode(&user)

	if err == nil {
		if !user.EmailVerified {
			_, updateErr := service.Collection.UpdateOne(
				ctx,
				bson.M{
					"_id": user.ID,
				},
				bson.M{
					"$set": bson.M{
						"email_verified": true,
					},
				},
			)

			if updateErr != nil {
				return nil, nil, false, errors.New(
					"failed to update Google account",
				)
			}

			user.EmailVerified = true
		}

		user.Password = ""

		return &user, nil, false, nil
	}

	if !errors.Is(err, mongo.ErrNoDocuments) {
		return nil, nil, false, errors.New(
			"Google authentication failed",
		)
	}

	err = service.Collection.FindOne(
		ctx,
		bson.M{
			"email_or_phone": identity.Email,
		},
	).Decode(&user)

	if err == nil {
		if user.GoogleSubject != "" &&
			user.GoogleSubject != identity.Subject {
			return nil, nil, false, errors.New(
				"this email is already linked to another Google account",
			)
		}

		_, updateErr := service.Collection.UpdateOne(
			ctx,
			bson.M{
				"_id": user.ID,
			},
			bson.M{
				"$set": bson.M{
					"google_subject": identity.Subject,
					"email_verified": true,
				},
			},
		)

		if updateErr != nil {
			if mongo.IsDuplicateKeyError(updateErr) {
				return nil, nil, false, errors.New(
					"this Google account is already linked",
				)
			}

			return nil, nil, false, errors.New(
				"failed to link Google account",
			)
		}

		user.GoogleSubject = identity.Subject
		user.EmailVerified = true
		user.Password = ""

		return &user, nil, false, nil
	}

	if !errors.Is(err, mongo.ErrNoDocuments) {
		return nil, nil, false, errors.New(
			"Google authentication failed",
		)
	}

	profile := &GoogleProfile{
		Email:     identity.Email,
		FirstName: identity.FirstName,
		LastName:  identity.LastName,
	}

	return nil, profile, true, nil
}

func (service *AuthService) GoogleSignup(
	request GoogleSignupRequest,
) (*User, error) {
	ctx, cancel := context.WithTimeout(
		context.Background(),
		authOperationTimeout,
	)
	defer cancel()

	identity, err := service.verifyGoogleCredential(
		ctx,
		request.Credential,
	)

	if err != nil {
		return nil, err
	}

	if err := validateProfile(
		request.FirstName,
		request.LastName,
		request.Gender,
		request.BirthMonth,
		request.BirthDay,
		request.BirthYear,
	); err != nil {
		return nil, err
	}

	existingResult := service.Collection.FindOne(
		ctx,
		bson.M{
			"$or": bson.A{
				bson.M{
					"google_subject": identity.Subject,
				},
				bson.M{
					"email_or_phone": identity.Email,
				},
			},
		},
	)

	switch lookupErr := existingResult.Err(); {
	case lookupErr == nil:
		return nil, errors.New(
			"account already exists",
		)

	case !errors.Is(lookupErr, mongo.ErrNoDocuments):
		return nil, errors.New(
			"failed to check existing account",
		)
	}

	user := User{
		ID:           bson.NewObjectID(),
		FirstName:    strings.TrimSpace(request.FirstName),
		LastName:     strings.TrimSpace(request.LastName),
		EmailOrPhone: identity.Email,

		Gender:     strings.ToLower(strings.TrimSpace(request.Gender)),
		BirthMonth: request.BirthMonth,
		BirthDay:   request.BirthDay,
		BirthYear:  request.BirthYear,

		EmailVerified: true,
		GoogleSubject: identity.Subject,
		CreatedAt:     time.Now().UTC(),
	}

	_, err = service.Collection.InsertOne(
		ctx,
		user,
	)

	if err != nil {
		if mongo.IsDuplicateKeyError(err) {
			return nil, errors.New(
				"account already exists",
			)
		}

		return nil, errors.New(
			"failed to create Google account",
		)
	}

	return &user, nil
}

func (service *AuthService) verifyGoogleCredential(
	ctx context.Context,
	credential string,
) (*googleIdentity, error) {
	credential = strings.TrimSpace(credential)

	if credential == "" {
		return nil, errors.New(
			"Google credential is required",
		)
	}

	if service.GoogleClientID == "" {
		return nil, errors.New(
			"Google authentication is not configured",
		)
	}

	if service.googleValidatorErr != nil ||
		service.googleValidator == nil {
		log.Printf(
			"google ID-token validator initialization failed: %v",
			service.googleValidatorErr,
		)

		return nil, errors.New(
			"Google authentication is temporarily unavailable",
		)
	}

	payload, err := service.googleValidator.Validate(
		ctx,
		credential,
		service.GoogleClientID,
	)

	if err != nil {
		// ParsePayload is used only to identify a local configuration
		// mismatch. The unverified payload is never used to authenticate.
		unverifiedPayload, parseErr := idtoken.ParsePayload(
			credential,
		)

		if parseErr == nil &&
			unverifiedPayload.Audience != "" &&
			unverifiedPayload.Audience != service.GoogleClientID {
			log.Printf(
				"google ID-token audience mismatch: frontend and backend client IDs differ",
			)

			return nil, errors.New(
				"Google sign-in configuration mismatch",
			)
		}

		if parseErr == nil &&
			unverifiedPayload.Expires > 0 &&
			time.Now().UTC().Unix() >= unverifiedPayload.Expires {
			return nil, errors.New(
				"Google credential expired; please try again",
			)
		}

		log.Printf(
			"google ID-token validation failed: %v",
			err,
		)

		return nil, errors.New(
			"invalid or expired Google credential",
		)
	}

	subject := strings.TrimSpace(
		payload.Subject,
	)

	email := normalizeEmailOrPhone(
		getStringClaim(
			payload.Claims,
			"email",
		),
	)

	emailVerified := getBoolClaim(
		payload.Claims,
		"email_verified",
	)

	if subject == "" ||
		email == "" ||
		!emailVerified {
		return nil, errors.New(
			"Google email could not be verified",
		)
	}

	firstName := strings.TrimSpace(
		getStringClaim(
			payload.Claims,
			"given_name",
		),
	)

	lastName := strings.TrimSpace(
		getStringClaim(
			payload.Claims,
			"family_name",
		),
	)

	if firstName == "" && lastName == "" {
		fullName := strings.TrimSpace(
			getStringClaim(
				payload.Claims,
				"name",
			),
		)

		nameParts := strings.Fields(
			fullName,
		)

		if len(nameParts) > 0 {
			firstName = nameParts[0]
		}

		if len(nameParts) > 1 {
			lastName = strings.Join(
				nameParts[1:],
				" ",
			)
		}
	}

	return &googleIdentity{
		Subject:   subject,
		Email:     email,
		FirstName: firstName,
		LastName:  lastName,
	}, nil
}

func (service *AuthService) ForgotPassword(
	request ForgotPasswordRequest,
) error {
	ctx, cancel := context.WithTimeout(
		context.Background(),
		authOperationTimeout,
	)
	defer cancel()

	emailOrPhone := normalizeEmailOrPhone(
		request.EmailOrPhone,
	)

	var user User

	err := service.Collection.FindOne(
		ctx,
		bson.M{
			"email_or_phone": emailOrPhone,
		},
	).Decode(&user)

	if errors.Is(err, mongo.ErrNoDocuments) {
		return errors.New(
			"no account found with this email or phone",
		)
	}

	if err != nil {
		return errors.New(
			"failed to find account",
		)
	}

	codeLength := 6

	if !strings.Contains(emailOrPhone, "@") {
		codeLength = 5
	}

	code, err := generateResetCode(
		codeLength,
	)

	if err != nil {
		return errors.New(
			"failed to create verification code",
		)
	}

	expireTime := time.Now().UTC().Add(
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
		"phone OTP is not available yet; please use email to reset your password",
	)
}

func (service *AuthService) VerifyResetCode(
	request VerifyResetCodeRequest,
) error {
	ctx, cancel := context.WithTimeout(
		context.Background(),
		authOperationTimeout,
	)
	defer cancel()

	emailOrPhone := normalizeEmailOrPhone(
		request.EmailOrPhone,
	)

	var user User

	err := service.Collection.FindOne(
		ctx,
		bson.M{
			"email_or_phone": emailOrPhone,
		},
	).Decode(&user)

	if errors.Is(err, mongo.ErrNoDocuments) {
		return errors.New(
			"no account found with this email or phone",
		)
	}

	if err != nil {
		return errors.New(
			"failed to find account",
		)
	}

	if user.ResetCode != request.Code {
		return errors.New(
			"invalid verification code",
		)
	}

	if time.Now().UTC().After(
		user.ResetCodeExpAt,
	) {
		return errors.New(
			"verification code expired",
		)
	}

	return nil
}

func (service *AuthService) ResetPassword(
	request ResetPasswordRequest,
) error {
	ctx, cancel := context.WithTimeout(
		context.Background(),
		authOperationTimeout,
	)
	defer cancel()

	emailOrPhone := normalizeEmailOrPhone(
		request.EmailOrPhone,
	)

	if len(request.NewPassword) < 6 {
		return errors.New(
			"password must be at least 6 characters",
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
				"$gt": time.Now().UTC(),
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
			"reset session expired; please try again",
		)
	}

	return nil
}

func (service *AuthService) GetUserByID(
	userID string,
) (*User, error) {
	ctx, cancel := context.WithTimeout(
		context.Background(),
		authOperationTimeout,
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

	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, errors.New(
			"user not found",
		)
	}

	if err != nil {
		return nil, errors.New(
			"failed to find user",
		)
	}

	user.Password = ""

	return &user, nil
}

func normalizeEmailOrPhone(
	value string,
) string {
	value = strings.TrimSpace(
		value,
	)

	if strings.Contains(
		value,
		"@",
	) {
		return strings.ToLower(
			value,
		)
	}

	return value
}

func isValidEmailOrPhone(
	value string,
) bool {
	return emailPattern.MatchString(
		value,
	) || bangladeshPhonePattern.MatchString(
		value,
	)
}

func validateProfile(
	firstName string,
	lastName string,
	gender string,
	birthMonth int,
	birthDay int,
	birthYear int,
) error {
	firstName = strings.TrimSpace(
		firstName,
	)

	lastName = strings.TrimSpace(
		lastName,
	)

	if firstName == "" || lastName == "" {
		return errors.New(
			"first name and last name are required",
		)
	}

	combinedName := strings.Join(
		strings.Fields(
			firstName + lastName,
		),
		"",
	)

	if len([]rune(combinedName)) > 30 {
		return errors.New(
			"first name and last name together cannot exceed 30 characters",
		)
	}

	gender = strings.ToLower(
		strings.TrimSpace(
			gender,
		),
	)

	switch gender {
	case "male", "female", "other":
	default:
		return errors.New(
			"please select a valid gender",
		)
	}

	if !isValidBirthDate(
		birthYear,
		birthMonth,
		birthDay,
	) {
		return errors.New(
			"please select a valid birthdate",
		)
	}

	return nil
}

func isValidBirthDate(
	year int,
	month int,
	day int,
) bool {
	currentTime := time.Now().UTC()

	if year < 1900 ||
		year > currentTime.Year() ||
		month < 1 ||
		month > 12 ||
		day < 1 ||
		day > 31 {
		return false
	}

	birthDate := time.Date(
		year,
		time.Month(month),
		day,
		0,
		0,
		0,
		0,
		time.UTC,
	)

	if birthDate.Year() != year ||
		int(birthDate.Month()) != month ||
		birthDate.Day() != day {
		return false
	}

	return !birthDate.After(
		currentTime,
	)
}

func getStringClaim(
	claims map[string]interface{},
	key string,
) string {
	value, ok := claims[key].(string)

	if !ok {
		return ""
	}

	return strings.TrimSpace(
		value,
	)
}

func getBoolClaim(
	claims map[string]interface{},
	key string,
) bool {
	switch value := claims[key].(type) {
	case bool:
		return value

	case string:
		parsedValue, err := strconv.ParseBool(
			value,
		)

		return err == nil && parsedValue

	default:
		return false
	}
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

	portNumber, err := strconv.Atoi(
		port,
	)

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
