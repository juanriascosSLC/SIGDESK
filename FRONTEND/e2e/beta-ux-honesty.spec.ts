import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import {
  mockAuthenticatedAdmin,
  mockAuthenticatedRequester,
} from './support';

/**
 * Verifies the "Beta UX Foundation" honesty audit: every screen either
 * talks to a real backend or says plainly that it doesn't have one yet —
 * never fabricated data, a dead control, or a fake action. See the
 * handoff notes for the full audit; this file is what proves it stays
 * true as the app changes.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = path.resolve(__dirname, '..', 'src');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** AgentLayout's NotificationBell queries `/notifications` whenever
 *  `canViewTickets` is true — every admin-identity test below that visits
 *  an /app/* route needs it stubbed, or the 404 from `forwardUnmatched:
 *  false` surfaces as a render error instead of the screen under test. */
async function stubNotifications(page: import('@playwright/test').Page) {
  await page.route('**/notifications*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], unread: 0 }) }),
  );
}

test.describe('static: no functional native dialogs or dead links in production code', () => {
  const files = walk(SRC_ROOT);

  test('no live window.alert/window.prompt/window.confirm calls', () => {
    // Matches an actual call, not a comment mentioning one — every real
    // reference in this codebase to the native dialogs it replaced lives on
    // a line starting with `//` or `*` (JSDoc), which this deliberately
    // skips. Test/e2e files aren't source of truth for this rule, hence the
    // scope being src/ only.
    const offenders: string[] = [];
    const pattern = /(^|[^.\w])window\.(alert|prompt|confirm)\s*\(/;
    for (const file of files) {
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/**')) return;
        if (pattern.test(line)) {
          offenders.push(`${path.relative(SRC_ROOT, file)}:${i + 1}: ${trimmed}`);
        }
      });
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  test('no actionable href="#" links', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;
        if (line.includes('href="#"')) {
          offenders.push(`${path.relative(SRC_ROOT, file)}:${i + 1}: ${trimmed}`);
        }
      });
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  test('no Math.random-driven fake data generation outside the design system', () => {
    // ToastProvider's Math.random is a client-side id generator, not
    // fabricated domain data — everything else must have none. Comment
    // lines are skipped: ApiKeys.tsx documents in prose that it used to
    // generate fake keys with Math.random(), which isn't a live call.
    const offenders: string[] = [];
    for (const file of files) {
      if (file.endsWith(path.join('components', 'ui', 'ToastProvider.tsx'))) continue;
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/**')) return;
        if (line.includes('Math.random(')) {
          offenders.push(`${path.relative(SRC_ROOT, file)}:${i + 1}: ${trimmed}`);
        }
      });
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});

// Both Knowledge tests below were "is honest about having no backend" when
// this audit suite was written, and that premise died in the merge of
// origin/main: `knowledge_service` exists and main shipped a real
// KnowledgeBase/ArticleDetail against `GET /knowledge/articles` (see
// src/features/knowledge/api.ts). Asserting "no backend yet" now asserts a
// lie, so — exactly like the Portal My Tickets test below — the honesty
// claim is re-pointed at what is true today rather than deleted: real
// service data is what renders, the old fabricated fixtures never come
// back, the counter is derived instead of invented, and a failing or
// missing article says so instead of falling back to something plausible.
const KB_ARTICLE = {
  id: 7,
  article_id: 7,
  numero_visible: 'KB-2001',
  version: 3,
  titulo: 'Restablecer la VPN corporativa',
  categoria: 'Redes',
  etiquetas: ['vpn', 'acceso'],
  audiencia: 'interna',
  contenido: '---\nowner: redes\n---\nPaso 1: cerrar el cliente de VPN.',
  estado: 'publicado',
  actualizado_en: '2026-09-01T10:00:00Z',
};

/** `?q=*` rather than `?*`: the list call is `/knowledge/articles?q=<term>`
 *  and the detail call is `/knowledge/articles/<numero>`, and a bare `?*`
 *  can swallow the detail path too depending on how the glob treats `?`. */
const KB_LIST_GLOB = '**/knowledge/articles?q=*';

function json(body: unknown) {
  return { status: 200, contentType: 'application/json', body: JSON.stringify(body) };
}

test('Knowledge Base renders real knowledge_service data, not the old fabricated articles', async ({ page }) => {
  await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
  await stubNotifications(page);
  await page.route(KB_LIST_GLOB, (route) => route.fulfill(json({ items: [KB_ARTICLE] })));
  await page.route('**/knowledge/articles/KB-2001', (route) => route.fulfill(json(KB_ARTICLE)));

  await page.goto('/app/knowledge');
  // What the service returned is what the screen shows.
  await expect(page.getByText('Restablecer la VPN corporativa')).toBeVisible();
  await expect(page.getByText('KB-2001 · v3')).toBeVisible();
  // The counter badge is computed from the response, not a made-up total:
  // one article in, "1" on screen.
  await expect(page.getByText(/^1 manuals available$/)).toBeVisible();
  // The pre-backend fixtures are gone for good, whatever the service returns.
  await expect(page.getByText('KB-1024')).toHaveCount(0);
  await expect(page.getByText(/66 articles/i)).toHaveCount(0);

  // Detail reaches the same service and renders its content — including
  // stripping the YAML front matter instead of showing it as prose.
  await page.getByRole('button', { name: /Restablecer la VPN corporativa/ }).click();
  await expect(page).toHaveURL(/\/app\/knowledge\/KB-2001$/);
  await expect(page.getByText(/Paso 1: cerrar el cliente de VPN/)).toBeVisible();
  await expect(page.getByText('owner: redes')).toHaveCount(0);
  await expect(page.getByText(/power-cycle/i)).toHaveCount(0);

  // An article that isn't there says so. `forwardUnmatched: false` answers
  // this one 404, which is the real "wrong id / not authorized" path.
  await page.goto('/app/knowledge/KB-9999');
  await expect(page.getByText(/does not exist, or you do not have permission/i)).toBeVisible();
  await expect(page.getByText('Restablecer la VPN corporativa')).toHaveCount(0);

  // And a service that fails admits it rather than degrading into a
  // cheerful empty state that reads like "there is no documentation".
  await page.unroute(KB_LIST_GLOB);
  await page.route(KB_LIST_GLOB, (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'boom' }) }),
  );
  await page.goto('/app/knowledge');
  await expect(page.getByText(/could not load the authorized manuals/i)).toBeVisible();
  await expect(page.getByText('KB-2001')).toHaveCount(0);
});

test('Knowledge Base serves the same real articles on the end-user portal', async ({ page }) => {
  await mockAuthenticatedRequester(page, { forwardUnmatched: false });
  await page.route(KB_LIST_GLOB, (route) => route.fulfill(json({ items: [KB_ARTICLE] })));

  await page.goto('/portal/knowledge');
  // A requester with `knowledge:read:global` sees the real article, not a
  // placeholder and not the old hardcoded one.
  await expect(page.getByText('Restablecer la VPN corporativa')).toBeVisible();
  await expect(page.getByText('KB-2001 · v3')).toBeVisible();
  await expect(page.getByText('KB-1024')).toHaveCount(0);
});

// Was a placeholder "not available yet" screen when this audit suite was
// first written — now backed by a real `GET /entities/INC?createdBy=me`
// (see mis_tickets_postgres_test.go for the backend contract and
// my-tickets.spec.ts for the full frontend behavior: empty/error/offline/
// pagination/search/navigation). This test's job here is narrower: prove
// the old hardcoded rows are gone for good, whatever the backend returns.
test('Portal My Tickets renders real data, not the old hardcoded rows', async ({ page }) => {
  await mockAuthenticatedRequester(page, { forwardUnmatched: false });
  await page.route('**/entities/INC?*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          { id: '9001', humanId: 'INC-009001', entityKey: 'INC', state: 'abierto', data: { title: 'Real submitted ticket' }, createdAt: '2026-08-30T12:00:00Z', creadorId: 'requester-1', prioridad: 'media' },
        ],
        hasMore: false,
      }),
    }),
  );
  await page.goto('/portal/tickets');
  await expect(page.getByText('INC-009001')).toBeVisible();
  await expect(page.getByText('INC-202611')).toHaveCount(0);
  await expect(page.getByText('REQ-202590')).toHaveCount(0);
});

/**
 * The first test in this file bans `window.prompt` statically. On its own
 * that rule is satisfiable by simply breaking the control it guarded, so
 * this covers the other half: the in-app comment box that replaced the
 * assistant's feedback prompt still collects the text and still posts it.
 * A native prompt reappearing here would be caught twice over — by the
 * static rule, and by `nativeDialogs` below.
 */
test('Assistant feedback collects its comment in-app, with no native dialog, and posts it', async ({ page }) => {
  await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
  await stubNotifications(page);

  await page.route('**/ia_advisor/chat', (route) =>
    route.fulfill(json({ answer: 'Open the ticket and press Resolve.', rag_available: true, sources: [] })),
  );
  const feedbackBodies: Record<string, unknown>[] = [];
  await page.route('**/ia_advisor/feedback', (route) => {
    feedbackBodies.push(JSON.parse(route.request().postData() ?? '{}'));
    return route.fulfill(json({ ok: true }));
  });
  const nativeDialogs: string[] = [];
  page.on('dialog', (dialog) => {
    nativeDialogs.push(dialog.type());
    void dialog.dismiss();
  });

  await page.goto('/app');
  await page.getByRole('button', { name: 'Open SIG Assistant' }).click();
  await page.getByPlaceholder(/type your question/i).fill('How do I resolve a ticket?');
  await page.getByRole('button', { name: 'Send question' }).click();
  await expect(page.getByText('Open the ticket and press Resolve.')).toBeVisible();

  await page.getByRole('button', { name: 'Unhelpful answer' }).click();
  const reasonDialog = page.getByRole('dialog');
  await expect(reasonDialog).toBeVisible();
  await reasonDialog.getByRole('textbox').fill('It skipped the approval step.');
  await reasonDialog.getByRole('button', { name: 'Send feedback' }).click();

  // The thumb only latches once the POST succeeded, so this also proves the
  // request went out rather than the dialog just closing.
  await expect(page.getByText('Gracias')).toBeVisible();
  expect(nativeDialogs, `native dialogs opened: ${nativeDialogs.join(', ')}`).toEqual([]);
  expect(feedbackBodies).toHaveLength(1);
  expect(feedbackBodies[0]).toMatchObject({
    rating: 'not_useful',
    comment: 'It skipped the approval step.',
    question: 'How do I resolve a ticket?',
  });
});

test('Reports shows no invented metrics', async ({ page }) => {
  await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
  await stubNotifications(page);
  await page.goto('/app/reports');
  await expect(page.getByText(/available yet/i)).toBeVisible();
  await expect(page.getByText('87%')).toHaveCount(0);
  await expect(page.getByText('312 responses this month')).toHaveCount(0);
  await expect(page.getByText('Laura Kim')).toHaveCount(0);
});

test('ChatOps offers no fake connect/disconnect actions', async ({ page }) => {
  await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
  await stubNotifications(page);
  await page.goto('/app/settings/chatops');
  await expect(page.getByText(/available yet/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /disconnect/i })).toHaveCount(0);
  await expect(page.getByText('42')).toHaveCount(0);
});

test('API Keys offers no fake generate/revoke actions', async ({ page }) => {
  await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
  await stubNotifications(page);
  await page.goto('/app/settings/api-keys');
  await expect(page.getByText(/available yet/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /generate new key/i })).toHaveCount(0);
  await expect(page.getByText('sig_sk_')).toHaveCount(0);
});

test('Global header search is honestly disabled, not faking results', async ({ page }) => {
  await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
  await stubNotifications(page);
  await page.goto('/app');
  const search = page.getByPlaceholder(/search isn't available yet/i);
  // A disabled input can't accept focus or open a results dropdown at
  // all — that's the fix: the old version showed a fake dropdown on focus
  // regardless of what (if anything) was typed.
  await expect(search).toBeDisabled();
  await expect(page.getByText('INC-202601')).toHaveCount(0);
});

test('Home shows no hardcoded ticket/CSAT numbers', async ({ page }) => {
  await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
  await stubNotifications(page);
  await page.goto('/app');
  await expect(page.getByText('728')).toHaveCount(0);
  await expect(page.getByText('396')).toHaveCount(0);
  await expect(page.getByText('4.6')).toHaveCount(0);
  // The real, permission-derived quick link still renders — scoped to
  // <main> since the same link also exists in the sidebar nav.
  await expect(page.getByRole('main').getByRole('link', { name: /tickets & issues/i })).toBeVisible();
});

test('Portal Catalog: select a definition, open its form inside /portal, cancel back to /portal/catalog', async ({ page }) => {
  await mockAuthenticatedRequester(page, { forwardUnmatched: false });

  await page.route('**/catalog/definitions?*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          {
            id: 'def-inc-1',
            entityKey: 'INC',
            name: 'Incident',
            version: 1,
            status: 'published',
            specification: {
              description: 'Report an issue',
              identity: { prefix: 'INC' },
              fields: [],
              lifecycle: { states: ['Open'], transitions: [] },
              views: { create: [], summary: [] },
            },
          },
        ],
      }),
    }),
  );
  await page.route('**/catalog/definitions/INC', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'def-inc-1',
        entityKey: 'INC',
        name: 'Incident',
        version: 1,
        status: 'published',
        specification: {
          description: 'Report an issue',
          identity: { prefix: 'INC' },
          fields: [],
          lifecycle: { states: ['Open'], transitions: [] },
          views: { create: [], summary: [] },
        },
      }),
    }),
  );

  // A pure requester (no agent/admin permission) can reach the portal
  // catalog and complete this navigation on its own.
  await page.goto('/portal/catalog');
  await expect(page).toHaveURL(/\/portal\/catalog$/);
  const incidentOption = page.getByTestId('catalog-option-INC');
  await expect(incidentOption).toBeVisible();

  await incidentOption.click();
  await expect(page).toHaveURL(/\/portal\/catalog\/INC$/);

  await page.getByRole('button', { name: /back to catalog/i }).click();
  await expect(page).toHaveURL(/\/portal\/catalog$/);
  // Never bounced into the agent workspace's catalog.
  expect(page.url()).not.toContain('/app/catalog');
});

test('no console errors while visiting the honest-unavailable and home screens', async ({ page }) => {
  await mockAuthenticatedAdmin(page, { forwardUnmatched: false });
  await stubNotifications(page);
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  for (const route of [
    '/app',
    '/app/knowledge',
    '/app/reports',
    '/app/settings/chatops',
    '/app/settings/api-keys',
    '/portal',
    '/portal/knowledge',
    '/portal/tickets',
  ]) {
    await page.goto(route);
  }
  expect(errors, errors.join('\n')).toEqual([]);
});
