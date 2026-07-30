-- Authors work on one mutable draft per entity. Published and historical
-- versions remain immutable, but repeated saves no longer create v11, v12,
-- v13 while the same change is still being prepared.
WITH ranked_drafts AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY entity_key
            ORDER BY version DESC, created_at DESC
        ) AS position
    FROM catalog_definitions
    WHERE status = 'draft'
)
UPDATE catalog_definitions AS definition
SET status = 'retired'
FROM ranked_drafts
WHERE definition.id = ranked_drafts.id
  AND ranked_drafts.position > 1;

CREATE UNIQUE INDEX IF NOT EXISTS catalog_one_active_draft_idx
    ON catalog_definitions (entity_key)
    WHERE status = 'draft';
