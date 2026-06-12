# RFS Autoflight Truth and Route-Proof Remediation Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Close the P0 autoflight honesty gaps from the 2026-06-12 comprehensive review, then add the next browser proof that KSEA route/LNAV guidance is actually available and progresses.

**Architecture:** Add one shared effective/backed autoflight-truth helper below both FMA display and AP command law. Simulation code must fly only the backed/effective truth, while UI surfaces light only the same truth; VNAV lifecycle remains derived from current aircraft + route status for this slice, not persisted into RFMS `apState.truth` yet. Route proof uses Playwright browser-store helpers, matching the existing ENVA clean-climb helper pattern.

**Tech Stack:** React 19, TypeScript 6, Vite, Zustand, Vitest, Playwright, RFMS shared autopilot/flight-plan types.

---

## Source review and constraints

Read before implementation:

- `docs/architecture.md` — current runtime heartbeat and architecture.
- `docs/reviews/2026-06-12-comprehensive-project-review-remaining-work.md` — audit source for this plan.
- `src/sim/systems/autopilot.ts` — current AP target/command law.
- `src/sim/systems/fmaTruth.ts` — current display truth derivation.
- `src/sim/simulationStep.ts` — runtime heartbeat where route status is computed and AP commands are composed.
- `src/store/simStore.ts` — AP disconnect/manual input ownership, fixed-step loop, route status state.
- `src/instruments/RfsPFD.tsx` and `src/instruments/RfsMCP.tsx` — display consumers.
- `e2e/helpers/rfsFlight.ts` — browser-store helper pattern for deterministic flight proof.

Runtime heartbeat safety audit:

```text
App -> useSimLoop -> simStore.tick -> simulationRuntime.step -> advanceSimulationStep
  -> computeRouteStatus before tick
  -> computeAutopilotCommandsForState
  -> compose pilot/AP effective controls
  -> integrate
  -> recompute routeStatus/guidance
```

No module in this chain is try/catch swallowed, so broken imports should crash tests/build loudly. Still, tasks that add modules imported by `simulationStep.ts`, `autopilot.ts`, `fmaTruth.ts`, or `simStore.ts` must run both targeted Vitest and `npm run typecheck` before commit.

## Non-goals for this plan

- Do not implement RFMS route modification / EXEC UI yet.
- Do not expose VNAV or LVL CHG MCP buttons yet.
- Do not claim full-flight or live deployment success.
- Do not push or deploy unless the user separately authorizes release closeout.
- Do not touch `stash@{0}`.

## Dependency map

- Tasks 1-4 touch `src/sim/systems/*` and must be serialized.
- Task 5 touches `src/store/*` and depends on Tasks 1-4.
- Task 6 touches `RfsMCP` and depends on Task 1.
- Tasks 7-9 add route e2e helpers/specs and depend on Tasks 1-6.
- Task 10 updates docs after implementation proof exists.
- Task 11 is final local closeout only; push/deploy remains blocked without explicit authorization.

## Task list

### Task 1: Create effective autoflight truth RED tests

**Objective:** Capture the shared truth contract before changing production code.

**Files:**
- Create: `src/sim/systems/__tests__/effectiveAutoflightTruth.test.ts`
- Read-only reference: `src/sim/systems/__tests__/fmaTruth.test.ts`

**Step 1: Write failing tests**

Create `src/sim/systems/__tests__/effectiveAutoflightTruth.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import type { AutopilotState } from '@shared/autopilot/autopilotTypes';
import type { FlightPlan } from '@shared/types/fmc';
import { createInitialState, B737_800_SPEC } from '../../types';
import { computeRouteStatus, createNoRouteStatus } from '../navigation';
import { deriveEffectiveAutoflightTruth, effectiveAutopilotIsEngaged } from '../effectiveAutoflightTruth';

function makeAp(): AutopilotState {
  return {
    boeing: {
      courseL: 0,
      courseR: 0,
      speed: 250,
      mach: null,
      heading: 180,
      altitude: 10000,
      verticalSpeed: null,
      fdLeft: true,
      fdRight: true,
      autothrottleArm: true,
      n1: false,
      speedMode: true,
      lnav: true,
      vnav: true,
      lvlChg: false,
      hdgSel: false,
      vorLoc: false,
      app: false,
      altHold: false,
      vs: false,
      cmdA: true,
      cmdB: false,
      cwsA: false,
      cwsB: false,
    },
    airbus: {
      speed: null,
      speedManaged: false,
      heading: null,
      headingManaged: false,
      altitude: 10000,
      altitudeManaged: false,
      verticalSpeed: null,
      fpa: null,
      fd1: false,
      fd2: false,
      athr: false,
      ap1: false,
      ap2: false,
      loc: false,
      appr: false,
      exped: false,
      hdgTrkMode: 'HDG_VS',
      metricAltitude: false,
      speedMachMode: 'SPD',
    },
    truth: {
      thrustActive: 'SPEED',
      lateralActive: 'LNAV',
      verticalActive: 'VNAV',
      autopilotStatus: 'CMD_A',
      lastModeChangeTimestamps: { thrust: 0, lateral: 0, vertical: 0 },
    },
  };
}

function constrainedRoute(): FlightPlan {
  return {
    origin: 'KSEA',
    destination: 'KPDX',
    flightNumber: 'TST800',
    route: 'KSEA OLM',
    waypoints: [
      { ident: 'KSEA', lat: 47.45, lon: -122.31, discontinuity: false },
      { ident: 'OLM', lat: 46.97, lon: -122.9, discontinuity: false, altitudeConstraint: { type: 'AT', altitude: 10000 } },
    ],
  };
}

function aircraftAtRoute(altitudeFt = 5000) {
  const aircraft = createInitialState(B737_800_SPEC);
  aircraft.position.lat = 47.45;
  aircraft.position.lon = -122.31;
  aircraft.position.alt = altitudeFt;
  aircraft.velocity.u = 128.6;
  return aircraft;
}

describe('deriveEffectiveAutoflightTruth', () => {
  it('returns all OFF when CMD_A truth is not backed by cmdA', () => {
    const raw = makeAp();
    raw.boeing.cmdA = false;

    const truth = deriveEffectiveAutoflightTruth(raw, { routeStatus: createNoRouteStatus() });

    expect(truth.autopilotStatus).toBe('OFF');
    expect(truth.thrustActive).toBe('OFF');
    expect(truth.lateralActive).toBe('OFF');
    expect(truth.verticalActive).toBe('OFF');
    expect(effectiveAutopilotIsEngaged(raw, { routeStatus: createNoRouteStatus() })).toBe(false);
  });

  it('suppresses unbacked thrust, lateral, and vertical modes independently', () => {
    const raw = makeAp();
    raw.boeing.speedMode = false;
    raw.boeing.lnav = false;
    raw.boeing.vnav = false;

    const truth = deriveEffectiveAutoflightTruth(raw, { routeStatus: createNoRouteStatus() });

    expect(truth.autopilotStatus).toBe('CMD_A');
    expect(truth.thrustActive).toBe('OFF');
    expect(truth.lateralActive).toBe('OFF');
    expect(truth.verticalActive).toBe('OFF');
    expect(effectiveAutopilotIsEngaged(raw, { routeStatus: createNoRouteStatus() })).toBe(true);
  });

  it('uses route status and VNAV constraints to expose the effective VNAV lifecycle', () => {
    const raw = makeAp();
    const aircraft = aircraftAtRoute();
    const flightPlan = constrainedRoute();
    const routeStatus = computeRouteStatus(aircraft, flightPlan, 0);

    const truth = deriveEffectiveAutoflightTruth(raw, { aircraft, flightPlan, routeStatus });

    expect(truth.lateralActive).toBe('LNAV');
    expect(truth.verticalActive).toBe('VNAV_PTH');
    expect(truth.thrustActive).toBe('SPEED');
    expect(truth.autopilotStatus).toBe('CMD_A');
  });

  it('transitions the effective VNAV lifecycle to ALT star near target altitude', () => {
    const raw = makeAp();
    const aircraft = aircraftAtRoute(9800);
    const flightPlan = constrainedRoute();
    const routeStatus = computeRouteStatus(aircraft, flightPlan, 0);

    const truth = deriveEffectiveAutoflightTruth(raw, { aircraft, flightPlan, routeStatus });

    expect(truth.verticalActive).toBe('ALT*');
  });
});
```

**Step 2: Run test to verify failure**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npx vitest run src/sim/systems/__tests__/effectiveAutoflightTruth.test.ts
```

Expected: FAIL — `Failed to resolve import "../effectiveAutoflightTruth"`.

**Step 3: Commit**

Do not commit this RED-only task. Continue directly to Task 2, then commit tests + implementation together.

### Task 2: Implement shared effective autoflight truth helper

**Objective:** Move the backed-mode derivation into one reusable runtime helper and keep FMA display as a wrapper.

**Files:**
- Create: `src/sim/systems/effectiveAutoflightTruth.ts`
- Modify: `src/sim/systems/fmaTruth.ts:1-119`
- Test: `src/sim/systems/__tests__/effectiveAutoflightTruth.test.ts`
- Test: `src/sim/systems/__tests__/fmaTruth.test.ts`

**Step 1: Write minimal implementation**

Create `src/sim/systems/effectiveAutoflightTruth.ts`:

```typescript
import type {
  AutoflightTruthState,
  AutopilotState,
  LateralMode,
  ThrustMode,
  VerticalMode,
} from '@shared/autopilot/autopilotTypes';
import type { FlightPlan } from '@shared/types/fmc';
import type { AircraftState } from '../types';
import { routeStatusToNavOutput, type RouteStatusSnapshot } from './navigation';
import { computeVNAV } from './vnav';

const VNAV_FAMILY = new Set<VerticalMode>(['VNAV', 'VNAV_PTH', 'ALT*']);

export interface EffectiveAutoflightTruthContext {
  aircraft?: AircraftState | null;
  flightPlan?: FlightPlan | null;
  routeStatus?: RouteStatusSnapshot | null;
}

export function offAutoflightTruth(apState: AutopilotState | null | undefined): AutoflightTruthState {
  return {
    lateralActive: 'OFF',
    lateralArmed: undefined,
    verticalActive: 'OFF',
    verticalArmed: undefined,
    thrustActive: 'OFF',
    autopilotStatus: 'OFF',
    lastModeChangeTimestamps: apState?.truth.lastModeChangeTimestamps ?? { thrust: 0, lateral: 0, vertical: 0 },
    vsEntry: apState?.truth.vsEntry,
  };
}

function autopilotStatusIsBacked(ap: AutopilotState): boolean {
  switch (ap.truth.autopilotStatus) {
    case 'OFF':
      return false;
    case 'CMD_A':
      return ap.boeing.cmdA;
    case 'CMD_B':
      return ap.boeing.cmdB;
    case 'CMD_AB':
      return ap.boeing.cmdA && ap.boeing.cmdB;
    case 'CWS_A':
      return ap.boeing.cwsA;
    case 'CWS_B':
      return ap.boeing.cwsB;
    case 'AP1':
      return ap.airbus.ap1;
    case 'AP2':
      return ap.airbus.ap2;
    case 'AP1_AP2':
      return ap.airbus.ap1 && ap.airbus.ap2;
    default:
      return false;
  }
}

function deriveThrustMode(ap: AutopilotState): ThrustMode {
  if (!ap.boeing.autothrottleArm) return 'OFF';
  if (ap.truth.thrustActive === 'SPEED') return ap.boeing.speedMode ? 'SPEED' : 'OFF';
  if (ap.truth.thrustActive === 'N1') return ap.boeing.n1 ? 'N1' : 'OFF';
  return 'OFF';
}

function deriveLateralMode(ap: AutopilotState, routeStatus: RouteStatusSnapshot | null | undefined): LateralMode {
  if (ap.truth.lateralActive === 'HDG_SEL') return ap.boeing.hdgSel ? 'HDG_SEL' : 'OFF';
  if (ap.truth.lateralActive === 'LNAV') return ap.boeing.lnav && routeStatus?.lnavAvailable ? 'LNAV' : 'OFF';
  if (ap.truth.lateralActive === 'VOR_LOC') return ap.boeing.vorLoc ? 'VOR_LOC' : 'OFF';
  if (ap.truth.lateralActive === 'APP' || ap.truth.lateralActive === 'LOC') return ap.boeing.app ? ap.truth.lateralActive : 'OFF';
  return 'OFF';
}

function deriveVnavMode(ap: AutopilotState, context: EffectiveAutoflightTruthContext): VerticalMode {
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

function deriveVerticalMode(ap: AutopilotState, context: EffectiveAutoflightTruthContext): VerticalMode {
  if (ap.truth.verticalActive === 'ALT_HOLD') return ap.boeing.altHold ? 'ALT_HOLD' : 'OFF';
  if (ap.truth.verticalActive === 'VS') return ap.boeing.vs ? 'VS' : 'OFF';
  if (VNAV_FAMILY.has(ap.truth.verticalActive)) return deriveVnavMode(ap, context);
  if (ap.truth.verticalActive === 'LVL_CHG') return ap.boeing.lvlChg ? 'LVL_CHG' : 'OFF';
  if (ap.truth.verticalActive === 'G_S') return ap.boeing.app ? 'G_S' : 'OFF';
  return 'OFF';
}

export function deriveEffectiveAutoflightTruth(
  apState: AutopilotState | null | undefined,
  context: EffectiveAutoflightTruthContext = {},
): AutoflightTruthState {
  if (!apState) return offAutoflightTruth(apState);
  if (!autopilotStatusIsBacked(apState)) return offAutoflightTruth(apState);

  return {
    ...apState.truth,
    thrustActive: deriveThrustMode(apState),
    lateralActive: deriveLateralMode(apState, context.routeStatus),
    verticalActive: deriveVerticalMode(apState, context),
  };
}

export function effectiveAutopilotIsEngaged(
  apState: AutopilotState | null | undefined,
  context: EffectiveAutoflightTruthContext = {},
): boolean {
  return deriveEffectiveAutoflightTruth(apState, context).autopilotStatus !== 'OFF';
}
```

Replace `src/sim/systems/fmaTruth.ts` with a compatibility wrapper:

```typescript
import type { AutopilotState } from '@shared/autopilot/autopilotTypes';
import {
  deriveEffectiveAutoflightTruth,
  type EffectiveAutoflightTruthContext,
} from './effectiveAutoflightTruth';

export type FmaTruthContext = EffectiveAutoflightTruthContext;

export function deriveDisplayFmaTruth(
  apState: AutopilotState | null | undefined,
  context: FmaTruthContext = {},
) {
  return deriveEffectiveAutoflightTruth(apState, context);
}
```

**Step 2: Run tests to verify pass**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npx vitest run src/sim/systems/__tests__/effectiveAutoflightTruth.test.ts src/sim/systems/__tests__/fmaTruth.test.ts
```

Expected: PASS — both files pass.

**Step 3: Run typecheck for heartbeat import safety**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npm run typecheck
```

Expected: PASS.

**Step 4: Commit**

```bash
git add src/sim/systems/effectiveAutoflightTruth.ts src/sim/systems/fmaTruth.ts src/sim/systems/__tests__/effectiveAutoflightTruth.test.ts
git commit -m "fix: share effective autoflight truth"
```

### Task 3: Add AP command RED tests for hidden-command prevention

**Objective:** Prove AP command law never flies a mode that effective truth suppresses.

**Files:**
- Modify: `src/sim/systems/__tests__/autopilot.test.ts`
- Modify later: `src/sim/systems/autopilot.ts`

**Step 1: Add tests**

Append to `src/sim/systems/__tests__/autopilot.test.ts`:

```typescript
describe('computeAutopilotCommandsForState effective truth gating', () => {
  it('does not command controls when CMD_A truth is not backed by cmdA', () => {
    const s = createInitialState(B737_800_SPEC);
    s.velocity.u = 128.6;
    const ap = makeAp('HDG_SEL', 'ALT_HOLD', 'SPEED');
    ap.boeing.cmdA = false;
    ap.boeing.hdgSel = true;
    ap.boeing.altHold = true;
    ap.boeing.speedMode = true;
    ap.boeing.autothrottleArm = true;

    const commands = computeAutopilotCommandsForState(s, ap, null, 1 / 60, null, createNoRouteStatus());

    expect(commands).toEqual({});
  });

  it('does not command throttle when SPEED truth is not backed by speedMode', () => {
    const s = createInitialState(B737_800_SPEC);
    s.velocity.u = 50;
    const ap = makeAp('HDG_SEL', 'ALT_HOLD', 'SPEED');
    ap.boeing.hdgSel = true;
    ap.boeing.altHold = true;
    ap.boeing.speedMode = false;
    ap.boeing.autothrottleArm = true;

    const commands = computeAutopilotCommandsForState(s, ap, null, 1 / 60, null, createNoRouteStatus());

    expect(commands.elevator).toBeDefined();
    expect(commands.aileron).toBeDefined();
    expect(commands.throttle1).toBeUndefined();
    expect(commands.throttle2).toBeUndefined();
  });

  it('does not command LNAV or VNAV axes when the route is unavailable', () => {
    const s = createInitialState(B737_800_SPEC);
    s.velocity.u = 128.6;
    const ap = makeAp('LNAV', 'VNAV', 'OFF');
    ap.boeing.lnav = true;
    ap.boeing.vnav = true;

    const commands = computeAutopilotCommandsForState(s, ap, null, 1 / 60, null, createNoRouteStatus());

    expect(commands.aileron).toBeUndefined();
    expect(commands.elevator).toBeUndefined();
    expect(commands.throttle1).toBeUndefined();
    expect(commands.throttle2).toBeUndefined();
  });

  it('does not command VNAV pitch when the active leg has no actionable VNAV constraint', () => {
    const s = createInitialState(B737_800_SPEC);
    s.position.lat = 47.45;
    s.position.lon = -122.31;
    s.position.alt = 7000;
    s.velocity.u = 128.6;
    const ap = makeAp('LNAV', 'VNAV', 'OFF');
    ap.boeing.lnav = true;
    ap.boeing.vnav = true;
    const fp: FlightPlan = {
      origin: 'KSEA',
      destination: 'KPDX',
      flightNumber: 'TST791',
      route: 'KSEA OLM',
      waypoints: [
        { ident: 'KSEA', lat: 47.45, lon: -122.31, discontinuity: false },
        { ident: 'OLM', lat: 46.97, lon: -122.9, discontinuity: false },
      ],
    };

    const commands = computeAutopilotCommandsForState(s, ap, fp, 1 / 60, 0);

    expect(commands.aileron).toBeDefined();
    expect(commands.elevator).toBeUndefined();
  });
});
```

Also update the existing `leaves altitude and VS targets unchanged when VNAV has no active constraint` assertion near `src/sim/systems/__tests__/autopilot.test.ts:267-292` from:

```typescript
// Inner loop always provides elevator (wings level + pitch hold)
expect(commands.elevator).toBeDefined();
```

to:

```typescript
// VNAV with no actionable constraint is not effective vertical guidance.
expect(commands.elevator).toBeUndefined();
```

Also update existing VNAV command tests that should continue to expect a flown VNAV pitch command. Because `makeAp()` currently defaults `boeing.lnav` and `boeing.vnav` to `false`, the effective-truth gate will correctly suppress those tests unless they explicitly back the requested modes. In both `uses VNAV target VS and commands elevator for a valid altitude constraint` and `uses VNAV_PTH active mode as a path-tracking VNAV command`, add immediately after `const ap = makeAp(...)`:

```typescript
    ap.boeing.lnav = true;
    ap.boeing.vnav = true;
```

Do not add these backing flags to the “no actionable VNAV constraint” expectation unless that test is specifically asserting LNAV aileron command remains active.

**Step 2: Run tests to verify failure**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npx vitest run src/sim/systems/__tests__/autopilot.test.ts
```

Expected: FAIL — current raw AP law still commands at least one hidden axis/throttle.

Do not commit this RED-only task. Continue to Task 4.

### Task 4: Wire AP command law to effective truth

**Objective:** Make AP commands use the same backed/effective truth as the FMA display.

**Files:**
- Modify: `src/sim/systems/autopilot.ts:1-338`
- Test: `src/sim/systems/__tests__/autopilot.test.ts`
- Test: `src/sim/systems/__tests__/fmaTruth.test.ts`
- Test: `src/sim/simulationStep.ts` import chain via typecheck

**Step 1: Modify imports**

Add imports near the top of `src/sim/systems/autopilot.ts`:

```typescript
import type { AutoflightTruthState } from '@shared/autopilot/autopilotTypes';
import { deriveEffectiveAutoflightTruth } from './effectiveAutoflightTruth';
```

**Step 2: Add helpers**

Add near `isAutopilotEngaged`:

```typescript
function apWithEffectiveTruth(ap: AutopilotState, truth: AutoflightTruthState): AutopilotState {
  return { ...ap, truth };
}

function hasVerticalGuidance(truth: AutoflightTruthState): boolean {
  return truth.verticalActive === 'ALT_HOLD' ||
    truth.verticalActive === 'VS' ||
    truth.verticalActive === 'VNAV' ||
    truth.verticalActive === 'VNAV_PTH' ||
    truth.verticalActive === 'ALT*';
}

function hasLateralGuidance(truth: AutoflightTruthState): boolean {
  return truth.lateralActive === 'HDG_SEL' || truth.lateralActive === 'LNAV';
}
```

Keep `isAutopilotEngaged()` for backwards compatibility in callers that do not have route context yet; do not try to make it route-aware.

**Step 3: Gate command emission by effective mode family**

In `computeAutopilotCommands`, replace the unconditional elevator/aileron emission with mode-family guarded commands:

```typescript
  const t = ap.truth;
  const cmd: AutopilotCommands = {};

  if (hasVerticalGuidance(t)) {
    let pitchTargetDeg = radToDeg(state.attitude.theta);

    if (t.verticalActive === 'ALT_HOLD') {
      pitchTargetDeg = altitudeToPitch(targetAltFt, state, dt);
    } else if (t.verticalActive === 'VS' || t.verticalActive === 'VNAV' || t.verticalActive === 'VNAV_PTH' || t.verticalActive === 'ALT*') {
      const vs = finiteOrUndefined(targetVerticalSpeedFpm) ?? finiteOrUndefined(ap.boeing.verticalSpeed) ?? 0;
      pitchTargetDeg = vsToPitch(vs, state, dt);
    }

    pitchTargetDeg = clamp(pitchTargetDeg, PITCH_MIN_DEG, PITCH_MAX_DEG);
    cmd.elevator = pitchHold(pitchTargetDeg, state, dt);
  }

  if (hasLateralGuidance(t)) {
    let bankTargetDeg = 0;
    if (t.lateralActive === 'HDG_SEL' || t.lateralActive === 'LNAV') {
      bankTargetDeg = headingToBank(targetHeadingRad, state);
    }
    cmd.aileron = bankHold(bankTargetDeg, state, dt);
  }
```

Leave the SPEED/N1 throttle block in place, but remember it now sees an effective AP truth object when called through `computeAutopilotCommandsForState()`.

**Step 4: Derive effective truth in `computeAutopilotCommandsForState`**

Replace the body of `computeAutopilotCommandsForState` with:

```typescript
  if (!ap) return {};
  const routeStatusForTruth = routeStatus ?? (flightPlan ? computeRouteStatus(state, flightPlan, activeLegIndex ?? null) : null);
  const effectiveTruth = deriveEffectiveAutoflightTruth(ap, {
    aircraft: state,
    flightPlan: flightPlan ?? null,
    routeStatus: routeStatusForTruth,
  });
  if (effectiveTruth.autopilotStatus === 'OFF') return {};

  const effectiveAp = apWithEffectiveTruth(ap, effectiveTruth);
  const tgts = resolveAutopilotTargets(state, effectiveAp, flightPlan, activeLegIndex, routeStatusForTruth);
  return computeAutopilotCommands(
    state,
    effectiveAp,
    tgts.targetHeadingRad,
    tgts.targetAltFt,
    tgts.targetSpeedKt,
    dt,
    tgts.targetVerticalSpeedFpm,
    tgts.targetN1Percent,
  );
```

Compatibility note: `computeAutopilotCommands()` remains a low-level helper that expects its `ap.truth` to already be effective/backed when used by runtime code. Runtime safety is enforced at `computeAutopilotCommandsForState()`, which preserves existing callers that pass `flightPlan + activeLegIndex` without a precomputed `routeStatus` by computing the fallback route status above.

**Step 5: Run tests**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npx vitest run src/sim/systems/__tests__/autopilot.test.ts src/sim/systems/__tests__/fmaTruth.test.ts src/sim/systems/__tests__/effectiveAutoflightTruth.test.ts
```

Expected: PASS.

**Step 6: Run heartbeat typecheck**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npm run typecheck
```

Expected: PASS.

**Step 7: Commit**

```bash
git add src/sim/systems/autopilot.ts src/sim/systems/__tests__/autopilot.test.ts
git commit -m "fix: gate autopilot commands on effective truth"
```

### Task 5: Use effective truth for store manual-thrust ownership

**Objective:** Stop unbacked SPEED/N1 truth from stealing manual throttle input.

**Files:**
- Modify: `src/store/simStore.ts:21-24,227-291`
- Modify: `src/store/simStoreInputReducers.ts:148-190`
- Test: `src/store/__tests__/simStore.test.ts`

**Step 1: Write failing store tests**

Append to `src/store/__tests__/simStore.test.ts` inside the `describe('useSimStore', ...)` block:

```typescript
  it('does not treat unbacked SPEED truth as AP-owned thrust for manual setInput', () => {
    const ap = minimalApState();
    ap.truth.thrustActive = 'SPEED';
    ap.boeing.autothrottleArm = true;
    ap.boeing.speedMode = false;
    useSimStore.getState().setApState(ap);

    useSimStore.getState().setInput({ throttle1: 0.7, throttle2: 0.7 });

    expect(useSimStore.getState().pilotInputs.throttle1).toBe(0.7);
    expect(useSimStore.getState().pilotInputs.throttle2).toBe(0.7);
    expect(useSimStore.getState().effectiveControls.throttle1).toBe(0.7);
    expect(useSimStore.getState().apState?.truth.autopilotStatus).toBe('CMD_A');
  });

  it('does not strip throttle input actions when SPEED truth is unbacked', () => {
    const ap = minimalApState();
    ap.truth.thrustActive = 'SPEED';
    ap.boeing.autothrottleArm = true;
    ap.boeing.speedMode = false;
    useSimStore.getState().setApState(ap);

    useSimStore.getState().applyInputActions({ throttleDelta: 0.1 }, 1 / 60);

    expect(useSimStore.getState().pilotInputs.throttle1).toBeGreaterThan(0);
    expect(useSimStore.getState().pilotInputs.throttle2).toBeGreaterThan(0);
  });
```

**Step 2: Run tests to verify failure**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npx vitest run src/store/__tests__/simStore.test.ts -t "unbacked SPEED"
```

Expected: FAIL — current store checks raw `apState.truth.thrustActive`.

**Step 3: Implement minimal store helper**

Import the helper in `src/store/simStore.ts`:

```typescript
import { deriveEffectiveAutoflightTruth } from '../sim/systems/effectiveAutoflightTruth';
```

Add near `autopilotModesChanged`:

```typescript
function apEffectivelyOwnsThrust(s: Pick<SimStore, 'apState' | 'aircraft' | 'flightPlan' | 'routeStatus'>): boolean {
  const truth = deriveEffectiveAutoflightTruth(s.apState, {
    aircraft: s.aircraft,
    flightPlan: s.flightPlan,
    routeStatus: s.routeStatus,
  });
  return truth.thrustActive === 'SPEED' || truth.thrustActive === 'N1';
}
```

Replace both raw thrust-ownership checks:

```typescript
const apOwnsThrust = s.apState != null && (s.apState.truth.thrustActive === 'SPEED' || s.apState.truth.thrustActive === 'N1');
```

with:

```typescript
const apOwnsThrust = apEffectivelyOwnsThrust(s);
```

Then update `src/store/simStoreInputReducers.ts` so throttle is only treated as an AP-owned axis when AP effectively owns thrust. Replace the throttle section inside `sanitizeSetInputPartial()` with:

```typescript
    if (key === 'throttle1' || key === 'throttle2') {
      if (apOwnsThrust) {
        delete pilotPatch[key];
      }
      continue;
    }
```

And simplify `inputActionsIncludeManualApAxis()` so manual throttle changes do not disconnect lateral/vertical AP when AP does not own thrust:

```typescript
export function inputActionsIncludeManualApAxis(actions: InputActions, apState: AutopilotState | null): boolean {
  if (!isAutopilotEngaged(apState)) return false;
  return actions.pitch !== undefined || actions.roll !== undefined;
}
```

Update the existing `legacy full-object setInput does not copy AP-owned effective axes into pilot inputs` test so it still describes an AP-owned thrust case. Replace:

```typescript
    useSimStore.getState().setApState(minimalApState());
```

with:

```typescript
    const ap = minimalApState();
    ap.boeing.autothrottleArm = true;
    ap.boeing.speedMode = true;
    useSimStore.getState().setApState(ap);
```

This preserves the legacy full-object regression while the new RED tests above cover the opposite case: raw/unbacked SPEED must not be treated as AP-owned thrust.

**Step 4: Run targeted tests**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npx vitest run src/store/__tests__/simStore.test.ts -t "unbacked SPEED|manual throttle"
```

Expected: PASS.

**Step 5: Run wider store/AP tests**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npx vitest run src/store/__tests__/simStore.test.ts src/sim/systems/__tests__/autopilot.test.ts src/sim/systems/__tests__/fmaTruth.test.ts
```

Expected: PASS.

**Step 6: Commit**

```bash
git add src/store/simStore.ts src/store/simStoreInputReducers.ts src/store/__tests__/simStore.test.ts
git commit -m "fix: use effective truth for AP thrust ownership"
```

### Task 6: Make MCP active lights use effective display truth

**Objective:** Keep MCP button highlight state aligned with the same effective truth as FMA and AP law.

**Files:**
- Modify: `src/instruments/RfsMCP.tsx:1-293`
- Test: `src/instruments/__tests__/RfsMCP.test.tsx`

**Step 1: Write failing test**

Find the existing LNAV/unavailable or mode-display tests in `src/instruments/__tests__/RfsMCP.test.tsx`. Add this test using the file’s existing render/store reset harness:

```typescript
it('does not highlight SPEED when raw SPEED truth is not backed by speedMode', () => {
  const ap = createDefaultAutopilotState();
  ap.truth.autopilotStatus = 'CMD_A';
  ap.boeing.cmdA = true;
  ap.truth.thrustActive = 'SPEED';
  ap.boeing.autothrottleArm = true;
  ap.boeing.speedMode = false;
  useSimStore.getState().setApState(ap);

  render(<RfsMCP />);

  expect(screen.getByRole('button', { name: 'SPD' })).toHaveStyle({ background: '#333' });
});
```

If the existing test helpers do not import `createDefaultAutopilotState`, add:

```typescript
import { createDefaultAutopilotState } from '../defaultAutopilotState';
```

**Step 2: Run test to verify failure**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npx vitest run src/instruments/__tests__/RfsMCP.test.tsx -t "does not highlight SPEED"
```

Expected: FAIL — current MCP uses raw `apState.truth.thrustActive` for `thrActive`.

**Step 3: Implement effective truth selectors**

Import the helper in `src/instruments/RfsMCP.tsx`:

```typescript
import { deriveEffectiveAutoflightTruth } from '../sim/systems/effectiveAutoflightTruth';
```

Replace raw active selectors:

```typescript
  const latActive = apState?.truth.lateralActive ?? 'OFF';
  const vertActive = apState?.truth.verticalActive ?? 'OFF';
  const thrActive = apState?.truth.thrustActive ?? 'OFF';
```

with:

```typescript
  const aircraft = useSimStore((s) => s.aircraft);
  const flightPlan = useSimStore((s) => s.flightPlan);
  const effectiveTruth = deriveEffectiveAutoflightTruth(apState, { aircraft, flightPlan, routeStatus });
  const latActive = effectiveTruth.lateralActive;
  const vertActive = effectiveTruth.verticalActive;
  const thrActive = effectiveTruth.thrustActive;
```

Keep LNAV button `disabled={!lnavAvailable}` as-is.

**Step 4: Run targeted tests**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npx vitest run src/instruments/__tests__/RfsMCP.test.tsx src/sim/systems/__tests__/effectiveAutoflightTruth.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/instruments/RfsMCP.tsx src/instruments/__tests__/RfsMCP.test.tsx
git commit -m "fix: align MCP highlights with effective autoflight truth"
```

### Task 7: Add KSEA route browser helper RED test

**Objective:** Define the browser proof contract for route loading and LNAV route progress before implementing helper code.

**Files:**
- Create: `e2e/helpers/rfsRoute.ts`
- Create: `e2e/rfs-route.spec.ts`

**Step 1: Write failing e2e spec**

Create `e2e/rfs-route.spec.ts`:

```typescript
import { expect, test } from '@playwright/test';
import { openRfs } from './helpers/rfsPage';
import { flyKseaRouteWithLnav } from './helpers/rfsRoute';

test.describe('RFS route and LNAV browser proof', () => {
  test('KSEA sample route loads, enables LNAV, and decreases DTG while flying', async ({ page }) => {
    await openRfs(page);

    const result = await flyKseaRouteWithLnav(page);

    expect(result.initial.routeName).toBe('KSEA→KPDX');
    expect(result.initial.lnavAvailable).toBe(true);
    expect(result.initial.lateralActive).toBe('LNAV');
    expect(result.initial.fmaLateralActive).toBe('LNAV');
    expect(result.final.routeName).toBe('KSEA→KPDX');
    expect(result.final.lnavAvailable).toBe(true);
    expect(result.final.distanceToNextNm).toBeLessThan(result.initial.distanceToNextNm - 0.2);
    expect(result.final.activeLegIndex).toBeGreaterThanOrEqual(result.initial.activeLegIndex);
    expect(result.samples.length).toBeGreaterThan(3);
  });
});
```

**Step 2: Run Playwright to verify failure**

Run with CI ownership so Playwright does not reuse a stale Vite server:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
lsof -nP -iTCP:5173 -sTCP:LISTEN || true
CI=1 npx playwright test e2e/rfs-route.spec.ts --project=chromium
```

Expected: FAIL — module `./helpers/rfsRoute` does not exist.

If `lsof` prints a listener on port 5173, stop that stale dev server before running Playwright; `CI=1` intentionally owns the test server and should fail loudly on a port conflict rather than reusing unknown state.

Do not commit this RED-only task. Continue to Task 8.

### Task 8: Implement KSEA route/LNAV browser helper

**Objective:** Add a deterministic Playwright helper that uses browser runtime state to prove KSEA route status and LNAV progress.

**Files:**
- Create: `e2e/helpers/rfsRoute.ts`
- Test: `e2e/rfs-route.spec.ts`

**Step 1: Implement helper**

Create `e2e/helpers/rfsRoute.ts`:

```typescript
import type { Page } from '@playwright/test';

export interface RouteProofSnapshot {
  routeName: string;
  lnavAvailable: boolean;
  activeLegIndex: number;
  distanceToNextNm: number;
  desiredTrackDegTrue: number | null;
  crossTrackErrorM: number | null;
  lateralActive: string;
  fmaLateralActive: string;
  altitudeFt: number;
  iasKt: number;
}

export interface RouteProofResult {
  initial: RouteProofSnapshot;
  final: RouteProofSnapshot;
  samples: RouteProofSnapshot[];
}

const FIXED_STEP_SECONDS = 1 / 60;
const FIXED_STEP_MS = 1000 / 60;
const ROUTE_FRAMES = 60 * 35;

export async function flyKseaRouteWithLnav(page: Page): Promise<RouteProofResult> {
  return page.evaluate(
    async ({ fixedStepSeconds, fixedStepMs, routeFrames }): Promise<RouteProofResult> => {
      interface BrowserRouteStatus {
        routeName: string;
        lnavAvailable: boolean;
        activeLegIndex: number | null;
        distanceToNextNm: number | null;
        desiredTrackDegTrue: number | null;
        crossTrackErrorM: number | null;
      }

      interface BrowserAircraftState {
        position: { lat: number; lon: number; alt: number };
        velocity: { u: number; v: number; w: number };
        attitude: { phi: number; theta: number; psi: number };
        quaternion: { w: number; x: number; y: number; z: number };
        ground: { weightOnWheels: boolean; aglFt: number; groundAltFt: number };
        config: { gearDown: boolean; flapSetting: number; stabilizerTrimUnits: number };
        flightPhase: string;
      }

      interface BrowserSimState {
        aircraft: BrowserAircraftState;
        wind: unknown;
        routeStatus: BrowserRouteStatus;
        apState: unknown;
        setScenario: (scenarioId: string) => void;
        setFlightPlan: (flightPlan: unknown) => void;
        setApState: (apState: unknown) => void;
        tick: (timestamp: number) => void;
      }

      interface BrowserSimStore {
        getState: () => BrowserSimState;
        setState: (partial: Partial<BrowserSimState> & { status?: string; lastFrameTime?: number; fixedStepAccumulatorSeconds?: number }) => void;
      }

      interface BrowserDerivedState {
        ias: number;
      }

      const simStoreImport = await import('/src/store/simStore.ts') as { useSimStore: BrowserSimStore };
      const flightPlanImport = await import('/src/sim/flightPlanLoader.ts') as { createKseaKpdxFlight: () => unknown };
      const apImport = await import('/src/instruments/defaultAutopilotState.ts') as { createDefaultAutopilotState: () => any };
      const derivedImport = await import('/src/sim/physics/derived.ts') as {
        computeDerived: (aircraft: BrowserAircraftState, wind: unknown) => BrowserDerivedState;
      };
      const fmaImport = await import('/src/sim/systems/fmaTruth.ts') as {
        deriveDisplayFmaTruth: (apState: unknown, context: { aircraft: BrowserAircraftState; flightPlan: unknown; routeStatus: BrowserRouteStatus }) => { lateralActive: string };
      };
      const quatImport = await import('/src/sim/physics/quaternion.ts') as {
        eulerToQuat: (phi: number, theta: number, psi: number) => { w: number; x: number; y: number; z: number };
      };

      const { useSimStore } = simStoreImport;
      const flightPlan = flightPlanImport.createKseaKpdxFlight();
      useSimStore.getState().setScenario('ksea-tutorial');
      useSimStore.getState().setFlightPlan(flightPlan);

      const apState = apImport.createDefaultAutopilotState();
      apState.truth.autopilotStatus = 'CMD_A';
      apState.truth.lateralActive = 'LNAV';
      apState.truth.verticalActive = 'ALT_HOLD';
      apState.truth.thrustActive = 'SPEED';
      apState.boeing.cmdA = true;
      apState.boeing.lnav = true;
      apState.boeing.altHold = true;
      apState.boeing.speedMode = true;
      apState.boeing.autothrottleArm = true;
      apState.boeing.speed = 230;
      apState.boeing.altitude = 5000;
      useSimStore.getState().setApState(apState);

      const headingRad = 199 * Math.PI / 180;
      const aircraft = structuredClone(useSimStore.getState().aircraft);
      aircraft.position.lat = 47.445;
      aircraft.position.lon = -122.315;
      aircraft.position.alt = 5000;
      aircraft.velocity.u = 118;
      aircraft.velocity.v = 0;
      aircraft.velocity.w = 0;
      aircraft.attitude.phi = 0;
      aircraft.attitude.theta = 0;
      aircraft.attitude.psi = headingRad;
      aircraft.quaternion = quatImport.eulerToQuat(0, 0, headingRad);
      aircraft.ground.weightOnWheels = false;
      aircraft.ground.aglFt = 4500;
      aircraft.ground.groundAltFt = 500;
      aircraft.config.gearDown = false;
      aircraft.config.flapSetting = 0;
      aircraft.flightPhase = 'CRUISE';

      let timestamp = performance.now();
      useSimStore.setState({
        aircraft,
        status: 'running',
        lastFrameTime: timestamp,
        fixedStepAccumulatorSeconds: 0,
      });
      useSimStore.getState().setFlightPlan(flightPlan);
      useSimStore.getState().setApState(apState);

      const snapshot = (): RouteProofSnapshot => {
        const state = useSimStore.getState();
        const route = state.routeStatus;
        const fma = fmaImport.deriveDisplayFmaTruth(state.apState, {
          aircraft: state.aircraft,
          flightPlan,
          routeStatus: route,
        });
        return {
          routeName: route.routeName,
          lnavAvailable: route.lnavAvailable,
          activeLegIndex: route.activeLegIndex ?? -1,
          distanceToNextNm: route.distanceToNextNm ?? Number.POSITIVE_INFINITY,
          desiredTrackDegTrue: route.desiredTrackDegTrue,
          crossTrackErrorM: route.crossTrackErrorM,
          lateralActive: (state.apState as any)?.truth?.lateralActive ?? 'OFF',
          fmaLateralActive: fma.lateralActive,
          altitudeFt: state.aircraft.position.alt,
          iasKt: derivedImport.computeDerived(state.aircraft, state.wind).ias,
        };
      };

      const samples: RouteProofSnapshot[] = [snapshot()];
      for (let frame = 0; frame < routeFrames; frame += 1) {
        timestamp += fixedStepMs;
        useSimStore.getState().tick(timestamp);
        if (frame % 300 === 0) samples.push(snapshot());
      }
      samples.push(snapshot());

      return {
        initial: samples[0],
        final: samples[samples.length - 1],
        samples,
      };
    },
    { fixedStepSeconds: FIXED_STEP_SECONDS, fixedStepMs: FIXED_STEP_MS, routeFrames: ROUTE_FRAMES },
  );
}
```

Implementation note: if this exact synthetic heading/position does not decrease DTG, adjust only the helper’s initial KSEA position/heading after inspecting `samples`. Do not weaken the test to merely assert route availability.

**Step 2: Explicit TypeScript check for e2e helper**

Because RFS `tsconfig.json` excludes `e2e`, run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npx tsc --ignoreConfig --noEmit --target ES2022 --module ESNext --moduleResolution bundler --strict --skipLibCheck e2e/helpers/rfsRoute.ts
```

Expected: PASS.

**Step 3: Run the route e2e**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
lsof -nP -iTCP:5173 -sTCP:LISTEN || true
CI=1 npx playwright test e2e/rfs-route.spec.ts --project=chromium
```

Expected: PASS.

If `lsof` prints a listener on port 5173, stop that stale dev server before running Playwright; do not remove `CI=1` to make the test pass.

**Step 4: Commit**

```bash
git add e2e/helpers/rfsRoute.ts e2e/rfs-route.spec.ts
git commit -m "test: prove KSEA LNAV route progress in browser"
```

### Task 9: Add route-proof coverage to visual/browser gate expectations

**Objective:** Ensure the new route proof remains part of `npm run test:visual` and does not rely on stale local servers.

**Files:**
- Modify: `docs/architecture.md:170-172`
- Modify: `docs/roadmap.md` route/full-flight section
- Test: `e2e/rfs-route.spec.ts`

**Step 1: Update architecture browser-proof wording**

In `docs/architecture.md`, update the browser proof bullet so it says both:

```markdown
- `e2e/rfs-flight.spec.ts` proves ENVA takeoff roll to clean climb with phase-aware guidance and gear-up state.
- `e2e/rfs-route.spec.ts` proves the KSEA sample route loads in-browser, exposes backed LNAV, and decreases DTG while the route leg is flown. These are clean-climb and route-leg proofs, not a full-route/full-flight completion claim.
```

**Step 2: Update roadmap next steps**

In `docs/roadmap.md`, keep full-flight proof as remaining work, but move KSEA route-leg proof from “missing” to “foundation present” after the e2e lands. Do not claim approach/landing proof.

Also update the “latest plan” pointer near the top of `docs/roadmap.md` if it still points at `docs/plans/2026-06-12-rfs-guidance-truth-full-flight-proof.md`; the new pointer should be `docs/plans/2026-06-12-rfs-autoflight-truth-and-route-proof.md`.

**Step 3: Run doc sanity and browser test**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
CI=1 npx playwright test e2e/rfs-route.spec.ts --project=chromium
git diff --check
```

Expected: Playwright PASS and no whitespace errors.

**Step 4: Commit**

```bash
git add docs/architecture.md docs/roadmap.md
git commit -m "docs: document KSEA route-leg browser proof"
```

### Task 10: [PARENT-DIRECT] Focused post-implementation audit

**Objective:** Re-read the files touched by Tasks 1-9 and verify tests did not miss truth/wiring inconsistencies.

**Files:**
- Read: `src/sim/systems/effectiveAutoflightTruth.ts`
- Read: `src/sim/systems/fmaTruth.ts`
- Read: `src/sim/systems/autopilot.ts`
- Read: `src/sim/simulationStep.ts`
- Read: `src/store/simStore.ts`
- Read: `src/instruments/RfsMCP.tsx`
- Read: `e2e/helpers/rfsRoute.ts`
- Read: `e2e/rfs-route.spec.ts`

**Step 1: Controller audit checklist**

Verify manually:

- FMA and AP both import the same `deriveEffectiveAutoflightTruth` helper.
- `computeAutopilotCommandsForState()` passes aircraft, flight plan, and pre-tick route status into effective truth.
- `computeAutopilotCommands()` does not emit elevator/aileron/throttle for OFF effective modes.
- Store manual throttle ownership uses effective thrust truth, not raw truth.
- MCP active styles use effective truth.
- Route e2e helper uses `computeDerived()` and `deriveDisplayFmaTruth()` rather than invented local formulas.
- Browser helper uses `performance.now()`/RAF-style timestamps, not epoch `Date.now()` mixed into `tick()`.
- No docs claim full-route/full-flight proof.

**Step 2: Run focused tests**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npx vitest run \
  src/sim/systems/__tests__/effectiveAutoflightTruth.test.ts \
  src/sim/systems/__tests__/fmaTruth.test.ts \
  src/sim/systems/__tests__/autopilot.test.ts \
  src/store/__tests__/simStore.test.ts \
  src/instruments/__tests__/RfsMCP.test.tsx
npx tsc --ignoreConfig --noEmit --target ES2022 --module ESNext --moduleResolution bundler --strict --skipLibCheck e2e/helpers/rfsRoute.ts
CI=1 npx playwright test e2e/rfs-route.spec.ts --project=chromium
```

Expected: PASS.

**Step 3: If blockers are found**

Write RED tests for each blocker, fix, rerun this task, then amend or create a focused fix commit. Do not proceed to final gate with unresolved audit blockers.

### Task 11: Final local gate and no-push closeout

**Objective:** Prove the committed local tree is green and record that release closeout is blocked without explicit push/deploy authorization.

**Files:**
- Modify: none required unless Task 10 found docs drift.

**Step 1: Verify clean committed tree before full gate**

Run:

```bash
git status --short --branch
git log --oneline -8
```

Expected: only intended uncommitted docs, or clean if the plan was executed exactly with per-task commits. Do not proceed if implementation files are unstaged.

**Step 2: Run full local gate**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npm run check
CI=1 npm run test:visual
```

Expected:

- `npm run check` PASS.
- `CI=1 npm run test:visual` PASS, including `e2e/rfs-route.spec.ts`.

**Step 3: Verify no live/deploy claim**

Run:

```bash
git rev-list --left-right --count origin/master...HEAD
curl -fsS https://fly.reidar.tech/rfs-version.json || true
```

Expected: local may still be ahead of `origin/master`; live may still show an older SHA. Record this truthfully in the final response.

**Step 4: Commit only if Task 10 produced closeout docs**

If no files changed, do not create an empty commit. If docs were updated, run:

```bash
git add docs/architecture.md docs/roadmap.md docs/plans/2026-06-12-rfs-autoflight-truth-and-route-proof.md
git commit -m "docs: record autoflight truth closeout"
```

## Plan review history

- Initial plan source: `docs/reviews/2026-06-12-comprehensive-project-review-remaining-work.md` P0/P1 findings plus `docs/architecture.md` runtime heartbeat.
- Independent review 1 verdict: BLOCKED. Blockers found: VNAV `ALT*` fixture outside current 250 ft acquire band; `computeAutopilotCommandsForState()` snippet suppressed LNAV/VNAV when callers passed `flightPlan + activeLegIndex` without `routeStatus`; store manual-throttle test contradicted current reducer disconnect behavior; roadmap pointer update was underspecified; Playwright stale-server handling needed explicit instruction.
- Patch after review 1: changed ALT* fixture to 9800 ft; added `computeRouteStatus()` fallback for omitted route status; expanded Task 5 to update `simStoreInputReducers.ts` so throttle is AP-owned only when effective thrust owns it and otherwise does not disconnect lateral/vertical AP; added roadmap pointer and stale-server notes; clarified `computeAutopilotCommands()` as low-level and `computeAutopilotCommandsForState()` as runtime safety boundary.
- Independent review 2 verdict: BLOCKED. Remaining blockers found: fallback `computeRouteStatus()` snippet passed possibly-undefined `activeLegIndex`; existing VNAV command tests using unbacked `makeAp()` would fail after effective-truth gating; Task 5 file list omitted `simStoreInputReducers.ts`; existing legacy full-object store test needed to explicitly back SPEED before it can assert AP-owned throttle behavior.
- Patch after review 2: normalized fallback route status with `activeLegIndex ?? null`; added explicit migration instructions for existing VNAV command tests; added `simStoreInputReducers.ts` to Task 5 files; added explicit migration for the legacy full-object store test.
- Independent review 3 verdict: APPROVE. Final focused re-review confirmed the review-2 blocker classes were resolved and found no patch-introduced contradictions in those areas.

## Final verification checklist

- [ ] Architecture docs read and heartbeat audited.
- [ ] Every production-code task starts with RED tests.
- [ ] Runtime heartbeat imports get targeted tests plus `npm run typecheck`.
- [ ] E2E helper gets explicit TS6 `--ignoreConfig` check.
- [ ] Playwright commands use `CI=1` or otherwise verify no stale Vite server.
- [ ] No task claims full-flight proof from route-leg or clean-climb proof.
- [ ] No push/deploy unless the user explicitly authorizes release closeout.
