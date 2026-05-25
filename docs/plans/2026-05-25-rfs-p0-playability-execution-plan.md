# RFS P0 Playability Execution Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task. Tasks marked `[PARENT-DIRECT]` touch the physics heartbeat and should be executed by the parent session directly, not delegated blindly.

**Goal:** Fix the minimum P0 gameplay blockers so reset -> start roll -> accelerate at high FPS -> rotate cue -> manual rotation -> reset/retry is usable and test-covered.

**Architecture:** The first slice stays inside the current main-thread RAF simulation architecture. It fixes the ground stop/deceleration boundary without changing coordinate conventions, then clarifies the UI contract from “TAKEOFF” to “START ROLL” and adds a simple rotate cue. It does not attempt full gear-station physics, terrain sampling, autopilot tuning, or Web Worker migration.

**Tech Stack:** React 19, TypeScript strict, Vite 8, Vitest 4, Zustand, RFS TypeScript 6-DOF physics, CesiumJS/Three.js browser runtime.

---

## Context and source docs read

Review these before implementing:

- `docs/architecture.md`
- `docs/physics-invariants.md`
- `docs/reviews/2026-05-25-playability-follow-up.md`
- `docs/plans/2026-05-25-rfs-playability-recovery-plan.md`
- `src/sim/systems/ground.ts`
- `src/sim/physics/integrate.ts`
- `src/store/simStore.ts`
- `src/App.tsx`
- `src/components/ControlsHelp.tsx`
- `src/components/Telemetry.tsx`

Current confirmed blocker:

```text
30 Hz  -> accelerates
60 Hz  -> accelerates
90 Hz  -> stuck at 0 kt
120 Hz -> stuck at 0 kt
144 Hz -> stuck at 0 kt
```

Root cause: `src/sim/systems/ground.ts` snaps tiny longitudinal speed to zero using a fixed `STOP_EPSILON_MPS` before accounting for takeoff thrust trying to break static friction.

## Architecture audit against runtime heartbeat

Runtime chain:

```text
src/App.tsx
  -> src/hooks/useSimLoop.ts
    -> src/store/simStore.ts tick(timestamp)
      -> structuredClone(aircraft)
      -> src/sim/physics/integrate.ts
        -> updateEngines
        -> computeAero
        -> velocity/position integration
        -> src/sim/systems/ground.ts applyGroundContact
      -> computeDerived
      -> Zustand state update
  -> src/components/Telemetry.tsx / src/instruments/RfsPFD.tsx
```

Risk notes:

- `ground.ts`, `integrate.ts`, and `simStore.ts` are part of the silent-feeling gameplay heartbeat. A sign/unit bug may not crash; it degrades playability. Tasks touching these files are `[PARENT-DIRECT]` and require direct focused tests plus a browser dogfood check.
- There are no intentionally swallowed imports in this path, but App/Three/Cesium tests use mocks. Any UI task touching `App.tsx` must rerun `src/__tests__/App.test.tsx` because the mocks are fragile.
- Do not change physics coordinate conventions. Body axes remain x-forward/y-right/z-down; NED remains down-positive; `state.velocity` remains ground-relative.
- Do not add a Web Worker in this plan. Worker migration is a separate architecture plan.

## Dependency map

```text
Tasks 1-6: physics/ground-roll high-FPS fix. MUST serialize. [PARENT-DIRECT]
Tasks 7-8: store repeated-takeoff regression. Depends on Tasks 1-6. [PARENT-DIRECT]
Tasks 9-12: UI copy/help clarification. Can run after Tasks 1-6; App.test shared so serialize.
Tasks 13-16: rotate cue helper + telemetry rendering. Depends on Tasks 9-12 only conceptually.
Task 17: browser dogfood verification. Depends on all earlier tasks.
Task 18: full gate and commit/tag. Depends on all earlier tasks.
```

## Commit policy

Use TDD exactly: write RED tests and run them to prove failure. Do not leave `master` on a failing commit. For RED-only tasks, keep changes uncommitted until the matching GREEN task passes, or work on a throwaway branch and squash before merging.

## Commands

Always use Node 22:

```bash
cd /Users/reidar/Projectos/RFS
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
```

Focused physics gate:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test -- src/sim/systems/__tests__/ground.test.ts src/sim/physics/__tests__/integrate.test.ts src/store/__tests__/simStore.test.ts
```

Focused UI gate:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test -- src/__tests__/App.test.tsx src/components/__tests__/Telemetry.test.tsx
```

Final local gate:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check
```

---

### Task 1: [PARENT-DIRECT] Add reusable takeoff-roll test helpers

**Objective:** Add small test helpers used by the high-FPS takeoff-roll regressions.

**Files:**
- Modify: `src/sim/physics/__tests__/integrate.test.ts`

**Step 1: Add helper code near the `idle` constant**

```ts
function takeoffRollInputs(): ControlInputs {
  return {
    ...idle,
    throttle1: 1,
    throttle2: 1,
    flapLever: 5,
    gearLever: 'DOWN',
    brake: 0,
    elevator: 0,
  };
}

function runTakeoffRollAtHz(hz: number, seconds: number): ReturnType<typeof createInitialState> {
  const s = createInitialState(B737_800_SPEC);
  const inputs = takeoffRollInputs();
  for (let frame = 0; frame < seconds * hz; frame++) {
    integrate(s, inputs, B737_800_SPEC, 1 / hz);
  }
  return s;
}
```

**Step 2: Run existing integrate tests**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test -- src/sim/physics/__tests__/integrate.test.ts
```

Expected: PASS. This task only adds helpers and should not change behavior.

**Step 3: Commit**

```bash
git add src/sim/physics/__tests__/integrate.test.ts
git commit -m "test: add takeoff roll test helpers"
```

---

### Task 2: [PARENT-DIRECT] Add 120 Hz failing takeoff-roll regression

**Objective:** Prove full-throttle takeoff roll accelerates at a high-refresh RAF timestep.

**Files:**
- Modify: `src/sim/physics/__tests__/integrate.test.ts`

**Step 1: Write failing test**

Add near the existing takeoff-roll test:

```ts
it('full-throttle takeoff roll accelerates at 120 Hz', () => {
  const s = runTakeoffRollAtHz(120, 20);

  expect(s.position.alt).toBeGreaterThanOrEqual(KSEA_RUNWAY_ALT_FT - 0.01);
  expect(s.velocity.u).toBeGreaterThan(25); // ~49 kt after 20s is a low bar
  expect(s.config.gearDown).toBe(true);
});
```

**Step 2: Run test to verify RED**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test -- src/sim/physics/__tests__/integrate.test.ts
```

Expected: FAIL — `expected 0 to be greater than 25` or equivalent for `s.velocity.u`.

**Step 3: Keep RED test uncommitted until Task 6 GREEN**

Do not commit a failing test to `master`. Leave this RED test in the working tree, or commit it only on a throwaway feature branch that will be squashed with the fix.

---

### Task 3: [PARENT-DIRECT] Add 144 Hz failing takeoff-roll regression

**Objective:** Prove the fix must cover common high-refresh displays, not only 120 Hz.

**Files:**
- Modify: `src/sim/physics/__tests__/integrate.test.ts`

**Step 1: Write failing test**

```ts
it('full-throttle takeoff roll accelerates at 144 Hz', () => {
  const s = runTakeoffRollAtHz(144, 20);

  expect(s.position.alt).toBeGreaterThanOrEqual(KSEA_RUNWAY_ALT_FT - 0.01);
  expect(s.velocity.u).toBeGreaterThan(25);
  expect(s.config.gearDown).toBe(true);
});
```

**Step 2: Run test to verify RED**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test -- src/sim/physics/__tests__/integrate.test.ts
```

Expected: FAIL — both 120 Hz and 144 Hz regressions fail before implementation.

**Step 3: Keep RED test uncommitted until Task 6 GREEN**

Do not commit a failing test to `master`. Leave this RED test in the working tree, or commit it only on a throwaway feature branch that will be squashed with the fix.

---

### Task 4: [PARENT-DIRECT] Add ground-unit breakaway regression

**Objective:** Pin the ground solver contract directly: tiny positive speed under takeoff thrust must not be snapped to zero.

**Files:**
- Modify: `src/sim/systems/__tests__/ground.test.ts`

**Step 1: Write failing test**

Add to `describe('applyGroundContact', ...)`:

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
    brake: 0,
  };

  applyGroundContact(state, takeoff, 1 / 120);

  expect(state.velocity.u).toBeGreaterThan(0);
});
```

**Step 2: Run test to verify RED**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test -- src/sim/systems/__tests__/ground.test.ts
```

Expected: FAIL — current solver sets `state.velocity.u` to `0`.

**Step 3: Keep RED test uncommitted until Task 6 GREEN**

Do not commit a failing test to `master`. Leave this RED test in the working tree, or commit it only on a throwaway feature branch that will be squashed with the fix.

---

### Task 5: [PARENT-DIRECT] Preserve idle stop behavior with an explicit test

**Objective:** Ensure the high-FPS fix does not make an idle parked aircraft creep forever.

**Files:**
- Modify: `src/sim/systems/__tests__/ground.test.ts`

**Step 1: Write protective test**

```ts
it('still snaps an idle nearly-stopped aircraft to zero', () => {
  const state = createInitialState(B737_800_SPEC);
  state.position.alt = KSEA_RUNWAY_ALT_FT;
  state.velocity.u = 0.03;
  state.config.gearDown = true;

  applyGroundContact(state, idle, 1 / 120);

  expect(state.velocity.u).toBe(0);
});
```

**Step 2: Run test**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test -- src/sim/systems/__tests__/ground.test.ts
```

Expected before implementation: existing idle behavior should PASS; breakaway regression from Task 4 still FAILS.

**Step 3: Commit**

```bash
git add src/sim/systems/__tests__/ground.test.ts
git commit -m "test: preserve idle stop clamp behavior"
```

---

### Task 6: [PARENT-DIRECT] Fix thrust breakaway in ground solver

**Objective:** Let takeoff thrust break the aircraft away from the stop epsilon while preserving idle/brake stopping.

**Files:**
- Modify: `src/sim/systems/ground.ts:6-38`
- Test: `src/sim/systems/__tests__/ground.test.ts`
- Test: `src/sim/physics/__tests__/integrate.test.ts`

**Step 1: Implement minimal code**

In `src/sim/systems/ground.ts`, add a constant near the other constants:

```ts
const BREAKAWAY_THROTTLE = 0.05;
```

Add helper after `clamp01()`:

```ts
function hasBreakawayThrustCommand(inputs: ControlInputs): boolean {
  return Math.max(inputs.throttle1, inputs.throttle2) > BREAKAWAY_THROTTLE;
}
```

Replace the early stop block inside `applyLongitudinalGroundDecel()` with:

```ts
  const speed = state.velocity.u;
  const brake = clamp01(inputs.brake);
  const breakawayThrust = hasBreakawayThrustCommand(inputs);

  if (Math.abs(speed) <= STOP_EPSILON_MPS && !breakawayThrust) {
    state.velocity.u = 0;
    return;
  }

  const decel = (ROLLING_FRICTION_ACCEL_MPS2 + brake * MAX_BRAKE_ACCEL_MPS2) * Math.max(0, dt);
```

Keep the existing positive/negative speed deceleration branches:

```ts
  if (speed > 0) {
    state.velocity.u = Math.max(0, speed - decel);
  } else {
    state.velocity.u = Math.min(0, speed + decel);
  }
```

**Important:** Do not remove rolling friction. Do not change lift/drag/gravity signs. Do not touch `integrate.ts` for this task.

**Step 2: Run focused tests to verify GREEN**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test -- src/sim/systems/__tests__/ground.test.ts src/sim/physics/__tests__/integrate.test.ts
```

Expected: PASS — ground tests pass and 120/144 Hz takeoff-roll regressions pass.

**Step 3: Run physics gate**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test -- src/sim/physics/__tests__/aero.test.ts src/sim/physics/__tests__/derived.test.ts src/sim/systems/__tests__/environment.test.ts src/sim/systems/__tests__/ground.test.ts src/sim/physics/__tests__/integrate.test.ts
```

Expected: PASS.

**Step 4: Commit**

```bash
git add src/sim/systems/ground.ts src/sim/systems/__tests__/ground.test.ts src/sim/physics/__tests__/integrate.test.ts
git commit -m "fix: allow takeoff roll breakaway at high fps"
```

---

### Task 7: [PARENT-DIRECT] Add store-level high-FPS repeat regression

**Objective:** Prove the user-facing store loop can reset and start a second high-FPS takeoff roll.

**Files:**
- Modify: `src/store/__tests__/simStore.test.ts`

**Step 1: Write test**

Add after the existing takeoff-roll store test:

```ts
function startTakeoffRollFromStore(): void {
  useSimStore.getState().setInput({
    throttle1: 1,
    throttle2: 1,
    flapLever: 5,
    gearLever: 'DOWN',
    brake: 0,
    elevator: 0,
  });
  useSimStore.getState().start();
}

function tickAtHz(hz: number, seconds: number): void {
  const startMs = 1000;
  for (let frame = 0; frame < seconds * hz; frame++) {
    useSimStore.getState().tick(startMs + frame * (1000 / hz));
  }
}

it('reset then repeated takeoff roll accelerates at 120 Hz', () => {
  for (let attempt = 0; attempt < 2; attempt++) {
    useSimStore.getState().reset();
    startTakeoffRollFromStore();

    tickAtHz(120, 20);

    const state = useSimStore.getState().aircraft;
    expect(state.position.alt).toBeGreaterThanOrEqual(KSEA_RUNWAY_ALT_FT - 0.01);
    expect(state.velocity.u).toBeGreaterThan(25);
    expect(state.config.gearDown).toBe(true);
  }
});
```

**Step 2: Run test**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test -- src/store/__tests__/simStore.test.ts
```

Expected: PASS after Task 6. If it fails, debug store timestamp handling before touching physics again.

**Step 3: Commit**

```bash
git add src/store/__tests__/simStore.test.ts
git commit -m "test: cover repeated high-fps takeoff roll through store"
```

---

### Task 8: [PARENT-DIRECT] Re-run the original reproduction command

**Objective:** Verify the direct integrator reproduction now accelerates at every tested refresh rate.

**Files:**
- No production files

**Step 1: Run reproduction**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm exec -- tsx -e "import { createInitialState, B737_800_SPEC, type ControlInputs } from './src/sim/types.ts'; import { integrate } from './src/sim/physics/integrate.ts'; const inputs: ControlInputs={elevator:0,aileron:0,rudder:0,throttle1:1,throttle2:1,flapLever:5,gearLever:'DOWN',spoilers:0,brake:0}; for (const hz of [30,60,90,120,144]) { const s=createInitialState(B737_800_SPEC); for (let i=0;i<20*hz;i++) integrate(s,inputs,B737_800_SPEC,1/hz); console.log(JSON.stringify({hz, u_ms:+s.velocity.u.toFixed(3), ias_kt:+(s.velocity.u*1.94384).toFixed(1), alt_ft:+s.position.alt.toFixed(1), n1:+s.engines[0].n1.toFixed(1)})); }"
```

Expected: every row has `u_ms > 25` and `ias_kt > 48`. Altitude remains near `432` before rotation.

**Step 2: Add result to commit notes if desired**

No code commit required unless a docs update is made.

---

### Task 9: Update App test for START ROLL copy

**Objective:** Make the UI contract honest: the button starts a roll; it does not complete takeoff by itself.

**Files:**
- Modify: `src/__tests__/App.test.tsx:194-208`

**Step 1: Write failing test change**

Change:

```ts
fireEvent.click(screen.getByRole('button', { name: 'TAKEOFF' }));
```

to:

```ts
fireEvent.click(screen.getByRole('button', { name: 'START ROLL' }));
```

Change test name:

```ts
it('starts takeoff roll with gear down and neutral elevator', () => {
```

to:

```ts
it('starts takeoff roll from the START ROLL button with gear down and neutral elevator', () => {
```

**Step 2: Run test to verify RED**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test -- src/__tests__/App.test.tsx
```

Expected: FAIL — button named `START ROLL` not found.

**Step 3: Keep RED test uncommitted until Task 10 GREEN**

Do not commit a failing test to `master`. Leave this RED test in the working tree until the UI copy change makes it pass.

---

### Task 10: Rename TAKEOFF button to START ROLL

**Objective:** Update the visible button copy without changing behavior.

**Files:**
- Modify: `src/App.tsx:158-198`
- Test: `src/__tests__/App.test.tsx`

**Step 1: Rename handler for clarity**

In `src/App.tsx`, rename:

```ts
const handleTakeoff = () => {
```

to:

```ts
const handleStartRoll = () => {
```

Update button:

```tsx
<button onClick={handleStartRoll} style={btnStyle}>START ROLL</button>
```

**Step 2: Run App test to verify GREEN**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test -- src/__tests__/App.test.tsx
```

Expected: PASS.

**Step 3: Commit**

```bash
git add src/App.tsx src/__tests__/App.test.tsx
git commit -m "fix: label takeoff button as start roll"
```

---

### Task 11: Update controls-help test for explicit rotate copy

**Objective:** Make keyboard pitch semantics obvious to the player.

**Files:**
- Modify: `src/__tests__/App.test.tsx:210-217`

**Step 1: Write failing test change**

Replace:

```ts
expect(screen.getByText(/W\/S pitch/i)).toBeTruthy();
```

with:

```ts
expect(screen.getByText(/W rotate\/nose up/i)).toBeTruthy();
expect(screen.getByText(/S nose down/i)).toBeTruthy();
```

Add explicit gear copy check:

```ts
expect(screen.getByText(/G gear after positive rate/i)).toBeTruthy();
```

**Step 2: Run test to verify RED**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test -- src/__tests__/App.test.tsx
```

Expected: FAIL — old controls text is still rendered.

**Step 3: Keep RED test uncommitted until Task 12 GREEN**

Do not commit a failing test to `master`. Leave this RED test in the working tree until the controls-help copy change makes it pass.

---

### Task 12: Update controls-help copy

**Objective:** Show clear pitch/gear instructions while preserving existing control bindings.

**Files:**
- Modify: `src/components/ControlsHelp.tsx:21-25`
- Test: `src/__tests__/App.test.tsx`

**Step 1: Implement copy update**

Replace controls lines with:

```tsx
      <div>W rotate/nose up · S nose down</div>
      <div>A/D roll · Q/E rudder</div>
      <div>ArrowUp/ArrowDown throttle</div>
      <div>Space brake · F flaps</div>
      <div>G gear after positive rate</div>
      <div>CAM cycles chase/cockpit/tower</div>
```

**Step 2: Run App test to verify GREEN**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test -- src/__tests__/App.test.tsx
```

Expected: PASS.

**Step 3: Commit**

```bash
git add src/components/ControlsHelp.tsx src/__tests__/App.test.tsx
git commit -m "fix: clarify rotate and gear controls help"
```

---

### Task 13: Add takeoff cue helper tests

**Objective:** Define a small reusable source of truth for player-facing takeoff roll/rotate cue text.

**Files:**
- Create: `src/sim/__tests__/takeoffCue.test.ts`
- Create later: `src/sim/takeoffCue.ts`

**Step 1: Write failing tests**

Create `src/sim/__tests__/takeoffCue.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createInitialState, B737_800_SPEC } from '../types';
import { takeoffCueText } from '../takeoffCue';

function stateAtIas(iasKt: number) {
  const state = createInitialState(B737_800_SPEC);
  state.flightPhase = 'TAKEOFF';
  state.config.gearDown = true;
  return { state, iasKt };
}

describe('takeoffCueText', () => {
  it('shows takeoff roll below rotate speed', () => {
    const { state, iasKt } = stateAtIas(80);
    expect(takeoffCueText(state, iasKt)).toBe('TAKEOFF ROLL');
  });

  it('shows rotate at or above rotate speed while gear is down', () => {
    const { state, iasKt } = stateAtIas(145);
    expect(takeoffCueText(state, iasKt)).toBe('ROTATE — hold W');
  });

  it('shows positive rate after airborne climb starts', () => {
    const { state, iasKt } = stateAtIas(155);
    state.position.alt += 80;
    state.config.gearDown = true;
    expect(takeoffCueText(state, iasKt)).toBe('POSITIVE RATE — gear up');
  });

  it('returns null outside takeoff phase', () => {
    const state = createInitialState(B737_800_SPEC);
    expect(takeoffCueText(state, 0)).toBeNull();
  });
});
```

**Step 2: Run test to verify RED**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test -- src/sim/__tests__/takeoffCue.test.ts
```

Expected: FAIL — `../takeoffCue` module does not exist.

**Step 3: Keep RED test uncommitted until Task 14 GREEN**

Do not commit a failing test to `master`. Leave this RED test in the working tree until the helper implementation makes it pass.

---

### Task 14: Implement takeoff cue helper

**Objective:** Add the smallest helper needed to drive player-facing takeoff cues.

**Files:**
- Create: `src/sim/takeoffCue.ts`
- Test: `src/sim/__tests__/takeoffCue.test.ts`

**Step 1: Write implementation**

Create `src/sim/takeoffCue.ts`:

```ts
import type { AircraftState } from './types';
import { KSEA_RUNWAY_ALT_FT } from './systems/ground';

export const ROTATE_SPEED_KT = 140;
export const POSITIVE_RATE_ALT_FT = 50;

export function takeoffCueText(state: AircraftState, iasKt: number): string | null {
  if (state.flightPhase !== 'TAKEOFF') {
    return null;
  }

  const heightAboveRunwayFt = state.position.alt - KSEA_RUNWAY_ALT_FT;

  if (heightAboveRunwayFt >= POSITIVE_RATE_ALT_FT && state.config.gearDown) {
    return 'POSITIVE RATE — gear up';
  }

  if (iasKt >= ROTATE_SPEED_KT && state.config.gearDown) {
    return 'ROTATE — hold W';
  }

  return 'TAKEOFF ROLL';
}
```

**Step 2: Run test to verify GREEN**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test -- src/sim/__tests__/takeoffCue.test.ts
```

Expected: PASS.

**Step 3: Commit**

```bash
git add src/sim/takeoffCue.ts src/sim/__tests__/takeoffCue.test.ts
git commit -m "feat: add takeoff cue helper"
```

---

### Task 15: Set flight phase when starting roll

**Objective:** Make `START ROLL` put the aircraft into a takeoff phase so cue logic can activate.

**Files:**
- Modify: `src/store/simStore.ts`
- Modify: `src/store/__tests__/simStore.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/__tests__/App.test.tsx` if store mock needs new action

**Step 1: Write store test first**

Add to `src/store/__tests__/simStore.test.ts`:

```ts
it('startTakeoffRoll sets inputs, running status, and TAKEOFF phase', () => {
  useSimStore.getState().startTakeoffRoll();

  const state = useSimStore.getState();
  expect(state.status).toBe('running');
  expect(state.inputs).toEqual(expect.objectContaining({
    throttle1: 1,
    throttle2: 1,
    flapLever: 5,
    gearLever: 'DOWN',
    brake: 0,
    elevator: 0,
  }));
  expect(state.aircraft.flightPhase).toBe('TAKEOFF');
});
```

**Step 2: Run test to verify RED**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test -- src/store/__tests__/simStore.test.ts
```

Expected: FAIL — `startTakeoffRoll` does not exist.

**Step 3: Add store action type**

In `src/store/simStore.ts`, add to `SimStore`:

```ts
  startTakeoffRoll: () => void;
```

**Step 4: Implement action**

Add action near `start`:

```ts
  startTakeoffRoll: () => set((s) => {
    const aircraft = structuredClone(s.aircraft);
    aircraft.flightPhase = 'TAKEOFF';
    return {
      aircraft,
      inputs: {
        ...s.inputs,
        throttle1: 1,
        throttle2: 1,
        flapLever: 5,
        gearLever: 'DOWN',
        brake: 0,
        elevator: 0,
      },
      status: 'running',
      lastFrameTime: 0,
    };
  }),
```

**Step 5: Wire App to action**

In `src/App.tsx`, select action:

```ts
  const startTakeoffRoll = useSimStore((s) => s.startTakeoffRoll);
```

Replace `handleStartRoll` body with:

```ts
  const handleStartRoll = () => {
    startTakeoffRoll();
  };
```

Remove unused `start`/`setInput` selections if TypeScript flags them unused.

**Step 6: Update App test mock**

In `src/__tests__/App.test.tsx`, add `mockStartTakeoffRoll` to hoisted mocks and store mock:

```ts
const { mockSetInput, mockStartTakeoffRoll, mockPause, mockResume, mockReset } = vi.hoisted(() => ({
  mockSetInput: vi.fn(),
  mockStartTakeoffRoll: vi.fn(),
  mockPause: vi.fn(),
  mockResume: vi.fn(),
  mockReset: vi.fn(),
}));
```

Store state should include:

```ts
startTakeoffRoll: mockStartTakeoffRoll,
```

Update App expectation:

```ts
expect(mockStartTakeoffRoll).toHaveBeenCalledTimes(1);
```

**Step 7: Run tests to verify GREEN**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test -- src/store/__tests__/simStore.test.ts src/__tests__/App.test.tsx
```

Expected: PASS.

**Step 8: Commit**

```bash
git add src/store/simStore.ts src/store/__tests__/simStore.test.ts src/App.tsx src/__tests__/App.test.tsx
git commit -m "feat: add takeoff roll store action"
```

---

### Task 16: Render takeoff cue in telemetry

**Objective:** Show TAKEOFF ROLL / ROTATE / POSITIVE RATE cues in the visible debug HUD.

**Files:**
- Modify: `src/components/Telemetry.tsx`
- Modify: `src/components/__tests__/Telemetry.test.tsx`
- Uses: `src/sim/takeoffCue.ts`

**Step 1: Write failing component test**

In `Telemetry.test.tsx`, update imports:

```ts
import { beforeEach, describe, it, expect } from 'vitest';
import { useSimStore } from '../../store/simStore';
```

Add a reset hook inside `describe('Telemetry', ...)` so state does not leak between tests:

```ts
beforeEach(() => {
  useSimStore.getState().reset();
});
```

Add test:

```ts
it('renders takeoff cue during takeoff phase', () => {
  useSimStore.getState().reset();
  useSimStore.getState().startTakeoffRoll();

  render(<Telemetry />);

  expect(screen.getByText(/TAKEOFF ROLL|ROTATE|POSITIVE RATE/)).toBeTruthy();
});
```

**Step 2: Run test to verify RED**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test -- src/components/__tests__/Telemetry.test.tsx
```

Expected: FAIL — cue text is not rendered.

**Step 3: Implement telemetry cue**

In `src/components/Telemetry.tsx`, import helper:

```ts
import { takeoffCueText } from '../sim/takeoffCue';
```

After derived state:

```ts
  const takeoffCue = takeoffCueText(aircraft, d.ias);
```

Render after SIM status:

```tsx
      {takeoffCue && <div style={{ fontWeight: 'bold', color: '#ff0', marginBottom: 4 }}>{takeoffCue}</div>}
```

**Step 4: Run component test to verify GREEN**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test -- src/components/__tests__/Telemetry.test.tsx
```

Expected: PASS.

**Step 5: Run focused UI gate**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test -- src/__tests__/App.test.tsx src/components/__tests__/Telemetry.test.tsx
```

Expected: PASS.

**Step 6: Commit**

```bash
git add src/components/Telemetry.tsx src/components/__tests__/Telemetry.test.tsx
git commit -m "feat: show takeoff cue in telemetry"
```

---

### Task 17: Browser dogfood local player loop

**Objective:** Verify actual gameplay, not just unit tests.

**Files:**
- No source changes unless a bug is found

**Step 1: Start dev server**

Run in background:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run dev -- --host 127.0.0.1
```

**Step 2: Browser verification**

Open `http://127.0.0.1:5173/`.

Checklist:

- Initial state: `SIM: STOPPED`, `ALT: 432 ft`, `IAS/GS: 0 kt`, gear down.
- Button text is `START ROLL`.
- Controls help says `W rotate/nose up` and `G gear after positive rate`.
- Click `START ROLL`.
- Within 10 seconds at ~120 FPS, IAS/GS should be above 30 kt.
- Within 20 seconds, IAS/GS should still be increasing and not stuck at zero.
- Telemetry cue shows `TAKEOFF ROLL` then `ROTATE — hold W` around Vr.
- Hold W for 2-3 seconds after ROTATE cue.
- Altitude increases above runway and VS becomes positive.
- RESET, then START ROLL again; second attempt accelerates too.
- Browser console has no JS errors.

**Step 3: If browser verification fails**

Do not claim success. Add a failing automated test for the observed failure and return to the relevant task.

---

### Task 18: Final gate and documentation update

**Objective:** Finish with clean automated gates and a short implementation note.

**Files:**
- Modify: `docs/reviews/2026-05-25-playability-follow-up.md` if behavior changed materially
- Optional modify: `docs/roadmap.md` if the P0 high-FPS blocker should be marked fixed

**Step 1: Run full local gate**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check
```

Expected: PASS. Known non-blocking warnings are acceptable only if exit code is zero.

**Step 2: Update review notes**

If browser dogfood passed, add an “Implementation follow-up” section to `docs/reviews/2026-05-25-playability-follow-up.md` with:

```markdown
## Implementation follow-up

- High-FPS ground-roll deadlock fixed locally.
- Added 120/144 Hz takeoff-roll regression coverage.
- START ROLL copy and rotate cue added.
- Browser dogfood: reset -> start roll -> accelerate -> rotate cue -> manual rotation -> reset repeat verified locally.
```

**Step 3: Commit final docs if changed**

```bash
git add docs/reviews/2026-05-25-playability-follow-up.md docs/roadmap.md
git commit -m "docs: record p0 playability fix verification"
```

**Step 4: Do not deploy unless explicitly doing the deployment phase**

If later deploying, follow RFS deployment discipline:

1. Push to GitHub.
2. Wait for GitHub Actions conclusion `success`.
3. Verify live endpoint with `curl https://fly.reidar.tech/`.
4. Only then claim deployed.

---

## Done definition

This plan is complete only when all are true:

- 120 Hz and 144 Hz takeoff-roll tests fail before the fix and pass after it.
- Store-level reset + second takeoff roll at 120 Hz passes.
- `START ROLL` copy is visible and App test-covered.
- Rotate/positive-rate cue is visible and component/helper test-covered.
- Local browser dogfood verifies IAS/GS do not stick at zero at high FPS.
- `npm run check` passes with Node 22.
- No deployment is claimed unless CI and live curl verification are completed.
