import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, FileText, Plus, RefreshCw, Search, ServerCrash, Sparkles, Workflow, X, Zap } from 'lucide-react';
import { useAuth } from '@/features/auth/useAuth';
import { PERMISSIONS } from '@/features/auth/permissions';
import { deactivateWorkflow, getWorkflowAssignmentDirectory, listWorkflows, saveWorkflowDraft, type SaveDraftInput } from './api';
import { useAutomationsBasePath } from './basePath';

import { buildBlueprintADraft, buildBlueprintBDraft } from './guidedBlueprints';

const actionLabels: Record<string, string> = {
  notificar_interesados: 'Notify creator and stakeholders',
  asignar_automatico: 'Automatic assignment (legacy)',
	create_incident_work_item: 'Create incident work',
	create_service_rfc: 'Create Service RFC',
  marcar_sla_en_riesgo: 'SLA timer (legacy)',
  marcar_sla_incumplido: 'SLA breach (legacy)',
  escalar_ait: 'Escalation to IT (legacy)',
};

export default function AutomationsList() {
  const navigate = useNavigate();
  const basePath = useAutomationsBasePath();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);

  const canManage = can(PERMISSIONS.automationsManage);
  const workflows = useQuery({
    queryKey: ['workflows'],
    queryFn: listWorkflows,
    retry: 1,
  });

  const directoryQuery = useQuery({
    queryKey: ['workflow-assignment-directory'],
    queryFn: getWorkflowAssignmentDirectory,
    enabled: showTemplateModal,
    retry: false,
  });

  const [selectedDeptId, setSelectedDeptId] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState('');

  const openTemplateModal = () => {
    setSelectedDeptId('');
    setSelectedTeamId('');
    setTemplateError(null);
    setShowTemplateModal(true);
    void directoryQuery.refetch();
  };

  const closeTemplateModal = () => {
    setShowTemplateModal(false);
    setSelectedDeptId('');
    setSelectedTeamId('');
    setTemplateError(null);
  };

  const availableTeams = selectedDeptId
    ? (directoryQuery.data?.teams ?? []).filter((t) => t.department_id === selectedDeptId)
    : [];

  const selectedTeam = availableTeams.find((t) => t.id === selectedTeamId);
  const isTeamValid = Boolean(selectedTeam && selectedTeam.department_id === selectedDeptId);
  const isTeamSelected = Boolean(selectedTeamId && isTeamValid);
  const teamAssignees = isTeamSelected
    ? (directoryQuery.data?.assignees ?? []).filter((a) => a.team_id === selectedTeamId)
    : [];
  const isZeroMembers = isTeamSelected && teamAssignees.length === 0;

  const canCreateA =
    directoryQuery.isSuccess &&
    Boolean(selectedDeptId) &&
    isTeamValid &&
    !directoryQuery.isLoading &&
    !directoryQuery.isError;

  const createDraft = useMutation({
    mutationFn: (input: SaveDraftInput) => saveWorkflowDraft(input),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ['workflows'] });
      setShowTemplateModal(false);
      navigate(`${basePath}/${created.id}`);
    },
    onError: (err: Error) => {
      setTemplateError(err.message);
    },
  });

  const handleCreateBlueprintA = () => {
    setTemplateError(null);
    if (!selectedDeptId || !selectedTeamId) return;
    const dept = directoryQuery.data?.departments.find((d) => d.id === selectedDeptId);
    const team = directoryQuery.data?.teams.find((t) => t.id === selectedTeamId && t.department_id === selectedDeptId);
    if (!dept || !team) {
      setTemplateError('Please explicitly select a department and a team belonging to it.');
      return;
    }

    const payload = buildBlueprintADraft({
      departmentId: dept.id,
      departmentName: dept.nombre,
      teamId: team.id,
      teamName: team.nombre,
    });

    createDraft.mutate(payload);
  };

  const handleCreateBlueprintB = () => {
    setTemplateError(null);
    const payload = buildBlueprintBDraft();
    createDraft.mutate(payload);
  };

  const deactivate = useMutation({
    mutationFn: deactivateWorkflow,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['workflows'] }),
  });
  const normalizedSearch = search.trim().toLowerCase();
  const visible = (workflows.data ?? []).filter((item) =>
    !normalizedSearch ||
    item.categoria_id.toLowerCase().includes(normalizedSearch) ||
    item.reglas?.some((rule) => `${rule.accion} ${rule.condicion ?? ''}`.toLowerCase().includes(normalizedSearch)),
  );

  return (
    <div className="p-6 lg:p-8 w-full h-full overflow-y-auto" data-testid="automations-list">
      <div className="flex items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black text-on-surface tracking-wide mb-1 flex items-center gap-3">
            <Workflow className="w-6 h-6 text-primary" /> Automations
          </h1>
          <p className="text-sm text-on-surface-variant max-w-2xl">
            Workflows published and executed by the owning module. The catalog only references them.
          </p>
        </div>
        {canManage && (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={openTemplateModal}
              className="secondary-button"
              data-testid="create-from-template-button"
            >
              <Sparkles className="w-5 h-5 text-primary" /> Guided blueprints
            </button>
            <button onClick={() => navigate(`${basePath}/new`)} className="primary-button" data-testid="create-workflow-button">
              <Plus className="w-5 h-5" /> Create workflow
            </button>
          </div>
        )}
      </div>

      {showTemplateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          data-testid="template-selection-modal"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeTemplateModal();
          }}
        >
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-border/60 bg-surface-container-low p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-border/30 pb-4">
              <div>
                <h2 className="flex items-center gap-2 text-xl font-black text-on-surface">
                  <Sparkles className="h-6 w-6 text-primary" /> Guided Workflow Blueprints
                </h2>
                <p className="mt-1 text-sm text-on-surface-variant">
                  Create reviewable drafts for governed operational workflows. Blueprints are created as <strong>Drafts</strong> and are never published automatically.
                </p>
              </div>
              <button
                type="button"
                onClick={closeTemplateModal}
                className="secondary-button px-3"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {templateError && (
              <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
                {templateError}
              </div>
            )}

            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Blueprint A Card */}
              <div className="rounded-2xl border border-border/50 bg-surface-container p-5 flex flex-col justify-between" data-testid="blueprint-a-card">
                <div>
                  <div className="flex items-center gap-2 text-primary font-bold text-sm mb-2">
                    <FileText className="w-4 h-4" /> Blueprint A
                  </div>
                  <h3 className="text-lg font-bold text-on-surface mb-2">Incident IT Triage & Work Item</h3>
                  <p className="text-xs text-on-surface-variant mb-4 leading-relaxed">
                    Triggered on <strong>INC Created</strong>. Automatically routes to IT and creates an initial troubleshooting work item checklist. Uses strict <code>on_omitted: stop</code>: continues if already at destination, safely stops if assigned elsewhere.
                  </p>
                  <div className="space-y-3 mb-4 text-xs">
                    {directoryQuery.isLoading && (
                      <div data-testid="directory-loading" className="rounded-xl border border-border/30 bg-on-surface/5 p-3 text-xs text-on-surface-variant flex items-center gap-2">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-primary" />
                        Loading organization directory…
                      </div>
                    )}

                    {directoryQuery.isError && (
                      <div data-testid="directory-error" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
                        <div className="flex items-center gap-2 font-bold mb-1">
                          <AlertTriangle className="w-4 h-4 text-red-400" /> Organization directory unavailable
                        </div>
                        <p className="text-red-300/80">Could not retrieve departments and teams from organization_service. Blueprint A creation is disabled.</p>
                        <button
                          type="button"
                          onClick={() => void directoryQuery.refetch()}
                          className="secondary-button mt-2 text-xs py-1"
                          data-testid="directory-retry"
                        >
                          <RefreshCw className="w-3 h-3" /> Retry
                        </button>
                      </div>
                    )}

                    {directoryQuery.isSuccess && directoryQuery.data.departments.length === 0 && (
                      <div data-testid="directory-empty" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                        No departments found in organization directory.
                      </div>
                    )}

                    {directoryQuery.isSuccess && directoryQuery.data.departments.length > 0 && (
                      <>
                        <div>
                          <label htmlFor="blueprint-a-dept-select" className="block font-bold text-on-surface-variant mb-1">Target Department:</label>
                          <select
                            id="blueprint-a-dept-select"
                            className="input-field w-full text-xs"
                            data-testid="blueprint-a-dept-select"
                            value={selectedDeptId}
                            onChange={(e) => {
                              setSelectedDeptId(e.target.value);
                              setSelectedTeamId('');
                            }}
                          >
                            <option value="">Select a department…</option>
                            {directoryQuery.data.departments.map((d) => (
                              <option key={d.id} value={d.id}>{d.nombre}</option>
                            ))}
                          </select>
                        </div>

                        {selectedDeptId && (
                          <div>
                            <label htmlFor="blueprint-a-team-select" className="block font-bold text-on-surface-variant mb-1">Target Team:</label>
                            {availableTeams.length === 0 ? (
                              <p data-testid="no-teams-in-dept" className="text-xs text-amber-200/90 italic p-2 border border-amber-500/20 rounded-lg bg-amber-500/5">
                                No teams belong to this department.
                              </p>
                            ) : (
                              <select
                                id="blueprint-a-team-select"
                                className="input-field w-full text-xs"
                                data-testid="blueprint-a-team-select"
                                value={selectedTeamId}
                                onChange={(e) => setSelectedTeamId(e.target.value)}
                              >
                                <option value="">Select a team…</option>
                                {availableTeams.map((t) => (
                                  <option key={t.id} value={t.id}>{t.nombre}</option>
                                ))}
                              </select>
                            )}
                          </div>
                        )}

                        {isTeamSelected && isZeroMembers && (
                          <div data-testid="zero-members-warning" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                            <div className="flex items-center gap-1.5 font-bold mb-0.5">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" /> No active assignable members
                            </div>
                            The selected team has zero active members in Organization. The assignment rule will target this team without members until members are added.
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={!canCreateA || createDraft.isPending}
                  onClick={handleCreateBlueprintA}
                  className="primary-button w-full justify-center text-xs"
                  data-testid="create-blueprint-a-btn"
                >
                  <Plus className="w-4 h-4" /> Create Draft from Blueprint A
                </button>
              </div>

              {/* Blueprint B Card */}
              <div className="rounded-2xl border border-border/50 bg-surface-container p-5 flex flex-col justify-between" data-testid="blueprint-b-card">
                <div>
                  <div className="flex items-center gap-2 text-primary font-bold text-sm mb-2">
                    <FileText className="w-4 h-4" /> Blueprint B
                  </div>
                  <h3 className="text-lg font-bold text-on-surface mb-2">Incident Service Escalation to RFC</h3>
                  <p className="text-xs text-on-surface-variant mb-4 leading-relaxed">
                    Triggered on <strong>Service Required</strong> (when IT documents that field work is needed). Creates a related RFC targeting Field Services with governed Work Order specifications.
                  </p>
                  <div className="rounded-xl border border-border/30 bg-on-surface/5 p-3 text-xs mb-4">
                    <p className="font-bold text-on-surface mb-1">Configured Change Target:</p>
                    <p className="text-on-surface-variant">Field Services · Normal Change · Medium Impact/Urgency</p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={createDraft.isPending}
                  onClick={handleCreateBlueprintB}
                  className="primary-button w-full justify-center text-xs"
                  data-testid="create-blueprint-b-btn"
                >
                  <Plus className="w-4 h-4" /> Create Draft from Blueprint B
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="relative mb-6 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search automations…" className="input-field w-full pl-10" />
      </div>

      {workflows.isLoading && <p className="text-sm text-on-surface-variant">Querying the automations engine…</p>}
      {workflows.isError && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 text-amber-100" role="alert">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-black">Automations is temporarily unavailable</p>
              <p className="mt-1 text-sm text-amber-100/80">Tickets remain secure. No simulated data is shown; check workflow_service, Kafka, and Temporal.</p>
              <button type="button" onClick={() => void workflows.refetch()} className="secondary-button mt-4" data-testid="automations-retry">
                <RefreshCw className="h-4 w-4" /> Retry
              </button>
            </div>
          </div>
        </div>
      )}

      {!workflows.isLoading && !workflows.isError && visible.length === 0 && (
        <div className="rounded-3xl border border-dashed border-border/50 p-10 text-center text-on-surface-variant">
          No matching workflows found. Publish the first one to start automating.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {visible.map((flow) => {
          const statusLabel = flow.estado === 'publicado' ? 'Published' : flow.estado === 'borrador' ? 'Draft' : flow.estado === 'reemplazado' ? 'Superseded' : flow.estado === 'desactivado' ? 'Disabled' : flow.estado;
          return (
            <article key={flow.id} className="bg-surface-container-low border border-border/40 rounded-3xl p-6 flex flex-col hover:border-primary/50 transition-colors">
              <div className="flex justify-between items-start mb-4">
                <div className="w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center text-primary border border-border/50">
                  <ServerCrash className="w-5 h-5" />
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase ${flow.estado === 'publicado' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-border/50 text-on-surface-variant'}`}>
                  {statusLabel}
                </span>
              </div>
              <h2 className="text-lg font-bold text-on-surface">{flow.categoria_id}</h2>
              <p className="mt-1 text-xs font-mono text-on-surface-variant">v{flow.version} · {flow.id}</p>
              <div className="mt-5 flex-1 space-y-2">
                {(flow.reglas ?? []).map((rule) => (
                  <div key={rule.id} className="rounded-xl border border-border/30 bg-on-surface/5 p-3 text-xs">
                    <p className="flex items-center gap-2 font-bold text-on-surface"><Zap className="h-3.5 w-3.5 text-primary" />{actionLabels[rule.accion] ?? rule.accion}</p>
                    {rule.condicion && <p className="mt-1 text-on-surface-variant">{rule.condicion}</p>}
                    {(rule.demora_segundos ?? 0) > 0 && <p className="mt-1 text-blue-300">Wait: {rule.demora_segundos}s</p>}
                  </div>
                ))}
              </div>
              <div className="mt-5 flex gap-2 border-t border-border/30 pt-4">
                <button type="button" onClick={() => navigate(`${basePath}/${flow.id}`)} className="secondary-button flex-1">View definition</button>
                {canManage && flow.estado === 'publicado' && (
                  <button type="button" disabled={deactivate.isPending} onClick={() => deactivate.mutate(flow.id)} className="secondary-button text-amber-300">Deactivate</button>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {deactivate.isError && <p className="mt-4 text-sm text-red-300">{deactivate.error.message}</p>}
    </div>
  );
}
