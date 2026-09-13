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
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"go.mongodb.org/mongo-driver/v2/mongo/readconcern"
	"go.mongodb.org/mongo-driver/v2/mongo/readpref"
	"go.mongodb.org/mongo-driver/v2/mongo/writeconcern"
	"golang.org/x/crypto/bcrypt"
	"google.golang.org/api/idtoken"
)

const (
	authOperationTimeout    = 10 * time.Second
	authResetCodeLength     = 6
	authResetCodeLifetime   = 10 * time.Minute
	authResetResendInterval = time.Minute
	authResetMaxAttempts    = 5
)

var (
	emailPattern = regexp.MustCompile(
		`^[^\s@]+@[^\s@]+\.[^\s@]+$`,
	)

	bangladeshPhonePattern = regexp.MustCompile(
		`^(\+8801|01)[3-9][0-9]{8}$`,
	)

	ErrAuthAccountUnavailable = errors.New(
		"this account is unavailable or is being deleted",
	)

	ErrAuthAccountStatusUnavailable = errors.New(
		"account verification is temporarily unavailable; please try again",
	)

	ErrAuthResetCodeInvalid = errors.New(
		"verification code is invalid, expired, or has reached its attempt limit; request a new code",
	)

	ErrAuthResetRequestTooSoon = errors.New(
		"please wait 60 seconds before requesting another verification code",
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

type passwordResetAccount struct {
	ID          bson.ObjectID `bson:"_id"`
	RequestedAt time.Time     `bson:"reset_code_requested_at"`
}

type passwordResetSession struct {
	ID        bson.ObjectID `bson:"_id"`
	CodeID    bson.ObjectID `bson:"reset_code_id"`
	CodeHash  string        `bson:"reset_code"`
	ExpiresAt time.Time     `bson:"reset_code_exp_at"`
}

func NewAuthService(
	db *mongo.Database,
	googleClientID string,
) *AuthService {
	validator, validatorErr := idtoken.NewValidator(
		context.Background(),
	)

	return &AuthService{
		Collection: db.Collection(
			"users",
			options.Collection().
				SetReadConcern(readconcern.Majority()).
				SetReadPreference(readpref.Primary()).
				SetWriteConcern(writeconcern.Majority()),
		),
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

	emailOrPhone := normalizeEmailOrPhone(request.EmailOrPhone)

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

	if len(request.Password) > 72 {
		return nil, errors.New(
			"password is too long; please use a shorter password",
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
		return nil, errors.New("account already exists")

	case !errors.Is(err, mongo.ErrNoDocuments):
		return nil, ErrAuthAccountStatusUnavailable
	}

	hashedPassword, err := bcrypt.GenerateFromPassword(
		[]byte(request.Password),
		bcrypt.DefaultCost,
	)
	if err != nil {
		return nil, errors.New("failed to secure password")
	}

	user := User{
		ID:           bson.NewObjectID(),
		FirstName:    strings.TrimSpace(request.FirstName),
		LastName:     strings.TrimSpace(request.LastName),
		EmailOrPhone: emailOrPhone,
		Password:     string(hashedPassword),
		Gender:       strings.ToLower(strings.TrimSpace(request.Gender)),
		BirthMonth:   request.BirthMonth,
		BirthDay:     request.BirthDay,
		BirthYear:    request.BirthYear,

		EmailVerified: false,
		CreatedAt:     time.Now().UTC(),
	}

	_, err = service.Collection.InsertOne(ctx, user)
	if err != nil {
		if mongo.IsDuplicateKeyError(err) {
			return nil, errors.New("account already exists")
		}

		return nil, ErrAuthAccountStatusUnavailable
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

	emailOrPhone := normalizeEmailOrPhone(request.EmailOrPhone)

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
		return nil, ErrAuthAccountStatusUnavailable
	}

	if user.Password == "" {
		return nil, errors.New(
			"please continue with Google to sign in",
		)
	}

	if len(request.Password) > 72 {
		return nil, errors.New("invalid password")
	}

	if err := bcrypt.CompareHashAndPassword(
		[]byte(user.Password),
		[]byte(request.Password),
	); err != nil {
		return nil, errors.New("invalid password")
	}

	activeUser, err := service.findActiveAuthUser(
		ctx,
		user.ID,
	)
	if err != nil {
		return nil, err
	}

	if activeUser.Password != user.Password {
		return nil, errors.New(
			"your sign-in details changed; please try again",
		)
	}

	activeUser.Password = ""

	return activeUser, nil
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

	filters := []bson.M{
		{
			"google_subject": identity.Subject,
		},
		{
			"email_or_phone": identity.Email,
		},
	}

	for _, filter := range filters {
		var user User

		err := service.Collection.FindOne(
			ctx,
			filter,
		).Decode(&user)

		if errors.Is(err, mongo.ErrNoDocuments) {
			continue
		}

		if err != nil {
			return nil, nil, false, ErrAuthAccountStatusUnavailable
		}

		signedInUser, signInErr := service.finishGoogleSignIn(
			ctx,
			&user,
			identity,
		)

		return signedInUser, nil, false, signInErr
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
		return nil, errors.New("account already exists")

	case !errors.Is(lookupErr, mongo.ErrNoDocuments):
		return nil, ErrAuthAccountStatusUnavailable
	}

	user := User{
		ID:           bson.NewObjectID(),
		FirstName:    strings.TrimSpace(request.FirstName),
		LastName:     strings.TrimSpace(request.LastName),
		EmailOrPhone: identity.Email,
		Gender:       strings.ToLower(strings.TrimSpace(request.Gender)),
		BirthMonth:   request.BirthMonth,
		BirthDay:     request.BirthDay,
		BirthYear:    request.BirthYear,

		EmailVerified: true,
		GoogleSubject: identity.Subject,
		CreatedAt:     time.Now().UTC(),
	}

	_, err = service.Collection.InsertOne(ctx, user)
	if err != nil {
		if mongo.IsDuplicateKeyError(err) {
			return nil, errors.New("account already exists")
		}

		return nil, ErrAuthAccountStatusUnavailable
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
		// Unverified claims only help explain validation failures.
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

	subject := strings.TrimSpace(payload.Subject)

	email := normalizeEmailOrPhone(
		getStringClaim(payload.Claims, "email"),
	)

	emailVerified := getBoolClaim(
		payload.Claims,
		"email_verified",
	)

	if subject == "" || email == "" || !emailVerified {
		return nil, errors.New(
			"Google email could not be verified",
		)
	}

	firstName := strings.TrimSpace(
		getStringClaim(payload.Claims, "given_name"),
	)

	lastName := strings.TrimSpace(
		getStringClaim(payload.Claims, "family_name"),
	)

	if firstName == "" && lastName == "" {
		fullName := strings.TrimSpace(
			getStringClaim(payload.Claims, "name"),
		)

		nameParts := strings.Fields(fullName)

		if len(nameParts) > 0 {
			firstName = nameParts[0]
		}

		if len(nameParts) > 1 {
			lastName = strings.Join(nameParts[1:], " ")
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

	emailOrPhone := normalizeEmailOrPhone(request.EmailOrPhone)

	if !isValidEmailOrPhone(emailOrPhone) {
		return errors.New(
			"enter a valid email or Bangladesh phone number",
		)
	}

	if !strings.Contains(emailOrPhone, "@") {
		return errors.New(
			"phone OTP is not available yet; please use email to reset your password",
		)
	}

	var account passwordResetAccount

	err := service.Collection.FindOne(
		ctx,
		bson.M{
			"email_or_phone": emailOrPhone,
			"deletion_requested": bson.M{
				"$ne": true,
			},
		},
		options.FindOne().SetProjection(bson.M{
			"_id":                     1,
			"reset_code_requested_at": 1,
		}),
	).Decode(&account)

	if errors.Is(err, mongo.ErrNoDocuments) {
		return ErrAuthAccountUnavailable
	}

	if err != nil {
		return ErrAuthAccountStatusUnavailable
	}

	now := time.Now().UTC()

	if !account.RequestedAt.IsZero() &&
		account.RequestedAt.Add(authResetResendInterval).After(now) {
		return ErrAuthResetRequestTooSoon
	}

	code, err := generateResetCode(authResetCodeLength)
	if err != nil {
		return errors.New(
			"failed to create verification code",
		)
	}

	codeHash, err := bcrypt.GenerateFromPassword(
		[]byte(code),
		bcrypt.DefaultCost,
	)
	if err != nil {
		return errors.New(
			"failed to secure verification code",
		)
	}

	issuedAt := time.Now().UTC()
	codeID := bson.NewObjectID()

	result, err := service.Collection.UpdateOne(
		ctx,
		bson.M{
			"_id":            account.ID,
			"email_or_phone": emailOrPhone,
			"deletion_requested": bson.M{
				"$ne": true,
			},
			"$or": bson.A{
				bson.M{
					"reset_code_requested_at": bson.M{
						"$exists": false,
					},
				},
				bson.M{
					"reset_code_requested_at": bson.M{
						"$lte": issuedAt.Add(-authResetResendInterval),
					},
				},
			},
		},
		bson.M{
			"$set": bson.M{
				// Store the hash, never the plaintext code.
				"reset_code":              string(codeHash),
				"reset_code_id":           codeID,
				"reset_code_exp_at":       issuedAt.Add(authResetCodeLifetime),
				"reset_code_requested_at": issuedAt,
				"reset_code_attempts":     int64(0),
			},
		},
	)
	if err != nil {
		return ErrAuthAccountStatusUnavailable
	}

	if result.MatchedCount != 1 {
		if _, err := service.findActiveAuthUser(
			ctx,
			account.ID,
		); err != nil {
			return err
		}

		return ErrAuthResetRequestTooSoon
	}

	if err := sendResetCodeEmail(emailOrPhone, code); err != nil {
		return errors.New(
			"failed to send verification code",
		)
	}

	return nil
}

func (service *AuthService) VerifyResetCode(
	request VerifyResetCodeRequest,
) error {
	ctx, cancel := context.WithTimeout(
		context.Background(),
		authOperationTimeout,
	)
	defer cancel()

	session, err := service.reserveResetVerification(
		ctx,
		request.EmailOrPhone,
		request.Code,
	)
	if err != nil {
		return err
	}

	// A correct verification does not consume a failed-attempt slot.
	// The code remains available for the final password-reset request.
	return service.releaseResetVerification(ctx, session)
}

func (service *AuthService) ResetPassword(
	request ResetPasswordRequest,
) error {
	ctx, cancel := context.WithTimeout(
		context.Background(),
		authOperationTimeout,
	)
	defer cancel()

	if len(request.NewPassword) < 6 {
		return errors.New(
			"password must be at least 6 characters",
		)
	}

	if len(request.NewPassword) > 72 {
		return errors.New(
			"password is too long; please use a shorter password",
		)
	}

	// The final request must prove possession of the current code.
	session, err := service.reserveResetVerification(
		ctx,
		request.EmailOrPhone,
		request.Code,
	)
	if err != nil {
		return err
	}

	hashedPassword, err := bcrypt.GenerateFromPassword(
		[]byte(request.NewPassword),
		bcrypt.DefaultCost,
	)
	if err != nil {
		_ = service.releaseResetVerification(ctx, session)

		return errors.New("failed to reset password")
	}

	// Updating the password and consuming the code happen together.
	// A resend, expiry, or account deletion invalidates this filter.
	result, err := service.Collection.UpdateOne(
		ctx,
		resetSessionFilter(session),
		bson.M{
			"$set": bson.M{
				"password":   string(hashedPassword),
				"updated_at": time.Now().UTC(),
			},
			"$unset": bson.M{
				"reset_code":          "",
				"reset_code_id":       "",
				"reset_code_exp_at":   "",
				"reset_code_attempts": "",
			},
		},
	)
	if err != nil {
		// A database error must not be reported as a successful reset.
		return ErrAuthAccountStatusUnavailable
	}

	if result.MatchedCount != 1 {
		return ErrAuthResetCodeInvalid
	}

	return nil
}

func (service *AuthService) reserveResetVerification(
	ctx context.Context,
	emailOrPhone string,
	code string,
) (*passwordResetSession, error) {
	emailOrPhone = normalizeEmailOrPhone(emailOrPhone)

	if !emailPattern.MatchString(emailOrPhone) {
		return nil, ErrAuthResetCodeInvalid
	}

	normalizedCode, err := normalizeResetCode(code)
	if err != nil {
		return nil, err
	}

	var session passwordResetSession

	// Reserve a check atomically before comparing the code.
	// The counter includes failed checks and checks still running.
	err = service.Collection.FindOneAndUpdate(
		ctx,
		bson.M{
			"email_or_phone": emailOrPhone,
			"deletion_requested": bson.M{
				"$ne": true,
			},
			"reset_code_id": bson.M{
				"$type": "objectId",
			},
			"reset_code": bson.M{
				"$type": "string",
				"$ne":   "",
			},
			"reset_code_exp_at": bson.M{
				"$gt": time.Now().UTC(),
			},
			"reset_code_attempts": bson.M{
				"$gte": int64(0),
				"$lt":  int64(authResetMaxAttempts),
			},
		},
		bson.M{
			"$inc": bson.M{
				"reset_code_attempts": int64(1),
			},
		},
		options.FindOneAndUpdate().
			SetReturnDocument(options.After).
			SetProjection(bson.M{
				"_id":               1,
				"reset_code_id":     1,
				"reset_code":        1,
				"reset_code_exp_at": 1,
			}),
	).Decode(&session)

	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, ErrAuthResetCodeInvalid
	}

	if err != nil {
		return nil, ErrAuthAccountStatusUnavailable
	}

	if session.ID == bson.NilObjectID ||
		session.CodeID == bson.NilObjectID ||
		session.CodeHash == "" {
		return nil, ErrAuthResetCodeInvalid
	}

	compareErr := bcrypt.CompareHashAndPassword(
		[]byte(session.CodeHash),
		[]byte(normalizedCode),
	)

	if ctx.Err() != nil {
		return nil, ErrAuthAccountStatusUnavailable
	}

	if compareErr != nil {
		// Keep the reserved slot as a failed attempt.
		return nil, ErrAuthResetCodeInvalid
	}

	if !session.ExpiresAt.After(time.Now().UTC()) {
		return nil, ErrAuthResetCodeInvalid
	}

	return &session, nil
}

func (service *AuthService) releaseResetVerification(
	ctx context.Context,
	session *passwordResetSession,
) error {
	result, err := service.Collection.UpdateOne(
		ctx,
		resetSessionFilter(session),
		bson.M{
			"$inc": bson.M{
				"reset_code_attempts": int64(-1),
			},
		},
	)
	if err != nil {
		return ErrAuthAccountStatusUnavailable
	}

	if result.MatchedCount != 1 {
		return ErrAuthResetCodeInvalid
	}

	return nil
}

func resetSessionFilter(
	session *passwordResetSession,
) bson.M {
	return bson.M{
		"_id": session.ID,
		"deletion_requested": bson.M{
			"$ne": true,
		},
		"reset_code_id": session.CodeID,
		"reset_code":    session.CodeHash,
		"reset_code_exp_at": bson.M{
			"$eq": session.ExpiresAt,
			"$gt": time.Now().UTC(),
		},
		"reset_code_attempts": bson.M{
			"$gt": int64(0),
		},
	}
}

func normalizeResetCode(value string) (string, error) {
	value = strings.TrimSpace(value)

	if len(value) != authResetCodeLength {
		return "", ErrAuthResetCodeInvalid
	}

	for _, character := range value {
		if character < '0' || character > '9' {
			return "", ErrAuthResetCodeInvalid
		}
	}

	return value, nil
}

func (service *AuthService) GetUserByID(
	userID string,
) (*User, error) {
	ctx, cancel := context.WithTimeout(
		context.Background(),
		authOperationTimeout,
	)
	defer cancel()

	objectID, err := bson.ObjectIDFromHex(userID)
	if err != nil || objectID == bson.NilObjectID {
		return nil, errors.New("invalid user id")
	}

	user, err := service.findActiveAuthUser(ctx, objectID)
	if err != nil {
		return nil, err
	}

	user.Password = ""

	return user, nil
}

func (service *AuthService) findActiveAuthUser(
	ctx context.Context,
	userID bson.ObjectID,
) (*User, error) {
	var user User

	err := service.Collection.FindOne(
		ctx,
		bson.M{
			"_id": userID,
			"deletion_requested": bson.M{
				"$ne": true,
			},
		},
	).Decode(&user)

	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, ErrAuthAccountUnavailable
	}

	if err != nil {
		return nil, ErrAuthAccountStatusUnavailable
	}

	return &user, nil
}

func (service *AuthService) finishGoogleSignIn(
	ctx context.Context,
	candidate *User,
	identity *googleIdentity,
) (*User, error) {
	if candidate.GoogleSubject != "" &&
		candidate.GoogleSubject != identity.Subject {
		return nil, errors.New(
			"this email is already linked to another Google account",
		)
	}

	needsUpdate :=
		candidate.GoogleSubject != identity.Subject ||
			!candidate.EmailVerified

	if needsUpdate {
		result, err := service.Collection.UpdateOne(
			ctx,
			bson.M{
				"_id": candidate.ID,
				"deletion_requested": bson.M{
					"$ne": true,
				},
				"google_subject": bson.M{
					"$in": bson.A{
						nil,
						"",
						identity.Subject,
					},
				},
			},
			bson.M{
				"$set": bson.M{
					"google_subject": identity.Subject,
					"email_verified": true,
				},
			},
		)

		if err != nil {
			if mongo.IsDuplicateKeyError(err) {
				return nil, errors.New(
					"this Google account is already linked",
				)
			}

			return nil, ErrAuthAccountStatusUnavailable
		}

		if result.MatchedCount != 1 {
			return nil, ErrAuthAccountUnavailable
		}
	}

	activeUser, err := service.findActiveAuthUser(
		ctx,
		candidate.ID,
	)
	if err != nil {
		return nil, err
	}

	if activeUser.GoogleSubject != identity.Subject ||
		!activeUser.EmailVerified {
		return nil, errors.New(
			"Google sign-in details changed; please try again",
		)
	}

	activeUser.Password = ""

	return activeUser, nil
}

func normalizeEmailOrPhone(value string) string {
	value = strings.TrimSpace(value)

	if strings.Contains(value, "@") {
		return strings.ToLower(value)
	}

	return value
}

func isValidEmailOrPhone(value string) bool {
	return emailPattern.MatchString(value) ||
		bangladeshPhonePattern.MatchString(value)
}

func validateProfile(
	firstName string,
	lastName string,
	gender string,
	birthMonth int,
	birthDay int,
	birthYear int,
) error {
	firstName = strings.TrimSpace(firstName)
	lastName = strings.TrimSpace(lastName)

	if firstName == "" || lastName == "" {
		return errors.New(
			"first name and last name are required",
		)
	}

	combinedName := strings.Join(
		strings.Fields(firstName+lastName),
		"",
	)

	if len([]rune(combinedName)) > 30 {
		return errors.New(
			"first name and last name together cannot exceed 30 characters",
		)
	}

	gender = strings.ToLower(strings.TrimSpace(gender))

	switch gender {
	case "male", "female", "other":
	default:
		return errors.New("please select a valid gender")
	}

	if !isValidBirthDate(birthYear, birthMonth, birthDay) {
		return errors.New("please select a valid birthdate")
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

	return !birthDate.After(currentTime)
}

func getStringClaim(
	claims map[string]interface{},
	key string,
) string {
	value, ok := claims[key].(string)
	if !ok {
		return ""
	}

	return strings.TrimSpace(value)
}

func getBoolClaim(
	claims map[string]interface{},
	key string,
) bool {
	switch value := claims[key].(type) {
	case bool:
		return value

	case string:
		parsedValue, err := strconv.ParseBool(value)
		return err == nil && parsedValue

	default:
		return false
	}
}

func generateResetCode(length int) (string, error) {
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

	format := fmt.Sprintf("%%0%dd", length)

	return fmt.Sprintf(format, number.Int64()), nil
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
		return errors.New("missing smtp configuration")
	}

	portNumber, err := strconv.Atoi(port)
	if err != nil || portNumber <= 0 {
		return errors.New("invalid smtp port")
	}

	auth := smtp.PlainAuth(
		"",
		email,
		password,
		host,
	)

	subject := "Everest Password Reset Verification Code"

	body := fmt.Sprintf(
		"Your Everest verification code is: %s\n\n"+
			"This code will expire in 10 minutes.\n\n"+
			"If you did not request this, please ignore this email.",
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