import { expect, test, type Page } from '@playwright/test';
import { mockAuthenticatedRequester } from './support';

/**
 * "My Tickets" (features/endUser/MyTickets.tsx) — GET /entities/INC?createdBy=me.
 * The backend contract itself (createdBy=me resolution, per-request
 * isolation between requesters, 403 on another requester's detail) is
 * proven against real Postgres in
 * tickets_service/adapters/in/mis_tickets_postgres_test.go; this file
 * verifies what only the browser can: the frontend sends the right
 * request, renders real data honestly, paginates/searches correctly, and
 * degrades and recovers the way a real user would see it.
 */

function ticketRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: '101',
    humanId: 'INC-000101',
    entityKey: 'INC',
    state: 'abierto',
    data: { title: 'Laptop screen flickering' },
    createdAt: '2026-08-30T12:00:00Z',
    creadorId: 'requester-1',
    prioridad: 'media',
    ...overrides,
  };
}

async function mockEntitiesList(
  page: Page,
  responder: (url: URL) => { items: unknown[]; nextCursor?: string; hasMore?: boolean },
) {
  await page.route('**/entities/INC?*', async (route) => {
    const url = new URL(route.request().url());
    const body = responder(url);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}

test('sends createdBy=me and never a raw user id', async ({ page }) => {
  await mockAuthenticatedRequester(page, { forwardUnmatched: false });
  let capturedCreatedBy: string | null = null;
  await mockEntitiesList(page, (url) => {
    capturedCreatedBy = url.searchParams.get('createdBy');
    return { items: [], hasMore: false };
  });

  await page.goto('/portal/tickets');
  await expect(page.getByText(/haven't submitted any tickets yet/i)).toBeVisible();
  expect(capturedCreatedBy).toBe('me');
});

test('requester with no tickets sees an honest empty state, not fabricated rows', async ({ page }) => {
  await mockAuthenticatedRequester(page, { forwardUnmatched: false });
  await mockEntitiesList(page, () => ({ items: [], hasMore: false }));

  await page.goto('/portal/tickets');
  await expect(page.getByText(/haven't submitted any tickets yet/i)).toBeVisible();
  await expect(page.getByText('INC-202611')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /create request/i }).first()).toBeVisible();
});

test('requester with several tickets sees real fields, not simulated ones', async ({ page }) => {
  await mockAuthenticatedRequester(page, { forwardUnmatched: false });
  await mockEntitiesList(page, () => ({
    items: [
      ticketRecord({ id: '101', humanId: 'INC-000101', data: { title: 'Laptop screen flickering' }, state: 'abierto', prioridad: 'alta' }),
      ticketRecord({ id: '102', humanId: 'INC-000102', data: { title: 'VPN keeps disconnecting' }, state: 'resuelto', prioridad: 'baja' }),
    ],
    hasMore: false,
  }));

  await page.goto('/portal/tickets');
  await expect(page.getByText('INC-000101')).toBeVisible();
  await expect(page.getByText('Laptop screen flickering')).toBeVisible();
  await expect(page.getByText('INC-000102')).toBeVisible();
  await expect(page.getByText('VPN keeps disconnecting')).toBeVisible();
  // No leftover fabricated ids from the previous hardcoded version.
  await expect(page.getByText('REQ-202590')).toHaveCount(0);
});

test('search is a real request, not a client-side filter over fake data', async ({ page }) => {
  await mockAuthenticatedRequester(page, { forwardUnmatched: false });
  let capturedQuery: string | null = null;
  await mockEntitiesList(page, (url) => {
    capturedQuery = url.searchParams.get('q');
    return { items: [ticketRecord({ data: { title: 'Printer offline' } })], hasMore: false };
  });

  await page.goto('/portal/tickets');
  await page.getByRole('searchbox', { name: /search my tickets/i }).fill('printer');
  await expect.poll(() => capturedQuery).toBe('printer');
});

test('pagination advances and returns via real cursor/hasMore, and Previous is disabled on page one', async ({ page }) => {
  await mockAuthenticatedRequester(page, { forwardUnmatched: false });
  await mockEntitiesList(page, (url) => {
    const cursor = url.searchParams.get('cursor');
    if (!cursor) {
      return { items: [ticketRecord({ id: '1', humanId: 'INC-000001' })], nextCursor: 'page-2', hasMore: true };
    }
    return { items: [ticketRecord({ id: '2', humanId: 'INC-000002' })], hasMore: false };
  });

  await page.goto('/portal/tickets');
  await expect(page.getByText('INC-000001')).toBeVisible();
  const previous = page.getByRole('button', { name: /previous/i });
  const next = page.getByRole('button', { name: /^next/i });
  await expect(previous).toBeDisabled();
  await expect(next).toBeEnabled();

  await next.click();
  await expect(page.getByText('INC-000002')).toBeVisible();
  await expect(next).toBeDisabled();

  await previous.click();
  await expect(page.getByText('INC-000001')).toBeVisible();
});

test('an expired session signs the user out to a real login screen, not a blank or stuck list', async ({ page }) => {
  // A 401 here is handled app-wide (apiClient dispatches AUTH_FAILURE_EVENT,
  // AuthProvider tears the session down) rather than as a local ErrorState
  // inside this one widget — asserting the actual behavior, not the naive
  // expectation that the list itself renders a "session expired" message.
  await mockAuthenticatedRequester(page, { forwardUnmatched: false });
  await page.route('**/entities/INC?*', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error_code: 'TOKEN_INVALIDO', message: 'token inválido, expirado o ausente' }),
    }),
  );

  await page.goto('/portal/tickets');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('button', { name: /iniciar sesión/i })).toBeVisible();
});

test('tickets_service down shows a real error with retry, and recovers', async ({ page }) => {
  await mockAuthenticatedRequester(page, { forwardUnmatched: false });
  let failing = true;
  await mockEntitiesList(page, () => {
    if (failing) throw new Error('simulated outage');
    return { items: [ticketRecord()], hasMore: false };
  });
  await page.route('**/entities/INC?*', async (route) => {
    if (failing) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error_code: 'NO_DISPONIBLE', message: 'Service temporarily unavailable' }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [ticketRecord()], hasMore: false }),
    });
  });

  await page.goto('/portal/tickets');
  await expect(page.getByText(/service temporarily unavailable/i)).toBeVisible();

  failing = false;
  await page.getByRole('button', { name: /try again/i }).click();
  await expect(page.getByText('INC-000101')).toBeVisible();
});

test('portal navigation: My Tickets → row → Detail URL → Back returns to My Tickets, never /app', async ({ page }) => {
  await mockAuthenticatedRequester(page, { forwardUnmatched: false });
  await mockEntitiesList(page, () => ({ items: [ticketRecord({ id: '555', humanId: 'INC-000555' })], hasMore: false }));

  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/portal/tickets');
  await expect(page.getByText('INC-000555')).toBeVisible();
  await page.getByText('INC-000555').click();
  await expect(page).toHaveURL(/\/portal\/tickets\/555$/);
  expect(page.url()).not.toContain('/app/tickets');

  await page.goBack();
  await expect(page).toHaveURL(/\/portal\/tickets$/);
  await expect(page.getByText('INC-000555')).toBeVisible();

  expect(errors, errors.join('\n')).toEqual([]);
});
