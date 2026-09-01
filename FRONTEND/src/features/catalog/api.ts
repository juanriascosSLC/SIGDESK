import { apiRequest } from '@/lib/apiClient';
import type { FieldDefinition, PageLayout } from './metamodel';

// El contrato de `GET /entities/{entityKey}/{entityID}/resolved-definition`:
// la definición HISTÓRICA fijada al registro, no la publicada hoy.
//
// Este módulo contenía además un cliente completo de
// `/catalog/layouts/{entityKey}/*` (draft, publish, versions, active,
// activate). Esa familia de rutas nunca existió en el backend: Kong responde
// 404 y `grep -rn "catalog/layouts" BACKEND/**/*.go` no devuelve nada. Se
// eliminó junto con sus tipos y con los tres editores que la consumían
// (LayoutDesigner, LayoutRenderer, LayoutVersionPreview), que ya no importaba
// nadie. El diseño de la página viaja dentro de `specification.detailPage` y
// el backend lo proyecta bajo `layouts.detailPage` en esta misma respuesta.

// Los tres valores de resolución de layout que este contrato acepta — nunca
// "active".
export type LayoutResolutionMode = 'latest-compatible' | 'previous-compatible' | 'legacy-synthesized';

// `layouts.detail`/`layouts.detailPage` se redacta como JSON libre (el editor
// avanzado del Catalog Builder acepta cualquier objeto), así que a nivel de
// tipo sólo puede ser un PageLayout pelado o un envoltorio `{ default,
// variants? }` — quien lo consuma debe estrechar el tipo antes de confiar en
// él (ver TicketDetail.tsx).
export interface ResolvedLayoutDocument {
  detail?: PageLayout | { default?: PageLayout; variants?: Array<{ audienceKey: string; page: PageLayout }> };
}

// El lifecycle PROPIO del registro (fijado a su definitionVersionId), no el
// publicado ahora: es la única fuente de verdad sobre qué transiciones puede
// ejecutar de hecho.
export interface LifecycleStateDefinition {
  key: string;
  label: string;
  initial?: boolean;
}

export interface LifecycleTransitionDefinition {
  key: string;
  label: string;
  from: string;
  to: string;
}

export interface LifecycleDefinition {
  states: LifecycleStateDefinition[];
  transitions: LifecycleTransitionDefinition[];
}

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
  lifecycle: LifecycleDefinition;
  layouts: ResolvedLayoutDocument;
}

export function getResolvedDefinition(
  entityKey: string,
  entityID: string,
): Promise<ResolvedDefinition> {
  return apiRequest<ResolvedDefinition>(
    `/entities/${entityKey}/${entityID}/resolved-definition`,
  );
}
