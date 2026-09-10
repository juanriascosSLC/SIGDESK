# Glossary Terminology Frontend Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Propagate the 2026-09-08/09 terminology renames from the reconciled backend glossary (`Docs/glossary.md`, branch `docs/glosario-goals-roadmap-lane-a`) into SIG-Desk-Frontend's visible UI copy and internal documentation, and fix five independent, already-diagnosed audit findings that don't require a product decision first.

**Architecture:** Pure display-text and documentation edits — no TypeScript type, field name, or API contract changes. Every renamed *code identifier* (Go struct `Company`, wire field `company_id`, endpoint `/admin/companies`, i18n key `catalogBuilder`, nav section id `itsm`) stays exactly as-is; only the human-facing string values change. This mirrors the same discipline used for the 7 severity-alta bug fixes earlier in this session (e.g. `assetId` field kept, only its misleading comment fixed) — renaming an identifier that already ships in a request/response body or a route is a backend-coordinated change (tracked as TODO-188/TODO-189 in `SIG-Desk-Backend/Docs/TODOS.md`), not a frontend-only edit.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind CSS, react-router-dom, @tanstack/react-query.

**Spec:** `SIG-Desk-Backend/Docs/glossary.md` (branch `docs/glosario-goals-roadmap-lane-a`) is the terminology source of truth for every rename in this plan. Cross-reference: `SIG-Desk-Backend/Docs/TODOS.md` TODO-188 (Catalog Builder → Entity Builder, backend) and TODO-189 (Company → Unidad organizacional, backend) — both still open; this plan does not depend on them, but Task 6 explicitly must not collide with them.

## Global Constraints

- **Disk space blocker, project-wide.** `C:` has 0 bytes free as of 2026-09-09 (confirmed via `df -h C:` during this session's `governor` review). `npm install`, `npm run build`, `npm run typecheck`, `vitest`, and `playwright test` cannot run in any worktree until the user frees space. Every task below is written to be self-verified by reading and `grep`, the same way the 7 alta-severity bug fixes earlier in this session were applied and verified without a build. **Task 9 is the mandatory real-build verification pass — run it (and only it) once disk space is freed; do not skip it or treat the grep-based checks as a substitute.**
- **Never rename a code identifier that already crosses a network boundary** (a Go struct name, a JSON field like `company_id`, a URL path like `/admin/companies`, an i18n dictionary *key* like `catalogBuilder`) as part of this plan. Only the string *values* assigned to those identifiers change. If a task's instructions seem to require touching one of these, stop and re-read this constraint — the fix is scoped wrong.
- **Every renamed user-facing string must match the exact glossary spelling**, copied verbatim from `Docs/glossary.md`: "Tipos de Caso" (not "Tipo de Caso", not "Casos"), "Entity Builder" (English, matching the glossary's own choice — see its rename note), "Unidad organizacional".
- One task = one commit. Do not batch multiple tasks into one commit, even though none of them touch overlapping files.

---

## File Structure

| File | Task(s) | Responsibility |
|---|---|---|
| `FRONTEND/src/config/navigation.ts` | 1, 3 | Single source of truth for nav labels across sidebar/drawer/bottom-nav (per its own module doc) |
| `FRONTEND/src/i18n/messages.ts` | 1, 3 | Shared string catalog for chrome (nav, dialogs, states) |
| `FRONTEND/src/features/tickets/widgets/RelationsWidget.tsx` | 2 | Ticket relations panel — has its own hardcoded "ITSM Relations" heading, doesn't read from the shared nav/i18n source |
| `FRONTEND/src/features/dashboard/Dashboard.tsx` | 4 | One of several places that duplicate the "Catalog Builder" label instead of reading `NAV_SECTION_LABELS`/`messages.ts` |
| `FRONTEND/src/features/admin/catalog-builder/**`, `FRONTEND/src/features/catalog/**`, `FRONTEND/src/features/automations/**` | 4 | Remaining "Catalog Builder" occurrences in user-facing strings, found by a fresh grep sweep (task defines the exact command) |
| `FRONTEND/FRONTEND-HANDOFF.md` | 5 | Team-facing status doc — two lines are stale after 2026-09-08's commits |
| `FRONTEND/src/features/admin/UsersManager.tsx` | 6 | Three lines of visible admin-org-tree copy still say "Company" in English |
| `FRONTEND/src/features/settings/SlaPolicies.tsx` | 7 | Local hardcoded-locale date formatter instead of the shared one |
| `FRONTEND/src/components/ui/StatusBadge.tsx` | 8 | Doc comment asserts an invariant (TODO-111) proved false this session |
| `SIG-Desk-Backend/Docs/TODOS.md` | (decision log only, no file task) | Where the two out-of-scope decisions (Task 10/11 below) get tracked instead of implemented blind |

No new files are created. No files are deleted.

---

## Task 1: Rename "ITSM" and "Catalog Builder" at the shared nav/i18n source

**Files:**
- Modify: `FRONTEND/src/config/navigation.ts:40` (`NAV_SECTION_LABELS.itsm`), `FRONTEND/src/config/navigation.ts:141` (comment), `FRONTEND/src/config/navigation.ts:206` (`label: 'Catalog Builder'`)
- Modify: `FRONTEND/src/i18n/messages.ts:125` (`nav.itsm`), `FRONTEND/src/i18n/messages.ts:128` (`nav.catalogBuilder`)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new — this task changes only string literal *values*. The keys `itsm` (nav section id, `FRONTEND/src/config/navigation.ts:32` `NavSection` union type) and `catalogBuilder` (i18n dictionary key) are untouched, so every existing consumer of `NAV_SECTION_LABELS`, `messages.nav.itsm`, and `messages.nav.catalogBuilder` keeps compiling with zero changes elsewhere.

- [ ] **Step 1: Read the current values to confirm nothing shifted since this plan was written**

Run:
```bash
grep -n "itsm\|ITSM\|Catalog Builder\|catalogBuilder" FRONTEND/src/config/navigation.ts FRONTEND/src/i18n/messages.ts
```
Expected output includes exactly these four lines (line numbers may drift by a few if someone else edited the file — the *content* must match):
```
config/navigation.ts:40:  itsm: 'ITSM',
config/navigation.ts:141:  // "Change Mgmt"/"Problem Mgmt"/"Assets" are ITSM's coordination
config/navigation.ts:206:    label: 'Catalog Builder',
i18n/messages.ts:125:    itsm: 'ITSM',
i18n/messages.ts:128:    catalogBuilder: 'Catalog Builder',
```
If the content differs, stop and re-read the surrounding lines before editing — the line numbers in the steps below assume this exact content.

- [ ] **Step 2: Edit `navigation.ts`**

Change line 40 from:
```typescript
  itsm: 'ITSM',
```
to:
```typescript
  itsm: 'Tipos de Caso',
```

Change line 141's comment from:
```typescript
  // "Change Mgmt"/"Problem Mgmt"/"Assets" are ITSM's coordination
```
to:
```typescript
  // "Change Mgmt"/"Problem Mgmt"/"Assets" are Tipos de Caso's coordination
```
(Keep the rest of that comment sentence — this shows only the changed clause; open the file to see the full line before editing.)

Change line 206 from:
```typescript
    label: 'Catalog Builder',
```
to:
```typescript
    label: 'Entity Builder',
```

- [ ] **Step 3: Edit `messages.ts`**

Change line 125 from:
```typescript
    itsm: 'ITSM',
```
to:
```typescript
    itsm: 'Tipos de Caso',
```

Change line 128 from:
```typescript
    catalogBuilder: 'Catalog Builder',
```
to:
```typescript
    catalogBuilder: 'Entity Builder',
```

- [ ] **Step 4: Self-verify (disk-space-blocked substitute for `npm run typecheck`)**

Run:
```bash
grep -n "'ITSM'\|'Catalog Builder'" FRONTEND/src/config/navigation.ts FRONTEND/src/i18n/messages.ts
```
Expected: no output (both old strings are gone from these two files).

Run:
```bash
grep -n "itsm:\|catalogBuilder:" FRONTEND/src/config/navigation.ts FRONTEND/src/i18n/messages.ts
```
Expected: 4 lines, each ending in `'Tipos de Caso',` or `'Entity Builder',` — confirms the *keys* survived and only the values changed.

- [ ] **Step 5: Real verification (run once disk space is freed, not now)**

```bash
npm run typecheck && npm run build
```
Expected: both succeed with no new errors. Record the result in this plan's checkbox when you actually run it — do not check this box based on the grep self-check above.

- [ ] **Step 6: Commit**

```bash
git add FRONTEND/src/config/navigation.ts FRONTEND/src/i18n/messages.ts
git commit -m "rename(nav): ITSM -> Tipos de Caso, Catalog Builder -> Entity Builder

Both are the single source of truth for 3 nav surfaces (sidebar, drawer,
bottom-nav per config/navigation.ts's own module doc) and the shared
i18n chrome catalog. Matches the 2026-09-08/09 glossary rename
(Docs/glossary.md, docs/glosario-goals-roadmap-lane-a) -- ITSM is too
technical a term for the full range of users (HR staff to IT managers)
per the glossary's own rename note; Catalog Builder didn't build a
browsable catalog, it built entity type definitions.

Only string VALUES changed. The nav section id 'itsm' (NavSection
union type) and the i18n key 'catalogBuilder' are untouched -- both
already cross into other files' code (not just display), and renaming
them is out of scope for a copy fix.

Part of: docs/superpowers/plans/2026-09-09-glossary-terminology-frontend-sync.md"
```

---

## Task 2: Fix the standalone "ITSM Relations" heading

**Files:**
- Modify: `FRONTEND/src/features/tickets/widgets/RelationsWidget.tsx:11`

**Interfaces:**
- Consumes: nothing (this is a hardcoded JSX string, not read from `messages.ts`).
- Produces: nothing new.

- [ ] **Step 1: Confirm the current line**

Run:
```bash
grep -n "ITSM Relations" FRONTEND/src/features/tickets/widgets/RelationsWidget.tsx
```
Expected: `11:        ITSM Relations`

- [ ] **Step 2: Edit the heading**

In `FRONTEND/src/features/tickets/widgets/RelationsWidget.tsx`, find:
```tsx
        <Link2 className="h-4 w-4 text-cyan-400" />
        ITSM Relations
      </h3>
```
Replace with:
```tsx
        <Link2 className="h-4 w-4 text-cyan-400" />
        Related Cases
      </h3>
```
(English "Related Cases" mirrors the rest of this component's English UI strings — "Cases" is the closest natural-English rendering of the glossary's "Tipos de Caso"/"Caso" for a heading; this widget's body text is otherwise all English, so this does not introduce a new ES/EN mix in the same component.)

- [ ] **Step 3: Self-verify**

```bash
grep -rn "ITSM" FRONTEND/src/features/tickets/widgets/RelationsWidget.tsx
```
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add FRONTEND/src/features/tickets/widgets/RelationsWidget.tsx
git commit -m "rename(tickets): ITSM Relations -> Related Cases heading

This widget hardcodes its own heading instead of reading from
config/navigation.ts or i18n/messages.ts (fixed in the previous
commit), so it needed its own fix. Matches the glossary's ITSM -> Tipos
de Caso rename; 'Related Cases' keeps the component's existing
all-English copy instead of mixing in the Spanish term.

Part of: docs/superpowers/plans/2026-09-09-glossary-terminology-frontend-sync.md"
```

---

## Task 3: Fix "Catalog Builder" in Dashboard.tsx

**Files:**
- Modify: `FRONTEND/src/features/dashboard/Dashboard.tsx:103`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new.

- [ ] **Step 1: Confirm the current line**

```bash
grep -n "Catalog Builder" FRONTEND/src/features/dashboard/Dashboard.tsx
```
Expected: `103:    { to: '/app/admin/catalog-builder', label: 'Catalog Builder', icon: FolderKanban, visible: canAuthorCatalog },`

- [ ] **Step 2: Edit the label only**

Change:
```typescript
    { to: '/app/admin/catalog-builder', label: 'Catalog Builder', icon: FolderKanban, visible: canAuthorCatalog },
```
to:
```typescript
    { to: '/app/admin/catalog-builder', label: 'Entity Builder', icon: FolderKanban, visible: canAuthorCatalog },
```
(The route path `/app/admin/catalog-builder` is untouched — renaming a URL is a bigger, separate change with its own redirect/bookmark concerns, out of scope for a display-copy fix.)

- [ ] **Step 3: Self-verify**

```bash
grep -n "'Catalog Builder'" FRONTEND/src/features/dashboard/Dashboard.tsx
```
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add FRONTEND/src/features/dashboard/Dashboard.tsx
git commit -m "rename(dashboard): Catalog Builder label -> Entity Builder

Route path /app/admin/catalog-builder is unchanged -- only the visible
label. Part of the 2026-09-08/09 glossary rename.

Part of: docs/superpowers/plans/2026-09-09-glossary-terminology-frontend-sync.md"
```

---

## Task 4: Sweep remaining "Catalog Builder" occurrences in catalog-builder/catalog/automations features

**Files:**
- Modify: any file under `FRONTEND/src/features/admin/catalog-builder/`, `FRONTEND/src/features/catalog/`, `FRONTEND/src/features/automations/` that the grep in Step 1 finds — this task cannot list them in advance because the previous audit only sampled this area ("decenas de lugares en features/admin/catalog-builder"), it did not enumerate every one.

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new.

- [ ] **Step 1: Run the authoritative sweep**

```bash
grep -rn "Catalog Builder" FRONTEND/src/features/admin/catalog-builder FRONTEND/src/features/catalog FRONTEND/src/features/automations
```

This produces a list of `file:line:content` matches. For each match, classify it before touching it:

- **User-facing string** (JSX text, a `label:`/`title:`/`placeholder:` string, an `alt`/`aria-label` attribute) → change `Catalog Builder` to `Entity Builder` in that string only.
- **Code comment** (a `//` or `/* */` line, like the one already fixed in Task 1) → same replacement, for the same reason as Task 1's comment fix (a comment that still says the old name is exactly as misleading to the next reader as one that was never updated).
- **An identifier** (a variable, function, type, CSS class, test id, or file/route path containing `catalogBuilder`/`catalog-builder`/`CatalogBuilder`) → **do not touch it**. Leave a one-line note in this task's commit message body listing which matches were skipped and why (e.g. `data-testid="catalog-builder-canvas"` — renaming breaks the Playwright spec that selects it).

- [ ] **Step 2: Apply the string-only replacements found in Step 1**

There is no fixed code block here because the exact matches are not known until Step 1 runs. Apply the same one-line `Catalog Builder` → `Entity Builder` substitution used in Tasks 1 and 3, file by file, to every match classified as "user-facing string" or "code comment" above.

- [ ] **Step 3: Re-run the sweep to confirm only skipped identifiers remain**

```bash
grep -rn "Catalog Builder" FRONTEND/src/features/admin/catalog-builder FRONTEND/src/features/catalog FRONTEND/src/features/automations
```
Expected: every remaining line is one you explicitly classified as "identifier, do not touch" in Step 1. If any line is a string or comment you missed, go back to Step 2.

- [ ] **Step 4: Self-verify no test ids or routes were accidentally touched**

```bash
git diff --stat FRONTEND/src/features/admin/catalog-builder FRONTEND/src/features/catalog FRONTEND/src/features/automations
```
Read the full diff (not just the stat) before committing. Confirm every changed line is a string literal or comment, never a `data-testid`, `className`, import path, or function/variable name.

- [ ] **Step 5: Real verification (once disk space is freed)**

```bash
npm run typecheck && npm run build && npx playwright test --grep "catalog-builder"
```
Expected: all pass. The Playwright grep specifically re-runs any e2e spec whose name or tags mention catalog-builder, to catch a skipped-identifier mistake that grep alone can't (e.g. a spec that asserts the *visible text* "Catalog Builder" rather than a `data-testid` — that spec needs updating too, as part of this same task, once you can actually run it).

- [ ] **Step 6: Commit**

```bash
git add FRONTEND/src/features/admin/catalog-builder FRONTEND/src/features/catalog FRONTEND/src/features/automations
git commit -m "rename: sweep remaining Catalog Builder -> Entity Builder occurrences

Ran: grep -rn \"Catalog Builder\" across features/admin/catalog-builder,
features/catalog, features/automations. Changed every user-facing
string and code comment; left identifiers (test ids, routes, variable/
type names) untouched -- see list below.

Skipped (identifiers, not covered by this copy-only rename):
<fill in from Step 1's classification -- e.g. \"data-testid=catalog-builder-canvas (3 files), route /app/admin/catalog-builder (App.tsx)\">

Part of: docs/superpowers/plans/2026-09-09-glossary-terminology-frontend-sync.md"
```

---

## Task 5: Fix two stale lines in FRONTEND-HANDOFF.md

**Files:**
- Modify: `FRONTEND/FRONTEND-HANDOFF.md:433`
- Modify: `FRONTEND/FRONTEND-HANDOFF.md` (module tree / status table near line 80-96 and 420-437 — add a new row for `features/assistant/`, see Step 3)

**Interfaces:** N/A — this is a documentation file, no code interfaces.

- [ ] **Step 1: Confirm the current Knowledge Base status line**

```bash
grep -n "Knowledge Base" FRONTEND/FRONTEND-HANDOFF.md
```
Expected line 433: `| Knowledge Base | Datos locales/demostrativos | Artículos, categorías, búsqueda, permisos y publicación |`

- [ ] **Step 2: Fix the stale status**

Change:
```
| Knowledge Base | Datos locales/demostrativos | Artículos, categorías, búsqueda, permisos y publicación |
```
to:
```
| Knowledge Base | Conectado a backend real (`GET /knowledge/health`, `GET /knowledge/articulos`, commit fcb6a9e, 2026-09-08) | Artículos, categorías, búsqueda, permisos y publicación |
```

- [ ] **Step 3: Add the missing `features/assistant/` row**

Open `FRONTEND/FRONTEND-HANDOFF.md`, find the status table containing the line you just edited (search for the table's header row, which starts with `| Módulo |` or similar — read 10 lines above line 433 to find it). Add a new row directly after the Knowledge Base row:
```
| Assistant (RAG chatbot) | Conectado a backend real (`POST /ia_advisor/chat`) | Chat de preguntas y respuestas sobre artículos permitidos; nunca ejecuta acciones, solo responde texto (ver `Docs/glossary.md` -> "Asistente de IA") |
```

Also find the directory tree listing near line 80-96 (search for a code block listing `src/features/knowledge/` or similar) and add `assistant/` as a sibling entry if it's not already there:
```bash
grep -n "features/knowledge" FRONTEND/FRONTEND-HANDOFF.md
```
Read the 5 lines around each match; if `features/assistant/` is not listed alongside `features/knowledge/` in that tree, add it as its own line in the same format as the surrounding entries.

- [ ] **Step 4: Self-verify**

```bash
grep -n "Datos locales/demostrativos" FRONTEND/FRONTEND-HANDOFF.md
grep -n "assistant" FRONTEND/FRONTEND-HANDOFF.md
```
Expected: first command returns no output (the stale phrase is gone); second command returns at least 2 lines (the tree entry and the new status row).

- [ ] **Step 5: Commit**

```bash
git add FRONTEND/FRONTEND-HANDOFF.md
git commit -m "docs: fix stale Knowledge Base status, document features/assistant/

FRONTEND-HANDOFF.md said Knowledge Base was still local/mock data;
commit fcb6a9e (2026-09-08) already connected it to the real backend.
features/assistant/ (the RAG chatbot) was never documented in this
file at all despite talking to a real business AI service -- exactly
the area that most needs the 'never executes alone' invariant on
record.

Part of: docs/superpowers/plans/2026-09-09-glossary-terminology-frontend-sync.md"
```

---

## Task 6: Fix "Company" copy in UsersManager.tsx (copy only — do not touch the Company type or company_id field)

**Files:**
- Modify: `FRONTEND/src/features/admin/UsersManager.tsx:504`, `:550`, `:593`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new. **Explicitly does not modify** `FRONTEND/src/features/admin/rbac.service.ts`'s `Company` interface (line 82), `company_id` field (lines 102, 141, 280, 294, 314, 329), or the `/admin/companies` endpoint (line 240) — those mirror the backend's real Go type and wire format (`organization_service/domain/company.go:27`) and JSON body shape; renaming them is tracked as backend TODO-189, not a frontend copy fix. Same constraint applies to `FRONTEND/src/features/auth/session.service.ts:36`'s `company_id` DTO field.

- [ ] **Step 1: Confirm the three lines**

```bash
grep -n "Company" FRONTEND/src/features/admin/UsersManager.tsx
```
Expected among the results:
```
504:              Company → areas/departments → teams. You can expand this structure as the company needs it.
550:                <option value="empresa">Company{rootExists ? ' (already exists)' : ''}</option>
593:            Create the root company to start the organizational structure.
```
(Other lines in this grep's output that reference the `Company` TypeScript type, e.g. `import { ... Company ... } from './rbac.service'` or `const companies: Company[]`, are NOT part of this task — leave every one of those as-is.)

- [ ] **Step 2: Edit line 504**

Change:
```tsx
              Company → areas/departments → teams. You can expand this structure as the company needs it.
```
to:
```tsx
              Organizational unit → areas/departments → teams. You can expand this structure as the organization needs it.
```

- [ ] **Step 3: Edit line 550**

Change:
```tsx
                <option value="empresa">Company{rootExists ? ' (already exists)' : ''}</option>
```
to:
```tsx
                <option value="empresa">Organizational unit{rootExists ? ' (already exists)' : ''}</option>
```
(The `value="empresa"` attribute is untouched — it's the wire value sent to the backend, already Spanish, already correct; only the visible `<option>` label text changes.)

- [ ] **Step 4: Edit line 593**

Change:
```tsx
            Create the root company to start the organizational structure.
```
to:
```tsx
            Create the root organizational unit to start the organizational structure.
```

- [ ] **Step 5: Self-verify**

```bash
grep -n "Company\|company needs\|root company" FRONTEND/src/features/admin/UsersManager.tsx
```
Expected: any remaining `Company` hits are TypeScript type references (e.g. `Company[]`, `: Company`), not the three English sentences above — read each one to confirm before moving on.

- [ ] **Step 6: Commit**

```bash
git add FRONTEND/src/features/admin/UsersManager.tsx
git commit -m "rename(admin): Company -> Organizational unit in visible copy

Three sentences of admin-facing copy said 'Company' in English while
the rest of the org tree already speaks in empresa/departamento/equipo
(Spanish, matching the wire format). Matches the glossary's Company ->
Unidad organizacional rename (Docs/glossary.md, 2026-09-08).

Did NOT touch: the Company TypeScript interface, the company_id wire
field, or the /admin/companies endpoint (rbac.service.ts, auth/
session.service.ts) -- those mirror organization_service's real Go
type and JSON shape; renaming them is backend work, tracked as
TODO-189 in SIG-Desk-Backend/Docs/TODOS.md, not a frontend copy fix.

Part of: docs/superpowers/plans/2026-09-09-glossary-terminology-frontend-sync.md"
```

---

## Task 7: Replace SlaPolicies.tsx's hardcoded date formatter with the shared i18n helper

**Files:**
- Modify: `FRONTEND/src/features/settings/SlaPolicies.tsx:1` (imports), `:515-520` (delete local function)
- Test: none exists today for this file's date formatting; this task does not add one (see Step 5 for why, and what to add once a build is available).

**Interfaces:**
- Consumes: `formatDate` from `FRONTEND/src/i18n/format.ts` — signature: `formatDate(value: Date | string | number, locale: string = DEFAULT_LOCALE): string` (confirmed by reading `i18n/format.ts:9`; `DEFAULT_LOCALE = 'en-US'`, so calling `formatDate(value)` with no second argument produces the exact same output as the local function did — this is a behavior-preserving refactor, not a locale change).
- Produces: nothing new.

- [ ] **Step 1: Confirm the current local function and its two call sites**

```bash
grep -n "formatDate\|Intl.DateTimeFormat" FRONTEND/src/features/settings/SlaPolicies.tsx
```
Expected:
```
453:              <span ...>{formatDate(previewMutation.data.responseDueAt)}</span> and resolution before{' '}
454:              <span ...>{formatDate(previewMutation.data.resolutionDueAt)}</span>.
515:function formatDate(value: string) {
516:  return new Intl.DateTimeFormat('en-US', {
```

- [ ] **Step 2: Add the import**

At the top of `FRONTEND/src/features/settings/SlaPolicies.tsx`, after the existing `import { useEffect, useMemo, useState } from 'react';` line, add:
```typescript
import { formatDate } from '@/i18n/format';
```

- [ ] **Step 3: Delete the local function**

Find and delete these lines (around 515-520):
```typescript
function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
```
Delete the entire function, including its closing brace. Do not leave an empty line pair in its place — just remove the block.

- [ ] **Step 4: Self-verify**

```bash
grep -n "function formatDate\|Intl.DateTimeFormat" FRONTEND/src/features/settings/SlaPolicies.tsx
```
Expected: no output (the local function is gone).

```bash
grep -n "^import.*formatDate" FRONTEND/src/features/settings/SlaPolicies.tsx
```
Expected: one line, the import added in Step 2.

- [ ] **Step 5: Real verification (once disk space is freed)**

```bash
npm run typecheck
```
Expected: no errors. The two call sites at lines 453-454 (`formatDate(previewMutation.data.responseDueAt)`) already call it with one argument, matching the shared function's signature exactly (locale defaults to `DEFAULT_LOCALE = 'en-US'`) — so no call-site changes are needed, only the import + deletion above. If typecheck reports a mismatch here, stop and re-read `i18n/format.ts`'s exact current signature before changing anything else, since this plan's Interfaces section may be describing a version that has since changed.

Once a build is available, also add a unit test (there is none today) asserting `SlaPolicies.tsx` no longer defines its own `formatDate` — a simple `grep`-based regression guard is insufficient long-term; a real test belongs in the file's own test suite once one exists.

- [ ] **Step 6: Commit**

```bash
git add FRONTEND/src/features/settings/SlaPolicies.tsx
git commit -m "fix(settings): use shared i18n formatDate instead of a local copy

SlaPolicies.tsx defined its own formatDate() hardcoded to 'en-US',
duplicating i18n/format.ts's shared helper (whose own doc comment
explains this exact duplication is what it exists to prevent -- 'so
switching it later ... is a one-line change here, not a
grep-and-replace across the app'). Behavior-preserving: the shared
helper's DEFAULT_LOCALE is also 'en-US', so output is identical today;
the fix is for the NEXT locale change, not this one.

Found by: parallel frontend audit, 2026-09-09 (severity media).

Part of: docs/superpowers/plans/2026-09-09-glossary-terminology-frontend-sync.md"
```

---

## Task 8: Fix StatusBadge.tsx's doc comment to acknowledge the TODO-111 exception

**Files:**
- Modify: `FRONTEND/src/components/ui/StatusBadge.tsx:5-9`

**Interfaces:** N/A — doc comment only, no signature change.

- [ ] **Step 1: Confirm the current comment**

```bash
sed -n '4,10p' FRONTEND/src/components/ui/StatusBadge.tsx
```
Expected:
```typescript
export interface StatusBadgeProps {
  /** Already-English display label (statuses must be mapped to English
   *  labels at the API/presentation boundary before reaching this
   *  component — see e.g. `statusFromApi` in `features/tickets/api.ts`). */
  label: string;
```

- [ ] **Step 2: Edit the comment**

Change:
```typescript
  /** Already-English display label (statuses must be mapped to English
   *  labels at the API/presentation boundary before reaching this
   *  component — see e.g. `statusFromApi` in `features/tickets/api.ts`). */
```
to:
```typescript
  /** Already-English display label (statuses must be mapped to English
   *  labels at the API/presentation boundary before reaching this
   *  component — see e.g. `statusFromApi` in `features/tickets/api.ts`).
   *
   *  This contract is NOT honored everywhere today: `TicketsKanban.tsx`'s
   *  `KNOWN_TICKET_STATUSES`/`TicketsList.tsx`'s `getSlaChip` compare
   *  against English literals while `domain.Ticket.Estado` is always
   *  Spanish (`abierto`/`en_progreso`/...) — confirmed unresolved,
   *  TODO-111 in SIG-Desk-Backend/Docs/TODOS.md, audit 2026-09-09. Any
   *  new consumer of this component must verify its own mapping is
   *  actually in place, not assume this doc comment describes reality. */
```

- [ ] **Step 3: Self-verify**

```bash
grep -n "TODO-111" FRONTEND/src/components/ui/StatusBadge.tsx
```
Expected: one line, inside the comment you just added.

- [ ] **Step 4: Commit**

```bash
git add FRONTEND/src/components/ui/StatusBadge.tsx
git commit -m "docs(ui): StatusBadge's already-English-labels contract is not universal

The component's own doc comment asserted labels are always mapped to
English before reaching it. Confirmed false for tickets (TODO-111):
KNOWN_TICKET_STATUSES/getSlaChip compare against English literals
while domain.Ticket.Estado is canonically Spanish -- 5 Kanban columns
stay permanently empty. Documented the gap so the next consumer of
this shared component doesn't inherit the same false assumption.

Found by: parallel frontend audit, 2026-09-09 (severity media,
institutionalized-in-shared-component finding).

Part of: docs/superpowers/plans/2026-09-09-glossary-terminology-frontend-sync.md"
```

---

## Task 9: Real build verification (run only once disk space is freed)

**Files:** none — this task runs commands, it does not edit files.

- [ ] **Step 1: Confirm disk space is actually available**

```bash
df -h C:
```
Expected: meaningfully more than 0 bytes free (a full `npm install` for this project needs roughly 900MB-1GB free across 4 potential worktrees, per `governor`'s 2026-09-09 estimate — if you're only verifying the main checkout, ~250MB is enough).

- [ ] **Step 2: Install and build**

```bash
cd FRONTEND
npm install
npm run typecheck
npm run build
```
Expected: all three succeed with zero new errors compared to the pre-plan baseline. If `npm install` itself fails, stop here and report the exact error — do not proceed to "fixing" typecheck/build errors that are actually install failures.

- [ ] **Step 3: Run the full Playwright suite, not just the catalog-builder-tagged subset from Task 4**

```bash
npx playwright test
```
Expected: same pass/fail counts as the last known-good run before this plan's commits (there is no CI baseline captured in this plan — if you don't have one, run the suite once on `main`/`Hector` before applying any of Tasks 1-8, and compare). Investigate any NEW failure introduced by this plan's commits; a pre-existing failure unrelated to nav labels, Company copy, or SlaPolicies dates is not this plan's responsibility to fix.

- [ ] **Step 4: Record the result**

Do not check any of Tasks 1-8's "Real verification" checkboxes as complete until this task has actually run and passed. If this task finds a regression, open a new task (not documented here, since its content depends on what actually breaks) to fix it before merging any of the 4 branches from this plan.

---

## Explicitly Out of Scope (flagged for a decision, not planned here)

These two items came out of the same 2026-09-09 audit and glossary review but are **not implementation tasks** — each needs a decision from the user before any plan can be written for it. Per the writing-plans skill's Scope Check: these are independent subsystems, not sub-tasks of this plan.

- **i18n language-policy tension.** `FRONTEND/src/i18n/messages.ts`'s own header comment states "English as the default and official language" as a deliberate product decision for all shared chrome — but the reconciled glossary (and `domain.Ticket.Estado`) are canonically Spanish. Every feature currently translates Spanish domain values to English by hand (inconsistently — see TODO-111). This is a product/architecture decision (does the frontend go bilingual? does the domain vocabulary become English? does English-chrome-Spanish-domain stay intentional forever?), not a copy fix. Recommend running `/office-hours` or `/plan-ceo-review` on this specific question before any code changes.
- **Notification channels (push/SMS) incomplete.** `NotificationBell.tsx` only implements an email toggle; push and SMS are undefined in the UI despite being named in the glossary's "Canal (de notificación)" entry. This needs its own design pass (does push/SMS exist on the backend at all yet? what's the UX for enabling a channel with no backend support?), not a mechanical fix — do not attempt to "add the missing toggles" without confirming backend support first.

Both are logged as candidates for `SIG-Desk-Backend/Docs/TODOS.md` or `SIG-Desk-Frontend/TODOS.md` entries — add them there (following each file's existing What/Why/Context/Effort/Priority format) as a documentation-only step if the user wants them tracked before deciding; do not implement either without that decision first.

---

## Self-Review

**Spec coverage:** Every glossary rename the user listed as in-scope (ITSM, Catalog Builder, Company) has a task. Of the "~15 medios/bajos" audit findings, 5 concrete, decision-free ones are covered (Tasks 4, 5, 7, 8, plus Task 2 folded into the ITSM rename); the 2 that require a product decision are called out explicitly rather than silently dropped or guessed at (see "Explicitly Out of Scope"). The other renamed glossary terms the user listed in this message (SR, Unidad organizacional beyond Company's copy, Asistente de IA, Responsable inicial/Derivación a IT, Carga máxima, Auditoría, Alerta de ciclo de vida, Ítem de inventario, Traspaso entre equipos IT, Selección de destinatarios/Entrega por canal, Agente IT, Configuración de notificación) were checked against the frontend during this session's audit and **no occurrence of their OLD names was found in frontend code or copy** — there is nothing to propagate for those; re-stating that here so it's not mistaken for an oversight.

**Placeholder scan:** No "TBD"/"handle it"/"similar to Task N" language. Task 4 is the one task without a fixed, enumerated file list (the sweep's targets aren't known until its own Step 1 grep runs) — this is disclosed explicitly in the task, with a concrete command and concrete classification rules, not a placeholder.

**Type consistency:** `formatDate`'s signature in Task 7 is quoted once (Interfaces section) and used consistently in the Steps. No new functions, types, or props are introduced by this plan, so there's no cross-task naming to drift.
