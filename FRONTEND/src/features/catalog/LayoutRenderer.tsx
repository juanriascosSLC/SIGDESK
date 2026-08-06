/**
 * LayoutRenderer – shared renderer that accepts a resolved layout document
 * (from GET /resolved-definition) and renders it using DynamicLayout.
 *
 * The component is intentionally stateless: all orchestration happens in the
 * consuming component (TicketDetail, CatalogForm, Preview).
 */
import type { ReactNode } from 'react';
import type { LayoutResolutionMode } from './api';
import type { LayoutDocument, LayoutSection, Placement } from './metamodel';
import { DynamicLayout } from './runtime/DynamicLayout';

export interface LayoutRendererProps {
  /**
   * Normalized LayoutDocument derived from the resolved layout's `layouts`
   * property or synthesized from the legacy specification.
   */
  document: LayoutDocument;
  /** Field values bag used to evaluate conditional visibility. */
  data: Record<string, unknown>;
  /** Delegate for rendering individual placements. */
  renderPlacement: (placement: Placement, section: LayoutSection) => ReactNode;
  /**
   * Layout resolution provenance badge — the exact three strings
   * the resolved-definition contract can produce:
   * - `"latest-compatible"` → the active published layout, still compatible
   * - `"previous-compatible"` → active layout was incompatible; this is the
   *   most recent published version that still is
   * - `"legacy-synthesized"` → no published layout is compatible; synthesized
   *   from the record's own manifest
   */
  resolution?: LayoutResolutionMode;
  /**
   * Whether to show the provenance badge. Defaults to false.
   */
  showProvenance?: boolean;
  className?: string;
}

const PROVENANCE_LABEL: Record<LayoutResolutionMode, { label: string; color: string }> = {
  'latest-compatible': { label: 'Layout activo', color: 'bg-green-100 text-green-800' },
  'previous-compatible': { label: 'Versión anterior compatible', color: 'bg-yellow-100 text-yellow-800' },
  'legacy-synthesized': { label: 'Generado (sin layout)', color: 'bg-gray-100 text-gray-600' },
};

export function LayoutRenderer({
  document,
  data,
  renderPlacement,
  resolution,
  showProvenance = false,
  className,
}: LayoutRendererProps) {
  const provenance = resolution ? PROVENANCE_LABEL[resolution] : null;

  return (
    <div className={`layout-renderer ${className ?? ''}`}>
      {showProvenance && provenance && (
        <div
          data-testid="definition-provenance"
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium mb-3 ${provenance.color}`}
          title={`Resolución: ${resolution}`}
        >
          {provenance.label}
        </div>
      )}
      <DynamicLayout
        document={document}
        data={data}
        renderPlacement={renderPlacement}
      />
    </div>
  );
}
