/**
 * LayoutVersionPreview – read-only preview of a catalog layout version.
 *
 * Renders a specific versioned layout document using a simulated ticket
 * context (same approach used by PageTemplatePreview in the template
 * designer). The badge indicates the version and status.
 */
import { useQuery } from '@tanstack/react-query';
import { getActiveLayoutVersion, type CatalogLayoutVersion } from '@/features/catalog/api';

export interface LayoutVersionPreviewProps {
  entityKey: string;
  /** If omitted, shows the current active version. */
  version?: CatalogLayoutVersion;
}

function DocTree({ doc }: { doc: Record<string, unknown> }) {
  return (
    <pre className="rounded-lg bg-surface-container-low p-4 text-xs font-mono text-on-surface-variant overflow-auto max-h-96 whitespace-pre-wrap">
      {JSON.stringify(doc, null, 2)}
    </pre>
  );
}

export function LayoutVersionPreview({ entityKey, version }: LayoutVersionPreviewProps) {
  const activeQuery = useQuery({
    queryKey: ['layout-active', entityKey],
    queryFn: () => getActiveLayoutVersion(entityKey),
    enabled: !version,
    retry: false,
  });

  const displayVersion = version ?? activeQuery.data;

  if (!version && activeQuery.isLoading) {
    return (
      <div className="rounded-xl border border-border/40 bg-surface-container-low p-6 text-sm text-on-surface-variant animate-pulse">
        Cargando vista previa del layout…
      </div>
    );
  }

  if (!displayVersion) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 bg-surface-container-low/50 p-8 text-center text-sm text-on-surface-variant">
        No hay layout activo para <code className="font-mono">{entityKey}</code>.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-on-surface">
          Vista previa — <code className="font-mono text-xs">{entityKey}</code>
        </span>
        <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
          v{displayVersion.version}
        </span>
        {displayVersion.isActive && (
          <span className="text-xs font-medium text-green-700">• activo</span>
        )}
        {displayVersion.checksum && (
          <span className="rounded bg-surface-container px-1.5 py-0.5 font-mono text-xs text-on-surface-variant"
            title="SHA-256 del documento canonicalizado">
            {displayVersion.checksum.slice(0, 8)}…
          </span>
        )}
      </div>

      <DocTree doc={displayVersion.document} />

      {displayVersion.compatibility && (
        <details className="text-xs text-on-surface-variant">
          <summary className="cursor-pointer hover:text-on-surface">
            Compatibilidad ({displayVersion.compatibility.placements.length} placements)
          </summary>
          <DocTree doc={displayVersion.compatibility as unknown as Record<string, unknown>} />
        </details>
      )}
    </div>
  );
}
