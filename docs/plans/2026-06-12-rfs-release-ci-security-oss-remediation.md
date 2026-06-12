# RFS Release, CI, Security, Deploy, and OSS Remediation Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task. Use strict TDD for code tasks, run two-stage reviews after each task, and preserve the non-claim discipline from the RFS project memory.

**Goal:** Make the project releaseable without overclaiming by aligning CI with local gates, adding Docker/deploy/rollback provenance, hardening runtime headers/container, adding governance files, and documenting exact-SHA closeout.

**Architecture:** Separate safe-to-automate repository changes from parent-direct external GitHub/VPS settings. Local gates and PR-safe Docker smoke can be automated; branch protection, secrets, push/deploy, and live verification require explicit authorization and exact evidence.

**Tech Stack:** React 19, TypeScript 6, Vite, Zustand, Vitest, Playwright, CesiumJS, Three.js, Docker/GitHub Actions where applicable.

**Source audit:** Derived from `/Users/reidar/Projectos/RFS/dogfood-output/2026-06-12-rfs-comprehensive-review/report.md` and the repo copy `/Users/reidar/Projectos/RFS/docs/reviews/2026-06-12-rfs-comprehensive-dogfood-audit.md`.

**Covers findings:** RFS-001, RFS-002, RFS-019, RFS-020, RFS-021, RFS-022, RFS-023, RFS-024, RFS-047, RFS-048, RFS-049, RFS-050

**Global rules:**
- Start every code task by writing the failing test and watching it fail for the expected reason.
- Use `source ~/.nvm/nvm.sh && nvm use 22` before every `npm`, `npx`, or `node` command.
- Do not push, deploy, rewrite history, read secrets, or modify credentials without explicit current authorization.
- Do not claim CI/live/full-flight/full-route/VNAV/data-backed FDM proof unless the exact evidence has actually been run.
- Use `patch` for existing source edits and `write_file` for new files.
- Commit after coherent task groups. Do not let parallel subagents commit in the same worktree.

---

### Task 1: Make CI run the full local check gate [PARENT-DIRECT]

**Objective:** Ensure CI includes `check:deps` so local and CI gates cannot diverge.

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `scripts/release-hardening-check.mjs`
- Modify: `src/config/__tests__/docsPosture.test.ts` if workflow parity tests exist

**Step 1: Write failing test**

```typescript
it('CI invokes the same aggregate local check gate or explicitly includes check:deps', () => {
  const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
  expect(ci).toMatch(/npm run check(:deps)?/);
});
```

**Step 2: Run test to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/config/__tests__/docsPosture.test.ts -t "CI"`
Expected: FAIL for the missing behavior, not a syntax/import error.

**Step 3: Write minimal implementation**

```yaml
# Preferred workflow step:
- run: npm run check
  env:
RFS_COMMIT_SHA: ${{ github.sha }}
RFS_IMAGE_REF: ghcr.io/reedtrullz/rfs:sha-${{ github.sha }}

# Or minimally add before check:release:
- run: npm run check:deps
```

**Step 4: Run test to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check:release && npm run check:deps`
Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`
Expected: PASS. For browser/runtime tasks also run `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npm run test:visual` after ensuring no stale local dev server owns port 5173.

**Step 6: Commit**

```bash
git add .github/workflows/ci.yml scripts/release-hardening-check.mjs src/config/__tests__/docsPosture.test.ts
git commit -m "ci: run full local dependency gate"
```


### Task 2: Add PR-safe Docker build and container smoke [PARENT-DIRECT]

**Objective:** Catch Dockerfile/nginx/RFMS path breakages before merge.

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `scripts/release-hardening-check.mjs`
- Modify: `Dockerfile` only if smoke requires metadata args

**Step 1: Write failing test**

```typescript
it('CI includes a PR-safe Docker build smoke with push disabled', () => {
  const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
  expect(ci).toContain('push: false');
  expect(ci).toContain('/rfs-version.json');
});
```

**Step 2: Run test to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/config/__tests__/docsPosture.test.ts -t "Docker"`
Expected: FAIL for the missing behavior, not a syntax/import error.

**Step 3: Write minimal implementation**

```yaml
- name: Build Docker image for smoke
  uses: docker/build-push-action@f9f3042f7e2789586610d6e8b85c8f03e5195baf
  with:
context: .
push: false
load: true
tags: rfs:ci-smoke
build-args: |
  RFS_COMMIT_SHA=${{ github.sha }}
  RFS_IMAGE_REF=rfs:ci-smoke
  RFS_VERSION=${{ github.sha }}
- name: Smoke Docker image
  run: |
docker run -d --rm --name rfs_ci_smoke -p 127.0.0.1:8088:80 rfs:ci-smoke
curl -fsS http://127.0.0.1:8088/
curl -fsS http://127.0.0.1:8088/rfs-version.json | grep -F "${GITHUB_SHA}"
docker rm -f rfs_ci_smoke
```

**Step 4: Run test to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check:release`
Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`
Expected: PASS. For browser/runtime tasks also run `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npm run test:visual` after ensuring no stale local dev server owns port 5173.

**Step 6: Commit**

```bash
git add .github/workflows/ci.yml scripts/release-hardening-check.mjs Dockerfile
git commit -m "ci: add Docker smoke test for pull requests"
```


### Task 3: Propagate image digest into release metadata [PARENT-DIRECT]

**Objective:** Make deployed `/rfs-version.json` identify the immutable image digest instead of `unknown`.

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `Dockerfile`
- Modify: `scripts/write-version-metadata.mjs` only if needed
- Modify: `scripts/release-hardening-check.mjs`

**Step 1: Write failing test**

```typescript
it('release metadata build args include image digest', () => {
  const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
  expect(ci).toContain('RFS_IMAGE_DIGEST');
});
```

**Step 2: Run test to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/config/__tests__/docsPosture.test.ts -t "image digest"`
Expected: FAIL for the missing behavior, not a syntax/import error.

**Step 3: Write minimal implementation**

```text
# Because build digest is only known after build, choose one:
# A. Generate a post-push manifest artifact with steps.build.outputs.digest.
# B. Run a metadata rewrite in deploy using the published digest and verify live JSON.
# Do not pretend Docker build can know its final digest before it is pushed.
```

**Step 4: Run test to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check:release`
Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`
Expected: PASS. For browser/runtime tasks also run `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npm run test:visual` after ensuring no stale local dev server owns port 5173.

**Step 6: Commit**

```bash
git add .github/workflows/ci.yml Dockerfile scripts/write-version-metadata.mjs scripts/release-hardening-check.mjs
git commit -m "feat: record image digest provenance"
```

**Review requirement:** This task needs design review because a Docker image cannot embed its own final pushed digest during the same build without a post-build manifest step.

### Task 4: Harden rollback verification and fail loudly [PARENT-DIRECT]

**Objective:** Remove silent rollback failure and verify health/version after rollback attempts.

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `ansible-playbook.yml`
- Modify: `scripts/release-hardening-check.mjs`

**Step 1: Write failing test**

```typescript
it('rollback does not hide docker run failures with unconditional true', () => {
  const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
  expect(ci).not.toMatch(/docker run[\s\S]{0,120}\|\| true/);
  expect(ci).toContain('Rollback health check');
});
```

**Step 2: Run test to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/config/__tests__/docsPosture.test.ts -t "rollback"`
Expected: FAIL for the missing behavior, not a syntax/import error.

**Step 3: Write minimal implementation**

```bash
rollback() {
  test -n "$PREVIOUS_IMAGE" || return 1
  docker rm -f rfs 2>/dev/null || true
  docker run -d --name rfs --restart unless-stopped \
    -p 127.0.0.1:3005:80 \
    "$PREVIOUS_IMAGE"
  curl -fsS http://localhost:3005/
  curl -fsS https://fly.reidar.tech/rfs-version.json
}
```

**Step 4: Run test to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check:release`
Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`
Expected: PASS. For browser/runtime tasks also run `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npm run test:visual` after ensuring no stale local dev server owns port 5173.

**Step 6: Commit**

```bash
git add .github/workflows/ci.yml ansible-playbook.yml scripts/release-hardening-check.mjs
git commit -m "fix: verify rollback health loudly"
```


### Task 5: Add nginx/browser security headers without COOP/COEP [PARENT-DIRECT]

**Objective:** Add safe baseline headers while preserving the Cesium cross-origin tile contract.

**Files:**
- Modify: `nginx.conf`
- Modify: `scripts/release-hardening-check.mjs`
- Modify: `docs/architecture.md`

**Step 1: Write failing test**

```typescript
it('nginx sets safe headers but not COOP/COEP', () => {
  const nginx = readFileSync('nginx.conf', 'utf8');
  expect(nginx).toContain('X-Content-Type-Options');
  expect(nginx).toContain('Referrer-Policy');
  expect(nginx).not.toMatch(/Cross-Origin-Embedder-Policy|Cross-Origin-Opener-Policy/);
});
```

**Step 2: Run test to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/config/__tests__/docsPosture.test.ts -t "headers"`
Expected: FAIL for the missing behavior, not a syntax/import error.

**Step 3: Write minimal implementation**

```nginx
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;
# Do not add COOP/COEP; Cesium Ion tiles require the current cross-origin behavior.
```

**Step 4: Run test to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check:release`
Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`
Expected: PASS. For browser/runtime tasks also run `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npm run test:visual` after ensuring no stale local dev server owns port 5173.

**Step 6: Commit**

```bash
git add nginx.conf scripts/release-hardening-check.mjs docs/architecture.md
git commit -m "security: add baseline static-site headers"
```


### Task 6: Harden runtime container [PARENT-DIRECT]

**Objective:** Run nginx with least privilege and read-only/cap-drop runtime flags where compatible.

**Files:**
- Modify: `Dockerfile`
- Modify: `.github/workflows/ci.yml`
- Modify: `ansible-playbook.yml`
- Modify: `scripts/release-hardening-check.mjs`

**Step 1: Write failing test**

```typescript
it('deploy commands run the container with basic hardening flags', () => {
  const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
  expect(ci).toContain('--read-only');
  expect(ci).toContain('--cap-drop ALL');
  expect(ci).toContain('no-new-privileges');
});
```

**Step 2: Run test to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/config/__tests__/docsPosture.test.ts -t "hardening"`
Expected: FAIL for the missing behavior, not a syntax/import error.

**Step 3: Write minimal implementation**

```bash
docker run -d --name rfs --restart unless-stopped   --read-only   --tmpfs /var/cache/nginx --tmpfs /var/run --tmpfs /tmp   --cap-drop ALL --security-opt no-new-privileges   -p 127.0.0.1:3005:80 "$IMAGE_REF"
```

**Step 4: Run test to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check:release`
Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`
Expected: PASS. For browser/runtime tasks also run `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npm run test:visual` after ensuring no stale local dev server owns port 5173.

**Step 6: Commit**

```bash
git add Dockerfile .github/workflows/ci.yml ansible-playbook.yml scripts/release-hardening-check.mjs
git commit -m "security: harden static nginx container"
```


### Task 7: Add OSS governance files and package metadata [PARENT-DIRECT]

**Objective:** Provide clear license/security/contribution/ownership metadata for public project readiness.

**Files:**
- Create: `LICENSE`
- Create: `SECURITY.md`
- Create: `CONTRIBUTING.md`
- Create: `.github/CODEOWNERS`
- Modify: `package.json`
- Modify: `README.md`

**Step 1: Write failing test**

```typescript
it('documents OSS governance files', () => {
  for (const file of ['LICENSE', 'SECURITY.md', 'CONTRIBUTING.md', '.github/CODEOWNERS']) {
expect(existsSync(file)).toBe(true);
  }
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  expect(pkg.license).toBeTruthy();
  expect(pkg.repository).toBeTruthy();
});
```

**Step 2: Run test to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/config/__tests__/docsPosture.test.ts -t "governance"`
Expected: FAIL for the missing behavior, not a syntax/import error.

**Step 3: Write minimal implementation**

```jsonc
// package.json metadata example:
"license": "MIT",
"repository": { "type": "git", "url": "https://github.com/Reedtrullz/ReedFS.git" },
"bugs": { "url": "https://github.com/Reedtrullz/ReedFS/issues" }
```

**Step 4: Run test to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check:release`
Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`
Expected: PASS. For browser/runtime tasks also run `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npm run test:visual` after ensuring no stale local dev server owns port 5173.

**Step 6: Commit**

```bash
git add LICENSE SECURITY.md CONTRIBUTING.md .github/CODEOWNERS package.json README.md
git commit -m "docs: add OSS governance files"
```

**Decision point:** Confirm license choice before committing. If no license decision exists, create SECURITY/CONTRIBUTING/CODEOWNERS and leave LICENSE blocked.

### Task 8: Add dependency update automation

**Objective:** Automate npm, GitHub Actions, and Docker base image update PRs without surprise major upgrades.

**Files:**
- Create: `.github/dependabot.yml`
- Modify: `scripts/release-hardening-check.mjs`
- Modify: `README.md`

**Step 1: Write failing test**

```yaml
it('configures dependency update automation', () => {
  const dep = readFileSync('.github/dependabot.yml', 'utf8');
  expect(dep).toContain('package-ecosystem: npm');
  expect(dep).toContain('package-ecosystem: github-actions');
  expect(dep).toContain('package-ecosystem: docker');
});
```

**Step 2: Run test to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/config/__tests__/docsPosture.test.ts -t "dependabot"`
Expected: FAIL for the missing behavior, not a syntax/import error.

**Step 3: Write minimal implementation**

```yaml
version: 2
updates:
  - package-ecosystem: npm
directory: /
schedule: { interval: weekly }
open-pull-requests-limit: 5
  - package-ecosystem: github-actions
directory: /
schedule: { interval: weekly }
  - package-ecosystem: docker
directory: /
schedule: { interval: weekly }
```

**Step 4: Run test to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check:release`
Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`
Expected: PASS. For browser/runtime tasks also run `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npm run test:visual` after ensuring no stale local dev server owns port 5173.

**Step 6: Commit**

```bash
git add .github/dependabot.yml scripts/release-hardening-check.mjs README.md
git commit -m "chore: add dependency update automation"
```


### Task 9: Update mutable latest deploy docs

**Objective:** Make README/architecture state that SHA images deploy, while `latest` is only an auxiliary tag.

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/roadmap.md`

**Step 1: Write failing test**

```typescript
it('deployment docs state deploy uses sha image', () => {
  const readme = readFileSync('README.md', 'utf8');
  expect(readme).toContain('deploys `sha-${GITHUB_SHA}`');
  expect(readme).not.toMatch(/deploys? .*latest/i);
});
```

**Step 2: Run test to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/config/__tests__/docsPosture.test.ts -t "deploy docs"`
Expected: FAIL for the missing behavior, not a syntax/import error.

**Step 3: Write minimal implementation**

```text
Publish job pushes both `latest` and `sha-${GITHUB_SHA}` for discoverability, but deploy and rollback run only immutable SHA/image-ID references. Live success requires `/rfs-version.json` commit equality.
```

**Step 4: Run test to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check:release`
Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`
Expected: PASS. For browser/runtime tasks also run `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npm run test:visual` after ensuring no stale local dev server owns port 5173.

**Step 6: Commit**

```bash
git add README.md docs/architecture.md docs/roadmap.md
git commit -m "docs: clarify immutable SHA deployment"
```


### Task 10: Configure branch protection and deploy concurrency [PARENT-DIRECT]

**Objective:** Apply safe repository governance settings while treating missing secrets/manual settings as blockers, not completed work.

**Files:**
- Modify: `.github/workflows/ci.yml`
- Create: `docs/runbooks/release-closeout.md` or modify README release section
- External: GitHub branch protection via `gh api`

**Step 1: Write failing test**

```typescript
it('workflow declares concurrency for master deploys', () => {
  const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
  expect(ci).toMatch(/concurrency:/);
  expect(ci).toContain('rfs-${{ github.ref }}');
});
```

**Step 2: Run test to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/config/__tests__/docsPosture.test.ts -t "concurrency"`
Expected: FAIL for the missing behavior, not a syntax/import error.

**Step 3: Write minimal implementation**

```yaml
concurrency:
  group: rfs-${{ github.ref }}
  cancel-in-progress: false
```

Branch protection must be verified externally:

```bash
gh api repos/Reedtrullz/ReedFS/branches/master/protection --jq '{required_status_checks, enforce_admins}'
```

**Step 4: Run test to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check:release && gh api repos/Reedtrullz/ReedFS/branches/master/protection --jq . >/tmp/rfs-branch-protection.json`
Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`
Expected: PASS. For browser/runtime tasks also run `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npm run test:visual` after ensuring no stale local dev server owns port 5173.

**Step 6: Commit**

```bash
git add .github/workflows/ci.yml docs/runbooks/release-closeout.md
git commit -m "ci: add deploy concurrency and branch protection runbook"
```

**External setting boundary:** Do not mark branch protection complete unless the `gh api` command proves required checks are active. If permissions are missing, leave the task blocked with exact missing access.

### Task 11: Exact-SHA push/deploy/live closeout [PARENT-DIRECT]

**Objective:** When explicitly authorized, push and prove the exact committed SHA through GitHub Actions and live version metadata.

**Files:**
- No source file required unless updating release ledger
- Modify: `docs/reviews/2026-06-12-rfs-comprehensive-dogfood-audit.md` with exact evidence after completion
- External: GitHub Actions and live `https://fly.reidar.tech/rfs-version.json`

**Step 1: Write failing test**

```text
// This is an operational checklist, not a unit test.
// Use the shell commands below as the acceptance test.
```

**Step 2: Run test to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check && CI=1 npm run test:visual && git status --short --branch`
Expected: FAIL for the missing behavior, not a syntax/import error.

**Step 3: Write minimal implementation**

```bash
# After explicit authorization only:
git push origin master
FINAL_SHA=$(git rev-parse HEAD)
gh run list --repo Reedtrullz/ReedFS --workflow 'CI/CD' --json databaseId,headSha,status,conclusion --jq ".[] | select(.headSha == "$FINAL_SHA")"
# Wait until status=completed and conclusion=success, then:
curl -fsSL https://fly.reidar.tech/rfs-version.json | grep -F "$FINAL_SHA"
```

**Step 4: Run test to verify pass**

Run: `FINAL_SHA=$(git rev-parse HEAD) && curl -fsSL https://fly.reidar.tech/rfs-version.json | grep -F "$FINAL_SHA"`
Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`
Expected: PASS. For browser/runtime tasks also run `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npm run test:visual` after ensuring no stale local dev server owns port 5173.

**Step 6: Commit**

```bash
git add docs/reviews/2026-06-12-rfs-comprehensive-dogfood-audit.md
git commit -m "chore: record exact-sha release closeout evidence"
```

**Do not execute without user authorization.** Green local gates are not CI. A successful image build is not deployment. A running workflow is not success. Live proof requires a fetched endpoint matching the final SHA.

## Dependency map

- Tasks 1-2 should happen before branch protection so required checks match the real release gate.
- Tasks 3-6 affect deploy semantics; review workflow YAML with `ruby -ryaml -e "YAML.load_file('.github/workflows/ci.yml'); puts 'OK'"` before committing.
- Tasks 7-8 can run independently after license/automation decisions.
- Tasks 10-11 are [PARENT-DIRECT] and require external authorization/access.

## Plan review history

- Initial controller pass: based on `.github/workflows/ci.yml`, `Dockerfile`, `nginx.conf`, `scripts/write-version-metadata.mjs`, `scripts/release-hardening-check.mjs`, and release findings RFS-001/002/020..024/047..050.
- Independent coverage review: PASS — RFS-001 through RFS-055 are mapped with no missing/extra IDs and each child plan has actionable tasks.
- Independent command/path review: initial blockers found for invalid `git add` pathspecs, bare visual-test commands, and code-fence language mismatches; all were patched.
- Independent architecture/deploy-governance review: initial blockers found for worker/scheduler heartbeat safety and deploy-security parent-direct markings; all were patched.
- Final focused re-review: PASS — no remaining command/path/fence blockers and architecture/deploy-governance blockers are closed.
