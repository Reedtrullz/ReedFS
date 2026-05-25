# Phase 8: Physics Refactor — Quaternions & Data-Driven Aero

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

> **Status note (2026-05-25):** Quaternion attitude integration and the swappable aero model foundation are partially implemented and stabilized. The current derivative convention is `dq/dt = 0.5 * q ⊗ ω` for body-axis angular rates. Some larger data-driven FDM/display cleanup work remains in `../roadmap.md`.

**Goal:** Replace Euler angles with quaternions in the state vector (eliminates gimbal lock at ±90° pitch), move Boeing 737-800 aerodynamic coefficients to a JSON data file (enables aircraft swapping), and refactor `integrate.ts` to use swappable module interfaces matching the mscsim pattern.

**Architecture:** The `Attitude` interface changes from `{phi, theta, psi}` to `{q0, q1, q2, q3}` — a unit quaternion representing body-frame orientation relative to NED. Euler angle rates (φ̇, θ̇, ψ̇) are replaced with quaternion derivative (q̇ = 0.5 * q ⊗ ω). Aerodynamic coefficients move from hardcoded `cl0=0.65, clAlpha=5.73` to `src/sim/data/b737.json`. The `computeAero()` function accepts an `AeroModel` interface that can be swapped per aircraft. All display code (Telemetry, PFD, AttitudeIndicator, ThreeLayer) converts quaternion → Euler angles for human-readable output only at the display boundary.

**Tech Stack:** Same — React 19, TypeScript strict, Vite 8, Zustand.

**Impact analysis:** This touches `types.ts`, `integrate.ts`, `aero.ts`, `derived.ts`, and 4+ display components. Every file that reads `state.attitude.phi/theta/psi` must change. **This is a high-risk refactor.** Tasks are ordered to minimize breakage: types first → physics → aero → display.

---

### Task 1: Quaternion Types & Conversion Utilities

**Objective:** Add quaternion types to `src/sim/types.ts` and create conversion functions between quaternions and Euler angles. Existing Euler angle code continues to work while we migrate.

**Files:**
- Modify: `src/sim/types.ts` — add `Quaternion` interface, keep `Attitude` for backward compat
- Create: `src/sim/physics/quaternion.ts` — conversion functions
- Create: `src/sim/physics/__tests__/quaternion.test.ts`

**Step 1: Write failing test** — `src/sim/physics/__tests__/quaternion.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { eulerToQuat, quatToEuler, quatMultiply, quatDerivative } from '../quaternion';

describe('eulerToQuat round-trip', () => {
  it('zero attitude', () => {
    const q = eulerToQuat(0, 0, 0);
    expect(q.q0).toBeCloseTo(1);
    expect(q.q1).toBeCloseTo(0);
    expect(q.q2).toBeCloseTo(0);
    expect(q.q3).toBeCloseTo(0);
  });

  it('90° yaw round-trip', () => {
    const q = eulerToQuat(0, 0, Math.PI / 2);
    const e = quatToEuler(q);
    expect(e.phi).toBeCloseTo(0);
    expect(e.theta).toBeCloseTo(0);
    expect(e.psi).toBeCloseTo(Math.PI / 2, 4);
  });

  it('quaternion derivative from angular velocity', () => {
    const q = eulerToQuat(0, 0, 0);
    const omega = { p: 1, q: 0, r: 0 }; // pure roll
    const qdot = quatDerivative(q, omega);
    // dq/dt = 0.5 * q ⊗ omega
    expect(qdot.q0).toBeCloseTo(0);
    expect(qdot.q1).toBeCloseTo(0.5); // half roll rate
  });
});
```

Run: `npx vitest run src/sim/physics/__tests__/quaternion.test.ts` → FAIL

**Step 2: Write implementation** — `src/sim/physics/quaternion.ts`

```typescript
export interface Quaternion {
  q0: number; // scalar (w)
  q1: number; // x
  q2: number; // y
  q3: number; // z
}

export interface EulerAngles {
  phi: number;   // roll, rad
  theta: number; // pitch, rad
  psi: number;   // yaw, rad
}

/** Convert Euler angles (ZYX convention) to quaternion */
export function eulerToQuat(phi: number, theta: number, psi: number): Quaternion {
  const cphi = Math.cos(phi / 2), sphi = Math.sin(phi / 2);
  const ctht = Math.cos(theta / 2), stht = Math.sin(theta / 2);
  const cpsi = Math.cos(psi / 2), spsi = Math.sin(psi / 2);

  return {
    q0: cphi * ctht * cpsi + sphi * stht * spsi,
    q1: sphi * ctht * cpsi - cphi * stht * spsi,
    q2: cphi * stht * cpsi + sphi * ctht * spsi,
    q3: cphi * ctht * spsi - sphi * stht * cpsi,
  };
}

/** Convert quaternion to Euler angles (ZYX) */
export function quatToEuler(q: Quaternion): EulerAngles {
  const { q0, q1, q2, q3 } = q;
  const phi = Math.atan2(2 * (q0 * q1 + q2 * q3), 1 - 2 * (q1 * q1 + q2 * q2));
  const theta = Math.asin(Math.max(-1, Math.min(1, 2 * (q0 * q2 - q3 * q1))));
  const psi = Math.atan2(2 * (q0 * q3 + q1 * q2), 1 - 2 * (q2 * q2 + q3 * q3));
  return { phi, theta, psi };
}

/** Quaternion multiplication: a ⊗ b */
export function quatMultiply(a: Quaternion, b: Quaternion): Quaternion {
  return {
    q0: a.q0 * b.q0 - a.q1 * b.q1 - a.q2 * b.q2 - a.q3 * b.q3,
    q1: a.q0 * b.q1 + a.q1 * b.q0 + a.q2 * b.q3 - a.q3 * b.q2,
    q2: a.q0 * b.q2 - a.q1 * b.q3 + a.q2 * b.q0 + a.q3 * b.q1,
    q3: a.q0 * b.q3 + a.q1 * b.q2 - a.q2 * b.q1 + a.q3 * b.q0,
  };
}

/** Quaternion derivative: dq/dt = 0.5 * q ⊗ ω where ω = (0, p, q, r) */
export function quatDerivative(q: Quaternion, omega: { p: number; q: number; r: number }): Quaternion {
  const omegaQ: Quaternion = { q0: 0, q1: omega.p, q2: omega.q, q3: omega.r };
  const result = quatMultiply(q, omegaQ);
  return { q0: result.q0 * 0.5, q1: result.q1 * 0.5, q2: result.q2 * 0.5, q3: result.q3 * 0.5 };
}

/** Normalize a quaternion to unit length */
export function quatNormalize(q: Quaternion): Quaternion {
  const mag = Math.sqrt(q.q0 * q.q0 + q.q1 * q.q1 + q.q2 * q.q2 + q.q3 * q.q3);
  if (mag < 1e-10) return { q0: 1, q1: 0, q2: 0, q3: 0 };
  return { q0: q.q0 / mag, q1: q.q1 / mag, q2: q.q2 / mag, q3: q.q3 / mag };
}
```

Run: `npx vitest run src/sim/physics/__tests__/quaternion.test.ts` → 3 passed.

**Step 3: Commit**

```bash
git add src/sim/physics/quaternion.ts src/sim/physics/__tests__/quaternion.test.ts
git commit -m "feat: add quaternion types and conversion utilities"
```

---

### Task 2: Add Quaternion to AircraftState

**Objective:** Add `quaternion: Quaternion` to `AircraftState` (alongside existing `attitude` for backward compat). Update `createInitialState` and the codec.

**Files:**
- Modify: `src/sim/types.ts` — add `quaternion` field
- Modify: `src/sim/types.test.ts` — verify initial quaternion

**Step 1: Write failing test** — update `src/sim/__tests__/types.test.ts`

Add:
```typescript
  it('initial quaternion is identity', () => {
    const s = createInitialState(B737_800_SPEC);
    expect(s.quaternion.q0).toBeCloseTo(1);
    expect(s.quaternion.q1).toBeCloseTo(0);
    expect(s.quaternion.q2).toBeCloseTo(0);
    expect(s.quaternion.q3).toBeCloseTo(0);
  });
```

**Step 2: Add to types** — `src/sim/types.ts`

Add import:
```typescript
import type { Quaternion } from './physics/quaternion';
```

Add to `AircraftState`:
```typescript
  quaternion: Quaternion;
```

Add to `createInitialState`:
```typescript
    quaternion: { q0: 1, q1: 0, q2: 0, q3: 0 },
```

**Step 3: Verify**

```bash
npx vitest run src/sim/__tests__/types.test.ts
```
Expected: 4 passed (3 existing + 1 new).

**Step 4: Commit**

```bash
git add src/sim/types.ts src/sim/__tests__/types.test.ts
git commit -m "feat: add quaternion to AircraftState"
```

---

### Task 3: Quaternion Integration in integrate.ts [PARENT-DIRECT]

**Objective:** Replace Euler angle integration (φ̇, θ̇, ψ̇ rates) with quaternion derivative in `integrate.ts`. The Euler angles are computed from the quaternion after each step for backward compatibility.

**Files:**
- Modify: `src/sim/physics/integrate.ts` — replace Euler rate block with quaternion derivative

> **[PARENT-DIRECT]** This task touches the heart of the physics engine. Execute directly, not via subagent. The change is localized to one section of one file but must be done carefully.

**Change:** In `integrate.ts`, replace lines 31-51 (Euler angle rates section) with:

```typescript
  // ── Quaternion derivative (replaces Euler angle rates) ──
  import { quatDerivative, quatNormalize, quatToEuler } from './quaternion';

  const qdot = quatDerivative(state.quaternion, state.angularVel);
  state.quaternion.q0 += qdot.q0 * dt;
  state.quaternion.q1 += qdot.q1 * dt;
  state.quaternion.q2 += qdot.q2 * dt;
  state.quaternion.q3 += qdot.q3 * dt;
  const norm = quatNormalize(state.quaternion);
  state.quaternion = norm;

  // Compute Euler angles from quaternion (for backward compat)
  const euler = quatToEuler(norm);
  state.attitude.phi = euler.phi;
  state.attitude.theta = euler.theta;
  state.attitude.psi = euler.psi;
```

Also remove the while-loop psi normalization — quaternions don't need it.

**Step: Verify**

```bash
npx vitest run && npx tsc --noEmit
```
Expected: all integration tests pass (aircraft still flies correctly).

**Step: Commit**

```bash
git add src/sim/physics/integrate.ts
git commit -m "feat: use quaternion integration for attitude"
```

---

### Task 4: Aircraft Data File — 737-800 JSON

**Objective:** Move `B737_800_SPEC` constants and aerodynamic coefficients to a JSON data file. The code loads from JSON at runtime, enabling future aircraft swapping.

**Files:**
- Create: `src/sim/data/b737.json`
- Modify: `src/sim/types.ts` — add `loadAircraftSpec()` function

**Step 1: Create data file** — `src/sim/data/b737.json`

```json
{
  "id": "b737-800",
  "name": "Boeing 737-800",
  "mass": {
    "emptyWeight": 41413,
    "maxFuel": 20894,
    "maxTakeoffWeight": 79015,
    "cgLimits": [7, 30],
    "fuelCapacity": { "center": 13066, "left": 3914, "right": 3914 }
  },
  "geometry": {
    "wingArea": 124.6,
    "wingSpan": 35.8,
    "meanChord": 3.96
  },
  "propulsion": {
    "engineCount": 2,
    "maxThrust": 27300
  },
  "inertia": {
    "ixx": 1340000,
    "iyy": 3450000,
    "izz": 4610000,
    "ixz": 40000
  },
  "aerodynamics": {
    "cl0": 0.25,
    "clAlpha": 5.73,
    "cd0": 0.018,
    "cdFlap": 0.015,
    "cdGear": 0.025,
    "cdSpeedBrake": 0.04,
    "oswaldEfficiency": 0.8,
    "stallSpeedClean": 120,
    "flapClIncrements": [0, 0.4, 0.4, 0.4, 0.7, 0.7, 1.0, 1.3, 1.6],
    "flapDetents": [0, 1, 2, 5, 10, 15, 25, 30, 40]
  }
}
```

**Step 2: Add loader** — at bottom of `src/sim/types.ts`

```typescript
import b737Data from './data/b737.json';

export function loadAircraftSpec(): AircraftSpec {
  const d = b737Data;
  return {
    emptyWeight: d.mass.emptyWeight,
    maxFuel: d.mass.maxFuel,
    maxTakeoffWeight: d.mass.maxTakeoffWeight,
    wingArea: d.geometry.wingArea,
    wingSpan: d.geometry.wingSpan,
    meanChord: d.geometry.meanChord,
    maxThrust: d.propulsion.maxThrust,
    engineCount: d.propulsion.engineCount,
    vStall: d.aerodynamics.stallSpeedClean,
    maxFlaps: 40,
    cgLimits: d.mass.cgLimits as [number, number],
    fuelCapacity: d.mass.fuelCapacity as { center: number; left: number; right: number },
    ixx: d.inertia.ixx,
    iyy: d.inertia.iyy,
    izz: d.inertia.izz,
    ixz: d.inertia.ixz,
  };
}
```

Use `loadAircraftSpec()` instead of `B737_800_SPEC` in `createInitialState` and `simStore`.

**Step 3: Verify**

```bash
npx vitest run && npx tsc --noEmit
```

**Step 4: Commit**

```bash
git add src/sim/data/ src/sim/types.ts
git commit -m "feat: load 737-800 spec from JSON data file"
```

---

### Task 5: Swappable AeroModel Interface

**Objective:** Extract aerodynamic coefficients into an `AeroModel` interface. `computeAero()` reads coefficients from the model instead of hardcoded constants. The JSON data file provides the default 737 model.

**Files:**
- Create: `src/sim/systems/AeroModel.ts` — interface definition
- Modify: `src/sim/physics/aero.ts` — accept `AeroModel` parameter

**Step 1: Define interface** — `src/sim/systems/AeroModel.ts`

```typescript
export interface AeroModel {
  cl0: number;
  clAlpha: number;        // per radian
  flapClIncrements: number[];
  flapDetents: number[];
  cd0: number;
  cdFlap: number;
  cdGear: number;
  cdSpeedBrake: number;
  oswaldEfficiency: number;

  // Moment coefficients
  cm0: number;
  cmAlpha: number;
  cmElevator: number;     // per radian
  cmq: number;            // pitch damping
  cmFlap: number;

  clBeta: number;         // dihedral
  clAileron: number;      // per radian
  clp: number;            // roll damping

  cnBeta: number;         // weathervane
  cnRudder: number;       // per radian
  cnr: number;            // yaw damping
}

import b737Data from '../data/b737.json';

export const B737_AERO: AeroModel = {
  cl0: b737Data.aerodynamics.cl0,
  clAlpha: b737Data.aerodynamics.clAlpha,
  flapClIncrements: b737Data.aerodynamics.flapClIncrements,
  flapDetents: b737Data.aerodynamics.flapDetents,
  cd0: b737Data.aerodynamics.cd0,
  cdFlap: b737Data.aerodynamics.cdFlap,
  cdGear: b737Data.aerodynamics.cdGear,
  cdSpeedBrake: b737Data.aerodynamics.cdSpeedBrake,
  oswaldEfficiency: b737Data.aerodynamics.oswaldEfficiency,

  cm0: -0.05, cmAlpha: -0.8, cmElevator: -1.2, cmq: -12, cmFlap: 0.02,
  clBeta: -0.08, clAileron: 0.06, clp: -0.4,
  cnBeta: 0.12, cnRudder: -0.07, cnr: -0.15,
};
```

**Step 2: Modify `computeAero`** to accept `AeroModel` and use its coefficients.

**Step 3: Verify**

```bash
npx vitest run && npx tsc --noEmit
```

**Step 4: Commit**

```bash
git add src/sim/systems/AeroModel.ts src/sim/physics/aero.ts
git commit -m "feat: swappable AeroModel interface with 737-800 defaults"
```

---

### Task 6: Display Layer — Euler from Quaternion

**Objective:** Update all display components (Telemetry, PFD, AttitudeIndicator, ThreeLayer) to derive Euler angles from `state.quaternion` using `quatToEuler()`. Remove direct `state.attitude.phi/theta/psi` reads.

**Files:**
- Modify: `src/components/Telemetry.tsx`
- Modify: `src/instruments/RfsPFD.tsx`
- Modify: `src/components/AttitudeIndicator.tsx`
- Modify: `src/viewport/ThreeLayer.tsx`
- Modify: `src/viewport/ContrailLayer.tsx`
- Modify: `src/hooks/useAudioLoop.ts` (GPWS checks)

**Step 1: Add helper** — in each component, replace `state.attitude.phi` with:

```typescript
import { quatToEuler } from '../sim/physics/quaternion';
const euler = quatToEuler(aircraft.quaternion);
// Use euler.phi, euler.theta, euler.psi
```

**Step 2: Verify**

```bash
npx vitest run && npx tsc --noEmit
npx vite build
```

**Step 3: Commit**

```bash
git add src/components/ src/instruments/ src/viewport/ src/hooks/
git commit -m "feat: derive Euler angles from quaternion in display layer"
```

---

### Task 7: Final Verification

**Objective:** Full suite, build, visual smoke test. Ensure the aircraft flies identically to before the refactor.

```bash
npx vitest run && npx tsc --noEmit && npx vite build
```

Visual checklist:
- [ ] Aircraft takes off and climbs normally from KSEA
- [ ] Attitude indicator shows correct pitch/roll
- [ ] PFD tapes scroll correctly
- [ ] Telemetry HUD shows correct heading
- [ ] Chase camera follows correctly
- [ ] No gimbal lock at vertical pitch (±90°)
- [ ] GPWS callouts still work at correct altitudes

---

## Phase 8 Complete — What Changed

| Before | After |
|--------|-------|
| Euler angles in state vector | Quaternion in state vector (Euler derived for display) |
| Gimbal lock at ±90° pitch | No singularity — quaternions are singularity-free |
| Hardcoded `B737_800_SPEC` | JSON data file, loaded at runtime |
| Hardcoded `computeAero` coefficients | Swappable `AeroModel` interface |
| `while` loop psi normalization | Not needed — quaternions normalize with one sqrt |
