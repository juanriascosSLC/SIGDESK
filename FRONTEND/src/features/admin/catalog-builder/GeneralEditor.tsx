import { FileText, Info } from 'lucide-react';
import type { CatalogDefinition } from '@/features/catalog/metamodel';
import { technicalKey } from './config';
import { FriendlyField, SectionHeading } from './ui';

export function GeneralEditor({
  selected,
  setSelected,
  guided = false,
}: {
  selected: CatalogDefinition;
  setSelected: React.Dispatch<React.SetStateAction<CatalogDefinition>>;
  guided?: boolean;
}) {
  function updateIdentity(value: string) {
    const key = technicalKey(value, true).slice(0, 32);
    setSelected((current) => ({
      ...current,
      entityKey: current.id ? current.entityKey : key,
      specification: {
        ...current.specification,
        identity: { prefix: current.id ? current.specification.identity.prefix : key },
      },
    }));
  }

  return (
    // `catalog-panel-general` identifica el PANEL. El testid parecido
    // `catalog-section-general` está en el botón de navegación, y una prueba que
    // buscaba los campos dentro de él no podía encontrarlos nunca: son cosas
    // distintas y ahora cada una tiene su nombre.
    <section data-testid="catalog-panel-general" className="panel-card p-6 lg:p-8">
      <SectionHeading
        icon={<Info className="w-5 h-5" />}
        title="General Information"
        description="Give it a clear identity so people know when to use it."
      />
      <div className={`grid gap-5 mt-7 ${guided ? '' : 'md:grid-cols-2'}`}>
        <FriendlyField label="Display Name" help="How it will appear in menus and forms.">
          <input
            value={selected.name}
            onChange={(event) => {
              const name = event.target.value;
              setSelected((current) => ({ ...current, name }));
              if (!selected.id) updateIdentity(name);
            }}
            placeholder="e.g. Incident"
            className="friendly-input"
          />
        </FriendlyField>
        {!guided && <FriendlyField
          label="Short Code"
          help="Used to identify and number records. Cannot be changed after creation."
        >
          <div className="relative">
            <input
              value={selected.entityKey}
              disabled={Boolean(selected.id)}
              onChange={(event) => updateIdentity(event.target.value)}
              placeholder="INC"
              maxLength={32}
              className="friendly-input font-mono uppercase disabled:opacity-60"
            />
            {selected.id && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-on-surface-variant">
                LOCKED
              </span>
            )}
          </div>
        </FriendlyField>}
      </div>
      {guided && (
        <div className="mt-5 rounded-xl border border-border/40 bg-surface-container px-4 py-3 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold text-on-surface">Automatic Identifier</p>
            <p className="text-[11px] text-on-surface-variant">
              Used internally to number and connect the entity.
            </p>
          </div>
          <code data-testid="catalog-entity-key" className="text-sm font-black text-primary">{selected.entityKey || '—'}</code>
        </div>
      )}
      <div className="mt-5">
        <FriendlyField
          label="Description"
          help="Explains what this entity represents and when it should be used."
        >
          <textarea
            value={selected.specification.description}
            onChange={(event) =>
              setSelected((current) => ({
                ...current,
                specification: { ...current.specification, description: event.target.value },
              }))
            }
            rows={4}
            placeholder="e.g. Records an interruption or degradation of a service…"
            className="friendly-input resize-y"
          />
        </FriendlyField>
      </div>
      <div className="mt-7 rounded-2xl border border-primary/20 bg-primary/5 p-5 flex gap-4">
        <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
          <FileText className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 className="font-bold text-on-surface">Numbering Preview</h3>
          <p className="text-sm text-on-surface-variant mt-1">
            Records will be identified as{' '}
            <strong className="font-mono text-primary">
              {selected.specification.identity.prefix || 'ABC'}-000001
            </strong>
          </p>
        </div>
      </div>
    </section>
  );
}
