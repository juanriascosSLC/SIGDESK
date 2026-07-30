DROP TABLE IF EXISTS catalog_projected_events;
DROP INDEX IF EXISTS tickets_entity_id_idx;
ALTER TABLE tickets DROP COLUMN IF EXISTS entity_id;
