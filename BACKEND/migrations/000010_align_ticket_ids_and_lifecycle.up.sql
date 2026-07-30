-- Two fixes at the catalog <-> tickets seam, both consequences of the
-- Catalog Builder becoming the lifecycle authority (see ADR-0006 and the
-- generic metadata runtime).

-- 1. The lifecycle of an INC is now declared in a published catalog
--    Definition, which an admin edits from the Catalog Builder UI. A
--    hardcoded CHECK listing four states would reject any state that
--    admin legitimately defines (on_hold, closed, cancelled, ...), and
--    because the projection runs off the transactional outbox the failure
--    would be an infinite retry loop rather than a visible error.
--    Tickets keeps a NOT NULL / length guard, but stops asserting *which*
--    states exist: that authority belongs to the definition's manifest.
ALTER TABLE tickets
    DROP CONSTRAINT IF EXISTS tickets_status_check;

ALTER TABLE tickets
    DROP CONSTRAINT IF EXISTS tickets_status_not_blank;

ALTER TABLE tickets
    ADD CONSTRAINT tickets_status_not_blank
    CHECK (length(trim(status)) > 0);

-- Priority is a select field on the same Definition, so its option list is
-- equally admin-editable and equally unsafe to pin in a CHECK.
ALTER TABLE tickets
    DROP CONSTRAINT IF EXISTS tickets_priority_check;

ALTER TABLE tickets
    DROP CONSTRAINT IF EXISTS tickets_priority_not_blank;

ALTER TABLE tickets
    ADD CONSTRAINT tickets_priority_not_blank
    CHECK (length(trim(priority)) > 0);

-- 2. human_id was minted by two independent sequences that both format as
--    '<PREFIX>-000NNN': entity_human_id_seq (catalog, global across every
--    entity type) and ticket_human_id_seq (tickets only). They collided
--    immediately after any seed, which made a ticket created through the
--    real Service Catalog silently land on an existing ticket's id.
--    Tickets now draws from the catalog's sequence, so the id space is
--    shared and collisions are structurally impossible.
SELECT setval(
    'entity_human_id_seq',
    GREATEST(
        (
            SELECT COALESCE(MAX(NULLIF(regexp_replace(human_id, '\D', '', 'g'), '')::bigint), 0)
            FROM tickets
        ),
        (SELECT last_value FROM entity_human_id_seq),
        1
    ),
    true
);

ALTER TABLE tickets
    ALTER COLUMN human_id
    SET DEFAULT ('INC-' || lpad(nextval('entity_human_id_seq')::text, 6, '0'));

DROP SEQUENCE IF EXISTS ticket_human_id_seq;
