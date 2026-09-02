import { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  Hash,
  ListChecks,
  ListFilter,
  Mail,
  Plus,
  Search,
  Server,
  Sparkles,
  ToggleLeft,
  Type,
  X,
} from 'lucide-react';
import type {
  CatalogSpecification,
  FieldDefinition,
  FieldType,
  LayoutDocument,
} from '@/features/catalog/metamodel';
import { fieldTypeUsesOptions } from '@/features/catalog/metamodel';
import {
  appendCatalogFieldRow,
  mapPageDefinition,
  pageHasCatalogField,
  resolveFormPageLayout,
  upgradeSpecificationToFormPages,
} from '@/features/catalog/runtime/form-page-normalizer';
import { upgradeSpecificationToPageLayout } from '@/features/catalog/runtime/page-layout-normalizer';
import { removeFieldEverywhere, renameFieldEverywhere } from './field-references';
import { SectionHeading } from './ui';
import { FieldCard } from './field-editor/FieldCard';
import {
  duplicateField,
  fieldForType,
  reorder,
  uniqueFieldKey,
} from './field-editor/field-operations';
import { technicalKey } from './config';

type CategoryFilter = 'all' | 'text' | 'options' | 'numbers_dates' | 'contact' | 'bindings' | 'conditional';

const QUICK_FIELD_TEMPLATES: Array<{
  label: string;
  type: FieldType;
  icon: typeof Type;
  color: string;
  options?: Array<{ label: string; value: string }>;
  bindsTo?: FieldDefinition['bindsTo'];
}> = [
  { label: 'Texto corto', type: 'text', icon: Type, color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20' },
  {
    label: 'Lista desplegable',
    type: 'select',
    icon: ListFilter,
    color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    options: [
      { label: 'Opción 1', value: 'opcion1' },
      { label: 'Opción 2', value: 'opcion2' },
    ],
  },
  { label: 'Fecha', type: 'date', icon: Calendar, color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  { label: 'Número', type: 'number', icon: Hash, color: 'text-violet-400 bg-violet-500/10 border-violet-500/20' },
  { label: 'Dispositivo del sitio', type: 'text', icon: Server, color: 'text-fuchsia-400 bg-fuchsia-500/10 border-fuchsia-500/20', bindsTo: 'assetId' },
  { label: 'Sí / No', type: 'boolean', icon: ToggleLeft, color: 'text-teal-400 bg-teal-500/10 border-teal-500/20' },
  { label: 'Correo', type: 'email', icon: Mail, color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
];

export function FieldsEditor({
  specification,
  updateSpecification,
  guided = false,
}: {
  specification: CatalogSpecification;
  updateSpecification: (updater: (current: CatalogSpecification) => CatalogSpecification) => void;
  guided?: boolean;
}) {
  // La clave técnica puede cambiar mientras se edita la etiqueta. La
  // tarjeta abierta depende de su índice, no de esa clave mutable.
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [showQuickMenu, setShowQuickMenu] = useState(false);

  const trimmedQuery = query.trim().toLowerCase();

  // Estadísticas del formulario
  const metrics = useMemo(() => {
    const total = specification.fields.length;
    const required = specification.fields.filter((f) => f.required).length;
    const withOptions = specification.fields.filter((f) => fieldTypeUsesOptions(f.type)).length;
    const bound = specification.fields.filter((f) => f.bindsTo).length;
    const conditional = specification.fields.filter((f) => f.visibleWhen || f.requiredWhen).length;
    return { total, required, withOptions, bound, conditional };
  }, [specification.fields]);

  const visible = useMemo(() => {
    return specification.fields
      .map((field, index) => ({ field, index }))
      .filter(({ field }) => {
        // Filtro por texto
        const matchesQuery =
          trimmedQuery === ''
            ? true
            : `${field.label} ${field.key} ${field.type}`.toLowerCase().includes(trimmedQuery);

        if (!matchesQuery) return false;

        // Filtro por categoría
        if (categoryFilter === 'text') return field.type === 'text' || field.type === 'textarea';
        if (categoryFilter === 'options') return fieldTypeUsesOptions(field.type);
        if (categoryFilter === 'numbers_dates') return field.type === 'number' || field.type === 'date' || field.type === 'datetime';
        if (categoryFilter === 'contact') return field.type === 'email' || field.type === 'phone' || field.type === 'url';
        if (categoryFilter === 'bindings') return Boolean(field.bindsTo);
        if (categoryFilter === 'conditional') return Boolean(field.visibleWhen || field.requiredWhen);

        return true;
      });
  }, [specification.fields, trimmedQuery, categoryFilter]);

  const canReorder = trimmedQuery === '' && categoryFilter === 'all';

  // `bindsTo` has a runtime invariant: the value must be collectable while
  // creating the record. A field may have been created before the page
  // designer existed, or removed from it and later turned into a binding, so
  // adding the binding must repair the placement instead of asking the admin
  // to discover a backend-only validation error at publish time.
  function ensureCreatePlacement(
    specification: CatalogSpecification,
    key: string,
  ): CatalogSpecification {
    const next = specification.createPage || specification.layouts?.create
      ? specification
      : upgradeSpecificationToFormPages(specification);

    next.views = next.views ?? {};
    next.views.create = [...new Set([...(next.views.create ?? []), key])];

    const appendToLegacyDocument = (document: LayoutDocument) => {
      const alreadyPlaced = document.sections.some((section) =>
        section.placements.some(
          (placement) => placement.kind === 'field' && placement.source === 'catalog' && placement.fieldKey === key,
        ),
      );
      if (alreadyPlaced) return;
      const placement = {
        id: `placement-create-${key}`,
        kind: 'field' as const,
        source: 'catalog' as const,
        fieldKey: key,
        columnSpan: 1 as const,
      };
      const section = document.sections[0];
      if (section) section.placements.push(placement);
      else document.sections.push({ id: 'section-create-main', columns: 1, placements: [placement] });
    };

    if (next.layouts?.create) {
      appendToLegacyDocument(next.layouts.create.default);
      next.layouts.create.variants?.forEach((variant) => appendToLegacyDocument(variant.document));
    }
    if (next.createPage) {
      next.createPage = mapPageDefinition(next.createPage, (page) => appendCatalogFieldRow(page, key));
    }
    return next;
  }

  // Inventory devices are always scoped by a site. Reuse the existing
  // `assetId` ("Dispositivo del sitio") binding, but make its prerequisite
  // explicit so the API never receives an impossible definition.
  function ensureSiteAssetBinding(current: CatalogSpecification): CatalogSpecification {
    if (current.fields.some((field) => field.bindsTo === 'siteAssetId')) return current;

    const siteKey = uniqueFieldKey(
      current.fields.map((field) => field.key),
      'siteAfectado',
    );
    const firstDevice = current.fields.findIndex((field) => field.bindsTo === 'assetId');
    const siteField: FieldDefinition = {
      key: siteKey,
      label: 'Sitio afectado',
      type: 'text',
      required: false,
      bindsTo: 'siteAssetId',
    };
    // Keep the logical field order intuitive even when repairing an old draft.
    current.fields.splice(firstDevice < 0 ? current.fields.length : firstDevice, 0, siteField);
    placeNewField(current, siteKey);
    return current;
  }

  // Also repair drafts authored before this guard existed. Without this, a
  // field that is already `bindsTo` would require the admin to toggle its
  // selector off and on again before the definition could be published.
  useEffect(() => {
    const needsSite =
      specification.fields.some((field) => field.bindsTo === 'assetId') &&
      !specification.fields.some((field) => field.bindsTo === 'siteAssetId');
    const missing = specification.fields.filter(
      (field) =>
        field.bindsTo &&
        !(['agent', 'requester', 'supervisor'] as const).some((audience) =>
          pageHasCatalogField(resolveFormPageLayout(specification, 'create', audience), field.key),
        ),
    );
    if (!needsSite && missing.length === 0) return;
    updateSpecification((current) => {
      const withSite = needsSite ? ensureSiteAssetBinding(current) : current;
      return missing.reduce((next, field) => ensureCreatePlacement(next, field.key), withSite);
    });
  }, [specification, updateSpecification]);

  function updateField(index: number, changes: Partial<FieldDefinition>) {
    updateSpecification((current) => {
      const previous = current.fields[index];
      const next = { ...previous, ...changes };
      current.fields[index] = next;
      if (changes.key && changes.key !== previous.key) {
        const others = current.fields.filter((_, position) => position !== index).map((field) => field.key);
        const safeKey = uniqueFieldKey(others, changes.key);
        next.key = safeKey;
        renameFieldEverywhere(current, previous.key, safeKey);
      }
      const withDependencies = next.bindsTo === 'assetId'
        ? ensureSiteAssetBinding(current)
        : current;
      const withCreatePlacement = next.bindsTo
        ? ensureCreatePlacement(withDependencies, next.key)
        : current;
      if (next.bindsTo) {
        if (withCreatePlacement.layouts?.edit) {
          const markReadOnly = (document: { sections: { placements: { fieldKey?: string; readOnly?: boolean }[] }[] }) => {
            for (const section of document.sections) {
              for (const placement of section.placements) {
                if (placement.fieldKey === next.key) placement.readOnly = true;
              }
            }
          };
          markReadOnly(withCreatePlacement.layouts.edit.default);
          withCreatePlacement.layouts.edit.variants?.forEach((variant) => markReadOnly(variant.document));
        }
        if (withCreatePlacement.editPage) {
          withCreatePlacement.editPage = mapPageDefinition(withCreatePlacement.editPage, (page) => ({
            ...page,
            main: {
              ...page.main,
              placements: page.main.placements.map((placement) =>
                placement.fieldKey === next.key ? { ...placement, readOnly: true } : placement,
              ),
            },
          }));
        }
      }
      return withCreatePlacement;
    });
  }

  function placeNewField(current: CatalogSpecification, key: string) {
    current.views = current.views ?? {};
    current.views.create = [...new Set([...(current.views.create ?? []), key])];
    if (current.layouts?.create) {
      const section = current.layouts.create.default.sections[0];
      const placement = {
        id: `placement-create-${key}`,
        kind: 'field' as const,
        source: 'catalog' as const,
        fieldKey: key,
        columnSpan: 1 as const,
      };
      if (section) {
        section.placements.push(placement);
      } else {
        current.layouts.create.default.sections.push({
          id: 'section-create-main',
          columns: 1,
          placements: [placement],
        });
      }
    }
    if (current.createPage) {
      current.createPage = mapPageDefinition(current.createPage, (page) => appendCatalogFieldRow(page, key));
    }
    if (current.editPage) {
      current.editPage = mapPageDefinition(current.editPage, (page) => appendCatalogFieldRow(page, key));
    }
    const detailReady = upgradeSpecificationToPageLayout(current);
    current.detailPage = mapPageDefinition(detailReady.detailPage!, (page) =>
      appendCatalogFieldRow(page, key),
    );
    if (current.detailLayout) {
      const alreadyPlaced = current.detailLayout.fields.some(
        (placement) => placement.source === 'catalog' && placement.fieldKey === key,
      );
      if (!alreadyPlaced) {
        current.detailLayout.fields.push({ source: 'catalog', fieldKey: key, width: 'full' });
      }
    }
  }

  function addField(
    type: FieldType = 'text',
    labelPreset?: string,
    optionsPreset?: Array<{ label: string; value: string }>,
    bindsToPreset?: FieldDefinition['bindsTo'],
  ) {
    const label = labelPreset ?? `Nuevo campo ${specification.fields.length + 1}`;
    const key = uniqueFieldKey(
      specification.fields.map((field) => field.key),
      labelPreset ? technicalKey(labelPreset) : `field${specification.fields.length + 1}`,
    );
    updateSpecification((current) => {
      if (bindsToPreset === 'assetId') ensureSiteAssetBinding(current);
      const newField: FieldDefinition = {
        key,
        label,
        type,
        required: false,
        ...(optionsPreset ? { options: optionsPreset } : {}),
        ...(bindsToPreset ? { bindsTo: bindsToPreset } : {}),
      };
      current.fields.push(newField);
      placeNewField(current, key);
      return current;
    });
    setExpandedIndex(specification.fields.length);
    setQuery('');
    setCategoryFilter('all');
    setShowQuickMenu(false);
  }

  function duplicate(index: number) {
    const source = specification.fields[index];
    const copy = duplicateField(
      source,
      specification.fields.map((field) => field.key),
    );
    updateSpecification((current) => {
      current.fields.splice(index + 1, 0, copy);
      placeNewField(current, copy.key);
      return current;
    });
    setExpandedIndex(index + 1);
    setQuery('');
  }

  function removeField(index: number) {
    const removedKey = specification.fields[index].key;
    updateSpecification((current) => {
      current.fields.splice(index, 1);
      removeFieldEverywhere(current, removedKey);
      return current;
    });
    setExpandedIndex((current) => {
      if (current === null) return null;
      if (current === index) return null;
      return current > index ? current - 1 : current;
    });
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= specification.fields.length) return;
    updateSpecification((current) => {
      current.fields = reorder(current.fields, from, to);
      return current;
    });
  }

  function changeType(index: number, type: FieldType) {
    updateSpecification((current) => {
      current.fields[index] = fieldForType(current.fields[index], type);
      return current;
    });
  }

  return (
    <section className="panel-card p-6 lg:p-8 space-y-6">
      {/* Cabecera Principal */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <SectionHeading
          icon={<ListChecks className="w-5 h-5" />}
          title="Campos y presentación"
          description="Define la estructura, tipos de datos y reglas que las personas deben completar."
        />

        <div className="flex items-center gap-2 relative">
          <button
            data-testid="catalog-add-field"
            onClick={() => addField('text')}
            className="primary-button shadow-md"
          >
            <Plus className="w-4 h-4" /> Agregar campo
          </button>
          <button
            type="button"
            title="Crear tipo específico"
            onClick={() => setShowQuickMenu((prev) => !prev)}
            className="rounded-xl border border-primary/40 bg-primary/10 hover:bg-primary/20 text-primary p-2.5 transition-colors"
          >
            <ChevronDown className="w-4 h-4" />
          </button>

          {showQuickMenu && (
            <div className="absolute right-0 top-full mt-2 w-64 rounded-2xl border border-border/60 bg-surface-container shadow-2xl p-2 z-30 animate-in fade-in zoom-in-95 duration-150">
              <div className="px-3 py-2 text-[10px] font-black uppercase tracking-wider text-on-surface-variant flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-amber-400" /> Crear tipo predefinido
              </div>
              <div className="space-y-1">
                {QUICK_FIELD_TEMPLATES.map((tmpl) => {
                  const Icon = tmpl.icon;
                  return (
                    <button
                      key={tmpl.label}
                      type="button"
                      onClick={() => addField(tmpl.type, tmpl.label, tmpl.options, tmpl.bindsTo)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-xs font-medium hover:bg-surface-container-high text-on-surface transition-colors"
                    >
                      <span className={`w-6 h-6 rounded-lg flex items-center justify-center border ${tmpl.color}`}>
                        <Icon className="w-3.5 h-3.5" />
                      </span>
                      <span>{tmpl.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* KPI Cards / Métricas del Formulario */}
      {specification.fields.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-1">
          <div className="rounded-xl border border-border/40 bg-surface-container/50 p-2.5 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center font-bold text-xs border border-cyan-500/20 shrink-0">
              {metrics.total}
            </div>
            <div className="min-w-0">
              <span className="text-[10px] uppercase tracking-wider font-bold text-on-surface-variant block">Total</span>
              <span className="text-xs font-bold text-on-surface truncate block">Campos</span>
            </div>
          </div>

          <div className="rounded-xl border border-border/40 bg-surface-container/50 p-2.5 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-400 flex items-center justify-center font-bold text-xs border border-rose-500/20 shrink-0">
              {metrics.required}
            </div>
            <div className="min-w-0">
              <span className="text-[10px] uppercase tracking-wider font-bold text-on-surface-variant block">Obligatorios</span>
              <span className="text-xs font-bold text-on-surface truncate block">Requeridos</span>
            </div>
          </div>

          <div className="rounded-xl border border-border/40 bg-surface-container/50 p-2.5 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold text-xs border border-emerald-500/20 shrink-0">
              {metrics.withOptions}
            </div>
            <div className="min-w-0">
              <span className="text-[10px] uppercase tracking-wider font-bold text-on-surface-variant block">Opciones</span>
              <span className="text-xs font-bold text-on-surface truncate block">Listas / Select</span>
            </div>
          </div>

          <div className="rounded-xl border border-border/40 bg-surface-container/50 p-2.5 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-fuchsia-500/10 text-fuchsia-400 flex items-center justify-center font-bold text-xs border border-fuchsia-500/20 shrink-0">
              {metrics.bound}
            </div>
            <div className="min-w-0">
              <span className="text-[10px] uppercase tracking-wider font-bold text-on-surface-variant block">CMDB</span>
              <span className="text-xs font-bold text-on-surface truncate block">Activos / Sitios</span>
            </div>
          </div>

          <div className="col-span-2 sm:col-span-1 rounded-xl border border-border/40 bg-surface-container/50 p-2.5 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-violet-500/10 text-violet-400 flex items-center justify-center font-bold text-xs border border-violet-500/20 shrink-0">
              {metrics.conditional}
            </div>
            <div className="min-w-0">
              <span className="text-[10px] uppercase tracking-wider font-bold text-on-surface-variant block">Lógica</span>
              <span className="text-xs font-bold text-on-surface truncate block">Condicionales</span>
            </div>
          </div>
        </div>
      )}

      {/* Barra de Filtros y Búsqueda */}
      <div className="space-y-3 pt-2">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
            <input
              data-testid="catalog-field-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Buscar entre ${specification.fields.length} campos (nombre, clave, tipo)…`}
              aria-label="Buscar campos"
              className="friendly-input w-full !pl-10 pr-9 bg-surface-container-low"
            />
            {query && (
              <button
                type="button"
                aria-label="Limpiar la búsqueda"
                onClick={() => setQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (expandedIndex !== null) {
                  setExpandedIndex(null);
                } else if (specification.fields.length > 0) {
                  setExpandedIndex(0);
                }
              }}
              className="secondary-button !px-3 !py-2 text-xs"
              title={expandedIndex !== null ? 'Colapsar tarjeta activa' : 'Expandir primer campo'}
            >
              {expandedIndex !== null ? (
                <>
                  <ChevronsDownUp className="w-3.5 h-3.5" /> Colapsar
                </>
              ) : (
                <>
                  <ChevronsUpDown className="w-3.5 h-3.5" /> Expandir
                </>
              )}
            </button>
          </div>
        </div>

        {/* Pestañas de Categoría */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setCategoryFilter('all')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                categoryFilter === 'all'
                  ? 'bg-primary/20 text-primary border border-primary/40'
                  : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
              }`}
            >
              Todos ({specification.fields.length})
            </button>
            <button
              type="button"
              onClick={() => setCategoryFilter('text')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                categoryFilter === 'text'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
              }`}
            >
              Texto
            </button>
            <button
              type="button"
              onClick={() => setCategoryFilter('options')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                categoryFilter === 'options'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
              }`}
            >
              Opciones
            </button>
            <button
              type="button"
              onClick={() => setCategoryFilter('numbers_dates')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                categoryFilter === 'numbers_dates'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
              }`}
            >
              Números y Fechas
            </button>
            <button
              type="button"
              onClick={() => setCategoryFilter('contact')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                categoryFilter === 'contact'
                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                  : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
              }`}
            >
              Contacto
            </button>
            <button
              type="button"
              onClick={() => setCategoryFilter('bindings')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                categoryFilter === 'bindings'
                  ? 'bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/40'
                  : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
              }`}
            >
              CMDB
            </button>
            <button
              type="button"
              onClick={() => setCategoryFilter('conditional')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                categoryFilter === 'conditional'
                  ? 'bg-violet-500/20 text-violet-300 border border-violet-500/40'
                  : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
              }`}
            >
              Condicionales
            </button>
          </div>

          <span className="text-xs text-on-surface-variant">
            {trimmedQuery
              ? `${visible.length} de ${specification.fields.length} · el orden no se puede cambiar mientras filtras`
              : categoryFilter !== 'all'
                ? `Mostrando ${visible.length} de ${specification.fields.length}`
                : 'Arrastra por el asa para reordenar'}
          </span>
        </div>
      </div>

      {/* Lista de Campos */}
      <div className="space-y-2.5 mt-2">
        {specification.fields.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/60 p-10 text-center bg-surface-container/20">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-3">
              <Sparkles className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-on-surface">Formulario sin campos</h3>
            <p className="text-xs text-on-surface-variant max-w-md mx-auto mt-1 mb-5">
              Empieza agregando los campos que los solicitantes o técnicos deben completar para este ticket.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {QUICK_FIELD_TEMPLATES.slice(0, 4).map((tmpl) => {
                const Icon = tmpl.icon;
                return (
                  <button
                    key={tmpl.label}
                    type="button"
                    onClick={() => addField(tmpl.type, tmpl.label, tmpl.options, tmpl.bindsTo)}
                    className="secondary-button !py-2 !px-3 text-xs"
                  >
                    <Icon className="w-3.5 h-3.5 text-primary" /> + {tmpl.label}
                  </button>
                );
              })}
            </div>
          </div>
        ) : visible.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/60 p-8 text-center bg-surface-container/20">
            <p className="text-sm text-on-surface-variant">
              Ningún campo coincide con «{query}».
            </p>
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setCategoryFilter('all');
              }}
              className="mt-3 text-xs font-semibold text-primary hover:underline"
            >
              Restablecer filtros de búsqueda
            </button>
          </div>
        ) : (
          visible.map(({ field, index }) => (
            <FieldCard
              // La clave tÃ©cnica puede cambiar mientras se escribe la
              // etiqueta. Usarla aquÃ­ desmonta la tarjeta en cada tecla,
              // haciendo que el input pierda el foco y que el navegador
              // recalcule el scroll del contenedor. El Ã­ndice es estable
              // durante la ediciÃ³n; las operaciones de reordenamiento siguen
              // actualizando la lista desde el padre.
              key={index}
              field={field}
              index={index}
              total={specification.fields.length}
              specification={specification}
              expanded={expandedIndex === index}
              draggable={canReorder}
              guided={guided}
              dragging={dragFrom === index}
              onToggle={() => setExpandedIndex((current) => (current === index ? null : index))}
              onChange={(changes) => updateField(index, changes)}
              onChangeType={(type) => changeType(index, type)}
              onDuplicate={() => duplicate(index)}
              onRemove={() => removeField(index)}
              onMove={(direction) => move(index, index + direction)}
              onDragStart={() => setDragFrom(index)}
              onDragOver={() => undefined}
              onDrop={() => {
                if (dragFrom !== null) move(dragFrom, index);
                setDragFrom(null);
              }}
              onDragEnd={() => setDragFrom(null)}
            />
          ))
        )}
      </div>
    </section>
  );
}
