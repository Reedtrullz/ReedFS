# RFS Comprehensive Remaining-Work Remediation Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task. Several tasks are marked `[PARENT-DIRECT]`; execute those directly in the controller session because they touch the simulation heartbeat, route/runway truth, release governance, or final push/CI/live verification.

**Goal:** Turn the 2026-06-15 comprehensive remaining-work review into a truthful remediation path: clean and green P0 gates first, then route/landing/visible-control black-box proof, product layout/playability, source-data realism, VNAV/FMS/runtime/public-repo follow-up, docs sync, final commit, and GitHub push.

**Architecture:** Fix proof boundaries in dependency order. Start with worktree classification and P0 failing gates; fix product/runtime truth before updating snapshots; align KSEA→KPDX route, approach, and landing to one runway; promote visible-control black-box proof above seeded helper proofs; keep FDM/VNAV/worker work behind explicit source/architecture boundaries; close with local gates, exact pushed SHA CI verification, and live SHA verification only if the pushed commit reaches `master` deployment.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Zustand, CesiumJS, Three.js, Vitest, Playwright, GitHub Actions, Docker/GHCR, nginx/Caddy. Always run Node/npm commands with `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null`.

**Execution status, 2026-06-16:** Tasks 1-21 have been executed locally through bounded remediation and verification. Current local evidence includes `npm run check` passing with 100 Vitest files / 911 tests plus production build and bundle checks, focused visible-control Playwright stage proofs, and a fresh public-clone RFMS bootstrap check through `npm run check:deps`. Remaining closeout tasks are docs sync/disposition, full local release gates including visual/E2E, OSS governance verification, then final commit/push/exact-SHA CI/live verification. No CI, deployed, live, continuous full-route/full-flight, or certified/source-validated realism claim is made by this local status note.

---

## Evidence base

Read before execution:

- `docs/reviews/2026-06-15-rfs-comprehensive-remaining-work-review.md:1-526`
- `docs/architecture.md:20-55` for the runtime heartbeat order.
- `docs/roadmap.md:5-18` and `docs/roadmap.md:82-108` for current proof boundaries and guidance backlog.
- `docs/plans/README.md:5-21` for current source-of-truth docs.
- `package.json:24-41` for local gates.
- `.github/workflows/ci.yml:33-63` for CI test/visual gate and `.github/workflows/ci.yml:128-367` for publish/deploy.

Current verified state before this plan was written:

- `npm run check`: PASS earlier in the review (`100` Vitest files, `889` tests, production build, bundle check).
- `npm run check:blackbox`: PASS now; guard scanned `e2e/rfs-blackbox-player-loop.spec.ts`, `e2e/rfs-route-descent.spec.ts`, and `e2e/rfs-full-flight-blackbox.spec.ts`.
- Visual regression: FAIL, 4/4 specs red (`e2e/rfs-visual.spec.ts:5-32`).
- Targeted seeded descent E2E: FAIL with stale `DESCENT` -> `approach` expectation (`e2e/rfs-flight.spec.ts:116-153`, `e2e/helpers/rfsFlight.ts:839-848`).
- At plan start, the route contract targeted KPDX 10R (`src/sim/flightPlanLoader.ts:6-17`), while scoped landing helper/tests still used KPDX 10L (`e2e/helpers/rfsRoute.ts:481`, `e2e/helpers/rfsRoute.ts:893-899`, `e2e/rfs-flight.spec.ts:172-174`). That was review-time mismatch evidence, not a current-state target.
- Working tree is dirty; preserve user work and do not use `git add -A` until the final closeout task explicitly reviews every file.

## Truth boundaries and non-goals

- Do not claim source-validated 737 realism while `src/sim/data/aircraft/b737-800-fdm.v1.ts:21-49` and `src/sim/data/performance/b737PerformanceCards.ts:115-135` still identify placeholder/gameplay-calibrated data.
- Do not call seeded/scoped browser helpers a full-flight/full-route proof. Seeded proofs remain useful lower-level regression tests.
- Do not claim CI/deploy/live success from local green, a push, a running workflow, or an image build. CI success requires exact `headSha` workflow status `completed/success`; live success requires `/rfs-version.json` matching the exact deployed SHA.
- Keep `dogfood-output/` and `test-results/` untracked unless a later task intentionally publishes a curated artifact.
- Final push is authorized by the user request, but live/deploy claims are still conditional on the branch being merged to `master` and the deploy job proving the exact SHA.

## Findings coverage map

Coverage semantics: each review finding is listed once below. Task references are either primary remediation tasks or explicitly marked supporting/closeout tasks in the corresponding task-level `Covers findings:` line. Closeout/docs tasks do not count as primary remediation unless the task explicitly records an intentional deferral, blocker, or non-goal disposition.

| Review finding | Covered by tasks |
| --- | --- |
| P0.1 dirty working tree / untracked full-flight spec | 1, 11, 23, 24 |
| P0.2 visual regression red / layout crowding | 6, 7, 8, 8A, 23 |
| P0.3 full-flight black-box not proven / seeded descent E2E failure | 2, 3, 4, 10, 11 |
| P0.4 KPDX 10R route vs 10L landing mismatch | 5, 9, 10, 11 |
| P0.5 seeded proof overclaim risk | 12, 22, 23 |
| P0.6 CI/live proof missing | 23, 24 |
| P1.1 FDM/performance placeholder data | 13, 14, 14A, 22 |
| P1.2 ground/takeoff/landing realism depth | 15, 16, 16A |
| P1.3 VNAV/FMS depth | 17, 18 |
| P1.4 product layout/playability | 6, 7, 8, 8A, 19 |
| P1.5 controls/accessibility | 19 |
| P1.6 worker/runtime async gap | 20, 22 |
| P2.1 RFMS shared/public clone dependency | 21, 22 |
| P2.2 rendering/weather/audio/immersion | 22A |
| P2.3 OSS/project presentation | 22, 23, 23A, 24 |

## Dependency map

```text
Tasks 1-4: P0 E2E truth cleanup; serialize.
Tasks 5, 9: KPDX runway identity; serialize before visible-control route/landing proof.
Tasks 6-8A: visual/layout; serialize before snapshot updates and player/debug/attribution proof.
Tasks 10-12: visible black-box/stage proof + proof boundary docs; serialize after Tasks 2-9.
Tasks 13-18: realism/VNAV/FMS; can be planned/executed after P0 gates, but source-data tasks may become blocked if no permitted source exists.
Task 19: controls/accessibility input-heartbeat work; `[PARENT-DIRECT]` because it touches held keyboard/gamepad input mapping feeding `applyInputActions(dt)`.
Tasks 20-21: runtime/public-clone; Task 20 is `[PARENT-DIRECT]`, while Task 21 can run after P0 with focused tests.
Tasks 22-24: docs sync, final gates, governance, commit, push, CI/live verification; always final and `[PARENT-DIRECT]`.
```

---

## Phase 0 — Baseline, safety, and P0 gate cleanup

### Task 1: Classify the dirty working tree and preserve evidence

**Objective:** Separate intended remediation files from transient artifacts before any code changes.

**Covers findings:** P0.1 primary.

**Files:**
- Modify: `docs/reviews/2026-06-15-rfs-comprehensive-remaining-work-review.md:35-60` only if the dirty-tree evidence changed during execution.
- Do not commit: `dogfood-output/`, `test-results/`, Playwright traces/screenshots unless explicitly curated.

**Step 1: Capture baseline**

Run:

```bash
cd /Users/reidar/Projectos/RFS
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
git status --short --branch
git diff --stat
npm run check:blackbox
```

Expected:

- `check:blackbox` passes or reports exact offending file.
- Dirty files are understood and grouped as: intended code, intended docs, transient artifacts, unknown.

**Step 2: Remove only transient local artifacts**

Run:

```bash
git check-ignore -v dogfood-output test-results || true
```

Expected: ignore rules explain transient paths. If they are unignored, do not delete blindly; add a docs-only note in the final report and ask before committing artifacts.

**Step 3: Commit**

No commit in this task. The user asked for commit/push at the end, so this task records baseline only. Do not stage anything yet.

---

### Task 2 [PARENT-DIRECT]: Add regression tests for route-less configured approach phase truth

**Objective:** Prove a route-less seeded `DESCENT` remains `descent` until the aircraft is genuinely configured for manual approach, then can become `APPROACH` without inventing route guidance.

**Covers findings:** P0.3 primary; P0.5 support.

**Files:**
- Modify: `src/sim/__tests__/flightPhasePredicates.test.ts:116-199`
- Modify later: `src/sim/flightPhasePredicates.ts:50-68`

**Step 1: Write failing tests**

Add these tests inside `describe('deriveRouteDrivenFlightPhase', ...)`:

```typescript
  it('keeps route-less seeded DESCENT in descent while gear and landing flaps are not configured', () => {
    const state = airborneCruiseState();
    state.flightPhase = 'DESCENT';
    state.ground.aglFt = 301;
    state.config.gearDown = false;
    state.config.gearPosition = 0;
    state.config.flapSetting = 5;

    expect(deriveRouteDrivenFlightPhase(state, {
      routeStatus: createNoRouteStatus(),
      descentTargetAltitudeFt: null,
    })).toBe('DESCENT');
  });

  it('moves a route-less seeded DESCENT into APPROACH only after landing configuration is established', () => {
    const state = airborneCruiseState();
    state.flightPhase = 'DESCENT';
    state.ground.aglFt = 301;
    state.config.gearDown = true;
    state.config.gearPosition = 1;
    state.config.flapSetting = 30;

    expect(deriveRouteDrivenFlightPhase(state, {
      routeStatus: createNoRouteStatus(),
      descentTargetAltitudeFt: null,
    })).toBe('APPROACH');
  });
```

**Step 2: Run test to verify failure**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test -- src/sim/__tests__/flightPhasePredicates.test.ts
```

Expected: FAIL on the second new test because current `deriveRouteDrivenFlightPhase()` requires route final/threshold handoff for `APPROACH`.

**Step 3: Commit**

No commit yet; keep the RED test unstaged until Task 3 makes it green.

---

### Task 3 [PARENT-DIRECT]: Implement manual configured-approach phase promotion without route overclaiming

**Objective:** Make the Task 2 RED tests pass while preserving route-driven final/threshold approach rules.

**Covers findings:** P0.3 primary; P0.5 support.

**Files:**
- Modify: `src/sim/flightPhasePredicates.ts:50-68`
- Test: `src/sim/__tests__/flightPhasePredicates.test.ts`

**Step 1: Minimal implementation**

Change `src/sim/flightPhasePredicates.ts` by adding a separate manual-approach predicate. Keep route-driven approach logic intact.

```typescript
function shouldEnterManualConfiguredApproachPhase(state: AircraftState): boolean {
  if (state.flightPhase !== 'DESCENT' || !isAirborne(state)) return false;
  return state.ground.aglFt <= APPROACH_MAX_AGL_FT && isConfiguredForApproach(state);
}

export function deriveRouteDrivenFlightPhase(
  state: AircraftState,
  context: RouteDrivenFlightPhaseContext,
): FlightPhase {
  if (shouldEnterApproachPhase(state, context)) return 'APPROACH';
  if (shouldEnterManualConfiguredApproachPhase(state)) return 'APPROACH';
  if (shouldEnterDescentPhase(state, context)) return 'DESCENT';
  return state.flightPhase;
}
```

**Safety note:** This does not claim route guidance. It only lets a route-less, already-descending, configured aircraft enter the simulator's `APPROACH` flight phase. Route status remains `NO ROUTE` and AP/LNAV/VNAV truth stays unbacked unless separately backed.

**Step 2: Run targeted tests**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test -- src/sim/__tests__/flightPhasePredicates.test.ts src/sim/__tests__/simulationStep.test.ts
```

Expected: PASS.

**Step 3: Runtime heartbeat safety check**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test -- src/store/__tests__/simStore.test.ts src/sim/__tests__/simulationStep.test.ts
```

Expected: PASS. This protects the documented heartbeat order in `docs/architecture.md:20-55`.

**Step 4: Commit**

No commit yet; final commit happens in Task 24.

---

### Task 4: Fix seeded ENVA descent E2E expectations to match the truth boundary

**Objective:** Make the seeded descent bridge assert `descent` for the initial unconfigured state and `approach` only after landing configuration produces `APPROACH`.

**Covers findings:** P0.3 primary; P0.5 primary.

**Files:**
- Modify: `e2e/helpers/rfsFlight.ts:832-879`
- Modify: `e2e/rfs-flight.spec.ts:116-153`
- Test: `e2e/rfs-flight.spec.ts`

**Step 1: Update helper seed assertion**

In `e2e/helpers/rfsFlight.ts:839-848`, change the initial assertion from `descent.guidancePhase !== 'approach'` to `descent.guidancePhase !== 'descent'`. Keep the `flightPhase === 'DESCENT'`, `weightOnWheels === false`, `aglFt > 300`, `autopilotCleared`, and `routeCleared` checks.

**Step 2: Keep configured approach assertion strict**

In the configured approach loop (`e2e/helpers/rfsFlight.ts:862-879`), require:

```typescript
current.flightPhase === 'APPROACH'
&& current.guidancePhase === 'approach'
&& current.gearDown
&& current.gearLever === 'DOWN'
&& current.flapSetting >= 25
&& !current.weightOnWheels
&& current.aglFt < descent.aglFt - 20
&& current.verticalSpeedFpm < 0
```

This proves the transition after configuration rather than relabeling the initial DESCENT seed.

**Step 3: Update spec assertion**

In `e2e/rfs-flight.spec.ts:121-123`, expect:

```typescript
expect(proof.descent.flightPhase).toBe('DESCENT');
expect(proof.descent.guidancePhase).toBe('descent');
```

Keep `proof.configuredApproach.guidancePhase` as `approach` at `e2e/rfs-flight.spec.ts:131`.

**Step 4: Run targeted E2E**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 VITE_RFS_VISUAL_TEST=0 npx playwright test e2e/rfs-flight.spec.ts -g 'seeded descent configures approach' --workers=1 --reporter=line --timeout=120000
```

Expected: PASS. If it fails on a later landing/rollout condition, stop rerunning unchanged and inspect `test-results/**/error-context.md`; add a narrow RED test for the new blocker before patching.

**Step 5: Explicit e2e helper TypeScript check**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx tsc --ignoreConfig --noEmit --target ES2022 --module ESNext --moduleResolution bundler --strict --skipLibCheck e2e/helpers/rfsFlight.ts
```

Expected: PASS. `tsconfig.json` does not include `e2e/**`, so this explicit check is required.

---

### Task 5 [PARENT-DIRECT]: Align KSEA→KPDX route and landing proof on KPDX 10R

**Objective:** Use KPDX 10R consistently because the current route contract, scenario, synthetic approach fixture, and roadmap already target KPDX runway 10R.

**Covers findings:** P0.4 primary; P0.3 support.

**Files:**
- Modify: `e2e/helpers/rfsFlight.ts:682-759` and KPDX helper section around `flyApproachToLandingRolloutAndReset(page, 'KPDX')`
- Modify: `e2e/helpers/rfsRoute.ts:481` and `e2e/helpers/rfsRoute.ts:893-1029`
- Modify: `e2e/rfs-flight.spec.ts:155-180`
- Test: `src/sim/__tests__/runwaySurface.test.ts:105-150`
- Test: `src/sim/data/__tests__/performanceCards.test.ts:80-82`

**Step 1: Update imports and runway target**

Replace helper imports/usages of `KPDX_RUNWAY_10L` with `KPDX_RUNWAY_10R` in route/landing bridge helpers. Keep the comments accurate: `KPDX 10R`, not `10L`.

**Step 2: Update touchdown assertion**

In `e2e/rfs-flight.spec.ts:172-174`, expect:

```typescript
expect(proof.touchdown.surfaceAirport).toBe('KPDX');
expect(proof.touchdown.surfaceRunwayId).toBe('10R');
```

**Step 3: Add a unit regression for route/landing runway identity**

In an existing route/performance test file, add a focused test like:

```typescript
it('keeps the KSEA to KPDX synthetic approach contract aligned with the KPDX scenario runway', () => {
  expect(KSEA_KPDX_APPROACH_CONTRACT.runway).toBe('10R');
  expect(KSEA_KPDX_APPROACH_CONTRACT.runway).toBe(KPDX_TUTORIAL_SCENARIO.runway.runway);
  expect(createKseaKpdxFlight().route).toContain(KPDX_RUNWAY_10R_APPROACH.threshold.ident);
});
```

Use actual imports already present in `src/sim/data/__tests__/performanceCards.test.ts` where possible.

**Step 4: Run targeted tests**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test -- src/sim/data/__tests__/performanceCards.test.ts src/sim/__tests__/runwaySurface.test.ts
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 VITE_RFS_VISUAL_TEST=0 npx playwright test e2e/rfs-flight.spec.ts -g 'KPDX short-final' --workers=1 --reporter=line --timeout=120000
```

Expected: PASS.

---

### Task 6: Add a visual layout non-overlap guard before updating snapshots

**Objective:** Prove the 1280x720 product layout is readable before accepting new visual snapshots.

**Covers findings:** P0.2 primary; P1.4 support.

**Files:**
- Create: `e2e/helpers/rfsVisualLayout.ts`
- Modify: `e2e/rfs-visual.spec.ts:5-32`
- Modify later: `src/components/layout/RfsLayout.tsx:83-300`

**Step 1: Write helper**

Create `e2e/helpers/rfsVisualLayout.ts`:

```typescript
import { expect, type Page } from '@playwright/test';

interface PanelBox {
  name: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

function overlapArea(a: PanelBox, b: PanelBox): number {
  const x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return x * y;
}

export async function expectPrimaryPanelsDoNotCriticallyOverlap(page: Page): Promise<void> {
  const boxes = await page.locator('[data-rfs-panel]').evaluateAll((nodes) => nodes.map((node) => {
    const rect = node.getBoundingClientRect();
    return {
      name: node.getAttribute('data-rfs-panel') ?? 'unknown',
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    };
  }).filter((box) => box.width > 0 && box.height > 0));

  const critical = boxes.filter((box) => ['scenario', 'takeoff-setup', 'route', 'pfd', 'mcp', 'engine', 'controls'].includes(box.name));
  const overlaps: string[] = [];
  for (let i = 0; i < critical.length; i += 1) {
    for (let j = i + 1; j < critical.length; j += 1) {
      const area = overlapArea(critical[i], critical[j]);
      if (area > 12) overlaps.push(`${critical[i].name}<->${critical[j].name}:${area.toFixed(0)}px²`);
    }
  }

  expect(overlaps, `critical RFS panel overlaps: ${overlaps.join(', ')}`).toEqual([]);
}
```

**Step 2: Use helper in every visual state**

Import it in `e2e/rfs-visual.spec.ts` and call `await expectPrimaryPanelsDoNotCriticallyOverlap(page);` before each `toHaveScreenshot()`.

**Step 3: Run visual test and verify RED if layout is currently crowded**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 VITE_RFS_VISUAL_TEST=1 npx playwright test e2e/rfs-visual.spec.ts --workers=1 --reporter=line --timeout=120000
```

Expected: FAIL until Task 7 updates layout and stale copy.

---

### Task 7: Fix stale visual copy and layout crowding without weakening the visual guard

**Objective:** Make primary panels readable at 1280x720 and make the visual start-roll assertion match current product text.

**Covers findings:** P0.2 primary; P1.4 support.

**Files:**
- Modify: `src/components/layout/RfsLayout.tsx:83-300`
- Modify: `e2e/rfs-visual.spec.ts:28-32`
- Test: `src/components/layout/__tests__/RfsLayout.test.tsx:35-42`

**Step 1: Update stale copy assertion**

In `e2e/rfs-visual.spec.ts:28-32`, replace the stale text with a current visible signal from `Coach status` or the scenario panel. Prefer the live region over broad page text:

```typescript
await expect(page.getByLabel('Coach status')).toContainText(/takeoff|thrust|runway centerline/i);
```

**Step 2: Adjust layout slots, not individual panel fixed coordinates**

Keep the existing direct-child fixed-position override in `RfsLayout.tsx:110-125`. Adjust slot widths/gaps so these panels do not overlap at 1280x720:

- `scenario`: cap width and vertical scroll.
- `takeoff-setup`: stay next to scenario only when room exists; otherwise stack under scenario.
- `route`: stay top-right.
- `pfd`/`mcp`/`engine`: stay bottom-right and avoid controls.
- `controls`: bottom-left with enough width at 1280+.

A minimal CSS direction is:

```css
.rfs-layout__top-left {
  right: 292px;
  max-width: calc(100vw - 320px);
}

@media (max-width: 1360px) {
  .rfs-layout__top-left {
    display: grid;
    grid-template-columns: minmax(260px, 330px);
  }
  .rfs-layout__top-left [data-rfs-panel="takeoff-setup"] {
    width: min(300px, calc(100vw - 610px));
  }
}
```

Patch based on the actual rendered guard output; do not blindly paste if it worsens the viewport.

**Step 3: Strengthen layout unit test**

Extend `src/components/layout/__tests__/RfsLayout.test.tsx:35-42` to assert CSS contains the stack/narrow-viewport rule added above.

**Step 4: Run targeted tests**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test -- src/components/layout/__tests__/RfsLayout.test.tsx
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 VITE_RFS_VISUAL_TEST=1 npx playwright test e2e/rfs-visual.spec.ts --workers=1 --reporter=line --timeout=120000
```

Expected: PASS on layout guard; screenshots may still fail until Task 8 updates snapshots intentionally.

---

### Task 8: Update visual snapshots only after layout/copy are verified

**Objective:** Accept intended visual output after the guard proves readability.

**Covers findings:** P0.2 primary; P1.4 support.

**Files:**
- Modify: `e2e/rfs-visual.spec.ts-snapshots/*` as generated by Playwright, if snapshots changed.
- Do not modify snapshots if the guard still fails.

**Step 1: Ensure no stale dev server is listening**

Run:

```bash
lsof -nP -iTCP:5173 -sTCP:LISTEN || true
```

Expected: no stale unrelated Vite server. If one exists, stop it or run with `CI=1` so Playwright owns the server.

**Step 2: Update snapshots**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 VITE_RFS_VISUAL_TEST=1 npx playwright test e2e/rfs-visual.spec.ts --workers=1 --reporter=line --update-snapshots --timeout=120000
```

Expected: PASS or snapshot files updated.

**Step 3: Prove visual gate passes without update flag**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test:visual
```

Expected: PASS, including `scripts/check-visual-timings.mjs`.

---

### Task 8A: Prove player cockpit layout, debug-overlay, and attribution boundaries

**Objective:** Cover the product-layout acceptance that is not satisfied by snapshot updates alone.

**Covers findings:** P0.2 support; P1.4 primary.

**Files:**
- Modify: `src/app/RfsShell.tsx`
- Modify: `src/components/layout/RfsLayout.tsx`
- Modify: `e2e/helpers/rfsVisualLayout.ts`
- Modify: `e2e/rfs-visual.spec.ts`
- Test: `src/components/layout/__tests__/RfsLayout.test.tsx`

**Step 1: Add multi-viewport layout assertions**

Extend `expectPrimaryPanelsDoNotCriticallyOverlap()` or a sibling helper so it runs at both `1280x720` and a wider desktop viewport such as `1600x900`. Keep the assertions based on real `data-rfs-panel`/`data-rfs-zone` bounds; do not use pixel screenshots as the only proof.

**Step 2: Assert normal player mode is not crowded by debug UI**

Add a browser assertion that normal player mode keeps debug/help/settings/telemetry overlays hidden unless an explicit debug/dev control enables them. Flight-critical panels (`scenario`, `takeoff-setup`, `route`, `pfd`, `mcp`, `engine`, `controls`) must remain reachable in normal mode.

**Step 3: Assert Cesium attribution coexists with controls**

Add a visual/layout assertion that Cesium attribution/credit UI remains visible and does not cover controls, route status, or the PFD/MCP cluster. If Cesium renders no attribution in degraded/no-token mode, assert the fallback status/watermark does not obscure those controls instead.

**Step 4: Run targeted tests**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test -- src/components/layout/__tests__/RfsLayout.test.tsx
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 VITE_RFS_VISUAL_TEST=1 npx playwright test e2e/rfs-visual.spec.ts --workers=1 --reporter=line --timeout=120000
```

Expected: PASS, including both viewport/layout assertions and snapshot comparisons.

---

### Task 9 [PARENT-DIRECT]: Update route/landing docs and assertions to say KPDX 10R everywhere

**Objective:** Prevent future docs/tests from drifting back to a 10R route / 10L landing mismatch.

**Covers findings:** P0.4 primary.

**Files:**
- Modify: `docs/architecture.md:183-187` if proof wording references the landing bridge runway.
- Modify: `docs/roadmap.md:82-90` if proof wording references KPDX landing bridge.
- Modify: `docs/reviews/2026-06-15-rfs-comprehensive-remaining-work-review.md:234-257` after code is fixed.
- Search targets: `KPDX 10L`, `10L short-final`, `10R`, `KSEA-to-KPDX landing bridge`.

**Step 1: Search current wording**

Run:

```bash
search='KPDX 10L|10L short-final|KPDX 10R|10R short-final'
grep -RInE "$search" README.md docs src e2e | sed -n '1,160p'
```

Expected: every KSEA→KPDX route/landing proof either uses 10R or explicitly describes historical review-time 10L mismatch.

**Step 2: Patch docs**

- For current-state docs, say the KSEA→KPDX proof targets KPDX 10R.
- For the review artifact, preserve truthfulness: mark the original mismatch as `found at review time` and add a `Remediation status` line once fixed.

**Step 3: Run docs grep again**

Run the search from Step 1 again.

Expected: no unqualified current-state `KPDX 10L` route/landing claims remain.

---

## Phase 1 — Visible-control black-box/stage acceptance and proof boundaries

### Task 10: Prove or fix the visible-control full-flight black-box spec

**Objective:** Make the visible-control black-box evidence real and passing. If the continuous full-flight path is too slow or unstable for the aggregate gate, split it into deterministic stage specs and keep the proof boundary explicit.

**Covers findings:** P0.3 primary; P0.4 support.

**Files:**
- Modify: `e2e/rfs-full-flight-blackbox.spec.ts`
- Modify: `e2e/helpers/rfsBlackbox.ts:71-589`
- Modify: `e2e/blackbox-manifest.json:1-7`
- Test: `scripts/check-blackbox-e2e.mjs:19-30` and `scripts/check-blackbox-e2e.mjs:221-293`

**Step 1: Confirm the guard still passes**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check:blackbox
```

Expected: PASS. If it fails, fix the black-box helper/spec before any E2E run. Do not add `page.evaluate()`, `useSimStore`, direct `src/` imports, or direct state seeding to black-box helpers.

**Step 2: Run the full-flight/stage spec alone**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 VITE_RFS_VISUAL_TEST=0 npx playwright test e2e/rfs-full-flight-blackbox.spec.ts --workers=1 --reporter=line --timeout=720000
```

Expected target: PASS. A pass here is local visible-control/stage evidence, not CI/live or continuous full-route/full-flight proof unless the spec actually covers that uninterrupted path.

If it fails, do not rerun unchanged more than once. Read the generated `test-results/**/error-context.md`, identify the first visible-control blocker, then add a narrow RED test or visible helper assertion for that blocker before patching product code.

**Step 3: Common blockers to fix without weakening acceptance**

- If positive-rate handling flakes, use the visible cue pattern from `e2e/helpers/rfsBlackbox.ts:291-303`: bounded rotation input plus `PHASE CLIMB|CRUISE` and `Positive rate established` text.
- If route progress fails, require actual route leg progress or DTG decrease; do not let a nearby landing count as route flight.
- If approach/landing fails because of runway mismatch, fix Task 5/9 first.
- If fake-clock actionability hangs, use `activateAlreadyVisibleControl()` only after `toBeVisible()`/`toBeEnabled()` checks, as already documented in `e2e/helpers/rfsBlackbox.ts:63-69`.

**Step 4: Run black-box stage specs**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 VITE_RFS_VISUAL_TEST=0 npx playwright test e2e/rfs-blackbox-player-loop.spec.ts e2e/rfs-route-descent.spec.ts e2e/rfs-full-flight-blackbox.spec.ts --workers=1 --reporter=line --timeout=720000
```

Expected: PASS.

---

### Task 11: Make aggregate E2E deterministic from a clean test state

**Objective:** Ensure `npm run test:e2e` finishes and the manifest references only tracked, intentional specs.

**Covers findings:** P0.1 support; P0.3 support; P0.4 support.

**Files:**
- Modify if needed: `playwright.config.ts`
- Modify if needed: `e2e/blackbox-manifest.json:1-7`
- Modify if needed: flaky E2E helpers under `e2e/helpers/`

**Step 1: Verify tracked specs**

Run:

```bash
git ls-files e2e/rfs-full-flight-blackbox.spec.ts e2e/blackbox-manifest.json e2e/helpers/rfsBlackbox.ts
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check:blackbox
```

Expected: all manifest-listed specs are tracked and guard passes.

**Step 2: Run aggregate E2E**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test:e2e
```

Expected: PASS. If it exceeds practical runtime, do not silently remove coverage. Split slow proof into deterministic stage specs, keep black-box/stage coverage in the manifest, and document that the result is bounded stage evidence rather than continuous full-route/full-flight proof; then prove `npm run test:e2e` completes.

**Step 3: Record timing**

Keep `test-results/e2e-timings.json` as transient evidence. Do not commit it unless the repo policy changes.

---

### Task 12: Document proof classes and seeded-proof non-claims

**Objective:** Ensure public docs distinguish unit/static gates, seeded browser proofs, visible-control black-box proofs, CI, and live evidence.

**Covers findings:** P0.5 primary; P0.6 support.

**Files:**
- Modify: `README.md:135-170`
- Modify: `docs/architecture.md:183-187`
- Modify: `docs/roadmap.md:5-18` and `docs/roadmap.md:82-90`
- Modify: `docs/plans/README.md:5-21`
- Modify: `docs/reviews/2026-06-15-rfs-comprehensive-remaining-work-review.md`

**Step 1: Add proof-boundary wording to README**

Add a concise paragraph under `## Quality gate`:

```markdown
Browser proof is split into layers: unit/static gates verify source contracts, seeded/scoped Playwright helpers guard specific physics/guidance states, and manifest-listed black-box specs use visible controls plus visible readbacks only. Seeded proofs are not full-flight/full-route evidence; full-flight claims require a continuous visible-control proof that actually covers that path, plus exact-SHA CI/live verification where applicable.
```

**Step 2: Update current docs only**

Do not rewrite old historical plans. Update only current-state docs and add review-time notes where needed.

**Step 3: Verify no overclaiming strings remain**

Run:

```bash
grep -RInE 'full[- ]flight|full[- ]route|live|deployed|CI green|realistic|certified' README.md docs | sed -n '1,220p'
```

Expected: every claim is bounded by proof type or marked as a future/remaining-work item.

---

## Phase 2 — Realism, FDM/source data, VNAV/FMS, product playability

### Task 13: Add a source-data governance checklist for FDM/performance replacements

**Objective:** Convert the placeholder FDM/performance issue into a governed source-ingestion path before tuning constants.

**Covers findings:** P1.1 primary.

**Files:**
- Create: `docs/runbooks/fdm-source-governance.md`
- Modify: `docs/roadmap.md:159-183`
- Modify: `README.md:9-22`

**Step 1: Write governance doc**

Create `docs/runbooks/fdm-source-governance.md` with these required sections:

```markdown
# RFS FDM and Performance Source Governance

## Required source packet per data group
- Source ID and citation.
- License/redistribution permission.
- Data group: aero, engine, gear, tire/brake, performance card, weather/atmosphere, runway/airport.
- Confidence: source-backed, derived-from-source, gameplay-calibrated placeholder.
- Claim boundary allowed in public docs.
- Tests that prove runtime reads this group from the versioned data shell.

## Prohibited claims
- No certified training, dispatch, AFM, maintenance, or Boeing-published claim unless the exact source permits it.
- No mixing placeholder and source-backed values without visible metadata.
```

**Step 2: Add a docs link**

Link it from `docs/roadmap.md` P5 and README status. State that source acquisition may block full realism remediation.

**Step 3: Verify docs**

Run:

```bash
grep -RIn 'fdm-source-governance' README.md docs/roadmap.md docs/runbooks/fdm-source-governance.md
```

Expected: references exist.

---

### Task 14: Add tests that prevent silent placeholder/source metadata mixing

**Objective:** Fail if a data group is upgraded to source-backed without source metadata, or if public docs overclaim placeholder data.

**Covers findings:** P1.1 primary.

**Files:**
- Modify: `src/sim/data/__tests__/aircraftData.test.ts` or nearest existing FDM data test.
- Modify: `src/sim/data/aircraft/fdmTypes.ts`
- Modify: `src/sim/data/aircraft/b737-800-fdm.v1.ts`

**Step 1: Find current FDM test file**

Run:

```bash
git ls-files 'src/sim/data/**/*test.ts'
```

Use an existing data test file if present; otherwise create `src/sim/data/aircraft/__tests__/fdmMetadata.test.ts`.

**Step 2: Write failing metadata test**

```typescript
import { describe, expect, it } from 'vitest';
import { B737_800_FDM_V1 } from '../b737-800-fdm.v1';

describe('B737-800 FDM metadata', () => {
  it('requires every claim-bearing data section to declare source quality and claim boundary', () => {
    const sections = [
      B737_800_FDM_V1.aero,
      B737_800_FDM_V1.configuration,
      B737_800_FDM_V1.engine,
      B737_800_FDM_V1.ground,
      ...B737_800_FDM_V1.gearStations,
    ];

    for (const section of sections) {
      expect(section.metadata.sourceQuality).toMatch(/placeholder|derived|source-backed/i);
      expect(section.metadata.claimBoundary).toContain('not');
      expect(section.metadata.lastReviewed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
```

Adjust property names to match actual `fdmTypes.ts`; do not invent fields if the type differs.

**Step 3: Run targeted tests**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test -- src/sim/data
```

Expected: PASS after type/property alignment.

---

### Task 14A [PARENT-DIRECT]: Disposition source-backed FDM/performance replacement scope

**Objective:** Either perform the first permitted source-backed FDM/performance replacement or record P1.1 as blocked with exact missing source packets.

**Covers findings:** P1.1 primary.

**Files:**
- Modify if replacing data: `src/sim/data/aircraft/b737-800-fdm.v1.ts`
- Modify if replacing data: `src/sim/data/performance/b737PerformanceCards.ts`
- Modify: `docs/runbooks/fdm-source-governance.md`
- Modify: `docs/roadmap.md`
- Modify: `README.md`

**Step 1: Inventory source packets**

For each data group named in the review — aero, engine, gear, tire/brake, performance cards, runway/airport — record whether a permitted source packet exists. Include source ID, license/redistribution permission, quality tier, and allowed public claim boundary.

**Step 2: Replace one narrow group only if source permission exists**

If a permitted source packet exists, replace one narrow data group and add tests proving runtime uses the versioned data shell and metadata.

**Step 3: Otherwise record a blocker without reducing the finding**

If no permitted source packet exists, mark P1.1 blocked in docs with the exact missing source IDs and keep public docs from claiming source-validated 737 realism.

**Step 4: Run verification**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test -- src/sim/data
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check
```

Expected: PASS, or documented blocked status without realism claims.

---

### Task 15 [PARENT-DIRECT]: Add landing/takeoff envelope tests before any physics tuning

**Objective:** Make landing/takeoff realism tuning measurable instead of invisible retuning.

**Covers findings:** P1.2 primary.

**Files:**
- Modify: `src/sim/physics/__tests__/integrate.test.ts`
- Modify: `src/sim/systems/__tests__/ground.test.ts`
- Modify: `src/sim/data/performance/b737PerformanceCards.ts`
- Modify only after RED: `src/sim/physics/integrate.ts`, `src/sim/systems/ground.ts`, or FDM data files.

**Step 1: Add RED envelope tests**

Add focused tests for:

- rotation/liftoff does not occur below declared VR minus tolerance;
- approach touchdown records VREF/VAPP range, sink rate, touchdown-zone distance, and stopping distance from the performance card;
- rollout braking reduces speed monotonically enough without reverse acceleration;
- rejected takeoff can stop before runway end under declared placeholder boundary.

Use existing performance card fields rather than hardcoded magic numbers.

**Step 2: Run tests to verify RED if current behavior violates envelope**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test -- src/sim/physics/__tests__/integrate.test.ts src/sim/systems/__tests__/ground.test.ts src/sim/data/__tests__/performanceCards.test.ts
```

Expected: either PASS if already covered or FAIL with exact envelope gap.

**Step 3: Implement minimal data-owned tuning**

Only change versioned FDM/performance data or physics code with a regression proving the behavior. Update claim metadata if a value remains gameplay-calibrated.

**Step 4: Run broader physics gate**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test -- src/sim/physics src/sim/systems src/sim/data
```

Expected: PASS.

---

### Task 16: Browser-dogfood manual takeoff/landing/taxi loops after physics tuning

**Objective:** Prove the tuned behavior is actually playable through the browser, not only unit-level.

**Covers findings:** P1.2 support.

**Files:**
- Modify or create: `docs/reviews/YYYY-MM-DD-rfs-physics-playability-dogfood.md`
- Do not commit raw `dogfood-output/` unless curated and explicitly referenced.

**Step 1: Run focused browser proof**

Run at minimum:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 VITE_RFS_VISUAL_TEST=0 npx playwright test e2e/rfs-blackbox-player-loop.spec.ts e2e/rfs-flight.spec.ts --workers=1 --reporter=line --timeout=240000
```

Expected: PASS.

**Step 2: Write dogfood report**

Document actual telemetry ranges: takeoff speed, positive rate, gear-up, approach speed, sink rate, rollout speed, stop/reset. Include non-claims.

---

### Task 16A [PARENT-DIRECT]: Cover or explicitly defer surface, crosswind, and tire-side-load realism

**Objective:** Ensure the surface/crosswind/tire realism findings are either tested and tuned or explicitly recorded as deferred with non-claims.

**Covers findings:** P1.2 primary for surface/crosswind/tire scope.

**Files:**
- Modify if implementing: `src/sim/systems/ground.ts`
- Modify if implementing: `src/sim/data/aircraft/b737-800-fdm.v1.ts`
- Modify if implementing: `src/sim/__tests__/runwaySurface.test.ts`
- Modify: `docs/roadmap.md`
- Modify: `README.md`

**Step 1: Add or defer tire/surface RED tests**

Add tests for wet/off-runway/high-speed/low-speed tire side-load behavior and crosswind handling, or explicitly mark each as deferred with the missing data/physics blocker.

**Step 2: Add or defer airport/runway surface expansion**

If implementing now, add source-backed runway/surface data and sampler tests. If deferring, state that current prepared-runway coverage remains limited to the existing handcrafted supported surfaces.

**Step 3: Update public non-claims**

If any item is deferred, update README/roadmap so RFS does not claim broad airport, terrain, wet-runway, or high-fidelity tire modeling.

**Step 4: Run targeted tests**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test -- src/sim/systems src/sim/data src/sim/__tests__/runwaySurface.test.ts
```

Expected: PASS, or documented deferral with truthful non-claims.

---

### Task 17 [PARENT-DIRECT]: Implement VNAV path truth behind tests, not just mode availability

**Objective:** Make VNAV compute and command a real path over distance before claiming VNAV depth.

**Covers findings:** P1.3 primary for VNAV.

**Files:**
- Modify: `src/sim/systems/vnav.ts`
- Modify: `src/sim/systems/autopilot.ts`
- Modify: `src/sim/systems/guidanceTargets.ts`
- Modify: `src/instruments/RfsPFD.tsx`
- Modify: `src/instruments/RfsMCP.tsx`
- Test: `src/sim/systems/__tests__/vnav.test.ts` or nearest existing file.
- Test: `src/sim/systems/__tests__/autopilot.test.ts`

**Step 1: Write RED VNAV path tests**

Test with a route containing an altitude constraint ahead and a `RouteStatusSnapshot.distanceToNextM` value. Assert VNAV returns:

- lifecycle `PATH` only when inside path capture window;
- target vertical speed with correct sign;
- `ALT_CAPTURE`/`ALT_HOLD` near target;
- `SPEED_ONLY` for speed-only constraints without vertical command.

**Step 2: Run targeted tests**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test -- src/sim/systems/__tests__/vnav.test.ts src/sim/systems/__tests__/autopilot.test.ts src/instruments/__tests__/RfsPFD.test.tsx
```

Expected: RED before implementation; PASS after minimal path logic.

**Step 3: Visible-control VNAV proof**

Add or extend a black-box-visible route descent test only if VNAV is user-exposed. The test must assert visible route progress plus visible altitude response, not just selected mode text.

---

### Task 18: Add FMS route-editing scope boundary or first real route-edit workflow

**Objective:** Decide whether RFMS route editing is in scope now; either implement a first minimal route-edit flow or keep it explicitly out of scope in UI/docs.

**Covers findings:** P1.3 primary for FMS/route editing.

**Files:**
- Modify if implementing: `src/sim/fms/routeAdapter.ts`
- Modify if implementing: `src/components/RouteStatus.tsx` or new route-edit component.
- Modify either way: `README.md`, `docs/architecture.md`, `docs/roadmap.md`
- Test: existing route adapter tests or new `src/sim/fms/__tests__/routeAdapter.test.ts`

**Step 1: If implementing, write RED route-edit tests**

Cover staged draft operation, direct-to, discontinuity insertion, undo, EXEC, and route-status recompute.

**Step 2: If deferring, update docs/UI copy**

Keep the current `Route editing unavailable` copy and document RFMS shared as a type/source bridge, not a full CDU.

**Step 3: Verification**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test -- src/sim/fms src/components/__tests__/RouteStatus.test.tsx
```

Expected: PASS.

---

### Task 19 [PARENT-DIRECT]: Prove controls/accessibility loops for keyboard, mouse, and gamepad-visible feedback

**Objective:** Ensure users can complete the takeoff/reset loop and understand blocked commands across input modes.

**Covers findings:** P1.5 primary; P1.4 support.

**Files:**
- Modify: `src/input/GamepadManager.ts:4-48`
- Modify: `src/input/controlBindings.ts:34-130`
- Modify: `src/components/TakeoffSetupPanel.tsx:78-127`
- Modify: `src/components/BottomControlBar.tsx`
- Test: `src/input/__tests__/*`, `src/components/__tests__/*`, and/or Playwright black-box specs.

**Step 1: Add blocked-command visible feedback test**

Add a component or Playwright test that attempts gear-up before positive rate and expects visible feedback instead of silent no-op.

**Step 2: Add keyboard-only proof**

Extend black-box player loop to use keyboard controls only for throttle, rotation, gear, reset, and assert visible state changes.

**Step 3: Add mouse-only proof**

Add or extend a Playwright black-box test that completes the tutorial takeoff/reset loop using visible mouse-clickable controls only. Assert blocked-command feedback and post-layout button reachability.

**Step 4: Add gamepad mapping and calibration disposition**

Mock gamepad button states and assert start/pause/reset/camera/overlay/audio/MCP commands map to `InputActions` without requiring hardware.
If durable gamepad support is in scope, add calibration persistence tests; otherwise document calibration as deferred/non-goal.

**Step 5: Run targeted tests**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test -- src/input src/components
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 VITE_RFS_VISUAL_TEST=0 npx playwright test e2e/rfs-blackbox-player-loop.spec.ts --workers=1 --reporter=line --timeout=240000
```

Expected: PASS.

---

### Task 20 [PARENT-DIRECT]: Decide worker async migration boundary and keep runtime docs honest

**Objective:** Either implement an async-aware worker loop with tests or explicitly document that worker physics remains experimental/default-off.

**Covers findings:** P1.6 primary.

**Files:**
- Modify if implementing: `src/runtime/frameScheduler.ts:66-77`, `src/hooks/useSimLoop.ts:23-30`, `src/store/simStore.ts:101-200`, `src/sim/simulationRuntime.ts:94-120`
- Modify either way: `README.md:198-236`, `docs/architecture.md:205-213`, `docs/roadmap.md:109-133`
- Test: worker runtime tests under `src/sim/**/__tests__`

**Step 1: If not implementing now, make docs explicit**

Say sync `tick()` still uses main-thread fallback even when worker adapter exists; do not imply worker physics is active in production.

**Step 2: If implementing now, split into separate subplan**

Do not do worker migration as one subagent task. Create a child plan with codec, async scheduler, store bridge, worker error fallback, and visual/E2E parity tasks. Mark all as `[PARENT-DIRECT]` or execute in one controller-owned branch.

**Step 3: Verification**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test -- src/runtime src/hooks src/sim
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check
```

Expected: PASS.

---

### Task 21: Verify public-clone/RFMS shared dependency path

**Objective:** Ensure contributors can build from a fresh clone with documented commands and no hidden sibling dependency assumptions.

**Covers findings:** P2.1 primary.

**Files:**
- Modify: `README.md:83-106`
- Modify if needed: `scripts/bootstrap-rfms-shared.mjs`
- Modify if needed: `Dockerfile:12-16`
- Modify if needed: `.github/workflows/ci.yml:44-48`

**Step 1: Bootstrap verification**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run bootstrap:check
```

Expected: PASS.

**Step 2: Fresh-clone simulation if practical**

Run outside repo if disk/time permits:

```bash
tmpdir=$(mktemp -d)
git clone --depth 1 https://github.com/Reedtrullz/ReedFS.git "$tmpdir/ReedFS"
cd "$tmpdir/ReedFS"
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npm run bootstrap
npm ci --legacy-peer-deps
npm run check:deps
```

Expected: PASS. If network/time blocks this, document the blocker honestly and do not claim fresh-clone proof.

---

## Phase 3 — Documentation sync, final gates, commit, push, CI/live verification

### Task 22 [PARENT-DIRECT]: Sync current-state docs with the implemented truth

**Objective:** Make README, architecture, roadmap, plans index, and review artifact match actual code and proof status.

**Covers findings:** P0.5 support; P0.6 support; P1.1 support; P1.6 support; P2.1 support; P2.3 support.

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/roadmap.md`
- Modify: `docs/plans/README.md`
- Modify: `docs/reviews/2026-06-15-rfs-comprehensive-remaining-work-review.md`
- Modify: this plan file, `docs/plans/2026-06-15-rfs-comprehensive-remaining-work-remediation.md`

**Step 1: Search for stale claims**

Run:

```bash
grep -RInE 'KPDX 10L|full[- ]flight|full[- ]route|seeded.*full|CI green|deployed|live|worker physics|realistic|certified' README.md docs | sed -n '1,260p'
```

Expected: every match is either current truth, a bounded non-claim, or a historical/review-time statement.

**Step 2: Update docs**

Required updates:

- Link this plan from `docs/roadmap.md:5-18` and `docs/plans/README.md:5-21`.
- If P0 is fixed, update the 2026-06-15 review with a `Remediation status` note; preserve original review evidence as review-time evidence.
- README quality section must explain proof layers.
- Architecture must describe current runtime only, not future worker migration as active.

**Step 3: Verify line references**

Run a path/line checker against the updated review and this plan:

```bash
python3 - <<'PY'
import pathlib, re, sys
root = pathlib.Path('/Users/reidar/Projectos/RFS')
files = [
  root / 'docs/reviews/2026-06-15-rfs-comprehensive-remaining-work-review.md',
  root / 'docs/plans/2026-06-15-rfs-comprehensive-remaining-work-remediation.md',
]
pat = re.compile(r'(?<![\w/.-])((?:src|e2e|docs|scripts|\.github|public)/[^`\s,)]+|README\.md|package\.json|Dockerfile|playwright\.config\.ts):(\d+)(?:-(\d+))?')
issues = []
checked = 0
for file in files:
    for match in pat.finditer(file.read_text()):
        rel = match.group(1).rstrip('.,;')
        start = int(match.group(2))
        end = int(match.group(3) or match.group(2))
        target = root / rel
        if not target.exists():
            issues.append(f'missing {rel}:{start}-{end}')
            continue
        total = len(target.read_text(errors='ignore').splitlines())
        if end > total:
            issues.append(f'bad range {rel}:{start}-{end} total={total}')
        checked += 1
print(f'references_checked={checked}')
if issues:
    print('\n'.join(issues))
    sys.exit(1)
PY
```

Expected: exit 0.

---

### Task 22A: Record rendering/weather/audio/immersion implementation or deferral

**Objective:** Ensure rendering/weather/audio/immersion scope is not silently treated as fixed by visual snapshots or docs sync.

**Covers findings:** P2.2 primary.

**Files:**
- Modify: `docs/roadmap.md`
- Modify: `README.md`
- Modify if adding tests: relevant `src/audio`, `src/hooks`, `src/viewport`, or component tests.

**Step 1: Disposition each P2.2 scope item**

For cockpit/interior, clouds/visibility/QNH/density altitude, engine/cockpit/airframe sounds with captions/accessibility, scene loading/error states, and PWA completeness, mark each as implemented, blocked, or deferred.

**Step 2: Add tests only for implemented items**

If implementing any item now, add a narrow unit/component/browser proof for it. Do not count a visual snapshot update as proof of audio, weather, PWA, or error-state behavior.

**Step 3: Keep public claims bounded**

If deferring, update docs so product claims remain bounded and users can see what remains before “browser-native 737-800” can be described as mature.

**Step 4: Run verification**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check
```

Expected: PASS, with P2.2 explicitly disposed.

---

### Task 23 [PARENT-DIRECT]: Run full local release gate on the implementation tree

**Objective:** Prove the code/docs tree is locally green before committing.

**Covers findings:** P0.1 support; P0.2 support; P0.5 support; P0.6 primary local-gate evidence; P2.3 support.

**Files:**
- No source edits unless gates fail.

**Step 1: Hygiene checks**

Run:

```bash
git diff --check
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check:blackbox
```

Expected: PASS.

**Step 2: Full local gate**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test:visual
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test:e2e
```

Expected:

- `npm run check`: PASS.
- `npm run test:visual`: PASS.
- `npm run test:e2e`: PASS and finishes deterministically.

If any gate fails, fix root cause with a RED test where possible. Do not proceed to commit/push with known red gates unless the task is explicitly marked blocked in docs and the user chooses to push a blocked branch.

---

### Task 23A [PARENT-DIRECT]: Verify OSS repository governance and contributor-facing posture

**Objective:** Cover repository-admin and contributor-facing requirements before public/live claims.

**Covers findings:** P2.3 primary.

**Files:**
- Modify if needed: `README.md`
- Modify if needed: `SECURITY.md`
- Modify if needed: `CONTRIBUTING.md`
- Modify if needed: `docs/roadmap.md`

**Step 1: Verify repository metadata and policy**

Run:

```bash
gh repo view --json name,owner,visibility,licenseInfo,url
gh api repos/:owner/:repo/branches/master/protection --jq '{required_status_checks, enforce_admins, allow_force_pushes, allow_deletions}' || true
gh api repos/:owner/:repo/community/profile
```

Expected: required checks/branch protection/security/community profile are either verified or exact blockers are recorded.

**Step 2: Patch contributor-facing docs if missing**

Ensure README/security/contribution/status docs expose license, build status, security contact/policy, contribution path, and current truth boundaries.

**Step 3: Do not overclaim external governance**

Do not claim repository governance complete unless the `gh` checks prove it. If admin access or policy is missing, record the exact blocker in docs and leave the finding open/blocked.

---

### Task 24 [PARENT-DIRECT]: Final commit, push to GitHub, and verify exact pushed SHA

**Objective:** Commit the completed remediation, push it to GitHub, then verify CI and live/deploy truth without overclaiming.

**Covers findings:** P0.1 closeout; P0.6 primary exact-SHA CI/live evidence; P2.3 support.

**Files:**
- Commit every intended source/doc/test/snapshot file touched by Tasks 1-23.
- Explicitly exclude transient paths: `dogfood-output/`, `test-results/`, local `.env*`, Playwright traces unless intentionally curated.

**Step 1: Review final diff**

Run:

```bash
git status --short --branch
git diff --stat
git diff -- docs/plans/2026-06-15-rfs-comprehensive-remaining-work-remediation.md docs/roadmap.md docs/plans/README.md README.md docs/architecture.md | sed -n '1,260p'
```

Expected: only intended changes.

**Step 2: Stage intentionally**

Use explicit staging. Example command; remove any path that was not touched, and add any new intentional file discovered during implementation:

```bash
git add \
  README.md \
  docs/architecture.md \
  docs/roadmap.md \
  docs/plans/README.md \
  docs/plans/2026-06-15-rfs-comprehensive-remaining-work-remediation.md \
  docs/reviews/2026-06-15-rfs-comprehensive-remaining-work-review.md \
  docs/runbooks/fdm-source-governance.md \
  e2e/blackbox-manifest.json \
  e2e/rfs-blackbox-player-loop.spec.ts \
  e2e/rfs-route-descent.spec.ts \
  e2e/rfs-full-flight-blackbox.spec.ts \
  e2e/rfs-flight.spec.ts \
  e2e/rfs-visual.spec.ts \
  e2e/helpers/rfsBlackbox.ts \
  e2e/helpers/rfsFlight.ts \
  e2e/helpers/rfsRoute.ts \
  e2e/helpers/rfsVisualLayout.ts \
  src/components/layout/RfsLayout.tsx \
  src/components/layout/__tests__/RfsLayout.test.tsx \
  src/components/RouteStatus.tsx \
  src/components/__tests__/RouteStatus.test.tsx \
  src/sim/flightPhasePredicates.ts \
  src/sim/__tests__/flightPhasePredicates.test.ts \
  src/sim/simulationStep.ts \
  src/sim/__tests__/simulationStep.test.ts \
  src/sim/data/aircraft/fdmTypes.ts \
  src/sim/data/aircraft/b737-800-fdm.v1.ts \
  src/sim/data/performance/b737PerformanceCards.ts \
  src/sim/data/__tests__/performanceCards.test.ts \
  src/sim/systems/vnav.ts \
  src/sim/systems/__tests__/vnav.test.ts \
  src/sim/systems/autopilot.ts \
  src/sim/systems/__tests__/autopilot.test.ts
```

Then run:

```bash
git diff --check --cached
git status --short --branch
```

Expected: staged diff has no whitespace errors; no transient files staged.

**Step 3: Commit**

Run:

```bash
git commit -m "fix: close RFS full-flight proof blockers"
```

Expected: commit succeeds. If signing fails due 1Password buffer issue, use the user's known local signing workaround from memory, then rerun `git log --show-signature -1` if applicable.

**Step 4: Push current branch**

Run:

```bash
git push -u origin HEAD
BRANCH=$(git branch --show-current)
SHA=$(git rev-parse HEAD)
git fetch origin "$BRANCH"
test "$(git rev-parse HEAD)" = "$(git rev-parse "origin/$BRANCH")"
printf 'pushed_branch=%s\npushed_sha=%s\n' "$BRANCH" "$SHA"
```

Expected: origin branch SHA equals local HEAD.

**Step 5: Verify GitHub Actions for exact pushed SHA**

Run:

```bash
SHA=$(git rev-parse HEAD)
gh run list --commit "$SHA" --limit 10 --json databaseId,workflowName,status,conclusion,event,headSha,url
```

Watch the exact-SHA run selected from the list:

```bash
SHA=$(git rev-parse HEAD)
RUN_ID=$(gh run list --commit "$SHA" --limit 10 --json databaseId,workflowName,status,conclusion,event,headSha,url \
  --jq ".[] | select(.headSha == \"$SHA\") | .databaseId" | head -n 1)
test -n "$RUN_ID" || { echo "No GitHub Actions run found for $SHA" >&2; exit 1; }
gh run watch "$RUN_ID" --exit-status
gh run view "$RUN_ID" --json databaseId,workflowName,status,conclusion,headSha,event,url,jobs
```

Expected for branch/PR run: `status=completed`, `conclusion=success` for checks that run on that branch. On non-`master` branches, do not claim publish/deploy; `.github/workflows/ci.yml:128-367` publishes/deploys only on `refs/heads/master`.

**Step 6: Live verification only if exact SHA deploys to master**

If and only if this commit is merged/pushed to `master` and the master run's `publish` and `deploy` jobs complete successfully, run:

```bash
SHA=$(git rev-parse HEAD)
git fetch origin master
test "$(git rev-parse origin/master)" = "$SHA"
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
node scripts/check-exact-sha-release.mjs \
  --repo Reedtrullz/ReedFS \
  --branch master \
  --sha "$SHA" \
  --live-url https://fly.reidar.tech/rfs-version.json
curl -fsSI https://fly.reidar.tech/ | sed -n '1,20p'
```

Expected: exact-SHA checker exits 0, proving the `master` CI/CD push run, successful `deploy` job, live `commit`, live `version`, `imageRef`, and `imageDigest` all match the exact SHA. If `origin/master` is not exactly `$SHA` or the checker fails, report `push verified, live not verified`.

---

## Plan review history

- Draft source review: built from `docs/reviews/2026-06-15-rfs-comprehensive-remaining-work-review.md`, current `docs/architecture.md`, current `docs/roadmap.md`, package scripts, CI workflow, E2E helpers/specs, and RFS/writing-plans references.
- Coverage review: initial review found missing task-level `Covers findings:` auditability plus incomplete P0.2/P1.1/P1.2/P1.4/P1.5/P2.2/P2.3 disposition. Patched with coverage semantics, `Covers findings:` lines for every task, and added Tasks 8A, 14A, 16A, 22A, and 23A.
- Command/path/fence review: initial review found a fake run-id placeholder in an executable `gh run` block and a live-verification `node` command without Node 22 setup. Patched with exact-SHA `RUN_ID` selection and the repo-local exact-SHA release checker.
- Architecture/deploy-governance review: initial review found Task 19 missing `[PARENT-DIRECT]`, Task 22/23 headings inconsistent with the dependency map, and a live verifier that accepted `commit` OR `version`. Patched parent-direct markings and replaced ad-hoc live parsing with `scripts/check-exact-sha-release.mjs`.
- Final focused re-review verdict: PASS. Focused reviewer confirmed coverage map/task consistency, 124 balanced fences, no placeholder run IDs, Node 22 setup before node/npm/npx commands, no Playwright-through-Vitest mismatch, parent-direct markings for input/docs/gates, and exact-SHA CI/live verification discipline.

## Final verification checklist before executing Task 24

- [ ] `npm run check:blackbox` PASS.
- [ ] Targeted seeded-descent E2E PASS.
- [ ] KPDX short-final/route bridge tests PASS on KPDX 10R.
- [ ] `npm run test:visual` PASS after intentional snapshot update.
- [ ] `npx playwright test e2e/rfs-full-flight-blackbox.spec.ts --workers=1` PASS.
- [ ] `npm run test:e2e` PASS.
- [ ] `npm run check` PASS.
- [ ] Docs explain proof classes and non-claims.
- [ ] Dirty tree contains only intentional staged changes; transient artifacts not staged.
- [ ] Final commit created.
- [ ] Branch pushed to GitHub and exact SHA verified on `origin/<branch>`.
- [ ] GitHub Actions exact `headSha` completed/success.
- [ ] Live endpoint SHA checked only after exact SHA deploys to `master`.
