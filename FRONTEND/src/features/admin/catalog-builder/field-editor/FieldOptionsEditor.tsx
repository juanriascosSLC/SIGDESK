import { useState } from 'react';
import {
  AlertTriangle,
  ClipboardPaste,
  GripVertical,
  Layers,
  Plus,
  Sparkles,
  Star,
  Trash2,
  Wand2,
  X,
} from 'lucide-react';
import type { FieldDefinition, FieldOption } from '@/features/catalog/metamodel';
import { technicalKey } from '../config';
import { IconButton } from '../ui';
import {
  duplicateOptionValues,
  parseOptionsFromText,
  reorder,
} from './field-operations';

const PRESETS: Array<{ name: string; options: Array<{ label: string; value: string }> }> = [
  {
    name: 'Prioridad (Alta / Media / Baja)',
    options: [
      { label: 'Alta', value: 'alta' },
      { label: 'Media', value: 'media' },
      { label: 'Baja', value: 'baja' },
    ],
  },
  {
    name: 'Impacto (Crítico / Alto / Medio / Bajo)',
    options: [
      { label: 'Crítico', value: 'critico' },
      { label: 'Alto', value: 'alto' },
      { label: 'Medio', value: 'medio' },
      { label: 'Bajo', value: 'bajo' },
    ],
  },
  {
    name: 'Estado (Activo / Inactivo)',
    options: [
      { label: 'Activo', value: 'activo' },
      { label: 'Inactivo', value: 'inactivo' },
    ],
  },
  {
    name: 'Frecuencia (Diaria / Semanal / Mensual)',
    options: [
      { label: 'Diaria', value: 'diaria' },
      { label: 'Semanal', value: 'semanal' },
      { label: 'Mensual', value: 'mensual' },
    ],
  },
  {
    name: 'Sí / No',
    options: [
      { label: 'Sí', value: 'si' },
      { label: 'No', value: 'no' },
    ],
  },
];

/**
 * Editor de opciones para `select`, `radio` y `multiselect`.
 */
export function FieldOptionsEditor({
  field,
  defaultValue,
  onChange,
}: {
  field: FieldDefinition;
  defaultValue: unknown;
  onChange: (changes: Partial<FieldDefinition>) => void;
}) {
  const options = field.options ?? [];
  const [pasting, setPasting] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [showPresets, setShowPresets] = useState(false);
  const duplicates = duplicateOptionValues(field);
  const multiple = field.type === 'multiselect';
  const chosen = multiple
    ? new Set((Array.isArray(defaultValue) ? defaultValue : []).map(String))
    : new Set(defaultValue === undefined || defaultValue === '' ? [] : [String(defaultValue)]);

  function setOptions(next: FieldOption[]) {
    onChange({ options: next });
  }

  function updateOption(index: number, changes: Partial<FieldOption>) {
    const next = [...options];
    next[index] = { ...next[index], ...changes };
    const previousValue = options[index].value;
    if (changes.value && changes.value !== previousValue && chosen.has(previousValue)) {
      onChange({ options: next, ...defaultAfterRename(previousValue, changes.value) });
      return;
    }
    setOptions(next);
  }

  function defaultAfterRename(from: string, to: string): Partial<FieldDefinition> {
    if (!multiple) return { defaultValue: to };
    const current = (Array.isArray(defaultValue) ? defaultValue : []).map(String);
    return { defaultValue: current.map((entry) => (entry === from ? to : entry)) };
  }

  function addOption() {
    const number = options.length + 1;
    setOptions([...options, { value: `opcion${number}`, label: `Opción ${number}` }]);
  }

  function applyPreset(presetOptions: Array<{ label: string; value: string }>) {
    setOptions(presetOptions);
    setShowPresets(false);
    if (!multiple && presetOptions.length > 0) {
      // Don't auto-set default to allow clean state
    }
  }

  function removeOption(index: number) {
    const removed = options[index];
    const next = options.filter((_, current) => current !== index);
    if (!chosen.has(removed.value)) {
      setOptions(next);
      return;
    }
    if (multiple) {
      const current = (Array.isArray(defaultValue) ? defaultValue : []).map(String);
      onChange({ options: next, defaultValue: current.filter((entry) => entry !== removed.value) });
      return;
    }
    onChange({ options: next, defaultValue: undefined });
  }

  function toggleDefault(optionValue: string) {
    if (!multiple) {
      onChange({ defaultValue: chosen.has(optionValue) ? undefined : optionValue });
      return;
    }
    const current = (Array.isArray(defaultValue) ? defaultValue : []).map(String);
    const next = chosen.has(optionValue)
      ? current.filter((entry) => entry !== optionValue)
      : [...current, optionValue];
    const ordered = options.map((option) => option.value).filter((value) => next.includes(value));
    onChange({ defaultValue: ordered });
  }

  function applyPaste(mode: 'replace' | 'append') {
    const existing = mode === 'append' ? options.map((option) => option.value) : [];
    const parsed = parseOptionsFromText(pasteText, existing);
    if (parsed.length === 0) return;
    setOptions(mode === 'append' ? [...options, ...parsed] : parsed);
    setPasteText('');
    setPasting(false);
  }

  function drop(targetIndex: number) {
    if (dragIndex === null) return;
    setOptions(reorder(options, dragIndex, targetIndex));
    setDragIndex(null);
  }

  return (
    <div data-testid={`catalog-field-options-${field.key}`} className="mt-5 rounded-2xl border border-border/40 bg-surface-container-low p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
            <Layers className="w-3.5 h-3.5" />
          </div>
          <div>
            <span className="text-sm font-bold text-on-surface">
              Opciones disponibles
            </span>
            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-surface-container text-on-surface-variant border border-border/50">
              {options.length === 0 ? '0 opciones' : `${options.length} en total`}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowPresets((current) => !current)}
            className="text-xs font-semibold text-on-surface-variant hover:text-on-surface px-2.5 py-1.5 rounded-lg border border-border/50 hover:bg-surface-container-high transition-colors flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Presets
          </button>
          <button
            type="button"
            onClick={() => {
              setPasting((current) => !current);
              setShowPresets(false);
            }}
            className="text-xs font-semibold text-on-surface-variant hover:text-on-surface px-2.5 py-1.5 rounded-lg border border-border/50 hover:bg-surface-container-high transition-colors flex items-center gap-1.5"
          >
            <ClipboardPaste className="w-3.5 h-3.5" /> Pegar lista
          </button>
          <button
            type="button"
            data-testid={`catalog-field-add-option-${field.key}`}
            onClick={addOption}
            className="text-xs font-bold text-primary hover:text-primary-foreground hover:bg-primary px-3 py-1.5 rounded-lg border border-primary/40 bg-primary/10 transition-all flex items-center gap-1.5 shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" /> Agregar opción
          </button>
        </div>
      </div>

      {showPresets && (
        <div className="mb-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 animate-in fade-in duration-150">
          <div className="flex items-center justify-between gap-3 mb-2">
            <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> Plantillas de opciones rápidas
            </span>
            <button
              type="button"
              onClick={() => setShowPresets(false)}
              className="text-on-surface-variant hover:text-on-surface"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {PRESETS.map((preset) => (
              <button
                key={preset.name}
                type="button"
                onClick={() => applyPreset(preset.options)}
                className="text-xs px-2.5 py-1.5 rounded-lg bg-surface-container hover:bg-primary/20 border border-border/60 hover:border-primary/50 text-on-surface transition-all font-medium"
              >
                {preset.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {pasting && (
        <div className="mb-4 rounded-xl border border-primary/30 bg-surface-container p-4 shadow-lg animate-in fade-in duration-150">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-on-surface">Pegado Masivo de Opciones</p>
              <p className="text-xs text-on-surface-variant leading-5 mt-0.5">
                Una opción por línea. Para fijar la clave técnica usa{' '}
                <span className="font-mono text-primary bg-primary/10 px-1 py-0.5 rounded">clave = Etiqueta</span>; si no, se deriva
                automáticamente de la etiqueta.
              </p>
            </div>
            <IconButton label="Cerrar" onClick={() => setPasting(false)}>
              <X className="w-4 h-4" />
            </IconButton>
          </div>
          <textarea
            data-testid={`catalog-field-paste-options-${field.key}`}
            value={pasteText}
            onChange={(event) => setPasteText(event.target.value)}
            rows={5}
            placeholder={'Alta\nMedia\nBaja\n\nó\n\nalta = Alta\nmedia = Media'}
            className="friendly-input mt-3 w-full font-mono text-xs bg-surface-container-low"
          />
          <div className="flex flex-wrap gap-2 mt-3">
            <button
              type="button"
              onClick={() => applyPaste('replace')}
              disabled={!pasteText.trim()}
              className="primary-button !px-3.5 !py-1.5 text-xs disabled:opacity-40"
            >
              <Wand2 className="w-3.5 h-3.5" /> Reemplazar las {options.length}
            </button>
            <button
              type="button"
              onClick={() => applyPaste('append')}
              disabled={!pasteText.trim()}
              className="secondary-button !px-3.5 !py-1.5 text-xs disabled:opacity-40"
            >
              <Plus className="w-3.5 h-3.5" /> Agregar al final
            </button>
          </div>
        </div>
      )}

      {duplicates.length > 0 && (
        <p className="mb-3 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          Hay claves repetidas ({duplicates.join(', ')}). Dos opciones con la misma clave se guardan
          como el mismo valor y no se pueden distinguir después.
        </p>
      )}

      {options.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 p-6 text-center text-xs text-on-surface-variant bg-surface-container/30">
          <Layers className="w-6 h-6 mx-auto mb-2 opacity-40 text-emerald-400" />
          <p className="font-semibold text-on-surface">Sin opciones configuradas</p>
          <p className="mt-1">Sin opciones, este campo se muestra vacío y no se puede completar.</p>
          <div className="mt-3 flex justify-center gap-2">
            <button
              type="button"
              onClick={addOption}
              className="text-xs px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/30 text-primary font-bold hover:bg-primary hover:text-primary-foreground transition-colors inline-flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Crear primera opción
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="hidden md:grid grid-cols-[28px_minmax(0,1fr)_minmax(0,180px)_36px_36px] gap-2 px-1">
            <span />
            <span className="text-[10px] font-black uppercase tracking-wider text-on-surface-variant">
              Etiqueta que ve la persona
            </span>
            <span className="text-[10px] font-black uppercase tracking-wider text-on-surface-variant">
              Clave guardada
            </span>
            <span className="text-[10px] font-black uppercase tracking-wider text-on-surface-variant text-center" title="Valor por defecto">
              Def.
            </span>
            <span />
          </div>
          {options.map((option, index) => (
            <div
              key={`${option.value}-${index}`}
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => drop(index)}
              onDragEnd={() => setDragIndex(null)}
              className={`grid grid-cols-[28px_minmax(0,1fr)_minmax(0,180px)_36px_36px] gap-2 items-center rounded-xl p-1 bg-surface-container hover:bg-surface-container-high transition-colors border border-border/40 ${
                dragIndex === index ? 'opacity-40 border-primary' : ''
              }`}
            >
              <span
                aria-hidden
                title="Arrastra para reordenar"
                className="flex justify-center text-on-surface-variant/60 hover:text-on-surface cursor-grab active:cursor-grabbing"
              >
                <GripVertical className="w-4 h-4" />
              </span>
              <input
                aria-label={`Etiqueta de la opción ${index + 1}`}
                value={option.label}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addOption();
                  }
                }}
                onChange={(event) => {
                  const label = event.target.value;
                  const derived = option.value === technicalKey(option.label);
                  updateOption(index, {
                    label,
                    ...(derived ? { value: technicalKey(label) || option.value } : {}),
                  });
                }}
                placeholder={`Opción ${index + 1}`}
                className="friendly-input bg-surface-container-low"
              />
              <input
                aria-label={`Clave de la opción ${index + 1}`}
                value={option.value}
                onChange={(event) => updateOption(index, { value: event.target.value })}
                placeholder="clave_interna"
                className={`friendly-input font-mono text-xs bg-surface-container-low ${
                  duplicates.includes(option.value) ? '!border-amber-500/60 !bg-amber-500/5' : ''
                }`}
              />
              <button
                type="button"
                aria-label={`Marcar «${option.label}» por defecto`}
                aria-pressed={chosen.has(option.value)}
                title={
                  chosen.has(option.value)
                    ? 'Quitar como valor por defecto'
                    : 'Usar como valor por defecto'
                }
                onClick={() => toggleDefault(option.value)}
                className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
                  chosen.has(option.value)
                    ? 'text-amber-300 bg-amber-500/20 shadow-sm border border-amber-500/40'
                    : 'text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface'
                }`}
              >
                <Star className={`w-4 h-4 ${chosen.has(option.value) ? 'fill-current' : ''}`} />
              </button>
              <IconButton label={`Eliminar la opción ${index + 1}`} danger onClick={() => removeOption(index)}>
                <Trash2 className="w-4 h-4" />
              </IconButton>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
