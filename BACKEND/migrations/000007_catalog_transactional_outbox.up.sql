CREATE TABLE IF NOT EXISTS catalog_event_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL UNIQUE,
    event_type VARCHAR(120) NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL,
    aggregate_id VARCHAR(80) NOT NULL,
    entity_key VARCHAR(64) NOT NULL,
    schema_version VARCHAR(16) NOT NULL,
    payload JSONB NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    locked_until TIMESTAMPTZ,
    lock_id UUID,
    published_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS catalog_event_outbox_pending_idx
    ON catalog_event_outbox (available_at, created_at)
    WHERE published_at IS NULL;

CREATE INDEX IF NOT EXISTS catalog_event_outbox_aggregate_idx
    ON catalog_event_outbox (entity_key, aggregate_id, occurred_at);

