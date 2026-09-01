import { expect, test } from '@playwright/test';
import { mockAuthenticatedAdmin } from './support';

test('Assets/CMDB navega Site → Device y agrega historial INC/PRB/RFC', async ({ page }) => {
  await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
  const siteId = '11111111-1111-1111-1111-111111111111';
  const cameraId = '22222222-2222-2222-2222-222222222222';

  await page.route('**/assets/sites?*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ items: [{
      id: siteId, sourceSystem: 'sig_inventory', externalEntity: 'site', externalId: '159',
      externalKey: 'sig_inventory/site/159', kind: 'site', assetType: 'site', displayName: 'Bolton Volvo',
      lifecycle: 'active', attributes: {}, lastSyncedAt: '2026-08-30T10:00:00Z', deleted: false,
    }], hasMore: false, stale: false }),
  }));
  await page.route(`**/assets/sites/${siteId}/assets?*`, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ items: [{
      id: cameraId, sourceSystem: 'sig_inventory', externalEntity: 'camera', externalId: '23',
      externalKey: 'sig_inventory/camera/23', kind: 'device', siteAssetId: siteId, assetType: 'camera',
      displayName: 'Camera 23', lifecycle: 'active', manufacturer: 'HIKVISION', model: 'DS-2CD2143G2-I',
      serial: 'ABC123', ipAddress: '10.1.2.23', status: 'online', attributes: {},
      lastSyncedAt: '2026-08-30T10:00:00Z', deleted: false,
    }], hasMore: false, stale: false }),
  }));
  await page.route((url) => url.pathname === '/entities/INC' && url.searchParams.get('assetId') === cameraId, (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ items: [{
      id: '42', humanId: 'INC-000042', entityKey: 'INC', state: 'abierto', data: { title: 'Sin video' },
      prioridad: 'alta', createdAt: '2026-08-30T10:00:00Z', assetContext: { siteAssetId: siteId, links: [] },
    }], hasMore: false }),
  }));
  await page.route(`**/problems/by-asset/${cameraId}`, (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ items: [{
      id: '7', humanId: 'PRB-000007', entityKey: 'PRB', state: 'under_investigation', data: { title: 'Cámaras recurrentes' },
      createdAt: '2026-08-30T10:00:00Z', updatedAt: '2026-08-30T10:00:00Z',
    }] }),
  }));
  await page.route((url) => url.pathname === '/changes' && url.searchParams.get('assetId') === cameraId, (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ items: [{
      id: '9', humanId: 'RFC-000009', entityKey: 'RFC', state: 'draft', data: { title: 'Reemplazar cámara' },
      createdAt: '2026-08-30T10:00:00Z', updatedAt: '2026-08-30T10:00:00Z',
    }] }),
  }));

  await page.goto('/app/assets');
  await expect(page.getByRole('heading', { name: 'Inventario operativo' })).toBeVisible();
  await expect(page.getByText('Bolton Volvo').first()).toBeVisible();
  await page.getByRole('button', { name: /Camera 23/ }).click();

  await expect(page.getByText('Historial operativo de Camera 23')).toBeVisible();
  await expect(page.getByText('INC · 1')).toBeVisible();
  await expect(page.getByText('PRB · 1')).toBeVisible();
  await expect(page.getByText('RFC · 1')).toBeVisible();
  await expect(page.getByRole('link', { name: /INC-000042/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /PRB-000007/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /RFC-000009/ })).toBeVisible();
});

test('Assets/CMDB recorre todas las páginas de sitios de Resources', async ({ page }) => {
  await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
  const cursors: string[] = [];
  await page.route('**/assets/sites?*', (route) => {
    const cursor = new URL(route.request().url()).searchParams.get('cursor') ?? '';
    cursors.push(cursor);
    const secondPage = cursor === '1';
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [{
          id: secondPage ? 'site-omega' : 'site-alpha',
          sourceSystem: 'sig_inventory', externalEntity: 'site',
          externalId: secondPage ? '2' : '1',
          externalKey: secondPage ? 'sig_inventory/site/2' : 'sig_inventory/site/1',
          kind: 'site', assetType: 'site',
          displayName: secondPage ? 'Site Omega' : 'Site Alpha',
          lifecycle: 'active', attributes: {}, lastSyncedAt: '2026-08-30T10:00:00Z', deleted: false,
        }],
        hasMore: !secondPage,
        nextCursor: secondPage ? undefined : '1',
        stale: false,
      }),
    });
  });
  await page.route('**/assets/sites/*/assets?*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ items: [], hasMore: false, stale: false }),
  }));

  await page.goto('/app/assets');
  await expect(page.getByTestId('asset-site-count')).toHaveText('2');
  await expect(page.getByRole('button', { name: /Site Alpha/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Site Omega/ })).toBeVisible();
  expect(cursors).toEqual(['', '1']);
});

test('un administrador asigna un sitio a areas configurables de Organization', async ({ page }) => {
  await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
  const siteId = '11111111-1111-1111-1111-111111111111';
  const itId = '10000000-0000-0000-0000-000000000001';
  let savedUnitIds: string[] | undefined;

  await page.route('**/assets/sites?*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ items: [{
      id: siteId, sourceSystem: 'sig_inventory', externalEntity: 'site', externalId: '159',
      externalKey: 'sig_inventory/site/159', kind: 'site', assetType: 'site', displayName: 'Bolton Volvo',
      lifecycle: 'active', attributes: {}, organizationUnitIds: [],
      lastSyncedAt: '2026-08-30T10:00:00Z', deleted: false,
    }], hasMore: false, stale: false }),
  }));
  await page.route(`**/assets/sites/${siteId}/assets?*`, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ items: [], hasMore: false, stale: false }),
  }));
  await page.route('**/admin/companies', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ items: [
      { id: '00000000-0000-0000-0000-000000000001', nombre: 'SIG Systems Local', tipo: 'empresa' },
      { id: itId, nombre: 'IT', tipo: 'departamento', parent_id: '00000000-0000-0000-0000-000000000001' },
      { id: '10000000-0000-0000-0000-000000000002', nombre: 'Compras', tipo: 'departamento', parent_id: '00000000-0000-0000-0000-000000000001' },
    ] }),
  }));
  await page.route(`**/assets/${siteId}/organization-units`, async (route) => {
    savedUnitIds = (route.request().postDataJSON() as { organizationUnitIds: string[] }).organizationUnitIds;
    await route.fulfill({ status: 204 });
  });

  await page.goto('/app/assets');
  await page.getByRole('button', { name: 'Configurar acceso' }).click();
  await page.getByRole('checkbox', { name: /IT/ }).check();
  await page.getByRole('button', { name: 'Guardar acceso' }).click();

  await expect.poll(() => savedUnitIds).toEqual([itId]);
});
