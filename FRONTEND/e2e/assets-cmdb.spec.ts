import { expect, test, type Page } from '@playwright/test';
import { mockAuthenticatedAdmin } from './support';

const siteId = '11111111-1111-1111-1111-111111111111';
const cameraId = '22222222-2222-2222-2222-222222222222';

async function mockSiteAndCamera(page: Page, extraDevices: Record<string, unknown>[] = []) {
  // The signed-in agent layout polls the notification bell on every route
  // regardless of what page is under test — unrelated to Assets/CMDB, but
  // left unstubbed it 404s (forwardUnmatched: false) and pollutes the
  // console-error assertion below.
  await page.route('**/notifications?*', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], noLeidas: 0 }),
  }));
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
    }, ...extraDevices], hasMore: false, stale: false }),
  }));
}

// This replaces the old all-mocked happy path, which fabricated non-empty
// PRB/RFC responses directly at the read endpoints and so could never catch
// the real defect: PRB/RFC created through the normal INC/PRB workflows
// never populate problem_asset_links/rfc_asset_links (no assetContext was
// forwarded), so a real PRB/RFC only reachable through problem_relations/
// rfc_relations used to render as zero. This test proves the opposite: a
// PRB with NO asset snapshot of its own (found only via_incident) and an
// RFC with NO asset snapshot of its own (found only via_problem, through
// that PRB's resolvedBy relation) both still show up, correctly linked and
// correctly labeled — the actual indirect-traversal path, not a canned
// direct-query response.
test('el historial operativo muestra PRB y RFC alcanzables solo por relación indirecta, con enlaces y procedencia correctos', async ({ page }) => {
  await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  // Firma canario: si el frontend todavía llamara a los endpoints VIEJOS
  // (no acotados) en vez de los nuevos batch/context, esta ruta responde
  // con un error explícito e inconfundible en vez de fallar en silencio.
  await page.route('**/problems/by-asset/*', (route) => route.fulfill({
    status: 500, contentType: 'application/json',
    body: JSON.stringify({ error_code: 'RUTA_VIEJA_NO_DEBE_LLAMARSE', message: 'usa /problems/by-asset-context' }),
  }));
  await page.route((url) => url.pathname === '/changes' && url.searchParams.has('assetId'), (route) => route.fulfill({
    status: 500, contentType: 'application/json',
    body: JSON.stringify({ error_code: 'RUTA_VIEJA_NO_DEBE_LLAMARSE', message: 'usa /changes/by-asset-context' }),
  }));

  await mockSiteAndCamera(page);
  await page.route((url) => url.pathname === '/entities/INC' && url.searchParams.get('assetId') === cameraId, (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ items: [{
      id: '90042', humanId: 'INC-000582', entityKey: 'INC', state: 'abierto', data: { title: 'Sin video' },
      prioridad: 'alta', createdAt: '2026-08-30T10:00:00Z', assetContext: { siteAssetId: siteId, links: [] },
    }], hasMore: false }),
  }));

  let problemContextBody: Record<string, unknown> | null = null;
  await page.route('**/problems/by-asset-context', async (route) => {
    problemContextBody = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        items: [{
          id: '90098', humanId: 'PRB-000098', entityKey: 'PRB', state: 'under_investigation',
          data: { title: 'Cámaras recurrentes' }, createdAt: '2026-08-30T10:00:00Z', updatedAt: '2026-08-30T10:00:00Z',
          associationPath: 'via_incident', viaEntityKey: 'INC', viaHumanId: 'INC-000582',
        }],
        resolvedByRfcRefs: [{ rfcHumanId: 'RFC-000196', viaProblemHumanId: 'PRB-000098' }],
      }),
    });
  });

  let changeContextBody: Record<string, unknown> | null = null;
  await page.route('**/changes/by-asset-context', async (route) => {
    changeContextBody = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        items: [{
          id: '90196', humanId: 'RFC-000196', entityKey: 'RFC', state: 'draft', data: { title: 'Reemplazar cámara' },
          createdAt: '2026-08-30T10:00:00Z', updatedAt: '2026-08-30T10:00:00Z',
          associationPath: 'via_problem', viaEntityKey: 'PRB', viaHumanId: 'PRB-000098',
        }],
      }),
    });
  });

  await page.goto('/app/assets');
  await expect(page.getByRole('heading', { name: 'Operational Inventory' })).toBeVisible();
  await expect(page.getByText('Bolton Volvo').first()).toBeVisible();
  await page.getByRole('button', { name: /Camera 23/ }).click();

  await expect(page.getByText('Operational history of Camera 23')).toBeVisible();
  // The explanatory copy must not claim every result personally stores the snapshot.
  await expect(page.getByText(/either directly or through an incident or problem whose snapshot contains it/i)).toBeVisible();
  await expect(page.getByText('INC · 1')).toBeVisible();
  await expect(page.getByText('PRB · 1')).toBeVisible();
  await expect(page.getByText('RFC · 1')).toBeVisible();

  // Matched by href, not by accessible name: the PRB link's name contains
  // "Via INC-000582" (the provenance badge), which would also satisfy a
  // name-based match for the INC link's own human id.
  const incidentLink = page.locator('a[href="/app/tickets/90042"]');
  const problemLink = page.locator('a[href="/app/problems/PRB-000098"]');
  const changeLink = page.locator('a[href="/app/changes/RFC-000196"]');
  await expect(incidentLink).toBeVisible();
  await expect(problemLink).toBeVisible();
  await expect(changeLink).toBeVisible();
  await expect(incidentLink).toContainText('INC-000582');
  await expect(problemLink).toContainText('PRB-000098');
  await expect(changeLink).toContainText('RFC-000196');

  // Provenance labels: neither result has its own asset snapshot.
  await expect(problemLink.getByText('Via INC-000582')).toBeVisible();
  await expect(changeLink.getByText('Via PRB-000098')).toBeVisible();

  // The batch/context requests must carry the real INC reference the page
  // just discovered, and the RFC batch must carry the resolvedBy reference
  // the PRB batch returned — proving actual composition, not two
  // independent canned responses.
  await expect.poll(() => problemContextBody).toMatchObject({ assetId: cameraId, incidentHumanIds: ['INC-000582'] });
  // Trust boundary: change_service receives ONLY the RFC human id as a
  // lookup candidate — never the viaProblemHumanId pairing itself (that
  // stays a problem_service→frontend-only fact, joined back in for display
  // after change_service authorizes the RFC on its own terms).
  await expect.poll(() => changeContextBody).toMatchObject({
    assetId: cameraId,
    incidentHumanIds: ['INC-000582'],
    problemResolvedRfcHumanIds: ['RFC-000196'],
  });
  expect(changeContextBody).not.toHaveProperty('resolvedByRfcRefs');

  // No raw internal/backend ids visible anywhere in the rendered history —
  // only humanIds ever reach the DOM.
  const pageText = await page.locator('body').innerText();
  for (const rawId of ['90042', '90098', '90196']) {
    expect(pageText).not.toContain(rawId);
  }
  expect(consoleErrors, `unexpected console errors: ${consoleErrors.join('; ')}`).toEqual([]);
});

test('el historial operativo pagina más allá de 100 INC en un único lote acotado, sin una petición por registro', async ({ page }) => {
  await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
  await mockSiteAndCamera(page);

  const totalIncidents = 137;
  let incidentRequestCount = 0;
  await page.route((url) => url.pathname === '/entities/INC' && url.searchParams.get('assetId') === cameraId, (route) => {
    incidentRequestCount += 1;
    const cursor = new URL(route.request().url()).searchParams.get('cursor') ?? '';
    const offset = cursor ? Number(cursor) : 0;
    const pageSize = 100;
    const items = Array.from({ length: Math.min(pageSize, totalIncidents - offset) }, (_, index) => {
      const n = offset + index + 1;
      return {
        id: String(80000 + n), humanId: `INC-${String(n).padStart(6, '0')}`, entityKey: 'INC', state: 'abierto',
        data: { title: `Incidente ${n}` }, prioridad: 'media', createdAt: '2026-08-30T10:00:00Z',
      };
    });
    const nextOffset = offset + items.length;
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ items, hasMore: nextOffset < totalIncidents, nextCursor: nextOffset < totalIncidents ? String(nextOffset) : undefined }),
    });
  });

  let problemBatchCallCount = 0;
  let lastIncidentBatchSize = 0;
  await page.route('**/problems/by-asset-context', async (route) => {
    problemBatchCallCount += 1;
    const body = route.request().postDataJSON() as { incidentHumanIds?: string[] };
    lastIncidentBatchSize = body.incidentHumanIds?.length ?? 0;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], resolvedByRfcRefs: [] }) });
  });
  let changeBatchCallCount = 0;
  await page.route('**/changes/by-asset-context', async (route) => {
    changeBatchCallCount += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) });
  });

  await page.goto('/app/assets');
  await page.getByRole('button', { name: /Camera 23/ }).click();
  await expect(page.getByText(`INC · ${totalIncidents}`)).toBeVisible();

  expect(incidentRequestCount).toBe(2); // 100 + 37, never one request per incident
  expect(problemBatchCallCount).toBe(1); // one bounded batch, not one per incident
  expect(changeBatchCallCount).toBe(1);
  expect(lastIncidentBatchSize).toBe(totalIncidents);
});

// Regression test for the slice(0, 500) silent-truncation bug (Workstream A
// hardening item 1): 501 total incidents — one MORE than
// ASSET_CONTEXT_BATCH_LIMIT — where the ONLY associated PRB/RFC is related
// to incident #501, which only ever appears in the SECOND (final) batch
// call. A slice(0, 500) or equivalent truncation would have dropped
// incident #501 from every batch request entirely, and this PRB/RFC would
// never surface. This test fails if that regresses.
test('ninguna referencia se pierde en silencio: la única PRB/RFC asociada solo aparece en el lote final (501 referencias)', async ({ page }) => {
  await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
  await mockSiteAndCamera(page);

  const totalIncidents = 501;
  const lastIncidentHumanId = `INC-${String(totalIncidents).padStart(6, '0')}`;
  await page.route((url) => url.pathname === '/entities/INC' && url.searchParams.get('assetId') === cameraId, (route) => {
    const cursor = new URL(route.request().url()).searchParams.get('cursor') ?? '';
    const offset = cursor ? Number(cursor) : 0;
    const pageSize = 100;
    const items = Array.from({ length: Math.min(pageSize, totalIncidents - offset) }, (_, index) => {
      const n = offset + index + 1;
      return {
        id: String(90000 + n), humanId: `INC-${String(n).padStart(6, '0')}`, entityKey: 'INC', state: 'abierto',
        data: { title: `Incidente ${n}` }, prioridad: 'media', createdAt: '2026-08-30T10:00:00Z',
      };
    });
    const nextOffset = offset + items.length;
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ items, hasMore: nextOffset < totalIncidents, nextCursor: nextOffset < totalIncidents ? String(nextOffset) : undefined }),
    });
  });

  let problemBatchCallCount = 0;
  const problemBatchSizes: number[] = [];
  await page.route('**/problems/by-asset-context', async (route) => {
    problemBatchCallCount += 1;
    const body = route.request().postDataJSON() as { incidentHumanIds?: string[] };
    const incidentHumanIds = body.incidentHumanIds ?? [];
    problemBatchSizes.push(incidentHumanIds.length);
    const found = incidentHumanIds.includes(lastIncidentHumanId);
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        items: found ? [{
          id: '95098', humanId: 'PRB-000098', entityKey: 'PRB', state: 'under_investigation',
          data: { title: 'Solo en el lote final' }, createdAt: '2026-08-30T10:00:00Z', updatedAt: '2026-08-30T10:00:00Z',
          associationPath: 'via_incident', viaEntityKey: 'INC', viaHumanId: lastIncidentHumanId,
        }] : [],
        resolvedByRfcRefs: found ? [{ rfcHumanId: 'RFC-000196', viaProblemHumanId: 'PRB-000098' }] : [],
      }),
    });
  });

  let changeBatchCallCount = 0;
  await page.route('**/changes/by-asset-context', async (route) => {
    changeBatchCallCount += 1;
    const body = route.request().postDataJSON() as { problemResolvedRfcHumanIds?: string[] };
    const found = (body.problemResolvedRfcHumanIds ?? []).includes('RFC-000196');
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        items: found ? [{
          id: '95196', humanId: 'RFC-000196', entityKey: 'RFC', state: 'draft', data: { title: 'Solo en el lote final' },
          createdAt: '2026-08-30T10:00:00Z', updatedAt: '2026-08-30T10:00:00Z', associationPath: 'via_problem', viaEntityKey: 'PRB',
        }] : [],
      }),
    });
  });

  await page.goto('/app/assets');
  await page.getByRole('button', { name: /Camera 23/ }).click();
  await expect(page.getByText(`INC · ${totalIncidents}`)).toBeVisible();

  // Two bounded batches (500 + 1), never one request per incident and never
  // a single batch that silently caps at 500.
  expect(problemBatchCallCount).toBe(2);
  expect(problemBatchSizes.sort((a, b) => a - b)).toEqual([1, 500]);
  expect(changeBatchCallCount).toBe(2);

  await expect(page.getByText('PRB · 1')).toBeVisible();
  await expect(page.getByText('RFC · 1')).toBeVisible();
  const problemLink = page.locator('a[href="/app/problems/PRB-000098"]');
  const changeLink = page.locator('a[href="/app/changes/RFC-000196"]');
  await expect(problemLink).toBeVisible();
  await expect(changeLink).toBeVisible();
  await expect(problemLink).toContainText(`Via ${lastIncidentHumanId}`);
  // The RFC's "via PRB" label is a frontend join over change_service's own
  // authorized result and problem_service's resolvedByRfcRefs — never a
  // value change_service echoed back.
  await expect(changeLink).toContainText('Via PRB-000098');
});

// Workstream A item 2: an upstream domain failing must taint every domain
// that depends on it, even when a downstream domain's OWN request succeeds
// outright — never let a merely-successful direct/via-incident query stand
// in for "this is the complete picture". Here PRB itself fails; RFC's own
// request to /changes/by-asset-context succeeds (with a real direct-match
// item), but RFC must still show as incomplete because problemResolvedRfc
// HumanIds (the via_problem candidates) could never be computed without PRB.
test('el historial operativo degrada parcialmente cuando un dominio falla, identifica cuál, y se recupera al reintentar', async ({ page }) => {
  await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
  await mockSiteAndCamera(page);
  await page.route((url) => url.pathname === '/entities/INC', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], hasMore: false }),
  }));
  await page.route('**/changes/by-asset-context', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      items: [{
        id: '77001', humanId: 'RFC-077001', entityKey: 'RFC', state: 'draft', data: { title: 'Directo, no depende de PRB' },
        createdAt: '2026-08-30T10:00:00Z', updatedAt: '2026-08-30T10:00:00Z', associationPath: 'direct_asset',
      }],
    }),
  }));

  let problemServiceUp = false;
  await page.route('**/problems/by-asset-context', (route) => {
    if (!problemServiceUp) {
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error_code: 'ASSETS_NO_DISPONIBLES', message: 'temporalmente fuera de línea' }) });
    }
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ items: [{ id: '1', humanId: 'PRB-000001', entityKey: 'PRB', state: 'under_investigation', data: { title: 'Recuperado' }, createdAt: '2026-08-30T10:00:00Z', updatedAt: '2026-08-30T10:00:00Z', associationPath: 'direct_asset' }] }),
    });
  });

  await page.goto('/app/assets');
  await page.getByRole('button', { name: /Camera 23/ }).click();
  await expect(page.getByText('Operational history of Camera 23')).toBeVisible();

  // INC succeeded outright (zero results is a genuinely complete answer) —
  // no warning badge on that domain.
  const incDomain = page.getByTestId('domain-inc');
  await expect(incDomain).toContainText('INC · 0');
  await expect(incDomain.getByTestId('domain-incomplete-warning')).toHaveCount(0);

  // PRB: its own request failed outright — zero items, marked partial.
  const prbDomain = page.getByTestId('domain-prb');
  await expect(prbDomain).toContainText('PRB · 0');
  await expect(prbDomain.getByTestId('domain-incomplete-warning')).toBeVisible();

  // RFC: its own request to /changes/by-asset-context SUCCEEDED (one direct
  // item rendered) — but it must STILL be marked incomplete, because PRB's
  // failure means via_problem candidates were never computed. This is the
  // exact case the review flagged: a downstream domain's success must never
  // be presented as complete when an upstream dependency failed.
  const rfcDomain = page.getByTestId('domain-rfc');
  await expect(rfcDomain).toContainText('RFC · 1');
  await expect(rfcDomain.getByRole('link', { name: /RFC-077001/ })).toBeVisible();
  await expect(rfcDomain.getByTestId('domain-incomplete-warning')).toBeVisible();
  await expect(rfcDomain.getByTestId('domain-incomplete-warning')).toHaveAttribute('title', /PRB unavailable/i);

  await expect(page.getByTestId('operational-history-partial-summary')).toContainText('Could not query PRB directly for this asset.');
  await expect(page.getByTestId('operational-history-partial-summary')).toContainText('PRB unavailable: PRB→RFC references may be missing.');

  // Retry: recover the failing domain, then reload — the query cache
  // (staleTime: 15s in this app's QueryClient) would otherwise still serve
  // the failed result from the same session, so a reload is the real user
  // gesture that forces a fresh fetch here, exactly like hitting refresh.
  problemServiceUp = true;
  await page.reload();
  await page.getByRole('button', { name: /Camera 23/ }).click();

  await expect(page.getByText('Operational history of Camera 23')).toBeVisible();
  await expect(page.getByText('PRB · 1')).toBeVisible();
  await expect(page.getByRole('link', { name: /PRB-000001/ })).toBeVisible();
  // Every partial warning clears once every domain succeeds again — the
  // complete history is reported as complete, not as "still partial from
  // last time".
  await expect(page.getByTestId('domain-incomplete-warning')).toHaveCount(0);
  await expect(page.getByTestId('operational-history-partial-summary')).toHaveCount(0);
});

// Workstream A item 2, first required scenario: INC itself fails outright,
// while PRB and RFC's OWN direct-match requests both succeed. Both must
// still be marked incomplete, because via_incident associations for either
// domain could never even be attempted without a resolved incident list.
test('el historial operativo marca PRB y RFC como incompletos cuando INC falla, aunque sus propias consultas directas tengan éxito', async ({ page }) => {
  await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
  await mockSiteAndCamera(page);

  await page.route((url) => url.pathname === '/entities/INC', (route) => route.fulfill({
    status: 503, contentType: 'application/json', body: JSON.stringify({ error_code: 'TICKETS_NO_DISPONIBLE', message: 'temporalmente fuera de línea' }),
  }));
  await page.route('**/problems/by-asset-context', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      items: [{
        id: '81001', humanId: 'PRB-081001', entityKey: 'PRB', state: 'under_investigation', data: { title: 'Directo, no depende de INC' },
        createdAt: '2026-08-30T10:00:00Z', updatedAt: '2026-08-30T10:00:00Z', associationPath: 'direct_asset',
      }],
      resolvedByRfcRefs: [],
    }),
  }));
  await page.route('**/changes/by-asset-context', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      items: [{
        id: '81002', humanId: 'RFC-081002', entityKey: 'RFC', state: 'draft', data: { title: 'Directo, no depende de INC' },
        createdAt: '2026-08-30T10:00:00Z', updatedAt: '2026-08-30T10:00:00Z', associationPath: 'direct_asset',
      }],
    }),
  }));

  await page.goto('/app/assets');
  await page.getByRole('button', { name: /Camera 23/ }).click();
  await expect(page.getByText('Operational history of Camera 23')).toBeVisible();

  const incDomain = page.getByTestId('domain-inc');
  await expect(incDomain).toContainText('INC · 0');
  await expect(incDomain.getByTestId('domain-incomplete-warning')).toBeVisible();

  const prbDomain = page.getByTestId('domain-prb');
  await expect(prbDomain).toContainText('PRB · 1');
  await expect(prbDomain.getByRole('link', { name: /PRB-081001/ })).toBeVisible();
  await expect(prbDomain.getByTestId('domain-incomplete-warning')).toBeVisible();
  await expect(prbDomain.getByTestId('domain-incomplete-warning')).toHaveAttribute('title', /INC unavailable/i);

  const rfcDomain = page.getByTestId('domain-rfc');
  await expect(rfcDomain).toContainText('RFC · 1');
  await expect(rfcDomain.getByRole('link', { name: /RFC-081002/ })).toBeVisible();
  await expect(rfcDomain.getByTestId('domain-incomplete-warning')).toBeVisible();
  await expect(rfcDomain.getByTestId('domain-incomplete-warning')).toHaveAttribute('title', /INC unavailable/i);
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
  await page.getByRole('button', { name: 'Configure access' }).click();
  await page.getByRole('checkbox', { name: /IT/ }).check();
  await page.getByRole('button', { name: 'Save access' }).click();

  await expect.poll(() => savedUnitIds).toEqual([itId]);
});
