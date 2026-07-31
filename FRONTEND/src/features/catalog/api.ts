import { apiRequest } from '@/lib/apiClient';
import type { FieldDefinition, PageLayout } from './metamodel';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LayoutStatus = 'draft' | 'published' | 'deprecated' | 'archived';

export interface CompatibilityPlacement {
  placementId: string;
  kind: string;
  source?: string;
  fieldId?: string;
  fieldType?: string;
  widgetKey?: string;
  widgetContractVersion?: string;
  region: string;
  audienceKey: string;
  requiredPermissions?: string[];
  allowMultiple: boolean;
}

export interface CompatibilityFingerprint {
  placements: CompatibilityPlacement[];
  mandatoryWidgets: string[];
}

export interface CatalogLayoutVersion {
  id: string;
  entityKey: string;
  version: number;
  status: LayoutStatus;
  document: Record<string, unknown>;
  compatibility?: CompatibilityFingerprint;
  checksum?: string;
  isActive: boolean;
  createdAt: string;
  publishedAt?: string;
}

// The exact three strings LayoutService.ResolveLayoutForRecord (layout_service.go)
// can produce — never "active".
export type LayoutResolutionMode = 'latest-compatible' | 'previous-compatible' | 'legacy-synthesized';

// `document`/`layouts.detail` is authored as free-form JSON (the Catalog
// Builder draft editor accepts any object), so at the type level it can only
// be a bare PageLayout or a `{ default, variants? }` wrapper around one —
// callers must narrow further before trusting the shape (see TicketDetail.tsx).
export interface ResolvedLayoutDocument {
  detail?: PageLayout | { default?: PageLayout; variants?: Array<{ audienceKey: string; page: PageLayout }> };
}

/** The shape returned by GET /entities/{entityKey}/{entityID}/resolved-definition */
export interface ResolvedDefinition {
  entityId: string;
  humanId: string;
  entityKey: string;
  definitionVersionId: string;
  schemaVersion: string;
  workflowVersion: string;
  metamodelVersion: string;
  layoutVersionId: string | null;
  layoutVersion: number | null;
  layoutResolution: LayoutResolutionMode;
  fields: FieldDefinition[];
  lifecycle: Record<string, unknown>;
  layouts: ResolvedLayoutDocument;
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

export function getLayoutDraft(entityKey: string): Promise<CatalogLayoutVersion> {
  return apiRequest<CatalogLayoutVersion>(`/catalog/layouts/${entityKey}/draft`);
}

export function createLayoutDraft(
  entityKey: string,
  doc: Record<string, unknown>,
): Promise<CatalogLayoutVersion> {
  return apiRequest<CatalogLayoutVersion>(`/catalog/layouts/${entityKey}/draft`, {
    method: 'POST',
    body: JSON.stringify(doc),
  });
}

export function updateLayoutDraft(
  entityKey: string,
  doc: Record<string, unknown>,
): Promise<CatalogLayoutVersion> {
  return apiRequest<CatalogLayoutVersion>(`/catalog/layouts/${entityKey}/draft`, {
    method: 'PUT',
    body: JSON.stringify(doc),
  });
}

export function publishLayoutDraft(entityKey: string): Promise<CatalogLayoutVersion> {
  return apiRequest<CatalogLayoutVersion>(`/catalog/layouts/${entityKey}/publish`, {
    method: 'POST',
  });
}

export function listLayoutVersions(entityKey: string): Promise<{ items: CatalogLayoutVersion[] }> {
  return apiRequest<{ items: CatalogLayoutVersion[] }>(`/catalog/layouts/${entityKey}/versions`);
}

export function getActiveLayoutVersion(entityKey: string): Promise<CatalogLayoutVersion> {
  return apiRequest<CatalogLayoutVersion>(`/catalog/layouts/${entityKey}/active`);
}

export function activateLayoutVersion(
  entityKey: string,
  version: number,
): Promise<CatalogLayoutVersion> {
  return apiRequest<CatalogLayoutVersion>(
    `/catalog/layouts/${entityKey}/versions/${version}/activate`,
    { method: 'POST' },
  );
}

export function getResolvedDefinition(
  entityKey: string,
  entityID: string,
): Promise<ResolvedDefinition> {
  return apiRequest<ResolvedDefinition>(
    `/entities/${entityKey}/${entityID}/resolved-definition`,
  );
}
