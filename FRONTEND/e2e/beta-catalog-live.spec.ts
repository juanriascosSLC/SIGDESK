import { expect, test } from '@playwright/test';
import { mockAuthenticatedAdmin, SIG_DESK_API_BASE } from './support';

/**
 * Beta: the active catalog, the real INC form and paginated sites all work
 * together — against the deterministic E2E Inventory fixture, not the shared
 * local CMDB's real (and unstably-sized) inventory.
 *
 * Correction "REPAIR beta-catalog-live WITHOUT LOSING PAGINATION COVERAGE"
 * (2026-09-07): the previous version of this test hardcoded `248` — the real
 * production site count at the time it was written. That is exactly the
 * shared-state dependency this whole workstream exists to remove, and simply
 * replacing `248` with a small number (say `2`) would make the test pass
 * while deleting the one thing it actually verifies: that a page far beyond
 * the first is reachable and nothing gets silently truncated.
 *
 * The fix is a bigger, still fully deterministic fixture: the beta gate's own
 * `E2E_INVENTORY_SITE_COUNT=205` config (run-beta-release-gate.ps1) makes the
 * gate's E2E Inventory double (resource_service/cmd/e2e_inventory_server)
 * serve 207 sites (2 canonical + 205 generated, stable ids/names) — real
 * `resource_service` synchronizes them through its real Inventory adapter
 * (AssetProjectionReconciler), same as any real installation; nothing here
 * inserts into `asset_identities` directly. 207 clears the real requirement
 * (>= 201, so `cursor=200` truly lands on a real third page) with room to
 * spare, without approaching BindingPicker.tsx's own unrelated
 * `DEFAULT_SEARCH_THRESHOLD` (500) — tried live at 520 sites first: it also
 * cleared both, but syncing/paginating that many slowed down every OTHER
 * spec sharing this same CMDB carve-out (catalog-builder-runtime.spec.ts
 * started timing out waiting for its own, unrelated site option). 207 is the
 * minimum that satisfies the actual pagination requirement without that
 * side effect on the rest of the gate.
 */
test('beta: active catalog, INC form and paginated sites work together', async ({ page, request }) => {
  test.skip(!process.env.PLAYWRIGHT_SIGDESK_TOKEN, 'requires local backend and PLAYWRIGHT_SIGDESK_TOKEN');
  await mockAuthenticatedAdmin(page);

  // The expected total is DERIVED from the API, never hardcoded — paginate
  // exactly like the frontend's own collectAssetPages (src/features/assets/api.ts)
  // does, so this number is whatever the deterministic fixture actually
  // produced this run, not a number this test invents.
  type SitesPage = { items: Array<{ id: string; displayName: string }>; hasMore: boolean; nextCursor?: string };
  let total = 0;
  let cursor = '';
  let thirdPage: SitesPage | undefined;
  for (let guard = 0; guard < 100; guard += 1) {
    const url = cursor
      ? `${SIG_DESK_API_BASE}/assets/sites?limit=100&cursor=${cursor}`
      : `${SIG_DESK_API_BASE}/assets/sites?limit=100`;
    const response = await request.get(url);
    expect(response.ok(), `paginating /assets/sites failed at cursor=${cursor || '(start)'}: ${await response.text()}`).toBe(true);
    const onePage = (await response.json()) as SitesPage;
    if (cursor === '200') thirdPage = onePage;
    total += onePage.items.length;
    if (!onePage.hasMore || !onePage.nextCursor) break;
    cursor = onePage.nextCursor;
  }
  // The pagination-boundary guarantee this test exists to prove: the
  // deterministic fixture is sized to cross cursor=200 with real content on
  // the far side of it — not just to have "some" sites.
  expect(total).toBeGreaterThan(200);
  expect(thirdPage, 'the page after cursor=200 was never reached while paginating').toBeTruthy();
  expect(thirdPage!.items.length).toBeGreaterThan(0);
  const siteFromThirdPage = thirdPage!.items[0];

  await page.goto('/app/catalog');
  await expect(page.getByTestId('catalog-option-INC')).toHaveCount(1);
  await expect(page.getByTestId('catalog-option-PRB')).toHaveCount(1);
  await expect(page.getByTestId('catalog-option-RFC')).toHaveCount(1);

  await page.getByTestId('catalog-option-INC').click();
  await expect(page.getByTestId('catalog-input-titulo')).toBeVisible();
  await expect(page.getByTestId('catalog-input-descripcion')).toBeVisible();

  const siteSearch = page.getByPlaceholder(/Search site by name or code/i);
  await expect(siteSearch).toBeVisible();

  // Before searching, BindingPicker only ever renders its first page of
  // results (RESULT_PAGE_SIZE = 25 in BindingPicker.tsx) — a site from deep
  // in a 207-site list is not among them yet.
  await expect(page.getByText(siteFromThirdPage.displayName, { exact: true })).toHaveCount(0);

  // Search for and select a site that exists ONLY on the far page — proving
  // the search reaches into the FULL loaded set (all `total` sites, paginated
  // in from the API), not just whatever page BindingPicker renders by
  // default. If any API page were silently dropped, this option would never
  // appear at all.
  await siteSearch.fill(siteFromThirdPage.displayName);
  const farPageOption = page.getByText(siteFromThirdPage.displayName, { exact: true }).first();
  await expect(farPageOption).toBeVisible();
  await farPageOption.click();
  // Single-selection mode collapses to the chosen chip — proving the click
  // actually bound the value, not just rendered a matching label somewhere.
  await expect(page.getByText(siteFromThirdPage.displayName, { exact: true }).first()).toBeVisible();

  const runID = `beta-catalog-live-${Date.now()}`;
  await page.getByTestId('catalog-input-titulo').fill(`Beta pagination check ${runID}`);
  await page.getByTestId('catalog-input-descripcion').fill(`Created by beta-catalog-live.spec.ts (${runID})`);

  const [createResponse] = await Promise.all([
    page.waitForResponse((response) => response.url().includes('/entities/INC') && response.request().method() === 'POST'),
    page.getByTestId('catalog-form-submit').click(),
  ]);
  expect(createResponse.ok(), `POST /entities/INC failed: ${await createResponse.text()}`).toBe(true);
  const created = (await createResponse.json()) as { id: string; humanId: string };
  expect(created.id).toBeTruthy();
  expect(created.humanId).toBeTruthy();

  // The site actually submitted with the ticket must be the far-page one —
  // not silently dropped, not silently swapped for whatever was selected
  // first. `assetContext` lives on the plain entity record
  // (entityRecordDTO in entidades_controller.go), not on `/manifest` (which
  // only ever describes the DEFINITION, never a specific record's data).
  const recordResponse = await request.get(`${SIG_DESK_API_BASE}/entities/INC/${created.id}`);
  expect(recordResponse.ok(), `GET /entities/INC/${created.id} failed: ${await recordResponse.text()}`).toBe(true);
  const record = (await recordResponse.json()) as { assetContext?: { siteAssetId?: string } };
  expect(record.assetContext?.siteAssetId).toBe(siteFromThirdPage.id);
});
