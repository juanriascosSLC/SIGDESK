-- SIG-DESK owns its own roles and permissions.
--
-- Authentication stays delegated to SIGTools (ADR-0007): it answers *who* the
-- caller is, against Active Directory, for all three company apps. But *what*
-- a person may do here is SIG-DESK's business and lives in SIG-DESK's own
-- database. Reusing the shared registry would have meant sharing
-- SIGInstallations' roles (designer, field_tech, inventory_op, viewer) and
-- writing service-desk permissions into another module's tables — the admin
-- endpoints for that are even namespaced under /installations/.
--
-- Permission *keys* are deliberately NOT a table: they are defined in Go
-- (internal/identity/domain/permissions.go) because the routes enforce those
-- same constants. A table would be free to drift from what the code checks.
-- Only the grants are stored.

CREATE TABLE IF NOT EXISTS rbac_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(64) NOT NULL UNIQUE,
    label VARCHAR(160) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    -- System roles cannot be renamed or deleted: the app reasons about "admin"
    -- by name, and losing it would lock everyone out of administration.
    is_system BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT rbac_roles_name_lowercase CHECK (name = lower(name))
);

CREATE TABLE IF NOT EXISTS rbac_role_permissions (
    role_id UUID NOT NULL REFERENCES rbac_roles(id) ON DELETE CASCADE,
    permission_key VARCHAR(120) NOT NULL,
    PRIMARY KEY (role_id, permission_key)
);

-- Assignments key off the SIGTools username rather than its numeric id: it is
-- the stable, human-readable handle the identity carries, it is what an admin
-- types, and it lets a role be granted before that person has ever signed in.
CREATE TABLE IF NOT EXISTS rbac_user_roles (
    username VARCHAR(160) NOT NULL,
    role_id UUID NOT NULL REFERENCES rbac_roles(id) ON DELETE CASCADE,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    granted_by VARCHAR(160),
    PRIMARY KEY (username, role_id)
);

CREATE INDEX IF NOT EXISTS rbac_user_roles_username_idx ON rbac_user_roles (username);

-- Users are provisioned in Active Directory / SIGTools, so SIG-DESK never owns
-- the account. This is only a convenience record of people who have actually
-- signed in here, so the admin screen can offer a picker (and so someone who
-- got denied for lacking a role can be found and granted one).
CREATE TABLE IF NOT EXISTS rbac_known_users (
    username VARCHAR(160) PRIMARY KEY,
    display_name VARCHAR(160) NOT NULL DEFAULT '',
    email VARCHAR(255) NOT NULL DEFAULT '',
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Default roles for a service desk. These are SIG-DESK's own, unrelated to the
-- roles the other two apps use.
INSERT INTO rbac_roles (name, label, description, is_system) VALUES
    ('admin',   'Administrador', 'Acceso total. Omite todas las verificaciones de permisos.', true),
    ('manager', 'Manager',       'Supervisa la operación: SLA, aprobación de cambios y reportes.', false),
    ('agent',   'Agente',        'Opera tickets: atiende, asigna, comenta y resuelve.', false)
ON CONFLICT (name) DO NOTHING;

-- admin holds every key for visibility in the UI, even though the code lets it
-- bypass checks regardless.
INSERT INTO rbac_role_permissions (role_id, permission_key)
SELECT r.id, key
FROM rbac_roles r
CROSS JOIN (VALUES
    ('sigdesk.tickets.view'), ('sigdesk.tickets.create'), ('sigdesk.tickets.edit'),
    ('sigdesk.tickets.assign'), ('sigdesk.tickets.resolve'), ('sigdesk.tickets.merge'),
    ('sigdesk.tickets.comment'), ('sigdesk.tickets.attach'),
    ('sigdesk.catalog.view'), ('sigdesk.catalog.author'), ('sigdesk.catalog.publish'),
    ('sigdesk.sla.view'), ('sigdesk.sla.manage'),
    ('sigdesk.changes.view'), ('sigdesk.changes.create'), ('sigdesk.changes.edit'),
    ('sigdesk.changes.approve'), ('sigdesk.changes.implement'),
    ('sigdesk.admin.roles')
) AS permissions(key)
WHERE r.name = 'admin'
ON CONFLICT DO NOTHING;

INSERT INTO rbac_role_permissions (role_id, permission_key)
SELECT r.id, key
FROM rbac_roles r
CROSS JOIN (VALUES
    ('sigdesk.tickets.view'), ('sigdesk.tickets.create'), ('sigdesk.tickets.edit'),
    ('sigdesk.tickets.assign'), ('sigdesk.tickets.resolve'), ('sigdesk.tickets.merge'),
    ('sigdesk.tickets.comment'), ('sigdesk.tickets.attach'),
    ('sigdesk.catalog.view'),
    ('sigdesk.sla.view'), ('sigdesk.sla.manage'),
    ('sigdesk.changes.view'), ('sigdesk.changes.create'), ('sigdesk.changes.edit'),
    ('sigdesk.changes.approve')
) AS permissions(key)
WHERE r.name = 'manager'
ON CONFLICT DO NOTHING;

INSERT INTO rbac_role_permissions (role_id, permission_key)
SELECT r.id, key
FROM rbac_roles r
CROSS JOIN (VALUES
    ('sigdesk.tickets.view'), ('sigdesk.tickets.create'), ('sigdesk.tickets.edit'),
    ('sigdesk.tickets.assign'), ('sigdesk.tickets.resolve'),
    ('sigdesk.tickets.comment'), ('sigdesk.tickets.attach'),
    ('sigdesk.catalog.view'),
    ('sigdesk.sla.view'),
    ('sigdesk.changes.view'), ('sigdesk.changes.create')
) AS permissions(key)
WHERE r.name = 'agent'
ON CONFLICT DO NOTHING;
