import { MessageSquare } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/states';

/**
 * There is no backend service for chat-platform integrations yet — no
 * endpoint to connect/disconnect Slack, Teams or WhatsApp, and no real
 * message/ticket metrics to report. The previous version of this screen
 * faked all three: a hardcoded "connected" Slack card with made-up metrics
 * (42 messages, 12 tickets) and a toggle that only flipped local state. Per
 * the "no simulated data or non-functional actions" rule, this now says so
 * honestly instead of pretending to work. Replace this with the real thing
 * once a backend contract exists — do not reintroduce local fake state here.
 */
export default function ChatOps() {
  return (
    <div className="p-6 lg:p-8 w-full space-y-8 h-full overflow-y-auto">
      <PageHeader
        eyebrow={
          <div className="mb-1 flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" aria-hidden="true" />
            <span className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Settings</span>
          </div>
        }
        title="ChatOps Integrations"
        description="Connect SIG-DESK with messaging platforms so users can create tickets from chat and technicians get notified instantly."
      />
      <div className="bg-surface-container-low border border-border/40 rounded-3xl overflow-hidden">
        <EmptyState
          icon="general"
          title="ChatOps integrations aren't available yet"
          description="SIG-DESK doesn't have a backend service for connecting Slack, Microsoft Teams or WhatsApp yet. This section will become active once that capability ships — nothing here is functional in the meantime."
        />
      </div>
    </div>
  );
}
