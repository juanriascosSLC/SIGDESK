import { apiRequest } from '@/lib/apiClient';

/**
 * Client for `knowledge_service` through the API Gateway.
 *
 * Every route and field here mirrors
 * `SIG-Desk-Backend/knowledge_service/adapters/in/http_controller.go`
 * one-to-one. The previous version of this module targeted
 * `/knowledge/articles` (English), looked articles up by `numero_visible`,
 * and declared `categoria` / `etiquetas` — none of which the service has
 * ever exposed. Do not reintroduce a field or a route here before the
 * controller serves it: the Gateway contract is not ours to assume
 * (ADR-0006).
 *
 * Routes the service actually registers:
 *   GET  /knowledge/articulos                                 -> { items }
 *   GET  /knowledge/articulos/{id}                             -> one article
 *   POST /knowledge/articulos                                  -> new draft
 *   POST /knowledge/articulos/{id}/versiones/{version}/publicar -> 204
 *   POST /knowledge/articulos/{id}/versiones/{version}/archivar -> 204
 *   GET  /knowledge/health
 *
 * `{id}` is the NUMERIC `articulo_id` (the controller parses it with
 * strconv.ParseInt); `numero_visible` is a display label only.
 */

/**
 * The published read model, exactly as `ArticuloPublicado`
 * (application/ports/repository_port.go) serializes it. Both the list and
 * the detail route return this shape. There is deliberately no `categoria`,
 * no `etiquetas`, and no `estado` — a published article is published.
 */
export type PublishedArticle = {
  articulo_id: number;
  numero_visible: string;
  version: number;
  titulo: string;
  contenido: string;
  audiencia: string;
  autor_id: string;
  publicado_en: string;
};

/**
 * A freshly created draft, as `articuloResponse` (adapters/in/dto.go)
 * returns it. Note it carries no `contenido` back, and that publishing needs
 * BOTH `articulo_id` and `version` — versions are immutable once published
 * (ADR-0042), so the version is part of the address, not a mutable pointer.
 */
export type DraftArticle = {
  articulo_id: number;
  numero_visible: string;
  version: number;
  titulo: string;
  audiencia: string;
  estado: string;
};

/** The exact body `crearBorradorRequest` accepts — three fields, no more. */
export type NewDraft = {
  titulo: string;
  contenido: string;
  audiencia: string;
};

export function knowledgeHealth(): Promise<{ status: string; service: string }> {
  return apiRequest<{ status: string; service: string }>('/knowledge/health');
}

/** Articles the caller's audiences allow, optionally full-text filtered.
 *  The service applies `permisos.AudienciasLegibles`; the UI never filters
 *  by audience itself. */
export function listPublishedArticles(search = ''): Promise<{ items: PublishedArticle[] }> {
  const trimmed = search.trim();
  return apiRequest<{ items: PublishedArticle[] }>(
    `/knowledge/articulos${trimmed ? `?q=${encodeURIComponent(trimmed)}` : ''}`,
  );
}

/** `articuloId` is the numeric id. A wrong id and an audience the caller
 *  may not read both come back as an error here — the service answers them
 *  through the same door on purpose, so callers must not tell the user which
 *  of the two happened. */
export function getPublishedArticle(articuloId: string | number): Promise<PublishedArticle> {
  return apiRequest<PublishedArticle>(`/knowledge/articulos/${encodeURIComponent(String(articuloId))}`);
}

export function createDraft(draft: NewDraft): Promise<DraftArticle> {
  return apiRequest<DraftArticle>('/knowledge/articulos', {
    method: 'POST',
    body: JSON.stringify(draft),
  });
}

/** Publishes one immutable version. Answers 204, so there is nothing to read
 *  back — refetch the list if you need the new state. */
export function publishArticleVersion(articuloId: number, version: number): Promise<void> {
  return apiRequest<void>(
    `/knowledge/articulos/${encodeURIComponent(String(articuloId))}/versiones/${encodeURIComponent(String(version))}/publicar`,
    { method: 'POST' },
  );
}

/** Archives one published version. `motivo` is required by the service. */
export function archiveArticleVersion(articuloId: number, version: number, motivo: string): Promise<void> {
  return apiRequest<void>(
    `/knowledge/articulos/${encodeURIComponent(String(articuloId))}/versiones/${encodeURIComponent(String(version))}/archivar`,
    { method: 'POST', body: JSON.stringify({ motivo }) },
  );
}

/*
 * NOT IMPLEMENTED HERE, ON PURPOSE — there is no update route.
 *
 * The old `updateDraft()` sent `PATCH /knowledge/articles/{id}`, which the
 * service does not register at all. A draft can be created and published;
 * editing an existing draft in place has no endpoint. It is not faked
 * client-side (see KnowledgeEditor.tsx, which no longer offers an edit
 * affordance it cannot honour). Adding one is a backend contract change,
 * not a frontend workaround.
 */
