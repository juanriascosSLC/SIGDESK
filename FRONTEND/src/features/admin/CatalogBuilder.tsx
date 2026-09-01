import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  History,
  LoaderCircle,
  Plus,
  RefreshCw,
  Rocket,
  Save,
  Settings2,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  createDefinitionDraft,
  discardDefinitionDraft,
  emptyDefinition,
  listDefinitions,
  publishDefinition,
  updateDefinitionDraft,
  validateDefinition,
  type AudienceKey,
  type CatalogDefinition,
  type CatalogSpecification,
  type FieldDefinition,
} from '@/features/catalog/metamodel';
import { ApiError } from '@/lib/apiClient';
import {
  guidedSteps,
  sectionItems,
  statusClasses,
  statusLabel,
  type Section,
} from './catalog-builder/config';
import {
  pageHasCatalogField,
  resolveFormPageLayout,
} from '@/features/catalog/runtime/form-page-normalizer';
import { useUnsavedChangesGuard } from './catalog-builder/useUnsavedChangesGuard';
import { GeneralEditor } from './catalog-builder/GeneralEditor';
import { FieldsEditor } from './catalog-builder/FieldsEditor';
import { TemplateDesigner } from './catalog-builder/template-designer/TemplateDesigner';
import { RelationsEditor, WorkflowEditor } from './catalog-builder/BehaviorEditors';
import { ResourcesEditor } from './catalog-builder/ResourcesEditor';
import {
  AdvancedEditor,
  GuidedProgress,
  ReviewEditor,
} from './catalog-builder/ReviewEditors';

// A `bindsTo` field must be collectable on the create form, in at least one
// audience: it is where the requester supplies the resource / IT agent the
// record binds to (ADR-0026). Checked against the page the form actually
// renders — and against the audience variants too, since one is enough.
function bindingFieldsMissingFromCreateForm(
  specification: CatalogSpecification | undefined,
): FieldDefinition[] {
  if (!specification) return [];
  const bindingFields = specification.fields.filter((field) => field.bindsTo);
  if (bindingFields.length === 0) return [];
  const audiences: AudienceKey[] = ['agent', 'requester', 'supervisor'];
  const pages = audiences.map((audience) =>
    resolveFormPageLayout(specification, 'create', audience),
  );
  return bindingFields.filter(
    (field) => !pages.some((page) => pageHasCatalogField(page, field.key)),
  );
}

export default function CatalogBuilder() {
  const queryClient = useQueryClient();
  const definitionsQuery = useQuery({
    queryKey: ['catalog-definitions'],
    queryFn: () => listDefinitions(false),
  });
  const [selected, setSelected] = useState<CatalogDefinition>(emptyDefinition);
  const [activeSection, setActiveSection] = useState<Section>('general');
  const [advancedText, setAdvancedText] = useState('');
  const [editorError, setEditorError] = useState('');
  const [notice, setNotice] = useState('');
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [guidedMode, setGuidedMode] = useState(false);
  const [openHistoryKey, setOpenHistoryKey] = useState<string | null>(null);
  const [hasLocalChanges, setHasLocalChanges] = useState(false);

  const definitions = useMemo(() => definitionsQuery.data ?? [], [definitionsQuery.data]);
  const grouped = useMemo(() => {
    const groups = new Map<string, CatalogDefinition[]>();
    definitions.forEach((definition) => {
      groups.set(definition.entityKey, [...(groups.get(definition.entityKey) ?? []), definition]);
    });
    return [...groups.entries()].map(([entityKey, entries]) => {
      const versions = [...entries].sort(
        (left, right) => (right.version ?? 0) - (left.version ?? 0),
      );
      const draft = versions.find((definition) => definition.status === 'draft');
      const published = versions.find((definition) => definition.status === 'published');
      return {
        entityKey,
        versions,
        draft,
        published,
        active: draft ?? published ?? versions[0]!,
      };
    });
  }, [definitions]);

  useEffect(() => {
    if (
      !definitionsQuery.isSuccess ||
      grouped.length === 0 ||
      selected.id ||
      isCreatingNew
    ) return;
    const initial = grouped[0].active;
    // The query result is external state. Defer the one-time editor
    // initialization so this effect does not synchronously start a second
    // render cascade while React is flushing effects.
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setSelected(structuredClone(initial));
      setHasLocalChanges(false);
      setIsCreatingNew(false);
      setGuidedMode(false);
      setAdvancedText(JSON.stringify(initial.specification, null, 2));
      setEditorError('');
      setNotice('');
    });
    return () => {
      cancelled = true;
    };
  }, [definitionsQuery.isSuccess, grouped, selected.id, isCreatingNew]);

  useUnsavedChangesGuard(
    hasLocalChanges,
    'Tienes cambios sin guardar en esta entidad. Si sales ahora se perderán.',
  );

  const saveMutation = useMutation({
    // Guardar edita EL borrador abierto de la entidad; solo crea una versión
    // nueva cuando no hay ninguno (porque la anterior ya se publicó).
    //
    // Antes cada pulsación llamaba a `createDefinitionDraft` y abría una
    // versión: una sesión de trabajo normal dejaba una decena de versiones,
    // ninguna descartable, y la definición de INC de este entorno ya iba por
    // la cuarta sólo por guardados. Un borrador es trabajo en curso; una
    // versión es un hecho publicado.
    //
    // Este método ya no espeja nada hacia `/catalog/layouts/*`: esa familia de
    // rutas no existe en el backend, y el diseño viaja dentro de
    // `specification.detailPage`, que el backend proyecta bajo
    // `layouts.detailPage` en `resolved-definition` (ver TicketDetail.tsx).
    mutationFn: (definition: CatalogDefinition) =>
      definition.status === 'draft' && definition.updatedAt
        ? updateDefinitionDraft(definition)
        : createDefinitionDraft(definition),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ['catalog-definitions'] });
      setSelected(structuredClone(created));
      setHasLocalChanges(false);
      setAdvancedText(JSON.stringify(created.specification, null, 2));
      setIsCreatingNew(false);
      setActiveSection('review');
      setNotice(
        `Borrador v${created.version} guardado. Los usuarios siguen usando la versión publicada.`,
      );
    },
  });

  // Descartar el borrador: la contraparte de poder editarlo. Archiva la fila
  // (no la borra: los tickets históricos referencian la definición con la que
  // se crearon) y devuelve la entidad a su versión publicada.
  const discardMutation = useMutation({
    mutationFn: ({ entityKey, updatedAt }: { entityKey: string; updatedAt: string }) =>
      discardDefinitionDraft(entityKey, updatedAt),
    onSuccess: async (_, variables) => {
      const refreshed = await queryClient.fetchQuery({
        queryKey: ['catalog-definitions'],
        queryFn: () => listDefinitions(false),
      });
      const published = refreshed
        .filter((definition) => definition.entityKey === variables.entityKey && definition.status === 'published')
        .sort((left, right) => (right.version ?? 0) - (left.version ?? 0))[0];
      if (published) selectDefinition(published, true);
      setHasLocalChanges(false);
      setNotice('Borrador descartado. La entidad vuelve a su versión publicada.');
    },
  });

  const publishMutation = useMutation({
    mutationFn: async ({ entityKey, version }: { entityKey: string; version: number }) => {
      const invalidField = selected?.specification.fields.find(
        (field) => !field.key.trim() || !field.label.trim(),
      );
      if (invalidField) {
        throw new Error(
          `El campo «${invalidField.label || invalidField.key || 'sin nombre'}» necesita nombre y clave técnica antes de publicar.`,
        );
      }
      const fieldKeys = selected?.specification.fields.map((field) => field.key.trim()) ?? [];
      if (new Set(fieldKeys).size !== fieldKeys.length) {
        throw new Error('Hay claves técnicas de campo repetidas. Cada campo debe tener una clave única.');
      }
      // Caught here rather than left to the backend on purpose. tickets_service
      // does reject this (ErrDefinicionConCampoSinPlacement → 422), but it
      // answers with Go sentinels joined by "; " naming `layouts.create` — a
      // key the admin never sees. The rule itself is real: a field bound to a
      // resource or IT agent that the create form does not collect leaves the
      // record with nothing to bind, and POST /entities fails later with
      // ErrRecursoIDVacio.
      const unplaced = bindingFieldsMissingFromCreateForm(selected?.specification);
      if (unplaced.length > 0) {
        throw new Error(
          `Estos campos están vinculados a un recurso o agente IT pero no aparecen en el formulario de creación: ${unplaced
            .map((field) => `«${field.label || field.key}»`)
            .join(', ')}. Agrégalos en Diseño visual → Crear antes de publicar.`,
        );
      }
      const validation = await validateDefinition(entityKey, version);
      if (!validation.valid) {
        throw new Error(
          validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n'),
        );
      }
      return publishDefinition(entityKey, version);
    },
    onSuccess: async (published) => {
      await queryClient.invalidateQueries({ queryKey: ['catalog-definitions'] });
      await queryClient.invalidateQueries({ queryKey: ['published-definitions'] });
      selectDefinition(published, true);
      setGuidedMode(false);
      setNotice(`${published.entityKey} ya tiene los cambios publicados.`);
    },
  });

  function selectDefinition(definition: CatalogDefinition, force = false): boolean {
    if (
      !force && hasLocalChanges &&
      !window.confirm('Tienes cambios sin guardar. Si cambias de entidad o versión se perderán. ¿Continuar?')
    ) {
      return false;
    }
    setSelected(structuredClone(definition));
    setHasLocalChanges(false);
    setIsCreatingNew(false);
    setGuidedMode(false);
    setAdvancedText(JSON.stringify(definition.specification, null, 2));
    setEditorError('');
    setNotice('');
    return true;
  }

  function startNew() {
    if (
      hasLocalChanges &&
      !window.confirm('Tienes cambios sin guardar. Si creas otra entidad se perderán. ¿Continuar?')
    ) {
      return;
    }
    const definition = emptyDefinition();
    setSelected(definition);
    setHasLocalChanges(true);
    setAdvancedText(JSON.stringify(definition.specification, null, 2));
    setIsCreatingNew(true);
    setGuidedMode(true);
    setEditorError('');
    setNotice('');
    setActiveSection('general');
  }

  function updateSpecification(updater: (current: CatalogSpecification) => CatalogSpecification) {
    setSelected((current) => ({
      ...current,
      specification: updater(structuredClone(current.specification)),
    }));
    setHasLocalChanges(true);
    setNotice('');
  }

  const setSelectedWithChanges: React.Dispatch<React.SetStateAction<CatalogDefinition>> = (
    action,
  ) => {
    setSelected(action);
    setHasLocalChanges(true);
    setNotice('');
  };

  function saveDraft() {
    setEditorError('');
    if (!selected.entityKey.trim() || !selected.name.trim()) {
      setEditorError('Completa el código y el nombre de la entidad.');
      setActiveSection('general');
      return;
    }
    if (selected.specification.fields.length === 0) {
      setEditorError('Agrega al menos un campo.');
      setActiveSection('fields');
      return;
    }
    const invalidSelect = selected.specification.fields.find(
      (field) => field.type === 'select' && !field.options?.length,
    );
    if (invalidSelect) {
      setEditorError(`Agrega opciones al campo “${invalidSelect.label}”.`);
      setActiveSection('fields');
      return;
    }
    if (
      selected.specification.lifecycle.states.filter((state) => state.initial).length !== 1
    ) {
      setEditorError('Selecciona exactamente un estado inicial.');
      setActiveSection('workflow');
      return;
    }
    if (selected.specification.bindings?.some((binding) => !binding.resourceId.trim())) {
      setEditorError('Completa o elimina los recursos que no tienen identificador.');
      setActiveSection('resources');
      return;
    }
    if (
      selected.specification.relations?.some(
        (relation) =>
          !relation.key.trim() ||
          !relation.label.trim() ||
          !relation.targetEntityKey.trim() ||
          !relation.inverseKey.trim() ||
          !relation.inverseLabel.trim(),
      )
    ) {
      setEditorError('Completa o elimina las relaciones que no tengan contrato completo.');
      setActiveSection('relations');
      return;
    }
    saveMutation.mutate({
      ...selected,
      entityKey: selected.entityKey.toUpperCase().trim(),
      name: selected.name.trim(),
    });
  }

  function openSection(section: Section) {
    if (section === 'advanced') {
      setAdvancedText(JSON.stringify(selected.specification, null, 2));
    }
    setActiveSection(section);
    setEditorError('');
  }

  function validateCurrentStep() {
    if (activeSection === 'general' && (!selected.name.trim() || !selected.entityKey.trim())) {
      return 'Escribe el nombre de la entidad para continuar.';
    }
    if (activeSection === 'fields' && specification.fields.length === 0) {
      return 'Agrega al menos un dato que deba capturar esta entidad.';
    }
    if (
      activeSection === 'fields' &&
      specification.fields.some((field) => !field.key.trim() || !field.label.trim())
    ) {
      return 'Todos los campos necesitan un nombre visible y una clave técnica.';
    }
    if (
      activeSection === 'fields' &&
      new Set(specification.fields.map((field) => field.key.trim())).size !== specification.fields.length
    ) {
      return 'Cada campo debe tener una clave técnica única.';
    }
    if (
      activeSection === 'workflow' &&
      specification.lifecycle.states.filter((state) => state.initial).length !== 1
    ) {
      return 'Selecciona exactamente un estado inicial.';
    }
    return '';
  }

  function goToGuidedStep(direction: -1 | 1) {
    const currentIndex = guidedSteps.findIndex((item) => item.id === activeSection);
    const error = direction > 0 ? validateCurrentStep() : '';
    if (error) {
      setEditorError(error);
      return;
    }
    const target = guidedSteps[currentIndex + direction];
    if (target) openSection(target.id);
  }

  function applyAdvancedChanges() {
    try {
      const specification = JSON.parse(advancedText) as CatalogSpecification;
      setSelected((current) => ({ ...current, specification }));
      setHasLocalChanges(true);
      setEditorError('');
      setNotice('Los cambios avanzados se aplicaron al borrador local.');
    } catch {
      setEditorError('El contenido técnico no tiene un formato válido.');
    }
  }

  const mutationError = saveMutation.error ?? publishMutation.error ?? discardMutation.error;
  const specification = selected.specification;

  if (definitionsQuery.isLoading) {
    return (
      <div
        data-testid="catalog-builder-loading"
        className="flex min-h-[60vh] items-center justify-center p-8"
      >
        <div className="text-center">
          <LoaderCircle className="mx-auto h-9 w-9 animate-spin text-primary" />
          <h1 className="mt-4 text-xl font-black text-on-surface">Preparando Catalog Builder</h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Cargando entidades, formularios y versiones publicadas…
          </p>
        </div>
      </div>
    );
  }

  if (definitionsQuery.isError) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <section
          data-testid="catalog-builder-load-error"
          className="panel-card w-full max-w-xl p-8 text-center"
        >
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/10 text-red-400">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h1 className="mt-5 text-2xl font-black text-on-surface">
            No pudimos cargar el catálogo
          </h1>
          <p className="mt-2 text-sm leading-6 text-on-surface-variant">
            No se modificó ninguna definición. Revisa la conexión e intenta cargar las entidades nuevamente.
          </p>
          <button
            type="button"
            onClick={() => void definitionsQuery.refetch()}
            className="primary-button mx-auto mt-6"
          >
            <RefreshCw className="h-4 w-4" /> Reintentar
          </button>
        </section>
      </div>
    );
  }

  if (definitions.length === 0 && !isCreatingNew) {
    return (
      <div className="flex min-h-[65vh] items-center justify-center p-6">
        <section className="panel-card w-full max-w-2xl p-8 text-center lg:p-12">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <Sparkles className="h-7 w-7" />
          </div>
          <p className="mt-5 text-xs font-black uppercase tracking-[0.2em] text-primary">
            Primer paso
          </p>
          <h1 className="mt-2 text-3xl font-black text-on-surface">Crea tu primera entidad</h1>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-on-surface-variant">
            El asistente te guiará por la información, los campos, el diseño visual y la publicación. Podrás revisar todo antes de activarlo.
          </p>
          <button type="button" onClick={startNew} className="primary-button mx-auto mt-7">
            <Plus className="h-4 w-4" /> Empezar con el asistente
          </button>
        </section>
      </div>
    );
  }

  return (
    <div
      data-testid="catalog-builder"
      className="p-6 lg:p-8 w-full min-h-full space-y-6"
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-primary text-xs font-black uppercase tracking-[0.2em] mb-2">
            <Settings2 className="w-4 h-4" /> Configuración sin código
          </div>
          <h1 className="text-3xl font-black text-on-surface">Catalog Builder</h1>
          <p className="text-sm text-on-surface-variant mt-1">
            Define qué se captura, cómo fluye y cómo se verá cada registro.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {guidedMode ? (
            <button
              onClick={() => {
                if (definitions[0]) selectDefinition(definitions[0]);
              }}
              className="secondary-button"
            >
              <X className="w-4 h-4" /> Salir del asistente
            </button>
          ) : (
            <>
              <button onClick={startNew} className="primary-button">
                <Plus className="w-4 h-4" /> Crear entidad
              </button>
              <button
                data-testid="catalog-save-draft"
                onClick={saveDraft}
                disabled={!hasLocalChanges || saveMutation.isPending}
                className="secondary-button disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {saveMutation.isPending
                  ? 'Guardando…'
                  : !hasLocalChanges
                    ? 'Sin cambios por guardar'
                  : selected.status === 'draft'
                    ? 'Guardar borrador'
                    : selected.status === 'published'
                      ? 'Guardar cambios en borrador'
                      : 'Restaurar como borrador'}
              </button>
              {selected.status === 'draft' && selected.updatedAt && (
                <button
                  data-testid="catalog-discard-draft"
                  onClick={() => {
                    if (!window.confirm('Se descartará el borrador y volverás a la versión publicada. ¿Continuar?')) return;
                    discardMutation.mutate({
                      entityKey: selected.entityKey,
                      updatedAt: selected.updatedAt!,
                    });
                  }}
                  disabled={discardMutation.isPending}
                  className="secondary-button disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                  {discardMutation.isPending ? 'Descartando…' : 'Descartar borrador'}
                </button>
              )}
              <button
                data-testid="catalog-publish"
                onClick={() =>
                  selected.version &&
                  publishMutation.mutate({ entityKey: selected.entityKey, version: selected.version })
                }
                disabled={selected.status !== 'draft' || publishMutation.isPending}
                className="px-4 py-2.5 rounded-xl bg-emerald-500 text-slate-950 text-sm font-black flex items-center gap-2 disabled:opacity-30"
              >
                <Rocket className="w-4 h-4" />
                {publishMutation.isPending ? 'Publicando…' : 'Publicar'}
              </button>
            </>
          )}
        </div>
      </header>

      {guidedMode && <GuidedProgress activeSection={activeSection} onSelect={openSection} />}

      <div
        className={`grid grid-cols-1 gap-5 ${
          guidedMode ? '' : 'xl:grid-cols-[280px_minmax(0,1fr)]'
        }`}
      >
        {!guidedMode && <aside className="space-y-4">
          <div className="panel-card p-4 shadow-sm">
            <div className="flex items-center justify-between px-2 mb-3">
              <span className="section-eyebrow font-bold text-xs uppercase tracking-wider text-on-surface-variant">Mis entidades</span>
              <span className="rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 text-xs font-black text-primary">{grouped.length}</span>
            </div>
            {definitionsQuery.isLoading && (
              <p className="p-2 text-sm text-on-surface-variant italic">Cargando…</p>
            )}
            <div className="space-y-3">
              {grouped.map((group) => (
                <div key={group.entityKey} className="rounded-2xl border border-border/30 bg-surface-container-low/50 p-2.5">
                  <button
                    data-testid={`catalog-entity-${group.entityKey}`}
                    onClick={() => selectDefinition(group.active)}
                    className={`w-full rounded-xl border p-3 text-left transition-all ${
                      selected.entityKey === group.entityKey &&
                      selected.id === group.active.id
                        ? 'border-primary/60 bg-primary/15 shadow-[0_0_12px_rgba(34,211,238,0.12)]'
                        : 'border-transparent hover:bg-surface-container'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <span className="block text-sm font-black text-on-surface">
                          {group.active.name}
                        </span>
                        <span className="mt-0.5 block font-mono text-[10px] font-bold text-on-surface-variant">
                          {group.entityKey}
                        </span>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase ${
                        group.draft
                          ? 'border-amber-500/30 bg-amber-500/15 text-amber-300'
                          : 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300'
                      }`}>
                        {group.draft ? 'Cambios sin publicar' : 'Publicada'}
                      </span>
                    </div>
                  </button>
                  {group.versions.some((definition) => definition.id !== group.active.id) && (
                    <>
                      <button
                        onClick={() =>
                          setOpenHistoryKey((current) =>
                            current === group.entityKey ? null : group.entityKey,
                          )
                        }
                        className="mt-1.5 flex w-full items-center justify-between rounded-lg px-3 py-2 text-[10px] font-bold text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
                      >
                        <span className="flex items-center gap-1.5">
                          <History className="h-3.5 w-3.5" />
                          Ver historial
                        </span>
                        <span>{openHistoryKey === group.entityKey ? '−' : '+'}</span>
                      </button>
                      {openHistoryKey === group.entityKey && (
                        <div className="mt-1 space-y-1 border-t border-border/30 pt-2">
                          {group.versions
                            .filter((definition) => definition.id !== group.active.id)
                            .map((definition) => (
                      <button
                        key={definition.id}
                        onClick={() => selectDefinition(definition)}
                        className={`w-full flex items-center justify-between rounded-xl px-3 py-2 text-left border transition-all ${
                          selected.id === definition.id
                            ? 'border-primary/60 bg-primary/15 shadow-[0_0_12px_rgba(34,211,238,0.12)]'
                            : 'border-transparent hover:bg-surface-container'
                        }`}
                      >
                        <span className="text-xs font-bold text-on-surface">
                          Versión {definition.version}
                        </span>
                        <span
                          className={`text-[10px] font-black border rounded-full px-2 py-0.5 ${statusClasses(definition.status)}`}
                        >
                          {statusLabel(definition.status)}
                        </span>
                      </button>
                            ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="panel-card p-3.5 shadow-sm">
            <span className="section-eyebrow px-2 font-bold text-xs uppercase tracking-wider text-on-surface-variant">Configuración</span>
            <nav className="mt-2.5 space-y-1">
              {sectionItems.map((item) => (
                <button
                  data-testid={`catalog-section-${item.id}`}
                  key={item.id}
                  onClick={() => openSection(item.id)}
                  className={`w-full rounded-xl p-3 text-left flex items-center gap-3 transition-all ${
                    activeSection === item.id
                      ? 'bg-primary/15 text-primary border-l-4 border-l-primary font-bold shadow-xs'
                      : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface border-l-4 border-l-transparent'
                  }`}
                >
                  <item.icon className="w-4 h-4 shrink-0" />
                  <span>
                    <span className="block text-xs font-bold">{item.label}</span>
                    <span className="block text-[10px] opacity-70 font-normal">{item.description}</span>
                  </span>
                </button>
              ))}
            </nav>
          </div>
        </aside>}

        <main className="space-y-5 min-w-0">
          {!guidedMode && (
            <div className="rounded-2xl border border-primary/20 bg-primary/5 px-5 py-4">
              <div className="flex items-start gap-3">
                <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-black text-on-surface">Ruta recomendada</p>
                  <p className="mt-1 text-xs leading-5 text-on-surface-variant">
                    Ajusta los campos → organiza el diseño visual → revisa las reglas → valida y publica. Los tickets existentes conservarán su versión anterior.
                  </p>
                </div>
              </div>
            </div>
          )}
          <div className="panel-card px-6 py-4 flex flex-wrap items-center justify-between gap-4 shadow-sm bg-surface-container-low/90 backdrop-blur-md">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center font-black text-primary text-base uppercase shadow-xs">
                {selected.entityKey?.charAt(0) || '?'}
              </div>
              <div>
                <div className="flex items-center gap-2.5">
                  <h2 className="font-black text-lg text-on-surface tracking-tight">{selected.name || 'Nueva entidad'}</h2>
                  <span className={`text-[10px] font-black border rounded-full px-2.5 py-0.5 uppercase tracking-wider ${statusClasses(selected.status)}`}>
                    {statusLabel(selected.status)}
                  </span>
                </div>
                <p className="text-xs font-medium text-on-surface-variant/80 mt-0.5">
                  {specification.fields.length} campos · {specification.lifecycle.states.length} estados ·{' '}
                  {specification.bindings?.length ?? 0} recursos conectados
                </p>
              </div>
            </div>
            <div
              className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-bold ${
                hasLocalChanges
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                  : 'border-emerald-500/25 bg-emerald-500/5 text-emerald-300'
              }`}
            >
              {hasLocalChanges ? (
                <Save className="h-4 w-4 shrink-0" />
              ) : (
                <CheckCircle2 className="h-4 w-4 shrink-0" />
              )}
              {hasLocalChanges ? 'Tienes cambios sin guardar' : 'No hay cambios pendientes'}
            </div>
          </div>

          {activeSection === 'general' && (
            <GeneralEditor
              selected={selected}
              setSelected={setSelectedWithChanges}
              guided={guidedMode}
            />
          )}
          {activeSection === 'fields' && (
            <FieldsEditor
              specification={specification}
              updateSpecification={updateSpecification}
              guided={guidedMode}
            />
          )}
          {activeSection === 'detail' && (
            <TemplateDesigner
              key={selected.id ?? 'new'}
              entityKey={selected.entityKey}
              specification={specification}
              updateSpecification={updateSpecification}
            />
          )}
          {activeSection === 'workflow' && (
            <WorkflowEditor
              specification={specification}
              updateSpecification={updateSpecification}
              guided={guidedMode}
            />
          )}
          {activeSection === 'relations' && (
            <RelationsEditor
              specification={specification}
              entityKeys={[...new Set([
                'INC',
                'PRB',
                'RFC',
                ...definitions.map((definition) => definition.entityKey),
              ])]}
              updateSpecification={updateSpecification}
            />
          )}
          {activeSection === 'resources' && (
            <ResourcesEditor
              specification={specification}
              updateSpecification={updateSpecification}
              guided={guidedMode}
            />
          )}
          {activeSection === 'review' && (
            <ReviewEditor
              selected={selected}
              published={grouped.find((group) => group.entityKey === selected.entityKey)?.published}
            />
          )}
          {activeSection === 'advanced' && (
            <AdvancedEditor
              value={advancedText}
              onChange={setAdvancedText}
              onApply={applyAdvancedChanges}
            />
          )}

          {/* whitespace-pre-line: los errores de validación del backend llegan
              unidos por saltos de línea (ver publishMutation) y sin esto el
              navegador los colapsaba en una sola línea corrida. */}
          {(editorError || mutationError) && (
            <div
              data-testid="catalog-editor-error"
              role="alert"
              className="whitespace-pre-line rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
            >
              {editorError || (
                mutationError instanceof ApiError && mutationError.issues?.length
                  ? mutationError.issues.map((issue) => `${issue.path || 'especificación'}: ${issue.message}`).join('\n')
                  : mutationError?.message
              )}
            </div>
          )}
          {notice && (
            <div
              data-testid="catalog-notice"
              className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300 flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" /> {notice}
            </div>
          )}

          {guidedMode && activeSection !== 'advanced' && (
            <div className="panel-card p-4 flex flex-wrap items-center justify-between gap-3">
              <button
                onClick={() => goToGuidedStep(-1)}
                disabled={activeSection === guidedSteps[0].id}
                className="secondary-button disabled:opacity-30"
              >
                <ArrowLeft className="w-4 h-4" /> Anterior
              </button>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => openSection('advanced')}
                  className="text-xs text-on-surface-variant hover:text-on-surface"
                >
                  Configuración técnica
                </button>
                {activeSection !== 'review' ? (
                  <button onClick={() => goToGuidedStep(1)} className="primary-button">
                    Continuar <ArrowRight className="w-4 h-4" />
                  </button>
                ) : selected.status === 'draft' ? (
                  <button
                    data-testid="catalog-publish"
                    onClick={() =>
                      selected.version &&
                      publishMutation.mutate({
                        entityKey: selected.entityKey,
                        version: selected.version,
                      })
                    }
                    disabled={publishMutation.isPending}
                    className="px-5 py-2.5 rounded-xl bg-emerald-500 text-slate-950 text-sm font-black flex items-center gap-2 disabled:opacity-40"
                  >
                    <Rocket className="w-4 h-4" />
                    {publishMutation.isPending ? 'Publicando…' : 'Publicar entidad'}
                  </button>
                ) : (
                  <button
                    data-testid="catalog-save-draft"
                    onClick={saveDraft}
                    disabled={!hasLocalChanges || saveMutation.isPending}
                    className="primary-button disabled:opacity-40"
                  >
                    <Save className="w-4 h-4" />
                    {saveMutation.isPending
                      ? 'Guardando…'
                      : hasLocalChanges
                        ? 'Guardar borrador'
                        : 'Sin cambios por guardar'}
                  </button>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
