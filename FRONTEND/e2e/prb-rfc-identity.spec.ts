import { expect, test, type Page } from '@playwright/test';
import { mockAuthenticatedAdmin } from './support';
import { USER_UNAVAILABLE_LABEL } from '../src/features/tickets/identity-labels';

// PRB/RFC identity presentation — browser proof that ConfiguredRecordDetail
// (shared by ProblemDetail/ChangeDetail) renders the trusted, server-resolved
// `createdByName` and NEVER the raw `createdBy` UUID, and that it does not
// fall back to a generic catalog field an admin happened to name "requester"
// or "assignee" (arbitrary free text, not a governed identity — see
// ConfiguredRecordDetail.tsx's recordAsTicket()).

const emptyRegion = { columns: 12, placements: [] };

// A real UUID shape, not a human id or a name — the raw value this pass must
// never expose visibly.
const CREATED_BY_UUID = 'a1b2c3d4-5e6f-4a1b-9c2d-3e4f5a6b7c8d';
const CREATED_BY_NAME = 'Marta Restrepo';
// A decoy value in a generic catalog field that happens to be named
// "requester" — proves the widget does not read `data.requester` as an
// identity source, only the trusted `createdBy`/`createdByName` pair.
const DECOY_CATALOG_REQUESTER = 'campo-catalogo-no-es-identidad';

function detailPageWithRequesterWidget() {
  return {
    default: {
      sidebarColumns: 4,
      header: {
        columns: 12,
        placements: [{ id: 'header', kind: 'widget', widgetKey: 'ticketHeader', column: 0, columnSpan: 12, row: 0, locked: true }],
      },
      actions: {
        columns: 12,
        placements: [{ id: 'actions', kind: 'widget', widgetKey: 'ticketActions', column: 0, columnSpan: 12, row: 0, locked: true }],
      },
      main: {
        columns: 12,
        placements: [{ id: 'requester', kind: 'widget', widgetKey: 'requesterDetails', column: 0, columnSpan: 12, row: 0 }],
      },
      sidebar: emptyRegion,
      footer: emptyRegion,
    },
  };
}

async function mockJSON(page: Page, path: string, body: unknown) {
  await page.route((url) => url.port === '8000' && url.pathname === path, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }),
  );
}

// The signed-in agent layout (AgentNav) polls the notification bell on every
// route regardless of what page is under test — unrelated to identity
// presentation, but left unstubbed it forwards to the shared gateway with
// the synthetic E2E token, gets a real 401, and AuthProvider tears the
// simulated session down before the page can render (the same class of trap
// documented in configured-record-detail.spec.ts for /change-relationships).
async function mockGlobalLayoutNoise(page: Page) {
  await mockJSON(page, '/notifications', { items: [], noLeidas: 0 });
}

async function assertZeroVisibleOccurrences(page: Page, rawValue: string) {
  await expect(page.getByText(rawValue)).toHaveCount(0);
  const bodyText = await page.locator('body').innerText();
  expect(bodyText).not.toContain(rawValue);
}

test.describe('RFC detail — createdBy/createdByName identity presentation', () => {
  const specification = {
    fields: [{ key: 'title', label: 'Título', type: 'text', required: true }],
    lifecycle: { states: [{ key: 'draft', label: 'Borrador', initial: true }], transitions: [] },
    detailPage: detailPageWithRequesterWidget(),
  };

  test('renders the real name, never the raw createdBy UUID, and ignores data.requester', async ({ page }) => {
    await mockAuthenticatedAdmin(page);
    await mockGlobalLayoutNoise(page);
    const record = {
      id: '501', humanId: 'RFC-000501', entityKey: 'RFC', definitionId: '61', definitionVersionId: '61',
      definitionVersion: 6, schemaVersion: '1.5', manifestChecksum: 'rfc-checksum-501', state: 'draft',
      data: { title: 'Actualizar servidores', requester: DECOY_CATALOG_REQUESTER },
      createdAt: '2026-08-29T10:00:00Z', updatedAt: '2026-08-29T10:00:00Z',
      // The backend response actually under test: a real UUID plus its
      // trusted, resolved display name.
      createdBy: CREATED_BY_UUID,
      createdByName: CREATED_BY_NAME,
    };
    await mockJSON(page, '/changes/RFC-000501', record);
    await mockJSON(page, '/changes/RFC-000501/manifest', {
      definitionVersionId: '61', entityKey: 'RFC', version: 6, metamodelVersion: '1.5', specification,
      resources: [], checksum: 'rfc-checksum-501', compiledAt: '2026-08-29T09:00:00Z',
    });
    await mockJSON(page, '/relationships/RFC/RFC-000501', { items: [] });
    await mockJSON(page, '/change-relationships/RFC/RFC-000501', { items: [] });
    await mockJSON(page, '/changes/501/tasks', { items: [] });

    await page.goto('/app/changes/RFC-000501');
    await expect(page.getByText('RFC-000501')).toBeVisible();
    await expect(page.getByText(CREATED_BY_NAME)).toBeVisible();
    await expect(page.getByText(DECOY_CATALOG_REQUESTER)).toHaveCount(0);
    await assertZeroVisibleOccurrences(page, CREATED_BY_UUID);
  });

  test('renders "User unavailable" when createdByName is absent, never the raw UUID', async ({ page }) => {
    await mockAuthenticatedAdmin(page);
    await mockGlobalLayoutNoise(page);
    const record = {
      id: '502', humanId: 'RFC-000502', entityKey: 'RFC', definitionId: '61', definitionVersionId: '61',
      definitionVersion: 6, schemaVersion: '1.5', manifestChecksum: 'rfc-checksum-502', state: 'draft',
      data: { title: 'Migrar base de datos', requester: DECOY_CATALOG_REQUESTER },
      createdAt: '2026-08-29T10:00:00Z', updatedAt: '2026-08-29T10:00:00Z',
      // createdBy present (a historical record whose creator could not be
      // resolved) but createdByName absent — the exact case the safe
      // fallback exists for.
      createdBy: CREATED_BY_UUID,
    };
    await mockJSON(page, '/changes/RFC-000502', record);
    await mockJSON(page, '/changes/RFC-000502/manifest', {
      definitionVersionId: '61', entityKey: 'RFC', version: 6, metamodelVersion: '1.5', specification,
      resources: [], checksum: 'rfc-checksum-502', compiledAt: '2026-08-29T09:00:00Z',
    });
    await mockJSON(page, '/relationships/RFC/RFC-000502', { items: [] });
    await mockJSON(page, '/change-relationships/RFC/RFC-000502', { items: [] });
    await mockJSON(page, '/changes/502/tasks', { items: [] });

    await page.goto('/app/changes/RFC-000502');
    await expect(page.getByText('RFC-000502')).toBeVisible();
    await expect(page.getByText(USER_UNAVAILABLE_LABEL)).toBeVisible();
    await assertZeroVisibleOccurrences(page, CREATED_BY_UUID);
  });
});

test.describe('PRB detail — createdBy/createdByName identity presentation', () => {
  const specification = {
    fields: [{ key: 'title', label: 'Título', type: 'text', required: true }],
    lifecycle: { states: [{ key: 'under_investigation', label: 'En investigación', initial: true }], transitions: [] },
    relations: [],
    detailPage: detailPageWithRequesterWidget(),
  };

  test('renders the real name, never the raw createdBy UUID, and ignores data.requester', async ({ page }) => {
    await mockAuthenticatedAdmin(page);
    await mockGlobalLayoutNoise(page);
    const record = {
      id: '601', humanId: 'PRB-000601', entityKey: 'PRB', definitionId: '72', definitionVersionId: '72',
      definitionVersion: 7, schemaVersion: '1.5', manifestChecksum: 'prb-checksum-601', state: 'under_investigation',
      data: { title: 'Playback recurrente', requester: DECOY_CATALOG_REQUESTER },
      createdAt: '2026-08-29T10:00:00Z', updatedAt: '2026-08-29T10:00:00Z',
      createdBy: CREATED_BY_UUID,
      createdByName: CREATED_BY_NAME,
    };
    await mockJSON(page, '/entities/PRB/PRB-000601', record);
    await mockJSON(page, '/entities/PRB/PRB-000601/manifest', {
      definitionVersionId: '72', entityKey: 'PRB', version: 7, metamodelVersion: '1.5', specification,
      resources: [], checksum: 'prb-checksum-601', compiledAt: '2026-08-29T09:00:00Z',
    });
    await mockJSON(page, '/relationships/PRB/PRB-000601', { items: [] });
    await mockJSON(page, '/entities/INC', { items: [] });
    await mockJSON(page, '/changes', { items: [] });

    await page.goto('/app/problems/PRB-000601');
    await expect(page.getByText('PRB-000601')).toBeVisible();
    await expect(page.getByText(CREATED_BY_NAME)).toBeVisible();
    await expect(page.getByText(DECOY_CATALOG_REQUESTER)).toHaveCount(0);
    await assertZeroVisibleOccurrences(page, CREATED_BY_UUID);
  });

  test('renders "User unavailable" when createdByName is absent, never the raw UUID', async ({ page }) => {
    await mockAuthenticatedAdmin(page);
    await mockGlobalLayoutNoise(page);
    const record = {
      id: '602', humanId: 'PRB-000602', entityKey: 'PRB', definitionId: '72', definitionVersionId: '72',
      definitionVersion: 7, schemaVersion: '1.5', manifestChecksum: 'prb-checksum-602', state: 'under_investigation',
      data: { title: 'Fuga de memoria intermitente', requester: DECOY_CATALOG_REQUESTER },
      createdAt: '2026-08-29T10:00:00Z', updatedAt: '2026-08-29T10:00:00Z',
      createdBy: CREATED_BY_UUID,
    };
    await mockJSON(page, '/entities/PRB/PRB-000602', record);
    await mockJSON(page, '/entities/PRB/PRB-000602/manifest', {
      definitionVersionId: '72', entityKey: 'PRB', version: 7, metamodelVersion: '1.5', specification,
      resources: [], checksum: 'prb-checksum-602', compiledAt: '2026-08-29T09:00:00Z',
    });
    await mockJSON(page, '/relationships/PRB/PRB-000602', { items: [] });
    await mockJSON(page, '/entities/INC', { items: [] });
    await mockJSON(page, '/changes', { items: [] });

    await page.goto('/app/problems/PRB-000602');
    await expect(page.getByText('PRB-000602')).toBeVisible();
    await expect(page.getByText(USER_UNAVAILABLE_LABEL)).toBeVisible();
    await assertZeroVisibleOccurrences(page, CREATED_BY_UUID);
  });
});
