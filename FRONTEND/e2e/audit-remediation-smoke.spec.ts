import { expect, test, type Page } from '@playwright/test';
import { mockAuthenticatedAdmin } from './support';

async function mockJSON(page: Page, predicate: (url: URL) => boolean, body: unknown, status = 200) {
  await page.route(
    (url) => url.port === '8000' && predicate(url),
    (route) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }),
  );
}

test.describe('Audit Remediation Smoke Suite', () => {
  test('/forgot-password honestly states beta unavailability without email inputs or fake claims', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      // Filter expected 401 from unauthenticated background session check
      if (msg.type() === 'error' && !msg.text().includes('401')) {
        consoleErrors.push(msg.text());
      }
    });

    // Handle unauthenticated auth session check gracefully
    await page.route('**/api/v1/web-auth/me/', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Unauthenticated' }),
      });
    });

    await page.goto('/forgot-password');

    // 1. Displays the honest unavailable message
    const honestNotice = page.getByText(
      'Self-service password reset is not available during beta. Contact your administrator for help.',
    );
    await expect(honestNotice).toBeVisible();

    // 2. Contains no email input, no submit button, and never claims reset email was sent
    await expect(page.locator('input')).toHaveCount(0);
    await expect(page.locator('input[type="email"]')).toHaveCount(0);
    await expect(page.locator('button[type="submit"]')).toHaveCount(0);
    await expect(page.getByText(/check your email|we have sent|link to/i)).toHaveCount(0);

    // Working Back to Login link
    const backLink = page.getByRole('link', { name: /back to login/i });
    await expect(backLink).toBeVisible();
    await expect(backLink).toHaveAttribute('href', '/login');

    // 6. No console errors
    expect(consoleErrors).toEqual([]);
  });

  test('/app/tickets Kanban column header contains no dead ellipsis button', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await mockAuthenticatedAdmin(page, { forwardUnmatched: false });

    // Mock notifications queried by layout
    await mockJSON(page, (url) => url.pathname.startsWith('/notifications'), { items: [], unread: 0 });

    // Mock entities INC list
    await mockJSON(page, (url) => url.pathname === '/entities/INC', {
      items: [
        {
          id: '1',
          humanId: 'INC-000001',
          title: 'Camera offline at site A',
          status: 'Open',
          priority: 'High',
          requester: 'Playwright Admin',
          assignee: 'Unassigned',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      total: 1,
    });

    await page.goto('/app/tickets');

    // Wait for the Kanban board to render
    const openColumnHeader = page.getByRole('heading', { name: 'Open' });
    await expect(openColumnHeader).toBeVisible();

    // Verify column count badge is visible
    const badge = page.locator('div').filter({ hasText: /^1$/ }).first();
    await expect(badge).toBeVisible();

    // 3. Verify no dead button exists in column header (MoreHorizontal / ellipsis)
    const headerContainer = page.locator('.p-4.border-b.border-border\\/40').first();
    await expect(headerContainer.locator('button')).toHaveCount(0);
    await expect(page.locator('button svg.lucide-more-horizontal')).toHaveCount(0);

    // 6. No console errors
    expect(consoleErrors).toEqual([]);
  });

  test('Change relations resolve INC, PRB, RFC to correct routes, and render unknown entities as non-interactive badges', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
    await mockJSON(page, (url) => url.pathname.startsWith('/notifications'), { items: [], unread: 0 });

    const changeRecord = {
      id: '100',
      humanId: 'RFC-000100',
      entityKey: 'RFC',
      definitionId: '81',
      definitionVersionId: '81',
      definitionVersion: 1,
      schemaVersion: '1.5',
      manifestChecksum: 'checksum-100',
      state: 'draft',
      data: {
        title: 'Core Switch Firmware Upgrade',
        description: 'Upgrade switch firmware to resolve buffer pool leakage',
        requester: 'Playwright Admin',
        riskLevel: 'low',
      },
      createdAt: '2026-08-30T10:00:00Z',
      updatedAt: '2026-08-30T10:00:00Z',
    };

    const rfcSpecification = {
      fields: [
        { key: 'title', label: 'Title', type: 'text', required: true },
        { key: 'description', label: 'Description', type: 'textarea', required: true },
        { key: 'requester', label: 'Requester', type: 'text', required: true },
      ],
      lifecycle: { states: [{ key: 'draft', label: 'Draft', initial: true }], transitions: [] },
      relations: [],
    };

    await mockJSON(page, (url) => url.pathname === '/changes/RFC-000100', changeRecord);
    await mockJSON(page, (url) => url.pathname === '/changes/RFC-000100/manifest', {
      definitionVersionId: '81',
      entityKey: 'RFC',
      version: 1,
      metamodelVersion: '1.5',
      specification: rfcSpecification,
      resources: [],
      checksum: 'checksum-100',
      compiledAt: '2026-08-30T09:00:00Z',
    });
    await mockJSON(page, (url) => /^\/changes\/(100|RFC-000100)\/tasks$/.test(url.pathname), { items: [] });
    await mockJSON(page, (url) => url.pathname === '/changes/assignment-directory', {
      departments: [],
      teams: [],
      assignees: [],
    });

    // Mock 4 relations: INC, PRB, RFC, and ASSET (unknown)
    const relations = [
      {
        id: 'rel-inc',
        sourceEntityKey: 'RFC',
        sourceEntityId: '100',
        sourceHumanId: 'RFC-000100',
        targetEntityKey: 'INC',
        targetEntityId: '10',
        targetHumanId: 'INC-000010',
        relationKey: 'origin_inc',
        relationLabel: 'Caused by INC',
        inverseLabel: 'Generated RFC',
      },
      {
        id: 'rel-prb',
        sourceEntityKey: 'RFC',
        sourceEntityId: '100',
        sourceHumanId: 'RFC-000100',
        targetEntityKey: 'PRB',
        targetEntityId: '20',
        targetHumanId: 'PRB-000020',
        relationKey: 'solves_prb',
        relationLabel: 'Solves Problem',
        inverseLabel: 'Solved by RFC',
      },
      {
        id: 'rel-rfc',
        sourceEntityKey: 'RFC',
        sourceEntityId: '100',
        sourceHumanId: 'RFC-000100',
        targetEntityKey: 'RFC',
        targetEntityId: '30',
        targetHumanId: 'RFC-000030',
        relationKey: 'precedes_rfc',
        relationLabel: 'Precedes Change',
        inverseLabel: 'Depends on RFC',
      },
      {
        id: 'rel-asset',
        sourceEntityKey: 'RFC',
        sourceEntityId: '100',
        sourceHumanId: 'RFC-000100',
        targetEntityKey: 'ASSET',
        targetEntityId: '40',
        targetHumanId: 'AST-000040',
        relationKey: 'impacts_asset',
        relationLabel: 'Affected CI',
        inverseLabel: 'Target of RFC',
      },
    ];

    await mockJSON(page, (url) => url.pathname === '/relationships/RFC/RFC-000100', { items: relations });
    await mockJSON(page, (url) => url.pathname === '/change-relationships/RFC/RFC-000100', { items: [] });

    await page.goto('/app/changes/RFC-000100');

    // Verify change record is loaded
    await expect(page.getByRole('heading', { name: 'Core Switch Firmware Upgrade' })).toBeVisible();

    // Verify relations section heading is loaded
    await expect(page.getByRole('heading', { name: /Related Cases/i })).toBeVisible();

    // 4. Check supported interactive relations (INC, PRB, RFC) resolve to correct destinations
    const incLink = page.locator('[data-testid="relation-link-rel-inc"]');
    await expect(incLink).toBeVisible();
    await expect(incLink).toHaveAttribute('href', '/app/tickets/INC-000010');
    await expect(incLink).toHaveAttribute('aria-label', 'Open Caused by INC INC-000010');

    const prbLink = page.locator('[data-testid="relation-link-rel-prb"]');
    await expect(prbLink).toBeVisible();
    await expect(prbLink).toHaveAttribute('href', '/app/problems/PRB-000020');
    await expect(prbLink).toHaveAttribute('aria-label', 'Open Solves Problem PRB-000020');

    const rfcLink = page.locator('[data-testid="relation-link-rel-rfc"]');
    await expect(rfcLink).toBeVisible();
    await expect(rfcLink).toHaveAttribute('href', '/app/changes/RFC-000030');
    await expect(rfcLink).toHaveAttribute('aria-label', 'Open Precedes Change RFC-000030');

    // 5. Check unknown entity relation (ASSET) renders as non-interactive badge
    const unknownBadge = page.locator('[data-testid="relation-badge-rel-asset"]');
    await expect(unknownBadge).toBeVisible();
    await expect(unknownBadge).toHaveText(/Affected CI/);
    await expect(unknownBadge).toHaveText(/AST-000040/);
    // Ensure it is NOT a button or an anchor link and has no href
    await expect(unknownBadge).not.toHaveRole('button');
    await expect(unknownBadge).not.toHaveRole('link');
    await expect(unknownBadge).not.toHaveAttribute('href', /.*/);

    // Click on unknown badge and verify URL does NOT change or append '#'
    const currentUrl = page.url();
    await unknownBadge.click();
    expect(page.url()).toBe(currentUrl);
    expect(page.url()).not.toContain('#');

    // 6. No console errors
    expect(consoleErrors).toEqual([]);
  });
});
