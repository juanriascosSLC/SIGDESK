import type { ReactNode } from 'react';
import type { PagePlacement } from '@/features/catalog/metamodel';
import { ContentPlacementView } from '@/features/catalog/runtime/PageLayoutRenderer';
import { CONTENT_META } from './page-library';
import type { AnyPageSurface } from './surface';

// Wraps an element that renders to nothing (or to a single hairline) in a
// labelled dashed ghost, so it is still selectable and movable on the canvas.
function DesignerGhost({ placement, children }: { placement: PagePlacement; children?: ReactNode }) {
  const meta = CONTENT_META[placement.contentKind ?? 'text'];
  return (
    <div className="rounded-xl border border-dashed border-border/50 bg-surface-container-low/50 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-on-surface-variant/70">
        <meta.icon className="h-3 w-3" />
        {meta.label}
      </div>
      {children && <div className="mt-2">{children}</div>}
    </div>
  );
}

// What a cell shows on the designer canvas.
//
// The surface's runtime dispatcher deliberately returns null for `content`
// placements, because on the real page
// PageLayoutRenderer.RegionGrid renders those itself via ContentPlacementView.
// The designer canvas does NOT go through RegionGrid (it draws its own
// editable rows), so it never picked up that fallback: dragging Sección,
// Texto informativo, Separador or Espacio in produced a slot that rendered
// absolutely nothing. It was still there, still saved, still published — just
// invisible in the one place meant to show you the page.
//
// This restores the fallback AND makes the two structurally-invisible kinds
// (divider/spacer) and any not-yet-filled section/text legible while editing,
// without changing a single byte of what gets published.
export function DesignerPlacementContent({
  surface,
  placement,
  context,
}: {
  surface: AnyPageSurface;
  placement: PagePlacement;
  context: unknown;
}) {
  if (placement.kind !== 'content') {
    return <>{surface.renderPlacementContent(placement, context)}</>;
  }

  switch (placement.contentKind) {
    case 'section':
      return placement.title ? (
        <ContentPlacementView placement={placement} />
      ) : (
        <DesignerGhost placement={placement}>
          <p className="text-xs italic text-on-surface-variant/60">Sin título — escríbelo en Propiedades</p>
        </DesignerGhost>
      );
    case 'text':
      return placement.content ? (
        <ContentPlacementView placement={placement} />
      ) : (
        <DesignerGhost placement={placement}>
          <p className="text-xs italic text-on-surface-variant/60">Sin texto — escríbelo en Propiedades</p>
        </DesignerGhost>
      );
    case 'divider':
      return (
        <DesignerGhost placement={placement}>
          <hr className="border-border/60" />
        </DesignerGhost>
      );
    case 'spacer':
      return (
        <DesignerGhost placement={placement}>
          <div aria-hidden className="rounded-lg bg-[repeating-linear-gradient(45deg,transparent,transparent_6px,rgba(255,255,255,0.05)_6px,rgba(255,255,255,0.05)_12px)]" style={{ height: '1.5rem' }} />
        </DesignerGhost>
      );
    default:
      return <DesignerGhost placement={placement} />;
  }
}
