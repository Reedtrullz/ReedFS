# RFS Foundation Stabilization Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task. Tasks marked `[PARENT-DIRECT]` must be executed by the parent session, not delegated, because they touch the simulator heartbeat or physics sign conventions.

**Goal:** Stabilize the RFS simulator foundation so future realism work is based on correct physics, reliable tests, and clean release gates.

**Architecture:** Keep the current main-thread `useSimLoop → simStore.tick → integrate()` architecture for this phase, but correct its state semantics: quaternion is authoritative, body/NED transforms are centralized, wind is air-relative only, and release checks are explicit. This plan deliberately does **not** move physics to a Web Worker yet; that is a follow-up phase after the physics state contract is correct.

**Tech Stack:** React 19, TypeScript strict, Vite 8, Vitest 4, Zustand, CesiumJS, Three.js, RFMS shared autopilot/flight-plan types.

---

## Architecture audit before implementation

Architecture docs read before this plan:
- `docs/plans/rfs-comprehensive-plan.md`
- `docs/plans/phase-7-ship-it.md`
- `docs/plans/phase-8-physics-refactor.md`
- `README.md`

No `ARCHITECTURE.md` exists in RFS today. The effective runtime heartbeat is:

```text
src/App.tsx
  → src/hooks/useSimLoop.ts
    → src/store/simStore.ts tick()
      → src/sim/systems/environment.ts applyWind()  [currently mutates velocity]
      → src/sim/physics/integrate.ts
        → src/sim/systems/engine.ts
        → src/sim/systems/fuel.ts
        → src/sim/systems/electrical.ts
        → src/sim/systems/hydraulic.ts
        → src/sim/physics/aero.ts computeAero()
        → src/sim/systems/autopilot.ts updateAutopilot()
```

Silent-degradation risks:
- Incorrect sign conventions do not crash; they make the aircraft feel wrong.
- Wind mutation does not crash; it slowly corrupts state.
- AP target defaults do not crash; the MCP appears to work while modes ignore selected targets.
- Existing tests pass even when physics semantics are wrong.

Safety rules for this plan:
- Do not parallelize tasks that touch `src/sim/physics/integrate.ts`, `src/store/simStore.ts`, or `src/sim/types.ts`.
- Every physics task starts with a failing regression test.
- After each task, run the targeted test, then at least `npm run test` and `npm run typecheck` once those scripts exist.
- After completing the full plan, run the post-implementation audit checklist from `subagent-driven-development/references/post-implementation-audit.md`.

Use Node 22 for every command:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
```

---

## Dependency map

```text
Task 1: package.json only — independent.
Tasks 2-5: lint/release gate cleanup — serialize because they affect CI confidence.
Tasks 6-7: attitude/quaternion correctness — serialize; touches types/integrate tests.
Tasks 8-9: frame transform helpers + derived state — serialize; new helper consumed by derived.
Tasks 10-11: gravity sign regression and integrator fix — PARENT-DIRECT.
Task 12: wind refactor — PARENT-DIRECT; touches environment, aero, integrate, store.
Task 13: CI gate — after lint is clean.
Task 14: post-implementation audit — after all changes.
```

---

### Task 1: Add explicit npm test/typecheck scripts

**Objective:** Make the existing quality commands callable by stable npm scripts before adding CI gates.

**Files:**
- Modify: `package.json:6-10`

**Step 1: Verify the missing test script**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test
```

Expected: FAIL — npm reports `Missing script: "test"`.

**Step 2: Modify `package.json` scripts**

Replace the scripts block with:

```json
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "typecheck": "tsc -b",
    "test": "vitest run",
    "lint": "eslint .",
    "lint:ci": "eslint . --max-warnings=0",
    "check": "npm run lint:ci && npm run typecheck && npm run test && npm run build",
    "preview": "vite preview"
  },
```

**Step 3: Verify the new scripts that should already pass**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run typecheck
```

Expected:
- `npm run test`: PASS — 23 files / 83 tests pass.
- `npm run typecheck`: PASS.

Do **not** require `npm run check` to pass in this task; lint is still failing until Tasks 2-5.

**Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add explicit RFS quality scripts"
```

If `package-lock.json` is unchanged, omit it from `git add`.

---

### Task 2: Fix App hook ordering and stabilize Cesium onReady

**Objective:** Remove the App-level React hook/order lint failure and prevent Cesium viewer recreation from an unstable inline callback.

**Files:**
- Modify: `src/App.tsx:1-22`
- Modify: `src/App.tsx:103-168`
- Test: `src/__tests__/App.test.tsx`

**Step 1: Verify the current App lint failure**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx eslint src/App.tsx
```

Expected: FAIL — includes `setMetarData is accessed before it is declared` and `react-hooks/immutability`.

**Step 2: Consolidate React imports**

At the top of `src/App.tsx`, replace:

```typescript
import { useRef, useEffect } from 'react';
```

and remove the later separate import:

```typescript
import { useState } from 'react';
```

Use this single import instead:

```typescript
import { useCallback, useEffect, useRef, useState } from 'react';
```

**Step 3: Move state declarations before the METAR effect**

Inside `App()`, immediately after `const keysRef = useRef(new Set<string>());`, add:

```typescript
  const [camMode, setCamMode] = useState<'chase' | 'cockpit' | 'tower'>('chase');
  const [metarData, setMetarData] = useState<MetarData | null>(null);
```

Then delete the duplicate declarations currently under the `// Camera mode` comment.

**Step 4: Extract stable viewer ready callback**

Before `handleTakeoff`, add:

```typescript
  const handleViewerReady = useCallback((viewer: Cesium.Viewer) => {
    viewerRef.current = viewer;
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(-122.31, 47.45, 5000),
      orientation: { heading: Cesium.Math.toRadians(0), pitch: Cesium.Math.toRadians(-30), roll: 0 },
    });
  }, []);
```

In JSX, replace the inline `onReady={(viewer) => { ... }}` block with:

```tsx
      <CesiumViewport onReady={handleViewerReady} />
```

**Step 5: Verify targeted lint and App test**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx eslint src/App.tsx
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test -- src/__tests__/App.test.tsx
```

Expected:
- App lint no longer reports `setMetarData accessed before it is declared`.
- App test passes.
- It may still report `any` casts from the LOAD PLAN button; those are fixed in Task 4.

**Step 6: Commit**

```bash
git add src/App.tsx src/__tests__/App.test.tsx
git commit -m "fix: stabilize App hooks and Cesium viewer callback"
```

---

### Task 3: Fix FPSMonitor render purity

**Objective:** Stop calling `performance.now()` during React render.

**Files:**
- Modify: `src/components/FPSMonitor.tsx:3-22`

**Step 1: Verify the current lint failure**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx eslint src/components/FPSMonitor.tsx
```

Expected: FAIL — `Cannot call impure function during render` at `useRef(performance.now())`.

**Step 2: Replace the impure ref initializer**

Replace:

```typescript
  const lastTime = useRef(performance.now());
```

with:

```typescript
  const lastTime = useRef(0);
```

Then update the effect body to initialize it after mount:

```typescript
  useEffect(() => {
    let raf: number;
    lastTime.current = performance.now();
    const update = () => {
      frames.current++;
      const now = performance.now();
      if (now - lastTime.current >= 1000) {
        setFps(frames.current);
        frames.current = 0;
        lastTime.current = now;
      }
      raf = requestAnimationFrame(update);
    };
    raf = requestAnimationFrame(update);
    return () => cancelAnimationFrame(raf);
  }, []);
```

**Step 3: Verify**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx eslint src/components/FPSMonitor.tsx
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test
```

Expected: targeted lint passes; full tests pass.

**Step 4: Commit**

```bash
git add src/components/FPSMonitor.tsx
git commit -m "fix: initialize FPS timer after mount"
```

---

### Task 4: Remove RFMS autopilot `any` casts from App and MCP

**Objective:** Use RFMS shared mode types instead of `as any` in autopilot state updates.

**Files:**
- Modify: `src/App.tsx:1-22,210-221`
- Modify: `src/instruments/RfsMCP.tsx:1-104`
- Test: `src/sim/systems/__tests__/autopilot.test.ts`

**Step 1: Verify current lint failures**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx eslint src/App.tsx src/instruments/RfsMCP.tsx src/sim/systems/__tests__/autopilot.test.ts
```

Expected: FAIL — multiple `@typescript-eslint/no-explicit-any` errors.

**Step 2: Add typed imports**

In `src/App.tsx`, add:

```typescript
import type { LateralMode, ThrustMode, VerticalMode } from '@shared/autopilot/autopilotTypes';
```

In `src/instruments/RfsMCP.tsx`, add:

```typescript
import type { AutopilotState, LateralMode, ThrustMode, VerticalMode } from '@shared/autopilot/autopilotTypes';
```

**Step 3: Replace LOAD PLAN casts in `App.tsx`**

Replace:

```typescript
              next.truth.lateralActive = 'LNAV' as any;
              next.truth.verticalActive = 'VNAV' as any;
              next.truth.thrustActive = 'SPEED' as any;
              next.truth.autopilotStatus = 'CMD_A' as any;
```

with:

```typescript
              next.truth.lateralActive = 'LNAV' satisfies LateralMode;
              next.truth.verticalActive = 'VNAV' satisfies VerticalMode;
              next.truth.thrustActive = 'SPEED' satisfies ThrustMode;
              next.truth.autopilotStatus = 'CMD_A';
```

**Step 4: Type the MCP default AP state**

In `src/instruments/RfsMCP.tsx`, change:

```typescript
      const def = {
```

to:

```typescript
      const def: AutopilotState = {
```

Then replace `as any` assignments with typed assignments:

```typescript
          lateralActive: 'OFF',
          verticalActive: 'OFF',
          thrustActive: 'OFF',
          autopilotStatus: 'OFF',
```

In `toggleMode`, replace the mode branches with type guards:

```typescript
    if (mode === 'HDG_SEL' || mode === 'LNAV') {
      next.truth.lateralActive = mode satisfies LateralMode;
    } else if (mode === 'ALT_HOLD' || mode === 'VS') {
      next.truth.verticalActive = mode satisfies VerticalMode;
    } else if (mode === 'SPEED' || mode === 'N1') {
      next.truth.thrustActive = mode satisfies ThrustMode;
    } else if (mode === 'OFF') {
      next.truth.lateralActive = 'OFF';
      next.truth.verticalActive = 'OFF';
      next.truth.thrustActive = 'OFF';
      next.truth.autopilotStatus = 'OFF';
    }
```

If TypeScript rejects `satisfies` in assignment expressions, use typed local constants instead:

```typescript
      const lateral: LateralMode = mode;
      next.truth.lateralActive = lateral;
```

**Step 5: Type the autopilot test helper**

In `src/sim/systems/__tests__/autopilot.test.ts`, change the helper signature to:

```typescript
import type { AutopilotState, LateralMode, ThrustMode, VerticalMode } from '@shared/autopilot/autopilotTypes';

function makeAp(lateral: LateralMode, vertical: VerticalMode, thrust: ThrustMode): AutopilotState {
```

Then replace:

```typescript
      lateralActive: lateral as any, verticalActive: vertical as any, thrustActive: thrust as any,
```

with:

```typescript
      lateralActive: lateral,
      verticalActive: vertical,
      thrustActive: thrust,
```

**Step 6: Verify**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx eslint src/App.tsx src/instruments/RfsMCP.tsx src/sim/systems/__tests__/autopilot.test.ts
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test -- src/sim/systems/__tests__/autopilot.test.ts
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run typecheck
```

Expected: targeted lint/typecheck pass.

**Step 7: Commit**

```bash
git add src/App.tsx src/instruments/RfsMCP.tsx src/sim/systems/__tests__/autopilot.test.ts
git commit -m "fix: type RFS autopilot mode assignments"
```

---

### Task 5: Clean remaining easy lint errors

**Objective:** Remove unused imports/vars and localized `any` escapes that block the release gate.

**Files:**
- Modify: `src/sim/flightPlanLoader.ts:1`
- Modify: `src/sim/physics/__tests__/quaternion.test.ts:2`
- Modify: `src/sim/physics/integrate.ts:36-37`
- Modify: `src/sim/weather.ts:33-40`
- Modify: `src/viewport/CesiumViewport.tsx:41-44`
- Modify: `src/__tests__/App.test.tsx`
- Modify: `src/store/__tests__/simStore.test.ts`

**Step 1: Verify remaining lint list**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run lint:ci
```

Expected: FAIL — remaining errors are localized lint hygiene, not architecture changes.

**Step 2: Remove unused imports/vars**

Apply these exact removals:

- In `src/sim/flightPlanLoader.ts`, replace:

```typescript
import type { FlightPlan, FlightPlanWaypoint } from '@shared/types/fmc';
```

with:

```typescript
import type { FlightPlan } from '@shared/types/fmc';
```

- In `src/sim/physics/__tests__/quaternion.test.ts`, remove `quatMultiply` from the import if it is not used by a test.
- In `src/sim/physics/integrate.ts`, delete the unused block:

```typescript
  const sinPhi = Math.sin(phi), cosPhi = Math.cos(phi);
  const sinTheta = Math.sin(theta), cosTheta = Math.cos(theta);
```

Also remove `phi` and `theta` from the destructuring if they are only used by that deleted block.

**Step 3: Replace Cesium `any` casts with narrow local types**

In `src/viewport/CesiumViewport.tsx`, add near the imports:

```typescript
type GlobeWithOptionalEffects = Cesium.Globe & {
  terrainExaggeration?: number;
  showWaterEffect?: boolean;
};
```

Replace:

```typescript
    (viewer.scene.globe as any).terrainExaggeration = 1.5;
    viewer.scene.globe.enableLighting = true;
    (viewer.scene.globe as any).showWaterEffect = true;
```

with:

```typescript
    const globe = viewer.scene.globe as GlobeWithOptionalEffects;
    globe.terrainExaggeration = 1.5;
    globe.enableLighting = true;
    globe.showWaterEffect = true;
```

**Step 4: Replace test `any` casts with `Partial<T> as T` helpers**

For each test file still using `as any`, prefer a tiny typed helper over inline casts. Example for `src/store/__tests__/simStore.test.ts`:

```typescript
import type { AutopilotState } from '@shared/autopilot/autopilotTypes';

const minimalApState = (): AutopilotState => ({
  boeing: {
    courseL: 0,
    courseR: 0,
    speed: null,
    mach: null,
    heading: 0,
    altitude: 0,
    verticalSpeed: null,
    fdLeft: false,
    fdRight: false,
    autothrottleArm: false,
    n1: false,
    speedMode: false,
    lnav: false,
    vnav: false,
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
    altitude: 0,
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
    lateralActive: 'OFF',
    verticalActive: 'OFF',
    thrustActive: 'OFF',
    autopilotStatus: 'OFF',
    lastModeChangeTimestamps: { thrust: 0, lateral: 0, vertical: 0 },
  },
});
```

Use `minimalApState()` instead of `{ truth: ... } as any` and `{ } as any`.

**Step 5: Verify full lint**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run lint:ci
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run typecheck
```

Expected: all pass.

**Step 6: Commit**

```bash
git add src/sim/flightPlanLoader.ts src/sim/physics/__tests__/quaternion.test.ts src/sim/physics/integrate.ts src/sim/weather.ts src/viewport/CesiumViewport.tsx src/__tests__/App.test.tsx src/store/__tests__/simStore.test.ts
git commit -m "fix: clean RFS lint blockers"
```

---

### Task 6: Add regression test for initial heading/quaternion mismatch

**Objective:** Prove that the initial 180° heading survives one physics tick.

**Files:**
- Modify: `src/sim/physics/__tests__/integrate.test.ts`

**Step 1: Write failing test**

Append this test inside `describe('integrate', () => { ... })`:

```typescript
  it('preserves initial heading after first quaternion-derived tick', () => {
    const s = createInitialState(B737_800_SPEC);
    expect(s.attitude.psi).toBeCloseTo(Math.PI);

    integrate(s, idle, B737_800_SPEC, 1 / 60);

    expect(s.attitude.psi).toBeCloseTo(Math.PI, 6);
  });
```

**Step 2: Run test to verify failure**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test -- src/sim/physics/__tests__/integrate.test.ts
```

Expected: FAIL — current identity quaternion causes heading to be derived as 0 instead of π.

**Step 3: Commit the failing test only if using strict TDD branch discipline**

Normally do not commit failing tests to `master`. If working in a feature branch, you may commit:

```bash
git add src/sim/physics/__tests__/integrate.test.ts
git commit -m "test: capture initial heading quaternion regression"
```

If working directly on `master`, proceed to Task 7 before committing.

---

### Task 7: Initialize quaternion from Euler attitude [PARENT-DIRECT]

**Objective:** Make quaternion and Euler attitude agree at initial state creation.

**Files:**
- Modify: `src/sim/types.ts:3-4,167-187`
- Test: `src/sim/physics/__tests__/integrate.test.ts`

> **[PARENT-DIRECT]** This touches `AircraftState` initialization, which is consumed by every sim subsystem. Execute directly and verify immediately.

**Step 1: Import `eulerToQuat`**

In `src/sim/types.ts`, replace:

```typescript
import type { Quaternion } from './physics/quaternion';
```

with:

```typescript
import { eulerToQuat, type Quaternion } from './physics/quaternion';
```

**Step 2: Build initial attitude once and derive quaternion from it**

Inside `createInitialState`, before `return`, add:

```typescript
  const attitude: Attitude = { phi: 0, theta: 0, psi: Math.PI };
```

Then replace:

```typescript
    attitude: { phi: 0, theta: 0, psi: Math.PI }, // facing south (180°)
    quaternion: { q0: 1, q1: 0, q2: 0, q3: 0 },
```

with:

```typescript
    attitude, // facing south (180°)
    quaternion: eulerToQuat(attitude.phi, attitude.theta, attitude.psi),
```

**Step 3: Verify targeted and full tests**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test -- src/sim/physics/__tests__/integrate.test.ts src/sim/__tests__/types.test.ts
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run typecheck
```

Expected: heading regression test passes; full tests pass.

**Step 4: Commit**

```bash
git add src/sim/types.ts src/sim/physics/__tests__/integrate.test.ts
git commit -m "fix: initialize attitude quaternion from heading"
```

---

### Task 8: Add frame transform helper tests

**Objective:** Create a tested source of truth for body-frame ↔ NED velocity transforms before changing derived state or wind logic.

**Files:**
- Create: `src/sim/physics/frames.ts`
- Create: `src/sim/physics/__tests__/frames.test.ts`

**Step 1: Write failing tests**

Create `src/sim/physics/__tests__/frames.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { bodyToNed, nedToBody } from '../frames';
import type { Attitude, BodyVelocity } from '../../types';

const levelNorth: Attitude = { phi: 0, theta: 0, psi: 0 };
const levelSouth: Attitude = { phi: 0, theta: 0, psi: Math.PI };

function expectBodyClose(actual: BodyVelocity, expected: BodyVelocity): void {
  expect(actual.u).toBeCloseTo(expected.u, 8);
  expect(actual.v).toBeCloseTo(expected.v, 8);
  expect(actual.w).toBeCloseTo(expected.w, 8);
}

describe('bodyToNed', () => {
  it('maps level north forward velocity to positive north', () => {
    expect(bodyToNed({ u: 10, v: 0, w: 0 }, levelNorth)).toEqual({ north: 10, east: 0, down: 0 });
  });

  it('maps level south forward velocity to negative north', () => {
    const ned = bodyToNed({ u: 10, v: 0, w: 0 }, levelSouth);
    expect(ned.north).toBeCloseTo(-10, 8);
    expect(ned.east).toBeCloseTo(0, 8);
    expect(ned.down).toBeCloseTo(0, 8);
  });

  it('round-trips body velocity through NED', () => {
    const attitude: Attitude = { phi: 0.2, theta: -0.1, psi: 1.3 };
    const body: BodyVelocity = { u: 120, v: 4, w: -3 };
    expectBodyClose(nedToBody(bodyToNed(body, attitude), attitude), body);
  });
});
```

**Step 2: Run test to verify failure**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test -- src/sim/physics/__tests__/frames.test.ts
```

Expected: FAIL — `../frames` module does not exist.

**Step 3: Implement `frames.ts`**

Create `src/sim/physics/frames.ts`:

```typescript
import type { Attitude, BodyVelocity } from '../types';

export interface NedVelocity {
  north: number;
  east: number;
  down: number;
}

export function bodyToNed(body: BodyVelocity, attitude: Attitude): NedVelocity {
  const { u, v, w } = body;
  const { phi, theta, psi } = attitude;
  const sphi = Math.sin(phi), cphi = Math.cos(phi);
  const sth = Math.sin(theta), cth = Math.cos(theta);
  const spsi = Math.sin(psi), cpsi = Math.cos(psi);

  return {
    north: cth * cpsi * u + (sphi * sth * cpsi - cphi * spsi) * v + (cphi * sth * cpsi + sphi * spsi) * w,
    east: cth * spsi * u + (sphi * sth * spsi + cphi * cpsi) * v + (cphi * sth * spsi - sphi * cpsi) * w,
    down: -sth * u + sphi * cth * v + cphi * cth * w,
  };
}

export function nedToBody(ned: NedVelocity, attitude: Attitude): BodyVelocity {
  const { north, east, down } = ned;
  const { phi, theta, psi } = attitude;
  const sphi = Math.sin(phi), cphi = Math.cos(phi);
  const sth = Math.sin(theta), cth = Math.cos(theta);
  const spsi = Math.sin(psi), cpsi = Math.cos(psi);

  return {
    u: cth * cpsi * north + cth * spsi * east - sth * down,
    v: (sphi * sth * cpsi - cphi * spsi) * north + (sphi * sth * spsi + cphi * cpsi) * east + sphi * cth * down,
    w: (cphi * sth * cpsi + sphi * spsi) * north + (cphi * sth * spsi - sphi * cpsi) * east + cphi * cth * down,
  };
}
```

**Step 4: Verify**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test -- src/sim/physics/__tests__/frames.test.ts
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run typecheck
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/sim/physics/frames.ts src/sim/physics/__tests__/frames.test.ts
git commit -m "feat: add body and NED frame transforms"
```

---

### Task 9: Use frame transforms for derived GS/VS

**Objective:** Compute ground speed and vertical speed from NED velocity instead of raw body-frame `u/v/w`.

**Files:**
- Modify: `src/sim/physics/derived.ts:1-20`
- Modify: `src/sim/physics/__tests__/derived.test.ts`

**Step 1: Add failing derived-state regression test**

Append to `src/sim/physics/__tests__/derived.test.ts`:

```typescript
  it('computes ground speed from attitude-aware NED velocity', () => {
    const s = createInitialState(B737_800_SPEC);
    s.velocity.u = 100;
    s.velocity.v = 0;
    s.velocity.w = 0;
    s.attitude.theta = Math.PI / 6; // 30° nose up means part of forward velocity is vertical

    const d = computeDerived(s);

    expect(d.gs).toBeCloseTo(100 * Math.cos(Math.PI / 6) * 1.94384, 0);
    expect(d.vs).toBeGreaterThan(9000);
  });
```

**Step 2: Run test to verify failure**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test -- src/sim/physics/__tests__/derived.test.ts
```

Expected: FAIL — current code uses body-frame `sqrt(u*u + v*v)` and `-w`.

**Step 3: Update `derived.ts`**

Add import:

```typescript
import { bodyToNed } from './frames';
```

Replace:

```typescript
  const gs = msToKt(Math.sqrt(u * u + v * v));
  const vsFpm = -w * 196.85; // w positive down in NED, vs positive climbing
```

with:

```typescript
  const ned = bodyToNed(state.velocity, state.attitude);
  const gs = msToKt(Math.sqrt(ned.north * ned.north + ned.east * ned.east));
  const vsFpm = -ned.down * 196.850394; // down positive, VS positive climbing
```

**Step 4: Verify**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test -- src/sim/physics/__tests__/derived.test.ts src/sim/physics/__tests__/frames.test.ts
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/sim/physics/derived.ts src/sim/physics/__tests__/derived.test.ts
git commit -m "fix: derive ground speed and vertical speed from NED velocity"
```

---

### Task 10: Add gravity sign regression tests [PARENT-DIRECT]

**Objective:** Capture the body-axis gravity convention before changing the integrator.

**Files:**
- Modify: `src/sim/physics/__tests__/integrate.test.ts`

> **[PARENT-DIRECT]** This test defines the simulator's sign convention. Review it manually before implementing the fix.

**Step 1: Add failing test for freefall at level attitude**

Append inside `describe('integrate', () => { ... })`:

```typescript
  it('accelerates downward in freefall at level attitude', () => {
    const s = createInitialState(B737_800_SPEC);
    s.position.alt = 10000;
    s.velocity.u = 0;
    s.velocity.v = 0;
    s.velocity.w = 0;
    s.config.gearDown = false;

    integrate(s, idle, B737_800_SPEC, 0.1);

    expect(s.velocity.w).toBeGreaterThan(0); // body/NED down is positive
  });
```

**Step 2: Run test to verify failure**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test -- src/sim/physics/__tests__/integrate.test.ts
```

Expected: FAIL — current gravity sign drives `w` negative at level attitude.

Do not change production code in this task unless pairing it with Task 11 in the same working session.

---

### Task 11: Correct translational gravity signs in `integrate.ts` [PARENT-DIRECT]

**Objective:** Make gravity components consistent with x-forward/y-right/z-down body axes.

**Files:**
- Modify: `src/sim/physics/integrate.ts:68-80`
- Test: `src/sim/physics/__tests__/integrate.test.ts`

> **[PARENT-DIRECT]** This is the heart of the flight model. Execute directly, inspect the diff manually, and run the full test suite before committing.

**Step 1: Replace gravity body-frame signs**

In `src/sim/physics/integrate.ts`, replace:

```typescript
  const gx = G * stht;
  const gy = -G * ctht * sphi;
  const gz = -G * ctht * cphi;
```

with:

```typescript
  // Body axes: x forward, y right, z down. Gravity is positive down in NED.
  const gx = -G * stht;
  const gy = G * ctht * sphi;
  const gz = G * ctht * cphi;
```

Keep the translational equations in body axes:

```typescript
  const udot = aero.thrust / mass - aero.drag / mass + gx - q * state.velocity.w + r * state.velocity.v;
  const vdot = aero.side / mass + gy - r * state.velocity.u + p * state.velocity.w;
  const wdot = -aero.lift / mass + gz - p * state.velocity.v + q * state.velocity.u;
```

If a test now reveals that elevator/control sign semantics are inverted, stop and write a separate failing test before changing aero/control signs.

**Step 2: Verify targeted tests**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test -- src/sim/physics/__tests__/integrate.test.ts src/sim/physics/__tests__/aero.test.ts src/sim/physics/__tests__/derived.test.ts
```

Expected: PASS after adjusting any expected values that were asserting the old wrong behavior.

**Step 3: Verify full suite and typecheck**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run typecheck
```

Expected: PASS.

**Step 4: Commit**

```bash
git add src/sim/physics/integrate.ts src/sim/physics/__tests__/integrate.test.ts
git commit -m "fix: align gravity with body-axis convention"
```

---

### Task 12: Make wind air-relative instead of destructive [PARENT-DIRECT]

**Objective:** Stop wind from mutating aircraft state every tick; compute air-relative velocity as a pure function.

**Files:**
- Modify: `src/sim/systems/environment.ts`
- Create or modify: `src/sim/systems/__tests__/environment.test.ts`
- Modify: `src/sim/physics/aero.ts`
- Modify: `src/sim/physics/integrate.ts`
- Modify: `src/store/simStore.ts`

> **[PARENT-DIRECT]** This changes the physics data contract across store, environment, aero, and integrator. Do not delegate as one subagent task.

**Step 1: Write failing pure wind test**

Create `src/sim/systems/__tests__/environment.test.ts` or append to the existing environment test file if one is added earlier:

```typescript
import { describe, expect, it } from 'vitest';
import { computeAirRelativeVelocity } from '../environment';
import { createInitialState, B737_800_SPEC } from '../../types';
import type { WindInfo } from '../../weather';

describe('computeAirRelativeVelocity', () => {
  it('does not mutate aircraft ground velocity', () => {
    const s = createInitialState(B737_800_SPEC);
    s.velocity.u = 100;
    s.velocity.v = 0;
    s.velocity.w = 0;
    const wind: WindInfo = { dir: 180, speed: 20, gust: null };

    const before = structuredClone(s.velocity);
    const first = computeAirRelativeVelocity(s, wind);
    const second = computeAirRelativeVelocity(s, wind);

    expect(s.velocity).toEqual(before);
    expect(second).toEqual(first);
  });
});
```

**Step 2: Run test to verify failure**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test -- src/sim/systems/__tests__/environment.test.ts
```

Expected: FAIL — `computeAirRelativeVelocity` does not exist.

**Step 3: Replace destructive environment function with pure helpers**

In `src/sim/systems/environment.ts`, keep `applyWind` only if callers still need it for backward compatibility, but mark it unused. Add:

```typescript
import { nedToBody, type NedVelocity } from '../physics/frames';
import type { BodyVelocity } from '../types';

export function windToNed(wind: WindInfo): NedVelocity {
  if (wind.speed < 0.5) return { north: 0, east: 0, down: 0 };
  const windDirRad = (wind.dir * Math.PI) / 180;
  const windMs = wind.speed * 0.514444;
  return {
    north: -windMs * Math.cos(windDirRad),
    east: -windMs * Math.sin(windDirRad),
    down: 0,
  };
}

export function computeAirRelativeVelocity(state: AircraftState, wind: WindInfo | null): BodyVelocity {
  if (!wind || wind.speed < 0.5) return { ...state.velocity };
  const windBody = nedToBody(windToNed(wind), state.attitude);
  return {
    u: state.velocity.u - windBody.u,
    v: state.velocity.v - windBody.v,
    w: state.velocity.w - windBody.w,
  };
}
```

**Step 4: Thread wind into aero without mutating state**

Change `computeAero` signature in `src/sim/physics/aero.ts` from:

```typescript
export function computeAero(state: AircraftState, inputs: ControlInputs, spec: AircraftSpec, aeroModel: AeroModel = B737_AERO): AeroResult {
  const { u, v, w } = state.velocity;
```

to:

```typescript
import type { WindInfo } from '../weather';
import { computeAirRelativeVelocity } from '../systems/environment';

export function computeAero(
  state: AircraftState,
  inputs: ControlInputs,
  spec: AircraftSpec,
  aeroModel: AeroModel = B737_AERO,
  wind: WindInfo | null = null,
): AeroResult {
  const { u, v, w } = computeAirRelativeVelocity(state, wind);
```

**Step 5: Thread wind through integrate and store**

In `src/sim/physics/integrate.ts`, import the type:

```typescript
import type { WindInfo } from '../weather';
```

Add parameter at the end:

```typescript
  wind?: WindInfo | null,
```

Change:

```typescript
  const aero = computeAero(state, inputs, spec);
```

to:

```typescript
  const aero = computeAero(state, inputs, spec, undefined, wind ?? null);
```

In `src/store/simStore.ts`, remove:

```typescript
    if (wind) {
      applyWind(state, wind);
    }
    integrate(state, inputs, spec, dt, apState, flightPlan);
```

and replace with:

```typescript
    integrate(state, inputs, spec, dt, apState, flightPlan, wind);
```

Also remove the now-unused `applyWind` import.

**Step 6: Verify targeted tests**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test -- src/sim/systems/__tests__/environment.test.ts src/sim/physics/__tests__/aero.test.ts src/store/__tests__/simStore.test.ts
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run typecheck
```

Expected: PASS.

**Step 7: Verify no destructive wind caller remains**

Run:
```bash
grep -R "applyWind" -n src
```

Expected: either no matches, or only the function definition plus tests explicitly covering legacy behavior. Prefer no production callers.

**Step 8: Commit**

```bash
git add src/sim/systems/environment.ts src/sim/systems/__tests__/environment.test.ts src/sim/physics/aero.ts src/sim/physics/integrate.ts src/store/simStore.ts src/store/__tests__/simStore.test.ts
git commit -m "fix: compute wind as air-relative velocity"
```

---

### Task 13: Enforce lint/check in CI

**Objective:** Make GitHub Actions reject future releases that do not pass the same local gate.

**Files:**
- Modify: `.github/workflows/ci.yml:18-21`

**Step 1: Verify local check passes first**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check
```

Expected: PASS. If not, stop and fix the failing task before editing CI.

**Step 2: Replace individual CI test commands with npm scripts**

In `.github/workflows/ci.yml`, replace:

```yaml
      - run: npx tsc --noEmit
      - run: npx vitest run
      - run: npx vite build
```

with:

```yaml
      - run: npm run lint:ci
      - run: npm run typecheck
      - run: npm run test
      - run: npm run build
```

**Step 3: Verify YAML parses and local gate still passes**

Run:
```bash
ruby -ryaml -e "YAML.load_file('.github/workflows/ci.yml'); puts 'OK'"
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check
```

Expected:
- Ruby command prints `OK`.
- `npm run check` passes.

**Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: enforce lint in RFS quality gate"
```

---

### Task 14: Post-implementation audit and final verification

**Objective:** Catch dimensional/sign/integration bugs that passing tests might miss.

**Files:**
- Read-only audit of all files changed in this plan.
- Optional modify: `docs/plans/2026-05-25-rfs-foundation-stabilization.md` if audit notes reveal plan corrections.

**Step 1: Read every modified file**

Use `git show --stat` and `git show --name-only` for each task commit. For every changed source file, manually check:

- Units: kg vs N vs lbf, ft vs m.
- Sign conventions: x-forward, y-right, z-down; NED down positive; VS positive climbing.
- State mutation: wind must not mutate `state.velocity`.
- Derived values: GS/VS from NED, TAS/IAS from air-relative velocity.
- Autopilot state: no `any` casts hiding wrong RFMS mode names.

**Step 2: Run full gate**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check
```

Expected: PASS.

**Step 3: Run a one-minute local smoke if desired**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run dev -- --host 127.0.0.1
```

Expected: Vite serves locally. Do not leave it running in the foreground; stop with Ctrl-C after checking startup.

**Step 4: Verify git history and worktree**

Run:
```bash
git log --oneline -8
git status --short
```

Expected:
- Recent commits match the task commits.
- `git status --short` is clean.

---

## Follow-up plans after this phase

Write separate plans, do not fold them into this stabilization phase:

1. **RFS Ground Model Plan**
   - Terrain/runway AGL.
   - Nose/main gear stations.
   - Oleo spring-damper.
   - Brake/anti-skid/nosewheel steering.
   - Takeoff, touchdown, rollout tests.

2. **RFS Flight Guidance Plan**
   - MCP selected targets.
   - LNAV active-leg state and sequencing.
   - VNAV SPD/PTH lifecycle.
   - RFMS FMA integration.

3. **RFS Worker Physics Plan**
   - `src/worker/codec.ts` first.
   - `src/worker/physics.worker.ts` second.
   - `src/worker/bridge.ts` third.
   - Store integration last.
   - Mark cross-cutting store/worker integration `[PARENT-DIRECT]`.

4. **RFS Rendering Lifecycle Plan**
   - One Cesium viewer provider.
   - One ThreeToCesium bridge.
   - Persistent aircraft object.
   - Full quaternion orientation.
   - Camera manager.

---

## Execution handoff

Plan complete. Execute with `subagent-driven-development` as follows:

- Use one fresh implementer subagent per non-`[PARENT-DIRECT]` task.
- Do not dispatch parallel subagents that both commit to git.
- Parent session executes Tasks 7, 10, 11, and 12 directly.
- After every subagent, verify actual worktree state with:

```bash
git status --short
git diff --stat
git log --oneline -3
```

- After each implementation, run spec compliance review first, code quality review second.
- After the final task, run the post-implementation audit before claiming done.
