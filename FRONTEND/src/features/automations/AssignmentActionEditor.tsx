import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { getWorkflowAssignmentDirectory } from './api';
import type { WorkflowNodeData } from './CustomNodes';

interface AssignmentActionEditorProps {
  data: WorkflowNodeData;
  readOnly: boolean;
  onChange: (data: Partial<WorkflowNodeData>) => void;
}

export default function AssignmentActionEditor({ data, readOnly, onChange }: AssignmentActionEditorProps) {
  // El modo vive en el nodo. Antes lo imponía el bloque elegido en la paleta, y
  // cambiar de equipo a persona obligaba a borrar el nodo y reconfigurarlo.
  const mode: 'team' | 'user' = data.assignmentMode === 'user' ? 'user' : 'team';
  const directory = useQuery({
    queryKey: ['organization', 'assignment-directory', 'tickets'],
    queryFn: getWorkflowAssignmentDirectory,
    enabled: !readOnly,
    retry: 1,
    staleTime: 5 * 60 * 1000,
  });

  const departments = directory.data?.departments ?? [];
  const teams = (directory.data?.teams ?? []).filter((team) => team.department_id === data.departmentId);
  const assignees = (directory.data?.assignees ?? []).filter((assignee) => assignee.team_id === data.teamId);

  if (readOnly) {
    return (
      <div className="mt-5 space-y-2 rounded-xl border border-border/40 bg-on-surface/5 p-4 text-xs text-on-surface-variant" data-testid="assignment-summary">
        <p><span className="font-black text-on-surface">Mode:</span> {mode === 'user' ? 'Assign to a person' : 'Assign to a team'}</p>
        <p><span className="font-black text-on-surface">Area:</span> {String(data.departmentName || data.departmentId || 'Unavailable')}</p>
        <p><span className="font-black text-on-surface">Team:</span> {String(data.teamName || data.teamId || 'Unavailable')}</p>
        {mode === 'user' && <p><span className="font-black text-on-surface">Person:</span> {String(data.assigneeName || data.assigneeUserId || 'Unavailable')}</p>}
        <p><span className="font-black text-on-surface">If already assigned:</span> {data.overwriteExisting ? 'Reassign' : 'Keep current assignment'}</p>
      </div>
    );
  }

  if (directory.isLoading) {
    return <div className="mt-5 rounded-xl border border-border/40 bg-on-surface/5 p-4 text-xs text-on-surface-variant">Loading areas, teams, and assignable people…</div>;
  }

  if (directory.isError) {
    return (
      <div className="mt-5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-100" role="alert">
        <div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><div><p className="font-black">Could not query Organization</p><p className="mt-1 opacity-80">{directory.error.message}</p></div></div>
        <button type="button" onClick={() => void directory.refetch()} className="secondary-button mt-3 px-3"><RefreshCw className="h-3.5 w-3.5" /> Retry directory</button>
      </div>
    );
  }

  if (departments.length === 0) {
    return <div className="mt-5 rounded-xl border border-dashed border-border/50 p-4 text-xs text-on-surface-variant">Organization returned no areas with staff authorized to work on tickets.</div>;
  }

  return (
    <div className="mt-5 space-y-4" data-testid="assignment-editor">
      <fieldset className="rounded-xl border border-border/40 bg-on-surface/5 p-3">
        <legend className="px-1 text-[10px] font-black uppercase tracking-wider text-on-surface-variant">Mode</legend>
        <div className="mt-1 grid grid-cols-2 gap-2">
          {([
            { valor: 'team' as const, etiqueta: 'To a team', ayuda: 'Work is assigned to the team without a specific owner.' },
            { valor: 'user' as const, etiqueta: 'To a person', ayuda: 'Work is assigned to a team member.' },
          ]).map((opcion) => (
            <button
              key={opcion.valor}
              type="button"
              data-testid={`assignment-mode-${opcion.valor}`}
              aria-pressed={mode === opcion.valor}
              title={opcion.ayuda}
              onClick={() => onChange(opcion.valor === 'team'
                // Cambiar a equipo LIMPIA la persona: el contrato del backend no
                // admite assignee_user_id en modo team, y dejarlo colgando haría
                // que el diagrama mostrara una persona que no se va a asignar.
                ? { assignmentMode: 'team', assigneeUserId: '', assigneeName: '' }
                : { assignmentMode: 'user' })}
              className={`rounded-lg border px-3 py-2 text-xs font-bold transition ${mode === opcion.valor
                ? 'border-primary/60 bg-primary/15 text-on-surface'
                : 'border-border/40 bg-transparent text-on-surface-variant hover:border-border'}`}
            >
              {opcion.etiqueta}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="block text-[10px] font-black uppercase tracking-wider text-on-surface-variant">Area
        <select
          value={String(data.departmentId ?? '')}
          onChange={(event) => {
            const selected = departments.find((item) => item.id === event.target.value);
            onChange({
              assignmentMode: mode,
              departmentId: event.target.value,
              departmentName: selected?.nombre ?? '',
              teamId: '',
              teamName: '',
              assigneeUserId: '',
              assigneeName: '',
            });
          }}
          className="input-field mt-2 w-full normal-case"
        >
          <option value="">Select an area</option>
          {departments.map((department) => <option key={department.id} value={department.id}>{department.nombre}</option>)}
        </select>
      </label>

      <label className="block text-[10px] font-black uppercase tracking-wider text-on-surface-variant">Team
        <select
          disabled={!data.departmentId || teams.length === 0}
          value={String(data.teamId ?? '')}
          onChange={(event) => {
            const selected = teams.find((item) => item.id === event.target.value);
            onChange({
              assignmentMode: mode,
              teamId: event.target.value,
              teamName: selected?.nombre ?? '',
              assigneeUserId: '',
              assigneeName: '',
            });
          }}
          className="input-field mt-2 w-full normal-case disabled:opacity-50"
        >
          <option value="">Select a team</option>
          {teams.map((team) => <option key={team.id} value={team.id}>{team.nombre}</option>)}
        </select>
        {data.departmentId && teams.length === 0 && <span className="mt-2 block normal-case font-medium text-amber-300">This area has no assignable teams for tickets.</span>}
      </label>

      {mode === 'user' && (
        <label className="block text-[10px] font-black uppercase tracking-wider text-on-surface-variant">Person
          <select
            disabled={!data.teamId || assignees.length === 0}
            value={String(data.assigneeUserId ?? '')}
            onChange={(event) => {
              const selected = assignees.find((item) => item.id === event.target.value);
              onChange({ assigneeUserId: event.target.value, assigneeName: selected?.nombre ?? '' });
            }}
            className="input-field mt-2 w-full normal-case disabled:opacity-50"
          >
            <option value="">Select a person</option>
            {assignees.map((assignee) => <option key={assignee.id} value={assignee.id}>{assignee.nombre} · {assignee.email}</option>)}
          </select>
          {data.teamId && assignees.length === 0 && <span className="mt-2 block normal-case font-medium text-amber-300">This team has no active members with permission to work on tickets.</span>}
        </label>
      )}

      <label className="flex items-start gap-3 rounded-xl border border-border/40 bg-on-surface/5 p-3 text-xs text-on-surface-variant">
        <input type="checkbox" checked={data.overwriteExisting === true} onChange={(event) => onChange({ overwriteExisting: event.target.checked })} className="mt-0.5 h-4 w-4 accent-primary" />
        <span><strong className="block text-on-surface">Reassign if already assigned</strong>If disabled, execution will be skipped and the existing assignment preserved.</span>
      </label>
      {data.overwriteExisting === true && <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">This automation may overwrite an existing assignment. Reassignment will be audited.</div>}
    </div>
  );
}
