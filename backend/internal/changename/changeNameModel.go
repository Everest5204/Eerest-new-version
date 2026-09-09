package changename

import "time"

const NameChangeCooldown = 30 * 24 * time.Hour

type ChangeNameRequest struct {
	FirstName string `json:"first_name"`
	LastName  string `json:"last_name"`
}

type NameStatus struct {
	FirstName     string     `json:"first_name"`
	LastName      string     `json:"last_name"`
	CanChange     bool       `json:"can_change"`
	LastChangedAt *time.Time `json:"last_changed_at,omitempty"`
	NextChangeAt  *time.Time `json:"next_change_at,omitempty"`
}

type NameStatusResponse struct {
	Name NameStatus `json:"name"`
}

type ErrorResponse struct {
	Error        string     `json:"error"`
	NextChangeAt *time.Time `json:"next_change_at,omitempty"`
}