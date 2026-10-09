import { expect, test, type Page, type Route } from '@playwright/test';
import { mockAuthenticatedAdmin } from './support';

const now = '2026-10-09T12:00:00Z';

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function stubShell(page: Page) {
  await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
  await page.route('**/notifications*', (route) => json(route, { items: [], unread: 0 }));
}

test('INC human deep link resolves directly without a list scan', async ({ page }) => {
  await stubShell(page);
  const requested: string[] = [];
  await page.route((url) => url.port === '8000', async (route) => {
    const path = new URL(route.request().url()).pathname;
    requested.push(path);
    if (path === '/entities/INC/INC-000123') return json(route, {
      id: '123', humanId: 'INC-000123', entityKey: 'INC', state: 'abierto', prioridad: 'media',
      data: { title: 'Human-link incident', description: 'Opened from the compatibility API.' },
      creadorId: 'requester-1', creadorNombre: 'Requester One', createdAt: now, updatedAt: now,
    });
    if (path === '/entities/INC/123/operational-cycle') return json(route, {
      triage: { ticketId: 123, claimedByUserId: '', claimedDepartmentId: '', claimedTeamId: '', duplicateDecision: '', decidedByUserId: '', revision: 0 },
      workItems: [], clientActions: [], serviceCycles: [],
    });
    if (path.startsWith('/tickets/123/')) return json(route, { items: [] });
    if (path === '/relationships/INC/123') return json(route, { items: [] });
    if (path === '/sla/assessments/123' || path === '/entities/INC/123/manifest' || path === '/entities/INC/123/resolved-definition') {
      return json(route, { error_code: 'NOT_FOUND' }, 404);
    }
    return route.fallback();
  });

  await page.goto('/app/tickets/INC-000123');
  await expect(page.getByRole('heading', { name: 'Canonical incident lifecycle' })).toBeVisible();
  await expect(page).toHaveURL(/\/app\/tickets\/INC-000123$/);
  expect(requested).toContain('/entities/INC/INC-000123');
  expect(requested).not.toContain('/entities/INC');
});

test('RQS human deep link sends commands with the canonical numeric ID', async ({ page }) => {
  await stubShell(page);
  const commandURLs: string[] = [];
  const request = {
    id: 456, humanId: 'RQS-000456', incidentId: 123, incidentHumanId: 'INC-000123',
    changeId: '9', changeHumanId: 'RFC-000009', requesterId: 'requester-1', requesterName: 'Requester One',
    title: 'Replacement camera', description: 'Purchase required hardware.', lines: [{ description: 'Camera', quantity: 1 }],
    status: 'pending_manager_approval', history: [], purchaseOrder: null, shipment: null, delivery: null,
    createdAt: now, updatedAt: now, revision: 1,
  };
  await page.route((url) => url.port === '8000', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/service-requests/RQS-000456') return json(route, request);
    if (path === '/service-requests/456/commands/approve') {
      commandURLs.push(path);
      return json(route, { serviceRequest: { ...request, status: 'approved', revision: 2 } });
    }
    return route.fallback();
  });

  await page.goto('/app/purchasing/RQS-000456');
  await expect(page.getByRole('heading', { name: /RQS-000456/ })).toBeVisible();
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByText('Approved', { exact: true }).first()).toBeVisible();
  expect(commandURLs).toEqual(['/service-requests/456/commands/approve']);
});
