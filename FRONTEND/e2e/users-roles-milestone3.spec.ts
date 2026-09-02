import { expect, test } from '@playwright/test';
import {
  mockAuthenticatedAdmin,
  mockAuthenticatedAgentWithoutAdminAccess,
  mockAuthenticatedRequester,
  mockAuthenticatedSupervisor,
} from './support';

/**
 * Docs/plans/conexion-backend-frontend-identidad-rol-plan.md Milestone 3
 * — QA end-to-end de la pantalla Users & Roles. No hay ningún otro spec
 * de esta suite que visite /app/admin/users todavía (ver e2e/support.ts,
 * comentario de adminIdentity: la mayoría de specs solo necesitan el
 * fixture para pasar el guard externo de /app/*, no para probar esta
 * pantalla en sí).
 *
 * Ámbito de este archivo, a propósito acotado al mismo criterio que el
 * plan citado arriba ("Catalog Builder explícitamente fuera de alcance"):
 * cubre el guard real de la pantalla (App.tsx `ProtectedRoute` sobre
 * `canManageUsersAndRoles`, AuthProvider.tsx) contra dos identidades
 * reales, no el CRUD completo de roles/usuarios (eso depende de datos que
 * un backend en vivo tendría que sembrar — fuera de lo que un mock de red
 * puede verificar con fidelidad).
 *
 * El login SIGTools real y el roundtrip completo POST /v1/session → JWT
 * real está cubierto del lado del backend, ejecutable sin infraestructura
 * (organization_service/application/milestone3_e2e_test.go,
 * TestMilestone3_AsignarRolYSesionReflejaExactamenteLosPermisosDelNuevoRol)
 * — este archivo cubre la otra mitad: qué renderiza la UI para cada forma
 * de permisos ya decodificada de un JWT, mismo criterio de mock que
 * itsm-golden-path.spec.ts (`mockAuthenticatedAdmin`) para el resto de la
 * suite.
 */

test('un admin con permisos reales sobre roles/usuarios entra a Users & Roles', async ({
  page,
}) => {
  await mockAuthenticatedAdmin(page, { forwardUnmatched: false });

  // RolesTab (UsersManager.tsx) dispara estas dos GET incondicionalmente
  // al montar, sin importar la pestaña activa (rbac.service.ts). Se
  // stubean acá — con precedencia sobre el forward-a-backend-real que
  // mockAuthenticatedAdmin registra (Playwright resuelve rutas en orden
  // inverso de registro) — porque este spec verifica el guard de acceso
  // en sí, no el contenido sembrado en un Postgres real; eso es lo que
  // cubren el runbook de QA manual y el test de backend
  // (TestMilestone3_AsignarRolYSesionReflejaExactamenteLosPermisosDelNuevoRol).
  // Envelopes vacíos pero con la forma real (Docs/TODOS.md TODO-089) para
  // que rbac.service.ts no truene sobre un campo inesperado.
  await page.route('**/admin/roles', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [] }),
    }),
  );
  await page.route('**/admin/permissions', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ acciones: [], alcances: [], entidades: [] }),
    }),
  );

  await page.goto('/app/admin/users', { waitUntil: 'domcontentloaded' });

  await expect(
    page.getByRole('heading', { name: 'Usuarios, roles y organización', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Roles y permisos' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Usuarios' })).toBeVisible();
  // El guard real, no solo la ausencia de un error visible: si
  // canManageUsersAndRoles llegara a evaluar false para este fixture, el
  // router redirige antes de montar UsersManager (App.tsx) y esta
  // aserción de URL fallaría, no solo la del heading de arriba.
  await expect(page).toHaveURL(/\/app\/admin\/users$/);
});

test('un administrador crea un agente de prueba con unidad IT y rol Agente', async ({ page }) => {
  await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
  const roles = {
    items: [
      { id: 'role-agent', nombre: 'Agente', descripcion: 'Soporte IT', permisos: [] },
      { id: 'role-requester', nombre: 'Solicitante', descripcion: '', permisos: [] },
    ],
  };
  await page.route('**/admin/roles', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(roles),
  }));
  await page.route('**/admin/permissions', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ acciones: [], alcances: [], entidades: [] }),
  }));
  await page.route(/:8000\/admin\/users$/, (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }),
  }));
  await page.route('**/admin/companies', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ items: [{ id: 'team-it', nombre: 'Equipo IT', tipo: 'equipo' }] }),
  }));
  await page.route('**/usuarios', async (route) => {
    expect(route.request().method()).toBe('POST');
    expect(route.request().postDataJSON()).toMatchObject({
      nombre: 'Ana Soporte', email: 'ana.soporte@example.test', company_id: 'team-it', role_id: 'role-agent',
    });
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'user-test-1', nombre: 'Ana Soporte', email: 'ana.soporte@example.test', company_id: 'team-it', role_id: 'role-agent', estado: 'activo' }),
    });
  });
  await page.route('**/agentes_it', async (route) => {
    expect(route.request().method()).toBe('POST');
    expect(route.request().postDataJSON()).toEqual({ usuario_id: 'user-test-1', habilidad: 'Soporte general', capacidad_carga: 10 });
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 'agent-test-1' }) });
  });

  await page.goto('/app/admin/users');
  await expect(page.getByRole('heading', { name: /Usuarios, roles/ })).toBeVisible();
  await page.getByRole('button', { name: 'Usuarios' }).click();
  await page.getByTestId('create-test-agent').click();
  await page.getByLabel('Nombre completo').fill('Ana Soporte');
  await page.getByLabel('Correo de prueba').fill('ana.soporte@example.test');
  await page.getByTestId('create-test-agent-form').getByRole('button', { name: 'Crear agente de prueba' }).click();

  await expect(page.getByTestId('create-test-agent-form')).toHaveCount(0);
});

test('un usuario sin permiso sobre roles/usuarios ve exactamente eso: nada de Users & Roles', async ({
  page,
}) => {
  await mockAuthenticatedAgentWithoutAdminAccess(page, { forwardUnmatched: false });

  await page.goto('/app/admin/users', { waitUntil: 'domcontentloaded' });

  // App.tsx: la ruta /admin/users tiene su propio ProtectedRoute
  // (requireCondition={canManageUsersAndRoles}, fallbackTo="/app") —
  // independiente del guard externo de /app/* que este fixture sí supera
  // (`tickets:read:global` alcanza para el guard exterior del workspace,
  // pero no otorga lectura sobre roles/usuarios). El bounce debe aterrizar en
  // /app, nunca de vuelta en /login — la sesión es válida, el permiso no.
  await expect(page).toHaveURL(/\/app\/?$/);
  await expect(
    page.getByRole('heading', { name: 'Usuarios, roles y organización', exact: true }),
  ).not.toBeVisible();
});

test('un requester permanece en el portal aunque pueda leer sus propios tickets', async ({ page }) => {
  await mockAuthenticatedRequester(page, { forwardUnmatched: false });
  await page.goto('/app/tickets', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/portal\/?$/);
  await expect(page.getByRole('link', { name: 'Tickets & Issues' })).toHaveCount(0);
});

test('un supervisor ve operación y reportes pero no administración de roles ni catálogo', async ({ page }) => {
  await mockAuthenticatedSupervisor(page, { forwardUnmatched: false });
  await page.goto('/app', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('link', { name: 'Tickets & Issues' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Change Mgmt' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Problem Mgmt' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Reports' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Users & Roles' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Catalog Builder' })).toHaveCount(0);
});
