import { expect, test } from '@playwright/test';
import {
  mockAuthenticatedAdmin,
  mockAuthenticatedAgentWithoutAdminAccess,
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
  await mockAuthenticatedAdmin(page);

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

  await page.goto('/app/admin/users');

  await expect(
    page.getByRole('heading', { name: 'Roles y Permisos', exact: true }),
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

test('un usuario sin permiso sobre roles/usuarios ve exactamente eso: nada de Users & Roles', async ({
  page,
}) => {
  await mockAuthenticatedAgentWithoutAdminAccess(page);

  await page.goto('/app/admin/users');

  // App.tsx: la ruta /admin/users tiene su propio ProtectedRoute
  // (requireCondition={canManageUsersAndRoles}, fallbackTo="/app") —
  // independiente del guard externo de /app/* que este fixture sí supera
  // (permissions:['*'] alcanza para el `can()` de las rutas de
  // tickets/changes/problems, pero canManageUsersAndRoles se calcula
  // aparte, solo a partir de un permiso con prefijo roles:/usuarios:, que
  // este fixture deliberadamente no tiene). El bounce debe aterrizar en
  // /app, nunca de vuelta en /login — la sesión es válida, el permiso no.
  await expect(page).toHaveURL(/\/app\/?$/);
  await expect(
    page.getByRole('heading', { name: 'Roles y Permisos', exact: true }),
  ).not.toBeVisible();
});
