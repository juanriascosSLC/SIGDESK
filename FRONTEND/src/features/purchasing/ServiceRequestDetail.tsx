import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Package, Truck } from 'lucide-react';
import { Button, ErrorState, LoadingState, PageHeader } from '@/components/ui';
import { useAuth } from '@/features/auth/useAuth';
import { PERMISSIONS } from '@/features/auth/permissions';
import { formatDateTime } from '@/i18n/format';
import { executeServiceRequestCommand, getServiceRequest, type ServiceRequest, type ServiceRequestCommand } from './api';

type CommandName = Parameters<typeof executeServiceRequestCommand>[1];
const statusLabel: Record<ServiceRequest['status'], string> = {
  pending_manager_approval: 'Pending manager approval', approved: 'Approved', ordered: 'Ordered',
  shipped: 'Shipped', delivered: 'Delivered', rejected: 'Rejected', canceled: 'Canceled',
};

export default function ServiceRequestDetail() {
  const { id = '' } = useParams();
  const { can } = useAuth();
  const canManage = can(PERMISSIONS.purchasingFulfillmentManage);
  const canApprove = can(PERMISSIONS.serviceRequestApprovalsManage);
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['service-request', id], queryFn: () => getServiceRequest(id), enabled: Boolean(id) });
  const [active, setActive] = useState<CommandName>();
  const mutation = useMutation({
    mutationFn: ({ command, input }: { command: CommandName; input: ServiceRequestCommand }) => executeServiceRequestCommand(Number(id), command, input),
    onSuccess: (item) => { queryClient.setQueryData(['service-request', id], item); void queryClient.invalidateQueries({ queryKey: ['service-requests'] }); setActive(undefined); },
  });
  if (query.isLoading) return <LoadingState label="Loading purchase request…" />;
  if (query.isError || !query.data) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const item = query.data;
  return <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8"><PageHeader eyebrow={<Link to="/app/purchasing" className="mb-3 inline-flex items-center gap-1 text-sm font-bold text-primary"><ArrowLeft className="h-4 w-4" />Purchasing</Link>} title={`${item.humanId} · ${item.title}`} description={`${item.incidentHumanId} · ${item.changeHumanId} · revision ${item.revision}`} actions={<span className="rounded-full border border-border px-3 py-1.5 text-xs font-black uppercase">{statusLabel[item.status]}</span>} />
    <div className="mt-6 grid gap-5 lg:grid-cols-[1.5fr_1fr]"><main className="space-y-5"><section className="rounded-2xl border border-border/50 bg-surface-container p-5"><h2 className="font-black">Request</h2><p className="mt-2 text-sm text-on-surface-variant">{item.description}</p><dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-on-surface-variant">Requester</dt><dd className="font-bold">{item.requesterName || 'User unavailable'}</dd></div><div><dt className="text-on-surface-variant">Created</dt><dd className="font-bold">{formatDateTime(item.createdAt, 'en-US')}</dd></div></dl><ul className="mt-4 space-y-2">{item.lines.map((line, index) => <li key={`${line.sku ?? ''}-${index}`} className="flex justify-between rounded-xl bg-surface-container-low p-3 text-sm"><span>{line.description}{line.sku ? ` · ${line.sku}` : ''}</span><strong>× {line.quantity}</strong></li>)}</ul></section>
      {item.purchaseOrder && <Fact icon={<Package className="h-4 w-4" />} title="Purchase order" lines={[item.purchaseOrder.reference, item.purchaseOrder.supplier, [item.purchaseOrder.amount, item.purchaseOrder.currency].filter(Boolean).join(' '), ...item.purchaseOrder.evidence]} />}
      {item.shipment && <Fact icon={<Truck className="h-4 w-4" />} title="Shipment" lines={[item.shipment.carrier, item.shipment.tracking, ...item.shipment.evidence]} />}
      {item.delivery && <Fact icon={<CheckCircle2 className="h-4 w-4" />} title="Delivery" lines={[item.delivery.receivedBy, formatDateTime(item.delivery.deliveredAt, 'en-US'), ...item.delivery.evidence]} />}
    </main><aside className="space-y-5">{(canManage || canApprove) && <CommandPanel item={item} canManage={canManage} canApprove={canApprove} active={active} busy={mutation.isPending} error={mutation.error?.message} onSelect={setActive} onSubmit={(command, input) => mutation.mutate({ command, input })} />}<section className="rounded-2xl border border-border/50 bg-surface-container p-5"><h2 className="font-black">Audit history</h2><ol className="mt-4 space-y-3">{item.history.map((entry) => <li key={entry.sequence} className="border-l-2 border-primary/30 pl-3 text-xs"><p className="font-bold">{entry.from ? `${statusLabel[entry.from]} → ` : ''}{statusLabel[entry.to]}</p><p className="mt-1 text-on-surface-variant">{formatDateTime(entry.occurredAt, 'en-US')}{entry.reason ? ` · ${entry.reason}` : ''}</p></li>)}</ol></section></aside></div>
  </div>;
}

function Fact({ icon, title, lines }: { icon: React.ReactNode; title: string; lines: Array<string | undefined> }) { return <section className="rounded-2xl border border-border/50 bg-surface-container p-5"><h2 className="flex items-center gap-2 font-black">{icon}{title}</h2><ul className="mt-3 space-y-1 text-sm text-on-surface-variant">{lines.filter(Boolean).map((line, index) => <li key={index}>{line}</li>)}</ul></section>; }

function CommandPanel({ item, canManage, canApprove, active, busy, error, onSelect, onSubmit }: { item: ServiceRequest; canManage: boolean; canApprove: boolean; active?: CommandName; busy: boolean; error?: string; onSelect: (value?: CommandName) => void; onSubmit: (command: CommandName, input: ServiceRequestCommand) => void }) {
  const available: Array<{ command: CommandName; label: string }> = item.status === 'pending_manager_approval' && canApprove ? [{ command: 'approve', label: 'Approve' }, { command: 'reject', label: 'Reject' }] : item.status === 'approved' && canManage ? [{ command: 'record_purchase_order', label: 'Record purchase order' }, { command: 'cancel', label: 'Cancel' }] : item.status === 'ordered' && canManage ? [{ command: 'record_shipment', label: 'Record shipment' }, { command: 'cancel', label: 'Cancel' }] : item.status === 'shipped' && canManage ? [{ command: 'record_delivery', label: 'Record delivery' }, { command: 'cancel', label: 'Cancel' }] : [];
  return <section className="rounded-2xl border border-border/50 bg-surface-container p-5"><h2 className="font-black">Next action</h2>{available.length === 0 ? <p className="mt-2 text-sm text-on-surface-variant">This purchasing lifecycle is terminal.</p> : <div className="mt-3 flex flex-wrap gap-2">{available.map(({ command, label }) => <Button key={command} size="sm" variant={command === 'reject' || command === 'cancel' ? 'destructive' : 'secondary'} onClick={() => onSelect(command)}>{label}</Button>)}</div>}{active && <CommandForm command={active} revision={item.revision} busy={busy} error={error} onCancel={() => onSelect(undefined)} onSubmit={onSubmit} />}</section>;
}

function CommandForm({ command, revision, busy, error, onCancel, onSubmit }: { command: CommandName; revision: number; busy: boolean; error?: string; onCancel: () => void; onSubmit: (command: CommandName, input: ServiceRequestCommand) => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  function field(name: string, label: string, required = true, type = 'text') { return <label className="block text-xs font-bold">{label}<input className="input-field mt-1 w-full" type={type} required={required} value={values[name] ?? ''} onChange={(event) => setValues((current) => ({ ...current, [name]: event.target.value }))} /></label>; }
  function submit(event: FormEvent) { event.preventDefault(); const evidence = (values.evidence ?? '').split('\n').map((entry) => entry.trim()).filter(Boolean); onSubmit(command, { expectedRevision: revision, reason: values.reason, reference: values.reference, supplier: values.supplier, amount: values.amount, currency: values.currency, carrier: values.carrier, tracking: values.tracking, receivedBy: values.receivedBy, deliveredAt: values.deliveredAt ? new Date(values.deliveredAt).toISOString() : undefined, evidence }); }
  return <form className="mt-4 space-y-3 border-t border-border/40 pt-4" onSubmit={submit}>{(command === 'reject' || command === 'cancel') && field('reason', 'Reason')}{command === 'record_purchase_order' && <>{field('reference', 'Purchase order reference')}{field('supplier', 'Supplier')}{field('amount', 'Amount', false)}{field('currency', 'Currency', false)}</>}{command === 'record_shipment' && <>{field('carrier', 'Carrier')}{field('tracking', 'Tracking number')}</>}{command === 'record_delivery' && <>{field('receivedBy', 'Received by')}{field('deliveredAt', 'Delivered at', true, 'datetime-local')}</>}{['record_purchase_order', 'record_shipment', 'record_delivery'].includes(command) && <label className="block text-xs font-bold">Evidence references (one per line)<textarea className="input-field mt-1 w-full" required rows={3} value={values.evidence ?? ''} onChange={(event) => setValues((current) => ({ ...current, evidence: event.target.value }))} /></label>}{error && <p role="alert" className="text-xs text-status-danger-fg">{error}</p>}<div className="flex gap-2"><Button type="submit" size="sm" loading={busy}>Confirm</Button><Button size="sm" variant="ghost" disabled={busy} onClick={onCancel}>Cancel</Button></div></form>;
}
