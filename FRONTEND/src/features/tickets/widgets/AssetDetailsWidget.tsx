import { Building2, CircleDot, Network, Server, ShieldCheck } from 'lucide-react';
import type { TicketPageContext } from './context';

function text(snapshot: Record<string, unknown>, key: string): string {
  const value = snapshot[key];
  return typeof value === 'string' ? value : '';
}

export function AssetDetailsWidget({ context }: { context: TicketPageContext }) {
  const links = context.assets.links;
  return (
    <div className="overflow-hidden rounded-3xl border border-border/40 bg-surface-container-low">
      <div className="border-b border-border/40 p-6">
        <h2 className="flex items-center gap-2 font-black tracking-wide text-on-surface">
          <Server className="h-5 w-5 text-primary" /> Related Assets
        </h2>
        <p className="mt-1 text-xs text-on-surface-variant">
          Historical snapshot captured from Assets / CMDB when the record was created
        </p>
      </div>
      {links.length ? (
        <div className="space-y-3 p-4">
          {links.map((link) => {
            const snapshot = link.snapshot ?? {};
            const isSite = link.role === 'site' || text(snapshot, 'kind') === 'site';
            const name = text(snapshot, 'displayName') || link.assetId;
            const type = text(snapshot, 'assetType') || text(snapshot, 'kind') || 'asset';
            const status = text(snapshot, 'status') || text(snapshot, 'lifecycle');
            return (
              <article key={`${link.assetId}:${link.role ?? ''}`} className="rounded-2xl border border-border/40 bg-surface-container p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
                    {isSite ? <Building2 className="h-5 w-5 text-primary" /> : <ShieldCheck className="h-5 w-5 text-primary" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate font-bold text-on-surface">{name}</h3>
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase text-primary">{link.role || 'related'}</span>
                    </div>
                    <p className="mt-1 text-xs text-on-surface-variant">{type}</p>
                  </div>
                  {status && <span className="inline-flex items-center gap-1 text-xs text-emerald-300"><CircleDot className="h-3 w-3" />{status}</span>}
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
                  {text(snapshot, 'manufacturer') && <div><dt className="text-on-surface-variant">Manufacturer</dt><dd className="font-semibold text-on-surface">{text(snapshot, 'manufacturer')}</dd></div>}
                  {text(snapshot, 'model') && <div><dt className="text-on-surface-variant">Model</dt><dd className="font-semibold text-on-surface">{text(snapshot, 'model')}</dd></div>}
                  {text(snapshot, 'serial') && <div><dt className="text-on-surface-variant">Serial</dt><dd className="font-mono text-on-surface">{text(snapshot, 'serial')}</dd></div>}
                  {text(snapshot, 'ipAddress') && <div><dt className="flex items-center gap-1 text-on-surface-variant"><Network className="h-3 w-3" />IP</dt><dd className="font-mono text-on-surface">{text(snapshot, 'ipAddress')}</dd></div>}
                </dl>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="p-6 text-center text-sm italic text-on-surface-variant">No assets linked to this record.</div>
      )}
    </div>
  );
}
