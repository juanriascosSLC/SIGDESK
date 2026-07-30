DELETE FROM ticket_activity WHERE kind = 'fields_updated';

ALTER TABLE ticket_activity
    DROP CONSTRAINT IF EXISTS ticket_activity_kind_check;

ALTER TABLE ticket_activity
    ADD CONSTRAINT ticket_activity_kind_check CHECK (kind IN (
        'created', 'status_changed', 'assigned', 'commented',
        'attached', 'merged', 'unmerged', 'watcher_added',
        'watcher_removed'
    ));
