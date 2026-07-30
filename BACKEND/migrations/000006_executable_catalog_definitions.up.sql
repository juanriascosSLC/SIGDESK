-- Catalog Builder is the authoring/composition control plane. Published
-- definitions are compiled into immutable executable manifests with every
-- external module dependency pinned to a resource and contract version.

ALTER TABLE catalog_definitions
    DROP CONSTRAINT IF EXISTS catalog_definitions_status_check;

ALTER TABLE catalog_definitions
    ADD CONSTRAINT catalog_definitions_status_check
    CHECK (status IN (
        'draft', 'validating', 'published', 'deprecated', 'retired', 'archived'
    ));

ALTER TABLE catalog_definitions
    ADD COLUMN IF NOT EXISTS metamodel_version VARCHAR(16) NOT NULL DEFAULT '1.0',
    ADD COLUMN IF NOT EXISTS manifest JSONB,
    ADD COLUMN IF NOT EXISTS checksum VARCHAR(64) NOT NULL DEFAULT '';

ALTER TABLE entity_records
    ADD COLUMN IF NOT EXISTS definition_version_id UUID,
    ADD COLUMN IF NOT EXISTS schema_version VARCHAR(16) NOT NULL DEFAULT '1.0',
    ADD COLUMN IF NOT EXISTS manifest_checksum VARCHAR(64) NOT NULL DEFAULT '';

UPDATE entity_records
SET definition_version_id = definition_id
WHERE definition_version_id IS NULL;

ALTER TABLE entity_records
    ALTER COLUMN definition_version_id SET NOT NULL;

ALTER TABLE entity_records
    DROP CONSTRAINT IF EXISTS entity_records_definition_version_id_fkey;

ALTER TABLE entity_records
    ADD CONSTRAINT entity_records_definition_version_id_fkey
    FOREIGN KEY (definition_version_id) REFERENCES catalog_definitions(id);

CREATE INDEX IF NOT EXISTS entity_records_definition_version_idx
    ON entity_records (definition_version_id);

CREATE OR REPLACE FUNCTION prevent_published_catalog_definition_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.status IN ('published', 'deprecated', 'retired', 'archived')
       AND (
           NEW.entity_key IS DISTINCT FROM OLD.entity_key
           OR NEW.name IS DISTINCT FROM OLD.name
           OR NEW.version IS DISTINCT FROM OLD.version
           OR NEW.metamodel_version IS DISTINCT FROM OLD.metamodel_version
           OR NEW.specification IS DISTINCT FROM OLD.specification
           OR NEW.manifest IS DISTINCT FROM OLD.manifest
           OR NEW.checksum IS DISTINCT FROM OLD.checksum
       )
    THEN
        RAISE EXCEPTION 'published catalog definition % v% is immutable',
            OLD.entity_key, OLD.version;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS catalog_published_definition_immutable
    ON catalog_definitions;

CREATE TRIGGER catalog_published_definition_immutable
BEFORE UPDATE ON catalog_definitions
FOR EACH ROW
EXECUTE FUNCTION prevent_published_catalog_definition_mutation();

-- Existing published definitions predate compilation. They remain readable;
-- the application compiles a compatibility manifest on first resolution.
-- Republishing always persists a fully version-locked manifest.
