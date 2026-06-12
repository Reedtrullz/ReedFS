# RFS Comprehensive Remediation Program Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task. Use strict TDD for code tasks, run two-stage reviews after each task, and preserve the non-claim discipline from the RFS project memory.

**Goal:** Turn the 55 dogfood/deep-review findings into an executable long-running remediation program.

**Architecture:** This is the umbrella plan. It sequences six focused implementation plans so truth/playability blockers land before deeper realism, architecture, and release governance. Each child plan is independently executable, but closeout only succeeds when the issue matrix is green and the final gates are run on the committed tree.

**Tech Stack:** React 19, TypeScript 6, Vite, Zustand, Vitest, Playwright, CesiumJS, Three.js, Docker/GitHub Actions where applicable.

**Source audit:** Derived from `/Users/reidar/Projectos/RFS/dogfood-output/2026-06-12-rfs-comprehensive-review/report.md` and the repo copy `/Users/reidar/Projectos/RFS/docs/reviews/2026-06-12-rfs-comprehensive-dogfood-audit.md`.

**Covers findings:** RFS-001 through RFS-055

**Global rules:**
- Start every code task by writing the failing test and watching it fail for the expected reason.
- Use `source ~/.nvm/nvm.sh && nvm use 22` before every `npm`, `npx`, or `node` command.
- Do not push, deploy, rewrite history, read secrets, or modify credentials without explicit current authorization.
- Do not claim CI/live/full-flight/full-route/VNAV/data-backed FDM proof unless the exact evidence has actually been run.
- Use `patch` for existing source edits and `write_file` for new files.
- Commit after coherent task groups. Do not let parallel subagents commit in the same worktree.

---

## Execution order

1. `2026-06-12-rfs-p0-truth-playability-remediation.md` — unblock player-truth gaps first.
2. `2026-06-12-rfs-autoflight-fms-vnav-remediation.md` — make AP/FMS/VNAV modes reachable, backed, and browser-proven.
3. `2026-06-12-rfs-browser-ux-accessibility-product-remediation.md` — fix accessibility, overlay, responsive, product, and browser-test noise.
4. `2026-06-12-rfs-flight-model-ground-landing-realism-remediation.md` — deepen source-lineaged FDM/ground/landing realism.
5. `2026-06-12-rfs-architecture-performance-runtime-remediation.md` — split runtime/App/store and connect worker/frame scheduling.
6. `2026-06-12-rfs-release-ci-security-oss-remediation.md` — harden CI/deploy/OSS and perform exact-SHA closeout only when authorized.

## Issue-to-plan matrix

| Finding | Primary plan | Notes |
|---|---|---|
| RFS-001, RFS-002, RFS-020..024, RFS-047..050 | release-ci-security-oss | Parent-direct for external GitHub settings, secrets, push/deploy. |
| RFS-003, RFS-004, RFS-005, RFS-006, RFS-007, RFS-026, RFS-041 | p0-truth-playability | First because these affect what the player is told to do. |
| RFS-008, RFS-009, RFS-010, RFS-035..038 | autoflight-fms-vnav | Depends on LOAD PLAN/AP semantics from P0 plan. |
| RFS-011..015, RFS-039, RFS-040, RFS-051..055 | browser-ux-accessibility-product | Can partly run in parallel after P0 behavior is stable. |
| RFS-025, RFS-027..034 | flight-model-ground-landing-realism | Requires careful source-lineage and TDD; do not retune invisibly. |
| RFS-016..019, RFS-042..046 | architecture-performance-runtime | Contains several [PARENT-DIRECT] cross-cutting tasks. |

## Global final closeout task

### Task M1: Issue matrix and evidence ledger closeout

**Objective:** Close the remediation program honestly after all child plans have been executed.

**Files:**
- Modify: `docs/reviews/2026-06-12-rfs-comprehensive-dogfood-audit.md`
- Modify: `docs/roadmap.md`
- Modify: `docs/plans/README.md`

**Steps:**
1. Create an issue matrix table with one row per RFS-001..RFS-055 and columns: status, commit, tests, proof boundary, non-claims.
2. Run `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`.
3. Run `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npm run test:visual`.
4. Run `git diff --check` and `git status --short --branch`.
5. If push/deploy is authorized, follow the release closeout plan and verify exact SHA via GitHub Actions and live `/rfs-version.json`. If not authorized, record “not pushed/not deployed/no CI-live claim”.
6. Commit only tracked documentation/source artifacts; do not commit raw `dogfood-output/screenshots` unless explicitly requested.

**Plan review history:**
- Initial controller pass: built from the 55-finding dogfood report, current `docs/architecture.md`, `docs/roadmap.md`, `package.json`, and targeted source reads.
- Independent coverage review: PASS — RFS-001 through RFS-055 are mapped with no missing/extra IDs and each child plan has actionable tasks.
- Independent command/path review: initial blockers found for invalid `git add` pathspecs, bare visual-test commands, and code-fence language mismatches; all were patched.
- Independent architecture/deploy-governance review: initial blockers found for worker/scheduler heartbeat safety and deploy-security parent-direct markings; all were patched.
- Final focused re-review: PASS — no remaining command/path/fence blockers and architecture/deploy-governance blockers are closed.
