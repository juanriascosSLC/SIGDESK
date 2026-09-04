import { listAssetSites, type AssetProjection } from '@/features/assets/api';
import { getTicket, listTickets } from '@/features/tickets/api';
import type { Ticket } from '@/features/tickets/types';

export type AssistantSource = { type: string; id: string; score: number };

export type SiteTicketAnswer = {
  answer: string;
  sources: AssistantSource[];
  focusedTicketId?: string;
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

function ticketCodeQuery(message: string): string | null {
  const match = message.match(/\bINC\s*[-_ ]?\s*(\d{3,})\b/i);
  return match ? `INC-${match[1]}` : null;
}

function ticketCodeMatches(ticket: { humanId?: string; id: string }, requested: string): boolean {
  const compact = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return compact(ticket.humanId ?? '') === compact(requested);
}

function ticketSummary(ticket: Ticket): string {
  const createdAt = Number.isNaN(Date.parse(ticket.createdAt))
    ? ticket.createdAt
    : new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ticket.createdAt));
  return [
    `**${ticket.humanId ?? `INC-${ticket.id}`}** — ${ticket.title}.`,
    `Estado actual: **${ticket.status || 'sin estado'}**.`,
    ticket.priority ? `Prioridad: **${ticket.priority}**.` : '',
    `Creado: ${createdAt}.`,
    ticket.assignee ? `Responsable: ${ticket.assignee}.` : '',
  ].filter(Boolean).join('\n');
}

function siteDetails(ticket: Ticket): { name: string; location?: string } | null {
  const link = ticket.assetContext?.links.find((candidate) => candidate.role === 'site');
  if (!link) return null;
  const snapshot = link.snapshot;
  const name = typeof snapshot.displayName === 'string' ? snapshot.displayName : link.assetId;
  const attributes = snapshot.attributes;
  const location = attributes && typeof attributes === 'object' && typeof (attributes as Record<string, unknown>).location === 'string'
    ? (attributes as Record<string, unknown>).location as string
    : undefined;
  return { name, location };
}

/** Answers follow-up questions against the ticket currently in chat focus. */
export async function answerTicketFollowUp(message: string, ticketId: string): Promise<SiteTicketAnswer | null> {
  const question = normalized(message);
  const asksForSite = /\b(site|sitio|ubicacion|location|donde)\b/.test(question);
  const asksForStatus = /\b(estado|estatus|status)\b/.test(question);
  const asksForPriority = /\b(prioridad|priority|urgencia)\b/.test(question);
  const asksForOwner = /\b(responsable|asignado|asignada|owner)\b/.test(question);
  const asksForSummary = /\b(informacion|informacion|detalle|detalles|resumen|cuentame)\b/.test(question);
  if (!asksForSite && !asksForStatus && !asksForPriority && !asksForOwner && !asksForSummary) return null;

  // Re-read on every turn: memory selects the record, but never becomes a
  // stale or authorization-bypassing copy of its data.
  const ticket = await getTicket(ticketId);
  const source = [{ type: 'ticket', id: ticket.humanId ?? ticket.id, score: 1 }];
  if (asksForSite) {
    const site = siteDetails(ticket);
    return {
      answer: site
        ? `El ticket **${ticket.humanId ?? `INC-${ticket.id}`}** pertenece al sitio **${site.name}**.${site.location ? ` Ubicación: ${site.location}.` : ''}`
        : `No hay un sitio vinculado en los datos autorizados de **${ticket.humanId ?? `INC-${ticket.id}`}**.`,
      sources: source,
      focusedTicketId: ticket.id,
    };
  }
  if (asksForStatus) return { answer: `El estado actual de **${ticket.humanId ?? `INC-${ticket.id}`}** es **${ticket.status || 'sin estado'}**.`, sources: source, focusedTicketId: ticket.id };
  if (asksForPriority) return { answer: `La prioridad de **${ticket.humanId ?? `INC-${ticket.id}`}** es **${ticket.priority || 'sin prioridad'}**.`, sources: source, focusedTicketId: ticket.id };
  if (asksForOwner) return { answer: ticket.assignee ? `El responsable actual de **${ticket.humanId ?? `INC-${ticket.id}`}** es **${ticket.assignee}**.` : `**${ticket.humanId ?? `INC-${ticket.id}`}** no tiene un responsable asignado.`, sources: source, focusedTicketId: ticket.id };
  return { answer: ticketSummary(ticket), sources: source, focusedTicketId: ticket.id };
}

/**
 * Resolves an explicit INC code through the user-authorized Tickets API.
 * Codes are identifiers, not semantic questions: vector search is neither
 * necessary nor reliable for this path.
 */
export async function answerTicketByCode(message: string): Promise<SiteTicketAnswer | null> {
  const code = ticketCodeQuery(message);
  if (!code) return null;

  let page = await listTickets({ q: code, limit: 100 });
  let ticket = page.items.find((item) => ticketCodeMatches(item, code));
  // Some legacy card views show one extra trailing zero. Only fall back to
  // that normalized form after the exact code returned no match, so a real
  // ticket such as INC-0000050 always wins over INC-000005.
  if (!ticket && /0$/.test(code)) {
    const normalizedCode = code.slice(0, -1);
    page = await listTickets({ q: normalizedCode, limit: 100 });
    ticket = page.items.find((item) => ticketCodeMatches(item, normalizedCode));
  }
  if (!ticket) {
    return {
      answer: `No encontrÃ© un ticket autorizado con el cÃ³digo ${code}. Verifica el nÃºmero e intÃ©ntalo de nuevo.`,
      sources: [],
    };
  }

  const requestedDetail = await answerTicketFollowUp(message, ticket.id);
  const nextQuestion = "¿Qué información te gustaría saber sobre este ticket: sitio, estado, prioridad, responsable o detalles?";
  if (requestedDetail) {
    return {
      ...requestedDetail,
      answer: `${requestedDetail.answer}\n\n${nextQuestion}`,
    };
  }
  return {
    answer: `${ticketSummary(ticket)}\n\n${nextQuestion}`,
    sources: [{ type: 'ticket', id: ticket.humanId ?? ticket.id, score: 1 }],
    focusedTicketId: ticket.id,
  };
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
