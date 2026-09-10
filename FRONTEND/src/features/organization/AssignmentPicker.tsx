import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Select } from '@/components/ui';
import { LoadingState, ErrorState } from '@/components/ui/states';
import { getAssignmentDirectory, type AssignmentCapability } from './directory';

export interface AssignmentTarget {
  departmentId: string;
  teamId: string;
  assigneeId?: string;
}

export interface AssignmentPickerProps {
  capability?: AssignmentCapability;
  value: AssignmentTarget | null;
  onChange: (value: AssignmentTarget | null) => void;
  /** Whether picking a specific person is required, or a team-only
   *  assignment is a valid destination on its own. */
  requireAssignee?: boolean;
}

/**
 * Department → Team → Assignee, resolved against the real organizational
 * directory (`GET /organization/assignment-directory`) — replaces every
 * `window.prompt('Agent ID:')` that used to collect a raw technical id by
 * hand. Picking a department narrows the team list; picking a team narrows
 * the assignee list; changing a higher level clears what's below it so the
 * three selections can never end up inconsistent with each other.
 */
export function AssignmentPicker({ capability = 'tickets', value, onChange, requireAssignee = false }: AssignmentPickerProps) {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['assignment-directory', capability],
    queryFn: () => getAssignmentDirectory(capability),
    staleTime: 60_000,
  });

  const [departmentId, setDepartmentId] = useState(value?.departmentId ?? '');
  const [teamId, setTeamId] = useState(value?.teamId ?? '');
  const [assigneeId, setAssigneeId] = useState(value?.assigneeId ?? '');

  const teams = useMemo(
    () => (data?.teams ?? []).filter((team) => team.department_id === departmentId),
    [data, departmentId],
  );
  const assignees = useMemo(
    () => (data?.assignees ?? []).filter((person) => person.team_id === teamId),
    [data, teamId],
  );

  useEffect(() => {
    if (!departmentId) {
      onChange(null);
      return;
    }
    if (!teamId) {
      onChange(null);
      return;
    }
    if (requireAssignee && !assigneeId) {
      onChange(null);
      return;
    }
    onChange({ departmentId, teamId, assigneeId: assigneeId || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId, teamId, assigneeId, requireAssignee]);

  if (isLoading) return <LoadingState label="Loading departments and teams…" compact />;
  if (isError) {
    return (
      <ErrorState
        error={error}
        title="We couldn't load the organization directory"
        onRetry={() => void refetch()}
        compact
      />
    );
  }

  return (
    <div className="space-y-3">
      <Select
        label="Department"
        required
        value={departmentId}
        placeholder="Select a department…"
        options={(data?.departments ?? []).map((d) => ({ value: d.id, label: d.nombre }))}
        onChange={(e) => {
          setDepartmentId(e.target.value);
          setTeamId('');
          setAssigneeId('');
        }}
      />
      <Select
        label="Team"
        required
        value={teamId}
        disabled={!departmentId}
        placeholder={departmentId ? 'Select a team…' : 'Select a department first'}
        options={teams.map((team) => ({ value: team.id, label: team.nombre }))}
        onChange={(e) => {
          setTeamId(e.target.value);
          setAssigneeId('');
        }}
      />
      <Select
        label={requireAssignee ? 'Assignee' : 'Assignee (optional — team-only is a valid destination)'}
        required={requireAssignee}
        value={assigneeId}
        disabled={!teamId}
        placeholder={
          !teamId ? 'Select a team first' : assignees.length === 0 ? 'No assignable people on this team' : 'Select a person…'
        }
        options={assignees.map((person) => ({ value: person.id, label: `${person.nombre} · ${person.email}` }))}
        onChange={(e) => setAssigneeId(e.target.value)}
      />
    </div>
  );
}
