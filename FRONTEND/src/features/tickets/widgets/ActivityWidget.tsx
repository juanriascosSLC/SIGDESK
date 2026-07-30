import { Clock, MessageSquare, Merge, Paperclip, Pencil, Send, UserCheck, Zap, Eye } from 'lucide-react';
import type { ActivityKind, TicketActivityEntry } from '../types';
import type { TicketPageContext, TimelineItem } from './context';

function activityIcon(kind: ActivityKind) {
  switch (kind) {
    case 'created':
      return { Icon: Zap, className: 'border-primary/30 bg-primary/10 text-primary shadow-[0_0_15px_rgba(34,211,238,0.2)]' };
    case 'status_changed':
      return { Icon: Clock, className: 'border-amber-500/30 bg-amber-500/10 text-amber-400' };
    case 'assigned':
      return { Icon: UserCheck, className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' };
    case 'attached':
      return { Icon: Paperclip, className: 'border-border/50 bg-surface-container text-on-surface-variant' };
    case 'merged':
    case 'unmerged':
      return { Icon: Merge, className: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-400' };
    case 'watcher_added':
    case 'watcher_removed':
      return { Icon: Eye, className: 'border-border/50 bg-surface-container text-on-surface-variant' };
    case 'fields_updated':
      return { Icon: Pencil, className: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-400' };
    default:
      return { Icon: MessageSquare, className: 'border-border/50 bg-surface-container text-on-surface-variant' };
  }
}

function activityValue(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized || undefined;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return undefined;
}

function activityValues(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(activityValue).filter((item): item is string => Boolean(item));
  }
  const raw = activityValue(value);
  if (!raw) return [];
  // Historical merge activities stored mergedIds as either a plain string or
  // a JSON-encoded array. Current activities correctly store a JSON array.
  if (raw.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map(activityValue).filter((item): item is string => Boolean(item));
      }
    } catch {
      // Fall through and treat malformed legacy data as a plain identifier.
    }
  }
  return raw.split(',').map((item) => item.trim()).filter(Boolean);
}

function activityText(entry: TicketActivityEntry): string {
  const payload = entry.payload || {};
  switch (entry.kind) {
    case 'created': {
      const priority = activityValue(payload.priority);
      const category = activityValue(payload.category);
      return `Ticket created${priority ? ` with priority ${priority}` : ''}${category ? ` in category ${category}` : ''}.`;
    }
    case 'status_changed': {
      const from = activityValue(payload.from) ?? '?';
      const to = activityValue(payload.to) ?? '?';
      return `Status changed from ${from} to ${to}.`;
    }
    case 'assigned': {
      const assigneeName = activityValue(payload.assigneeName);
      return assigneeName ? `Assigned to ${assigneeName}.` : 'Unassigned.';
    }
    case 'attached': {
      const fileName = activityValue(payload.fileName) ?? 'a file';
      const size = typeof payload.sizeBytes === 'number' ? ` (${Math.ceil(payload.sizeBytes / 1024)} KB)` : '';
      return `Attached ${fileName}${size}.`;
    }
    case 'merged': {
      const mergedInto = activityValue(payload.mergedInto);
      const mergedIds = activityValues(payload.mergedIds);
      return mergedInto
        ? `Merged into ${mergedInto}.`
        : `Merged ${mergedIds.length > 0 ? mergedIds.join(', ') : 'other tickets'} into this ticket.`;
    }
    case 'unmerged': {
      const unmergedFrom = activityValue(payload.unmergedFrom);
      const unmergedId = activityValue(payload.unmergedId);
      return unmergedFrom ? `Unmerged from ${unmergedFrom}.` : `Unmerged ${unmergedId ?? 'a ticket'} from this one.`;
    }
    case 'watcher_added':
      return 'Started watching this ticket.';
    case 'watcher_removed':
      return 'Stopped watching this ticket.';
    case 'fields_updated': {
      const fields = Array.isArray(payload.fields) ? payload.fields.map(String).join(', ') : '';
      return fields ? `Actualizó los campos: ${fields}.` : 'Actualizó los datos del ticket.';
    }
    default:
      return entry.kind;
  }
}

function TimelineEntry({ item }: { item: TimelineItem }) {
  if (item.kind === 'comment') {
    const comment = item.comment;
    return (
      <div
        className={`p-4 rounded-2xl border ${
          comment.isInternal ? 'border-amber-500/20 bg-amber-500/5' : 'border-border/40 bg-surface-container'
        }`}
      >
        <div className="flex items-center justify-between mb-1">
          <div className="font-bold text-on-surface text-sm flex items-center gap-2">
            {comment.authorName}
            {comment.isInternal && (
              <span className="px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-400 text-[9px] font-black uppercase tracking-wider">
                Internal Note
              </span>
            )}
          </div>
          <time className="font-mono text-[10px] text-on-surface-variant">
            {new Date(comment.createdAt).toLocaleString(undefined, {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </time>
        </div>
        <div className="text-on-surface-variant text-sm whitespace-pre-wrap">{comment.body}</div>
      </div>
    );
  }
  const { entry } = item;
  const { Icon, className } = activityIcon(entry.kind);
  return (
    <div className="flex items-start gap-3 p-3 rounded-2xl border border-border/20">
      <div className={`flex items-center justify-center w-8 h-8 rounded-full border shrink-0 ${className}`}>
        <Icon className="w-3.5 h-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <span className="font-bold text-on-surface text-xs">{entry.actorName || 'System'}</span>
          <time className="font-mono text-[10px] text-on-surface-variant">
            {new Date(entry.createdAt).toLocaleString(undefined, {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </time>
        </div>
        <div className="text-on-surface-variant text-sm">{activityText(entry)}</div>
      </div>
    </div>
  );
}

export function ActivityWidget({ context }: { context: TicketPageContext }) {
  const { activity, attachments, currentUserName } = context;
  return (
    <div className="bg-surface-container-low border border-border/40 rounded-3xl p-6">
      <div className="flex items-center justify-between mb-4 border-b border-border/40 pb-2">
        <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-wider">Activity Stream</h3>
        <div className="flex gap-1 text-[10px] font-bold uppercase tracking-wider">
          {(['all', 'comments', 'history'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => activity.onTabChange(tab)}
              className={`px-3 py-1 rounded-lg transition-colors ${
                activity.tab === tab
                  ? 'bg-primary/10 border border-primary/20 text-primary'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
              }`}
            >
              {tab === 'all' ? 'All' : tab === 'comments' ? 'Comments' : 'History'}
            </button>
          ))}
        </div>
      </div>
      {activity.loading ? (
        <p className="text-sm text-on-surface-variant py-6 text-center">Loading activity…</p>
      ) : activity.timeline.length === 0 ? (
        <p className="text-sm text-on-surface-variant py-6 text-center italic">No activity yet.</p>
      ) : (
        <div className="space-y-4">
          {activity.timeline.map((item) => (
            <TimelineEntry key={item.kind === 'comment' ? `comment-${item.comment.id}` : `activity-${item.entry.id}`} item={item} />
          ))}
        </div>
      )}

      <div className="mt-8 pt-6 border-t border-border/40">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-surface-container-high border border-border/50 flex items-center justify-center text-[10px] font-bold text-on-surface shrink-0">
            {currentUserName.slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1">
            <textarea
              rows={3}
              value={activity.commentBody}
              onChange={(event) => activity.onCommentBodyChange(event.target.value)}
              placeholder="Add a comment…"
              className="w-full bg-surface-container border border-border/50 text-on-surface text-sm rounded-2xl px-4 py-3 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all resize-none"
            />
            {activity.commentError && <p className="mt-2 text-sm text-red-400">{activity.commentError}</p>}
            <div className="flex items-center justify-between mt-2">
              <button
                onClick={attachments.onTriggerPicker}
                className="flex items-center gap-2 text-xs text-on-surface-variant hover:text-on-surface transition-colors"
              >
                <Paperclip className="w-3.5 h-3.5" />
                Attach file
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => activity.onSubmitComment(true)}
                  disabled={activity.commentPending || !activity.commentBody.trim()}
                  className="px-4 py-2 rounded-xl bg-surface-container border border-amber-500/20 text-amber-400 text-xs font-bold hover:bg-amber-500/10 transition-colors disabled:opacity-50"
                >
                  Internal Note
                </button>
                <button
                  onClick={() => activity.onSubmitComment(false)}
                  disabled={activity.commentPending || !activity.commentBody.trim()}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold shadow-[0_0_15px_rgba(34,211,238,0.3)] hover:shadow-[0_0_25px_rgba(34,211,238,0.5)] transition-all disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  Reply
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
