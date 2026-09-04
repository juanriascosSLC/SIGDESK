import { listAssetSites, type AssetProjection } from '@/features/assets/api';
import { listTickets } from '@/features/tickets/api';

export type AssistantSource = { type: string; id: string; score: number };

export type SiteTicketAnswer = {
  answer: string;
  sources: AssistantSource[];
};

const STATUS_ALIASES: Array<{ pattern: RegExp; status: string }> = [
  { pattern: /\b(in[ _-]?progress|en[ _-]?progreso)\b/i, status: 'In Progress' },
  { pattern: /\b(pending[ _-]?review|en[ _-]?espera)\b/i, status: 'Pending Review' },
  { pattern: /\b(resolved|resuelto)\b/i, status: 'Resolved' },
  { pattern: /\b(closed|cerrado)\b/i, status: 'Closed' },
  { pattern: /\b(open|abierto)\b/i, status: 'Open' },
];

function normalized(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-CO')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function siteQuery(message: string): string | null {
  const asksForTicket = /\b(ticket|incidente|inc)\b/i.test(message);
  const asksForLatest = /\b(ultimo|último|reciente|recientes)\b|más\s+reciente/i.test(message);
  if (!asksForTicket || !asksForLatest) return null;

  // Both forms occur naturally in the assistant: "del sitio AS 3281" and
  // "del AS Atwell Prep Center". The latter omits the word site because the
  // person is already looking at an asset/site context.
  const explicitSite = message.match(/\b(?:sitio|site)\s+(?:del?\s+)?["“]?(.+?)["”]?\s*[?.!]*$/i);
  const possessiveTicket = message.match(/\b(?:ticket|incidente|inc)\s+del?\s+["“]?(.+?)["”]?\s*[?.!]*$/i);
  const query = explicitSite?.[1] ?? possessiveTicket?.[1];
  return query?.trim() || null;
}

function siteMatches(site: AssetProjection, query: string): boolean {
  const expected = normalized(query);
  const candidates = [site.displayName, site.externalKey, site.externalId]
    .filter((value): value is string => Boolean(value))
    .map(normalized);
  return candidates.some((value) => value === expected) || candidates.some((value) => value.includes(expected));
}

/**
 * Answers deterministic "latest ticket for site" questions with the same
 * user-authorized APIs used by Assets/CMDB. RAG is intentionally not used for
 * this: embeddings cannot prove recency and ticket asset bindings are not
 * text fields in the index.
 */
export async function answerLatestTicketForSite(message: string): Promise<SiteTicketAnswer | null> {
  const query = siteQuery(message);
  if (!query) return null;

  const sitePage = await listAssetSites(query);
  const matches = sitePage.items.filter((site) => siteMatches(site, query));
  if (matches.length === 0) {
    return {
      answer: `No encontré un sitio autorizado que coincida con «${query}». Verifica el nombre e inténtalo de nuevo.`,
      sources: [],
    };
  }
  if (matches.length > 1) {
    return {
      answer: `Encontré varios sitios que coinciden con «${query}»: ${matches.slice(0, 3).map((site) => `«${site.displayName}»`).join(', ')}. Indica el nombre completo para consultar su último ticket.`,
      sources: matches.slice(0, 3).map((site) => ({ type: 'site', id: site.id, score: 1 })),
    };
  }

  const site = matches[0];
  // `ticket_asset_links` stores the site link as well as device links, so the
  // existing assetId filter returns every INC associated with that site.
  const incidents = (await listTickets({ assetId: site.id, limit: 100 })).items
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
  if (incidents.length === 0) {
    return {
      answer: `No encontré tickets INC vinculados al sitio «${site.displayName}».`,
      sources: [{ type: 'site', id: site.id, score: 1 }],
    };
  }

  const latest = incidents[0];
  const createdAt = Number.isNaN(Date.parse(latest.createdAt))
    ? latest.createdAt
    : new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(latest.createdAt));
  return {
    answer: `El último ticket del sitio «${site.displayName}» es ${latest.humanId ?? `INC-${latest.id}`}: «${latest.title}». Estado: ${latest.status || 'sin estado'}. Creado: ${createdAt}.`,
    sources: [
      { type: 'site', id: site.id, score: 1 },
      { type: 'ticket', id: latest.humanId ?? latest.id, score: 1 },
    ],
  };
}

/** Answers operational status lists through the ticket API, never via RAG. */
export async function answerTicketsByStatus(message: string): Promise<SiteTicketAnswer | null> {
  if (!/\b(tickets?|incidentes?|incs?)\b/i.test(message) || !/\bestado\b/i.test(message)) {
    return null;
  }
  const status = STATUS_ALIASES.find(({ pattern }) => pattern.test(message))?.status;
  if (!status) return null;

  const page = await listTickets({ status, limit: 100 });
  if (page.items.length === 0) {
    return { answer: `No hay tickets en estado ${status}.`, sources: [] };
  }
  const shown = page.items.slice(0, 10);
  const tickets = shown
    .map((ticket) => `${ticket.humanId ?? `INC-${ticket.id}`}: «${ticket.title}»`)
    .join('; ');
  const remainder = page.hasMore || page.items.length > shown.length
    ? ` Muestro los primeros ${shown.length}.`
    : '';
  return {
    answer: `Hay ${page.items.length}${page.hasMore ? '+' : ''} tickets en estado ${status}: ${tickets}.${remainder}`,
    sources: shown.map((ticket) => ({ type: 'ticket', id: ticket.humanId ?? ticket.id, score: 1 })),
  };
}
