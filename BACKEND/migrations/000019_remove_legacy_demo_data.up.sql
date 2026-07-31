-- Removes the disposable demo tickets that 000002_seed_demo.up.sql and
-- 000005_ticket_core_features.up.sql insert directly into `tickets`. Because
-- migrations run in full on first deploy, EVERY environment that has ever
-- been migrated — including production — got INC-000001..4 (and the three
-- merged tickets 000005 adds on top of INC-000001) automatically. This
-- migration removes exactly those rows and nothing else; 000002's historical
-- content is left untouched, as instructed, so the record of what a fresh
-- deploy used to insert stays intact.
--
-- Identification criterion: a FIXED, EXPLICIT list of the human_id values
-- those two migrations insert — not a LIKE/pattern match against mutable
-- fields like title or description. This is safe because human_id is
-- unique and minted by a monotonic sequence: 000010_align_ticket_ids_and_
-- lifecycle.up.sql already advanced entity_human_id_seq past the highest
-- numeric suffix among these rows, so no ticket created through the real
-- application (past or future) can ever collide with one of these ids. A
-- real ticket that merely resembles the demo data (similar title, same
-- priority) is untouched, because matching is by id, never by content.
--
-- Dependency graph, traced from the actual schema rather than assumed:
--   tickets.human_id is referenced (ON DELETE CASCADE) by ticket_comments,
--   ticket_attachments, ticket_watchers and ticket_activity
--   (000005_ticket_core_features.up.sql), and by tickets.merged_into_id
--   itself (self-referencing: INC-202611/12/13 -> INC-000001).
--
--   Tickets created directly via INSERT (as these demo rows are) have
--   entity_id IS NULL — see 000008_ticket_catalog_event_projection.up.sql's
--   own comment: "Tickets created directly via POST /tickets have no
--   entity_id." They were never projected through the catalog/entity
--   pipeline, so they have no corresponding entity_records row and,
--   transitively, no catalog_entity_relations, catalog_event_outbox,
--   catalog_projected_events, catalog_idempotency_keys, sla_assessments or
--   sla_processed_events rows either. The block below still computes and
--   deletes through that path explicitly (rather than assuming it's always
--   empty) so this migration stays correct if that ever changes — e.g. a
--   future seed that goes through the real catalog pipeline instead of a
--   raw INSERT.
--
-- Sequences are NOT reset. entity_human_id_seq is forward-only by design;
-- winding it back to reclaim the numbers these rows freed would only invite
-- a future collision with anything that already captured one of these ids
-- (an event payload, an audit log, a support ticket reference) and buys
-- nothing in return. Deleting rows never requires adjusting a sequence for
-- correctness — the next real ticket simply gets the next available number,
-- with a gap where the demo data used to be, which is ordinary and safe.
DO $$
DECLARE
    demo_human_ids CONSTANT VARCHAR(16)[] := ARRAY[
        'INC-000001', 'INC-000002', 'INC-000003', 'INC-000004',
        'INC-202611', 'INC-202612', 'INC-202613'
    ];
    demo_entity_ids TEXT[];
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
    -- entity_records (checked directly against their CREATE TABLE
    -- statements), so each needs its own explicit delete.
    DELETE FROM sla_processed_events
    WHERE event_id IN (
        SELECT event_id FROM catalog_event_outbox WHERE aggregate_id = ANY(demo_entity_ids)
    );
    DELETE FROM sla_assessments WHERE entity_id = ANY(demo_entity_ids);
    DELETE FROM catalog_projected_events WHERE entity_id = ANY(demo_entity_ids);
    DELETE FROM catalog_event_outbox WHERE aggregate_id = ANY(demo_entity_ids);
    DELETE FROM entity_records WHERE id::text = ANY(demo_entity_ids);

    -- Ticket-pipeline dependents. Explicit rather than relying solely on
    -- their ON DELETE CASCADE, so the rows removed are verifiable one table
    -- at a time.
    DELETE FROM ticket_activity WHERE ticket_id = ANY(demo_human_ids);
    DELETE FROM ticket_comments WHERE ticket_id = ANY(demo_human_ids);
    DELETE FROM ticket_attachments WHERE ticket_id = ANY(demo_human_ids);
    DELETE FROM ticket_watchers WHERE ticket_id = ANY(demo_human_ids);

    -- The demo tickets themselves, all in one statement so the
    -- self-referencing merged_into_id foreign key (INC-202611..13 point at
    -- INC-000001, all within this same set) never has a dangling reference
    -- mid-statement.
    DELETE FROM tickets WHERE human_id = ANY(demo_human_ids);
END $$;
