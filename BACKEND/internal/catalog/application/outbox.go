package application

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"math"
	"time"

	"sig-desk/backend/internal/catalog/ports"
)

type OutboxDispatcher struct {
	store     ports.OutboxStore
	publisher ports.EventPublisher
	workerID  string
	batchSize int
	lease     time.Duration
	now       func() time.Time
}

func NewOutboxDispatcher(
	store ports.OutboxStore,
	publisher ports.EventPublisher,
) (*OutboxDispatcher, error) {
	workerID, err := randomWorkerID()
	if err != nil {
		return nil, err
	}
	return &OutboxDispatcher{
		store:     store,
		publisher: publisher,
		workerID:  workerID,
		batchSize: 50,
		lease:     30 * time.Second,
		now:       func() time.Time { return time.Now().UTC() },
	}, nil
}

func (dispatcher *OutboxDispatcher) DispatchOnce(ctx context.Context) (int, error) {
	now := dispatcher.now()
	messages, err := dispatcher.store.ClaimOutbox(
		ctx,
		dispatcher.workerID,
		dispatcher.batchSize,
		now,
		dispatcher.lease,
	)
	if err != nil {
		return 0, err
	}
	published := 0
	var firstError error
	for _, message := range messages {
		if err := dispatcher.publisher.Publish(ctx, message.Event); err != nil {
			if firstError == nil {
				firstError = err
			}
			nextAttempt := now.Add(retryDelay(message.Attempts))
			markErr := dispatcher.store.MarkOutboxFailed(
				ctx,
				message.ID,
				dispatcher.workerID,
				err.Error(),
				nextAttempt,
			)
			if markErr != nil && firstError == nil {
				firstError = markErr
			}
			continue
		}
		if err := dispatcher.store.MarkOutboxPublished(
			ctx,
			message.ID,
			dispatcher.workerID,
			dispatcher.now(),
		); err != nil {
			if firstError == nil {
				firstError = err
			}
			continue
		}
		published++
	}
	return published, firstError
}

func (dispatcher *OutboxDispatcher) Run(
	ctx context.Context,
	interval time.Duration,
	onError func(error),
) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		if _, err := dispatcher.DispatchOnce(ctx); err != nil && onError != nil {
			onError(err)
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

func retryDelay(attempts int) time.Duration {
	exponent := math.Min(float64(max(attempts-1, 0)), 8)
	return time.Duration(math.Pow(2, exponent)) * time.Second
}

func randomWorkerID() (string, error) {
	var value [16]byte
	if _, err := rand.Read(value[:]); err != nil {
		return "", fmt.Errorf("generate outbox worker id: %w", err)
	}
	return hex.EncodeToString(value[:]), nil
}
