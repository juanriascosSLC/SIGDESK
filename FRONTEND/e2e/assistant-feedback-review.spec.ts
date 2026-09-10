import { expect, test } from '@playwright/test';
import { mockAuthenticatedAdmin } from './support';

test('a reviewer promotes feedback only with an expected answer and sources', async ({ page }) => {
  await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
  await page.route('**/ia_advisor/admin/feedback?status=open', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [{ id: 'feedback-1', rating: 'not_useful', status: 'open', question: 'How do I create a request?', answer: 'Try the catalog.', sources: [{ type: 'articulo', id: '5:1' }], created_at: '2026-09-09T00:00:00Z' }] }) }));
  await page.route('**/ia_advisor/admin/feedback/metrics', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ useful: 3, not_useful: 1, open: 1, promoted: 0 }) }));
  const updates: Record<string, unknown>[] = [];
  await page.route('**/ia_advisor/admin/feedback/feedback-1', (route) => { updates.push(JSON.parse(route.request().postData() ?? '{}')); return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'feedback-1', status: 'reviewed' }) }); });

  await page.goto('/app/admin/assistant-feedback');
  await page.getByText('How do I create a request?').click();
  await page.getByLabel(/Promote to offline evaluation/i).check();
  await page.getByRole('button', { name: 'Mark reviewed' }).click();
  await expect(page.getByRole('alert')).toContainText('respuesta y al menos una fuente');

  await page.getByRole('textbox', { name: 'Expected answer' }).fill('Open Service Catalog and choose the request type.');
  await page.getByRole('button', { name: 'Mark reviewed' }).click();
  await expect.poll(() => updates.length).toBe(1);
  expect(updates[0]).toMatchObject({ promote_to_evaluation: true, expected_answer: 'Open Service Catalog and choose the request type.', expected_sources: [{ type: 'articulo', id: '5:1' }] });
});
