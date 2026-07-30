-- Structural support for Tickets projecting catalog runtime events
-- (catalog.entity.created.v1 / catalog.entity.transitioned.v1) into its
-- own read model. Delivery (the transactional outbox) is not wired yet;
-- this only prepares storage: an idempotency log keyed by eventId, and a
-- stable link from a ticket back to the catalog entity it was projected
-- from. Tickets created directly via POST /tickets have no entity_id.

ALTER TABLE tickets
    ADD COLUMN IF NOT EXISTS entity_id VARCHAR(64) NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tickets_entity_id_idx
    ON tickets (entity_id)
    WHERE entity_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS catalog_projected_events (
    event_id VARCHAR(64) PRIMARY KEY,
    entity_id VARCHAR(64) NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
