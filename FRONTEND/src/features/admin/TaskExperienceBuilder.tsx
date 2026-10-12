import { useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, CheckCircle2, ClipboardList, Eye, Plus, Save, Send, Trash2 } from 'lucide-react';
import { Button, ConfirmDialog, EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/ui';
import type { ChangeTaskWorkType } from '@/features/changes/api';
import {
  createTaskTemplateDraft,
  listTaskTemplates,
  publishTaskTemplateDraft,
  updateTaskTemplateDraft,
  validateTaskTemplateDraft,
  type TaskTemplate,
  type TaskTemplateDefinition,
  type TaskTemplateField,
} from './task-experience/api';
import { defaultTaskTemplate, GOVERNED_WORK_TYPES, TASK_TEMPLATE_FAMILY } from './task-experience/defaults';

const WORK_TYPE_LABELS: Record<Exclude<ChangeTaskWorkType, 'generic'>, string> = {
  inventory_readiness: 'Inventory readiness',
  service_scheduling: 'Service scheduling',
  field_work_order: 'Field Work Order',
  restoration_validation: 'Restoration validation',
  payment_approval: 'Payment approval',
  service_closeout: 'Service closeout',
};

export default function TaskExperienceBuilder() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['change-task-templates'], queryFn: listTaskTemplates });
  const drafts = useMemo(() => (query.data ?? []).filter((item) => item.status === 'draft'), [query.data]);
  const [selectedFamily, setSelectedFamily] = useState('');
  const selectedFamilyKey = selectedFamily || drafts[0]?.familyKey || '';
  const selected = drafts.find((item) => item.familyKey === selectedFamilyKey);
  const [draftEdits, setDraftEdits] = useState<Record<number, TaskTemplateDefinition>>({});
  const definition = selected ? draftEdits[selected.id] ?? selected.definition : undefined;
  const setDefinition = (next: TaskTemplateDefinition) => {
    if (selected) setDraftEdits((current) => ({ ...current, [selected.id]: next }));
  };
  const [createOpen, setCreateOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [notice, setNotice] = useState('');

  const save = useMutation({
    mutationFn: () => updateTaskTemplateDraft(selected!, definition!),
    onSuccess: async (item) => {
      setNotice(`Draft v${item.version} saved.`);
      await queryClient.invalidateQueries({ queryKey: ['change-task-templates'] });
    },
  });
  const validate = useMutation({
    mutationFn: () => validateTaskTemplateDraft(selected!.familyKey),
    onSuccess: () => setNotice('The draft satisfies the controlled task contract.'),
  });
  const publish = useMutation({
    mutationFn: () => publishTaskTemplateDraft(selected!),
    onSuccess: async (item) => {
      setPublishOpen(false);
      setNotice(`${item.familyKey} v${item.version} is published. Existing tasks keep their frozen version.`);
      await queryClient.invalidateQueries({ queryKey: ['change-task-templates'] });
    },
  });

  if (query.isLoading) return <LoadingState label="Loading task templates…" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8" data-testid="task-experience-builder">
      <PageHeader
        eyebrow="No-code configuration"
        title="Task Experience Builder"
        description="Design what each governed task asks for, how completion is documented, and how it appears to the assigned team."
        actions={<Button onClick={() => setCreateOpen(true)} leadingIcon={<Plus className="h-4 w-4" />}>New template</Button>}
      />
      {notice && <div role="status" className="rounded-xl border border-status-success-border bg-status-success-bg p-3 text-sm text-status-success-fg">{notice}</div>}
      {(save.isError || validate.isError || publish.isError) && (
        <div role="alert" className="rounded-xl border border-status-danger-border bg-status-danger-bg p-3 text-sm text-status-danger-fg">
          {(save.error ?? validate.error ?? publish.error)?.message}
        </div>
      )}

      {!selected || !definition ? (
        <EmptyState icon="inbox" title="No task-template draft" description="Create a controlled draft for a governed work type. Nothing is published automatically." action={<Button onClick={() => setCreateOpen(true)}>Create first template</Button>} />
      ) : (
        <div className="grid gap-4 2xl:grid-cols-[15rem_minmax(0,1fr)_22rem]">
          <TemplateRail templates={query.data ?? []} selected={selected.familyKey} onSelect={setSelectedFamily} />
          <main className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/50 bg-surface-container p-4">
              <div><p className="text-xs font-black uppercase tracking-wider text-primary">Draft v{selected.version}</p><h2 className="mt-1 text-lg font-black text-on-surface">{definition.title}</h2><p className="text-sm text-on-surface-variant">{selected.familyKey} · {WORK_TYPE_LABELS[selected.workType as Exclude<ChangeTaskWorkType, 'generic'>]}</p></div>
              <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => validate.mutate()} loading={validate.isPending} leadingIcon={<CheckCircle2 className="h-4 w-4" />}>Validate</Button><Button variant="secondary" onClick={() => save.mutate()} loading={save.isPending} leadingIcon={<Save className="h-4 w-4" />}>Save draft</Button><Button onClick={() => setPublishOpen(true)} leadingIcon={<Send className="h-4 w-4" />}>Review & publish</Button></div>
            </div>
            <OverviewEditor definition={definition} onChange={setDefinition} />
            <SectionsEditor definition={definition} onChange={setDefinition} />
            <OutcomesEditor definition={definition} onChange={setDefinition} />
          </main>
          <TaskPreview definition={definition} />
        </div>
      )}

      <CreateTemplateDialog open={createOpen} existing={query.data ?? []} onClose={() => setCreateOpen(false)} onCreated={async (item) => { setCreateOpen(false); setSelectedFamily(item.familyKey); await queryClient.invalidateQueries({ queryKey: ['change-task-templates'] }); }} />
      <ConfirmDialog open={publishOpen} onClose={() => setPublishOpen(false)} onConfirm={() => publish.mutate()} title="Publish task-template version?" description="This version becomes immutable. Existing tasks keep their current behavior; only tasks created against the new version may use it." confirmLabel="Publish version" loading={publish.isPending} />
    </div>
  );
}

function TemplateRail({ templates, selected, onSelect }: { templates: TaskTemplate[]; selected: string; onSelect: (key: string) => void }) {
  const families = Array.from(new Set(templates.map((item) => item.familyKey)));
  return <aside className="rounded-2xl border border-border/50 bg-surface-container p-3 xl:sticky xl:top-4 xl:self-start"><p className="px-2 text-xs font-black uppercase tracking-wider text-on-surface-variant">Template families</p><div className="mt-3 space-y-1">{families.map((family) => { const draft = templates.find((item) => item.familyKey === family && item.status === 'draft'); const published = templates.find((item) => item.familyKey === family && item.status === 'published'); return <button key={family} type="button" onClick={() => draft && onSelect(family)} disabled={!draft} className={`w-full rounded-xl p-3 text-left ${selected === family ? 'bg-primary/15 text-primary' : 'hover:bg-surface-container-high'}`}><span className="block truncate text-sm font-black">{family}</span><span className="mt-1 block text-xs text-on-surface-variant">{draft ? `Draft v${draft.version}` : 'No draft'}{published ? ` · Live v${published.version}` : ''}</span></button>; })}</div></aside>;
}

function OverviewEditor({ definition, onChange }: EditorProps) {
  return <section className="rounded-2xl border border-border/50 bg-surface-container p-5"><h3 className="text-base font-black">Purpose and instructions</h3><div className="mt-4 grid gap-4"><TextField label="Display name" value={definition.title} onChange={(title) => onChange({ ...definition, title })} /><TextArea label="Objective" value={definition.summary} onChange={(summary) => onChange({ ...definition, summary })} /><StringRows label="Instructions" values={definition.instructions} onChange={(instructions) => onChange({ ...definition, instructions })} /></div></section>;
}

type EditorProps = { definition: TaskTemplateDefinition; onChange: (definition: TaskTemplateDefinition) => void };

function SectionsEditor({ definition, onChange }: EditorProps) {
  function updateField(key: string, patch: Partial<TaskTemplateField>) {
    onChange({
      ...definition,
      fields: definition.fields.map((field) => field.key === key ? { ...field, ...patch } : field),
      outcomes: patch.required === true
        ? definition.outcomes.map((outcome) => ({ ...outcome, requiredFields: Array.from(new Set([...outcome.requiredFields, key])) }))
        : definition.outcomes,
    });
  }
  function removeField(key: string) { onChange({ ...definition, fields: definition.fields.filter((field) => field.key !== key), sections: definition.sections.map((section) => ({ ...section, fieldKeys: section.fieldKeys.filter((fieldKey) => fieldKey !== key) })), outcomes: definition.outcomes.map((outcome) => ({ ...outcome, requiredFields: outcome.requiredFields.filter((fieldKey) => fieldKey !== key) })) }); }
  function addField(sectionIndex: number) {
    let suffix = definition.fields.length + 1;
    while (definition.fields.some((field) => field.key === `field_${suffix}`)) suffix += 1;
    const key = `field_${suffix}`;
    const field: TaskTemplateField = { key, label: 'New field', type: 'textarea', required: false, options: [] };
    onChange({ ...definition, fields: [...definition.fields, field], sections: definition.sections.map((section, index) => index === sectionIndex ? { ...section, fieldKeys: [...section.fieldKeys, key] } : section) });
  }
  function move(sectionIndex: number, fieldIndex: number, delta: number) { const next = structuredClone(definition); const keys = next.sections[sectionIndex].fieldKeys; const target = fieldIndex + delta; if (target < 0 || target >= keys.length) return; [keys[fieldIndex], keys[target]] = [keys[target], keys[fieldIndex]]; onChange(next); }
  function addSection() {
    let suffix = definition.sections.length + 1;
    while (definition.sections.some((section) => section.id === `section_${suffix}`)) suffix += 1;
    onChange({ ...definition, sections: [...definition.sections, { id: `section_${suffix}`, title: 'New section', description: '', fieldKeys: [] }] });
  }
  function moveSection(sectionIndex: number, delta: number) {
    const target = sectionIndex + delta;
    if (target < 0 || target >= definition.sections.length) return;
    const sections = [...definition.sections];
    [sections[sectionIndex], sections[target]] = [sections[target], sections[sectionIndex]];
    onChange({ ...definition, sections });
  }
  function removeSection(sectionIndex: number) {
    const section = definition.sections[sectionIndex];
    const removed = new Set(section.fieldKeys);
    onChange({
      ...definition,
      sections: definition.sections.filter((_, index) => index !== sectionIndex),
      fields: definition.fields.filter((field) => !removed.has(field.key)),
      outcomes: definition.outcomes.map((outcome) => ({
        ...outcome,
        requiredFields: outcome.requiredFields.filter((key) => !removed.has(key)),
      })),
    });
  }
  return <section className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-base font-black">Completion form</h3><p className="text-sm text-on-surface-variant">Build auditable sections, evidence and outcome-specific requirements without code.</p></div><Button size="sm" variant="secondary" onClick={addSection} data-testid="task-template-add-section"><Plus className="h-4 w-4" />Add section</Button></div>{definition.sections.map((section, sectionIndex) => <div key={section.id} className="rounded-2xl border border-border/50 bg-surface-container p-4" data-testid={`task-template-section-${section.id}`}><div className="mb-4 flex items-center justify-between gap-2"><div><p className="text-[10px] font-black uppercase tracking-wider text-primary">Section {sectionIndex + 1}</p><p className="text-xs text-on-surface-variant">{section.fieldKeys.length} configured field{section.fieldKeys.length === 1 ? '' : 's'}</p></div><div className="flex gap-1"><IconButton label="Move section up" onClick={() => moveSection(sectionIndex, -1)}><ArrowUp className="h-4 w-4" /></IconButton><IconButton label="Move section down" onClick={() => moveSection(sectionIndex, 1)}><ArrowDown className="h-4 w-4" /></IconButton>{definition.sections.length > 1 && <IconButton label="Remove section" onClick={() => removeSection(sectionIndex)} danger><Trash2 className="h-4 w-4" /></IconButton>}</div></div><div className="grid gap-3 sm:grid-cols-2"><TextField label="Section title" value={section.title} onChange={(title) => onChange({ ...definition, sections: definition.sections.map((candidate, index) => index === sectionIndex ? { ...candidate, title } : candidate) })} /><TextField label="Description" value={section.description ?? ''} onChange={(description) => onChange({ ...definition, sections: definition.sections.map((candidate, index) => index === sectionIndex ? { ...candidate, description } : candidate) })} /></div><div className="mt-4 space-y-2">{section.fieldKeys.map((key, fieldIndex) => { const field = definition.fields.find((candidate) => candidate.key === key); if (!field) return null; return <div key={key} className="rounded-xl border border-border/40 bg-surface-container-low p-3"><div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_11rem_auto]"><TextField label="Field label" value={field.label} onChange={(label) => updateField(key, { label })} /><label className="text-xs font-bold">Input type<select value={field.type} onChange={(event) => updateField(key, { type: event.target.value as TaskTemplateField['type'] })} className="input-field mt-1 w-full"><option value="text">Short text</option><option value="textarea">Long text</option><option value="number">Number</option><option value="boolean">Yes / No</option><option value="select">Choice</option><option value="multiselect">Multiple choice</option><option value="date">Date</option><option value="datetime">Date and time</option><option value="attachment">Attachment</option><option value="asset_reference">Asset reference</option></select></label><div className="flex items-end gap-1"><IconButton label="Move field up" onClick={() => move(sectionIndex, fieldIndex, -1)}><ArrowUp className="h-4 w-4" /></IconButton><IconButton label="Move field down" onClick={() => move(sectionIndex, fieldIndex, 1)}><ArrowDown className="h-4 w-4" /></IconButton><IconButton label="Remove field" onClick={() => removeField(key)} danger><Trash2 className="h-4 w-4" /></IconButton></div></div><div className="mt-2 grid gap-2 sm:grid-cols-2"><TextField label="Placeholder" value={field.placeholder ?? ''} onChange={(placeholder) => updateField(key, { placeholder })} /><TextField label="Operator guidance" value={field.helpText ?? ''} onChange={(helpText) => updateField(key, { helpText })} /></div>{(field.type === 'select' || field.type === 'multiselect') && <div className="mt-2"><StringRows label="Choices" values={field.options} onChange={(options) => updateField(key, { options })} /></div>}<div className="mt-2 flex flex-wrap gap-4"><Check label="Required" checked={field.required} onChange={(required) => updateField(key, { required })} /><Check label="Allow multiple entries" checked={Boolean(field.multiple)} onChange={(multiple) => updateField(key, { multiple })} /><Check label="Counts as evidence" checked={Boolean(field.evidence)} onChange={(evidence) => updateField(key, { evidence })} /></div></div>; })}</div><Button className="mt-3" size="sm" variant="secondary" onClick={() => addField(sectionIndex)}><Plus className="h-4 w-4" />Add field</Button></div>)}</section>;
}

function OutcomesEditor({ definition, onChange }: EditorProps) {
  function requireField(outcomeIndex: number, key: string, required: boolean) {
    onChange({ ...definition, outcomes: definition.outcomes.map((outcome, index) => index !== outcomeIndex ? outcome : { ...outcome, requiredFields: required ? Array.from(new Set([...outcome.requiredFields, key])) : outcome.requiredFields.filter((fieldKey) => fieldKey !== key) }) });
  }
  return <section className="rounded-2xl border border-border/50 bg-surface-container p-5"><h3 className="text-base font-black">Typed outcomes</h3><p className="mt-1 text-sm text-on-surface-variant">Codes are fixed by the domain contract. Labels, guidance and required evidence may be customized.</p><div className="mt-4 space-y-3">{definition.outcomes.map((outcome, index) => <div key={outcome.code} className="rounded-xl border border-border/40 bg-surface-container-low p-3"><div className="font-mono text-xs text-primary">{outcome.code}</div><div className="mt-2 grid gap-3 sm:grid-cols-2"><TextField label="Label" value={outcome.label} onChange={(label) => onChange({ ...definition, outcomes: definition.outcomes.map((candidate, current) => current === index ? { ...candidate, label } : candidate) })} /><TextField label="Operator guidance" value={outcome.description ?? ''} onChange={(description) => onChange({ ...definition, outcomes: definition.outcomes.map((candidate, current) => current === index ? { ...candidate, description } : candidate) })} /></div><fieldset className="mt-3"><legend className="text-xs font-black text-on-surface-variant">Required information for this outcome</legend><div className="mt-2 flex flex-wrap gap-3">{definition.fields.map((field) => <Check key={field.key} label={field.label} checked={outcome.requiredFields.includes(field.key)} onChange={(checked) => requireField(index, field.key, checked)} />)}</div></fieldset></div>)}</div></section>;
}

function TaskPreview({ definition }: { definition: TaskTemplateDefinition }) {
  return <aside className="rounded-2xl border border-border/50 bg-surface-container p-4 xl:sticky xl:top-4 xl:self-start" data-testid="task-template-preview"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-primary"><Eye className="h-4 w-4" />Live preview</div><h3 className="mt-4 text-lg font-black">{definition.title || 'Untitled task'}</h3><p className="mt-1 text-sm leading-5 text-on-surface-variant">{definition.summary || 'Add an objective for the assigned operator.'}</p>{definition.instructions.length > 0 && <ol className="mt-4 list-decimal space-y-1 pl-5 text-xs text-on-surface-variant">{definition.instructions.filter(Boolean).map((item, index) => <li key={index}>{item}</li>)}</ol>}<div className="mt-5 space-y-4">{definition.sections.map((section) => <section key={section.id} className="rounded-xl border border-border/40 bg-surface-container-low/50 p-3"><h4 className="text-sm font-black">{section.title}</h4>{section.description && <p className="mt-0.5 text-xs text-on-surface-variant">{section.description}</p>}<div className="mt-3 space-y-3">{section.fieldKeys.map((key) => { const field = definition.fields.find((candidate) => candidate.key === key); return field ? <TaskPreviewField key={key} field={field} /> : null; })}</div></section>)}</div></aside>;
}

function TaskPreviewField({ field }: { field: TaskTemplateField }) {
  let preview: ReactNode;
  if (field.type === 'textarea') preview = <div className="h-16 rounded-lg border border-border/50 bg-surface px-2 py-1.5 text-[10px] text-on-surface-variant/60">{field.placeholder}</div>;
  else if (field.type === 'boolean') preview = <div className="grid grid-cols-2 gap-1"><span className="rounded-lg border border-border/50 bg-surface px-2 py-1.5 text-center text-[10px]">Yes</span><span className="rounded-lg border border-border/50 bg-surface px-2 py-1.5 text-center text-[10px]">No</span></div>;
  else if (field.type === 'select' || field.type === 'multiselect') preview = <div className="rounded-lg border border-border/50 bg-surface px-2 py-1.5 text-[10px] text-on-surface-variant">{field.placeholder || (field.multiple || field.type === 'multiselect' ? 'Select one or more' : 'Select an option')}</div>;
  else if (field.type === 'attachment') preview = <div className="rounded-lg border border-dashed border-primary/40 bg-primary/5 px-2 py-3 text-center text-[10px] font-bold text-primary">Upload evidence</div>;
  else preview = <div className="h-8 rounded-lg border border-border/50 bg-surface px-2 py-1.5 text-[10px] text-on-surface-variant/60">{field.placeholder}</div>;
  return <div><div className="text-xs font-bold">{field.label}{field.required ? ' *' : ''}</div><div className="mt-1.5">{preview}</div>{field.helpText && <p className="mt-1 text-[10px] leading-4 text-on-surface-variant">{field.helpText}</p>}</div>;
}

function CreateTemplateDialog({ open, existing, onClose, onCreated }: { open: boolean; existing: TaskTemplate[]; onClose: () => void; onCreated: (item: TaskTemplate) => void }) {
  const [workType, setWorkType] = useState<Exclude<ChangeTaskWorkType, 'generic'>>('field_work_order');
  const [familyKey, setFamilyKey] = useState(TASK_TEMPLATE_FAMILY.field_work_order);
  const mutation = useMutation({ mutationFn: () => createTaskTemplateDraft(familyKey, workType, defaultTaskTemplate(workType)), onSuccess: onCreated });
  if (!open) return null;
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="new-task-template-title"><div className="w-full max-w-lg rounded-2xl bg-surface p-6 shadow-2xl"><h2 id="new-task-template-title" className="text-xl font-black">New task-template draft</h2><p className="mt-1 text-sm text-on-surface-variant">Creates a draft only. Publishing remains a separate reviewed action.</p><div className="mt-5 space-y-4"><label className="block text-xs font-bold">Work type<select className="input-field mt-1 w-full" value={workType} onChange={(event) => { const next = event.target.value as Exclude<ChangeTaskWorkType, 'generic'>; setWorkType(next); setFamilyKey(TASK_TEMPLATE_FAMILY[next]); }}>{GOVERNED_WORK_TYPES.map((type) => <option key={type} value={type}>{WORK_TYPE_LABELS[type]}</option>)}</select></label><TextField label="Template family key" value={familyKey} onChange={setFamilyKey} /></div>{existing.some((item) => item.familyKey === familyKey && item.status === 'draft') && <p role="alert" className="mt-3 text-sm text-status-danger-fg">This family already has a draft.</p>}{mutation.isError && <p role="alert" className="mt-3 text-sm text-status-danger-fg">{mutation.error.message}</p>}<div className="mt-6 flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={mutation.isPending} disabled={!/^[a-z][a-z0-9_]{2,63}$/.test(familyKey) || existing.some((item) => item.familyKey === familyKey && item.status === 'draft')} onClick={() => mutation.mutate()}><ClipboardList className="h-4 w-4" />Create draft</Button></div></div></div>;
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="block text-xs font-bold">{label}<input className="input-field mt-1 w-full" value={value} onChange={(event) => onChange(event.target.value)} /></label>; }
function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="block text-xs font-bold">{label}<textarea className="input-field mt-1 w-full" rows={3} value={value} onChange={(event) => onChange(event.target.value)} /></label>; }
function StringRows({ label, values, onChange }: { label: string; values: string[]; onChange: (values: string[]) => void }) { const itemLabel = label === 'Choices' ? 'choice' : 'instruction'; return <fieldset><legend className="text-xs font-bold">{label}</legend><div className="mt-1 space-y-2">{values.map((value, index) => <div key={index} className="flex gap-2"><input className="input-field min-w-0 flex-1" value={value} aria-label={`${label} ${index + 1}`} onChange={(event) => onChange(values.map((item, current) => current === index ? event.target.value : item))} /><IconButton label={`Remove ${itemLabel} ${index + 1}`} onClick={() => { const next = values.filter((_, current) => current !== index); onChange(next.length ? next : ['']); }} danger><Trash2 className="h-4 w-4" /></IconButton></div>)}</div><Button className="mt-2" size="sm" variant="ghost" onClick={() => onChange([...values, ''])}><Plus className="h-4 w-4" />Add {itemLabel}</Button></fieldset>; }
function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) { return <label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />{label}</label>; }
function IconButton({ label, onClick, danger, children }: { label: string; onClick: () => void; danger?: boolean; children: ReactNode }) { return <button type="button" aria-label={label} title={label} onClick={onClick} className={`rounded-lg border p-2 ${danger ? 'border-status-danger-border text-status-danger-fg' : 'border-border/40 text-on-surface-variant hover:text-primary'}`}>{children}</button>; }
