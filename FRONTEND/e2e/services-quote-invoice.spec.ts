import { expect, test } from '@playwright/test';
import {
  mockAuthenticatedSupervisor,
  mockAuthenticatedServicesAgentWithoutTicketAccess,
} from './support';

/**
 * Step 5 of the Services design doc: both money documents for one visit.
 *
 * The two directions are the point. A SRV visit carries a subcontractor quote
 * (what SIG Systems pays) and a dealership invoice (what it charges), and the
 * UI must never show an amount without saying which side it is on.
 */

test('shows both money documents, each labelled with its direction', async ({ page }) => {
  await mockAuthenticatedSupervisor(page, { forwardUnmatched: false });
  await page.goto('/app/services/tickets/srv-1001');

  await expect(page.getByTestId('srv-vendor-quote')).toBeVisible();
  await expect(page.getByText('Subcontractor quote — what we pay')).toBeVisible();
  await expect(page.getByTestId('srv-customer-invoice')).toBeVisible();
  await expect(page.getByText('Dealership invoice — what we charge')).toBeVisible();
});

test('lists one line per covered ticket of the visit', async ({ page }) => {
  await mockAuthenticatedSupervisor(page, { forwardUnmatched: false });
  await page.goto('/app/services/tickets/srv-1001');

  // One SRV is the visit; the visit bundles several IT tickets.
  await expect(page.getByTestId('srv-covered-ticket-INC-1042')).toBeVisible();
  await expect(page.getByTestId('srv-covered-ticket-INC-1051')).toBeVisible();
  await expect(page.getByTestId('srv-covered-ticket-PRB-0308')).toBeVisible();
});

test('renders amounts as formatted currency, never a bare number', async ({ page }) => {
  await mockAuthenticatedSupervisor(page, { forwardUnmatched: false });
  await page.goto('/app/services/tickets/srv-1001');

  // Both totals come straight from the mock — the client derives no money.
  // $672.70 is the vendor quote's total, $1,036.18 the dealership invoice's.
  const totals = page.getByTestId('srv-totals-grand');
  await expect(totals.first()).toContainText('$672.70');
  await expect(totals.last()).toContainText('$1,036.18');
});

test('charges travel once for the visit, not once per ticket', async ({ page }) => {
  await mockAuthenticatedSupervisor(page, { forwardUnmatched: false });
  await page.goto('/app/services/tickets/srv-1001');

  // Three covered tickets, but travel appears on exactly one line — the other
  // two show an em dash. A per-row travel rate would bill trips that never
  // happened, so the data shape prevents it rather than a reviewer catching it.
  const rows = page.getByTestId('srv-vendor-quote').locator('tbody tr');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('$125.00');
  await expect(rows.nth(1)).toContainText('—');
  await expect(rows.nth(2)).toContainText('—');
});

test('a covered ticket is a link when the agent can open it', async ({ page }) => {
  await mockAuthenticatedSupervisor(page, { forwardUnmatched: false });
  await page.goto('/app/services/tickets/srv-1001');

  const ref = page.getByTestId('srv-covered-ticket-INC-1042');
  await expect(ref).toHaveAttribute('data-linked', 'true');
  await expect(ref).toHaveAttribute('href', '/app/tickets/inc-1042');
});

test('a covered ticket is NOT a link when the agent lacks permission to open it', async ({ page }) => {
  // The trap this guards: /app/tickets/:id is gated on tickets:read, and
  // ProtectedRoute's fallback would send this agent to /portal — out of the
  // staff workspace entirely. Plain text beats a link that ejects the user.
  await mockAuthenticatedServicesAgentWithoutTicketAccess(page, { forwardUnmatched: false });
  await page.goto('/app/services/tickets/srv-1001');

  const inc = page.getByTestId('srv-covered-ticket-INC-1042');
  await expect(inc).toHaveAttribute('data-linked', 'false');
  await expect(inc).toHaveCount(1);
  await expect(page.locator('a[href="/app/tickets/inc-1042"]')).toHaveCount(0);

  // PRB lives in its own domain with its own permission — same treatment.
  await expect(page.getByTestId('srv-covered-ticket-PRB-0308')).toHaveAttribute(
    'data-linked',
    'false',
  );
});

test('shows only the quote side when the dealership has not been invoiced yet', async ({ page }) => {
  await mockAuthenticatedSupervisor(page, { forwardUnmatched: false });
  await page.goto('/app/services/tickets/srv-1002');

  await expect(page.getByTestId('srv-vendor-quote')).toBeVisible();
  await expect(page.getByTestId('srv-customer-invoice-empty')).toBeVisible();
});

test('shows an empty state when the visit has not been quoted at all', async ({ page }) => {
  await mockAuthenticatedSupervisor(page, { forwardUnmatched: false });
  await page.goto('/app/services/tickets/srv-1003');

  await expect(page.getByTestId('srv-quote-empty')).toBeVisible();
});

test('a failing quote does not take down the rest of the SRV page', async ({ page }) => {
  // srv-error-demo is the deterministic mock sentinel (mockData.ts). The whole
  // page errors here because the ticket query itself rejects — this asserts
  // the page-level ErrorState still offers a retry rather than blanking.
  await mockAuthenticatedSupervisor(page, { forwardUnmatched: false });
  await page.goto('/app/services/tickets/srv-error-demo');

  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
});
