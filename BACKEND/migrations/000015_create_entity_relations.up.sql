CREATE TABLE IF NOT EXISTS catalog_entity_relations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_version VARCHAR(16) NOT NULL DEFAULT '1',
    relation_key VARCHAR(64) NOT NULL,
    relation_label VARCHAR(160) NOT NULL,
    inverse_key VARCHAR(64) NOT NULL,
    inverse_label VARCHAR(160) NOT NULL,
    source_entity_id UUID NOT NULL REFERENCES entity_records(id) ON DELETE CASCADE,
    source_entity_key VARCHAR(64) NOT NULL,
    source_human_id VARCHAR(80) NOT NULL,
    source_definition_version_id UUID NOT NULL REFERENCES catalog_definitions(id),
    target_entity_id UUID NOT NULL REFERENCES entity_records(id) ON DELETE CASCADE,
    target_entity_key VARCHAR(64) NOT NULL,
    target_human_id VARCHAR(80) NOT NULL,
    target_definition_version_id UUID NOT NULL REFERENCES catalog_definitions(id),
    created_by VARCHAR(160) NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT catalog_entity_relations_distinct_entities
        CHECK (source_entity_id <> target_entity_id),
    CONSTRAINT catalog_entity_relations_unique_link
        UNIQUE (source_entity_id, relation_key, target_entity_id)
);

CREATE INDEX IF NOT EXISTS catalog_entity_relations_source_idx
    ON catalog_entity_relations (source_entity_id, relation_key, created_at);

CREATE INDEX IF NOT EXISTS catalog_entity_relations_target_idx
    ON catalog_entity_relations (target_entity_id, inverse_key, created_at);
