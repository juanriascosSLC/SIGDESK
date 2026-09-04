import { useState } from 'react';
import {
  AlignLeft,
  ArrowDown,
  ArrowUp,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  GitBranch,
  Globe,
  GripVertical,
  Hash,
  LayoutTemplate,
  Link2,
  ListChecks,
  ListFilter,
  Lock,
  Mail,
  Phone,
  ShieldCheck,
  Sparkles,
  ToggleLeft,
  Trash2,
  Type,
} from 'lucide-react';
import type {
  CatalogSpecification,
  FieldDefinition,
  FieldType,
} from '@/features/catalog/metamodel';
import { fieldTypeUsesOptions } from '@/features/catalog/metamodel';
import {
  bindsToOptions,
  fieldTypeGroups,
  fieldTypeLabel,
  fieldTypes,
  resourceTypeOptions,
  technicalKey,
} from '../config';
import { ConditionalRulesEditor } from '../ConditionalRulesEditor';
import { FriendlyField, IconButton } from '../ui';
import { FieldOptionsEditor } from './FieldOptionsEditor';
import { FieldPreview } from './FieldPreview';
import { FieldRulesEditor } from './FieldRulesEditor';
import {
  SURFACE_LABELS,
  fieldPlacementSurfaces,
  fieldRuleSummary,
  materializedSurfaces,
} from './field-operations';

const selectClasses = 'friendly-input bg-[#1d2026] text-[#e1e2eb]';

function getFieldTypeIcon(type: FieldType) {
  switch (type) {
    case 'text':
      return <Type className="w-4 h-4 text-cyan-400" />;
    case 'textarea':
      return <AlignLeft className="w-4 h-4 text-sky-400" />;
    case 'select':
      return <ListFilter className="w-4 h-4 text-emerald-400" />;
    case 'radio':
      return <CheckCircle2 className="w-4 h-4 text-teal-400" />;
    case 'multiselect':
      return <ListChecks className="w-4 h-4 text-green-400" />;
    case 'boolean':
      return <ToggleLeft className="w-4 h-4 text-amber-400" />;
    case 'number':
      return <Hash className="w-4 h-4 text-violet-400" />;
    case 'date':
      return <Calendar className="w-4 h-4 text-orange-400" />;
    case 'datetime':
      return <Clock className="w-4 h-4 text-amber-500" />;
    case 'email':
      return <Mail className="w-4 h-4 text-blue-400" />;
    case 'phone':
      return <Phone className="w-4 h-4 text-purple-400" />;
    case 'url':
      return <Globe className="w-4 h-4 text-rose-400" />;
    default:
      return <Type className="w-4 h-4 text-cyan-400" />;
  }
}

function getFieldTypeBadgeBg(type: FieldType) {
  switch (type) {
    case 'text':
    case 'textarea':
      return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30';
    case 'select':
    case 'radio':
    case 'multiselect':
      return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
    case 'boolean':
    case 'date':
    case 'datetime':
      return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
    case 'number':
      return 'bg-violet-500/10 text-violet-400 border-violet-500/30';
    case 'email':
    case 'phone':
    case 'url':
      return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
    default:
      return 'bg-surface-container text-on-surface-variant border-border/50';
  }
}

export function FieldCard({
  field,
  index,
  total,
  specification,
  expanded,
  draggable,
  guided,
  onToggle,
  onChange,
  onChangeType,
  onDuplicate,
  onRemove,
  onMove,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  dragging,
}: {
  field: FieldDefinition;
  index: number;
  total: number;
  specification: CatalogSpecification;
  expanded: boolean;
  draggable: boolean;
  guided: boolean;
  onToggle: () => void;
  onChange: (changes: Partial<FieldDefinition>) => void;
  onChangeType: (type: FieldType) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
  onDragStart: () => void;
  onDragOver: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
  dragging: boolean;
}) {
  const [copiedKey, setCopiedKey] = useState(false);
  const rules = fieldRuleSummary(field);
  const placedIn = fieldPlacementSurfaces(specification, field.key);
  const known = materializedSurfaces(specification);
  const missing = known.filter((surface) => !placedIn.includes(surface));

  const hasConditions = Boolean(field.visibleWhen || field.requiredWhen);

  function copyKey(event: React.MouseEvent) {
    event.stopPropagation();
    navigator.clipboard.writeText(field.key);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  }

  return (
    <div
      data-testid={`catalog-field-editor-${field.key}`}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={(event) => {
        if (!draggable) return;
        event.preventDefault();
        onDragOver();
      }}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={`rounded-2xl border transition-all duration-200 overflow-hidden ${
        expanded
          ? 'border-primary/50 bg-surface-container-low shadow-lg ring-1 ring-primary/20'
          : 'border-border/50 bg-surface-container hover:border-border hover:bg-surface-container-high'
      } ${dragging ? 'opacity-30 scale-[0.99]' : ''}`}
    >
      {/* Cabecera. Siempre visible, colapsada o no */}
      <div className="flex items-center gap-2 p-3 pl-2.5">
        <span
          aria-hidden
          title={draggable ? 'Drag to reorder' : 'Clear filter to reorder'}
          className={`shrink-0 p-1 rounded-lg transition-colors ${
            draggable
              ? 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest cursor-grab active:cursor-grabbing'
              : 'text-on-surface-variant/30 cursor-not-allowed'
          }`}
        >
          <GripVertical className="w-4 h-4" />
        </span>

        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-label={`${expanded ? 'Collapse' : 'Configure'} field ${field.label}`}
          className="flex flex-1 items-center gap-3 min-w-0 text-left rounded-xl px-2 py-1.5 hover:bg-surface-container-high transition-colors group"
        >
          <div className="flex items-center gap-2.5 shrink-0">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center border shadow-xs transition-transform group-hover:scale-105 ${getFieldTypeBadgeBg(field.type)}`}>
              {getFieldTypeIcon(field.type)}
            </div>
            {expanded ? (
              <ChevronDown className="w-4 h-4 shrink-0 text-primary transition-transform" />
            ) : (
              <ChevronRight className="w-4 h-4 shrink-0 text-on-surface-variant group-hover:text-on-surface transition-transform" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate font-bold text-on-surface text-sm">
                {field.label || <span className="text-on-surface-variant italic">Untitled field</span>}
              </span>
              <span
                onClick={copyKey}
                title="Copy technical key"
                className="inline-flex items-center gap-1 font-mono text-[10px] text-on-surface-variant/80 bg-surface-container px-2 py-0.5 rounded-md border border-border/40 hover:border-primary/40 hover:text-primary transition-colors cursor-pointer"
              >
                {copiedKey ? <Check className="w-3 h-3 text-emerald-400" /> : <Hash className="w-3 h-3 opacity-60" />}
                <span>{field.key}</span>
              </span>
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-on-surface-variant">
              <span className={`rounded-md px-1.5 py-0.5 font-bold border text-[10px] ${getFieldTypeBadgeBg(field.type)}`}>
                {fieldTypeLabel(field.type)}
              </span>

              {field.required && (
                <span className="inline-flex items-center gap-0.5 text-rose-400 font-semibold">
                  <ShieldCheck className="w-3 h-3" /> required
                </span>
              )}

              {field.readOnly && (
                <span className="inline-flex items-center gap-0.5 text-slate-400 font-medium">
                  <Lock className="w-3 h-3" /> read-only
                </span>
              )}

              {field.bindsTo && (
                <span className="inline-flex items-center gap-0.5 text-fuchsia-400 font-semibold">
                  <Link2 className="w-3 h-3" /> {field.bindsTo === 'assetId' ? 'CMDB asset' : field.bindsTo === 'siteAssetId' ? 'site' : field.bindsTo === 'agenteItId' ? 'IT agent' : 'bound'}
                </span>
              )}

              {hasConditions && (
                <span className="inline-flex items-center gap-0.5 text-violet-400 font-semibold">
                  <GitBranch className="w-3 h-3" /> conditional
                </span>
              )}

              {rules
                .filter((rule) => rule !== 'required' && rule !== 'read-only' && rule !== 'bound' && rule !== 'multiple devices' && rule !== 'conditionally visible' && rule !== 'conditionally required')
                .map((rule) => (
                  <span key={rule} className="text-on-surface-variant/80">· {rule}</span>
                ))}
            </div>
          </div>
        </button>

        <div className="flex shrink-0 items-center gap-0.5">
          <IconButton label="Move field up" disabled={index === 0 || !draggable} onClick={() => onMove(-1)}>
            <ArrowUp className="w-4 h-4" />
          </IconButton>
          <IconButton
            label="Move field down"
            disabled={index === total - 1 || !draggable}
            onClick={() => onMove(1)}
          >
            <ArrowDown className="w-4 h-4" />
          </IconButton>
          <IconButton label="Duplicate field" onClick={onDuplicate}>
            <Copy className="w-4 h-4" />
          </IconButton>
          <IconButton label="Delete field" disabled={total === 1} danger onClick={onRemove}>
            <Trash2 className="w-4 h-4" />
          </IconButton>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border/40 p-5 lg:p-6 space-y-5 bg-surface-container-low/50">
          {/* El input de Etiqueta va PRIMERO en el DOM del cuerpo a propósito:
              es el primer control que se toca al crear un campo. */}
          <div className="rounded-2xl border border-border/40 bg-surface-container-low p-4 shadow-xs">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
                <Sparkles className="w-3.5 h-3.5" />
              </div>
              <span className="text-sm font-bold text-on-surface">Field Identification</span>
            </div>

            <div className="grid lg:grid-cols-[minmax(0,1fr)_260px] gap-4">
              <FriendlyField label="Label">
                <input
                  value={field.label}
                  onChange={(event) => {
                    const label = event.target.value;
                    const previousGeneratedKey = technicalKey(field.label);
                    onChange({
                      label,
                      key: field.key === previousGeneratedKey ? technicalKey(label) : field.key,
                    });
                  }}
                  className="friendly-input text-base font-semibold"
                  placeholder="e.g. Ticket Priority"
                />
              </FriendlyField>

              <FriendlyField label="Response type">
                <select
                  data-testid={`catalog-field-type-${field.key}`}
                  value={field.type}
                  onChange={(event) => onChangeType(event.target.value as FieldType)}
                  className={selectClasses}
                  style={{ colorScheme: 'dark' }}
                >
                  {fieldTypeGroups.map((group) => (
                    <optgroup key={group} label={group} className="bg-[#191c22]">
                      {fieldTypes
                        .filter((type) => type.group === group)
                        .map((type) => (
                          <option key={type.value} value={type.value} className="bg-[#191c22] text-[#e1e2eb]">
                            {type.label}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
              </FriendlyField>
            </div>

            <div className="grid md:grid-cols-2 gap-4 mt-4">
              {field.type !== 'boolean' && !fieldTypeUsesOptions(field.type) && (
                <FriendlyField
                  label="Placeholder text"
                  help="Appears inside the field and disappears when typing."
                >
                  <input
                    value={field.placeholder ?? ''}
                    onChange={(event) => onChange({ placeholder: event.target.value || undefined })}
                    className="friendly-input bg-surface-container-low"
                    placeholder="e.g. Describe briefly…"
                  />
                </FriendlyField>
              )}
              <FriendlyField
                label="Help text"
                help="Remains visible below the field while filling."
              >
                <input
                  data-testid={`catalog-field-help-${field.key}`}
                  value={field.helpText ?? ''}
                  onChange={(event) => onChange({ helpText: event.target.value || undefined })}
                  className="friendly-input bg-surface-container-low"
                  placeholder="e.g. Enter device serial number."
                />
              </FriendlyField>
            </div>

            <DefaultValueField field={field} onChange={onChange} />
          </div>

          {/* Reglas y Validaciones */}
          <FieldRulesEditor field={field} onChange={onChange} />

          {/* Editor de Opciones para Select/Radio/Multiselect */}
          {fieldTypeUsesOptions(field.type) && (
            <FieldOptionsEditor
              field={field}
              defaultValue={field.defaultValue}
              onChange={onChange}
            />
          )}

          {/* Control separado de bindsTo */}
          <div className="rounded-2xl border border-fuchsia-500/20 bg-gradient-to-br from-fuchsia-500/5 via-surface-container-low to-surface-container-low p-4">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 rounded-lg bg-fuchsia-500/15 text-fuchsia-400 flex items-center justify-center">
                <Link2 className="w-3.5 h-3.5" />
              </div>
              <div>
                <span className="text-sm font-bold text-on-surface">Link to a live record</span>
                <p className="text-[11px] text-on-surface-variant">Connect this field with CMDB, Sites, or IT Agents database.</p>
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <FriendlyField
                label="Link to"
                help="Saves a real reference instead of a handwritten value."
              >
                <select
                  data-testid={`catalog-field-bindsto-${field.key}`}
                  value={field.bindsTo ?? ''}
                  onChange={(event) => {
                    const value = event.target.value as FieldDefinition['bindsTo'] | '';
                    const keepsAsset = value === 'assetId';
                    onChange({
                      bindsTo: value || undefined,
                      resourceType:
                        value === 'recursoId' || keepsAsset ? field.resourceType : undefined,
                      assetRole: keepsAsset ? field.assetRole || 'affected' : undefined,
                      multiple: keepsAsset ? field.multiple : undefined,
                      minItems: keepsAsset ? field.minItems : undefined,
                      maxItems: keepsAsset ? field.maxItems : undefined,
                    });
                  }}
                  className={`${selectClasses} bg-surface-container-low`}
                  style={{ colorScheme: 'dark' }}
                >
                  {bindsToOptions.map((option) => (
                    <option key={option.value || 'none'} value={option.value ?? ''} className="bg-[#191c22] text-[#e1e2eb]">
                      {option.label}
                    </option>
                  ))}
                </select>
              </FriendlyField>
              {(field.bindsTo === 'recursoId' || field.bindsTo === 'assetId') && (
                <FriendlyField label="Allowed asset type">
                  <select
                    value={field.resourceType ?? ''}
                    onChange={(event) =>
                      onChange({
                        resourceType: (event.target.value || undefined) as FieldDefinition['resourceType'],
                      })
                    }
                    className={`${selectClasses} bg-surface-container-low`}
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
              {field.bindsTo === 'assetId' && (
                <FriendlyField label="Asset role" help="Describes why it is linked to the record.">
                  <input
                    value={field.assetRole ?? 'affected'}
                    onChange={(event) => onChange({ assetRole: event.target.value || 'affected' })}
                    placeholder="affected"
                    className="friendly-input bg-surface-container-low"
                  />
                </FriendlyField>
              )}
              {field.bindsTo === 'assetId' && (
                <FriendlyField
                  label="Device count"
                  help="With multiple, users select 1 or more site devices in this field and pick the primary."
                >
                  <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border/40 bg-surface-container-low px-3 py-3 hover:bg-surface-container transition-colors">
                    <input
                      type="checkbox"
                      data-testid={`catalog-field-multiple-${field.key}`}
                      checked={field.multiple === true}
                      onChange={(event) =>
                        onChange(
                           event.target.checked
                            ? { multiple: true }
                            : { multiple: undefined, minItems: undefined, maxItems: undefined },
                        )
                      }
                      className="h-4 w-4 rounded text-primary focus:ring-primary"
                    />
                    <span className="text-sm font-bold text-on-surface">Allow multiple devices</span>
                  </label>
                </FriendlyField>
              )}
            </div>
          </div>

          {/* Reglas Condicionales */}
          <ConditionalRulesEditor
            field={field}
            fields={specification.fields}
            onChange={onChange}
          />

          {/* Superficies donde aparece */}
          <div className="rounded-2xl border border-border/40 bg-surface-container-low p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
                <LayoutTemplate className="w-3.5 h-3.5" />
              </div>
              <span className="text-sm font-bold text-on-surface">Where it appears</span>
            </div>
            {known.length === 0 ? (
              <p className="text-[11px] text-on-surface-variant leading-5">
                This definition does not have materialized pages yet. They are created when opening the
                template designer, and this field will receive its place there.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  {known.map((surface) => (
                    <span
                      key={surface}
                      data-testid={`catalog-field-surface-${field.key}-${surface}`}
                      className={`rounded-full border px-3 py-1 text-xs font-bold transition-colors ${
                        placedIn.includes(surface)
                          ? 'border-primary/50 bg-primary/15 text-primary shadow-xs'
                          : 'border-border/50 text-on-surface-variant/60 line-through bg-surface-container'
                      }`}
                    >
                      {SURFACE_LABELS[surface]}
                    </span>
                  ))}
                </div>
                <p className="mt-3 text-[11px] text-on-surface-variant leading-5">
                  Visibility is decided by placing or removing the field in the{' '}
                  <span className="font-bold text-on-surface">Template designer</span>, not here.
                  {missing.length > 0 && (
                    <>
                      {' '}
                      Currently does not appear in{' '}
                      {missing.map((surface) => SURFACE_LABELS[surface]).join(' or ')}.
                    </>
                  )}
                </p>
              </>
            )}
          </div>

          {/* Vista Previa */}
          <FieldPreview
            key={`${field.type}:${JSON.stringify(field.defaultValue ?? null)}`}
            field={field}
          />

          {/* Clave técnica editable */}
          {!guided && (
            <div className="pt-2 border-t border-border/30">
              <FriendlyField
                label="Internal identifier"
                help="The key under which the value is stored. Changing it does not rewrite existing records."
              >
                <div className="relative">
                  <input
                    data-testid={`catalog-field-key-${field.key}`}
                    value={field.key}
                    onChange={(event) => onChange({ key: technicalKey(event.target.value) })}
                    className="friendly-input font-mono text-xs bg-surface-container-low pr-20"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] uppercase font-bold text-on-surface-variant/60">
                    JSON Key
                  </span>
                </div>
              </FriendlyField>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * El valor con el que arranca el campo.
 */
function DefaultValueField({
  field,
  onChange,
}: {
  field: FieldDefinition;
  onChange: (changes: Partial<FieldDefinition>) => void;
}) {
  if (fieldTypeUsesOptions(field.type)) {
    return (
      <p className="mt-4 text-[11px] text-on-surface-variant">
        The default value is marked with the star in the options list.
      </p>
    );
  }

  if (field.type === 'boolean') {
    return (
      <div className="mt-4">
        <FriendlyField label="Checked by default">
          <select
            value={field.defaultValue === true ? 'true' : 'false'}
            onChange={(event) => onChange({ defaultValue: event.target.value === 'true' })}
            className={`${selectClasses} bg-surface-container-low`}
            style={{ colorScheme: 'dark' }}
          >
            <option value="false" className="bg-[#191c22] text-[#e1e2eb]">No</option>
            <option value="true" className="bg-[#191c22] text-[#e1e2eb]">Yes</option>
          </select>
        </FriendlyField>
      </div>
    );
  }

  const isNumber = field.type === 'number';
  return (
    <div className="mt-4 grid md:grid-cols-2 gap-4">
      <FriendlyField
        label="Default value"
        help="What the field starts with before anyone interacts with it."
      >
        <input
          data-testid={`catalog-field-default-${field.key}`}
          type={isNumber ? 'number' : field.type === 'date' ? 'date' : 'text'}
          value={field.defaultValue === undefined ? '' : String(field.defaultValue)}
          onChange={(event) => {
            const raw = event.target.value;
            if (raw === '') {
              onChange({ defaultValue: undefined });
              return;
            }
            onChange({ defaultValue: isNumber ? Number(raw) : raw });
          }}
          className={`friendly-input bg-surface-container-low ${field.type === 'date' ? selectClasses : ''}`}
          style={field.type === 'date' ? { colorScheme: 'dark' } : undefined}
          placeholder="e.g. Initial value"
        />
      </FriendlyField>
    </div>
  );
}
