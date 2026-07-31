-- 000020_create_catalog_layout_versions.up.sql
-- Separate presentation (layout) from immutable definition versions.

CREATE TABLE IF NOT EXISTS catalog_layout_versions (
    id UUID PRIMARY KEY,
    entity_key VARCHAR(64) NOT NULL,
    version INTEGER NOT NULL CHECK (version >= 0),
    status VARCHAR(32) NOT NULL CHECK (status IN ('draft', 'published', 'deprecated', 'archived')),
    document JSONB NOT NULL,
    compatibility JSONB,
    checksum VARCHAR(64),
    is_active BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_at TIMESTAMPTZ,

    CONSTRAINT catalog_layout_versions_entity_version_key UNIQUE(entity_key, version),
    
    CONSTRAINT chk_catalog_layout_versions_draft_strict
        CHECK (
            (status = 'draft' AND version = 0 AND published_at IS NULL AND compatibility IS NULL AND checksum IS NULL)
            OR
            (status <> 'draft' AND version > 0 AND published_at IS NOT NULL AND compatibility IS NOT NULL AND checksum ~ '^[0-9a-f]{64}$')
        ),

    CONSTRAINT chk_catalog_layout_versions_active_published 
        CHECK ((is_active = true AND status = 'published') OR (is_active = false))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_layout_versions_single_draft
ON catalog_layout_versions (entity_key)
WHERE status = 'draft';

CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_layout_versions_single_active
ON catalog_layout_versions (entity_key)
WHERE is_active = true;

CREATE OR REPLACE FUNCTION prevent_published_layout_modification()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
        IF NOT (
            (OLD.status = 'draft' AND NEW.status = 'published') OR
            (OLD.status = 'published' AND NEW.status = 'deprecated') OR
            (OLD.status = 'deprecated' AND NEW.status = 'archived')
        ) THEN
            RAISE EXCEPTION 'invalid state transition from % to % for catalog layout version', OLD.status, NEW.status;
        END IF;
    END IF;

    IF OLD.published_at IS NOT NULL THEN
        IF NEW.id IS DISTINCT FROM OLD.id OR
           NEW.entity_key IS DISTINCT FROM OLD.entity_key OR
           NEW.version IS DISTINCT FROM OLD.version OR
           NEW.created_at IS DISTINCT FROM OLD.created_at OR
           NEW.published_at IS DISTINCT FROM OLD.published_at OR
           NEW.document IS DISTINCT FROM OLD.document OR
           NEW.compatibility IS DISTINCT FROM OLD.compatibility OR
           NEW.checksum IS DISTINCT FROM OLD.checksum THEN
            RAISE EXCEPTION 'published catalog_layout_version content is permanently immutable';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_published_layout_modification ON catalog_layout_versions;
CREATE TRIGGER trg_prevent_published_layout_modification
BEFORE UPDATE ON catalog_layout_versions
FOR EACH ROW EXECUTE FUNCTION prevent_published_layout_modification();

CREATE OR REPLACE FUNCTION prevent_published_layout_deletion()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.published_at IS NOT NULL THEN
        RAISE EXCEPTION 'published catalog_layout_version records cannot be deleted';
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_published_layout_deletion ON catalog_layout_versions;
CREATE TRIGGER trg_prevent_published_layout_deletion
BEFORE DELETE ON catalog_layout_versions
FOR EACH ROW EXECUTE FUNCTION prevent_published_layout_deletion();

INSERT INTO rbac_role_permissions (role_id, permission_key)
SELECT r.id, key
FROM rbac_roles r
CROSS JOIN (VALUES
    ('sigdesk.catalog.author'),
    ('sigdesk.catalog.publish')
) AS permissions(key)
WHERE r.name = 'admin'
ON CONFLICT DO NOTHING;
