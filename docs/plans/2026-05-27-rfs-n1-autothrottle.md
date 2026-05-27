# RFS N1 Autothrottle Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task. Parent-direct is allowed for final docs sync and deploy verification, but code tasks should follow strict TDD.

**Goal:** Finish the next P2 roadmap slice by adding an honest Boeing-style N1 autothrottle mode in addition to existing SPEED hold.

**Architecture:** `autopilot.ts` already owns thrust commands for SPEED mode and `RfsMCP.tsx` owns the honest clickable mode surface. This plan adds a conservative N1 target resolver and throttle command law, exposes a clickable N1 MCP mode only because the command law exists, and proves `advanceSimulationStep()`/store ticks feed N1 commands into effective controls before engine integration.

**Tech Stack:** TypeScript strict, Vitest, React Testing Library, Zustand store, RFMS shared `ThrustMode` types.

## Status

Completed in the current repository state. This file now serves as the current status record plus the historical implementation plan below.

Implementation commits/messages:

- `docs: add n1 autothrottle plan`
- `feat: add n1 autothrottle law`
- `feat: expose n1 thrust mode in mcp`
- `test: prove n1 autothrottle integration`

Current behavior:

- `autopilot.ts` implements a conservative phase-based N1 target mode: TAKEOFF 92%, CLIMB 88%, CRUISE or altitude above 18,000 ft 72%, DESCENT/APPROACH/LANDED 55%, and otherwise 20%.
- N1 mode is separate from the SPEED airspeed-hold law; it commands throttle from target N1 versus average current engine N1.
- N1 mode respects `boeing.autothrottleArm` and emits no throttle commands when A/T is unarmed.
- N1 throttle commands are symmetric, rate-limited, AP-owned throttle commands.
- `RfsMCP` exposes clickable SPD and N1 thrust buttons because both command laws now exist, and it keeps Boeing `speedMode` and `n1` flags mutually exclusive.
- `RfsPFD` displays `N1` from `apState.truth.thrustActive` as honest FMA truth.
- `advanceSimulationStep()` and store ticks feed N1 commands into `effectiveControls` before engine integration.
- Manual AP disconnect/override clears stale `boeing.n1` along with `boeing.speedMode`.
- This slice intentionally did not add VNAV/LVL CHG/FMA lifecycle controls.

---

## Baseline before this plan (historical)

- `ThrustMode` already includes `N1` in RFMS shared types.
- `RfsPFD` displays `apState.truth.thrustActive`, so it can display `N1` once the truth state uses it.
- `RfsMCP` has only a clickable `SPD` thrust button; `boeing.n1` is always cleared and there is no N1 button.
- `computeAutopilotCommands()` only commands throttles for `truth.thrustActive === 'SPEED'`.
- Roadmap P2 still listed N1 thrust mode as remaining before this plan was implemented.

## Design constraints

- Do not add clickable VNAV/LVL CHG/FMA lifecycle controls in this slice.
- Keep N1 behavior conservative and explicit: it is an approximate target-N1 thrust mode, not a full FMC thrust-limit computer.
- Do not reuse the SPEED airspeed error law for N1. N1 mode should command throttle from target N1 vs current engine N1.
- Respect `boeing.autothrottleArm`: if A/T is not armed, `N1` truth mode must not write throttle commands.
- Keep throttle commands symmetric and rate-limited.
- Preserve existing `SPEED` behavior and tests.
- Because `AutopilotCommands` only carries throttle levers, N1 control commands throttle toward an engine N1 target; actual engine N1 still spools through `updateEngines()`.
- Manual AP disconnect/override must clear `boeing.n1` just like `boeing.speedMode`, otherwise the FMA truth can be OFF while Boeing flags still claim N1.

## Proposed N1 target model

Add named constants in `src/sim/systems/autopilot.ts`:

```ts
const N1_TAKEOFF_LIMIT_PERCENT = 92;
const N1_CLIMB_LIMIT_PERCENT = 88;
const N1_CRUISE_LIMIT_PERCENT = 72;
const N1_APPROACH_LIMIT_PERCENT = 55;
const N1_IDLE_LIMIT_PERCENT = 20;
```

Add a small exported helper so behavior is testable without UI:

```ts
export function computeN1TargetPercent(state: AircraftState): number {
  if (state.flightPhase === 'TAKEOFF') return N1_TAKEOFF_LIMIT_PERCENT;
  if (state.flightPhase === 'CLIMB') return N1_CLIMB_LIMIT_PERCENT;
  if (state.flightPhase === 'CRUISE' || state.position.alt > 18_000) return N1_CRUISE_LIMIT_PERCENT;
  if (state.flightPhase === 'DESCENT' || state.flightPhase === 'APPROACH' || state.flightPhase === 'LANDED') return N1_APPROACH_LIMIT_PERCENT;
  return N1_IDLE_LIMIT_PERCENT;
}
```

The exact constants are deliberately conservative approximations. Later P5 data-quality work can move them into versioned performance data or an FMC thrust-limit model.

For N1 throttle target, use the inverse of the current engine throttle mapping in `engine.ts`:

```ts
function throttleForTargetN1(targetN1Percent: number): number {
  return clamp01((targetN1Percent - 20) / 80);
}
```

Then apply a small correction from actual average engine N1 error before the existing throttle rate limiter, e.g.:

```ts
const avgN1 = (state.engines[0].n1 + state.engines[1].n1) / 2;
const baseThrottle = throttleForTargetN1(targetN1Percent);
const n1Correction = clamp((targetN1Percent - avgN1) * 0.01, -0.15, 0.15);
const desired = clamp01(baseThrottle + n1Correction);
```

This avoids making N1 a speed-hold clone while still converging when lagged engines are above or below target.

---

## Task 1: Add N1 thrust target and command law

**Objective:** `computeAutopilotCommands()` should command rate-limited symmetric throttle in `N1` mode from target N1 vs current N1, independent of SPEED airspeed error.

**Files:**
- Modify: `src/sim/systems/autopilot.ts`
- Modify: `src/sim/systems/__tests__/autopilot.test.ts`

**Step 1: Write failing tests**

Add tests under a new or existing `describe('computeAutopilotCommands N1', ...)` block:

```ts
it('resolves a takeoff N1 target for N1 thrust mode', () => {
  const s = createInitialState(B737_800_SPEC);
  s.flightPhase = 'TAKEOFF';
  const ap = makeAp('HDG_SEL', 'ALT_HOLD', 'N1');
  ap.boeing.autothrottleArm = true;

  const targets = resolveAutopilotTargets(s, ap);

  expect(targets.targetN1Percent).toBeGreaterThan(85);
  expect(targets.targetN1Percent).toBeLessThanOrEqual(95);
});

it('advances throttle toward target N1 without using SPEED error', () => {
  const s = createInitialState(B737_800_SPEC);
  s.flightPhase = 'TAKEOFF';
  s.velocity.u = 220; // already fast; SPEED law would tend to reduce if targetSpeed is low.
  s.engines[0].n1 = 35;
  s.engines[1].n1 = 35;
  const ap = makeAp('HDG_SEL', 'ALT_HOLD', 'N1');
  ap.boeing.autothrottleArm = true;

  const targets = resolveAutopilotTargets(s, ap);
  const commands = computeAutopilotCommands(
    s,
    ap,
    targets.targetHeadingRad,
    targets.targetAltFt,
    100,
    1 / 60,
    targets.targetVerticalSpeedFpm,
    targets.targetN1Percent,
  );

  expect(commands.throttle1).toBeGreaterThan(0);
  expect(commands.throttle1).toBeLessThan(0.15);
  expect(commands.throttle2).toBe(commands.throttle1);
});

it('reduces throttle below the base cruise N1 throttle when actual N1 is above target', () => {
  const s = createInitialState(B737_800_SPEC);
  s.flightPhase = 'CRUISE';
  s.engines[0].n1 = 95;
  s.engines[1].n1 = 95;
  const ap = makeAp('HDG_SEL', 'ALT_HOLD', 'N1');
  ap.boeing.autothrottleArm = true;

  const targets = resolveAutopilotTargets(s, ap);
  const first = computeAutopilotCommands(
    s,
    ap,
    targets.targetHeadingRad,
    targets.targetAltFt,
    targets.targetSpeedKt,
    1,
    targets.targetVerticalSpeedFpm,
    targets.targetN1Percent,
  );

  // Cruise target base throttle is roughly (72 - 20) / 80 = 0.65; actual-N1 feedback should pull below it.
  expect(first.throttle1).toBeLessThan(0.6);
});

it('does not command N1 throttles when autothrottle is not armed even with an explicit target', () => {
  const s = createInitialState(B737_800_SPEC);
  const ap = makeAp('HDG_SEL', 'ALT_HOLD', 'N1');
  ap.boeing.autothrottleArm = false;

  const targets = resolveAutopilotTargets(s, ap);
  const commands = computeAutopilotCommands(
    s,
    ap,
    targets.targetHeadingRad,
    targets.targetAltFt,
    targets.targetSpeedKt,
    1 / 60,
    targets.targetVerticalSpeedFpm,
    92,
  );

  expect(targets.targetN1Percent).toBeUndefined();
  expect(commands.throttle1).toBeUndefined();
  expect(commands.throttle2).toBeUndefined();
});
```

Update `AutopilotTargets` expectations by adding `targetN1Percent?: number`.

**Step 2: Verify RED**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/systems/__tests__/autopilot.test.ts
```

Expected: FAIL because `targetN1Percent` / N1 command law do not exist yet.

**Step 3: Implement minimal code**

In `autopilot.ts`:
- Add N1 constants and exported `computeN1TargetPercent()`.
- Extend `AutopilotTargets` with `targetN1Percent?: number`.
- In `resolveAutopilotTargets()`, set `targetN1Percent = computeN1TargetPercent(state)` when `apState.truth.thrustActive === 'N1'` and `apState.boeing.autothrottleArm` is true.
- Extend `computeAutopilotCommands()` signature to accept optional `targetN1Percent` after `targetVerticalSpeedFpm`.
- Preserve existing callers by making the parameter optional.
- Add `else if (t.thrustActive === 'N1' && apState.boeing.autothrottleArm && targetN1Percent !== undefined)` after the SPEED block.
- Reuse the same `throttleCommand` rate limiter.
- Pass `targets.targetN1Percent` from `computeAutopilotCommandsForState()`.

**Step 4: Verify GREEN**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/systems/__tests__/autopilot.test.ts
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx tsc -b --pretty false
```

**Step 5: Commit**

```bash
git add src/sim/systems/autopilot.ts src/sim/systems/__tests__/autopilot.test.ts
git -c commit.gpgsign=false commit -m "feat: add n1 autothrottle law"
```

---

## Task 2: Expose honest N1 MCP/FMA affordance

**Objective:** `RfsMCP` should show a clickable `N1` thrust mode only now that an N1 command law exists, and it should set matching truth/boeing flags. `RfsPFD` should be covered by a test that FMA displays `N1` truth.

**Files:**
- Modify: `src/instruments/RfsMCP.tsx`
- Modify: `src/instruments/__tests__/RfsMCP.test.tsx`
- Modify: `src/instruments/__tests__/RfsPFD.test.tsx`

**Step 1: Write failing tests**

Add to `RfsMCP.test.tsx`:

```ts
it('first N1 click creates AP state and honestly engages N1', () => {
  render(<RfsMCP />);

  fireEvent.click(screen.getByRole('button', { name: 'N1' }));

  const ap = useSimStore.getState().apState;
  expect(ap).not.toBeNull();
  expect(ap?.truth.autopilotStatus).toBe('CMD_A');
  expect(ap?.truth.thrustActive).toBe('N1');
  expect(ap?.boeing.autothrottleArm).toBe(true);
  expect(ap?.boeing.n1).toBe(true);
  expect(ap?.boeing.speedMode).toBe(false);
});

it('switches between SPD and N1 without leaving conflicting Boeing thrust flags', () => {
  render(<RfsMCP />);

  fireEvent.click(screen.getByRole('button', { name: 'SPD' }));
  fireEvent.click(screen.getByRole('button', { name: 'N1' }));

  let ap = useSimStore.getState().apState;
  expect(ap?.truth.thrustActive).toBe('N1');
  expect(ap?.boeing.n1).toBe(true);
  expect(ap?.boeing.speedMode).toBe(false);

  fireEvent.click(screen.getByRole('button', { name: 'SPD' }));

  ap = useSimStore.getState().apState;
  expect(ap?.truth.thrustActive).toBe('SPEED');
  expect(ap?.boeing.n1).toBe(false);
  expect(ap?.boeing.speedMode).toBe(true);
});
```

Add to `RfsPFD.test.tsx`:

```ts
it('shows N1 as an honest FMA thrust mode when truth state is N1', () => {
  const ap = apStateWithModes();
  ap.truth.thrustActive = 'N1';
  ap.boeing.n1 = true;
  ap.boeing.speedMode = false;
  useSimStore.getState().setApState(ap);

  render(<RfsPFD />);

  expect(screen.getByText('N1')).toBeTruthy();
});
```

**Step 2: Verify RED**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/instruments/__tests__/RfsMCP.test.tsx src/instruments/__tests__/RfsPFD.test.tsx
```

Expected: FAIL because the N1 button is not rendered.

**Step 3: Implement minimal code**

In `RfsMCP.tsx`:
- Extend `EnabledMcpMode` with `'N1'`.
- Update `applyMcpMode()` thrust branch to handle both `'SPEED'` and `'N1'`:
  - `apState.truth.thrustActive = mode as ThrustMode`.
  - `apState.boeing.speedMode = mode === 'SPEED'`.
  - `apState.boeing.n1 = mode === 'N1'`.
  - `apState.boeing.autothrottleArm = true`.
- Add an `N1` button next to `SPD`, active when `thrActive === 'N1'`.

`RfsPFD.tsx` likely needs no production change because it already renders `truth.thrustActive`; keep the test as coverage.

**Step 4: Verify GREEN**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/instruments/__tests__/RfsMCP.test.tsx src/instruments/__tests__/RfsPFD.test.tsx
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx tsc -b --pretty false
```

**Step 5: Commit**

```bash
git add src/instruments/RfsMCP.tsx src/instruments/__tests__/RfsMCP.test.tsx src/instruments/__tests__/RfsPFD.test.tsx
git -c commit.gpgsign=false commit -m "feat: expose n1 thrust mode in mcp"
```

---

## Task 3: Prove N1 integration through simulation/store

**Objective:** A running simulation step/store tick should feed N1 AP throttle commands into effective controls and the engine model, while manual AP disconnect clears stale N1 flags.

**Files:**
- Modify: `src/sim/__tests__/simulationStep.test.ts`
- Modify: `src/store/__tests__/simStore.test.ts`
- Modify: `src/store/simStore.ts` if stale `boeing.n1` cleanup is missing

**Step 1: Write failing tests**

In `simulationStep.test.ts`, add helper `n1AutopilotState()` similar to `lnavAutopilotState()` but with:
- `truth.thrustActive = 'N1'`
- `truth.autopilotStatus = 'CMD_A'`
- `boeing.autothrottleArm = true`
- `boeing.n1 = true`
- `boeing.speedMode = false`

Add:

```ts
it('feeds N1 autothrottle commands into effective controls before engine integration', () => {
  const aircraft = createInitialState(B737_800_SPEC);
  aircraft.flightPhase = 'TAKEOFF';
  aircraft.engines[0].n1 = 0;
  aircraft.engines[1].n1 = 0;
  const pilotInputs = tutorialControls();
  const apState = n1AutopilotState();
  const guidance = buildGuidanceState({
    scenario: KSEA_TUTORIAL_SCENARIO,
    status: 'running',
    aircraft,
    controls: pilotInputs,
  });

  const result = advanceSimulationStep({
    aircraft,
    spec: B737_800_SPEC,
    pilotInputs,
    apState,
    flightPlan: null,
    activeLegIndex: null,
    routeStatus: createNoRouteStatus(),
    wind: null,
    dt: 1 / 60,
    status: 'running',
    selectedScenarioId: KSEA_TUTORIAL_SCENARIO.id,
    guidance,
  });

  expect(result.apCommands.throttle1).toBeGreaterThan(0);
  expect(result.controls.effectiveControls.throttle1).toBe(result.apCommands.throttle1);
  expect(result.controls.pilotInputs.throttle1).toBe(0);
  expect(result.controls.inputs).toBe(result.controls.effectiveControls);
  expect(result.aircraft.engines[0].n1).toBeGreaterThan(0);
});
```

In `simStore.test.ts`, add a store-level test:

```ts
it('tick stores N1 autothrottle commands and effective throttle while running', () => {
  const ap = minimalApState();
  ap.truth.autopilotStatus = 'CMD_A';
  ap.truth.thrustActive = 'N1';
  ap.boeing.autothrottleArm = true;
  ap.boeing.n1 = true;
  ap.boeing.speedMode = false;

  useSimStore.setState((s) => ({
    aircraft: {
      ...s.aircraft,
      flightPhase: 'TAKEOFF',
      engines: [
        { ...s.aircraft.engines[0], n1: 0 },
        { ...s.aircraft.engines[1], n1: 0 },
      ],
    },
  }));
  useSimStore.getState().setApState(ap);
  expect(useSimStore.getState().apCommands).toEqual({});
  expect(useSimStore.getState().pilotInputs.throttle1).toBe(0);
  useSimStore.getState().start();
  useSimStore.getState().tick(1000);

  const state = useSimStore.getState();
  expect(state.apCommands.throttle1).toBeGreaterThan(0);
  expect(state.effectiveControls.throttle1).toBe(state.apCommands.throttle1);
  expect(state.inputs).toBe(state.effectiveControls);
  expect(state.pilotInputs.throttle1).toBe(0);
  expect(state.aircraft.engines[0].n1).toBeGreaterThan(0);
});

it('manual throttle override disconnects AP and clears stale N1 Boeing flag', () => {
  const ap = minimalApState();
  ap.truth.autopilotStatus = 'CMD_A';
  ap.truth.thrustActive = 'N1';
  ap.boeing.autothrottleArm = true;
  ap.boeing.n1 = true;
  ap.boeing.speedMode = false;

  useSimStore.getState().setApState(ap);
  useSimStore.setState((s) => ({
    apCommands: { throttle1: 0.25, throttle2: 0.25 },
    effectiveControls: { ...s.pilotInputs, throttle1: 0.25, throttle2: 0.25 },
    inputs: { ...s.pilotInputs, throttle1: 0.25, throttle2: 0.25 },
  }));

  useSimStore.getState().setInput({ throttle1: 0.7, throttle2: 0.7 });

  const state = useSimStore.getState();
  expect(state.apState?.truth.thrustActive).toBe('OFF');
  expect(state.apState?.truth.autopilotStatus).toBe('OFF');
  expect(state.apState?.boeing.n1).toBe(false);
  expect(state.apState?.boeing.speedMode).toBe(false);
  expect(state.apCommands).toEqual({});
});
```

**Step 2: Verify RED**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/__tests__/simulationStep.test.ts src/store/__tests__/simStore.test.ts
```

Expected: FAIL before Task 1 implementation. After Tasks 1-2, the first two tests may be green already; the manual-disconnect regression should still fail until `disconnectAutopilot()` clears `boeing.n1`.

**Step 3: Implement minimal code**

No production code should be needed for the first two tests if Tasks 1-2 were correct; they are intentional integration regressions. For the manual-disconnect regression, update `disconnectAutopilot()` in `src/store/simStore.ts` to clear `boeing.n1: false` alongside `boeing.speedMode: false` if it currently fails. If the simulation-step/store N1 tests fail because `advanceSimulationStep()`/store do not pass `targetN1Percent`, fix the missing wiring in `autopilot.ts` / `simulationStep.ts` rather than duplicating logic in the store.

**Step 4: Verify GREEN**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/__tests__/simulationStep.test.ts src/store/__tests__/simStore.test.ts src/sim/systems/__tests__/autopilot.test.ts
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx tsc -b --pretty false
```

**Step 5: Commit**

```bash
git add src/sim/__tests__/simulationStep.test.ts src/store/__tests__/simStore.test.ts src/store/simStore.ts src/sim/systems/autopilot.ts src/sim/simulationStep.ts
git -c commit.gpgsign=false commit -m "test: prove n1 autothrottle integration"
```

---

## Task 4: Update docs and roadmap current status

**Objective:** Current docs should no longer list N1 autothrottle behavior as pending.

**Files:**
- Modify: `docs/roadmap.md`
- Modify: `docs/architecture.md`
- Modify: `docs/plans/README.md`
- Modify: `docs/plans/2026-05-27-rfs-n1-autothrottle.md`

**Required updates:**
- `docs/roadmap.md`
  - Add N1 autothrottle to the completed baseline/guidance list.
  - Add this plan to completion records.
  - Remove the previous roadmap claim that N1 thrust mode was remaining P2 scope.
  - Keep RFMS route edits/route modification UI and RFMS FMA lifecycle integration as remaining P2 scope.
  - Update P2 rationale to mention SPEED and conservative N1 thrust modes are in place, while full RFMS/FMA lifecycle remains.
- `docs/architecture.md`
  - Update avionics/guidance architecture to say AP thrust modes include SPEED hold and conservative N1 target mode, both rate-limited through AP-owned throttle commands.
  - Mention `RfsMCP` exposes SPD and N1 thrust buttons because both command laws exist.
- `docs/plans/README.md`
  - Add this plan as a completed/current status record for N1 autothrottle.
- This plan file
  - Add a `## Status` section near the top after tech stack after implementation is complete.
  - Include commit-message bullets; no pre-commit impossible SHA requirement.
  - Current behavior should state: N1 mode uses a conservative phase-based target N1, respects autothrottle arm, rate-limits symmetric throttle commands, and is wired through MCP/FMA/simulation/store.

**Verification searches:**

Search current roadmap, architecture, plan index, and this status record for stale wording that still treats N1 thrust mode as pending. Current-state docs must not contradict completed N1 support. Historical plan text may remain only when clearly marked historical.

Current roadmap/architecture/plan index must not contradict N1 support. Historical plan text may remain if clearly historical.

**Commit:**

```bash
git add docs/roadmap.md docs/architecture.md docs/plans/README.md docs/plans/2026-05-27-rfs-n1-autothrottle.md
git -c commit.gpgsign=false commit -m "docs: document n1 autothrottle"
```

---

## Final verification

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check && npm run test:visual
git status --short
```

Then push to `master`, wait for the real GitHub Actions run to finish with `completed success`, and verify live site:

```bash
git push origin master
gh run list --repo Reedtrullz/ReedFS --branch master --limit 5 --json databaseId,headSha,status,conclusion,workflowName,createdAt,url
gh run watch <run-id> --repo Reedtrullz/ReedFS --exit-status
gh run list --repo Reedtrullz/ReedFS --branch master --limit 1 --json databaseId,headSha,status,conclusion,workflowName,url
curl -fsSI https://fly.reidar.tech/
```

Do not report deployment success until CI is completed/success and the live endpoint returns HTTP 200.
