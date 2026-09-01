import { useState } from 'react';
import { LayoutTemplate } from 'lucide-react';
import type { CatalogSpecification, LayoutKind } from '@/features/catalog/metamodel';
import { SectionHeading } from '../ui';
import { PageDesigner } from './page-designer/PageDesigner';
import { SURFACE_BY_KIND } from './page-designer/surfaces';

// Since metamodel 1.6 all three views — Crear, Editar and Detalle — are
// designed with the SAME engine: full pages of five regions on a 12-column
// grid (PageDesigner + PageLayoutRenderer). Before that, only Detalle was, and
// the forms were built from stacked 1.4 sections; a form could not have a
// sidebar, a widget or a resizable column, so what an admin composed for the
// ticket never lined up with the form that created it.
//
// The 1.4 section designer (LayoutCanvas, LayoutSectionCard, PlacementCard,
// ComponentPalette, PropertiesPanel, DesignerToolbar, TemplatePreview,
// document-ops) is no longer reachable from here, and neither is the
// DynamicLayout/DynamicSection renderer it previewed with. They are kept on
// disk on purpose but they are NOT on any live path — do not add to them.
//
// What IS still live from 1.4 is the DOCUMENT, in two places:
//   * `layouts.{create,edit}` keeps being written, as a mirror derived from
//     the page on every commit (see PageSurface.projectToLegacy), because
//     tickets_service validates its `bindsTo` placement rule against it;
//   * `resolveLayoutDocument` is what synthesizeFormPageFromLegacy reads to
//     build an equivalent page for a definition published before 1.6.
// Delete either and definitions published before 1.6 stop rendering.
export function TemplateDesigner({
  entityKey,
  specification,
  updateSpecification,
}: {
  entityKey: string;
  specification: CatalogSpecification;
  updateSpecification: (updater: (current: CatalogSpecification) => CatalogSpecification) => void;
}) {
  const [activeKind, setActiveKind] = useState<LayoutKind>('create');
  const surface = SURFACE_BY_KIND[activeKind];

  return (
    <section className="panel-card space-y-4 p-4 lg:p-5" data-testid="template-designer">
      <SectionHeading
        icon={<LayoutTemplate className="h-5 w-5" />}
        title={surface.headline.title}
        description={surface.headline.description}
      />
      {/* Remounting per kind is required, not cosmetic: each surface brings
          its own simulated-context hook, and React does not allow swapping
          hooks under a mounted component. It also scopes undo/redo to the page
          being edited, which is the behaviour you want anyway. */}
      <PageDesigner
        key={activeKind}
        surface={surface}
        entityKey={entityKey}
        specification={specification}
        updateSpecification={updateSpecification}
        activeKind={activeKind}
        onChangeKind={setActiveKind}
      />
    </section>
  );
}
