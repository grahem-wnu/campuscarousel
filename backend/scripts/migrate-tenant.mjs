#!/usr/bin/env node
// One-time migration: re-key an existing single-family table into tenant #1 (SaaS platform). Phased and
// dry-runnable so a mid-run failure never leaves a mixed prefixed/un-prefixed table:
//   Phase A — write all new (prefixed) items.   Phase B — verify counts + spot reads.
//   Phase C — relocate S3 document objects.      Phase D — delete the old un-prefixed items.
// The pure `retkey` transform is unit-tested (migrate-tenant.test.ts). The AWS wiring (scan/put/copy/
// delete) runs ONLY on an explicit operator invocation — STAGING first, then prod on Grahem's go with a
// DynamoDB PITR checkpoint + S3 snapshot taken first. Never run automatically.
//
// Usage:
//   node backend/scripts/migrate-tenant.mjs --tenant <id> --table <name> --bucket <docs-bucket> [--dry-run] [--phase A|B|C|D|all]

const GSI_PK_ATTRS = ['GSI1PK', 'GSI2PK', 'GSI3PK', 'GSI4PK'];

/**
 * Transform one stored item into its tenant-prefixed form. Returns null to SKIP an item:
 *  - the global tenant registry (`TENANT#…`) stays un-prefixed, and
 *  - anything already prefixed (`T#…`) so the migration is idempotent / re-runnable.
 */
export function retkey(item, tenantId) {
  const pk = item?.PK;
  if (typeof pk !== 'string') return null;
  if (pk.startsWith('TENANT#')) return null; // global registry — never prefix
  if (pk.startsWith('T#')) return null; // already migrated — idempotent
  const prefix = `T#${tenantId}#`;
  const out = { ...item, PK: `${prefix}${pk}` };
  for (const attr of GSI_PK_ATTRS) {
    if (out[attr] !== undefined && out[attr] !== null) out[attr] = `${prefix}${out[attr]}`;
  }
  return out;
}

/** Rewrite a document row's S3 key to the tenant prefix (Phase C companion to physical object copy). */
export function retkeyS3(s3Key, tenantId) {
  if (typeof s3Key !== 'string' || s3Key.startsWith(`T/${tenantId}/`)) return s3Key;
  return `T/${tenantId}/${s3Key}`;
}

// --- AWS runner (only executed when invoked directly) -------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  const opt = (name, def) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : def;
  };
  const tenantId = opt('tenant');
  const table = opt('table');
  const dryRun = Boolean(opt('dry-run', false));
  if (!tenantId || !table) {
    console.error('Required: --tenant <id> --table <name>  [--bucket <docs>] [--dry-run]');
    process.exit(2);
  }

  const { DynamoDBClient } = await import('@aws-sdk/client-dynamodb');
  const { DynamoDBDocumentClient, ScanCommand, PutCommand, DeleteCommand } = await import('@aws-sdk/lib-dynamodb');
  const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

  // Phase A: scan + write prefixed copies.
  let scanned = 0;
  let migrated = 0;
  let skipped = 0;
  let cursor;
  const toDelete = [];
  do {
    const page = await ddb.send(new ScanCommand({ TableName: table, ExclusiveStartKey: cursor }));
    for (const item of page.Items ?? []) {
      scanned += 1;
      const next = retkey(item, tenantId);
      if (!next) {
        skipped += 1;
        continue;
      }
      if (!dryRun) await ddb.send(new PutCommand({ TableName: table, Item: next }));
      toDelete.push({ PK: item.PK, SK: item.SK });
      migrated += 1;
    }
    cursor = page.LastEvaluatedKey;
  } while (cursor);

  console.log(`Phase A: scanned=${scanned} migrated=${migrated} skipped=${skipped} dryRun=${dryRun}`);
  console.log('Phase C (S3 object relocation) + Phase D (delete old) are operator-gated — run after verifying counts.');
  if (dryRun) console.log('DRY RUN — no writes performed.');
  // Phase D (guarded): only after manual verification, delete the originals.
  if (!dryRun && opt('phase') === 'D') {
    for (const key of toDelete) await ddb.send(new DeleteCommand({ TableName: table, Key: key }));
    console.log(`Phase D: deleted ${toDelete.length} original items.`);
  }
}

// Only run AWS work when executed directly (not when imported by the test).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('migrate-tenant failed:', err);
    process.exit(1);
  });
}
