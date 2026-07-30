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
  const changedAreas = published
    ? [
        JSON.stringify(specification.fields) !== JSON.stringify(published.specification.fields)
          ? 'Campos y reglas de captura'
          : '',
        JSON.stringify(specification.lifecycle) !== JSON.stringify(published.specification.lifecycle)
          ? 'Flujo de trabajo'
          : '',
        JSON.stringify(specification.relations ?? []) !== JSON.stringify(published.specification.relations ?? [])
          ? 'Relaciones'
          : '',
        JSON.stringify(specification.bindings ?? []) !== JSON.stringify(published.specification.bindings ?? [])
          ? 'Recursos conectados'
          : '',
        JSON.stringify(specification.detailLayout ?? null) !== JSON.stringify(published.specification.detailLayout ?? null)
          ? 'Vista de detalle'
          : '',
      ].filter(Boolean)
    : ['Primera publicación de la entidad'];
  return (
    <section className="panel-card p-6 lg:p-8">
      <SectionHeading
        icon={<CheckCircle2 className="w-5 h-5" />}
        title="Todo listo para guardar"
        description="Comprueba el resultado. Puedes guardar varias veces sobre el mismo borrador antes de publicar."
      />
      <div className="grid md:grid-cols-2 gap-4 mt-7">
        <ReviewCard
          title="Entidad"
          value={selected.name || 'Sin nombre'}
          detail={`${selected.entityKey || '—'} · registros ${specification.identity.prefix || '—'}-000001`}
        />
        <ReviewCard
          title="Datos"
          value={`${specification.fields.length} campos`}
          detail={`${requiredFields} obligatorios · ${conditionalFields} condicionales`}
        />
        <ReviewCard
          title="Comportamiento"
          value={`${specification.lifecycle.states.length} estados`}
          detail={
            specification.lifecycle.transitions.length > 0
              ? `${specification.lifecycle.transitions.length} movimientos configurados`
              : `Empieza y permanece en “${initialState?.label ?? 'Sin definir'}”`
          }
        />
        <ReviewCard
          title="Capacidades adicionales"
          value={bindings.length > 0 ? `${bindings.length} recursos conectados` : 'Ninguna'}
          detail={bindings.length > 0 ? 'Se fijarán sus versiones al publicar' : 'Puedes agregarlas más adelante'}
        />
      </div>
      <div className="mt-6 rounded-2xl border border-primary/20 bg-primary/5 p-5">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-primary" />
          <h3 className="font-bold text-on-surface">Resumen antes de publicar</h3>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {changedAreas.length > 0 ? changedAreas.map((area) => (
            <span key={area} className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
              {area}
            </span>
          )) : (
            <span className="text-sm text-on-surface-variant">No hay diferencias frente a lo publicado.</span>
          )}
        </div>
        {(addedFields.length > 0 || removedFields.length > 0) && (
          <div className="mt-4 grid gap-3 text-xs md:grid-cols-2">
            <div>
              <span className="font-black uppercase text-emerald-300">Campos agregados</span>
              <p className="mt-1 text-on-surface-variant">
                {addedFields.map((field) => field.label).join(', ') || 'Ninguno'}
              </p>
            </div>
            <div>
              <span className="font-black uppercase text-red-300">Campos retirados</span>
              <p className="mt-1 text-on-surface-variant">
                {removedFields.map((field) => field.label).join(', ') || 'Ninguno'}
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
              ? 'Estás trabajando sobre el borrador activo'
              : selected.status === 'published'
                ? 'Los cambios se copiarán al borrador activo'
                : 'Esta versión histórica se restaurará como borrador'}
          </h3>
          <p className="text-sm text-on-surface-variant mt-1">
            Guardar no afecta a los usuarios. La entidad solo estará disponible cuando decidas publicarla.
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
        title="Modo avanzado"
        description="Acceso opcional a la definición técnica completa."
      />
      <div className="mt-6 rounded-2xl border border-amber-500/20 bg-amber-500/8 p-4 text-sm text-amber-100/80">
        Esta sección está pensada para administradores técnicos. Los cambios incorrectos serán rechazados
        por el backend antes de guardar.
      </div>
      <textarea
        spellCheck={false}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full min-h-[520px] mt-5 bg-slate-950/80 border border-border/50 rounded-2xl p-5 font-mono text-sm leading-6 text-cyan-50 focus:outline-none focus:border-primary/50"
      />
      <div className="flex justify-end mt-4">
        <button onClick={onApply} className="secondary-button">
          <Code2 className="w-4 h-4" /> Aplicar cambios avanzados
        </button>
      </div>
    </section>
  );
}
