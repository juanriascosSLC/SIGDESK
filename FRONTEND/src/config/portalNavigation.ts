import { FilePlus2, BookOpen, Ticket as TicketIcon, type LucideIcon } from 'lucide-react';

/**
 * The single source of truth for the end-user portal's navigation —
 * consumed by both the desktop/tablet top nav and the mobile bottom nav in
 * EndUserLayout, so a label or route only ever lives in one place. Smaller
 * than config/navigation.ts (the agent workspace's) on purpose: every
 * authenticated user sees all three destinations, so there's no
 * permission field, no sections, and no "More" overflow to manage.
 */
export interface PortalNavItem {
  key: string;
  label: string;
  route: string;
  icon: LucideIcon;
  /** Exact-path match only. None of the three current destinations need
   *  this (each safely prefix-matches its own detail route — see
   *  findActiveNavItem in config/navigation.ts, reused here), but it's
   *  kept for parity with NavItem in case a future portal item is a
   *  prefix of another (the agent workspace's Dashboard/`/app` needed
   *  exactly this). */
  exact?: boolean;
}

export const PORTAL_NAV_ITEMS: PortalNavItem[] = [
  // Same screen the agent workspace reaches as "New Case" (features/catalog/
  // ServiceCatalog.tsx): a selector of published definitions to CREATE a
  // case, not a catalogue of services. The glossary deprecated user-facing
  // "Catalog" on 2026-09-08 (rename "Catalog Builder" -> "Entity Builder"),
  // so both surfaces use the same non-deprecated label for the same thing.
  { key: 'catalog', label: 'New Case', route: '/portal/catalog', icon: FilePlus2 },
  { key: 'knowledge', label: 'Knowledge Base', route: '/portal/knowledge', icon: BookOpen },
  { key: 'tickets', label: 'My Tickets', route: '/portal/tickets', icon: TicketIcon },
];
