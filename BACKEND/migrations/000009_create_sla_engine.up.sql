CREATE TABLE IF NOT EXISTS sla_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_id VARCHAR(96) NOT NULL,
    version INTEGER NOT NULL CHECK (version > 0),
    status VARCHAR(20) NOT NULL CHECK (status IN ('draft', 'published', 'deprecated')),
    contract_version VARCHAR(16) NOT NULL,
    policy JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at TIMESTAMPTZ,
    UNIQUE (resource_id, version)
);

CREATE UNIQUE INDEX IF NOT EXISTS sla_one_published_policy_idx
    ON sla_policies (resource_id)
    WHERE status = 'published';

CREATE TABLE IF NOT EXISTS sla_assessments (
    entity_id VARCHAR(80) PRIMARY KEY,
    human_id VARCHAR(80) NOT NULL,
    policy_id VARCHAR(96) NOT NULL,
    policy_version INTEGER NOT NULL,
    priority VARCHAR(32) NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    response_due_at TIMESTAMPTZ NOT NULL,
    resolution_due_at TIMESTAMPTZ NOT NULL,
    assessment JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sla_assessments_due_idx
    ON sla_assessments (resolution_due_at, priority);

CREATE TABLE IF NOT EXISTS sla_processed_events (
    event_id UUID PRIMARY KEY,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO sla_policies (
    resource_id, version, status, contract_version, policy, published_at
)
VALUES (
    'sla:policy:incident-standard',
    1,
    'published',
    '1',
    '{
      "name": "Atención estándar de incidentes",
      "calendar": {"timezone": "America/Bogota", "alwaysOn": true},
      "targets": [
        {"priority": "critical", "responseMinutes": 15, "resolutionMinutes": 240},
        {"priority": "high", "responseMinutes": 30, "resolutionMinutes": 480},
        {"priority": "medium", "responseMinutes": 120, "resolutionMinutes": 960},
        {"priority": "low", "responseMinutes": 480, "resolutionMinutes": 2400}
      ],
      "pauseStates": ["on_hold", "pending_review", "waiting_customer"],
      "responseStates": ["in_progress", "resolved"],
      "resolutionStates": ["resolved"],
      "escalations": [
        {"thresholdPercent": 75, "channel": "notifications", "recipient": "assigned-team"},
        {"thresholdPercent": 100, "channel": "notifications", "recipient": "service-owner"}
      ]
    }'::jsonb,
    now()
)
ON CONFLICT (resource_id, version) DO NOTHING;
