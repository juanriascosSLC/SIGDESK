import { Key } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/states';

/**
 * There is no backend service for API key management yet — no endpoint to
 * list, generate, or revoke keys. The previous version of this screen faked
 * all of it (a hardcoded key list, `Math.random()`-based key generation,
 * local-only revoke) which looked functional but did nothing real. Per the
 * "no simulated data or non-functional actions" rule, this now says so
 * honestly instead of pretending to work. Replace this with the real thing
 * once a backend contract exists — do not reintroduce local fake state here.
 */
export default function ApiKeys() {
  return (
    <div className="p-6 lg:p-8 w-full space-y-6 h-full overflow-y-auto">
      <PageHeader
        eyebrow={
          <div className="mb-1 flex items-center gap-2">
            <Key className="h-5 w-5 text-primary" aria-hidden="true" />
            <span className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Settings</span>
          </div>
        }
        title="API Keys & Integrations"
        description="Manage API keys to allow external applications to interact with SIG-DESK."
      />
      <div className="bg-surface-container-low border border-border/40 rounded-3xl overflow-hidden">
        <EmptyState
          icon="general"
          title="API key management isn't available yet"
          description="SIG-DESK doesn't have a backend service for issuing or revoking API keys yet. This section will become active once that capability ships — nothing here is functional in the meantime."
        />
      </div>
    </div>
  );
}
