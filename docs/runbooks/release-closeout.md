# RFS Exact-SHA Release Closeout Runbook

Use this runbook before claiming a commit is released live.

## What must be true

For a commit SHA to be called deployed/live, all of the following must be proven for the same exact 40-character SHA:

1. A GitHub Actions run exists for `master` at that SHA.
2. The run has `status=completed` and `conclusion=success`.
3. The `deploy` job in that run has `status=completed` and `conclusion=success`.
4. The live endpoint `https://fly.reidar.tech/rfs-version.json` returns JSON where:
   - `commit` equals the SHA.
   - `version` equals the SHA.
   - `imageRef` includes `sha-<SHA>`.
   - `imageDigest` is a valid `sha256:<64 hex>` digest.

Pushed is not deployed. Local green is not CI. CI green is not live until the endpoint SHA matches.

## Read-only verification

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
FINAL_SHA=$(git rev-parse HEAD)
node scripts/check-exact-sha-release.mjs \
  --repo Reedtrullz/ReedFS \
  --branch master \
  --sha "$FINAL_SHA" \
  --live-url https://fly.reidar.tech/rfs-version.json
```

A passing result prints:

- `exact-SHA release ok for Reedtrullz/ReedFS@<SHA>`
- the matching GitHub Actions run URL
- the matching deploy job URL
- the live metadata URL

If the checker fails, quote the exact failure. Do not convert a failed exact-SHA check into a live/deployed claim.

## Release-closeout packet template

```md
## Release closeout

- Commit: `<full SHA>`
- Branch: `master`
- GitHub Actions run: `<URL>`
- Run status/conclusion: `completed/success`
- Deploy job: `<URL>`
- Deploy job status/conclusion: `completed/success`
- Live metadata: `https://fly.reidar.tech/rfs-version.json`
- Live `commit`: `<full SHA>`
- Live `version`: `<full SHA>`
- Live `imageRef`: `ghcr.io/reedtrullz/rfs:sha-<full SHA>`
- Live `imageDigest`: `sha256:<digest>`
- Verification command: `node scripts/check-exact-sha-release.mjs ...`
- Verification result: `exit 0`, timestamp `<UTC time>`
```

## Actions that require explicit current authorization

Do not perform any of these without the user explicitly authorizing them in the active session:

- `git push` to `master` or any remote branch.
- Rerunning, dispatching, or modifying GitHub Actions workflows.
- Editing branch protection or repository settings.
- Deploying manually through SSH, Docker, or Ansible.

## Non-claims

- A successful local `npm run check` is only a local gate.
- A successful PR run is not a production deploy; PR `publish`/`deploy` are skipped by workflow conditionals.
- A successful master run is not live proof unless `/rfs-version.json` matches the exact SHA.
- A live endpoint with a different SHA is proof that another commit is deployed, not this one.
