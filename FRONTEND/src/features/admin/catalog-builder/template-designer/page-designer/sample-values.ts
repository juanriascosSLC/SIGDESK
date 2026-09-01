import { bindingEmptyValue } from '@/features/catalog/metamodel';
import type { BindingValue, FieldDefinition } from '@/features/catalog/metamodel';

// Sample values behind every simulated context. Shared by the ticket-detail
// and form surfaces so the same field shows the same placeholder wherever an
// admin previews it.
export function sampleValue(field: FieldDefinition): unknown {
  if (field.bindsTo) return bindingEmptyValue(field);
  if (field.defaultValue !== undefined) return field.defaultValue;
  if (field.type === 'boolean') return false;
  if (field.type === 'select') return field.options?.[0]?.value ?? '';
  return '';
}

export function sampleDataFor(fields: FieldDefinition[]): Record<string, unknown> {
  return Object.fromEntries(fields.map((field) => [field.key, sampleValue(field)]));
}

// Stand-ins for the resource/agent/site/asset pickers, so a `bindsTo` field
// renders as the real BindingPicker on the canvas instead of an empty box.
// No network: the designer never reads live inventory.
export const SAMPLE_BINDING_ITEMS: Record<string, BindingValue[]> = {
  recursoId: [
    { id: 'sample-recurso-1', displayName: 'Cámara recepción', tipo: 'camera' },
    { id: 'sample-recurso-2', displayName: 'NVR planta baja', tipo: 'nvr' },
  ],
  agenteItId: [
    { id: 'sample-agente-1', displayName: 'Carlos Ruiz', tipo: 'soporte' },
    { id: 'sample-agente-2', displayName: 'Ana Martínez', tipo: 'redes' },
  ],
  siteAssetId: [
    { id: 'sample-site-1', displayName: 'Sede principal', tipo: 'site' },
    { id: 'sample-site-2', displayName: 'Bodega norte', tipo: 'site' },
  ],
  assetId: [
    // Tres, no dos: con un campo multi hace falta poder elegir varios y que
    // todavía quede algo sin elegir para ver el estado real de la lista.
    { id: 'sample-asset-1', displayName: 'CAM-0001', tipo: 'camera' },
    { id: 'sample-asset-2', displayName: 'SW-0007', tipo: 'switch' },
    { id: 'sample-asset-3', displayName: 'NVR-0002', tipo: 'nvr' },
  ],
};
