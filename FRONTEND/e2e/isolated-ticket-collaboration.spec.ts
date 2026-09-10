import * as fs from 'node:fs';
import * as os from 'node:os';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { test, expect, type APIRequestContext } from '@playwright/test';
import { startIsolatedCatalogStack } from './isolated-catalog-stack';
import { mockAuthenticatedAdmin } from './support';
import { definitionData, type Definition } from './catalog-support';

/**
 * Ticket identity presentation, item 6 (E2E data hygiene): the live
 * ticket/comment/attachment/merge collaboration flow used to run directly
 * against the SHARED local stack (sigdesk_tickets_local via the Kong
 * gateway) with no cleanup at all — every run left a permanent primary +
 * secondary incident, a comment and an attachment behind. This file
 * replaces that with the SAME isolated-per-run stack already proven by
 * isolated-catalog-failure.spec.ts: a disposable `sigdesk_tickets_e2e_*`
 * database that is dropped in `finally`, regardless of whether the test's
 * own assertions pass or fail — never the shared database.
 *
 * `assertNoNewResidue` is the same baseline-diff check
 * isolated-catalog-failure.spec.ts already uses: it tolerates concurrent
 * runs' own legitimate resources and only fails on what THIS test leaves
 * behind. Because cleanup here is "drop the one disposable database", it
 * covers the ticket, its comment, its attachment and the merge relationship
 * in a single guaranteed step — there is no separate per-record ownership
 * token to track.
 */

function snapshotEphemeralDatabases(): string[] {
  const out = execFileSync(
    'docker',
    ['exec', '-i', 'backend-postgres-1', 'psql', '-U', 'sigdesk', '-d', 'postgres', '-t', '-A', '-c',
      "SELECT datname FROM pg_database WHERE datname LIKE 'sigdesk_tickets_e2e_%';"],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  )
    .toString()
    .trim();
  return out ? out.split(/\r?\n/).filter(Boolean) : [];
}

function snapshotPortFiles(): string[] {
  return fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith('sigdesk_e2e_port_'));
}

function snapshotE2EProcessPids(): string[] {
  try {
    const out = execFileSync(
      'tasklist',
      ['/FI', 'IMAGENAME eq e2e_tickets_service.exe', '/FO', 'CSV', '/NH'],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    )
      .toString()
      .trim();
    if (!out || out.toLowerCase().includes('no tasks')) return [];
    return out
      .split(/\r?\n/)
      .map((line) => line.split('","').map((c) => c.replace(/^"|"$/g, ''))[1] ?? '')
      .filter(Boolean);
  } catch {
    return [];
  }
}

type ResidueSnapshot = { databases: string[]; portFiles: string[]; pids: string[] };

function snapshotResidue(): ResidueSnapshot {
  return { databases: snapshotEphemeralDatabases(), portFiles: snapshotPortFiles(), pids: snapshotE2EProcessPids() };
}

function assertNoNewResidue(before: ResidueSnapshot): void {
  const after = snapshotResidue();
  const newDatabases = after.databases.filter((d) => !before.databases.includes(d));
  const newPortFiles = after.portFiles.filter((f) => !before.portFiles.includes(f));
  const newPids = after.pids.filter((p) => !before.pids.includes(p));
  expect(newDatabases, `New disposable databases left behind: ${newDatabases.join(', ') || '(none)'}`).toEqual([]);
  expect(newPortFiles, `New port files left behind: ${newPortFiles.join(', ') || '(none)'}`).toEqual([]);
  expect(newPids, `New e2e_tickets_service.exe PIDs left behind: ${newPids.join(', ') || '(none)'}`).toEqual([]);
}

async function jsonOrFailure<T>(response: { ok(): boolean; status(): number; text(): Promise<string>; json(): Promise<unknown> }, operation: string): Promise<T> {
  expect(response.ok(), `${operation} failed (${response.status()}): ${await response.text()}`).toBeTruthy();
  return response.json() as Promise<T>;
}

async function getIncDefinition(isolatedRequest: APIRequestContext): Promise<Definition> {
  return jsonOrFailure<Definition>(await isolatedRequest.get('/catalog/definitions/INC'), 'load isolated INC definition');
}

/** Sites are a shared, read-only dependency (resource_service via the Kong
 *  gateway) — never isolated per run, same as every other isolated-stack
 *  spec. Only a `recursoId` is fetched here; nothing is created or mutated
 *  against the shared stack. */
async function sharedSiteRecursoId(request: APIRequestContext): Promise<string> {
  const response = await request.get(`${process.env.PLAYWRIGHT_API_URL ?? 'http://127.0.0.1:8000'}/assets/sites?limit=1`);
  const body = await jsonOrFailure<{ items?: Array<{ id: string }> }>(response, 'load one shared CMDB site');
  const recursoId = body.items?.[0]?.id;
  expect(recursoId, 'At least one synchronized CMDB site is required').toBeTruthy();
  return recursoId!;
}

test.describe('Isolated ticket collaboration (identity presentation, no shared-DB residue)', () => {
  test('keeps initial requester identity and persists comments, attachments and merged incidents — with guaranteed cleanup', async ({ page, request }) => {
    const before = snapshotResidue();
    const recursoId = await sharedSiteRecursoId(request);
    const stack = await startIsolatedCatalogStack({ actorNombre: 'Playwright Requester' });
    try {
      const definition = await getIncDefinition(stack.isolatedRequest);

      const create = async (title: string, idempotencyKey: string) => {
        const response = await stack.isolatedRequest.post('/entities/INC', {
          headers: { 'Idempotency-Key': idempotencyKey },
          data: {
            data: definitionData(definition, {
              title,
              description: 'Isolated collaboration and persistence acceptance incident.',
              priority: 'high',
            }),
            recursoId,
            assetContext: { siteAssetId: recursoId, links: [] },
          },
        });
        return jsonOrFailure<{ id: string; humanId: string; creadorNombre?: string }>(response, `create ${title}`);
      };

      const idempotencyKey = `playwright-isolated-collab-${randomUUID()}`;
      const primary = await create('Playwright primary incident for merge (isolated)', idempotencyKey);
      // A reintento con la MISMA Idempotency-Key debe devolver el ticket
      // original, no un duplicado.
      const replay = await create('This replay must not create another incident', idempotencyKey);
      expect(replay.id).toBe(primary.id);
      const secondary = await create('Playwright secondary incident for merge (isolated)', `playwright-isolated-collab-secondary-${randomUUID()}`);

      // Ticket identity presentation: the requester's real name, snapshotted
      // from the JWT `nombre` claim at creation — never a raw UUID.
      expect(primary.creadorNombre).toBe('Playwright Requester');

      const commentBody = `Persistent isolated collaboration comment ${randomUUID()}`;
      await jsonOrFailure(
        await stack.isolatedRequest.post(`/tickets/${primary.id}/comments`, { data: { body: commentBody, isInternal: false } }),
        'add comment',
      );

      const attachmentName = `evidence-${randomUUID()}.txt`;
      const attachmentBody = 'SIG-DESK isolated acceptance evidence';
      const attachmentResponse = await stack.isolatedRequest.post(`/tickets/${primary.id}/attachments`, {
        multipart: { file: { name: attachmentName, mimeType: 'text/plain', buffer: Buffer.from(attachmentBody) } },
      });
      const attachment = await jsonOrFailure<{ id: string; fileName: string }>(attachmentResponse, 'upload attachment');
      expect(attachment.fileName).toBe(attachmentName);
      const download = await stack.isolatedRequest.get(`/attachments/${attachment.id}/download`);
      expect(download.ok()).toBeTruthy();
      expect(await download.text()).toBe(attachmentBody);

      // 204 No Content — never parsed as JSON (POST /tickets/{id}/merge,
      // collaboration_controller.go).
      const mergeResponse = await stack.isolatedRequest.post(`/tickets/${primary.id}/merge`, { data: { mergedIds: [secondary.id] } });
      expect(mergeResponse.ok(), `merge secondary into primary failed (${mergeResponse.status()}): ${await mergeResponse.text()}`).toBeTruthy();

      await expect.poll(async () => {
        const response = await stack.isolatedRequest.get(`/entities/INC/${primary.id}`);
        const ticket = await response.json() as { mergedCount?: number };
        return ticket.mergedCount;
      }).toBe(1);
      const mergedSource = await jsonOrFailure<{ mergedIntoId?: string | null }>(
        await stack.isolatedRequest.get(`/entities/INC/${secondary.id}`),
        'load merged secondary',
      );
      expect(mergedSource.mergedIntoId).toBe(primary.id);

      await mockAuthenticatedAdmin(page, { catalogApiUrl: stack.baseUrl, sessionToken: stack.jwtToken });
      await page.goto(`/app/tickets/${primary.id}`);
      await expect(page.getByTestId('ticket-detail')).toBeVisible();
      // Same proof as the shared-stack version: the real name is shown, and
      // it is never accompanied by the raw actor UUID as a label.
      await expect(page.getByText('Playwright Requester', { exact: true }).first()).toBeVisible();
      await expect(page.getByText(commentBody, { exact: true }).first()).toBeVisible();
      await expect(page.getByText(attachmentName, { exact: true })).toBeVisible();
      await expect(page.getByText('Tickets combinados en', { exact: false })).toBeVisible();
      await expect(page.getByText('Playwright secondary incident for merge (isolated)', { exact: true })).toBeVisible();
    } finally {
      await stack.cleanup();
    }
    assertNoNewResidue(before);
  });

  // The failure-path proof item 6 explicitly asks for: an assertion failing
  // partway through the collaboration flow must not skip cleanup. This
  // deliberately fails on a wrong expectation (a comment body that was
  // never posted) AFTER real residue-producing work (ticket + attachment)
  // already happened, then proves the disposable database is still gone.
  test('cleans up the disposable database even when a mid-test assertion fails', async ({ page, request }) => {
    const before = snapshotResidue();
    const recursoId = await sharedSiteRecursoId(request);
    let thrown = false;
    try {
      const stack = await startIsolatedCatalogStack({ actorNombre: 'Playwright Requester' });
      try {
        const definition = await getIncDefinition(stack.isolatedRequest);
        const created = await jsonOrFailure<{ id: string }>(
          await stack.isolatedRequest.post('/entities/INC', {
            headers: { 'Idempotency-Key': `playwright-isolated-collab-failure-${randomUUID()}` },
            data: {
              data: definitionData(definition, { title: 'Isolated failure-path incident', description: 'Must not survive.', priority: 'high' }),
              recursoId,
              assetContext: { siteAssetId: recursoId, links: [] },
            },
          }),
          'create failure-path incident',
        );
        await jsonOrFailure(
          await stack.isolatedRequest.post(`/tickets/${created.id}/attachments`, {
            multipart: { file: { name: 'residue-check.txt', mimeType: 'text/plain', buffer: Buffer.from('should never survive this test') } },
          }),
          'upload attachment before the deliberate failure',
        );

        await mockAuthenticatedAdmin(page, { catalogApiUrl: stack.baseUrl, sessionToken: stack.jwtToken });
        await page.goto(`/app/tickets/${created.id}`);
        await expect(page.getByTestId('ticket-detail')).toBeVisible();
        // Deliberate failure: this text was never posted to the ticket.
        await expect(page.getByText('this comment was never actually posted', { exact: true })).toBeVisible({ timeout: 2_000 });
      } finally {
        await stack.cleanup();
      }
    } catch (err) {
      thrown = true;
      expect((err as Error).message).toMatch(/this comment was never actually posted/);
    }
    expect(thrown, 'the deliberate assertion failure must have actually thrown').toBe(true);
    assertNoNewResidue(before);
  });
});
