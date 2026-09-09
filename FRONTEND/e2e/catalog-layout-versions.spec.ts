import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type APIResponse } from '@playwright/test';
import { mockAuthenticatedAdmin } from './support';
import { startIsolatedCatalogStack } from './isolated-catalog-stack';
import { definitionData, type Definition } from './catalog-support';

// E2E contamination remediation, Workstream A (2026-09-06): this file no
// longer targets the shared local stack. Every test below stands up its own
// disposable `sigdesk_tickets_e2e_*` database + isolated e2e_tickets_service
// process via `startIsolatedCatalogStack` and tears it down in `finally`,
// exactly like isolated-ticket-collaboration.spec.ts / catalog-builder-runtime.spec.ts.

interface Entity {
  id: string;
  humanId: string;
  definitionVersion: number;
}

interface EntityManifest {
  definitionVersionId: string;
  entityKey: string;
  version: number;
  specification: { fields: Array<{ key: string; label: string }> } & Record<string, unknown>;
}

/** Only the field `GET /entities/{entityKey}/{id}/resolved-definition` is
 *  actually asserted on below (`layoutResolution`) — kept minimal on purpose
 *  rather than reusing `EntityManifest`, whose shape this endpoint doesn't share. */
interface ResolvedDefinition {
  layoutResolution: string;
}

async function json<T>(response: APIResponse, operation: string): Promise<T> {
  expect(response.ok(), `${operation} failed (${response.status()}): ${await response.text()}`).toBeTruthy();
  return response.json() as Promise<T>;
}

/** Sites are a shared, read-only dependency (resource_service via the Kong
 *  gateway) — never isolated per run, same as isolated-ticket-collaboration.spec.ts
 *  and catalog-builder-runtime.spec.ts. Only a `recursoId` is fetched here;
 *  nothing is created or mutated against the shared stack. */
async function sharedSiteRecursoId(request: APIRequestContext): Promise<string> {
  const response = await request.get(
    `${process.env.PLAYWRIGHT_API_URL ?? 'http://127.0.0.1:8000'}/assets/sites?limit=1`,
  );
  const body = await json<{ items?: Array<{ id: string }> }>(response, 'load one shared CMDB site');
  const recursoId = body.items?.[0]?.id;
  expect(recursoId, 'At least one synchronized CMDB site is required').toBeTruthy();
  return recursoId!;
}

async function createIncPinnedToCurrentDefinition(
  isolatedRequest: APIRequestContext,
  definition: Definition,
  recursoId: string,
  title: string,
): Promise<Entity> {
  const response = await isolatedRequest.post('/entities/INC', {
    headers: { 'Idempotency-Key': `playwright-layout-lifecycle-${randomUUID()}` },
    data: {
      data: definitionData(definition, {
        title,
        description: 'Definition-version lifecycle acceptance incident.',
        priority: 'low',
      }),
      recursoId,
      assetContext: { siteAssetId: recursoId, links: [] },
    },
  });
  return json<Entity>(response, `create INC pinned to v${(definition as { version?: number }).version ?? '?'}`);
}

async function manifestOf(isolatedRequest: APIRequestContext, id: string): Promise<EntityManifest> {
  return json<EntityManifest>(
    await isolatedRequest.get(`/entities/INC/${id}/manifest`),
    `get manifest for entity ${id}`,
  );
}

function hasField(manifest: Pick<EntityManifest, 'specification'>, key: string): boolean {
  return manifest.specification.fields.some((field) => field.key === key);
}

// Rewritten 2026-09-06 (Product Owner correction): the previous version of
// this describe block exercised a standalone `/catalog/layouts/{entityKey}/*`
// draft-publish-activate API that does not exist anywhere in the current
// backend (confirmed live — every one of those routes 404s — and by reading
// every registered route in `catalogo_controller.go`, which only exposes
// `/catalog/definitions*` and `/catalog/resources`). That is NOT
// re-implemented here. Instead this proves the ACTUAL, CURRENT architecture:
// a layout is not a separate versioned resource at all — it is the
// `createPage`/`editPage`/`detailPage` placements embedded directly inside
// `catalog_definitions.especificacion`, so a definition version and "its"
// layout are the same immutable unit (`layoutsHistoricos`,
// entidades_controller.go). A ticket's own `/entities/INC/{id}/manifest`
// always returns the exact specification (fields + embedded layout) pinned
// to whatever definition version it was created under
// (`definicionHistoricaDe`) — regardless of how many newer versions get
// published afterward. "Rollback" in this model is not reactivating an old
// layout row; it is cloning a historical definition version's specification
// into a brand new draft and publishing it as the next version number.
//
// Entity key is INC, not a scratch key: `entityKeySoportado` gates
// `/entities/{entityKey}/*` (including `/manifest` and
// `/resolved-definition`) to `entityKey === "INC"` only
// (entidades_controller.go:26) — a scratch entity key 501s on exactly the
// endpoints this test needs, which is a second, independent reason the old
// scratch-entity design could never have worked against today's backend.
test.describe('Catalog definition-version lifecycle (layouts embedded in immutable versions)', () => {
  test('a ticket keeps rendering the layout embedded in its own pinned definition version; rollback clones a historical version into a new draft', async ({
    request,
  }) => {
    const stack = await startIsolatedCatalogStack();
    try {
      const recursoId = await sharedSiteRecursoId(request);

      // --- v1 ("layout A"): the isolated stack's own auto-seeded, published
      // INC definition (BACKEND/scripts/fixtures/catalog-inc-v1.json) — no
      // extra publish needed, it is already the active version 1.
      const v1 = await json<Definition & { version: number }>(
        await stack.isolatedRequest.get('/catalog/definitions/INC'),
        'get baseline (v1) INC definition',
      );
      expect(v1.version).toBe(1);
      expect(hasField({ specification: v1.specification }, 'layoutMarkerV2')).toBe(false);

      const ticketV1 = await createIncPinnedToCurrentDefinition(
        stack.isolatedRequest,
        v1,
        recursoId,
        'Pinned to v1 (layout A)',
      );

      // --- v2 ("layout B"): a real draft cloned from v1's specification,
      // with one additive field + a real placement for it in the detail
      // page — the embedded-layout change this whole test is about.
      const v1Spec = JSON.parse(JSON.stringify(v1.specification)) as typeof v1.specification & {
        detailPage: { default: { footer: { columns: number; placements: unknown[] } } };
      };
      v1Spec.fields.push({ key: 'layoutMarkerV2', label: 'Layout marker v2', type: 'text', required: false });
      v1Spec.detailPage.default.footer.placements.push({
        id: 'layout-marker-v2-placement',
        kind: 'field',
        source: 'catalog',
        fieldKey: 'layoutMarkerV2',
        column: 0,
        columnSpan: 12,
        row: 0,
      });

      const v2Draft = await json<Definition & { version: number }>(
        await stack.isolatedRequest.post('/catalog/definitions', {
          data: { entityKey: 'INC', name: v1.name, specification: v1Spec },
        }),
        'create v2 draft (layout B) from cloned v1 specification',
      );
      expect(v2Draft.version).toBe(2);
      await json(
        await stack.isolatedRequest.post(`/catalog/definitions/INC/versions/${v2Draft.version}/validate`),
        'validate v2 draft',
      );
      const v2 = await json<Definition & { version: number }>(
        await stack.isolatedRequest.post(`/catalog/definitions/INC/versions/${v2Draft.version}/publish`),
        'publish v2 (layout B)',
      );
      expect(v2.version).toBe(2);

      const ticketV2 = await createIncPinnedToCurrentDefinition(
        stack.isolatedRequest,
        v2,
        recursoId,
        'Pinned to v2 (layout B)',
      );

      // --- Prove each ticket renders exactly the layout embedded in the
      // version it was created under — independent of whatever is
      // currently published.
      const manifestV1AfterV2 = await manifestOf(stack.isolatedRequest, ticketV1.id);
      expect(manifestV1AfterV2.version).toBe(1);
      expect(hasField(manifestV1AfterV2, 'layoutMarkerV2'), 'the v1 ticket must still render layout A, without the v2 marker field').toBe(false);

      const manifestV2 = await manifestOf(stack.isolatedRequest, ticketV2.id);
      expect(manifestV2.version).toBe(2);
      expect(hasField(manifestV2, 'layoutMarkerV2'), 'the v2 ticket must render layout B, with the v2 marker field').toBe(true);

      // --- "Rollback": there is no reactivate-an-old-layout endpoint —
      // the supported model is cloning the DESIRED historical definition's
      // specification (v1's, unmodified) into a new draft and publishing
      // it as the next version.
      const v3Draft = await json<Definition & { version: number }>(
        await stack.isolatedRequest.post('/catalog/definitions', {
          data: { entityKey: 'INC', name: v1.name, specification: v1.specification },
        }),
        'create v3 draft by cloning historical v1 specification (rollback model)',
      );
      expect(v3Draft.version).toBe(3);
      await json(
        await stack.isolatedRequest.post(`/catalog/definitions/INC/versions/${v3Draft.version}/validate`),
        'validate v3 draft',
      );
      const v3 = await json<Definition & { version: number }>(
        await stack.isolatedRequest.post(`/catalog/definitions/INC/versions/${v3Draft.version}/publish`),
        'publish v3 (rollback clone of v1)',
      );
      expect(v3.version).toBe(3);

      const ticketV3 = await createIncPinnedToCurrentDefinition(
        stack.isolatedRequest,
        v3,
        recursoId,
        'Pinned to v3 (rollback clone of v1)',
      );

      // --- Publishing v3 must not disturb v1 or v2's historical records.
      const manifestV1Final = await manifestOf(stack.isolatedRequest, ticketV1.id);
      expect(manifestV1Final.version, 'the v1 ticket must remain pinned to v1 after v3 is published').toBe(1);
      expect(hasField(manifestV1Final, 'layoutMarkerV2')).toBe(false);

      const manifestV2Final = await manifestOf(stack.isolatedRequest, ticketV2.id);
      expect(manifestV2Final.version, 'the v2 ticket must remain pinned to v2 after v3 is published').toBe(2);
      expect(hasField(manifestV2Final, 'layoutMarkerV2')).toBe(true);

      const manifestV3 = await manifestOf(stack.isolatedRequest, ticketV3.id);
      expect(manifestV3.version, 'the new record must use v3').toBe(3);
      expect(hasField(manifestV3, 'layoutMarkerV2'), 'v3 is a clone of v1 (layout A), so the v2 marker field must be absent').toBe(false);
    } finally {
      await stack.cleanup();
    }
  });
});

test.describe('Ticket detail provenance badge', () => {
  test('shows legacy-synthesized provenance for an INC ticket, wired end-to-end through the resolved-definition endpoint', async ({
    page,
    request,
  }) => {
    // Isolated per-run stack (E2E contamination remediation, Workstream A,
    // 2026-09-06): this used to create one permanent INC entity in
    // sigdesk_tickets_local on every run, with no cleanup. `startIsolatedCatalogStack`
    // already seeds and publishes a real INC definition (from the same
    // canonical fixture used elsewhere) before returning, so no extra setup
    // is needed here beyond pointing every request at the disposable stack.
    const recursoId = await sharedSiteRecursoId(request);
    const stack = await startIsolatedCatalogStack();
    try {
      const definitionResponse = await stack.isolatedRequest.get('/catalog/definitions/INC');
      const definition = await json<Definition>(definitionResponse, 'get published INC definition');

      const createResponse = await stack.isolatedRequest.post('/entities/INC', {
        headers: { 'Idempotency-Key': `playwright-provenance-badge-inc-${randomUUID()}` },
        data: {
          data: definitionData(definition, {
            title: 'Playwright provenance badge fixture',
            description: 'Used to verify the definition-provenance badge renders end-to-end.',
            priority: 'low',
          }),
          recursoId,
          assetContext: { siteAssetId: recursoId, links: [] },
        },
      });
      const entity = await json<Entity & { humanId: string }>(createResponse, 'seed INC entity');

      // Stale test assumption found while migrating this test (2026-09-06,
      // not a production bug — see api.ts:292-296's documented contract):
      // `GET /entities/{entityKey}/{id}/resolved-definition` parses `{id}`
      // as the canonical raw integer ticket id (`parseTicketID`,
      // entidades_controller.go), by design — `humanId` is display-only.
      // This test was passing `humanId` here, which the CURRENT contract
      // never accepted. Fixed here to use `entity.id`.
      //
      // INC has never had a layout published inside this fresh isolated
      // stack, so its tickets always resolve via the safe,
      // zero-database-write legacy-synthesized fallback — this is the one
      // provenance value that is always true here without ever needing to
      // publish a (permanent, irreversible) layout for it.
      const resolved = await json<ResolvedDefinition>(
        await stack.isolatedRequest.get(`/entities/INC/${entity.id}/resolved-definition`),
        'resolve INC ticket definition',
      );
      expect(['legacy-synthesized', 'latest-compatible']).toContain(resolved.layoutResolution);

      // Same contract as above: `GET /tickets/{id}` (http_controller.go)
      // also canonically takes the raw integer id via `parseTicketID`.
      await expect
        .poll(
          async () => (await stack.isolatedRequest.get(`/tickets/${entity.id}`)).status(),
          { timeout: 15_000, message: 'Tickets did not project the seeded INC entity.' },
        )
        .toBe(200);

      // Same documented contract a third time, now in the frontend route:
      // api.ts:292-296 states plainly that /app/tickets/:id feeds the raw
      // integer id straight back into getTicket — humanId is display-only.
      // This test's `page.goto` call was passing humanId here — a stale
      // test assumption, not a production defect.
      await mockAuthenticatedAdmin(page, { catalogApiUrl: stack.baseUrl, sessionToken: stack.jwtToken });
      await page.goto(`/app/tickets/${entity.id}`);
      await expect(page.getByTestId('ticket-detail')).toBeVisible();

      const badge = page.getByTestId('definition-provenance');
      await expect(badge).toBeVisible();
      await expect(badge).toHaveAttribute('title', new RegExp(resolved.layoutResolution));
    } finally {
      await stack.cleanup();
    }
  });
});
