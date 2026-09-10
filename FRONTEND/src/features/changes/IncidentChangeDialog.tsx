import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, GitPullRequest, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { DynamicField } from '@/features/catalog/DynamicField';
import {
  isFieldRequired,
  isFieldVisible,
  type FieldDefinition,
} from '@/features/catalog/metamodel';
import type { Ticket } from '@/features/tickets/types';
import { createChangeFromIncident, getChangeDefinition } from './api';

type Props = {
  open: boolean;
  ticket: Ticket;
  currentUserName: string;
  onClose: () => void;
  onLinked: () => void;
};

const legacyRelationFields = new Set(['relatedProblemId', 'relatedIncidentIds']);

function initialData(fields: FieldDefinition[], ticket: Ticket, currentUserName: string) {
  const data: Record<string, unknown> = {};
  for (const field of fields) if (field.defaultValue !== undefined) data[field.key] = field.defaultValue;
  return {
    ...data,
    title: `Resolve ${ticket.humanId ?? ticket.id}: ${ticket.title}`,
    description: `Controlled change originated by ${ticket.humanId ?? ticket.id}. ${ticket.description}`,
    requester: currentUserName,
    changeOwner: currentUserName,
    serviceAffected: ticket.category || data.serviceAffected || 'Service to be determined',
    reason: `Execute the action needed to resolve ${ticket.humanId ?? ticket.id}.`,
    impact: data.impact || (ticket.priority === 'Critical' ? 'high' : 'medium'),
    urgency: data.urgency || 'medium',
    probability: data.probability || 'medium',
    changeType: data.changeType || 'normal',
  };
}

export function IncidentChangeDialog({ open, ticket, currentUserName, onClose, onLinked }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const idempotencyKey = useRef(crypto.randomUUID());
  const definition = useQuery({ queryKey: ['changes', 'definition'], queryFn: getChangeDefinition, enabled: open });

  useEffect(() => {
    if (!open || !definition.data) return;
    const timer = window.setTimeout(() => {
      setFormData(initialData(definition.data.specification.fields, ticket, currentUserName));
      idempotencyKey.current = crypto.randomUUID();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [currentUserName, definition.data, open, ticket]);

  const fields = useMemo(() => {
    const specification = definition.data?.specification;
    if (!specification) return [];
    const keys = specification.views?.create ?? specification.fields.map((field) => field.key);
    return specification.fields.filter((field) =>
      keys.includes(field.key) && field.key !== 'riskLevel' && !legacyRelationFields.has(field.key) && isFieldVisible(field, formData),
    );
  }, [definition.data, formData]);

  const workflow = useMutation({
    mutationFn: async () => {
      if (!ticket.entityId) throw new Error('The incident has no linked INC entity.');
      const specification = definition.data?.specification;
      if (!specification) throw new Error('The RFC definition is not available.');
      const data: Record<string, unknown> = {};
      for (const field of specification.fields) {
        if (field.key === 'riskLevel' || legacyRelationFields.has(field.key) || !isFieldVisible(field, formData)) continue;
        const value = formData[field.key];
        if (!isFieldRequired(field, formData) && (value === '' || value == null)) continue;
        data[field.key] = value;
      }
      return createChangeFromIncident(
        data,
        ticket.entityId,
        ticket.assetContext
          ? {
              siteAssetId: ticket.assetContext.siteAssetId,
              links: ticket.assetContext.links
                .filter((link) => link.assetId !== ticket.assetContext?.siteAssetId)
                .map((link) => ({ assetId: link.assetId, role: link.role })),
            }
          : undefined,
        idempotencyKey.current,
      );
    },
    onSuccess: (change) => {
      void queryClient.invalidateQueries({ queryKey: ['changes'] });
      onLinked();
      onClose();
      // Bug found 2026-09-09: navigated with change.humanId; /app/changes/:id
      // expects the internal id, same invariant as tickets/problems.
      navigate(`/app/changes/${encodeURIComponent(change.id)}`);
    },
  });

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
      <form onSubmit={(event: FormEvent) => { event.preventDefault(); workflow.mutate(); }} className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-3xl border border-amber-500/30 bg-surface-container-low shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-border/40 bg-surface-container-low/95 p-6 backdrop-blur-md">
          <div>
            {/* Was "INC -> RFC": the real relation (origin_inc, change_service)
                has the RFC as origin and the INC as destination -- see
                Docs/glossary.md's "Relaciones entre tipos de caso" (DIV-23).
                Functionally harmless (the backend already creates the
                relation in the right direction either way), but the label
                taught users the wrong mental model of which side owns the
                relation. Fixed 2026-09-09. */}
            <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-amber-300"><GitPullRequest className="h-4 w-4" /> RFC → INC</div>
            <h2 className="text-xl font-black text-on-surface">Create change from this incident</h2>
            <p className="mt-1 text-xs text-on-surface-variant">Change Management will manage execution; both records will keep their relation and versions.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-on-surface-variant" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <div className="grid gap-5 p-6 md:grid-cols-2">
          {fields.map((field) => (
            <div key={field.key} className={field.type === 'textarea' ? 'md:col-span-2' : ''}>
              <DynamicField field={field} value={formData[field.key]} required={isFieldRequired(field, formData)} onChange={(value) => setFormData((current) => ({ ...current, [field.key]: value }))} />
            </div>
          ))}
        </div>
        {workflow.isError && <div className="mx-6 mb-4 flex gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300"><AlertTriangle className="h-4 w-4" />{workflow.error.message}</div>}
        <div className="sticky bottom-0 flex justify-end gap-3 border-t border-border/40 bg-surface-container-low/95 p-6">
          <button type="button" onClick={onClose} className="secondary-button">Cancel</button>
          <button type="submit" disabled={workflow.isPending || !definition.data} className="primary-button disabled:opacity-50"><CheckCircle2 className="h-4 w-4" />{workflow.isPending ? 'Creating and linking…' : 'Create RFC and link'}</button>
        </div>
      </form>
    </div>
  );
}
