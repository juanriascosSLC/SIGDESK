import { expect, test, type Page } from '@playwright/test';
import { mockAuthenticatedAdmin } from './support';

const emptyRegion = { columns: 12, placements: [] };
const detailPage = {
  sidebarColumns: 4,
  header: { columns: 12, placements: [{ id: 'header', kind: 'widget', widgetKey: 'ticketHeader', column: 0, columnSpan: 12, row: 0, locked: true }] },
  actions: { columns: 12, placements: [{ id: 'actions', kind: 'widget', widgetKey: 'ticketActions', column: 0, columnSpan: 12, row: 0, locked: true }] },
  main: { columns: 12, placements: [{ id: 'description', kind: 'widget', widgetKey: 'description', column: 0, columnSpan: 12, row: 0 }] },
  sidebar: emptyRegion,
  footer: emptyRegion,
};

async function mockJSON(page: Page, predicate: (url: URL) => boolean, body: unknown, status = 200) {
  await page.route((url) => url.port === '8000' && predicate(url), (route) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }),
  );
}

test('INC creates its RFC and typed origin relation through one atomic endpoint', async ({ page }) => {
  await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
  const record = {
    id: '10', humanId: 'INC-000010', entityKey: 'INC', definitionId: '51', definitionVersionId: '51',
    definitionVersion: 5, schemaVersion: '1.5', manifestChecksum: 'inc-checksum', state: 'abierto',
    data: { title: 'Cámara fuera de línea', description: 'No responde al ping' },
    prioridad: 'alta', creadorId: 'playwright', createdAt: '2026-08-29T10:00:00Z', updatedAt: '2026-08-29T10:00:00Z',
  };
  const incSpecification = {
    fields: [
      { key: 'title', label: 'Título', type: 'text', required: true },
      { key: 'description', label: 'Descripción', type: 'textarea' },
    ],
    lifecycle: { states: [{ key: 'abierto', label: 'Abierto', initial: true }], transitions: [] },
    detailPage: { default: detailPage },
  };
  await mockJSON(page, (url) => /^\/entities\/INC\/(INC-000010|10)$/.test(url.pathname), record);
  await mockJSON(page, (url) => url.pathname === '/entities/INC/10/manifest', {
    definitionVersionId: '51', entityKey: 'INC', version: 5, metamodelVersion: '1.5',
    specification: incSpecification, resources: [], checksum: 'inc-checksum', compiledAt: '2026-08-29T09:00:00Z',
  });
  await mockJSON(page, (url) => url.pathname === '/entities/INC/10/resolved-definition', {
    entityId: '10', humanId: 'INC-000010', entityKey: 'INC', definitionVersionId: '51',
    schemaVersion: '1.5', workflowVersion: '', metamodelVersion: '1.5', layoutVersionId: null,
    layoutVersion: null, layoutResolution: 'latest-compatible', fields: incSpecification.fields,
    lifecycle: incSpecification.lifecycle, layouts: { detail: { default: detailPage } },
  });
  for (const path of [
    '/tickets/10/comments', '/tickets/10/attachments', '/tickets/10/watchers', '/tickets/10/activity',
    '/relationships/INC/10', '/change-relationships/INC/10',
  ]) await mockJSON(page, (url) => url.pathname === path, { items: [] });
  await mockJSON(page, (url) => url.pathname === '/sla/assessments/10', { message: 'not configured' }, 404);
  await mockJSON(page, (url) => url.pathname === '/changes/definition', {
    id: '81', entityKey: 'RFC', name: 'Request for Change', version: 8, status: 'published',
    specification: {
      fields: [
        { key: 'title', label: 'Título', type: 'text', required: true },
        { key: 'description', label: 'Descripción', type: 'textarea', required: true },
        { key: 'requester', label: 'Solicitante', type: 'text', required: true },
      ],
      lifecycle: { states: [{ key: 'draft', label: 'Borrador', initial: true }], transitions: [] },
      relations: [{ key: 'origin_inc', label: 'Incidente de origen', targetEntityKey: 'INC', inverseKey: 'generatedChange', inverseLabel: 'Cambio generado', contractVersion: '1' }],
    },
  });

  let atomicBody: Record<string, unknown> | undefined;
  await page.route((url) => url.port === '8000' && url.pathname === '/changes/from-incident', async (route) => {
    atomicBody = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({
      id: '90', humanId: 'RFC-000090', entityKey: 'RFC', definitionId: '81', definitionVersionId: '81',
      definitionVersion: 8, schemaVersion: '1.5', manifestChecksum: 'rfc-checksum', state: 'draft',
      data: (atomicBody.data ?? {}), createdAt: '2026-08-29T11:00:00Z', updatedAt: '2026-08-29T11:00:00Z',
    }) });
  });

  await page.goto('/app/tickets/INC-000010');
  await page.getByRole('button', { name: 'Crear RFC' }).click();
  await expect(page.getByRole('heading', { name: 'Crear cambio desde este incidente' })).toBeVisible();
  await page.getByRole('button', { name: 'Crear RFC y vincular' }).click();

  await expect.poll(() => atomicBody?.incidentId).toBe('10');
  expect(atomicBody?.data).toMatchObject({ requester: 'Playwright Admin' });
  await expect(page).toHaveURL(/\/app\/changes\/RFC-000090$/);
});
