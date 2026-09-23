import { expect, test } from '@playwright/test';
import { catalogItem, compileVisualWorkflow, graphFromDefinition, nodeFromCatalog } from '../src/features/automations/visual-model';
import type { WorkflowDefinition } from '../src/features/automations/api';
import { buildBlueprintA3Draft } from '../src/features/automations/guidedBlueprints';
import { buildCatalogIncV7Draft } from '../src/features/catalog/incV7Draft';
import type { CatalogDefinition } from '../src/features/catalog/metamodel';

test('Blueprint A v3 is a draft-only three-trigger plan for the canonical IT 1 / IT 2 lifecycle', () => {
  const draft = buildBlueprintA3Draft({
    it1DepartmentId: '10000000-0000-4000-8000-000000000001',
    it1DepartmentName: 'IT',
    it1TeamId: '10000000-0000-4000-8000-000000000011',
    it1TeamName: 'IT 1',
    it2DepartmentId: '10000000-0000-4000-8000-000000000001',
    it2DepartmentName: 'IT',
    it2TeamId: '10000000-0000-4000-8000-000000000012',
    it2TeamName: 'IT 2',
  });

  expect(draft.version).toBe(3);
  expect(draft.categoria_id).toBe('INC');
  expect(draft.execution_plan?.version).toBe(2);
  expect(draft.execution_plan?.nodes.filter((node) => node.kind === 'trigger').map((node) => node.type)).toEqual([
    'incident_not_duplicate',
    'incident_escalated_to_it2',
    'incident_service_required',
  ]);
  expect(draft.execution_plan?.nodes.some((node) => node.type === 'ticket_created')).toBe(false);
  expect(draft.reglas.map((rule) => rule.accion)).toEqual([
    'create_incident_work_item',
    'create_incident_work_item',
    'create_service_rfc',
  ]);
  expect(draft.reglas.some((rule) => rule.accion === 'asignar_automatico')).toBe(false);
  expect(draft.reglas[0].config).toMatchObject({
    work_key: 'it1_remote_troubleshooting', work_type: 'it1_remote_troubleshooting',
    department_id: '10000000-0000-4000-8000-000000000001', team_id: '10000000-0000-4000-8000-000000000011',
  });
  expect(draft.reglas[1].config).toMatchObject({
    work_key: 'it2_troubleshooting', work_type: 'it2_troubleshooting',
    department_id: '10000000-0000-4000-8000-000000000001', team_id: '10000000-0000-4000-8000-000000000012',
  });
  expect(JSON.stringify(draft)).not.toContain(['Tier', '1'].join(' '));

  const definition = {
    ...draft,
    id: 'blueprint-a-v3-draft',
    estado: 'borrador',
    revision: 1,
    reglas: draft.reglas.map((rule) => ({ ...rule, id: rule.id! })),
  } as WorkflowDefinition;
  const compiled = compileVisualWorkflow(
    graphFromDefinition(definition).nodes,
    graphFromDefinition(definition).edges,
    3,
  );
  expect(compiled.errors).toEqual([]);
  expect(compiled.payload?.execution_plan?.version).toBe(2);
  expect(compiled.payload?.execution_plan?.nodes.filter((node) => node.kind === 'trigger').map((node) => node.type).sort()).toEqual([
    'incident_escalated_to_it2',
    'incident_not_duplicate',
    'incident_service_required',
  ]);
  expect(compiled.payload?.reglas[0].config).toEqual(draft.reglas[0].config);
  expect(compiled.payload?.reglas[1].config).toEqual(draft.reglas[1].config);
});

test('Blueprint A v3 without visual layout reconstructs every entrypoint and action', () => {
  const draft = buildBlueprintA3Draft({
    it1DepartmentId: '10000000-0000-4000-8000-000000000001', it1DepartmentName: 'IT',
    it1TeamId: '10000000-0000-4000-8000-000000000011', it1TeamName: 'IT 1',
    it2DepartmentId: '10000000-0000-4000-8000-000000000001', it2DepartmentName: 'IT',
    it2TeamId: '10000000-0000-4000-8000-000000000012', it2TeamName: 'IT 2',
  });
  const definition = {
    ...draft, layout: undefined, id: 'blueprint-a-v3-published', estado: 'publicado', revision: 1,
    reglas: draft.reglas.map((rule) => ({ ...rule, id: rule.id! })),
  } as WorkflowDefinition;
  const graph = graphFromDefinition(definition);
  const result = compileVisualWorkflow(graph.nodes, graph.edges, 4);

  expect(graph.nodes.filter((node) => node.type === 'trigger')).toHaveLength(3);
  expect(result.errors).toEqual([]);
  expect(result.payload?.reglas).toHaveLength(3);
  expect(result.payload?.execution_plan?.entrypoints).toHaveLength(3);
  expect(result.payload?.reglas[0].config).toEqual(draft.reglas[0].config);
  expect(result.payload?.reglas[1].config).toEqual(draft.reglas[1].config);
});

test('Catalog INC v7 draft preserves v6 and replaces only the same workflow family binding', () => {
  const active: CatalogDefinition = {
    id: 'inc-v6', entityKey: 'INC', name: 'Incident', version: 6, status: 'published',
    metamodelVersion: '1.6',
    specification: {
      description: 'Canonical incident', identity: { prefix: 'INC' }, fields: [],
      lifecycle: { states: [{ key: 'open', label: 'Open', initial: true }], transitions: [] },
      bindings: [
        { module: 'sla', resourceType: 'policy', resourceId: 'sla-inc', resourceVersion: '2', contractVersion: '1' },
        { module: 'automations', resourceType: 'workflow', resourceId: 'family-blueprint-a', resourceInstanceId: 'workflow-v2', resourceVersion: '2', contractVersion: '1' },
        { module: 'automations', resourceType: 'workflow', resourceId: 'family-notifications', resourceInstanceId: 'notify-v1', resourceVersion: '1', contractVersion: '1' },
      ],
    },
  };

  const draft = buildCatalogIncV7Draft(active, {
    categoryId: 'INC', trigger: 'incident_escalated_to_it2',
    triggers: ['incident_not_duplicate', 'incident_escalated_to_it2', 'incident_service_required'],
    workflowId: 'workflow-v3', familyId: 'family-blueprint-a', version: 3,
    planContractVersion: 2, selectable: false,
  });

  expect(draft.version).toBe(7);
  expect(draft.status).toBe('draft');
  expect(draft.specification.bindings).toEqual([
    active.specification.bindings![0],
    active.specification.bindings![2],
    {
      module: 'automations', resourceType: 'workflow', resourceId: 'family-blueprint-a',
      resourceInstanceId: 'workflow-v3', resourceVersion: '3', contractVersion: '2', enabled: true,
    },
  ]);
  expect(active.specification.bindings![1].resourceInstanceId).toBe('workflow-v2');
});

test('service-required compiles to an approval-gated RFC action', () => {
  const trigger = nodeFromCatalog(catalogItem('incident.service_required')!, { x: 0, y: 0 });
  const action = nodeFromCatalog(catalogItem('action.create_service_rfc')!, { x: 400, y: 0 });
  const result = compileVisualWorkflow([trigger, action], [{ id: 'edge', source: trigger.id, target: action.id }], 1);

  expect(result.errors).toEqual([]);
  expect(result.payload?.reglas).toEqual([expect.objectContaining({
    id: action.id,
    accion: 'create_service_rfc',
    config: expect.objectContaining({ request_approval: true, service_affected: 'Field Services', duration_minutes: 120 }),
  })]);
  expect(result.payload?.execution_plan?.nodes).toContainEqual(expect.objectContaining({
    id: trigger.id, kind: 'trigger', type: 'incident_service_required',
  }));
  expect(result.payload?.execution_plan?.nodes).toContainEqual(expect.objectContaining({
    id: action.id, kind: 'action', action: 'create_service_rfc',
  }));
});

test('service RFC cannot be attached to ticket-created and troubleshooting cannot be attached to service-required', () => {
  const created = nodeFromCatalog(catalogItem('ticket.created')!, { x: 0, y: 0 });
  const service = nodeFromCatalog(catalogItem('action.create_service_rfc')!, { x: 400, y: 0 });
  const invalidService = compileVisualWorkflow([created, service], [{ id: 'e1', source: created.id, target: service.id }], 1);
  expect(invalidService.payload).toBeUndefined();
  expect(invalidService.errors).toContain('“Create Service RFC” must start from the “Service Required” trigger.');

  const required = nodeFromCatalog(catalogItem('incident.service_required')!, { x: 0, y: 0 });
  const troubleshoot = nodeFromCatalog(catalogItem('action.create_incident_work')!, { x: 400, y: 0 });
  const invalidTroubleshooting = compileVisualWorkflow([required, troubleshoot], [{ id: 'e2', source: required.id, target: troubleshoot.id }], 1);
  expect(invalidTroubleshooting.payload).toBeUndefined();
  expect(invalidTroubleshooting.errors).toContain('“Create Incident Work” must start from the “INC Created” trigger.');
});

test('a published no-layout service workflow round-trips without changing its trigger or config', () => {
  const definition = {
    id: 'wf-service', categoria_id: 'INC', version: 2, estado: 'publicado', revision: 1,
    reglas: [{
      id: 'service-rfc', accion: 'create_service_rfc', condicion: 'siempre', demora_segundos: 0,
      config: {
        service_affected: 'On-site Services', change_type: 'normal', impact: 'high', probability: 'low', urgency: 'high',
        lead_time_minutes: 30, duration_minutes: 90, implementation_plan: 'Inspect and repair.', rollback_plan: 'Restore prior state.',
        validation_plan: 'IT validates all symptoms.', request_approval: true,
      },
    }],
    execution_plan: {
      version: 1, entrypoints: ['trigger-service'], nodes: [
        { id: 'trigger-service', kind: 'trigger', type: 'incident_service_required', next: ['service-rfc'] },
        { id: 'service-rfc', kind: 'action', action: 'create_service_rfc' },
      ],
    },
  } as WorkflowDefinition;
  const graph = graphFromDefinition(definition);
  expect(graph.nodes.find((node) => node.type === 'trigger')?.data.catalogKey).toBe('incident.service_required');
  expect(graph.nodes.find((node) => node.data.catalogKey === 'action.create_service_rfc')?.data).toMatchObject({
    serviceAffected: 'On-site Services', changeLeadMinutes: '30', changeDurationMinutes: '90', validationPlan: 'IT validates all symptoms.',
  });
  const result = compileVisualWorkflow(graph.nodes, graph.edges, 3);
  expect(result.errors).toEqual([]);
  expect(result.payload?.execution_plan?.nodes.find((node) => node.kind === 'trigger')?.type).toBe('incident_service_required');
});
