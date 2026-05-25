# RFS Playable Takeoff Foundation Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task. Tasks marked `[PARENT-DIRECT]` touch the physics heartbeat (`types.ts`, `integrate.ts`, `simStore.ts`, or `App.tsx` camera/startup flow) and should be executed directly by the parent session, not by a subagent.

**Goal:** Make the player-facing TAKEOFF path stop falling through terrain and become a controllable runway-roll/early-flight experience.

**Architecture:** Add a small deterministic ground-contact system to the existing main-thread physics heartbeat before attempting deeper flight-model tuning. Keep the first playable slice YAGNI: flat KSEA runway elevation, weight-on-wheels clamp, rolling/braking friction, gear-on-ground interlock, safer TAKEOFF inputs, input arbitration, and camera safety. Defer full oleo geometry, tire slip curves, anti-skid, RFMS guidance, worker physics, and cockpit modeling until this foundation is green and live-verified.

**Tech Stack:** React 19, TypeScript strict, Zustand 5, Vitest 4, CesiumJS, Three.js, three-to-cesium, Node 22 via nvm.

---

## Source material read before planning

- `docs/architecture.md` — current runtime heartbeat and known gaps.
- `docs/physics-invariants.md` — body/NED signs, quaternion contract, wind contract, system order.
- `docs/roadmap.md` — P1 already identifies ground model as the next required enhancement.
- `docs/reviews/2026-05-25-playability-review.md` — live browser evidence and prioritized findings.
- `src/App.tsx`, `src/store/simStore.ts`, `src/sim/physics/integrate.ts`, `src/sim/physics/aero.ts`, `src/sim/types.ts`, `src/input/GamepadManager.ts`, `src/viewport/CesiumViewport.tsx`, `src/viewport/ThreeLayer.tsx`, `src/instruments/RfsPFD.tsx`, `src/instruments/RfsMCP.tsx`.

## Runtime heartbeat risk audit

Current heartbeat:

```text
src/App.tsx
  -> useSimLoop()
    -> useSimStore.tick(timestamp)
      -> structuredClone(aircraft)
      -> integrate(state, inputs, spec, dt, apState, flightPlan, wind)
        -> updateEngines
        -> updateFuel
        -> updateElectrical
        -> updateHydraulic
        -> computeAero
        -> integrate angular rates, quaternion, velocity, position
        -> updateAutopilot for next-frame inputs
      -> set({ aircraft: state })
```

Risk rules for this plan:

- Any task touching `integrate.ts`, `types.ts`, or `simStore.ts` is `[PARENT-DIRECT]` because subtle sign/order mistakes can pass shallow tests but break flight behavior.
- Preserve body axes: x forward, y right, z down. Positive `w` is down.
- Preserve NED down-positive and display VS positive-up.
- Preserve wind contract: wind affects air-relative aero/derived values, not ground velocity mutation.
- Preserve system order from `docs/physics-invariants.md`; ground contact is applied after free-flight position integration as a post-solve constraint for this first YAGNI slice.
- Browser verification is mandatory before calling this playable. Unit tests are not enough.

## Dependency map

```text
Tasks 1-5: ground contact + integrate.ts -> MUST serialize, PARENT-DIRECT
Tasks 6-7: App TAKEOFF behavior + smoke test -> MUST follow Tasks 1-5, PARENT-DIRECT
Tasks 8-10: input fixes -> can be subagent tasks, but serialize if touching App.tsx
Tasks 11-12: camera/terrain safety -> serialize because both touch viewport/App behavior
Tasks 13-14: HUD/help + final docs/browser verification -> after all behavior tasks
```

Do not parallelize tasks that commit to the same repo. If using subagents, tell them not to commit; the controller commits after verification, or run subagents serially.

---

## Task 1 [PARENT-DIRECT]: Add failing ground-contact unit tests

**Objective:** Define the minimum ground-contact contract before writing production code.

**Files:**
- Create: `src/sim/systems/__tests__/ground.test.ts`
- Later create: `src/sim/systems/ground.ts`

**Step 1: Write failing test**

Create `src/sim/systems/__tests__/ground.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { createInitialState, B737_800_SPEC } from '../../types';
import type { ControlInputs } from '../../types';
import { applyGroundContact, KSEA_RUNWAY_ALT_FT } from '../ground';

const idle: ControlInputs = {
  elevator: 0,
  aileron: 0,
  rudder: 0,
  throttle1: 0,
  throttle2: 0,
  flapLever: 0,
  gearLever: 'DOWN',
  spoilers: 0,
  brake: 0,
};

describe('applyGroundContact', () => {
  it('clamps a gear-down aircraft to the KSEA runway instead of letting it sink', () => {
    const state = createInitialState(B737_800_SPEC);
    state.position.alt = KSEA_RUNWAY_ALT_FT - 25;
    state.velocity.w = 7;
    state.config.gearDown = true;

    const contact = applyGroundContact(state, idle, 1 / 60);

    expect(contact.weightOnWheels).toBe(true);
    expect(contact.groundAltFt).toBe(KSEA_RUNWAY_ALT_FT);
    expect(state.position.alt).toBe(KSEA_RUNWAY_ALT_FT);
    expect(state.velocity.w).toBe(0);
  });

  it('does not clamp an aircraft that is clearly above the runway', () => {
    const state = createInitialState(B737_800_SPEC);
    state.position.alt = KSEA_RUNWAY_ALT_FT + 500;
    state.velocity.w = 5;
    state.config.gearDown = true;

    const contact = applyGroundContact(state, idle, 1 / 60);

    expect(contact.weightOnWheels).toBe(false);
    expect(state.position.alt).toBe(KSEA_RUNWAY_ALT_FT + 500);
    expect(state.velocity.w).toBe(5);
  });

  it('applies rolling and brake deceleration on the runway without reversing direction', () => {
    const state = createInitialState(B737_800_SPEC);
    state.position.alt = KSEA_RUNWAY_ALT_FT;
    state.velocity.u = 20;
    state.config.gearDown = true;
    const braking: ControlInputs = { ...idle, brake: 1 };

    applyGroundContact(state, braking, 1);

    expect(state.velocity.u).toBeGreaterThanOrEqual(0);
    expect(state.velocity.u).toBeLessThan(20);
  });
});
```

**Step 2: Run test to verify failure**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npm run test -- src/sim/systems/__tests__/ground.test.ts
```

Expected: FAIL — module `../ground` does not exist.

**Step 3: Do not implement in this task**

Stop after confirming RED. Implementation is Task 2.

**Step 4: Commit**

Do not commit yet if the RED test is failing. Commit after Task 2 turns it green.

---

## Task 2 [PARENT-DIRECT]: Implement minimal ground-contact system

**Objective:** Add a small pure/mutating ECS-style system that clamps gear-down aircraft to KSEA runway elevation and applies ground friction/braking.

**Files:**
- Create: `src/sim/systems/ground.ts`
- Test: `src/sim/systems/__tests__/ground.test.ts`

**Step 1: Write minimal implementation**

Create `src/sim/systems/ground.ts`:

```typescript
import type { AircraftState, ControlInputs } from '../types';

export const KSEA_RUNWAY_ALT_FT = 432;

const GROUND_EPSILON_FT = 0.5;
const ROLLING_FRICTION_ACCEL_MPS2 = 0.35;
const MAX_BRAKE_ACCEL_MPS2 = 6.0;
const STOP_EPSILON_MPS = 0.05;

export interface GroundContactResult {
  weightOnWheels: boolean;
  groundAltFt: number;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function applyLongitudinalGroundDecel(state: AircraftState, inputs: ControlInputs, dt: number): void {
  const speed = state.velocity.u;
  if (Math.abs(speed) <= STOP_EPSILON_MPS) {
    state.velocity.u = 0;
    return;
  }

  const brake = clamp01(inputs.brake);
  const decel = (ROLLING_FRICTION_ACCEL_MPS2 + brake * MAX_BRAKE_ACCEL_MPS2) * Math.max(0, dt);

  if (speed > 0) {
    state.velocity.u = Math.max(0, speed - decel);
  } else {
    state.velocity.u = Math.min(0, speed + decel);
  }
}

export function applyGroundContact(
  state: AircraftState,
  inputs: ControlInputs,
  dt: number,
  groundAltFt = KSEA_RUNWAY_ALT_FT,
): GroundContactResult {
  const gearAvailableForContact = state.config.gearDown || inputs.gearLever === 'DOWN';
  const atOrBelowGround = state.position.alt <= groundAltFt + GROUND_EPSILON_FT;

  if (!gearAvailableForContact || !atOrBelowGround) {
    return { weightOnWheels: false, groundAltFt };
  }

  state.position.alt = groundAltFt;
  state.config.gearDown = true;

  if (state.velocity.w > 0) {
    state.velocity.w = 0;
  }

  applyLongitudinalGroundDecel(state, inputs, dt);

  return { weightOnWheels: true, groundAltFt };
}
```

**Step 2: Run test to verify pass**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npm run test -- src/sim/systems/__tests__/ground.test.ts
```

Expected: PASS — 3 tests pass.

**Step 3: Commit**

```bash
git add src/sim/systems/ground.ts src/sim/systems/__tests__/ground.test.ts
git commit -m "feat: add minimal runway ground contact"
```

---

## Task 3 [PARENT-DIRECT]: Integrate ground contact into the physics heartbeat

**Objective:** Prevent the live TAKEOFF path from sinking below the KSEA runway by applying ground contact after position integration.

**Files:**
- Modify: `src/sim/physics/integrate.ts:1-140`
- Modify: `src/sim/physics/__tests__/integrate.test.ts`

**Step 1: Write failing integrate tests**

Modify `src/sim/physics/__tests__/integrate.test.ts`:

Add this import near the existing imports:

```typescript
import { KSEA_RUNWAY_ALT_FT } from '../../systems/ground';
```

Add these tests inside `describe('integrate', () => { ... })`:

```typescript
  it('keeps a stopped gear-down aircraft on the runway instead of sinking below terrain', () => {
    const s = createInitialState(B737_800_SPEC);
    s.position.alt = KSEA_RUNWAY_ALT_FT;
    s.velocity.u = 0;
    s.velocity.v = 0;
    s.velocity.w = 0;
    s.config.gearDown = true;

    for (let i = 0; i < 120; i++) {
      integrate(s, idle, B737_800_SPEC, 1 / 60);
    }

    expect(s.position.alt).toBeGreaterThanOrEqual(KSEA_RUNWAY_ALT_FT - 0.01);
    expect(s.velocity.w).toBeGreaterThanOrEqual(0);
    expect(s.velocity.w).toBeLessThan(0.1);
  });

  it('keeps full-throttle takeoff roll on the runway before rotation speed', () => {
    const s = createInitialState(B737_800_SPEC);
    const takeoffRoll: ControlInputs = {
      ...idle,
      throttle1: 1,
      throttle2: 1,
      flapLever: 5,
      gearLever: 'DOWN',
    };

    for (let i = 0; i < 5 * 60; i++) {
      integrate(s, takeoffRoll, B737_800_SPEC, 1 / 60);
    }

    expect(s.position.alt).toBeGreaterThanOrEqual(KSEA_RUNWAY_ALT_FT - 0.01);
    expect(s.velocity.u).toBeGreaterThan(5);
    expect(s.config.gearDown).toBe(true);
  });
```

**Step 2: Run test to verify failure**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npm run test -- src/sim/physics/__tests__/integrate.test.ts
```

Expected: FAIL — at least the runway/sinking test fails because `integrate()` does not call `applyGroundContact()` yet.

**Step 3: Implement minimal integration**

Modify `src/sim/physics/integrate.ts`.

Add import near other system imports:

```typescript
import { applyGroundContact } from '../systems/ground';
```

Replace the current config block at lines 106-110:

```typescript
  // ── Config ──
  state.config.flapSetting = inputs.flapLever;
  state.config.gearDown = inputs.gearLever === 'DOWN';
  state.config.spoilersDeployed = inputs.spoilers > 0.5;
  state.config.speedBrake = inputs.spoilers;
```

with:

```typescript
  // ── Ground contact constraint ──
  // First playable slice: a flat KSEA runway contact solver. This is intentionally
  // applied after position integration as a post-solve constraint so the existing
  // free-flight equations and sign conventions remain unchanged.
  const groundContact = applyGroundContact(state, inputs, dt);

  // ── Config ──
  state.config.flapSetting = inputs.flapLever;
  state.config.gearDown = groundContact.weightOnWheels ? true : inputs.gearLever === 'DOWN';
  state.config.spoilersDeployed = inputs.spoilers > 0.5;
  state.config.speedBrake = inputs.spoilers;
```

**Step 4: Run targeted tests**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npm run test -- src/sim/physics/__tests__/integrate.test.ts src/sim/systems/__tests__/ground.test.ts
```

Expected: PASS.

**Step 5: Run physics invariant tests**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npm run test -- src/sim/physics/__tests__/integrate.test.ts src/sim/physics/__tests__/aero.test.ts src/sim/physics/__tests__/derived.test.ts src/sim/systems/__tests__/environment.test.ts
```

Expected: PASS. This verifies ground contact did not break wind/drag/sign contracts.

**Step 6: Commit**

```bash
git add src/sim/physics/integrate.ts src/sim/physics/__tests__/integrate.test.ts
git commit -m "feat: apply runway ground contact in integrator"
```

---

## Task 4 [PARENT-DIRECT]: Add explicit brake behavior coverage in integration

**Objective:** Prove the existing `brake` input now matters in the real integration path, not only in the isolated ground system.

**Files:**
- Modify: `src/sim/physics/__tests__/integrate.test.ts`
- Modify only if needed: `src/sim/systems/ground.ts`

**Step 1: Write failing/confirming test**

Add this test inside `describe('integrate', () => { ... })`:

```typescript
  it('brake input decelerates the aircraft during ground roll', () => {
    const s = createInitialState(B737_800_SPEC);
    s.position.alt = KSEA_RUNWAY_ALT_FT;
    s.velocity.u = 35;
    s.config.gearDown = true;
    const braking: ControlInputs = { ...idle, brake: 1, gearLever: 'DOWN' };

    integrate(s, braking, B737_800_SPEC, 1);

    expect(s.velocity.u).toBeGreaterThanOrEqual(0);
    expect(s.velocity.u).toBeLessThan(35);
  });
```

**Step 2: Run test**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npm run test -- src/sim/physics/__tests__/integrate.test.ts
```

Expected: PASS if Task 3 integration is correct. If it fails, fix only `src/sim/systems/ground.ts` or the ground-contact call location. Do not change aero or wind helpers.

**Step 3: Commit**

If a code change was needed:

```bash
git add src/sim/physics/__tests__/integrate.test.ts src/sim/systems/ground.ts
git commit -m "test: cover braking on runway"
```

If only the test was added and passed:

```bash
git add src/sim/physics/__tests__/integrate.test.ts
git commit -m "test: cover braking on runway"
```

---

## Task 5 [PARENT-DIRECT]: Enforce gear-down interlock while weight-on-wheels

**Objective:** Prevent TAKEOFF or keyboard input from retracting gear while the aircraft is still on the runway.

**Files:**
- Modify: `src/sim/physics/__tests__/integrate.test.ts`
- Modify if needed: `src/sim/physics/integrate.ts`

**Step 1: Write failing test**

Add this test inside `describe('integrate', () => { ... })`:

```typescript
  it('ignores gear-up command while weight-on-wheels but allows it after liftoff', () => {
    const onRunway = createInitialState(B737_800_SPEC);
    onRunway.position.alt = KSEA_RUNWAY_ALT_FT;
    onRunway.config.gearDown = true;
    const gearUp: ControlInputs = { ...idle, gearLever: 'UP' };

    integrate(onRunway, gearUp, B737_800_SPEC, 1 / 60);

    expect(onRunway.config.gearDown).toBe(true);

    const airborne = createInitialState(B737_800_SPEC);
    airborne.position.alt = KSEA_RUNWAY_ALT_FT + 1000;
    airborne.config.gearDown = true;

    integrate(airborne, gearUp, B737_800_SPEC, 1 / 60);

    expect(airborne.config.gearDown).toBe(false);
  });
```

**Step 2: Run test to verify failure/pass**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npm run test -- src/sim/physics/__tests__/integrate.test.ts
```

Expected: PASS if Task 3 config interlock was implemented exactly. If FAIL, update the config block in `integrate.ts` to use `groundContact.weightOnWheels ? true : inputs.gearLever === 'DOWN'`.

**Step 3: Commit**

```bash
git add src/sim/physics/integrate.ts src/sim/physics/__tests__/integrate.test.ts
git commit -m "feat: hold landing gear down on runway"
```

---

## Task 6 [PARENT-DIRECT]: Change TAKEOFF to start a takeoff roll, not retract gear or hold elevator

**Objective:** Make the player-facing TAKEOFF button align with the new ground model.

**Files:**
- Modify: `src/App.tsx:158-160`
- Modify: `src/__tests__/App.test.tsx`

**Step 1: Write failing App test**

Modify `src/__tests__/App.test.tsx`.

Add `fireEvent` to the existing Testing Library import:

```typescript
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
```

Refactor the store mock so the setters can be asserted. Add these constants before `vi.mock('../store/simStore', () => {`:

```typescript
const mockSetInput = vi.fn();
const mockStart = vi.fn();
const mockPause = vi.fn();
const mockResume = vi.fn();
const mockReset = vi.fn();
```

Inside the mocked `state`, replace the inline function fields:

```typescript
    start: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    reset: vi.fn(),
    setInput: vi.fn(),
```

with:

```typescript
    start: mockStart,
    pause: mockPause,
    resume: mockResume,
    reset: mockReset,
    setInput: mockSetInput,
```

Add this test:

```typescript
  it('starts takeoff roll with gear down and neutral elevator', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'TAKEOFF' }));

    expect(mockSetInput).toHaveBeenCalledWith(expect.objectContaining({
      throttle1: 1,
      throttle2: 1,
      flapLever: 5,
      gearLever: 'DOWN',
      elevator: 0,
      brake: 0,
    }));
    expect(mockStart).toHaveBeenCalledTimes(1);
  });
```

**Step 2: Run test to verify failure**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npm run test -- src/__tests__/App.test.tsx
```

Expected: FAIL — current TAKEOFF uses `gearLever: 'UP'` and `elevator: -0.3`.

**Step 3: Implement minimal App change**

Replace `handleTakeoff` in `src/App.tsx`:

```typescript
  const handleTakeoff = () => {
    setInput({ throttle1: 1, throttle2: 1, elevator: -0.3, gearLever: 'UP', flapLever: 5 });
    start();
  };
```

with:

```typescript
  const handleTakeoff = () => {
    setInput({
      throttle1: 1,
      throttle2: 1,
      elevator: 0,
      brake: 0,
      gearLever: 'DOWN',
      flapLever: 5,
    });
    start();
  };
```

**Step 4: Run test to verify pass**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npm run test -- src/__tests__/App.test.tsx
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/App.tsx src/__tests__/App.test.tsx
git commit -m "fix: make takeoff start on the runway"
```

---

## Task 7 [PARENT-DIRECT]: Add a store-level takeoff smoke regression

**Objective:** Prove the store tick path can run several seconds of takeoff roll without producing negative altitude.

**Files:**
- Modify: `src/store/__tests__/simStore.test.ts`

**Step 1: Write failing/confirming test**

Add import:

```typescript
import { KSEA_RUNWAY_ALT_FT } from '../../sim/systems/ground';
```

Add this test inside `describe('useSimStore', () => { ... })`:

```typescript
  it('takeoff roll stays at or above runway elevation through store ticks', () => {
    const store = useSimStore.getState();
    store.setInput({
      throttle1: 1,
      throttle2: 1,
      flapLever: 5,
      gearLever: 'DOWN',
      brake: 0,
      elevator: 0,
    });
    store.start();

    for (let frame = 0; frame < 5 * 60; frame++) {
      useSimStore.getState().tick(frame * (1000 / 60));
    }

    const state = useSimStore.getState().aircraft;
    expect(state.position.alt).toBeGreaterThanOrEqual(KSEA_RUNWAY_ALT_FT - 0.01);
    expect(state.velocity.u).toBeGreaterThan(5);
    expect(state.config.gearDown).toBe(true);
  });
```

**Step 2: Run test**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npm run test -- src/store/__tests__/simStore.test.ts
```

Expected: PASS after Tasks 1-6. If it fails, do not paper over it in the test. Investigate the actual store/integrator path.

**Step 3: Commit**

```bash
git add src/store/__tests__/simStore.test.ts
git commit -m "test: cover playable takeoff roll through store"
```

---

## Task 8: Make neutral gamepads produce no input

**Objective:** Stop idle controllers from overwriting keyboard/UI controls and forcing 50% throttle.

**Files:**
- Create: `src/input/__tests__/GamepadManager.test.ts`
- Modify: `src/input/GamepadManager.ts`

**Step 1: Write failing tests**

Create `src/input/__tests__/GamepadManager.test.ts`:

```typescript
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readGamepad } from '../GamepadManager';

function button(value: number): GamepadButton {
  return { pressed: value > 0, touched: value > 0, value };
}

function setGamepads(gamepads: Array<Partial<Gamepad> | null>): void {
  Object.defineProperty(navigator, 'getGamepads', {
    configurable: true,
    value: vi.fn(() => gamepads as Gamepad[]),
  });
}

describe('readGamepad', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null when there is no gamepad', () => {
    setGamepads([]);

    expect(readGamepad()).toBeNull();
  });

  it('returns null for a neutral gamepad so keyboard input is not overwritten', () => {
    setGamepads([
      {
        axes: [0, 0, 0],
        buttons: Array.from({ length: 8 }, () => button(0)),
      },
    ]);

    expect(readGamepad()).toBeNull();
  });

  it('returns only active fields when sticks or triggers move beyond the deadzone', () => {
    setGamepads([
      {
        axes: [0.2, -0.3, 0.4],
        buttons: Array.from({ length: 8 }, (_, i) => button(i === 7 ? 0.6 : 0)),
      },
    ]);

    expect(readGamepad()).toEqual({
      elevator: -0.21,
      aileron: 0.13999999999999999,
      rudder: 0.2,
      throttle1: 0.8,
      throttle2: 0.8,
    });
  });
});
```

**Step 2: Run test to verify failure**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npm run test -- src/input/__tests__/GamepadManager.test.ts
```

Expected: FAIL — neutral gamepad currently returns `{ elevator: 0, aileron: 0, rudder: 0, throttle1: 0.5, throttle2: 0.5 }`.

**Step 3: Implement minimal gamepad filtering**

Replace `src/input/GamepadManager.ts` with:

```typescript
import type { ControlInputs } from '../sim/types';

const AXIS_DEADZONE = 0.08;
const TRIGGER_DEADZONE = 0.05;

function activeAxis(value: number | undefined): number {
  const v = value ?? 0;
  return Math.abs(v) < AXIS_DEADZONE ? 0 : v;
}

function activeTrigger(value: number | undefined): number {
  const v = value ?? 0;
  return v < TRIGGER_DEADZONE ? 0 : Math.max(0, Math.min(1, v));
}

export function readGamepad(): Partial<ControlInputs> | null {
  const gamepads = navigator.getGamepads();
  const gp = gamepads[0];
  if (!gp) return null;

  const leftX = activeAxis(gp.axes[0]);
  const leftY = activeAxis(gp.axes[1]);
  const rightX = activeAxis(gp.axes[2]);
  const rightTrigger = activeTrigger(gp.buttons[7]?.value);
  const leftTrigger = activeTrigger(gp.buttons[6]?.value);

  const inputs: Partial<ControlInputs> = {};

  if (leftY !== 0) inputs.elevator = leftY * 0.7;
  if (leftX !== 0) inputs.aileron = leftX * 0.7;
  if (rightX !== 0) inputs.rudder = rightX * 0.5;

  if (rightTrigger > 0 || leftTrigger > 0) {
    const throttle1 = Math.max(0, Math.min(1, 0.5 + rightTrigger * 0.5 - leftTrigger * 0.5));
    inputs.throttle1 = throttle1;
    inputs.throttle2 = throttle1;
  }

  return Object.keys(inputs).length > 0 ? inputs : null;
}
```

**Step 4: Run tests**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npm run test -- src/input/__tests__/GamepadManager.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/input/GamepadManager.ts src/input/__tests__/GamepadManager.test.ts
git commit -m "fix: ignore neutral gamepad input"
```

---

## Task 9: Extract keyboard controls and make throttle incremental

**Objective:** Replace binary full/idle throttle keys with testable incremental controls while preserving W/S/A/D/Q/E axes.

**Files:**
- Create: `src/input/keyboardControls.ts`
- Create: `src/input/__tests__/keyboardControls.test.ts`
- Modify later: `src/App.tsx:41-73`

**Step 1: Write failing tests**

Create `src/input/__tests__/keyboardControls.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import type { ControlInputs } from '../../sim/types';
import { applyDiscreteKeyInput, computeHeldKeyInputs } from '../keyboardControls';

const inputs: ControlInputs = {
  elevator: 0,
  aileron: 0,
  rudder: 0,
  throttle1: 0.5,
  throttle2: 0.5,
  flapLever: 0,
  gearLever: 'DOWN',
  spoilers: 0,
  brake: 0,
};

describe('keyboardControls', () => {
  it('computes simultaneous pitch roll and rudder axes from held keys', () => {
    const keys = new Set(['w', 'd', 'q', ' ']);

    expect(computeHeldKeyInputs(keys)).toEqual({
      elevator: -0.4,
      aileron: 0.5,
      rudder: -0.5,
      brake: 1,
    });
  });

  it('increments throttle instead of jumping straight to full power', () => {
    expect(applyDiscreteKeyInput('arrowup', inputs)).toEqual({
      throttle1: 0.55,
      throttle2: 0.55,
    });
  });

  it('decrements throttle without going below idle', () => {
    expect(applyDiscreteKeyInput('arrowdown', { ...inputs, throttle1: 0.02, throttle2: 0.02 })).toEqual({
      throttle1: 0,
      throttle2: 0,
    });
  });

  it('toggles gear and cycles flaps', () => {
    expect(applyDiscreteKeyInput('g', inputs)).toEqual({ gearLever: 'UP' });
    expect(applyDiscreteKeyInput('f', { ...inputs, flapLever: 0 })).toEqual({ flapLever: 5 });
    expect(applyDiscreteKeyInput('f', { ...inputs, flapLever: 40 })).toEqual({ flapLever: 0 });
  });
});
```

**Step 2: Run test to verify failure**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npm run test -- src/input/__tests__/keyboardControls.test.ts
```

Expected: FAIL — module does not exist.

**Step 3: Implement helper**

Create `src/input/keyboardControls.ts`:

```typescript
import type { ControlInputs } from '../sim/types';

const THROTTLE_STEP = 0.05;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function nextFlapDetent(flaps: number): number {
  return flaps >= 40 ? 0 : flaps < 5 ? 5 : flaps + 5;
}

export function computeHeldKeyInputs(keys: ReadonlySet<string>): Partial<ControlInputs> {
  return {
    elevator: (keys.has('w') ? -0.4 : 0) + (keys.has('s') ? 0.4 : 0),
    aileron: (keys.has('a') ? -0.5 : 0) + (keys.has('d') ? 0.5 : 0),
    rudder: (keys.has('q') ? -0.5 : 0) + (keys.has('e') ? 0.5 : 0),
    brake: keys.has(' ') ? 1 : 0,
  };
}

export function applyDiscreteKeyInput(key: string, inputs: ControlInputs): Partial<ControlInputs> | null {
  switch (key.toLowerCase()) {
    case 'arrowup': {
      const throttle = clamp01(Math.max(inputs.throttle1, inputs.throttle2) + THROTTLE_STEP);
      return { throttle1: throttle, throttle2: throttle };
    }
    case 'arrowdown': {
      const throttle = clamp01(Math.min(inputs.throttle1, inputs.throttle2) - THROTTLE_STEP);
      return { throttle1: throttle, throttle2: throttle };
    }
    case 'g':
      return { gearLever: inputs.gearLever === 'UP' ? 'DOWN' : 'UP' };
    case 'f':
      return { flapLever: nextFlapDetent(inputs.flapLever) };
    default:
      return null;
  }
}
```

**Step 4: Run test to verify pass**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npm run test -- src/input/__tests__/keyboardControls.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/input/keyboardControls.ts src/input/__tests__/keyboardControls.test.ts
git commit -m "feat: add testable keyboard control mapping"
```

---

## Task 10: Wire keyboard helper into App

**Objective:** Make the app use the tested keyboard mapping and add a brake key.

**Files:**
- Modify: `src/App.tsx:1-88`
- Modify: `src/__tests__/App.test.tsx` only if imports/mocks need updating

**Step 1: Add import**

In `src/App.tsx`, add:

```typescript
import { applyDiscreteKeyInput, computeHeldKeyInputs } from './input/keyboardControls';
```

**Step 2: Replace keyboard update logic**

Replace the current `updateFromKeys` function body:

```typescript
      const k = keysRef.current;
      setInput({
        elevator: (k.has('w') ? -0.4 : 0) + (k.has('s') ? 0.4 : 0),
        aileron: (k.has('a') ? -0.5 : 0) + (k.has('d') ? 0.5 : 0),
        rudder: (k.has('q') ? -0.5 : 0) + (k.has('e') ? 0.5 : 0),
      });
```

with:

```typescript
      setInput(computeHeldKeyInputs(keysRef.current));
```

Replace the `onKey` body with:

```typescript
    const onKey = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (['w', 's', 'a', 'd', 'q', 'e', ' '].includes(key)) {
        if (key === ' ') e.preventDefault();
        keysRef.current.add(key);
        updateFromKeys();
        return;
      }

      const partial = applyDiscreteKeyInput(key, useSimStore.getState().inputs);
      if (partial) {
        e.preventDefault();
        setInput(partial);
      }
    };
```

Leave `onKeyUp` as-is except it now also releases the spacebar brake through `updateFromKeys()`.

**Step 3: Run targeted tests**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npm run test -- src/input/__tests__/keyboardControls.test.ts src/__tests__/App.test.tsx
```

Expected: PASS.

**Step 4: Commit**

```bash
git add src/App.tsx src/__tests__/App.test.tsx
git commit -m "feat: wire incremental keyboard controls"
```

---

## Task 11: Gate chase-camera follow so paused/stopped modes do not fight the player

**Objective:** Stop the camera loop from constantly snapping back while the sim is stopped or paused.

**Files:**
- Create: `src/viewport/cameraMode.ts`
- Create: `src/viewport/__tests__/cameraMode.test.ts`
- Modify: `src/App.tsx:114-148`

**Step 1: Write failing helper tests**

Create `src/viewport/__tests__/cameraMode.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { shouldAutoFollowCamera } from '../cameraMode';

describe('shouldAutoFollowCamera', () => {
  it('follows only while running for chase and cockpit modes', () => {
    expect(shouldAutoFollowCamera('running', 'chase')).toBe(true);
    expect(shouldAutoFollowCamera('running', 'cockpit')).toBe(true);
    expect(shouldAutoFollowCamera('paused', 'chase')).toBe(false);
    expect(shouldAutoFollowCamera('stopped', 'cockpit')).toBe(false);
  });

  it('allows tower framing only while running', () => {
    expect(shouldAutoFollowCamera('running', 'tower')).toBe(true);
    expect(shouldAutoFollowCamera('paused', 'tower')).toBe(false);
    expect(shouldAutoFollowCamera('stopped', 'tower')).toBe(false);
  });
});
```

**Step 2: Run test to verify failure**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npm run test -- src/viewport/__tests__/cameraMode.test.ts
```

Expected: FAIL — module does not exist.

**Step 3: Implement helper**

Create `src/viewport/cameraMode.ts`:

```typescript
import type { SimStatus } from '../store/simStore';

export type CameraMode = 'chase' | 'cockpit' | 'tower';

export function shouldAutoFollowCamera(status: SimStatus, _mode: CameraMode): boolean {
  return status === 'running';
}
```

**Step 4: Wire helper into App**

In `src/App.tsx`, add:

```typescript
import { shouldAutoFollowCamera, type CameraMode } from './viewport/cameraMode';
```

Replace local camera mode state type:

```typescript
  const [camMode, setCamMode] = useState<'chase' | 'cockpit' | 'tower'>('chase');
```

with:

```typescript
  const [camMode, setCamMode] = useState<CameraMode>('chase');
```

Inside camera RAF `update`, after retrieving `viewer`, add:

```typescript
      if (!shouldAutoFollowCamera(status, camMode)) {
        raf = requestAnimationFrame(update);
        return;
      }
```

Update the effect dependency from:

```typescript
  }, [camMode]);
```

to:

```typescript
  }, [camMode, status]);
```

**Step 5: Run targeted tests**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npm run test -- src/viewport/__tests__/cameraMode.test.ts src/__tests__/App.test.tsx
```

Expected: PASS.

**Step 6: Commit**

```bash
git add src/viewport/cameraMode.ts src/viewport/__tests__/cameraMode.test.ts src/App.tsx
git commit -m "fix: stop camera follow when paused"
```

---

## Task 12: Remove terrain exaggeration from playable build

**Objective:** Eliminate the known terrain/display-height mismatch for aircraft and camera by removing the 1.5x terrain exaggeration.

**Files:**
- Modify: `src/viewport/CesiumViewport.tsx:46-50`
- Test: existing `src/__tests__/App.test.tsx` smoke coverage

**Step 1: Make the smallest production change**

In `src/viewport/CesiumViewport.tsx`, replace:

```typescript
    globe.terrainExaggeration = 1.5;
```

with:

```typescript
    globe.terrainExaggeration = 1;
```

If Cesium type behavior makes `terrainExaggeration = 1` unnecessary, deleting the assignment is also acceptable. Prefer explicit `1` for now because it documents the playable-build decision.

**Step 2: Run smoke tests**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npm run test -- src/__tests__/App.test.tsx
```

Expected: PASS.

**Step 3: Commit**

```bash
git add src/viewport/CesiumViewport.tsx
git commit -m "fix: disable terrain exaggeration for flight"
```

---

## Task 13: Add a visible controls/help overlay

**Objective:** Make keyboard controls discoverable without reading source code.

**Files:**
- Create: `src/components/ControlsHelp.tsx`
- Modify: `src/App.tsx:170-173`
- Modify: `src/__tests__/App.test.tsx`

**Step 1: Write failing App test**

Add this test to `src/__tests__/App.test.tsx`:

```typescript
  it('shows keyboard controls help', () => {
    render(<App />);

    expect(screen.getByText('Controls')).toBeTruthy();
    expect(screen.getByText(/W\/S pitch/i)).toBeTruthy();
    expect(screen.getByText(/ArrowUp\/ArrowDown throttle/i)).toBeTruthy();
    expect(screen.getByText(/Space brake/i)).toBeTruthy();
  });
```

**Step 2: Run test to verify failure**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npm run test -- src/__tests__/App.test.tsx
```

Expected: FAIL — controls help is not rendered.

**Step 3: Create component**

Create `src/components/ControlsHelp.tsx`:

```typescript
export function ControlsHelp() {
  return (
    <div
      style={{
        position: 'fixed',
        left: 20,
        bottom: 70,
        zIndex: 100,
        background: 'rgba(0,0,0,0.75)',
        color: '#0f0',
        fontFamily: 'monospace',
        fontSize: 11,
        lineHeight: 1.5,
        padding: '8px 10px',
        border: '1px solid rgba(0,255,0,0.35)',
        borderRadius: 4,
        pointerEvents: 'none',
        maxWidth: 300,
      }}
    >
      <div style={{ fontWeight: 'bold', marginBottom: 4 }}>Controls</div>
      <div>W/S pitch · A/D roll · Q/E rudder</div>
      <div>ArrowUp/ArrowDown throttle</div>
      <div>Space brake · F flaps · G gear</div>
      <div>CAM cycles chase/cockpit/tower</div>
    </div>
  );
}
```

**Step 4: Render it in App**

Add import in `src/App.tsx`:

```typescript
import { ControlsHelp } from './components/ControlsHelp';
```

Render near the other overlays:

```tsx
      <ControlsHelp />
```

Place it after `<Telemetry />` and before `<AttitudeIndicator />`.

**Step 5: Run test to verify pass**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npm run test -- src/__tests__/App.test.tsx
```

Expected: PASS.

**Step 6: Commit**

```bash
git add src/components/ControlsHelp.tsx src/App.tsx src/__tests__/App.test.tsx
git commit -m "feat: show flight controls help"
```

---

## Task 14 [PARENT-DIRECT]: Full local gate and browser dogfood

**Objective:** Verify the whole playable slice locally before any push/deploy.

**Files:**
- No source changes unless verification exposes a bug.
- Use browser against local dev server or deployed site after push.

**Step 1: Run full quality gate**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npm run check
```

Expected:

```text
lint:ci exits 0
typecheck exits 0
all Vitest tests pass
vite build succeeds
```

Known acceptable noise:

- ESLint React-version settings warning if exit code is 0.
- jsdom canvas `getContext()` not implemented messages if tests pass.
- Vite large chunk warnings if build exits 0.

**Step 2: Start local dev server**

Run as a tracked background process:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npm run dev -- --host 0.0.0.0
```

Use `terminal(background=true, notify_on_complete=true)` if executing through Hermes.

**Step 3: Browser dogfood checklist**

Open local Vite URL. Verify:

1. Initial load shows aircraft, airport imagery, HUD, and Controls overlay.
2. Browser console has no JS errors.
3. Click TAKEOFF.
4. For at least 10 seconds:
   - `ALT` remains at or above approximately 432 ft before rotation.
   - `VS` does not immediately spike to extreme negative values.
   - `GEAR` remains DN on the runway.
   - `IAS/GS` increase from 0.
   - World does not go black.
5. Hold `W` after speed builds. Aircraft should pitch up; if it lifts off, gear can be retracted with `G` after airborne.
6. Press Space while rolling. GS/u should decrease.
7. Pause/stop and move camera manually; it should not snap back while paused/stopped.
8. Connect/leave idle gamepad if available; keyboard/TAKEOFF throttle should not be overwritten.

**Step 4: Capture evidence**

Use browser screenshot/console evidence for:

- initial state
- 5-10 seconds after TAKEOFF
- controls overlay visible
- paused camera state

**Step 5: Commit any final verification docs if changed**

If you update review docs with verification results:

```bash
git add docs/reviews/ docs/plans/
git commit -m "docs: record playable takeoff verification"
```

---

## Task 15 [PARENT-DIRECT]: Push, monitor CI/CD, and verify live site

**Objective:** Deploy only after local quality gates and browser dogfood pass.

**Files:**
- Git/CI/deployment only.

**Step 1: Push**

Run:

```bash
git push origin master
```

**Step 2: Wait for GitHub Actions actual success**

Run repeatedly until the relevant run is complete:

```bash
gh run list --repo Reedtrullz/ReedFS --branch master --limit 5 --json databaseId,headSha,status,conclusion,workflowName,createdAt
```

Expected: latest run for your pushed SHA eventually shows:

```json
"status": "completed",
"conclusion": "success"
```

Do not claim success before this is true.

**Step 3: Verify live endpoint by curl**

Run:

```bash
curl -I https://fly.reidar.tech/
curl -s https://fly.reidar.tech/ | head -20
```

Expected: HTTP 200 and current built asset references.

**Step 4: Browser verify live gameplay**

Open:

```text
https://fly.reidar.tech/?verify=<commit-sha>
```

Repeat the dogfood checklist from Task 14 on the live deployment.

**Step 5: Final report to user**

Report only after:

- local `npm run check` passed
- GitHub Actions completed success for the pushed SHA
- `curl https://fly.reidar.tech/` returned HTTP 200
- live browser TAKEOFF no longer sinks/black-screens immediately

Include the commit SHA, CI run ID, and live verification evidence.

---

## Post-implementation audit checklist

After all tasks and before final report, read the changed files and audit manually:

- `src/sim/systems/ground.ts`
  - Does it preserve body-axis sign conventions?
  - Does it avoid mutating wind/air-relative state?
  - Does braking never reverse `u` through zero?
- `src/sim/physics/integrate.ts`
  - Did engine/fuel/electrical/hydraulic/aero order remain unchanged?
  - Is ground contact clearly post-solve and documented?
  - Is gear interlock only active while weight-on-wheels?
- `src/App.tsx`
  - Does TAKEOFF avoid gear-up and persistent elevator?
  - Does camera follow skip paused/stopped states?
  - Are Zustand selectors stable and not returning new objects?
- `src/input/GamepadManager.ts`
  - Does neutral input return null?
  - Are throttle values preserved unless trigger input is active?
- `src/input/keyboardControls.ts`
  - Are throttle values clamped?
  - Does brake release on keyup via held-key mapping?
- Browser app
  - No JS errors.
  - TAKEOFF remains visually playable for at least 10 seconds.
  - Reset still works.

Run final commands:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npm run check
git diff --stat HEAD~5..HEAD
```

## Explicit non-goals for this plan

- No full tire slip model.
- No anti-skid logic beyond a brake deceleration clamp.
- No terrain sampling API yet; flat KSEA runway constant only.
- No Web Worker physics migration.
- No AP/LNAV/VNAV fixes except preventing misleading TAKEOFF behavior.
- No real cockpit model.
- No Cesium ion token deployment change unless it blocks verification.

These remain follow-up phases after the first playable takeoff foundation is live.
