package domain

import "time"

type OutboxStatus struct {
	Pending           int64      `json:"pending"`
	Retrying          int64      `json:"retrying"`
	MaxAttempts       int        `json:"maxAttempts"`
	OldestPendingAt   *time.Time `json:"oldestPendingAt,omitempty"`
	PublishedLastHour int64      `json:"publishedLastHour"`
	Healthy           bool       `json:"healthy"`
	CheckedAt         time.Time  `json:"checkedAt"`
}
