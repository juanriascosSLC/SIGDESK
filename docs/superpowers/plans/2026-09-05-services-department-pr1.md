# Services Department Frontend (PR1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a self-contained, mock-only `/app/services/*` slice of SIG-Desk-Frontend — a themed Services department shell with a dashboard, a per-dealership recurring-problems panel, and an SRV ticket detail page with an equipment checklist, subcontractor picker and POC card — matching PR1 of the approved design doc's PR Scoping (Recommended Approach steps 0–4).

**Architecture:** A new `src/features/services/` slice (typed mocks + mock API, no backend wiring), three new routes nested under the existing `/app/*` tree and gated by the already-real `PERMISSIONS.changesView`, and a generic `data-department` theming primitive (its own light/dark CSS token pair, composing independently with the existing `.dark` toggle) that the *next* department-scoped placeholder can reuse without rework.

**Tech Stack:** React + TypeScript + Vite, React Router, `@tanstack/react-query` (already a dependency, used by every other data-driven feature), Tailwind v4 (`@theme`), Playwright (the only test runner this repo uses — no Vitest/RTL is introduced).

**Spec:** [`docs/designs/services-department-frontend.md`](../../designs/services-department-frontend.md) (APPROVED). This plan implements **PR1 only** (Recommended Approach steps 0–4, per that doc's own "PR Scoping" section). PR2 — step 5 (quote/invoice summary), step 6 (`WorkflowBuilder.tsx` embed), step 7 (progress stepper) — is explicitly **out of scope** here; it is blocked on the `basePath`/data-scoping risk documented in that doc's Dependencies and starts only after PR1 merges.

## Global Constraints

Copied verbatim from the spec — every task below implicitly includes these:

- **Frontend-only, mock-only.** No backend wiring. Every new type is a typed mock; no HTTP calls to a real service.
- **Do not modify** the Catalog Builder runtime or the generic `WorkflowBuilder.tsx` — this plan never touches either (they're not even referenced until PR2).
- **New domain concepts require their own ADR** before real implementation (`SRV` entity_key, `Subcontractor`, dealership `POC`) — this plan only builds mock placeholders for them, and every mock type's doc comment says so explicitly (Premise 4).
- **Glossary terms only.** "equipamiento" always means physical dispatch hardware (ladders, cables, contact cleaner) — never the org-chart `Equipo` (Empresa → Departamento → Equipo). Never invent a loose synonym for INC/PRB/RFC/Departamento.
- **Routes:** nested under the existing `/app/*` tree as `/app/services/*`, reusing `AgentLayout` and the `ProtectedRoute`/`PERMISSIONS` mechanism already in `App.tsx`/`features/auth/permissions.ts`. A new entry in `config/navigation.ts` is required (single source of truth for sidebar/drawer/bottomnav).
- **Permission gating:** `/app/services/*` is gated by the already-real, already-seeded `PERMISSIONS.changesView` (`sigdesk.changes.view`) — **zero new permission keys, zero changes to `AuthProvider.tsx`**. Swapping in a real `sigdesk.services.view` later is a one-line change in `permissions.ts` (Eng Review decision 5A).
- **No new test runner.** Every task is verified with Playwright (the only framework already installed) — no Vitest/RTL introduced (Eng Review decision 4A).
- **SRV is standalone in PR1** — not registered in `TicketWidgetRegistry.tsx`, not part of the shared INC/PRB/RFC ticket pool. "Same pattern as Catalog Builder" (step 3 of Recommended Approach) is a reference to *form*, not a real integration.
- **Theming:** a `data-department="services"` attribute on each page's own root wrapper, never on `AgentLayout`'s ancestors (which paint their own `bg-background`/`bg-surface` and are left untouched — Premise 2 revised, Eng Review decision 1A). Every page that opts into the department skin paints its **own** background from `--services-*` tokens; nothing cascades in automatically.

---

## Task 1: Shared mock-query utility + Services CSS tokens

**Files:**
- Create: `src/lib/mockQuery.ts`
- Modify: `src/index.css:15-54` (append to the existing `@theme inline` block) and after `src/index.css:128` (new light/dark token blocks)

**Interfaces:**
- Produces: `mockQuery<T>(data: T, options?: { delayMs?: number }): Promise<T>` and `mockQueryError(message: string, options?: { delayMs?: number }): Promise<never>` — every `features/services/api.ts` function in Task 3 resolves/rejects through these.
- Produces: Tailwind color utilities `bg-services-background`, `bg-services-surface`, `bg-services-surface-container`, `bg-services-surface-container-low`, `text-services-on-surface`, `text-services-on-surface-variant`, `border-services-border`, `text-services-accent`/`bg-services-accent` — every Services component from Task 2 onward uses these instead of the base `bg-surface`/`bg-background` tokens.

This is the one task in this plan with no consuming UI yet (nothing renders until Task 2), so there is no meaningful "write a failing test first" step — the codebase has zero unit tests for any pure `lib/*.ts` file (confirmed: no `*.test.ts` anywhere in `src/`), and Playwright can't exercise a function with no route. Verification here is `tsc -b` + `eslint` (the same gate every other pure-logic file in this repo relies on), not a Playwright spec — Task 2's spec is what first proves this file works.

- [ ] **Step 1: Create `src/lib/mockQuery.ts`**

```ts
/**
 * Shared mock-data query primitive for frontend-only, placeholder features
 * (Services — services-department-frontend.md — is the first consumer;
 * the next department-scoped placeholder reuses this instead of hand-
 * rolling its own setTimeout, per Eng Review decision 2A/6). Simulates the
 * latency/rejection shape of a real network call so LoadingState/ErrorState
 * paths are actually exercisable, including from Playwright — by using
 * deterministic sentinel ids in the mock dataset (see
 * features/services/mockData.ts) rather than random failure injection,
 * which a fixed-seed E2E run can't assert against reliably.
 */
export interface MockQueryOptions {
  /** Artificial latency before resolving/rejecting. Defaults to a small,
   *  visible-but-not-annoying delay so LoadingState actually has a moment
   *  to render before Playwright's default assertion timeout. */
  delayMs?: number;
}

const DEFAULT_DELAY_MS = 350;

export function mockQuery<T>(data: T, options: MockQueryOptions = {}): Promise<T> {
  const { delayMs = DEFAULT_DELAY_MS } = options;
  return new Promise((resolve) => {
    setTimeout(() => resolve(data), delayMs);
  });
}

export function mockQueryError(message: string, options: MockQueryOptions = {}): Promise<never> {
  const { delayMs = DEFAULT_DELAY_MS } = options;
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(message)), delayMs);
  });
}
```

- [ ] **Step 2: Add the Services token names to the existing `@theme inline` block**

In `src/index.css`, immediately after the existing `--radius-xl: calc(var(--radius) * 1.4);` line (inside the same `@theme inline { ... }` block that starts at line 15), add:

```css

  /* Services department skin — parallel token axis to the base palette
     above, scoped by [data-department="services"] instead of a global
     class (services-department-frontend.md, Premise 2). See the
     :root/.dark-analogous blocks below for the actual values. */
  --color-services-background: var(--services-background);
  --color-services-surface: var(--services-surface);
  --color-services-surface-container: var(--services-surface-container);
  --color-services-surface-container-low: var(--services-surface-container-low);
  --color-services-on-surface: var(--services-on-surface);
  --color-services-on-surface-variant: var(--services-on-surface-variant);
  --color-services-border: var(--services-border);
  --color-services-accent: var(--services-accent);
  --color-services-accent-foreground: var(--services-accent-foreground);
```

- [ ] **Step 3: Add the light/dark Services token values**

Immediately after the closing `}` of the existing `.dark { ... }` block (`src/index.css:128`), and before the "Native form-control color-scheme" comment, add:

```css

/* ─── Services department skin (data-department="services") ─────────────
   Independent axis from .dark: [data-department="services"] carries its
   OWN light values below, and `.dark [data-department="services"]` (a
   DESCENDANT combinator, not a compound selector — .dark lives on <html>,
   data-department lives on a nested page wrapper, never the same element)
   carries its own dark values. The two compose instead of colliding
   because they define entirely different custom properties (--services-*
   vs. --background/--surface/etc. above) — see DepartmentScope.tsx (Task
   2) for the component that actually stamps this attribute. Values reuse
   the same cyan/blue accent already used by Brand (AgentLayout.tsx:41,
   `from-cyan-500 to-blue-500`), not a new brand color (Design Review
   Pass 5). */
[data-department="services"] {
  --services-background: #eef7fb;
  --services-surface: #ffffff;
  --services-surface-container: #e0f2fa;
  --services-surface-container-low: #f2fafd;
  --services-on-surface: #0f172a;
  --services-on-surface-variant: #475569;
  --services-border: rgba(14, 116, 144, 0.16);
  --services-accent: #0e7490;
  --services-accent-foreground: #ffffff;
}

.dark [data-department="services"] {
  --services-background: #061019;
  --services-surface: #0b1a22;
  --services-surface-container: #0f232c;
  --services-surface-container-low: #0d1c24;
  --services-on-surface: #e1e2eb;
  --services-on-surface-variant: #9fb4bc;
  --services-border: rgba(6, 182, 212, 0.18);
  --services-accent: #06b6d4;
  --services-accent-foreground: #020617;
}
```

- [ ] **Step 4: Verify**

Run: `npm run build`
Expected: succeeds (this proves the new CSS parses and `mockQuery.ts` type-checks; nothing consumes either yet).

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/mockQuery.ts src/index.css
git commit -m "feat(services): add shared mockQuery utility and Services CSS tokens"
```

---

## Task 2: DepartmentScope primitive + routes/nav wiring + minimal placeholder pages

**Files:**
- Create: `src/components/layout/DepartmentScope.tsx`
- Create: `src/features/services/ServicesDashboard.tsx` (minimal placeholder — replaced in Task 5)
- Create: `src/features/services/DealershipView.tsx` (minimal placeholder — extended in Task 4)
- Create: `src/features/services/SrvDetail.tsx` (minimal placeholder — extended in Tasks 6–9)
- Modify: `src/App.tsx` (3 new lazy routes, gated)
- Modify: `src/config/navigation.ts` (1 new nav item)
- Test: `e2e/services-shell-and-permissions.spec.ts`

**Interfaces:**
- Produces: `DepartmentScope({ department: string; className?: string; children: ReactNode })` — a generic wrapper stamping `data-department` on its own root div. Every Services page (this task and Tasks 4–9) wraps its content in `<DepartmentScope department="services" className="bg-services-background text-services-on-surface ...">`.
- Produces: routes `/app/services` → `ServicesDashboard`, `/app/services/dealerships/:dealershipId` → `DealershipView`, `/app/services/tickets/:id` → `SrvDetail`, each behind `<ProtectedRoute requiredPermission={PERMISSIONS.changesView}>`.
- Consumes: `PERMISSIONS.changesView` (`src/features/auth/permissions.ts:25`, already exists — no edit needed there).

- [ ] **Step 1: Write the failing E2E test**

Create `e2e/services-shell-and-permissions.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { mockAuthenticatedSupervisor, mockAuthenticatedTaskExecutor } from './support';

test('Services is reachable from the sidebar and carries the department skin on all three routes', async ({ page }) => {
  await mockAuthenticatedSupervisor(page, { forwardUnmatched: false });
  await page.goto('/app');
  await page.locator('#app-nav').getByRole('link', { name: 'Services' }).click();
  await expect(page).toHaveURL(/\/app\/services$/);
  await expect(page.locator('[data-department="services"]').first()).toBeVisible();

  await page.goto('/app/services/dealerships/dealership-atl-01');
  await expect(page.locator('[data-department="services"]').first()).toBeVisible();

  await page.goto('/app/services/tickets/srv-1001');
  await expect(page.locator('[data-department="services"]').first()).toBeVisible();
});

test('an identity without sigdesk.changes.view cannot reach /app/services', async ({ page }) => {
  await mockAuthenticatedTaskExecutor(page, { forwardUnmatched: false });
  await page.goto('/app/services');
  await expect(page).not.toHaveURL(/\/app\/services/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test e2e/services-shell-and-permissions.spec.ts`
Expected: FAIL — `/app/services` doesn't exist yet (404 catch-all "Module in development…" or no "Services" nav link).

- [ ] **Step 3: Create `src/components/layout/DepartmentScope.tsx`**

```tsx
import type { ReactNode } from 'react';
import { cn } from '@/components/ui/cn';

export interface DepartmentScopeProps {
  /** The department key stamped as `data-department` on this wrapper's own
   *  root — e.g. "services". Each department defines its own parallel CSS
   *  token set keyed off `[data-department="<department>"]` in index.css;
   *  this component only applies the attribute, it doesn't know what any
   *  department's tokens look like. Generic by design (Recommended
   *  Approach, services-department-frontend.md) so the next department-
   *  scoped placeholder reuses this instead of reinventing it. */
  department: string;
  className?: string;
  children: ReactNode;
}

/**
 * Per-page department theming primitive. `AgentLayout` paints its own
 * background at two ancestor levels (`bg-background` on the outer shell,
 * `bg-surface` on `{children}`'s direct container) that this wrapper does
 * NOT and cannot recolor by CSS cascade alone — so every page using this
 * component must also apply its own department-scoped background class
 * (e.g. `bg-services-background`) via `className`, not rely on inheriting
 * one. See Premise 2 (revised) in services-department-frontend.md.
 */
export function DepartmentScope({ department, className, children }: DepartmentScopeProps) {
  return (
    <div data-department={department} className={cn('min-h-full', className)}>
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Create the three minimal placeholder pages**

`src/features/services/ServicesDashboard.tsx`:

```tsx
import { DepartmentScope } from '@/components/layout/DepartmentScope';
import { PageHeader } from '@/components/ui/PageHeader';

export default function ServicesDashboard() {
  return (
    <DepartmentScope
      department="services"
      className="bg-services-background text-services-on-surface min-h-full p-6 lg:p-8"
    >
      <PageHeader title="Services" description="Dispatch, equipment and recurring problems by dealership." />
    </DepartmentScope>
  );
}
```

`src/features/services/DealershipView.tsx`:

```tsx
import { useParams } from 'react-router-dom';
import { DepartmentScope } from '@/components/layout/DepartmentScope';
import { PageHeader } from '@/components/ui/PageHeader';

export default function DealershipView() {
  const { dealershipId } = useParams<{ dealershipId: string }>();
  return (
    <DepartmentScope
      department="services"
      className="bg-services-background text-services-on-surface min-h-full p-6 lg:p-8"
    >
      <PageHeader title="Dealership" description={dealershipId} />
    </DepartmentScope>
  );
}
```

`src/features/services/SrvDetail.tsx`:

```tsx
import { useParams } from 'react-router-dom';
import { DepartmentScope } from '@/components/layout/DepartmentScope';
import { PageHeader } from '@/components/ui/PageHeader';

export default function SrvDetail() {
  const { id } = useParams<{ id: string }>();
  return (
    <DepartmentScope
      department="services"
      className="bg-services-background text-services-on-surface min-h-full p-6 lg:p-8"
    >
      <PageHeader title="SRV ticket" description={id} />
    </DepartmentScope>
  );
}
```

- [ ] **Step 5: Wire the routes in `src/App.tsx`**

Add three lazy imports next to the other `features/*` lazy imports (after the `WorkflowBuilder` line, `App.tsx:26`):

```tsx
const ServicesDashboard = React.lazy(() => import('./features/services/ServicesDashboard'));
const DealershipView = React.lazy(() => import('./features/services/DealershipView'));
const SrvDetail = React.lazy(() => import('./features/services/SrvDetail'));
```

Add three routes inside the `/app/*` route's nested `<Routes>`, after the `/problems/:id` route (`App.tsx:273-277`) and before `/automations` (`App.tsx:278`):

```tsx
              {/* Services department slice (PR1) — mock-only, gated on the
                  already-real sigdesk.changes.view until sigdesk.services.view
                  exists in SIGTools (services-department-frontend.md,
                  Constraints). */}
              <Route path="/services" element={
                <ProtectedRoute requiredPermission={PERMISSIONS.changesView}>
                  <ServicesDashboard />
                </ProtectedRoute>
              } />
              <Route path="/services/dealerships/:dealershipId" element={
                <ProtectedRoute requiredPermission={PERMISSIONS.changesView}>
                  <DealershipView />
                </ProtectedRoute>
              } />
              <Route path="/services/tickets/:id" element={
                <ProtectedRoute requiredPermission={PERMISSIONS.changesView}>
                  <SrvDetail />
                </ProtectedRoute>
              } />
```

- [ ] **Step 6: Add the nav entry in `src/config/navigation.ts`**

Add `Wrench` to the `lucide-react` import list at the top of the file, then add this item to `NAV_ITEMS` (after the `assets` entry, `navigation.ts:170`, still inside the `itsm` section since Services is departmental coordination work like Change/Problem/Assets):

```ts
  {
    key: 'services',
    label: 'Services',
    route: '/app/services',
    icon: Wrench,
    section: 'itsm',
    permission: (ctx) => ctx.can(PERMISSIONS.changesView),
    surfaces: ['sidebar', 'drawer'],
  },
```

- [ ] **Step 7: Run the test again to verify it passes**

Run: `npx playwright test e2e/services-shell-and-permissions.spec.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/components/layout/DepartmentScope.tsx src/features/services/ServicesDashboard.tsx src/features/services/DealershipView.tsx src/features/services/SrvDetail.tsx src/App.tsx src/config/navigation.ts e2e/services-shell-and-permissions.spec.ts
git commit -m "feat(services): add /app/services/* shell, routing, nav entry and department scope primitive"
```

---

## Task 3: Services domain types + mock dataset + mock API + presentation helpers

**Files:**
- Create: `src/features/services/types.ts`
- Create: `src/features/services/mockData.ts`
- Create: `src/features/services/api.ts`
- Create: `src/features/services/presentation.ts`

**Interfaces:**
- Produces: `Dealership`, `RecurringProblem`, `ProblemSeverity`, `EquipmentChecklistItem`, `EquipmentItemStatus`, `SrvStatus`, `SrvTicket`, `Subcontractor`, `DealershipPOC` (all in `types.ts`) — consumed by every component task from Task 4 onward.
- Produces: `listDealerships()`, `getDealership(id)`, `listRecurringProblems(dealershipId)`, `listSrvTickets()`, `getSrvTicket(id)`, `listSubcontractors(region)`, `getDealershipPOC(dealershipId)` (all in `api.ts`) — each wraps `mockQuery`/`mockQueryError` from Task 1.
- Produces: `SRV_STATUS_LABELS`, `SRV_STATUS_TONES`, `EQUIPMENT_ITEM_LABELS`, `EQUIPMENT_ITEM_TONES`, `PROBLEM_SEVERITY_TONES`, `formatDate(iso)` (all in `presentation.ts`) — consumed by Tasks 4, 5, 8.
- Produces: `ERROR_DEMO_DEALERSHIP_ID`, `ERROR_DEMO_SRV_ID` (in `mockData.ts`) — the deterministic sentinel ids Task 2's pattern and every later E2E spec navigate to directly to exercise ErrorState without random failure injection.

Same rationale as Task 1: no route consumes this data yet (Task 4 is the first consumer), so there's no Playwright-testable "red" step for this task in isolation. Verification is `tsc -b` + `eslint`, matching how every other pure data/presentation file in this repo (e.g. `features/changes/presentation.ts`, `features/tickets/types.ts`) is verified — neither has a dedicated test file either.

- [ ] **Step 1: Create `src/features/services/types.ts`**

```ts
export interface Dealership {
  id: string;
  name: string;
  city: string;
  state: string;
  /** Groups subcontractor coverage — matches a Subcontractor's own
   *  `region` field exactly, so SubcontractorPicker can filter by it. */
  region: string;
}

export type ProblemSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface RecurringProblem {
  id: string;
  dealershipId: string;
  title: string;
  severity: ProblemSeverity;
  occurredAt: string; // ISO date
}

export type EquipmentItemStatus = 'confirmed' | 'missing' | 'in_transit';

export interface EquipmentChecklistItem {
  id: string;
  label: string;
  quantity: number;
  status: EquipmentItemStatus;
  /** Present when this item's status couldn't be confirmed against
   *  inventory — rendered as a per-item warning; the rest of the checklist
   *  stays intact (Design Review Pass 2, SrvDetail "Error" column — this
   *  is a per-item concern, not a whole-page error). */
  validationError?: string;
  /** True while this single item is still resolving — lets the checklist
   *  render some items settled and one with an inline spinner (Design
   *  Review Pass 2, SrvDetail "Partial" column) instead of gating the
   *  whole list behind one loading flag. */
  isValidating?: boolean;
}

/**
 * The ticket-list status pill vocabulary from the mockup (Design Review
 * Pass 5). NOT the 6-stage Diagnosis→Closure progress stepper — that's
 * Recommended Approach step 7, explicit PR2 scope (see this plan's header
 * and SrvDetail's own doc comment in Task 9).
 */
export type SrvStatus =
  | 'requires_action'
  | 'ready'
  | 'equipment_delivered'
  | 'waiting'
  | 'awaiting_info'
  | 'today'
  | 'service_completed';

export interface SrvTicket {
  id: string;
  humanId: string;
  dealershipId: string;
  title: string;
  status: SrvStatus;
  priority: 'Low' | 'Medium' | 'High' | 'Critical';
  equipment: EquipmentChecklistItem[];
  subcontractorId?: string;
  pocId?: string;
  /**
   * Placeholder grouping for ServicesDashboard's My Work/Team/All tabs —
   * SRV has no real assignment model yet (Open Questions,
   * services-department-frontend.md). 'mine' tickets show under all three
   * tabs, 'team' under Team+All, 'unassigned' under All only. Documented
   * here so it isn't mistaken for real session-identity-based filtering.
   */
  assignedScope: 'mine' | 'team' | 'unassigned';
  createdAt: string;
}

/**
 * Proposed shape, pending the ADR of `organization_service`/
 * `resource_service` (Premise 4, services-department-frontend.md) —
 * Subcontractor is not a real domain entity yet, just a typed mock the
 * picker renders against.
 */
export interface Subcontractor {
  id: string;
  name: string;
  region: string;
  skills: string[];
}

/**
 * Proposed shape, pending the same ADR as Subcontractor above — a
 * dealership's receiving contact, modeled here as a typed mock.
 */
export interface DealershipPOC {
  dealershipId: string;
  name: string;
  role: string;
  phone: string;
  email: string;
}
```

- [ ] **Step 2: Create `src/features/services/mockData.ts`**

```ts
import type { Dealership, RecurringProblem, SrvTicket, Subcontractor, DealershipPOC } from './types';

/** Deliberately broken dealership id — every mock query keyed off it
 *  rejects (except getDealershipPOC, which by design never rejects — see
 *  api.ts), so Playwright specs can hit ErrorState/retry deterministically
 *  without random failure injection. Never render this in a "real" list;
 *  it exists only to be navigated to directly by id. */
export const ERROR_DEMO_DEALERSHIP_ID = 'dealership-error-demo';
export const ERROR_DEMO_SRV_ID = 'srv-error-demo';

export const MOCK_DEALERSHIPS: Dealership[] = [
  { id: 'dealership-atl-01', name: 'Sunrise Auto Group', city: 'Atlanta', state: 'GA', region: 'Atlanta, GA' },
  { id: 'dealership-chg-01', name: 'Lakeshore Motors', city: 'Chicago', state: 'IL', region: 'Chicago, IL' },
  { id: ERROR_DEMO_DEALERSHIP_ID, name: 'Errored Dealership (E2E fixture)', city: '—', state: '—', region: 'ERROR_DEMO_REGION' },
];

export const MOCK_RECURRING_PROBLEMS: RecurringProblem[] = [
  {
    id: 'rp-1',
    dealershipId: 'dealership-atl-01',
    title: 'Elevator lift intermittent fault',
    severity: 'high',
    occurredAt: '2026-08-12T09:00:00Z',
  },
  {
    id: 'rp-2',
    dealershipId: 'dealership-atl-01',
    title: 'Bay door sensor misaligned',
    severity: 'medium',
    occurredAt: '2026-07-30T14:00:00Z',
  },
  // dealership-chg-01 intentionally has zero entries here — exercises
  // RecurringProblemsPanel's reassuring empty state (Design Review Pass 2).
];

export const MOCK_SRV_TICKETS: SrvTicket[] = [
  {
    id: 'srv-1001',
    humanId: 'SRV-1001',
    dealershipId: 'dealership-atl-01',
    title: 'Elevator inspection — 15ft ladder required',
    status: 'requires_action',
    priority: 'High',
    equipment: [
      { id: 'eq-1', label: 'Telescoping ladder, 15ft minimum', quantity: 1, status: 'missing' },
      { id: 'eq-2', label: 'Contact cleaner kit', quantity: 2, status: 'confirmed' },
      { id: 'eq-3', label: 'Insulated gloves, size L', quantity: 1, status: 'in_transit', isValidating: true },
    ],
    subcontractorId: 'sub-nighthawk',
    pocId: 'poc-1',
    assignedScope: 'mine',
    createdAt: '2026-09-01T10:00:00Z',
  },
  {
    id: 'srv-1002',
    humanId: 'SRV-1002',
    dealershipId: 'dealership-chg-01',
    title: 'Bay door sensor realignment',
    status: 'waiting',
    priority: 'Medium',
    equipment: [
      {
        id: 'eq-4',
        label: 'Sensor alignment kit',
        quantity: 1,
        status: 'confirmed',
        validationError: 'Could not confirm against inventory',
      },
    ],
    assignedScope: 'team',
    createdAt: '2026-09-03T08:30:00Z',
  },
  {
    id: ERROR_DEMO_SRV_ID,
    humanId: 'SRV-ERR',
    dealershipId: ERROR_DEMO_DEALERSHIP_ID,
    title: 'Errored SRV (E2E fixture)',
    status: 'requires_action',
    priority: 'Low',
    equipment: [],
    assignedScope: 'unassigned',
    createdAt: '2026-09-01T00:00:00Z',
  },
];

export const MOCK_SUBCONTRACTORS: Subcontractor[] = [
  {
    id: 'sub-nighthawk',
    name: 'Nighthawk Technologies Solutions',
    region: 'Atlanta, GA',
    skills: ['Elevator lift', 'Electrical', 'HVAC'],
  },
  {
    id: 'sub-ironclad',
    name: 'Ironclad Facilities Services',
    region: 'Atlanta, GA',
    skills: ['Bay doors', 'General maintenance'],
  },
  // Chicago, IL intentionally has zero coverage — exercises
  // SubcontractorPicker's "request coverage" empty state.
];

export const MOCK_POCS: DealershipPOC[] = [
  {
    dealershipId: 'dealership-atl-01',
    name: 'Marcus Webb',
    role: 'Site Facilities Manager',
    phone: '+1 (404) 555-0142',
    email: 'mwebb@sunriseauto.example',
  },
  // dealership-chg-01 intentionally has no POC — exercises POCCard's
  // empty state.
];
```

- [ ] **Step 3: Create `src/features/services/api.ts`**

```ts
import { mockQuery, mockQueryError } from '@/lib/mockQuery';
import {
  MOCK_DEALERSHIPS,
  MOCK_RECURRING_PROBLEMS,
  MOCK_SRV_TICKETS,
  MOCK_SUBCONTRACTORS,
  MOCK_POCS,
  ERROR_DEMO_DEALERSHIP_ID,
  ERROR_DEMO_SRV_ID,
} from './mockData';
import type { Dealership, RecurringProblem, SrvTicket, Subcontractor, DealershipPOC } from './types';

export async function listDealerships(): Promise<Dealership[]> {
  return mockQuery(MOCK_DEALERSHIPS);
}

export async function getDealership(id: string): Promise<Dealership> {
  const found = MOCK_DEALERSHIPS.find((d) => d.id === id);
  if (!found) return mockQueryError(`Dealership ${id} not found`);
  return mockQuery(found);
}

export async function listRecurringProblems(dealershipId: string): Promise<RecurringProblem[]> {
  if (dealershipId === ERROR_DEMO_DEALERSHIP_ID) {
    return mockQueryError('No se pudo cargar el historial de este sitio');
  }
  return mockQuery(MOCK_RECURRING_PROBLEMS.filter((p) => p.dealershipId === dealershipId));
}

export async function listSrvTickets(): Promise<SrvTicket[]> {
  return mockQuery(MOCK_SRV_TICKETS);
}

export async function getSrvTicket(id: string): Promise<SrvTicket> {
  if (id === ERROR_DEMO_SRV_ID) return mockQueryError('No se pudo cargar este ticket SRV');
  const found = MOCK_SRV_TICKETS.find((t) => t.id === id);
  if (!found) return mockQueryError(`SRV ${id} not found`);
  return mockQuery(found);
}

export async function listSubcontractors(region: string): Promise<Subcontractor[]> {
  if (region === 'ERROR_DEMO_REGION') return mockQueryError('No se pudo cargar subcontractors');
  return mockQuery(MOCK_SUBCONTRACTORS.filter((s) => s.region === region));
}

/**
 * No Error state exists for POCCard by design (Design Review Pass 2 — its
 * table lists "—" in the Error column) — this never rejects, only
 * resolves to a POC or null, even for the error-demo dealership.
 */
export async function getDealershipPOC(dealershipId: string): Promise<DealershipPOC | null> {
  return mockQuery(MOCK_POCS.find((poc) => poc.dealershipId === dealershipId) ?? null);
}
```

- [ ] **Step 4: Create `src/features/services/presentation.ts`**

```ts
import type { BadgeTone } from '@/components/ui/Badge';
import type { SrvStatus, EquipmentItemStatus, ProblemSeverity } from './types';

export const SRV_STATUS_LABELS: Record<SrvStatus, string> = {
  requires_action: 'Requires Action',
  ready: 'Ready',
  equipment_delivered: 'Equipment Delivered',
  waiting: 'Waiting',
  awaiting_info: 'Awaiting Info',
  today: 'Today',
  service_completed: 'Service Completed',
};

/** Design Review Pass 5's exact mapping — reuses the same 4 tone
 *  meanings tickets/SLA severity already use, no new colors invented. */
export const SRV_STATUS_TONES: Record<SrvStatus, BadgeTone> = {
  requires_action: 'danger',
  ready: 'success',
  equipment_delivered: 'success',
  waiting: 'warning',
  awaiting_info: 'warning',
  today: 'info',
  service_completed: 'info',
};

export const EQUIPMENT_ITEM_LABELS: Record<EquipmentItemStatus, string> = {
  confirmed: 'Confirmed',
  missing: 'Missing',
  in_transit: 'In transit',
};

export const EQUIPMENT_ITEM_TONES: Record<EquipmentItemStatus, BadgeTone> = {
  confirmed: 'success',
  missing: 'danger',
  in_transit: 'warning',
};

export const PROBLEM_SEVERITY_TONES: Record<ProblemSeverity, BadgeTone> = {
  low: 'neutral',
  medium: 'warning',
  high: 'danger',
  critical: 'danger',
};

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
```

- [ ] **Step 5: Verify**

Run: `npm run build`
Expected: succeeds.

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/features/services/types.ts src/features/services/mockData.ts src/features/services/api.ts src/features/services/presentation.ts
git commit -m "feat(services): add SRV/Dealership/Subcontractor/POC types, mock dataset, mock API and presentation helpers"
```

---

## Task 4: RecurringProblemsPanel + DealershipView

**Files:**
- Create: `src/features/services/RecurringProblemsPanel.tsx`
- Modify: `src/features/services/DealershipView.tsx` (replace Task 2's placeholder body)
- Test: `e2e/services-recurring-problems.spec.ts`

**Interfaces:**
- Consumes: `listRecurringProblems(dealershipId)` (Task 3's `api.ts`), `PROBLEM_SEVERITY_TONES`/`formatDate` (Task 3's `presentation.ts`).
- Produces: `RecurringProblemsPanel({ dealershipId: string })`.

- [ ] **Step 1: Write the failing E2E test**

Create `e2e/services-recurring-problems.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { mockAuthenticatedSupervisor } from './support';

test('shows the recurring problems list for a dealership with open problems', async ({ page }) => {
  await mockAuthenticatedSupervisor(page, { forwardUnmatched: false });
  await page.goto('/app/services/dealerships/dealership-atl-01');
  await expect(page.getByText('Elevator lift intermittent fault')).toBeVisible();
  await expect(page.getByText('Bay door sensor misaligned')).toBeVisible();
});

test('shows a reassuring empty state for a dealership with no open problems', async ({ page }) => {
  await mockAuthenticatedSupervisor(page, { forwardUnmatched: false });
  await page.goto('/app/services/dealerships/dealership-chg-01');
  await expect(page.getByTestId('recurring-problems-empty')).toContainText(
    'Sin otros problemas abiertos en este dealership',
  );
});

test('shows an error state with retry for a dealership whose history fails to load', async ({ page }) => {
  await mockAuthenticatedSupervisor(page, { forwardUnmatched: false });
  await page.goto('/app/services/dealerships/dealership-error-demo');
  await expect(page.getByText('No se pudo cargar el historial de este sitio')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test e2e/services-recurring-problems.spec.ts`
Expected: FAIL — Task 2's placeholder `DealershipView` renders none of this text.

- [ ] **Step 3: Create `src/features/services/RecurringProblemsPanel.tsx`**

```tsx
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ErrorState } from '@/components/ui/states';
import { listRecurringProblems } from './api';
import { PROBLEM_SEVERITY_TONES, formatDate } from './presentation';

export function RecurringProblemsPanel({ dealershipId }: { dealershipId: string }) {
  const query = useQuery({
    queryKey: ['services', 'recurring-problems', dealershipId],
    queryFn: () => listRecurringProblems(dealershipId),
  });
  const problems = query.data ?? [];

  return (
    <Card data-testid="recurring-problems-panel">
      <CardHeader>
        <CardTitle>Recurring problems at this dealership</CardTitle>
      </CardHeader>

      {query.isLoading ? (
        <div className="space-y-2" aria-hidden="true">
          {[0, 1].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-xl bg-services-surface-container" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState
          error={query.error}
          title="No se pudo cargar el historial de este sitio"
          onRetry={() => query.refetch()}
          compact
        />
      ) : problems.length === 0 ? (
        <div data-testid="recurring-problems-empty" className="flex flex-col items-center gap-2 py-6 text-center">
          <CheckCircle2 className="h-8 w-8 text-emerald-500" aria-hidden="true" />
          <p className="text-sm font-bold text-services-on-surface">
            Sin otros problemas abiertos en este dealership
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {problems.map((problem) => (
            <li
              key={problem.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-services-border bg-services-surface-container px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-services-on-surface">{problem.title}</p>
                <p className="text-xs text-services-on-surface-variant">{formatDate(problem.occurredAt)}</p>
              </div>
              <Badge tone={PROBLEM_SEVERITY_TONES[problem.severity]} size="sm">
                {problem.severity}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
```

- [ ] **Step 4: Replace `src/features/services/DealershipView.tsx`**

```tsx
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import { DepartmentScope } from '@/components/layout/DepartmentScope';
import { PageHeader } from '@/components/ui/PageHeader';
import { LoadingState, ErrorState } from '@/components/ui/states';
import { getDealership } from './api';
import { RecurringProblemsPanel } from './RecurringProblemsPanel';

export default function DealershipView() {
  const { dealershipId } = useParams<{ dealershipId: string }>();
  const query = useQuery({
    queryKey: ['services', 'dealership', dealershipId],
    queryFn: () => getDealership(dealershipId!),
    enabled: Boolean(dealershipId),
  });

  if (query.isLoading) {
    return (
      <DepartmentScope department="services" className="bg-services-background text-services-on-surface min-h-full p-6 lg:p-8">
        <LoadingState label="Loading dealership…" />
      </DepartmentScope>
    );
  }

  if (query.isError || !query.data) {
    return (
      <DepartmentScope department="services" className="bg-services-background text-services-on-surface min-h-full p-6 lg:p-8">
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      </DepartmentScope>
    );
  }

  return (
    <DepartmentScope
      department="services"
      className="bg-services-background text-services-on-surface min-h-full space-y-6 p-6 lg:p-8"
    >
      <PageHeader
        title={query.data.name}
        description={`${query.data.city}, ${query.data.state}`}
        eyebrow={
          <span className="mb-1 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-services-accent">
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
            Dealership
          </span>
        }
      />
      <RecurringProblemsPanel dealershipId={query.data.id} />
    </DepartmentScope>
  );
}
```

- [ ] **Step 5: Run the test again to verify it passes**

Run: `npx playwright test e2e/services-recurring-problems.spec.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/features/services/RecurringProblemsPanel.tsx src/features/services/DealershipView.tsx e2e/services-recurring-problems.spec.ts
git commit -m "feat(services): add RecurringProblemsPanel and wire it into DealershipView"
```

---

## Task 5: ServicesDashboard (KPI tiles + scope tabs + ticket list)

**Files:**
- Modify: `src/features/services/ServicesDashboard.tsx` (replace Task 2's placeholder body)
- Test: `e2e/services-dashboard.spec.ts`

**Interfaces:**
- Consumes: `listSrvTickets()` (Task 3's `api.ts`), `SRV_STATUS_LABELS`/`SRV_STATUS_TONES` (Task 3's `presentation.ts`), `SrvStatus`/`SrvTicket` (Task 3's `types.ts`).
- Produces: navigation to `/app/services/tickets/:id` on ticket-row click (consumed visually by Task 11's journey test).

Note on the KPI tiles' Error column (Design Review Pass 2 says "tile individual con '—' + tooltip de error, el resto sigue funcionando"): all 4 tiles derive their counts from ONE shared ticket-list query, the same reason `Dashboard.tsx` (`features/dashboard/Dashboard.tsx`) already documents for not firing 4 parallel list requests just to render 4 numbers. A single shared query can't fail for only one tile — so this task treats "the rest keeps working" as the tabs/list-shell staying interactive, not literally 3-of-4 tiles independently succeeding, and every tile shows "—" together on a shared-query failure. This is a deliberate, documented deviation from the design doc's literal per-tile independence, not an oversight.

- [ ] **Step 1: Write the failing E2E test**

Create `e2e/services-dashboard.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { mockAuthenticatedSupervisor } from './support';

test('KPI tiles filter the ticket list on click', async ({ page }) => {
  await mockAuthenticatedSupervisor(page, { forwardUnmatched: false });
  await page.goto('/app/services');
  await expect(page.getByTestId('services-ticket-row-srv-1001')).toBeVisible();
  await page.getByTestId('services-kpi-requires-action').click();
  await expect(page.getByTestId('services-ticket-row-srv-1001')).toBeVisible();
  await expect(page.getByTestId('services-ticket-row-srv-1002')).toHaveCount(0);
});

test('scope tabs narrow the ticket list', async ({ page }) => {
  await mockAuthenticatedSupervisor(page, { forwardUnmatched: false });
  await page.goto('/app/services');
  await page.getByRole('tab', { name: 'All' }).click();
  await expect(page.getByTestId('services-ticket-row-srv-1002')).toBeVisible();
  await page.getByRole('tab', { name: 'My Work' }).click();
  await expect(page.getByTestId('services-ticket-row-srv-1002')).toHaveCount(0);
});

test('clicking a ticket row navigates to its SRV detail', async ({ page }) => {
  await mockAuthenticatedSupervisor(page, { forwardUnmatched: false });
  await page.goto('/app/services');
  await page.getByTestId('services-ticket-row-srv-1001').click();
  await expect(page).toHaveURL(/\/app\/services\/tickets\/srv-1001/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test e2e/services-dashboard.spec.ts`
Expected: FAIL — Task 2's placeholder renders no KPI tiles, tabs, or ticket rows.

- [ ] **Step 3: Replace `src/features/services/ServicesDashboard.tsx`**

```tsx
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Clock, Sun, type LucideIcon } from 'lucide-react';
import { DepartmentScope } from '@/components/layout/DepartmentScope';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tabs } from '@/components/ui/Tabs';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/states';
import { listSrvTickets } from './api';
import { SRV_STATUS_LABELS, SRV_STATUS_TONES } from './presentation';
import type { SrvStatus, SrvTicket } from './types';

type KpiKey = 'requires-action' | 'ready' | 'waiting' | 'today';
type Scope = 'mine' | 'team' | 'all';

const KPI_TILES: Array<{ key: KpiKey; label: string; icon: LucideIcon; statuses: SrvStatus[] }> = [
  { key: 'requires-action', label: 'Requires Action', icon: AlertTriangle, statuses: ['requires_action'] },
  { key: 'ready', label: 'Ready', icon: CheckCircle2, statuses: ['ready', 'equipment_delivered'] },
  { key: 'waiting', label: 'Waiting', icon: Clock, statuses: ['waiting', 'awaiting_info'] },
  { key: 'today', label: 'Today', icon: Sun, statuses: ['today', 'service_completed'] },
];

const SCOPE_TABS: Array<{ key: Scope; label: string }> = [
  { key: 'mine', label: 'My Work' },
  { key: 'team', label: 'Team' },
  { key: 'all', label: 'All' },
];

function ticketVisibleInScope(ticket: SrvTicket, scope: Scope): boolean {
  if (scope === 'all') return true;
  if (scope === 'team') return ticket.assignedScope === 'mine' || ticket.assignedScope === 'team';
  return ticket.assignedScope === 'mine';
}

export default function ServicesDashboard() {
  const navigate = useNavigate();
  const [scope, setScope] = useState<Scope>('mine');
  const [kpiFilter, setKpiFilter] = useState<KpiKey | null>(null);
  const query = useQuery({ queryKey: ['services', 'srv-tickets'], queryFn: listSrvTickets });
  const tickets = query.data ?? [];

  const scoped = useMemo(
    () => tickets.filter((ticket) => ticketVisibleInScope(ticket, scope)),
    [tickets, scope],
  );
  const visible = useMemo(() => {
    if (!kpiFilter) return scoped;
    const tile = KPI_TILES.find((t) => t.key === kpiFilter)!;
    return scoped.filter((ticket) => tile.statuses.includes(ticket.status));
  }, [scoped, kpiFilter]);

  return (
    <DepartmentScope
      department="services"
      className="bg-services-background text-services-on-surface min-h-full space-y-6 p-6 lg:p-8"
    >
      <PageHeader title="Services" description="Dispatch, equipment and recurring problems by dealership." />

      {/* 4 KPI tiles are deliberately kept (Design Review Pass 4, Decision
          2) — they're actionable filters, not decoration, straight from
          the reference mockup. Mobile collapses to a 2-visible horizontal
          scroll (Design Review Pass 6) via `overflow-x-auto` + `grid-cols-2`. */}
      <div className="grid grid-cols-2 gap-3 overflow-x-auto sm:grid-cols-4 sm:gap-4">
        {KPI_TILES.map((tile) => {
          const Icon = tile.icon;
          const count = query.isError
            ? null
            : scoped.filter((ticket) => tile.statuses.includes(ticket.status)).length;
          const active = kpiFilter === tile.key;
          return (
            <button
              key={tile.key}
              type="button"
              data-testid={`services-kpi-${tile.key}`}
              onClick={() => setKpiFilter(active ? null : tile.key)}
              className={`min-h-[44px] rounded-2xl border p-4 text-left transition-colors ${
                active
                  ? 'border-services-accent bg-services-accent/10'
                  : 'border-services-border bg-services-surface-container hover:bg-services-surface-container-low'
              }`}
            >
              <Icon className="h-5 w-5 text-services-accent" aria-hidden="true" />
              <div className="mt-2 text-2xl font-black">
                {query.isLoading ? (
                  <span className="inline-block h-6 w-8 animate-pulse rounded bg-services-surface-container-low" />
                ) : count === null ? (
                  <span title="No se pudo cargar este conteo">—</span>
                ) : (
                  count
                )}
              </div>
              <div className="text-xs font-semibold text-services-on-surface-variant">{tile.label}</div>
            </button>
          );
        })}
      </div>

      <Tabs
        items={SCOPE_TABS}
        value={scope}
        onChange={(key) => setScope(key as Scope)}
        aria-label="Ticket scope"
      />

      {query.isLoading ? (
        <LoadingState label="Loading Services tickets…" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : visible.length === 0 ? (
        <EmptyState icon="inbox" title="No tickets in this view" description="Try a different scope or clear the KPI filter." />
      ) : (
        <ul className="space-y-2">
          {visible.map((ticket) => (
            <li key={ticket.id}>
              <button
                type="button"
                data-testid={`services-ticket-row-${ticket.id}`}
                onClick={() => navigate(`/app/services/tickets/${ticket.id}`)}
                className="flex min-h-[44px] w-full items-center justify-between gap-3 rounded-xl border border-services-border bg-services-surface-container px-4 py-3 text-left hover:bg-services-surface-container-low"
              >
                <div className="min-w-0">
                  <div className="font-mono text-[11px] font-bold text-services-accent">{ticket.humanId}</div>
                  <div className="truncate text-sm font-semibold">{ticket.title}</div>
                </div>
                <StatusBadge label={SRV_STATUS_LABELS[ticket.status]} tone={SRV_STATUS_TONES[ticket.status]} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </DepartmentScope>
  );
}
```

- [ ] **Step 4: Run the test again to verify it passes**

Run: `npx playwright test e2e/services-dashboard.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/services/ServicesDashboard.tsx e2e/services-dashboard.spec.ts
git commit -m "feat(services): build ServicesDashboard KPI tiles, scope tabs and ticket list"
```

---

## Task 6: SubcontractorPicker embedded in SrvDetail

**Files:**
- Create: `src/features/services/SubcontractorPicker.tsx`
- Modify: `src/features/services/SrvDetail.tsx` (replace Task 2's placeholder body — this task's version is still partial; Tasks 7–9 add the rest)
- Test: `e2e/services-subcontractor-picker.spec.ts`

**Interfaces:**
- Produces: `SubcontractorPicker({ region: string; selectedId?: string; onSelect: (subcontractorId: string) => void })`.
- Consumes: `listSubcontractors(region)` (Task 3's `api.ts`), `getSrvTicket`/`getDealership` (Task 3's `api.ts`) inside `SrvDetail`.

- [ ] **Step 1: Write the failing E2E test**

Create `e2e/services-subcontractor-picker.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { mockAuthenticatedSupervisor } from './support';

test('SrvDetail shows subcontractor options for the dealership region and lets the agent pick one', async ({ page }) => {
  await mockAuthenticatedSupervisor(page, { forwardUnmatched: false });
  await page.goto('/app/services/tickets/srv-1001');
  await expect(page.getByText('Nighthawk Technologies Solutions')).toBeVisible();
  await page.getByRole('option', { name: /Ironclad Facilities Services/ }).click();
  await expect(page.getByRole('option', { name: /Ironclad Facilities Services/ })).toHaveAttribute('aria-selected', 'true');
});

test('SubcontractorPicker shows a request-coverage empty state for a region with no coverage', async ({ page }) => {
  await mockAuthenticatedSupervisor(page, { forwardUnmatched: false });
  await page.goto('/app/services/tickets/srv-1002');
  await expect(page.getByTestId('subcontractor-picker-empty')).toContainText(
    'No hay subcontractors disponibles en esta región todavía',
  );
  await expect(page.getByTestId('subcontractor-request-coverage')).toBeVisible();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test e2e/services-subcontractor-picker.spec.ts`
Expected: FAIL — Task 2's placeholder renders none of this.

- [ ] **Step 3: Create `src/features/services/SubcontractorPicker.tsx`**

```tsx
import { useQuery } from '@tanstack/react-query';
import { Users } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/states';
import { listSubcontractors } from './api';

export interface SubcontractorPickerProps {
  region: string;
  selectedId?: string;
  onSelect: (subcontractorId: string) => void;
}

export function SubcontractorPicker({ region, selectedId, onSelect }: SubcontractorPickerProps) {
  const query = useQuery({
    queryKey: ['services', 'subcontractors', region],
    queryFn: () => listSubcontractors(region),
  });
  const subcontractors = query.data ?? [];

  return (
    <Card data-testid="subcontractor-picker">
      <CardHeader>
        <CardTitle>Subcontractor</CardTitle>
      </CardHeader>

      {query.isLoading ? (
        <div className="space-y-2" aria-hidden="true">
          {[0, 1].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-services-surface-container" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState
          title="No se pudo cargar subcontractors"
          error={query.error}
          onRetry={() => query.refetch()}
          compact
        />
      ) : subcontractors.length === 0 ? (
        <div data-testid="subcontractor-picker-empty" className="flex flex-col items-center gap-3 py-6 text-center">
          <Users className="h-8 w-8 text-services-on-surface-variant" aria-hidden="true" />
          <p className="text-sm font-bold">No hay subcontractors disponibles en esta región todavía</p>
          <Button data-testid="subcontractor-request-coverage" variant="secondary" size="sm">
            Solicitar cobertura
          </Button>
        </div>
      ) : (
        <ul className="space-y-2" role="listbox" aria-label="Subcontractors">
          {subcontractors.map((sub) => {
            const selected = sub.id === selectedId;
            return (
              <li key={sub.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => onSelect(sub.id)}
                  className={`flex min-h-[44px] w-full flex-col items-start gap-1 rounded-xl border px-4 py-2.5 text-left transition-colors ${
                    selected
                      ? 'border-services-accent bg-services-accent/10'
                      : 'border-services-border bg-services-surface-container hover:bg-services-surface-container-low'
                  }`}
                >
                  <span className="font-semibold">{sub.name}</span>
                  <span className="text-xs text-services-on-surface-variant">{sub.region}</span>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {sub.skills.map((skill) => (
                      <Badge key={skill} tone="neutral" size="sm">{skill}</Badge>
                    ))}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
```

- [ ] **Step 4: Replace `src/features/services/SrvDetail.tsx`**

```tsx
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { DepartmentScope } from '@/components/layout/DepartmentScope';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { LoadingState, ErrorState } from '@/components/ui/states';
import { getSrvTicket, getDealership } from './api';
import { SubcontractorPicker } from './SubcontractorPicker';

export default function SrvDetail() {
  const { id } = useParams<{ id: string }>();
  const [subcontractorId, setSubcontractorId] = useState<string | undefined>(undefined);

  const ticketQuery = useQuery({
    queryKey: ['services', 'srv-ticket', id],
    queryFn: () => getSrvTicket(id!),
    enabled: Boolean(id),
  });
  const dealershipId = ticketQuery.data?.dealershipId;
  const dealershipQuery = useQuery({
    queryKey: ['services', 'dealership', dealershipId],
    queryFn: () => getDealership(dealershipId!),
    enabled: Boolean(dealershipId),
  });

  if (ticketQuery.isLoading) {
    return (
      <DepartmentScope department="services" className="bg-services-background text-services-on-surface min-h-full p-6 lg:p-8">
        <LoadingState label="Loading SRV ticket…" />
      </DepartmentScope>
    );
  }

  if (ticketQuery.isError || !ticketQuery.data) {
    return (
      <DepartmentScope department="services" className="bg-services-background text-services-on-surface min-h-full p-6 lg:p-8">
        <ErrorState error={ticketQuery.error} onRetry={() => ticketQuery.refetch()} />
      </DepartmentScope>
    );
  }

  const ticket = ticketQuery.data;

  return (
    <DepartmentScope
      department="services"
      className="bg-services-background text-services-on-surface min-h-full space-y-6 p-6 lg:p-8"
    >
      <PageHeader title={ticket.title} description={ticket.humanId} />

      {dealershipQuery.data ? (
        <SubcontractorPicker
          region={dealershipQuery.data.region}
          selectedId={subcontractorId ?? ticket.subcontractorId}
          onSelect={setSubcontractorId}
        />
      ) : (
        <Card><LoadingState label="Loading dealership context…" compact /></Card>
      )}
    </DepartmentScope>
  );
}
```

- [ ] **Step 5: Run the test again to verify it passes**

Run: `npx playwright test e2e/services-subcontractor-picker.spec.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/features/services/SubcontractorPicker.tsx src/features/services/SrvDetail.tsx e2e/services-subcontractor-picker.spec.ts
git commit -m "feat(services): add SubcontractorPicker and wire it into SrvDetail"
```

---

## Task 7: POCCard embedded in SrvDetail

**Files:**
- Create: `src/features/services/POCCard.tsx`
- Modify: `src/features/services/SrvDetail.tsx` (add POCCard alongside SubcontractorPicker)
- Test: `e2e/services-poc-card.spec.ts`

**Interfaces:**
- Produces: `POCCard({ dealershipId: string })`.
- Consumes: `getDealershipPOC(dealershipId)` (Task 3's `api.ts`).

- [ ] **Step 1: Write the failing E2E test**

Create `e2e/services-poc-card.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { mockAuthenticatedSupervisor } from './support';

test('POCCard shows the receiving contact when one is assigned', async ({ page }) => {
  await mockAuthenticatedSupervisor(page, { forwardUnmatched: false });
  await page.goto('/app/services/tickets/srv-1001');
  await expect(page.getByTestId('poc-card')).toContainText('Marcus Webb');
});

test('POCCard shows "no POC assigned" for a dealership with none', async ({ page }) => {
  await mockAuthenticatedSupervisor(page, { forwardUnmatched: false });
  await page.goto('/app/services/tickets/srv-1002');
  await expect(page.getByTestId('poc-card-empty')).toContainText('Sin POC asignado');
  await expect(page.getByTestId('poc-request-it')).toBeVisible();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test e2e/services-poc-card.spec.ts`
Expected: FAIL — `SrvDetail` doesn't render a POC card yet.

- [ ] **Step 3: Create `src/features/services/POCCard.tsx`**

```tsx
import { useQuery } from '@tanstack/react-query';
import { Mail, Phone, UserX } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { getDealershipPOC } from './api';

/** No Error state by design (Design Review Pass 2) — getDealershipPOC
 *  never rejects, so this only ever renders Loading/Empty/Success. */
export function POCCard({ dealershipId }: { dealershipId: string }) {
  const query = useQuery({
    queryKey: ['services', 'poc', dealershipId],
    queryFn: () => getDealershipPOC(dealershipId),
  });

  return (
    <Card data-testid="poc-card">
      <CardHeader>
        <CardTitle>Receiving contact (POC)</CardTitle>
      </CardHeader>

      {query.isLoading ? (
        <div className="h-16 animate-pulse rounded-xl bg-services-surface-container" aria-hidden="true" />
      ) : !query.data ? (
        <div data-testid="poc-card-empty" className="flex flex-col items-center gap-3 py-4 text-center">
          <UserX className="h-8 w-8 text-services-on-surface-variant" aria-hidden="true" />
          <p className="text-sm font-bold">Sin POC asignado</p>
          <Button data-testid="poc-request-it" variant="secondary" size="sm">
            Solicitar a IT
          </Button>
        </div>
      ) : (
        <dl className="space-y-1.5 text-sm">
          <dd className="font-bold">{query.data.name}</dd>
          <dd className="text-services-on-surface-variant">{query.data.role}</dd>
          <dd className="flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5" aria-hidden="true" />
            {query.data.phone}
          </dd>
          <dd className="flex items-center gap-1.5">
            <Mail className="h-3.5 w-3.5" aria-hidden="true" />
            {query.data.email}
          </dd>
        </dl>
      )}
    </Card>
  );
}
```

- [ ] **Step 4: Add `POCCard` into `src/features/services/SrvDetail.tsx`**

Add the import:

```tsx
import { POCCard } from './POCCard';
```

Add it into the render, in a two-column grid alongside the `SubcontractorPicker`/loading placeholder (replace the single `{dealershipQuery.data ? (...) : (...)}` block with):

```tsx
      <div className="grid gap-4 lg:grid-cols-2">
        <POCCard dealershipId={ticket.dealershipId} />

        {dealershipQuery.data ? (
          <SubcontractorPicker
            region={dealershipQuery.data.region}
            selectedId={subcontractorId ?? ticket.subcontractorId}
            onSelect={setSubcontractorId}
          />
        ) : (
          <Card><LoadingState label="Loading dealership context…" compact /></Card>
        )}
      </div>
```

- [ ] **Step 5: Run the test again to verify it passes**

Run: `npx playwright test e2e/services-poc-card.spec.ts`
Expected: PASS

Run also (regression check): `npx playwright test e2e/services-subcontractor-picker.spec.ts`
Expected: still PASS (the grid wrapper doesn't change SubcontractorPicker's own markup).

- [ ] **Step 6: Commit**

```bash
git add src/features/services/POCCard.tsx src/features/services/SrvDetail.tsx e2e/services-poc-card.spec.ts
git commit -m "feat(services): add POCCard and wire it into SrvDetail alongside SubcontractorPicker"
```

---

## Task 8: SrvDetail equipment checklist

**Files:**
- Modify: `src/features/services/SrvDetail.tsx` (add the equipment checklist card)
- Test: `e2e/services-equipment-checklist.spec.ts`

**Interfaces:**
- Consumes: `EQUIPMENT_ITEM_LABELS`/`EQUIPMENT_ITEM_TONES` (Task 3's `presentation.ts`), `ticket.equipment` (Task 3's `SrvTicket` type, already loaded by `ticketQuery` from Task 6).

- [ ] **Step 1: Write the failing E2E test**

Create `e2e/services-equipment-checklist.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { mockAuthenticatedSupervisor } from './support';

test('equipment checklist renders each item\'s status', async ({ page }) => {
  await mockAuthenticatedSupervisor(page, { forwardUnmatched: false });
  await page.goto('/app/services/tickets/srv-1001');
  await expect(page.getByTestId('srv-equipment-item-eq-1')).toContainText('Missing');
  await expect(page.getByTestId('srv-equipment-item-eq-2')).toContainText('Confirmed');
});

test('an item mid-validation shows an inline spinner instead of a status pill, without blocking the rest of the list', async ({ page }) => {
  await mockAuthenticatedSupervisor(page, { forwardUnmatched: false });
  await page.goto('/app/services/tickets/srv-1001');
  await expect(page.getByTestId('srv-equipment-item-eq-3-spinner')).toBeVisible();
  await expect(page.getByTestId('srv-equipment-item-eq-2')).toContainText('Confirmed');
});

test('an item with a validation error is flagged without hiding the rest of the checklist', async ({ page }) => {
  await mockAuthenticatedSupervisor(page, { forwardUnmatched: false });
  await page.goto('/app/services/tickets/srv-1002');
  await expect(page.getByTestId('srv-equipment-item-eq-4-warning')).toContainText('No se pudo validar');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test e2e/services-equipment-checklist.spec.ts`
Expected: FAIL — no equipment checklist rendered yet.

- [ ] **Step 3: Add the checklist card into `src/features/services/SrvDetail.tsx`**

Add these imports:

```tsx
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EQUIPMENT_ITEM_LABELS, EQUIPMENT_ITEM_TONES } from './presentation';
```

(`Card`, `CardHeader`, `CardTitle` are already imported from Task 6/7 — only add what's missing.)

Add the checklist into the two-column grid from Task 7, as a sibling of `POCCard`/`SubcontractorPicker` (so the grid becomes 3 cells — People, Equipment, Subcontractor — still `lg:grid-cols-2`, wrapping naturally):

```tsx
        <Card data-testid="srv-equipment-checklist">
          <CardHeader>
            <CardTitle>Affected Equipment</CardTitle>
          </CardHeader>
          <ul className="space-y-2">
            {ticket.equipment.map((item) => (
              <li
                key={item.id}
                data-testid={`srv-equipment-item-${item.id}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-services-border bg-services-surface-container px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{item.label} × {item.quantity}</p>
                  {item.validationError && (
                    <p
                      data-testid={`srv-equipment-item-${item.id}-warning`}
                      className="mt-0.5 flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400"
                    >
                      <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                      No se pudo validar
                    </p>
                  )}
                </div>
                {item.isValidating ? (
                  <Loader2
                    data-testid={`srv-equipment-item-${item.id}-spinner`}
                    className="h-4 w-4 shrink-0 animate-spin text-services-on-surface-variant"
                    aria-hidden="true"
                  />
                ) : (
                  <Badge tone={EQUIPMENT_ITEM_TONES[item.status]} size="sm">
                    {EQUIPMENT_ITEM_LABELS[item.status]}
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        </Card>
```

- [ ] **Step 4: Run the test again to verify it passes**

Run: `npx playwright test e2e/services-equipment-checklist.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/services/SrvDetail.tsx e2e/services-equipment-checklist.spec.ts
git commit -m "feat(services): add the equipment checklist to SrvDetail"
```

---

## Task 9: SrvDetail Next Action / Blockers / status header

**Files:**
- Modify: `src/features/services/SrvDetail.tsx` (add `PageHeader` status pill, Next Action card, Blockers banner)
- Test: `e2e/services-next-action-blockers.spec.ts`

**Interfaces:**
- Consumes: `SRV_STATUS_LABELS`/`SRV_STATUS_TONES` (Task 3's `presentation.ts`), `ticket.equipment`/`ticket.status` (already loaded).

Note (Design Review Pass 1 vs. PR Scoping conflict, resolved explicitly): Pass 1's information hierarchy lists a **Progress stepper** as the #1 item on this page. That stepper is Recommended Approach **step 7 — explicit PR2 scope**, blocked on `WF-TODO-001`/`WF-TODO-006` (see this plan's header and PR Scoping in the spec). This task does **not** build it. In its place, the page's `PageHeader` carries a plain `StatusBadge` (already added structurally in Task 6's `PageHeader`, this task upgrades it to show the real status) — the rest of the Pass 1 hierarchy (Next Action, Blockers, People, Affected Equipment) is unaffected and built here/Tasks 6–8.

- [ ] **Step 1: Write the failing E2E test**

Create `e2e/services-next-action-blockers.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { mockAuthenticatedSupervisor } from './support';

test('the status pill in the header reflects the ticket\'s real status', async ({ page }) => {
  await mockAuthenticatedSupervisor(page, { forwardUnmatched: false });
  await page.goto('/app/services/tickets/srv-1001');
  await expect(page.getByText('Requires Action')).toBeVisible();
});

test('a missing equipment item surfaces as a page-level blocker banner, and the primary action is enabled', async ({ page }) => {
  await mockAuthenticatedSupervisor(page, { forwardUnmatched: false });
  await page.goto('/app/services/tickets/srv-1001');
  await expect(page.getByText('Missing equipment is blocking dispatch')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Resolve blockers' })).toBeEnabled();
});

test('a ticket with no missing equipment shows no blocker banner, and the primary action is disabled', async ({ page }) => {
  await mockAuthenticatedSupervisor(page, { forwardUnmatched: false });
  await page.goto('/app/services/tickets/srv-1002');
  await expect(page.getByText('Missing equipment is blocking dispatch')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Resolve blockers' })).toBeDisabled();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test e2e/services-next-action-blockers.spec.ts`
Expected: FAIL — no status pill, Next Action card, or blocker banner rendered yet.

- [ ] **Step 3: Add the header status pill, Next Action card and Blockers banner to `src/features/services/SrvDetail.tsx`**

Add imports:

```tsx
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/Button';
import { SRV_STATUS_LABELS, SRV_STATUS_TONES } from './presentation';
```

(merge `SRV_STATUS_LABELS`/`SRV_STATUS_TONES` into the existing `presentation` import from Task 8 rather than a second import line.)

Replace the `<PageHeader title={ticket.title} description={ticket.humanId} />` line with:

```tsx
      <PageHeader
        title={ticket.title}
        description={ticket.humanId}
        actions={<StatusBadge label={SRV_STATUS_LABELS[ticket.status]} tone={SRV_STATUS_TONES[ticket.status]} />}
      />

      {/* Next Action — the single primary button on the screen (Design
          Review Pass 1). PR1 has no per-status action copy beyond this
          one blocking check (Design Review Pass 7 leaves exact per-stage
          copy an open decision for PR2's stepper work). */}
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-services-on-surface-variant">
            Next Action
          </div>
          <p className="mt-1 text-sm">
            {ticket.status === 'requires_action'
              ? 'Confirm the missing equipment below before dispatch.'
              : 'No blocking action right now.'}
          </p>
        </div>
        <Button disabled={!ticket.equipment.some((item) => item.status === 'missing')}>
          Resolve blockers
        </Button>
      </Card>

      {/* Blockers — never hidden behind a tab (Design Review Pass 1). */}
      {ticket.equipment.some((item) => item.status === 'missing') && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          Missing equipment is blocking dispatch — see the checklist below.
        </div>
      )}
```

(`AlertTriangle` is already imported from Task 8.)

- [ ] **Step 4: Run the test again to verify it passes**

Run: `npx playwright test e2e/services-next-action-blockers.spec.ts`
Expected: PASS

Run also (regression check): `npx playwright test e2e/services-equipment-checklist.spec.ts e2e/services-poc-card.spec.ts e2e/services-subcontractor-picker.spec.ts`
Expected: all still PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/services/SrvDetail.tsx e2e/services-next-action-blockers.spec.ts
git commit -m "feat(services): add SrvDetail status pill, Next Action and Blockers banner"
```

---

## Task 10: Responsive & accessibility pass

**Files:**
- Modify: `src/features/services/ServicesDashboard.tsx` (verify/adjust touch targets, keyboard activation — likely no changes needed, this task is primarily verification)
- Test: `e2e/services-responsive-a11y.spec.ts`

**Interfaces:**
- Consumes: nothing new — this task verifies Design Review Pass 6 against the components built in Tasks 5–9.

- [ ] **Step 1: Write the failing E2E test**

Create `e2e/services-responsive-a11y.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { mockAuthenticatedSupervisor } from './support';

test('KPI tiles are keyboard-activatable', async ({ page }) => {
  await mockAuthenticatedSupervisor(page, { forwardUnmatched: false });
  await page.goto('/app/services');
  const tile = page.getByTestId('services-kpi-requires-action');
  await tile.focus();
  await expect(tile).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('services-ticket-row-srv-1001')).toBeVisible();
  await expect(page.getByTestId('services-ticket-row-srv-1002')).toHaveCount(0);
});

test('ticket rows meet the 44px minimum touch target', async ({ page }) => {
  await mockAuthenticatedSupervisor(page, { forwardUnmatched: false });
  await page.goto('/app/services');
  const box = await page.getByTestId('services-ticket-row-srv-1001').boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
});

test('KPI tiles collapse to a 2-column grid below the sm breakpoint', async ({ page }) => {
  await mockAuthenticatedSupervisor(page, { forwardUnmatched: false });
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto('/app/services');
  const grid = page.getByTestId('services-kpi-requires-action').locator('..');
  await expect(grid).toHaveClass(/grid-cols-2/);
});
```

- [ ] **Step 2: Run it to verify it fails (or passes already)**

Run: `npx playwright test e2e/services-responsive-a11y.spec.ts`
Expected: this may already PASS as-is, since Tasks 5–9 already used native `<button>` elements (keyboard-activatable by default), `min-h-[44px]` on every tile/row, and `grid-cols-2 sm:grid-cols-4` on the KPI grid. If it fails, the specific failing assertion tells you which of those three properties regressed — fix it in `ServicesDashboard.tsx` directly (add the missing `min-h-[44px]`/`grid-cols-2` class, or swap a non-focusable element for a `<button>`).

- [ ] **Step 3: Fix anything the test surfaces, or confirm it already passes**

No blind changes here — only touch `ServicesDashboard.tsx` if Step 2 actually fails, and only the specific class/element the failing assertion names.

- [ ] **Step 4: Run the test again to verify it passes**

Run: `npx playwright test e2e/services-responsive-a11y.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add e2e/services-responsive-a11y.spec.ts
# If Step 3 required a fix:
git add src/features/services/ServicesDashboard.tsx
git commit -m "test(services): verify keyboard activation, touch targets and mobile KPI layout"
```

---

## Task 11: Full journey integration test + build/lint gate

**Files:**
- Test: `e2e/services-department-journey.spec.ts`

**Interfaces:**
- Consumes: everything built in Tasks 2–9, end to end.

This is the final gate — it doesn't add new product code, it proves the whole PR1 slice holds together as one journey (Design Review Pass 3's storyboard: dashboard → dealership → ticket → subcontractor pick), then runs the full build/lint gate the same way every other feature in this repo is expected to before a PR.

- [ ] **Step 1: Write the journey test**

Create `e2e/services-department-journey.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { mockAuthenticatedSupervisor } from './support';

test('nav exposes Services, and the full journey stays inside /app/services', async ({ page }) => {
  await mockAuthenticatedSupervisor(page, { forwardUnmatched: false });

  await page.goto('/app');
  await page.locator('#app-nav').getByRole('link', { name: 'Services' }).click();
  await expect(page).toHaveURL(/\/app\/services$/);

  await page.getByTestId('services-ticket-row-srv-1001').click();
  await expect(page).toHaveURL(/\/app\/services\/tickets\/srv-1001/);
  await expect(page.getByText('Requires Action')).toBeVisible();

  await page.getByRole('option', { name: /Ironclad Facilities Services/ }).click();
  await expect(page.getByRole('option', { name: /Ironclad Facilities Services/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );

  await page.goto('/app/services/dealerships/dealership-atl-01');
  await expect(page.getByText('Elevator lift intermittent fault')).toBeVisible();
});
```

- [ ] **Step 2: Run it**

Run: `npx playwright test e2e/services-department-journey.spec.ts`
Expected: PASS (every step was already built and individually tested in Tasks 2–9; this only proves the composition).

- [ ] **Step 3: Run the full Services E2E suite together**

Run: `npx playwright test e2e/services-*.spec.ts`
Expected: all PASS — this catches any cross-task regression (e.g. a later task's markup change breaking an earlier task's `data-testid` selector) that running each spec file in isolation wouldn't.

- [ ] **Step 4: Run the project-wide build/lint gate**

Run: `npm run build`
Expected: succeeds — `tsc -b` across the whole app, not just `src/features/services/`.

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 5: Review against the spec's Success Criteria (PR1 subset)**

Confirm, don't just assert in code — actually re-read [`docs/designs/services-department-frontend.md`](../../designs/services-department-frontend.md)'s "Success Criteria" section and check off the PR1-scoped ones:
- ✅ "Un agente de Services puede abrir un PRB escalado por IT y ver, en una sola pantalla, el checklist de equipamiento obligatorio + los demás problemas recurrentes de ese dealership" — `SrvDetail` (checklist) + `DealershipView` (recurring problems) both exist; they're two screens, not one, because the spec's own Recommended Approach separates SRV detail (step 3) from the dealership panel (step 2) — note this as a known gap if the user wants them merged, don't silently merge two already-approved separate routes.
- ✅ "El módulo Services tiene tema visual propio (vía `data-department`), visible solo dentro de `/services/*`" — Task 2.
- ⬜ Quote/invoice summary, WorkflowBuilder embed, and the progress stepper — explicitly **PR2**, not evaluated here.
- ⬜ The `SRV`/Subcontractor ADRs — a docs deliverable, not frontend code; out of this plan's scope entirely (see "The Assignment" in the spec).

- [ ] **Step 6: Commit**

```bash
git add e2e/services-department-journey.spec.ts
git commit -m "test(services): add full Services PR1 journey integration test"
```
