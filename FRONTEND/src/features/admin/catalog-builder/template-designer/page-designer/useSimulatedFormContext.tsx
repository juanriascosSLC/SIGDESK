import { useState } from 'react';
import {
  bindingCountIssue,
  bindingIsMultiple,
  bindingList,
  bindingPrincipal,
  isFieldRequired,
  type CatalogSpecification,
  type FormPageKind,
  type PagePlacement,
} from '@/features/catalog/metamodel';
import { BindingPicker } from '@/features/catalog/BindingPicker';
import { DynamicField } from '@/features/catalog/DynamicField';
import type { FormPageContext, FormSlaPreview } from '@/features/catalog/form-widgets/context';
import { assetTypeMatches } from '@/features/assets/api';
import { SAMPLE_BINDING_ITEMS, sampleDataFor } from './sample-values';

const SAMPLE_STAKEHOLDER_DIRECTORY = {
  units: [
    { id: 'unit-it', name: 'IT', departmentId: 'department-it' },
    { id: 'unit-services', name: 'Servicios', departmentId: 'department-services' },
  ],
  users: [
    { id: 'user-ana', name: 'Ana Martínez', email: 'ana@sig.systems', unitId: 'unit-it' },
    { id: 'user-carlos', name: 'Carlos Pérez', email: 'carlos@sig.systems', unitId: 'unit-services' },
  ],
};

const SAMPLE_SLA_PREVIEW: FormSlaPreview = {
  policyId: 'sla-ejemplo',
  policyVersion: 1,
  priority: 'high',
  responseTargetMinutes: 60,
  resolutionTargetMinutes: 480,
  responseDueAt: new Date(Date.now() + 3_600_000).toISOString(),
  resolutionDueAt: new Date(Date.now() + 28_800_000).toISOString(),
};

function bindingKindOf(bindsTo: string) {
  if (bindsTo === 'recursoId') return 'recurso' as const;
  if (bindsTo === 'agenteItId') return 'agenteIt' as const;
  if (bindsTo === 'siteAssetId') return 'site' as const;
  return 'asset' as const;
}

export interface SimulatedFormContext {
  context: FormPageContext;
  sampleData: Record<string, unknown>;
  setFieldSampleValue: (key: string, value: unknown) => void;
}

// The form counterpart of useSimulatedTicketContext: a fully working
// FormPageContext backed by sample data instead of live queries. No network,
// no persistence.
//
// The important part is `renderField`: it returns the REAL DynamicField /
// BindingPicker the runtime returns, so the designer canvas shows actual
// inputs rather than a lookalike chip. EditableSlot renders them inert, so a
// click selects the card instead of typing into a simulated form.
export function useSimulatedFormContext(
  specification: CatalogSpecification,
  entityKey: string,
  kind: FormPageKind,
): SimulatedFormContext {
  const [sampleData, setSampleData] = useState<Record<string, unknown>>(() =>
    sampleDataFor(specification.fields),
  );

  function setFieldSampleValue(key: string, value: unknown) {
    setSampleData((current) => ({ ...current, [key]: value }));
  }

  function renderField(placement: PagePlacement) {
    const field = specification.fields.find((candidate) => candidate.key === placement.fieldKey);
    if (!field) return null;
    if (field.bindsTo) {
      const pickerKind = bindingKindOf(field.bindsTo);
      const items = (SAMPLE_BINDING_ITEMS[field.bindsTo] ?? []).filter(
        (item) => pickerKind !== 'recurso' || assetTypeMatches(item.tipo, field.resourceType),
      );
      const shared = {
        label: placement.label || field.label,
        kind: pickerKind,
        items,
        loading: false,
        isError: false,
        onRetry: () => {},
        required: isFieldRequired(field, sampleData),
      } as const;
      if (bindingIsMultiple(field)) {
        return (
          <BindingPicker
            {...shared}
            multiple
            value={bindingList(sampleData[field.key])}
            onSelect={(value) => setFieldSampleValue(field.key, value)}
            maxItems={field.maxItems}
            countMessage={bindingCountIssue(field, sampleData[field.key], shared.required)}
          />
        );
      }
      return (
        <BindingPicker
          {...shared}
          value={bindingPrincipal(sampleData[field.key])}
          onSelect={(value) => setFieldSampleValue(field.key, value)}
        />
      );
    }
    return (
      <DynamicField
        field={placement.label ? { ...field, label: placement.label } : field}
        value={sampleData[field.key]}
        required={isFieldRequired(field, sampleData)}
        onChange={(value) => setFieldSampleValue(field.key, value)}
      />
    );
  }

  const context: FormPageContext = {
    entityKey,
    kind,
    preview: true,
    definitionName:
      kind === 'create' ? `Nuevo ${entityKey}` : `Editar datos de ${entityKey}`,
    definitionVersion: 1,
    description: specification.description || 'Descripción del servicio.',
    humanId: kind === 'edit' ? `${entityKey}-0001` : undefined,
    fields: specification.fields,
    data: sampleData,
    renderField,
    requester: { displayName: 'Vista previa', email: 'vista.previa@sig.systems' },
    stakeholders: {
      directory: SAMPLE_STAKEHOLDER_DIRECTORY,
      loading: false,
      value: { userIds: ['user-ana'], unitIds: ['unit-services'] },
      readOnly: false,
      onChange: () => {},
      onRetry: () => {},
    },
    // Shown in its "ready" state so an admin placing the widget can see what
    // it looks like when a policy applies. The real form resolves the other
    // four states against the SLA service.
    sla: { state: 'ready', preview: SAMPLE_SLA_PREVIEW, onRetry: () => {} },
    attachments: {
      items: [
        { id: 'sample-1', name: 'evidencia-camara.jpg', size: 1_284_000, type: 'image/jpeg' },
        { id: 'sample-2', name: 'diagnostico.txt', size: 18_400, type: 'text/plain' },
      ],
      maxFiles: 10,
      maxBytesPerFile: 10 * 1024 * 1024,
      onAddFiles: () => {},
      onRemove: () => {},
    },
    submit: {
      submitLabel: kind === 'create' ? `Crear ${entityKey}` : 'Guardar cambios',
      cancelLabel: 'Cancelar',
      pending: false,
      onCancel: () => {},
      disabled: false,
    },
  };

  return { context, sampleData, setFieldSampleValue };
}
