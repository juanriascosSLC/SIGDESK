-- 000020_create_catalog_layout_versions.down.sql
DROP TRIGGER IF EXISTS trg_prevent_published_layout_deletion ON catalog_layout_versions;
DROP FUNCTION IF EXISTS prevent_published_layout_deletion();
DROP TRIGGER IF EXISTS trg_prevent_published_layout_modification ON catalog_layout_versions;
DROP FUNCTION IF EXISTS prevent_published_layout_modification();
DROP TABLE IF EXISTS catalog_layout_versions;
