import { expect, test } from '@playwright/test';
import { catalogItem, compileVisualWorkflow, graphFromDefinition, nodeFromCatalog } from '../src/features/automations/visual-model';
import type { WorkflowDefinition } from '../src/features/automations/api';

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
