-- DESTRUCTIVE AND IRREVERSIBLE MIGRATION: Removes historical disposable demo
-- tickets inserted by 000002_seed_demo.up.sql and 000005_ticket_core_features.up.sql.
-- Deleted rows cannot be automatically reconstructed via down.sql. If sample data
-- is needed in a non-production environment, use `cmd/seeddemo` explicitly.
--
-- Identification criterion: a FIXED, EXPLICIT list of the human_id values
-- those two migrations insert — not a LIKE/pattern match against mutable
-- fields like title or description. A real ticket that merely resembles the
-- demo data is untouched, because matching is by id, never by content.
--
-- Sequence Re-adjustment:
-- After cleaning legacy demo rows, entity_human_id_seq is re-evaluated:
--   - If NO real tickets or entity_records remain (fresh installation), sequence
--     is reset using setval('entity_human_id_seq', 1, false) so the first real
--     incident minted by the system receives INC-000001.
--   - If existing real records remain, sequence is set to max(numeric_suffix)
--     (is_called = true) so subsequent real tickets continue without sequence regression
--     or key collision.

DO $$
DECLARE
    demo_human_ids CONSTANT VARCHAR(16)[] := ARRAY[
        'INC-000001', 'INC-000002', 'INC-000003', 'INC-000004',
        'INC-202611', 'INC-202612', 'INC-202613'
    ];
    demo_entity_ids TEXT[];
    max_remaining_suffix BIGINT;
BEGIN
    SELECT COALESCE(array_agg(entity_id), ARRAY[]::text[])
    INTO demo_entity_ids
    FROM tickets
    WHERE human_id = ANY(demo_human_ids)
      AND entity_id IS NOT NULL;

    -- Entity-pipeline dependents. catalog_entity_relations and
    -- catalog_idempotency_keys cascade from entity_records (ON DELETE
    -- CASCADE, see 000015_create_entity_relations.up.sql and
    -- 000018_catalog_idempotency_keys.up.sql), so they need no explicit
    -- statement here. catalog_event_outbox, catalog_projected_events,
    -- sla_assessments and sla_processed_events have NO foreign key back to
    -- entity_records, so each needs its own explicit delete.
    DELETE FROM sla_processed_events
    WHERE event_id IN (
        SELECT event_id FROM catalog_event_outbox WHERE aggregate_id = ANY(demo_entity_ids)
    );
    DELETE FROM sla_assessments WHERE entity_id = ANY(demo_entity_ids);
    DELETE FROM catalog_projected_events WHERE entity_id = ANY(demo_entity_ids);
    DELETE FROM catalog_event_outbox WHERE aggregate_id = ANY(demo_entity_ids);
    DELETE FROM entity_records WHERE id::text = ANY(demo_entity_ids);

    -- Ticket-pipeline dependents.
    DELETE FROM ticket_activity WHERE ticket_id = ANY(demo_human_ids);
    DELETE FROM ticket_comments WHERE ticket_id = ANY(demo_human_ids);
    DELETE FROM ticket_attachments WHERE ticket_id = ANY(demo_human_ids);
    DELETE FROM ticket_watchers WHERE ticket_id = ANY(demo_human_ids);

    -- The demo tickets themselves, all in one statement so the
    -- self-referencing merged_into_id foreign key never has a dangling reference.
    DELETE FROM tickets WHERE human_id = ANY(demo_human_ids);

    -- Conditional sequence adjustment:
    -- Find maximum numeric suffix among remaining real tickets and entity_records.
    SELECT COALESCE(
        GREATEST(
            (SELECT MAX(NULLIF(regexp_replace(human_id, '\D', '', 'g'), '')::bigint) FROM tickets),
            (SELECT MAX(NULLIF(regexp_replace(human_id, '\D', '', 'g'), '')::bigint) FROM entity_records)
        ),
        0
    ) INTO max_remaining_suffix;

    IF max_remaining_suffix = 0 THEN
        -- Fresh database with no real records: reset sequence so first real incident gets INC-000001
        PERFORM setval('entity_human_id_seq', 1, false);
    ELSE
        -- Existing database with real records: set sequence to max real suffix so nextval continues safely
        PERFORM setval('entity_human_id_seq', max_remaining_suffix, true);
    END IF;
END $$;
