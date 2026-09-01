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
  await expect(dashboard).toHaveAttribute('title', 'Dashboard');
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
