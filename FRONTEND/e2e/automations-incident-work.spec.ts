import { expect, test } from '@playwright/test';
import type { Edge } from '@xyflow/react';
import { catalogItem, compileVisualWorkflow, graphFromDefinition, nodeFromCatalog } from '../src/features/automations/visual-model';
import type { WorkflowDefinition } from '../src/features/automations/api';

test('incident troubleshooting is an operational action with an executable contract', () => {
  const trigger = nodeFromCatalog(catalogItem('ticket.created')!, { x: 0, y: 0 });
  const work = nodeFromCatalog(catalogItem('action.create_incident_work')!, { x: 400, y: 0 });
  const edge: Edge = { id: 'edge', source: trigger.id, target: work.id };

  const result = compileVisualWorkflow([trigger, work], [edge], 1);

  expect(result.errors).toEqual([]);
  expect(result.payload?.reglas).toEqual([expect.objectContaining({
    id: work.id,
    accion: 'create_incident_work_item',
    condicion: 'siempre',
    config: {
      work_key: 'initial_troubleshooting',
      title: 'Troubleshoot incident',
      instructions: 'Validate power, network, affected devices, service health, and recent changes. Document the findings.',
      required: true,
      due_in_minutes: 30,
    },
  })]);
  expect(result.payload?.execution_plan?.nodes).toContainEqual(expect.objectContaining({ id: work.id, kind: 'action', action: 'create_incident_work_item' }));
});

test('invalid or incomplete incident work cannot be published', () => {
  const trigger = nodeFromCatalog(catalogItem('ticket.created')!, { x: 0, y: 0 });
  const work = nodeFromCatalog(catalogItem('action.create_incident_work')!, { x: 400, y: 0 });
  work.data.workKey = 'Bad key';
  work.data.workInstructions = '';
  work.data.workDueMinutes = '50000';
  const result = compileVisualWorkflow([trigger, work], [{ id: 'edge', source: trigger.id, target: work.id }], 1);
  expect(result.payload).toBeUndefined();
  expect(result.errors.some((message) => message.includes('stable lowercase work key'))).toBe(true);
});

test('published incident work configuration survives a legacy no-layout round trip', () => {
  const definition = {
    id: 'wf-1', categoria_id: 'INC', version: 3, estado: 'publicado', revision: 1,
    reglas: [{
      id: 'a5519001-0000-4000-8000-000000000009', accion: 'create_incident_work_item', condicion: 'siempre', demora_segundos: 0,
      config: { work_key: 'site_triage', title: 'Site triage', instructions: 'Document signal and power.', required: false, due_in_minutes: 45 },
    }],
  } as WorkflowDefinition;
  const graph = graphFromDefinition(definition);
  const work = graph.nodes.find((node) => node.data.catalogKey === 'action.create_incident_work');
  expect(work?.data).toMatchObject({ workKey: 'site_triage', workTitle: 'Site triage', workInstructions: 'Document signal and power.', workRequired: false, workDueMinutes: '45' });
  const result = compileVisualWorkflow(graph.nodes, graph.edges, 4);
  expect(result.errors).toEqual([]);
  expect(result.payload?.reglas[0]?.config).toMatchObject({ work_key: 'site_triage', required: false, due_in_minutes: 45 });
});
