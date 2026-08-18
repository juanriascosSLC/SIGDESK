import {
  ArrowDown,
  ArrowUp,
  ListChecks,
  Plus,
  Trash2,
  Type,
} from 'lucide-react';
import type {
  CatalogSpecification,
  FieldDefinition,
  FieldType,
} from '@/features/catalog/metamodel';
import {
  bindsToOptions,
  conditionReferences,
  fieldTypes,
  replaceConditionField,
  resourceTypeOptions,
  technicalKey,
} from './config';
import { ConditionalRulesEditor } from './ConditionalRulesEditor';
import {
  FriendlyField,
  IconButton,
  SectionHeading,
  Toggle,
} from './ui';

export function FieldsEditor({
  specification,
  updateSpecification,
  guided = false,
}: {
  specification: CatalogSpecification;
  updateSpecification: (updater: (current: CatalogSpecification) => CatalogSpecification) => void;
  guided?: boolean;
}) {
  function updateField(index: number, changes: Partial<FieldDefinition>) {
    updateSpecification((current) => {
      const previous = current.fields[index];
      const next = { ...previous, ...changes };
      current.fields[index] = next;
      if (changes.key && changes.key !== previous.key) {
        current.fields = current.fields.map((candidate) => ({
          ...candidate,
          visibleWhen: replaceConditionField(candidate.visibleWhen, previous.key, changes.key!),
          requiredWhen: replaceConditionField(candidate.requiredWhen, previous.key, changes.key!),
        }));
        Object.keys(current.views ?? {}).forEach((view) => {
          current.views![view] = current.views![view].map((key) =>
            key === previous.key ? changes.key! : key,
          );
        });
        if (current.detailLayout) {
          current.detailLayout.fields = current.detailLayout.fields.map((placement) =>
            placement.source === 'catalog' && placement.fieldKey === previous.key
              ? { ...placement, fieldKey: changes.key! }
              : placement,
          );
        }
      }
      // TODO-103 (T19) — un campo recién vinculado a recurso/agente IT se
      // marca readOnly en el layout de EDICIÓN si ya tiene un placement ahí
      // (no se crea uno nuevo — reasignar recurso/agente IT es un flujo de
      // negocio propio, AsignarTicketUseCase/EscalarAITUseCase, no un campo
      // de formulario genérico editable).
      if (changes.bindsTo && current.layouts?.edit) {
        const markReadOnly = (document: { sections: { placements: { fieldKey?: string; readOnly?: boolean }[] }[] }) => {
          for (const section of document.sections) {
            for (const placement of section.placements) {
              if (placement.fieldKey === next.key) placement.readOnly = true;
            }
          }
        };
        markReadOnly(current.layouts.edit.default);
        current.layouts.edit.variants?.forEach((variant) => markReadOnly(variant.document));
      }
      return current;
    });
  }

  function addField() {
    updateSpecification((current) => {
      const number = current.fields.length + 1;
      const key = `field${number}`;
      current.fields.push({
        key,
        label: `Nuevo campo ${number}`,
        type: 'text',
        required: false,
      });
      current.views = current.views ?? {};
      current.views.create = [...(current.views.create ?? []), key];
      // TODO-103 (T20) — addField() antes solo tocaba `views.create`
      // (mecanismo legado, Metamodel ≤1.3) sin sincronizar
      // `layouts.create.default` (mecanismo 1.4 real que CatalogForm.tsx
      // renderiza) — un campo nuevo podía quedar sin placement visible hasta
      // que un admin lo arrastrara manualmente en el Diseñador de plantilla.
      // Ahora crítico para bindsTo: tickets_service (T11) rechaza publicar
      // una definición con un campo bindsTo sin placement en layouts.create.
      // Arreglado de raíz para CUALQUIER tipo de campo nuevo, no solo bindsTo.
      if (current.layouts?.create) {
        const section = current.layouts.create.default.sections[0];
        if (section) {
          section.placements.push({
            id: `placement-create-${key}`,
            kind: 'field',
            source: 'catalog',
            fieldKey: key,
            columnSpan: 1,
          });
        } else {
          current.layouts.create.default.sections.push({
            id: 'section-create-main',
            columns: 1,
            placements: [
              { id: `placement-create-${key}`, kind: 'field', source: 'catalog', fieldKey: key, columnSpan: 1 },
            ],
          });
        }
      }
      return current;
    });
  }

  function removeField(index: number) {
    updateSpecification((current) => {
      const [removed] = current.fields.splice(index, 1);
      Object.keys(current.views ?? {}).forEach((view) => {
        current.views![view] = current.views![view].filter((key) => key !== removed.key);
      });
      if (current.detailLayout) {
        current.detailLayout.fields = current.detailLayout.fields.filter(
          (placement) =>
            placement.source !== 'catalog' || placement.fieldKey !== removed.key,
        );
      }
      current.fields = current.fields.map((field) => ({
        ...field,
        visibleWhen: conditionReferences(field.visibleWhen, removed.key)
          ? undefined
          : field.visibleWhen,
        requiredWhen: conditionReferences(field.requiredWhen, removed.key)
          ? undefined
          : field.requiredWhen,
      }));
      return current;
    });
  }

  function moveField(index: number, direction: -1 | 1) {
    updateSpecification((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.fields.length) return current;
      [current.fields[index], current.fields[target]] = [current.fields[target], current.fields[index]];
      return current;
    });
  }

  function toggleView(fieldKey: string, view: 'create' | 'summary', checked: boolean) {
    updateSpecification((current) => {
      current.views = current.views ?? {};
      const values = current.views[view] ?? [];
      current.views[view] = checked
        ? [...new Set([...values, fieldKey])]
        : values.filter((key) => key !== fieldKey);
      return current;
    });
  }

  return (
    <section className="panel-card p-6 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <SectionHeading
          icon={<ListChecks className="w-5 h-5" />}
          title="Campos y presentación"
          description="Define la información que las personas deben completar."
        />
        <button
          data-testid="catalog-add-field"
          onClick={addField}
          className="primary-button"
        >
          <Plus className="w-4 h-4" /> Agregar campo
        </button>
      </div>

      <div className="space-y-4 mt-7">
        {specification.fields.map((field, index) => (
          <div
            key={`${field.key}-${index}`}
            data-testid={`catalog-field-editor-${field.key}`}
            className="rounded-2xl border border-border/50 bg-surface-container p-5"
          >
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-300 flex items-center justify-center shrink-0">
                <Type className="w-5 h-5" />
              </div>
              <div className="grid lg:grid-cols-[minmax(0,1fr)_220px] gap-4 flex-1">
                <FriendlyField label={`Campo ${index + 1}`}>
                  <input
                    value={field.label}
                    onChange={(event) => {
                      const label = event.target.value;
                      const previousGeneratedKey = technicalKey(field.label);
                      updateField(index, {
                        label,
                        key: field.key === previousGeneratedKey ? technicalKey(label) : field.key,
                      });
                    }}
                    className="friendly-input"
                    placeholder="Ej. Prioridad"
                  />
                </FriendlyField>
                <FriendlyField label="Tipo de respuesta">
                  <select
                    value={field.type}
                    onChange={(event) => updateField(index, { type: event.target.value as FieldType })}
                    className="friendly-input bg-[#1d2026] text-[#e1e2eb]"
                    style={{ colorScheme: 'dark' }}
                  >
                    {fieldTypes.map((type) => (
                      <option key={type.value} value={type.value} className="bg-[#191c22] text-[#e1e2eb]">
                        {type.label}
                      </option>
                    ))}
                  </select>
                </FriendlyField>
              </div>
              <div className="flex gap-1">
                <IconButton
                  label="Subir campo"
                  disabled={index === 0}
                  onClick={() => moveField(index, -1)}
                >
                  <ArrowUp className="w-4 h-4" />
                </IconButton>
                <IconButton
                  label="Bajar campo"
                  disabled={index === specification.fields.length - 1}
                  onClick={() => moveField(index, 1)}
                >
                  <ArrowDown className="w-4 h-4" />
                </IconButton>
                <IconButton
                  label="Eliminar campo"
                  disabled={specification.fields.length === 1}
                  danger
                  onClick={() => removeField(index)}
                >
                  <Trash2 className="w-4 h-4" />
                </IconButton>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4 mt-4 ml-0 lg:ml-14">
              {field.type !== 'boolean' && (
                <FriendlyField label="Texto de ayuda" help="Ejemplo que aparece dentro del campo.">
                  <input
                    value={field.placeholder ?? ''}
                    onChange={(event) => updateField(index, { placeholder: event.target.value })}
                    className="friendly-input"
                    placeholder="Ej. Describe brevemente…"
                  />
                </FriendlyField>
              )}
              <div className="flex flex-wrap items-center gap-x-5 gap-y-3 pt-6">
                <Toggle
                  checked={field.required}
                  onChange={(checked) => updateField(index, { required: checked })}
                  label="Obligatorio"
                />
                <Toggle
                  checked={(specification.views?.create ?? []).includes(field.key)}
                  onChange={(checked) => toggleView(field.key, 'create', checked)}
                  label="Mostrar al crear"
                />
                <Toggle
                  checked={(specification.views?.summary ?? []).includes(field.key)}
                  onChange={(checked) => toggleView(field.key, 'summary', checked)}
                  label="Mostrar en resumen"
                />
              </div>
            </div>

            {/* TODO-103 — control separado de bindsTo, no conflated con el
                select de `type` de arriba (ver metamodel.ts para el porqué:
                bindsTo es ortogonal al FieldType nominal, el picker real
                reemplaza el renderer de DynamicField sin importar `type`). */}
            <div className="grid md:grid-cols-2 gap-4 mt-4 ml-0 lg:ml-14">
              <FriendlyField label="Vincular a" help="Referencia real a un recurso/agente IT en vez de un valor de texto.">
                <select
                  data-testid={`catalog-field-bindsto-${field.key}`}
                  value={field.bindsTo ?? ''}
                  onChange={(event) => {
                    const value = event.target.value as FieldDefinition['bindsTo'] | '';
                    updateField(index, {
                      bindsTo: value || undefined,
                      resourceType: value === 'recursoId' ? field.resourceType : undefined,
                    });
                  }}
                  className="friendly-input bg-[#1d2026] text-[#e1e2eb]"
                  style={{ colorScheme: 'dark' }}
                >
                  {bindsToOptions.map((option) => (
                    <option key={option.value || 'none'} value={option.value ?? ''} className="bg-[#191c22] text-[#e1e2eb]">
                      {option.label}
                    </option>
                  ))}
                </select>
              </FriendlyField>
              {field.bindsTo === 'recursoId' && (
                <FriendlyField label="Tipo de activo permitido">
                  <select
                    value={field.resourceType ?? ''}
                    onChange={(event) =>
                      updateField(index, {
                        resourceType: (event.target.value || undefined) as FieldDefinition['resourceType'],
                      })
                    }
                    className="friendly-input bg-[#1d2026] text-[#e1e2eb]"
                    style={{ colorScheme: 'dark' }}
                  >
                    {resourceTypeOptions.map((option) => (
                      <option key={option.value || 'any'} value={option.value} className="bg-[#191c22] text-[#e1e2eb]">
                        {option.label}
                      </option>
                    ))}
                  </select>
                </FriendlyField>
              )}
            </div>

            {(field.type === 'text' || field.type === 'textarea') && (
              <div className="grid sm:grid-cols-2 gap-4 mt-4 ml-0 lg:ml-14">
                <FriendlyField label="Mínimo de caracteres">
                  <input
                    type="number"
                    min={0}
                    value={field.minLength ?? ''}
                    onChange={(event) =>
                      updateField(index, {
                        minLength: event.target.value ? Number(event.target.value) : undefined,
                      })
                    }
                    className="friendly-input"
                  />
                </FriendlyField>
                <FriendlyField label="Máximo de caracteres">
                  <input
                    type="number"
                    min={1}
                    value={field.maxLength ?? ''}
                    onChange={(event) =>
                      updateField(index, {
                        maxLength: event.target.value ? Number(event.target.value) : undefined,
                      })
                    }
                    className="friendly-input"
                  />
                </FriendlyField>
              </div>
            )}

            {field.type === 'select' && (
              <div className="mt-5 ml-0 lg:ml-14">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-bold text-on-surface">Opciones disponibles</span>
                  <button
                    onClick={() =>
                      updateField(index, {
                        options: [
                          ...(field.options ?? []),
                          {
                            value: `option${(field.options?.length ?? 0) + 1}`,
                            label: `Opción ${(field.options?.length ?? 0) + 1}`,
                          },
                        ],
                      })
                    }
                    className="text-xs font-bold text-primary flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> Agregar opción
                  </button>
                </div>
                <div className="grid md:grid-cols-2 gap-2">
                  {(field.options ?? []).map((option, optionIndex) => (
                    <div key={`${option.value}-${optionIndex}`} className="flex items-center gap-2">
                      <input
                        value={option.label}
                        onChange={(event) => {
                          const options = [...(field.options ?? [])];
                          const label = event.target.value;
                          options[optionIndex] = {
                            label,
                            value:
                              option.value === technicalKey(option.label)
                                ? technicalKey(label)
                                : option.value,
                          };
                          updateField(index, { options });
                        }}
                        className="friendly-input"
                      />
                      <IconButton
                        label="Eliminar opción"
                        danger
                        onClick={() =>
                          updateField(index, {
                            options: field.options?.filter((_, current) => current !== optionIndex),
                          })
                        }
                      >
                        <Trash2 className="w-4 h-4" />
                      </IconButton>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <ConditionalRulesEditor
              field={field}
              fields={specification.fields}
              onChange={(changes) => updateField(index, changes)}
            />

            {!guided && <div className="mt-4 ml-0 lg:ml-14 text-[11px] text-on-surface-variant">
              Identificador interno: <span className="font-mono text-on-surface">{field.key}</span>
            </div>}
          </div>
        ))}
      </div>
    </section>
  );
}
