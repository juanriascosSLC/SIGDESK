import { expect, test } from '@playwright/test';
import { mockAuthenticatedAdmin } from './support';

// El bloque «Cambiar estado» en el canvas.
//
// Está operativo desde ADR-0038 porque ya hay runtime real detrás. Lo que estas
// pruebas protegen es que el panel siga siendo honesto:
//
//   - Las transiciones vienen de Catalog Builder, que es su dueño, con origen y
//     destino visibles.
//   - Lo que se guarda es la CLAVE, no el estado destino.
//   - Una transición que exige datos que una automatización no puede aportar se
//     avisa ANTES de publicar, no con el primer ticket.
//   - Un fallo al leer las transiciones no borra la configuración guardada.

const transicionesINC = {
  entityKey: 'INC',
  version: 3,
  specification: {
    lifecycle: {
      transitions: [
        { key: 'start-work', from: 'open', to: 'in_progress', label: 'Empezar a trabajar' },
        { key: 'resolve', from: 'in_progress', to: 'resolved', label: 'Resolver' },
        { key: 'close', from: 'resolved', to: 'closed', label: 'Cerrar' },
      ],
    },
  },
};

const directorioVacio = { departments: [], teams: [], assignees: [] };

test('el panel de estado ofrece las transiciones publicadas y guarda su clave', async ({ page }) => {
  await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
  let guardado: {
    reglas?: Array<{ accion: string; config?: Record<string, unknown> }>;
    execution_plan?: { nodes: Array<{ id: string; kind: string; action?: string }> };
    layout?: { nodes: Array<{ id: string; data: Record<string, unknown> }> };
  } | undefined;

  await page.route('**/organization/assignment-directory**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(directorioVacio) }));
  await page.route('**/catalog/definitions/INC', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(transicionesINC) }));
  await page.route('**/workflows/drafts', async (route) => {
    guardado = JSON.parse(route.request().postData() ?? '{}');
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ ...guardado, id: 'draft-estado', estado: 'borrador' }),
    });
  });
  await page.route('**/workflows/draft-estado', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      id: 'draft-estado', categoria_id: 'INC', version: 1, estado: 'borrador',
      reglas: guardado?.reglas ?? [], layout: { nodes: [], edges: [] },
    }),
  }));

  await page.goto('/app/automations/new');
  await expect(page.getByTestId('workflow-visual-editor')).toBeVisible();

  await page.getByRole('button', { name: /Change Status/ }).click();
  const nodoEstado = page.locator('.react-flow__node').filter({ hasText: 'Change Status' }).first();
  await nodoEstado.click();

  const selector = page.getByTestId('status-transition');
  await expect(selector).toBeVisible();
  await expect(selector.locator('option')).toContainText([
    'Select a transition…',
    'Empezar a trabajar · open → in_progress',
    'Resolver · in_progress → resolved',
    'Cerrar · resolved → closed',
  ]);

  await selector.selectOption('start-work');
  await expect(page.getByTestId('status-summary')).toContainText('open');
  await expect(page.getByTestId('status-summary')).toContainText('in_progress');
  // El resumen llega al propio nodo: el diagrama se lee sin abrir el panel.
  await expect(nodoEstado).toContainText('start-work');

  await page.getByTestId('canvas-save-draft').click();
  await page.waitForURL('**/app/automations/draft-estado');

  // El bloque se añadió SUELTO, así que el diagrama todavía no compila —una
  // acción sin conectar al disparador no se publica— y el borrador viaja sin
  // reglas ni plan. Eso es deliberado: un borrador a medias también se guarda.
  // Lo que sí tiene que sobrevivir es la configuración del nodo, que es lo que
  // se recupera al recargar.
  expect(guardado?.reglas ?? []).toEqual([]);
  const nodoGuardado = (guardado?.layout?.nodes ?? []).find((nodo) => nodo.data.catalogKey === 'action.change_status');
  expect(nodoGuardado?.data.transitionKey).toBe('start-work');
  expect(nodoGuardado?.data.transitionFrom).toBe('open');
  expect(nodoGuardado?.data.transitionTo).toBe('in_progress');
  // Que la regla y el plan lleven la clave cuando el diagrama SÍ compila lo
  // fija automations-execution-plan.spec.ts, sin depender del arrastre.
});

test('una transición que exige datos adicionales avisa antes de publicarse', async ({ page }) => {
  await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
  await page.route('**/organization/assignment-directory**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(directorioVacio) }));
  await page.route('**/catalog/definitions/INC', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(transicionesINC) }));

  await page.goto('/app/automations/new');
  await expect(page.getByTestId('workflow-visual-editor')).toBeVisible();
  await page.getByRole('button', { name: /Change Status/ }).click();
  await page.locator('.react-flow__node').filter({ hasText: 'Change Status' }).first().click();

  await page.getByTestId('status-transition').selectOption('close');
  await expect(page.getByTestId('status-requires-input')).toBeVisible();
  await expect(page.getByTestId('status-requires-input')).toContainText('cannot provide');

  // Con `start-work` no hay aviso: esa transición no pide nada.
  await page.getByTestId('status-transition').selectOption('start-work');
  await expect(page.getByTestId('status-requires-input')).toHaveCount(0);
});

test('si no se pueden leer las transiciones, la configuración guardada no se borra', async ({ page }) => {
  await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
  await page.route('**/organization/assignment-directory**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(directorioVacio) }));
  await page.route('**/catalog/definitions/INC', (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'catalog no disponible' }) }));
  await page.route('**/workflows/draft-con-estado', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      id: 'draft-con-estado', categoria_id: 'INC', version: 1, estado: 'borrador',
      reglas: [{
        id: 'state-1', accion: 'cambiar_estado_ticket', condicion: 'siempre',
        demora_segundos: 0, config: { transition_key: 'start-work' },
      }],
      layout: {
        nodes: [
          {
            id: 'trigger-1', type: 'trigger', position: { x: 0, y: 0 },
            data: { catalogKey: 'ticket.created', label: 'INC creado', supportStatus: 'operational', color: 'cyan' },
          },
          {
            id: 'state-1', type: 'action', position: { x: 300, y: 0 },
            data: {
              catalogKey: 'action.change_status', label: 'Change Status', supportStatus: 'operational',
              color: 'emerald', transitionKey: 'start-work', transitionFrom: 'open', transitionTo: 'in_progress',
            },
          },
        ],
        edges: [{ id: 'e1', source: 'trigger-1', target: 'state-1' }],
      },
    }),
  }));

  await page.goto('/app/automations/draft-con-estado');
  await expect(page.getByTestId('workflow-visual-editor')).toBeVisible();
  await page.locator('.react-flow__node').filter({ hasText: 'Change Status' }).first().click();

  await expect(page.getByTestId('status-transitions-error')).toBeVisible();
  // La clave sigue ahí: un fallo de lectura no puede borrar configuración, y
  // tampoco puede marcarla como inexistente —no se sabe si existe—.
  await expect(page.getByTestId('status-transition')).toHaveValue('start-work');
  await expect(page.getByTestId('status-transition-missing')).toHaveCount(0);
});
