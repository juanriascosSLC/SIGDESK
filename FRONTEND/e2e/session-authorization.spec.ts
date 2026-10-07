import { expect, test } from '@playwright/test';

/**
 * The SIGTools identity read during app bootstrap must be forwarded to
 * organization_service when minting SIG-DESK's local authorization JWT.
 */
test('forwards the SIGTools identity when requesting a SIG-DESK session', async ({ page }) => {
  let sessionRequestBody: unknown = null;

  await page.route('**/api/v1/web-auth/me/', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 1,
        name: 'Hector Cruz',
        email: 'hector.cruz@sig.systems',
        username: 'hector.cruz',
      }),
    }),
  );

  await page.route(
    '**/v1/session',
    async (route) => {
      sessionRequestBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'test-sig-desk-token',
          expires_in: 900,
          role_id: 'admin',
          permissions: ['tickets:read:global'],
          usuario: {
            id: 'hector-id',
            nombre: 'Hector Cruz',
            email: 'hector.cruz@sig.systems',
            company_id: 'sig-systems',
            role_id: 'admin',
            estado: 'activo',
          },
        }),
      });
    },
  );

  await page.goto('/app', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => sessionRequestBody).not.toBeNull();
  expect(sessionRequestBody).toEqual({
    email: 'hector.cruz@sig.systems',
    nombre: 'Hector Cruz',
  });
});
