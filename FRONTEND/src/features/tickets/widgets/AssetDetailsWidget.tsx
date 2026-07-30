import { Server, ShieldCheck } from 'lucide-react';
import type { TicketPageContext } from './context';

// Projection from SIGInventory — Tickets only positions/renders it; the real
// technical data (when the SIGInventory connector exists) will come from
// there, not from Catalog Builder.
export function AssetDetailsWidget({ context }: { context: TicketPageContext }) {
  const assetId = (context.entityData.assetId as string | undefined) || context.ticket.assetId;
  return (
    <div className="rounded-3xl border border-border/40 bg-surface-container-low overflow-hidden">
      <div className="p-6 border-b border-border/40">
        <h2 className="font-black tracking-wide text-on-surface flex items-center gap-2">
          <Server className="w-5 h-5 text-primary" />
          Asset Details
        </h2>
        <p className="text-xs text-on-surface-variant mt-1">Synced live from SIGInventory</p>
      </div>
      {assetId ? (
        <div className="p-6 space-y-6">
          <div className="flex flex-col items-center justify-center p-6 bg-surface-container border border-border/40 rounded-3xl text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4 shadow-[0_0_20px_rgba(34,211,238,0.15)]">
              <ShieldCheck className="w-8 h-8 text-primary" />
            </div>
            <h3 className="font-bold text-lg text-on-surface">{assetId}</h3>
            <p className="mt-2 text-xs text-on-surface-variant">Activo vinculado desde la definición INC.</p>
          </div>
          <p className="rounded-xl border border-border/40 bg-surface-container p-3 text-xs text-on-surface-variant">
            Los datos técnicos aparecerán aquí cuando el conector de SIGInventory entregue una
            proyección real. No se muestran valores de demostración.
          </p>
        </div>
      ) : (
        <div className="p-6 text-center text-on-surface-variant italic text-sm">
          No asset linked to this ticket.
        </div>
      )}
    </div>
  );
}
