UPDATE ticket_activity
SET payload = jsonb_set(
    payload,
    '{mergedIds}',
    jsonb_build_array(payload ->> 'mergedIds')
)
WHERE kind = 'merged'
  AND payload ? 'mergedIds'
  AND jsonb_typeof(payload -> 'mergedIds') = 'string';
