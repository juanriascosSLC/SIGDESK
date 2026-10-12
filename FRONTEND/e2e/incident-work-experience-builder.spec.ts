import { expect, test } from '@playwright/test';
import { mockAuthenticatedAdmin } from './support';
import { setupThemeTestMocks } from './theme-test-support';

test.beforeEach(async ({ page }) => {
  await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
  await setupThemeTestMocks(page);
  await page.goto('/app/admin/catalog-builder');
  await expect(page.getByTestId('catalog-builder')).toBeVisible();
  await page.getByTestId('builder-workspace-tasks').click();
});

test('troubleshooting builder keeps one task, stage, section and field in focus', async ({ page }) => {
  const it1 = page.getByTestId('incident-experience-it1_remote_troubleshooting');
  await expect(it1).toBeVisible();
  await expect(page.getByTestId('incident-experience-it2_troubleshooting')).toHaveCount(0);

  const taskSelector = page.getByRole('navigation', { name: 'Troubleshooting form selection' });
  await expect(taskSelector.getByRole('button', { name: /IT 1/i })).toHaveAttribute('aria-pressed', 'true');
  const basicsStage = page.getByRole('button', { name: /^1\. Basics Name and purpose$/ });
  const sectionsStage = page.getByRole('button', { name: /^2\. Form sections Fields and guidance$/ });
  const outcomesStage = page.getByRole('button', { name: /^3\. Outcomes Required information$/ });
  await expect(basicsStage).toBeVisible();
  await expect(sectionsStage).toHaveAttribute('aria-current', 'step');
  await expect(outcomesStage).toBeVisible();

  const symptomField = it1.locator('button[aria-expanded]').filter({ hasText: 'Symptom summary' });
  await expect(symptomField).toHaveAttribute('aria-expanded', 'false');
  await symptomField.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  await expect(symptomField).toBeVisible();
  await symptomField.click();
  await expect(symptomField).toHaveAttribute('aria-expanded', 'true');
  await expect(it1.getByLabel('Field label')).toHaveValue('Symptom summary');
  await expect(it1.getByText('Technical key:')).toBeVisible();

  await outcomesStage.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  await outcomesStage.click();
  await expect(it1.getByText('Outcome requirements')).toBeVisible();
  await expect(it1.getByText('Workflow code · read only')).toBeVisible();

  await taskSelector.getByRole('button', { name: /IT 2/i }).click();
  await expect(page.getByTestId('incident-experience-it2_troubleshooting')).toBeVisible();
  await expect(page.getByTestId('incident-experience-it1_remote_troubleshooting')).toHaveCount(0);
});

test('builder remains usable without horizontal overflow at a tablet viewport', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await expect(page.getByText('Build the troubleshooting experience')).toBeVisible();
  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(hasHorizontalOverflow).toBe(false);
});
