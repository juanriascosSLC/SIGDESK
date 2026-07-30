DROP INDEX IF EXISTS entity_records_definition_version_idx;

DROP TRIGGER IF EXISTS catalog_published_definition_immutable
    ON catalog_definitions;
DROP FUNCTION IF EXISTS prevent_published_catalog_definition_mutation();

ALTER TABLE entity_records
    DROP CONSTRAINT IF EXISTS entity_records_definition_version_id_fkey,
    DROP COLUMN IF EXISTS manifest_checksum,
    DROP COLUMN IF EXISTS schema_version,
    DROP COLUMN IF EXISTS definition_version_id;

ALTER TABLE catalog_definitions
    DROP COLUMN IF EXISTS checksum,
    DROP COLUMN IF EXISTS manifest,
    DROP COLUMN IF EXISTS metamodel_version;

ALTER TABLE catalog_definitions
    DROP CONSTRAINT IF EXISTS catalog_definitions_status_check;

ALTER TABLE catalog_definitions
    ADD CONSTRAINT catalog_definitions_status_check
    CHECK (status IN ('draft', 'published', 'archived'));
