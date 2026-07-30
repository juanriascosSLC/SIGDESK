DROP TABLE IF EXISTS ticket_activity;
DROP TABLE IF EXISTS ticket_watchers;
DROP TABLE IF EXISTS ticket_attachments;
DROP TABLE IF EXISTS ticket_comments;
DROP INDEX IF EXISTS tickets_assignee_name_idx;
DROP INDEX IF EXISTS tickets_merged_into_id_idx;
ALTER TABLE tickets DROP COLUMN IF EXISTS merged_into_id;
