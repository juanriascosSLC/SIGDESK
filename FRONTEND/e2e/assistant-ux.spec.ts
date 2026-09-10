import { expect, test } from '@playwright/test';
import { mockAuthenticatedRequester } from './support';

test('assistant uses user-facing language and explains limited evidence', async ({ page }) => {
  await mockAuthenticatedRequester(page, { forwardUnmatched: false });
  await page.route('**/ia_advisor/chat', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      answer: 'I could not confirm the approval owner.', rag_available: true,
      sources: [{ type: 'articulo', id: 'KB-000002', score: 0.81 }],
      confidence: { level: 'low', reasons: ['single_relevant_source'] },
    }),
  }));
  await page.goto('/portal');
  await page.getByRole('button', { name: 'Open SIG Assistant' }).click();
  await expect(page.getByText('Knowledge assistant')).toBeVisible();
  await expect(page.getByText(/permitted to view/i)).toBeVisible();
  await expect(page.getByText('RAG system')).toHaveCount(0);
  await page.getByPlaceholder('Ask a question…').fill('Who approves KB-000002?');
  await page.getByRole('button', { name: 'Send question' }).click();
  await expect(page.getByText('References:')).toBeVisible();
  await expect(page.getByText(/Needs verification/i)).toBeVisible();
});

test('assistant distinguishes an unavailable knowledge search from an answer', async ({ page }) => {
  await mockAuthenticatedRequester(page, { forwardUnmatched: false });
  await page.route('**/ia_advisor/chat', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ answer: 'Please try again later.', rag_available: false, sources: [] }),
  }));
  await page.goto('/portal');
  await page.getByRole('button', { name: 'Open SIG Assistant' }).click();
  await page.getByPlaceholder('Ask a question…').fill('Where is the shipping procedure?');
  await page.getByRole('button', { name: 'Send question' }).click();
  await expect(page.getByRole('status')).toContainText('Knowledge search is temporarily unavailable');
});

test('assistant renders supported Markdown as a readable procedure', async ({ page }) => {
  await mockAuthenticatedRequester(page, { forwardUnmatched: false });
  await page.route('**/ia_advisor/chat', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      answer: '## Shipping procedure\n1. **Review the purchasing ticket** [FUENTE 1]\n2. **Record the tracking number** [FUENTE 1]',
      rag_available: true, sources: [{ type: 'articulo', id: '3:1', score: 0.81 }],
    }),
  }));
  await page.goto('/portal');
  await page.getByRole('button', { name: 'Open SIG Assistant' }).click();
  await page.getByRole('textbox').fill('How do I ship equipment?');
  await page.getByRole('button', { name: 'Send question' }).click();
  await expect(page.getByRole('heading', { name: 'Shipping procedure' })).toBeVisible();
  await expect(page.locator('strong', { hasText: 'Review the purchasing ticket' })).toBeVisible();
  await expect(page.getByText('[FUENTE 1]').first()).toBeVisible();
});
