#!/usr/bin/env bash
# wnu-startup.sh — run this FIRST in every new Claude session for Keira's Journey.
# It establishes + verifies the grahem-wnu GitHub identity and the wnu AWS account,
# then proves the supervisor can actually push. It never prints secrets.
#
# Prereq (one-time): a grahem-wnu Personal Access Token must be in this session's env as
# GH_TOKEN, set via .claude/settings.local.json (see docs/SESSION-STARTUP.md). The token is
# read from the environment here; it is never echoed.

set -uo pipefail
REPO="grahem-wnu/keiras-journey"
WNU_ACCOUNT="010928187255"
ok=1
say() { printf '%s\n' "$*"; }
fail() { ok=0; printf 'BLOCKED: %s\n' "$*"; }

say "=== Keira's Journey — session startup check ==="

# ---------- AWS ----------
acct="$(aws sts get-caller-identity --query Account --output text 2>/dev/null || true)"
if [ "$acct" != "$WNU_ACCOUNT" ]; then
  # settings.local.json should have set these; export for this shell as a fallback and retry.
  export AWS_PROFILE=wnu
  export AWS_SHARED_CREDENTIALS_FILE="/mnt/c/Users/Grahem/.aws/credentials"
  export AWS_CONFIG_FILE="/mnt/c/Users/Grahem/.aws/config"
  export AWS_DEFAULT_REGION=us-east-2
  acct="$(aws sts get-caller-identity --query Account --output text 2>/dev/null || true)"
fi
if [ "$acct" = "$WNU_ACCOUNT" ]; then
  say "AWS: OK — wnu account $acct (us-east-2)"
else
  fail "AWS is '$acct', expected $WNU_ACCOUNT. Start the session in this folder so .claude/settings.local.json loads, or set AWS_PROFILE=wnu."
fi

# ---------- GitHub identity (stored gh auth OR GH_TOKEN env both fine) ----------
who="$(gh api user --jq .login 2>/dev/null || true)"
if [ "$who" = "grahem-wnu" ]; then
  say "GitHub: OK — authenticated as grahem-wnu"
else
  fail "GitHub identity is '${who:-unknown}', expected grahem-wnu. Run 'gh auth login' as grahem-wnu, or set a grahem-wnu GH_TOKEN in .claude/settings.local.json (see docs/SESSION-STARTUP.md)."
fi

# ---------- Repo write access (non-destructive: the token's own permissions) ----------
if [ "$ok" = "1" ]; then
  perms="$(gh api "repos/$REPO" --jq '[.permissions.push, .permissions.admin] | @tsv' 2>/dev/null || true)"
  canpush="$(printf '%s' "$perms" | cut -f1)"
  canadmin="$(printf '%s' "$perms" | cut -f2)"
  if [ "$canpush" = "true" ]; then
    say "Repo: OK — token can push to $REPO (admin=$canadmin for branch protection)"
  elif [ -z "$perms" ]; then
    fail "Cannot see $REPO. Either it doesn't exist yet (create it under grahem-wnu) or the token lacks access."
  else
    fail "Token cannot push to $REPO (push=$canpush). Re-auth with a grahem-wnu token that has Contents:write."
  fi
fi
# Note: the first real push happens at bootstrap (supervisor creates dev + scaffold).

# ---------- Verdict ----------
say "----------------------------------------"
if [ "$ok" = "1" ]; then
  say "READY ✅  — grahem-wnu GitHub + wnu AWS confirmed. Say: \"Run the bootstrap.\""
else
  say "NOT READY ❌ — fix the BLOCKED item(s) above (see docs/SESSION-STARTUP.md), then re-run: bash bin/wnu-startup.sh"
fi
