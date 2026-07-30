import {
  ArrowRight,
  CircleDot,
  GitBranch,
  Plus,
  Trash2,
} from 'lucide-react';
import type {
  CatalogSpecification,
  RelationDefinition,
} from '@/features/catalog/metamodel';
import { technicalKey } from './config';
import {
  EmptyMessage,
  FriendlyField,
  IconButton,
  SectionHeading,
} from './ui';

export function WorkflowEditor({
  specification,
  updateSpecification,
  guided = false,
}: {
  specification: CatalogSpecification;
  updateSpecification: (updater: (current: CatalogSpecification) => CatalogSpecification) => void;
  guided?: boolean;
}) {
  const states = specification.lifecycle.states;

  function addState() {
    updateSpecification((current) => {
      const number = current.lifecycle.states.length + 1;
      current.lifecycle.states.push({
        key: `state${number}`,
        label: `Nuevo estado ${number}`,
        initial: current.lifecycle.states.length === 0,
      });
      return current;
    });
  }

  function removeState(index: number) {
    updateSpecification((current) => {
      const removed = current.lifecycle.states[index];
      current.lifecycle.states.splice(index, 1);
      current.lifecycle.transitions = current.lifecycle.transitions.filter(
        (transition) => transition.from !== removed.key && transition.to !== removed.key,
      );
      if (!current.lifecycle.states.some((state) => state.initial) && current.lifecycle.states[0]) {
        current.lifecycle.states[0].initial = true;
      }
      return current;
    });
  }

  function addTransition() {
    updateSpecification((current) => {
      const from = current.lifecycle.states[0]?.key ?? '';
      const to = current.lifecycle.states[1]?.key ?? from;
      const number = current.lifecycle.transitions.length + 1;
      current.lifecycle.transitions.push({
        key: `transition${number}`,
        label: `Nueva transición ${number}`,
        from,
        to,
      });
      return current;
    });
  }

  return (
    <section className="space-y-5">
      {guided && (
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm text-on-surface-variant">
          Si tus registros no necesitan aprobaciones ni cambios de etapa, puedes dejar el único estado
          inicial y continuar.
        </div>
      )}
      <div className="panel-card p-6 lg:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <SectionHeading
            icon={<CircleDot className="w-5 h-5" />}
            title="Estados"
            description="Representan las etapas por las que pasa un registro."
          />
          <button onClick={addState} className="primary-button">
            <Plus className="w-4 h-4" /> Agregar estado
          </button>
        </div>
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3 mt-7">
          {states.map((state, index) => (
            <div
              key={`${state.key}-${index}`}
              className={`rounded-2xl border p-4 ${
                state.initial
                  ? 'border-emerald-500/40 bg-emerald-500/8'
                  : 'border-border/50 bg-surface-container'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-3">
                <label className="flex items-center gap-2 text-xs font-bold text-on-surface-variant cursor-pointer">
                  <input
                    type="radio"
                    checked={Boolean(state.initial)}
                    onChange={() =>
                      updateSpecification((current) => {
                        current.lifecycle.states.forEach((item, currentIndex) => {
                          item.initial = currentIndex === index;
                        });
                        return current;
                      })
                    }
                    className="accent-emerald-400"
                  />
                  {state.initial ? 'Estado inicial' : 'Marcar como inicial'}
                </label>
                <IconButton
                  label="Eliminar estado"
                  danger
                  disabled={states.length === 1}
                  onClick={() => removeState(index)}
                >
                  <Trash2 className="w-4 h-4" />
                </IconButton>
              </div>
              <input
                value={state.label}
                onChange={(event) => {
                  const label = event.target.value;
                  updateSpecification((current) => {
                    const previousKey = current.lifecycle.states[index].key;
                    const nextKey =
                      previousKey === technicalKey(current.lifecycle.states[index].label)
                        ? technicalKey(label)
                        : previousKey;
                    current.lifecycle.states[index] = {
                      ...current.lifecycle.states[index],
                      label,
                      key: nextKey,
                    };
                    current.lifecycle.transitions.forEach((transition) => {
                      if (transition.from === previousKey) transition.from = nextKey;
                      if (transition.to === previousKey) transition.to = nextKey;
                    });
                    return current;
                  });
                }}
                className="friendly-input font-bold"
              />
              <div className="mt-2 text-[11px] text-on-surface-variant">
                Clave: <span className="font-mono">{state.key}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="panel-card p-6 lg:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <SectionHeading
            icon={<GitBranch className="w-5 h-5" />}
            title="Transiciones"
            description="Define cómo puede avanzar o retroceder un registro."
          />
          <button
            onClick={addTransition}
            disabled={states.length < 2}
            className="primary-button disabled:opacity-40"
          >
            <Plus className="w-4 h-4" /> Agregar transición
          </button>
        </div>
        {specification.lifecycle.transitions.length === 0 ? (
          <EmptyMessage text="Agrega al menos dos estados para crear movimientos entre ellos." />
        ) : (
          <div className="space-y-3 mt-7">
            {specification.lifecycle.transitions.map((transition, index) => (
              <div
                key={`${transition.key}-${index}`}
                className="grid lg:grid-cols-[minmax(160px,1fr)_minmax(140px,1fr)_24px_minmax(140px,1fr)_40px] items-end gap-3 rounded-2xl border border-border/50 bg-surface-container p-4"
              >
                <FriendlyField label="Nombre de la acción">
                  <input
                    value={transition.label}
                    onChange={(event) =>
                      updateSpecification((current) => {
                        current.lifecycle.transitions[index].label = event.target.value;
                        return current;
                      })
                    }
                    className="friendly-input"
                  />
                </FriendlyField>
                <FriendlyField label="Desde">
                  <select
                    value={transition.from}
                    onChange={(event) =>
                      updateSpecification((current) => {
                        current.lifecycle.transitions[index].from = event.target.value;
                        return current;
                      })
                    }
                    className="friendly-input bg-[#1d2026] text-[#e1e2eb]"
                    style={{ colorScheme: 'dark' }}
                  >
                    {states.map((state) => (
                      <option key={state.key} value={state.key} className="bg-[#191c22] text-[#e1e2eb]">{state.label}</option>
                    ))}
                  </select>
                </FriendlyField>
                <ArrowRight className="w-5 h-5 text-primary mb-3 hidden lg:block" />
                <FriendlyField label="Hacia">
                  <select
                    value={transition.to}
                    onChange={(event) =>
                      updateSpecification((current) => {
                        current.lifecycle.transitions[index].to = event.target.value;
                        return current;
                      })
                    }
                    className="friendly-input bg-[#1d2026] text-[#e1e2eb]"
                    style={{ colorScheme: 'dark' }}
                  >
                    {states.map((state) => (
                      <option key={state.key} value={state.key} className="bg-[#191c22] text-[#e1e2eb]">{state.label}</option>
                    ))}
                  </select>
                </FriendlyField>
                <IconButton
                  label="Eliminar transición"
                  danger
                  onClick={() =>
                    updateSpecification((current) => {
                      current.lifecycle.transitions.splice(index, 1);
                      return current;
                    })
                  }
                >
                  <Trash2 className="w-4 h-4" />
                </IconButton>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export function RelationsEditor({
  specification,
  entityKeys,
  updateSpecification,
}: {
  specification: CatalogSpecification;
  entityKeys: string[];
  updateSpecification: (updater: (current: CatalogSpecification) => CatalogSpecification) => void;
}) {
  const relations = specification.relations ?? [];

  function updateRelation(index: number, changes: Partial<RelationDefinition>) {
    updateSpecification((current) => {
      current.relations = current.relations ?? [];
      current.relations[index] = { ...current.relations[index], ...changes };
      return current;
    });
  }

  function addRelation() {
    updateSpecification((current) => {
      current.relations = current.relations ?? [];
      const number = current.relations.length + 1;
      current.relations.push({
        key: `relation${number}`,
        label: `Relación ${number}`,
        targetEntityKey: entityKeys[0] ?? 'INC',
        inverseKey: `relatedFrom${number}`,
        inverseLabel: `Relacionado desde ${number}`,
        cardinality: 'many',
      });
      return current;
    });
  }

  return (
    <section className="panel-card p-6 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <SectionHeading
          icon={<GitBranch className="w-5 h-5" />}
          title="Relaciones entre entidades"
          description="Define qué tipos de registros puede vincular esta entidad. El runtime validará cada enlace contra la versión publicada."
        />
        <button onClick={addRelation} className="primary-button">
          <Plus className="w-4 h-4" /> Agregar relación
        </button>
      </div>

      <div className="mt-7 space-y-4">
        {relations.map((relation, index) => (
          <div key={`${relation.key}-${index}`} className="rounded-2xl border border-border/50 bg-surface-container p-5">
            <div className="grid gap-4 md:grid-cols-2">
              <FriendlyField label="Nombre visible" help="Cómo se verá desde esta entidad.">
                <input
                  value={relation.label}
                  onChange={(event) => {
                    const label = event.target.value;
                    const generated = technicalKey(relation.label);
                    updateRelation(index, {
                      label,
                      key: relation.key === generated ? technicalKey(label) : relation.key,
                    });
                  }}
                  className="friendly-input"
                  placeholder="Ej. Incidentes investigados"
                />
              </FriendlyField>
              <FriendlyField label="Entidad destino">
                <select
                  value={relation.targetEntityKey}
                  onChange={(event) => updateRelation(index, { targetEntityKey: event.target.value })}
                  className="friendly-input bg-[#1d2026] text-[#e1e2eb]"
                  style={{ colorScheme: 'dark' }}
                >
                  {entityKeys.map((entityKey) => (
                    <option key={entityKey} value={entityKey} className="bg-[#191c22] text-[#e1e2eb]">
                      {entityKey}
                    </option>
                  ))}
                </select>
              </FriendlyField>
              <FriendlyField label="Cómo se verá desde el destino" help="Etiqueta inversa del mismo vínculo.">
                <input
                  value={relation.inverseLabel}
                  onChange={(event) => {
                    const inverseLabel = event.target.value;
                    const generated = technicalKey(relation.inverseLabel);
                    updateRelation(index, {
                      inverseLabel,
                      inverseKey:
                        relation.inverseKey === generated
                          ? technicalKey(inverseLabel)
                          : relation.inverseKey,
                    });
                  }}
                  className="friendly-input"
                  placeholder="Ej. Investigado por problema"
                />
              </FriendlyField>
              <FriendlyField label="Cantidad permitida">
                <select
                  value={relation.cardinality ?? 'many'}
                  onChange={(event) => updateRelation(index, {
                    cardinality: event.target.value as 'one' | 'many',
                  })}
                  className="friendly-input bg-[#1d2026] text-[#e1e2eb]"
                  style={{ colorScheme: 'dark' }}
                >
                  <option value="many">Varios registros</option>
                  <option value="one">Un solo registro</option>
                </select>
              </FriendlyField>
            </div>
            <div className="mt-4 flex items-center justify-between gap-4 text-[11px] text-on-surface-variant">
              <span>
                Contrato: <code className="text-on-surface">{relation.key}</code>
                {' ↔ '}
                <code className="text-on-surface">{relation.inverseKey}</code>
              </span>
              <IconButton
                label="Eliminar relación"
                danger
                onClick={() =>
                  updateSpecification((current) => {
                    current.relations = (current.relations ?? []).filter((_, currentIndex) => currentIndex !== index);
                    return current;
                  })
                }
              >
                <Trash2 className="w-4 h-4" />
              </IconButton>
            </div>
          </div>
        ))}
        {relations.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border/40 p-10 text-center text-sm text-on-surface-variant">
            Esta entidad todavía no declara relaciones. Puedes agregar contratos estables hacia INC, PRB, RFC u otra definición.
          </div>
        )}
      </div>
    </section>
  );
}
