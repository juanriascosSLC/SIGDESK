import { expect, test, type Page } from '@playwright/test';
import { mockAuthenticatedRequester } from './support';

/**
 * Verifies EndUserLayout's responsive navigation, now driven by the shared
 * PORTAL_NAV_ITEMS config (config/portalNavigation.ts) instead of labels
 * hardcoded three times over. Scope is the nav chrome itself — Service
 * Catalog/CatalogForm's and TicketDetail's own internal rendering are
 * covered elsewhere (beta-ux-honesty.spec.ts, my-tickets.spec.ts); this
 * file doesn't re-mock their full dependency graphs.
 */

const MOBILE_390 = { width: 390, height: 844 };
const TABLET_768 = { width: 768, height: 1024 };
const DESKTOP_1440 = { width: 1440, height: 900 };

/**
 * The switch from bottom nav to the full inline top nav (brand + 3 full
 * labels + profile, with their gaps/padding) waits for `md` (768px), not
 * `sm` (640px) — the row needs more room than 640-767px gives it. These
 * five viewports are exactly the ones the fix targets: four sit inside the
 * gap that used to be uncovered, the fifth (768x1024) is the first one
 * that should show the top nav instead.
 */
const BREAKPOINT_GAP_VIEWPORTS = [
  { width: 640, height: 800 },
  { width: 667, height: 800 },
  { width: 720, height: 900 },
  { width: 767, height: 900 },
  { width: 768, height: 1024 },
];

/**
 * Every test in this file that actually CLICKS through to Service Catalog
 * or My Tickets needs `forwardUnmatched: false` plus these two stubs.
 * Without them, `mockAuthenticatedRequester`'s default forwards
 * `GET /catalog/definitions` and `GET /entities/INC?createdBy=me` to the
 * live backend with this fixture's synthetic token — both 401, and
 * apiClient's global handler signs the session out mid-navigation. React
 * Router updates the URL synchronously on click, so a `toHaveURL`
 * assertion right after can still pass before that async sign-out lands;
 * the failure mode is a flaky, minutes-long timeout on whichever
 * *following* step happens to run after the redirect actually fires — the
 * exact bug this comment exists to stop someone from reintroducing.
 */
async function stubPortalDomainCalls(page: Page) {
  await page.route('**/catalog/definitions?*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) }),
  );
  await page.route('**/entities/INC?*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], hasMore: false }) }),
  );
}

test.describe('Mobile (390x844) — compact header + bottom nav', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedRequester(page, { forwardUnmatched: false });
    await stubPortalDomainCalls(page);
    await page.setViewportSize(MOBILE_390);
    await page.goto('/portal');
  });

  test('compact header (brand + profile only) and a bottom nav with all three destinations, no overflow', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'SIG-DESK Home' })).toBeVisible();
    // The inline top-nav (inside <header>) only renders at md and up — at
    // 390px it must be hidden, with the bottom bar taking over instead.
    const topNav = page.locator('header').getByRole('navigation', { name: 'Primary' });
    await expect(topNav).toBeHidden();

    const bottomNav = page.locator('nav[aria-label="Primary"]').last();
    await expect(bottomNav.getByRole('link', { name: 'Service Catalog' })).toBeVisible();
    await expect(bottomNav.getByRole('link', { name: 'Knowledge Base' })).toBeVisible();
    await expect(bottomNav.getByRole('link', { name: 'My Tickets' })).toBeVisible();

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(MOBILE_390.width + 1);
  });

  test('every bottom nav target meets the 44x44 touch minimum', async ({ page }) => {
    const bottomNav = page.locator('nav[aria-label="Primary"]').last();
    const targets = bottomNav.getByRole('link');
    await expect(targets).toHaveCount(3);
    const count = await targets.count();
    for (let i = 0; i < count; i++) {
      const box = await targets.nth(i).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
  });

  test('all three destinations are reachable from the bottom nav', async ({ page }) => {
    const bottomNav = page.locator('nav[aria-label="Primary"]').last();
    await bottomNav.getByRole('link', { name: 'Service Catalog' }).click();
    await expect(page).toHaveURL(/\/portal\/catalog$/);

    await bottomNav.getByRole('link', { name: 'Knowledge Base' }).click();
    await expect(page).toHaveURL(/\/portal\/knowledge$/);

    await bottomNav.getByRole('link', { name: 'My Tickets' }).click();
    await expect(page).toHaveURL(/\/portal\/tickets$/);
  });

  test('the floating RAG assistant never overlaps the bottom nav', async ({ page }) => {
    const bottomNav = page.locator('nav[aria-label="Primary"]').last();
    const ragTrigger = page.getByRole('button', { name: 'Open SIG Assistant' });
    await expect(bottomNav).toBeVisible();
    const navBox = await bottomNav.boundingBox();
    const ragBox = await ragTrigger.boundingBox().catch(() => null);
    if (navBox && ragBox) {
      expect(ragBox.y + ragBox.height).toBeLessThanOrEqual(navBox.y + 1);
    }
  });

  test('no console or page errors navigating the three destinations', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    const bottomNav = page.locator('nav[aria-label="Primary"]').last();
    await bottomNav.getByRole('link', { name: 'Knowledge Base' }).click();
    await expect(page).toHaveURL(/\/portal\/knowledge$/);
    await bottomNav.getByRole('link', { name: 'My Tickets' }).click();
    await expect(page).toHaveURL(/\/portal\/tickets$/);

    expect(errors, errors.join('\n')).toEqual([]);
  });
});

test.describe('The 640-767px breakpoint gap', () => {
  for (const viewport of BREAKPOINT_GAP_VIEWPORTS) {
    const isTopNavWidth = viewport.width >= 768;

    test(`exactly one usable nav surface, no overflow, all destinations reachable, profile visible at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await mockAuthenticatedRequester(page, { forwardUnmatched: false });
      await stubPortalDomainCalls(page);
      await page.setViewportSize(viewport);
      await page.goto('/portal');

      const topNav = page.locator('header').getByRole('navigation', { name: 'Primary' });
      const bottomNav = page.locator('nav[aria-label="Primary"]').last();

      // Exactly one usable navigation surface — never both, never neither.
      if (isTopNavWidth) {
        await expect(topNav).toBeVisible();
        await expect(bottomNav).toBeHidden();
      } else {
        await expect(topNav).toBeHidden();
        await expect(bottomNav).toBeVisible();
      }

      // All three destinations reachable through whichever surface is
      // active, exercising real navigation, not just visibility.
      const activeNav = isTopNavWidth ? topNav : bottomNav;
      await activeNav.getByRole('link', { name: 'Service Catalog' }).click();
      await expect(page).toHaveURL(/\/portal\/catalog$/);
      await activeNav.getByRole('link', { name: 'Knowledge Base' }).click();
      await expect(page).toHaveURL(/\/portal\/knowledge$/);
      await activeNav.getByRole('link', { name: 'My Tickets' }).click();
      await expect(page).toHaveURL(/\/portal\/tickets$/);

      // Profile control stays reachable regardless of which nav surface is
      // showing — it never competes with the nav switch for space.
      await expect(page.locator('header').getByRole('button', { name: 'PR' })).toBeVisible();

      // Zero horizontal overflow at every one of these widths — the exact
      // defect being fixed (the inline row needing ~688px+ that 640-767px
      // doesn't have).
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollWidth).toBeLessThanOrEqual(viewport.width + 1);

      // Content and the RAG assistant don't overlap the bottom nav (moot,
      // and skipped, once the top nav takes over and no bottom nav exists
      // to overlap).
      if (!isTopNavWidth) {
        const navBox = (await bottomNav.boundingBox())!;
        const ragTrigger = page.getByRole('button', { name: 'Open SIG Assistant' });
        const ragBox = await ragTrigger.boundingBox().catch(() => null);
        if (ragBox) {
          expect(ragBox.y + ragBox.height).toBeLessThanOrEqual(navBox.y + 1);
        }
        // Real bottom padding reserved for the fixed bar, not just a hope
        // that the page happens to be short enough not to need it.
        const paddingBottom = await page.locator('main').evaluate((el) => parseFloat(getComputedStyle(el).paddingBottom));
        expect(paddingBottom).toBeGreaterThanOrEqual(navBox.height - 1);
      }
    });
  }
});

test.describe('Desktop/tablet (1440x900 and 768x1024) — top nav preserved', () => {
  for (const viewport of [DESKTOP_1440, TABLET_768]) {
    test(`inline top nav is visible, no bottom nav, no overflow at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await mockAuthenticatedRequester(page);
      await page.setViewportSize(viewport);
      await page.goto('/portal');

      const topNav = page.locator('header').getByRole('navigation', { name: 'Primary' });
      await expect(topNav.getByRole('link', { name: 'Service Catalog' })).toBeVisible();
      await expect(topNav.getByRole('link', { name: 'Knowledge Base' })).toBeVisible();
      await expect(topNav.getByRole('link', { name: 'My Tickets' })).toBeVisible();
      await expect(page.locator('nav[aria-label="Primary"]').last()).toBeHidden();

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollWidth).toBeLessThanOrEqual(viewport.width + 1);
    });
  }
});

test.describe('Active-state correctness on child routes', () => {
  test('/portal/catalog/:id marks Service Catalog active', async ({ page }) => {
    await mockAuthenticatedRequester(page, { forwardUnmatched: false });
    await page.route('**/catalog/definitions/INC', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'def-inc-1',
          entityKey: 'INC',
          name: 'Incident',
          version: 1,
          status: 'published',
          specification: {
            description: 'Report an issue',
            identity: { prefix: 'INC' },
            fields: [],
            lifecycle: { states: ['Open'], transitions: [] },
            views: { create: [], summary: [] },
          },
        }),
      }),
    );
    await page.setViewportSize(DESKTOP_1440);
    await page.goto('/portal/catalog/INC');

    const topNav = page.locator('header').getByRole('navigation', { name: 'Primary' });
    await expect(topNav.getByRole('link', { name: 'Service Catalog' })).toHaveAttribute('aria-current', 'page');
    await expect(topNav.getByRole('link', { name: 'My Tickets' })).not.toHaveAttribute('aria-current', 'page');
  });

  test('/portal/tickets/:id marks My Tickets active', async ({ page }) => {
    await mockAuthenticatedRequester(page, { forwardUnmatched: false });
    // TicketDetail's own rendering isn't this file's concern (see the
    // header comment) — a 404 is enough to prove the nav still renders and
    // highlights correctly around whatever TicketDetail does with it.
    await page.route('**/entities/INC/*', (route) =>
      route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error_code: 'TICKET_NO_ENCONTRADO', message: 'not found' }) }),
    );
    await page.setViewportSize(DESKTOP_1440);
    await page.goto('/portal/tickets/555');

    const topNav = page.locator('header').getByRole('navigation', { name: 'Primary' });
    await expect(topNav.getByRole('link', { name: 'My Tickets' })).toHaveAttribute('aria-current', 'page');
    await expect(topNav.getByRole('link', { name: 'Service Catalog' })).not.toHaveAttribute('aria-current', 'page');
  });
});
