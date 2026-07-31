CREATE TABLE IF NOT EXISTS catalog_idempotency_keys (
    scope VARCHAR(120) NOT NULL,
    idempotency_key VARCHAR(128) NOT NULL,
    request_hash CHAR(64) NOT NULL,
    entity_id UUID NOT NULL REFERENCES entity_records(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (scope, idempotency_key)
);

CREATE INDEX IF NOT EXISTS catalog_idempotency_keys_entity_idx
    ON catalog_idempotency_keys (entity_id);
