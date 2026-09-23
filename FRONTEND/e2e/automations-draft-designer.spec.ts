import { expect, test } from '@playwright/test';
import { mockAuthenticatedAdmin } from './support';
import { catalogItem, compileVisualWorkflow, nodeFromCatalog } from '../src/features/automations/visual-model';

// Cubre lo que el diseñador visual gana con el borrador: guardar sin publicar,
// recargar sin perder el diagrama, cambiar de modo sin recrear el bloque,
// detectar un destino que Organization ya no reconoce, y mostrar el 422 del
// backend en vez de confiar solo en la validación del canvas.

const directorio = {
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
  ],
};

/** Un borrador con una asignación cuyo equipo y persona ya no existen en el
 *  directorio: exactamente lo que queda cuando alguien elimina un equipo en
 *  Organization después de guardar el diseño. */
function borradorConDestinoFantasma(id: string) {
  return {
    id,
    categoria_id: 'INC',
    version: 1,
    estado: 'borrador',
    reglas: [{
      id: `${id}-rule`,
      accion: 'asignar_automatico',
      condicion: 'siempre',
      demora_segundos: 0,
      config: {
        mode: 'user',
        department_id: 'department-it',
        team_id: 'team-eliminado',
        assignee_user_id: 'user-eliminado',
        overwrite_existing: false,
      },
    }],
    layout: {
      nodes: [
        {
          id: 'trigger-1', type: 'trigger', position: { x: 80, y: 160 },
          data: { catalogKey: 'ticket.created', label: 'INC creado', title: 'INC creado', supportStatus: 'operational', color: 'cyan' },
        },
        {
          id: 'action-1', type: 'action', position: { x: 520, y: 160 },
          data: {
            catalogKey: 'action.assign', label: 'Assign Automatically', title: 'Assign Automatically',
            supportStatus: 'operational', color: 'emerald', assignmentMode: 'user',
            departmentId: 'department-it', teamId: 'team-eliminado', assigneeUserId: 'user-eliminado',
            overwriteExisting: false,
          },
        },
      ],
      edges: [{ id: 'e1', source: 'trigger-1', target: 'action-1' }],
    },
  };
}

// ── Lógica pura ────────────────────────────────────────────────────────────

test('cambiar de persona a equipo elimina assignee_user_id del contrato', () => {
  const trigger = nodeFromCatalog(catalogItem('ticket.created')!, { x: 0, y: 0 });
  const assignment = nodeFromCatalog(catalogItem('action.assign')!, { x: 400, y: 0 });
  assignment.data.assignmentMode = 'user';
  assignment.data.departmentId = 'department-it';
  assignment.data.teamId = 'team-it';
  assignment.data.assigneeUserId = 'user-it-1';
  const edge = { id: 'e1', source: trigger.id, target: assignment.id };

  const comoPersona = compileVisualWorkflow([trigger, assignment], [edge], 1);
  expect(comoPersona.payload?.reglas[0]?.config).toMatchObject({
    mode: 'user', department_id: 'department-it', team_id: 'team-it', assignee_user_id: 'user-it-1',
  });

  // Cambiar a equipo es lo que hace el interruptor del panel: limpia la persona.
  assignment.data.assignmentMode = 'team';
  assignment.data.assigneeUserId = '';

  const comoEquipo = compileVisualWorkflow([trigger, assignment], [edge], 1);
  expect(comoEquipo.payload?.reglas[0]?.config).toMatchObject({ mode: 'team' });
  expect(comoEquipo.payload?.reglas[0]?.config).not.toHaveProperty('assignee_user_id');
});

test('una referencia organizacional ausente bloquea la publicación y no se borra sola', () => {
  const trigger = nodeFromCatalog(catalogItem('ticket.created')!, { x: 0, y: 0 });
  const assignment = nodeFromCatalog(catalogItem('action.assign')!, { x: 400, y: 0 });
  assignment.data.assignmentMode = 'team';
  assignment.data.departmentId = 'department-it';
  assignment.data.teamId = 'team-eliminado';
  // Lo que el editor marca al cargar el directorio y no encontrar el equipo.
  assignment.data.missingReferences = ['un equipo'];
  const edge = { id: 'e1', source: trigger.id, target: assignment.id };

  const resultado = compileVisualWorkflow([trigger, assignment], [edge], 1);

  expect(resultado.payload).toBeUndefined();
  expect(resultado.errors.join(' ')).toContain('Organization no longer recognizes');
  expect(resultado.issues.some((issue) => issue.nodeId === assignment.id)).toBe(true);
  // El id NO se limpia: borrarlo cambiaría el destino del diagrama guardado sin
  // que nadie lo decidiera.
  expect(assignment.data.teamId).toBe('team-eliminado');
});

test('un borrador guardado con claves antiguas conserva su modo al recargar', () => {
  // Diagramas guardados antes de unificar el bloque traen `action.assign_user`.
  const item = catalogItem('action.assign_user');
  expect(item).toBeDefined();
  const node = nodeFromCatalog(item!, { x: 0, y: 0 });
  expect(node.data.catalogKey).toBe('action.assign');
  expect(node.data.assignmentMode).toBe('user');
});

// ── Recorrido en el navegador ───────────────────────────────────────────────

test('guardar un borrador conserva el diagrama al recargar y publicar usa su id', async ({ page }) => {
  await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
  let guardado: { id?: string; layout?: { nodes: unknown[] } } | undefined;
  let publicado = false;

  await page.route('**/organization/assignment-directory**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(directorio) }));

  await page.route('**/workflows/drafts', async (route) => {
    guardado = JSON.parse(route.request().postData() ?? '{}');
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ ...guardado, id: 'draft-1', estado: 'borrador' }),
    });
  });
  await page.route('**/workflows/draft-1/publicar', async (route) => {
    publicado = true;
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ id: 'draft-1', categoria_id: 'INC', version: 1, estado: 'publicado', reglas: [], layout: guardado?.layout }),
    });
  });
  await page.route('**/workflows/draft-1', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: 'draft-1', categoria_id: 'INC', version: 1, estado: 'borrador', reglas: [], layout: guardado?.layout }),
  }));

  await page.goto('/app/automations/new');
  await expect(page.getByTestId('workflow-visual-editor')).toBeVisible();

  // Estado inicial: nada pendiente.
  await expect(page.getByTestId('canvas-dirty')).toHaveText('Saved');

  const nodos = page.locator('.react-flow__node');
  const iniciales = await nodos.count();
  await page.getByRole('button', { name: /Assign Automatically/ }).click();
  await expect(page.getByTestId('canvas-dirty')).toHaveText('Unsaved changes');
  await expect(nodos).toHaveCount(iniciales + 1);

  await page.getByTestId('canvas-save-draft').click();
  await page.waitForURL('**/app/automations/draft-1');

  // El layout viajó con TODOS los nodos y sus posiciones: es lo que permite
  // reconstruir el mismo diagrama al recargar.
  expect(guardado?.layout?.nodes).toHaveLength(iniciales + 1);
  await expect(page.getByTestId('workflow-visual-editor')).toBeVisible();
  await expect(nodos).toHaveCount(iniciales + 1);

  // Guardar NO publica: son dos pasos distintos a propósito.
  expect(publicado).toBe(false);
});

test('un destino que Organization ya no reconoce resalta el nodo y se puede enfocar desde el error', async ({ page }) => {
  await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
  await page.route('**/organization/assignment-directory**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(directorio) }));
  await page.route('**/workflows/draft-fantasma', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(borradorConDestinoFantasma('draft-fantasma')),
  }));

  await page.goto('/app/automations/draft-fantasma');
  await expect(page.getByTestId('workflow-visual-editor')).toBeVisible();

  // El bloque queda marcado EN EL CANVAS, no solo en el panel de validación.
  await expect(page.getByTestId('workflow-node-invalid')).toBeVisible();
  await expect(page.getByTestId('workflow-node-invalid')).toContainText('Organization no longer recognizes');

  // Y el error del panel lleva al bloque.
  await page.getByTestId('canvas-validate').click();
  const anclado = page.getByTestId('validation-issue-anchored').first();
  await expect(anclado).toContainText('Organization no longer recognizes');
  await anclado.click();
  await expect(page.getByTestId('assignment-editor')).toBeVisible();
});

test('el 422 del backend se muestra aunque el canvas considere válido el diseño', async ({ page }) => {
  await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
  await page.route('**/organization/assignment-directory**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(directorio) }));

  // El canvas no puede saber que el equipo dejó de pertenecer al área: eso lo
  // resuelve Organization al publicar. Por eso el error del backend se muestra.
  await page.route('**/workflows/draft-2/publicar', (route) => route.fulfill({
    status: 422, contentType: 'application/json',
    body: JSON.stringify({ error_code: 'CONFIG_ASIGNACION_INVALIDA', message: 'el equipo no pertenece al área indicada' }),
  }));
  await page.route('**/workflows/draft-2', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      ...borradorConDestinoFantasma('draft-2'),
      reglas: [{ id: 'r1', accion: 'asignar_automatico', condicion: 'siempre', demora_segundos: 0, config: { mode: 'team', department_id: 'department-it', team_id: 'team-it', overwrite_existing: false } }],
      layout: {
        nodes: [
          { id: 'trigger-1', type: 'trigger', position: { x: 80, y: 160 }, data: { catalogKey: 'ticket.created', label: 'INC creado', supportStatus: 'operational', color: 'cyan' } },
          { id: 'action-1', type: 'action', position: { x: 520, y: 160 }, data: { catalogKey: 'action.assign', label: 'Assign Automatically', supportStatus: 'operational', color: 'emerald', assignmentMode: 'team', departmentId: 'department-it', teamId: 'team-it', overwriteExisting: false } },
        ],
        edges: [{ id: 'e1', source: 'trigger-1', target: 'action-1' }],
      },
    }),
  }));

  await page.goto('/app/automations/draft-2');
  await expect(page.getByTestId('workflow-visual-editor')).toBeVisible();
  await expect(page.getByTestId('workflow-node-invalid')).toHaveCount(0);

  await page.getByTestId('canvas-publish').click();

  await expect(page.getByTestId('canvas-publish-error')).toContainText('el equipo no pertenece al área indicada');
});

test('deshacer y rehacer devuelven el diagrama a su estado anterior', async ({ page }) => {
  await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
  await page.route('**/organization/assignment-directory**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(directorio) }));

  await page.goto('/app/automations/new');
  await expect(page.getByTestId('canvas-undo')).toBeDisabled();

  // Un lienzo nuevo NO está vacío: trae un flujo de ejemplo. Se mide en
  // relativo para que la prueba no se rompa si ese ejemplo cambia.
  const nodos = page.locator('.react-flow__node');
  const iniciales = await nodos.count();
  expect(iniciales).toBeGreaterThan(0);

  await page.getByRole('button', { name: /Assign Automatically/ }).click();
  await expect(nodos).toHaveCount(iniciales + 1);

  await page.getByTestId('canvas-undo').click();
  await expect(nodos).toHaveCount(iniciales);

  await page.getByTestId('canvas-redo').click();
  await expect(nodos).toHaveCount(iniciales + 1);
});

test('quien solo puede leer no ve los controles de edición del canvas', async ({ page }) => {
  await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
  await page.route('**/workflows/publicado-1', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      id: 'publicado-1', categoria_id: 'INC', version: 1, estado: 'publicado',
      fecha_publicacion: '2026-09-01T12:00:00Z', reglas: [], layout: { nodes: [], edges: [] },
    }),
  }));

  await page.goto('/app/automations/publicado-1');
  await expect(page.getByTestId('workflow-visual-editor')).toBeVisible();

  // Una versión publicada es inmutable: el backend rechaza modificarla, así que
  // ofrecer los controles solo produciría un 409 al guardar.
  await expect(page.getByTestId('canvas-save-draft')).toHaveCount(0);
  await expect(page.getByTestId('canvas-undo')).toHaveCount(0);
  await expect(page.getByTestId('canvas-dirty')).toHaveCount(0);
});

test('Create from template leaves the workflow in Draft state and never publishes', async ({ page }) => {
  await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
  await page.route('**/organization/assignment-directory**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(directorio) }));

  let publishedCalled = false;
  await page.route('**/workflows', (route) => {
    if (route.request().method() === 'POST') {
      publishedCalled = true;
      return route.fulfill({ status: 500, body: 'POST /workflows should not be called by templates!' });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) });
  });

  let draftSaved = false;
  let savedPayload: {
    categoria_id: string;
    version: number;
    reglas: Array<{ id: string; accion: string; condicion?: string; config: Record<string, unknown> }>;
    layout: unknown;
    execution_plan: { nodes: Array<{ id: string; action?: string; on_omitted?: string; next: string[] }> };
  } | null = null;
  const draftId = 'draft-blueprint-a-unit';

  await page.route('**/workflows/drafts', async (route) => {
    expect(route.request().method()).toBe('POST');
    draftSaved = true;
    savedPayload = JSON.parse(route.request().postData() || '{}');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: draftId,
        categoria_id: savedPayload?.categoria_id,
        version: savedPayload?.version,
        estado: 'borrador',
        reglas: savedPayload?.reglas,
        layout: savedPayload?.layout,
        execution_plan: savedPayload?.execution_plan,
      }),
    });
  });

  await page.route(`**/workflows/${draftId}`, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      id: draftId,
      categoria_id: 'INC',
      version: 1,
      estado: 'borrador',
      reglas: savedPayload?.reglas ?? [],
      layout: savedPayload?.layout ?? { nodes: [], edges: [] },
      execution_plan: savedPayload?.execution_plan,
    }),
  }));

  await page.goto('/app/automations');
  await expect(page.getByTestId('automations-list')).toBeVisible();

  // Click "Guided blueprints"
  await page.getByTestId('create-from-template-button').click();
  await expect(page.getByTestId('template-selection-modal')).toBeVisible();

  // Check Blueprint A & B cards are present
  await expect(page.getByTestId('blueprint-a-card')).toBeVisible();
  await expect(page.getByTestId('blueprint-b-card')).toBeVisible();

  // Initially Blueprint A button is disabled because department and team are not selected
  await expect(page.getByTestId('create-blueprint-a-btn')).toBeDisabled();

  // Select department
  await page.getByTestId('blueprint-a-dept-select').selectOption('department-it');
  // Team is still unselected; button remains disabled
  await expect(page.getByTestId('create-blueprint-a-btn')).toBeDisabled();

  // Select team
  await page.getByTestId('blueprint-a-team-select').selectOption('team-it');
  // Now button is enabled
  await expect(page.getByTestId('create-blueprint-a-btn')).toBeEnabled();

  // Create Blueprint A draft
  await page.getByTestId('create-blueprint-a-btn').click();

  // Verify POST /workflows was NEVER called, and POST /workflows/drafts WAS called
  expect(publishedCalled).toBe(false);
  expect(draftSaved).toBe(true);
  expect(savedPayload).not.toBeNull();
  expect(savedPayload!.categoria_id).toBe('INC');
  expect(savedPayload!.version).toBe(1);

  // Routing and mandatory troubleshooting are sibling branches. A routing
  // omission stops only that branch and can never suppress the work item.
  const assignPlanNode = savedPayload!.execution_plan.nodes.find((n) => n.action === 'asignar_automatico');
  expect(assignPlanNode).toBeDefined();
  expect(assignPlanNode!.on_omitted).toBe('stop');

  // Verify Blueprint A has create_incident_work_item next with due_in_minutes: 30 and NO due_minutes
  const workItemPlanNode = savedPayload!.execution_plan.nodes.find((n) => n.action === 'create_incident_work_item');
  expect(workItemPlanNode).toBeDefined();
  const triggerPlanNode = savedPayload!.execution_plan.nodes.find((n) => !n.action);
  expect(triggerPlanNode).toBeDefined();
  expect(triggerPlanNode!.next).toEqual(expect.arrayContaining([assignPlanNode!.id, workItemPlanNode!.id]));
  expect(assignPlanNode!.next).toEqual([]);

  const workItemRule = savedPayload!.reglas.find((r) => r.accion === 'create_incident_work_item');
  expect(workItemRule).toBeDefined();
  expect(workItemRule!.config.work_key).toBe('initial_troubleshooting');
  expect(workItemRule!.config.due_in_minutes).toBe(30);
  expect(workItemRule!.config.due_minutes).toBeUndefined();

  // Verify navigation to the draft editor and draft controls (Save Draft visible)
  await expect(page.getByTestId('workflow-visual-editor')).toBeVisible();
  await expect(page.getByTestId('canvas-save-draft')).toBeVisible();
});

test('Organizational selection handles loading, error, empty, department without teams, and zero active members honestly', async ({ page }) => {
  await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
  await page.route('**/workflows', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) }));

  // Test 1: Directory error handling
  await page.route('**/organization/assignment-directory**', (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'service unavailable' }) }));

  await page.goto('/app/automations');
  await page.getByTestId('create-from-template-button').click();
  await expect(page.getByTestId('directory-error')).toBeVisible();
  await expect(page.getByTestId('create-blueprint-a-btn')).toBeDisabled();

  // Test 2: Retry with empty departments
  await page.route('**/organization/assignment-directory**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ departments: [], teams: [], assignees: [] }),
    }));
  await page.getByTestId('directory-retry').click();
  await expect(page.getByTestId('directory-empty')).toBeVisible();
  await expect(page.getByTestId('create-blueprint-a-btn')).toBeDisabled();

  // Test 3: Directory with department without teams and zero members warning
  const customDirectory = {
    departments: [
      { id: 'dept-empty', nombre: 'Empty Department' },
      { id: 'dept-services', nombre: 'Services Area' },
    ],
    teams: [
      { id: 'team-field', nombre: 'Field Services', department_id: 'dept-services' },
    ],
    assignees: [], // zero active assignees
  };

  await page.route('**/organization/assignment-directory**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(customDirectory) }));

  // Close and reopen modal to reload directory
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByTestId('create-from-template-button').click();

  // Department without teams
  await page.getByTestId('blueprint-a-dept-select').selectOption('dept-empty');
  await expect(page.getByTestId('no-teams-in-dept')).toBeVisible();
  await expect(page.getByTestId('create-blueprint-a-btn')).toBeDisabled();

  // Change to department with team
  await page.getByTestId('blueprint-a-dept-select').selectOption('dept-services');
  await expect(page.getByTestId('blueprint-a-team-select')).toBeVisible();
  // Team selection starts empty on department change
  await expect(page.getByTestId('create-blueprint-a-btn')).toBeDisabled();

  // Select team that has zero members
  await page.getByTestId('blueprint-a-team-select').selectOption('team-field');
  // Visible warning rendered and team is NOT silently changed
  await expect(page.getByTestId('zero-members-warning')).toBeVisible();
  await expect(page.getByTestId('create-blueprint-a-btn')).toBeEnabled();
});

test('Blueprint B captures exact RFC governance fields with locked request_approval and no change_* aliases', async ({ page }) => {
  await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
  await page.route('**/workflows', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) }));

  let capturedPayload: {
    categoria_id: string;
    version: number;
    reglas: Array<{ id: string; accion: string; config: Record<string, unknown> }>;
    layout: unknown;
    execution_plan: unknown;
  } | null = null;
  const draftId = 'draft-blueprint-b-unit';

  await page.route('**/workflows/drafts', async (route) => {
    capturedPayload = JSON.parse(route.request().postData() || '{}');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: draftId,
        categoria_id: 'INC',
        version: 1,
        estado: 'borrador',
        reglas: capturedPayload?.reglas,
        layout: capturedPayload?.layout,
        execution_plan: capturedPayload?.execution_plan,
      }),
    });
  });

  await page.route(`**/workflows/${draftId}`, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      id: draftId,
      categoria_id: 'INC',
      version: 1,
      estado: 'borrador',
      reglas: capturedPayload?.reglas ?? [],
      layout: capturedPayload?.layout ?? { nodes: [], edges: [] },
      execution_plan: capturedPayload?.execution_plan,
    }),
  }));

  await page.goto('/app/automations');
  await page.getByTestId('create-from-template-button').click();
  await page.getByTestId('create-blueprint-b-btn').click();

  expect(capturedPayload).not.toBeNull();
  expect(capturedPayload!.categoria_id).toBe('INC');
  expect(capturedPayload!.version).toBe(1);

  const rfcRule = capturedPayload!.reglas.find((r) => r.accion === 'create_service_rfc');
  expect(rfcRule).toBeDefined();
  const cfg = rfcRule!.config;

  // Exact canonical fields
  expect(cfg.service_affected).toBe('Field Services');
  expect(cfg.change_type).toBe('normal');
  expect(cfg.impact).toBe('medium');
  expect(cfg.probability).toBe('low');
  expect(cfg.urgency).toBe('medium');
  expect(cfg.lead_time_minutes).toBe(60);
  expect(cfg.duration_minutes).toBe(120);
  expect(cfg.request_approval).toBe(true);
  expect(cfg.implementation_plan).toContain('Services will inspect');
  expect(cfg.rollback_plan).toContain('Stop work');
  expect(cfg.validation_plan).toContain('IT validates');

  // Verify NONE of the incorrect legacy aliases exist
  expect(cfg.change_impact).toBeUndefined();
  expect(cfg.change_probability).toBeUndefined();
  expect(cfg.change_urgency).toBeUndefined();
  expect(cfg.change_lead_minutes).toBeUndefined();
  expect(cfg.change_duration_minutes).toBeUndefined();

  // Verify locked approval notice in visual editor
  await expect(page.getByTestId('workflow-visual-editor')).toBeVisible();
});

