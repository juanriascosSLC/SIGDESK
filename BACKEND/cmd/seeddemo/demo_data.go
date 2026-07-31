package main

// demoDataSQL is the same sample dataset 000002_seed_demo.up.sql and
// 000005_ticket_core_features.up.sql used to insert automatically into every
// migrated database. Since 000019_remove_legacy_demo_data.up.sql now removes
// that outcome, this is the only way to get it back — and only on demand.
//
// Two differences from the original migration SQL, both deliberate:
//
//  1. The activity-generating INSERT ... SELECT ... FROM tickets statements
//     are scoped to WHERE human_id = ANY(the demo ids). The originals ran
//     unfiltered against an empty table, where that only ever matched the
//     rows just inserted; this command can run against a database that
//     already has real tickets, and an unfiltered SELECT would fabricate
//     "created"/"merged" activity for every one of them.
//  2. No sequence adjustment: these ids are fixed literals, not drawn from
//     entity_human_id_seq, so inserting them never needs to touch it.
const demoDataSQL = `
INSERT INTO tickets (
    human_id, title, description, status, priority, category,
    requester_name, assignee_name, asset_id, site, merged_count, created_at
)
VALUES
    (
        'INC-000001', 'Camera offline at Site #401',
        'The main entrance camera is not responding to health checks.',
        'open', 'critical', 'hardware', 'John Doe', NULL,
        'CAM-12607', 'Site #401', 3, now() - interval '2 hours'
    ),
    (
        'INC-000002', 'Need access to SIGInstallations',
        'Please grant administrator access to the installations portal.',
        'in_progress', 'medium', 'software', 'Jane Smith', 'Laura Kim',
        NULL, 'HQ', 0, now() - interval '1 day'
    ),
    (
        'INC-000003', 'Network latency issues in Building A',
        'Users are reporting intermittent latency when accessing internal services.',
        'pending_review', 'high', 'network', 'Mike Ross', 'Laura Kim',
        NULL, 'Building A', 0, now() - interval '5 hours'
    ),
    (
        'INC-000004', 'Password reset for badge portal',
        'User is locked out of the access-control badge portal.',
        'resolved', 'low', 'software', 'Emily Chen', 'Laura Kim',
        NULL, 'HQ', 0, now() - interval '3 days'
    )
ON CONFLICT (human_id) DO NOTHING;

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

INSERT INTO ticket_activity (ticket_id, kind, actor_name, payload, created_at)
SELECT human_id, 'created', requester_name, jsonb_build_object('priority', priority, 'category', category), created_at
FROM tickets
WHERE human_id = ANY(ARRAY[
    'INC-000001', 'INC-000002', 'INC-000003', 'INC-000004',
    'INC-202611', 'INC-202612', 'INC-202613'
]);

INSERT INTO ticket_activity (ticket_id, kind, actor_name, payload, created_at)
SELECT merged_into_id, 'merged', 'System Automated', jsonb_build_object('mergedIds', human_id), created_at
FROM tickets
WHERE merged_into_id IS NOT NULL
  AND human_id = ANY(ARRAY['INC-202611', 'INC-202612', 'INC-202613']);

INSERT INTO ticket_activity (ticket_id, kind, actor_name, payload, created_at)
SELECT human_id, 'merged', 'System Automated', jsonb_build_object('mergedInto', merged_into_id), created_at
FROM tickets
WHERE merged_into_id IS NOT NULL
  AND human_id = ANY(ARRAY['INC-202611', 'INC-202612', 'INC-202613']);
`
