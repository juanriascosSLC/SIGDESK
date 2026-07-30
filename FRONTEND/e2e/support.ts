import type { Page } from '@playwright/test';

const adminIdentity = {
  username: 'playwright',
  displayName: 'Playwright Admin',
  roles: ['admin'],
  permissions: ['*'],
};

export async function mockAuthenticatedAdmin(page: Page) {
  const runtimeApiBase = (
    process.env.PLAYWRIGHT_API_URL ??
    'http://127.0.0.1:8080/api/v1'
  ).replace(/\/$/, '');

  // One handler also redirects SPA calls when Playwright reuses an existing
  // Vite process compiled with a different VITE_API_URL.
  await page.route('**/api/v1/**', async (route) => {
    const requestURL = new URL(route.request().url());
    if (/\/api\/v1\/web-auth\/me\/?$/.test(requestURL.pathname)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 1,
          name: adminIdentity.displayName,
          email: 'playwright@sig.systems',
          username: adminIdentity.username,
          roles: adminIdentity.roles,
          permissions: adminIdentity.permissions,
        }),
      });
      return;
    }
    if (/\/api\/v1\/me\/?$/.test(requestURL.pathname)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          identity: adminIdentity,
          isAdmin: true,
          permissionCatalog: [],
        }),
      });
      return;
    }

    const marker = '/api/v1';
    const markerIndex = requestURL.pathname.indexOf(marker);
    const suffix =
      markerIndex >= 0
        ? requestURL.pathname.slice(markerIndex + marker.length)
        : requestURL.pathname;
    const response = await route.fetch({
      url: `${runtimeApiBase}${suffix}${requestURL.search}`,
    });
    await route.fulfill({ response });
  });
}
