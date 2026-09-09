import { expect, test, type Page } from '@playwright/test';
import {
  mockAuthenticatedAdmin,
  mockAuthenticatedAgentWithoutAdminAccess,
  mockAuthenticatedRequester,
  mockAuthenticatedSupervisor,
  mockAuthenticatedTaskExecutor,
} from './support';

/**
 * Verifies the shared navigation config (config/navigation.ts) that now
 * drives all four agent-workspace nav surfaces — desktop sidebar, tablet
 * drawer, mobile bottom nav, and the mobile "More" sheet — from one item
 * list instead of three independently-drifting ones.
 *
 * Required viewports: 1440x900 / 1024x768 (desktop, persistent sidebar),
 * 768x1024 (tablet, drawer), 390x844 (mobile, bottom nav + More).
 */

async function stubNotifications(page: Page) {
  await page.route('**/notifications*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], unread: 0 }) }),
  );
}

const DESKTOP_1440 = { width: 1440, height: 900 };
const DESKTOP_1024 = { width: 1024, height: 768 };
const TABLET_768 = { width: 768, height: 1024 };
const MOBILE_390 = { width: 390, height: 844 };

test.describe('Permission matrix — same shared config, different visible items', () => {
  test('IT agent (tickets:read:global) sees Dashboard + Tickets only, no Administration', async ({ page }) => {
    await mockAuthenticatedAgentWithoutAdminAccess(page);
    await stubNotifications(page);
    await page.setViewportSize(DESKTOP_1440);
    await page.goto('/app');

    const nav = page.locator('#app-nav');
    await expect(nav.getByRole('link', { name: 'Dashboard' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Tickets & Issues' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'My Tasks' })).toHaveCount(0);
    await expect(nav.getByText('Administration')).toHaveCount(0);
    await expect(nav.getByText('Tipos de Caso')).toHaveCount(0);
  });

  test('Task-only operator sees Dashboard + My Tasks only, reaches the real inbox', async ({ page }) => {
    await mockAuthenticatedTaskExecutor(page);
    await page.setViewportSize(DESKTOP_1440);
    await page.goto('/app');

    const nav = page.locator('#app-nav');
    await expect(nav.getByRole('link', { name: 'Dashboard' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'My Tasks' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Tickets & Issues' })).toHaveCount(0);
    await expect(nav.getByText('Administration')).toHaveCount(0);

    await nav.getByRole('link', { name: 'My Tasks' }).click();
    await expect(page).toHaveURL(/\/app\/changes\/my-tasks$/);
  });

  test('Supervisor sees Workspace + ITSM sections but no Users & Roles', async ({ page }) => {
    await mockAuthenticatedSupervisor(page);
    await stubNotifications(page);
    await page.setViewportSize(DESKTOP_1440);
    await page.goto('/app');

    const nav = page.locator('#app-nav');
    await expect(nav.getByText('Workspace', { exact: true })).toBeVisible();
    await expect(nav.getByText('Tipos de Caso')).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Change Mgmt' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Problem Mgmt' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Assets / CMDB' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Users & Roles' })).toHaveCount(0);
  });

  test('Administrator sees every section, including Administration', async ({ page }) => {
    await mockAuthenticatedAdmin(page);
    await stubNotifications(page);
    await page.setViewportSize(DESKTOP_1440);
    await page.goto('/app');

    const nav = page.locator('#app-nav');
    await expect(nav.getByText('Administration')).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Users & Roles' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Entity Builder' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Automations' })).toBeVisible();
  });

  test('Requester cannot reach /app by direct URL — hiding the link is not the guard', async ({ page }) => {
    await mockAuthenticatedRequester(page);
    await page.goto('/app');
    await expect(page).toHaveURL(/\/portal/);
    await page.goto('/app/admin/users');
    await expect(page).toHaveURL(/\/portal|\/app$/);
    await expect(page.locator('#app-nav')).toHaveCount(0);
  });
});

test.describe('Desktop (1440x900 and 1024x768) — persistent sidebar', () => {
  for (const viewport of [DESKTOP_1440, DESKTOP_1024]) {
    test(`sidebar is visible and no bottom nav/drawer trigger at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await mockAuthenticatedAdmin(page);
      await stubNotifications(page);
      await page.setViewportSize(viewport);
      await page.goto('/app');

      await expect(page.locator('#app-nav')).toBeVisible();
      await expect(page.getByTestId('app-nav-toggle')).toBeVisible();
      await expect(page.getByTestId('app-nav-drawer-toggle')).toBeHidden();
      await expect(page.locator('nav[aria-label="Primary"]')).toBeHidden();

      // No horizontal overflow.
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollWidth).toBeLessThanOrEqual(viewport.width + 1);
    });
  }

  test('the SIG-DESK brand is a real link, reachable and activatable by keyboard', async ({ page }) => {
    await mockAuthenticatedAdmin(page);
    await stubNotifications(page);
    await page.setViewportSize(DESKTOP_1440);
    await page.goto('/app/knowledge');

    const brand = page.locator('#app-nav').getByRole('link', { name: 'SIG-DESK Home' });
    await expect(brand).toBeVisible();
    await brand.focus();
    await expect(brand).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/app$/);
  });

  test('collapsed sidebar shows the shared Tooltip on keyboard focus, not just hover', async ({ page }) => {
    await mockAuthenticatedAdmin(page);
    await stubNotifications(page);
    await page.setViewportSize(DESKTOP_1440);
    await page.goto('/app');

    await page.getByTestId('app-nav-toggle').click(); // collapse the rail
    const ticketsLink = page.locator('#app-nav').getByRole('link', { name: 'Tickets & Issues' });
    await expect(page.getByRole('tooltip')).toHaveCount(0);

    await ticketsLink.focus();
    const tooltip = page.getByRole('tooltip', { name: 'Tickets & Issues' });
    await expect(tooltip).toBeVisible();

    await ticketsLink.blur();
    await expect(tooltip).toBeHidden();
  });

  // Real visual-position assertions, not just "the DOM node exists": the
  // bug this replaced (Tooltip.tsx rendering in-flow inside the sidebar's
  // `overflow-x-hidden` scroll container) produced a tooltip that passed a
  // plain `toBeVisible()` check while being invisibly clipped by an
  // ancestor. `elementFromPoint` at the tooltip's own center is what
  // actually proves a pixel of it is painted and hit-testable, the way a
  // real user's eye (or a screen magnifier) would see it.
  test('collapsed sidebar tooltip renders to the right of the sidebar, fully on-screen, and is actually painted (not clipped by an ancestor)', async ({ page }) => {
    await mockAuthenticatedAdmin(page);
    await stubNotifications(page);
    await page.setViewportSize(DESKTOP_1440);
    await page.goto('/app');
    await page.getByTestId('app-nav-toggle').click(); // collapse the rail

    const sidebar = page.locator('#app-nav');
    // The rail animates its width over 300ms (transition-[width], eased).
    // A fixed wait here is exactly the kind of thing that's "usually long
    // enough" and then isn't under load — poll for the actual target width
    // (w-20 = 80px) instead of a loose upper bound, so this can't resolve
    // on an in-between value from mid-transition.
    await expect
      .poll(async () => Math.round((await sidebar.boundingBox())!.width))
      .toBe(80);
    const sidebarBox = (await sidebar.boundingBox())!;

    async function assertTooltipClearsClipping(linkName: string) {
      const link = sidebar.getByRole('link', { name: linkName });
      await link.focus();
      const tooltip = page.getByRole('tooltip', { name: linkName });
      await expect(tooltip).toBeVisible();
      const box = (await tooltip.boundingBox())!;

      // Entirely to the right of the (80px-wide, collapsed) sidebar rail —
      // a clipped tooltip would report a box that's still nominally
      // positioned there but rendered with zero effective width/behind the
      // rail's own background.
      expect(box.x).toBeGreaterThanOrEqual(sidebarBox.x + sidebarBox.width - 1);
      // Fully inside the viewport on every edge.
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(DESKTOP_1440.width);
      expect(box.y + box.height).toBeLessThanOrEqual(DESKTOP_1440.height);

      // The tooltip is deliberately `pointer-events-none` (so it can never
      // steal a click, or flicker by becoming its own mouseleave target) —
      // that also makes it invisible to `elementFromPoint`, regardless of
      // clipping, so a naive hit-test can't distinguish "correctly
      // non-interactive" from "actually clipped". What directly proves the
      // fix instead: walking the tooltip's real DOM ancestor chain and
      // confirming it reaches `document.body` WITHOUT passing through the
      // sidebar's own scroll container — i.e. it is genuinely portaled out
      // from under `overflow-x-hidden`, not just visually positioned as if
      // it were.
      const escapedClippingAncestor = await page.evaluate((tooltipId) => {
        const tooltipEl = document.getElementById(tooltipId);
        const sidebarEl = document.getElementById('app-nav');
        if (!tooltipEl || !sidebarEl) return false;
        if (sidebarEl.contains(tooltipEl)) return false;
        // Confirm it's real content, not a zero-sized/hidden node — the
        // geometry assertions above already prove non-zero width/height,
        // this adds that it isn't `visibility:hidden`/`display:none`.
        const style = window.getComputedStyle(tooltipEl);
        return style.visibility !== 'hidden' && style.display !== 'none';
      }, (await tooltip.getAttribute('id'))!);
      expect(escapedClippingAncestor).toBe(true);

      await link.blur();
      await expect(tooltip).toBeHidden();
    }

    // First item (top edge) and last item (bottom edge / vertical-scroll
    // edge) — clipping bugs often only show up at one edge of a scroll
    // container, so checking only the first item would have missed it.
    await assertTooltipClearsClipping('Tickets & Issues');
    await assertTooltipClearsClipping('API Keys');
  });

  test('Escape dismisses the tooltip without moving focus; Enter still activates the link', async ({ page }) => {
    await mockAuthenticatedAdmin(page);
    await stubNotifications(page);
    await page.setViewportSize(DESKTOP_1440);
    await page.goto('/app/knowledge'); // start off Tickets, so Enter below is a real navigation
    await page.getByTestId('app-nav-toggle').click();

    const link = page.locator('#app-nav').getByRole('link', { name: 'Tickets & Issues' });
    await link.focus();
    const tooltip = page.getByRole('tooltip', { name: 'Tickets & Issues' });
    await expect(tooltip).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(tooltip).toBeHidden();
    // Escape hid the tooltip, not the trigger's focus — the link is still
    // the active element, so keyboard navigation isn't disrupted.
    await expect(link).toBeFocused();

    // Enter is untouched by the Escape handler: it still does exactly what
    // a link does.
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/app\/tickets$/);
  });

  test('the tooltip follows its trigger when the sidebar scrolls, and re-clamps inside the viewport on resize', async ({ page }) => {
    await mockAuthenticatedAdmin(page);
    await stubNotifications(page);
    // Short enough that the collapsed rail's item list genuinely overflows
    // (verified: ~550px of scrollable content at this height), so scrolling
    // it actually moves a trigger already on screen — Playwright's
    // `.focus()` auto-scrolls an off-screen element into view first, which
    // would defeat a setup that relied on focusing something below the
    // fold.
    await page.setViewportSize({ width: 1440, height: 500 });
    await page.goto('/app');
    await page.getByTestId('app-nav-toggle').click();

    const sidebar = page.locator('#app-nav');
    await expect.poll(async () => Math.round((await sidebar.boundingBox())!.width)).toBe(80);
    const scrollContainer = sidebar.locator('.overflow-y-auto').first();

    const link = sidebar.getByRole('link', { name: 'Dashboard' }); // first item, visible at scrollTop 0
    await link.focus();
    const tooltip = page.getByRole('tooltip', { name: 'Dashboard' });
    await expect(tooltip).toBeVisible();
    await expect(link).toHaveAttribute('aria-describedby', /.+/); // untouched by the reposition fix

    const initialBox = (await tooltip.boundingBox())!;

    // Scroll the sidebar's own container, not the window — the sidebar is
    // the thing with overflow, the window never moves under this layout.
    await scrollContainer.evaluate((el) => {
      el.scrollTop = 120;
    });

    // The trigger moves up by ~120px as its container scrolls under it;
    // the tooltip must follow, not stay pinned to where it first appeared.
    await expect
      .poll(async () => (await tooltip.boundingBox())?.y)
      .toBeLessThan(initialBox.y - 60);
    const scrolledBox = (await tooltip.boundingBox())!;
    expect(initialBox.y - scrolledBox.y).toBeGreaterThan(60);
    expect(initialBox.y - scrolledBox.y).toBeLessThan(180);

    // Still portaled outside #app-nav after the scroll-driven reposition,
    // not just on the very first render.
    const stillEscaped = await page.evaluate((tooltipId) => {
      const tooltipEl = document.getElementById(tooltipId);
      const sidebarEl = document.getElementById('app-nav');
      return !!tooltipEl && !!sidebarEl && !sidebarEl.contains(tooltipEl);
    }, (await tooltip.getAttribute('id'))!);
    expect(stillEscaped).toBe(true);

    // Now shrink the viewport further while the tooltip is still visible —
    // the resize listener must recompute the anchor AND the clamp pass
    // must keep the result fully on-screen at the new, smaller size.
    await page.setViewportSize({ width: 1440, height: 220 });
    await expect
      .poll(async () => {
        const box = await tooltip.boundingBox();
        return box ? box.y + box.height <= 220 - 1 && box.y >= 0 : false;
      })
      .toBe(true);
  });
});

test.describe('Tablet (768x1024) — drawer', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedAdmin(page);
    await stubNotifications(page);
    await page.setViewportSize(TABLET_768);
    await page.goto('/app');
  });

  test('no persistent sidebar; drawer trigger opens the same permitted list', async ({ page }) => {
    await expect(page.locator('#app-nav')).toBeHidden();
    await expect(page.locator('nav[aria-label="Primary"]')).toBeHidden();
    const trigger = page.getByTestId('app-nav-drawer-toggle');
    await expect(trigger).toBeVisible();

    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Navigation' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('link', { name: 'Users & Roles' })).toBeVisible();

    // No horizontal overflow at the tablet viewport either, with the
    // drawer open (its own panel is bounded by widthClassName/max-w-[85vw]).
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(TABLET_768.width + 1);
  });

  test('closes after navigating, and focus returns to the trigger on Escape', async ({ page }) => {
    const trigger = page.getByTestId('app-nav-drawer-toggle');
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Navigation' });
    // Knowledge Base fetches nothing (it's the honest "not available yet"
    // screen) — a safe navigation target that can't 401 against the live
    // backend under this fixture's synthetic token.
    await dialog.getByRole('link', { name: 'Knowledge Base' }).click();

    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/app\/knowledge$/);

    // Re-open and close via Escape this time — focus must return to the
    // exact button that opened it (useFocusTrap's restoration).
    await trigger.click();
    await expect(page.getByRole('dialog', { name: 'Navigation' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Navigation' })).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('background scroll is locked while the drawer is open', async ({ page }) => {
    await page.getByTestId('app-nav-drawer-toggle').click();
    await expect(page.getByRole('dialog', { name: 'Navigation' })).toBeVisible();
    const overflow = await page.evaluate(() => document.body.style.overflow);
    expect(overflow).toBe('hidden');
  });

  test('focus is trapped inside the drawer (Tab wraps, does not escape to the page)', async ({ page }) => {
    await page.getByTestId('app-nav-drawer-toggle').click();
    const dialog = page.getByRole('dialog', { name: 'Navigation' });
    await expect(dialog).toBeVisible();

    // Shift+Tab from the first focusable element must wrap to the last one
    // inside the panel, never escape to something behind the overlay.
    await page.keyboard.press('Shift+Tab');
    const activeInsideDialog = await page.evaluate((dialogSelector) => {
      const dialog = document.querySelector(dialogSelector);
      return Boolean(dialog && dialog.contains(document.activeElement));
    }, '[role="dialog"]');
    expect(activeInsideDialog).toBe(true);
  });
});

test.describe('Mobile (390x844) — bottom nav + More', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedAdmin(page);
    await stubNotifications(page);
    await page.setViewportSize(MOBILE_390);
    await page.goto('/app');
  });

  test('no sidebar or drawer trigger; bottom nav shows at most 4 primary items plus More', async ({ page }) => {
    await expect(page.locator('#app-nav')).toBeHidden();
    await expect(page.getByTestId('app-nav-drawer-toggle')).toBeHidden();
    const bottomNav = page.locator('nav[aria-label="Primary"]');
    await expect(bottomNav).toBeVisible();

    const links = bottomNav.getByRole('link');
    const linkCount = await links.count();
    expect(linkCount).toBeLessThanOrEqual(4);
    await expect(bottomNav.getByRole('button', { name: 'More' })).toBeVisible();

    // No horizontal overflow at the narrowest required viewport.
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(390 + 1);
  });

  test('every bottom nav target and the More button meet the 44x44 touch minimum', async ({ page }) => {
    const bottomNav = page.locator('nav[aria-label="Primary"]');
    const targets = bottomNav.locator('a, button');
    const count = await targets.count();
    for (let i = 0; i < count; i++) {
      const box = await targets.nth(i).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
  });

  test('More opens the rest of the permitted list, closes after navigating, restores focus, locks scroll', async ({ page }) => {
    const moreButton = page.getByRole('button', { name: 'More' });
    await moreButton.click();
    const dialog = page.getByRole('dialog', { name: 'More' });
    await expect(dialog).toBeVisible();
    await expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');

    // Administration items that never compete for a bottom-nav slot still
    // have to be reachable somewhere on mobile.
    await expect(dialog.getByRole('link', { name: 'Users & Roles' })).toBeVisible();
    // Knowledge Base fetches nothing (it's the honest "not available yet"
    // screen) — a safe navigation target that can't 401 against the live
    // backend under this fixture's synthetic token.
    await dialog.getByRole('link', { name: 'Knowledge Base' }).click();

    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/app\/knowledge$/);
  });

  test('Escape closes More and returns focus to the More button', async ({ page }) => {
    const moreButton = page.getByRole('button', { name: 'More' });
    await moreButton.click();
    await expect(page.getByRole('dialog', { name: 'More' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'More' })).toBeHidden();
    await expect(moreButton).toBeFocused();
  });

  test('the floating RAG assistant button never overlaps the bottom nav', async ({ page }) => {
    const bottomNav = page.locator('nav[aria-label="Primary"]');
    const ragTrigger = page.getByRole('button', { name: 'Open SIG Assistant' });
    await expect(bottomNav).toBeVisible();
    const navBox = await bottomNav.boundingBox();
    const ragBox = await ragTrigger.boundingBox().catch(() => null);
    if (navBox && ragBox) {
      // The assistant button's bottom edge must sit at or above the top
      // edge of the bottom nav bar — no vertical overlap.
      expect(ragBox.y + ragBox.height).toBeLessThanOrEqual(navBox.y + 1);
    }
  });

  test('More exposes aria-expanded/aria-controls, and Administrator can reach Administration through it', async ({ page }) => {
    const moreButton = page.getByRole('button', { name: 'More' });
    await expect(moreButton).toHaveAttribute('aria-expanded', 'false');
    const controlsId = await moreButton.getAttribute('aria-controls');
    expect(controlsId).toBeTruthy();

    await moreButton.click();
    await expect(moreButton).toHaveAttribute('aria-expanded', 'true');
    const dialog = page.locator(`#${controlsId}`);
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('role', 'dialog');

    await expect(dialog.getByRole('link', { name: 'Users & Roles' })).toBeVisible();
    await dialog.getByRole('link', { name: 'Users & Roles' }).click();
    await expect(page).toHaveURL(/\/app\/admin\/users$/);
    await expect(moreButton).toHaveAttribute('aria-expanded', 'false');
  });
});

test.describe('Mobile (390x844) — no empty More for a limited persona', () => {
  test('IT agent (Dashboard + Tickets only) sees no More button at all', async ({ page }) => {
    await mockAuthenticatedAgentWithoutAdminAccess(page);
    await stubNotifications(page);
    await page.setViewportSize(MOBILE_390);
    await page.goto('/app');

    const bottomNav = page.locator('nav[aria-label="Primary"]');
    await expect(bottomNav).toBeVisible();
    await expect(bottomNav.getByRole('link', { name: 'Dashboard' })).toBeVisible();
    await expect(bottomNav.getByRole('link', { name: 'Tickets & Issues' })).toBeVisible();

    // Every permitted item (Dashboard, Tickets) fits in the primary slots —
    // there is nothing left for "More" to hold, so it must not render at
    // all, not render as an empty drawer.
    await expect(bottomNav.getByRole('button', { name: 'More' })).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: 'More' })).toHaveCount(0);
  });
});

test.describe('Deep links and active-state correctness', () => {
  test('a deep link into a ticket detail marks Tickets & Issues active, not Dashboard', async ({ page }) => {
    await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
    await stubNotifications(page);
    await page.route('**/entities/INC/*', (route) =>
      route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error_code: 'TICKET_NO_ENCONTRADO', message: 'not found' }) }),
    );
    await page.setViewportSize(DESKTOP_1440);
    await page.goto('/app/tickets/999999');

    const ticketsLink = page.locator('#app-nav').getByRole('link', { name: 'Tickets & Issues' });
    await expect(ticketsLink).toHaveAttribute('aria-current', 'page');
    const dashboardLink = page.locator('#app-nav').getByRole('link', { name: 'Dashboard' });
    await expect(dashboardLink).not.toHaveAttribute('aria-current', 'page');
  });

  test('/app/changes/my-tasks marks My Tasks active, not Change Mgmt (longest-match tie-break)', async ({ page }) => {
    await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
    await stubNotifications(page);
    await page.route('**/change-tasks*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) }),
    );
    await page.setViewportSize(DESKTOP_1440);
    await page.goto('/app/changes/my-tasks');

    const nav = page.locator('#app-nav');
    await expect(nav.getByRole('link', { name: 'My Tasks' })).toHaveAttribute('aria-current', 'page');
    await expect(nav.getByRole('link', { name: 'Change Mgmt' })).not.toHaveAttribute('aria-current', 'page');
  });
});

test('no console errors while opening/closing drawer and More across viewports', async ({ page }) => {
  await mockAuthenticatedAdmin(page);
  await stubNotifications(page);
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.setViewportSize(TABLET_768);
  await page.goto('/app');
  await page.getByTestId('app-nav-drawer-toggle').click();
  await page.keyboard.press('Escape');

  await page.setViewportSize(MOBILE_390);
  await page.getByRole('button', { name: 'More' }).click();
  await page.keyboard.press('Escape');

  expect(errors, errors.join('\n')).toEqual([]);
});
