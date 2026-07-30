package domain

import (
	"errors"
	"fmt"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

var (
	ErrPolicyNotFound = errors.New("sla policy not found")
	ErrInvalidPolicy  = errors.New("invalid sla policy")
)

type PolicyStatus string

const (
	StatusDraft      PolicyStatus = "draft"
	StatusPublished  PolicyStatus = "published"
	StatusDeprecated PolicyStatus = "deprecated"
)

type BusinessWindow struct {
	Weekday int    `json:"weekday"`
	Start   string `json:"start"`
	End     string `json:"end"`
}

type Calendar struct {
	Timezone string           `json:"timezone"`
	AlwaysOn bool             `json:"alwaysOn"`
	Windows  []BusinessWindow `json:"windows,omitempty"`
}

type Target struct {
	Priority          string `json:"priority"`
	ResponseMinutes   int    `json:"responseMinutes"`
	ResolutionMinutes int    `json:"resolutionMinutes"`
}

type Escalation struct {
	ThresholdPercent int    `json:"thresholdPercent"`
	Channel          string `json:"channel"`
	Recipient        string `json:"recipient"`
}

type Policy struct {
	ID               string       `json:"id"`
	ResourceID       string       `json:"resourceId"`
	Name             string       `json:"name"`
	Version          int          `json:"version"`
	ContractVersion  string       `json:"contractVersion"`
	Status           PolicyStatus `json:"status"`
	Calendar         Calendar     `json:"calendar"`
	Targets          []Target     `json:"targets"`
	PauseStates      []string     `json:"pauseStates,omitempty"`
	ResponseStates   []string     `json:"responseStates,omitempty"`
	ResolutionStates []string     `json:"resolutionStates,omitempty"`
	Escalations      []Escalation `json:"escalations,omitempty"`
	CreatedAt        time.Time    `json:"createdAt"`
	PublishedAt      *time.Time   `json:"publishedAt,omitempty"`
}

type Assessment struct {
	EntityID                string     `json:"entityId"`
	HumanID                 string     `json:"humanId"`
	DefinitionVersionID     string     `json:"definitionVersionId"`
	DefinitionVersion       int        `json:"definitionVersion"`
	ManifestChecksum        string     `json:"manifestChecksum"`
	PolicyID                string     `json:"policyId"`
	PolicyVersion           int        `json:"policyVersion"`
	PolicyContractVersion   string     `json:"policyContractVersion"`
	Priority                string     `json:"priority"`
	CurrentState            string     `json:"currentState"`
	ResponseTargetMinutes   int        `json:"responseTargetMinutes"`
	ResolutionTargetMinutes int        `json:"resolutionTargetMinutes"`
	StartedAt               time.Time  `json:"startedAt"`
	ResponseDueAt           time.Time  `json:"responseDueAt"`
	ResolutionDueAt         time.Time  `json:"resolutionDueAt"`
	RespondedAt             *time.Time `json:"respondedAt,omitempty"`
	ResolvedAt              *time.Time `json:"resolvedAt,omitempty"`
	PausedAt                *time.Time `json:"pausedAt,omitempty"`
	ResponseBreached        bool       `json:"responseBreached"`
	ResolutionBreached      bool       `json:"resolutionBreached"`
	LastEventID             string     `json:"lastEventId"`
	UpdatedAt               time.Time  `json:"updatedAt"`
}

var resourcePattern = regexp.MustCompile(`^sla:policy:[a-z0-9][a-z0-9-]{1,62}$`)

func (policy Policy) Validate() error {
	if !resourcePattern.MatchString(policy.ResourceID) {
		return fmt.Errorf("%w: resourceId must match %s", ErrInvalidPolicy, resourcePattern)
	}
	if strings.TrimSpace(policy.Name) == "" {
		return fmt.Errorf("%w: name is required", ErrInvalidPolicy)
	}
	if policy.ContractVersion == "" {
		policy.ContractVersion = "1"
	}
	if _, err := policy.Calendar.location(); err != nil {
		return err
	}
	if !policy.Calendar.AlwaysOn && len(policy.Calendar.Windows) == 0 {
		return fmt.Errorf("%w: business-hours calendars need at least one window", ErrInvalidPolicy)
	}
	for _, window := range policy.Calendar.Windows {
		if window.Weekday < 1 || window.Weekday > 7 {
			return fmt.Errorf("%w: weekday must be between 1 and 7", ErrInvalidPolicy)
		}
		start, err := parseClock(window.Start)
		if err != nil {
			return fmt.Errorf("%w: invalid start time %q", ErrInvalidPolicy, window.Start)
		}
		end, err := parseClock(window.End)
		if err != nil || end <= start {
			return fmt.Errorf("%w: invalid end time %q", ErrInvalidPolicy, window.End)
		}
	}
	if len(policy.Targets) == 0 {
		return fmt.Errorf("%w: at least one priority target is required", ErrInvalidPolicy)
	}
	seen := map[string]bool{}
	for _, target := range policy.Targets {
		priority := strings.ToLower(strings.TrimSpace(target.Priority))
		if priority == "" || seen[priority] {
			return fmt.Errorf("%w: priorities must be unique and non-empty", ErrInvalidPolicy)
		}
		if target.ResponseMinutes < 1 || target.ResolutionMinutes < target.ResponseMinutes {
			return fmt.Errorf(
				"%w: %s resolution must be greater than or equal to response",
				ErrInvalidPolicy,
				priority,
			)
		}
		seen[priority] = true
	}
	for _, escalation := range policy.Escalations {
		if escalation.ThresholdPercent < 1 || escalation.ThresholdPercent > 100 {
			return fmt.Errorf("%w: escalation threshold must be between 1 and 100", ErrInvalidPolicy)
		}
	}
	return nil
}

func (policy Policy) Target(priority string) (Target, bool) {
	priority = strings.ToLower(strings.TrimSpace(priority))
	for _, target := range policy.Targets {
		if strings.ToLower(target.Priority) == priority {
			return target, true
		}
	}
	return Target{}, false
}

func (policy Policy) PausesOn(state string) bool {
	return containsState(policy.PauseStates, state)
}

func (policy Policy) StopsResponseOn(state string) bool {
	states := policy.ResponseStates
	if len(states) == 0 {
		states = []string{"in_progress", "resolved"}
	}
	return containsState(states, state)
}

func (policy Policy) StopsResolutionOn(state string) bool {
	states := policy.ResolutionStates
	if len(states) == 0 {
		states = []string{"resolved"}
	}
	return containsState(states, state)
}

func (assessment Assessment) At(now time.Time) Assessment {
	effectiveNow := now.UTC()
	if assessment.PausedAt != nil && assessment.PausedAt.Before(effectiveNow) {
		effectiveNow = assessment.PausedAt.UTC()
	}
	if assessment.RespondedAt == nil {
		assessment.ResponseBreached = effectiveNow.After(assessment.ResponseDueAt)
	}
	if assessment.ResolvedAt == nil {
		assessment.ResolutionBreached = effectiveNow.After(assessment.ResolutionDueAt)
	}
	return assessment
}

func containsState(states []string, state string) bool {
	state = strings.ToLower(strings.TrimSpace(state))
	for _, candidate := range states {
		if strings.ToLower(strings.TrimSpace(candidate)) == state {
			return true
		}
	}
	return false
}

func (calendar Calendar) Add(start time.Time, minutes int) (time.Time, error) {
	if minutes < 0 {
		return time.Time{}, fmt.Errorf("%w: duration cannot be negative", ErrInvalidPolicy)
	}
	location, err := calendar.location()
	if err != nil {
		return time.Time{}, err
	}
	if calendar.AlwaysOn {
		return start.Add(time.Duration(minutes) * time.Minute), nil
	}
	current := start.In(location)
	remaining := minutes
	for daysScanned := 0; daysScanned < 3700; daysScanned++ {
		windowStart, windowEnd, ok := calendar.windowFor(current)
		if !ok || !current.Before(windowEnd) {
			current = beginningOfNextDay(current)
			continue
		}
		if current.Before(windowStart) {
			current = windowStart
		}
		available := int(windowEnd.Sub(current) / time.Minute)
		if remaining <= available {
			return current.Add(time.Duration(remaining) * time.Minute).UTC(), nil
		}
		remaining -= available
		current = beginningOfNextDay(current)
	}
	return time.Time{}, fmt.Errorf("%w: calendar could not resolve due date", ErrInvalidPolicy)
}

func (calendar Calendar) windowFor(at time.Time) (time.Time, time.Time, bool) {
	isoWeekday := int(at.Weekday())
	if isoWeekday == 0 {
		isoWeekday = 7
	}
	windows := append([]BusinessWindow(nil), calendar.Windows...)
	sort.Slice(windows, func(left, right int) bool { return windows[left].Start < windows[right].Start })
	for _, window := range windows {
		if window.Weekday != isoWeekday {
			continue
		}
		startMinutes, _ := parseClock(window.Start)
		endMinutes, _ := parseClock(window.End)
		day := time.Date(at.Year(), at.Month(), at.Day(), 0, 0, 0, 0, at.Location())
		return day.Add(time.Duration(startMinutes) * time.Minute),
			day.Add(time.Duration(endMinutes) * time.Minute), true
	}
	return time.Time{}, time.Time{}, false
}

func (calendar Calendar) location() (*time.Location, error) {
	timezone := strings.TrimSpace(calendar.Timezone)
	if timezone == "" {
		timezone = "UTC"
	}
	location, err := time.LoadLocation(timezone)
	if err != nil {
		return nil, fmt.Errorf("%w: unknown timezone %q", ErrInvalidPolicy, timezone)
	}
	return location, nil
}

func parseClock(value string) (int, error) {
	parts := strings.Split(value, ":")
	if len(parts) != 2 {
		return 0, errors.New("invalid clock")
	}
	hour, hourErr := strconv.Atoi(parts[0])
	minute, minuteErr := strconv.Atoi(parts[1])
	if hourErr != nil || minuteErr != nil || hour < 0 || hour > 23 || minute < 0 || minute > 59 {
		return 0, errors.New("invalid clock")
	}
	return hour*60 + minute, nil
}

func beginningOfNextDay(at time.Time) time.Time {
	return time.Date(at.Year(), at.Month(), at.Day()+1, 0, 0, 0, 0, at.Location())
}
