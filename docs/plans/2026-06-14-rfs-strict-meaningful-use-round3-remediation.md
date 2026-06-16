# RFS Strict Meaningful-Use Round 3 Remediation Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task. Use a fresh implementer per task, then a spec-compliance review, then a code-quality review. Tasks marked `[PARENT-DIRECT]` must be executed by the parent/controller session because they touch runtime heartbeat, physics, deploy, or broad cross-file semantics.

**Goal:** Remediate every finding from `docs/reviews/2026-06-14-rfs-strict-meaningful-use-round3.md` so RFS can honestly progress toward a meaningful browser-native 737 flight loop and the final Task 7 continuous black-box acceptance.

**Architecture:** The plan fixes proof hygiene and visible takeoff truth first, then airborne AP/FMA/VNAV truth, then route-to-approach/landing continuity, then ground/UX/runtime/release hardening. The central runtime heartbeat from `docs/architecture.md` must not be reordered unless a task explicitly says so: input actions -> fixed simulation tick -> pre-integration route status -> AP command resolution -> effective controls -> `integrate()` -> post-integration route/guidance snapshot.

**Tech Stack:** React 19, TypeScript 6, Vite, Zustand, Vitest, Playwright, CesiumJS, Three.js, Docker/GitHub Actions/nginx/Ansible where applicable.

**Source review:** Derived from `docs/reviews/2026-06-14-rfs-strict-meaningful-use-round3.md`, `docs/architecture.md`, `docs/roadmap.md`, current `package.json`, current `.github/workflows/ci.yml`, and targeted reads of `src/store/slices/aircraftSlice.ts`, `src/components/TakeoffSetupPanel.tsx`, `src/app/RfsShell.tsx`, `src/sim/systems/{navigation,vnav,guidanceTargets,effectiveAutoflightTruth,ground}.ts`, `src/sim/flightPlanLoader.ts`, `src/sim/scenarios.ts`, `src/sim/simulationRuntime.ts`, `e2e/*`, and `scripts/check-blackbox-e2e.mjs`.

**Covers findings:** Evidence closeout/status ledger for RFS-R3-001 through RFS-R3-044 after Tasks 1-44; primary remediation coverage remains in the finding-to-task matrix above..

**Global rules:**
- For local shell commands, use `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null` before every `npm`, `npx`, or `node` command. GitHub Actions YAML snippets run after `actions/setup-node` with `node-version: 22`, so they should use the workflow-provided Node rather than `nvm`.
- Start code tasks with a narrow failing test and verify the expected failure before implementation.
- Do not push, deploy, rewrite history, read secrets, change branch protection, or change GitHub environments without explicit current authorization.
- Do not claim CI, live, deployment, full-route, full-flight, Task 7, VNAV, or data-backed 737 realism unless the exact proof was actually run and recorded.
- Use `CI=1` for Playwright commands that must own the dev server and apply test env vars. Do not trust a local reused server for product/runtime-boundary proof.
- Keep seeded/browser-assisted tests as subsystem proofs only. Full-flight acceptance must use visible controls/keyboard/gamepad-like inputs and the black-box guard.
- Keep raw `dogfood-output/` untracked unless explicitly requested.
- Commit after coherent task groups. Do not run parallel subagents that both commit in the same worktree.

---

## Dependency map

```text
Tasks 1-4: proof/CI guard hygiene; do first so later tests cannot cheat silently.
Tasks 5-10: visible takeoff/setup truth; blocks Task 7 and later AP dogfood.
Tasks 11-18: AP/FMA/VNAV/managed-speed truth; depends on stable takeoff proof.
Tasks 19-26: route/descent/approach/landing continuity and final black-box proof; depends on AP truth.
Tasks 27-29: ground/contact/terrain truth; can run after takeoff truth but before final landing claim.
Tasks 30-38: worker/perf/persistence/cockpit/controls/accessibility/responsive/audio product gaps.
Tasks 39-44: release/security/OSS/documentation governance; several are `[PARENT-DIRECT]`.
Task 45: final evidence ledger/closeout; only after all prior tasks are genuinely complete.
```

## Finding-to-task matrix

| Finding | Task(s) | Notes |
|---|---|---|
| RFS-R3-001 | 1, 8, 26 | Continuous black-box acceptance is final, not first; Task 45 records closeout evidence for the whole matrix. |
| RFS-R3-002 | 5 | `START ROLL` setup reset. |
| RFS-R3-003 | 6 | Guidance copy must match runtime. |
| RFS-R3-004 | 7 | Human-operable setup controls. |
| RFS-R3-005 | 19, 20 | Route-to-runway/landing handoff. |
| RFS-R3-006 | 21, 25 | Real phase lifecycle to descent/approach. |
| RFS-R3-007 | 1, 8, 26 | Guard black-box vs seeded proofs. |
| RFS-R3-008 | 12, 18 | No misleading `PITCH OFF / CMD_A` dive. |
| RFS-R3-009 | 13, 18 | ALT capture truth. |
| RFS-R3-010 | 8, 9 | No uncommanded auto-rotation/climb. |
| RFS-R3-011 | 15 | VNAV armed vs active target truth. |
| RFS-R3-012 | 16 | Independent vertical/speed VNAV target search. |
| RFS-R3-013 | 1 | Guard manifest/import graph. |
| RFS-R3-014 | 2 | Wire guard into local/CI aggregate gates. |
| RFS-R3-015 | 3 | Split production-like E2E from visual-test mode. |
| RFS-R3-016 | 4 | Route visual proof must require route loaded. |
| RFS-R3-017 | 17, 18 | Managed speed vs speed intervention plus browser AP proof. |
| RFS-R3-018 | 14 | Unsupported modes not shown as backed. |
| RFS-R3-019 | 22 | RFMS/CDU route UI or canned-only label. |
| RFS-R3-020 | 23 | Fly until discontinuity. |
| RFS-R3-021 | 11 | FD-only honesty. |
| RFS-R3-022 | 10 | A/T takeoff mode gating separate from AP gating. |
| RFS-R3-023 | 27 | Main/nose gear contact specificity. |
| RFS-R3-024 | 28 | Touchdown sink/contact recording. |
| RFS-R3-025 | 21, 25 | Visible descent workflow without seeding. |
| RFS-R3-026 | 19, 24 | KPDX route/scenario/runway/performance alignment. |
| RFS-R3-027 | 39 | Deploy by digest or running-image digest inspection. |
| RFS-R3-028 | 40 | Branch protection includes Docker smoke/Trivy. |
| RFS-R3-029 | 41 | Cesium token docs as restricted browser credential. |
| RFS-R3-030 | 41 | README exact-SHA deploy wording. |
| RFS-R3-031 | 41 | Align/deprecate Ansible deploy path. |
| RFS-R3-032 | 29 | Unsupported terrain honesty. |
| RFS-R3-033 | 30 | Worker flag/store-loop truth. |
| RFS-R3-034 | 31 | PFD view-model/render budget. |
| RFS-R3-035 | 32 | Persistence validation/fuzzing. |
| RFS-R3-036 | 33 | Cockpit playable or explicit visual-only labels. |
| RFS-R3-037 | 34 | Discoverable controls/onboarding. |
| RFS-R3-038 | 35 | Gamepad calibration/remap truth. |
| RFS-R3-039 | 36 | Keyboard-only/a11y operability proof. |
| RFS-R3-040 | 37 | Small-height/split-pane responsive proof. |
| RFS-R3-041 | 38 | Captions expiry and broader captions. |
| RFS-R3-042 | 42 | CSP report-only. |
| RFS-R3-043 | 43 | Docker reproducibility/SBOM stance. |
| RFS-R3-044 | 44 | Code of Conduct. |

---

## Phase A — Proof hygiene and test gates

### Task 1: Expand strict black-box guard to a manifest/import graph

**Objective:** Make the black-box guard scan every strict black-box spec plus helper/import surface so future full-flight proof cannot hide store mutation.

**Covers findings:** RFS-R3-001, RFS-R3-007, RFS-R3-013

**Files:**
- Modify: `scripts/check-blackbox-e2e.mjs`
- Create: `e2e/blackbox-manifest.json`
- Create: `scripts/__tests__/check-blackbox-e2e.test.mjs`
- Create: `scripts/__tests__/fixtures/blackbox-e2e/forbidden-manifest.json`
- Create: `scripts/__tests__/fixtures/blackbox-e2e/forbidden-entry.spec.ts`
- Create: `scripts/__tests__/fixtures/blackbox-e2e/forbidden-helper.ts`
- Read: `e2e/rfs-blackbox-player-loop.spec.ts`, `e2e/helpers/rfsBlackbox.ts`

**Step 1: Write failing test**

Create a fixture manifest whose entrypoint imports a helper that imports app source. Assert the checker exits nonzero and reports the helper path. Add a `--repo-root <path>` test-only option if needed so the checker can scan the fixture without touching the real `e2e/` tree.

```javascript
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

it('fails when a manifest-listed black-box helper imports app source', () => {
  const fixtureRoot = path.resolve('scripts/__tests__/fixtures/blackbox-e2e');
  const result = spawnSync(process.execPath, [
    'scripts/check-blackbox-e2e.mjs',
    '--repo-root', fixtureRoot,
    '--manifest', 'forbidden-manifest.json',
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('forbidden-helper.ts');
  expect(result.stderr).toContain('direct src import path');
});
```

**Step 2: Run test to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run scripts/__tests__/check-blackbox-e2e.test.mjs`

Expected: FAIL until the manifest CLI, `--repo-root` fixture option, and import-graph helper scan are implemented.

**Step 3: Implement minimal guard**

- `e2e/blackbox-manifest.json` should list the initial strict specs:

```json
{
  "entrypoints": [
    "e2e/rfs-blackbox-player-loop.spec.ts"
  ]
}
```

- Update `scripts/check-blackbox-e2e.mjs` to read `--manifest <path>` or default to `e2e/blackbox-manifest.json`.
- Iterate every manifest entrypoint and reuse the existing recursive import scan.
- Print every scanned entrypoint and final visited-file count.
- Keep forbidden patterns at least as strict as current: no `useSimStore`, `setState`, `/src/`, app-module imports, aircraft/flightPlan object seeding, or `page.evaluate`.

**Step 4: Verify**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check:blackbox
```

Expected: PASS and output includes every manifest-listed entrypoint.

**Step 5: Commit**

```bash
git add scripts/check-blackbox-e2e.mjs e2e/blackbox-manifest.json scripts/__tests__/check-blackbox-e2e.test.mjs scripts/__tests__/fixtures/blackbox-e2e/forbidden-manifest.json scripts/__tests__/fixtures/blackbox-e2e/forbidden-entry.spec.ts scripts/__tests__/fixtures/blackbox-e2e/forbidden-helper.ts
git commit -m "test: scan black-box e2e manifest"
```

### Task 2: Add black-box guard to local and CI aggregate gates

**Objective:** Ensure strict black-box proof hygiene cannot be skipped by `npm run check` or CI.

**Covers findings:** RFS-R3-014

**Files:**
- Modify: `package.json:24-40`
- Modify: `.github/workflows/ci.yml:49-62`
- Modify: `docs/runbooks/branch-protection.md` if required contexts or local gate descriptions mention the check list

**Step 1: Write failing guard/parity test**

Add or extend a script-level test that reads `package.json` and `.github/workflows/ci.yml` as text and asserts `check:blackbox` appears in both aggregate local and CI `test` job steps.

```javascript
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

it('keeps black-box guard in local and CI gates', () => {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const ci = fs.readFileSync('.github/workflows/ci.yml', 'utf8');
  expect(pkg.scripts.check).toContain('npm run check:blackbox');
  expect(ci).toContain('npm run check:blackbox');
});
```

**Step 2: Run test to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/config/__tests__/docsPosture.test.ts`

Expected: FAIL until local and CI gates include `check:blackbox`.

**Step 3: Implement minimal change**

- Change `package.json` `check` to include `npm run check:blackbox` after `check:release` and before lint/type/test.
- Add a CI step after `npm run check:release`:

```yaml
      - run: npm run check:blackbox
```

**Step 4: Verify**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check:blackbox && npm run check
```

Expected: PASS.

**Step 5: Commit**

```bash
git add package.json .github/workflows/ci.yml docs/runbooks/branch-protection.md src/config/__tests__/docsPosture.test.ts
git commit -m "ci: require black-box proof guard"
```

### Task 3: Split visual Playwright mode from production-like E2E mode

**Objective:** Make Task 7 and product runtime proof run production-like instead of always under `VITE_RFS_VISUAL_TEST=1`.

**Covers findings:** RFS-R3-015

**Files:**
- Modify: `playwright.config.ts`
- Modify: `package.json:24-40`
- Test: `src/config/__tests__/visualTest.test.ts`

**Step 1: Write failing test**

Add a config/source test proving product E2E scripts do not set `VITE_RFS_VISUAL_TEST=1`, while visual scripts do.

```typescript
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('Playwright runtime modes', () => {
  it('keeps production-like e2e separate from visual snapshots', () => {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> };
    expect(pkg.scripts['test:e2e']).toContain('playwright test');
    expect(pkg.scripts['test:e2e']).not.toContain('VITE_RFS_VISUAL_TEST=1');
    expect(pkg.scripts['test:visual']).toContain('VITE_RFS_VISUAL_TEST=1');
  });
});
```

**Step 2: Run test to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/config/__tests__/visualTest.test.ts`

Expected: FAIL until `test:e2e` exists and visual env is isolated.

**Step 3: Implement minimal change**

- Add `test:e2e`: `CI=1 PLAYWRIGHT_JSON_OUTPUT_NAME=test-results/e2e-timings.json playwright test --workers=1 --reporter=line`.
- Keep `test:visual` as visual snapshots with `VITE_RFS_VISUAL_TEST=1`.
- Use one `playwright.config.ts`; make `webServer.env` conditional on `process.env.VITE_RFS_VISUAL_TEST === '1'` instead of forcing it for every Playwright run. Do not create `playwright.visual.config.ts` in this task.

**Step 4: Verify**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run typecheck && CI=1 npm run test:e2e -- --grep "black-box player loop"
```

Expected: PASS; if no grep match exists yet, the command should be adjusted to the current black-box spec name and recorded.

**Step 5: Commit**

```bash
git add package.json playwright.config.ts src/config/__tests__/visualTest.test.ts
git commit -m "test: split visual and production e2e modes"
```

### Task 4: Make route visual proof require a loaded KSEA route

**Objective:** Remove the false-positive visual proof that accepts `NO ROUTE` after `LOAD PLAN`.

**Covers findings:** RFS-R3-016

**Files:**
- Modify: `e2e/rfs-visual.spec.ts:19-23`
- Modify: `e2e/helpers/rfsPage.ts` if scenario selection helper is missing

**Step 1: Write failing test change**

In `e2e/rfs-visual.spec.ts`, replace the broad assertion:

```typescript
await expect(page.getByLabel('Route status')).toContainText(/NO ROUTE|KSEA→KPDX/);
```

with scenario-select + exact route assertion:

```typescript
await page.getByLabel('Scenario').selectOption('ksea-tutorial');
await clickButton(page, /LOAD PLAN/i);
await expect(page.getByLabel('Route status')).toContainText('KSEA→KPDX');
await expect(page.getByLabel('Route status')).toContainText(/KSEA\s+→\s+OLM/);
```

**Step 2: Run to verify current failure or tightened behavior**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npx playwright test e2e/rfs-visual.spec.ts --grep "route overlay" --workers=1 --reporter=line`

Expected: FAIL until the helper/scenario selection is correct, then PASS.

**Step 3: Implement minimal helper update**

If the scenario control label differs, read the DOM with existing helpers and update the test selector to match the actual product UI. Do not use `page.evaluate` or store mutation.

**Step 4: Verify**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npx playwright test e2e/rfs-visual.spec.ts --grep "route overlay" --workers=1 --reporter=line
```

Expected: PASS.

**Step 5: Commit**

```bash
git add e2e/rfs-visual.spec.ts e2e/helpers/rfsPage.ts
git commit -m "test: require loaded route in visual proof"
```

---

## Phase B — Visible takeoff/setup truth

### Task 5: Preserve scenario takeoff setup across `START ROLL`

**Objective:** Stop `startTakeoffRoll()` from destroying flaps, trim, and pilot throttle setup unexpectedly.

**Covers findings:** RFS-R3-002

**Files:**
- Modify: `src/store/slices/aircraftSlice.ts:98-130`
- Test: `src/store/__tests__/simStore.test.ts`
- Test: `src/components/__tests__/TakeoffSetupPanel.test.tsx`

**Step 1: Write failing test**

Add a store test:

```typescript
it('preserves configured takeoff flaps and trim when starting the roll', () => {
  const store = useSimStore.getState();
  store.setScenario('ksea-tutorial');
  store.setInput({ flapLever: 5, throttle1: 0, throttle2: 0 });
  store.startTakeoffRoll();
  const next = useSimStore.getState();
  expect(next.aircraft.flightPhase).toBe('TAKEOFF');
  expect(next.inputs.flapLever).toBe(5);
  expect(next.aircraft.config.stabilizerTrimUnits).toBeCloseTo(5.0, 1);
});
```

**Step 2: Run test to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/store/__tests__/simStore.test.ts -t "preserves configured takeoff"`

Expected: FAIL because `flapLever` and trim are reset to zero.

**Step 3: Implement minimal change**

- In `startTakeoffRoll`, remove the unconditional `aircraft.config.flapSetting = 0` and `aircraft.config.stabilizerTrimUnits = 0` resets.
- Preserve current/scenario `s.pilotInputs.flapLever`, `s.pilotInputs.throttle1`, `s.pilotInputs.throttle2`, and current stabilizer trim unless the user has not configured them.
- Keep safety resets for brakes, left/right brakes, elevator, AP state, AP controller state, and timers.
- Keep gear forced down at start.

**Step 4: Verify**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/store/__tests__/simStore.test.ts src/components/__tests__/TakeoffSetupPanel.test.tsx
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/store/slices/aircraftSlice.ts src/store/__tests__/simStore.test.ts src/components/__tests__/TakeoffSetupPanel.test.tsx
git commit -m "fix: preserve takeoff setup on start roll"
```

### Task 6: Align takeoff/tutorial/route-load guidance with runtime behavior

**Objective:** Make every player-facing takeoff instruction match the new `START ROLL` semantics.

**Covers findings:** RFS-R3-003

**Files:**
- Modify: `src/components/TakeoffSetupPanel.tsx:73-100`
- Modify: `src/app/RfsShell.tsx:237-248`
- Modify: `src/sim/scenarios.ts:78-137`
- Test: `src/components/__tests__/TakeoffSetupPanel.test.tsx`
- Test: `src/__tests__/App.test.tsx` or `src/components/__tests__/ScenarioPanel.test.tsx`

**Step 1: Write failing test**

Assert the panel no longer says `START ROLL resets` and the route load message says configured values are preserved.

```typescript
expect(screen.getByRole('region', { name: 'Takeoff setup' })).toHaveTextContent(/START ROLL preserves/i);
expect(screen.queryByText(/resets the takeoff levers/i)).not.toBeInTheDocument();
```

**Step 2: Run test to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/components/__tests__/TakeoffSetupPanel.test.tsx src/components/__tests__/ScenarioPanel.test.tsx`

Expected: FAIL until copy is updated.

**Step 3: Implement minimal copy update**

- Panel copy: “Set flaps, trim, and throttle before or after START ROLL. START ROLL preserves the configured takeoff setup and clears brakes/AP.”
- Route-load copy: “KSEA→KPDX route loaded. Confirm flaps 5, trim 5.0, idle throttle, then START ROLL.”
- Scenario tutorial bodies must not say `START ROLL resets`.

**Step 4: Verify**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/components/__tests__/TakeoffSetupPanel.test.tsx src/components/__tests__/ScenarioPanel.test.tsx src/__tests__/App.test.tsx -t "route loaded|takeoff"`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/components/TakeoffSetupPanel.tsx src/app/RfsShell.tsx src/sim/scenarios.ts src/components/__tests__/TakeoffSetupPanel.test.tsx src/components/__tests__/ScenarioPanel.test.tsx src/__tests__/App.test.tsx
git commit -m "fix: align takeoff setup guidance with runtime"
```

### Task 7: Add human-operable bidirectional takeoff setup controls

**Objective:** Make visible setup recoverable without 50+ clicks or irreversible overshoot.

**Covers findings:** RFS-R3-004

**Files:**
- Modify: `src/components/TakeoffSetupPanel.tsx`
- Modify: `src/input/keyboardControls.ts` only if new input actions are needed
- Modify: `src/store/simStoreInputReducers.ts` if adding `setTakeoffConfig` action
- Test: `src/components/__tests__/TakeoffSetupPanel.test.tsx`
- Test: `src/input/__tests__/keyboardControls.test.ts` if input actions change

**Step 1: Write failing component test**

```typescript
it('exposes bidirectional and target takeoff setup controls', async () => {
  render(<TakeoffSetupPanel />);
  expect(screen.getByRole('button', { name: /Flaps Previous/i })).toBeVisible();
  expect(screen.getByRole('button', { name: /Trim Nose Down/i })).toBeVisible();
  expect(screen.getByRole('button', { name: /Throttle Down/i })).toBeVisible();
  expect(screen.getByRole('button', { name: /Set takeoff config/i })).toBeVisible();
});
```

**Step 2: Run test to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/components/__tests__/TakeoffSetupPanel.test.tsx`

Expected: FAIL because only one-way controls exist.

**Step 3: Implement minimal controls**

- Add `Flaps Previous`, `Trim Nose Down`, `Throttle Down` buttons.
- Add `Set takeoff config` button that applies the active scenario values: `flapLever=scenario.flapSetting`, `stabilizerTrimUnits=scenario.stabilizerTrimUnits`, `gearLever='DOWN'`, throttles idle unless the task deliberately chooses a safe preset.
- If there is no direct action for stabilizer trim set, add a store action rather than simulating 50 trim clicks.

**Step 4: Verify**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/components/__tests__/TakeoffSetupPanel.test.tsx src/store/__tests__/simStore.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/components/TakeoffSetupPanel.tsx src/components/__tests__/TakeoffSetupPanel.test.tsx src/input/keyboardControls.ts src/input/__tests__/keyboardControls.test.ts src/store/simStoreInputReducers.ts src/store/__tests__/simStore.test.ts
git commit -m "feat: add recoverable takeoff setup controls"
```

### Task 8: Add strict black-box visible KSEA takeoff-to-positive-rate proof

**Objective:** Prove route load, setup, start roll, rotation, positive rate, and gear-up through visible/keyboard controls without store mutation.

**Covers findings:** RFS-R3-001, RFS-R3-007, RFS-R3-010

**Files:**
- Modify: `e2e/rfs-blackbox-player-loop.spec.ts`
- Modify: `e2e/helpers/rfsBlackbox.ts`
- Modify: `e2e/blackbox-manifest.json`

**Step 1: Write failing E2E**

Extend the black-box spec with visible assertions only:

```typescript
test('KSEA route takeoff reaches positive rate and gear up through visible controls', async ({ page }) => {
  await openRfsBlackbox(page);
  await loadKseaRouteThroughVisibleControls(page);
  await page.getByRole('button', { name: /Set takeoff config/i }).click();
  await startRollThroughVisibleControls(page);
  await expect(page.getByLabel('Current takeoff configuration')).toContainText(/Flaps\s+5/);
  await expect(page.getByLabel('Current takeoff configuration')).toContainText(/Trim\s+5\.0/);
  await holdKey(page, 'ArrowUp', 20);
  await waitForVisiblePositiveRate(page);
  await page.keyboard.press('KeyG');
  await expect(page.getByLabel(/PFD|Primary flight display/i)).toContainText(/GEAR\s+UP|UP/i);
});
```

**Step 2: Run to verify failure before implementation**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npm run test:e2e -- --grep "positive rate" --workers=1`

Expected: FAIL until setup controls, positive-rate wait helpers, and gear-up visible proof are stable.

**Step 3: Implement helper additions**

- Helpers must use only Playwright role/label selectors, keyboard events, and visible text.
- No `page.evaluate`, no `/src/` imports, no `useSimStore`, no `setState`, no direct aircraft/flightPlan literals.
- Add this spec to `e2e/blackbox-manifest.json` if a new file is created.

**Step 4: Verify guard and E2E**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check:blackbox && CI=1 npm run test:e2e -- --grep "positive rate" --workers=1
```

Expected: both PASS.

**Step 5: Commit**

```bash
git add e2e/rfs-blackbox-player-loop.spec.ts e2e/helpers/rfsBlackbox.ts e2e/blackbox-manifest.json
git commit -m "test: prove visible KSEA takeoff to positive rate"
```

### Task 9 [PARENT-DIRECT]: Block uncommanded auto-rotation before credible rotation input

**Objective:** Ensure trim/thrust alone does not produce an uncontrolled liftoff before VR/rotation input.

**Covers findings:** RFS-R3-010

**Files:**
- Modify: `src/sim/systems/ground.ts`
- Modify: `src/sim/physics/integrate.ts` if needed
- Modify: `src/sim/physics/__tests__/takeoffRotationRealism.test.ts`
- Modify: `src/sim/physics/__tests__/performanceEnvelope.test.ts`

**Step 1: Write failing physics test**

```typescript
it('does not lift off before VR without deliberate rotation input', () => {
  const result = runFixedStepScenario({
    scenarioId: 'ksea-tutorial',
    seconds: 18,
    controls: { throttle1: 1, throttle2: 1, flapLever: 5, elevator: 0, gearLever: 'DOWN' },
  });
  expect(result.samples.some((s) => s.iasKt < result.performanceCard.vrKt && s.radioAltFt > 25)).toBe(false);
});
```

**Step 2: Run test to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/physics/__tests__/takeoffRotationRealism.test.ts -t "does not lift off before VR"`

Expected: FAIL or expose current premature liftoff envelope.

**Step 3: Implement minimal correction**

- Prefer tuning data-owned placeholder trim/ground pivot thresholds in `B737_800_FDM` rather than hidden code constants.
- Preserve existing valid takeoff/positive-rate tests.
- Do not introduce invisible flight assists that fake a 737; document any placeholder boundary in source metadata.

**Step 4: Verify**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/physics/__tests__/takeoffRotationRealism.test.ts src/sim/physics/__tests__/performanceEnvelope.test.ts src/sim/systems/__tests__/ground.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/sim/systems/ground.ts src/sim/physics/integrate.ts src/sim/data/aircraft/b737-800-fdm.v1.ts src/sim/physics/__tests__/takeoffRotationRealism.test.ts src/sim/physics/__tests__/performanceEnvelope.test.ts src/sim/systems/__tests__/ground.test.ts
git commit -m "fix: prevent uncommanded pre-VR liftoff"
```

### Task 10 [PARENT-DIRECT]: Split A/T takeoff mode gating from AP lateral/vertical gating

**Objective:** Allow truthful A/T/N1 takeoff support without enabling unsafe AP lateral/vertical modes while parked or rolling.

**Covers findings:** RFS-R3-022

**Files:**
- Modify: `src/instruments/RfsMCP.tsx`
- Modify: `src/instruments/__tests__/RfsMCP.test.tsx`
- Modify: `src/sim/systems/effectiveAutoflightTruth.ts`
- Test: `src/sim/systems/__tests__/effectiveAutoflightTruth.test.ts`

**Step 1: Write failing MCP test**

Assert `N1`/A/T is available in takeoff roll when A/T armed, but LNAV/ALT/VS remain unavailable until their real gating criteria are met.

**Step 2: Run test to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/instruments/__tests__/RfsMCP.test.tsx -t "takeoff N1"`

Expected: FAIL until mode availability is split.

**Step 3: Implement minimal gating split**

- Create separate availability helpers for thrust modes and AP guidance modes.
- `N1`/SPEED buttons must remain tied to `autothrottleArm` and actual thrust target resolution.
- Do not allow CMD A to imply pitch/roll authority before backed vertical/lateral targets exist.

**Step 4: Verify**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/instruments/__tests__/RfsMCP.test.tsx src/sim/systems/__tests__/effectiveAutoflightTruth.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/instruments/RfsMCP.tsx src/instruments/__tests__/RfsMCP.test.tsx src/sim/systems/effectiveAutoflightTruth.ts src/sim/systems/__tests__/effectiveAutoflightTruth.test.ts
git commit -m "fix: split autothrottle takeoff gating from AP modes"
```

---

## Phase C — AP/FMA/VNAV truth

### Task 11: Make FD-only state either command FD bars or clearly non-commanding

**Objective:** Remove the false affordance where FD switches can appear meaningful while no FD cues or command backing exist.

**Covers findings:** RFS-R3-021

**Files:**
- Modify: `src/instruments/RfsMCP.tsx`
- Modify: `src/instruments/RfsPFD.tsx`
- Modify: `src/sim/systems/guidanceTargets.ts`
- Test: `src/instruments/__tests__/RfsMCP.test.tsx`
- Test: `src/instruments/__tests__/RfsPFD.test.tsx`

**Step 1: Write failing tests**

- FD-only MCP switch must show visible copy such as `FD guidance unavailable until supported mode selected`, or PFD FD command bars must appear from shared guidance targets.
- Do not invent FD bars from unsupported route modes.

**Step 2: Run tests**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/instruments/__tests__/RfsMCP.test.tsx src/instruments/__tests__/RfsPFD.test.tsx -t "Flight Director"`

Expected: FAIL until FD semantics are explicit.

**Step 3: Implement minimal behavior**

Prefer the smaller truthful change: label FD-only as non-commanding unless a supported target exists. If implementing bars, use `resolveGuidanceTargets()` only.

**Step 4: Verify**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/instruments/__tests__/RfsMCP.test.tsx src/instruments/__tests__/RfsPFD.test.tsx src/sim/systems/__tests__/guidanceTargets.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/instruments/RfsMCP.tsx src/instruments/RfsPFD.tsx src/sim/systems/guidanceTargets.ts src/instruments/__tests__/RfsMCP.test.tsx src/instruments/__tests__/RfsPFD.test.tsx src/sim/systems/__tests__/guidanceTargets.test.ts
git commit -m "fix: make flight director state truthful"
```

### Task 12 [PARENT-DIRECT]: Prevent `CMD_A` with `PITCH OFF` from implying full AP control

**Objective:** Stop the dangerous dogfood state where `LNAV`+`SPD` shows `PITCH OFF / CMD_A` while the aircraft dives.

**Covers findings:** RFS-R3-008

**Files:**
- Modify: `src/sim/systems/effectiveAutoflightTruth.ts`
- Modify: `src/sim/systems/guidanceTargets.ts`
- Modify: `src/instruments/RfsMCP.tsx`
- Modify: `src/instruments/RfsPFD.tsx`
- Test: `src/sim/systems/__tests__/effectiveAutoflightTruth.test.ts`
- Test: `src/sim/systems/__tests__/guidanceTargets.test.ts`
- Test: `src/instruments/__tests__/RfsPFD.test.tsx`

**Step 1: Write failing truth test**

Create an AP state with CMD A, backed LNAV, SPEED, and no vertical target. Assert either:

- `autopilotStatus` is not displayed as `CMD_A` for full control, or
- PFD/MCP display a clear `LATERAL ONLY`/`NO VERT` warning and no vertical AP-owned elevator is produced.

**Step 2: Run failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/systems/__tests__/effectiveAutoflightTruth.test.ts -t "PITCH OFF"`

Expected: FAIL until current misleading state is corrected.

**Step 3: Implement minimal correction**

- Decide one contract and encode it everywhere:
  - strict option: CMD A may not be effective unless at least one supported vertical mode is active; or
  - labeled option: CMD A may be lateral-only, but PFD/MCP must show no vertical authority and AP command ownership must not include elevator.
- The browser dogfood acceptance should prefer a safe vertical mode before AP engagement.

**Step 4: Verify**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/systems/__tests__/effectiveAutoflightTruth.test.ts src/sim/systems/__tests__/guidanceTargets.test.ts src/instruments/__tests__/RfsPFD.test.tsx src/instruments/__tests__/RfsMCP.test.tsx
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/sim/systems/effectiveAutoflightTruth.ts src/sim/systems/guidanceTargets.ts src/instruments/RfsMCP.tsx src/instruments/RfsPFD.tsx src/sim/systems/__tests__/effectiveAutoflightTruth.test.ts src/sim/systems/__tests__/guidanceTargets.test.ts src/instruments/__tests__/RfsPFD.test.tsx src/instruments/__tests__/RfsMCP.test.tsx
git commit -m "fix: prevent misleading AP pitch-off command state"
```

### Task 13 [PARENT-DIRECT]: Tighten `ALT_HOLD` capture truth

**Objective:** Ensure active `ALT_HOLD` only appears after capture/stabilization, not while descending rapidly through/below selected altitude.

**Covers findings:** RFS-R3-009

**Files:**
- Modify: `src/sim/systems/effectiveAutoflightTruth.ts`
- Modify: `src/sim/systems/autopilot.ts`
- Modify: `src/sim/systems/guidanceTargets.ts`
- Test: `src/sim/systems/__tests__/fmaTruth.test.ts`
- Test: `src/sim/systems/__tests__/autopilot.test.ts`

**Step 1: Write failing test**

Given aircraft below selected altitude with high downward VS, selected ALT mode must not derive `ALT_HOLD`; it should show `ALT*`, `VS`, or OFF according to the chosen contract.

**Step 2: Run test to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/systems/__tests__/fmaTruth.test.ts -t "ALT_HOLD"`

Expected: FAIL until capture criteria include altitude error and VS magnitude/sign.

**Step 3: Implement minimal capture criteria**

- Add helper such as `isAltitudeHoldCaptured({ altitudeErrorFt, verticalSpeedFpm })`.
- Require small altitude error and near-zero VS before displaying `ALT_HOLD`.
- Use `ALT*`/capture display while AP is converging.

**Step 4: Verify**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/systems/__tests__/fmaTruth.test.ts src/sim/systems/__tests__/autopilot.test.ts src/sim/systems/__tests__/guidanceTargets.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/sim/systems/effectiveAutoflightTruth.ts src/sim/systems/autopilot.ts src/sim/systems/guidanceTargets.ts src/sim/systems/__tests__/fmaTruth.test.ts src/sim/systems/__tests__/autopilot.test.ts src/sim/systems/__tests__/guidanceTargets.test.ts
git commit -m "fix: make altitude hold capture truthful"
```

### Task 14 [PARENT-DIRECT]: Suppress unsupported LOC/APP/G_S/LVL_CHG effective truth until backed

**Objective:** Prevent unsupported vertical/lateral modes from displaying as if they have servo targets.

**Covers findings:** RFS-R3-018

**Files:**
- Modify: `src/sim/systems/effectiveAutoflightTruth.ts`
- Modify: `src/instruments/RfsMCP.tsx`
- Test: `src/sim/systems/__tests__/effectiveAutoflightTruth.test.ts`
- Test: `src/instruments/__tests__/RfsMCP.test.tsx`

**Step 1: Write failing tests**

For raw AP states with `truth.verticalActive='LVL_CHG'` or `truth.verticalActive='G_S'`, assert the effective truth is OFF/unavailable unless a real target resolver exists.

**Step 2: Run failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/systems/__tests__/effectiveAutoflightTruth.test.ts -t "unsupported"`

Expected: FAIL until modes are suppressed or fully implemented.

**Step 3: Implement minimal suppression**

- Remove unsupported derived effective modes or gate them behind resolver-backed availability.
- MCP unsupported buttons should remain hidden/disabled with visible reasons.

**Step 4: Verify**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/systems/__tests__/effectiveAutoflightTruth.test.ts src/instruments/__tests__/RfsMCP.test.tsx`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/sim/systems/effectiveAutoflightTruth.ts src/instruments/RfsMCP.tsx src/sim/systems/__tests__/effectiveAutoflightTruth.test.ts src/instruments/__tests__/RfsMCP.test.tsx
git commit -m "fix: suppress unsupported autoflight modes"
```

### Task 15 [PARENT-DIRECT]: Separate VNAV armed from active vertical-command truth

**Objective:** VNAV `ARMED` must not appear as an active pitch/vertical-commanding FMA mode without a concrete target.

**Covers findings:** RFS-R3-011

**Files:**
- Modify: `src/sim/systems/vnav.ts:160-180`
- Modify: `src/sim/systems/effectiveAutoflightTruth.ts:129-139`
- Modify: `src/instruments/RfsPFD.tsx`
- Test: `src/sim/systems/__tests__/vnav.test.ts`
- Test: `src/sim/systems/__tests__/effectiveAutoflightTruth.test.ts`

**Step 1: Write failing tests**

Assert `computeVNAV()` for pre-TOD descent returns `lifecycle: 'ARMED'`, `verticalMode: null`, and an armed metadata field rather than active `verticalActive='VNAV'`.

**Step 2: Run failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/systems/__tests__/vnav.test.ts -t "ARMED"`

Expected: FAIL because current armed output uses `verticalMode: 'VNAV'`.

**Step 3: Implement minimal contract**

- Add `verticalArmedMode?: 'VNAV'` or reuse existing `verticalArmed` truth field.
- Keep `verticalActive` OFF/null while armed and pre-TOD.
- PFD may show `VNAV` in armed column, not active column.

**Step 4: Verify**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/systems/__tests__/vnav.test.ts src/sim/systems/__tests__/effectiveAutoflightTruth.test.ts src/instruments/__tests__/RfsPFD.test.tsx
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/sim/systems/vnav.ts src/sim/systems/effectiveAutoflightTruth.ts src/instruments/RfsPFD.tsx src/sim/systems/__tests__/vnav.test.ts src/sim/systems/__tests__/effectiveAutoflightTruth.test.ts src/instruments/__tests__/RfsPFD.test.tsx
git commit -m "fix: separate armed VNAV from active vertical guidance"
```

### Task 16: Resolve VNAV altitude and speed targets independently

**Objective:** Prevent speed-only constraints from blocking later descent/altitude constraints.

**Covers findings:** RFS-R3-012

**Files:**
- Modify: `src/sim/systems/vnav.ts:133-147`
- Test: `src/sim/systems/__tests__/vnav.test.ts`
- Test: `src/sim/__tests__/flightPlanLoader.test.ts`

**Step 1: Write failing test**

Create a route where the active leg has a speed-only constraint and a later waypoint has an altitude constraint. Assert `computeVNAV()` exposes both managed speed and the later altitude target.

**Step 2: Run failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/systems/__tests__/vnav.test.ts -t "speed-only"`

Expected: FAIL because `findVnavTarget()` returns first speed/alt target together.

**Step 3: Implement minimal resolver split**

- Replace `findVnavTarget()` with separate `findAltitudeTarget()` and `findSpeedTarget()`.
- `VnavOutput` should carry independent waypoint indices/idents if needed.
- Do not change route geometry math beyond target lookup.

**Step 4: Verify**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/systems/__tests__/vnav.test.ts src/sim/__tests__/flightPlanLoader.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/sim/systems/vnav.ts src/sim/systems/__tests__/vnav.test.ts src/sim/__tests__/flightPlanLoader.test.ts
git commit -m "fix: resolve VNAV speed and altitude targets independently"
```

### Task 17 [PARENT-DIRECT]: Distinguish managed speed from selected speed intervention

**Objective:** Route-managed speed should not be masked by a synthetic selected speed unless the user explicitly intervened.

**Covers findings:** RFS-R3-017

**Files:**
- Modify: `src/instruments/defaultAutopilotState.ts` or equivalent default AP state file
- Modify: `src/sim/systems/guidanceTargets.ts:168-187`
- Modify: `src/instruments/RfsMCP.tsx`
- Test: `src/instruments/__tests__/defaultAutopilotState.test.ts`
- Test: `src/sim/systems/__tests__/guidanceTargets.test.ts`

**Step 1: Write failing tests**

- Default AP state should not create a selected speed intervention unless required for display.
- If managed speed metadata exists and no intervention is active, target speed is route-managed.

**Step 2: Run failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/instruments/__tests__/defaultAutopilotState.test.ts src/sim/systems/__tests__/guidanceTargets.test.ts -t "managed speed"`

Expected: FAIL until selected-vs-managed speed state is explicit.

**Step 3: Implement minimal state**

- Add a boolean like `speedInterventionActive` if shared RFMS type supports it; otherwise add a local metadata wrapper in RFS display/guidance state.
- `resolveThrustTarget()` preference order: selected intervention speed -> route managed speed -> safe default.

**Step 4: Verify**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/instruments/__tests__/defaultAutopilotState.test.ts src/sim/systems/__tests__/guidanceTargets.test.ts src/instruments/__tests__/RfsMCP.test.tsx`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/instruments/defaultAutopilotState.ts src/sim/systems/guidanceTargets.ts src/instruments/RfsMCP.tsx src/instruments/__tests__/defaultAutopilotState.test.ts src/sim/systems/__tests__/guidanceTargets.test.ts src/instruments/__tests__/RfsMCP.test.tsx
git commit -m "fix: distinguish managed and selected speed"
```

### Task 18: Add browser proof for stable visible LNAV/SPD/ALT engagement

**Objective:** Prove the first visible airborne AP sequence no longer dives or lies.

**Covers findings:** RFS-R3-008, RFS-R3-009, RFS-R3-017

**Files:**
- Modify: `e2e/rfs-blackbox-player-loop.spec.ts`
- Modify: `e2e/helpers/rfsBlackbox.ts`
- Modify: `e2e/blackbox-manifest.json`

**Step 1: Write failing E2E**

After the positive-rate proof, engage visible `LNAV`, `SPD`, and safe vertical mode. Assert visible FMA does not show `PITCH OFF / CMD_A`, vertical speed does not enter a steep uncontrolled descent, and altitude mode is truthful.

**Step 2: Run failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check:blackbox && CI=1 npm run test:e2e -- --grep "stable visible LNAV" --workers=1`

Expected: FAIL until AP truth tasks are complete.

**Step 3: Implement helper waits only through visible/readable UI**

- Helpers can read visible PFD/MCP/route text, not the store.
- If precise telemetry is unavailable in flight overlay, add a player-visible status/readback first; do not cheat via store.

**Step 4: Verify**

Run the same command and expect PASS.

**Step 5: Commit**

```bash
git add e2e/rfs-blackbox-player-loop.spec.ts e2e/helpers/rfsBlackbox.ts e2e/blackbox-manifest.json
git commit -m "test: prove visible AP engagement is stable"
```

---

## Phase D — Route, descent, approach, landing continuity

### Task 19 [PARENT-DIRECT]: Add KSEA→KPDX approach/final/threshold route semantics

**Objective:** Extend route data so it can hand off toward a KPDX runway/approach instead of ending at a generic airport point.

**Covers findings:** RFS-R3-005, RFS-R3-026

**Files:**
- Modify: `src/sim/flightPlanLoader.ts:32-60`
- Modify: `src/viewport/runwayData.ts`
- Modify: `src/sim/scenarios.ts:187-228`
- Test: `src/sim/__tests__/flightPlanLoader.test.ts`
- Test: `src/viewport/__tests__/runwayData.test.ts`
- Test: `src/sim/data/__tests__/performanceCards.test.ts`

**Step 1: Write failing tests**

Assert the KSEA→KPDX route includes a destination runway/final/threshold waypoint with coordinates tied to the chosen KPDX scenario runway and an explicit altitude/speed target.

**Step 2: Run failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/__tests__/flightPlanLoader.test.ts -t "KSEA"`

Expected: FAIL until route includes approach/final metadata.

**Step 3: Implement minimal route extension**

- Add named final/threshold waypoints, e.g. `KPDX10L_FAF`, `KPDX10L_RWY`, or choose 10R if aligned with scenarios.
- Keep `coordinateSource: 'synthetic'` honest until actual procedure data exists.
- Update route limitations to say approach waypoints are synthetic training fixtures, not official procedure data.

**Step 4: Verify**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/__tests__/flightPlanLoader.test.ts src/viewport/__tests__/runwayData.test.ts src/sim/data/__tests__/performanceCards.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/sim/flightPlanLoader.ts src/viewport/runwayData.ts src/sim/scenarios.ts src/sim/__tests__/flightPlanLoader.test.ts src/viewport/__tests__/runwayData.test.ts src/sim/data/__tests__/performanceCards.test.ts
git commit -m "feat: add KPDX approach route waypoints"
```

### Task 20 [PARENT-DIRECT]: Make route completion landing-aware

**Objective:** Do not simply disable LNAV at the final route point if the player still needs runway/approach/landing handoff.

**Covers findings:** RFS-R3-005

**Files:**
- Modify: `src/sim/systems/navigation.ts:379-474`
- Modify: `src/components/RouteStatus.tsx`
- Test: `src/sim/systems/__tests__/navigation.test.ts`
- Test: `src/components/__tests__/RouteStatus.test.tsx`

**Step 1: Write failing tests**

When the active leg is final/threshold and within capture radius, route status should expose `approachHandoffAvailable` or an equivalent status instead of only `routeComplete`/`lnavAvailable=false` with no landing context.

**Step 2: Run failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/systems/__tests__/navigation.test.ts -t "route complete"`

Expected: FAIL until landing-aware completion state exists.

**Step 3: Implement minimal handoff state**

- Extend `RouteStatusSnapshot` with a small explicit field such as `approachHandoff: 'none' | 'final' | 'threshold' | 'complete'`.
- Keep existing `routeComplete` backwards-compatible.
- RouteStatus UI should show “Approach handoff”/“Threshold” when appropriate.

**Step 4: Verify**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/systems/__tests__/navigation.test.ts src/components/__tests__/RouteStatus.test.tsx src/sim/systems/__tests__/effectiveAutoflightTruth.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/sim/systems/navigation.ts src/components/RouteStatus.tsx src/sim/systems/__tests__/navigation.test.ts src/components/__tests__/RouteStatus.test.tsx src/sim/systems/__tests__/effectiveAutoflightTruth.test.ts
git commit -m "feat: add landing-aware route handoff state"
```

### Task 21 [PARENT-DIRECT]: Add normal CLIMB/CRUISE→DESCENT/APPROACH phase lifecycle

**Objective:** Let a continuous route flight transition into descent/approach without seeding `DESCENT`/`APPROACH` directly.

**Covers findings:** RFS-R3-006, RFS-R3-025

**Files:**
- Modify: `src/sim/physics/integrate.ts`
- Modify: `src/sim/flightPhasePredicates.ts` if present
- Modify: `src/sim/guidanceState.ts`
- Test: `src/sim/__tests__/flightPhasePredicates.test.ts`
- Test: `src/sim/__tests__/guidanceState.test.ts`
- Test: `src/sim/__tests__/simulationStep.test.ts`

**Step 1: Write failing lifecycle test**

Given an aircraft in CLIMB/CRUISE approaching a destination/final route segment with descent path target, repeated real simulation ticks should move to `DESCENT`, then `APPROACH` when configured/near final, without direct state seeding.

**Step 2: Run failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/__tests__/flightPhasePredicates.test.ts src/sim/__tests__/simulationStep.test.ts -t "DESCENT"`

Expected: FAIL until phase lifecycle exists.

**Step 3: Implement minimal lifecycle**

- Add pure predicates first, then wire into simulation step/flight-phase update.
- Inputs: route status, altitude AGL/MSL, distance to destination/final, descent target, gear/flap/config state.
- Keep approach/landing transitions truthful; do not auto-seed short-final.

**Step 4: Verify**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/__tests__/flightPhasePredicates.test.ts src/sim/__tests__/guidanceState.test.ts src/sim/__tests__/simulationStep.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/sim/physics/integrate.ts src/sim/flightPhasePredicates.ts src/sim/guidanceState.ts src/sim/__tests__/flightPhasePredicates.test.ts src/sim/__tests__/guidanceState.test.ts src/sim/__tests__/simulationStep.test.ts
git commit -m "feat: add route-driven descent and approach phases"
```

### Task 22: Label canned route flow or add minimal route editor affordance

**Objective:** Stop implying that the current `LOAD PLAN` flow is a full RFMS/CDU route workflow.

**Covers findings:** RFS-R3-019

**Files:**
- Modify: `src/app/RfsShell.tsx`
- Modify: `src/components/RouteStatus.tsx`
- Modify: `src/sim/fms/routeAdapter.ts` only if adding visible route-edit draft metadata
- Test: `src/components/__tests__/RouteStatus.test.tsx`
- Test: `src/__tests__/App.test.tsx`

**Step 1: Write failing UI test**

After KSEA `LOAD PLAN`, assert visible text includes `CANNED TRAINING ROUTE` or a visible minimal route-editor control exists.

**Step 2: Run failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/components/__tests__/RouteStatus.test.tsx -t "canned"`

Expected: FAIL until the route source/limitation is visible.

**Step 3: Implement minimal label**

YAGNI: label current route source as canned training route now; defer full CDU unless a later task explicitly adds it.

**Step 4: Verify**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/components/__tests__/RouteStatus.test.tsx src/__tests__/App.test.tsx -t "route"`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/app/RfsShell.tsx src/components/RouteStatus.tsx src/components/__tests__/RouteStatus.test.tsx src/__tests__/App.test.tsx
git commit -m "fix: label canned route source honestly"
```

### Task 23: Allow LNAV until the first discontinuity instead of invalidating entire route

**Objective:** Make discontinuities stop route guidance at the discontinuity rather than rejecting all prior valid legs.

**Covers findings:** RFS-R3-020

**Files:**
- Modify: `src/sim/systems/navigation.ts:109-168`
- Test: `src/sim/systems/__tests__/navigation.test.ts`
- Test: `src/sim/fms/__tests__/routeAdapter.test.ts`

**Step 1: Write failing navigation test**

Create route `A -> B -> DISCONTINUITY -> C`; compute status before B and assert LNAV is available for `A -> B`, with next discontinuity warning visible/returned.

**Step 2: Run failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/systems/__tests__/navigation.test.ts -t "discontinuity"`

Expected: FAIL because validation currently rejects the whole route.

**Step 3: Implement minimal route segmentation**

- Build legs until the next discontinuity.
- Expose `lnavUnavailableReason` only once the active leg reaches the discontinuity boundary.
- Keep missing coordinates as invalid for affected legs.

**Step 4: Verify**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/systems/__tests__/navigation.test.ts src/sim/fms/__tests__/routeAdapter.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/sim/systems/navigation.ts src/sim/systems/__tests__/navigation.test.ts src/sim/fms/__tests__/routeAdapter.test.ts
git commit -m "fix: keep LNAV valid until route discontinuity"
```

### Task 24: Align KPDX scenario, runway, route, and performance cards

**Objective:** Ensure KPDX approach/landing tests use one runway/procedure/performance contract.

**Covers findings:** RFS-R3-026

**Files:**
- Modify: `src/sim/scenarios.ts`
- Modify: `src/sim/data/performance/b737PerformanceCards.ts`
- Modify: `src/sim/flightPlanLoader.ts`
- Test: `src/sim/data/__tests__/performanceCards.test.ts`
- Test: `src/sim/__tests__/scenarios.test.ts`

**Step 1: Write failing consistency test**

Assert the KSEA→KPDX route final runway ident matches the KPDX tutorial/landing scenario runway and there is a destination-specific approach/landing performance card for that runway.

**Step 2: Run failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/data/__tests__/performanceCards.test.ts src/sim/__tests__/scenarios.test.ts -t "KPDX"`

Expected: FAIL if runway/card contracts diverge.

**Step 3: Implement minimal alignment**

Pick one KPDX runway for this route and update all relevant scenario/card/route references. Keep synthetic/training source labels honest.

**Step 4: Verify**

Run same command and expect PASS.

**Step 5: Commit**

```bash
git add src/sim/scenarios.ts src/sim/data/performance/b737PerformanceCards.ts src/sim/flightPlanLoader.ts src/sim/data/__tests__/performanceCards.test.ts src/sim/__tests__/scenarios.test.ts
git commit -m "fix: align KPDX route and performance scenario"
```

### Task 25: Add visible descent workflow proof without direct state seeding

**Objective:** Prove climb/cruise can enter descent/approach through route/visible controls rather than seeded approach state.

**Covers findings:** RFS-R3-006, RFS-R3-025

**Files:**
- Create: `e2e/rfs-route-descent.spec.ts`
- Modify: `e2e/helpers/rfsBlackbox.ts`
- Modify: `e2e/blackbox-manifest.json`

**Step 1: Write failing E2E**

Start from visible KSEA route/takeoff and use visible MCP/controls to command descent. Assert visible route status moves toward destination/final and guidance/phase text changes to descent/approach without direct store seeding.

**Step 2: Run failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npm run test:e2e -- --grep "visible descent" --workers=1`

Expected: FAIL until lifecycle and route continuity tasks land.

**Step 3: Implement minimal proof helpers**

- This spec is strict black-box and must pass `npm run check:blackbox`.
- Do not use store inspection for telemetry; if a needed status is not visible, add a visible product readback in a preceding code task.

**Step 4: Verify**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check:blackbox && CI=1 npm run test:e2e -- --grep "visible descent" --workers=1
```

Expected: PASS.

**Step 5: Commit**

```bash
git add e2e/rfs-route-descent.spec.ts e2e/helpers/rfsBlackbox.ts e2e/blackbox-manifest.json
git commit -m "test: prove visible route descent workflow"
```

### Task 26 [PARENT-DIRECT]: Add final continuous black-box Task 7 acceptance

**Objective:** Prove the full visible-control route flight from setup through landing, rollout, stop, and reset.

**Covers findings:** RFS-R3-001, RFS-R3-007

**Files:**
- Create: `e2e/rfs-full-flight-blackbox.spec.ts`
- Modify: `e2e/helpers/rfsBlackbox.ts`
- Modify: `e2e/blackbox-manifest.json`
- Modify: `docs/reviews/2026-06-14-rfs-strict-meaningful-use-round3.md` only when evidence is real

**Step 1: Write failing acceptance spec**

The spec must use visible controls/keyboard only:

1. open RFS;
2. select KSEA tutorial;
3. load KSEA→KPDX route;
4. set takeoff config visibly;
5. start roll;
6. rotate at visible/derived VR cue;
7. positive rate and gear up;
8. LNAV/SPD/safe vertical mode with truthful FMA;
9. route/descent/approach state;
10. gear/flap landing configuration;
11. touchdown;
12. braking rollout;
13. stopped/landed state;
14. reset returns route/AP/FMA/inputs to clean preflight.

**Step 2: Run to verify failure before it is ready**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check:blackbox && CI=1 npm run test:e2e -- --grep "full flight black-box" --workers=1`

Expected: FAIL until all prerequisites are implemented. Do not weaken the spec to pass.

**Step 3: Implement only after Tasks 5-25 are green**

- Add robust waits based on visible route/PFD/MCP/guidance text.
- If a necessary state is not visible, add product-visible readback first; do not read the store.
- Keep runtime under production-like E2E mode, not visual-test env.

**Step 4: Verify**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check:blackbox && CI=1 npm run test:e2e -- --grep "full flight black-box" --workers=1 && npm run check
```

Expected: PASS. Only then can Task 7 move from blocked to complete locally. CI/live claims still require exact CI/live verification.

**Step 5: Commit**

```bash
git add e2e/rfs-full-flight-blackbox.spec.ts e2e/helpers/rfsBlackbox.ts e2e/blackbox-manifest.json docs/reviews/2026-06-14-rfs-strict-meaningful-use-round3.md
git commit -m "test: add continuous black-box full-flight acceptance"
```

---

## Phase E — Ground/contact/terrain truth

### Task 27 [PARENT-DIRECT]: Keep nose gear unloaded during main-gear-only touchdown

**Objective:** Prevent the ground solver from over-broadening contact to all gear stations when only main gear geometry contacts.

**Covers findings:** RFS-R3-023

**Files:**
- Modify: `src/sim/systems/ground.ts:170-186`
- Test: `src/sim/systems/__tests__/ground.test.ts`
- Test: `src/sim/systems/__tests__/wheelContact.test.ts`

**Step 1: Write failing test**

Create a touchdown attitude where left/right main wheels penetrate but nose wheel remains above runway. Assert nose station `weightOnWheel=false` and `normalForceN=0`.

**Step 2: Run failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/systems/__tests__/ground.test.ts -t "main gear only"`

Expected: FAIL if `includeAllWhenFuselageReferenceContacts` loads all stations.

**Step 3: Implement minimal contact specificity**

- Only load stations with actual wheel contact geometry unless an explicit belly/crash contact path applies.
- Preserve existing rested-on-ground tests.

**Step 4: Verify**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/systems/__tests__/ground.test.ts src/sim/systems/__tests__/wheelContact.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/sim/systems/ground.ts src/sim/systems/__tests__/ground.test.ts src/sim/systems/__tests__/wheelContact.test.ts
git commit -m "fix: keep touchdown gear contact station-specific"
```

### Task 28 [PARENT-DIRECT]: Record touchdown from wheel sink/contact, not fuselage reference only

**Objective:** Ensure touchdown/sink rate is captured whenever wheel geometry contacts, even during flare/bounce reference-point motion.

**Covers findings:** RFS-R3-024

**Files:**
- Modify: `src/sim/systems/ground.ts`
- Modify: `src/sim/physics/integrate.ts`
- Test: `src/sim/systems/__tests__/ground.test.ts`
- Test: `src/sim/physics/__tests__/integrate.test.ts`

**Step 1: Write failing test**

Create wheel contact with positive wheel sink but aircraft reference vertical velocity near zero/upward. Assert `touchdownSinkRateFpm` or equivalent records the wheel sink event and contact is not skipped.

**Step 2: Run failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/systems/__tests__/ground.test.ts -t "touchdown sink"`

Expected: FAIL until wheel-contact sink is authoritative.

**Step 3: Implement minimal recording**

- Use `maxWheelSinkRateMps(wheelContacts)` for touchdown sink recording.
- Do not early-return from contact handling when wheel geometry is penetrating.

**Step 4: Verify**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/systems/__tests__/ground.test.ts src/sim/physics/__tests__/integrate.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/sim/systems/ground.ts src/sim/physics/integrate.ts src/sim/systems/__tests__/ground.test.ts src/sim/physics/__tests__/integrate.test.ts
git commit -m "fix: record touchdown from wheel contact sink"
```

### Task 29 [PARENT-DIRECT]: Make unsupported terrain contact honest

**Objective:** Either add explicit unsupported-terrain warning/crash semantics or scope the simulator to prepared surfaces visibly.

**Covers findings:** RFS-R3-032

**Files:**
- Modify: `src/sim/runwaySurface.ts`
- Modify: `src/components/SceneStatus.tsx` or `src/components/RouteStatus.tsx` if adding visible warning
- Modify: `docs/architecture.md`
- Test: `src/sim/__tests__/runwaySurface.test.ts`
- Test: `src/components/__tests__/SceneStatus.test.tsx`

**Step 1: Write failing test**

For a position outside supported airport footprints, assert the surface sample returns an explicit unsupported kind/reason and the UI can render that reason.

**Step 2: Run failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/__tests__/runwaySurface.test.ts -t "unsupported"`

Expected: FAIL until unsupported terrain is explicit.

**Step 3: Implement minimal honest scope**

YAGNI option: keep physics scoped to supported prepared surfaces, but return/display `unsupported terrain model` so users know arbitrary terrain contact is not modeled.

**Step 4: Verify**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/__tests__/runwaySurface.test.ts src/components/__tests__/SceneStatus.test.tsx`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/sim/runwaySurface.ts src/components/SceneStatus.tsx docs/architecture.md src/sim/__tests__/runwaySurface.test.ts src/components/__tests__/SceneStatus.test.tsx
git commit -m "fix: expose unsupported terrain contact scope"
```

---

## Phase F — Runtime, product UX, accessibility, and audio

### Task 30 [PARENT-DIRECT]: Make worker-physics runtime truth explicit

**Objective:** Either wire async worker stepping into the store/scheduler or visibly label the worker flag as async protocol-only until the heartbeat supports it.

**Covers findings:** RFS-R3-033

**Files:**
- Modify: `src/sim/simulationRuntime.ts`
- Modify: `src/store/simStore.ts`
- Modify: `src/runtime/frameScheduler.ts` if choosing real async stepping
- Modify: `src/config/workerPhysics.ts`
- Modify: `docs/architecture.md`
- Test: `src/sim/__tests__/simulationRuntime.test.ts`
- Test: `src/store/__tests__/simStore.test.ts`
- Test: `src/runtime/__tests__/frameScheduler.test.ts`

**Step 1: Write failing truth test**

If `VITE_RFS_WORKER_PHYSICS=1`, assert the live store path either calls `stepAsync()` or a visible/runtime docs status says sync store ticks still use main-thread fallback. Do not claim worker physics if only `step()` fallback runs.

**Step 2: Run failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/__tests__/simulationRuntime.test.ts src/store/__tests__/simStore.test.ts -t "worker"`

Expected: FAIL until truth is encoded.

**Step 3: Implement chosen minimal path**

- Safer path: expose config/status as `worker protocol available; store loop main-thread until async scheduler migration` and update docs/tests.
- Larger path: migrate scheduler/store tick to async-aware runtime; keep heartbeat-order safety tests.

**Step 4: Verify**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/__tests__/simulationRuntime.test.ts src/store/__tests__/simStore.test.ts src/runtime/__tests__/frameScheduler.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/sim/simulationRuntime.ts src/store/simStore.ts src/runtime/frameScheduler.ts src/config/workerPhysics.ts docs/architecture.md src/sim/__tests__/simulationRuntime.test.ts src/store/__tests__/simStore.test.ts src/runtime/__tests__/frameScheduler.test.ts
git commit -m "fix: make worker physics runtime truth explicit"
```

### Task 31: Add memoized PFD view model and render/selector budget

**Objective:** Reduce avoidable PFD per-frame derived work and guard against regression.

**Covers findings:** RFS-R3-034

**Files:**
- Create: `src/store/selectPfdViewModel.ts`
- Modify: `src/instruments/RfsPFD.tsx`
- Test: `src/store/__tests__/selectors.test.ts`
- Test: `src/instruments/__tests__/RfsPFD.test.tsx`

**Step 1: Write failing selector test**

Assert the selector returns the same reference when primitive inputs are unchanged and a new reference when altitude/speed/FMA fields change.

**Step 2: Run failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/store/__tests__/selectors.test.ts -t "PFD view model"`

Expected: FAIL until selector exists.

**Step 3: Implement minimal selector**

Use primitive state inputs and shallow memoization. Keep PFD rendering pure from the view model.

**Step 4: Verify**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/store/__tests__/selectors.test.ts src/instruments/__tests__/RfsPFD.test.tsx`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/store/selectPfdViewModel.ts src/instruments/RfsPFD.tsx src/store/__tests__/selectors.test.ts src/instruments/__tests__/RfsPFD.test.tsx
git commit -m "perf: memoize PFD view model"
```

### Task 32: Harden scenario persistence validation and fuzz corrupt snapshots

**Objective:** Reject invalid saved-state status/number/route fields safely.

**Covers findings:** RFS-R3-035

**Files:**
- Modify: `src/store/slices/persistenceSlice.ts`
- Modify: `src/sim/scenarioPersistence.ts`
- Test: `src/store/__tests__/scenarioPersistence.test.ts`

**Step 1: Write failing fuzz tests**

Add cases for invalid `status`, `NaN`/`Infinity` numeric fields, negative active leg indices, and impossible route status. Expected: restore is rejected with visible corrupt-save feedback.

**Step 2: Run failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/store/__tests__/scenarioPersistence.test.ts -t "corrupt"`

Expected: FAIL until validation is strict.

**Step 3: Implement minimal validators**

- Validate status union.
- Validate finite values for position/velocity/attitude/config.
- Clamp or reject active leg index relative to flight plan length.
- Keep old snapshots decodable where safe.

**Step 4: Verify**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/store/__tests__/scenarioPersistence.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/store/slices/persistenceSlice.ts src/sim/scenarioPersistence.ts src/store/__tests__/scenarioPersistence.test.ts
git commit -m "fix: validate restored scenario snapshots"
```

### Task 33: Make cockpit mode playable or label unavailable controls explicitly

**Objective:** Prevent cockpit mode from implying full playable cockpit controls where only visual shell/limited interactions exist.

**Covers findings:** RFS-R3-036

**Files:**
- Modify: `src/viewport/CockpitModel.ts`
- Modify: `src/viewport/useCockpitInteractions.tsx`
- Modify: `src/viewport/CockpitLayer.tsx`
- Test: `src/viewport/__tests__/cockpitInteractions.test.ts`
- Test: `src/viewport/__tests__/useCockpitInteractions.test.tsx`

**Step 1: Write failing tests**

Assert yoke and unavailable controls expose explicit unavailable reasons in pointer metadata and visible/ARIA feedback, or implement real yoke input if choosing playable path.

**Step 2: Run failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/viewport/__tests__/cockpitInteractions.test.ts src/viewport/__tests__/useCockpitInteractions.test.tsx -t "unavailable"`

Expected: FAIL until cockpit affordances are honest.

**Step 3: Implement minimal honest labels**

Prefer explicit visual-only/unavailable labels for unimplemented controls. Keep working throttle/flap/gear/MCP interactions intact.

**Step 4: Verify**

Run same command and expect PASS.

**Step 5: Commit**

```bash
git add src/viewport/CockpitModel.ts src/viewport/useCockpitInteractions.tsx src/viewport/CockpitLayer.tsx src/viewport/__tests__/cockpitInteractions.test.ts src/viewport/__tests__/useCockpitInteractions.test.tsx
git commit -m "fix: label cockpit control availability honestly"
```

### Task 34: Add default-visible controls/onboarding affordance

**Objective:** Make keyboard/gamepad controls discoverable outside debug overlay.

**Covers findings:** RFS-R3-037

**Files:**
- Modify: `src/app/RfsShell.tsx`
- Modify: `src/components/ControlsHelp.tsx`
- Modify: `src/components/BottomControlBar.tsx`
- Test: `src/__tests__/App.test.tsx`
- Test: `src/components/__tests__/BottomControlBar.test.tsx`

**Step 1: Write failing App test**

Assert a default flight overlay exposes a `Controls` button/help summary without switching to debug overlay.

**Step 2: Run failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/__tests__/App.test.tsx -t "Controls"`

Expected: FAIL until controls are discoverable.

**Step 3: Implement minimal affordance**

Add a collapsible Controls button in the bottom bar or a first-run onboarding card that does not cover instruments.

**Step 4: Verify**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/__tests__/App.test.tsx src/components/__tests__/BottomControlBar.test.tsx`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/app/RfsShell.tsx src/components/ControlsHelp.tsx src/components/BottomControlBar.tsx src/__tests__/App.test.tsx src/components/__tests__/BottomControlBar.test.tsx
git commit -m "feat: make controls help discoverable"
```

### Task 35: Make gamepad settings honest about calibration/remapping

**Objective:** Either implement persisted calibration/remapping or rename settings UI as read-only bindings info.

**Covers findings:** RFS-R3-038

**Files:**
- Modify: `src/components/ControlsSettings.tsx`
- Modify: `src/input/GamepadManager.ts`
- Modify: `src/input/controlBindings.ts`
- Test: `src/components/__tests__/ControlsSettings.test.tsx`
- Test: `src/input/__tests__/GamepadManager.test.ts`

**Step 1: Write failing test**

If keeping read-only scope, assert UI text says `Bindings reference` and does not imply calibration/remapping persistence.

**Step 2: Run failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/components/__tests__/ControlsSettings.test.tsx -t "bindings"`

Expected: FAIL until wording/state is truthful.

**Step 3: Implement minimal honest scope**

YAGNI: rename to read-only bindings reference unless user explicitly requests full remapping.

**Step 4: Verify**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/components/__tests__/ControlsSettings.test.tsx src/input/__tests__/GamepadManager.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/components/ControlsSettings.tsx src/input/GamepadManager.ts src/input/controlBindings.ts src/components/__tests__/ControlsSettings.test.tsx src/input/__tests__/GamepadManager.test.ts
git commit -m "fix: make gamepad settings scope honest"
```

### Task 36: Add keyboard-only and accessibility operability proof

**Objective:** Prove required player actions are keyboard/DOM reachable, not just landmark-labeled.

**Covers findings:** RFS-R3-039

**Files:**
- Modify: `e2e/rfs-responsive-accessibility.spec.ts`
- Modify: `src/components/TakeoffSetupPanel.tsx` if tab order/labels need fixes
- Modify: `src/components/BottomControlBar.tsx` if labels need fixes

**Step 1: Write failing Playwright proof**

Use `Tab`, `Enter`, and keyboard shortcuts to reach LOAD PLAN, Set takeoff config, START ROLL, camera/overlay/controls, and verify visible status changes.

**Step 2: Run failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npm run test:e2e -- --grep "keyboard-only" --workers=1`

Expected: FAIL until controls are reachable and labels are unambiguous.

**Step 3: Implement minimal accessibility fixes**

- Add unique `aria-label`s where duplicate text exists.
- Keep tab order logical.
- Add DOM equivalents for required canvas/cockpit-only actions.

**Step 4: Verify**

Run same command and expect PASS.

**Step 5: Commit**

```bash
git add e2e/rfs-responsive-accessibility.spec.ts src/components/TakeoffSetupPanel.tsx src/components/BottomControlBar.tsx
git commit -m "test: add keyboard-only operability proof"
```

### Task 37: Add small-height and split-pane responsive proof

**Objective:** Catch viewport layouts that overlap or hide required controls in Hermes split panes/small screens.

**Covers findings:** RFS-R3-040

**Files:**
- Modify: `e2e/rfs-responsive-accessibility.spec.ts`
- Modify: `src/components/layout/RfsLayout.tsx`
- Test: `src/components/layout/__tests__/RfsLayout.test.tsx`

**Step 1: Write failing E2E matrix**

Add Playwright viewports: `1024x768`, `900x700`, `800x600`, and one narrow split-pane width. Assert PFD/MCP/controls/setup panel do not overlap critical bottom controls and are reachable.

**Step 2: Run failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npm run test:e2e -- --grep "responsive" --workers=1`

Expected: FAIL if layout overlaps.

**Step 3: Implement layout fixes**

Use existing responsive layout manager. Prefer CSS/layout changes over hiding required controls.

**Step 4: Verify**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npm run test:e2e -- --grep "responsive" --workers=1
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/components/layout/__tests__/RfsLayout.test.tsx
```

Expected: PASS.

**Step 5: Commit**

```bash
git add e2e/rfs-responsive-accessibility.spec.ts src/components/layout/RfsLayout.tsx src/components/layout/__tests__/RfsLayout.test.tsx
git commit -m "test: cover small responsive flight layouts"
```

### Task 38: Expire captions and caption non-GPWS cues

**Objective:** Prevent stale audio captions and cover important state cues beyond GPWS.

**Covers findings:** RFS-R3-041

**Files:**
- Modify: `src/app/RfsShell.tsx`
- Modify: `src/audio/AudioEngine.ts` or caption dispatcher if present
- Test: `src/audio/__tests__/AudioEngine.test.ts`
- Test: `src/__tests__/App.test.tsx`

**Step 1: Write failing tests**

- Caption disappears after configured TTL.
- Audio status/important cue captions update when sound is blocked/off.

**Step 2: Run failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/audio/__tests__/AudioEngine.test.ts src/__tests__/App.test.tsx -t "caption"`

Expected: FAIL until captions expire/update.

**Step 3: Implement minimal caption lifecycle**

Add `expiresAt` or timeout clearing in `RfsShell`. Caption important non-GPWS cues such as audio blocked, gear warning, or mode callout if already modeled.

**Step 4: Verify**

Run same command and expect PASS.

**Step 5: Commit**

```bash
git add src/app/RfsShell.tsx src/audio/AudioEngine.ts src/audio/__tests__/AudioEngine.test.ts src/__tests__/App.test.tsx
git commit -m "fix: expire and broaden audio captions"
```

---

## Phase G — Release, security, and OSS governance

### Task 39 [PARENT-DIRECT]: Verify deployed image by digest, not mounted metadata alone

**Objective:** Prove canary/production container image identity through the running image digest or deploy by digest.

**Covers findings:** RFS-R3-027

**Files:**
- Modify: `.github/workflows/ci.yml:182-365`
- Modify: `scripts/check-exact-sha-release.mjs` if checker needs digest assertion
- Modify: `docs/runbooks/release-closeout.md`

**Step 1: Write failing release-hardening check**

Extend `scripts/release-hardening-check.mjs` or a dedicated test to require deploy script inspection of the running image digest (`docker inspect`) or deployment by `image@sha256:...`.

**Step 2: Run failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check:release`

Expected: FAIL until workflow/checker enforces digest proof.

**Step 3: Implement minimal digest proof**

- Prefer `IMAGE_REF=ghcr.io/reedtrullz/rfs@${EXPECTED_IMAGE_DIGEST}` for canary/prod `docker run`, while preserving tag in metadata.
- Or inspect `docker image inspect`/running container `RepoDigests` and compare to `EXPECTED_IMAGE_DIGEST` before promotion.
- Keep rollback health/version checks.

**Step 4: Verify**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check:release && ruby -ryaml -e "YAML.load_file('.github/workflows/ci.yml'); puts 'OK'"
```

Expected: PASS and YAML prints `OK`.

**Step 5: Commit**

```bash
git add .github/workflows/ci.yml scripts/check-exact-sha-release.mjs scripts/release-hardening-check.mjs docs/runbooks/release-closeout.md
git commit -m "ci: verify running release image digest"
```

### Task 40 [PARENT-DIRECT]: Include Docker smoke/Trivy in required branch protection contexts

**Objective:** Align branch protection with the CI job that actually smoke-tests the Docker image.

**Covers findings:** RFS-R3-028

**Files:**
- Modify: `scripts/check-branch-protection.mjs`
- Modify: `docs/runbooks/branch-protection.md`
- Modify: `README.md` if it documents required contexts

**Step 1: Write failing checker/doc test**

Update checker defaults or runbook examples to require `docker-smoke` alongside `secret-scan`, `test`, `publish`, and `deploy`.

**Step 2: Run failure locally**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && node scripts/check-branch-protection.mjs --help`

Expected: output/docs mention `docker-smoke`; if checker can run read-only against GitHub only when authorized, do not require network for local unit tests.

**Step 3: Implement safe local changes**

- Change docs/checker expected context list.
- Do not mutate GitHub branch protection unless explicitly authorized.
- Record manual command for authorized update separately.

**Step 4: Verify**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check:release
```

Expected: PASS.

**Step 5: Commit**

```bash
git add scripts/check-branch-protection.mjs docs/runbooks/branch-protection.md README.md
git commit -m "docs: require docker smoke branch context"
```

### Task 41 [PARENT-DIRECT]: Fix release/deploy documentation truth

**Objective:** Treat Cesium browser token as public restricted credential, strengthen README deploy-complete wording, and align/deprecate Ansible deploy docs.

**Covers findings:** RFS-R3-029, RFS-R3-030, RFS-R3-031

**Files:**
- Modify: `README.md`
- Modify: `docs/runbooks/release-closeout.md`
- Modify: `ansible-playbook.yml` only if aligning runtime ports/hardening; otherwise document deprecated path
- Modify: `docs/architecture.md`
- Test: `src/config/__tests__/docsPosture.test.ts`

**Step 1: Write failing docs posture test**

Assert docs include:

- `VITE_CESIUM_ION_TOKEN` described as a public/restricted browser token, not a confidential runtime secret.
- Deploy complete requires exact SHA/version metadata, not HTTP 200 alone.
- Ansible path is either aligned to port 8080/hardened runtime or explicitly deprecated.

**Step 2: Run failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/config/__tests__/docsPosture.test.ts`

Expected: FAIL until docs are patched.

**Step 3: Implement minimal docs correction**

Do not expose token values. Do not claim Ansible deployment works unless it is tested.

**Step 4: Verify**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/config/__tests__/docsPosture.test.ts && npm run check:release`

Expected: PASS.

**Step 5: Commit**

```bash
git add README.md docs/runbooks/release-closeout.md docs/architecture.md ansible-playbook.yml src/config/__tests__/docsPosture.test.ts
git commit -m "docs: tighten release and deploy truth"
```

### Task 42 [PARENT-DIRECT]: Add Cesium-compatible CSP report-only policy

**Objective:** Add a safe report-only CSP posture without breaking Cesium tile/asset loading.

**Covers findings:** RFS-R3-042

**Files:**
- Modify: `nginx.conf`
- Modify: `scripts/release-hardening-check.mjs`
- Test: add/modify release checker assertions

**Step 1: Write failing release check**

Require `Content-Security-Policy-Report-Only` in `nginx.conf` and ensure it allows required Cesium domains/connect/img/script/worker needs.

**Step 2: Run failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check:release`

Expected: FAIL until header exists.

**Step 3: Implement report-only header**

Start report-only; do not enforce yet. Include no report endpoint unless one exists.

**Step 4: Verify**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check:release && npm run build`

Expected: PASS.

**Step 5: Commit**

```bash
git add nginx.conf scripts/release-hardening-check.mjs
git commit -m "security: add report-only CSP header"
```

### Task 43 [PARENT-DIRECT]: Document Docker reproducibility/SBOM stance

**Objective:** Stop implying fully reproducible Docker builds while `apk` packages come from moving repositories, or add SBOM/pinning if chosen.

**Covers findings:** RFS-R3-043

**Files:**
- Modify: `Dockerfile`
- Modify: `.github/workflows/ci.yml` if adding SBOM artifact
- Modify: `docs/runbooks/release-closeout.md`
- Modify: `README.md`
- Test: `scripts/release-hardening-check.mjs`

**Step 1: Write failing release check**

Assert docs either contain explicit `not bit-reproducible` wording for Docker OS packages or CI emits an SBOM artifact.

**Step 2: Run failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check:release`

Expected: FAIL until stance is explicit.

**Step 3: Implement minimal honest stance**

YAGNI option: document that images are pinned by base digest and exact app SHA, but not bit-reproducible due moving package repositories. Add SBOM later if desired.

**Step 4: Verify**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check:release`

Expected: PASS.

**Step 5: Commit**

```bash
git add Dockerfile .github/workflows/ci.yml docs/runbooks/release-closeout.md README.md scripts/release-hardening-check.mjs
git commit -m "docs: clarify Docker reproducibility boundary"
```

### Task 44: Add Code of Conduct or document intentional absence

**Objective:** Complete OSS community baseline for contributor safety and expectations.

**Covers findings:** RFS-R3-044

**Files:**
- Create: `CODE_OF_CONDUCT.md`
- Modify: `README.md`
- Modify: `package.json` only if package metadata references community docs
- Test: `src/config/__tests__/docsPosture.test.ts`

**Step 1: Write failing docs posture test**

Assert `CODE_OF_CONDUCT.md` exists and README links to it.

**Step 2: Run failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/config/__tests__/docsPosture.test.ts -t "Code of Conduct"`

Expected: FAIL until file/link exists.

**Step 3: Implement minimal OSS file**

Use Contributor Covenant 2.1 or a short project-specific code. Include contact/reporting route that does not publish private personal details unless already public in repo governance docs.

**Step 4: Verify**

Run same command and expect PASS.

**Step 5: Commit**

```bash
git add CODE_OF_CONDUCT.md README.md package.json src/config/__tests__/docsPosture.test.ts
git commit -m "docs: add code of conduct"
```

---

## Phase H — Final evidence, closeout, and non-claims

### Task 45 [PARENT-DIRECT]: Close the R3 remediation ledger honestly

**Objective:** Record which R3 findings are fixed, which proofs exist, and which claims remain out of scope after implementation.

**Covers findings:** Evidence closeout/status ledger for RFS-R3-001 through RFS-R3-044 after Tasks 1-44; primary remediation coverage remains in the finding-to-task matrix above.

**Files:**
- Modify: `docs/reviews/2026-06-14-rfs-strict-meaningful-use-round3.md`
- Modify: `docs/roadmap.md`
- Modify: `docs/plans/README.md`
- Modify: `README.md` only if public proof claims change
- Optional Obsidian update outside repo: `/Users/reidar/Obsidian/Hermes/Hermes/Personal/Projects/RFS.md`

**Step 1: Run final local gates on committed tree**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check && npm run check:blackbox && CI=1 npm run test:e2e -- --workers=1 --reporter=line
```

Expected: PASS. If any gate fails, do not close the ledger; create a new RED task/fix.

**Step 2: Run visual proof separately**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npm run test:visual
```

Expected: PASS, or record exact flakes/failures without claiming green visual proof.

**Step 3: Update ledger**

Add a closeout table with columns: Finding, Status, Commit, Test evidence, Proof boundary, Remaining non-claim. Mark Task 7 complete only if Task 26 passed strict black-box acceptance.

**Step 4: Optional CI/live verification only if authorized**

If and only if the user authorizes push/deploy:

```bash
git status --short --branch
git push -u origin HEAD
```

Then verify exact pushed SHA’s GitHub Actions run to `completed/success`, then live `/rfs-version.json` if merged/deployed. If not authorized, record: “not pushed, no CI, no deploy, no live claim.”

**Step 5: Commit ledger**

```bash
git add docs/reviews/2026-06-14-rfs-strict-meaningful-use-round3.md docs/roadmap.md docs/plans/README.md README.md
git commit -m "docs: close round 3 remediation evidence ledger"
```

---

## Architecture heartbeat audit notes

The following tasks touch the documented runtime heartbeat and therefore need explicit safety review before and after implementation:

- Task 9: physics/ground takeoff envelope.
- Task 10: A/T versus AP mode gating.
- Task 12: AP effective truth and command ownership.
- Task 13: ALT capture/AP command truth.
- Task 14: unsupported autoflight mode suppression.
- Task 15: VNAV armed/active FMA truth.
- Task 17: managed speed versus selected speed command truth.
- Task 19-21: route status, phase lifecycle, guidance snapshots.
- Task 26: full continuous black-box proof.
- Task 27-29: gear contact, touchdown recording, and unsupported terrain scope.
- Task 30: worker/scheduler/store stepping.
- Tasks 39-43: deploy, branch-protection, nginx, Docker, and release-governance artifacts.

For each of these tasks, reviewers must explicitly verify:

```text
input actions -> fixed simulation tick -> structuredClone aircraft -> pre-integration route status -> AP command resolution -> effective controls -> integrate -> post-integration route/guidance -> committed snapshot
```

No task may silently change this order unless it updates `docs/architecture.md`, adds narrow heartbeat-order tests, and passes a focused architecture review. AP/FMA tasks must additionally verify no stale AP-owned elevator/aileron/throttle commands survive when the display says OFF/unbacked; ground/surface tasks must verify wind and air-relative velocity contracts are unchanged; deploy-governance tasks must verify repo files only and leave external GitHub/secret/live mutations blocked unless explicitly authorized.

## Final verification before committing this plan

Plan-only checks to run before committing the plan itself:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && node - <<'NODE'
const fs = require('fs');
const plan = fs.readFileSync('docs/plans/2026-06-14-rfs-strict-meaningful-use-round3-remediation.md', 'utf8');
const ids = [...plan.matchAll(/RFS-R3-\d{3}/g)].map(m => m[0]);
const unique = [...new Set(ids)].sort();
console.log('unique finding ids', unique.length, unique[0], unique.at(-1));
if (unique.length !== 44 || unique[0] !== 'RFS-R3-001' || unique.at(-1) !== 'RFS-R3-044') process.exit(1);
const taskNumbers = [...plan.matchAll(/^### Task (\d+)/gm)].map(m => Number(m[1]));
console.log('tasks', taskNumbers.length, taskNumbers[0], taskNumbers.at(-1));
for (let i = 0; i < taskNumbers.length; i++) if (taskNumbers[i] !== i + 1) process.exit(1);
const fenceCount = plan.split('\n').filter((line) => line.trim().startsWith('```')).length;
console.log('line-start fences', fenceCount);
if (fenceCount % 2 !== 0) process.exit(1);
NODE
git diff --check
```

Expected: 44 unique finding IDs, continuous Task 1..45 numbering, balanced fences, and no whitespace errors.

## Plan review history

- Controller draft: Created from R3 review report, current architecture/roadmap/package/CI files, and targeted source reads on 2026-06-14.
- Coverage/mapping review: initial REQUEST_CHANGES for RFS-R3-001/RFS-R3-017 matrix drift, Task 45 closeout wording, and Task 1 contradictory RED test. Patched matrix rows, changed Task 45 to evidence-ledger wording, and replaced Task 1 with a real forbidden-helper failure fixture.
- Command/path/fence review: initial REQUEST_CHANGES for raw local command snippets, conditional files staged unconditionally, a placeholder `git push -u origin <branch>`, and the absent `RfsLayout.css` path. Patched local/CI Node wording, removed conditional staged files, replaced push placeholder with `git push -u origin HEAD`, and removed the absent CSS path.
- Architecture/runtime-governance review: initial REQUEST_CHANGES for AP/FMA, terrain, and release-governance tasks missing `[PARENT-DIRECT]` and safety checks. Patched Tasks 10, 14, 15, 17, 29, 41, 42, and 43 plus heartbeat/deploy safety notes.
- Final focused re-review after patches: PASS from coverage/task-completeness, command/path/fence, and architecture/deploy-governance reviewers. No remaining blockers.
