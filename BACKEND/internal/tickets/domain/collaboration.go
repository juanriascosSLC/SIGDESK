package domain

import (
	"errors"
	"strings"
	"time"
)

type ActivityKind string

const (
	ActivityCreated        ActivityKind = "created"
	ActivityStatusChanged  ActivityKind = "status_changed"
	ActivityAssigned       ActivityKind = "assigned"
	ActivityCommented      ActivityKind = "commented"
	ActivityAttached       ActivityKind = "attached"
	ActivityMerged         ActivityKind = "merged"
	ActivityUnmerged       ActivityKind = "unmerged"
	ActivityWatcherAdded   ActivityKind = "watcher_added"
	ActivityWatcherRemoved ActivityKind = "watcher_removed"
	ActivityFieldsUpdated  ActivityKind = "fields_updated"
)

type ActivityEntry struct {
	ID              string         `json:"id"`
	TicketID        string         `json:"ticketId"`
	Kind            ActivityKind   `json:"kind"`
	ContractVersion int            `json:"contractVersion"`
	ActorName       *string        `json:"actorName"`
	Payload         map[string]any `json:"payload"`
	CreatedAt       time.Time      `json:"createdAt"`
}

var ErrInvalidComment = errors.New("comment body must contain between 1 and 10000 characters")

type Comment struct {
	ID         string    `json:"id"`
	TicketID   string    `json:"ticketId"`
	AuthorName string    `json:"authorName"`
	Body       string    `json:"body"`
	IsInternal bool      `json:"isInternal"`
	CreatedAt  time.Time `json:"createdAt"`
}

type NewComment struct {
	AuthorName string
	Body       string
	IsInternal bool
}

func (comment NewComment) Validate() error {
	length := len(strings.TrimSpace(comment.Body))
	if length < 1 || length > 10000 {
		return ErrInvalidComment
	}
	return nil
}

const MaxAttachmentSizeBytes int64 = 25 << 20 // 25 MB

var (
	ErrAttachmentTooLarge = errors.New("attachment exceeds the 25 MB limit")
	ErrAttachmentEmpty    = errors.New("attachment file name and content are required")
)

type Attachment struct {
	ID           string    `json:"id"`
	TicketID     string    `json:"ticketId"`
	UploaderName string    `json:"uploaderName"`
	FileName     string    `json:"fileName"`
	ContentType  string    `json:"contentType"`
	SizeBytes    int64     `json:"sizeBytes"`
	StorageKey   string    `json:"-"`
	CreatedAt    time.Time `json:"createdAt"`
}

type NewAttachment struct {
	UploaderName string
	FileName     string
	ContentType  string
	SizeBytes    int64
}

func (attachment NewAttachment) Validate() error {
	if strings.TrimSpace(attachment.FileName) == "" || attachment.SizeBytes <= 0 {
		return ErrAttachmentEmpty
	}
	if attachment.SizeBytes > MaxAttachmentSizeBytes {
		return ErrAttachmentTooLarge
	}
	return nil
}

type Watcher struct {
	TicketID    string    `json:"ticketId"`
	WatcherName string    `json:"watcherName"`
	CreatedAt   time.Time `json:"createdAt"`
}

var (
	ErrInvalidWatcherName  = errors.New("watcher name is required")
	ErrCannotMergeIntoSelf = errors.New("a ticket cannot be merged into itself")
	ErrTicketAlreadyMerged = errors.New("ticket is already merged into another ticket")
	ErrTicketNotMerged     = errors.New("ticket is not currently merged")
	ErrNoTicketsToMerge    = errors.New("merge requires at least one other ticket")
)
