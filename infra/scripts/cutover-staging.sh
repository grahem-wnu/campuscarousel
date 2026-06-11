#!/usr/bin/env bash
# Staging cutover for the multi-tenant SaaS foundation (run ONCE, before merging the branch to dev).
# Safe to re-run (idempotent). Does NOT deploy and does NOT delete anything — it only ADDS:
#   1. Two Cognito custom attributes to the staging pool (additive; does NOT replace the pool).
#   2. The "primary" tenant registry record.
#   3. Phase-A migration: DUPLICATES existing data to T#primary# keys (originals left intact).
#   4. Stamps the 3 staging users (grahem = platform admin; all three = tenant "primary").
# After this + a successful deploy + verification, run the Phase-D cleanup (printed at the end).
#
# Usage:  bash infra/scripts/cutover-staging.sh
set -euo pipefail

# Force the real credentials file: the environment redirects AWS_SHARED_CREDENTIALS_FILE elsewhere
# (which hides the wnu creds), so we override it unconditionally rather than defaulting.
export AWS_SHARED_CREDENTIALS_FILE="$HOME/.aws/credentials"
export AWS_PROFILE="${AWS_PROFILE:-wnu}"
export AWS_REGION="${AWS_REGION:-us-east-2}"

POOL="us-east-2_xpFg5wuoD"
TABLE="KeirasJourney-Data-staging-AppTable815C50BC-WV9M9JTQCN4G"
NOW="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"

# --- Safety: refuse to run against any account but wnu (010928187255). --------------------------------
ACCT="$(aws sts get-caller-identity --query Account --output text)"
if [ "$ACCT" != "010928187255" ]; then
  echo "ABORT: wrong account ($ACCT). Expected the wnu account 010928187255." >&2
  exit 1
fi
echo "Account OK: $ACCT (wnu). Pool=$POOL Table=$TABLE"

# --- 1. Cognito custom attributes (additive — safe; no pool replacement). -----------------------------
echo "[1/4] Adding Cognito custom attributes (custom:tenantId, custom:platformAdmin)…"
# (StringAttributeConstraints omitted — optional for String attrs, and its nested commas break the CLI
#  shorthand parser. The ` || true` keeps the script idempotent if the attributes already exist.)
aws cognito-idp add-custom-attributes --user-pool-id "$POOL" --custom-attributes \
  Name=tenantId,AttributeDataType=String,Mutable=true \
  Name=platformAdmin,AttributeDataType=String,Mutable=true \
  && echo "  attributes added" || echo "  (attributes may already exist — continuing)"

# --- 2. Primary tenant registry record (global; un-prefixed). -----------------------------------------
echo "[2/4] Creating the 'primary' tenant registry record…"
aws dynamodb put-item --table-name "$TABLE" --item "{
  \"PK\":{\"S\":\"TENANT#primary\"},\"SK\":{\"S\":\"DETAILS\"},
  \"GSI1PK\":{\"S\":\"TENANTS\"},\"GSI1SK\":{\"S\":\"${NOW}#primary\"},
  \"tenantId\":{\"S\":\"primary\"},\"familyName\":{\"S\":\"Cuthbertson\"},
  \"plan\":{\"S\":\"free\"},\"status\":{\"S\":\"active\"},
  \"createdAt\":{\"S\":\"${NOW}\"},\"updatedAt\":{\"S\":\"${NOW}\"}
}"

# --- 3. Phase-A migration (duplicate existing data to T#primary#; non-destructive). -------------------
echo "[3/4] Migrating existing data to T#primary# (Phase A — duplicates, originals kept)…"
node backend/scripts/migrate-tenant.mjs --tenant primary --table "$TABLE"

# --- 4. Stamp the staging users. ----------------------------------------------------------------------
echo "[4/4] Stamping staging users…"
aws cognito-idp admin-update-user-attributes --user-pool-id "$POOL" --username grahem \
  --user-attributes Name=custom:tenantId,Value=primary Name=custom:platformAdmin,Value=true
aws cognito-idp admin-update-user-attributes --user-pool-id "$POOL" --username kate \
  --user-attributes Name=custom:tenantId,Value=primary
aws cognito-idp admin-update-user-attributes --user-pool-id "$POOL" --username keira \
  --user-attributes Name=custom:tenantId,Value=primary

echo
echo "✅ Cutover prep complete. Next:"
echo "   1. Merge the branch to deploy:  git checkout dev && git merge --no-ff feat/saas-tenancy-foundation && git push origin dev"
echo "   2. Wait for the 'Deploy Staging' workflow, then re-log-in (so tokens carry the new claims) and verify."
echo "   3. AFTER verifying staging works, run Phase-D cleanup to delete the old un-prefixed copies:"
echo "      node backend/scripts/migrate-tenant.mjs --tenant primary --table $TABLE --phase D"
