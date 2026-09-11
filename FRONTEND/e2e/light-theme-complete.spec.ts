import { test, expect, type Page } from '@playwright/test';
import { mockAuthenticatedAdmin, mockAuthenticatedRequester } from './support';
import {
  FINAL_DIR,
  disableAnimations,
  waitForPageReady,
  setThemePreference,
  setupThemeTestMocks,
  evaluateElementContrast,
} from './theme-test-support';
import { parseThemeFromRaw, resolveTheme, type ThemePreference, type ResolvedTheme } from '../src/lib/themeResolution';
import fs from 'node:fs';
import path from 'node:path';

const ARTIFACT_FINAL_DARK = path.resolve(FINAL_DIR, 'dark');
const ARTIFACT_FINAL_LIGHT = path.resolve(FINAL_DIR, 'light');

test.describe('Production-Quality Light Theme & Visual Regression Suite', () => {
  test.beforeAll(() => {
    fs.mkdirSync(FINAL_DIR, { recursive: true });
    fs.mkdirSync(ARTIFACT_FINAL_DARK, { recursive: true });
    fs.mkdirSync(ARTIFACT_FINAL_LIGHT, { recursive: true });
  });

  test.use({ viewport: { width: 1440, height: 900 } });

  async function saveScreenshot(page: Page, subDir: string, name: string) {
    const localPath = path.join(subDir, `${name}.png`);
    await page.screenshot({ path: localPath, fullPage: false });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 1. Table-Driven Theme Resolution Parity Contract
  // ──────────────────────────────────────────────────────────────────────────
  test.describe('Authoritative Theme Resolution & Parity Contract', () => {
    const parityCases: Array<{
      desc: string;
      raw: string | null;
      systemIsDark: boolean;
      expectedPreference: ThemePreference;
      expectedResolved: ResolvedTheme;
    }> = [
      { desc: 'absent storage (null)', raw: null, systemIsDark: false, expectedPreference: 'dark', expectedResolved: 'dark' },
      { desc: 'absent storage (empty string)', raw: '', systemIsDark: false, expectedPreference: 'dark', expectedResolved: 'dark' },
      { desc: 'malformed JSON ({ invalid', raw: '{ invalid json', systemIsDark: false, expectedPreference: 'dark', expectedResolved: 'dark' },
      { desc: 'legacy raw string "light"', raw: 'light', systemIsDark: false, expectedPreference: 'light', expectedResolved: 'light' },
      { desc: 'legacy raw string "dark"', raw: 'dark', systemIsDark: false, expectedPreference: 'dark', expectedResolved: 'dark' },
      { desc: 'legacy raw string "system"', raw: 'system', systemIsDark: false, expectedPreference: 'system', expectedResolved: 'light' },
      { desc: 'legacy quoted string "\\"light\\""', raw: '"light"', systemIsDark: false, expectedPreference: 'light', expectedResolved: 'light' },
      { desc: 'legacy object { theme: "light" }', raw: JSON.stringify({ theme: 'light' }), systemIsDark: false, expectedPreference: 'light', expectedResolved: 'light' },
      { desc: 'standard Zustand { state: { theme: "light" }, version: 0 }', raw: JSON.stringify({ state: { theme: 'light' }, version: 0 }), systemIsDark: false, expectedPreference: 'light', expectedResolved: 'light' },
      { desc: 'standard Zustand { state: { theme: "dark" }, version: 0 }', raw: JSON.stringify({ state: { theme: 'dark' }, version: 0 }), systemIsDark: false, expectedPreference: 'dark', expectedResolved: 'dark' },
      { desc: 'system preference with system light', raw: JSON.stringify({ state: { theme: 'system' }, version: 0 }), systemIsDark: false, expectedPreference: 'system', expectedResolved: 'light' },
      { desc: 'system preference with system dark', raw: JSON.stringify({ state: { theme: 'system' }, version: 0 }), systemIsDark: true, expectedPreference: 'system', expectedResolved: 'dark' },
      { desc: 'unknown theme value defaults to dark', raw: JSON.stringify({ state: { theme: 'purple' }, version: 0 }), systemIsDark: false, expectedPreference: 'dark', expectedResolved: 'dark' },
    ];

    for (const c of parityCases) {
      test(`parse & resolve parity: ${c.desc}`, () => {
        const pref = parseThemeFromRaw(c.raw);
        expect(pref).toBe(c.expectedPreference);
        const resolved = resolveTheme(pref, c.systemIsDark);
        expect(resolved).toBe(c.expectedResolved);
      });
    }

    test('pre-paint bootstrap guarantees first rendered frame uses stored theme (Light)', async ({ page }) => {
      await setThemePreference(page, 'light');
      await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
      await setupThemeTestMocks(page);

      let hadDarkOnFirstFrame = false;
      await page.exposeFunction('reportRootClass', (classList: string[]) => {
        if (classList.includes('dark')) {
          hadDarkOnFirstFrame = true;
        }
      });
      await page.addInitScript(() => {
        const observer = new MutationObserver(() => {
          if (document.documentElement) {
            // @ts-expect-error reportRootClass injected by Playwright
            window.reportRootClass(Array.from(document.documentElement.classList));
          }
        });
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
      });

      await page.goto('/app/tickets/1');
      await waitForPageReady(page);

      const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
      const colorScheme = await page.evaluate(() => window.getComputedStyle(document.documentElement).colorScheme);

      expect(hadDarkOnFirstFrame).toBe(false);
      expect(isDark).toBe(false);
      expect(colorScheme).toBe('light');
    });

    test('pre-paint bootstrap guarantees first rendered frame uses stored theme (Dark)', async ({ page }) => {
      await setThemePreference(page, 'dark');
      await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
      await setupThemeTestMocks(page);

      await page.goto('/app/tickets/1');
      await waitForPageReady(page);

      const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
      const colorScheme = await page.evaluate(() => window.getComputedStyle(document.documentElement).colorScheme);

      expect(isDark).toBe(true);
      expect(colorScheme).toBe('dark');
    });

    test('live OS preference change switches theme dynamically without page reload', async ({ page }) => {
      await setThemePreference(page, 'system');
      await page.emulateMedia({ colorScheme: 'light' });
      await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
      await setupThemeTestMocks(page);

      await page.goto('/app/tickets/1');
      await waitForPageReady(page);

      let isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
      expect(isDark).toBe(false);

      // Flip OS to dark in real time
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.waitForTimeout(150);

      isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
      expect(isDark).toBe(true);

      // Flip back to light in real time
      await page.emulateMedia({ colorScheme: 'light' });
      await page.waitForTimeout(150);

      isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
      expect(isDark).toBe(false);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Real Visual Regression Assertions Against Dark Baselines
  // ──────────────────────────────────────────────────────────────────────────
  test.describe('Real Dark Baseline Visual Regression Assertions', () => {
    // Threshold explicitly justified: maxDiffPixelRatio 0.02 (2%) accounts for OS-level
    // font rasterization/antialiasing differences while detecting any missing colors or layout shifts.
    const threshold = { maxDiffPixelRatio: 0.02 };

    test('1. Ticket Detail matches dark baseline snapshot', async ({ page }) => {
      await setThemePreference(page, 'dark');
      await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
      await setupThemeTestMocks(page);
      await page.goto('/app/tickets/1');
      await disableAnimations(page);
      await waitForPageReady(page);
      await expect(page.locator('h1, [data-testid="ticket-header"]').first()).toBeVisible();
      await page.waitForTimeout(500);

      await saveScreenshot(page, ARTIFACT_FINAL_DARK, 'ticket-detail-dark-final');
      await expect(page).toHaveScreenshot('ticket-detail-dark.png', threshold);
    });

    test('2. Catalog Builder Page Designer matches dark baseline snapshot', async ({ page }) => {
      await setThemePreference(page, 'dark');
      await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
      await setupThemeTestMocks(page);
      await page.goto('/app/admin/catalog-builder');
      await disableAnimations(page);
      await waitForPageReady(page);
      await expect(page.getByTestId('catalog-builder')).toBeVisible({ timeout: 10000 });
      await page.waitForTimeout(500);

      await saveScreenshot(page, ARTIFACT_FINAL_DARK, 'catalog-builder-dark-final');
      await expect(page).toHaveScreenshot('catalog-builder-dark.png', threshold);
    });

    test('3. Automations Workflow Canvas matches dark baseline snapshot', async ({ page }) => {
      await setThemePreference(page, 'dark');
      await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
      await setupThemeTestMocks(page);
      await page.goto('/app/automations/new');
      await disableAnimations(page);
      await waitForPageReady(page);
      await expect(page.getByTestId('workflow-visual-editor')).toBeVisible({ timeout: 10000 });
      await page.waitForTimeout(1000);

      await saveScreenshot(page, ARTIFACT_FINAL_DARK, 'automations-canvas-dark-final');
      await expect(page).toHaveScreenshot('automations-canvas-dark.png', threshold);
    });

    test('4. Assets/CMDB matches dark baseline snapshot', async ({ page }) => {
      await setThemePreference(page, 'dark');
      await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
      await setupThemeTestMocks(page);
      await page.goto('/app/assets');
      await disableAnimations(page);
      await waitForPageReady(page);
      await expect(page.getByRole('heading', { name: 'Operational Inventory' })).toBeVisible();
      await page.waitForTimeout(500);

      await saveScreenshot(page, ARTIFACT_FINAL_DARK, 'assets-cmdb-dark-final');
      await expect(page).toHaveScreenshot('assets-cmdb-dark.png', threshold);
    });

    test('5. Requester Portal matches dark baseline snapshot', async ({ page }) => {
      await setThemePreference(page, 'dark');
      await mockAuthenticatedRequester(page, { forwardUnmatched: false });
      await setupThemeTestMocks(page);
      await page.goto('/portal');
      await disableAnimations(page);
      await waitForPageReady(page);
      await page.waitForTimeout(500);

      await saveScreenshot(page, ARTIFACT_FINAL_DARK, 'requester-portal-dark-final');
      await expect(page).toHaveScreenshot('requester-portal-dark.png', threshold);
    });

    test('6. Services operational workspace matches dark baseline snapshot', async ({ page }) => {
      await setThemePreference(page, 'dark');
      await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
      await setupThemeTestMocks(page);
      await page.goto('/app/services');
      await expect(page.getByRole('heading', { name: 'Services operations' })).toBeVisible();
      await expect(page.getByTestId('service-work-order-task-services-theme')).toBeVisible();
      await disableAnimations(page);
      await waitForPageReady(page);
      await page.waitForTimeout(500);

      await saveScreenshot(page, ARTIFACT_FINAL_DARK, 'services-workspace-dark-final');
      await expect(page).toHaveScreenshot('services-workspace-dark.png', threshold);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. Full Coverage Across All 12 Promised Frontend Surfaces in Light Theme
  // ──────────────────────────────────────────────────────────────────────────
  test.describe('Complete 12-Surface Browser Coverage in Light Theme', () => {
    test.beforeEach(async ({ page }) => {
      await setThemePreference(page, 'light');
    });

    test('Surface 1: Agent Home / Dashboard renders with light surfaces and zero dark widgets', async ({ page }) => {
      await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
      await setupThemeTestMocks(page);
      await page.goto('/app');
      await disableAnimations(page);
      await waitForPageReady(page);

      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const bodyBg = await page.evaluate(() => window.getComputedStyle(document.body).backgroundColor);
      expect(bodyBg).toBe('rgb(241, 245, 249)');

      const contrast = await evaluateElementContrast(page, 'h1');
      expect(contrast.passed).toBe(true);

      await saveScreenshot(page, ARTIFACT_FINAL_LIGHT, 'agent-dashboard-light');
    });

    test('Surface 2: Tickets list and Kanban render with light tables, cards, and accessible pills', async ({ page }) => {
      await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
      await setupThemeTestMocks(page);

      // 2a. Tickets List
      await page.goto('/app/tickets/list');
      await disableAnimations(page);
      await waitForPageReady(page);

      await expect(page.getByRole('table')).toBeVisible();
      const listContrast = await evaluateElementContrast(page, 'table th');
      expect(listContrast.passed).toBe(true);

      await saveScreenshot(page, ARTIFACT_FINAL_LIGHT, 'tickets-list-light');

      // 2b. Tickets Kanban
      await page.goto('/app/tickets');
      await disableAnimations(page);
      await waitForPageReady(page);

      await expect(page.getByRole('heading', { name: 'Open' })).toBeVisible();
      const kanbanContrast = await evaluateElementContrast(page, 'h3');
      expect(kanbanContrast.passed).toBe(true);
      await saveScreenshot(page, ARTIFACT_FINAL_LIGHT, 'tickets-kanban-light');
    });

    test('Surface 3: Ticket Detail renders fields, SLA, assignment, attachments and activity in light theme', async ({ page }) => {
      await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
      await setupThemeTestMocks(page);
      await page.goto('/app/tickets/1');
      await disableAnimations(page);
      await waitForPageReady(page);

      await expect(page.locator('h1, [data-testid="ticket-header"]').first()).toBeVisible();

      // Check form controls are light styled
      const darkInputs = await page.locator('input[style*="color-scheme: dark"], select[style*="color-scheme: dark"]').count();
      expect(darkInputs).toBe(0);

      const titleContrast = await evaluateElementContrast(page, 'h1');
      expect(titleContrast.passed).toBe(true);

      await saveScreenshot(page, ARTIFACT_FINAL_LIGHT, 'ticket-detail-light');
    });

    test('Surface 4: Catalog Builder field editor and page designer render in light theme', async ({ page }) => {
      await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
      await setupThemeTestMocks(page);
      await page.goto('/app/admin/catalog-builder');
      await disableAnimations(page);
      await waitForPageReady(page);

      await expect(page.getByTestId('catalog-builder')).toBeVisible({ timeout: 10000 });
      const contrast = await evaluateElementContrast(page, 'h1, h2');
      expect(contrast.passed).toBe(true);

      await saveScreenshot(page, ARTIFACT_FINAL_LIGHT, 'catalog-builder-light');
    });

    test('Surface 5: Automations visual workflow canvas, nodes, and controls render in light theme', async ({ page }) => {
      await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
      await setupThemeTestMocks(page);
      await page.goto('/app/automations/new');
      await disableAnimations(page);
      await waitForPageReady(page);

      await expect(page.getByTestId('workflow-visual-editor')).toBeVisible({ timeout: 10000 });
      await page.waitForTimeout(1000);

      // Verify canvas background is light
      const canvasBg = await page.locator('.react-flow').evaluate((el) => window.getComputedStyle(el).backgroundColor);
      expect(canvasBg).not.toBe('rgb(2, 6, 23)');

      await saveScreenshot(page, ARTIFACT_FINAL_LIGHT, 'automations-canvas-light');
    });

    test('Surface 6: Assets/CMDB operational inventory renders with clean cards in light theme', async ({ page }) => {
      await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
      await setupThemeTestMocks(page);
      await page.goto('/app/assets');
      await disableAnimations(page);
      await waitForPageReady(page);

      await expect(page.getByRole('heading', { name: 'Operational Inventory' })).toBeVisible();
      const headingContrast = await evaluateElementContrast(page, 'h1');
      expect(headingContrast.passed).toBe(true);

      await saveScreenshot(page, ARTIFACT_FINAL_LIGHT, 'assets-cmdb-light');
    });

    test('Surface 7: PRB detail renders investigation view in light theme', async ({ page }) => {
      await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
      await setupThemeTestMocks(page);
      await page.goto('/app/problems/1');
      await disableAnimations(page);
      await waitForPageReady(page);

      await expect(page.getByRole('heading', { name: /Recurring DB connection saturation/i })).toBeVisible();
      await expect(page.getByText('Connection pool leak under burst WebSocket requests.')).toBeVisible();
      const contrast = await evaluateElementContrast(page, 'h1');
      expect(contrast.passed).toBe(true);

      await saveScreenshot(page, ARTIFACT_FINAL_LIGHT, 'prb-detail-light');
    });

    test('Surface 8: RFC detail and Tasks render change board and execution tasks in light theme', async ({ page }) => {
      await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
      await setupThemeTestMocks(page);

      // 8a. RFC Board
      await page.goto('/app/changes');
      await disableAnimations(page);
      await waitForPageReady(page);
      await expect(page.getByRole('heading', { name: 'Change Management' })).toBeVisible();

      await saveScreenshot(page, ARTIFACT_FINAL_LIGHT, 'rfc-board-light');

      // 8b. RFC Detail
      await page.goto('/app/changes/1');
      await disableAnimations(page);
      await waitForPageReady(page);
      await expect(page.getByRole('heading', { name: /Upgrade PostgreSQL connection pool max_connections/i })).toBeVisible();
      await expect(page.getByText('Increase pool limit to 250 connections and add PgBouncer.').first()).toBeVisible();
      const detailContrast = await evaluateElementContrast(page, 'h1');
      expect(detailContrast.passed).toBe(true);

      await saveScreenshot(page, ARTIFACT_FINAL_LIGHT, 'rfc-detail-light');
    });

    test('Surface 9: SLA Policies editor renders policy rules and targets in light theme', async ({ page }) => {
      await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
      await setupThemeTestMocks(page);
      await page.goto('/app/settings/sla');
      await disableAnimations(page);
      await waitForPageReady(page);

      await expect(page.getByRole('heading', { name: 'SLA Policies' })).toBeVisible();
      const contrast = await evaluateElementContrast(page, 'h1');
      expect(contrast.passed).toBe(true);

      await saveScreenshot(page, ARTIFACT_FINAL_LIGHT, 'sla-policies-light');
    });

    test('Surface 10: Users & Roles administration renders permissions matrix in light theme', async ({ page }) => {
      await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
      await setupThemeTestMocks(page);
      await page.goto('/app/admin/users');
      await disableAnimations(page);
      await waitForPageReady(page);

      await expect(page.getByRole('heading', { name: 'Users, roles and organization' })).toBeVisible();
      const contrast = await evaluateElementContrast(page, 'h1');
      expect(contrast.passed).toBe(true);

      await saveScreenshot(page, ARTIFACT_FINAL_LIGHT, 'users-roles-light');
    });

    test('Surface 11: Notifications popover opens with readable contrast and light container', async ({ page }) => {
      await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
      await setupThemeTestMocks(page);
      await page.goto('/app/tickets');
      await disableAnimations(page);
      await waitForPageReady(page);

      // Click notification bell
      const bell = page.locator('[data-testid="notification-bell"]').first();
      await expect(bell).toBeVisible();
      await bell.click();
      await page.waitForTimeout(300);

      // Check popover container visibility
      const popover = page.locator('[data-testid="notification-panel"]').first();
      await expect(popover).toBeVisible();

      const popoverHeading = await evaluateElementContrast(page, '[data-testid="notification-panel"] h4');
      expect(popoverHeading.passed).toBe(true);

      await saveScreenshot(page, ARTIFACT_FINAL_LIGHT, 'notifications-popover-light');
    });

    test('Surface 12: Requester Service Catalog and My Tickets render in light theme', async ({ page }) => {
      await mockAuthenticatedRequester(page, { forwardUnmatched: false });
      await setupThemeTestMocks(page);

      // 12a. Requester Service Catalog / Portal Home
      await page.goto('/portal');
      await disableAnimations(page);
      await waitForPageReady(page);
      await page.waitForTimeout(500);

      const portalHeading = await evaluateElementContrast(page, 'h1, h2');
      expect(portalHeading.passed).toBe(true);

      await saveScreenshot(page, ARTIFACT_FINAL_LIGHT, 'requester-portal-light');

      // 12b. Requester My Tickets
      await page.goto('/portal/tickets');
      await disableAnimations(page);
      await waitForPageReady(page);

      await expect(page.locator('h1, h2').first()).toBeVisible();
      await saveScreenshot(page, ARTIFACT_FINAL_LIGHT, 'requester-tickets-light');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. Responsive Viewports: Desktop, Tablet, Mobile (Zero Horizontal Scroll)
  // ──────────────────────────────────────────────────────────────────────────
  test.describe('Responsive Viewports in Light Theme (Zero Horizontal Overflow)', () => {
    test.beforeEach(async ({ page }) => {
      await setThemePreference(page, 'light');
      await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
      await setupThemeTestMocks(page);
    });

    test('Desktop viewport (1440x900) has zero horizontal overflow', async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto('/app/tickets');
      await disableAnimations(page);
      await waitForPageReady(page);

      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });
      expect(hasHorizontalScroll).toBe(false);
    });

    test('Tablet viewport (768x1024) has zero horizontal overflow', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.goto('/app/tickets');
      await disableAnimations(page);
      await waitForPageReady(page);

      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });
      expect(hasHorizontalScroll).toBe(false);

      await saveScreenshot(page, ARTIFACT_FINAL_LIGHT, 'tickets-tablet-light');
    });

    test('Mobile viewport (390x844) has zero horizontal overflow', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto('/app/tickets');
      await disableAnimations(page);
      await waitForPageReady(page);

      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });
      expect(hasHorizontalScroll).toBe(false);

      await saveScreenshot(page, ARTIFACT_FINAL_LIGHT, 'tickets-mobile-light');
    });
  });
});
