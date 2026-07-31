import { expect, test, type APIRequestContext, type APIResponse } from '@playwright/test';
import { mockAuthenticatedAdmin } from './support';
import { definitionData, type Definition } from './catalog-support';

const apiBaseURL =
  process.env.PLAYWRIGHT_API_URL ?? 'http://127.0.0.1:8080/api/v1';

// This entity key is scratch space owned entirely by this spec. Deliberately
// NOT "INC": once a layout is published for an entity key it can never be
// unpublished or deleted (catalog_layout_versions rows are immutable by
// trigger, and there is no unpublish/delete endpoint), so publishing a real
// layout against the shared "INC" entity key here would permanently change
// how every INC ticket renders for the rest of this suite (and any dev
// database this test run happens to share) — including incident-flow.spec.ts,
// which asserts on widgets that only exist today via the legacy-synthesized
// fallback. A dedicated entity key that nothing else in the suite touches
// keeps this spec's writes irreversible only to itself.
const entityKey = 'ZLAYE2E';

interface ResolvedDefinition {
  layoutVersionId: string | null;
  layoutVersion: number | null;
  layoutResolution: 'latest-compatible' | 'previous-compatible' | 'legacy-synthesized';
}

interface CatalogLayoutVersion {
  id: string;
  entityKey: string;
  version: number;
  status: string;
  isActive: boolean;
}

interface Entity {
  id: string;
  humanId: string;
  definitionVersion: number;
}

async function json<T>(response: APIResponse, operation: string): Promise<T> {
  expect(response.ok(), `${operation} failed (${response.status()}): ${await response.text()}`).toBeTruthy();
  return response.json() as Promise<T>;
}

async function publishDefinitionVersion(
  request: APIRequestContext,
  fields: Array<{ key: string; label: string; type: string; options?: Array<{ value: string; label: string }> }>,
): Promise<number> {
  const draft = await json<Definition & { version: number }>(
    await request.post(`${apiBaseURL}/catalog/definitions`, {
      data: {
        entityKey,
        name: 'Playwright Layout Versioning Scratch Entity',
        specification: {
          identity: { prefix: entityKey },
          fields,
          lifecycle: {
            states: [{ key: 'open', label: 'Open', initial: true }],
          },
        },
      },
    }),
    'create definition draft',
  );
  await json(
    await request.post(
      `${apiBaseURL}/catalog/definitions/${entityKey}/versions/${draft.version}/publish`,
    ),
    `publish definition v${draft.version}`,
  );
  return draft.version;
}

function fieldPlacementDocument(fieldKey: string) {
  return {
    detail: {
      regions: {
        main: {
          placements: [
            { id: 'p1', kind: 'field', source: 'catalog', fieldId: fieldKey, fieldKey },
          ],
        },
      },
    },
  };
}

async function publishLayoutVersion(
  request: APIRequestContext,
  fieldKey: string,
): Promise<CatalogLayoutVersion> {
  await json(
    await request.post(`${apiBaseURL}/catalog/layouts/${entityKey}/draft`, {
      data: fieldPlacementDocument(fieldKey),
    }),
    'create layout draft',
  );
  return json<CatalogLayoutVersion>(
    await request.post(`${apiBaseURL}/catalog/layouts/${entityKey}/publish`),
    'publish layout draft',
  );
}

test.describe('Catalog layout versioning API', () => {
  test('draft, publish, previous-compatible fallback and rollback all resolve correctly against real Postgres', async ({
    request,
  }) => {
    // v1: only "title". The scratch entity created below is pinned to this
    // version forever, regardless of how the definition or layout evolve.
    await publishDefinitionVersion(request, [
      { key: 'title', label: 'Title', type: 'text' },
    ]);

    const entity = await json<Entity>(
      await request.post(`${apiBaseURL}/entities/${entityKey}`, {
        headers: { 'Idempotency-Key': 'playwright-catalog-layout-versions-entity-v1' },
        data: { data: { title: 'Playwright layout versioning fixture' } },
      }),
      'create scratch entity',
    );
    expect(entity.definitionVersion).toBe(1);

    // Layout v_title: references "title", compatible with the entity's
    // historical (and, for now, still current) schema. Becomes active.
    const titleCompatibleLayout = await publishLayoutVersion(request, 'title');

    const afterFirstLayout = await json<ResolvedDefinition>(
      await request.get(`${apiBaseURL}/entities/${entityKey}/${entity.id}/resolved-definition`),
      'resolve after first layout publish',
    );
    expect(afterFirstLayout.layoutResolution).toBe('latest-compatible');
    expect(afterFirstLayout.layoutVersion).toBe(titleCompatibleLayout.version);

    // Evolve the definition: a NEW version adds "priority". The scratch
    // entity above never sees this — GetDefinition always fetches it by the
    // exact historical version number, regardless of what is currently
    // published.
    await publishDefinitionVersion(request, [
      { key: 'title', label: 'Title', type: 'text' },
      {
        key: 'priority',
        label: 'Priority',
        type: 'select',
        options: [{ value: 'low', label: 'Low' }],
      },
    ]);

    // A new layout references the NEW field. It publishes fine (validated
    // against the CURRENT definition, which now has "priority") and becomes
    // active — but it is incompatible with the scratch entity's v1 schema.
    const priorityOnlyLayout = await publishLayoutVersion(request, 'priority');
    expect(priorityOnlyLayout.isActive).toBe(true);
    expect(priorityOnlyLayout.version).toBeGreaterThan(titleCompatibleLayout.version);

    const afterIncompatibleActive = await json<ResolvedDefinition>(
      await request.get(`${apiBaseURL}/entities/${entityKey}/${entity.id}/resolved-definition`),
      'resolve while active layout is incompatible',
    );
    expect(afterIncompatibleActive.layoutResolution).toBe('previous-compatible');
    expect(afterIncompatibleActive.layoutVersion).toBe(titleCompatibleLayout.version);

    // Rollback: reactivate the title-compatible layout explicitly.
    await json(
      await request.post(
        `${apiBaseURL}/catalog/layouts/${entityKey}/versions/${titleCompatibleLayout.version}/activate`,
      ),
      'activate (rollback to) the title-compatible layout',
    );

    const active = await json<CatalogLayoutVersion>(
      await request.get(`${apiBaseURL}/catalog/layouts/${entityKey}/active`),
      'get active layout after rollback',
    );
    expect(active.version).toBe(titleCompatibleLayout.version);
    expect(active.isActive).toBe(true);

    const afterRollback = await json<ResolvedDefinition>(
      await request.get(`${apiBaseURL}/entities/${entityKey}/${entity.id}/resolved-definition`),
      'resolve after rollback',
    );
    expect(afterRollback.layoutResolution).toBe('latest-compatible');
    expect(afterRollback.layoutVersion).toBe(titleCompatibleLayout.version);
  });
});

test.describe('Ticket detail provenance badge', () => {
  test('shows legacy-synthesized provenance for an INC ticket, wired end-to-end through the resolved-definition endpoint', async ({
    page,
    request,
  }) => {
    // INC has never had a catalog_layout_versions row published in this
    // environment, so its tickets always resolve via the safe,
    // zero-database-write legacy-synthesized fallback — this is the one
    // provenance value that is always true for INC without this spec ever
    // needing to publish a (permanent, irreversible) layout for it.
    const definitionResponse = await request.get(`${apiBaseURL}/entities/INC/presentation`);
    const definition = await json<Definition>(definitionResponse, 'get published INC definition');

    const createResponse = await request.post(`${apiBaseURL}/entities/INC`, {
      headers: { 'Idempotency-Key': 'playwright-provenance-badge-inc-v1' },
      data: {
        data: definitionData(definition, {
          title: 'Playwright provenance badge fixture',
          description: 'Used to verify the definition-provenance badge renders end-to-end.',
          priority: 'low',
        }),
      },
    });
    const entity = await json<Entity & { humanId: string }>(createResponse, 'seed INC entity');

    const resolved = await json<ResolvedDefinition>(
      await request.get(`${apiBaseURL}/entities/INC/${entity.humanId}/resolved-definition`),
      'resolve INC ticket definition',
    );
    expect(resolved.layoutResolution).toBe('legacy-synthesized');
    expect(resolved.layoutVersionId).toBeNull();

    await expect
      .poll(
        async () => (await request.get(`${apiBaseURL}/tickets/${entity.humanId}`)).status(),
        { timeout: 15_000, message: 'Tickets did not project the seeded INC entity.' },
      )
      .toBe(200);

    await mockAuthenticatedAdmin(page);
    await page.goto(`/app/tickets/${entity.humanId}`);
    await expect(page.getByTestId('ticket-detail')).toBeVisible();

    const badge = page.getByTestId('definition-provenance');
    await expect(badge).toBeVisible();
    await expect(badge).toContainText('Generado (sin layout)');
    await expect(badge).toHaveAttribute('title', /legacy-synthesized/);
  });
});
