import { expect, test } from '@playwright/test';
import { mockAuthenticatedAdmin } from './support';

// La navegación del workspace es de 256 px fijos y hasta ahora solo desaparecía
// por debajo de 768 px. En pantallas de portátil eso es un tercio del ancho
// gastado permanentemente cuando el agente está leyendo un ticket.
//
// Lo que fijan estos casos:
//   * el control existe, dice lo que hace y anuncia su estado;
//   * plegada, la navegación sigue siendo navegable — los destinos conservan
//     su nombre accesible aunque el texto ya no se pinte;
//   * el contenido recupera el ancho, que es el motivo de todo esto;
//   * la preferencia sobrevive a una recarga.

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockAuthenticatedAdmin(page);
  // AgentLayout's NotificationBell queries /notifications on every /app
  // render (mockAuthenticatedAdmin's identity has `canViewTickets`, which is
  // what gates it — see AgentLayout.tsx). Left unstubbed, that call falls
  // through to the live backend with this fixture's synthetic bearer token,
  // which the real service correctly 401s. apiClient's global handler reads
  // ANY 401 as "the session is gone" and signs the mocked session out mid
  // navigation (AUTH_FAILURE_EVENT → AuthProvider tears it down) — a real,
  // external failure destroying this test's simulated session, unrelated to
  // anything this suite is actually testing. Stubbing the endpoint (same
  // fixture shape as notifications-bell.spec.ts) is the fix, not swallowing
  // the resulting navigation/console errors.
  await page.route('**/notifications*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], unread: 0 }) }),
  );
  await page.goto('/app');
  await expect(page.getByTestId('app-nav-toggle')).toBeVisible();
});

test('la navegación se pliega y se despliega, y el control anuncia su estado', async ({ page }) => {
  const nav = page.locator('#app-nav');
  const toggle = page.getByTestId('app-nav-toggle');

  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(toggle).toHaveAttribute('aria-controls', 'app-nav');
  const anchoDesplegada = (await nav.boundingBox())!.width;
  expect(anchoDesplegada).toBeGreaterThan(200);

  await toggle.click();

  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect
    .poll(async () => Math.round((await nav.boundingBox())!.width), {
      message: 'la navegación debe encogerse a un raíl de iconos',
    })
    .toBeLessThan(120);
  // Sigue visible: plegar no es esconder.
  await expect(nav).toBeVisible();

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect
    .poll(async () => Math.round((await nav.boundingBox())!.width))
    .toBe(Math.round(anchoDesplegada));
});

// Un raíl de iconos sin nombre accesible es una fila de glifos: se puede ver
// pero no se puede usar con teclado ni con lector de pantalla.
test('plegada, cada destino conserva su nombre accesible', async ({ page }) => {
  await page.getByTestId('app-nav-toggle').click();
  await expect(page.getByTestId('app-nav-toggle')).toHaveAttribute('aria-expanded', 'false');

  const dashboard = page.locator('#app-nav').getByRole('link', { name: 'Dashboard' });
  await expect(dashboard).toBeVisible();
  // The native `title` attribute was replaced by the shared Tooltip
  // component (a real, high-contrast, keyboard-reachable tooltip — see
  // agent-nav-responsive.spec.ts for its own dedicated hover/focus test);
  // what stays true here is that the link is still reachable by its
  // accessible name AND is now described by that tooltip via
  // aria-describedby (set by Tooltip itself).
  await expect(dashboard).toHaveAttribute('aria-label', 'Dashboard');
  await expect(dashboard).toHaveAttribute('aria-describedby', /.+/);
  // El texto ya no se pinta, pero el enlace sigue siendo alcanzable por nombre.
  await expect(dashboard).toHaveAttribute('href', '/app');
});

// El punto de todo el cambio: el contenido gana el ancho que suelta el raíl.
test('el contenido recupera el ancho que libera la navegación', async ({ page }) => {
  const main = page.locator('main');
  const antes = (await main.boundingBox())!.width;

  await page.getByTestId('app-nav-toggle').click();
  await expect(page.getByTestId('app-nav-toggle')).toHaveAttribute('aria-expanded', 'false');

  await expect
    .poll(async () => Math.round((await main.boundingBox())!.width), {
      message: 'el contenido debe ensancharse al plegar la navegación',
    })
    .toBeGreaterThan(Math.round(antes) + 100);
});

test('la preferencia sobrevive a una recarga', async ({ page }) => {
  await page.getByTestId('app-nav-toggle').click();
  await expect(page.getByTestId('app-nav-toggle')).toHaveAttribute('aria-expanded', 'false');

  await page.reload();

  await expect(page.getByTestId('app-nav-toggle')).toHaveAttribute('aria-expanded', 'false');
  await expect
    .poll(async () => Math.round((await page.locator('#app-nav').boundingBox())!.width))
    .toBeLessThan(120);
});
