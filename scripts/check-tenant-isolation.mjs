#!/usr/bin/env node
// CI guard for tenant isolation (SaaS platform). Every production data path MUST go through
// makeData / dataFromEnv, which wraps the DynamoDB client with `tenantScoped` (prefixing PK + all
// GSIxPK with T#<tenantId>#). The ONE sanctioned place that constructs a raw table client is
// dataFromEnv; the ONE thing written un-scoped is the global tenant registry. This guard fails the
// build if any other code constructs a raw table client (which would bypass tenant prefixing) — the
// exact failure mode that would silently leak one family's data to another.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'backend';

// Files allowed to construct/translate raw table clients.
//
// The second group all address GLOBAL-namespace partitions, where the tenant-scoping decorator would
// be wrong: they build the tenant prefix into the key LITERALLY (`T#<tenantId>#USAGE`,
// `TENANT#<tenantId>`) so that platform-admin reads, which run with no tenant context at all, can
// address a family's partition by explicit key. Isolation is still enforced — by construction rather
// than by the decorator. Anything NOT on this list must go through makeData/dataFromEnv.
const ALLOW = new Set([
  'backend/shared/data/index.ts', // dataFromEnv — the single sanctioned construction
  'backend/shared/data/table-client.ts', // defines DynamoTableClient / tableClientFromEnv
  'backend/shared/data/memory-client.ts', // the in-memory test client
  'backend/shared/metering/record.ts', // appends T#<tenant>#USAGE by literal key (cross-tenant admin reads)
  'backend/shared/data/last-seen.ts', // stamps TENANT#<id>/LASTSEEN#<user> in the global registry partition
  'backend/modules/admin-usage/routes.manifest.ts', // base client for platform-admin cross-tenant usage reads
  'backend/lambda/reconcile.ts', // prod reconcile job: inherently cross-tenant, writes GLOBAL#RECON/GLOBAL#USAGE
]);

// Constructing a raw client outside ALLOW bypasses the tenant-scoping decorator.
const NEEDLES = ['tableClientFromEnv(', 'new DynamoTableClient('];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      if (entry !== 'node_modules' && entry !== 'dist') out.push(...walk(p));
    } else if (p.endsWith('.ts') && !p.endsWith('.test.ts')) {
      out.push(p);
    }
  }
  return out;
}

const violations = [];
for (const file of walk(ROOT)) {
  if (ALLOW.has(file)) continue;
  const src = readFileSync(file, 'utf8');
  for (const needle of NEEDLES) {
    if (src.includes(needle)) {
      violations.push(`${file}: uses \`${needle}\` — production data access must go through makeData/dataFromEnv (tenant-scoped).`);
    }
  }
}

if (violations.length > 0) {
  console.error('check:isolation ✗ — raw table-client construction bypasses tenant scoping:');
  for (const v of violations) console.error('  ' + v);
  process.exit(1);
}
console.log('check:isolation ✓ — all production data access goes through the tenant-scoped data layer.');
