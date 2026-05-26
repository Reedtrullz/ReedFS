# RFS Comprehensive Usability and Realism Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task. Tasks marked `[PARENT-DIRECT]` touch cross-cutting physics/rendering architecture and should be executed directly by the parent session, with specialist subagents used for isolated reviews or focused implementation help.

**Goal:** Turn RFS from a debug flight-test build into a usable, believable 737-style simulator loop: visible runway start, realistic takeoff/climb/controls, better aircraft visuals, a real cockpit view, cohesive instruments, and trustworthy route/autopilot feedback.

**Architecture:** Add scenario-level regression tests first, then fix the ground/contact and flight-control contracts that make the sim arcadey. In parallel after the contracts are measured, evolve rendering into persistent aircraft/cockpit layers and split UI into player/cockpit/debug modes. Keep RFMS/autopilot integration behind explicit store-owned guidance, route, and AP truth state so visible FMA/MCP modes match the actual servo laws.

**Tech Stack:** React 19, TypeScript strict, Vite, Vitest, Zustand, CesiumJS, Three.js, three-to-cesium, Web Audio, RFMS shared types.

**Implementation status (current repository state):** Phases 0 through 5.5 are complete and covered by `npm run check`. The next unfinished batch is Phase 6: Cesium token/degraded-scene policy, Three.js deduplication, deterministic visual regression snapshots, fixed-timestep/worker migration, and audio immersion.

Completed task groups:

- Phase 0: measurement and regression harness.
- Phase 1: runway-normal ground contact, normal-force liftoff, and removal of core attitude assist.
- Phase 2: performance envelope fixtures, data-backed aero/engine behavior, input dynamics, AP/pilot/effective-control split, trim, and CG pitch moment.
- Phase 3: aircraft visual contract, persistent renderer, visual animation state, and Cesium-native runway layer.
- Phase 4: camera manager, cockpit shell, overlay modes, readable PFD/FMA, and cockpit interaction hooks.
- Phase 5: scenario/tutorial/checklist/coach flow, store-owned guidance/route/AP truth state, active-leg route feedback, and honest LNAV/VNAV/SPD/VS behavior.

---

## Source documents

Read these before implementation:

- `docs/architecture.md`
- `docs/physics-invariants.md`
- `docs/roadmap.md`
- `docs/reviews/2026-05-26-comprehensive-gameplay-review.md`
- `docs/reviews/2026-05-25-playability-review.md`
- `docs/reviews/2026-05-25-playability-follow-up.md`

## Global rules

Use Node 22 for every Node/npm command:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
```

Quality gate:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check
```

Before reporting any live/deployed code change as complete:

```bash
gh run list --branch master --limit 5 --json databaseId,headSha,status,conclusion,workflowName,url
# wait for the target run to show status=completed and conclusion=success
curl -fsSI https://fly.reidar.tech/ | head
```

Docs-only changes do not need deployment, but code changes pushed to `master` do.

## Dependency map

```text
Phase 0 measurement must happen before tuning constants.
Phase 1 ground/contact fixes must happen before final aero/performance tuning.
Phase 2 input/trim can start after Phase 0 but must integrate with Phase 1 liftoff semantics.
Phase 3 aircraft model/renderer can run in parallel with Phase 1/2 after named-part contracts are defined.
Phase 4 cockpit/camera depends on renderer visibility controls and overlay modes.
Phase 5 guidance/product loop depends on UI state architecture but can start with store/UI tests.
Phase 6 performance/worker should wait until state contracts are stable.
```

## Target acceptance criteria for the first “usable simulator” milestone

A milestone is complete when a browser-dogfood run can demonstrate:

1. Choose a KSEA takeoff scenario.
2. Aircraft starts visibly on a runway centerline with correct runway heading and field elevation.
3. START ROLL produces plausible acceleration, not a rocket-like sprint.
4. Rotate cue appears near computed Vr.
5. Holding W produces a bounded rotation rate, not an instant pitch clamp.
6. Liftoff occurs when lift/normal force unloads the gear.
7. Initial climb with flaps 5 and gear transitioning stays in a plausible envelope:
   - positive AoA, not negative AoA during strong climb
   - no 10,000+ fpm gear-down rocket climb
   - gear/flaps drag visibly and physically matter
8. Chase view remains nose-first and stable.
9. Cockpit view shows cockpit geometry, horizon, and integrated instruments.
10. Debug telemetry is toggleable.
11. PFD FMA/MCP/route feedback matches actual guidance state.
12. Reset and repeat work reliably.

---

# Phase 0: Measurement and regression harness

## Task 0.1: Add takeoff/climb scenario simulation helpers

**Objective:** Create reusable deterministic scenario helpers so realism tuning is measured by flight profiles, not isolated constants.

**Files:**
- Create: `src/sim/__tests__/scenarioHelpers.ts`
- Modify: `src/sim/physics/__tests__/integrate.test.ts`
- Modify later: `src/store/__tests__/simStore.test.ts`

**Step 1: Create helper file**

Add helpers shaped like:

```ts
import type { AircraftState, ControlInputs } from '../types';
import { B737_800_SPEC, createInitialState } from '../types';
import { integrate } from '../physics/integrate';

export function takeoffRollInputs(overrides: Partial<ControlInputs> = {}): ControlInputs {
  return {
    elevator: 0,
    aileron: 0,
    rudder: 0,
    throttle1: 1,
    throttle2: 1,
    flapLever: 5,
    gearLever: 'DOWN',
    spoilers: 0,
    brake: 0,
    ...overrides,
  };
}

export function runFixedStepScenario(options: {
  seconds: number;
  hz: number;
  state?: AircraftState;
  inputs?: ControlInputs;
  mutateInputs?: (state: AircraftState, inputs: ControlInputs, elapsedSeconds: number) => void;
}): AircraftState {
  const state = options.state ?? createInitialState(B737_800_SPEC);
  const inputs = options.inputs ?? takeoffRollInputs();
  const dt = 1 / options.hz;
  for (let i = 0; i < options.seconds * options.hz; i += 1) {
    options.mutateInputs?.(state, inputs, i * dt);
    integrate(state, inputs, B737_800_SPEC, dt);
  }
  return state;
}
```

**Step 2: Run focused tests**

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test -- src/sim/physics/__tests__/integrate.test.ts
```

Expected: existing tests still pass.

**Step 3: Commit**

```bash
git add src/sim/__tests__/scenarioHelpers.ts src/sim/physics/__tests__/integrate.test.ts
git commit -m "test: add deterministic flight scenario helpers"
```

## Task 0.2: Add failing realism envelope tests for current weirdness

**Objective:** Lock in the observable weirdness before fixing it: fake vertical speed on runway, 15-degree pitch snap, negative AoA climb, and gear-down rocket climb.

**Files:**
- Modify: `src/sim/physics/__tests__/integrate.test.ts`
- Use: `src/sim/__tests__/scenarioHelpers.ts`

**Step 1: Add tests**

Add tests with deliberately conservative bounds. These should initially fail or expose the current assist/ground issues.

```ts
it('does not create large positive vertical speed while weight-on-wheels from pitch alone', () => {
  const state = createInitialState(B737_800_SPEC);
  state.flightPhase = 'TAKEOFF';
  state.position.alt = 432;
  state.velocity.u = 90;
  state.velocity.w = 0;
  state.attitude.theta = 10 * Math.PI / 180;
  state.config.gearDown = true;

  const inputs = takeoffRollInputs({ elevator: -1 });
  integrate(state, inputs, B737_800_SPEC, 1 / 120);

  expect(state.position.alt).toBeLessThanOrEqual(432.5);
  expect(Math.abs(state.derived.vs)).toBeLessThan(300);
});

it('does not climb like a rocket with gear down and flaps 5 after rotation', () => {
  const state = runFixedStepScenario({
    seconds: 35,
    hz: 120,
    inputs: takeoffRollInputs(),
  });

  const climb = runFixedStepScenario({
    state,
    seconds: 10,
    hz: 120,
    inputs: takeoffRollInputs({ elevator: -1, gearLever: 'DOWN' }),
  });

  expect(climb.derived.vs).toBeLessThan(6000);
  expect(climb.derived.aoa).toBeGreaterThan(0);
});
```

**Step 2: Run RED**

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test -- src/sim/physics/__tests__/integrate.test.ts
```

Expected: at least one new realism test fails in the current build.

**Step 3: Keep tests unmuted**

Do not weaken tests to fit current behavior. The next phases fix behavior.

## Task 0.3: Add browser dogfood checklist script/report template

**Objective:** Make every future “playable” claim include the same browser-observed evidence.

**Files:**
- Create: `docs/reviews/templates/playability-dogfood-checklist.md`
- Modify: `docs/plans/README.md`

**Checklist content:**

```md
# RFS Playability Dogfood Checklist

URL:
Commit/asset hash:
Browser:
Refresh rate if known:

## Initial
- [ ] no JS errors
- [ ] aircraft visible
- [ ] runway/centerline visible
- [ ] STOPPED, 0 kt, correct runway/field elevation

## Takeoff
- [ ] START ROLL accelerates at plausible rate
- [ ] rotate cue appears around Vr
- [ ] W/yoke rotates at bounded rate
- [ ] liftoff occurs without fake ground VS
- [ ] initial climb has positive AoA and plausible VS
- [ ] gear-up/flaps-up sequence works

## Views
- [ ] chase nose-first
- [ ] cockpit has cockpit geometry and horizon
- [ ] tower/free view usable

## UI
- [ ] debug telemetry toggle works
- [ ] FMA/MCP feedback matches modes
- [ ] route feedback visible

## Evidence
Screenshots:
Console:
Telemetry samples:
```

**Run/verify:** docs-only.

---

# Phase 1: Ground contact and takeoff physics

## Task 1.1 [PARENT-DIRECT]: Introduce explicit ground state

**Objective:** Add a durable ground/contact model state so physics, visuals, cues, and tests share weight-on-wheels/AGL/runway information.

**Files:**
- Modify: `src/sim/types.ts`
- Modify: `src/sim/systems/ground.ts`
- Modify: `src/sim/physics/integrate.ts`
- Test: `src/sim/systems/__tests__/ground.test.ts`

**Data shape:**

```ts
export interface GroundState {
  aglFt: number;
  groundAltFt: number;
  weightOnWheels: boolean;
  normalForceN: number;
  onRunway: boolean;
  contact: 'none' | 'gear' | 'belly' | 'crashed';
}
```

**Implementation notes:**

- Keep initial runway altitude at KSEA for now; abstract terrain later.
- `groundAltFt` starts as `KSEA_RUNWAY_ALT_FT`.
- `weightOnWheels` should be true when gear contact supports the aircraft.
- `normalForceN` is the upward support force available for tire friction/braking and gear compression.
- Do not derive visual gear compression from raw MSL altitude.

**Tests:**

- Initial state has `ground.weightOnWheels === true`, `aglFt === 0`, `contact === 'gear'`.
- A state at 1000 ft AGL has `weightOnWheels === false`.
- Gear-up below runway enters `belly` or `crashed`, not silent below-ground flight.

**Command:**

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test -- src/sim/systems/__tests__/ground.test.ts
```

## Task 1.2 [PARENT-DIRECT]: Constrain runway-normal velocity, not body `w`

**Objective:** Prevent pitch from projecting forward speed into fake climb while the aircraft is still on the runway.

**Files:**
- Modify: `src/sim/systems/ground.ts`
- Modify: `src/sim/physics/integrate.ts`
- Test: `src/sim/systems/__tests__/ground.test.ts`
- Test: `src/sim/physics/__tests__/integrate.test.ts`

**Implementation notes:**

- Convert body velocity to NED/world velocity using current quaternion/attitude.
- While `weightOnWheels`, force NED down velocity to zero or runway-normal-compatible value.
- Convert constrained NED velocity back to body velocity before committing state.
- Keep longitudinal velocity along runway tangent.
- Only release constraint when normal force unloads and climb conditions are met.

**Tests:**

- Pitched-up state at high ground speed remains runway-clamped while WOW.
- Derived vertical speed remains near zero while WOW.
- After liftoff, vertical speed is no longer clamped.

**Command:**

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test -- src/sim/systems/__tests__/ground.test.ts src/sim/physics/__tests__/integrate.test.ts
```

## Task 1.3 [PARENT-DIRECT]: Add normal-force liftoff release

**Objective:** Make liftoff happen because lift unloads the gear, not because the aircraft is pitched upward.

**Files:**
- Modify: `src/sim/systems/ground.ts`
- Modify: `src/sim/physics/aero.ts` if force outputs need exposing
- Modify: `src/sim/physics/integrate.ts`
- Test: `src/sim/physics/__tests__/integrate.test.ts`

**Implementation notes:**

- Compute approximate vertical support demand from weight minus vertical lift/thrust contribution.
- Clamp normal force to `[0, weight]`.
- Friction/braking use `normalForceN`, not constant acceleration only.
- Liftoff occurs when `normalForceN` approaches zero and vertical/energy state is valid.
- If not airborne, altitude stays runway-clamped.

**Acceptance tests:**

- Full throttle before Vr does not leave runway.
- At/after realistic Vr with rotation, WOW becomes false.
- Liftoff cannot occur at 80 kt with extreme pitch.
- Liftoff can occur at plausible speed/AoA.

## Task 1.4 [PARENT-DIRECT]: Remove core attitude mutation from `applyPlayableTakeoffAssist()`

**Objective:** Stop direct pitch/quaternion edits inside physics.

**Files:**
- Modify: `src/sim/physics/integrate.ts`
- Modify: `src/sim/physics/__tests__/integrate.test.ts`
- Possibly create: `src/sim/systems/takeoffAssist.ts` if tutorial assist is retained outside core physics

**Implementation notes:**

- Delete or disable `applyPlayableTakeoffAssist()` in realism mode.
- Replace tests that assert the 15-degree cap with pitch-rate/handling envelopes.
- If an assisted tutorial is desired, implement it as a control-command generator that adjusts elevator/trim/throttle, not attitude.

**Tests:**

- Holding rotate produces bounded pitch rate, not immediate snap.
- Pitch can exceed or settle below 15 based on dynamics, not hard cap.
- Neutral elevator does not forcibly hold 5-15 degrees.

## Task 1.5: Decouple takeoff/climb phase from gear state

**Objective:** Gear-down after positive rate should be a warning/checklist issue, not a reason for the aircraft to remain in TAKEOFF assist/phase forever.

**Files:**
- Modify: `src/sim/physics/integrate.ts`
- Modify: `src/sim/takeoffCue.ts`
- Test: `src/sim/physics/__tests__/integrate.test.ts`
- Test: `src/sim/__tests__/takeoffCue.test.ts` if present, otherwise create nearby test

**Implementation notes:**

- Phase transitions should depend on WOW/AGL/VS/speed, not gear position alone.
- Gear state drives warnings and drag/visuals.
- Add statuses like `GEAR UP`, `GEAR OVERSPEED`, `FLAPS RETRACT`, separately from `CLIMB`.

**Tests:**

- Airborne positive-rate state transitions from TAKEOFF to CLIMB even if gear remains down.
- Gear-down climb produces visible warning/cue.

---

# Phase 2: Aero, engine, mass, control feel, and trim

## Task 2.1: Add aircraft performance envelope fixtures

**Objective:** Make tuning target specific B737-ish envelopes instead of vague “plausible” behavior.

**Files:**
- Create: `src/sim/data/performance/b737TakeoffProfiles.ts`
- Create: `src/sim/physics/__tests__/performanceEnvelope.test.ts`

**Profiles:**

Include at least:

- Light takeoff: low payload/fuel, flaps 5.
- Medium takeoff: representative default tutorial weight.
- Heavy takeoff: near MTOW.

Each profile should define rough acceptance ranges, not exact certification data:

```ts
export interface TakeoffEnvelope {
  name: string;
  grossWeightKg: number;
  flapSetting: number;
  fieldElevationFt: number;
  targetSpeedAt20sKt: [number, number];
  targetVrKt: [number, number];
  initialClimbVsFpm: [number, number];
  initialClimbAoADeg: [number, number];
}
```

**Tests:**

- Current build may fail initially.
- Bounds should reject 10,000+ fpm gear-down rocket climb.
- Bounds should reject negative AoA during normal initial climb.

## Task 2.2 [PARENT-DIRECT]: Replace one-size aero constants with flap-detent polar data

**Objective:** Add CLmax/stall/post-stall and realistic configuration effects.

**Files:**
- Modify: `src/sim/systems/AeroModel.ts`
- Modify: `src/sim/physics/aero.ts`
- Test: `src/sim/physics/__tests__/aero.test.ts`
- Test: `src/sim/systems/__tests__/AeroModel.test.ts`

**Implementation notes:**

- Add per-detent data for flaps 0/1/5/15/30/40.
- Include `alphaZeroLiftRad`, `clAlpha`, `clMax`, `cd0`, `k`, `deltaCm`, and drag rise after stall.
- Lift should saturate/roll off instead of infinite linear growth.
- Drag should increase strongly at high AoA and with gear/flaps.

**Tests:**

- CL rises linearly only in normal range.
- CL caps/rolls off near stall.
- CD increases with flap detent and gear.
- Gear-down/flaps-5 climb is materially worse than clean climb.

## Task 2.3: Use a single engine thrust source and add thrust lapse tests

**Objective:** Stop `computeAero()` and `updateEngines()` from representing thrust separately.

**Files:**
- Modify: `src/sim/systems/engine.ts`
- Modify: `src/sim/physics/aero.ts`
- Test: `src/sim/systems/__tests__/engine.test.ts`
- Test: `src/sim/physics/__tests__/aero.test.ts`

**Implementation notes:**

- Either compute thrust entirely in engine system and pass/use `engine.thrust`, or move shared thrust map into a utility consumed by both.
- Include density/altitude/Mach/temperature effects.
- Remove unbounded positive ram effect if it creates unrealistic high-speed acceleration.

**Tests:**

- Thrust decreases with altitude and high Mach where expected.
- N1 spool produces thrust with rate lag.
- Both aero and engine displays agree on thrust source.

## Task 2.4: Add payload/ZFW/CG scenario configuration

**Objective:** Stop default aircraft from being an ambiguous empty-plus-fuel aircraft; make weight and CG part of scenarios.

**Files:**
- Modify: `src/sim/types.ts`
- Modify: `src/store/simStore.ts`
- Create: `src/sim/scenarios.ts`
- Test: `src/store/__tests__/simStore.test.ts`
- Test: `src/sim/__tests__/scenarios.test.ts`

**Implementation notes:**

- Define tutorial scenario gross weight, fuel, payload, CG, trim, runway, wind.
- Keep `createInitialState()` deterministic but allow scenario overrides.

**Tests:**

- KSEA tutorial scenario initializes expected weight/CG/fuel/runway.
- Reset returns to selected scenario, not hardcoded defaults only.

## Task 2.5: Add input dynamics and virtual yoke

**Objective:** Make keyboard/gamepad controls feel like pilot controls rather than instantaneous full-deflection event patches.

**Files:**
- Create: `src/input/InputManager.ts`
- Create: `src/input/__tests__/InputManager.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/store/simStore.ts`
- Modify: `src/input/keyboardControls.ts`
- Modify: `src/input/GamepadManager.ts`

**Implementation notes:**

- Convert raw keys/gamepad axes into normalized actions.
- Add virtual yoke state with rate limits and return-to-center.
- Add throttle lever state with rate/increment behavior.
- Add trim controls.
- Add focus guard so typing in UI fields does not fly the aircraft.
- Add gamepad calibration/inversion defaults.

**Tests:**

- Holding W ramps elevator over time.
- Releasing W recenters elevator over time.
- Throttle changes are latched, not erased by neutral gamepad triggers.
- Neutral gamepad does not overwrite keyboard/UI input.

## Task 2.6 [PARENT-DIRECT]: Separate pilot inputs, AP commands, and effective controls

**Objective:** Prevent autopilot from mutating the same object as pilot input and make control ownership debuggable.

**Files:**
- Modify: `src/sim/types.ts`
- Modify: `src/store/simStore.ts`
- Modify: `src/sim/physics/integrate.ts`
- Modify: `src/sim/systems/autopilot.ts`
- Test: `src/store/__tests__/simStore.test.ts`
- Test: `src/sim/systems/__tests__/autopilot.test.ts`

**Implementation notes:**

- Add store fields: `pilotInputs`, `apCommands`, `effectiveControls`.
- Integrator receives effective controls.
- AP reset/mode-change resets PID integrators.
- Manual override/AP disconnect is explicit.

**Tests:**

- AP mode does not mutate pilot input object.
- Reset clears AP PID/commands.
- Manual input override is visible and deterministic.

## Task 2.7: Add stabilizer trim and CG pitch moment

**Objective:** Make rotation and hands-off climb require trim/CG, not just elevator sign.

**Files:**
- Modify: `src/sim/types.ts`
- Modify: `src/sim/physics/aero.ts`
- Modify: `src/sim/systems/fuel.ts` if CG output needs normalization
- Test: `src/sim/physics/__tests__/aero.test.ts`
- Test: `src/sim/physics/__tests__/integrate.test.ts`

**Implementation notes:**

- Add stabilizer trim state/control.
- CG relative to aerodynamic center contributes to pitching moment.
- Trim affects Cm and required elevator.

**Tests:**

- Forward CG requires more nose-up trim/elevator.
- Aft CG reduces required trim but increases pitch sensitivity.
- Tutorial scenario initializes trim near takeoff setting.

---

# Phase 3: Aircraft visual model, renderer, animations, runway scene

## Task 3.1: Decide and document aircraft asset strategy

**Objective:** Choose GLB/glTF import vs procedural v2 before building animations and cockpit around the wrong shape.

**Files:**
- Create: `docs/assets/aircraft-model-strategy.md`
- Modify if needed: `package.json` for loader dependencies

**Decision criteria:**

- License compatibility.
- Named parts available: fuselage, wings, flaps, slats, ailerons, elevators, rudder, gear, doors, wheels, fans, lights, cockpit windows.
- PBR materials and livery support.
- Performance in browser.
- Ability to hide exterior model in cockpit.

**Recommendation:** Prefer a GLB/glTF model if a legally usable asset exists. If not, build procedural v2 with named groups and proportions tested against 737-like dimensions.

## Task 3.2: Add aircraft visual contract tests

**Objective:** Make the visual model testable by named parts and proportions.

**Files:**
- Modify: `src/viewport/__tests__/AircraftModel.test.ts`
- Modify: `src/viewport/AircraftModel.ts` or new asset loader wrapper

**Tests:**

- Model has named parts:
  - `fuselage`
  - `cockpitWindows`
  - `leftWing`, `rightWing`
  - `leftFlap`, `rightFlap`
  - `leftAileron`, `rightAileron`
  - `leftElevator`, `rightElevator`
  - `rudder`
  - `noseGear`, `leftMainGear`, `rightMainGear`
  - `leftFan`, `rightFan`
  - lights
- Bounding box length/span/height are in 737-like ratios.
- Nose/forward, wing, and up axes follow the current ENU-friendly convention.

## Task 3.3 [PARENT-DIRECT]: Replace per-frame clone/remove/add with persistent `AircraftRenderer`

**Objective:** Support richer model assets and animations without per-frame object churn.

**Files:**
- Create: `src/viewport/AircraftRenderer.ts`
- Modify: `src/viewport/ThreeLayer.tsx`
- Test: `src/viewport/__tests__/AircraftRenderer.test.ts`
- Test: `src/__tests__/App.test.tsx`

**Implementation notes:**

- Create model once.
- Add model to bridge once.
- Update transform and animations in place on render tick.
- Clean up once on unmount.
- If three-to-cesium cannot update geospatial transform in place, hide bridge details behind interface and document fallback.

**Tests:**

- `ttc.add` called once.
- `ttc.remove` not called every frame.
- Animation state persists across frames.

## Task 3.4: Implement visual animation state

**Objective:** Make gear, flaps, fans, control surfaces, and lights visibly reflect aircraft state.

**Files:**
- Modify: `src/viewport/aircraftModelAnimation.ts`
- Create: `src/viewport/aircraftVisualState.ts`
- Test: `src/viewport/__tests__/aircraftModelAnimation.test.ts`
- Test: `src/viewport/__tests__/aircraftVisualState.test.ts`

**Implementation notes:**

- Drive from `gearLever`, `gearDown`, gear transition fraction, flap setting, control inputs/effective controls, N1, lights, WOW/AGL.
- Gear compression uses ground state/AGL, not MSL altitude.
- Engine animation rotates fan discs, not nacelles or root.
- Control surfaces visibly deflect with commanded controls.

**Tests:**

- Gear-down false hides/retracts gear.
- Flaps 5/15/30 produce increasing flap deflection.
- Elevator/aileron/rudder surfaces deflect correctly.
- N1 rotates only fan meshes.
- Lights toggle/strobe deterministically for tests.

## Task 3.5: Add Cesium-native runway and airport reference layer

**Objective:** Make the takeoff/landing environment visually simulator-grade enough to judge playability.

**Files:**
- Create: `src/viewport/RunwayLayer.tsx`
- Create: `src/viewport/runwayData.ts`
- Test: `src/viewport/__tests__/RunwayLayer.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/__tests__/App.test.tsx`

**Implementation notes:**

- Do not use a second `three-to-cesium` overlay for runway surfaces.
- Use Cesium-native entities/primitives/ground primitives.
- Add runway pavement, centerline, threshold bars, numbers, edge lights, touchdown zone, simple taxi/apron context.
- Share runway start position/heading with scenario initialization.

**Tests:**

- App mounts runway layer.
- ThreeToCesium overlay count remains one for aircraft.
- KSEA scenario spawn heading matches runway data.

---

# Phase 4: Cockpit, camera, instruments, and UI modes

## Task 4.1 [PARENT-DIRECT]: Extract `CameraManager`

**Objective:** Move chase/cockpit/tower/free camera behavior out of `App.tsx` and make it testable.

**Files:**
- Create: `src/viewport/CameraManager.ts`
- Create: `src/viewport/__tests__/CameraManager.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/viewport/cameraMode.ts`
- Modify: `src/viewport/__tests__/cameraFollow.test.ts`

**Modes:**

- `CHASE`
- `COCKPIT`
- `TOWER`
- `FREE`
- optional `DEBUG_ORBIT`

**Tests:**

- Chase camera stays behind rendered nose across headings.
- Cockpit eye point is inside cockpit but not inside exterior fuselage obstruction.
- Free mode does not call follow `lookAt()` each render.
- Running disables manual camera only in follow modes, not free mode.

## Task 4.2: Add first-person cockpit model shell

**Objective:** Make cockpit mode show a cockpit, not a black obstruction and overlays.

**Files:**
- Create: `src/viewport/CockpitModel.ts`
- Create: `src/viewport/CockpitLayer.tsx`
- Create: `src/viewport/__tests__/CockpitModel.test.ts`
- Modify: `src/App.tsx`

**Initial cockpit minimum:**

- Windshield frame.
- Side window hints.
- Glareshield.
- Basic main panel.
- Yoke/control column.
- Throttle quadrant/pedestal block.
- Simple seats/sidewall silhouette if visible.
- Panel cutouts or screens for PFD/ND/MCP.

**Tests:**

- Cockpit model contains named parts: `windshieldFrame`, `glareshield`, `mainPanel`, `yoke`, `throttleQuadrant`.
- Cockpit is only rendered in cockpit mode.
- Exterior aircraft is hidden or masked in cockpit mode.

## Task 4.3: Add overlay modes and hide debug UI by default

**Objective:** Split developer telemetry from player/cockpit presentation.

**Files:**
- Create: `src/ui/OverlayManager.tsx`
- Create: `src/ui/__tests__/OverlayManager.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/Telemetry.tsx`
- Modify: `src/components/ControlsHelp.tsx`
- Modify: `src/components/FPSMonitor.tsx`

**Modes:**

- `player`: compact speed/alt/phase/cue only.
- `cockpit`: cockpit instruments, no raw telemetry unless debug enabled.
- `debug`: current detailed telemetry/FPS/control help.

**Tests:**

- Cockpit mode does not render `Telemetry` unless debug is enabled.
- Debug toggle shows telemetry/FPS.
- Bottom controls do not overlap Cesium attribution/warnings.

## Task 4.4: Rebuild PFD with FMA and readable tapes

**Objective:** Replace rough debug tapes with cockpit-ready flight instruments.

**Files:**
- Modify or replace: `src/instruments/RfsPFD.tsx`
- Create: `src/instruments/__tests__/RfsPFD.layout.test.tsx`
- Modify: `src/instruments/RfsMCP.tsx` as needed

**Minimum PFD:**

- Integrated attitude horizon.
- Airspeed tape with current value and selected speed bug.
- Altitude tape with current value and selected altitude bug.
- Vertical speed indicator.
- Heading/track strip.
- FMA row: thrust mode, roll mode, pitch mode, AP/FD/AT status.
- Warnings: gear/flap/overspeed/stall/terrain as state becomes available.

**Tests:**

- Major tick spacing is readable.
- FMA reflects guidance state.
- No overlapping labels at representative altitudes/speeds.
- Route unavailable messages are visible when relevant.

## Task 4.5: Add cockpit interaction hooks

**Objective:** Prepare cockpit controls for clickable MCP/knobs/switches without blocking current keyboard controls.

**Files:**
- Create: `src/cockpit/interactions.ts`
- Create: `src/cockpit/__tests__/interactions.test.ts`
- Modify: `src/instruments/RfsMCP.tsx`
- Modify: `src/App.tsx`

**Scope:**

- MCP buttons/knobs can be clicked in both overlay and cockpit modes.
- Mouse-look/pan mode does not accidentally click controls unless pointer locked/interaction mode is active.
- Keyboard focus guard prevents typing route/scenario names from flying the aircraft.

---

# Phase 5: Product loop, route/guidance, and player feedback

## Task 5.1: Add scenario picker and tutorial state

**Objective:** Replace the one-button debug loop with explicit player scenarios.

**Files:**
- Create: `src/scenarios/scenarioTypes.ts`
- Create: `src/scenarios/kseaTakeoff.ts`
- Create: `src/ui/ScenarioPicker.tsx`
- Test: `src/scenarios/__tests__/kseaTakeoff.test.ts`
- Test: `src/ui/__tests__/ScenarioPicker.test.tsx`
- Modify: `src/store/simStore.ts`
- Modify: `src/App.tsx`

**Initial scenarios:**

- KSEA takeoff tutorial.
- KSEA free flight at stable airborne state.
- KSEA-KPDX route demo once guidance is ready.

**Tests:**

- Selecting scenario initializes aircraft, weather, runway, weight, fuel, flaps, trim, and UI state.
- Reset returns to selected scenario.

## Task 5.2: Add checklist/coach flow

**Objective:** Guide the player through takeoff instead of relying on debug telemetry and tiny cues.

**Files:**
- Create: `src/gameplay/checklist.ts`
- Create: `src/gameplay/__tests__/checklist.test.ts`
- Create: `src/ui/ChecklistCoach.tsx`
- Test: `src/ui/__tests__/ChecklistCoach.test.tsx`
- Modify: `src/App.tsx`

**Takeoff tutorial checklist:**

1. Flaps 5 set.
2. Brakes released / thrust set.
3. 80 kt callout.
4. Rotate at Vr.
5. Positive rate: gear up.
6. Acceleration altitude: flaps retract schedule.
7. Climb power / engage route if available.

**Tests:**

- Checklist advances from state, not timers only.
- Gear-up prompt becomes actionable after positive rate.
- If gear remains down too long, warning escalates.

## Task 5.3 [PARENT-DIRECT]: Create store-owned guidance/route/AP truth state

**Objective:** Keep player guidance, route feedback, and AP/FMA truth synchronized without hiding route/AP state inside the tutorial/checklist projection.

**Implemented files:**
- Create: `src/sim/guidanceState.ts`
- Modify: `src/store/simStore.ts`
- Modify: `src/instruments/RfsMCP.tsx`
- Modify: `src/instruments/RfsPFD.tsx`
- Modify: `src/sim/systems/autopilot.ts`
- Test: `src/sim/__tests__/guidanceState.test.ts`
- Test: `src/instruments/__tests__/RfsMCP.test.tsx`

**Current state ownership:**

- `guidance`: scenario phase, tutorial state, checklist, coach message, and alerts.
- `apState.truth`: active FMA/AP modes used by the PFD and servo laws.
- `routeStatus`: active leg, route validity, next waypoint, distance, track, ETA, and LNAV availability.
- `pilotInputs`, `apCommands`, and `effectiveControls`: separate pilot/AP/control ownership fields.

**Tests:**

- Guidance phase follows scenario/status/aircraft/control state.
- First MCP clicks create AP state and engage the clicked mode.
- OFF truly sets AP/FMA status OFF.
- PFD FMA reads the same AP truth state used by guidance laws.

## Task 5.4: Implement route active leg and LNAV feedback

**Objective:** Make LOAD PLAN produce a visible, believable route workflow.

**Files:**
- Modify: `src/sim/systems/navigation.ts`
- Modify: `src/sim/flightPlanLoader.ts`
- Modify: `src/store/simStore.ts`
- Create: `src/ui/RouteStatus.tsx`
- Test: `src/sim/systems/__tests__/navigation.test.ts`
- Test: `src/ui/__tests__/RouteStatus.test.tsx`

**Implementation notes:**

- Store `activeLegIndex`.
- Sequence waypoints by capture radius and passed-waypoint geometry.
- Show next waypoint, distance, track, ETA rough estimate.
- Validate missing coordinates and discontinuities.
- Show “LNAV unavailable” reasons.

## Task 5.5: Implement VNAV/SPD/VS honestly or hide unsupported modes

**Objective:** Avoid simulator-looking buttons that do not actually work.

**Files:**
- Modify: `src/instruments/RfsMCP.tsx`
- Modify: `src/sim/systems/vnav.ts`
- Modify: `src/sim/systems/autopilot.ts`
- Test: `src/sim/systems/__tests__/vnav.test.ts`
- Test: `src/sim/systems/__tests__/autopilot.test.ts`

**Rule:**

- If a mode has no law, disable/hide it with tooltip/status message.
- If enabled, it must write guidance state, show FMA, and command the aircraft through rate-limited AP outputs.

---

# Phase 6: Scenery, weather, sound, performance, and release hardening

## Task 6.1: Cesium token/degraded scene policy

**Objective:** Remove the visible default-token warning from normal user flow and make no-token behavior deliberate.

**Files:**
- Modify: `src/config/cesium.ts`
- Modify: `src/viewport/CesiumViewport.tsx`
- Create: `src/components/SceneryStatus.tsx`
- Test: `src/config/__tests__/cesium.test.ts`
- Test: `src/viewport/__tests__/CesiumViewport.test.tsx`

**Tests:**

- With token: terrain/buildings requested.
- Without token: no Ion-only request is made, degraded scenery banner appears, no default-token warning overlaps controls.

## Task 6.2: Deduplicate Three.js

**Objective:** Remove the runtime duplicate Three warning and reduce subtle rendering risk.

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `vite.config.ts`
- Test/command: `npm ls three`

**Implementation notes:**

- Try package override to force one compatible Three version.
- Add `resolve.dedupe: ['three']` if Vite still bundles duplicates.
- If `three-to-cesium` requires nested Three, consider a fork or replacement bridge.

**Commands:**

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm ls three
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check
```

Expected: one Three version if compatible; no browser console duplicate warning.

## Task 6.3: Add deterministic visual regression snapshots

**Objective:** Prevent future “passes tests but looks unusable” regressions.

**Files:**
- Create: `src/e2e/playability.spec.ts` or equivalent chosen e2e path
- Create: `docs/testing/visual-regression.md`
- Modify: `package.json` scripts

**Scenarios:**

- Initial KSEA runway start.
- START ROLL at 80 kt.
- Rotate/liftoff.
- Gear-up climb.
- Cockpit mode.
- Tower/free mode.

**Acceptance:**

- Screenshots show aircraft/runway/cockpit, not black/blank/sideways states.
- Console has no JS errors.

## Task 6.4 [PARENT-DIRECT]: Fixed timestep / worker migration after contracts stabilize

**Objective:** Decouple physics determinism from render refresh and prepare for better visuals without main-thread stalls.

**Files:**
- Create: `src/worker/codec.ts`
- Create: `src/worker/physics.worker.ts`
- Create: `src/worker/bridge.ts`
- Modify: `src/store/simStore.ts`
- Modify: `vite.config.ts`
- Test: `src/worker/__tests__/codec.test.ts`
- Test: `src/worker/__tests__/bridge.test.ts`

**Prerequisite:** Do not start until Phase 1/2 state contracts are stable.

**Tests:**

- Codec round-trips all fields.
- Fixed 120 Hz worker loop produces deterministic state for fixed inputs.
- Main thread can start/pause/resume/reset/dispose.
- Inputs/weather/guidance updates are applied on worker ticks.

## Task 6.5: Audio immersion pass

**Objective:** Make cockpit/external audio support the new visual realism.

**Files:**
- Modify: `src/audio/EngineSound.ts`
- Modify: `src/audio/GPWS.ts`
- Create: `src/audio/Callouts.ts`
- Test: `src/audio/__tests__/EngineSound.test.ts`
- Test: `src/audio/__tests__/Callouts.test.ts`

**Scope:**

- Engine spool samples/synthesis less harsh than sawtooth-only.
- Cockpit muffling vs external camera.
- 80 kt, V1/rotate, positive rate callouts.
- Gear/flap/config warnings.

---

# Execution strategy

## Recommended first sprint

Do these before touching visuals, because they define whether flying feels real:

1. Task 0.1 scenario helpers.
2. Task 0.2 failing realism envelope tests.
3. Task 1.1 ground state.
4. Task 1.2 runway-normal velocity constraint.
5. Task 1.3 normal-force liftoff.
6. Task 1.4 remove core attitude assist.
7. Run browser dogfood and update review with new telemetry.

## Recommended parallel visual sprint

Can run while physics sprint is underway, but should not claim overall “playable” until physics sprint passes:

1. Task 3.1 asset strategy.
2. Task 3.2 visual contract tests.
3. Task 4.1 CameraManager design/tests.
4. Task 4.3 overlay mode tests.

## Commit discipline

Commit after each task or small tightly-coupled pair:

```bash
git add <files>
git commit -m "test: add takeoff realism scenario harness"
git commit -m "fix: constrain runway-normal velocity on ground"
git commit -m "feat: add aircraft visual state animations"
```

Before pushing code to `master`:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check
git status --short --branch
```

After pushing code to `master`, wait for CI and verify live before claiming success.

## Stop conditions

Stop and reassess if:

- More than two realism tests require loosening to pass.
- Ground/contact fixes create negative altitude or below-terrain states.
- Cockpit mode still shows exterior fuselage obstruction after CameraManager/CockpitLayer work.
- `npm run check` passes but browser dogfood fails the checklist.
- A subagent attempts to refactor `integrate.ts`, `simStore.ts`, or renderer lifecycle without parent review.
