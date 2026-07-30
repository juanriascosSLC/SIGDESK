-- Repair records created before 000010 aligned the shared identifier space,
-- then recover projections that were blocked by those historical collisions.
SELECT setval(
    'entity_human_id_seq',
    GREATEST(
        COALESCE((
            SELECT MAX((substring(human_id FROM '([0-9]+)$'))::bigint)
            FROM tickets
            WHERE human_id ~ '[0-9]+$'
        ), 0),
        COALESCE((
            SELECT MAX((substring(human_id FROM '([0-9]+)$'))::bigint)
            FROM entity_records
            WHERE human_id ~ '[0-9]+$'
        ), 0),
        1
    ),
    true
);

CREATE TEMP TABLE catalog_human_id_repairs (
    entity_id UUID PRIMARY KEY,
    old_human_id VARCHAR(80) NOT NULL,
    new_human_id VARCHAR(80) NOT NULL UNIQUE
) ON COMMIT DROP;

INSERT INTO catalog_human_id_repairs (entity_id, old_human_id, new_human_id)
SELECT
    entity.id,
    entity.human_id,
    regexp_replace(
        entity.human_id,
        '[0-9]+$',
        lpad(nextval('entity_human_id_seq')::text, 6, '0')
    )
FROM entity_records AS entity
JOIN tickets AS ticket ON ticket.human_id = entity.human_id
WHERE ticket.entity_id IS DISTINCT FROM entity.id::text
ORDER BY entity.created_at;

UPDATE entity_records AS entity
SET human_id = repair.new_human_id
FROM catalog_human_id_repairs AS repair
WHERE entity.id = repair.entity_id;

UPDATE catalog_event_outbox AS outbox
SET payload = jsonb_set(outbox.payload, '{humanId}', to_jsonb(repair.new_human_id), false)
FROM catalog_human_id_repairs AS repair
WHERE outbox.aggregate_id = repair.entity_id::text
  AND outbox.published_at IS NULL;

UPDATE sla_assessments AS assessment
SET
    human_id = repair.new_human_id,
    assessment = jsonb_set(assessment.assessment, '{humanId}', to_jsonb(repair.new_human_id), false),
    updated_at = now()
FROM catalog_human_id_repairs AS repair
WHERE assessment.entity_id = repair.entity_id::text;

-- Recover INC entities created while the projection was not subscribed or
-- while their previous human id collided.
INSERT INTO catalog_event_outbox (
    event_id,
    event_type,
    occurred_at,
    aggregate_id,
    entity_key,
    schema_version,
    payload,
    available_at
)
SELECT
    gen_random_uuid(),
    'catalog.entity.created.v1',
    entity.updated_at,
    entity.id::text,
    entity.entity_key,
    '1',
    jsonb_build_object(
        'entityId', entity.id::text,
        'humanId', entity.human_id,
        'entityKey', entity.entity_key,
        'definitionVersionId', entity.definition_version_id::text,
        'definitionVersion', entity.definition_version,
        'manifestChecksum', entity.manifest_checksum,
        'state', entity.state,
        'data', entity.data,
        'resources', COALESCE(definition.manifest->'resources', '[]'::jsonb)
    ),
    now()
FROM entity_records AS entity
JOIN catalog_definitions AS definition
    ON definition.id = entity.definition_version_id
WHERE entity.entity_key = 'INC'
  AND NOT EXISTS (
      SELECT 1 FROM tickets WHERE tickets.entity_id = entity.id::text
  )
  AND NOT EXISTS (
      SELECT 1
      FROM catalog_event_outbox AS pending
      WHERE pending.aggregate_id = entity.id::text
        AND pending.event_type = 'catalog.entity.created.v1'
        AND pending.published_at IS NULL
  );
