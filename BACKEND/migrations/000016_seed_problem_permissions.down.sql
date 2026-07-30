DELETE FROM rbac_role_permissions
WHERE permission_key IN (
    'sigdesk.problems.view',
    'sigdesk.problems.create',
    'sigdesk.problems.edit',
    'sigdesk.problems.resolve'
);
