CREATE SEQUENCE IF NOT EXISTS ticket_human_id_seq START 1;

SELECT setval(
    'ticket_human_id_seq',
    GREATEST(
        (
            SELECT COALESCE(MAX(NULLIF(regexp_replace(human_id, '\D', '', 'g'), '')::bigint), 0)
            FROM tickets
        ),
        1
    ),
    true
);

ALTER TABLE tickets
    ALTER COLUMN human_id
    SET DEFAULT ('INC-' || lpad(nextval('ticket_human_id_seq')::text, 6, '0'));

ALTER TABLE tickets
    DROP CONSTRAINT IF EXISTS tickets_status_not_blank;

ALTER TABLE tickets
    ADD CONSTRAINT tickets_status_check
    CHECK (status IN ('open', 'in_progress', 'pending_review', 'resolved'));

ALTER TABLE tickets
    DROP CONSTRAINT IF EXISTS tickets_priority_not_blank;

ALTER TABLE tickets
    ADD CONSTRAINT tickets_priority_check
    CHECK (priority IN ('low', 'medium', 'high', 'critical'));
