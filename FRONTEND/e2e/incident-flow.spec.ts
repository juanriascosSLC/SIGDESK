import { expect, test, type APIRequestContext } from '@playwright/test';
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
