# RFS Playability Recovery Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Make the core player loop usable: reset -> visible runway -> takeoff roll -> rotate -> positive climb -> stable camera/control recovery -> repeat.

**Architecture:** Fix the deterministic physics blocker first, then add a minimal phase-aware takeoff contract and player feedback before deeper ground-model realism. Keep changes TDD-first and avoid autopilot tuning until the manual player loop works.

**Tech Stack:** React 19, TypeScript strict, Vite, Vitest, Zustand, CesiumJS, Three.js, RFS TypeScript 6-DOF physics.

---

## Scope guard

Do not start with autopilot tuning, scenery polish, or worker physics. The first usable slice is manual takeoff reliability.

Node commands must use Node 22:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
```

Primary quality commands:

```bash
npm run test -- src/sim/systems/__tests__/ground.test.ts src/sim/physics/__tests__/integrate.test.ts src/store/__tests__/simStore.test.ts src/input/__tests__/GamepadManager.test.ts src/__tests__/App.test.tsx
npm run typecheck
```

---

## Task 1: Add frame-rate regression tests for takeoff roll

**Objective:** Prove the current takeoff roll is broken at high refresh rates before changing implementation.

**Files:**
- Modify: `src/sim/physics/__tests__/integrate.test.ts`

**Step 1: Write failing tests**

Add helper near existing takeoff-roll tests:

```ts
function takeoffRollInputs(): ControlInputs {
  return {
    ...idle,
    throttle1: 1,
    throttle2: 1,
    flapLever: 5,
    gearLever: 'DOWN',
  };
}

function runTakeoffRoll(hz: number, seconds: number) {
  const s = createInitialState(B737_800_SPEC);
  const inputs = takeoffRollInputs();
  for (let i = 0; i < seconds * hz; i++) {
    integrate(s, inputs, B737_800_SPEC, 1 / hz);
  }
  return s;
}
```

Add tests:

```ts
it('full-throttle takeoff roll accelerates at 120 Hz', () => {
  const s = runTakeoffRoll(120, 20);
  expect(s.velocity.u).toBeGreaterThan(25); // ~49 kt
  expect(s.position.alt).toBeGreaterThanOrEqual(KSEA_RUNWAY_ALT_FT - 0.01);
  expect(s.config.gearDown).toBe(true);
});

it('full-throttle takeoff roll accelerates at 144 Hz', () => {
  const s = runTakeoffRoll(144, 20);
  expect(s.velocity.u).toBeGreaterThan(25);
  expect(s.position.alt).toBeGreaterThanOrEqual(KSEA_RUNWAY_ALT_FT - 0.01);
  expect(s.config.gearDown).toBe(true);
});
```

**Step 2: Run tests to verify RED**

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test -- src/sim/physics/__tests__/integrate.test.ts
```

Expected: the new 120/144 Hz tests fail with `velocity.u` at or near `0`.

**Step 3: Do not edit implementation in this task**

Commit only the failing tests if following strict task commits, or keep uncommitted and proceed directly to Task 2 in one branch.

---

## Task 2: Fix the ground stop epsilon so thrust can break away at high FPS

**Objective:** Stop snapping tiny forward speed to zero when full throttle is trying to accelerate the aircraft.

**Files:**
- Modify: `src/sim/systems/ground.ts`
- Test: `src/sim/physics/__tests__/integrate.test.ts`
- Test: `src/sim/systems/__tests__/ground.test.ts`

**Step 1: Add focused ground tests**

In `src/sim/systems/__tests__/ground.test.ts`, add:

```ts
it('does not snap tiny forward speed to zero when takeoff thrust is commanded', () => {
  const state = createInitialState(B737_800_SPEC);
  state.position.alt = KSEA_RUNWAY_ALT_FT;
  state.velocity.u = 0.03;
  state.config.gearDown = true;

  const takeoff: ControlInputs = {
    ...idle,
    throttle1: 1,
    throttle2: 1,
    flapLever: 5,
    gearLever: 'DOWN',
  };

  applyGroundContact(state, takeoff, 1 / 120);

  expect(state.velocity.u).toBeGreaterThan(0);
});

it('still snaps an idle nearly-stopped aircraft to zero', () => {
  const state = createInitialState(B737_800_SPEC);
  state.position.alt = KSEA_RUNWAY_ALT_FT;
  state.velocity.u = 0.03;
  state.config.gearDown = true;

  applyGroundContact(state, idle, 1 / 120);

  expect(state.velocity.u).toBe(0);
});
```

**Step 2: Run tests to verify RED**

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test -- src/sim/systems/__tests__/ground.test.ts src/sim/physics/__tests__/integrate.test.ts
```

Expected: high-FPS acceleration and tiny-thrust breakaway tests fail.

**Step 3: Implement minimal fix**

In `src/sim/systems/ground.ts`, replace the early stop block in `applyLongitudinalGroundDecel()` with throttle-aware logic.

Implementation shape:

```ts
function hasForwardThrustCommand(inputs: ControlInputs): boolean {
  return Math.max(inputs.throttle1, inputs.throttle2) > 0.05;
}

function applyLongitudinalGroundDecel(state: AircraftState, inputs: ControlInputs, dt: number): void {
  const speed = state.velocity.u;
  const brake = clamp01(inputs.brake);
  const thrustCommanded = hasForwardThrustCommand(inputs);

  if (Math.abs(speed) <= STOP_EPSILON_MPS && !thrustCommanded) {
    state.velocity.u = 0;
    return;
  }

  const decel = (ROLLING_FRICTION_ACCEL_MPS2 + brake * MAX_BRAKE_ACCEL_MPS2) * Math.max(0, dt);

  if (speed > 0) {
    state.velocity.u = Math.max(0, speed - decel);
  } else if (speed < 0) {
    state.velocity.u = Math.min(0, speed + decel);
  } else if (!thrustCommanded) {
    state.velocity.u = 0;
  }
}
```

If this still zeros the first few frames because decel is larger than speed, adjust with a static-friction breakaway rule rather than removing rolling friction completely. Keep the tests as the contract.

**Step 4: Run tests to verify GREEN**

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test -- src/sim/systems/__tests__/ground.test.ts src/sim/physics/__tests__/integrate.test.ts
```

Expected: all ground/integrate tests pass, including the new high-FPS cases.

**Step 5: Run focused regression gate**

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test -- src/sim/systems/__tests__/ground.test.ts src/sim/physics/__tests__/integrate.test.ts src/store/__tests__/simStore.test.ts src/input/__tests__/GamepadManager.test.ts src/__tests__/App.test.tsx
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run typecheck
```

---

## Task 3: Add a repeatable TAKEOFF browser/store regression

**Objective:** Prove RESET + TAKEOFF works repeatedly at high FPS instead of only once.

**Files:**
- Modify: `src/store/__tests__/simStore.test.ts`

**Step 1: Write failing or protective test**

Add a store-level test that simulates two takeoff attempts with 120 Hz timestamps:

```ts
it('reset then repeated takeoff roll accelerates at high frame rate', () => {
  const store = useSimStore.getState();

  for (let attempt = 0; attempt < 2; attempt++) {
    store.reset();
    useSimStore.getState().setInput({
      throttle1: 1,
      throttle2: 1,
      flapLever: 5,
      gearLever: 'DOWN',
      brake: 0,
      elevator: 0,
    });
    useSimStore.getState().start();

    for (let i = 0; i < 20 * 120; i++) {
      useSimStore.getState().tick(i * (1000 / 120));
    }

    expect(useSimStore.getState().aircraft.velocity.u).toBeGreaterThan(25);
  }
});
```

**Step 2: Run test**

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test -- src/store/__tests__/simStore.test.ts
```

Expected after Task 2: pass.

---

## Task 4: Make TAKEOFF semantics explicit in UI copy

**Objective:** Stop promising a full takeoff when the button currently starts the roll.

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/__tests__/App.test.tsx`

**Step 1: Update test first**

Change App test expectations so the primary button is `START ROLL` instead of `TAKEOFF`, unless implementing assisted takeoff immediately.

Expected UI contract:

- Initial/stopped primary button: `START ROLL`
- Running primary button: `PAUSE`
- Help text includes `Rotate: hold W after Vr` or equivalent.

**Step 2: Run App test for RED**

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test -- src/__tests__/App.test.tsx
```

Expected: fails before UI copy changes.

**Step 3: Implement minimal UI copy**

- Rename button text from `TAKEOFF` to `START ROLL`.
- Update `ControlsHelp` text if it owns the copy; otherwise update local UI/help strings.
- Keep the handler name if desired, but prefer `handleStartRoll` for clarity.

**Step 4: Run App test for GREEN**

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test -- src/__tests__/App.test.tsx
```

---

## Task 5: Add visible flight phase / rotate cue state

**Objective:** Give the player a clear “what do I do now?” indicator during the roll.

**Files:**
- Modify: `src/sim/types.ts`
- Modify: `src/store/simStore.ts`
- Modify: `src/components/Telemetry.tsx`
- Test: `src/store/__tests__/simStore.test.ts`
- Test: `src/components/__tests__/Telemetry.test.tsx`

**Step 1: Extend phase model minimally**

Either keep existing `TAKEOFF` or add more precise phases:

```ts
export type FlightPhase =
  | 'PARKED'
  | 'TAKEOFF_ROLL'
  | 'ROTATE'
  | 'CLIMB'
  | 'CRUISE'
  | 'DESCENT'
  | 'APPROACH'
  | 'LANDED';
```

If this causes too much churn, use existing `TAKEOFF` first and add derived cue text without changing the union.

**Step 2: Write tests**

Store test:

- start roll from reset sets phase to `TAKEOFF_ROLL`/`TAKEOFF`.
- at a chosen rotate speed threshold, UI/derived cue says `ROTATE`.

Telemetry test:

- phase/cue text renders.

**Step 3: Implement minimal state update**

Add a store action or helper such as `startTakeoffRoll()` instead of only `setInput()+start()`.

Pseudo-flow:

```ts
startTakeoffRoll: () => set((s) => ({
  inputs: { ...s.inputs, throttle1: 1, throttle2: 1, flapLever: 5, gearLever: 'DOWN', brake: 0, elevator: 0 },
  aircraft: { ...s.aircraft, flightPhase: 'TAKEOFF_ROLL' },
  status: 'running',
  lastFrameTime: 0,
}))
```

Use `structuredClone` if nested mutation gets awkward.

---

## Task 6: Add minimal rotate/positive-rate contract

**Objective:** Prove manual rotation can produce stable positive climb from the start-roll path.

**Files:**
- Modify: `src/sim/physics/__tests__/integrate.test.ts`
- Modify: `src/sim/physics/integrate.ts` only if the test exposes a physics bug
- Modify: `src/sim/systems/ground.ts` only if contact release is the blocker

**Step 1: Write test**

Add a test that runs:

1. Full throttle/flaps 5/gear down at 120 Hz until Vr-ish speed.
2. Hold pitch-up (`elevator: -0.5`) for a short interval.
3. Assert altitude and vertical speed become positive without negative pitch runaway.

Example:

```ts
it('manual rotation after takeoff roll produces positive climb', () => {
  const s = createInitialState(B737_800_SPEC);
  const roll = takeoffRollInputs();

  for (let i = 0; i < 25 * 120; i++) integrate(s, roll, B737_800_SPEC, 1 / 120);

  const rotate: ControlInputs = { ...roll, elevator: -0.5 };
  for (let i = 0; i < 3 * 120; i++) integrate(s, rotate, B737_800_SPEC, 1 / 120);

  expect(s.position.alt).toBeGreaterThan(KSEA_RUNWAY_ALT_FT + 20);
  expect(s.attitude.theta).toBeGreaterThan(0);
});
```

**Step 2: Run RED/GREEN**

If it fails, inspect whether contact clamp, moment sign, or high-FPS roll fix is still wrong. Do not guess; trace with systematic-debugging.

---

## Task 7: Gear interlock and crash guard tests

**Objective:** Prevent the user from immediately converting a takeoff into a below-terrain gear-up dive.

**Files:**
- Modify: `src/sim/physics/__tests__/integrate.test.ts`
- Modify: `src/sim/systems/ground.ts`
- Modify: `src/sim/types.ts` if adding crash/contact state

**Step 1: Tests**

Add tests for:

- Gear-up command while weight-on-wheels keeps `config.gearDown === true`.
- Gear-up after positive climb is allowed.
- Gear-up below ground without gear contact produces a controlled crash/landed/stopped state, not negative altitude tunneling.

**Step 2: Minimal implementation**

If no full crash state yet, at least clamp gear-up below runway to runway altitude and pause/mark landed/crashed. Do not silently continue below terrain.

---

## Task 8: Make runway/spawn visible and aligned

**Objective:** Start the player on a visible runway with a correct heading.

**Files:**
- Create: `src/sim/scenario/ksea.ts`
- Modify: `src/sim/types.ts`
- Modify: `src/App.tsx`
- Test: `src/sim/__tests__/scenario.test.ts`

**Step 1: Extract scenario data**

Create a shared KSEA runway scenario:

```ts
export const KSEA_16C_START = {
  runway: '16C',
  lat: 47.4468,
  lon: -122.3100,
  altFt: 432,
  headingDeg: 163,
};
```

**Step 2: Tests**

- Initial state heading matches scenario heading within tolerance.
- Initial lat/lon are the scenario start.
- Telemetry heading displays normalized heading.

**Step 3: Implementation**

Use scenario data in `createInitialState()` or add `createInitialScenarioState()` and update store reset.

---

## Task 9: Reintroduce runway rendering safely

**Objective:** Show runway pavement/centerline without reintroducing the old three-to-cesium foreground slab issue.

**Files:**
- Create/modify: `src/viewport/RunwayLayer.tsx`
- Modify: `src/App.tsx`
- Test: `src/__tests__/App.test.tsx`

**Step 1: Use Cesium-native primitives/entities**

Do not mount the old `AirportLayer` Three overlay directly. It is known to render ground surfaces over imagery without depth/terrain integration.

**Step 2: Tests**

- App renders the runway layer.
- App still only mounts one `ThreeToCesium` aircraft/effects overlay if existing test expects that invariant.

**Step 3: Browser verification**

- Initial screenshot shows runway/centerline/aircraft alignment.

---

## Task 10: Fix gamepad pitch and throttle ownership

**Objective:** Prevent connected controllers from making the sim feel impossible or inverted.

**Files:**
- Modify: `src/input/GamepadManager.ts`
- Modify: `src/input/__tests__/GamepadManager.test.ts`

**Step 1: Tests**

- Gamepad pull-back (`leftY > 0`) returns elevator `< 0` if default aircraft convention is nose-up negative.
- Gamepad push-forward (`leftY < 0`) returns elevator `> 0`.
- Trigger release does not emit `{ throttle1: 0, throttle2: 0 }` unless explicit throttle-clear mode exists.
- Neutral gamepad after TAKEOFF does not overwrite throttle.

**Step 2: Implementation**

- Invert pitch axis: `inputs.elevator = -leftY * 0.7`.
- Track previously emitted self-centering axes separately from latched throttle fields.
- Only clear elevator/aileron/rudder on neutral; preserve throttle unless explicit throttle input changes.

---

## Task 11: Clarify keyboard help and rotate control

**Objective:** Make it obvious which key rotates/noses up.

**Files:**
- Modify: `src/components/ControlsHelp.tsx`
- Test: `src/__tests__/App.test.tsx` or component test if one exists

**Step 1: Test**

Assert help text includes:

- `W rotate/nose up`
- `S nose down`
- `G gear after positive rate`

**Step 2: Implementation**

Update help copy. If choosing conventional game mapping instead, change tests and `keyboardControls.ts` together after explicit decision.

---

## Task 12: Add free camera recovery mode

**Objective:** Give the player a way to recover visual reference while running.

**Files:**
- Modify: `src/viewport/cameraMode.ts`
- Modify: `src/App.tsx`
- Test: `src/viewport/__tests__/cameraMode.test.ts`
- Test: `src/__tests__/App.test.tsx` if camera mocks support it

**Step 1: Tests**

- `shouldAutoFollowCamera('running', 'free')` returns false.
- `shouldAutoFollowCamera('running', 'chase')` returns true.
- Camera cycle includes FREE.

**Step 2: Implementation**

- Extend camera mode union with `'free'`.
- Cycle chase -> cockpit/instrument -> tower -> free -> chase.
- Set `viewer.scene.screenSpaceCameraController.enableInputs = true` in free mode even while running.

---

## Task 13: Make LOAD PLAN and first MCP click visible/trustworthy

**Objective:** Avoid user actions that appear to do nothing.

**Files:**
- Modify: `src/instruments/RfsMCP.tsx`
- Modify: `src/App.tsx`
- Create tests if absent: `src/instruments/__tests__/RfsMCP.test.tsx`
- Modify: `src/__tests__/App.test.tsx`

**Step 1: Tests**

- First click on HDG initializes AP and sets `truth.lateralActive = 'HDG_SEL'`, `autopilotStatus = 'CMD_A'`.
- OFF sets `autopilotStatus = 'OFF'`.
- LOAD PLAN from reset renders visible `ROUTE KSEA -> KPDX` or `ROUTE LOADED / AP OFF` status.

**Step 2: Implementation**

- Extract `createDefaultApState()` helper.
- In `toggleMode`, create default AP state and continue applying the requested mode instead of returning early.
- OFF branch must set `autopilotStatus = 'OFF'`.
- Add simple route/AP status text in MCP or a new FMA strip.

---

## Task 14: Add minimal browser dogfood checklist to docs/reviews

**Objective:** Prevent future “tests green but unplayable” regressions.

**Files:**
- Modify: `docs/reviews/2026-05-25-playability-follow-up.md` or create a new current review
- Modify: `docs/roadmap.md` if needed

**Checklist:**

- Initial load screenshot: runway and aircraft visible.
- TAKEOFF/START ROLL at high FPS: IAS increases within 10 seconds.
- RESET + second START ROLL repeats.
- Rotate: positive climb and stable attitude.
- Gear up only after positive rate.
- Camera free mode can recover view.
- LOAD PLAN displays route status.

---

## Task 15: Full verification before reporting complete

**Objective:** Verify at automated and player-visible layers.

**Commands:**

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check
```

Browser verification:

1. Start dev server:
   ```bash
   source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run dev -- --host 127.0.0.1
   ```
2. Open local app.
3. Capture initial screenshot.
4. Click START ROLL/TAKEOFF.
5. At 10 seconds: IAS/GS > 30 kt.
6. At 20 seconds: IAS/GS still increasing; altitude not below runway.
7. Rotate: hold W for 2-3 seconds; pitch and altitude increase stably.
8. Gear up only after positive rate.
9. RESET and repeat once.
10. Cycle camera modes including FREE.
11. LOAD PLAN and MCP first-click behavior show visible status.

If pushed/deployed later, do not report deployment success until GitHub Actions completes with conclusion `success` and `curl https://fly.reidar.tech/` verifies the live endpoint.
