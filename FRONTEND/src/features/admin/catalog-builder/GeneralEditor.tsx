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
    <section className="panel-card p-6 lg:p-8">
      <SectionHeading
        icon={<Info className="w-5 h-5" />}
        title="Información general"
        description="Dale una identidad clara para que las personas sepan cuándo usarla."
      />
      <div className={`grid gap-5 mt-7 ${guided ? '' : 'md:grid-cols-2'}`}>
        <FriendlyField label="Nombre visible" help="Así aparecerá en menús y formularios.">
          <input
            value={selected.name}
            onChange={(event) => {
              const name = event.target.value;
              setSelected((current) => ({ ...current, name }));
              if (!selected.id) updateIdentity(name);
            }}
            placeholder="Ej. Incidente"
            className="friendly-input"
          />
        </FriendlyField>
        {!guided && <FriendlyField
          label="Código corto"
          help="Se usa para identificar y numerar registros. No cambia después de crearla."
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
                FIJO
              </span>
            )}
          </div>
        </FriendlyField>}
      </div>
      {guided && (
        <div className="mt-5 rounded-xl border border-border/40 bg-surface-container px-4 py-3 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold text-on-surface">Identificador automático</p>
            <p className="text-[11px] text-on-surface-variant">
              Lo usamos internamente para numerar y conectar la entidad.
            </p>
          </div>
          <code className="text-sm font-black text-primary">{selected.entityKey || '—'}</code>
        </div>
      )}
      <div className="mt-5">
        <FriendlyField
          label="Descripción"
          help="Explica qué representa esta entidad y en qué situación debe utilizarse."
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
            placeholder="Ej. Registra una interrupción o degradación de un servicio…"
            className="friendly-input resize-y"
          />
        </FriendlyField>
      </div>
      <div className="mt-7 rounded-2xl border border-primary/20 bg-primary/5 p-5 flex gap-4">
        <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
          <FileText className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 className="font-bold text-on-surface">Vista previa de numeración</h3>
          <p className="text-sm text-on-surface-variant mt-1">
            Los registros se identificarán como{' '}
            <strong className="font-mono text-primary">
              {selected.specification.identity.prefix || 'ABC'}-000001
            </strong>
          </p>
        </div>
      </div>
    </section>
  );
}
