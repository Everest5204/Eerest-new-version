package deleteaccount

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

const (
	deletionJobsCollection  = "account_deletion_jobs"
	deletionMediaCollection = "account_deletion_media"
)

type deletionStatus string

const (
	deletionStatusQueued     deletionStatus = "queued"
	deletionStatusProcessing deletionStatus = "processing"
	deletionStatusRetry      deletionStatus = "retry"
)

type deletionStage string

const (
	deletionStageCollectMedia deletionStage = "collect_media"
	deletionStageDeleteMedia  deletionStage = "delete_media"
	deletionStageDeleteData   deletionStage = "delete_data"
)

// Public status values used by the frontend.
type DeleteAccountProgressStatus string

const (
	DeleteAccountProgressProcessing DeleteAccountProgressStatus = "processing"
	DeleteAccountProgressDeleted    DeleteAccountProgressStatus = "deleted"
)

// User identity comes from the authenticated request context.
//
// The password is only used for verification.
// Never persist or log this request.
type DeleteAccountRequest struct {
	Confirm bool `json:"confirm" bson:"-"`

	CurrentPassword string `json:"current_password" bson:"-"`
}

// Returned after the deletion request is durably accepted.
// Acceptance does not mean cleanup has finished.
//
// DeletionToken only authorizes checking this deletion's progress.
// It must not grant access to normal authenticated account APIs.
type DeleteAccountResponse struct {
	Message string `json:"message"`
	Status  string `json:"status"`

	DeletionToken string `json:"deletion_token" bson:"-"`
}

// Only report "deleted" after backend completion is verified.
// Missing authorization or a failed status check is not completion.
type DeleteAccountStatusResponse struct {
	Status DeleteAccountProgressStatus `json:"status"`
}

// ID is the user's existing MongoDB ObjectID.
// This allows only one deletion job per account.
//
// The job is removed after account cleanup completes.
type deletionJob struct {
	ID bson.ObjectID `bson:"_id"`

	Status deletionStatus `bson:"status"`
	Stage  deletionStage  `bson:"stage"`

	Attempts      int64     `bson:"attempts"`
	NextAttemptAt time.Time `bson:"next_attempt_at"`

	LeaseToken string     `bson:"lease_token,omitempty"`
	LeaseUntil *time.Time `bson:"lease_until,omitempty"`

	// Incremented by database cleanup transactions to enforce
	// ownership while each batch is being committed.
	CleanupRevision int64 `bson:"cleanup_revision,omitempty"`

	// Store controlled error codes only.
	LastErrorCode string `bson:"last_error_code,omitempty"`

	CreatedAt time.Time `bson:"created_at"`
	UpdatedAt time.Time `bson:"updated_at"`
}

// Keep media targets separate from the job document.
// Remove a target after its storage deletion succeeds.
type deletionMedia struct {
	ID bson.ObjectID `bson:"_id,omitempty"`

	UserID       bson.ObjectID `bson:"user_id"`
	PublicID     string        `bson:"public_id"`
	ResourceType string        `bson:"resource_type"`

	CreatedAt time.Time `bson:"created_at"`
}