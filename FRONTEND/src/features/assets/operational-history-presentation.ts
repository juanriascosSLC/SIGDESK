/**
 * Pure presentation helper for Assets/CMDB operational history issues.
 *
 * Maps known operational issues emitted by api.ts into clean English copy for
 * DomainIncompleteWarning tooltips and the partial-history summary banner.
 * Unknown or technical strings fall back to a safe English message to avoid
 * leaking Spanish or raw internal error messages to the UI.
 *
 * Pure module: no React, no DOM or window access, and no side effects.
 */

export const KNOWN_OPERATIONAL_ISSUES: Record<string, string> = {
  'No se pudo consultar INC para este activo.': 'Could not query INC for this asset.',
  'INC no disponible: las coincidencias vía incidente pueden faltar.': 'INC unavailable: matches via incident may be missing.',
  'No se pudo consultar PRB directamente para este activo.': 'Could not query PRB directly for this asset.',
  'PRB no disponible: las referencias PRB→RFC pueden faltar.': 'PRB unavailable: PRB→RFC references may be missing.',
  'No se pudo consultar RFC directamente para este activo.': 'Could not query RFC directly for this asset.',
};

export const UNKNOWN_OPERATIONAL_ISSUE_FALLBACK = 'Some operational history information is currently unavailable.';

export function formatOperationalIssue(issue: string): string {
  return KNOWN_OPERATIONAL_ISSUES[issue] ?? UNKNOWN_OPERATIONAL_ISSUE_FALLBACK;
}
