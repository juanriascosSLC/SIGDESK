import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { mockAuthenticatedAdmin } from './support';
import {
  definitionData,
  type Definition,
} from './catalog-support';

const apiBaseURL = process.env.PLAYWRIGHT_API_URL ?? 'http://127.0.0.1:8080/api/v1';
const incidentTitle = 'Playwright camera SLA validation';
const activityComment = 'Playwright verified Catalog, Tickets and SLA integration.';

interface SeededEntity {
  id: string;
  humanId: string;
}

async function seedIncident(request: APIRequestContext): Promise<SeededEntity> {
  const definitionResponse = await request.get(
    `${apiBaseURL}/entities/INC/presentation`,
  );
  expect(
    definitionResponse.ok(),
    `Could not load INC definition: ${await definitionResponse.text()}`,
  ).toBeTruthy();
  const definition = await definitionResponse.json() as Definition;
  const createResponse = await request.post(`${apiBaseURL}/entities/INC`, {
    headers: {
      'Idempotency-Key': 'playwright-inc-sla-visible-v1',
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
    },
  });
  expect(
    createResponse.ok(),
    `Could not seed INC: ${await createResponse.text()}`,
  ).toBeTruthy();
  const entity = await createResponse.json() as SeededEntity;
  expect(entity.humanId).toMatch(/^INC-/);

  await expect.poll(
    async () => (await request.get(`${apiBaseURL}/tickets/${entity.humanId}`)).status(),
    { timeout: 15_000, message: 'Tickets did not project the Catalog entity.' },
  ).toBe(200);
  await expect.poll(
    async () => (await request.get(`${apiBaseURL}/sla/assessments/${entity.id}`)).status(),
    { timeout: 15_000, message: 'SLA did not project the Catalog entity.' },
  ).toBe(200);

  const commentsResponse = await request.get(
    `${apiBaseURL}/tickets/${entity.humanId}/comments`,
  );
  expect(commentsResponse.ok()).toBeTruthy();
  const comments = await commentsResponse.json() as {
    items: Array<{ body: string }> | null;
  };
  if (!(comments.items ?? []).some((comment) => comment.body === activityComment)) {
    const commentResponse = await request.post(
      `${apiBaseURL}/tickets/${entity.humanId}/comments`,
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
  return entity;
}

test('shows the real SLA assessment and Catalog-driven incident detail', async ({
  page,
  request,
}) => {
  const entity = await seedIncident(request);
  await mockAuthenticatedAdmin(page);

  const slaResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/sla/assessments') &&
      response.status() === 200,
  );
  await page.goto('/app/tickets/list');
  await slaResponse;

  await expect(page.getByTestId('tickets-list')).toBeVisible();
  await page.getByTestId('ticket-search').fill(entity.humanId);

  const ticketRow = page.getByTestId(`ticket-row-${entity.humanId}`);
  await expect(ticketRow).toBeVisible();
  await expect(ticketRow).toContainText(incidentTitle);

  const slaChip = page.getByTestId(`sla-chip-${entity.humanId}`);
  await expect(slaChip).toBeVisible();
  await expect(slaChip).not.toHaveText(/Loading|Unavailable|No SLA/i);
  await expect(slaChip).toHaveAttribute('title', /deadline|objective/i);

  await ticketRow.click();
  await expect(page).toHaveURL(new RegExp(`/tickets/${entity.humanId}$`));
  await expect(page.getByTestId('ticket-detail')).toBeVisible();
  await expect(page.getByText(incidentTitle, { exact: true })).toBeVisible();
  await expect(page.getByText('Service Level Agreement', { exact: true })).toBeVisible();
  await expect(page.getByText('CAM-E2E-001', { exact: true }).first()).toBeVisible();
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
      /\/api\/v1\/tickets\/[^/]+\/status$/.test(new URL(response.url()).pathname) &&
      response.request().method() === 'PATCH' &&
      response.status() === 200,
  );
  await select.selectOption({ label: toLabel });
  await responsePromise;
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
  const definitionResponse = await request.get(`${apiBaseURL}/entities/INC/presentation`);
  expect(definitionResponse.ok()).toBeTruthy();
  const definition = (await definitionResponse.json()) as Definition;

  const createResponse = await request.post(`${apiBaseURL}/entities/INC`, {
    headers: { 'Idempotency-Key': `playwright-lifecycle-${randomUUID()}` },
    data: {
      data: definitionData(definition, {
        title: 'Playwright full lifecycle walk',
        description: 'Exercises open -> in_progress -> pending_review -> resolved -> closed -> open.',
        priority: 'medium',
      }),
    },
  });
  expect(createResponse.ok(), `Could not seed incident: ${await createResponse.text()}`).toBeTruthy();
  const entity = (await createResponse.json()) as { id: string; humanId: string };
  expect(entity.humanId).toMatch(/^INC-/);

  await expect
    .poll(
      async () => (await request.get(`${apiBaseURL}/tickets/${entity.humanId}`)).status(),
      { timeout: 15_000, message: 'Ticket was not projected from the catalog entity.' },
    )
    .toBe(200);

  await mockAuthenticatedAdmin(page);
  await page.goto(`/app/tickets/${entity.humanId}`);
  await expect(page.getByTestId('ticket-detail')).toBeVisible();

  const select = page.getByTestId('ticket-status-select');
  await expect(select).toHaveValue('Open');
  await expect(page.getByTestId('ticket-reopen-button')).toHaveCount(0);

  await changeStatusAndWait(page, 'In Progress');
  await changeStatusAndWait(page, 'Pending Review');
  await changeStatusAndWait(page, 'Resolved');

  // Exact destination set at Resolved: the lifecycle only declares
  // resolved->open (reopen) and resolved->closed (close) — never
  // "In Progress" or "Pending Review" again, and this must come from
  // resolvedDefinition.lifecycle, not the full KNOWN_TICKET_STATUSES list.
  expect(new Set(await statusOptionLabels(page))).toEqual(new Set(['Resolved', 'Open', 'Closed']));
  await expect(page.getByTestId('ticket-reopen-button')).toBeVisible();

  await changeStatusAndWait(page, 'Closed');

  // Round-trip check: the backend returned the raw state "closed", and the
  // UI must render it as the label "Closed" — proving statusFromApi's
  // mechanical mapping handles this new value without any special-casing.
  await expect(select).toHaveValue('Closed');

  // Exact destination set at Closed: only closed->open exists.
  expect(new Set(await statusOptionLabels(page))).toEqual(new Set(['Closed', 'Open']));
  await expect(page.getByTestId('ticket-reopen-button')).toBeVisible();

  const reopenResponsePromise = page.waitForResponse(
    (response) =>
      /\/api\/v1\/tickets\/[^/]+\/status$/.test(new URL(response.url()).pathname) &&
      response.request().method() === 'PATCH' &&
      response.status() === 200,
  );
  await page.getByTestId('ticket-reopen-button').click();
  await reopenResponsePromise;
  await expect(select).toHaveValue('Open');
  await expect(page.getByTestId('ticket-reopen-button')).toHaveCount(0);
});
