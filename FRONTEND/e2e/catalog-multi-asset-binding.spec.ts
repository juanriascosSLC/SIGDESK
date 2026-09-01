import { expect, test, type Page } from '@playwright/test';
import {
  SIG_DESK_API_PORT,
  mockAuthenticatedAdmin,
  mockAuthenticatedRequester,
  mockAuthenticatedRequesterWithAssets,
} from './support';

/**
 * El campo «Dispositivo afectado» multi-dispositivo, en el navegador.
 *
 * Los activos van STUBBEADOS a propósito, no reenviados al backend real. Dos
 * motivos, y el segundo es el que obliga:
 *
 *  1. La selección de N dispositivos, el principal y los topes son lógica de
 *     interfaz: con un inventario fijo el test afirma exactamente eso y no
 *     depende de qué haya sincronizado el entorno.
 *  2. El arnés autentica con un token falso. Cualquier llamada reenviada al
 *     backend real responde 401, el cliente emite `sig:auth-failure` y la app
 *     expulsa al login — así que el test moriría por el mock de sesión y no
 *     por la funcionalidad. Por eso no se reenvía nada: lo que no se stubea
 *     devuelve 404, que la app tolera sin cerrar sesión.
 *
 * Lo que SÍ tiene que verificar el servidor —que los topes y la autorización
 * no se puedan saltar con una petición directa— vive en las pruebas Go de
 * tickets_service (ver multi_dispositivo_test.go), donde puede comprobarse de
 * verdad.
 */

const SITIO = { id: 'e2e-site-1', displayName: 'Sede Norte', assetType: 'site', kind: 'site' };
const OTRO_SITIO = { id: 'e2e-site-2', displayName: 'Bodega Sur', assetType: 'site', kind: 'site' };
const DISPOSITIVOS = [
  { id: 'e2e-cam-1', displayName: 'CAM-0001', assetType: 'camera', kind: 'device', siteAssetId: SITIO.id },
  { id: 'e2e-sw-1', displayName: 'SW-0007', assetType: 'switch', kind: 'device', siteAssetId: SITIO.id },
  { id: 'e2e-nvr-1', displayName: 'NVR-0002', assetType: 'nvr', kind: 'device', siteAssetId: SITIO.id },
];

function pagina(items: unknown[]) {
  return { items, hasMore: false, stale: false };
}

/**
 * Sirve un inventario fijo y publica una definición INC cuyo campo de
 * dispositivos acepta varios, sin tocar la base.
 *
 * Se registra DESPUÉS del mock de identidad porque Playwright resuelve las
 * rutas en orden inverso al de registro: la última gana.
 */
async function stubInventarioYDefinicion(page: Page, opciones: { multiple: boolean; maxItems?: number }) {
  await page.route(
    (url) => url.port === SIG_DESK_API_PORT,
    async (route) => {
      const url = new URL(route.request().url());
      const json = (body: unknown) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

      if (url.pathname === '/assets/sites') return json(pagina([SITIO, OTRO_SITIO]));
      if (url.pathname === `/assets/sites/${SITIO.id}/assets`) return json(pagina(DISPOSITIVOS));
      if (url.pathname.startsWith('/assets/sites/')) return json(pagina([]));

      // GET /catalog/definitions/{entityKey} devuelve UNA definición, no una
      // lista: envolverla en {items} deja el formulario sin campos.
      if (url.pathname.startsWith('/catalog/definitions')) {
        return json(definicion(opciones));
      }
      return route.fallback();
    },
  );
}

function definicion({ multiple, maxItems = 2 }: { multiple: boolean; maxItems?: number }) {
  const campos = [
    { key: 'titulo', label: 'Título', type: 'text', required: true },
    { key: 'sitio', label: 'Sitio', type: 'text', required: true, bindsTo: 'siteAssetId' },
    {
      key: 'dispositivos',
      label: 'Dispositivo afectado',
      // `text` a propósito: los tipos del metamodelo 1.7 no son publicables
      // (tiposCampoEjecutables), así que la multiplicidad vive en `multiple`.
      type: 'text',
      required: true,
      bindsTo: 'assetId',
      assetRole: 'affected',
      ...(multiple ? { multiple: true, minItems: 1, maxItems } : {}),
    },
  ];
  const placements = campos.map((campo, index) => ({
    id: `p-${campo.key}`,
    kind: 'field',
    source: 'catalog',
    fieldKey: campo.key,
    column: 0,
    columnSpan: 12,
    row: index,
  }));
  return {
    id: '900',
    entityKey: 'INC',
    name: 'INC multi-dispositivo (e2e)',
    version: 1,
    status: 'published',
    specification: {
      fields: campos,
      createPage: {
        default: {
          header: {
            columns: 12,
            placements: [
              { id: 'w-header', kind: 'widget', widgetKey: 'formHeader', column: 0, columnSpan: 12, row: 0 },
            ],
          },
          main: { columns: 12, placements },
          actions: {
            columns: 12,
            placements: [
              { id: 'w-actions', kind: 'widget', widgetKey: 'formActions', column: 0, columnSpan: 12, row: 0 },
            ],
          },
          footer: { columns: 12, placements: [] },
        },
      },
    },
  };
}

async function abrirFormulario(page: Page) {
  await page.goto('/app/catalog/INC');
  await expect(page.getByTestId('binding-picker-site')).toBeVisible();
}

test.describe('Campo multi-dispositivo', () => {
  test('elige varios dispositivos y el principal es explícito', async ({ page }) => {
    await mockAuthenticatedAdmin(page);
    await stubInventarioYDefinicion(page, { multiple: true });
    await abrirFormulario(page);

    await page.getByTestId('binding-picker-site').getByTestId(`binding-picker-option-site-${SITIO.id}`).click();
    const picker = page.getByTestId('binding-picker-asset');
    await expect(picker).toBeVisible();

    await picker.getByTestId(`binding-picker-option-asset-${DISPOSITIVOS[0].id}`).click();
    await picker.getByTestId(`binding-picker-option-asset-${DISPOSITIVOS[1].id}`).click();

    await expect(picker.getByTestId(`binding-picker-selected-asset-${DISPOSITIVOS[0].id}`)).toBeVisible();
    await expect(picker.getByTestId(`binding-picker-selected-asset-${DISPOSITIVOS[1].id}`)).toBeVisible();
    await expect(picker.getByTestId(`binding-picker-principal-asset-${DISPOSITIVOS[0].id}`)).toBeVisible();

    // El principal es una decisión que la persona toma y ve, no el orden de
    // los clics: reordenar la selección no puede cambiar una regla en silencio.
    await picker.getByTestId(`binding-picker-make-principal-asset-${DISPOSITIVOS[1].id}`).click();
    await expect(picker.getByTestId(`binding-picker-principal-asset-${DISPOSITIVOS[1].id}`)).toBeVisible();
    await expect(picker.getByTestId(`binding-picker-principal-asset-${DISPOSITIVOS[0].id}`)).toHaveCount(0);
  });

  test('quitar un dispositivo lo devuelve a la lista', async ({ page }) => {
    await mockAuthenticatedAdmin(page);
    await stubInventarioYDefinicion(page, { multiple: true });
    await abrirFormulario(page);

    await page.getByTestId('binding-picker-site').getByTestId(`binding-picker-option-site-${SITIO.id}`).click();
    const picker = page.getByTestId('binding-picker-asset');
    await picker.getByTestId(`binding-picker-option-asset-${DISPOSITIVOS[0].id}`).click();
    await expect(picker.getByTestId(`binding-picker-selected-asset-${DISPOSITIVOS[0].id}`)).toBeVisible();

    await picker.getByTestId(`binding-picker-remove-asset-${DISPOSITIVOS[0].id}`).click();

    await expect(picker.getByTestId(`binding-picker-selected-asset-${DISPOSITIVOS[0].id}`)).toHaveCount(0);
    await expect(picker.getByTestId(`binding-picker-option-asset-${DISPOSITIVOS[0].id}`)).toBeEnabled();
  });

  test('al llegar al máximo, el resto queda deshabilitado y el contador lo explica', async ({ page }) => {
    await mockAuthenticatedAdmin(page);
    await stubInventarioYDefinicion(page, { multiple: true, maxItems: 2 });
    await abrirFormulario(page);

    await page.getByTestId('binding-picker-site').getByTestId(`binding-picker-option-site-${SITIO.id}`).click();
    const picker = page.getByTestId('binding-picker-asset');
    await picker.getByTestId(`binding-picker-option-asset-${DISPOSITIVOS[0].id}`).click();
    await picker.getByTestId(`binding-picker-option-asset-${DISPOSITIVOS[1].id}`).click();

    // Un clic al tope no se descarta en silencio.
    await expect(picker.getByTestId(`binding-picker-option-asset-${DISPOSITIVOS[2].id}`)).toBeDisabled();
    await expect(picker.getByTestId('binding-picker-count-asset')).toContainText('2 de 2');
  });

  test('cambiar de sitio limpia los dispositivos ya elegidos', async ({ page }) => {
    await mockAuthenticatedAdmin(page);
    await stubInventarioYDefinicion(page, { multiple: true });
    await abrirFormulario(page);

    const sitePicker = page.getByTestId('binding-picker-site');
    await sitePicker.getByTestId(`binding-picker-option-site-${SITIO.id}`).click();
    const picker = page.getByTestId('binding-picker-asset');
    await picker.getByTestId(`binding-picker-option-asset-${DISPOSITIVOS[0].id}`).click();
    await expect(picker.getByTestId(`binding-picker-selected-asset-${DISPOSITIVOS[0].id}`)).toBeVisible();

    // Sin esto el backend rechazaría la creación entera con ErrRecursoInvalido:
    // el dispositivo ya no pertenece al sitio del contexto.
    await sitePicker.getByRole('button', { name: /cambiar/i }).click();
    await sitePicker.getByTestId(`binding-picker-option-site-${OTRO_SITIO.id}`).click();

    await expect(picker.getByTestId(`binding-picker-selected-asset-${DISPOSITIVOS[0].id}`)).toHaveCount(0);
  });

  test('una definición sin `multiple` conserva el selector de uno solo', async ({ page }) => {
    await mockAuthenticatedAdmin(page);
    await stubInventarioYDefinicion(page, { multiple: false });
    await abrirFormulario(page);

    await page.getByTestId('binding-picker-site').getByTestId(`binding-picker-option-site-${SITIO.id}`).click();
    const picker = page.getByTestId('binding-picker-asset');
    await picker.getByTestId(`binding-picker-option-asset-${DISPOSITIVOS[0].id}`).click();

    // Compatibilidad hacia atrás: chip + «Cambiar», sin contador ni principal.
    await expect(picker.getByRole('button', { name: /cambiar/i })).toBeVisible();
    await expect(picker.getByTestId('binding-picker-count-asset')).toHaveCount(0);
    await expect(picker.getByTestId(`binding-picker-principal-asset-${DISPOSITIVOS[0].id}`)).toHaveCount(0);
  });
});

test.describe('Acceso al inventario según el permiso, no la ruta', () => {
  test('un solicitante CON permiso ve el buscador en el portal', async ({ page }) => {
    await mockAuthenticatedRequesterWithAssets(page);
    await stubInventarioYDefinicion(page, { multiple: true });

    await page.goto('/portal/catalog/INC');

    const sitePicker = page.getByTestId('binding-picker-site');
    await expect(sitePicker).toBeVisible();
    await expect(sitePicker).not.toContainText('no tiene acceso al inventario');
    await expect(sitePicker.getByPlaceholder(/buscar sitio/i)).toBeVisible();
    // Y llega hasta los dispositivos de su área.
    await sitePicker.getByTestId(`binding-picker-option-site-${SITIO.id}`).click();
    await expect(page.getByTestId('binding-picker-asset')).toBeVisible();
  });

  test('un solicitante SIN permiso ve un mensaje cierto, no un formulario roto', async ({ page }) => {
    await mockAuthenticatedRequester(page);
    await stubInventarioYDefinicion(page, { multiple: true });

    await page.goto('/portal/catalog/INC');

    const sitePicker = page.getByTestId('binding-picker-site');
    await expect(sitePicker).toBeVisible();
    // El mensaje anterior afirmaba «No encontramos tu equipo asignado todavía»
    // sin haber consultado nada — justo lo que BindingPicker prohíbe por ser
    // falso. Ahora dice lo que de verdad pasa.
    await expect(sitePicker).toContainText('no tiene acceso al inventario');
    await expect(sitePicker.getByPlaceholder(/buscar sitio/i)).toHaveCount(0);
    // El resto del formulario sigue en pie: no se rompe, se explica.
    await expect(page.getByTestId('catalog-input-titulo')).toBeVisible();
  });
});
