import { useState } from 'react';
import {
  AlignLeft,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDot,
  ClipboardList,
  Copy,
  Eye,
  FileText,
  GripVertical,
  ListChecks,
  Plus,
  RotateCcw,
  Settings2,
  Trash2,
} from 'lucide-react';
import { Button, IconButton } from '@/components/ui';
import {
  defaultIncidentWorkExperience,
  type CatalogSpecification,
  type IncidentWorkExperience,
  type IncidentWorkExperienceField,
  type IncidentWorkExperienceKey,
} from '@/features/catalog/metamodel';

type EditorStage = 'basics' | 'sections' | 'outcomes';

const WORK_TYPES: Array<{ key: IncidentWorkExperienceKey; label: string; shortLabel: string; description: string }> = [
  {
    key: 'it1_remote_troubleshooting',
    label: 'IT 1 · Remote troubleshooting',
    shortLabel: 'IT 1',
    description: 'Initial diagnosis and escalation decision.',
  },
  {
    key: 'it2_troubleshooting',
    label: 'IT 2 · Advanced troubleshooting',
    shortLabel: 'IT 2',
    description: 'Advanced diagnosis, client action or Services handoff.',
  },
];

const STAGES: Array<{ key: EditorStage; label: string; hint: string; icon: typeof FileText }> = [
  { key: 'basics', label: 'Basics', hint: 'Name and purpose', icon: FileText },
  { key: 'sections', label: 'Form sections', hint: 'Fields and guidance', icon: ClipboardList },
  { key: 'outcomes', label: 'Outcomes', hint: 'Required information', icon: ListChecks },
];

const FIELD_TYPES: Array<{ value: IncidentWorkExperienceField['type']; label: string }> = [
  { value: 'text', label: 'Short text' },
  { value: 'textarea', label: 'Long text' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Yes / No' },
  { value: 'select', label: 'Choice' },
  { value: 'multiselect', label: 'Multiple choice' },
  { value: 'date', label: 'Date' },
  { value: 'datetime', label: 'Date and time' },
  { value: 'list', label: 'List (one per line)' },
  { value: 'diagnostic_checks', label: 'Diagnostic check table' },
];

export function IncidentWorkExperienceEditor({
  specification,
  onChange,
}: {
  specification: CatalogSpecification;
  onChange: (specification: CatalogSpecification) => void;
}) {
  const [activeWorkType, setActiveWorkType] = useState<IncidentWorkExperienceKey>('it1_remote_troubleshooting');
  const [stage, setStage] = useState<EditorStage>('sections');
  const configured = specification.incidentWorkExperience ?? {};
  const activeMeta = WORK_TYPES.find((item) => item.key === activeWorkType) ?? WORK_TYPES[0];
  const activeValue = configured[activeWorkType] ?? defaultIncidentWorkExperience(activeWorkType);

  const update = (key: IncidentWorkExperienceKey, experience: IncidentWorkExperience) => {
    onChange({
      ...specification,
      incidentWorkExperience: {
        it1_remote_troubleshooting:
          configured.it1_remote_troubleshooting ?? defaultIncidentWorkExperience('it1_remote_troubleshooting'),
        it2_troubleshooting:
          configured.it2_troubleshooting ?? defaultIncidentWorkExperience('it2_troubleshooting'),
        [key]: experience,
      },
    });
  };

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-[28px] border border-primary/25 bg-surface-container-low shadow-sm">
        <div className="border-b border-border/50 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-5 py-5 lg:px-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[.18em] text-primary">Incident task studio</p>
              <h2 className="mt-2 text-2xl font-black">Build the troubleshooting experience</h2>
              <p className="mt-2 max-w-3xl text-sm text-on-surface-variant">
                Design what the operator sees, what evidence they capture and what becomes mandatory for each outcome.
                Published INC versions freeze this configuration for every new task.
              </p>
            </div>
            <div className="rounded-2xl border border-border/50 bg-surface/70 px-4 py-3 text-right">
              <p className="text-[10px] font-black uppercase tracking-wider text-on-surface-variant">Current form</p>
              <p className="mt-1 text-sm font-black">{activeValue.sections.length} sections · {activeValue.fields.length} fields</p>
            </div>
          </div>
        </div>

        <div className="grid gap-5 p-5 2xl:grid-cols-[17rem_minmax(0,1fr)] lg:p-7">
          <nav aria-label="Troubleshooting form selection" className="space-y-5">
            <div>
              <p className="mb-2 text-[11px] font-black uppercase tracking-wider text-on-surface-variant">1. Choose the task</p>
              <div className="space-y-2">
                {WORK_TYPES.map((item) => {
                  const selected = item.key === activeWorkType;
                  const experience = configured[item.key] ?? defaultIncidentWorkExperience(item.key);
                  return (
                    <button
                      key={item.key}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setActiveWorkType(item.key)}
                      className={`w-full rounded-2xl border p-4 text-left transition ${
                        selected
                          ? 'border-primary bg-primary/10 shadow-sm'
                          : 'border-border/50 bg-surface-container hover:border-primary/40 hover:bg-surface-container-high'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className={`text-sm font-black ${selected ? 'text-primary' : 'text-on-surface'}`}>{item.shortLabel}</span>
                        <span className="rounded-full bg-surface px-2 py-1 text-[10px] font-black text-on-surface-variant">
                          {experience.fields.length} fields
                        </span>
                      </div>
                      <p className="mt-1 text-xs font-bold">{item.label.replace(`${item.shortLabel} · `, '')}</p>
                      <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-on-surface-variant">{item.description}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="mb-2 text-[11px] font-black uppercase tracking-wider text-on-surface-variant">2. Configure</p>
              <div className="space-y-1">
                {STAGES.map((item, index) => {
                  const selected = item.key === stage;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      aria-current={selected ? 'step' : undefined}
                      onClick={() => setStage(item.key)}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${
                        selected ? 'bg-surface-container-high text-on-surface' : 'text-on-surface-variant hover:bg-surface-container'
                      }`}
                    >
                      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${selected ? 'bg-primary text-primary-foreground' : 'bg-surface-container-high'}`}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-black">{index + 1}. {item.label}</span>
                        <span className="block truncate text-[10px]">{item.hint}</span>
                      </span>
                      {selected && <ChevronRight className="h-4 w-4 text-primary" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </nav>

          <div className="min-w-0">
            <ExperienceWorkspace
              key={activeWorkType}
              meta={activeMeta}
              value={activeValue}
              customized={Boolean(configured[activeWorkType])}
              stage={stage}
              onStageChange={setStage}
              onChange={(value) => update(activeWorkType, value)}
            />
          </div>
        </div>
      </section>
    </div>
  );
}

function ExperienceWorkspace({
  meta,
  value,
  customized,
  stage,
  onStageChange,
  onChange,
}: {
  meta: typeof WORK_TYPES[number];
  value: IncidentWorkExperience;
  customized: boolean;
  stage: EditorStage;
  onStageChange: (stage: EditorStage) => void;
  onChange: (value: IncidentWorkExperience) => void;
}) {
  const [activeSectionId, setActiveSectionId] = useState(value.sections[0]?.id ?? '');
  const [editingFieldKey, setEditingFieldKey] = useState<string | null>(null);
  const [previewOutcome, setPreviewOutcome] = useState(value.outcomes[0]?.code ?? '');
  const activeSectionIndex = Math.max(0, value.sections.findIndex((section) => section.id === activeSectionId));
  const activeSection = value.sections[activeSectionIndex];
  const editingField = value.fields.find((field) => field.key === editingFieldKey);

  const patchField = (key: string, patch: Partial<IncidentWorkExperienceField>) => {
    onChange({ ...value, fields: value.fields.map((field) => (field.key === key ? { ...field, ...patch } : field)) });
  };
  const move = <T,>(items: T[], index: number, delta: number) => {
    const next = [...items];
    const target = index + delta;
    if (target < 0 || target >= next.length) return items;
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  };
  const removeField = (key: string) => {
    setEditingFieldKey(null);
    onChange({
      ...value,
      fields: value.fields.filter((field) => field.key !== key),
      sections: value.sections.map((section) => ({ ...section, fieldKeys: section.fieldKeys.filter((candidate) => candidate !== key) })),
      outcomes: value.outcomes.map((outcome) => ({ ...outcome, requiredFields: outcome.requiredFields.filter((candidate) => candidate !== key) })),
    });
  };
  const addField = (sectionIndex: number) => {
    let n = value.fields.length + 1;
    while (value.fields.some((field) => field.key === `field_${n}`)) n += 1;
    const key = `field_${n}`;
    onChange({
      ...value,
      fields: [...value.fields, { key, label: 'New field', type: 'textarea', required: false, options: [] }],
      sections: value.sections.map((section, index) =>
        index === sectionIndex ? { ...section, fieldKeys: [...section.fieldKeys, key] } : section,
      ),
    });
    setEditingFieldKey(key);
  };
  const duplicateField = (field: IncidentWorkExperienceField, sectionIndex: number, fieldIndex: number) => {
    let n = 2;
    let key = `${field.key}_copy`;
    while (value.fields.some((candidate) => candidate.key === key)) key = `${field.key}_copy_${n++}`;
    const clone = { ...field, key, label: `${field.label} copy`, options: [...field.options] };
    onChange({
      ...value,
      fields: [...value.fields, clone],
      sections: value.sections.map((section, index) => {
        if (index !== sectionIndex) return section;
        const fieldKeys = [...section.fieldKeys];
        fieldKeys.splice(fieldIndex + 1, 0, key);
        return { ...section, fieldKeys };
      }),
    });
    setEditingFieldKey(key);
  };

  return (
    <section data-testid={`incident-experience-${meta.key}`}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xl font-black">{meta.label}</h3>
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${customized ? 'bg-primary/10 text-primary' : 'bg-surface-container-high text-on-surface-variant'}`}>
              {customized ? 'Customized' : 'Professional default'}
            </span>
          </div>
          <p className="mt-1 text-sm text-on-surface-variant">{meta.description}</p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          leadingIcon={<RotateCcw className="h-4 w-4" />}
          onClick={() => {
            onChange(defaultIncidentWorkExperience(meta.key));
            setEditingFieldKey(null);
          }}
        >
          Restore default
        </Button>
      </header>

      <div className="mt-5 grid items-start gap-5 min-[1750px]:grid-cols-[minmax(0,1fr)_21rem]">
        <main className="min-w-0">
          {stage === 'basics' && (
            <BasicsStage value={value} onChange={onChange} onContinue={() => onStageChange('sections')} />
          )}
          {stage === 'sections' && activeSection && (
            <SectionsStage
              value={value}
              activeSectionIndex={activeSectionIndex}
              editingField={editingField}
              onActiveSectionChange={(id) => {
                setActiveSectionId(id);
                setEditingFieldKey(null);
              }}
              onEditingFieldChange={setEditingFieldKey}
              patchField={patchField}
              removeField={removeField}
              duplicateField={duplicateField}
              addField={addField}
              move={move}
              onChange={onChange}
            />
          )}
          {stage === 'outcomes' && (
            <OutcomesStage value={value} onChange={onChange} previewOutcome={previewOutcome} onPreviewOutcomeChange={setPreviewOutcome} />
          )}
        </main>
        <Preview value={value} outcomeCode={previewOutcome} onOutcomeChange={setPreviewOutcome} />
      </div>
    </section>
  );
}

function BasicsStage({ value, onChange, onContinue }: { value: IncidentWorkExperience; onChange: (value: IncidentWorkExperience) => void; onContinue: () => void }) {
  return (
    <div className="rounded-2xl border border-border/50 bg-surface-container p-5 lg:p-6">
      <StageHeading icon={<FileText className="h-5 w-5" />} title="Form basics" description="Give operators a clear title and explain what a good submission should accomplish." />
      <div className="mt-6 space-y-5">
        <Text label="Form title" value={value.title} onChange={(title) => onChange({ ...value, title })} hint="Shown at the top of the completion dialog." />
        <TextArea label="Purpose" value={value.summary} onChange={(summary) => onChange({ ...value, summary })} hint="One short instruction that explains the quality expected from the operator." rows={3} />
      </div>
      <div className="mt-6 flex justify-end">
        <Button onClick={onContinue} trailingIcon={<ChevronRight className="h-4 w-4" />}>Continue to sections</Button>
      </div>
    </div>
  );
}

function SectionsStage({
  value,
  activeSectionIndex,
  editingField,
  onActiveSectionChange,
  onEditingFieldChange,
  patchField,
  removeField,
  duplicateField,
  addField,
  move,
  onChange,
}: {
  value: IncidentWorkExperience;
  activeSectionIndex: number;
  editingField?: IncidentWorkExperienceField;
  onActiveSectionChange: (id: string) => void;
  onEditingFieldChange: (key: string | null) => void;
  patchField: (key: string, patch: Partial<IncidentWorkExperienceField>) => void;
  removeField: (key: string) => void;
  duplicateField: (field: IncidentWorkExperienceField, sectionIndex: number, fieldIndex: number) => void;
  addField: (sectionIndex: number) => void;
  move: <T>(items: T[], index: number, delta: number) => T[];
  onChange: (value: IncidentWorkExperience) => void;
}) {
  const section = value.sections[activeSectionIndex];
  const sectionFields = section.fieldKeys.flatMap((key) => {
    const field = value.fields.find((candidate) => candidate.key === key);
    return field ? [field] : [];
  });

  const addSection = () => {
    let n = value.sections.length + 1;
    while (value.sections.some((candidate) => candidate.id === `section_${n}`)) n += 1;
    const id = `section_${n}`;
    onChange({ ...value, sections: [...value.sections, { id, title: 'New section', description: '', fieldKeys: [] }] });
    onActiveSectionChange(id);
  };
  const removeSection = () => {
    const removed = new Set(section.fieldKeys);
    const nextSections = value.sections.filter((_, index) => index !== activeSectionIndex);
    onChange({
      ...value,
      sections: nextSections,
      fields: value.fields.filter((field) => !removed.has(field.key)),
      outcomes: value.outcomes.map((outcome) => ({ ...outcome, requiredFields: outcome.requiredFields.filter((key) => !removed.has(key)) })),
    });
    onActiveSectionChange(nextSections[Math.max(0, activeSectionIndex - 1)]?.id ?? nextSections[0]?.id ?? '');
  };

  return (
    <div>
      <StageHeading icon={<ClipboardList className="h-5 w-5" />} title="Form sections" description="Work on one section and one field at a time. Changes appear immediately in the preview." />
      <div className="mt-5 space-y-4">
        <aside className="rounded-2xl border border-border/50 bg-surface-container p-3">
          <div className="flex items-center justify-between px-1 pb-2">
            <p className="text-[11px] font-black uppercase tracking-wider text-on-surface-variant">Sections</p>
            <span className="text-xs font-bold text-on-surface-variant">{value.sections.length}</span>
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2 min-[1750px]:grid-cols-3">
            {value.sections.map((item, index) => {
              const selected = index === activeSectionIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-current={selected ? 'true' : undefined}
                  onClick={() => onActiveSectionChange(item.id)}
                  className={`flex w-full items-center gap-2 rounded-xl border px-3 py-3 text-left transition ${selected ? 'border-primary/40 bg-primary/10' : 'border-transparent hover:bg-surface-container-high'}`}
                >
                  <GripVertical className="h-4 w-4 shrink-0 text-on-surface-variant/50" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-black">{item.title || `Section ${index + 1}`}</span>
                    <span className="block text-[10px] text-on-surface-variant">{item.fieldKeys.length} fields</span>
                  </span>
                  {selected && <ChevronRight className="h-4 w-4 text-primary" />}
                </button>
              );
            })}
          </div>
          <Button className="mt-3 w-full" size="sm" variant="secondary" leadingIcon={<Plus className="h-4 w-4" />} onClick={addSection}>Add section</Button>
        </aside>

        <section className="min-w-0 rounded-2xl border border-border/50 bg-surface-container p-4 lg:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="grid min-w-0 flex-1 gap-3 md:grid-cols-2">
              <Text
                label="Section title"
                value={section.title}
                onChange={(title) => onChange({ ...value, sections: value.sections.map((item, index) => index === activeSectionIndex ? { ...item, title } : item) })}
              />
              <Text
                label="Operator guidance"
                value={section.description ?? ''}
                onChange={(description) => onChange({ ...value, sections: value.sections.map((item, index) => index === activeSectionIndex ? { ...item, description } : item) })}
              />
            </div>
            <div className="flex gap-1">
              <IconButton aria-label="Move section up" icon={<ArrowUp className="h-4 w-4" />} disabled={activeSectionIndex === 0} onClick={() => onChange({ ...value, sections: move(value.sections, activeSectionIndex, -1) })} />
              <IconButton aria-label="Move section down" icon={<ArrowDown className="h-4 w-4" />} disabled={activeSectionIndex === value.sections.length - 1} onClick={() => onChange({ ...value, sections: move(value.sections, activeSectionIndex, 1) })} />
              {value.sections.length > 1 && <IconButton aria-label="Remove section" icon={<Trash2 className="h-4 w-4" />} onClick={removeSection} />}
            </div>
          </div>

          <div className="mt-5 space-y-2">
            {sectionFields.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border p-8 text-center">
                <ClipboardList className="mx-auto h-7 w-7 text-on-surface-variant" />
                <p className="mt-3 text-sm font-black">This section has no fields yet</p>
                <p className="mt-1 text-xs text-on-surface-variant">Add the first question operators should answer here.</p>
              </div>
            )}
            {sectionFields.map((field, fieldIndex) => {
              const expanded = editingField?.key === field.key;
              return (
                <article key={field.key} className={`overflow-hidden rounded-2xl border transition ${expanded ? 'border-primary/50 bg-surface shadow-sm' : 'border-border/40 bg-surface-container-low'}`}>
                  <div className="flex items-center gap-2 p-3">
                    <button
                      type="button"
                      aria-expanded={expanded}
                      onClick={() => onEditingFieldChange(expanded ? null : field.key)}
                      className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${expanded ? 'bg-primary text-primary-foreground' : 'bg-surface-container-high text-on-surface-variant'}`}>
                        <AlignLeft className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-black">{field.label || 'Untitled field'}</span>
                          {field.required && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-black uppercase text-primary">Required</span>}
                          {field.evidence && <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[9px] font-black uppercase text-warning">Evidence</span>}
                        </span>
                        <span className="mt-0.5 block text-[11px] text-on-surface-variant">{FIELD_TYPES.find((item) => item.value === field.type)?.label} · {field.key}</span>
                      </span>
                      {expanded ? <ChevronDown className="h-4 w-4 text-primary" /> : <Settings2 className="h-4 w-4 text-on-surface-variant" />}
                    </button>
                    <div className="flex shrink-0 gap-0.5">
                      <IconButton aria-label={`Move ${field.label} up`} icon={<ArrowUp className="h-4 w-4" />} disabled={fieldIndex === 0} onClick={() => onChange({ ...value, sections: value.sections.map((item, index) => index === activeSectionIndex ? { ...item, fieldKeys: move(item.fieldKeys, fieldIndex, -1) } : item) })} />
                      <IconButton aria-label={`Move ${field.label} down`} icon={<ArrowDown className="h-4 w-4" />} disabled={fieldIndex === sectionFields.length - 1} onClick={() => onChange({ ...value, sections: value.sections.map((item, index) => index === activeSectionIndex ? { ...item, fieldKeys: move(item.fieldKeys, fieldIndex, 1) } : item) })} />
                    </div>
                  </div>
                  {expanded && (
                    <FieldEditor
                      field={field}
                      onPatch={(patch) => patchField(field.key, patch)}
                      onDuplicate={() => duplicateField(field, activeSectionIndex, fieldIndex)}
                      onRemove={() => removeField(field.key)}
                    />
                  )}
                </article>
              );
            })}
          </div>
          <Button className="mt-4" size="sm" variant="secondary" leadingIcon={<Plus className="h-4 w-4" />} onClick={() => addField(activeSectionIndex)}>Add field</Button>
        </section>
      </div>
    </div>
  );
}

function FieldEditor({ field, onPatch, onDuplicate, onRemove }: { field: IncidentWorkExperienceField; onPatch: (patch: Partial<IncidentWorkExperienceField>) => void; onDuplicate: () => void; onRemove: () => void }) {
  const hasOptions = ['select', 'multiselect', 'diagnostic_checks'].includes(field.type);
  return (
    <div className="border-t border-border/40 bg-surface-container-low/60 p-4 lg:p-5">
      <div className="grid gap-4 md:grid-cols-2">
        <Text label="Field label" value={field.label} onChange={(label) => onPatch({ label })} hint="Use a short question or instruction." />
        <label className="block text-xs font-black">
          Input type
          <select className="input-field mt-1.5 w-full" value={field.type} onChange={(event) => onPatch({ type: event.target.value as IncidentWorkExperienceField['type'] })}>
            {FIELD_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <span className="mt-1 block text-[10px] font-normal text-on-surface-variant">Controls how the operator captures this information.</span>
        </label>
        <TextArea label="Placeholder or example" value={field.placeholder ?? ''} onChange={(placeholder) => onPatch({ placeholder })} rows={2} hint="Show an example of a good answer." />
        <TextArea label="Help for the operator" value={field.helpText ?? ''} onChange={(helpText) => onPatch({ helpText })} rows={2} hint="Persistent guidance displayed below the field." />
      </div>
      {hasOptions && (
        <div className="mt-4">
          <TextArea
            label={field.type === 'diagnostic_checks' ? 'Check categories' : 'Available options'}
            value={field.options.join('\n')}
            onChange={(raw) => onPatch({ options: raw.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean) })}
            rows={Math.max(3, Math.min(6, field.options.length + 1))}
            hint="Enter one option per line. Operators will only be able to select these values."
          />
        </div>
      )}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <ToggleCard label="Always required" description="The form cannot be submitted without this field." checked={field.required} onChange={(required) => onPatch({ required })} />
        <ToggleCard label="Counts as evidence" description="Treat this answer as part of the auditable evidence set." checked={Boolean(field.evidence)} onChange={(evidence) => onPatch({ evidence })} />
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border/40 pt-4">
        <p className="text-[10px] text-on-surface-variant">Technical key: <code className="rounded bg-surface-container-high px-1.5 py-1">{field.key}</code></p>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" leadingIcon={<Copy className="h-4 w-4" />} onClick={onDuplicate}>Duplicate</Button>
          <Button size="sm" variant="ghost" className="text-destructive" leadingIcon={<Trash2 className="h-4 w-4" />} onClick={onRemove}>Remove</Button>
        </div>
      </div>
    </div>
  );
}

function OutcomesStage({ value, onChange, previewOutcome, onPreviewOutcomeChange }: { value: IncidentWorkExperience; onChange: (value: IncidentWorkExperience) => void; previewOutcome: string; onPreviewOutcomeChange: (code: string) => void }) {
  const activeIndex = Math.max(0, value.outcomes.findIndex((outcome) => outcome.code === previewOutcome));
  const outcome = value.outcomes[activeIndex];
  if (!outcome) return null;

  return (
    <div>
      <StageHeading icon={<ListChecks className="h-5 w-5" />} title="Outcome requirements" description="Outcome codes are fixed for workflow safety. You control the labels, guidance and information required for each decision." />
      <div className="mt-5 space-y-4">
        <aside className="grid gap-2 sm:grid-cols-2">
          {value.outcomes.map((item) => {
            const selected = item.code === outcome.code;
            return (
              <button
                key={item.code}
                type="button"
                aria-pressed={selected}
                onClick={() => onPreviewOutcomeChange(item.code)}
                className={`w-full rounded-2xl border p-3 text-left transition ${selected ? 'border-primary/50 bg-primary/10' : 'border-border/50 bg-surface-container hover:bg-surface-container-high'}`}
              >
                <div className="flex items-center gap-2">
                  <CircleDot className={`h-4 w-4 ${selected ? 'text-primary' : 'text-on-surface-variant'}`} />
                  <span className="text-xs font-black">{item.label}</span>
                </div>
                <p className="mt-1 pl-6 text-[10px] text-on-surface-variant">{item.requiredFields.length} required fields</p>
              </button>
            );
          })}
        </aside>
        <section className="rounded-2xl border border-border/50 bg-surface-container p-5">
          <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2">
            <p className="text-[10px] font-black uppercase tracking-wider text-primary">Workflow code · read only</p>
            <code className="mt-1 block text-xs font-bold">{outcome.code}</code>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Text label="Label shown to operators" value={outcome.label} onChange={(label) => onChange({ ...value, outcomes: value.outcomes.map((item, index) => index === activeIndex ? { ...item, label } : item) })} />
            <Text label="Decision guidance" value={outcome.description ?? ''} onChange={(description) => onChange({ ...value, outcomes: value.outcomes.map((item, index) => index === activeIndex ? { ...item, description } : item) })} />
          </div>
          <div className="mt-5">
            <p className="text-xs font-black">Required information for this outcome</p>
            <p className="mt-1 text-[11px] text-on-surface-variant">Choose the fields an operator must complete before selecting “{outcome.label}”.</p>
            <div className="mt-3 space-y-3">
              {value.sections.map((section) => {
                const fields = section.fieldKeys.flatMap((key) => {
                  const field = value.fields.find((candidate) => candidate.key === key);
                  return field ? [field] : [];
                });
                if (fields.length === 0) return null;
                return (
                  <div key={section.id} className="rounded-xl border border-border/40 bg-surface-container-low p-3">
                    <p className="text-[11px] font-black uppercase tracking-wide text-on-surface-variant">{section.title}</p>
                    <div className="mt-2 grid gap-2 md:grid-cols-2">
                      {fields.map((field) => (
                        <ToggleCard
                          key={field.key}
                          compact
                          label={field.label}
                          description={field.required ? 'Already required for every outcome' : 'Required only for this outcome'}
                          checked={field.required || outcome.requiredFields.includes(field.key)}
                          disabled={field.required}
                          onChange={(checked) => onChange({
                            ...value,
                            outcomes: value.outcomes.map((item, index) => index === activeIndex ? {
                              ...item,
                              requiredFields: checked ? [...new Set([...item.requiredFields, field.key])] : item.requiredFields.filter((key) => key !== field.key),
                            } : item),
                          })}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function Preview({ value, outcomeCode, onOutcomeChange }: { value: IncidentWorkExperience; outcomeCode: string; onOutcomeChange: (code: string) => void }) {
  const outcome = value.outcomes.find((item) => item.code === outcomeCode) ?? value.outcomes[0];
  const outcomeFields = new Set(value.outcomes.flatMap((item) => item.requiredFields));
  const visibleFields = outcome
    ? new Set(value.fields.filter((field) => !outcomeFields.has(field.key) || outcome.requiredFields.includes(field.key)).map((field) => field.key))
    : new Set(value.fields.map((field) => field.key));

  return (
    <aside className="h-fit overflow-hidden rounded-2xl border border-primary/25 bg-primary/5 2xl:sticky 2xl:top-4">
      <div className="border-b border-primary/15 px-4 py-3">
        <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-primary"><Eye className="h-4 w-4" />Live preview</div>
        <p className="mt-1 text-[10px] text-on-surface-variant">A simplified view of what the operator will complete.</p>
      </div>
      <div className="max-h-[72vh] overflow-y-auto p-4">
        <h4 className="text-lg font-black">{value.title || 'Untitled form'}</h4>
        <p className="mt-1 text-xs leading-5 text-on-surface-variant">{value.summary || 'Add a short purpose for this form.'}</p>
        {value.outcomes.length > 0 && (
          <label className="mt-4 block text-[10px] font-black uppercase tracking-wider text-on-surface-variant">
            Preview outcome
            <select className="input-field mt-1.5 w-full text-xs normal-case tracking-normal" value={outcome?.code ?? ''} onChange={(event) => onOutcomeChange(event.target.value)}>
              {value.outcomes.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
            </select>
          </label>
        )}
        <div className="mt-4 space-y-3">
          {value.sections.map((section) => {
            const fields = section.fieldKeys.flatMap((key) => {
              const field = value.fields.find((item) => item.key === key);
              return field && visibleFields.has(field.key) ? [field] : [];
            });
            if (fields.length === 0) return null;
            return (
              <div key={section.id} className="rounded-2xl border border-border/40 bg-surface-container-low p-3.5">
                <p className="text-sm font-black">{section.title}</p>
                {section.description && <p className="mt-0.5 text-[10px] leading-4 text-on-surface-variant">{section.description}</p>}
                <div className="mt-3 space-y-3">
                  {fields.map((field) => {
                    const required = field.required || Boolean(outcome?.requiredFields.includes(field.key));
                    return (
                      <div key={field.key}>
                        <p className="text-[11px] font-bold">{field.label}{required ? ' *' : ''}</p>
                        <div className={`mt-1.5 rounded-lg border border-border/50 bg-surface ${field.type === 'textarea' || field.type === 'list' || field.type === 'diagnostic_checks' ? 'h-12' : 'h-8'}`} />
                        {field.helpText && <p className="mt-1 text-[9px] leading-3 text-on-surface-variant">{field.helpText}</p>}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        {outcome && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-primary/20 bg-primary/10 p-3">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div><p className="text-[11px] font-black">{outcome.label}</p><p className="mt-0.5 text-[9px] leading-3 text-on-surface-variant">{outcome.description}</p></div>
          </div>
        )}
      </div>
    </aside>
  );
}

function StageHeading({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">{icon}</span><div><h4 className="font-black">{title}</h4><p className="mt-1 text-xs leading-5 text-on-surface-variant">{description}</p></div></div>;
}

function Text({ label, value, onChange, hint }: { label: string; value: string; onChange: (value: string) => void; hint?: string }) {
  return <label className="block text-xs font-black">{label}<input className="input-field mt-1.5 w-full" value={value} onChange={(event) => onChange(event.target.value)} />{hint && <span className="mt-1 block text-[10px] font-normal leading-4 text-on-surface-variant">{hint}</span>}</label>;
}

function TextArea({ label, value, onChange, hint, rows = 3 }: { label: string; value: string; onChange: (value: string) => void; hint?: string; rows?: number }) {
  return <label className="block text-xs font-black">{label}<textarea className="input-field mt-1.5 w-full resize-y" rows={rows} value={value} onChange={(event) => onChange(event.target.value)} />{hint && <span className="mt-1 block text-[10px] font-normal leading-4 text-on-surface-variant">{hint}</span>}</label>;
}

function ToggleCard({ label, description, checked, disabled = false, compact = false, onChange }: { label: string; description: string; checked: boolean; disabled?: boolean; compact?: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className={`flex cursor-pointer items-start gap-3 rounded-xl border transition ${compact ? 'p-2.5' : 'p-3'} ${checked ? 'border-primary/40 bg-primary/5' : 'border-border/50 bg-surface'} ${disabled ? 'cursor-not-allowed opacity-70' : 'hover:border-primary/30'}`}>
      <input className="mt-0.5" type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      <span><span className="block text-xs font-black">{label}</span><span className="mt-0.5 block text-[10px] leading-4 text-on-surface-variant">{description}</span></span>
    </label>
  );
}
