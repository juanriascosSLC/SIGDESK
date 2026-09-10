import { expect, test, type Page } from '@playwright/test';
import {
  mockAuthenticatedAdmin,
  mockAuthenticatedTaskExecutor,
  SIG_DESK_API_BASE,
} from './support';

/**
 * La vertical de Organization en las Tasks de RFC, desde la UI.
 *
 * Estos casos son hermeticos a proposito: no dependen de que el arbol
 * organizacional local tenga Inventory/Warehouse sembrados. Lo que verifican
 * es lo que el codigo del frontend decide por su cuenta — a quien deja
 * entrar, que nombre muestra y de donde lo saca — que es justo la parte que
 * un walkthrough contra infraestructura real no distingue de un fallo de
 * datos. El recorrido completo contra backend vivo esta en
 * itsm-golden-path.spec.ts.
 */

const apiPort = new URL(SIG_DESK_API_BASE).port;

const warehouseTask = {
  task: {
    id: '9',
    humanId: 'TSK-000009',
    changeId: '4',
    title: 'Preparar stock de reemplazo',
    description: 'Alistar el equipo de reemplazo en bodega.',
    // Texto libre historico VACIO: una tarea nueva ya no lo usa. Si la UI
    // mostrara nombres solo desde aqui, la tarjeta saldria en blanco.
    area: '',
    team: '',
    assigneeId: '',
    departmentId: 'depto-inv',
    teamId: 'equipo-wh',
    assigneeUserId: 'wanda',
    organization: {
      departmentId: 'depto-inv',
      departmentName: 'Inventario',
      teamId: 'equipo-wh',
      teamName: 'Warehouse',
      assigneeUserId: 'wanda',
      assigneeName: 'Wanda Ortiz',
      assigneeEmail: 'wanda@sig.systems',
      capturedAt: '2026-08-31T10:00:00Z',
    },
    priority: 'high',
    required: true,
    status: 'in_progress',
    dependencyIds: [],
    dueAt: null,
    blockedReason: '',
    evidence: [],
    createdBy: 'services-lead',
    createdAt: '2026-08-31T10:00:00Z',
    updatedAt: '2026-08-31T10:00:00Z',
    completedAt: null,
  },
  // CONTEXTO MINIMO de la RFC padre. Si esta respuesta trajera la RFC
  // entera, el operario estaria leyendo un cambio de otro departamento.
  change: { id: '4', humanId: 'RFC-000004', state: 'implementing', title: 'Reemplazar switch de bodega' },
};

/** Intercepta la bandeja de trabajo asignado y recuerda que filtro pidio. */
async function stubAssignedTasks(page: Page, items: unknown[]) {
  const requested: string[] = [];
  await page.route(
    (url) => url.port === apiPort && url.pathname === '/changes/tasks/assigned',
    async (route) => {
      requested.push(new URL(route.request().url()).search);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items }),
      });
    },
  );
  return requested;
}

test('el asignado entra a su bandeja aunque no pueda leer las RFC', async ({ page }) => {
  await mockAuthenticatedTaskExecutor(page, { forwardUnmatched: false });
  await stubAssignedTasks(page, [warehouseTask]);

  // Sin ningun destino explicito: su superficie de trabajo es su bandeja.
  await page.goto('/');
  await expect(page).toHaveURL(/\/app\/changes\/my-tasks$/);

  const nav = page.locator('#app-nav');
  await expect(nav.getByText('My Tasks')).toBeVisible();
  await expect(nav.getByText('Changes', { exact: true })).toHaveCount(0);
});

test('la tarjeta muestra nombres del snapshot y solo el contexto minimo de la RFC', async ({ page }) => {
  await mockAuthenticatedTaskExecutor(page, { forwardUnmatched: false });
  await stubAssignedTasks(page, [warehouseTask]);

  await page.goto('/app/changes/my-tasks');
  const card = page.locator('article').filter({ hasText: 'TSK-000009' });
  await expect(card).toBeVisible();

  // Nombres, no UUIDs, y venidos del snapshot congelado — el texto libre
  // llega vacio en este fixture.
  await expect(card.getByText('Inventario')).toBeVisible();
  await expect(card.getByText('Warehouse')).toBeVisible();
  await expect(card.getByText('Wanda Ortiz')).toBeVisible();
  await expect(card.getByText('wanda', { exact: true })).toHaveCount(0);
  await expect(card.getByText('equipo-wh')).toHaveCount(0);

  // De la RFC padre solo su codigo, titulo y estado.
  await expect(card.getByText('RFC-000004')).toBeVisible();
  await expect(card.getByText('Reemplazar switch de bodega')).toBeVisible();
  await expect(card.getByText('implementing')).toBeVisible();
});

test('completar exige evidencia y la envia en la transicion', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await mockAuthenticatedTaskExecutor(page, { forwardUnmatched: false });
  await stubAssignedTasks(page, [warehouseTask]);

  let sent: Record<string, unknown> | null = null;
  let requestCount = 0;
  await page.route(
    (url) => url.port === apiPort && url.pathname.endsWith('/tasks/9/transitions/complete'),
    async (route) => {
      requestCount++;
      sent = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...warehouseTask.task, status: 'completed', evidence: ['Stock alistado'] }),
      });
    },
  );

  await page.goto('/app/changes/my-tasks');
  await page.getByRole('button', { name: 'Complete with evidence' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  // 1. Empty evidence: confirmation is disabled and sends no request
  await expect(dialog.getByRole('button', { name: 'Complete' })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Complete' }).click({ force: true });
  expect(sent).toBeNull();
  expect(requestCount).toBe(0);

  // 2. Whitespace-only evidence: confirmation remains disabled and sends no request
  await dialog.getByRole('textbox').fill('   ');
  await expect(dialog.getByRole('button', { name: 'Complete' })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Complete' }).click({ force: true });
  expect(sent).toBeNull();
  expect(requestCount).toBe(0);

  // 3. Valid evidence: button is enabled and sends exactly one request with exact payload
  await dialog.getByRole('textbox').fill('Stock alistado');
  await expect(dialog.getByRole('button', { name: 'Complete' })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Complete' }).click();

  expect(requestCount).toBe(1);
  expect(sent).toEqual({ evidence: ['Stock alistado'] });

  // 4. Successful completion displays the English success message
  await expect(page.getByText(/TSK-000009 is now completed/i)).toBeVisible();

  // 5. No console errors occur
  expect(consoleErrors).toEqual([]);
});

test('el filtro por defecto pide solo lo asignado a quien pregunta', async ({ page }) => {
  await mockAuthenticatedTaskExecutor(page, { forwardUnmatched: false });
  const requested = await stubAssignedTasks(page, [warehouseTask]);

  await page.goto('/app/changes/my-tasks');
  await expect(page.locator('article').filter({ hasText: 'TSK-000009' })).toBeVisible();
  expect(requested[0]).toBe('?assignedToMe=true');

  await page.getByRole('tab', { name: 'My team' }).click();
  await expect.poll(() => requested).toContain('?scope=team');
});

test('la bandeja vacia se distingue de un fallo de carga', async ({ page }) => {
  await mockAuthenticatedTaskExecutor(page, { forwardUnmatched: false });
  await stubAssignedTasks(page, []);

  await page.goto('/app/changes/my-tasks');
  await expect(page.getByText('You have no assigned tasks')).toBeVisible();
});

test('un administrador global ve la bandeja y tambien el tablero de RFC', async ({ page }) => {
  await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
  await stubAssignedTasks(page, [warehouseTask]);

  await page.goto('/app/changes/my-tasks');
  await expect(page.locator('article').filter({ hasText: 'TSK-000009' })).toBeVisible();
  await expect(page.locator('#app-nav').getByText('Changes')).toBeVisible();
});
