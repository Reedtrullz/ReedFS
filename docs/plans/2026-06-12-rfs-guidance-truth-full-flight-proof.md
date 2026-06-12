# RFS Guidance Truth and Full-Flight Proof Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task. Use `[PARENT-DIRECT]` tasks directly in the parent session; do not delegate those cross-cutting runtime-heartbeat edits.

**Goal:** Make the next autonomous RFS slice prove honest AP/FMA route guidance and a full ENVA takeoff-to-clean-climb browser loop, without mixing new work into the already-dirty FDM migration batch.

**Architecture:** This plan keeps the runtime heartbeat (`App.tsx -> useSimLoop -> simStore.tick() -> simulationStep -> autopilot/navigation/FMA -> integrate`) explicit. Route-status-to-`NavOutput` conversion becomes one shared helper used by both AP command resolution and FMA display, so the UI and servo laws cannot silently diverge. Guidance/checklist state becomes phase-aware, and Playwright gets a deterministic store-driven flight helper that exercises the real app shell without relying on fragile screenshot-only evidence.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Zustand 5, Vitest 4, Playwright 1.60, CesiumJS/Three.js, RFMS shared AP/FMC types.

---

## Source-of-truth context

Read these before starting implementation:

- `docs/architecture.md` — current runtime heartbeat and not-implemented gaps.
- `docs/reviews/2026-06-12-comprehensive-remaining-work-review.md` — audit evidence and P0 priorities.
- `docs/roadmap.md` — broader phase ordering.
- `docs/plans/README.md` — plan directory conventions.
- `playwright.config.ts` — local visual-test server reuse pitfall.

Current precondition from the audit: the tree already contains a dirty FDM/system/doc batch. Do not stage or commit unrelated dirty files while implementing this plan.

## Architecture audit and risk notes

Runtime heartbeat traced from `docs/architecture.md:20-41`:

```text
src/App.tsx
  -> src/hooks/useSimLoop.ts
    -> src/store/simStore.ts tick()
      -> src/sim/simulationStep.ts advanceSimulationStep()
        -> computeRouteStatus()
        -> computeAutopilotCommandsForState()
        -> composeEffectiveControls()
        -> integrate()
      -> rebuild GuidanceState
      -> commit Zustand snapshot
```

Risky files in this plan:

- `src/sim/systems/navigation.ts` — route status and helper source for AP/FMA.
- `src/sim/systems/autopilot.ts` — AP target resolution and command laws.
- `src/sim/simulationStep.ts` — runtime heartbeat boundary; task is `[PARENT-DIRECT]`.
- `src/sim/systems/fmaTruth.ts` — user-facing FMA truth; must not display unsupported modes as active.
- `src/sim/guidanceState.ts` and `src/sim/checklistCoach.ts` — player-facing tutorial/checklist truth.
- `e2e/**` — browser runtime boundary; use Playwright, not Vitest.

Silent-degradation risk: if AP and FMA compute route-derived VNAV/LNAV independently, tests can pass while the player sees one thing and the servo law flies another. The plan fixes that by sharing `routeStatusToNavOutput()` and verifying AP/FMA targeted tests after every route-truth edit.

## Dependency map

```text
Task 1: parent-direct preflight; no code.
Tasks 2-4: AP/FMA/navigation route truth; must serialize.
Task 5: FMA unsupported-mode guard; after Task 3, can run before/after Task 4 if needed.
Tasks 6-9: guidance/checklist/tutorial phase truth; must serialize.
Tasks 10-11: Playwright browser proof; after Tasks 6-9.
Task 12: docs source-of-truth cleanup; after behavior tasks.
Tasks 13-14: closeout gates; final only.
```

---

### Task 1 [PARENT-DIRECT]: Freeze the current dirty baseline before new implementation

**Objective:** Prevent this plan from accidentally committing or overwriting the existing 20-file FDM/system dirty batch.

**Files:**
- Inspect only: full repo status and diff
- Do not modify files in this task

**Step 1: Capture current status**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
git status --short
git diff --stat
```

Expected: shows the known dirty batch plus this plan file if it is uncommitted. Do not proceed if unexpected secret/env files appear.

**Step 2: Decide isolation mode**

Use one of these two safe modes:

```bash
# Preferred if the existing dirty batch is intentional and ready:
git diff --stat
npm run check
npm run test:visual
# then commit that batch separately after owner review

# Preferred if this plan must be implemented before closing the dirty batch:
git stash push --include-untracked --message "pre-plan dirty RFS FDM/system batch"
git status --short
```

Expected: either the dirty batch is deliberately committed first, or `git status --short` is clean before Task 2 begins.

**Step 3: Commit**

No commit for this task unless the owner explicitly approves closing the pre-existing dirty batch.

---

### Task 2: Export a shared `routeStatusToNavOutput` helper

**Objective:** Make route-status to `NavOutput` conversion a single tested helper in `navigation.ts` instead of duplicating route-derived navigation logic in AP/FMA code.

**Files:**
- Modify: `src/sim/systems/navigation.ts:13-19,288-412`
- Test: `src/sim/systems/__tests__/navigation.test.ts`

**Step 1: Write failing tests**

Append this describe block to `src/sim/systems/__tests__/navigation.test.ts` and update imports to include `createNoRouteStatus`, `routeStatusToNavOutput`, and `type RouteStatusSnapshot` from `../navigation` if they are not already imported.

```typescript
function routeStatusForNavOutput(overrides: Partial<RouteStatusSnapshot> = {}): RouteStatusSnapshot {
  return {
    ...createNoRouteStatus(),
    routeName: 'KSEA→KPDX',
    routeValid: true,
    lnavAvailable: true,
    lnavUnavailableReason: null,
    activeLegIndex: 0,
    activeLegCount: 1,
    fromWaypointIndex: 0,
    toWaypointIndex: 1,
    fromIdent: 'KSEA',
    nextWaypointIdent: 'OLM',
    distanceToNextM: 18_520,
    distanceToNextNm: 10,
    desiredTrackRad: Math.PI / 2,
    desiredTrackDegTrue: 90,
    crossTrackErrorM: 926,
    alongTrackM: 4_000,
    legLengthM: 18_520,
    waypointReached: false,
    sequenced: false,
    ...overrides,
  };
}

describe('routeStatusToNavOutput', () => {
  it('converts an available route status into VNAV/LNAV NavOutput using remaining distance', () => {
    const nav = routeStatusToNavOutput(routeStatusForNavOutput());

    expect(nav).toEqual({
      crossTrackError: 926,
      alongTrackDist: 18_520,
      desiredTrack: Math.PI / 2,
      activeWaypointIndex: 1,
      waypointReached: false,
    });
  });

  it('can apply the LNAV intercept correction used by AP heading targets', () => {
    const nav = routeStatusToNavOutput(routeStatusForNavOutput(), { maxInterceptDeg: 25 });

    expect(nav).not.toBeNull();
    expect(nav!.desiredTrack * 180 / Math.PI).toBeCloseTo(77.5, 5);
  });

  it('returns null for unavailable or under-specified route status', () => {
    expect(routeStatusToNavOutput(createNoRouteStatus())).toBeNull();
    expect(routeStatusToNavOutput(routeStatusForNavOutput({ desiredTrackRad: null }))).toBeNull();
    expect(routeStatusToNavOutput(routeStatusForNavOutput({ toWaypointIndex: null, activeLegIndex: null }))).toBeNull();
  });
});
```

**Step 2: Run test to verify failure**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npx vitest run src/sim/systems/__tests__/navigation.test.ts -t routeStatusToNavOutput
```

Expected: FAIL — `routeStatusToNavOutput` is not exported.

**Step 3: Write minimal implementation**

Add this helper near `createNoRouteStatus()` in `src/sim/systems/navigation.ts`.

```typescript
export interface RouteStatusToNavOutputOptions {
  maxInterceptDeg?: number;
}

export function routeStatusToNavOutput(
  routeStatus: RouteStatusSnapshot | null | undefined,
  options: RouteStatusToNavOutputOptions = {},
): NavOutput | null {
  if (!routeStatus?.lnavAvailable || routeStatus.desiredTrackRad === null) return null;

  const activeWaypointIndex = routeStatus.toWaypointIndex ?? routeStatus.activeLegIndex;
  if (activeWaypointIndex === null || !Number.isFinite(activeWaypointIndex)) return null;

  const crossTrackError = routeStatus.crossTrackErrorM ?? 0;
  const maxInterceptRad = Math.max(0, options.maxInterceptDeg ?? 0) * Math.PI / 180;
  const interceptCorrectionRad = maxInterceptRad > 0
    ? clamp(crossTrackError / M_PER_NM, -1, 1) * maxInterceptRad
    : 0;

  return {
    crossTrackError,
    // NavOutput.alongTrackDist is consumed by VNAV as distance remaining to the active constraint.
    // Do not prefer RouteStatusSnapshot.alongTrackM here; that field is progress from leg start.
    alongTrackDist: routeStatus.distanceToNextM ?? routeStatus.alongTrackM ?? 0,
    desiredTrack: normalizeRad(routeStatus.desiredTrackRad - interceptCorrectionRad),
    activeWaypointIndex,
    waypointReached: routeStatus.waypointReached,
  };
}
```

Also add this private helper near the other small math helpers if `navigation.ts` does not already have a generic clamp:

```typescript
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
```

**Step 4: Run test to verify pass**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npx vitest run src/sim/systems/__tests__/navigation.test.ts -t routeStatusToNavOutput
```

Expected: PASS — 3 tests for `routeStatusToNavOutput`.

**Step 5: Commit**

```bash
git add src/sim/systems/navigation.ts src/sim/systems/__tests__/navigation.test.ts
git commit -m "feat: share route status nav output conversion"
```

---

### Task 3: Use shared route output in FMA truth

**Objective:** Remove the private FMA-only route-status conversion and make FMA VNAV use the shared helper from Task 2.

**Files:**
- Modify: `src/sim/systems/fmaTruth.ts:10-103`
- Test: `src/sim/systems/__tests__/fmaTruth.test.ts`

**Step 1: Write failing guard test**

Add this test to `src/sim/systems/__tests__/fmaTruth.test.ts`.

```typescript
it('uses route-status distance fallback when along-track distance is unavailable', () => {
  const aircraft = aircraftAtRoute();
  const flightPlan = constrainedRoute();
  const routeStatus = computeRouteStatus(aircraft, flightPlan, 0);
  const fallbackOnlyRouteStatus = {
    ...routeStatus,
    alongTrackM: null,
    distanceToNextM: 18_520,
  };

  const fma = deriveDisplayFmaTruth(apState(), {
    aircraft,
    flightPlan,
    routeStatus: fallbackOnlyRouteStatus,
  });

  expect(fma.verticalActive).toBe('VNAV_PTH');
});
```

**Step 2: Run test to verify current behavior before refactor**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npx vitest run src/sim/systems/__tests__/fmaTruth.test.ts -t "distance fallback"
```

Expected: PASS or FAIL is acceptable here. If it passes, keep it as a regression guard before refactoring.

**Step 3: Replace private helper with shared import**

In `src/sim/systems/fmaTruth.ts`, replace the navigation import with:

```typescript
import { routeStatusToNavOutput, type RouteStatusSnapshot } from './navigation';
```

Delete the private `navOutputFromRouteStatus()` function and change `deriveVnavMode()` to:

```typescript
function deriveVnavMode(
  ap: AutopilotState,
  context: FmaTruthContext,
): VerticalMode {
  if (!ap.boeing.vnav) return 'OFF';
  const aircraft = context.aircraft;
  const flightPlan = context.flightPlan;
  const routeStatus = context.routeStatus;
  if (!aircraft || !flightPlan || !routeStatus?.lnavAvailable) return 'OFF';
  const nav = routeStatusToNavOutput(routeStatus);
  if (!nav) return 'OFF';
  const vnav = computeVNAV(aircraft, flightPlan, nav);
  return vnav.available && vnav.verticalMode ? vnav.verticalMode : 'OFF';
}
```

**Step 4: Run targeted tests and private-helper grep**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npx vitest run src/sim/systems/__tests__/fmaTruth.test.ts
grep -R "function navOutputFromRouteStatus" -n src/sim/systems || true
```

Expected: FMA tests PASS. Grep prints no matches.

**Step 5: Commit**

```bash
git add src/sim/systems/fmaTruth.ts src/sim/systems/__tests__/fmaTruth.test.ts
git commit -m "refactor: use shared route nav output for FMA truth"
```

---

### Task 4 [PARENT-DIRECT]: Feed precomputed route status into AP target resolution

**Objective:** Make AP command target resolution use the same pre-integration route status that `simulationStep` stores and FMA can display.

**Files:**
- Modify: `src/sim/systems/autopilot.ts:102-180,314-323`
- Modify: `src/sim/simulationStep.ts:83-97`
- Test: `src/sim/systems/__tests__/autopilot.test.ts`
- Test: `src/sim/__tests__/simulationStep.test.ts`

**Step 1: Write failing target-resolution test**

Add this test to `src/sim/systems/__tests__/autopilot.test.ts`; import `createNoRouteStatus` and `type RouteStatusSnapshot` from `../navigation` if needed.

```typescript
it('resolves LNAV heading from provided route status with AP intercept correction', () => {
  const aircraft = createInitialState(B737_800_SPEC);
  aircraft.attitude.psi = 0;
  const ap = makeAutopilotState({ lateralActive: 'LNAV', verticalActive: 'ALT_HOLD' });
  ap.boeing.lnav = true;
  ap.boeing.hdgSel = false;

  const routeStatus: RouteStatusSnapshot = {
    ...createNoRouteStatus(),
    routeName: 'KSEA→KPDX',
    routeValid: true,
    lnavAvailable: true,
    lnavUnavailableReason: null,
    activeLegIndex: 0,
    activeLegCount: 1,
    fromWaypointIndex: 0,
    toWaypointIndex: 1,
    fromIdent: 'KSEA',
    nextWaypointIdent: 'OLM',
    distanceToNextM: 18_520,
    distanceToNextNm: 10,
    desiredTrackRad: Math.PI / 2,
    desiredTrackDegTrue: 90,
    crossTrackErrorM: 1_852,
    alongTrackM: 5_000,
    legLengthM: 18_520,
    waypointReached: false,
    sequenced: false,
  };

  const targets = resolveAutopilotTargets(aircraft, ap, null, null, routeStatus);

  expect(targets.targetHeadingRad * 180 / Math.PI).toBeCloseTo(65, 5);
});
```

If `makeAutopilotState()` in the current test file has a different helper name, use that helper rather than creating another AP factory.

**Step 2: Run test to verify failure**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npx vitest run src/sim/systems/__tests__/autopilot.test.ts -t "provided route status"
```

Expected: FAIL — `resolveAutopilotTargets` does not accept a route-status argument yet, or target heading remains unmodified.

**Step 3: Update AP resolver implementation**

In `src/sim/systems/autopilot.ts`, change the navigation import to include the shared helper and route-status type:

```typescript
import { computeRouteStatus, routeStatusToNavOutput, type NavOutput, type RouteStatusSnapshot } from './navigation';
```

Change `resolveAutopilotTargets()` signature to:

```typescript
export function resolveAutopilotTargets(
  state: AircraftState,
  ap: AutopilotState,
  flightPlan?: FlightPlan | null,
  activeLegIndex?: number | null,
  routeStatusOverride?: RouteStatusSnapshot | null,
): Targets {
```

Replace the internal `nav()` function with:

```typescript
  const nav = (): NavOutput | null => {
    if (navCache !== undefined) return navCache;

    if (routeStatusOverride) {
      navCache = routeStatusToNavOutput(routeStatusOverride, { maxInterceptDeg: 25 });
      return navCache;
    }

    const idx = typeof activeLegIndex === 'number' && Number.isFinite(activeLegIndex) && activeLegIndex >= 0 ? activeLegIndex : null;
    if (!flightPlan || idx === null) {
      navCache = null;
      return null;
    }

    navCache = routeStatusToNavOutput(computeRouteStatus(state, flightPlan, idx), { maxInterceptDeg: 25 });
    return navCache;
  };
```

Then remove the existing `&& flightPlan` guard from the LNAV branch. A provided `routeStatusOverride` is already sufficient route guidance for target-heading resolution:

```typescript
  if (ap.truth.lateralActive === 'LNAV') {
    const n = nav();
    if (n) hdg = n.desiredTrack;
  }
```

Change `computeAutopilotCommandsForState()` signature and target call to:

```typescript
export function computeAutopilotCommandsForState(
  state: AircraftState,
  ap: AutopilotState | null | undefined,
  flightPlan: FlightPlan | null | undefined,
  dt: number,
  activeLegIndex?: number | null,
  routeStatus?: RouteStatusSnapshot | null,
): AutopilotCommands {
  if (!ap || !isAutopilotEngaged(ap)) return {};
  const tgts = resolveAutopilotTargets(state, ap, flightPlan, activeLegIndex, routeStatus);
  return computeAutopilotCommands(state, ap, tgts.targetHeadingRad, tgts.targetAltFt, tgts.targetSpeedKt, dt, tgts.targetVerticalSpeedFpm, tgts.targetN1Percent);
}
```

In `src/sim/simulationStep.ts`, pass `routeBeforeTick` into AP command resolution:

```typescript
  const apCommands = apActive
    ? computeAutopilotCommandsForState(
      state,
      input.apState,
      input.flightPlan,
      input.dt,
      routeBeforeTick.activeLegIndex,
      routeBeforeTick,
    )
    : {};
```

**Step 4: Run targeted AP/step tests**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npx vitest run src/sim/systems/__tests__/autopilot.test.ts src/sim/__tests__/simulationStep.test.ts
```

Expected: PASS.

**Step 5: Import-chain safety check**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npm run typecheck
```

Expected: PASS. This is required because Task 4 touches the runtime heartbeat import chain.

**Step 6: Commit**

```bash
git add src/sim/systems/autopilot.ts src/sim/systems/__tests__/autopilot.test.ts src/sim/simulationStep.ts src/sim/__tests__/simulationStep.test.ts
git commit -m "fix: share route status between AP target resolution and FMA"
```

---

### Task 5: Downgrade unsupported raw AP/FMA modes to OFF

**Objective:** Ensure FMA never displays unsupported or foreign/autopilot-family modes as active unless RFS has a backed control law for them.

**Files:**
- Modify: `src/sim/systems/fmaTruth.ts:59-112`
- Test: `src/sim/systems/__tests__/fmaTruth.test.ts`

**Step 1: Write failing test**

Add this test to `src/sim/systems/__tests__/fmaTruth.test.ts`.

```typescript
it('downgrades unsupported raw modes instead of displaying unflown guidance', () => {
  const raw = apState();
  raw.truth.thrustActive = 'THR_CLB';
  raw.truth.lateralActive = 'NAV';
  raw.truth.verticalActive = 'CLB';

  const fma = deriveDisplayFmaTruth(raw, { routeStatus: createNoRouteStatus() });

  expect(fma.thrustActive).toBe('OFF');
  expect(fma.lateralActive).toBe('OFF');
  expect(fma.verticalActive).toBe('OFF');
});
```

These literals exist in the current RFMS shared types, but RFS does not fly them yet. Do not replace them with invented modes such as `THR_REF`, `ROLLOUT`, or `FLARE`; those are not currently part of the shared union types.

**Step 2: Run test to verify failure**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npx vitest run src/sim/systems/__tests__/fmaTruth.test.ts -t "unsupported raw modes"
```

Expected: FAIL — unsupported raw mode leaks through, or TypeScript exposes the actual enum names that need testing.

**Step 3: Implement conservative fallbacks**

In `src/sim/systems/fmaTruth.ts`, change the default returns in `deriveThrustMode()`, `deriveLateralMode()`, and `deriveVerticalMode()` to `OFF`:

```typescript
function deriveThrustMode(ap: AutopilotState): ThrustMode {
  if (!ap.boeing.autothrottleArm) return 'OFF';
  if (ap.truth.thrustActive === 'SPEED') return ap.boeing.speedMode ? 'SPEED' : 'OFF';
  if (ap.truth.thrustActive === 'N1') return ap.boeing.n1 ? 'N1' : 'OFF';
  return 'OFF';
}
```

```typescript
function deriveLateralMode(ap: AutopilotState, routeStatus: RouteStatusSnapshot | null | undefined): LateralMode {
  if (ap.truth.lateralActive === 'HDG_SEL') return ap.boeing.hdgSel ? 'HDG_SEL' : 'OFF';
  if (ap.truth.lateralActive === 'LNAV') {
    return ap.boeing.lnav && routeStatus?.lnavAvailable ? 'LNAV' : 'OFF';
  }
  if (ap.truth.lateralActive === 'VOR_LOC') return ap.boeing.vorLoc ? 'VOR_LOC' : 'OFF';
  if (ap.truth.lateralActive === 'APP' || ap.truth.lateralActive === 'LOC') return ap.boeing.app ? ap.truth.lateralActive : 'OFF';
  return 'OFF';
}
```

```typescript
function deriveVerticalMode(ap: AutopilotState, context: FmaTruthContext): VerticalMode {
  if (ap.truth.verticalActive === 'ALT_HOLD') return ap.boeing.altHold ? 'ALT_HOLD' : 'OFF';
  if (ap.truth.verticalActive === 'VS') return ap.boeing.vs ? 'VS' : 'OFF';
  if (VNAV_FAMILY.has(ap.truth.verticalActive)) return deriveVnavMode(ap, context);
  if (ap.truth.verticalActive === 'LVL_CHG') return ap.boeing.lvlChg ? 'LVL_CHG' : 'OFF';
  if (ap.truth.verticalActive === 'G_S') return ap.boeing.app ? 'G_S' : 'OFF';
  return 'OFF';
}
```

**Step 4: Run FMA tests**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npx vitest run src/sim/systems/__tests__/fmaTruth.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/sim/systems/fmaTruth.ts src/sim/systems/__tests__/fmaTruth.test.ts
git commit -m "fix: hide unsupported FMA modes"
```

---

### Task 6: Add phase-specific checklist regression tests

**Objective:** Capture the dogfood bug where the takeoff checklist still says “Gear down” after the aircraft is airborne and cleaned up.

**Files:**
- Test: `src/sim/__tests__/guidanceState.test.ts`

**Step 1: Write failing tests**

Add these tests to `src/sim/__tests__/guidanceState.test.ts`.

```typescript
it('shows positive-rate cleanup instead of pre-takeoff gear-down checklist once airborne', () => {
  const aircraft = scenarioAircraft();
  aircraft.flightPhase = 'CLIMB';
  aircraft.ground.weightOnWheels = false;
  aircraft.ground.aglFt = 75;
  aircraft.position.alt += 75;
  aircraft.config.gearDown = true;

  const guidance = buildGuidanceState({
    scenario: KSEA_TUTORIAL_SCENARIO,
    status: 'running',
    aircraft,
    controls: { ...configuredInputs, throttle1: 1, throttle2: 1, gearLever: 'DOWN' },
  });

  expect(guidance.phase).toBe('positive-rate');
  expect(guidance.checklist.map((item) => item.label)).toContain('Gear up after positive rate');
  expect(guidance.checklist.map((item) => item.label)).not.toContain('Gear down');
});

it('shows climb cleanup complete after gear retraction', () => {
  const aircraft = scenarioAircraft();
  aircraft.flightPhase = 'CLIMB';
  aircraft.ground.weightOnWheels = false;
  aircraft.ground.aglFt = 400;
  aircraft.position.alt += 400;
  aircraft.config.gearDown = false;

  const guidance = buildGuidanceState({
    scenario: KSEA_TUTORIAL_SCENARIO,
    status: 'running',
    aircraft,
    controls: { ...configuredInputs, throttle1: 1, throttle2: 1, gearLever: 'UP' },
  });

  expect(guidance.phase).toBe('climb');
  expect(guidance.checklist).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: 'gear-up', label: 'Gear up', complete: true }),
    expect.objectContaining({ id: 'positive-rate', label: 'Positive rate established', complete: true }),
  ]));
  expect(guidance.checklist.map((item) => item.label)).not.toContain('Gear down');
});
```

**Step 2: Run tests to verify failure**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npx vitest run src/sim/__tests__/guidanceState.test.ts -t "positive-rate|climb cleanup"
```

Expected: FAIL — current checklist remains `buildTakeoffChecklist()` for all phases.

**Step 3: Commit**

Do not commit failing tests alone unless using a deliberate RED commit convention. If using RED commits:

```bash
git add src/sim/__tests__/guidanceState.test.ts
git commit -m "test: capture phase-specific climb checklist"
```

Otherwise continue to Task 7 before committing.

---

### Task 7: Implement phase-specific guidance checklists

**Objective:** Replace all-phase takeoff checklist output with phase-aware checklist content.

**Files:**
- Modify: `src/sim/checklistCoach.ts:16-83`
- Modify: `src/sim/guidanceState.ts:1-91`
- Test: `src/sim/__tests__/guidanceState.test.ts`

**Step 1: Add implementation in `checklistCoach.ts`**

Keep `buildTakeoffChecklist()` exported for existing tests. Add this local phase union near the top of `src/sim/checklistCoach.ts`. Keep it local to avoid a `guidanceState.ts -> checklistCoach.ts -> guidanceState.ts` source cycle.

```typescript
type GuidanceChecklistPhase = 'preflight' | 'takeoff-roll' | 'rotation' | 'rejected-takeoff' | 'positive-rate' | 'climb';
```

Then add:

```typescript
export function buildGuidanceChecklist(
  scenario: FlightScenario,
  aircraft: AircraftState,
  controls: ControlInputs,
  phase: GuidanceChecklistPhase,
): ChecklistItem[] {
  if (phase === 'positive-rate') {
    return [
      {
        id: 'positive-rate',
        label: 'Positive rate established',
        complete: !aircraft.ground.weightOnWheels && aircraft.ground.aglFt > 10,
        detail: 'Confirm climb before retracting gear',
      },
      {
        id: 'gear-up-after-positive-rate',
        label: 'Gear up after positive rate',
        complete: controls.gearLever === 'UP' && !aircraft.config.gearDown,
        detail: 'Select gear UP after positive rate',
      },
    ];
  }

  if (phase === 'climb') {
    return [
      {
        id: 'positive-rate',
        label: 'Positive rate established',
        complete: !aircraft.ground.weightOnWheels && aircraft.ground.aglFt > 10,
        detail: 'Maintain stable climb',
      },
      {
        id: 'gear-up',
        label: 'Gear up',
        complete: controls.gearLever === 'UP' && !aircraft.config.gearDown,
        detail: 'Gear should be up in initial climb',
      },
      {
        id: 'flaps-takeoff',
        label: 'Takeoff flaps still set',
        complete: nearlyEqual(aircraft.config.flapSetting, scenario.flapSetting),
        detail: `Keep flaps ${scenario.flapSetting} until cleanup altitude`,
      },
    ];
  }

  return buildTakeoffChecklist(scenario, aircraft, controls);
}
```

**Step 2: Wire `guidanceState.ts`**

Change the checklist import:

```typescript
import { buildGuidanceChecklist, coachMessageForState, type ChecklistItem } from './checklistCoach';
```

Change `buildGuidanceState()` to compute phase once and pass it to the checklist builder:

```typescript
  const phase = deriveGuidancePhase(status, aircraft, controls);

  return {
    scenarioId: scenario.id,
    phase,
    tutorial,
    activeTutorialStep: currentTutorialStep(tutorial),
    checklist: buildGuidanceChecklist(scenario, aircraft, controls, phase),
    coachMessage: coachMessageForState(status, aircraft, controls, scenario),
    alerts: [],
  };
```

**Step 3: Run guidance tests**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npx vitest run src/sim/__tests__/guidanceState.test.ts src/sim/__tests__/checklistCoach.test.ts
```

Expected: PASS.

**Step 4: Commit**

```bash
git add src/sim/checklistCoach.ts src/sim/guidanceState.ts src/sim/__tests__/guidanceState.test.ts src/sim/__tests__/checklistCoach.test.ts
git commit -m "fix: make climb checklist phase aware"
```

---

### Task 8: Add tutorial auto-step regression tests

**Objective:** Ensure the active tutorial step follows the actual flight phase when no explicit user-selected tutorial step is present.

**Files:**
- Test: `src/sim/__tests__/guidanceState.test.ts`

**Step 1: Write failing tests**

Add this test to `src/sim/__tests__/guidanceState.test.ts`.

```typescript
it('auto-selects the tutorial step that matches the derived flight phase', () => {
  const rollingAircraft = scenarioAircraft();
  rollingAircraft.flightPhase = 'TAKEOFF';
  rollingAircraft.velocity.u = 30;

  expect(buildGuidanceState({
    scenario: KSEA_TUTORIAL_SCENARIO,
    status: 'running',
    aircraft: rollingAircraft,
    controls: { ...configuredInputs, throttle1: 1, throttle2: 1 },
  }).activeTutorialStep?.id).toBe('advance-thrust');

  const climbAircraft = structuredClone(rollingAircraft);
  climbAircraft.flightPhase = 'CLIMB';
  climbAircraft.ground.weightOnWheels = false;
  climbAircraft.ground.aglFt = 400;
  climbAircraft.position.alt += 400;
  climbAircraft.config.gearDown = false;

  expect(buildGuidanceState({
    scenario: KSEA_TUTORIAL_SCENARIO,
    status: 'running',
    aircraft: climbAircraft,
    controls: { ...configuredInputs, throttle1: 1, throttle2: 1, gearLever: 'UP' },
  }).activeTutorialStep?.id).toBe('rotate-positive-rate');
});
```

**Step 2: Run test to verify failure**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npx vitest run src/sim/__tests__/guidanceState.test.ts -t "auto-selects"
```

Expected: FAIL — default `tutorialStepIndex = 0` keeps `line-up` active.

**Step 3: Commit**

Do not commit failing tests alone unless using RED commits. Otherwise continue to Task 9.

---

### Task 9: Implement phase-to-tutorial auto-selection

**Objective:** Auto-select the scenario tutorial step matching the derived guidance phase unless the caller explicitly passes `tutorialStepIndex`.

**Files:**
- Modify: `src/sim/guidanceState.ts:70-91`
- Test: `src/sim/__tests__/guidanceState.test.ts`

**Step 1: Add helper in `guidanceState.ts`**

Add this helper above `buildGuidanceState()`:

```typescript
function tutorialStepIndexForPhase(scenario: FlightScenario, phase: GuidancePhase): number {
  const preferredStepId = (() => {
    switch (phase) {
      case 'preflight':
        return 'line-up';
      case 'takeoff-roll':
      case 'rotation':
      case 'rejected-takeoff':
        return 'advance-thrust';
      case 'positive-rate':
      case 'climb':
        return 'rotate-positive-rate';
      default:
        return 'line-up';
    }
  })();

  const index = scenario.tutorialSteps.findIndex((step) => step.id === preferredStepId);
  return index >= 0 ? index : 0;
}
```

Change the `GuidanceStateInput` interface to make explicit overrides distinguishable from omitted values:

```typescript
  tutorialStepIndex?: number;
```

Change `buildGuidanceState()` to derive phase first and choose the index like this:

```typescript
  const phase = deriveGuidancePhase(status, aircraft, controls);
  const baseTutorial = createTutorialState(scenario);
  const requestedTutorialStepIndex = tutorialStepIndex ?? tutorialStepIndexForPhase(scenario, phase);
  const tutorial: TutorialState = {
    ...baseTutorial,
    stepIndex: clampTutorialStepIndex(baseTutorial, requestedTutorialStepIndex),
  };
```

Keep explicit caller overrides working: the existing clamp test that passes `tutorialStepIndex: 99` and `-10` must still pass.

Then update `rebuildGuidanceState()` so omitted tutorial indices auto-track the current runtime phase instead of preserving stale step 0 forever:

```typescript
export function rebuildGuidanceState(
  current: GuidanceState,
  input: Omit<GuidanceStateInput, 'tutorialStepIndex'> & { tutorialStepIndex?: number },
): GuidanceState {
  return buildGuidanceState({
    ...input,
    tutorialStepIndex: input.tutorialStepIndex,
  });
}
```

This keeps explicit `setTutorialStep(stepIndex)` overrides working because `syncGuidanceState()` passes a concrete `tutorialStepIndex` only from that user action. Runtime tick calls that omit the value will now recalculate from phase.

**Step 2: Run guidance tests**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npx vitest run src/sim/__tests__/guidanceState.test.ts src/sim/__tests__/tutorialState.test.ts
```

Expected: PASS.

**Step 3: Commit**

```bash
git add src/sim/guidanceState.ts src/sim/__tests__/guidanceState.test.ts
git commit -m "fix: advance tutorial step from flight phase"
```

---

### Task 10: Add deterministic Playwright flight helper

**Objective:** Give browser tests a reusable way to fly the actual store/runtime from START ROLL to clean climb without depending on manual key repeat timing or screenshot drift.

**Files:**
- Create: `e2e/helpers/rfsFlight.ts`
- Existing helper reference: `e2e/helpers/rfsPage.ts`

**Step 1: Create helper file**

Create `e2e/helpers/rfsFlight.ts` with this content:

```typescript
import type { Page } from '@playwright/test';

interface FlightSnapshot {
  iasKt: number;
  altitudeFt: number;
  aglFt: number;
  verticalSpeedFpm: number;
  weightOnWheels: boolean;
  gearDown: boolean;
  gearLever: 'UP' | 'DOWN';
  phase: string;
  coachMessage: string;
  checklistLabels: string[];
}

async function currentRafTimestamp(page: Page): Promise<number> {
  return page.evaluate(() => performance.now());
}

async function advanceTicks(page: Page, ticks: number, startTimestampMs: number): Promise<number> {
  return page.evaluate(async ({ count, start }) => {
    const { useSimStore } = await import('/src/store/simStore.ts');
    let timestamp = start;
    useSimStore.setState({ lastFrameTime: timestamp, fixedStepAccumulatorSeconds: 0 });
    for (let i = 0; i < count; i += 1) {
      timestamp += 1000 / 60;
      useSimStore.getState().tick(timestamp);
    }
    return timestamp;
  }, { count: ticks, start: startTimestampMs });
}

export async function setManualTakeoffConfiguration(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const { useSimStore } = await import('/src/store/simStore.ts');
    const store = useSimStore.getState();
    store.setInput({ flapLever: 5, throttle1: 1, throttle2: 1, gearLever: 'DOWN', elevator: 0 });
    for (let i = 0; i < 50; i += 1) {
      useSimStore.getState().applyInputActions({ trimDelta: 0.1 }, 1 / 60);
    }
  });
}

export async function flyEnvaTakeoffToCleanClimb(page: Page): Promise<FlightSnapshot> {
  await setManualTakeoffConfiguration(page);
  let timestamp = await currentRafTimestamp(page);

  for (let batch = 0; batch < 180; batch += 1) {
    await page.evaluate(async () => {
      const { useSimStore } = await import('/src/store/simStore.ts');
      const { computeDerived } = await import('/src/sim/physics/derived.ts');
      const state = useSimStore.getState();
      const aircraft = state.aircraft;
      const iasKt = computeDerived(aircraft, state.wind).ias;

      if (aircraft.ground.weightOnWheels && iasKt >= 135) {
        state.setInput({ elevator: -1 });
      } else if (!aircraft.ground.weightOnWheels) {
        state.setInput({ elevator: 0, gearLever: 'UP' });
      }
    });

    timestamp = await advanceTicks(page, 10, timestamp);

    const cleanClimb = await page.evaluate(async () => {
      const { useSimStore } = await import('/src/store/simStore.ts');
      const s = useSimStore.getState();
      return !s.aircraft.ground.weightOnWheels
        && !s.aircraft.config.gearDown
        && s.aircraft.ground.aglFt > 200
        && s.guidance.phase === 'climb';
    });

    if (cleanClimb) break;
  }

  return page.evaluate(async () => {
    const { useSimStore } = await import('/src/store/simStore.ts');
    const { computeDerived } = await import('/src/sim/physics/derived.ts');
    const s = useSimStore.getState();
    const aircraft = s.aircraft;
    const derived = computeDerived(aircraft, s.wind);
    return {
      iasKt: derived.ias,
      altitudeFt: aircraft.position.alt,
      aglFt: aircraft.ground.aglFt,
      verticalSpeedFpm: derived.vs,
      weightOnWheels: aircraft.ground.weightOnWheels,
      gearDown: aircraft.config.gearDown,
      gearLever: s.effectiveControls.gearLever,
      phase: s.guidance.phase,
      coachMessage: s.guidance.coachMessage,
      checklistLabels: s.guidance.checklist.map((item) => item.label),
    } satisfies FlightSnapshot;
  });
}
```

**Step 2: Run TypeScript check on the helper**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npx tsc --noEmit --target ES2022 --module ESNext --moduleResolution bundler --strict --skipLibCheck e2e/helpers/rfsFlight.ts
```

Expected: PASS. `npm run typecheck` does not cover `e2e/**` in the current `tsconfig.json`, so this explicit helper parse check is required until the repo adds an e2e tsconfig.

**Step 3: Commit**

```bash
git add e2e/helpers/rfsFlight.ts
git commit -m "test: add deterministic browser flight helper"
```

---

### Task 11: Add ENVA takeoff-to-clean-climb browser proof

**Objective:** Prove the default ENVA scenario can progress from START ROLL through positive rate, gear up, clean climb guidance, and phase-aware checklist in the actual browser app.

**Files:**
- Create: `e2e/rfs-flight.spec.ts`
- Test helper: `e2e/helpers/rfsFlight.ts`

**Step 1: Write Playwright test**

Create `e2e/rfs-flight.spec.ts` with this content:

```typescript
import { expect, test } from '@playwright/test';
import { openRfs, startRoll } from './helpers/rfsPage';
import { flyEnvaTakeoffToCleanClimb } from './helpers/rfsFlight';

test.describe('RFS playable flight loops', () => {
  test('ENVA tutorial reaches clean climb with phase-aware guidance', async ({ page }) => {
    await openRfs(page);
    await startRoll(page);

    const snapshot = await flyEnvaTakeoffToCleanClimb(page);

    expect(snapshot.weightOnWheels).toBe(false);
    expect(snapshot.gearDown).toBe(false);
    expect(snapshot.gearLever).toBe('UP');
    expect(snapshot.aglFt).toBeGreaterThan(200);
    expect(snapshot.iasKt).toBeGreaterThan(130);
    expect(snapshot.phase).toBe('climb');
    expect(snapshot.coachMessage).toMatch(/climb stable/i);
    expect(snapshot.checklistLabels).toContain('Gear up');
    expect(snapshot.checklistLabels).not.toContain('Gear down');
  });
});
```

**Step 2: Run test to verify behavior**

Before running, make sure Playwright owns the visual-test server; stale local Vite can false-fail browser tests.

Run:

```bash
if lsof -nP -iTCP:5173 -sTCP:LISTEN; then
  echo "Stop the stale dev server on :5173 before this Playwright run" >&2
  exit 1
fi
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
CI=1 npx playwright test e2e/rfs-flight.spec.ts
```

Expected: PASS. `CI=1` forces Playwright to own the dev server and prevents reuse of a stale local Vite server. If it fails on timing, tune only the helper loop batch count or tick count; do not weaken assertions about climb phase, gear-up, or checklist labels.

**Step 3: Commit**

```bash
git add e2e/rfs-flight.spec.ts e2e/helpers/rfsFlight.ts
git commit -m "test: prove ENVA takeoff reaches clean climb"
```

---

### Task 12: Update docs to point to current review and this plan

**Objective:** Reduce current-state documentation drift so future agents do not treat May plans as the latest truth.

**Files:**
- Modify: `docs/plans/README.md:5-20`
- Modify: `docs/roadmap.md:5-12,195-202`
- Modify: `docs/architecture.md:122-126,182-190` only if behavior from Tasks 2-11 changes the architecture truth

**Step 1: Patch `docs/plans/README.md` current references**

Update the current source-of-truth list to include:

```markdown
- `../reviews/2026-06-12-comprehensive-remaining-work-review.md` — latest comprehensive remaining-work audit and evidence ledger.
- `2026-06-12-rfs-guidance-truth-full-flight-proof.md` — current next-slice plan for AP/FMA route truth, phase-aware guidance, and ENVA full-flight browser proof.
```

Keep older May plans listed as completed/current status records, not latest comprehensive truth.

**Step 2: Patch `docs/roadmap.md` top section**

Replace the “Latest comprehensive...” block with a current list that includes the June review and this plan:

```markdown
Latest comprehensive remaining-work audit and next implementation plan:

- `docs/reviews/2026-06-12-comprehensive-remaining-work-review.md`
- `docs/plans/2026-06-12-rfs-guidance-truth-full-flight-proof.md`
```

If Tasks 6-11 are implemented, replace the stale “Immediate follow-ups from the 2026-05-26 dogfood” heading with a dated note that those May follow-ups are completed historical records and that the June next slice focuses on AP/FMA truth plus full-flight proof.

**Step 3: Run docs grep checks**

Run:

```bash
grep -R "2026-06-12-comprehensive-remaining-work-review" -n docs/plans/README.md docs/roadmap.md
grep -R "2026-06-12-rfs-guidance-truth-full-flight-proof" -n docs/plans/README.md docs/roadmap.md
```

Expected: both grep commands print matches in both docs files.

**Step 4: Commit**

```bash
git add docs/plans/README.md docs/roadmap.md docs/architecture.md
git commit -m "docs: update RFS current plan references"
```

If `docs/architecture.md` was not changed, omit it from `git add`.

---

### Task 13: Run final local gates on the committed tree

**Objective:** Verify the implementation locally before any push/deploy claim.

**Files:**
- No source edits unless a gate fails

**Step 1: Ensure no stale Vite server is running**

Run:

```bash
lsof -nP -iTCP:5173 -sTCP:LISTEN || true
```

Expected: no output. If a process is listed, stop it before visual/browser tests unless it is the Playwright-owned server for the current run.

**Step 2: Run targeted tests**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npx vitest run \
  src/sim/systems/__tests__/navigation.test.ts \
  src/sim/systems/__tests__/fmaTruth.test.ts \
  src/sim/systems/__tests__/autopilot.test.ts \
  src/sim/__tests__/simulationStep.test.ts \
  src/sim/__tests__/guidanceState.test.ts \
  src/sim/__tests__/checklistCoach.test.ts
```

Expected: PASS.

**Step 3: Run full gate**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npm run check
```

Expected: PASS — lint, typecheck, Vitest, and production build.

**Step 4: Run visual and flight browser tests**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
CI=1 npm run test:visual
CI=1 npx playwright test e2e/rfs-flight.spec.ts
```

Expected: both PASS. If visual screenshots fail, first re-check stale-server state before updating snapshots.

**Step 5: Commit gate fixes only if needed**

```bash
git status --short
git add <only-files-fixed-for-gates>
git commit -m "fix: stabilize RFS guidance proof gates"
```

Do not commit if the tree is clean and all gates passed.

---

### Task 14 [PARENT-DIRECT]: Release closeout if explicitly authorized

**Objective:** Push, wait for exact-SHA CI/CD, and verify live only if the owner asks to ship this slice.

**Files:**
- No source edits expected
- External systems: GitHub Actions, live `https://fly.reidar.tech/rfs-version.json`

**Step 1: Confirm clean committed tree**

Run:

```bash
git status --short
git rev-parse HEAD
git rev-list --left-right --count origin/master...HEAD
```

Expected: clean status. For `origin/master...HEAD`, the first/left number is commits only on `origin/master` (behind) and must be `0`; the second/right number is commits only on local `HEAD` (ahead) and may be greater than zero before push.

**Step 2: Push only if authorized**

Run:

```bash
git push origin master
PUSHED_SHA=$(git rev-parse HEAD)
echo "$PUSHED_SHA"
git ls-remote origin refs/heads/master
```

Expected: `origin/master` equals `PUSHED_SHA`.

**Step 3: Wait for the exact pushed SHA workflow**

Run:

```bash
gh run list --repo Reedtrullz/ReedFS --branch master --json databaseId,headSha,status,conclusion,url --limit 10
```

Find the run whose `headSha` equals `PUSHED_SHA`. Then poll:

```bash
gh run view <RUN_ID> --repo Reedtrullz/ReedFS --json status,conclusion,headSha,url,jobs
```

Expected before claiming success: `status=completed`, `conclusion=success`, and `headSha` equals `PUSHED_SHA`.

**Step 4: Verify live version after deploy job success**

Run:

```bash
curl -fsS https://fly.reidar.tech/rfs-version.json
```

Expected: JSON `commit` equals `PUSHED_SHA`. Do not claim live/deployed if the SHA does not match.

**Step 5: Optional hydrated browser smoke**

Run Playwright against live only after the live SHA matches:

```bash
# Add a temporary live baseURL only if needed; do not commit temporary config.
```

Expected: live page loads and route/version markers match. Clean any browser-local verification data afterwards.

**Step 6: Commit**

No commit in this task. Record evidence in the final response or a follow-up release report if requested.

---

## Plan review history

- Initial author review — 2026-06-12: Read `docs/architecture.md`, `docs/roadmap.md`, `docs/plans/README.md`, `playwright.config.ts`, the June 12 review, and the relevant AP/FMA/guidance/e2e source files. Identified runtime-heartbeat edits in Task 4 as `[PARENT-DIRECT]`. Added stale-Vite visual-test guard from the review.
- Independent plan review — 2026-06-12: Found eight blockers: VNAV distance used route progress instead of remaining distance, LNAV route-status override was still gated on `flightPlan`, unsupported-mode test literals were not in RFMS shared unions, checklist phase type was undefined on the primary path, runtime `rebuildGuidanceState()` would preserve stale tutorial step 0, e2e helper used nonexistent `aircraft.derived.vs`, e2e TypeScript checks did not cover `e2e/**`, stale-server commands did not force Playwright to own the server, and ahead/behind wording was ambiguous.
- Patch pass — 2026-06-12: Updated Task 2 helper/test to prefer `distanceToNextM`, Task 4 to remove the LNAV `&& flightPlan` guard, Task 5 to use valid `THR_CLB`/`NAV`/`CLB` literals, Task 7 to keep `GuidanceChecklistPhase` local, Task 9 to update `rebuildGuidanceState()`, Task 10 to use `computeDerived()` plus `performance.now()` and an explicit e2e `tsc` command, Task 11/13 to force `CI=1`, and Task 14 to explain left/right ahead-behind counts.
- Focused re-review — 2026-06-12: PASS. Reviewer verified all patched blocker classes against current source and found no remaining blockers.

## Final verification checklist for implementer

- [ ] No unrelated pre-existing dirty files are staged by any task.
- [ ] Task 4 is executed directly by the parent session, not a leaf subagent.
- [ ] AP and FMA both use `routeStatusToNavOutput()`.
- [ ] FMA unsupported raw mode tests prove unflown modes display `OFF`.
- [ ] Guidance clean climb checklist no longer contains “Gear down”.
- [ ] Tutorial active step advances with actual flight phase when no explicit override is supplied.
- [ ] ENVA Playwright proof reaches `phase === 'climb'`, `gearDown === false`, `aglFt > 200`, and no stale checklist copy.
- [ ] `npm run check` passes.
- [ ] `npm run test:visual` passes from a clean/no-stale-server environment.
- [ ] No CI/deploy/live success is claimed without exact-SHA GitHub Actions and live version verification.
