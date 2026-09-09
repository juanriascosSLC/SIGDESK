import { expect, test, type Page } from '@playwright/test';
import { mockAuthenticatedAdmin } from './support';

const emptyRegion = { columns: 12, placements: [] };

function detailPage(mainPlacements: Array<Record<string, unknown>>, footerPlacements: Array<Record<string, unknown>> = []) {
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
      main: { columns: 12, placements: mainPlacements },
      sidebar: emptyRegion,
      footer: { columns: 12, placements: footerPlacements },
    },
  };
}

async function mockJSON(page: Page, path: string, body: unknown) {
  await page.route((url) => url.port === '8000' && url.pathname === path, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }),
  );
}

test('RFC detail executes its immutable page layout and real task widget', async ({ page }) => {
  await mockAuthenticatedAdmin(page);
  const record = {
    id: '101', humanId: 'RFC-000101', entityKey: 'RFC', definitionId: '61', definitionVersionId: '61',
    definitionVersion: 6, schemaVersion: '1.5', manifestChecksum: 'rfc-checksum', state: 'draft',
    data: { title: 'Actualizar servidores', impact: 'high', description: 'Cambio controlado' },
    createdAt: '2026-08-29T10:00:00Z', updatedAt: '2026-08-29T10:00:00Z',
  };
  const specification = {
    fields: [
      { key: 'title', label: 'Título', type: 'text', required: true },
      { key: 'impact', label: 'Impacto', type: 'select', options: [{ value: 'high', label: 'Alto' }] },
      { key: 'description', label: 'Descripción', type: 'textarea' },
    ],
    lifecycle: { states: [{ key: 'draft', label: 'Borrador', initial: true }], transitions: [] },
    detailPage: detailPage([
      { id: 'impact', kind: 'field', source: 'catalog', fieldKey: 'impact', column: 0, columnSpan: 6, row: 0 },
      { id: 'tasks', kind: 'widget', widgetKey: 'changeTasks', column: 0, columnSpan: 12, row: 1 },
    ], [{ id: 'description', kind: 'widget', widgetKey: 'description', column: 0, columnSpan: 12, row: 0 }]),
  };
  await mockJSON(page, '/changes/RFC-000101', record);
  await mockJSON(page, '/changes/RFC-000101/manifest', {
    definitionVersionId: '61', entityKey: 'RFC', version: 6, metamodelVersion: '1.5', specification,
    resources: [], checksum: 'rfc-checksum', compiledAt: '2026-08-29T09:00:00Z',
  });
  await mockJSON(page, '/relationships/RFC/RFC-000101', { items: [] });
  // RFC relations are composed from the generic catalog runtime and Change
  // Management. Leaving the second source unstubbed forwards the request to
  // Kong with the synthetic E2E token; its expected 401 then clears the
  // simulated session before the immutable layout can render.
  await mockJSON(page, '/change-relationships/RFC/RFC-000101', { items: [] });
  await mockJSON(page, '/changes/101/tasks', { items: [] });

  await page.goto('/app/changes/RFC-000101');
  await expect(page.getByText('RFC-000101')).toBeVisible();
  await expect(page.getByTestId('ticket-detail-field-catalog-impact')).toContainText('Alto');
  // MERGE NOTE: the widget heading was localized to English on origin/Hector
  // (ChangeTasksWidget.tsx). The assertion's intent — the real task widget
  // renders — is unchanged; only the copy it looks for moved.
  await expect(page.getByText('Work plan')).toBeVisible();
  await expect(page.getByText('Cambio controlado')).toBeVisible();
  // NOTE (pre-existing, not merge fallout): ConfiguredRecordDetail.tsx renders
  // "Executable definition <entityKey> v<version>" and has done so on BOTH
  // sides of this merge — this assertion was already failing on the branch
  // before Hector was merged in. Repointed at the copy the component actually
  // renders.
  await expect(page.getByText(/Executable definition RFC v6/)).toBeVisible();
});

test('PRB detail executes its immutable layout and versioned relations', async ({ page }) => {
  await mockAuthenticatedAdmin(page);
  const record = {
    id: '202', humanId: 'PRB-000202', entityKey: 'PRB', definitionId: '72', definitionVersionId: '72',
    definitionVersion: 7, schemaVersion: '1.5', manifestChecksum: 'prb-checksum', state: 'under_investigation',
    data: { title: 'Playback recurrente', rootCause: 'Fuga de memoria' },
    createdAt: '2026-08-29T10:00:00Z', updatedAt: '2026-08-29T10:00:00Z',
  };
  const specification = {
    fields: [
      { key: 'title', label: 'Título', type: 'text', required: true },
      { key: 'rootCause', label: 'Causa raíz', type: 'textarea' },
    ],
    lifecycle: { states: [{ key: 'under_investigation', label: 'En investigación', initial: true }], transitions: [] },
    relations: [],
    detailPage: detailPage([
      { id: 'root-cause', kind: 'field', source: 'catalog', fieldKey: 'rootCause', column: 0, columnSpan: 12, row: 0 },
      { id: 'relations', kind: 'widget', widgetKey: 'itsmRelations', column: 0, columnSpan: 12, row: 1 },
    ]),
  };
  await mockJSON(page, '/entities/PRB/PRB-000202', record);
  await mockJSON(page, '/entities/PRB/PRB-000202/manifest', {
    definitionVersionId: '72', entityKey: 'PRB', version: 7, metamodelVersion: '1.5', specification,
    resources: [], checksum: 'prb-checksum', compiledAt: '2026-08-29T09:00:00Z',
  });
  await mockJSON(page, '/relationships/PRB/PRB-000202', { items: [{
    id: '9', contractVersion: '2', relationKey: 'incidents', relationLabel: 'Incidentes afectados',
    inverseKey: 'problem', inverseLabel: 'Problema relacionado', sourceEntityId: '202', sourceEntityKey: 'PRB',
    sourceHumanId: 'PRB-000202', sourceDefinitionVersionId: '72', targetEntityId: '303', targetEntityKey: 'INC',
    targetHumanId: 'INC-000303', targetDefinitionVersionId: '83', createdAt: '2026-08-29T10:30:00Z',
  }] });
  await mockJSON(page, '/entities/INC', { items: [] });
  await mockJSON(page, '/changes', { items: [] });

  await page.goto('/app/problems/PRB-000202');
  // MERGE NOTE: scoped to the header region. origin/Hector's humanId fixes
  // (show humanId rather than the internal id under the Ticket number
  // placement, and label related records by humanId) mean 'PRB-000202' now
  // legitimately appears more than once on this page, so the bare text query
  // became a strict-mode violation. The intent — the header shows the Numero
  // visible — is asserted more precisely than before, not relaxed.
  await expect(page.getByTestId('page-layout-region-header').getByText('PRB-000202')).toBeVisible();
  await expect(page.getByTestId('ticket-detail-field-catalog-rootCause')).toContainText('Fuga de memoria');
  await expect(page.getByText('INC-000303')).toBeVisible();
  await expect(page.getByText('Definición ejecutable PRB v7')).toBeVisible();
});
