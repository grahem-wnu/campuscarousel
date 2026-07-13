# Phase 2A — All-Families Usage Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Give a platform admin a ranked "cost per family this month across all families" view, with drill-down into the existing per-family breakdown.

**Architecture:** A new `platformAdmin`-only `GET /admin/usage/families` endpoint iterates the tenant registry (`data.tenants.list()`, un-scoped base client), queries each `T#<tenant>#USAGE` partition for a date range using the same paginated-read + SK-range helpers as Phase 1, sums per tenant, and returns families ranked by cost. The frontend Usage page gains an "All families" view (platform admin only) whose rows drill down into the existing per-family breakdown. **On-read aggregation — no rollup job (that's Phase 2B).**

**Tech Stack:** Node 20 / TypeScript, DynamoDB single-table, React + Vite + Tailwind (Field Notes), Vitest + RTL.

**Reference spec:** `docs/superpowers/specs/2026-07-12-per-family-token-cost-metering-design.md` → "Phase 2 — finalized design" → Sub-project A.

**Conventions:** tests from repo root (`npm test`, `npm run typecheck`, `npm run lint`, `npm run check:routes`); integer micro-dollars; `.js` extensions on relative imports; commit after each green step with the standard Co-Authored-By / Claude-Session trailer.

---

## Chunk 1: Extract shared read helpers (refactor, no behavior change)

`queryAll`, `rangeToSkOpts`, `toUsageRow` are currently module-private in `handlers.ts`. Move them to a shared file so the families handler can reuse them.

**Files:**
- Create: `backend/modules/admin-usage/reads.ts`
- Modify: `backend/modules/admin-usage/handlers.ts`

- [ ] **Step 1: Create `reads.ts`** — move the three helpers verbatim, exported:

```ts
// backend/modules/admin-usage/reads.ts
import { type TableClient } from '../../shared/data/index.js';
import { type UsageRow } from './aggregate.js';

/** Query a full USAGE partition (paginated by the client) for an optional SK range. */
export async function queryAll(
  client: TableClient,
  pk: string,
  opts: { skBetween?: [string, string] },
): Promise<Array<Record<string, unknown>>> {
  return (await client.query(pk, opts)) as Array<Record<string, unknown>>;
}

/** Build an inclusive SK BETWEEN range from ISO from/to (the `~` upper sentinel includes last-ms rows). */
export function rangeToSkOpts(from?: string, to?: string): { skBetween?: [string, string] } {
  if (from && to) return { skBetween: [`TS#${from}`, `TS#${to}~`] };
  if (from) return { skBetween: [`TS#${from}`, 'TS#~'] };
  return {};
}

export function toUsageRow(it: Record<string, unknown>): UsageRow {
  return {
    feature: String(it.feature ?? ''),
    model: String(it.model ?? ''),
    studentId: it.studentId as string | undefined,
    inputTokens: Number(it.inputTokens ?? 0),
    outputTokens: Number(it.outputTokens ?? 0),
    cacheReadTokens: Number(it.cacheReadTokens ?? 0),
    cacheWriteTokens: Number(it.cacheWriteTokens ?? 0),
    costMicros: Number(it.costMicros ?? 0),
    occurredAt: String(it.occurredAt ?? ''),
  };
}
```

- [ ] **Step 2: Edit `handlers.ts`** — delete the three private copies, and import them: `import { queryAll, rangeToSkOpts, toUsageRow } from './reads.js';`
- [ ] **Step 3:** `npm test -- backend/modules/admin-usage` (existing tests still green — pure move) + `npm run typecheck`.
- [ ] **Step 4: Commit** — `refactor(admin-usage): extract shared USAGE read helpers into reads.ts`

---

## Chunk 2: Pure family summary

**Files:** Create `backend/modules/admin-usage/families.ts` + `families.test.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// backend/modules/admin-usage/families.test.ts
import { describe, expect, it } from 'vitest';
import { summarizeFamily, rankFamilies, type FamilyUsageRow } from './families.js';
import type { UsageRow } from './aggregate.js';

const row = (costMicros: number, inp = 10, out = 4): UsageRow => ({
  feature: 'assistant', model: 'm', inputTokens: inp, outputTokens: out,
  cacheReadTokens: 0, cacheWriteTokens: 0, costMicros, occurredAt: '2026-07-13T00:00:00Z',
});

describe('summarizeFamily', () => {
  it('sums cost/tokens/calls across a tenant’s rows', () => {
    expect(summarizeFamily([row(100), row(250)])).toEqual({
      costMicros: 350, inputTokens: 20, outputTokens: 8, calls: 2,
    });
  });
  it('is all-zero for no rows', () => {
    expect(summarizeFamily([])).toEqual({ costMicros: 0, inputTokens: 0, outputTokens: 0, calls: 0 });
  });
});

describe('rankFamilies', () => {
  it('sorts by costMicros desc and computes the grand total', () => {
    const fams: FamilyUsageRow[] = [
      { tenantId: 'a', familyName: 'A', costMicros: 100, inputTokens: 1, outputTokens: 1, calls: 1 },
      { tenantId: 'b', familyName: 'B', costMicros: 500, inputTokens: 1, outputTokens: 1, calls: 1 },
    ];
    const out = rankFamilies(fams);
    expect(out.families.map((f) => f.tenantId)).toEqual(['b', 'a']);
    expect(out.totalCostMicros).toBe(600);
  });
});
```

- [ ] **Step 2: Run it, verify it fails.**
- [ ] **Step 3: Implement**

```ts
// backend/modules/admin-usage/families.ts
import type { UsageRow } from './aggregate.js';

export interface FamilySummary {
  costMicros: number;
  inputTokens: number;
  outputTokens: number;
  calls: number;
}

export interface FamilyUsageRow extends FamilySummary {
  tenantId: string;
  familyName: string;
}

export interface FamiliesUsageResponse {
  families: FamilyUsageRow[];
  totalCostMicros: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}

export function summarizeFamily(rows: UsageRow[]): FamilySummary {
  const s: FamilySummary = { costMicros: 0, inputTokens: 0, outputTokens: 0, calls: 0 };
  for (const r of rows) {
    s.costMicros += r.costMicros;
    s.inputTokens += r.inputTokens;
    s.outputTokens += r.outputTokens;
    s.calls += 1;
  }
  return s;
}

export function rankFamilies(families: FamilyUsageRow[]): FamiliesUsageResponse {
  const sorted = [...families].sort((a, b) => b.costMicros - a.costMicros);
  return {
    families: sorted,
    totalCostMicros: sorted.reduce((n, f) => n + f.costMicros, 0),
    totalInputTokens: sorted.reduce((n, f) => n + f.inputTokens, 0),
    totalOutputTokens: sorted.reduce((n, f) => n + f.outputTokens, 0),
  };
}
```

- [ ] **Step 4: Run, verify PASS. Step 5: Commit** — `feat(admin-usage): pure family-usage summary + ranking`

---

## Chunk 3: `GET /admin/usage/families` handler

**Files:** Modify `backend/modules/admin-usage/handlers.ts`, `routes.manifest.ts`; extend `router.test.ts`. Regenerate manifests.

### Task 3.1: Handler

- [ ] **Step 1: Write failing router tests** (extend `backend/modules/admin-usage/router.test.ts`). Seed the tenant registry + per-tenant USAGE rows into an `InMemoryTableClient`, and drive through the manifest/`createRouter`. Study the existing `router.test.ts` in this module + `invites/router.test.ts` for how to seed tenants (`data.tenants.create({...})` or direct `put` of `PK=TENANT#<id>`, `GSI1PK='TENANTS'`) and how a `platformAdmin: true` route is dispatched (claims include `'custom:platformAdmin':'true'`).

Cases:
- **platform admin** → 200, `families` ranked by cost desc, each with `tenantId`, `familyName`, summed `costMicros`/tokens/`calls`; `totalCostMicros` = sum. Families with zero usage rows appear with zeros (or are included — assert the chosen behavior; **include all registered tenants**).
- **from/to range** filters rows per tenant (seed an out-of-range row, assert excluded).
- **non-platform admin** (role `admin`, no `platformAdmin`) → 403 (router enforces `platformAdmin`).
- **parent** → 403.

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement.** Extend `AdminUsageDeps` and add the `families` handler:

```ts
// additions to backend/modules/admin-usage/handlers.ts
import { type Data } from '../../shared/data/index.js';
import { rankFamilies, summarizeFamily, type FamilyUsageRow } from './families.js';

export interface AdminUsageDeps {
  getClient: () => TableClient;
  getData: () => Data; // for the tenant registry (families endpoint)
}

// inside makeHandlers, add:
  const families: Handler = async (ctx) => {
    // platformAdmin routes are enforced by the router; no in-handler tenant scoping.
    const skOpts = rangeToSkOpts(ctx.query.from, ctx.query.to);
    const client = deps.getClient();
    const tenants = await deps.getData().tenants.list();
    const rows: FamilyUsageRow[] = [];
    for (const t of tenants) {
      const items = await queryAll(client, `T#${t.tenantId}#USAGE`, skOpts);
      const s = summarizeFamily(items.map(toUsageRow));
      rows.push({ tenantId: t.tenantId, familyName: t.familyName, ...s });
    }
    return { status: 200, body: rankFamilies(rows) };
  };
  return { usage, families };
```

- [ ] **Step 4: Wire `routes.manifest.ts`:**

```ts
import { dataFromEnv, tableClientFromEnv, type Data, type TableClient } from '../../shared/data/index.js';
import { makeHandlers } from './handlers.js';

let cachedClient: TableClient | undefined;
let cachedData: Data | undefined;
const h = makeHandlers({
  getClient: () => (cachedClient ??= tableClientFromEnv()),
  getData: () => (cachedData ??= dataFromEnv()),
});

export const routes: RouteDef[] = [
  { method: 'GET', path: '/admin/usage', handler: h.usage, roles: ['admin'] },
  { method: 'GET', path: '/admin/usage/families', handler: h.families, platformAdmin: true },
];
```

Also update `buildRoutes` (if the module has one for tests) to match, and any `manifest.test.ts` that asserts the route table.

- [ ] **Step 5:** `npm run gen:manifests -w backend` (commit the regenerated `backend/lambda/generated/manifests.ts`); `npm run check:routes` (no dup; `/admin/usage/families` is distinct from `/admin/usage`).
- [ ] **Step 6:** `npm test -- backend/modules/admin-usage`, `npm run typecheck` — green.
- [ ] **Step 7: Commit** — `feat(admin-usage): GET /admin/usage/families — platform-admin all-families ranking`

> **Note the on-read cost** in a code comment on the `families` handler: N tenants × their range's rows, one Query each. Fine at current scale; Phase 2B rollups make it O(1). Never silently cap the tenant list.

---

## Chunk 4: Frontend "All families" view + drill-down

**Files:** Modify `frontend/src/modules/admin-usage/{types.ts, api.ts, AdminUsagePage.tsx}`; extend `AdminUsagePage.test.tsx`.

### Task 4.1: types + api

- [ ] **Step 1:** `types.ts` — add:

```ts
export interface FamilyUsageRow {
  tenantId: string;
  familyName: string;
  costMicros: number;
  inputTokens: number;
  outputTokens: number;
  calls: number;
}
export interface FamiliesUsageResponse {
  families: FamilyUsageRow[];
  totalCostMicros: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}
```

- [ ] **Step 2:** `api.ts` — add:

```ts
import type { FamiliesUsageResponse } from './types';

export function getFamiliesUsage(opts: { from?: string; to?: string }): Promise<FamiliesUsageResponse> {
  const query: Record<string, string> = {};
  if (opts.from) query.from = opts.from;
  if (opts.to) query.to = opts.to;
  return api.get<FamiliesUsageResponse>('/admin/usage/families', { query });
}
```

- [ ] **Step 3: Commit** — `feat(admin-usage-fe): families usage types + api`

### Task 4.2: Page — All-families view for platform admin

- [ ] **Step 1: Write failing test** (`// @vitest-environment jsdom`, extend `AdminUsagePage.test.tsx`). Mock `getFamiliesUsage` alongside `getUsage`. Cases:
  - **platform-admin** user (mock `useAuth` → `{ user: { role:'admin', platformAdmin:true } }`): the page shows an **All families** view by default with a ranked family row (familyName + cost); clicking a family row drills into the per-family breakdown (calls `getUsage` with that `tenantId`).
  - **tenant admin** (`role:'admin'`, no `platformAdmin`): no families view, no `getFamiliesUsage` call — goes straight to the own-family breakdown.

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement.** In `AdminUsagePage.tsx`, for `isPlatformAdmin`:
  - Add a view mode: `'families' | 'family'`. Default platform admin to `'families'`.
  - `'families'` mode: fetch `getFamiliesUsage({ from, to })`, render a `Table<FamilyUsageRow>` (columns: Family (`familyName`), Cost (`formatUsd`, right), calls/tokens right-aligned), headline grand total via the existing Stat idiom. Row click → set `tenantId` = row.tenantId, switch to `'family'` mode.
  - `'family'` mode: the existing per-family breakdown (groupBy control + table), plus a "← All families" back link (platform admin only) that clears `tenantId` and returns to `'families'`.
  - Replace the raw tenant-id `<Input>` override with this drill-down (nicer UX). Tenant admins keep the current single-family behavior (no view switch).
  - Match Field Notes classes; no charting dep; keep the Stat idiom for headline totals.
- [ ] **Step 4:** `npm run check:routes`, `npm run typecheck`, `npm test -- frontend/src/modules/admin-usage` — green.
- [ ] **Step 5: Commit** — `feat(admin-usage-fe): all-families ranked view with drill-down (platform admin)`

---

## Chunk 5: Gates + ship + verify

- [ ] **Full gates from root:** `npm run typecheck && npm run lint && npm run check:routes && npm test` — all green.
- [ ] **Ship:** push `feat/metering-phase2-families`, PR into `dev`, wait for CI + CodeRabbit, address findings, merge (auto-deploys to staging).
- [ ] **Verify on staging:** as a platform-admin session, `GET /admin/usage/families` returns the ranked families incl. the tenant that has usage rows; a non-platform admin gets 403; the frontend "All families" view renders and drill-down works. (Reuse the Phase-1 verification approach — a promoted throwaway account or the existing admin — and confirm the account is `wnu`/`010928187255` before any AWS inspection.)
- [ ] **Notify** with the outcome + PR link.

## Out of scope (Phase 2B)
Monthly rollup rows, the reconciliation job, Bedrock invocation-logging infra, Cost Explorer drift check, `GET /admin/usage/reconciliation`, and drift alerting. Separate plan.
