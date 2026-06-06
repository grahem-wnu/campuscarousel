# Session Startup — grahem-wnu profile

Run `bash bin/wnu-startup.sh` at the start of every Claude session for this project. It verifies
the grahem-wnu GitHub identity + wnu AWS account and proves the supervisor can push. Below is the
one-time setup that makes that pass.

## Why a token (not `gh auth login`)
- This box's gh is logged in as your personal **grahemha**, which has **no access** to
  `grahem-wnu/keiras-journey`. `grahem-wnu` is a separate GitHub **user account**.
- gh here is old (2.4.0, no account switching) and grahemha is also used for HouseAmp gh work, so
  we must NOT `gh auth logout`/replace it globally.
- Instead we scope a grahem-wnu token to **this folder only** via `GH_TOKEN` in
  `.claude/settings.local.json`. Claude loads that env at session start, so every Bash shell —
  the supervisor and all 8 worktree agents — acts as grahem-wnu here, while other folders/sessions
  keep grahemha untouched.

## One-time setup
1. **Create a grahem-wnu Personal Access Token.** Log into GitHub as `grahem-wnu` →
   Settings → Developer settings → **Fine-grained tokens** → Generate. Scope it to the
   `keiras-journey` repository with permissions: **Contents: Read/write**, **Pull requests:
   Read/write**, **Administration: Read/write** (needed for branch protection), **Workflows:
   Read/write** (for the Actions files). Copy the token.
   - If the repo doesn't exist yet, create `grahem-wnu/keiras-journey` (empty, private) first.
2. **Put it in the folder-scoped session env.** Edit `.claude/settings.local.json` and add
   `GH_TOKEN` to the `env` block (keep the AWS keys):
   ```json
   {
     "env": {
       "AWS_PROFILE": "wnu",
       "AWS_SHARED_CREDENTIALS_FILE": "/home/ubuntu/.aws/credentials",
       "AWS_CONFIG_FILE": "/home/ubuntu/.aws/config",
       "AWS_DEFAULT_REGION": "us-east-2",
       "GH_TOKEN": "github_pat_xxx_your_grahem_wnu_token"
     }
   }
   ```
3. **Confirm it's gitignored** (it already is — see `.gitignore`). The token must never be
   committed or pushed. `settings.local.json` lives only on this machine.
4. (Recommended) `chmod 600 .claude/settings.local.json`.

## Every session
1. End the current session; start a new Claude session **in this folder** (so the env loads).
2. Run `bash bin/wnu-startup.sh` (or just tell me "run startup"). Expect **READY ✅**.
3. Then: "Run the bootstrap." (see `agents/supervisor-playbook.md`).

## Making writes hands-off (optional)
Per `~/.claude/settings.json`, mutating gh actions to grahem-wnu currently "require explicit
approval" (a prompt), except `gh pr merge` to dev which is already auto-allowed. For a fully
unattended run, add an `autoMode.allow` rule for `git push` + `gh pr create`/`gh pr comment`
scoped to `grahem-wnu/keiras-journey`. That's your call on your own settings — leave it as
prompts if you'd rather approve each push.
