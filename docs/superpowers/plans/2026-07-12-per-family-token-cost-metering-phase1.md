# Per-Family Bedrock Token-Cost Metering — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture per-call Bedrock token usage, attribute it to the family (tenant), feature, student, and model, persist it as append-only records, and expose it through an admin API + an admin-only "Usage" page.

**Architecture:** All Bedrock calls funnel through one of two metered seams — `invokeMessages()` (non-web-grounded, replaces the 8 near-duplicate direct callers) and `converseWithSearch()`/`callModel` (web-grounded, Group A). Each seam parses the Anthropic `usage` block and calls the shared `recordUsage()`, which writes one append-only item per `InvokeModel` round to the single DynamoDB table keyed `T#<tenant>#USAGE` / `TS#<iso>#<callId>`. A `roles:['admin']` `GET /admin/usage` handler reads a tenant's partition (own tenant, or any tenant when the caller is platform admin) and aggregates by a chosen dimension. A new `admin-usage` frontend module renders it.

**Tech Stack:** Node 20 / TypeScript, AWS SDK v3 (`@aws-sdk/client-bedrock-runtime`, `@aws-sdk/lib-dynamodb`), DynamoDB single-table, React + Vite + Tailwind ("Field Notes" design system), Vitest + RTL.

**Reference spec:** `docs/superpowers/specs/2026-07-12-per-family-token-cost-metering-design.md`

**Conventions (apply throughout):**
- Tests run from repo root: `npm test` (Vitest). Single file: `npm test -- <path>`. Also `npm run typecheck`, `npm run lint`, `npm run check:routes` from root.
- All money is **integer micro-dollars** (`$1 = 1_000_000` micros). Never floats.
- Commit after every green step. Use Conventional Commits. Every commit message ends with the repo's Co-Authored-By / Claude-Session trailer.
- Follow existing import style: `.js` extensions on relative imports (NodeNext).

**Feature labels** (used verbatim as the `feature` value at each site):

| Module | feature | Group |
|---|---|---|
| peer-benchmark | `benchmark` | A |
| certifications/guidance | `cert-guidance` | A |
| college-hub/ai | `college-hydrate` | A |
| college-hub/checklist-ai | `college-checklist` | A |
| college-hub/prep-ai | `college-prep` | A |
| focus/ai | `focus` | A |
| onboarding-chat/ai | `onboarding` | A |
| opportunities/ai | `opportunities` | A |
| scholarship-tracker/ai | `scholarship` | A |
| goal-tracker | `goal-suggest` | B |
| demonstrated-interest-contacts | `interest-contacts` | B |
| ai-assistant | `assistant` | B |
| application-central | `application-central` | B |
| campus-visit-planner | `visit-planner` | B |
| certifications/suggester | `cert-suggest` | B |
| exam-prep | `exam-prep` | B |
| master-timeline | `master-timeline` | B |

---

## Chunk 1: Metering core (pure functions — pricing + usage parsing)

No I/O, fully unit-tested. Delivers the cost math and the Anthropic-`usage` extractor in isolation.

**Files:**
- Create: `backend/shared/metering/types.ts`
- Create: `backend/shared/metering/parse-usage.ts`
- Create: `backend/shared/metering/pricing.ts`
- Test: `backend/shared/metering/parse-usage.test.ts`, `backend/shared/metering/pricing.test.ts`

### Task 1.1: Types

- [ ] **Step 1: Write `types.ts`**

```ts
// backend/shared/metering/types.ts
/** The four token classes Bedrock/Anthropic bills separately. */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/** Per-token rates in micro-dollars (1e-6 USD) per token, per class. */
export interface ModelRates {
  inputMicros: number;
  outputMicros: number;
  cacheReadMicros: number;
  cacheWriteMicros: number;
}

export interface PricedUsage {
  costMicros: number;
  unpriced: boolean;
}

/** Input to recordUsage() — everything needed for one append-only usage row. */
export interface UsageRecordInput {
  feature: string;
  model: string;
  usage: TokenUsage;
  requestId: string;
  callId: string;
  occurredAt: string; // iso8601
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/shared/metering/types.ts
git commit -m "feat(metering): usage + rate types"
```

### Task 1.2: parse-usage (extract TokenUsage from an Anthropic response)

- [ ] **Step 1: Write the failing test**

```ts
// backend/shared/metering/parse-usage.test.ts
import { describe, expect, it } from 'vitest';
import { parseUsage } from './parse-usage.js';

describe('parseUsage', () => {
  it('reads all four token classes from the Anthropic usage block', () => {
    const usage = parseUsage({
      usage: {
        input_tokens: 100,
        output_tokens: 40,
        cache_read_input_tokens: 10,
        cache_creation_input_tokens: 5,
      },
    });
    expect(usage).toEqual({
      inputTokens: 100,
      outputTokens: 40,
      cacheReadTokens: 10,
      cacheWriteTokens: 5,
    });
  });

  it('defaults missing fields to 0 (no usage block => all zeros)', () => {
    expect(parseUsage({})).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    });
  });

  it('tolerates a partial usage block (only input/output)', () => {
    expect(parseUsage({ usage: { input_tokens: 7, output_tokens: 3 } })).toEqual({
      inputTokens: 7,
      outputTokens: 3,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    });
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — `npm test -- backend/shared/metering/parse-usage.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// backend/shared/metering/parse-usage.ts
import type { TokenUsage } from './types.js';

interface AnthropicUsageBlock {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/**
 * Extract the four billable token classes from a parsed Anthropic (Bedrock Messages API)
 * response. Missing/absent fields default to 0 — never throws, so a malformed response
 * cannot break the surrounding AI call.
 *
 * NOTE (verify at build): confirm Bedrock returns cache token counts under these exact keys
 * (`cache_read_input_tokens` / `cache_creation_input_tokens`) on the Messages API.
 */
export function parseUsage(response: { usage?: AnthropicUsageBlock } | null | undefined): TokenUsage {
  const u = response?.usage ?? {};
  return {
    inputTokens: num(u.input_tokens),
    outputTokens: num(u.output_tokens),
    cacheReadTokens: num(u.cache_read_input_tokens),
    cacheWriteTokens: num(u.cache_creation_input_tokens),
  };
}
```

- [ ] **Step 4: Run it, verify PASS.**
- [ ] **Step 5: Commit** — `git commit -am "feat(metering): parseUsage extracts four token classes"`

### Task 1.3: pricing (TokenUsage + rates → costMicros)

The rate **table** (`RATES`) holds real Bedrock prices; the pure `priceUsage` function takes a rate map so tests are independent of real prices.

- [ ] **Step 1: Write the failing test** (uses a fixture rate table, not real prices)

```ts
// backend/shared/metering/pricing.test.ts
import { describe, expect, it } from 'vitest';
import { normalizeModelId, priceUsage } from './pricing.js';
import type { ModelRates } from './types.js';

const rates: Record<string, ModelRates> = {
  'anthropic.claude-sonnet-4': {
    inputMicros: 3,
    outputMicros: 15,
    cacheReadMicros: 1,
    cacheWriteMicros: 4,
  },
};

describe('normalizeModelId', () => {
  it('strips the us. cross-region prefix and the version suffix', () => {
    expect(normalizeModelId('us.anthropic.claude-sonnet-4-20250514-v1:0')).toBe(
      'anthropic.claude-sonnet-4',
    );
  });
  it('is a no-op for an already-normalized id', () => {
    expect(normalizeModelId('anthropic.claude-sonnet-4')).toBe('anthropic.claude-sonnet-4');
  });
});

describe('priceUsage', () => {
  it('sums cost across all four token classes in micro-dollars', () => {
    const priced = priceUsage(
      'us.anthropic.claude-sonnet-4-20250514-v1:0',
      { inputTokens: 100, outputTokens: 40, cacheReadTokens: 10, cacheWriteTokens: 5 },
      rates,
    );
    // 100*3 + 40*15 + 10*1 + 5*4 = 300 + 600 + 10 + 20 = 930
    expect(priced).toEqual({ costMicros: 930, unpriced: false });
  });

  it('flags an unknown model as unpriced with zero cost', () => {
    const priced = priceUsage('anthropic.some-future-model', { inputTokens: 100, outputTokens: 40, cacheReadTokens: 0, cacheWriteTokens: 0 }, rates);
    expect(priced).toEqual({ costMicros: 0, unpriced: true });
  });
});
```

- [ ] **Step 2: Run it, verify it fails.**

- [ ] **Step 3: Implement**

```ts
// backend/shared/metering/pricing.ts
import type { ModelRates, PricedUsage, TokenUsage } from './types.js';

/**
 * Normalize a Bedrock model/inference-profile id to a rate-table key:
 * strip the leading `us.`/`eu.`/`apac.` cross-region prefix and the trailing
 * `-<date>-v<n>:<m>` version, e.g.
 *   us.anthropic.claude-sonnet-4-20250514-v1:0  ->  anthropic.claude-sonnet-4
 */
export function normalizeModelId(modelId: string): string {
  const withoutRegion = modelId.replace(/^(us|eu|apac)\./, '');
  return withoutRegion.replace(/-\d{8}-v\d+:\d+$/, '');
}

/**
 * Current Bedrock per-token rates in micro-dollars.
 *
 * TODO(build): fill these with the CURRENT us.anthropic.claude-sonnet-4 Bedrock rates.
 * Do NOT guess from memory — load the `claude-api` skill / its pricing reference at build
 * time, convert $/million-tokens to micros/token (e.g. $3.00 / 1M input = 3 micros/token),
 * and date-stamp this table. Cache-read and cache-write have distinct rates.
 */
export const RATES: Record<string, ModelRates> = {
  // 'anthropic.claude-sonnet-4': { inputMicros: ?, outputMicros: ?, cacheReadMicros: ?, cacheWriteMicros: ? },
};

export function priceUsage(
  modelId: string,
  usage: TokenUsage,
  rates: Record<string, ModelRates> = RATES,
): PricedUsage {
  const rate = rates[normalizeModelId(modelId)];
  if (!rate) return { costMicros: 0, unpriced: true };
  const costMicros =
    usage.inputTokens * rate.inputMicros +
    usage.outputTokens * rate.outputMicros +
    usage.cacheReadTokens * rate.cacheReadMicros +
    usage.cacheWriteTokens * rate.cacheWriteMicros;
  return { costMicros, unpriced: false };
}
```

- [ ] **Step 4: Run tests, verify PASS.** (Real `RATES` are filled in Chunk 3, Task 3.0 — kept out of the pure test so tests never depend on live prices.)
- [ ] **Step 5: Commit** — `git commit -am "feat(metering): priceUsage + model-id normalization"`

---

## Chunk 2: Usage persistence (recordUsage → append-only rows)

**Files:**
- Create: `backend/shared/metering/record.ts`
- Create: `backend/shared/metering/index.ts` (barrel)
- Test: `backend/shared/metering/record.test.ts`

> **Note:** a non-throwing student-context read already exists — `maybeStudentId(): string | undefined` in `backend/shared/tenant/context.ts`, re-exported from `backend/shared/tenant/index.ts` (`return als.getStore()?.studentId;`). Use it directly; do **not** add a new `optionalStudentId`.

### Task 2.1: `recordUsage()` — one append-only row, never throws

Uses the **base (unscoped)** table client with an explicit fully-qualified PK `T#<tenant>#USAGE`, because reads (Chunk 4) happen out of tenant context for a platform admin. Writing and reading agree on the literal stored PK.

- [ ] **Step 1: Write the failing test**

```ts
// backend/shared/metering/record.test.ts
import { describe, expect, it } from 'vitest';
import { InMemoryTableClient } from '../data/index.js';
import { runWithStudent, runWithTenant } from '../tenant/index.js';
import { recordUsage } from './record.js';

const rates = { 'anthropic.claude-sonnet-4': { inputMicros: 3, outputMicros: 15, cacheReadMicros: 1, cacheWriteMicros: 4 } };

function input() {
  return {
    feature: 'exam-prep',
    model: 'us.anthropic.claude-sonnet-4-20250514-v1:0',
    usage: { inputTokens: 100, outputTokens: 40, cacheReadTokens: 0, cacheWriteTokens: 0 },
    requestId: 'req1',
    callId: 'call1',
    occurredAt: '2026-07-12T10:00:00.000Z',
  };
}

describe('recordUsage', () => {
  it('writes an append-only row under T#<tenant>#USAGE with priced cost + student', async () => {
    const client = new InMemoryTableClient();
    await runWithTenant('fam1', () =>
      runWithStudent('stu1', () => recordUsage(input(), { client, rates })),
    );
    const rows = await client.query('T#fam1#USAGE');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      PK: 'T#fam1#USAGE',
      SK: 'TS#2026-07-12T10:00:00.000Z#call1',
      feature: 'exam-prep',
      studentId: 'stu1',
      inputTokens: 100,
      outputTokens: 40,
      costMicros: 100 * 3 + 40 * 15, // 900
      unpriced: false,
    });
  });

  it('records with no studentId when no student context is set', async () => {
    const client = new InMemoryTableClient();
    await runWithTenant('fam1', () => recordUsage(input(), { client, rates }));
    const rows = await client.query('T#fam1#USAGE');
    expect(rows[0]?.studentId).toBeUndefined();
  });

  it('never throws — a client failure is swallowed (metering must not break the AI call)', async () => {
    const failing = { put: async () => { throw new Error('boom'); } } as unknown as InMemoryTableClient;
    await expect(
      runWithTenant('fam1', () => recordUsage(input(), { client: failing, rates })),
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it, verify it fails.**

- [ ] **Step 3: Implement**

```ts
// backend/shared/metering/record.ts
import { tableClientFromEnv, type TableClient } from '../data/index.js';
import { currentTenantId, maybeStudentId } from '../tenant/index.js';
import { priceUsage } from './pricing.js';
import type { ModelRates, UsageRecordInput } from './types.js';

export interface RecordDeps {
  client?: TableClient;
  rates?: Record<string, ModelRates>;
}

let cached: TableClient | undefined;

/**
 * Append one immutable usage row. Uses the base (unscoped) client with an explicit
 * `T#<tenant>#USAGE` PK so platform-admin cross-tenant reads (which run without tenant
 * context) can query a family's partition by literal key.
 *
 * NEVER throws: a metering write failure is logged and swallowed so it cannot break the
 * user-facing AI call. The Phase-2 reconciliation job + Bedrock invocation logs are the
 * backstop that makes a dropped row visible.
 */
export async function recordUsage(input: UsageRecordInput, deps: RecordDeps = {}): Promise<void> {
  // NOTE: currentTenantId() throws when no tenant context is set. That throw is deliberately
  // swallowed by the catch below — a Bedrock call made outside a tenant context records nothing
  // rather than breaking the AI call. Phase-2 reconciliation is the backstop. Not a bug.
  try {
    const client = deps.client ?? (cached ??= tableClientFromEnv());
    const tenantId = currentTenantId();
    const studentId = maybeStudentId();
    const { costMicros, unpriced } = priceUsage(input.model, input.usage, deps.rates);
    await client.put({
      PK: `T#${tenantId}#USAGE`,
      SK: `TS#${input.occurredAt}#${input.callId}`,
      feature: input.feature,
      model: input.model,
      ...(studentId ? { studentId } : {}),
      inputTokens: input.usage.inputTokens,
      outputTokens: input.usage.outputTokens,
      cacheReadTokens: input.usage.cacheReadTokens,
      cacheWriteTokens: input.usage.cacheWriteTokens,
      costMicros,
      unpriced,
      requestId: input.requestId,
      occurredAt: input.occurredAt,
    });
  } catch (err) {
    console.error('[metering] recordUsage failed (swallowed)', {
      feature: input.feature,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
```

- [ ] **Step 4: Run, verify PASS.**
- [ ] **Step 5: Barrel** — create `backend/shared/metering/index.ts`:

```ts
export { parseUsage } from './parse-usage.js';
export { priceUsage, normalizeModelId, RATES } from './pricing.js';
export { recordUsage } from './record.js';
export { invokeMessages } from './invoke-messages.js'; // added in Chunk 3
export type { TokenUsage, ModelRates, PricedUsage, UsageRecordInput } from './types.js';
```
(Add the `invoke-messages` export in Chunk 3 when the file exists; if executing chunk-by-chunk, omit that line until then to keep typecheck green.)

- [ ] **Step 6: Typecheck + commit** — `npm run typecheck` then `git commit -am "feat(metering): recordUsage writes append-only rows, never throws"`

---

## Chunk 3: Metered seams + refactor all 9 call-site groups

### Task 3.0: Fill real rates

- [ ] **Step 1:** Load the `claude-api` skill (or its pricing reference) and read the current **Bedrock** `us.anthropic.claude-sonnet-4` rates for input, output, cache-read, and cache-write.
- [ ] **Step 2:** Convert $/million-tokens → micros/token and fill `RATES['anthropic.claude-sonnet-4']` in `backend/shared/metering/pricing.ts`. Date-stamp with a comment.
- [ ] **Step 3:** `npm test -- backend/shared/metering/pricing.test.ts` still passes (it uses a fixture table, not `RATES`).
- [ ] **Step 4: Commit** — `git commit -am "feat(metering): fill current Sonnet-4 Bedrock rates (YYYY-MM-DD)"`

### Task 3.1: `invokeMessages()` — the single non-web-grounded metered seam

Replaces the 8 near-duplicate Group B invokers. Builds the standard Anthropic body, sends `InvokeModelCommand`, decodes text, records usage, returns the joined text.

**Files:** Create `backend/shared/metering/invoke-messages.ts`, Test `backend/shared/metering/invoke-messages.test.ts`.

- [ ] **Step 1: Write the failing test** (inject a fake Bedrock client that returns content + usage)

```ts
// backend/shared/metering/invoke-messages.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InMemoryTableClient } from '../data/index.js';
import { runWithTenant } from '../tenant/index.js';
import { invokeMessages } from './invoke-messages.js';

const ORIGINAL = process.env.BEDROCK_MODEL_ID;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.BEDROCK_MODEL_ID;
  else process.env.BEDROCK_MODEL_ID = ORIGINAL;
});

function fakeClient(text: string, usage: Record<string, number>) {
  const send = vi.fn(async () => ({
    body: new TextEncoder().encode(JSON.stringify({ content: [{ type: 'text', text }], usage })),
  }));
  return { send } as never;
}

describe('invokeMessages', () => {
  it('returns the completion text AND records usage attributed to feature + tenant', async () => {
    process.env.BEDROCK_MODEL_ID = 'us.anthropic.claude-sonnet-4-20250514-v1:0';
    const client = fakeClient('hello', { input_tokens: 10, output_tokens: 4 });
    const meterClient = new InMemoryTableClient();
    const out = await runWithTenant('fam1', () =>
      invokeMessages({
        feature: 'goal-suggest',
        prompt: 'suggest',
        client,
        recordDeps: { client: meterClient, rates: { 'anthropic.claude-sonnet-4': { inputMicros: 3, outputMicros: 15, cacheReadMicros: 1, cacheWriteMicros: 4 } } },
      }),
    );
    expect(out).toBe('hello');
    const rows = await meterClient.query('T#fam1#USAGE');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ feature: 'goal-suggest', inputTokens: 10, outputTokens: 4 });
  });

  it('throws when BEDROCK_MODEL_ID is unset (caller decides the fallback)', async () => {
    delete process.env.BEDROCK_MODEL_ID;
    await expect(
      runWithTenant('fam1', () => invokeMessages({ feature: 'goal-suggest', prompt: 'x', client: fakeClient('', {}) })),
    ).rejects.toThrow('BEDROCK_MODEL_ID');
  });
});
```

- [ ] **Step 2: Run it, verify it fails.**

- [ ] **Step 3: Implement.** Add a stable `callId`/`requestId`/`occurredAt` seam so tests are deterministic. Because `Date.now()`/`crypto.randomUUID` are fine in Lambda (only workflow scripts forbid them), use them directly but allow injection for the metering ids via optional params defaulted at call time.

```ts
// backend/shared/metering/invoke-messages.ts
import { randomUUID } from 'node:crypto';
import { recordUsage } from './record.js';
import { parseUsage } from './parse-usage.js';
import type { RecordDeps } from './record.js';

/** Minimal Bedrock client surface — lets tests inject a fake `send`. */
export interface BedrockSend {
  send(command: unknown): Promise<{ body?: Uint8Array }>;
}

export interface InvokeMessagesParams {
  feature: string;
  prompt: string;
  system?: string;
  maxTokens?: number;
  temperature?: number;
  modelId?: string;
  client?: BedrockSend;
  requestId?: string;     // groups multi-call operations; defaults to a fresh uuid
  recordDeps?: RecordDeps; // injectable metering client/rates for tests
}

let cachedClient: BedrockSend | undefined;

/**
 * The single metered seam for non-web-grounded Bedrock calls. Builds the standard Anthropic
 * Messages body, sends one InvokeModel, decodes the completion text, records token usage
 * (attributed to `feature` + the ambient tenant/student), and returns the joined text.
 */
export async function invokeMessages(params: InvokeMessagesParams): Promise<string> {
  const modelId = params.modelId ?? process.env.BEDROCK_MODEL_ID;
  if (!modelId) throw new Error('BEDROCK_MODEL_ID is not set');

  const { InvokeModelCommand } = await import('@aws-sdk/client-bedrock-runtime');
  let client = params.client;
  if (!client) {
    const { BedrockRuntimeClient } = await import('@aws-sdk/client-bedrock-runtime');
    client = cachedClient ??= (new BedrockRuntimeClient({}) as unknown as BedrockSend);
  }

  const body: Record<string, unknown> = {
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: params.maxTokens ?? 1500,
    messages: [{ role: 'user', content: params.prompt }],
  };
  if (params.temperature !== undefined) body.temperature = params.temperature;
  if (params.system) body.system = params.system;

  const command = new InvokeModelCommand({
    modelId,
    contentType: 'application/json',
    accept: 'application/json',
    body: new TextEncoder().encode(JSON.stringify(body)),
  });

  const res = await client.send(command);
  if (!res.body) throw new Error('empty Bedrock response');
  const decoded = JSON.parse(new TextDecoder().decode(res.body)) as {
    content?: Array<{ text?: string }>;
    usage?: Record<string, number>;
  };

  // Record usage as a side effect — recordUsage never throws.
  await recordUsage(
    {
      feature: params.feature,
      model: modelId,
      usage: parseUsage(decoded),
      requestId: params.requestId ?? randomUUID(),
      callId: randomUUID(),
      occurredAt: new Date().toISOString(),
    },
    params.recordDeps,
  );

  return (decoded.content ?? []).map((c) => c.text ?? '').join('');
}
```

- [ ] **Step 4: Run, verify PASS. Step 5: Commit** — `git commit -am "feat(metering): invokeMessages — single metered seam for direct Bedrock calls"`

### Task 3.2: Refactor the 8 Group B modules onto `invokeMessages`

For **each** module below, replace its bespoke `InvokeModelCommand` build/send/decode with a call to `invokeMessages({ feature: '<label>', prompt, maxTokens, temperature, system })`. Keep each module's existing public function signature and its "unavailable when `BEDROCK_MODEL_ID` unset" degradation. Update the module's own test to inject the fake client through `invokeMessages` (or to assert the returned text) — do NOT delete existing behavioral tests; adapt them.

Do these one module per commit (8 commits). For each: (1) edit, (2) `npm test -- <module test>` green, (3) `npm run typecheck`, (4) commit `refactor(<module>): route Bedrock through metered invokeMessages`.

- [ ] **goal-tracker** — `backend/modules/goal-tracker/bedrock.ts`: replace `makeBedrockInvoker` body with `invokeMessages({ feature: 'goal-suggest', prompt, maxTokens: 1500, temperature: 0.5 })`. Preserve the `bedrockSuggester` env gate.
- [ ] **demonstrated-interest-contacts** — `backend/modules/demonstrated-interest-contacts/bedrock.ts`, feature `interest-contacts`.
- [ ] **ai-assistant** — `backend/modules/ai-assistant/bedrock.ts`, feature `assistant`.
- [ ] **application-central** — `backend/modules/application-central/ai.ts` (inline, ~lines 117-119), feature `application-central`.
- [ ] **campus-visit-planner** — `backend/modules/campus-visit-planner/prep.ts` (~lines 154-156), feature `visit-planner`.
- [ ] **certifications/suggester** — `backend/modules/certifications/suggester.ts` (~lines 228-231), feature `cert-suggest`.
- [ ] **exam-prep** — `backend/modules/exam-prep/ai.ts` (`invokeText`, ~lines 79-101), feature `exam-prep`. Note this one joins with `'\n'`; `invokeMessages` joins with `''`. Text blocks feed prompts/JSON parsing where the separator is immaterial — standardize on `invokeMessages`. Adapt the test accordingly.
- [ ] **master-timeline** — `backend/modules/master-timeline/ai.ts` (~lines 62-64), feature `master-timeline`.

> Checklist discipline: tick each of the 8 only after its test + typecheck are green. A missed module = silent unmetered spend.

### Task 3.3: Meter the web-grounded wrapper (Group A) + thread `feature`

**Files:** Modify `backend/shared/ai/bedrock.ts`. Test: extend `backend/shared/ai/bedrock.test.ts`.

- [ ] **Step 1: Write the failing test** — using the existing `fakeInvoker` seam + injected metering client, assert that a `converseWithSearch(prompt, { feature: 'benchmark', invoker, recordDeps })` call writes one usage row per round.

```ts
// add to backend/shared/ai/bedrock.test.ts
it('records token usage per round attributed to the feature', async () => {
  process.env.BEDROCK_MODEL_ID = 'us.anthropic.claude-sonnet-4-20250514-v1:0';
  const meterClient = new InMemoryTableClient();
  // fakeInvoker returns a single-round Anthropic response carrying a usage block:
  const invoker = fakeInvoker([{ content: [{ type: 'text', text: 'done' }], usage: { input_tokens: 20, output_tokens: 8 } }]);
  await runWithTenant('fam1', () =>
    converseWithSearch('hi', {
      feature: 'benchmark',
      webSearch: false,
      invoker,
      recordDeps: { client: meterClient, rates: FIXTURE_RATES },
    }),
  );
  const rows = await meterClient.query('T#fam1#USAGE');
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ feature: 'benchmark', inputTokens: 20, outputTokens: 8 });
});
```

(Extend `fakeInvoker` so its queued responses may include a `usage` block; add `FIXTURE_RATES` + imports for `InMemoryTableClient` / `runWithTenant`.)

- [ ] **Step 2: Run it, verify it fails.**

- [ ] **Step 3: Implement:**
  1. Extend `AnthropicResponse` to include `usage?: Record<string, number>`.
  2. Add `feature: string` (required) and `recordDeps?: RecordDeps` and optional `requestId?` to `ConverseOptions`.
  3. In `callModel`, after parsing the response, call `await recordUsage({ feature, model: modelId, usage: parseUsage(response), requestId, callId: randomUUID(), occurredAt: new Date().toISOString() }, recordDeps)` — pass `feature`/`requestId`/`recordDeps` down from `converseWithSearch` (thread through as params to `callModel`, or close over them). Generate one `requestId` per `converseWithSearch` invocation so all rounds group.
  4. Import `recordUsage`, `parseUsage`, `RecordDeps` from `../metering/index.js`; `randomUUID` from `node:crypto`.

- [ ] **Step 4: Run, verify PASS. Step 5: Commit** — `git commit -am "feat(ai): meter converseWithSearch usage per round + feature attribution"`

### Task 3.4: Thread `feature` through the 9 Group A callers

`feature` is now required on `ConverseOptions`. Update each caller to pass its label (typecheck will list every missing one). One commit for the batch (or per-module if preferred).

- [ ] Update, passing the label from the feature table:
  - `peer-benchmark/bedrock.ts` (`makeWebGroundedInvoker` → add a `feature` param, default `benchmark`, pass into `converseWithSearch`) → `benchmark`
  - `certifications/guidance.ts:157` → `cert-guidance`
  - `college-hub/ai.ts:67,377` → `college-hydrate`
  - `college-hub/checklist-ai.ts:145` → `college-checklist`
  - `college-hub/prep-ai.ts:148` → `college-prep`
  - `focus/ai.ts:72,124` → `focus`
  - `onboarding-chat/ai.ts:135,164` → `onboarding`
  - `opportunities/ai.ts:123` → `opportunities`
  - `scholarship-tracker/ai.ts:36` (+ `discover.ts`) → `scholarship`
- [ ] `npm run typecheck` clean (no missing-`feature` errors). `npm test` full suite green.
- [ ] **Commit** — `git commit -am "feat(ai): pass feature label from every web-grounded caller"`

### Task 3.5: Verify worker attribution

The async workers (hydration / focus / essay-coach) call these seams off SQS. Confirm each worker sets tenant (and, where applicable, student) context before the AI call.

- [ ] Read `backend/modules/*/worker.ts` (and the hydration/focus/essay-coach handlers) and confirm each wraps AI work in `runWithTenant(msg.tenantId, ...)` (+ `runWithStudent` where the message carries a studentId). If any does not, add it (message body already carries tenantId per the async wiring; if a field is missing, add it to the enqueue site too). Add/adjust a worker test asserting a usage row lands under the right `T#<tenant>#USAGE`.
- [ ] **Commit** — `git commit -am "fix(workers): ensure tenant/student context set so metering attributes correctly"` (only if changes were needed; otherwise note "verified, no change").

---

## Chunk 4: Reporting API (`GET /admin/usage`)

**Files:**
- Create: `backend/modules/admin-usage/aggregate.ts` (pure), `backend/modules/admin-usage/aggregate.test.ts`
- Create: `backend/modules/admin-usage/handlers.ts`, `backend/modules/admin-usage/routes.manifest.ts`
- Create: `backend/modules/admin-usage/router.test.ts`
- Regenerate: `backend/lambda/generated/manifests.ts` via `npm run gen:manifests -w backend`

### Task 4.1: Pure aggregation

- [ ] **Step 1: Write the failing test**

```ts
// backend/modules/admin-usage/aggregate.test.ts
import { describe, expect, it } from 'vitest';
import { aggregate, type UsageRow } from './aggregate.js';

const rows: UsageRow[] = [
  { feature: 'focus', model: 'anthropic.claude-sonnet-4', studentId: 'a', inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0, costMicros: 100, occurredAt: '2026-07-01T00:00:00Z' },
  { feature: 'focus', model: 'anthropic.claude-sonnet-4', studentId: 'b', inputTokens: 20, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0, costMicros: 250, occurredAt: '2026-07-02T00:00:00Z' },
  { feature: 'exam-prep', model: 'anthropic.claude-sonnet-4', studentId: 'a', inputTokens: 8, outputTokens: 2, cacheReadTokens: 0, cacheWriteTokens: 0, costMicros: 40, occurredAt: '2026-07-02T00:00:00Z' },
];

describe('aggregate', () => {
  it('totals cost + tokens and buckets by the chosen dimension', () => {
    const out = aggregate(rows, 'feature');
    expect(out.totalCostMicros).toBe(390);
    expect(out.buckets).toEqual([
      { key: 'focus', costMicros: 350, inputTokens: 30, outputTokens: 10, calls: 2 },
      { key: 'exam-prep', costMicros: 40, inputTokens: 8, outputTokens: 2, calls: 1 },
    ]); // sorted by costMicros desc
  });

  it('buckets by day and by student', () => {
    expect(aggregate(rows, 'day').buckets.map((b) => b.key)).toEqual(['2026-07-02', '2026-07-01']);
    expect(aggregate(rows, 'student').buckets.map((b) => b.key).sort()).toEqual(['a', 'b']);
  });
});
```

- [ ] **Step 2: Run it, verify it fails. Step 3: Implement** `aggregate(rows, groupBy: 'feature'|'student'|'model'|'day')` returning `{ totalCostMicros, totalInputTokens, totalOutputTokens, buckets: {key,costMicros,inputTokens,outputTokens,calls}[] }`, buckets sorted by `costMicros` desc. `day` key = `occurredAt.slice(0,10)`; `student` key = `studentId ?? '(none)'`.
- [ ] **Step 4: PASS. Step 5: Commit** — `git commit -am "feat(admin-usage): pure usage aggregation by dimension"`

### Task 4.2: Handler + reads (own tenant, or any tenant for platform admin)

Route is `roles: ['admin']` (runs in tenant context). The handler reads the target partition via the **base** client with an explicit PK so a platform admin can pass `?tenantId=` to read another family.

- [ ] **Step 1: Write the failing router test** (mirror `dev-reset/router.test.ts`)

```ts
// backend/modules/admin-usage/router.test.ts — key cases
// seed rows directly into an InMemoryTableClient under T#fam1#USAGE and T#fam2#USAGE
// - admin of fam1, GET /admin/usage?groupBy=feature -> 200, only fam1 totals
// - admin (non-platform) of fam1 with ?tenantId=fam2 -> still scoped to fam1 (override ignored)
// - platformAdmin with ?tenantId=fam2 -> reads fam2
// - parent role -> 403
// - no tenant claim -> 401
// - from/to range filters rows by SK (TS#<iso>) via begins_with / between
```

Claims helpers: admin `{ 'cognito:username':'kate','custom:role':'admin','custom:tenantId':'fam1' }`; platform admin add `'custom:platformAdmin':'true'`.

- [ ] **Step 2: Run it, verify it fails.**

- [ ] **Step 3: Implement `handlers.ts`:**

```ts
// backend/modules/admin-usage/handlers.ts
import { type Handler } from '../../shared/api/index.js';
import { requireRole } from '../../shared/auth/index.js';
import { tableClientFromEnv, type TableClient } from '../../shared/data/index.js';
import { aggregate, type UsageRow } from './aggregate.js';

const requireAdmin = requireRole('admin');
const GROUP_BY = new Set(['feature', 'student', 'model', 'day']);

export interface AdminUsageDeps { getClient: () => TableClient; }

export function makeHandlers(deps: AdminUsageDeps) {
  const usage: Handler = async (ctx) => {
    requireAdmin(ctx.requester);
    const req = ctx.requester;
    // Platform admin may target any tenant; a tenant admin is always scoped to their own.
    const tenantId = req.platformAdmin && ctx.query.tenantId ? ctx.query.tenantId : req.tenantId;
    if (!tenantId) return { status: 400, body: { error: { code: 'bad_request', message: 'tenantId required' } } };

    const groupBy = GROUP_BY.has(ctx.query.groupBy ?? '') ? (ctx.query.groupBy as 'feature') : 'feature';
    const skOpts = rangeToSkOpts(ctx.query.from, ctx.query.to);

    const client = deps.getClient();
    const items = await queryAll(client, `T#${tenantId}#USAGE`, skOpts);
    const rows = items.map(toUsageRow);
    return { status: 200, body: { tenantId, groupBy, ...aggregate(rows, groupBy) } };
  };
  return { usage };
}

// Paginate the Query so a wide range for an active family is not truncated at 1 MB.
async function queryAll(client: TableClient, pk: string, opts: object): Promise<Array<Record<string, unknown>>> {
  // If TableClient.query already returns the full partition (InMemory does; DynamoTableClient
  // must follow LastEvaluatedKey), one call suffices. Verify DynamoTableClient.query paginates;
  // if it caps at one page, extend it (separate step) — see Task 4.4.
  return (await client.query(pk, opts)) as Array<Record<string, unknown>>;
}

function rangeToSkOpts(from?: string, to?: string) {
  if (from && to) return { skBetween: [`TS#${from}`, `TS#${to}~`] as [string, string] };
  if (from) return { skBetween: [`TS#${from}`, 'TS#~'] as [string, string] };
  return {}; // whole partition
}

function toUsageRow(it: Record<string, unknown>): UsageRow {
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

- [ ] **Step 4: `routes.manifest.ts`:**

```ts
// backend/modules/admin-usage/routes.manifest.ts
import type { RouteDef } from '../../shared/api/index.js';
import { tableClientFromEnv, type TableClient } from '../../shared/data/index.js';
import { makeHandlers } from './handlers.js';

let cached: TableClient | undefined;
const h = makeHandlers({ getClient: () => (cached ??= tableClientFromEnv()) });

export const routes: RouteDef[] = [
  { method: 'GET', path: '/admin/usage', handler: h.usage, roles: ['admin'] },
];
```

- [ ] **Step 5:** `npm run gen:manifests -w backend` to regenerate `backend/lambda/generated/manifests.ts` (commit the regenerated file). Then `npm run check:routes` (no duplicate route) and `npm run typecheck`.
- [ ] **Step 6:** Run `npm test -- backend/modules/admin-usage/router.test.ts` → PASS.
- [ ] **Step 7: Commit** — `git commit -am "feat(admin-usage): GET /admin/usage — per-family token spend, admin-gated"`

### Task 4.3: Range-filter test

- [ ] Add/verify a test proving `?from=2026-07-01T00:00:00Z&to=2026-07-31T23:59:59Z` includes only in-range rows and excludes an out-of-range row. Commit.

### Task 4.4: DynamoDB pagination guard

- [ ] Confirm `DynamoTableClient.query` (`backend/shared/data/table-client.ts`) follows `LastEvaluatedKey`. If it returns only the first 1 MB page, extend it to loop until exhausted (with a test using a stubbed paginated response), so large families are not silently truncated. Commit `fix(data): paginate query() to avoid 1MB truncation` if changed; otherwise note verified.

---

## Chunk 5: Admin "Usage" frontend page

Visible to **tenant admins AND platform admin** → use `roles: ['admin']` on the nav entry (NOT `platformAdmin: true`, which would hide it from tenant admins). Gate any platform-only affordance (the tenant selector) on `user.platformAdmin` inside the page.

**Files:**
- Create: `frontend/src/modules/admin-usage/nav.manifest.ts`, `types.ts`, `api.ts`, `AdminUsagePage.tsx`
- Test: `frontend/src/modules/admin-usage/AdminUsagePage.test.tsx`

### Task 5.1: types + api

- [ ] **Step 1:** `types.ts`:

```ts
export interface UsageBucket { key: string; costMicros: number; inputTokens: number; outputTokens: number; calls: number; }
export interface UsageResponse {
  tenantId: string;
  groupBy: 'feature' | 'student' | 'model' | 'day';
  totalCostMicros: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  buckets: UsageBucket[];
}
export type GroupBy = UsageResponse['groupBy'];
```

- [ ] **Step 2:** `api.ts`:

```ts
import { api } from '../../shared/api';
import type { UsageResponse, GroupBy } from './types';

export function getUsage(opts: { groupBy: GroupBy; from?: string; to?: string; tenantId?: string }): Promise<UsageResponse> {
  const query: Record<string, string> = { groupBy: opts.groupBy };
  if (opts.from) query.from = opts.from;
  if (opts.to) query.to = opts.to;
  if (opts.tenantId) query.tenantId = opts.tenantId;
  return api.get<UsageResponse>('/admin/usage', { query });
}

export const formatUsd = (micros: number): string =>
  `$${(micros / 1_000_000).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
```

- [ ] **Step 3: Commit** — `git commit -m "feat(admin-usage-fe): usage types + api client"`

### Task 5.2: Page + nav

- [ ] **Step 1: Write the failing test** (`// @vitest-environment jsdom`, mock `../../shared/api`, mock `useAuth`):

```tsx
// frontend/src/modules/admin-usage/AdminUsagePage.test.tsx — key cases
// - admin user: renders total cost + a bucket row from a mocked getUsage
// - switching the groupBy control refetches with the new dimension
// - non-admin (role 'parent'): renders the "admins only" empty state, no fetch
```

- [ ] **Step 2: Run it, verify it fails.**
- [ ] **Step 3: Implement `AdminUsagePage.tsx`** following `AdminInvitesPage.tsx` state shape (loading/error/data + role guard). Use `Table` from `../../shared/ui` with a right-aligned cost column (`formatUsd`) and token columns; a groupBy `Select`/`Tabs`; a default range of the current month — send `from` = first-of-month `T00:00:00.000Z` and `to` = first-of-*next*-month `T00:00:00.000Z` so millisecond-precision `occurredAt` rows on the last day are included; the Dashboard "Stat" idiom for the headline total (`font-display text-3xl`). For a platform admin, show a tenant `<Input>`/`Select` that sets `tenantId`; hide it for a tenant admin. No charting dependency — reuse `Table` and hand-rolled bars if a bar is wanted. Match Field Notes classes (`text-ink-900`, `bg-surface-raised`, etc.). Header: `<h1 className="text-2xl font-bold text-ink-900">Usage</h1>`.
- [ ] **Step 4:** `nav.manifest.ts`:

```ts
import type { NavEntry } from '../../shared/shell';
export const nav: NavEntry[] = [
  {
    id: 'admin-usage',
    label: 'Usage',
    group: 'secondary',
    order: 98,
    route: '/admin/usage',
    icon: 'chart', // MUST be a real IconName — grep frontend/src/shared/ui/Icon.tsx for the union and pick an existing glyph (e.g. reuse one already used by another nav entry) before committing
    element: () => import('./AdminUsagePage'),
    roles: ['admin'],
  },
];
```

- [ ] **Step 5:** `npm run check:routes` (no dup id/route), `npm run typecheck`, `npm test -- frontend/src/modules/admin-usage/AdminUsagePage.test.tsx` → PASS.
- [ ] **Step 6: Commit** — `git commit -m "feat(admin-usage-fe): admin-only Usage page in nav"`

---

## Chunk 6: Wire-up verification, full suite, deploy to staging

- [ ] **Env sanity:** the routing Lambda and the async worker Lambdas already inject `TABLE_NAME` and `BEDROCK_MODEL_ID` (`infra/lib/api-stack.ts`, `infra/lib/async-stack.ts`) — recordUsage needs only `TABLE_NAME`, already present, and writes to the existing single table (no new IAM: the routing/worker roles already have table read/write). Confirm no new infra is required; if a worker role lacks table write, add it. No `api-stack` route block is needed (catch-all proxy).
- [ ] **Full gates from root:** `npm run typecheck && npm run lint && npm run check:routes && npm test` — all green. Fix anything red before proceeding.
- [ ] **Manual E2E on staging (per project "verify before claiming done"):**
  1. Push to `dev` (auto-deploys to staging per standing authorization) on a `feat/token-metering` branch → PR into `dev`.
  2. As an authenticated user, exercise a couple of AI features (e.g. a focus generate + a goal suggestion).
  3. Confirm rows appear under `T#<tenant>#USAGE` (query the table with `--profile wnu`, `us-east-2`).
  4. Load `/admin/usage` as an admin → non-zero total, per-feature breakdown shows the two features used. Confirm the nav entry is **absent** for a parent/student login.
  5. As platform admin, pass `?tenantId=` for another family and confirm scoping; as a tenant admin, confirm the override is ignored.
- [ ] **PushNotification** with the outcome + PR link once staging is verified (per global "notify on long pipelines").

---

## Out of scope (Phase 2 — do NOT build here)

Monthly rollup rows, `GET /admin/usage/families` all-families overview, the reconciliation job, Bedrock model-invocation-logging infra, drift alerting, and Tavily/web-search cost metering. Tracked in the spec §7 and Phasing.
