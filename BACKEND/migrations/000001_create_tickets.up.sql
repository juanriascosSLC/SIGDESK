CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SEQUENCE IF NOT EXISTS ticket_human_id_seq START 1;

CREATE TABLE IF NOT EXISTS tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    human_id VARCHAR(16) NOT NULL UNIQUE
        DEFAULT ('INC-' || lpad(nextval('ticket_human_id_seq')::text, 6, '0')),
    title VARCHAR(160) NOT NULL,
    description TEXT NOT NULL,
    status VARCHAR(32) NOT NULL
        CHECK (status IN ('open', 'in_progress', 'pending_review', 'resolved')),
    priority VARCHAR(16) NOT NULL
        CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    category VARCHAR(80) NOT NULL DEFAULT 'general',
    requester_name VARCHAR(160) NOT NULL,
    assignee_name VARCHAR(160),
    asset_id VARCHAR(120),
    site VARCHAR(160),
    merged_count INTEGER NOT NULL DEFAULT 0 CHECK (merged_count >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tickets_status_created_at_idx
    ON tickets (status, created_at DESC);

CREATE INDEX IF NOT EXISTS tickets_priority_status_idx
    ON tickets (priority, status);
