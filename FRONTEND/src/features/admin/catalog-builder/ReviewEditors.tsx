import {
  Braces,
  Check,
  CheckCircle2,
  Code2,
  History,
} from 'lucide-react';
import type { CatalogDefinition } from '@/features/catalog/metamodel';
import { guidedSteps, type Section } from './config';
import { SectionHeading } from './ui';

export function GuidedProgress({
  activeSection,
  onSelect,
}: {
  activeSection: Section;
  onSelect: (section: Section) => void;
}) {
  const activeIndex = guidedSteps.findIndex((step) => step.id === activeSection);
  return (
    <section className="panel-card p-5">
      <div className="flex items-center justify-between gap-2 overflow-x-auto">
        {guidedSteps.map((step, index) => {
          const complete = activeIndex > index;
          const active = activeSection === step.id;
          return (
            <div key={step.id} className="flex items-center min-w-0 flex-1">
              <button
                // El mismo testid que la barra lateral del editor completo:
                // los pasos del asistente SON esa navegación, solo que dibujada
                // como progreso. Sin esto, el modo guiado —el unico camino para
                // crear una entidad nueva— no era direccionable por pruebas.
                data-testid={`catalog-section-${step.id}`}
                onClick={() => onSelect(step.id)}
                className="group flex items-center gap-3 min-w-max text-left"
              >
                <span
                  className={`w-9 h-9 rounded-full border flex items-center justify-center text-sm font-black ${
                    active
                      ? 'border-primary bg-primary text-primary-foreground'
                      : complete
                        ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
                        : 'border-border/60 bg-surface-container text-on-surface-variant'
                  }`}
                >
                  {complete ? <Check className="w-4 h-4" /> : index + 1}
                </span>
                <span className="hidden md:block">
                  <span className={`block text-sm font-bold ${active ? 'text-primary' : 'text-on-surface'}`}>
                    {step.label}
                  </span>
                  <span className="block text-[10px] text-on-surface-variant">{step.description}</span>
                </span>
              </button>
              {index < guidedSteps.length - 1 && (
                <span className={`h-px flex-1 mx-3 ${complete ? 'bg-emerald-500/50' : 'bg-border/50'}`} />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// Compara por CONTENIDO, no por serialización: los diseñadores reconstruyen
// sus objetos con spreads en cada edición, así que el orden de claves cambia
// sin que cambie nada real. Un `JSON.stringify` directo reportaría
// diferencias fantasma en cuanto el resumen empezara a mirar los layouts.
function sameContent(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') {
    return false;
  }
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((item, index) => sameContent(item, right[index]));
  }
  const leftEntries = Object.entries(left as Record<string, unknown>).filter(([, value]) => value !== undefined);
  const rightEntries = Object.entries(right as Record<string, unknown>).filter(([, value]) => value !== undefined);
  if (leftEntries.length !== rightEntries.length) return false;
  const rightMap = new Map(rightEntries);
  return leftEntries.every(([key, value]) => rightMap.has(key) && sameContent(value, rightMap.get(key)));
}

export function ReviewEditor({
  selected,
  published,
}: {
  selected: CatalogDefinition;
  published?: CatalogDefinition;
}) {
  const specification = selected.specification;
  const requiredFields = specification.fields.filter((field) => field.required).length;
  const conditionalFields = specification.fields.filter(
    (field) => field.visibleWhen || field.requiredWhen,
  ).length;
  const initialState = specification.lifecycle.states.find((state) => state.initial);
  const bindings = specification.bindings ?? [];
  const publishedFields = published?.specification.fields ?? [];
  const currentFieldKeys = new Set(specification.fields.map((field) => field.key));
  const publishedFieldKeys = new Set(publishedFields.map((field) => field.key));
  const addedFields = specification.fields.filter((field) => !publishedFieldKeys.has(field.key));
  const removedFields = publishedFields.filter((field) => !currentFieldKeys.has(field.key));
  // El resumen incluye los DOS sistemas de layout. Antes sólo miraba
  // `detailLayout`, el mecanismo legado que ningún diseñador escribe ya: una
  // sesión entera rediseñando formularios o la página de detalle se publicaba
  // bajo el cartel "No hay diferencias frente a lo publicado".
  const changedAreas = published
    ? (
        [
          [specification.fields, published.specification.fields, 'Fields and capture rules'],
          [specification.lifecycle, published.specification.lifecycle, 'Workflow'],
          [specification.relations ?? [], published.specification.relations ?? [], 'Relationships'],
          [specification.bindings ?? [], published.specification.bindings ?? [], 'Connected resources'],
          [specification.layouts ?? null, published.specification.layouts ?? null, 'Creation and edit forms'],
          [specification.detailPage ?? null, published.specification.detailPage ?? null, 'Detail page layout'],
          [specification.detailLayout ?? null, published.specification.detailLayout ?? null, 'Detail view (legacy format)'],
        ] as Array<[unknown, unknown, string]>
      )
        .filter(([current, previous]) => !sameContent(current, previous))
        .map(([, , label]) => label)
    : ['First publication of the entity'];
  return (
    <section className="panel-card p-6 lg:p-8">
      <SectionHeading
        icon={<CheckCircle2 className="w-5 h-5" />}
        title="Ready to save"
        description="Review the result. You can save multiple times to the same draft before publishing."
      />
      <div className="grid md:grid-cols-2 gap-4 mt-7">
        <ReviewCard
          title="Entity"
          value={selected.name || 'Untitled'}
          detail={`${selected.entityKey || '—'} · records ${specification.identity.prefix || '—'}-000001`}
        />
        <ReviewCard
          title="Fields"
          value={`${specification.fields.length} fields`}
          detail={`${requiredFields} required · ${conditionalFields} conditional`}
        />
        <ReviewCard
          title="Behavior"
          value={`${specification.lifecycle.states.length} states`}
          detail={
            specification.lifecycle.transitions.length > 0
              ? `${specification.lifecycle.transitions.length} configured transitions`
              : `Starts and stays in “${initialState?.label ?? 'Undefined'}”`
          }
        />
        <ReviewCard
          title="Additional capabilities"
          value={bindings.length > 0 ? `${bindings.length} connected resources` : 'None'}
          detail={bindings.length > 0 ? 'Versions will be pinned upon publishing' : 'You can add them later'}
        />
      </div>
      <div className="mt-6 rounded-2xl border border-primary/20 bg-primary/5 p-5">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-primary" />
          <h3 className="font-bold text-on-surface">Pre-publish summary</h3>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {changedAreas.length > 0 ? changedAreas.map((area) => (
            <span key={area} className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
              {area}
            </span>
          )) : (
            <span className="text-sm text-on-surface-variant">No differences compared to published version.</span>
          )}
        </div>
        {(addedFields.length > 0 || removedFields.length > 0) && (
          <div className="mt-4 grid gap-3 text-xs md:grid-cols-2">
            <div>
              <span className="font-black uppercase text-emerald-300">Added fields</span>
              <p className="mt-1 text-on-surface-variant">
                {addedFields.map((field) => field.label).join(', ') || 'None'}
              </p>
            </div>
            <div>
              <span className="font-black uppercase text-red-300">Removed fields</span>
              <p className="mt-1 text-on-surface-variant">
                {removedFields.map((field) => field.label).join(', ') || 'None'}
              </p>
            </div>
          </div>
        )}
      </div>
      <div className="mt-6 rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-5 flex gap-4">
        <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
        <div>
          <h3 className="font-bold text-on-surface">
            {selected.status === 'draft'
              ? 'Working on active draft'
              : selected.status === 'published'
                ? 'Changes will be copied to active draft'
                : 'This historical version will be restored as a draft'}
          </h3>
          <p className="text-sm text-on-surface-variant mt-1">
            Saving does not affect users. The entity will only be available when you decide to publish it.
          </p>
        </div>
      </div>
    </section>
  );
}

function ReviewCard({
  title,
  value,
  detail,
}: {
  title: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-border/45 bg-surface-container p-5">
      <p className="text-[10px] font-black uppercase tracking-wider text-on-surface-variant">{title}</p>
      <p className="text-lg font-black text-on-surface mt-2">{value}</p>
      <p className="text-xs text-on-surface-variant mt-1">{detail}</p>
    </div>
  );
}

export function AdvancedEditor({
  value,
  onChange,
  onApply,
}: {
  value: string;
  onChange: (value: string) => void;
  onApply: () => void;
}) {
  return (
    <section className="panel-card p-6 lg:p-8">
      <SectionHeading
        icon={<Braces className="w-5 h-5" />}
        title="Advanced mode"
        description="Optional access to the full technical definition."
      />
      <div className="mt-6 rounded-2xl border border-amber-500/20 bg-amber-500/8 p-4 text-sm text-amber-100/80">
        This section is intended for technical administrators. Invalid changes will be rejected
        by the backend before saving.
      </div>
      <textarea
        data-testid="catalog-advanced-json"
        spellCheck={false}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full min-h-[520px] mt-5 bg-slate-950/80 border border-border/50 rounded-2xl p-5 font-mono text-sm leading-6 text-cyan-50 focus:outline-none focus:border-primary/50"
      />
      <div className="flex justify-end mt-4">
        <button onClick={onApply} className="secondary-button">
          <Code2 className="w-4 h-4" /> Apply advanced changes
        </button>
      </div>
    </section>
  );
}
