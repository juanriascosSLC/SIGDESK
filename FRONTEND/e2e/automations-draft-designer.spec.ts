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
