# RFS Dependabot Release-Hardening Implementation Plan

> **For Hermes:** Use subagent-driven-development skill for read-only review passes, but execute every implementation task in this plan directly from the controller session. These tasks touch release governance, GitHub PR state, Docker pins, push/merge/deploy, or exact-SHA verification and are therefore `[PARENT-DIRECT]`.

**Goal:** Resolve the open Dependabot release-hardening PRs truthfully: implement the Trivy action update with the release-policy mirror, reject/de-noise the Node 26 major bump, and optionally refresh the current Node 22 builder digest without changing the project Node policy.

**Architecture:** RFS mirrors release policy in repository files: `.github/workflows/ci.yml`, `Dockerfile`, `.github/dependabot.yml`, and `scripts/release-hardening-check.mjs` must move together. Workflow/Docker policy errors fail loudly through `npm run check:release` and exact-SHA GitHub Actions; this plan does not touch the browser runtime heartbeat documented in `docs/architecture.md:20-55`.

**Tech Stack:** GitHub Actions, Dependabot, Docker/OCI images, GHCR, Node 22 via nvm, npm, `scripts/release-hardening-check.mjs`, `gh` CLI.

---

## Evidence base

Read before execution:

- `docs/architecture.md:20-55` — runtime heartbeat; this plan must not reorder simulation/runtime code.
- `docs/architecture.md:165-205` — quality/release/deploy/security architecture.
- `docs/plans/README.md:5-23` — current source-of-truth plan/runbook files.
- `docs/runbooks/release-closeout.md:1-75` — exact-SHA release-closeout truth rules.
- `.github/workflows/ci.yml:118-127` — current Trivy scan pin.
- `.github/dependabot.yml:17-33` — current GitHub Actions and Docker Dependabot config.
- `Dockerfile:1` — current Node 22 builder base pin.
- `scripts/release-hardening-check.mjs:47-60`, `scripts/release-hardening-check.mjs:75-77`, and `scripts/release-hardening-check.mjs:107` — release policy mirror.

Current verified state, 2026-06-16T15:35:32Z:

- Local branch was fast-forwarded to `master` at `2d18dbe45570bce657b697738d92f5d706536878` before writing this plan.
- Open Dependabot PR #11: `build(deps): bump aquasecurity/trivy-action from 0.35.0 to 0.36.0`, head `64290e06c1a81eb7c5b2773f6234e90ba2dee761`, merge state `BLOCKED` because `check:release` still expects the old pinned SHA.
- Open Dependabot PR #10: `build(deps): bump node from 22-alpine to 26-alpine`, head `c4eb10e4ca71c2a913f937702639c2a88e71e34e`, merge state `BEHIND`; it conflicts with the current Node 22 release policy.
- Trivy v0.36.0 tag `v0.36.0` peels to commit `ed142fd0673e97e23eac54620cfb913e5ce36c25`, updates default Trivy from `v0.69.3` to `v0.70.0`, and updates its internal pinned `aquasecurity/setup-trivy` action.
- Node release status from nodejs.org: Node 26 is `Current`; Node 22 and Node 24 are LTS. RFS CI/local/Docker builder policy currently standardizes on Node 22.
- Docker Hub `node:22-alpine` tag digest observed during triage: `sha256:e58326d0d441090181ac150dc2078d3e2cf6a0d42e809aebba3ef5880935ffdd`. Re-query before implementation because Docker tags move.

## Truth boundaries and non-goals

- Do not merge raw Dependabot PR #11 as-is. It updates only the workflow pin and leaves `scripts/release-hardening-check.mjs` intentionally red.
- Do not merge PR #10 as-is. A Node 26 builder move is a toolchain migration, not a routine production-runtime security patch; production runtime is nginx, and CI/local builds use Node 22.
- Do not close PRs, push branches, merge PRs, rerun workflows, or claim live deploy without explicit current authorization.
- Local `npm run check:release` is not CI. PR CI is not deploy. A master deploy is not live proof until `/rfs-version.json` matches the exact SHA.
- This plan does not change RFS physics, browser playability, AP/FMA truth, Playwright proof boundaries, or release runtime hardening other than dependency policy pins.

## Architecture safety audit

The plan touches release-governance files only:

```text
.github/workflows/ci.yml
.github/dependabot.yml
Dockerfile
scripts/release-hardening-check.mjs
```

These are outside the runtime heartbeat chain:

```text
src/App.tsx -> src/app/RfsShell.tsx -> src/hooks/useSimLoop.ts -> src/runtime/frameScheduler.ts -> src/store/simStore.ts -> src/sim/physics/integrate.ts
```

Failure mode analysis:

- `scripts/release-hardening-check.mjs` failures are loud: `npm run check:release` exits nonzero and CI `test` fails.
- GitHub Actions pin mistakes are loud: workflow parse/action resolution failures show in exact-SHA CI logs.
- Docker base pin mistakes are loud: Docker smoke build/container health/version check fails in `docker-smoke`.
- Dependabot ignore mistakes are loud only after adding the checker assertion in Task 4; without that assertion, ignore drift would be silent. That is why Task 4 writes the checker failure before changing `.github/dependabot.yml`.

No task touches a `try/catch`-swallowed runtime import chain.

## Dependency map

```text
Task 1: baseline only; no files modified.
Tasks 2-3: Trivy workflow/checker update; serialize, parent-direct, and commit together.
Tasks 4-5: Dependabot Node-major ignore; serialize, parent-direct, and commit together.
Tasks 6-7: Node 22 same-major digest refresh; optional but recommended; serialize, parent-direct, and commit together.
Task 8: local verification over all previous changes.
Task 9: push/PR creation; authorization-gated parent-direct.
Task 10: exact-SHA PR CI and Dependabot PR disposition; authorization-gated parent-direct.
Task 11: post-merge master/deploy/live closeout; authorization-gated parent-direct.
```

---

## Phase 0 — Baseline and branch hygiene

### Task 1 [PARENT-DIRECT]: Start from current master and capture Dependabot baseline

**Objective:** Ensure implementation starts from current `master`, not the already-merged review branch, and record exact PR state.

**Files:**
- Read: `.github/workflows/ci.yml`
- Read: `.github/dependabot.yml`
- Read: `Dockerfile`
- Read: `scripts/release-hardening-check.mjs`
- No code files modified in this task.

**Step 1: Verify clean current master**

Run:

```bash
cd /Users/reidar/Projectos/RFS
git status --short --branch
git fetch origin master
git checkout master
git pull --ff-only origin master
git status --short --branch
git rev-parse HEAD
```

Expected:

- Branch is `master...origin/master`.
- Working tree is clean, or contains only `?? docs/plans/2026-06-16-rfs-dependabot-release-hardening.md` if this plan has not been committed yet.
- If the plan file is still untracked, either commit it as a docs-only plan commit after explicit commit authorization, or leave it untracked and do not stage it in implementation commits.
- `git rev-parse HEAD` returns the current `origin/master` SHA.

**Step 2: Capture open Dependabot PRs**

Run:

```bash
gh pr list --state open --author app/dependabot \
  --json number,title,url,headRefName,baseRefName,headRefOid,mergeStateStatus,updatedAt \
  --jq '.[]'
```

Expected:

- PR #11 is open for `aquasecurity/trivy-action` v0.36.0.
- PR #10 is open for `node:26-alpine`.

**Step 3: Create local implementation branch**

Run:

```bash
git checkout -b chore/dependabot-release-hardening-2026-06-16
```

Expected: new local branch is created from current master.

**Step 4: Commit**

No commit. This task is baseline/branch setup only.

---

## Phase 1 — Implement the Trivy action update safely

### Task 2 [PARENT-DIRECT]: Make the Trivy workflow pin update and verify release policy goes RED

**Objective:** Apply the Dependabot Trivy pin to the workflow only, then prove the release-hardening checker catches the missing policy mirror update.

**Files:**
- Modify: `.github/workflows/ci.yml:118-120`
- Test: `scripts/release-hardening-check.mjs`

**Step 1: Update only the workflow pin**

Replace the current Trivy scan lines in `.github/workflows/ci.yml`:

```yaml
      - name: Scan PR-safe Docker image
        # aquasecurity/trivy-action@v0.35.0
        uses: aquasecurity/trivy-action@57a97c7e7821a5776cebc9bb87c984fa69cba8f1
```

with:

```yaml
      - name: Scan PR-safe Docker image
        # aquasecurity/trivy-action@v0.36.0
        uses: aquasecurity/trivy-action@ed142fd0673e97e23eac54620cfb913e5ce36c25
```

**Step 2: Run checker to verify RED**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check:release
```

Expected: FAIL. The output must include release-hardening failures equivalent to:

```text
release hardening checks failed:
- workflow must pin aquasecurity/trivy-action to 57a97c7e7821a5776cebc9bb87c984fa69cba8f1
- docker-smoke job must run pinned Trivy image scan
```

If it passes here, stop: the checker is not guarding the pin as expected.

**Step 3: Commit**

Do not commit the red state. Continue directly to Task 3 and commit the workflow/checker update together.

---

### Task 3 [PARENT-DIRECT]: Update the release-hardening checker for Trivy v0.36.0

**Objective:** Mirror the Trivy v0.36.0 pinned SHA in `scripts/release-hardening-check.mjs` so workflow policy and checker policy agree.

**Files:**
- Modify: `scripts/release-hardening-check.mjs:47-60`
- Modify: `scripts/release-hardening-check.mjs:75-77`
- Verify: `.github/workflows/ci.yml:118-120`

**Step 1: Update the required action pin**

In `scripts/release-hardening-check.mjs`, replace:

```javascript
  ["aquasecurity/trivy-action", "57a97c7e7821a5776cebc9bb87c984fa69cba8f1"],
```

with:

```javascript
  ["aquasecurity/trivy-action", "ed142fd0673e97e23eac54620cfb913e5ce36c25"],
```

**Step 2: Update the direct docker-smoke Trivy assertion**

Replace:

```javascript
check(ci.includes("aquasecurity/trivy-action@57a97c7e7821a5776cebc9bb87c984fa69cba8f1"), "docker-smoke job must run pinned Trivy image scan");
```

with:

```javascript
check(ci.includes("aquasecurity/trivy-action@ed142fd0673e97e23eac54620cfb913e5ce36c25"), "docker-smoke job must run pinned Trivy image scan");
```

**Step 3: Run checker to verify GREEN**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check:release
```

Expected:

```text
release hardening checks passed
```

**Step 4: Verify no old Trivy SHA remains in policy files**

Run:

```bash
grep -R "57a97c7e7821a5776cebc9bb87c984fa69cba8f1" .github/workflows scripts || true
grep -R "ed142fd0673e97e23eac54620cfb913e5ce36c25" .github/workflows/ci.yml scripts/release-hardening-check.mjs
```

Expected:

- First command prints nothing.
- Second command prints the workflow `uses:` line and the two checker references.

**Step 5: Commit**

Run:

```bash
git add .github/workflows/ci.yml scripts/release-hardening-check.mjs
git commit -m "ci: update pinned trivy action"
```

Expected: one commit containing only the Trivy workflow/checker update.

---

## Phase 2 — Reject Node 26 noise and make the policy explicit

### Task 4 [PARENT-DIRECT]: Add a checker assertion requiring Docker Node semver-major ignores

**Objective:** Prevent future raw Node-major Docker Dependabot PRs from silently reopening while RFS is standardized on Node 22.

**Files:**
- Modify: `scripts/release-hardening-check.mjs:65-69`
- Test: `.github/dependabot.yml:26-33`

**Step 1: Add the failing checker assertion first**

After the existing Dependabot interval checks in `scripts/release-hardening-check.mjs`:

```javascript
check((dependabot.match(/directory:\s*\//g) ?? []).length >= 3, "Dependabot npm/actions/docker updates must target the repository root");
check((dependabot.match(/interval:\s*weekly/g) ?? []).length >= 3, "Dependabot npm/actions/docker updates must run weekly");
```

add:

```javascript
check(
  /package-ecosystem:\s*docker[\s\S]*ignore:\s*-\s*dependency-name:\s*node[\s\S]*version-update:semver-major/.test(dependabot),
  "Dependabot Docker updates must ignore Node semver-major bumps; Node major upgrades require a dedicated LTS/toolchain migration plan"
);
```

**Step 2: Run checker to verify RED**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check:release
```

Expected: FAIL with:

```text
Dependabot Docker updates must ignore Node semver-major bumps; Node major upgrades require a dedicated LTS/toolchain migration plan
```

**Step 3: Commit**

Do not commit the red state. Continue directly to Task 5 and commit checker + Dependabot config together.

---

### Task 5 [PARENT-DIRECT]: Configure Dependabot to ignore Docker Node semver-major bumps

**Objective:** Keep Docker Dependabot useful for same-major digest/minor maintenance while blocking Node 26-style major bumps until the project intentionally migrates its toolchain.

**Files:**
- Modify: `.github/dependabot.yml:26-33`
- Modify: `scripts/release-hardening-check.mjs:65-73`

**Step 1: Add Docker Node major ignore**

In `.github/dependabot.yml`, replace the Docker block:

```yaml
  - package-ecosystem: docker
    directory: /
    schedule:
      interval: weekly
      day: monday
      time: "06:00"
      timezone: Europe/Oslo
    open-pull-requests-limit: 5
```

with:

```yaml
  - package-ecosystem: docker
    directory: /
    schedule:
      interval: weekly
      day: monday
      time: "06:00"
      timezone: Europe/Oslo
    open-pull-requests-limit: 5
    ignore:
      - dependency-name: node
        update-types:
          - version-update:semver-major
```

**Step 2: Run checker to verify GREEN**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check:release
```

Expected:

```text
release hardening checks passed
```

**Step 3: Verify YAML shape**

Run:

```bash
python3 - <<'PY'
from pathlib import Path
text = Path('.github/dependabot.yml').read_text()
for marker in ['package-ecosystem: docker', 'dependency-name: node', 'version-update:semver-major']:
    print(marker, 'OK' if marker in text else 'MISSING')
    if marker not in text:
        raise SystemExit(1)
PY
```

Expected: all three markers print `OK`.

**Step 4: Commit**

Run:

```bash
git add .github/dependabot.yml scripts/release-hardening-check.mjs
git commit -m "ci: ignore docker node major dependabot bumps"
```

Expected: one commit containing only Dependabot ignore policy and its checker assertion.

---

## Phase 3 — Optional same-major Node 22 builder digest refresh

### Task 6 [PARENT-DIRECT]: Re-query the current Node 22 Alpine digest and verify a Dockerfile-only update goes RED

**Objective:** Refresh the Node 22 builder image within the same LTS major, while preserving the release checker’s two-file policy coupling.

**Files:**
- Modify: `Dockerfile:1`
- Test: `scripts/release-hardening-check.mjs:107`

**Step 1: Re-query the current digest before editing**

Run:

```bash
docker buildx imagetools inspect node:22-alpine | sed -n '1,12p'
```

Expected includes a `Digest:` line. During triage the digest was:

```text
Digest:    sha256:e58326d0d441090181ac150dc2078d3e2cf6a0d42e809aebba3ef5880935ffdd
```

If the digest has changed, use the new digest consistently in this task and Task 7.

**Step 2: Update Dockerfile only**

Replace `Dockerfile:1`:

```dockerfile
FROM node:22-alpine@sha256:968df39aedcea65eeb078fb336ed7191baf48f972b4479711397108be0966920 AS builder
```

with the observed current same-major digest, for example:

```dockerfile
FROM node:22-alpine@sha256:e58326d0d441090181ac150dc2078d3e2cf6a0d42e809aebba3ef5880935ffdd AS builder
```

Do not use `node:26-alpine`.

**Step 3: Run checker to verify RED**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check:release
```

Expected: FAIL with the old digest requirement from `scripts/release-hardening-check.mjs`.

**Step 4: Commit**

Do not commit the red state. Continue directly to Task 7 and commit Dockerfile/checker together.

---

### Task 7 [PARENT-DIRECT]: Update the release-hardening checker for the refreshed Node 22 digest

**Objective:** Mirror the same-major Node 22 Docker builder digest in the release-hardening checker.

**Files:**
- Modify: `scripts/release-hardening-check.mjs:107`
- Verify: `Dockerfile:1`

**Step 1: Update the checker’s Node 22 digest assertion**

Replace:

```javascript
check(dockerfile.includes("node:22-alpine@sha256:968df39aedcea65eeb078fb336ed7191baf48f972b4479711397108be0966920"), "Dockerfile must pin node:22-alpine by digest");
```

with the same digest used in `Dockerfile:1`, for example:

```javascript
check(dockerfile.includes("node:22-alpine@sha256:e58326d0d441090181ac150dc2078d3e2cf6a0d42e809aebba3ef5880935ffdd"), "Dockerfile must pin node:22-alpine by digest");
```

**Step 2: Run checker to verify GREEN**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check:release
```

Expected:

```text
release hardening checks passed
```

**Step 3: Verify Node major stayed at 22**

Run:

```bash
grep -n "^FROM node:" Dockerfile
grep -n "node:22-alpine" scripts/release-hardening-check.mjs
if grep -R "node:26-alpine" Dockerfile scripts/release-hardening-check.mjs .github/dependabot.yml; then
  echo "Unexpected Node 26 reference"
  exit 1
fi
```

Expected:

- `Dockerfile` uses `node:22-alpine@sha256:$NODE22_DIGEST`.
- The checker references `node:22-alpine@sha256:$NODE22_DIGEST`.
- No `node:26-alpine` references are found.

**Step 4: Commit**

Run:

```bash
git add Dockerfile scripts/release-hardening-check.mjs
git commit -m "build: refresh node 22 builder digest"
```

Expected: one commit containing only the same-major Node 22 digest refresh and checker mirror update.

---

## Phase 4 — Local verification before remote side effects

### Task 8 [PARENT-DIRECT]: Run local release gates and Docker smoke

**Objective:** Prove the branch is locally coherent before any push or PR mutation.

**Files:**
- Verify: `.github/workflows/ci.yml`
- Verify: `.github/dependabot.yml`
- Verify: `Dockerfile`
- Verify: `scripts/release-hardening-check.mjs`

**Step 1: Run the release checker**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check:release
```

Expected:

```text
release hardening checks passed
```

**Step 2: Run full local non-browser gate**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check
```

Expected: PASS for dependency guard, release checker, black-box checker, lint, typecheck, Vitest, production build, and bundle budget.

**Step 3: Run local Docker build and smoke when Docker is available**

Run:

```bash
SHA=$(git rev-parse HEAD)
docker build \
  --build-arg RFS_COMMIT_SHA="$SHA" \
  --build-arg RFS_IMAGE_REF="rfs:dependabot-release-hardening-$SHA" \
  --build-arg RFS_VERSION="$SHA" \
  -t "rfs:dependabot-release-hardening-$SHA" .
docker rm -f rfs_dep_smoke 2>/dev/null || true
docker run -d --name rfs_dep_smoke \
  --read-only \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --tmpfs /var/cache/nginx:rw,noexec,nosuid,size=16m,uid=101,gid=101,mode=755 \
  --tmpfs /var/run:rw,noexec,nosuid,size=4m,uid=101,gid=101,mode=755 \
  --tmpfs /tmp:rw,noexec,nosuid,size=16m,uid=101,gid=101,mode=1777 \
  --pids-limit 128 \
  --user 101:101 \
  --memory 256m --cpus 1.0 \
  -p 127.0.0.1:3005:8080 \
  "rfs:dependabot-release-hardening-$SHA"
for attempt in $(seq 1 20); do
  curl -fsS http://localhost:3005/ >/dev/null && break
  if [ "$attempt" = "20" ]; then docker logs --tail=50 rfs_dep_smoke; exit 1; fi
  sleep 1
done
curl -fsS http://localhost:3005/rfs-version.json | grep -F "$SHA"
docker rm -f rfs_dep_smoke
```

Expected:

- Docker image builds.
- Container starts under the same hardened runtime flags as CI.
- `/` returns HTTP 200.
- `/rfs-version.json` contains the local branch SHA.

If Docker is unavailable, record the exact blocker and rely on exact-SHA CI `docker-smoke` later. Do not claim local Docker smoke passed.

**Step 4: Ensure clean committed tree**

Run:

```bash
git status --short --branch
git log --oneline -4
```

Expected: clean working tree after the commits from Tasks 3, 5, and optionally 7.

**Step 5: Commit**

No commit unless verification uncovered a docs-only evidence update. Do not stage transient `dist/`, `test-results/`, or Docker output.

---

## Phase 5 — PR and Dependabot disposition

### Task 9 [PARENT-DIRECT, AUTHORIZATION REQUIRED]: Push the implementation branch and open a PR

**Objective:** Put the coupled release-hardening fix under GitHub Actions without mutating `master` directly.

**Files:**
- Read: `.github/workflows/ci.yml`
- Read: `scripts/release-hardening-check.mjs`
- Read: `.github/dependabot.yml`
- Read: `Dockerfile`
- External side effect: GitHub branch/PR creation.

**Step 1: Confirm authorization**

Do not run this task unless the user explicitly authorizes pushing/creating a PR in the current session.

**Step 2: Push branch**

Run:

```bash
BRANCH=$(git branch --show-current)
SHA=$(git rev-parse HEAD)
git push -u origin HEAD
git fetch origin "$BRANCH"
REMOTE_SHA=$(git rev-parse "origin/$BRANCH")
printf 'local=%s\nremote=%s\n' "$SHA" "$REMOTE_SHA"
test "$SHA" = "$REMOTE_SHA"
```

Expected: local and remote branch SHAs match.

**Step 3: Create PR**

Create `/tmp/rfs-dependabot-release-hardening-pr.md` with:

```md
## Summary

- update the pinned Trivy GitHub Action to v0.36.0 / `ed142fd0673e97e23eac54620cfb913e5ce36c25`
- update `scripts/release-hardening-check.mjs` so workflow pin policy remains mirrored and loud
- ignore Docker Node semver-major Dependabot bumps while RFS remains standardized on Node 22
- refresh `node:22-alpine` builder digest without moving to Node 26 (if Task 7 was executed)

## Dependabot disposition

- Supersedes PR #11 with a coupled workflow/checker update.
- Replaces PR #10 with Node-major ignore policy; if Tasks 6-7 were executed, it also includes same-major Node 22 builder digest maintenance.

## Verification

- `npm run check:release`: PASS
- `npm run check`: PASS
- local Docker smoke: PASS or blocked with exact blocker

## Non-claims

- PR CI is not deployment.
- `publish`/`deploy` are skipped on pull_request.
- Live `/rfs-version.json` must match the eventual master SHA before any live claim.
```

Run:

```bash
gh pr create \
  --base master \
  --head "$(git branch --show-current)" \
  --title "ci: refresh Dependabot release-hardening pins" \
  --body-file /tmp/rfs-dependabot-release-hardening-pr.md
```

Expected: GitHub returns a PR URL.

**Step 4: Commit**

No local commit. This task creates remote branch/PR state only.

---

### Task 10 [PARENT-DIRECT, AUTHORIZATION REQUIRED]: Wait for exact-SHA PR CI and close superseded Dependabot PRs

**Objective:** Verify the implementation PR’s exact head SHA, then dispose of PR #10/#11 with truthful comments.

**Files:**
- External side effects: GitHub PR comments/closures.

**Step 1: Capture PR head SHA**

Run:

```bash
PR=$(gh pr list --head "$(git branch --show-current)" --state open --json number --jq '.[0].number')
test -n "$PR"
HEAD_SHA=$(gh pr view "$PR" --json headRefOid --jq .headRefOid)
printf 'pr=%s head=%s\n' "$PR" "$HEAD_SHA"
test "$HEAD_SHA" = "$(git rev-parse HEAD)"
```

Expected: `HEAD_SHA` equals local `git rev-parse HEAD`.

**Step 2: Wait for exact-SHA PR checks**

Run:

```bash
RUN_IDS=$(gh run list --commit "$HEAD_SHA" --limit 10 \
  --json databaseId,workflowName,status,conclusion,headSha,event,url \
  --jq ".[] | select(.headSha==\"$HEAD_SHA\") | .databaseId")
test -n "$RUN_IDS"
for RUN_ID in $RUN_IDS; do
  gh run watch "$RUN_ID" --exit-status
  gh run view "$RUN_ID" --json status,conclusion,headSha,jobs \
    --jq '{status, conclusion, headSha, jobs:[.jobs[] | {name,status,conclusion}]}'
done
```

Expected:

- CI/CD `secret-scan`: success.
- CI/CD `test`: success.
- CI/CD `docker-smoke`: success.
- PR `publish` and `deploy`: skipped by workflow conditionals.
- CodeQL JavaScript/TypeScript analysis: success.

**Step 3: Comment and close PR #11 after the implementation PR is green**

Run only after the implementation PR is green and the user authorizes PR mutation:

```bash
gh pr comment 11 --body "Superseded by PR #$PR: the Trivy v0.36.0 pin was updated together with scripts/release-hardening-check.mjs so release policy remains mirrored and CI-enforced."
gh pr close 11
```

Expected: PR #11 closes with a supersession comment.

**Step 4: Comment and close PR #10**

Run only after the implementation PR includes the Node-major ignore policy and the user authorizes PR mutation:

```bash
gh pr comment 10 --body "Closing rather than merging: RFS remains standardized on Node 22 LTS for local, CI, and Docker builder parity. Node 26 is Current and would be a deliberate toolchain migration, not a routine production-runtime security patch. The replacement release-hardening PR keeps Node 22 and ignores Docker Node semver-major Dependabot bumps."
gh pr close 10
```

Expected: PR #10 closes with the rationale.

**Step 5: Commit**

No local commit. This task mutates GitHub PR state only.

---

## Phase 6 — Merge and exact-SHA closeout

### Task 11 [PARENT-DIRECT, AUTHORIZATION REQUIRED]: Merge implementation PR and verify master/deploy/live exact SHA

**Objective:** Complete the release-hardening dependency update without overclaiming; if merged to `master`, verify CI/deploy/live for the merge SHA.

**Files:**
- External side effects: GitHub PR merge, master CI/CD, production deploy.

**Step 1: Confirm merge authorization**

Do not merge until the user explicitly says to merge the implementation PR in the current session.

**Step 2: Merge the PR**

Run:

```bash
PR=$(gh pr list --head "$(git branch --show-current)" --state open --json number --jq '.[0].number')
test -n "$PR"
gh pr merge "$PR" --merge
```

Expected: PR merges into `master`.

**Step 3: Capture resulting master SHA**

Run:

```bash
git fetch origin master
MASTER_SHA=$(git ls-remote origin refs/heads/master | cut -f1)
printf 'master_sha=%s\n' "$MASTER_SHA"
```

Expected: `MASTER_SHA` is the merge commit, which may differ from the PR head.

**Step 4: Wait for exact-SHA master CI/CD and CodeQL**

Run:

```bash
CICD_RUN_ID=$(gh run list --branch master --commit "$MASTER_SHA" --workflow "CI/CD" --limit 10 \
  --json databaseId,workflowName,status,conclusion,headSha,event,url \
  --jq ".[] | select(.headSha==\"$MASTER_SHA\") | .databaseId" | head -n1)
test -n "$CICD_RUN_ID"
gh run watch "$CICD_RUN_ID" --exit-status
gh run view "$CICD_RUN_ID" --json status,conclusion,headSha,url,jobs \
  --jq '{status, conclusion, headSha, url, jobs:[.jobs[] | {name,status,conclusion,url}]}'
```

Expected:

- `secret-scan`: success.
- `test`: success.
- `docker-smoke`: success and uses Trivy action v0.36.0 pin.
- `publish`: success.
- `deploy`: success.
- `headSha` equals `$MASTER_SHA`.

For CodeQL:

```bash
CODEQL_RUN_ID=$(gh run list --branch master --commit "$MASTER_SHA" --workflow CodeQL --limit 5 \
  --json databaseId,status,conclusion,headSha,url \
  --jq ".[] | select(.headSha==\"$MASTER_SHA\") | .databaseId" | head -n1)
test -n "$CODEQL_RUN_ID"
gh run watch "$CODEQL_RUN_ID" --exit-status
gh run view "$CODEQL_RUN_ID" --json status,conclusion,headSha,url \
  --jq '{status, conclusion, headSha, url}'
```

Expected: CodeQL run at `$MASTER_SHA` completed successfully.

**Step 5: Verify live exact SHA**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
node scripts/check-exact-sha-release.mjs \
  --repo Reedtrullz/ReedFS \
  --branch master \
  --sha "$MASTER_SHA" \
  --live-url https://fly.reidar.tech/rfs-version.json
```

Expected includes:

```text
exact-SHA release ok for Reedtrullz/ReedFS@$MASTER_SHA
```

**Step 6: Report non-claims correctly**

Final report must separate:

- PR head SHA.
- master merge SHA.
- CI/CD run URL and job conclusions.
- CodeQL run URL and conclusion.
- live `/rfs-version.json` commit/version/imageRef/imageDigest.
- Dependabot PR #10/#11 disposition.

Do not say the PR head is live if a merge commit was deployed.

**Step 7: Commit**

No local commit. This task mutates GitHub and production state only.

---

## Plan review history

- Self-review 2026-06-16: Verified the plan uses exact current file paths and line regions from `master` after fast-forward to `2d18dbe45570bce657b697738d92f5d706536878`; marks GitHub push/comment/close/merge/deploy tasks `[PARENT-DIRECT, AUTHORIZATION REQUIRED]`; avoids staging line ranges or URLs in `git add`; uses Node 22 prefix for npm/node commands; separates local, PR CI, deploy, and live proof.
- Architecture safety review 2026-06-16: Plan touches release-governance files only and does not enter the runtime heartbeat. Silent-drift risk exists for Dependabot ignore policy unless the checker assertion is added first; Task 4 explicitly creates that RED condition.
- Independent review 2026-06-16: REQUEST_CHANGES. Blockers found: executable placeholder commands, implementation tasks 2 through 7 not marked parent-direct despite release-governance scope, conditional Node digest refresh overclaim in the PR body, clean-tree expectation not accounting for the untracked plan file, and `git diff --check` not inspecting an untracked plan.
- Focused re-review 2026-06-16: APPROVE. The review verified those blocker classes are closed: no executable placeholder commands remain, implementation tasks 2 through 7 are `[PARENT-DIRECT]`, the PR body is conditional on Tasks 6 and 7, Task 1 accounts for the untracked plan file, the plan-only verification uses `git add --intent-to-add` before `git diff --check`, and markdown fences are balanced.

## Plan-only verification checklist

Before treating this plan as ready:

```bash
cd /Users/reidar/Projectos/RFS
test -f docs/plans/2026-06-16-rfs-dependabot-release-hardening.md
grep -F "ed142fd0673e97e23eac54620cfb913e5ce36c25" docs/plans/2026-06-16-rfs-dependabot-release-hardening.md
grep -F "version-update:semver-major" docs/plans/2026-06-16-rfs-dependabot-release-hardening.md
grep -F "node:22-alpine@sha256:e58326d0d441090181ac150dc2078d3e2cf6a0d42e809aebba3ef5880935ffdd" docs/plans/2026-06-16-rfs-dependabot-release-hardening.md
grep -F "AUTHORIZATION REQUIRED" docs/plans/2026-06-16-rfs-dependabot-release-hardening.md
git add --intent-to-add docs/plans/2026-06-16-rfs-dependabot-release-hardening.md
python3 - <<'PY'
from pathlib import Path
p = Path('docs/plans/2026-06-16-rfs-dependabot-release-hardening.md')
text = p.read_text()
if text.count(chr(96) * 3) % 2:
    raise SystemExit('unbalanced markdown fences')
for marker in ['Task 1', 'Task 11', 'Plan review history', 'Plan-only verification checklist']:
    if marker not in text:
        raise SystemExit(f'missing marker: {marker}')
print('plan markers ok')
PY
git diff --check -- docs/plans/2026-06-16-rfs-dependabot-release-hardening.md
git reset -- docs/plans/2026-06-16-rfs-dependabot-release-hardening.md >/dev/null
```

Expected:

- All marker greps succeed.
- Python prints `plan markers ok`.
- `git diff --check` exits 0.

## Execution handoff

Plan complete when the review history above records a final focused re-review verdict. Execute implementation directly in the parent session; use subagents only for read-only review passes. Do not begin remote side-effect tasks until the user grants explicit current authorization.
