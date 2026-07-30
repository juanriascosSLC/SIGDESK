INSERT INTO rbac_role_permissions (role_id, permission_key)
SELECT role.id, permission_key
FROM rbac_roles AS role
CROSS JOIN (VALUES
    ('sigdesk.problems.view'),
    ('sigdesk.problems.create'),
    ('sigdesk.problems.edit'),
    ('sigdesk.problems.resolve')
) AS permissions(permission_key)
WHERE role.name IN ('admin', 'manager')
ON CONFLICT DO NOTHING;

INSERT INTO rbac_role_permissions (role_id, permission_key)
SELECT role.id, permission_key
FROM rbac_roles AS role
CROSS JOIN (VALUES
    ('sigdesk.problems.view'),
    ('sigdesk.problems.create')
) AS permissions(permission_key)
WHERE role.name = 'agent'
ON CONFLICT DO NOTHING;
