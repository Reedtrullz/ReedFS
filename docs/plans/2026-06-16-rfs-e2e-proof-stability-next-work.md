# RFS E2E Proof Stability and Next-Work Implementation Plan

> **For Hermes:** Use `subagent-driven-development` for read-only review and narrow component/helper tasks. Execute `[PARENT-DIRECT]` tasks directly in the controller session because they touch player-loop browser proof, runtime phase-gating, release evidence, or final repository state.

**Goal:** Restore an honest green local browser-proof layer for the current branch, then proceed toward route/descent/full-flight proof without overclaiming seeded, local, CI, or live evidence.

**Architecture:** Fix proof stability at the product-visible boundary first. The current failure shows black-box helpers still depending on the phase-gated `Takeoff setup` panel after the app has advanced beyond takeoff; the implementation should use durable always-visible readbacks such as `EngineStrip` for post-positive-rate command/actual state, and should keep mouse-accessible cleanup controls visible only until gear/flap cleanup is complete. Only after the default E2E suite is green should route/descent/full-flight work resume.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Zustand, CesiumJS, Three.js, Vitest, Playwright, GitHub Actions, Docker/GHCR. Always run local node/npm commands with `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null`.

---

## Evidence base from 2026-06-16 analysis

- Branch: `fix/audio-route-overlay-usability-2026-06-16`.
- Local HEAD: `c422d5ba82a2a8120c852937f37edbd9fa44c2c3`.
- Source tree at analysis end: clean.
- Local `npm run check`: PASS at current local HEAD, including 100 Vitest files / 914 tests, lint, typecheck, production build, and bundle gate.
- Local visual gate: `CI=1 npm run test:visual` PASS, `6 passed (1.0m)`, visual timing budget OK.
- Local E2E gate: `npm run test:e2e` was not green. The captured failure was `e2e/rfs-blackbox-player-loop.spec.ts` / `KSEA route takeoff reaches positive rate, gear up, and reset through keyboard controls`, timing out while trying to read `Takeoff setup` / `Current takeoff configuration` after the visible app had already reached a high-energy `PHASE DESCENT` state with route incompatible, gear still down, flaps 5, N1 100%, and AP/FMA OFF.
- CI for this branch: no GitHub Actions runs were found for the branch.
- Live endpoint: `https://fly.reidar.tech/rfs-version.json` reports `c7dd96c5aadae04c4441a7b9d54719256bf20263`, not current local HEAD.

## Non-goals and truth boundaries

- Do not claim CI green until GitHub Actions has a completed/successful exact-SHA run.
- Do not claim live/deployed until `/rfs-version.json` reports the exact deployed SHA.
- Do not claim full-flight/full-route/continuous route-coupled KSEA→KPDX proof from the default `test:e2e` suite or from seeded/scoped bridge tests.
- Do not claim source-backed or certified 737 realism while FDM/performance data remains explicitly placeholder/gameplay-calibrated.
- Do not push, deploy, alter secrets, or change branch protection from this plan unless the user gives explicit current authorization.
- Keep `test-results/`, traces, screenshots, and dogfood output untracked unless a later task intentionally curates a repo artifact.

## Current failure hypothesis

The default black-box spec tries to assert post-positive-rate gear state via `TakeoffSetupPanel` readback:

- `e2e/rfs-blackbox-player-loop.spec.ts:44-82` stores `currentConfig` from `Takeoff setup` before takeoff and reuses it after positive rate.
- `e2e/helpers/rfsBlackbox.ts:242-252` toggles keyboard gear by reading `readVisibleTakeoffConfigurationText(page)` before and after pressing `KeyG`.
- `src/app/RfsShell.tsx:301,357` intentionally phase-gates `TakeoffSetupPanel` to `PARKED`, `TAXI`, and `TAKEOFF` only.
- `src/components/EngineStrip.tsx:14-62` already renders always-visible command/actual N1, throttle, flap, and gear readbacks but lacks a named accessible region for stable black-box helpers.

Likely correction: preserve the uncluttered overlay goal, but stop using `TakeoffSetupPanel` as the post-takeoff truth source. Add an accessible `EngineStrip` readback and migrate post-positive-rate black-box assertions to it. Separately, keep mouse-accessible takeoff cleanup controls available through early climb only while gear/flap cleanup is still incomplete, then hide them to satisfy the overlay-clutter constraint.

## Plan review history

- **Self-review pass — coverage/mapping:** This plan covers the immediate red E2E blocker, default local gate restoration, proof-boundary docs, and the next route/descent/full-flight lane. It intentionally does not implement P2+ RFMS UI, worker migration, or source-backed FDM in the first slice.
- **Self-review pass — command/path/fence:** Commands use Node 22 prefix. Playwright specs are run with Playwright, not Vitest. `git add` snippets list repo paths only. Markdown fences were checked before commit.
- **Self-review pass — architecture/governance:** Tasks touching `RfsShell`, black-box player-loop specs, final evidence, or release claims are marked `[PARENT-DIRECT]`. No task claims CI/live/deploy from local evidence.

---

## Phase 0 — Reproduce and constrain the P0 E2E blocker

### Task 1 [PARENT-DIRECT]: Reproduce the isolated failing keyboard player-loop path

**Objective:** Confirm the red path and capture current failure state before changing code.

**Files:**
- Read: `e2e/rfs-blackbox-player-loop.spec.ts:44-82`
- Read: `e2e/helpers/rfsBlackbox.ts:242-252`
- Do not modify files in this task.

**Step 1: Clear stale dev server state**

Run:

```bash
cd /Users/reidar/Projectos/RFS
if lsof -nP -iTCP:5173 -sTCP:LISTEN >/tmp/rfs-5173.txt 2>/dev/null; then
  awk 'NR>1 {print $2}' /tmp/rfs-5173.txt | sort -u | xargs kill
fi
```

Expected: no listener remains on `127.0.0.1:5173` before Playwright owns the server.

**Step 2: Reproduce only the failing spec path**

Run:

```bash
cd /Users/reidar/Projectos/RFS
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
CI=1 VITE_RFS_VISUAL_TEST=0 npx playwright test \
  e2e/rfs-blackbox-player-loop.spec.ts \
  -g "keyboard controls" \
  --workers=1 \
  --reporter=line \
  --timeout=360000
```

Expected now: FAIL or timeout on the known `Takeoff setup`/gear readback path. If it unexpectedly passes, continue with Task 2 anyway because the helper still relies on a phase-gated panel for post-takeoff truth.

**Step 3: Inspect failure artifact once, do not rerun repeatedly**

Run:

```bash
cd /Users/reidar/Projectos/RFS
find test-results -name error-context.md -maxdepth 3 -print
```

Expected: if the test failed, at least one `error-context.md` path. Read it and record the visible phase, gear/flap/throttle, route status, and FMA state in the implementation report. Do not commit `test-results/`.

---

## Phase 1 — Add durable visible readbacks for black-box post-takeoff assertions

### Task 2: Add an accessible EngineStrip region and component test

**Objective:** Give Playwright black-box helpers a stable product-visible post-takeoff readback that is not hidden when `TakeoffSetupPanel` is phase-gated away.

**Files:**
- Modify: `src/components/EngineStrip.tsx:14-62`
- Create: `src/components/__tests__/EngineStrip.test.tsx`
- Test: `src/components/__tests__/EngineStrip.test.tsx`

**Step 1: Write failing component test**

Create `src/components/__tests__/EngineStrip.test.tsx`:

```tsx
import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { EngineStrip } from '../EngineStrip';
import { useSimStore } from '../../store/simStore';

describe('EngineStrip', () => {
  beforeEach(() => {
    useSimStore.getState().reset();
  });

  it('exposes command and actual airframe readbacks through a named region', () => {
    useSimStore.setState((state) => ({
      inputs: {
        ...state.inputs,
        throttle1: 1,
        throttle2: 1,
        flapLever: 5,
        gearLever: 'UP',
      },
      effectiveControls: {
        ...state.effectiveControls,
        throttle1: 1,
        throttle2: 1,
        flapLever: 5,
        gearLever: 'UP',
      },
      aircraft: {
        ...state.aircraft,
        config: {
          ...state.aircraft.config,
          flapSetting: 5,
          gearDown: false,
          gearPosition: 0,
        },
        engines: state.aircraft.engines.map((engine) => ({ ...engine, n1: 93.2 })),
      },
    }));

    render(<EngineStrip />);

    const strip = screen.getByRole('region', { name: 'Engine, flap, and gear status' });
    expect(within(strip).getByText('THR CMD')).toBeVisible();
    expect(within(strip).getByText('100%')).toBeVisible();
    expect(within(strip).getByText('FLAPS CMD')).toBeVisible();
    expect(within(strip).getByText('5°')).toBeVisible();
    expect(within(strip).getByText('GEAR CMD')).toBeVisible();
    expect(within(strip).getByText('UP')).toBeVisible();
  });
});
```

**Step 2: Run test to verify RED**

Run:

```bash
cd /Users/reidar/Projectos/RFS
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npm run test -- src/components/__tests__/EngineStrip.test.tsx
```

Expected now: FAIL because the engine strip root is not a named `region`.

**Step 3: Implement minimal accessible region**

Patch `src/components/EngineStrip.tsx` root element:

```tsx
return (
  <div aria-label="Engine, flap, and gear status" role="region" style={containerStyle}>
```

Do not change layout or values in this task.

**Step 4: Run test to verify GREEN**

Run:

```bash
cd /Users/reidar/Projectos/RFS
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npm run test -- src/components/__tests__/EngineStrip.test.tsx
```

Expected: PASS.

---

### Task 3: Add EngineStrip black-box parser helpers

**Objective:** Let black-box specs read post-takeoff throttle/flap/gear command and gear actual state from a durable visible region.

**Files:**
- Modify: `e2e/helpers/rfsBlackbox.ts:1-662`
- Test: `e2e/rfs-blackbox-player-loop.spec.ts`

**Step 1: Add failing usage in the keyboard spec**

In `e2e/rfs-blackbox-player-loop.spec.ts`, import a helper that does not exist yet:

```ts
  expectVisibleEngineStripCommand,
```

Then replace the post-throttle setup-panel assertion in the keyboard test with:

```ts
await expectVisibleEngineStripCommand(page, {
  throttlePercent: 100,
  flapCommandDeg: 5,
  gearCommand: 'DN',
});
```

Expected TypeScript/Playwright failure: helper is not exported.

**Step 2: Implement helper in `e2e/helpers/rfsBlackbox.ts`**

Add near the visible-readback helper section:

```ts
interface VisibleEngineStripCommandExpectation {
  throttlePercent?: number;
  flapCommandDeg?: number;
  gearCommand?: 'DN' | 'UP';
  gearActual?: RegExp | 'DN' | 'UP';
}

async function readVisibleEngineStripText(page: Page): Promise<string> {
  return (await page
    .getByRole('region', { name: 'Engine, flap, and gear status' })
    .textContent())?.replace(/\s+/g, ' ').trim() ?? '';
}

export async function expectVisibleEngineStripCommand(
  page: Page,
  expected: VisibleEngineStripCommandExpectation,
): Promise<string> {
  const text = await readVisibleEngineStripText(page);
  if (expected.throttlePercent !== undefined) {
    expect(text).toMatch(new RegExp(`THR CMD\\s*${expected.throttlePercent}%`));
  }
  if (expected.flapCommandDeg !== undefined) {
    expect(text).toMatch(new RegExp(`FLAPS CMD\\s*${expected.flapCommandDeg}°`));
  }
  if (expected.gearCommand !== undefined) {
    expect(text).toMatch(new RegExp(`GEAR CMD\\s*${expected.gearCommand}`));
  }
  if (expected.gearActual !== undefined) {
    const actual = expected.gearActual instanceof RegExp ? expected.gearActual : new RegExp(`GEAR ACT\\s*${expected.gearActual}`);
    expect(text).toMatch(actual);
  }
  return text;
}
```

**Step 3: Explicit TypeScript parse check for E2E helper**

`tsconfig.json` does not include `e2e`, so run an explicit TS 6 helper check:

```bash
cd /Users/reidar/Projectos/RFS
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npx tsc --ignoreConfig --noEmit --target ES2022 --module ESNext --moduleResolution bundler --strict --skipLibCheck \
  e2e/helpers/rfsBlackbox.ts e2e/rfs-blackbox-player-loop.spec.ts
```

Expected: PASS.

**Step 4: Run black-box guard**

Run:

```bash
cd /Users/reidar/Projectos/RFS
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npm run check:blackbox
```

Expected: PASS. The new helper must not import `src/`, access Zustand, call `page.evaluate()`, or seed aircraft/route state.

---

## Phase 2 — Repair player-loop E2E specs without weakening proof boundaries

### Task 4 [PARENT-DIRECT]: Migrate the keyboard gear-up/reset path to EngineStrip readbacks

**Objective:** Stop the keyboard visible-control proof from depending on `TakeoffSetupPanel` after the app reaches positive rate or leaves `TAKEOFF`.

**Files:**
- Modify: `e2e/rfs-blackbox-player-loop.spec.ts:44-82`
- Modify: `e2e/helpers/rfsBlackbox.ts:242-252`
- Test: `e2e/rfs-blackbox-player-loop.spec.ts`

**Step 1: Change keyboard gear helper to avoid setup-panel reads**

Replace the body of `toggleVisibleGearThroughKeyboardControls()` with a version that presses the visible keyboard binding and verifies command state through `EngineStrip`:

```ts
export async function toggleVisibleGearThroughKeyboardControls(page: Page, target: VisibleGearTarget): Promise<void> {
  const targetLabel = target === 'DOWN' ? 'DN' : 'UP';
  for (let guard = 0; guard < 8; guard += 1) {
    const stripText = await expectVisibleEngineStripCommand(page, {});
    if (new RegExp(`GEAR CMD\\s*${targetLabel}`).test(stripText)) return;
    await page.keyboard.press('KeyG');
    await advanceVisibleSimTime(page, 250);
  }

  const finalText = await expectVisibleEngineStripCommand(page, {});
  if (new RegExp(`GEAR CMD\\s*${targetLabel}`).test(finalText)) return;
  throw new Error(`Unable to set visible gear lever to ${target} with keyboard Gear control; engine strip text: ${finalText}`);
}
```

If the helper needs to preserve preflight reads for `DOWN`, keep the `EngineStrip` path for both directions for consistency.

**Step 2: Update keyboard spec assertions**

In `e2e/rfs-blackbox-player-loop.spec.ts:59-75`, keep setup-panel assertions only before/at the roll. After positive rate, assert via `EngineStrip`:

```ts
await holdKey(page, 'ArrowUp', 20);
await expectVisibleEngineStripCommand(page, {
  throttlePercent: 100,
  flapCommandDeg: 5,
  gearCommand: 'DN',
});

await driveVisibleSimUntil(page, 'visible takeoff speed for rotation', async () => {
  return (await readVisibleFlightNumbers(page)).iasKt >= 145;
}, {
  timeoutMs: 120_000,
  stepMs: 1000,
});
await rotateToVisiblePositiveRate(page);
expect(await waitForVisibleFlightPhase(page, /^(CLIMB|CRUISE)$/)).toMatch(/^(CLIMB|CRUISE)$/);
await expect(page.getByRole('region', { name: 'Scenario and tutorial' }).getByText('Positive rate established')).toBeVisible();

await toggleVisibleGearThroughKeyboardControls(page, 'UP');
await expectVisibleEngineStripCommand(page, {
  gearCommand: 'UP',
  gearActual: /GEAR ACT\s*(?:TRN\s*\d+%|UP)/,
});
```

Do not use `page.evaluate()` or direct store reads.

**Step 3: Run focused keyboard spec**

Run:

```bash
cd /Users/reidar/Projectos/RFS
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
CI=1 VITE_RFS_VISUAL_TEST=0 npx playwright test \
  e2e/rfs-blackbox-player-loop.spec.ts \
  -g "keyboard controls" \
  --workers=1 \
  --reporter=line \
  --timeout=360000
```

Expected: PASS. If it fails because the sim never reaches positive rate or races into descent before gear can be commanded, stop and inspect the error artifact; do not rerun unchanged.

---

### Task 5 [PARENT-DIRECT]: Keep mouse cleanup controls visible only until clean climb

**Objective:** Preserve overlay decluttering while keeping the mouse-only takeoff/gear-up/flap-cleanup proof honest and usable.

**Files:**
- Modify: `src/app/RfsShell.tsx:103-107,298-302,357`
- Test: existing App/RfsShell shell tests, likely `src/__tests__/App.test.tsx`
- Test: `e2e/rfs-blackbox-player-loop.spec.ts`

**Step 1: Add a RED shell/component test for cleanup visibility**

Find the existing app-shell test harness in `src/__tests__/App.test.tsx`. Add a test proving:

1. `Takeoff setup` remains visible in `CLIMB` while gear/flaps are not clean.
2. `Takeoff setup` hides in `CLIMB` once gear command/actual are up and flaps are zero.

Use the existing App test mocks rather than adding real Cesium/Three dependencies. The core state shape should be:

```ts
useSimStore.setState((state) => ({
  status: 'running',
  aircraft: {
    ...state.aircraft,
    flightPhase: 'CLIMB',
    config: {
      ...state.aircraft.config,
      flapSetting: 5,
      gearDown: true,
      gearPosition: 1,
    },
  },
  inputs: {
    ...state.inputs,
    flapLever: 5,
    gearLever: 'DOWN',
  },
}));
```

Expected now: FAIL if `RfsShell` hides setup unconditionally for `CLIMB`.

**Step 2: Implement cleanup-aware phase gate**

Patch `src/app/RfsShell.tsx` near line 301:

```tsx
const inputs = useSimStore((s) => s.inputs);
const gearDownActual = useSimStore((s) => s.aircraft.config.gearDown);
const gearPositionActual = useSimStore((s) => s.aircraft.config.gearPosition);
const flapsActual = useSimStore((s) => s.aircraft.config.flapSetting);
```

Then replace the setup-panel gate with:

```tsx
const cleanupStillNeeded = flightPhase === 'CLIMB'
  && (
    inputs.gearLever !== 'UP'
    || gearDownActual
    || gearPositionActual > 0.001
    || inputs.flapLever > 0
    || flapsActual > 0
  );
const showTakeoffSetupPanel = showFlightInstruments
  && (['PARKED', 'TAXI', 'TAKEOFF'].includes(flightPhase) || cleanupStillNeeded);
```

This keeps the panel visible for the narrow positive-rate/cleanup interval, then hides it after clean climb to avoid long-running overlay clutter.

**Step 3: Run shell/component tests**

Run:

```bash
cd /Users/reidar/Projectos/RFS
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npm run test -- src/__tests__/App.test.tsx src/components/__tests__/EngineStrip.test.tsx
```

Expected: PASS.

**Step 4: Run focused player-loop spec**

Run:

```bash
cd /Users/reidar/Projectos/RFS
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
CI=1 VITE_RFS_VISUAL_TEST=0 npx playwright test \
  e2e/rfs-blackbox-player-loop.spec.ts \
  --workers=1 \
  --reporter=line \
  --timeout=360000
```

Expected: PASS for all player-loop black-box tests. If the mouse-only test still fails after cleanup gating, inspect whether it uses `TakeoffSetupPanel` after the clean state; update the spec to use keyboard only where mouse controls are not actually available, or add a deliberately scoped visible mouse control in the product before asserting mouse-only proof.

---

### Task 6 [PARENT-DIRECT]: Run the default browser-proof suite and fix only new concrete failures

**Objective:** Restore the default local browser-proof suite without hiding failures or broadening claims.

**Files:**
- Modify only files required by failures found in this task.
- Likely test files: `e2e/rfs-blackbox-player-loop.spec.ts`, `e2e/rfs-route-descent.spec.ts`, `e2e/rfs-flight.spec.ts`, `e2e/rfs-route.spec.ts`.

**Step 1: Run default E2E**

Run:

```bash
cd /Users/reidar/Projectos/RFS
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npm run test:e2e
```

Expected after Tasks 2-5: PASS. If FAIL, read `test-results/**/error-context.md` and classify the failure before patching.

**Step 2: If the failure is route/descent lifecycle, add unit regression first**

For route lifecycle bugs, add a narrow test before patching production code. Example target files:

- `src/sim/systems/__tests__/navigation.test.ts`
- `src/sim/__tests__/flightPhasePredicates.test.ts`
- `src/sim/__tests__/simulationStep.test.ts`
- `src/store/__tests__/simStore.test.ts`

Do not patch a long E2E timeout by weakening assertions. Make the product truth pass a narrow unit/regression test first, then rerun the affected Playwright spec.

**Step 3: Stop after one new blocker class**

If a new E2E blocker appears outside the player-loop helper boundary, create a focused follow-up task or plan note. Do not keep stacking unrelated fixes inside the same commit.

---

## Phase 3 — Re-establish local release evidence

### Task 7 [PARENT-DIRECT]: Run full local gates in CI-like shape

**Objective:** Produce a clean local evidence set for the exact implementation tree.

**Files:**
- No source modifications unless gates expose a concrete issue.

**Step 1: Clear stale local server**

Run:

```bash
cd /Users/reidar/Projectos/RFS
if lsof -nP -iTCP:5173 -sTCP:LISTEN >/tmp/rfs-5173.txt 2>/dev/null; then
  awk 'NR>1 {print $2}' /tmp/rfs-5173.txt | sort -u | xargs kill
fi
```

Expected: no stale Vite server owns visual/E2E env.

**Step 2: Run local release gates**

Run:

```bash
cd /Users/reidar/Projectos/RFS
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npm run check
npm run test:e2e
CI=1 npm run test:visual
```

Expected: all PASS.

**Step 3: Verify source tree and ignored artifacts**

Run:

```bash
cd /Users/reidar/Projectos/RFS
git status --short --branch
git check-ignore -v test-results dogfood-output || true
```

Expected: source changes are intentional; ignored Playwright outputs are not staged.

---

### Task 8: Update proof-boundary docs for this slice

**Objective:** Keep documentation honest about what the fixed E2E layer proves and what remains unproven.

**Files:**
- Modify: `docs/roadmap.md`
- Modify: `docs/architecture.md` only if implementation changes product/runtime boundaries.
- Modify: `docs/plans/README.md`
- Optional create: `docs/reviews/YYYY-MM-DD-rfs-e2e-proof-stability-closeout.md`

**Step 1: Add concise docs note**

If Tasks 2-7 pass, add a short status note that says:

- local default E2E is green for the exact local SHA;
- player-loop black-box gear/throttle/flap proof uses durable product-visible readbacks, not setup-panel persistence;
- visual proof remains green;
- no CI/live/full-flight/source-backed realism claim is made unless separately verified.

**Step 2: Run docs diff check**

Run:

```bash
cd /Users/reidar/Projectos/RFS
git diff --check -- docs/roadmap.md docs/architecture.md docs/plans/README.md docs/reviews docs/plans
```

Expected: PASS.

---

## Phase 4 — Optional next slice after default E2E is green: route/descent/full-flight proof

### Task 9 [PARENT-DIRECT]: Strengthen route/descent proof preconditions before any full-flight claim

**Objective:** Ensure route/descent acceptance cannot pass unless visible route progress occurs before descent/landing assertions.

**Files:**
- Modify: `e2e/rfs-route-descent.spec.ts:22-99`
- Modify: `e2e/rfs-full-flight-blackbox.spec.ts:29-153` only if intentionally working on slow full-flight acceptance.
- Modify: `e2e/helpers/rfsBlackbox.ts` only for visible readback helpers.
- Test: `e2e/rfs-route-descent.spec.ts`

**Step 1: Assert pre-load negative route state**

Keep this existing pattern:

```ts
await selectKseaScenarioThroughVisibleControls(page);
await expect(page.getByLabel('Route status')).toContainText('NO ROUTE');
```

**Step 2: Require material visible route progress before descent counts**

Keep or tighten assertions like:

```ts
const initialRoute = await readVisibleRouteStatus(page);
expect(initialRoute.distanceToGoNm).not.toBeNull();

await driveVisibleSimUntil(page, 'visible route progress toward KPDX before descent', async () => {
  const route = await readVisibleRouteStatus(page);
  if (route.distanceToGoNm === null || initialRoute.distanceToGoNm === null) return false;
  return route.distanceToGoNm < initialRoute.distanceToGoNm - 0.5;
}, {
  timeoutMs: 120_000,
  stepMs: 1000,
});
```

**Step 3: Run route/descent spec and guard**

Run:

```bash
cd /Users/reidar/Projectos/RFS
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npm run check:blackbox
CI=1 VITE_RFS_VISUAL_TEST=0 npx playwright test \
  e2e/rfs-route-descent.spec.ts \
  --workers=1 \
  --reporter=line \
  --timeout=480000
```

Expected: PASS. If FAIL, inspect route/FMA/phase state and add targeted unit regressions before patching broad route logic.

---

### Task 10 [PARENT-DIRECT]: Only then run the explicit slow full-flight gate

**Objective:** Determine whether the current branch can honestly support any full-flight claim.

**Files:**
- Modify: `e2e/rfs-full-flight-blackbox.spec.ts` only if the proof is intentionally being repaired.
- Do not weaken full-flight acceptance to a nearby landing or seeded bridge.

**Step 1: Run the slow gate explicitly**

Run:

```bash
cd /Users/reidar/Projectos/RFS
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
CI=1 npm run test:e2e:full-flight
```

Expected possibilities:

- PASS: report as local exact-SHA slow full-flight evidence only, not CI/live/deploy.
- FAIL/TIMEOUT: report exact blocker and keep full-flight as remaining work.

**Step 2: If it fails, classify rather than weakening**

A valid full-flight proof must show visible route progress/leg sequencing and cannot count a nearby landing after unchanged/increasing KSEA route distance. If failure shows premature descent from distant runway-threshold constraints, add/verify the unit regression described in `rfs-development/references/preloaded-route-full-flight-blackbox.md` before patching route descent target resolution.

---

## Phase 5 — Commit and report local-only evidence

### Task 11 [PARENT-DIRECT]: Commit the focused implementation locally

**Objective:** Preserve a clean local checkpoint with only intentional source/docs changes.

**Files:**
- Stage only intentional changed files from Tasks 2-8.
- Do not stage `test-results/`, `dogfood-output/`, screenshots, traces, or unrelated local artifacts.

**Step 1: Review staged scope**

Run:

```bash
cd /Users/reidar/Projectos/RFS
git status --short
git diff --stat
git diff --check
```

Expected: only intended implementation/docs files; `git diff --check` PASS.

**Step 2: Commit locally**

Run with exact paths, not `git add -A`. Example after this plan’s first implementation slice:

```bash
cd /Users/reidar/Projectos/RFS
git add \
  src/components/EngineStrip.tsx \
  src/components/__tests__/EngineStrip.test.tsx \
  src/app/RfsShell.tsx \
  src/__tests__/App.test.tsx \
  e2e/helpers/rfsBlackbox.ts \
  e2e/rfs-blackbox-player-loop.spec.ts \
  docs/plans/README.md \
  docs/roadmap.md

git commit -m "fix: stabilize visible player-loop proof"
```

Expected: commit succeeds. Do not push without explicit current authorization.

**Step 3: Final report shape**

Report in this exact structure:

```markdown
## Evidence
- Local SHA: `<sha>`
- `npm run check`: PASS/FAIL with exact summary
- `npm run test:e2e`: PASS/FAIL with exact summary
- `CI=1 npm run test:visual`: PASS/FAIL with exact summary

## Changed
- `<path>` — one-line purpose

## Non-claims
- Not CI green unless exact GitHub Actions run completed/success.
- Not live/deployed unless `/rfs-version.json` matches `<sha>`.
- Not full-flight/full-route unless `npm run test:e2e:full-flight` passed for `<sha>`.
```

---

## Follow-up roadmap after this plan

These are intentionally deferred until the default local browser-proof layer is green again:

1. **Route/descent/full-flight proof depth:** strengthen visible route-progress and route-coupled descent proof before any full-flight claim.
2. **RFMS/FMS visible route editing:** expose `DIRECT_TO`, `DISCONTINUITY`, undo, and `EXEC` through visible controls wired to store-owned route state and route-status recomputation.
3. **Worker migration:** make `FrameScheduler`/`useSimLoop`/`simStore` async-aware before claiming browser-worker physics is production active.
4. **Source-backed FDM/performance:** resolve permitted source packets and metadata before replacing placeholder gameplay values or making stronger realism claims.
5. **Product polish:** richer loading/error/scenery UX, cockpit/interior fidelity, weather/audio/PWA work after proof stability and truth contracts are protected.
