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

SELECT setval(
    'ticket_human_id_seq',
    GREATEST((SELECT count(*) FROM tickets), 1),
    true
);
