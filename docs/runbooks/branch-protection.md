# RFS Branch Protection Runbook

This runbook defines the desired GitHub branch-protection posture for `Reedtrullz/ReedFS` `master` and how to verify it without overclaiming.

## Required policy

For `master`, branch protection should require:

- Status checks are required before merge.
- Branches must be up to date before merge (`strict: true`).
- Required status contexts:
  - `secret-scan`
  - `test`
  - `publish`
  - `deploy`
- Rules apply to administrators.
- Force pushes are disabled.
- Branch deletion is disabled.

> Note: GitHub check-run context names must match the exact names GitHub exposes for this repository. If GitHub reports a renamed context, update this runbook and the required context list only after verifying the corresponding workflow job is the intended one.

## Read-only verification

Use the local checker:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
node scripts/check-branch-protection.mjs \
  --repo Reedtrullz/ReedFS \
  --branch master \
  --required secret-scan,test,publish,deploy \
  --require-admins \
  --forbid-force-push \
  --forbid-delete
```

Expected passing output includes `branch protection ok` and the observed required contexts.

If it fails, the output is the evidence packet. Do not summarize it as success. Record the exact missing or mismatched rule.

## Configuration requires active authorization

Changing branch protection is a remote repository administration action. Do not run mutation commands unless the user gives explicit current authorization.

When authorized, use GitHub UI or an API payload equivalent to:

```bash
cat > /tmp/rfs-branch-protection.json <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["secret-scan", "test", "publish", "deploy"]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "required_linear_history": false,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON

gh api -X PUT \
  repos/Reedtrullz/ReedFS/branches/master/protection \
  --input /tmp/rfs-branch-protection.json
```

Then immediately rerun the read-only checker above and record the exact output.

## Non-claims

- A local script passing does not prove future GitHub changes cannot weaken protection; it proves only the current API response at verification time.
- Do not claim branch protection is enabled unless the checker exits `0` against the live repository.
- Do not claim CI/deploy success from branch protection alone; use `docs/runbooks/release-closeout.md` for exact-SHA release proof.
