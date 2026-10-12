import { expect, test, type Page } from '@playwright/test';
import { mockAuthenticatedAdmin } from './support';

const draft = {
  id: 41,
  familyKey: 'services_field_work',
  version: 2,
  status: 'draft',
  workType: 'field_work_order',
  definition: {
    title: 'Field Work Order',
    summary: 'Execute approved field work.',
    instructions: ['Review the approved RFC.'],
    fields: [
      { key: 'work_notes', label: 'Work performed', type: 'textarea', required: true, multiple: true, options: [] },
      { key: 'evidence', label: 'Completion evidence', type: 'attachment', required: true, multiple: true, evidence: true, options: [] },
    ],
    outcomes: [{ code: 'work_completed', label: 'Work completed', description: '', requiredFields: ['work_notes', 'evidence'] }],
    sections: [{ id: 'execution', title: 'Execution record', description: '', fieldKeys: ['work_notes', 'evidence'] }],
  },
  createdBy: 'admin',
  createdAt: '2026-10-09T12:00:00Z',
  updatedAt: '2026-10-09T12:00:00Z',
};

async function stubTaskTemplates(page: Page) {
  const calls: Array<{ method: string; url: string; body: unknown }> = [];
  await page.route('**/change-task-templates**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const body = request.postDataJSON?.() ?? undefined;
    calls.push({ method: request.method(), url: url.pathname, body });
    if (request.method() === 'GET') return route.fulfill({ json: { items: [draft] } });
    if (url.pathname.endsWith('/validate')) return route.fulfill({ json: { valid: true, issues: [], template: draft } });
    if (url.pathname.endsWith('/publish')) return route.fulfill({ json: { ...draft, status: 'published', publishedAt: '2026-10-09T13:00:00Z' } });
    return route.fulfill({ json: { ...draft, definition: (body as { definition?: unknown })?.definition ?? draft.definition, updatedAt: '2026-10-09T12:01:00Z' } });
  });
  return calls;
}

test('administrator designs, validates and explicitly publishes a versioned task experience', async ({ page }) => {
  await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
  const calls = await stubTaskTemplates(page);
  await page.goto('/app/admin/task-experience');

  await expect(page.getByRole('heading', { name: 'Task Experience Builder' })).toBeVisible();
  await expect(page.getByTestId('task-template-preview')).toContainText('Field Work Order');
  const title = page.getByLabel('Display name');
  await title.fill('Professional Field Work Order');
  await expect(page.getByTestId('task-template-preview')).toContainText('Professional Field Work Order');

  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect.poll(() => calls.some((call) => call.method === 'PATCH')).toBe(true);
  await page.getByRole('button', { name: 'Validate' }).click();
  await expect(page.getByRole('status')).toContainText('satisfies the controlled task contract');

  await page.getByRole('button', { name: 'Review & publish' }).click();
  await expect(page.getByRole('dialog')).toContainText('Existing tasks keep their current behavior');
  await page.getByRole('button', { name: 'Publish version' }).click();
  await expect.poll(() => calls.some((call) => call.url.endsWith('/publish'))).toBe(true);
});

test('administrator builds structured task sections, choice fields and operator guidance', async ({ page }) => {
  await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
  const calls = await stubTaskTemplates(page);
  await page.goto('/app/admin/task-experience');

  await page.getByTestId('task-template-add-section').click();
  const section = page.getByTestId('task-template-section-section_2');
  await section.getByLabel('Section title').fill('Parts and logistics');
  await section.getByLabel('Description').fill('Document the material decision and evidence.');
  await section.getByRole('button', { name: 'Add field' }).click();
  await section.getByLabel('Field label').fill('Parts decision');
  await section.getByLabel('Input type').selectOption('select');
  await section.getByLabel('Placeholder').fill('Choose a controlled outcome');
  await section.getByRole('button', { name: 'Add choice' }).click();
  await section.getByRole('button', { name: 'Add choice' }).click();
  const choices = section.getByLabel(/^Choices /);
  await choices.nth(0).fill('Required');
  await choices.nth(1).fill('Not required');

  await expect(page.getByTestId('task-template-preview')).toContainText('Parts and logistics');
  await expect(page.getByTestId('task-template-preview')).toContainText('Parts decision');
  await page.getByRole('button', { name: 'Save draft' }).click();

  await expect.poll(() => calls.filter((call) => call.method === 'PATCH').length).toBe(1);
  const saved = calls.find((call) => call.method === 'PATCH')?.body as { definition: typeof draft.definition };
  expect(saved.definition.sections.at(-1)?.title).toBe('Parts and logistics');
  expect(saved.definition.fields.at(-1)).toMatchObject({
    label: 'Parts decision',
    type: 'select',
    placeholder: 'Choose a controlled outcome',
    options: ['Required', 'Not required'],
  });
});
