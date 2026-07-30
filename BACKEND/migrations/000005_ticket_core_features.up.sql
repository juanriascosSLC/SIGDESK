-- Child entities key off tickets.human_id (e.g. 'INC-000123') rather than
-- the internal UUID PK: human_id is the identifier the domain layer and
-- the HTTP API use everywhere (ports.Repository.GetByID takes a human_id),
-- and it already carries a UNIQUE constraint from 000001_create_tickets.

ALTER TABLE tickets
    ADD COLUMN IF NOT EXISTS merged_into_id VARCHAR(16) NULL REFERENCES tickets(human_id);

CREATE INDEX IF NOT EXISTS tickets_merged_into_id_idx
    ON tickets (merged_into_id)
    WHERE merged_into_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS tickets_assignee_name_idx
    ON tickets (assignee_name);

CREATE TABLE IF NOT EXISTS ticket_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id VARCHAR(16) NOT NULL REFERENCES tickets(human_id) ON DELETE CASCADE,
    author_name VARCHAR(160) NOT NULL,
    body TEXT NOT NULL,
    is_internal BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ticket_comments_ticket_id_created_at_idx
    ON ticket_comments (ticket_id, created_at);

CREATE TABLE IF NOT EXISTS ticket_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id VARCHAR(16) NOT NULL REFERENCES tickets(human_id) ON DELETE CASCADE,
    uploader_name VARCHAR(160) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    content_type VARCHAR(120) NOT NULL,
    size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),
    storage_key VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ticket_attachments_ticket_id_created_at_idx
    ON ticket_attachments (ticket_id, created_at);

CREATE TABLE IF NOT EXISTS ticket_watchers (
    ticket_id VARCHAR(16) NOT NULL REFERENCES tickets(human_id) ON DELETE CASCADE,
    watcher_name VARCHAR(160) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (ticket_id, watcher_name)
);

CREATE TABLE IF NOT EXISTS ticket_activity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id VARCHAR(16) NOT NULL REFERENCES tickets(human_id) ON DELETE CASCADE,
    kind VARCHAR(32) NOT NULL CHECK (kind IN (
        'created', 'status_changed', 'assigned', 'commented',
        'attached', 'merged', 'unmerged', 'watcher_added', 'watcher_removed'
    )),
    actor_name VARCHAR(160),
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ticket_activity_ticket_id_created_at_idx
    ON ticket_activity (ticket_id, created_at);

-- The demo seed (000002) gave INC-000001 a decorative merged_count of 3
-- with no tickets behind it. Now that merge is a real operation, back
-- that number with actual absorbed tickets instead of a fake counter.
INSERT INTO tickets (
    human_id, title, description, status, priority, category,
    requester_name, asset_id, site, merged_into_id, created_at
)
VALUES
    (
        'INC-202611', 'Front gate camera shows no video feed',
        'Duplicate report of the same camera outage at the main entrance.',
        'resolved', 'critical', 'hardware', 'Emily Chen',
        'CAM-12607', 'Site #401', 'INC-000001', now() - interval '110 minutes'
    ),
    (
        'INC-202612', 'CCTV offline - main entrance',
        'Security operations flagged the entrance camera as unreachable.',
        'resolved', 'high', 'hardware', 'Security Ops',
        'CAM-12607', 'Site #401', 'INC-000001', now() - interval '100 minutes'
    ),
    (
        'INC-202613', 'Camera unreachable from VMS console',
        'The video management system cannot reach the entrance camera.',
        'resolved', 'high', 'hardware', 'Frank Miller',
        'CAM-12607', 'Site #401', 'INC-000001', now() - interval '90 minutes'
    )
ON CONFLICT (human_id) DO NOTHING;

SELECT setval(
    'ticket_human_id_seq',
    GREATEST((SELECT count(*) FROM tickets), 1),
    true
);

INSERT INTO ticket_activity (ticket_id, kind, actor_name, payload, created_at)
SELECT human_id, 'created', requester_name, jsonb_build_object('priority', priority, 'category', category), created_at
FROM tickets;

INSERT INTO ticket_activity (ticket_id, kind, actor_name, payload, created_at)
SELECT merged_into_id, 'merged', 'System Automated', jsonb_build_object('mergedIds', human_id), created_at
FROM tickets
WHERE merged_into_id IS NOT NULL;

INSERT INTO ticket_activity (ticket_id, kind, actor_name, payload, created_at)
SELECT human_id, 'merged', 'System Automated', jsonb_build_object('mergedInto', merged_into_id), created_at
FROM tickets
WHERE merged_into_id IS NOT NULL;
