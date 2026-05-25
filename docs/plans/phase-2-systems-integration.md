# Phase 2: Systems Integration — Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

> **Status note (2026-05-25):** Historical implementation plan. Use `../architecture.md` for the current implementation, `../physics-invariants.md` for active flight-model contracts, and `../roadmap.md` for prioritized next work. Do not assume older React version, worker, wind, or phase-status wording below reflects the current app.


**Goal:** Integrate aircraft systems (engine, fuel, hydraulic, electrical), autopilot PID bridge to RFMS avionics, LNAV/VNAV route following, glTF 3D model, METAR weather, and Web Audio engine sounds into a cohesive flight simulator.

**Architecture:** Systems are pure transform functions in `src/sim/systems/` that run in order within `integrate()`. The autopilot bridge (`src/sim/systems/autopilot.ts`) imports `AutopilotState` and `FlightPlan` from RFMS `@shared` and translates lateral/vertical/thrust modes into PID-driven `ControlInputs`. LNAV computes cross-track error from the flight plan waypoints; VNAV computes required vertical speed from altitude constraints. Audio uses the Web Audio API directly (no libraries). Weather fetches METAR from aviationweather.gov. A glTF 737 model replaces the box proxy.

**Tech Stack:** React 18, TypeScript strict, Vite, Zustand, Vitest, CesiumJS, Three.js, three-to-cesium, Web Audio API, RFMS `@shared` types.

---

### Task 1: Engine System Refinement

**Objective:** Replace the simple first-order N1 lag with a proper twin-spool turbofan model: N1 spool (slow), N2 spool (fast), EGT from N2, fuel flow from thrust, start sequence support.

**Files:**
- Create: `src/sim/systems/engine.ts`
- Create: `src/sim/systems/__tests__/engine.test.ts`
- Modify: `src/sim/physics/integrate.ts:86-96` — replace inline engine code with call to engine system

**Step 1: Write failing test**

`src/sim/systems/__tests__/engine.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { updateEngines } from '../engine';
import { createInitialState, B737_800_SPEC, ControlInputs } from '../../types';

const idle: ControlInputs = { elevator: 0, aileron: 0, rudder: 0, throttle1: 0, throttle2: 0, flapLever: 0, gearLever: 'DOWN', spoilers: 0, brake: 0 };

describe('updateEngines', () => {
  it('N1 spools toward commanded value', () => {
    const s = createInitialState(B737_800_SPEC);
    updateEngines(s, { ...idle, throttle1: 1, throttle2: 1 }, B737_800_SPEC, 1);
    expect(s.engines[0].n1).toBeGreaterThan(0);
    expect(s.engines[0].n1).toBeLessThan(100);
  });

  it('N2 spools faster than N1', () => {
    const s = createInitialState(B737_800_SPEC);
    updateEngines(s, { ...idle, throttle1: 1, throttle2: 1 }, B737_800_SPEC, 3);
    expect(s.engines[0].n2).toBeGreaterThan(s.engines[0].n1);
  });

  it('fuel flow increases with N1', () => {
    const s = createInitialState(B737_800_SPEC);
    s.engines[0].n1 = 90; s.engines[0].running = true;
    updateEngines(s, { ...idle, throttle1: 0.9, throttle2: 0.9 }, B737_800_SPEC, 0);
    expect(s.engines[0].fuelFlow).toBeGreaterThan(100);
  });
});
```

Run: `npx vitest run src/sim/systems/__tests__/engine.test.ts` → FAIL

**Step 2: Write implementation**

`src/sim/systems/engine.ts`:
```typescript
import type { AircraftState, AircraftSpec, ControlInputs } from '../types';

/**
 * Twin-spool turbofan engine model.
 * N2 (high-pressure spool) responds ~2x faster than N1 (low-pressure).
 * EGT is a function of N2 and fuel flow.
 * Fuel flow = SFC * thrust, with SFC varying by altitude and power.
 */
export function updateEngines(
  state: AircraftState,
  inputs: ControlInputs,
  spec: AircraftSpec,
  dt: number,
): void {
  for (let i = 0; i < 2; i++) {
    const eng = state.engines[i];
    const throttle = i === 0 ? inputs.throttle1 : inputs.throttle2;

    // Target N1 from throttle (non-linear: idle ~20%, TOGA ~100%)
    const n1Target = throttle > 0.01 ? 20 + throttle * 80 : 0;

    // N1 spool: time constant varies with power
    const n1Tc = throttle > 0.5 ? 1.5 : 3.0; // slower spool-down
    eng.n1 += (n1Target - eng.n1) * (dt / n1Tc);

    // N2 spool: faster, slaved to N1 with a ratio (~2.5:1 at high power)
    const n2Target = n1Target > 0 ? 22 + (n1Target - 20) * 1.05 : 0;
    const n2Tc = 0.6;
    eng.n2 += (n2Target - eng.n2) * (dt / n2Tc);

    // EGT: function of N2 and fuel flow. ~400°C idle, ~900°C TOGA
    eng.egt = eng.n2 > 5 ? 350 + eng.n2 * 5.5 : 20;

    // Fuel flow (kg/hr per engine): rough SFC model
    // SFC ~0.55 lb/lbf/hr at cruise, higher at low altitude / high power
    const sfc = 0.55 + (1 - Math.min(1, eng.n1 / 100)) * 0.2;
    const thrustLbf = spec.maxThrust * (eng.n1 / 100) * (eng.n1 / 100); // thrust ∝ N1²
    eng.fuelFlow = sfc * thrustLbf * 0.4536; // lb/hr → kg/hr

    eng.thrust = thrustLbf;
    eng.running = eng.n1 > 0.5;
  }

  // Total fuel flow
  state.fuel.fuelFlowTotal = state.engines[0].fuelFlow + state.engines[1].fuelFlow;
}
```

Run: `npx vitest run src/sim/systems/__tests__/engine.test.ts` → 3 passed.

**Step 3: Integrate into integrate.ts**

Replace lines 86-96 in `src/sim/physics/integrate.ts` (the engine spool and fuel burn sections) with:
```typescript
  // ── Engine system ──
  updateEngines(state, inputs, spec, dt);

  // ── Fuel burn ──
  const fuelUsed = (state.fuel.fuelFlowTotal / 3600) * dt;
  state.fuel.totalFuel = Math.max(0, state.fuel.totalFuel - fuelUsed);
  state.grossWeight = spec.emptyWeight + state.fuel.totalFuel;
```

Add import: `import { updateEngines } from '../systems/engine';`

**Step 4: Commit**

```bash
git add src/sim/systems/ src/sim/physics/integrate.ts
git commit -m "feat: add twin-spool engine system (N1/N2, EGT, fuel flow)"
```

---

### Task 2: Fuel System — Tank Balancing & CG

**Objective:** Model three tanks (center, left wing, right wing) with proper burn order and CG shift.

**Files:**
- Create: `src/sim/systems/fuel.ts`
- Create: `src/sim/systems/__tests__/fuel.test.ts`
- Modify: `src/sim/physics/integrate.ts` — replace fuel burn section with tank-aware model

**Step 1: Write failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { updateFuel } from '../fuel';
import { createInitialState, B737_800_SPEC } from '../../types';

describe('updateFuel', () => {
  it('burns center tank first', () => {
    const s = createInitialState(B737_800_SPEC);
    s.fuel.fuelFlowTotal = 3000; // kg/hr
    updateFuel(s, B737_800_SPEC, 1 / 3600); // 1 second
    expect(s.fuel.centerTank).toBeLessThan(B737_800_SPEC.fuelCapacity.center);
    expect(s.fuel.leftTank).toBe(B737_800_SPEC.fuelCapacity.left); // unchanged
  });

  it('shifts CG forward as fuel burns', () => {
    const s = createInitialState(B737_800_SPEC);
    const cgBefore = s.cg;
    s.fuel.fuelFlowTotal = 5000;
    updateFuel(s, B737_800_SPEC, 60); // 1 minute
    // Center tank depletes → CG shifts aft (center is forward of CG)
    // Actually center tank is near CG, wing tanks are slightly aft
    expect(s.cg).not.toBe(cgBefore);
  });
});
```

**Step 2: Write implementation**

`src/sim/systems/fuel.ts`:
```typescript
import type { AircraftState, AircraftSpec } from '../types';

/**
 * Fuel burn order: center tank → wing tanks (simultaneously).
 * CG shifts based on tank quantities.
 * 737-800: center tank near 25% MAC, wing tanks near 28% MAC.
 */
export function updateFuel(
  state: AircraftState,
  spec: AircraftSpec,
  dt: number,
): void {
  let remaining = (state.fuel.fuelFlowTotal / 3600) * dt; // kg to burn this tick

  // Burn center tank first
  const fromCenter = Math.min(remaining, state.fuel.centerTank);
  state.fuel.centerTank -= fromCenter;
  remaining -= fromCenter;

  // Burn wing tanks equally
  const fromEach = Math.min(remaining / 2, state.fuel.leftTank, state.fuel.rightTank);
  state.fuel.leftTank -= fromEach;
  state.fuel.rightTank -= fromEach;

  state.fuel.totalFuel = state.fuel.centerTank + state.fuel.leftTank + state.fuel.rightTank;

  // CG shift: center tank at 22% MAC, wings at 30% MAC, empty aircraft at 25%
  const total = state.fuel.totalFuel + spec.emptyWeight;
  const cgCenter = 22, cgWing = 30, cgEmpty = 25;
  state.cg = (
    spec.emptyWeight * cgEmpty +
    state.fuel.centerTank * cgCenter +
    (state.fuel.leftTank + state.fuel.rightTank) * cgWing
  ) / total;
}
```

**Step 3: Integrate** — replace fuel burn in integrate.ts:

```typescript
  // ── Fuel system ──
  updateFuel(state, spec, dt);
  state.grossWeight = spec.emptyWeight + state.fuel.totalFuel;
```

**Step 4: Commit**

```bash
git add src/sim/systems/fuel.ts src/sim/systems/__tests__/fuel.test.ts src/sim/physics/integrate.ts
git commit -m "feat: add fuel system with tank balancing and CG shift"
```

---

### Task 3: Electrical System

**Objective:** Basic electrical model: generator status from engine N2, battery voltage, bus power available flag.

**Files:**
- Create: `src/sim/systems/electrical.ts`
- Create: `src/sim/systems/__tests__/electrical.test.ts`
- Modify: `src/sim/types.ts` — add `ElectricalState` to `AircraftState`
- Modify: `src/sim/physics/integrate.ts` — call electrical system

**Step 1: Write failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { updateElectrical } from '../electrical';
import { createInitialState, B737_800_SPEC } from '../../types';

describe('updateElectrical', () => {
  it('generators online when N2 > 50%', () => {
    const s = createInitialState(B737_800_SPEC);
    s.engines[0].n2 = 60; s.engines[0].running = true;
    s.engines[1].n2 = 60; s.engines[1].running = true;
    updateElectrical(s, 1);
    expect(s.electrical.gen1Online).toBe(true);
    expect(s.electrical.gen2Online).toBe(true);
    expect(s.electrical.acBusPowered).toBe(true);
  });

  it('battery depletes without generators', () => {
    const s = createInitialState(B737_800_SPEC);
    expect(s.electrical.batteryVolts).toBe(28);
    updateElectrical(s, 60); // 1 minute on battery
    expect(s.electrical.batteryVolts).toBeLessThan(28);
  });
});
```

**Step 2: Write implementation**

`src/sim/systems/electrical.ts`:
```typescript
import type { AircraftState, ElectricalState } from '../types';

export function updateElectrical(state: AircraftState, dt: number): void {
  const e = state.electrical;

  // Generators online when N2 > 55%
  e.gen1Online = state.engines[0].running && state.engines[0].n2 > 55;
  e.gen2Online = state.engines[1].running && state.engines[1].n2 > 55;

  // AC bus powered if either generator online
  e.acBusPowered = e.gen1Online || e.gen2Online;

  // Battery drain: 28V nominal, ~0.5V per minute under load without charging
  if (!e.acBusPowered && e.batteryVolts > 18) {
    e.batteryVolts -= 0.5 * (dt / 60);
  } else if (e.acBusPowered && e.batteryVolts < 28) {
    e.batteryVolts = Math.min(28, e.batteryVolts + 1 * (dt / 60));
  }
}
```

**Step 3: Add ElectricalState to types.ts**

Add to `AircraftState`:
```typescript
  electrical: ElectricalState;
```

Add interface:
```typescript
export interface ElectricalState {
  gen1Online: boolean;
  gen2Online: boolean;
  acBusPowered: boolean;
  batteryVolts: number; // 0-28
}
```

Update `createInitialState`:
```typescript
    electrical: { gen1Online: false, gen2Online: false, acBusPowered: false, batteryVolts: 28 },
```

**Step 4: Commit**

```bash
git add src/sim/systems/electrical.ts src/sim/systems/__tests__/ src/sim/types.ts src/sim/physics/integrate.ts
git commit -m "feat: add electrical system (generators, battery, bus)"
```

---

### Task 4: Hydraulic System

**Objective:** Hydraulic pressure model — System A (engine 1 pump), System B (engine 2 pump), standby. Pressure affects flight control effectiveness.

**Files:**
- Create: `src/sim/systems/hydraulic.ts`
- Create: `src/sim/systems/__tests__/hydraulic.test.ts`
- Modify: `src/sim/types.ts` — add `HydraulicState`
- Modify: `src/sim/physics/integrate.ts` — call hydraulic system

**Step 1: Write test + implementation** (similar TDD pattern to above)

`hydraulic.ts`:
```typescript
export interface HydraulicState {
  systemAPsi: number;  // 0-3000
  systemBPsi: number;
  standbyPsi: number;
}

export function updateHydraulic(state: AircraftState, dt: number): void {
  const h = state.hydraulic;
  // System A: engine 1 pump + electric pump
  const aTarget = (state.engines[0].running && state.engines[0].n2 > 30) ? 3000 : 0;
  h.systemAPsi += (aTarget - h.systemAPsi) * (dt / 0.5);

  // System B: engine 2 pump + electric pump
  const bTarget = (state.engines[1].running && state.engines[1].n2 > 30) ? 3000 : 0;
  h.systemBPsi += (bTarget - h.systemBPsi) * (dt / 0.5);

  // Standby: electric pump, always available if battery > 20V
  h.standbyPsi = state.electrical.batteryVolts > 20 ? 3000 : 0;
}
```

**Step 2: Commit**

```bash
git add src/sim/systems/hydraulic.ts src/sim/systems/__tests__/ src/sim/types.ts src/sim/physics/integrate.ts
git commit -m "feat: add hydraulic system (A/B/standby pressure)"
```

---

### Task 5: Autopilot PID Controllers

**Objective:** THE critical bridge. Import `AutopilotState` from RFMS `@shared`, implement PID controllers for roll, pitch, and thrust channels that translate autopilot modes into `ControlInputs`.

**Files:**
- Create: `src/sim/systems/autopilot.ts`
- Create: `src/sim/systems/__tests__/autopilot.test.ts`

**Architecture:**

```
RFMS AutopilotState.truth
  ├── lateralActive: LateralMode (HDG_SEL | LNAV | VOR_LOC | ...)
  ├── verticalActive: VerticalMode (ALT_HOLD | VS | VNAV | LVL_CHG | ...)
  └── thrustActive: ThrustMode (SPEED | N1 | ...)

              ↓ autopilot.ts (PID controllers)

RFS ControlInputs { elevator, aileron, rudder, throttle1, throttle2 }
              ↓
RFS Physics (integrate.ts → computeAero)
```

**Step 1: Write failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { updateAutopilot } from '../autopilot';
import { createInitialState, B737_800_SPEC, ControlInputs } from '../../types';
import type { AutopilotState } from '@shared/autopilot/autopilotTypes';

const defaultAp: AutopilotState = {
  boeing: { /* ... full BoeingMCPState zeros ... */ },
  airbus: { /* ... full AirbusFCUState zeros ... */ },
  truth: {
    lateralActive: 'HDG_SEL',
    verticalActive: 'ALT_HOLD',
    thrustActive: 'SPEED',
    autopilotStatus: 'CMD_A',
    lastModeChangeTimestamps: { thrust: 0, lateral: 0, vertical: 0 },
  },
};

describe('updateAutopilot', () => {
  it('HDG_SEL drives aileron toward target heading', () => {
    const s = createInitialState(B737_800_SPEC);
    s.velocity.u = 128; // flying
    s.attitude.psi = 0; // heading north
    const inputs: ControlInputs = { /* defaults */ };
    const ap = { ...defaultAp };
    ap.truth.lateralActive = 'HDG_SEL';
    // Target heading 45° right, aircraft heading 0°
    // Should produce LEFT aileron (negative) to roll right
    updateAutopilot(s, inputs, ap, 45, 10000, 250, 1/60);
    expect(inputs.aileron).toBeLessThan(0); // roll right
  });

  it('ALT_HOLD pitches to maintain altitude', () => {
    const s = createInitialState(B737_800_SPEC);
    s.velocity.u = 128;
    s.position.alt = 10000;
    const inputs: ControlInputs = { /* defaults */ };
    const ap = { ...defaultAp };
    ap.truth.verticalActive = 'ALT_HOLD';
    updateAutopilot(s, inputs, ap, 0, 10000, 250, 1/60);
    // At exactly target altitude, elevator should be near zero
    expect(Math.abs(inputs.elevator)).toBeLessThan(0.1);
  });
});
```

**Step 2: Write implementation**

`src/sim/systems/autopilot.ts`:
```typescript
import type { AircraftState, ControlInputs } from '../types';
import type { AutopilotState } from '@shared/autopilot/autopilotTypes';

interface PidState {
  integral: number;
  prevError: number;
}

const rollPid: PidState = { integral: 0, prevError: 0 };
const pitchPid: PidState = { integral: 0, prevError: 0 };
const thrustPid: PidState = { integral: 0, prevError: 0 };

const ROLL_KP = 0.02, ROLL_KI = 0.001, ROLL_KD = 0.005;
const PITCH_KP = 0.03, PITCH_KI = 0.002, PITCH_KD = 0.01;
const THRUST_KP = 0.01, THRUST_KI = 0.0005, THRUST_KD = 0.002;

function pidUpdate(pid: PidState, error: number, kp: number, ki: number, kd: number, dt: number): number {
  pid.integral += error * dt;
  const derivative = (error - pid.prevError) / Math.max(dt, 0.001);
  pid.prevError = error;
  return kp * error + ki * pid.integral + kd * derivative;
}

export function updateAutopilot(
  state: AircraftState,
  inputs: ControlInputs,
  apState: AutopilotState,
  targetHeading: number,
  targetAlt: number,
  targetSpeed: number,
  dt: number,
): void {
  const t = apState.truth;

  // ── Lateral channel ──
  if (t.lateralActive === 'HDG_SEL' || t.lateralActive === 'LNAV') {
    let headingError = targetHeading - state.attitude.psi;
    // Normalize to [-π, π]
    while (headingError > Math.PI) headingError -= 2 * Math.PI;
    while (headingError < -Math.PI) headingError += 2 * Math.PI;
    inputs.aileron = pidUpdate(rollPid, headingError, ROLL_KP, ROLL_KI, ROLL_KD, dt);
    // Clamp
    inputs.aileron = Math.max(-1, Math.min(1, inputs.aileron));
  }

  // ── Vertical channel ──
  if (t.verticalActive === 'ALT_HOLD') {
    const altError = targetAlt - state.position.alt;
    inputs.elevator = pidUpdate(pitchPid, altError, PITCH_KP, PITCH_KI, PITCH_KD, dt);
    inputs.elevator = Math.max(-1, Math.min(1, inputs.elevator));
  } else if (t.verticalActive === 'VS') {
    const vsError = 0; // TODO: target VS from autopilot state
    inputs.elevator = pidUpdate(pitchPid, vsError, PITCH_KP, PITCH_KI, PITCH_KD, dt);
    inputs.elevator = Math.max(-1, Math.min(1, inputs.elevator));
  }

  // ── Thrust channel ──
  if (t.thrustActive === 'SPEED') {
    const tas = Math.sqrt(state.velocity.u ** 2 + state.velocity.v ** 2 + state.velocity.w ** 2) * 1.944;
    const speedError = targetSpeed - tas;
    const throttle = pidUpdate(thrustPid, speedError, THRUST_KP, THRUST_KI, THRUST_KD, dt);
    const clamped = Math.max(0, Math.min(1, throttle));
    inputs.throttle1 = clamped;
    inputs.throttle2 = clamped;
  }
}
```

**Step 3: Commit**

```bash
git add src/sim/systems/autopilot.ts src/sim/systems/__tests__/
git commit -m "feat: add autopilot PID controllers bridging RFMS to RFS physics"
```

---

### Task 6: LNAV — Route Following

**Objective:** Compute cross-track error and desired track from the active flight plan waypoint. Feed target heading into autopilot PID.

**Files:**
- Create: `src/sim/systems/navigation.ts`
- Create: `src/sim/systems/__tests__/navigation.test.ts`

**Step 1: Implementation**

`src/sim/systems/navigation.ts`:
```typescript
import type { AircraftState } from '../types';
import type { FlightPlan } from '@shared/types/fmc';
import { geodeticToEcef, ecefToEnu } from '../physics/geodesy';

export interface NavOutput {
  crossTrackError: number; // meters, positive = right of course
  alongTrackDist: number;  // meters to active waypoint
  desiredTrack: number;    // radians true
  activeWaypointIndex: number;
  waypointReached: boolean;
}

/**
 * Compute LNAV guidance from current position and flight plan.
 * Uses simple great-circle cross-track for Phase 2.
 */
export function computeLNAV(
  state: AircraftState,
  flightPlan: FlightPlan | null,
  activeWptIndex: number,
): NavOutput {
  const def: NavOutput = {
    crossTrackError: 0, alongTrackDist: 0, desiredTrack: state.attitude.psi,
    activeWaypointIndex: 0, waypointReached: false,
  };

  if (!flightPlan || flightPlan.waypoints.length === 0) return def;

  const wpts = flightPlan.waypoints.filter(w => !w.discontinuity);
  if (wpts.length === 0) return def;

  // Clamp index
  const idx = Math.min(activeWptIndex, wpts.length - 1);
  const wpt = wpts[idx];

  if (wpt.lat === undefined || wpt.lon === undefined) return def;

  // Compute desired track from current position to waypoint
  const dLat = (wpt.lat - state.position.lat) * (Math.PI / 180);
  const dLon = (wpt.lon - state.position.lon) * (Math.PI / 180);
  const latR = state.position.lat * (Math.PI / 180);

  const x = dLon * Math.cos(latR);
  const y = dLat;
  const desiredTrack = Math.atan2(x, y); // radians true
  const dist = Math.sqrt(x * x + y * y) * 6371000; // meters (spherical Earth approx)

  // Cross-track error: simplified as zero when heading directly to waypoint
  // For proper XTE, need previous→current waypoint leg geometry
  // Phase 2: use direct-to waypoint (XTE = 0 by definition)
  const crossTrackError = 0; // Simplified for Phase 2

  // Waypoint reached when within 0.1 NM (~185m)
  const waypointReached = dist < 185;

  return {
    crossTrackError,
    alongTrackDist: dist,
    desiredTrack,
    activeWaypointIndex: idx,
    waypointReached,
  };
}
```

**Step 2: Commit**

```bash
git add src/sim/systems/navigation.ts src/sim/systems/__tests__/
git commit -m "feat: add LNAV route following (direct-to waypoint)"
```

---

### Task 7: VNAV — Vertical Path

**Objective:** Compute required vertical speed to meet altitude constraints at waypoints.

**Files:**
- Create: `src/sim/systems/vnav.ts`
- Create: `src/sim/systems/__tests__/vnav.test.ts`

**Implementation:**

```typescript
import type { AircraftState } from '../types';
import type { FlightPlan } from '@shared/types/fmc';
import { NavOutput } from './navigation';

export interface VnavOutput {
  targetAlt: number;       // feet
  targetVs: number;        // ft/min, positive = climb
  altitudeConstraint: boolean;
}

export function computeVNAV(
  state: AircraftState,
  flightPlan: FlightPlan | null,
  nav: NavOutput,
): VnavOutput {
  const def: VnavOutput = { targetAlt: state.position.alt, targetVs: 0, altitudeConstraint: false };

  if (!flightPlan) return def;
  const wpts = flightPlan.waypoints.filter(w => !w.discontinuity);
  if (wpts.length === 0) return def;

  const idx = Math.min(nav.activeWaypointIndex, wpts.length - 1);
  const wpt = wpts[idx];

  const constraint = wpt.altitudeConstraint;
  if (!constraint) return def;

  // Distance to waypoint in NM
  const distNm = nav.alongTrackDist / 1852;
  const altDelta = constraint.altitude - state.position.alt; // feet

  // Required VS to meet constraint
  const tas = Math.sqrt(state.velocity.u ** 2 + state.velocity.v ** 2 + state.velocity.w ** 2) * 1.944; // kts
  const timeToWpt = tas > 50 ? (distNm / tas) * 3600 : 999; // seconds

  const requiredVs = timeToWpt > 0 ? (altDelta / timeToWpt) * 60 : 0; // ft/min

  return {
    targetAlt: constraint.altitude,
    targetVs: requiredVs,
    altitudeConstraint: true,
  };
}
```

---

### Task 8: glTF 737 Model Loader

**Objective:** Replace the box proxy with a proper 3D model loaded from a glTF file.

**Files:**
- Create: `public/models/` directory (model goes here)
- Modify: `src/viewport/ThreeLayer.tsx` — replace box geometry with GLTFLoader

**Step 1: Download a free 737-800 model**

Options:
- A: Download from sketchfab (needs attribution, ~2MB glTF)
- B: Generate a procedural model (no external deps)
- C: Use a simple placeholder OBJ

For Phase 2, use option B — a procedurally generated fuselage + wings from Three.js primitives (cylinder + box + cone). This avoids external dependencies and attribution issues.

**Step 2: Create `src/viewport/AircraftModel.ts`**

```typescript
import * as THREE from 'three';

export function createBoeing737Model(): THREE.Group {
  const group = new THREE.Group();

  // Fuselage (cylinder)
  const fuseGeo = new THREE.CylinderGeometry(4, 4, 40, 16);
  const fuseMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.4 });
  const fuse = new THREE.Mesh(fuseGeo, fuseMat);
  fuse.rotation.x = Math.PI / 2;
  group.add(fuse);

  // Nose cone
  const noseGeo = new THREE.ConeGeometry(4, 8, 16);
  const nose = new THREE.Mesh(noseGeo, fuseMat);
  nose.rotation.x = -Math.PI / 2;
  nose.position.set(0, 0, 24);
  group.add(nose);

  // Wings
  const wingGeo = new THREE.BoxGeometry(36, 0.5, 6);
  const wingMat = new THREE.MeshStandardMaterial({ color: 0xcccccc });
  const wing = new THREE.Mesh(wingGeo, wingMat);
  wing.position.set(0, -2, 0);
  group.add(wing);

  // Vertical stabilizer
  const vstabGeo = new THREE.BoxGeometry(14, 0.5, 2);
  const vstab = new THREE.Mesh(vstabGeo, fuseMat);
  vstab.position.set(0, 4, -18);
  group.add(vstab);

  // Horizontal stabilizer
  const hstabGeo = new THREE.BoxGeometry(16, 0.3, 4);
  const hstab = new THREE.Mesh(hstabGeo, fuseMat);
  hstab.position.set(0, 0, -18);
  group.add(hstab);

  // Engines (two cylinders under wings)
  const engGeo = new THREE.CylinderGeometry(2, 2.2, 8, 16);
  const engMat = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.3 });
  [-6, 6].forEach(x => {
    const eng = new THREE.Mesh(engGeo, engMat);
    eng.rotation.x = Math.PI / 2;
    eng.position.set(x, -3, -2);
    group.add(eng);
  });

  return group;
}
```

**Step 3: Wire into ThreeLayer** — replace the box construction with `createBoeing737Model()`

**Step 4: Commit**

```bash
git add src/viewport/AircraftModel.ts src/viewport/ThreeLayer.tsx
git commit -m "feat: replace box proxy with procedural 737 model"
```

---

### Task 9: Control Surface Animations

**Objective:** Animate ailerons, elevator, rudder, flaps, and gear based on sim state + control inputs.

**Files:**
- Modify: `src/viewport/AircraftModel.ts` — add named sub-meshes
- Modify: `src/viewport/ThreeLayer.tsx` — update animations each frame

**Implementation:** In `createBoeing737Model()`, store references to moving parts:
```typescript
export interface AircraftParts {
  group: THREE.Group;
  leftAileron: THREE.Mesh;
  rightAileron: THREE.Mesh;
  elevator: THREE.Mesh;
  rudder: THREE.Mesh;
  leftFlap: THREE.Mesh;
  rightFlap: THREE.Mesh;
  leftGear: THREE.Group;
  rightGear: THREE.Group;
  noseGear: THREE.Group;
  fanLeft: THREE.Mesh;
  fanRight: THREE.Mesh;
}
```

In `ThreeLayer.tsx`, update each frame:
```typescript
// Ailerons: ±20° from input
parts.leftAileron.rotation.x = inputs.aileron * 0.35;
parts.rightAileron.rotation.x = -inputs.aileron * 0.35;
// Elevator: ±20°
parts.elevator.rotation.x = -inputs.elevator * 0.35;
// Rudder: ±25°
parts.rudder.rotation.y = -inputs.rudder * 0.44;
// Flaps: drop based on detent
const flapAngle = (state.config.flapSetting / 40) * 0.7;
parts.leftFlap.rotation.x = flapAngle;
// Gear: retract up
parts.leftGear.visible = state.config.gearDown;
// Fan spin: N1 driven
parts.fanLeft.rotation.z += state.engines[0].n1 * 0.1 * dt;
```

---

### Task 10: METAR Weather Fetcher

**Objective:** Fetch real METAR for the nearest airport and apply wind/temperature/visibility to the simulation.

**Files:**
- Create: `src/sim/weather.ts`
- Create: `src/sim/__tests__/weather.test.ts`

**Step 1: Implementation**

```typescript
export interface MetarData {
  windDir: number;    // degrees true, 0 = no wind
  windSpeed: number;  // knots
  temperature: number; // °C
  visibility: number;  // meters
  clouds: { cover: string; base: number }[]; // base in feet
  qnh: number;         // hPa
}

export async function fetchMetar(icao: string): Promise<MetarData | null> {
  try {
    const resp = await fetch(`https://aviationweather.gov/api/data/metar?ids=${icao}&format=json`);
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!data.length) return null;
    const m = data[0];

    return {
      windDir: m.wdir ?? 0,
      windSpeed: m.wspd ?? 0,
      temperature: m.tmp ?? 15,
      visibility: m.visib ? parseInt(m.visib) : 9999,
      clouds: (m.clouds ?? []).map((c: any) => ({ cover: c.cover, base: c.base * 100 })),
      qnh: m.altim ?? 1013.25,
    };
  } catch {
    return null; // offline → no weather
  }
}
```

**Step 2: Apply to physics** — Create `src/sim/systems/environment.ts` that applies wind to the velocity vector (body-frame wind components from wind direction/speed).

**Step 3: Commit**

---

### Task 11: Audio Engine Foundation

**Objective:** Set up Web Audio context, master gain, and bus architecture. Keep it simple.

**Files:**
- Create: `src/audio/AudioEngine.ts`

**Implementation:**

```typescript
export class AudioEngine {
  ctx: AudioContext;
  master: GainNode;
  engineBus: GainNode;
  cockpitBus: GainNode;

  constructor() {
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);

    this.engineBus = this.ctx.createGain();
    this.engineBus.connect(this.master);

    this.cockpitBus = this.ctx.createGain();
    this.cockpitBus.connect(this.master);
  }

  resume() {
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMasterVolume(v: number) {
    this.master.gain.value = Math.max(0, Math.min(1, v));
  }
}
```

Singleton:
```typescript
let instance: AudioEngine | null = null;
export function getAudioEngine(): AudioEngine {
  if (!instance) instance = new AudioEngine();
  return instance;
}
```

---

### Task 12: Engine Sounds

**Objective:** Generate engine hum using oscillator + noise filtered to N1 frequency. Two independent engine channels with slight detune.

**Files:**
- Create: `src/audio/EngineSound.ts`
- Modify: `src/App.tsx` — init audio on user interaction

**Implementation:**

```typescript
import { getAudioEngine } from './AudioEngine';

export class EngineSound {
  private osc: OscillatorNode;
  private gain: GainNode;
  private noiseSource: AudioBufferSourceNode | null = null;

  constructor(bus: AudioNode) {
    const ctx = getAudioEngine().ctx;
    this.osc = ctx.createOscillator();
    this.osc.type = 'sawtooth';
    this.osc.frequency.value = 80;

    this.gain = ctx.createGain();
    this.gain.gain.value = 0;

    this.osc.connect(this.gain);
    this.gain.connect(bus);
    this.osc.start();
  }

  update(n1: number) {
    // N1 0-100 → frequency 40-200 Hz, gain 0-0.3
    this.osc.frequency.value = 40 + n1 * 1.6;
    this.gain.gain.value = (n1 / 100) * 0.15;
  }

  dispose() {
    this.osc.stop();
    this.gain.disconnect();
  }
}
```

Wire into `useSimLoop` or a new `useAudioLoop` hook that reads N1 from the store and updates engine sounds.

---

### Task 13: Integration — Wire Everything Together

**Objective:** Modify `integrate.ts` to call all systems in order. Wire autopilot + LNAV/VNAV into the sim loop. Wire audio into App.

**Files:**
- Modify: `src/sim/physics/integrate.ts` — system call order
- Modify: `src/store/simStore.ts` — add autopilot state + flight plan to store
- Modify: `src/App.tsx` — init audio on first click

**System call order in integrate.ts:**
```
1. updateEngines(state, inputs, spec, dt)
2. updateFuel(state, spec, dt)
3. updateElectrical(state, dt)
4. updateHydraulic(state, dt)
5. updateEnvironment(state, metar)    // applies wind
6. computeAero(state, inputs, spec)   // aero forces
7. [integrate position/velocity/attitude]
8. updateAutopilot(state, inputs, apState, ...)  // overwrites inputs for next tick
```

---

### Task 14: Final Verification

**Objective:** Full suite, build, visual check.

```bash
npx vitest run && npx tsc --noEmit && npx vite build
```

Visual checklist:
- [ ] Engine sounds audible on TAKEOFF
- [ ] 737 model visible with moving control surfaces
- [ ] METAR weather affects wind/visibility
- [ ] Autopilot maintains heading/altitude when engaged
- [ ] Fuel tanks deplete in correct order (center first)
- [ ] Hydraulic/electrical state reflects engine status

---

## Phase 2 Complete — What You Get

| System | What It Does |
|--------|-------------|
| Engine | Twin-spool N1/N2, EGT, fuel flow, SFC model |
| Fuel | 3-tank balancing, center-first burn, CG shift |
| Electrical | Generator N2-driven, battery drain, bus power |
| Hydraulic | System A/B pressure from engine pumps |
| Autopilot | PID controllers bridging RFMS modes → physics |
| LNAV | Direct-to waypoint guidance from flight plan |
| VNAV | Altitude constraint vertical speed computation |
| 3D Model | Procedural 737 with animated control surfaces |
| Weather | Real METAR fetching + wind application |
| Audio | Web Audio engine hum driven by N1 |
