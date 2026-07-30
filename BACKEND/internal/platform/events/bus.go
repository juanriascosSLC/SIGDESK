package events

import (
	"context"
	"fmt"
	"sync"

	"sig-desk/backend/internal/catalog/domain"
	"sig-desk/backend/internal/catalog/ports"
)

type Handler func(context.Context, domain.EventEnvelope) error

type Subscription struct {
	Name       string
	EventTypes map[string]bool
	Handler    Handler
}

type Bus struct {
	mutex         sync.RWMutex
	subscriptions []Subscription
}

func NewBus() *Bus {
	return &Bus{}
}

func (bus *Bus) Subscribe(subscription Subscription) {
	bus.mutex.Lock()
	defer bus.mutex.Unlock()
	bus.subscriptions = append(bus.subscriptions, subscription)
}

func (bus *Bus) Publish(ctx context.Context, event domain.EventEnvelope) error {
	bus.mutex.RLock()
	subscriptions := append([]Subscription(nil), bus.subscriptions...)
	bus.mutex.RUnlock()
	for _, subscription := range subscriptions {
		if len(subscription.EventTypes) > 0 && !subscription.EventTypes[event.EventType] {
			continue
		}
		if err := subscription.Handler(ctx, event); err != nil {
			return fmt.Errorf(
				"event subscriber %s failed for %s: %w",
				subscription.Name,
				event.EventType,
				err,
			)
		}
	}
	return nil
}

var _ ports.EventPublisher = (*Bus)(nil)
