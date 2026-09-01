import { expect, test, type Page } from '@playwright/test';
import { mockAuthenticatedAdmin } from './support';

// La campana dejó de ser un array estático dentro de AgentLayout.tsx y
// pasó a consumir notification_service. Lo que estos casos fijan es
// justamente lo que el mock escondía:
//
//   * el contador es el que devuelve el backend, no `items.length`;
//   * abrirla consulta;
//   * cargando / vacío / error / reintento son estados DISTINTOS y
//     visibles — colapsarlos haría que un backend caído se viera igual
//     que una bandeja limpia;
//   * marcar leída (una y todas) llega al backend;
//   * una notificación de INC/PRB/RFC navega a su registro.

type NotificacionMock = {
  id: string;
  tipoEvento: string;
  entityKey?: string;
  entityId?: string;
  enlace?: string;
  canal: string;
  estado: string;
  idioma: string;
  titulo: string;
  cuerpo: string;
  leida: boolean;
  creadaEn: string;
};

function notificacion(over: Partial<NotificacionMock> = {}): NotificacionMock {
  return {
    id: '1',
    tipoEvento: 'tickets_service.TicketAsignado',
    entityKey: 'INC',
    entityId: '42',
    enlace: '/app/tickets/42',
    canal: 'in_app',
    estado: 'sent',
    idioma: 'es',
    titulo: 'Te asignaron INC-42',
    cuerpo: 'Ahora eres responsable de este ticket.',
    leida: false,
    creadaEn: new Date('2026-08-30T12:00:00Z').toISOString(),
    ...over,
  };
}

/** Registrada DESPUÉS de mockAuthenticatedAdmin para tener precedencia
 *  sobre su reenvío al backend real. */
async function interceptarBandeja(
  page: Page,
  responder: (ruta: import('@playwright/test').Route) => Promise<void>,
) {
  await page.route((url) => url.pathname.startsWith('/notifications'), responder);
}

async function abrirApp(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockAuthenticatedAdmin(page);
}

test('el contador muestra el número real de no leídas que devuelve el backend', async ({ page }) => {
  await abrirApp(page);
  // 2 items en la página, pero 7 sin leer en total: el contador NO puede
  // derivarse de lo cargado.
  await interceptarBandeja(page, async (ruta) => {
    await ruta.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [notificacion({ id: '1' }), notificacion({ id: '2', titulo: 'Otra' })],
        noLeidas: 7,
      }),
    });
  });

  await page.goto('/app');

  await expect(page.getByTestId('notification-bell')).toBeVisible();
  await expect(page.getByTestId('notification-bell-count')).toHaveText('7');
});

test('abrir la campana consulta el backend y lista lo que devuelve', async ({ page }) => {
  await abrirApp(page);
  let peticiones = 0;
  await interceptarBandeja(page, async (ruta) => {
    peticiones += 1;
    await ruta.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [notificacion()], noLeidas: 1 }),
    });
  });

  await page.goto('/app');
  await expect(page.getByTestId('notification-bell-count')).toHaveText('1');
  const antes = peticiones;

  await page.getByTestId('notification-bell').click();

  await expect(page.getByTestId('notification-panel')).toBeVisible();
  await expect(page.getByText('Te asignaron INC-42')).toBeVisible();
  expect(peticiones, 'abrir la campana debe volver a consultar').toBeGreaterThan(antes);
});

test('la bandeja vacía se distingue de un fallo: dice que no hay nada', async ({ page }) => {
  await abrirApp(page);
  await interceptarBandeja(page, async (ruta) => {
    await ruta.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [], noLeidas: 0 }),
    });
  });

  await page.goto('/app');
  await page.getByTestId('notification-bell').click();

  await expect(page.getByTestId('notification-empty')).toBeVisible();
  await expect(page.getByTestId('notification-bell-count')).toHaveCount(0);
  await expect(page.getByTestId('notification-error')).toHaveCount(0);
});

// El caso que el mock estático hacía imposible de ver.
test('un backend caído muestra error y un reintento que funciona', async ({ page }) => {
  await abrirApp(page);
  let falla = true;
  await interceptarBandeja(page, async (ruta) => {
    if (falla) {
      await ruta.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error_code: 'ERROR_INTERNO', message: 'error interno' }),
      });
      return;
    }
    await ruta.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [notificacion()], noLeidas: 1 }),
    });
  });

  await page.goto('/app');
  await page.getByTestId('notification-bell').click();

  await expect(page.getByTestId('notification-error')).toBeVisible();
  await expect(page.getByTestId('notification-empty')).toHaveCount(0);

  falla = false;
  await page.getByTestId('notification-retry').click();

  await expect(page.getByTestId('notification-error')).toHaveCount(0);
  await expect(page.getByText('Te asignaron INC-42')).toBeVisible();
});

test('marcar una como leída llega al backend', async ({ page }) => {
  await abrirApp(page);
  let leida = false;
  const marcadas: string[] = [];
  await interceptarBandeja(page, async (ruta) => {
    const url = new URL(ruta.request().url());
    if (ruta.request().method() === 'PATCH' && url.pathname.endsWith('/read')) {
      marcadas.push(url.pathname);
      leida = true;
      await ruta.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(notificacion({ leida: true, estado: 'read' })),
      });
      return;
    }
    await ruta.fulfill({
      status: 200,
      contentType: 'application/json',
      // Sin enlace: así el clic marca como leída sin navegar y el panel
      // sigue en pantalla para poder afirmar sobre él.
      body: JSON.stringify({
        items: [notificacion({ leida, enlace: undefined, entityId: undefined, entityKey: undefined })],
        noLeidas: leida ? 0 : 1,
      }),
    });
  });

  await page.goto('/app');
  await page.getByTestId('notification-bell').click();
  await expect(page.getByTestId('notification-unread-dot')).toBeVisible();

  await page.getByTestId('notification-item-1').click();

  await expect.poll(() => marcadas.length, { message: 'debe llamarse PATCH .../read' }).toBeGreaterThan(0);
  expect(marcadas[0]).toBe('/notifications/1/read');
  await expect(page.getByTestId('notification-bell-count')).toHaveCount(0);
});

test('marcar todas como leídas llega al backend y vacía el contador', async ({ page }) => {
  await abrirApp(page);
  let todasLeidas = false;
  let llamadas = 0;
  await interceptarBandeja(page, async (ruta) => {
    const url = new URL(ruta.request().url());
    if (ruta.request().method() === 'POST' && url.pathname === '/notifications/read-all') {
      llamadas += 1;
      todasLeidas = true;
      await ruta.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ actualizadas: 3, noLeidas: 0 }),
      });
      return;
    }
    await ruta.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [notificacion({ leida: todasLeidas })],
        noLeidas: todasLeidas ? 0 : 3,
      }),
    });
  });

  await page.goto('/app');
  await expect(page.getByTestId('notification-bell-count')).toHaveText('3');
  await page.getByTestId('notification-bell').click();

  await page.getByTestId('notification-mark-all').click();

  await expect.poll(() => llamadas).toBe(1);
  await expect(page.getByTestId('notification-bell-count')).toHaveCount(0);
});

// Una notificación tiene que llevar al registro; si no, obliga a buscarlo
// a mano y deja de ser útil.
test('una notificación de INC navega al ticket', async ({ page }) => {
  await abrirApp(page);
  await interceptarBandeja(page, async (ruta) => {
    if (ruta.request().method() === 'PATCH') {
      await ruta.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(notificacion({ leida: true })) });
      return;
    }
    await ruta.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [notificacion()], noLeidas: 1 }),
    });
  });

  await page.goto('/app');
  await page.getByTestId('notification-bell').click();
  await page.getByTestId('notification-item-1').click();

  await expect(page).toHaveURL(/\/app\/tickets\/42$/);
});

test('una notificación de RFC navega al cambio', async ({ page }) => {
  await abrirApp(page);
  await interceptarBandeja(page, async (ruta) => {
    if (ruta.request().method() === 'PATCH') {
      await ruta.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(notificacion({ leida: true })) });
      return;
    }
    await ruta.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          notificacion({
            id: '9',
            tipoEvento: 'change_service.RFCEstadoCambiado',
            entityKey: 'RFC',
            entityId: '7',
            enlace: '/app/changes/7',
            titulo: 'RFC-0007 cambió a aprobado',
          }),
        ],
        noLeidas: 1,
      }),
    });
  });

  await page.goto('/app');
  await page.getByTestId('notification-bell').click();
  await page.getByTestId('notification-item-9').click();

  await expect(page).toHaveURL(/\/app\/changes\/7$/);
});
