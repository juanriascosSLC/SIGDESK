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
  appendCatalogFieldRow,
  mapPageDefinition,
  pageHasCatalogField,
  resolveFormPageLayout,
  upgradeSpecificationToFormPages,
} from '@/features/catalog/runtime/form-page-normalizer';
import { useUnsavedChangesGuard } from './catalog-builder/useUnsavedChangesGuard';
import { ConfirmDialog } from '@/components/ui';
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

// INC is the ticket-backed entity. Its aggregate always needs a resource,
// independently of whether the rest of the catalog fields are optional. A
// legacy resource, a CMDB site, or a CMDB device can provide it.
function incidentHasResourceBinding(
  entityKey: string,
  specification: CatalogSpecification | undefined,
): boolean {
  if (entityKey.trim().toUpperCase() !== 'INC') return true;
  return Boolean(
    specification?.fields.some(
      (field) =>
        field.bindsTo === 'recursoId' ||
        field.bindsTo === 'siteAssetId' ||
        field.bindsTo === 'assetId',
    ),
  );
}

// Repairs legacy drafts that already have `bindsTo` fields outside Crear.
// The backend is right to reject those definitions: no one could supply the
// resource/agent binding at record creation time. Keep this here as a final
// safety net as well as in FieldsEditor, because a draft can be opened
// directly on Revisar y publicar without mounting that editor first.
function placeBindingFieldsOnCreateForm(
  specification: CatalogSpecification,
  fields: FieldDefinition[],
): CatalogSpecification {
  if (fields.length === 0) return specification;
  const next = upgradeSpecificationToFormPages(structuredClone(specification));
  next.views = next.views ?? {};
  next.views.create = [...new Set([...(next.views.create ?? []), ...fields.map((field) => field.key)])];
  next.createPage = mapPageDefinition(next.createPage!, (page) =>
    fields.reduce((updated, field) => appendCatalogFieldRow(updated, field.key), page),
  );
  return next;
}

// `assetId` is the existing "Dispositivo del sitio" binding. A device is
// selected from the inventory of a site, therefore the definition must also
// collect `siteAssetId`. This runs at save time too, so old drafts are repaired
// even if their fields section was not opened in the current session.
function addMissingSiteBinding(
  specification: CatalogSpecification,
): { specification: CatalogSpecification; added?: FieldDefinition } {
  const hasDevice = specification.fields.some((field) => field.bindsTo === 'assetId');
  const hasSite = specification.fields.some((field) => field.bindsTo === 'siteAssetId');
  if (!hasDevice || hasSite) return { specification };

  const next = structuredClone(specification);
  const usedKeys = new Set(next.fields.map((field) => field.key));
  let key = 'siteAfectado';
  let suffix = 2;
  while (usedKeys.has(key)) key = `siteAfectado${suffix++}`;
  const site: FieldDefinition = {
    key,
    label: 'Sitio afectado',
    type: 'text',
    required: false,
    bindsTo: 'siteAssetId',
  };
  const deviceIndex = next.fields.findIndex((field) => field.bindsTo === 'assetId');
  next.fields.splice(deviceIndex < 0 ? next.fields.length : deviceIndex, 0, site);
  return { specification: placeBindingFieldsOnCreateForm(next, [site]), added: site };
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

  const unsavedGuard = useUnsavedChangesGuard(hasLocalChanges);
  // Replaces the three window.confirm() calls this screen used to make:
  // switching entity/version, starting a new entity, and discarding a draft.
  const [pendingUnsavedAction, setPendingUnsavedAction] = useState<
    { kind: 'select'; definition: CatalogDefinition } | { kind: 'new' } | null
  >(null);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);

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
        `Draft v${created.version} saved. Users are still using the published version.`,
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
      setNotice('Draft discarded. The entity is back to its published version.');
    },
  });

  const publishMutation = useMutation({
    mutationFn: async ({ entityKey, version }: { entityKey: string; version: number }) => {
      const invalidField = selected?.specification.fields.find(
        (field) => !field.key.trim() || !field.label.trim(),
      );
      if (invalidField) {
        throw new Error(
          `The field “${invalidField.label || invalidField.key || 'unnamed'}” needs a name and technical key before publishing.`,
        );
      }
      const fieldKeys = selected?.specification.fields.map((field) => field.key.trim()) ?? [];
      if (new Set(fieldKeys).size !== fieldKeys.length) {
        throw new Error('There are duplicate field technical keys. Every field must have a unique key.');
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
          `These fields are linked to a resource or IT agent but don't appear on the creation form: ${unplaced
            .map((field) => `"${field.label || field.key}"`)
            .join(', ')}. Add them in Visual design → Create before publishing.`,
        );
      }
      if (!incidentHasResourceBinding(entityKey, selected?.specification)) {
        throw new Error(
          'INC necesita un campo vinculado a Recurso, Sitio CMDB o Dispositivo CMDB para poder crear tickets. Agrega «Dispositivo CMDB» en Campos del formulario antes de publicar.',
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
      setNotice(`${published.entityKey} has published changes.`);
    },
  });

  function selectDefinition(definition: CatalogDefinition, force = false): boolean {
    if (!force && hasLocalChanges) {
      setPendingUnsavedAction({ kind: 'select', definition });
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

  function performStartNew() {
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

  function startNew() {
    if (hasLocalChanges) {
      setPendingUnsavedAction({ kind: 'new' });
      return;
    }
    performStartNew();
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
    const dependencyRepair = addMissingSiteBinding(selected.specification);
    const unplacedBindings = bindingFieldsMissingFromCreateForm(dependencyRepair.specification);
    const specificationToSave = placeBindingFieldsOnCreateForm(
      dependencyRepair.specification,
      unplacedBindings,
    );
    const repairedBindingFields = [
      ...(dependencyRepair.added ? [dependencyRepair.added] : []),
      ...unplacedBindings,
    ];
    if (dependencyRepair.added || unplacedBindings.length > 0) {
      setSelected((current) => ({ ...current, specification: specificationToSave }));
      setHasLocalChanges(true);
      setNotice(
        `Se agregaron a Crear los campos vinculados: ${repairedBindingFields
          .map((field) => `Â«${field.label || field.key}Â»`)
          .join(', ')}.`,
      );
    }
    if (!selected.entityKey.trim() || !selected.name.trim()) {
      setEditorError('Fill in the entity code and name.');
      setActiveSection('general');
      return;
    }
    if (selected.specification.fields.length === 0) {
      setEditorError('Add at least one field.');
      setActiveSection('fields');
      return;
    }
    const invalidSelect = selected.specification.fields.find(
      (field) => field.type === 'select' && !field.options?.length,
    );
    if (invalidSelect) {
      setEditorError(`Add options to field “${invalidSelect.label}”.`);
      setActiveSection('fields');
      return;
    }
    if (
      selected.specification.lifecycle.states.filter((state) => state.initial).length !== 1
    ) {
      setEditorError('Select exactly one initial state.');
      setActiveSection('workflow');
      return;
    }
    if (selected.specification.bindings?.some((binding) => !binding.resourceId.trim())) {
      setEditorError('Complete or remove resources missing an identifier.');
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
      setEditorError('Complete or remove relationships that do not have a complete contract.');
      setActiveSection('relations');
      return;
    }
    saveMutation.mutate({
      ...selected,
      specification: specificationToSave,
      entityKey: selected.entityKey.toUpperCase().trim(),
      name: selected.name.trim(),
    });
  }

  function publishDraft() {
    const dependencyRepair = addMissingSiteBinding(selected.specification);
    const unplacedBindings = bindingFieldsMissingFromCreateForm(dependencyRepair.specification);
    if (dependencyRepair.added || unplacedBindings.length > 0) {
      const repaired = placeBindingFieldsOnCreateForm(dependencyRepair.specification, unplacedBindings);
      const repairedBindingFields = [
        ...(dependencyRepair.added ? [dependencyRepair.added] : []),
        ...unplacedBindings,
      ];
      setSelected((current) => ({ ...current, specification: repaired }));
      setHasLocalChanges(true);
      setActiveSection('fields');
      setEditorError(
        `Se agregaron a Crear los campos vinculados: ${repairedBindingFields
          .map((field) => `Â«${field.label || field.key}Â»`)
          .join(', ')}. Guarda el borrador y luego publÃ­calo.`,
      );
      return;
    }
    if (hasLocalChanges) {
      setEditorError('Guarda los cambios del borrador antes de publicar.');
      return;
    }
    if (selected.version) {
      publishMutation.mutate({ entityKey: selected.entityKey, version: selected.version });
    }
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
      return 'Enter the entity name to continue.';
    }
    if (activeSection === 'fields' && specification.fields.length === 0) {
      return 'Add at least one field that this entity captures.';
    }
    if (
      activeSection === 'fields' &&
      specification.fields.some((field) => !field.key.trim() || !field.label.trim())
    ) {
      return 'All fields need a visible name and a technical key.';
    }
    if (
      activeSection === 'fields' &&
      new Set(specification.fields.map((field) => field.key.trim())).size !== specification.fields.length
    ) {
      return 'Every field must have a unique technical key.';
    }
    if (
      activeSection === 'workflow' &&
      specification.lifecycle.states.filter((state) => state.initial).length !== 1
    ) {
      return 'Select exactly one initial state.';
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
      setNotice('Advanced changes applied to local draft.');
    } catch {
      setEditorError('The technical content is not in a valid format.');
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
          <h1 className="mt-4 text-xl font-black text-on-surface">Preparing Entity Builder</h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Loading entities, forms, and published versions…
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
            We couldn't load the catalog
          </h1>
          <p className="mt-2 text-sm leading-6 text-on-surface-variant">
            No definition was changed. Check your connection and try loading the entities again.
          </p>
          <button
            type="button"
            onClick={() => void definitionsQuery.refetch()}
            className="primary-button mx-auto mt-6"
          >
            <RefreshCw className="h-4 w-4" /> Retry
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
            First step
          </p>
          <h1 className="mt-2 text-3xl font-black text-on-surface">Create your first entity</h1>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-on-surface-variant">
            The wizard will guide you through the information, fields, visual design and publishing. You can review everything before it goes live.
          </p>
          <button type="button" onClick={startNew} className="primary-button mx-auto mt-7">
            <Plus className="h-4 w-4" /> Start with wizard
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
            <Settings2 className="w-4 h-4" /> No-code configuration
          </div>
          <h1 className="text-3xl font-black text-on-surface">Entity Builder</h1>
          <p className="text-sm text-on-surface-variant mt-1">
            Define what's captured, how it flows, and how each record will look.
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
              <X className="w-4 h-4" /> Exit wizard
            </button>
          ) : (
            <>
              <button onClick={startNew} className="primary-button">
                <Plus className="w-4 h-4" /> Create entity
              </button>
              <button
                data-testid="catalog-save-draft"
                onClick={saveDraft}
                disabled={!hasLocalChanges || saveMutation.isPending}
                className="secondary-button disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {saveMutation.isPending
                  ? 'Saving…'
                  : !hasLocalChanges
                    ? 'No changes to save'
                  : selected.status === 'draft'
                    ? 'Save draft'
                    : selected.status === 'published'
                      ? 'Save changes to draft'
                      : 'Restore as draft'}
              </button>
              {selected.status === 'draft' && selected.updatedAt && (
                <button
                  data-testid="catalog-discard-draft"
                  onClick={() => setShowDiscardDialog(true)}
                  disabled={discardMutation.isPending}
                  className="secondary-button disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                  {discardMutation.isPending ? 'Discarding…' : 'Discard draft'}
                </button>
              )}
              <button
                data-testid="catalog-publish"
                onClick={publishDraft}
                disabled={selected.status !== 'draft' || publishMutation.isPending}
                className="px-4 py-2.5 rounded-xl bg-emerald-500 text-slate-950 text-sm font-black flex items-center gap-2 disabled:opacity-30"
              >
                <Rocket className="w-4 h-4" />
                {publishMutation.isPending ? 'Publishing…' : 'Publish'}
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
              <span className="section-eyebrow font-bold text-xs uppercase tracking-wider text-on-surface-variant">My entities</span>
              <span className="rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 text-xs font-black text-primary">{grouped.length}</span>
            </div>
            {definitionsQuery.isLoading && (
              <p className="p-2 text-sm text-on-surface-variant italic">Loading…</p>
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
                        {group.draft ? 'Unpublished changes' : 'Published'}
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
                          View history
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
                          Version {definition.version}
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
            <span className="section-eyebrow px-2 font-bold text-xs uppercase tracking-wider text-on-surface-variant">Configuration</span>
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
                  <p className="text-sm font-black text-on-surface">Recommended path</p>
                  <p className="mt-1 text-xs leading-5 text-on-surface-variant">
                    Adjust the fields → organize the visual design → review the rules → validate and publish. Existing tickets will keep their previous version.
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
                  <h2 className="font-black text-lg text-on-surface tracking-tight">{selected.name || 'New entity'}</h2>
                  <span className={`text-[10px] font-black border rounded-full px-2.5 py-0.5 uppercase tracking-wider ${statusClasses(selected.status)}`}>
                    {statusLabel(selected.status)}
                  </span>
                </div>
                <p className="text-xs font-medium text-on-surface-variant/80 mt-0.5">
                  {specification.fields.length} fields · {specification.lifecycle.states.length} states ·{' '}
                  {specification.bindings?.length ?? 0} connected resources
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
              {hasLocalChanges ? 'You have unsaved changes' : 'No pending changes'}
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
                  ? mutationError.issues.map((issue) => `${issue.path || 'specification'}: ${issue.message}`).join('\n')
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
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => openSection('advanced')}
                  className="text-xs text-on-surface-variant hover:text-on-surface"
                >
                  Technical configuration
                </button>
                {activeSection !== 'review' ? (
                  <button onClick={() => goToGuidedStep(1)} className="primary-button">
                    Continue <ArrowRight className="w-4 h-4" />
                  </button>
                ) : selected.status === 'draft' ? (
                  <button
                    data-testid="catalog-publish"
                    onClick={publishDraft}
                    disabled={publishMutation.isPending}
                    className="px-5 py-2.5 rounded-xl bg-emerald-500 text-slate-950 text-sm font-black flex items-center gap-2 disabled:opacity-40"
                  >
                    <Rocket className="w-4 h-4" />
                    {publishMutation.isPending ? 'Publishing…' : 'Publish entity'}
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
                      ? 'Saving…'
                      : hasLocalChanges
                        ? 'Save draft'
                        : 'No changes to save'}
                  </button>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      <ConfirmDialog
        open={unsavedGuard.pending}
        onClose={unsavedGuard.cancelLeave}
        onConfirm={unsavedGuard.confirmLeave}
        title="Leave editor with unsaved changes?"
        description="You have unsaved changes in this entity. If you leave now, they'll be lost."
        confirmLabel="Leave"
        tone="destructive"
      />
      <ConfirmDialog
        open={pendingUnsavedAction !== null}
        onClose={() => setPendingUnsavedAction(null)}
        onConfirm={() => {
          if (pendingUnsavedAction?.kind === 'select') {
            selectDefinition(pendingUnsavedAction.definition, true);
          } else if (pendingUnsavedAction?.kind === 'new') {
            performStartNew();
          }
          setPendingUnsavedAction(null);
        }}
        title={pendingUnsavedAction?.kind === 'new' ? 'Discard changes and create a new entity?' : 'Discard changes and switch?'}
        description={
          pendingUnsavedAction?.kind === 'new'
            ? "You have unsaved changes. If you create another entity now, they'll be lost."
            : "You have unsaved changes. If you switch entity or version now, they'll be lost."
        }
        confirmLabel="Discard and continue"
        tone="destructive"
      />
      <ConfirmDialog
        open={showDiscardDialog}
        onClose={() => setShowDiscardDialog(false)}
        onConfirm={() => {
          setShowDiscardDialog(false);
          discardMutation.mutate({ entityKey: selected.entityKey, updatedAt: selected.updatedAt! });
        }}
        title="Discard draft"
        description="The draft will be discarded and you'll go back to the published version."
        confirmLabel="Discard draft"
        tone="destructive"
        loading={discardMutation.isPending}
        error={discardMutation.error?.message}
      />
    </div>
  );
}
