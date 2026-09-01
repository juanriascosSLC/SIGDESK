import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { mockAuthenticatedAdmin, SIG_DESK_API_BASE } from './support';
import {
  definitionData,
  type Definition,
} from './catalog-support';

const apiBaseURL = SIG_DESK_API_BASE;
const incidentTitle = 'Playwright camera SLA validation';
const activityComment = 'Playwright verified Catalog, Tickets and SLA integration.';

interface SeededEntity {
  id: string;
  humanId: string;
  siteDisplayName?: string;
}

async function creationBindings(request: APIRequestContext) {
  const sitesResponse = await request.get(`${apiBaseURL}/assets/sites?limit=1`);
  expect(sitesResponse.ok(), `Could not load a CMDB site: ${await sitesResponse.text()}`).toBeTruthy();
  const sites = await sitesResponse.json() as { items?: Array<{ id: string; displayName?: string }> };
  const recursoId = sites.items?.[0]?.id;
  expect(recursoId, 'At least one synchronized CMDB site is required').toBeTruthy();

  const agentsResponse = await request.get(`${apiBaseURL}/agentes_it`);
  expect(agentsResponse.ok(), `Could not load IT agents: ${await agentsResponse.text()}`).toBeTruthy();
  const rawAgents = await agentsResponse.json() as Array<{ id: string }> | { items?: Array<{ id: string }> };
  const agents = Array.isArray(rawAgents) ? rawAgents : rawAgents.items ?? [];
  return { recursoId: recursoId!, siteDisplayName: sites.items?.[0]?.displayName, agenteItId: agents[0]?.id };
}

async function seedIncident(request: APIRequestContext): Promise<SeededEntity> {
  const definitionResponse = await request.get(
    `${apiBaseURL}/catalog/definitions/INC`,
  );
  expect(
    definitionResponse.ok(),
    `Could not load INC definition: ${await definitionResponse.text()}`,
  ).toBeTruthy();
  const definition = await definitionResponse.json() as Definition;
  const binding = await creationBindings(request);
  const createResponse = await request.post(`${apiBaseURL}/entities/INC`, {
    headers: {
      'Idempotency-Key': `playwright-inc-sla-${randomUUID()}`,
    },
    data: {
      data: definitionData(definition, {
        title: incidentTitle,
        description: 'A deterministic incident used by the browser integration suite.',
        priority: 'critical',
        category: 'hardware',
        deviceType: 'camera',
        assetId: 'CAM-E2E-001',
        deviceModel: 'DS-2CD2043',
        cameraChannel: 1,
      }),
      recursoId: binding.recursoId,
      agenteItId: binding.agenteItId,
      assetContext: { siteAssetId: binding.recursoId, links: [] },
    },
  });
  expect(
    createResponse.ok(),
    `Could not seed INC: ${await createResponse.text()}`,
  ).toBeTruthy();
  const entity = await createResponse.json() as SeededEntity;
  expect(entity.humanId).toMatch(/^INC-/);

  await expect.poll(
    async () => (await request.get(`${apiBaseURL}/tickets/${entity.id}`)).status(),
    { timeout: 15_000, message: 'Tickets did not project the Catalog entity.' },
  ).toBe(200);
  await expect.poll(
    async () => (await request.get(`${apiBaseURL}/sla/assessments/${entity.id}`)).status(),
    { timeout: 15_000, message: 'SLA did not project the Catalog entity.' },
  ).toBe(200);

  const commentsResponse = await request.get(
    `${apiBaseURL}/tickets/${entity.id}/comments`,
  );
  expect(commentsResponse.ok()).toBeTruthy();
  const comments = await commentsResponse.json() as {
    items: Array<{ body: string }> | null;
  };
  if (!(comments.items ?? []).some((comment) => comment.body === activityComment)) {
    const commentResponse = await request.post(
      `${apiBaseURL}/tickets/${entity.id}/comments`,
      {
        data: {
          authorName: 'Playwright Admin',
          body: activityComment,
          isInternal: false,
        },
      },
    );
    expect(
      commentResponse.ok(),
      `Could not seed activity: ${await commentResponse.text()}`,
    ).toBeTruthy();
  }
  return { ...entity, siteDisplayName: binding.siteDisplayName };
}

test('shows the real SLA assessment and Catalog-driven incident detail', async ({
  page,
  request,
}) => {
  const entity = await seedIncident(request);
  await mockAuthenticatedAdmin(page);

  const slaResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/sla/assessments') &&
      response.status() === 200,
  );
  await page.goto('/app/tickets/list');
  await slaResponse;

  await expect(page.getByTestId('tickets-list')).toBeVisible();
  await page.getByTestId('ticket-search').fill(entity.humanId);

  const ticketRow = page.getByTestId(`ticket-row-${entity.id}`);
  await expect(ticketRow).toBeVisible();
  await expect(ticketRow).toContainText(incidentTitle);

  const slaChip = page.getByTestId(`sla-chip-${entity.id}`);
  await expect(slaChip).toBeVisible();
  await expect(slaChip).not.toHaveText(/Loading|Unavailable|No SLA/i);
  await expect(slaChip).toHaveAttribute('title', /deadline|objective/i);

  await ticketRow.click();
  await expect(page).toHaveURL(new RegExp(`/tickets/${entity.id}$`));
  await expect(page.getByTestId('ticket-detail')).toBeVisible();
  await expect(page.getByText(incidentTitle, { exact: true })).toBeVisible();
  await expect(page.getByText('Service Level Agreement', { exact: true })).toBeVisible();
  await expect(page.getByText('Activos relacionados', { exact: true })).toBeVisible();
  if (entity.siteDisplayName) {
    await expect(page.getByText(entity.siteDisplayName, { exact: true }).first()).toBeVisible();
  }
  await expect(page.getByText(activityComment, { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Could not display this screen')).toHaveCount(0);
});

// The status select shows the ticket's own status as one of the options
// (see TicketDetail.tsx's statusOptions), so the "current" value is always
// present alongside the real transition destinations. This walk checks the
// full option set at Resolved/Closed against exactly what the historical
// lifecycle allows from that state, not just "does it contain Closed".
async function statusOptionLabels(page: Page): Promise<string[]> {
  const select = page.getByTestId('ticket-status-select');
  return select.locator('option').allTextContents();
}

async function changeStatusAndWait(page: Page, toLabel: string) {
  const select = page.getByTestId('ticket-status-select');
  const responsePromise = page.waitForResponse(
    (response) =>
      /\/entities\/INC\/[^/]+\/transitions\/[^/]+$/.test(new URL(response.url()).pathname) &&
      response.request().method() === 'POST',
  );
  await select.selectOption({ label: toLabel });
  const response = await responsePromise;
  expect(response.ok(), `Transition to ${toLabel} failed (${response.status()}): ${await response.text()}`).toBeTruthy();
  await expect(select).toHaveValue(toLabel);
}

test('an incident walks its full historical lifecycle: open -> in progress -> pending review -> resolved -> closed -> open', async ({
  page,
  request,
}) => {
  // Self-sufficient: this incident is created fresh by this test run, with a
  // unique Idempotency-Key, so it never depends on cmd/seeddemo, a fixed id,
  // the order other specs ran in, or anything left over from a previous run.
  // Once this PR seeds INC v3 at API startup, any new incident is
  // automatically bound to it — no version needs to be pinned explicitly.
  const definitionResponse = await request.get(`${apiBaseURL}/catalog/definitions/INC`);
  expect(definitionResponse.ok()).toBeTruthy();
  const definition = (await definitionResponse.json()) as Definition;
  const binding = await creationBindings(request);

  const createResponse = await request.post(`${apiBaseURL}/entities/INC`, {
    headers: { 'Idempotency-Key': `playwright-lifecycle-${randomUUID()}` },
    data: {
      data: definitionData(definition, {
        title: 'Playwright full lifecycle walk',
        description: 'Exercises open -> in_progress -> pending_review -> resolved -> closed -> open.',
        priority: 'medium',
      }),
      recursoId: binding.recursoId,
      assetContext: { siteAssetId: binding.recursoId, links: [] },
    },
  });
  expect(createResponse.ok(), `Could not seed incident: ${await createResponse.text()}`).toBeTruthy();
  const entity = (await createResponse.json()) as { id: string; humanId: string };
  expect(entity.humanId).toMatch(/^INC-/);

  await expect
    .poll(
      async () => (await request.get(`${apiBaseURL}/tickets/${entity.id}`)).status(),
      { timeout: 15_000, message: 'Ticket was not projected from the catalog entity.' },
    )
    .toBe(200);

  await mockAuthenticatedAdmin(page);
  await page.goto(`/app/tickets/${entity.id}`);
  await expect(page.getByTestId('ticket-detail')).toBeVisible();

  const select = page.getByTestId('ticket-status-select');
  await expect(select).toHaveValue('Open');
  await expect(page.getByTestId('ticket-reopen-button')).toHaveCount(0);

  expect(binding.agenteItId, 'The lifecycle needs an IT agent for the initial assignment').toBeTruthy();
  page.once('dialog', (dialog) => dialog.accept(binding.agenteItId));
  await changeStatusAndWait(page, 'In Progress');
  await changeStatusAndWait(page, 'Pending Review');
  await changeStatusAndWait(page, 'In Progress');
  await changeStatusAndWait(page, 'Resolved');

  // Exact destination set at Resolved: the lifecycle only declares
  // resolved->open (reopen) and resolved->closed (close) — never
  // "In Progress" or "Pending Review" again, and this must come from
  // resolvedDefinition.lifecycle, not the full KNOWN_TICKET_STATUSES list.
  expect(new Set(await statusOptionLabels(page))).toEqual(new Set(['Resolved', 'Closed']));
  await expect(page.getByTestId('ticket-reopen-button')).toHaveCount(0);

  await changeStatusAndWait(page, 'Closed');

  // Round-trip check: the backend returned the raw state "closed", and the
  // UI must render it as the label "Closed" — proving statusFromApi's
  // mechanical mapping handles this new value without any special-casing.
  await expect(select).toHaveValue('Closed');

  // Exact destination set at Closed: la definición activa reabre directo a trabajo.
  expect(new Set(await statusOptionLabels(page))).toEqual(new Set(['Closed', 'In Progress']));
  await expect(page.getByTestId('ticket-reopen-button')).toBeVisible();

  const reopenResponsePromise = page.waitForResponse(
    (response) =>
      /\/entities\/INC\/[^/]+\/transitions\/[^/]+$/.test(new URL(response.url()).pathname) &&
      response.request().method() === 'POST',
  );
  page.once('dialog', (dialog) => dialog.accept('Validación E2E de reapertura'));
  await page.getByTestId('ticket-reopen-button').click();
  await reopenResponsePromise;
  await expect(select).toHaveValue('In Progress');
  await expect(page.getByTestId('ticket-reopen-button')).toHaveCount(0);
});

test('keeps initial assignment and persists comments, attachments and merged incidents', async ({
  page,
  request,
}) => {
  const definitionResponse = await request.get(`${apiBaseURL}/catalog/definitions/INC`);
  expect(definitionResponse.ok()).toBeTruthy();
  const definition = (await definitionResponse.json()) as Definition;
  const binding = await creationBindings(request);
  expect(binding.agenteItId, 'An IT agent is required to verify initial assignment').toBeTruthy();

  const create = async (title: string, idempotencyKey: string) => {
    const response = await request.post(`${apiBaseURL}/entities/INC`, {
      headers: { 'Idempotency-Key': idempotencyKey },
      data: {
        data: definitionData(definition, {
          title,
          description: 'Live collaboration and persistence acceptance incident.',
          priority: 'high',
        }),
        recursoId: binding.recursoId,
        agenteItId: binding.agenteItId,
        assetContext: { siteAssetId: binding.recursoId, links: [] },
      },
    });
    expect(response.ok(), `Could not create ${title}: ${await response.text()}`).toBeTruthy();
    return response.json() as Promise<{ id: string; humanId: string; primerResponsableId?: string }>;
  };

  const idempotencyKey = `playwright-collaboration-${randomUUID()}`;
  const primary = await create('Playwright primary incident for merge', idempotencyKey);
  const replay = await create('This replay must not create another incident', idempotencyKey);
  expect(replay.id).toBe(primary.id);
  const secondary = await create(
    'Playwright secondary incident for merge',
    `playwright-collaboration-secondary-${randomUUID()}`,
  );

  await expect.poll(
    async () => (await request.get(`${apiBaseURL}/entities/INC/${primary.id}`)).status(),
    { timeout: 15_000 },
  ).toBe(200);

  const persistedPrimary = await (
    await request.get(`${apiBaseURL}/entities/INC/${primary.id}`)
  ).json() as { primerResponsableId?: string; agenteItId?: string };
  expect(persistedPrimary.primerResponsableId).toBe(binding.agenteItId);

  const commentBody = `Persistent collaboration comment ${randomUUID()}`;
  const commentResponse = await request.post(`${apiBaseURL}/tickets/${primary.id}/comments`, {
    data: { body: commentBody, isInternal: false },
  });
  expect(commentResponse.ok(), await commentResponse.text()).toBeTruthy();

  const attachmentName = `evidence-${randomUUID()}.txt`;
  const attachmentBody = 'SIG-DESK beta acceptance evidence';
  const attachmentResponse = await request.post(
    `${apiBaseURL}/tickets/${primary.id}/attachments`,
    {
      multipart: {
        file: {
          name: attachmentName,
          mimeType: 'text/plain',
          buffer: Buffer.from(attachmentBody),
        },
      },
    },
  );
  expect(attachmentResponse.ok(), await attachmentResponse.text()).toBeTruthy();
  const attachment = await attachmentResponse.json() as { id: string; fileName: string };
  expect(attachment.fileName).toBe(attachmentName);
  const download = await request.get(`${apiBaseURL}/attachments/${attachment.id}/download`);
  expect(download.ok()).toBeTruthy();
  expect(await download.text()).toBe(attachmentBody);

  const mergeResponse = await request.post(`${apiBaseURL}/tickets/${primary.id}/merge`, {
    data: { mergedIds: [secondary.id] },
  });
  expect(mergeResponse.ok(), await mergeResponse.text()).toBeTruthy();

  await expect.poll(async () => {
    const response = await request.get(`${apiBaseURL}/entities/INC/${primary.id}`);
    const ticket = await response.json() as { mergedCount?: number };
    return ticket.mergedCount;
  }).toBe(1);
  const mergedSource = await (
    await request.get(`${apiBaseURL}/entities/INC/${secondary.id}`)
  ).json() as { mergedIntoId?: string | null };
  expect(mergedSource.mergedIntoId).toBe(primary.id);

  await mockAuthenticatedAdmin(page);
  await page.goto(`/app/tickets/${primary.id}`);
  await expect(page.getByTestId('ticket-detail')).toBeVisible();
  await expect(page.getByText(binding.agenteItId!, { exact: true }).first()).toBeVisible();
  await expect(page.getByText(commentBody, { exact: true }).first()).toBeVisible();
  await expect(page.getByText(attachmentName, { exact: true })).toBeVisible();
  await expect(page.getByText('Tickets combinados en', { exact: false })).toBeVisible();
  await expect(page.getByText('Playwright secondary incident for merge', { exact: true })).toBeVisible();
});
