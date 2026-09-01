import { expect, test, type Page, type Route } from '@playwright/test';
import { mockAuthenticatedAdmin, mockAuthenticatedSupervisor } from './support';
import { catalogItem, compileVisualWorkflow, graphFromDefinition, nodeFromCatalog } from '../src/features/automations/visual-model';

type WorkflowPayload = {
  categoria_id: string;
  version: number;
  reglas: Array<{
    accion: string;
    condicion: string;
    demora_segundos: number;
    config?: Record<string, unknown>;
  }>;
  layout: {
    nodes: Array<{
      id: string;
      type: string;
      position: { x: number; y: number };
      data: Record<string, unknown>;
    }>;
    edges: Array<{ id: string; source: string; target: string }>;
  };
};

function publishedDefinition(id: string, payload: WorkflowPayload) {
  return {
    id,
    categoria_id: payload.categoria_id,
    version: payload.version,
    estado: 'publicado',
    fecha_publicacion: '2026-09-01T12:00:00Z',
    reglas: payload.reglas.map((rule, index) => ({ id: `rule-${id}-${index}`, ...rule })),
    layout: payload.layout,
  };
}

function historicalDefinition(id: string, version: number, priority: string, x: number, y: number) {
  const triggerID = `${id}-trigger`;
  const conditionID = `${id}-condition`;
  const actionID = `${id}-action`;
  return {
    id,
    categoria_id: 'INC',
    version,
    estado: 'publicado',
    fecha_publicacion: `2026-08-${20 + version}T12:00:00Z`,
    reglas: [{
      id: `${id}-rule`,
      accion: 'notificar_interesados',
      condicion: `prioridad == ${priority}`,
      demora_segundos: 0,
    }],
    layout: {
      nodes: [
        {
          id: triggerID,
          type: 'trigger',
          position: { x: 80, y: 190 },
          data: {
            catalogKey: 'ticket.created', label: 'INC creado', title: 'INC creado',
            supportStatus: 'operational', color: 'cyan',
          },
        },
        {
          id: conditionID,
          type: 'condition',
          position: { x, y },
          data: {
            catalogKey: 'condition.priority', label: 'Prioridad', title: 'Prioridad',
            supportStatus: 'operational', color: 'amber', conditionMode: 'priority', priority,
          },
        },
        {
          id: actionID,
          type: 'action',
          position: { x: x + 340, y },
          data: {
            catalogKey: 'action.notify_stakeholders', label: 'Notificar interesados',
            title: 'Notificar interesados', supportStatus: 'operational', color: 'emerald',
          },
        },
      ],
      edges: [
        { id: `${id}-edge-1`, source: triggerID, target: conditionID },
        { id: `${id}-edge-2`, source: conditionID, target: actionID, sourceHandle: 'yes' },
      ],
    },
  };
}

async function stubWorkflowAPI(
  page: Page,
  handler: (route: Route, path: string, method: string) => Promise<void>,
) {
  await page.route(
    (url) => url.pathname === '/workflows' || url.pathname.startsWith('/workflows/'),
    async (route) => {
      const url = new URL(route.request().url());
      await handler(route, url.pathname, route.request().method());
    },
  );
}

const assignmentDirectory = {
  departments: [
    { id: 'department-it', nombre: 'IT' },
    { id: 'department-services', nombre: 'Servicios' },
  ],
  teams: [
    { id: 'team-it', nombre: 'IT', department_id: 'department-it' },
    { id: 'team-services', nombre: 'Servicios', department_id: 'department-services' },
  ],
  assignees: [
    { id: 'user-it-1', nombre: 'Agente IT', email: 'it@sig.systems', team_id: 'team-it' },
    { id: 'user-services-1', nombre: 'Agente Services', email: 'services@sig.systems', team_id: 'team-services' },
  ],
};

test('el canvas publica el mismo grafo que luego vuelve a renderizar y conserva su historial', async ({ page }) => {
  await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
  let posted: WorkflowPayload | undefined;
  let stored: ReturnType<typeof publishedDefinition> | undefined;

  await stubWorkflowAPI(page, async (route, path, method) => {
    if (method === 'POST' && path === '/workflows') {
      posted = route.request().postDataJSON() as WorkflowPayload;
      stored = publishedDefinition('workflow-visual-e2e', posted);
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(stored) });
      return;
    }
    if (method === 'GET' && path === '/workflows/workflow-visual-e2e') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(stored) });
      return;
    }
    if (method === 'GET' && path === '/workflows/workflow-visual-e2e/executions') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [{
          id: 'execution-visual-e2e', workflow_id: 'workflow-visual-e2e', workflow_version: 7,
          regla_id: 'rule-workflow-visual-e2e-0', ticket_id: 'INC-E2E-001',
          accion: 'notificar_interesados', estado: 'completada', intentos: 1,
          iniciada_en: '2026-09-01T12:01:00Z', finalizada_en: '2026-09-01T12:01:01Z',
        }, {
          id: 'execution-assignment-skipped', workflow_id: 'workflow-visual-e2e', workflow_version: 7,
          regla_id: 'rule-workflow-visual-e2e-1', ticket_id: 'INC-E2E-002',
          accion: 'asignar_automatico', estado: 'omitida', intentos: 1,
          motivo: 'El ticket ya tenía una asignación y overwrite_existing está desactivado.',
          iniciada_en: '2026-09-01T12:02:00Z', finalizada_en: '2026-09-01T12:02:00Z',
        }] }),
      });
      return;
    }
    await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });

  await page.goto('/app/automations/new');
  await expect(page.getByTestId('workflow-visual-editor')).toBeVisible();
  await expect(page.locator('.react-flow__node')).toHaveCount(4);

  const priorityNode = page.locator('.react-flow__node').filter({ hasText: 'Prioridad' }).first();
  await priorityNode.click();
  await page.getByRole('combobox', { name: 'Prioridad', exact: true }).selectOption('alta');
  await expect(priorityNode).toContainText('Prioridad = alta');
  await page.getByLabel('Versión').fill('7');

  await Promise.all([
    page.waitForURL(/\/app\/automations\/workflow-visual-e2e$/),
    page.getByRole('button', { name: 'Publicar versión' }).click(),
  ]);

  expect(posted).toBeDefined();
  expect(posted!.categoria_id).toBe('INC');
  expect(posted!.version).toBe(7);
  expect(posted!.reglas).toEqual([{
    accion: 'notificar_interesados', condicion: 'prioridad == alta', demora_segundos: 900,
  }]);
  expect(posted!.layout.nodes).toHaveLength(4);
  expect(posted!.layout.edges).toHaveLength(3);
  expect(posted!.layout.nodes.find((node) => node.type === 'condition')?.data.priority).toBe('alta');

  await expect(page.locator('.react-flow__node')).toHaveCount(4);
  await expect(page.locator('.react-flow__node').filter({ hasText: 'Prioridad = alta' })).toBeVisible();
  await expect(page.getByText('Publicado', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Ver ejecuciones' }).click();
  await expect(page.getByRole('heading', { name: 'Historial real de ejecuciones' })).toBeVisible();
  await expect(page.getByText('INC-E2E-001', { exact: true })).toBeVisible();
  await expect(page.getByText('completada', { exact: true })).toBeVisible();
  await expect(page.getByText('INC-E2E-002', { exact: true })).toBeVisible();
  await expect(page.getByText('Asignar automáticamente', { exact: true })).toBeVisible();
  await expect(page.getByText('omitida', { exact: true })).toBeVisible();
  await expect(page.getByText('El ticket ya tenía una asignación y overwrite_existing está desactivado.', { exact: true })).toBeVisible();
});

test('un bloque próximo se diseña visualmente, pero el compilador bloquea una rama que lo conecta', async ({ page }) => {
  const trigger = nodeFromCatalog(catalogItem('ticket.created')!, { x: 0, y: 0 });
  const action = nodeFromCatalog(catalogItem('action.notify_stakeholders')!, { x: 300, y: 0 });
  const webhookNode = nodeFromCatalog(catalogItem('action.webhook')!, { x: 600, y: 0 });
  const connectedCompilation = compileVisualWorkflow(
    [trigger, action, webhookNode],
    [
      { id: 'edge-operational', source: trigger.id, target: action.id },
      { id: 'edge-planned', source: action.id, target: webhookNode.id },
    ],
    1,
  );
  expect(connectedCompilation.payload).toBeUndefined();
  expect(connectedCompilation.errors).toContain('“Invocar webhook” está en preparación y todavía no puede publicarse.');

  await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
  await stubWorkflowAPI(page, async (route) => {
    await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'No debe publicarse' }) });
  });

  await page.goto('/app/automations/new');
  await expect(page.locator('.react-flow__node')).toHaveCount(4);

  const webhook = page.getByRole('button', { name: /Invocar webhook/ });
  await webhook.scrollIntoViewIfNeeded();
  const pane = page.locator('.react-flow__pane');
  const paneBox = await pane.boundingBox();
  expect(paneBox).not.toBeNull();
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await webhook.dispatchEvent('dragstart', { dataTransfer });
  await pane.dispatchEvent('dragover', {
    dataTransfer,
    clientX: paneBox!.x + Math.min(620, paneBox!.width - 80),
    clientY: paneBox!.y + Math.min(500, paneBox!.height - 80),
  });
  await pane.dispatchEvent('drop', {
    dataTransfer,
    clientX: paneBox!.x + Math.min(620, paneBox!.width - 80),
    clientY: paneBox!.y + Math.min(500, paneBox!.height - 80),
  });
  await expect(page.locator('.react-flow__node')).toHaveCount(5);
  await expect(page.locator('.react-flow__node').filter({ hasText: 'Invocar webhook' })).toBeVisible();

  await page.getByRole('button', { name: /Validar/ }).click();
  await expect(page.getByText('“Invocar webhook” está en el canvas como diseño futuro, pero no se publicará.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Publicar versión' })).toBeEnabled();

  const validationOverlay = page.locator('.fixed.inset-0').filter({ hasText: 'Validación previa' });
  await validationOverlay.getByRole('button').click();
  const plannedNode = page.locator('.react-flow__node').filter({ hasText: 'Invocar webhook' });
  await plannedNode.click();
  await page.getByRole('button', { name: 'Eliminar' }).click();
  await expect(plannedNode).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Publicar versión' })).toBeEnabled();
});

test('una asignación publicada sin layout conserva su modo, destino y política de sobrescritura', () => {
  const graph = graphFromDefinition({
    id: 'workflow-assignment-v3',
    categoria_id: 'INC',
    version: 3,
    estado: 'publicado',
    reglas: [{
      id: 'rule-assignment-v3',
      accion: 'asignar_automatico',
      condicion: 'siempre',
      demora_segundos: 0,
      config: {
        mode: 'user',
        department_id: 'department-services',
        team_id: 'team-services',
        assignee_user_id: 'user-agent-42',
        overwrite_existing: true,
      },
    }],
  });

  const action = graph.nodes.find((node) => node.type === 'action');
  expect(action?.data.catalogKey).toBe('action.assign_user');
  expect(action?.data.supportStatus).toBe('operational');
  expect(action?.data.departmentId).toBe('department-services');
  expect(action?.data.teamId).toBe('team-services');
  expect(action?.data.assigneeUserId).toBe('user-agent-42');
  expect(action?.data.overwriteExisting).toBe(true);
});

test('el compilador produce el contrato tipado de una asignación individual completa', () => {
  const trigger = nodeFromCatalog(catalogItem('ticket.created')!, { x: 0, y: 0 });
  const assignment = nodeFromCatalog(catalogItem('action.assign_user')!, { x: 400, y: 0 });
  assignment.data = {
    ...assignment.data,
    supportStatus: 'operational',
    departmentId: 'department-services',
    teamId: 'team-services',
    assigneeUserId: 'user-services-1',
    overwriteExisting: true,
  };

  const compiled = compileVisualWorkflow(
    [trigger, assignment],
    [{ id: 'edge-assignment', source: trigger.id, target: assignment.id }],
    4,
  );

  expect(compiled.errors).toEqual([]);
  expect(compiled.payload?.reglas).toEqual([{
    accion: 'asignar_automatico',
    condicion: 'siempre',
    demora_segundos: 0,
    config: {
      mode: 'user',
      department_id: 'department-services',
      team_id: 'team-services',
      assignee_user_id: 'user-services-1',
      overwrite_existing: true,
    },
  }]);
});

test('la asignación por equipo no inventa persona y una asignación incompleta no publica', () => {
  const trigger = nodeFromCatalog(catalogItem('ticket.created')!, { x: 0, y: 0 });
  const assignment = nodeFromCatalog(catalogItem('action.assign_team')!, { x: 400, y: 0 });
  assignment.data = {
    ...assignment.data,
    supportStatus: 'operational',
    departmentId: 'department-inventory',
    teamId: 'team-inventory',
    overwriteExisting: false,
  };
  const edge = { id: 'edge-team-assignment', source: trigger.id, target: assignment.id };

  const compiled = compileVisualWorkflow([trigger, assignment], [edge], 5);
  expect(compiled.errors).toEqual([]);
  expect(compiled.payload?.reglas[0]?.config).toEqual({
    mode: 'team',
    department_id: 'department-inventory',
    team_id: 'team-inventory',
    overwrite_existing: false,
  });
  expect(compiled.payload?.reglas[0]?.config).not.toHaveProperty('assignee_user_id');

  assignment.data.teamId = '';
  const incomplete = compileVisualWorkflow([trigger, assignment], [edge], 5);
  expect(incomplete.payload).toBeUndefined();
  expect(incomplete.errors).toContain('Completa área y equipo en “Asignar equipo”.');
});

test('el selector de asignación usa Organization, recupera un fallo y limpia selecciones dependientes', async ({ page }) => {
  await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
  let directoryAttempts = 0;
  await page.route(
    (url) => url.pathname === '/organization/assignment-directory',
    async (route) => {
      directoryAttempts += 1;
      if (directoryAttempts <= 2) {
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Organization no está disponible temporalmente.' }) });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(assignmentDirectory) });
    },
  );

  await page.goto('/app/automations/new');
  await page.getByRole('button', { name: /Asignar persona/ }).click();
  await expect(page.getByText('No se pudo consultar Organization')).toBeVisible();
  await page.getByRole('button', { name: 'Reintentar directorio' }).click();

  await page.getByRole('combobox', { name: 'Área' }).selectOption('department-services');
  await page.getByRole('combobox', { name: 'Equipo' }).selectOption('team-services');
  await page.getByRole('combobox', { name: 'Persona' }).selectOption('user-services-1');
  await page.getByLabel('Reasignar si ya tiene responsable').check();

  const assignmentNode = page.locator('.react-flow__node').filter({ hasText: 'Asignar persona' });
  await expect(assignmentNode).toContainText('Agente Services');
  await expect(assignmentNode).toContainText('Servicios');

  await page.getByRole('combobox', { name: 'Área' }).selectOption('department-it');
  await expect(page.getByRole('combobox', { name: 'Equipo' })).toHaveValue('');
  await expect(page.getByRole('combobox', { name: 'Persona' })).toHaveValue('');
  await expect(assignmentNode).toContainText('sin seleccionar');
  expect(directoryAttempts).toBe(3);
});

test('un fallo de publicación conserva el canvas y permite reintentar sin duplicar el POST exitoso', async ({ page }) => {
  await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
  let attempts = 0;
  let stored: ReturnType<typeof publishedDefinition> | undefined;
  await stubWorkflowAPI(page, async (route, path, method) => {
    if (method === 'POST' && path === '/workflows') {
      attempts += 1;
      if (attempts === 1) {
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Temporal no está disponible; vuelve a intentar.' }) });
        return;
      }
      const payload = route.request().postDataJSON() as WorkflowPayload;
      stored = publishedDefinition('workflow-retry-e2e', payload);
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(stored) });
      return;
    }
    if (method === 'GET' && path === '/workflows/workflow-retry-e2e') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(stored) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) });
  });

  await page.goto('/app/automations/new');
  await page.getByRole('button', { name: 'Publicar versión' }).click();
  await expect(page.getByText('Temporal no está disponible; vuelve a intentar.')).toBeVisible();
  await expect(page).toHaveURL(/\/app\/automations\/new$/);
  await expect(page.locator('.react-flow__node')).toHaveCount(4);

  await Promise.all([
    page.waitForURL(/\/app\/automations\/workflow-retry-e2e$/),
    page.getByRole('button', { name: 'Publicar versión' }).click(),
  ]);
  expect(attempts).toBe(2);
  await expect(page.locator('.react-flow__node')).toHaveCount(4);
});

test('dos versiones publicadas conservan por separado condición y posición del layout', async ({ page }) => {
  await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
  const v1 = historicalDefinition('workflow-history-v1', 1, 'critica', 420, 190);
  const v2 = historicalDefinition('workflow-history-v2', 2, 'alta', 710, 330);
  await stubWorkflowAPI(page, async (route, path) => {
    const definition = path.endsWith('workflow-history-v1') ? v1 : v2;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(definition) });
  });

  await page.goto('/app/automations/workflow-history-v1');
  const v1Condition = page.locator('.react-flow__node').filter({ hasText: 'Prioridad = critica' });
  await expect(v1Condition).toBeVisible();
  await expect(v1Condition).toHaveAttribute('style', /translate\(420px, 190px\)/);

  await page.goto('/app/automations/workflow-history-v2');
  const v2Condition = page.locator('.react-flow__node').filter({ hasText: 'Prioridad = alta' });
  await expect(v2Condition).toBeVisible();
  await expect(v2Condition).toHaveAttribute('style', /translate\(710px, 330px\)/);

  await page.goto('/app/automations/workflow-history-v1');
  await expect(page.locator('.react-flow__node').filter({ hasText: 'Prioridad = critica' })).toBeVisible();
  await expect(page.locator('.react-flow__node').filter({ hasText: 'Prioridad = alta' })).toHaveCount(0);
});

test('lectura y administración de Automations respetan permisos distintos', async ({ page }) => {
  await mockAuthenticatedSupervisor(page, { forwardUnmatched: false });
  const readable = historicalDefinition('workflow-readable', 1, 'critica', 420, 190);
  await stubWorkflowAPI(page, async (route, path) => {
    if (path === '/workflows') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [readable] }) });
      return;
    }
    await route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error_code: 'PERMISO_DENEGADO', message: 'Sin permiso de administración.' }) });
  });

  await page.goto('/app/automations');
  await expect(page.getByTestId('automations-list')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'INC', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Crear workflow' })).toHaveCount(0);

  await page.goto('/app/automations/new');
  await expect(page).toHaveURL(/\/portal\/?$/);
  await expect(page.getByTestId('workflow-visual-editor')).toHaveCount(0);
});
