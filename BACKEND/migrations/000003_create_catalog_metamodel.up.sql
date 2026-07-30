CREATE TABLE IF NOT EXISTS catalog_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_key VARCHAR(64) NOT NULL,
    name VARCHAR(160) NOT NULL,
    version INTEGER NOT NULL CHECK (version > 0),
    status VARCHAR(16) NOT NULL CHECK (status IN ('draft', 'published', 'archived')),
    specification JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at TIMESTAMPTZ,
    UNIQUE (entity_key, version)
);

CREATE UNIQUE INDEX IF NOT EXISTS catalog_one_published_version_idx
    ON catalog_definitions (entity_key)
    WHERE status = 'published';

CREATE INDEX IF NOT EXISTS catalog_definitions_status_idx
    ON catalog_definitions (status, entity_key);

CREATE SEQUENCE IF NOT EXISTS entity_human_id_seq START 1;

CREATE TABLE IF NOT EXISTS entity_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    human_id VARCHAR(80) NOT NULL UNIQUE,
    entity_key VARCHAR(64) NOT NULL,
    definition_id UUID NOT NULL REFERENCES catalog_definitions(id),
    definition_version INTEGER NOT NULL,
    state VARCHAR(64) NOT NULL,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS entity_records_type_created_idx
    ON entity_records (entity_key, created_at DESC);

INSERT INTO catalog_definitions (
    entity_key, name, version, status, specification, published_at
)
VALUES (
    'INC',
    'Incidente',
    1,
    'published',
    '{
      "description": "Registra y gestiona una interrupción o degradación de un servicio.",
      "identity": {"prefix": "INC"},
      "fields": [
        {
          "key": "title",
          "label": "Título",
          "type": "text",
          "required": true,
          "minLength": 3,
          "maxLength": 160,
          "placeholder": "Describe brevemente el incidente"
        },
        {
          "key": "description",
          "label": "Descripción",
          "type": "textarea",
          "required": true,
          "minLength": 10,
          "maxLength": 10000,
          "placeholder": "Incluye el impacto y los síntomas observados"
        },
        {
          "key": "priority",
          "label": "Prioridad",
          "type": "select",
          "required": true,
          "defaultValue": "medium",
          "options": [
            {"value": "low", "label": "Baja"},
            {"value": "medium", "label": "Media"},
            {"value": "high", "label": "Alta"},
            {"value": "critical", "label": "Crítica"}
          ]
        },
        {
          "key": "assetId",
          "label": "Activo relacionado",
          "type": "text",
          "required": false,
          "maxLength": 120,
          "placeholder": "Ej. CAM-12345"
        }
      ],
      "lifecycle": {
        "states": [
          {"key": "open", "label": "Abierto", "initial": true},
          {"key": "in_progress", "label": "En progreso"},
          {"key": "pending_review", "label": "En revisión"},
          {"key": "resolved", "label": "Resuelto"}
        ],
        "transitions": [
          {"key": "start", "label": "Iniciar atención", "from": "open", "to": "in_progress"},
          {"key": "request_review", "label": "Solicitar revisión", "from": "in_progress", "to": "pending_review"},
          {"key": "resolve", "label": "Resolver", "from": "in_progress", "to": "resolved"},
          {"key": "reopen", "label": "Reabrir", "from": "resolved", "to": "open"}
        ]
      },
      "bindings": [
        {"kind": "permissionPolicy", "resourceId": "iam:policy:incident-default"},
        {"kind": "slaPolicy", "resourceId": "sla:policy:incident-standard"}
      ],
      "views": {
        "create": ["title", "description", "priority", "assetId"],
        "summary": ["title", "priority"]
      }
    }'::jsonb,
    now()
)
ON CONFLICT (entity_key, version) DO NOTHING;
