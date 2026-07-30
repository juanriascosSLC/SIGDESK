package domain

import (
	"errors"
	"time"
)

type Status string

const (
	StatusOpen          Status = "open"
	StatusInProgress    Status = "in_progress"
	StatusPendingReview Status = "pending_review"
	StatusResolved      Status = "resolved"
)

type Priority string

const (
	PriorityLow      Priority = "low"
	PriorityMedium   Priority = "medium"
	PriorityHigh     Priority = "high"
	PriorityCritical Priority = "critical"
)

var (
	ErrInvalidStatus     = errors.New("invalid ticket status")
	ErrInvalidTransition = errors.New("invalid ticket status transition")
)

type Ticket struct {
	ID            string    `json:"id"`
	Title         string    `json:"title"`
	Description   string    `json:"description"`
	Status        Status    `json:"status"`
	Priority      Priority  `json:"priority"`
	Category      string    `json:"category"`
	RequesterName string    `json:"requesterName"`
	AssigneeName  *string   `json:"assigneeName"`
	CreatedAt     time.Time `json:"createdAt"`
	AssetID       *string   `json:"assetId"`
	Site          *string   `json:"site"`
	MergedCount   int       `json:"mergedCount"`
	MergedIntoID  *string   `json:"mergedIntoId"`
	EntityID      *string   `json:"entityId,omitempty"`
}

func (ticket Ticket) IsMerged() bool {
	return ticket.MergedIntoID != nil
}

func (status Status) Valid() bool {
	switch status {
	case StatusOpen, StatusInProgress, StatusPendingReview, StatusResolved:
		return true
	default:
		return false
	}
}

// TicketFilter narrows List queries. Empty string fields are ignored.
// Unassigned, when true, overrides Assignee and only returns tickets
// with no assignee.
type TicketFilter struct {
	Status     Status
	Priority   Priority
	Category   string
	Site       string
	Assignee   string
	Unassigned bool
	Search     string
	Cursor     string
	Limit      int
	// MergedInto, when set, overrides the default "exclude merged tickets"
	// behavior and instead returns only tickets absorbed into this human_id.
	MergedInto string
}

type TicketPage struct {
	Items      []Ticket
	NextCursor string
	HasMore    bool
}

func CanTransition(from, to Status) bool {
	if from == to {
		return true
	}
	allowed := map[Status]map[Status]bool{
		StatusOpen: {
			StatusInProgress: true,
			StatusResolved:   true,
		},
		StatusInProgress: {
			StatusOpen:          true,
			StatusPendingReview: true,
			StatusResolved:      true,
		},
		StatusPendingReview: {
			StatusInProgress: true,
			StatusResolved:   true,
		},
		StatusResolved: {
			StatusOpen: true,
		},
	}
	return allowed[from][to]
}
