# Phase 1: Flight Dynamics Core — Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

> **Status note (2026-05-25):** Historical implementation plan. Use `../architecture.md` for the current implementation, `../physics-invariants.md` for active flight-model contracts, and `../roadmap.md` for prioritized next work. Do not assume older React version, worker, wind, or phase-status wording below reflects the current app.


**Goal:** Add a 6-DOF rigid-body flight model, aircraft systems (engine, fuel), Zustand simulation store, and a telemetry HUD. Sim runs on the main thread via requestAnimationFrame at 60Hz. Phase 1.5 will move physics to a Web Worker.

**Architecture:** Physics modules are pure functions in `src/sim/physics/`. Systems are pure transforms in `src/sim/systems/`. Zustand `useSimStore` holds `AircraftState` and `ControlInputs`. A `useSimLoop` hook drives `integrate()` on each RAF tick. A `Telemetry` HUD overlays live state. RFMS `@shared` types are used for `AutopilotState` and `FlightPlan` — these are read by the autopilot system in Phase 2.

**Tech Stack:** Same as Phase 0 — React 18, TypeScript strict, Vite, Zustand, Vitest.

---

### Task 1: Aircraft State Types

**Objective:** Define the 6-DOF state vector, control inputs, and Boeing 737-800 specification constants.

**Files:**
- Create: `src/sim/types.ts`
- Create: `src/sim/types.test.ts`

**Step 1: Write failing test**

`src/sim/types.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { createInitialState, B737_800_SPEC } from './types';

describe('createInitialState', () => {
  it('returns parked at KSEA with full fuel', () => {
    const s = createInitialState(B737_800_SPEC);
    expect(s.position.lat).toBeCloseTo(47.45);
    expect(s.position.lon).toBeCloseTo(-122.31);
    expect(s.flightPhase).toBe('PARKED');
    expect(s.fuel.totalFuel).toBe(B737_800_SPEC.maxFuel);
    expect(s.engines[0].running).toBe(false);
  });

  it('body velocity starts at zero', () => {
    const s = createInitialState(B737_800_SPEC);
    expect(s.velocity.u).toBe(0);
    expect(s.velocity.v).toBe(0);
    expect(s.velocity.w).toBe(0);
  });

  it('angular velocity starts at zero', () => {
    const s = createInitialState(B737_800_SPEC);
    expect(s.angularVel.p).toBe(0);
    expect(s.angularVel.q).toBe(0);
    expect(s.angularVel.r).toBe(0);
  });
});
```

Run: `npx vitest run src/sim/types.test.ts` → FAIL (module not found).

**Step 2: Write types**

`src/sim/types.ts`:
```typescript
// ── 6-DOF State Vector ──

export interface GeoPosition {
  lat: number; // decimal degrees
  lon: number;
  alt: number; // feet MSL
}

export interface BodyVelocity {
  u: number; // m/s, forward (body x-axis)
  v: number; // m/s, lateral (body y-axis)
  w: number; // m/s, vertical (body z-axis, positive down)
}

export interface Attitude {
  phi: number;   // roll angle, radians (+ right wing down)
  theta: number; // pitch angle, radians (+ nose up)
  psi: number;   // yaw/heading angle, radians (0 = north)
}

export interface AngularVelocity {
  p: number; // roll rate, rad/s
  q: number; // pitch rate, rad/s
  r: number; // yaw rate, rad/s
}

// ── Derived (computed from state) ──

export interface DerivedState {
  ias: number;     // indicated airspeed, knots
  tas: number;     // true airspeed, knots
  gs: number;      // ground speed, knots
  mach: number;
  vs: number;      // vertical speed, ft/min
  aoa: number;     // angle of attack, radians
  beta: number;    // sideslip angle, radians
}

// ── Control Inputs ──

export interface ControlInputs {
  elevator: number;   // -1 (full nose-up) to +1 (full nose-down)
  aileron: number;    // -1 (full left roll) to +1 (full right roll)
  rudder: number;     // -1 (full left) to +1 (full right)
  throttle1: number;  // 0 (idle) to 1 (TOGA)
  throttle2: number;
  flapLever: number;  // detent: 0, 1, 2, 5, 10, 15, 25, 30, 40
  gearLever: 'UP' | 'DOWN';
  spoilers: number;   // 0 to 1
  brake: number;      // 0 to 1
}

// ── Engine State ──

export interface EngineState {
  n1: number;        // % (0-110)
  n2: number;        // % (0-110)
  egt: number;       // °C
  fuelFlow: number;  // kg/hr per engine
  thrust: number;    // lbf
  running: boolean;
}

// ── Fuel System ──

export interface FuelState {
  totalFuel: number;
  fuelFlowTotal: number;
  centerTank: number;
  leftTank: number;
  rightTank: number;
}

// ── Aircraft Config ──

export interface AircraftConfig {
  flapSetting: number;
  gearDown: boolean;
  spoilersArmed: boolean;
  spoilersDeployed: boolean;
  speedBrake: number; // 0-1
}

// ── Full Aircraft State ──

export type FlightPhase = 'PARKED' | 'TAXI' | 'TAKEOFF' | 'CLIMB' | 'CRUISE' | 'DESCENT' | 'APPROACH' | 'LANDED';

export interface AircraftState {
  position: GeoPosition;
  velocity: BodyVelocity;
  attitude: Attitude;
  angularVel: AngularVelocity;
  config: AircraftConfig;
  engines: [EngineState, EngineState];
  fuel: FuelState;
  grossWeight: number;
  cg: number; // % MAC
  simTime: number; // ms
  flightPhase: FlightPhase;
}

// ── Aircraft Spec (737-800 approx) ──

export interface AircraftSpec {
  emptyWeight: number;
  maxFuel: number;
  maxTakeoffWeight: number;
  wingArea: number;       // m²
  wingSpan: number;        // m
  meanChord: number;       // m
  maxThrust: number;       // lbf per engine, sea level static
  engineCount: number;
  vStall: number;          // knots, clean
  maxFlaps: number;
  cgLimits: [number, number]; // % MAC
  fuelCapacity: { center: number; left: number; right: number; }; // kg
  // Moments of inertia (kg·m²) — approximate for 737-800
  ixx: number;
  iyy: number;
  izz: number;
  ixz: number;
}

export const B737_800_SPEC: AircraftSpec = {
  emptyWeight: 41413,
  maxFuel: 20894,
  maxTakeoffWeight: 79015,
  wingArea: 124.6,
  wingSpan: 35.8,
  meanChord: 3.96,
  maxThrust: 27300,
  engineCount: 2,
  vStall: 120,
  maxFlaps: 40,
  cgLimits: [7, 30],
  fuelCapacity: { center: 13066, left: 3914, right: 3914 },
  ixx: 1340000,
  iyy: 3450000,
  izz: 4610000,
  ixz: 40000,
};

export function createInitialState(spec: AircraftSpec): AircraftState {
  return {
    position: { lat: 47.45, lon: -122.31, alt: 432 },
    velocity: { u: 0, v: 0, w: 0 },
    attitude: { phi: 0, theta: 0, psi: Math.PI }, // facing south (180°)
    angularVel: { p: 0, q: 0, r: 0 },
    config: { flapSetting: 0, gearDown: true, spoilersArmed: false, spoilersDeployed: false, speedBrake: 0 },
    engines: [
      { n1: 0, n2: 0, egt: 20, fuelFlow: 0, thrust: 0, running: false },
      { n1: 0, n2: 0, egt: 20, fuelFlow: 0, thrust: 0, running: false },
    ],
    fuel: { totalFuel: spec.maxFuel, fuelFlowTotal: 0, centerTank: spec.fuelCapacity.center, leftTank: spec.fuelCapacity.left, rightTank: spec.fuelCapacity.right },
    grossWeight: spec.emptyWeight + spec.maxFuel,
    cg: 25,
    simTime: 0,
    flightPhase: 'PARKED',
  };
}
```

Run: `npx vitest run src/sim/types.test.ts` → 3 passed.

**Step 3: Commit**

```bash
git add src/sim/ && git commit -m "feat: add 6-DOF aircraft state types and 737-800 spec"
```

---

### Task 2: Unit Conversions

**Objective:** Conversion constants and helpers used throughout the physics engine.

**Files:**
- Create: `src/sim/physics/units.ts`
- Create: `src/sim/physics/units.test.ts`

**Step 1: Write failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { ktToMs, msToKt, ftToM, mToFt, fpmToMs, msToFpm, lbfToN, degToRad, radToDeg } from './units';

describe('units', () => {
  it('ktToMs', () => expect(ktToMs(100)).toBeCloseTo(51.4444, 1));
  it('msToKt', () => expect(msToKt(51.4444)).toBeCloseTo(100, 0));
  it('ftToM', () => expect(ftToM(1000)).toBeCloseTo(304.8, 1));
  it('mToFt', () => expect(mToFt(304.8)).toBeCloseTo(1000, 0));
  it('fpmToMs', () => expect(fpmToMs(1000)).toBeCloseTo(5.08, 1));
  it('lbfToN', () => expect(lbfToN(1000)).toBeCloseTo(4448.22, 0));
  it('degToRad', () => expect(degToRad(180)).toBeCloseTo(Math.PI));
  it('radToDeg', () => expect(radToDeg(Math.PI)).toBeCloseTo(180));
});
```

**Step 2: Write implementation** — `src/sim/physics/units.ts`

```typescript
export const FT_TO_M = 0.3048;
export const M_TO_FT = 1 / FT_TO_M;
export const KT_TO_MS = 0.514444;
export const MS_TO_KT = 1 / KT_TO_MS;
export const LBF_TO_N = 4.44822;
export const KG_TO_LB = 2.20462;
export const DEG_TO_RAD = Math.PI / 180;
export const RAD_TO_DEG = 180 / Math.PI;
export const NM_TO_M = 1852;

export const ktToMs = (kt: number) => kt * KT_TO_MS;
export const msToKt = (ms: number) => ms * MS_TO_KT;
export const ftToM = (ft: number) => ft * FT_TO_M;
export const mToFt = (m: number) => m * M_TO_FT;
export const fpmToMs = (fpm: number) => (fpm * FT_TO_M) / 60;
export const msToFpm = (ms: number) => (ms * 60) * M_TO_FT;
export const lbfToN = (lbf: number) => lbf * LBF_TO_N;
export const degToRad = (d: number) => d * DEG_TO_RAD;
export const radToDeg = (r: number) => r * RAD_TO_DEG;
```

Run: `npx vitest run src/sim/physics/units.test.ts` → 8 passed.

**Step 3: Commit**

```bash
git add src/sim/physics/ && git commit -m "feat: add unit conversion helpers"
```

---

### Task 3: WGS84 Geodesy

**Objective:** Convert between geodetic (lat/lon/alt), ECEF, and local ENU coordinates.

**Files:**
- Create: `src/sim/physics/geodesy.ts`
- Create: `src/sim/physics/geodesy.test.ts`

**Step 1: Write failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { geodeticToEcef, ecefToGeodetic, ecefToEnu, enuToEcef } from './geodesy';

const KSEA = { lat: 47.45, lon: -122.31, alt: 132 }; // m MSL

describe('geodesy round-trip', () => {
  it('geodetic → ECEF → geodetic', () => {
    const ecef = geodeticToEcef(KSEA.lat, KSEA.lon, KSEA.alt);
    const geo = ecefToGeodetic(ecef.x, ecef.y, ecef.z);
    expect(geo.lat).toBeCloseTo(KSEA.lat, 6);
    expect(geo.lon).toBeCloseTo(KSEA.lon, 6);
    expect(geo.alt).toBeCloseTo(KSEA.alt, 2);
  });

  it('ENU → ECEF → ENU is identity', () => {
    const ref = geodeticToEcef(KSEA.lat, KSEA.lon, 0);
    const enuIn = { e: 1000, n: 2000, u: 500 };
    const ecef = enuToEcef(enuIn, ref, KSEA.lat, KSEA.lon);
    const enuOut = ecefToEnu({ x: ecef.x, y: ecef.y, z: ecef.z }, ref, KSEA.lat, KSEA.lon);
    expect(enuOut.e).toBeCloseTo(enuIn.e, 1);
    expect(enuOut.n).toBeCloseTo(enuIn.n, 1);
    expect(enuOut.u).toBeCloseTo(enuIn.u, 1);
  });
});
```

**Step 2: Write implementation** — `src/sim/physics/geodesy.ts`

```typescript
// WGS84 constants
const A = 6378137.0; // semi-major axis (m)
const F = 1 / 298.257223563; // flattening
const E2 = F * (2 - F); // first eccentricity squared

export interface Ecef { x: number; y: number; z: number; }
export interface Enu { e: number; n: number; u: number; }
export interface Geodetic { lat: number; lon: number; alt: number; }

function deg2rad(d: number) { return d * Math.PI / 180; }
function rad2deg(r: number) { return r * 180 / Math.PI; }

export function geodeticToEcef(lat: number, lon: number, alt: number): Ecef {
  const latR = deg2rad(lat);
  const lonR = deg2rad(lon);
  const sinLat = Math.sin(latR);
  const cosLat = Math.cos(latR);
  const N = A / Math.sqrt(1 - E2 * sinLat * sinLat);
  const x = (N + alt) * cosLat * Math.cos(lonR);
  const y = (N + alt) * cosLat * Math.sin(lonR);
  const z = (N * (1 - E2) + alt) * sinLat;
  return { x, y, z };
}

export function ecefToGeodetic(x: number, y: number, z: number): Geodetic {
  const p = Math.sqrt(x * x + y * y);
  const lon = Math.atan2(y, x);
  let lat = Math.atan2(z, p * (1 - E2));
  // Iterate for altitude (3 iterations is enough for cm accuracy)
  for (let i = 0; i < 3; i++) {
    const sinLat = Math.sin(lat);
    const N = A / Math.sqrt(1 - E2 * sinLat * sinLat);
    const alt = p / Math.cos(lat) - N;
    lat = Math.atan2(z, p * (1 - E2 * N / (N + alt)));
  }
  const sinLat = Math.sin(lat);
  const N = A / Math.sqrt(1 - E2 * sinLat * sinLat);
  const alt = p / Math.cos(lat) - N;
  return { lat: rad2deg(lat), lon: rad2deg(lon), alt };
}

export function ecefToEnu(pos: Ecef, ref: Ecef, refLat: number, refLon: number): Enu {
  const latR = deg2rad(refLat);
  const lonR = deg2rad(refLon);
  const dx = pos.x - ref.x;
  const dy = pos.y - ref.y;
  const dz = pos.z - ref.z;
  const sinLat = Math.sin(latR), cosLat = Math.cos(latR);
  const sinLon = Math.sin(lonR), cosLon = Math.cos(lonR);
  return {
    e: -sinLon * dx + cosLon * dy,
    n: -sinLat * cosLon * dx - sinLat * sinLon * dy + cosLat * dz,
    u: cosLat * cosLon * dx + cosLat * sinLon * dy + sinLat * dz,
  };
}

export function enuToEcef(enu: Enu, ref: Ecef, refLat: number, refLon: number): Ecef {
  const latR = deg2rad(refLat);
  const lonR = deg2rad(refLon);
  const sinLat = Math.sin(latR), cosLat = Math.cos(latR);
  const sinLon = Math.sin(lonR), cosLon = Math.cos(lonR);
  return {
    x: ref.x - sinLon * enu.e - sinLat * cosLon * enu.n + cosLat * cosLon * enu.u,
    y: ref.y + cosLon * enu.e - sinLat * sinLon * enu.n + cosLat * sinLon * enu.u,
    z: ref.z + cosLat * enu.n + sinLat * enu.u,
  };
}
```

Run: `npx vitest run src/sim/physics/geodesy.test.ts` → 2 passed.

**Step 3: Commit**

```bash
git add src/sim/physics/geodesy.ts src/sim/physics/geodesy.test.ts
git commit -m "feat: add WGS84 geodesy conversions"
```

---

### Task 4: ISA Atmosphere Model

**Objective:** Full ISA 1976 atmosphere: temperature, pressure, density, speed of sound at any altitude.

**Files:**
- Create: `src/sim/physics/atmosphere.ts`
- Create: `src/sim/physics/atmosphere.test.ts`

**Step 1: Write failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { isaAtAltitude } from './atmosphere';

describe('ISA atmosphere', () => {
  it('sea level', () => {
    const a = isaAtAltitude(0);
    expect(a.tempC).toBeCloseTo(15, 0);
    expect(a.pressureHpa).toBeCloseTo(1013.25, -1);
    expect(a.density).toBeCloseTo(1.225, 1);
    expect(a.speedOfSound).toBeCloseTo(340.3, 0);
  });
  it('troposphere 10000ft', () => {
    const a = isaAtAltitude(10000);
    expect(a.tempC).toBeCloseTo(-4.8, 0);
    expect(a.pressureHpa).toBeLessThan(750);
  });
  it('tropopause 36000ft', () => {
    const a = isaAtAltitude(36000);
    expect(a.tempC).toBeCloseTo(-56.5, 0);
    expect(a.pressureHpa).toBeLessThan(250);
  });
  it('stratosphere 45000ft', () => {
    const a = isaAtAltitude(45000);
    expect(a.tempC).toBeCloseTo(-56.5, 0); // isothermal
  });
});
```

**Step 2: Write implementation** — `src/sim/physics/atmosphere.ts`

```typescript
const T0 = 288.15; // K at MSL
const P0 = 101325; // Pa
const LAPSE = -0.0065; // K/m troposphere
const G = 9.80665;
const R = 287.058;
const GAMMA = 1.4;
const TROPOPAUSE_M = 11000;
const TROPOPAUSE_K = 216.65;
const FT_TO_M = 0.3048;
const STRATOSPHERE_TOP_M = 20000;
const STRAT_LAPSE = 0.001; // K/m (slight warming)

export interface AtmoConditions {
  tempK: number;
  tempC: number;
  pressurePa: number;
  pressureHpa: number;
  density: number;
  speedOfSound: number;
  viscosity: number;
}

export function isaAtAltitude(altFt: number): AtmoConditions {
  const altM = altFt * FT_TO_M;
  let tempK: number;
  let pressPa: number;

  if (altM <= TROPOPAUSE_M) {
    tempK = T0 + LAPSE * altM;
    pressPa = P0 * Math.pow(tempK / T0, -G / (R * LAPSE));
  } else if (altM <= STRATOSPHERE_TOP_M) {
    tempK = TROPOPAUSE_K;
    const pTropo = P0 * Math.pow(TROPOPAUSE_K / T0, -G / (R * LAPSE));
    pressPa = pTropo * Math.exp(-G / (R * TROPOPAUSE_K) * (altM - TROPOPAUSE_M));
  } else {
    // Upper stratosphere (slight warming)
    const dAlt = altM - STRATOSPHERE_TOP_M;
    tempK = TROPOPAUSE_K + STRAT_LAPSE * dAlt;
    const pStratoTop = (() => {
      const pTropo = P0 * Math.pow(TROPOPAUSE_K / T0, -G / (R * LAPSE));
      return pTropo * Math.exp(-G / (R * TROPOPAUSE_K) * (STRATOSPHERE_TOP_M - TROPOPAUSE_M));
    })();
    pressPa = pStratoTop * Math.pow(tempK / TROPOPAUSE_K, -G / (R * STRAT_LAPSE));
  }

  const density = pressPa / (R * tempK);
  const speedOfSound = Math.sqrt(GAMMA * R * tempK);
  const viscosity = 1.458e-6 * Math.pow(tempK, 1.5) / (tempK + 110.4); // Sutherland

  return {
    tempK, tempC: tempK - 273.15,
    pressurePa: pressPa, pressureHpa: pressPa / 100,
    density, speedOfSound, viscosity,
  };
}
```

Run: `npx vitest run src/sim/physics/atmosphere.test.ts` → 4 passed.

**Step 3: Commit**

```bash
git add src/sim/physics/atmosphere.ts src/sim/physics/atmosphere.test.ts
git commit -m "feat: add ISA 1976 atmosphere model"
```

---

### Task 5: Derived State Computation

**Objective:** Compute TAS, IAS, Mach, AoA, sideslip from the 6-DOF state vector.

**Files:**
- Create: `src/sim/physics/derived.ts`
- Create: `src/sim/physics/derived.test.ts`

**Step 1: Write failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { computeDerived } from './derived';
import { createInitialState, B737_800_SPEC } from '../types';

describe('computeDerived', () => {
  it('at rest, all zero', () => {
    const s = createInitialState(B737_800_SPEC);
    const d = computeDerived(s);
    expect(d.tas).toBe(0);
    expect(d.ias).toBe(0);
    expect(d.mach).toBe(0);
  });

  it('forward flight at sea level', () => {
    const s = createInitialState(B737_800_SPEC);
    s.velocity.u = 128.6; // 250 kt in m/s
    const d = computeDerived(s);
    expect(d.tas).toBeCloseTo(250, -1);
    expect(d.ias).toBeCloseTo(250, -1);
    expect(d.aoa).toBeCloseTo(0);
  });
});
```

**Step 2: Write implementation** — `src/sim/physics/derived.ts`

```typescript
import type { AircraftState, DerivedState } from '../types';
import { isaAtAltitude } from './atmosphere';
import { msToKt } from './units';

export function computeDerived(state: AircraftState): DerivedState {
  const { u, v, w } = state.velocity;
  const tasMs = Math.sqrt(u * u + v * v + w * w);
  const atmo = isaAtAltitude(state.position.alt);
  const rhoRatio = atmo.density / 1.225;

  const tas = msToKt(tasMs);
  const ias = tas * Math.sqrt(Math.max(0.05, rhoRatio));
  const mach = tasMs / atmo.speedOfSound;

  // Ground speed (simplified — ignores wind for now)
  const gs = msToKt(Math.sqrt(u * u + v * v));

  // Vertical speed in ft/min
  const vs = w * 196.85; // m/s → ft/min (w positive down in body frame)
  // Actually: in NED body frame, w positive down. Vs positive climbing.
  // vs (climb rate) = -w converted to ft/min
  const vsFpm = -w * 196.85;

  // Angle of attack
  const aoa = u > 0.1 ? Math.atan2(w, u) : 0;

  // Sideslip
  const beta = tasMs > 0.1 ? Math.asin(Math.max(-1, Math.min(1, v / tasMs))) : 0;

  return { ias, tas, gs, mach, vs: vsFpm, aoa, beta };
}
```

Run: `npx vitest run src/sim/physics/derived.test.ts` → 2 passed.

**Step 3: Commit**

```bash
git add src/sim/physics/derived.ts src/sim/physics/derived.test.ts
git commit -m "feat: add derived state computation (IAS, TAS, Mach, AoA)"
```

---

### Task 6: Aerodynamic Forces & Moments

**Objective:** Compute body-frame forces (thrust, drag, lift, side, weight) and moments from current state + controls.

**Files:**
- Create: `src/sim/physics/aero.ts`
- Create: `src/sim/physics/aero.test.ts`

**Step 1: Write failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { computeAero } from './aero';
import { createInitialState, B737_800_SPEC, ControlInputs } from '../types';

const cruiseInputs: ControlInputs = {
  elevator: -0.1, aileron: 0, rudder: 0,
  throttle1: 0.8, throttle2: 0.8,
  flapLever: 0, gearLever: 'UP', spoilers: 0, brake: 0,
};

describe('computeAero', () => {
  it('at rest, thrust and lift are zero', () => {
    const s = createInitialState(B737_800_SPEC);
    const zero: ControlInputs = { ...cruiseInputs, throttle1: 0, throttle2: 0 };
    const a = computeAero(s, zero, B737_800_SPEC);
    expect(a.thrust).toBeLessThan(10); // negligible
    expect(a.lift).toBeLessThan(10);
  });

  it('at cruise speed, lift ≈ weight', () => {
    const s = createInitialState(B737_800_SPEC);
    s.velocity.u = 128.6; // ~250 kt
    s.position.alt = 35000;
    s.engines[0].n1 = 90; s.engines[1].n1 = 90;
    s.engines[0].running = s.engines[1].running = true;
    const a = computeAero(s, cruiseInputs, B737_800_SPEC);
    const weight = s.grossWeight * 9.80665;
    expect(a.lift).toBeGreaterThan(weight * 0.5);
    expect(a.lift).toBeLessThan(weight * 2);
    expect(a.drag).toBeGreaterThan(0);
    expect(a.thrust).toBeGreaterThan(10000);
  });
});
```

**Step 2: Write implementation** — `src/sim/physics/aero.ts`

```typescript
import type { AircraftState, AircraftSpec, ControlInputs } from '../types';
import { isaAtAltitude } from './atmosphere';
import { lbfToN } from './units';

const G = 9.80665;

export interface AeroResult {
  thrust: number;  // body x-force, N
  drag: number;    // body x-force, N
  lift: number;    // body z-force (negative = up in NED), N
  side: number;    // body y-force, N
  weight: number;  // N
  // Moments (N·m)
  rollMoment: number;
  pitchMoment: number;
  yawMoment: number;
}

export function computeAero(
  state: AircraftState,
  inputs: ControlInputs,
  spec: AircraftSpec,
): AeroResult {
  const { u, v, w } = state.velocity;
  const tasMs = Math.sqrt(u * u + v * v + w * w);
  const atmo = isaAtAltitude(state.position.alt);
  const rho = atmo.density;
  const q = 0.5 * rho * tasMs * tasMs; // dynamic pressure
  const S = spec.wingArea;
  const b = spec.wingSpan;
  const c = spec.meanChord;

  // AoA and sideslip
  const aoa = tasMs > 1 ? Math.atan2(w, Math.abs(u) + 0.01) : 0;
  const beta = tasMs > 1 ? Math.asin(Math.max(-1, Math.min(1, v / tasMs))) : 0;
  const mach = tasMs / atmo.speedOfSound;

  // ── Lift coefficient ──
  const cl0 = 0.25;
  const clAlpha = 5.73; // per radian (~0.1/deg)
  const clFlap = flapClIncrement(state.config.flapSetting);
  const clMach = mach > 0.6 ? 1 + 0.3 * (mach - 0.6) : 1;
  const cl = (cl0 + clAlpha * aoa + clFlap) * clMach;

  // ── Drag coefficient (parabolic polar) ──
  const cd0 = 0.018
    + (state.config.flapSetting > 0 ? 0.015 : 0)
    + (state.config.gearDown ? 0.025 : 0)
    + state.config.speedBrake * 0.04;
  const ar = b * b / S; // aspect ratio
  const e = 0.8; // Oswald efficiency
  const k = 1 / (Math.PI * ar * e);
  const cd = cd0 + k * cl * cl;

  // ── Side-force coefficient ──
  const cyBeta = -0.9; // per radian
  const cyRudder = 0.15;
  const cy = cyBeta * beta + cyRudder * inputs.rudder;

  // ── Forces ──
  const lift = q * S * cl;
  const drag = q * S * cd;
  const side = q * S * cy;
  const weight = state.grossWeight * G;

  // ── Thrust ──
  const n1Avg = (state.engines[0].n1 + state.engines[1].n1) / 2 / 100;
  const rhoRatio = atmo.density / 1.225;
  const staticThrust = spec.maxThrust * lbfToN(1) * Math.pow(rhoRatio, 0.7);
  const ramFactor = 1 + 0.15 * mach;
  const thrust = staticThrust * n1Avg * ramFactor * spec.engineCount;

  // ── Moments ──
  // Pitch moment (elevator + AoA stability + flap nose-down)
  const cm0 = -0.05;
  const cmAlpha = -0.8; // negative = stable
  const cmElevator = -1.2; // per radian
  const cmq = -12; // pitch damping
  const qHat = state.angularVel.q * c / (2 * Math.max(tasMs, 1));
  const cm = cm0 + cmAlpha * aoa + cmElevator * inputs.elevator * 0.3 + cmq * qHat
    - 0.02 * state.config.flapSetting; // flap nose-down moment

  // Roll moment (aileron + dihedral + roll damping)
  const clBeta = -0.08; // dihedral effect
  const clAileron = 0.06; // per radian deflection
  const clp = -0.4; // roll damping
  const pHat = state.angularVel.p * b / (2 * Math.max(tasMs, 1));
  const clMoment = clBeta * beta + clAileron * inputs.aileron + clp * pHat;

  // Yaw moment (rudder + weathervane + yaw damping)
  const cnBeta = 0.12; // weathervane stability
  const cnRudder = -0.07;
  const cnr = -0.15; // yaw damping
  const rHat = state.angularVel.r * b / (2 * Math.max(tasMs, 1));
  const cn = cnBeta * beta + cnRudder * inputs.rudder + cnr * rHat;

  const rollMoment = q * S * b * clMoment;
  const pitchMoment = q * S * c * cm;
  const yawMoment = q * S * b * cn;

  return { thrust, drag, lift, side, weight, rollMoment, pitchMoment, yawMoment };
}

function flapClIncrement(detent: number): number {
  if (detent <= 0) return 0;
  if (detent <= 5) return 0.4;
  if (detent <= 10) return 0.7;
  if (detent <= 15) return 1.0;
  if (detent <= 25) return 1.3;
  return 1.6;
}
```

Run: `npx vitest run src/sim/physics/aero.test.ts` → 2 passed.

**Step 3: Commit**

```bash
git add src/sim/physics/aero.ts src/sim/physics/aero.test.ts
git commit -m "feat: add aerodynamic force and moment model"
```

---

### Task 7: 6-DOF Euler Integrator

**Objective:** Advance the full 6-DOF state by one dt using semi-implicit Euler with quaternion attitude or Euler angle update.

**Files:**
- Create: `src/sim/physics/integrate.ts`
- Create: `src/sim/physics/integrate.test.ts`

**Step 1: Write failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { integrate } from './integrate';
import { createInitialState, B737_800_SPEC, ControlInputs } from '../types';

const idle: ControlInputs = { elevator: 0, aileron: 0, rudder: 0, throttle1: 0, throttle2: 0, flapLever: 0, gearLever: 'DOWN', spoilers: 0, brake: 0 };

describe('integrate', () => {
  it('does nothing at rest', () => {
    const s = createInitialState(B737_800_SPEC);
    const altBefore = s.position.alt;
    integrate(s, idle, B737_800_SPEC, 1/60);
    expect(s.position.alt).toBeCloseTo(altBefore);
  });

  it('accelerates forward with TOGA', () => {
    const s = createInitialState(B737_800_SPEC);
    s.velocity.u = 30; // already rolling
    const toga: ControlInputs = { ...idle, throttle1: 1, throttle2: 1, elevator: -0.3, gearLever: 'UP' };
    for (let i = 0; i < 60; i++) integrate(s, toga, B737_800_SPEC, 1/60);
    expect(s.velocity.u).toBeGreaterThan(30);
    expect(s.position.alt).toBeGreaterThan(500);
  });

  it('roll input produces roll rate', () => {
    const s = createInitialState(B737_800_SPEC);
    s.velocity.u = 128.6; // flying
    const rollInput: ControlInputs = { ...idle, throttle1: 0.6, throttle2: 0.6, aileron: -1 };
    for (let i = 0; i < 30; i++) integrate(s, rollInput, B737_800_SPEC, 1/60);
    expect(s.angularVel.p).toBeLessThan(0); // left roll
    expect(s.attitude.phi).toBeLessThan(0);
  });
});
```

**Step 2: Write implementation** — `src/sim/physics/integrate.ts`

```typescript
import type { AircraftState, AircraftSpec, ControlInputs } from '../types';
import { computeAero } from './aero';
import { geodeticToEcef, ecefToGeodetic, ecefToEnu, enuToEcef } from './geodesy';
import { isaAtAltitude } from './atmosphere';
import { ftToM, mToFt, ktToMs } from './units';

const G = 9.80665;

export function integrate(
  state: AircraftState,
  inputs: ControlInputs,
  spec: AircraftSpec,
  dt: number,
): void {
  const aero = computeAero(state, inputs, spec);
  const mass = state.grossWeight;
  const { phi, theta, psi } = state.attitude;
  const { p, q, r } = state.angularVel;
  const sinPhi = Math.sin(phi), cosPhi = Math.cos(phi);
  const sinTheta = Math.sin(theta), cosTheta = Math.cos(theta);

  // ── Update angular velocity (Euler's equations) ──
  const ixx = spec.ixx, iyy = spec.iyy, izz = spec.izz, ixz = spec.ixz;
  const pDot = (aero.rollMoment + (iyy - izz) * q * r + ixz * p * q) / ixx;
  const qDot = (aero.pitchMoment + (izz - ixx) * p * r + ixz * (r * r - p * p)) / iyy;
  const rDot = (aero.yawMoment + (ixx - iyy) * p * q - ixz * q * r) / izz;

  state.angularVel.p += pDot * dt;
  state.angularVel.q += qDot * dt;
  state.angularVel.r += rDot * dt;

  // ── Update Euler angles ──
  // φ̇ = p + q sinφ tanθ + r cosφ tanθ
  // θ̇ = q cosφ - r sinφ
  // ψ̇ = (q sinφ + r cosφ) / cosθ
  const phiDot = p + q * sinPhi * Math.tan(theta) + r * cosPhi * Math.tan(theta);
  const thetaDot = q * cosPhi - r * sinPhi;
  const psiDot = (q * sinPhi + r * cosPhi) / Math.max(0.001, cosTheta);

  state.attitude.phi += phiDot * dt;
  state.attitude.theta += thetaDot * dt;
  state.attitude.psi += psiDot * dt;

  // Normalize psi to [0, 2π)
  while (state.attitude.psi < 0) state.attitude.psi += 2 * Math.PI;
  while (state.attitude.psi >= 2 * Math.PI) state.attitude.psi -= 2 * Math.PI;

  // ── Update body velocity ──
  // Transform forces from body to NED using updated attitude
  const { phi: p2, theta: t2, psi: s2 } = state.attitude;
  const sphi = Math.sin(p2), cphi = Math.cos(p2);
  const stht = Math.sin(t2), ctht = Math.cos(t2);
  const spsi = Math.sin(s2), cpsi = Math.cos(s2);

  // Gravity in body frame: g * [sinθ; -cosθ sinφ; -cosθ cosφ]
  const gx = G * stht;
  const gy = -G * ctht * sphi;
  const gz = -G * ctht * cphi;

  const udot = aero.thrust / mass - aero.drag / mass + gx - q * state.velocity.w + r * state.velocity.v;
  const vdot = aero.side / mass + gy - r * state.velocity.u + p * state.velocity.w;
  const wdot = -aero.lift / mass + gz - p * state.velocity.v + q * state.velocity.u;

  state.velocity.u += udot * dt;
  state.velocity.v += vdot * dt;
  state.velocity.w += wdot * dt;

  // ── Update position (geodetic) ──
  // Convert body velocity to NED, then to ECEF displacement
  const vn = ctht * cpsi * state.velocity.u + (sphi * stht * cpsi - cphi * spsi) * state.velocity.v + (cphi * stht * cpsi + sphi * spsi) * state.velocity.w;
  const ve = ctht * spsi * state.velocity.u + (sphi * stht * spsi + cphi * cpsi) * state.velocity.v + (cphi * stht * spsi - sphi * cpsi) * state.velocity.w;
  const vd = -stht * state.velocity.u + sphi * ctht * state.velocity.v + cphi * ctht * state.velocity.w; // positive down

  const ref = geodeticToEcef(state.position.lat, state.position.lon, 0);
  const enuIn = ecefToEnu(
    { x: ref.x, y: ref.y, z: ref.z + state.position.alt * ftToM(1) },
    ref, state.position.lat, state.position.lon,
  );
  enuIn.e += ve * dt;
  enuIn.n += vn * dt;
  enuIn.u += -vd * dt;
  const newEcef = enuToEcef(enuIn, ref, state.position.lat, state.position.lon);
  const newGeo = ecefToGeodetic(newEcef.x, newEcef.y, newEcef.z);
  state.position.lat = newGeo.lat;
  state.position.lon = newGeo.lon;
  state.position.alt = newGeo.alt * mToFt(1);

  // ── Engine spool ──
  const n1Tc = 1.5;
  state.engines[0].n1 += (inputs.throttle1 * 100 - state.engines[0].n1) * (dt / n1Tc);
  state.engines[1].n1 += (inputs.throttle2 * 100 - state.engines[1].n1) * (dt / n1Tc);
  state.engines[0].running = state.engines[0].n1 > 0.5;
  state.engines[1].running = state.engines[1].n1 > 0.5;

  // ── Fuel burn ──
  const ff = (state.engines[0].n1 + state.engines[1].n1) * 0.15; // kg/hr rough
  const fuelUsed = (ff / 3600) * dt;
  state.fuel.totalFuel = Math.max(0, state.fuel.totalFuel - fuelUsed);
  state.grossWeight = spec.emptyWeight + state.fuel.totalFuel;

  // ── Config ──
  state.config.flapSetting = inputs.flapLever;
  state.config.gearDown = inputs.gearLever === 'DOWN';
  state.config.spoilersDeployed = inputs.spoilers > 0.5;
  state.config.speedBrake = inputs.spoilers;

  // ── Clock ──
  state.simTime += dt * 1000;
}
```

Run: `npx vitest run src/sim/physics/integrate.test.ts` → 3 passed.

**Step 3: Commit**

```bash
git add src/sim/physics/integrate.ts src/sim/physics/integrate.test.ts
git commit -m "feat: add 6-DOF Euler integrator"
```

---

### Task 8: Zustand SimStore

**Objective:** Create the Zustand store holding AircraftState, ControlInputs, and start/pause/reset actions with a tick method.

**Files:**
- Create: `src/store/simStore.ts`
- Create: `src/store/simStore.test.ts`

**Step 1: Write failing test**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { useSimStore } from './simStore';

describe('useSimStore', () => {
  beforeEach(() => useSimStore.getState().reset());

  it('starts stopped', () => {
    expect(useSimStore.getState().status).toBe('stopped');
  });
  it('start → running', () => {
    useSimStore.getState().start();
    expect(useSimStore.getState().status).toBe('running');
  });
  it('pause → paused', () => {
    useSimStore.getState().start();
    useSimStore.getState().pause();
    expect(useSimStore.getState().status).toBe('paused');
  });
  it('setInput partial update', () => {
    useSimStore.getState().setInput({ throttle1: 0.8 });
    expect(useSimStore.getState().inputs.throttle1).toBe(0.8);
    expect(useSimStore.getState().inputs.throttle2).toBe(0);
  });
  it('tick advances simTime', () => {
    useSimStore.getState().start();
    const before = useSimStore.getState().aircraft.simTime;
    useSimStore.getState().tick(performance.now());
    expect(useSimStore.getState().aircraft.simTime).toBeGreaterThanOrEqual(before);
  });
  it('reset returns to initial', () => {
    useSimStore.getState().setInput({ throttle1: 1 });
    useSimStore.getState().start();
    useSimStore.getState().tick(1000);
    useSimStore.getState().reset();
    expect(useSimStore.getState().status).toBe('stopped');
    expect(useSimStore.getState().inputs.throttle1).toBe(0);
  });
});
```

**Step 2: Write implementation** — `src/store/simStore.ts`

```typescript
import { create } from 'zustand';
import type { AircraftState, ControlInputs, AircraftSpec } from '../sim/types';
import { createInitialState, B737_800_SPEC } from '../sim/types';
import { integrate } from '../sim/physics/integrate';

export type SimStatus = 'stopped' | 'running' | 'paused';

export interface SimStore {
  aircraft: AircraftState;
  inputs: ControlInputs;
  spec: AircraftSpec;
  status: SimStatus;
  lastFrameTime: number;

  setInput: (partial: Partial<ControlInputs>) => void;
  tick: (timestamp: number) => void;
  start: () => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
}

const defaultInputs: ControlInputs = {
  elevator: 0, aileron: 0, rudder: 0,
  throttle1: 0, throttle2: 0,
  flapLever: 0, gearLever: 'DOWN',
  spoilers: 0, brake: 0,
};

export const useSimStore = create<SimStore>((set, get) => ({
  aircraft: createInitialState(B737_800_SPEC),
  inputs: { ...defaultInputs },
  spec: B737_800_SPEC,
  status: 'stopped',
  lastFrameTime: 0,

  setInput: (partial) => set((s) => ({ inputs: { ...s.inputs, ...partial } })),

  tick: (timestamp: number) => {
    const { status, lastFrameTime, aircraft, inputs, spec } = get();
    if (status !== 'running') return;
    const dt = lastFrameTime > 0
      ? Math.min((timestamp - lastFrameTime) / 1000, 0.05)
      : 1 / 60;
    const state = structuredClone(aircraft);
    integrate(state, inputs, spec, dt);
    set({ aircraft: state, lastFrameTime: timestamp });
  },

  start: () => set({ status: 'running', lastFrameTime: 0 }),
  pause: () => set({ status: 'paused' }),
  resume: () => set({ status: 'running', lastFrameTime: 0 }),
  reset: () => set({
    aircraft: createInitialState(B737_800_SPEC),
    inputs: { ...defaultInputs },
    status: 'stopped',
    lastFrameTime: 0,
  }),
}));
```

Run: `npx vitest run src/store/simStore.test.ts` → 6 passed.

**Step 3: Commit**

```bash
git add src/store/ && git commit -m "feat: add Zustand simStore with start/pause/reset/tick"
```

---

### Task 9: Telemetry HUD

**Objective:** Green-on-black telemetry overlay showing live aircraft state from the Zustand store.

**Files:**
- Create: `src/components/Telemetry.tsx`
- Create: `src/components/Telemetry.test.tsx`

**Step 1: Write failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Telemetry } from './Telemetry';
import { useSimStore } from '../store/simStore';

describe('Telemetry', () => {
  it('renders altitude and speed', () => {
    render(<Telemetry />);
    expect(screen.getByText(/ALT:/)).toBeTruthy();
    expect(screen.getByText(/TAS:/)).toBeTruthy();
    expect(screen.getByText(/HDG:/)).toBeTruthy();
  });
});
```

Run: `npx vitest run src/components/Telemetry.test.tsx` → FAIL (component not found).

**Step 2: Write component** — `src/components/Telemetry.tsx`

```tsx
import { useSimStore } from '../store/simStore';
import { computeDerived } from '../sim/physics/derived';

export function Telemetry() {
  const aircraft = useSimStore((s) => s.aircraft);
  const status = useSimStore((s) => s.status);
  const d = computeDerived(aircraft);
  const hdgDeg = (aircraft.attitude.psi * 180) / Math.PI;

  const row = (label: string, value: string) => (
    <div><span style={{ opacity: 0.5 }}>{label}</span> {value}</div>
  );

  return (
    <div style={{
      position: 'fixed', top: 10, left: 10, zIndex: 100,
      background: 'rgba(0,0,0,0.85)', color: '#0f0',
      fontFamily: 'monospace', fontSize: 12, padding: 10,
      borderRadius: 4, lineHeight: 1.7, minWidth: 260,
      pointerEvents: 'none',
    }}>
      <div style={{ fontWeight: 'bold', marginBottom: 4 }}>SIM: {status.toUpperCase()}</div>
      {row('ALT', `${aircraft.position.alt.toFixed(0)} ft`)}
      {row('IAS', `${d.ias.toFixed(0)} kt`)}
      {row('TAS', `${d.tas.toFixed(0)} kt`)}
      {row('GS', `${d.gs.toFixed(0)} kt`)}
      {row('VS', `${d.vs.toFixed(0)} fpm`)}
      {row('MACH', `M${d.mach.toFixed(3)}`)}
      {row('HDG', `${hdgDeg.toFixed(1)}°`)}
      {row('PTCH', `${(aircraft.attitude.theta * 180 / Math.PI).toFixed(1)}°`)}
      {row('ROLL', `${(aircraft.attitude.phi * 180 / Math.PI).toFixed(1)}°`)}
      {row('AOA', `${(d.aoa * 180 / Math.PI).toFixed(1)}°`)}
      {row('N1', `L:${aircraft.engines[0].n1.toFixed(1)}% R:${aircraft.engines[1].n1.toFixed(1)}%`)}
      {row('FUEL', `${aircraft.fuel.totalFuel.toFixed(0)} kg`)}
      {row('GW', `${aircraft.grossWeight.toFixed(0)} kg`)}
      {row('FLAPS', `${aircraft.config.flapSetting}°`)}
      {row('GEAR', aircraft.config.gearDown ? 'DN' : 'UP')}
    </div>
  );
}
```

Run: `npx vitest run src/components/Telemetry.test.tsx` → 1 passed.

**Step 3: Commit**

```bash
git add src/components/Telemetry.tsx src/components/Telemetry.test.tsx
git commit -m "feat: add Telemetry HUD component"
```

---

### Task 10: Simulation Loop & Controls

**Objective:** Wire RAF loop to the store's tick(), add keyboard controls, and wire Telemetry into App.

**Files:**
- Create: `src/hooks/useSimLoop.ts`
- Modify: `src/App.tsx`

**Step 1: Write the hook** — `src/hooks/useSimLoop.ts`

```typescript
import { useEffect, useRef } from 'react';
import { useSimStore } from '../store/simStore';

export function useSimLoop() {
  const tickRef = useRef(useSimStore.getState().tick);

  useEffect(() => {
    const unsub = useSimStore.subscribe((s) => { tickRef.current = s.tick; });
    let raf: number;
    const loop = (ts: number) => { tickRef.current(ts); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); unsub(); };
  }, []);
}
```

**Step 2: Wire into App** — overwrite `src/App.tsx`

```tsx
import { useRef, useEffect } from 'react';
import * as Cesium from 'cesium';
import { initCesium } from './config/cesium';
import { CesiumViewport } from './viewport/CesiumViewport';
import { ThreeLayer } from './viewport/ThreeLayer';
import { Telemetry } from './components/Telemetry';
import { useSimLoop } from './hooks/useSimLoop';
import { useSimStore } from './store/simStore';

initCesium();

export function App() {
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  useSimLoop();

  const start = useSimStore((s) => s.start);
  const pause = useSimStore((s) => s.pause);
  const resume = useSimStore((s) => s.resume);
  const reset = useSimStore((s) => s.reset);
  const status = useSimStore((s) => s.status);
  const setInput = useSimStore((s) => s.setInput);

  // Keyboard controls
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      switch (e.key.toLowerCase()) {
        case 'w': setInput({ elevator: -0.4 }); break;
        case 's': setInput({ elevator: 0.4 }); break;
        case 'a': setInput({ aileron: -0.5 }); break;
        case 'd': setInput({ aileron: 0.5 }); break;
        case 'q': setInput({ rudder: -0.5 }); break;
        case 'e': setInput({ rudder: 0.5 }); break;
        case 'arrowup': setInput({ throttle1: 1, throttle2: 1 }); break;
        case 'arrowdown': setInput({ throttle1: 0, throttle2: 0 }); break;
        case 'g': {
          const gear = useSimStore.getState().inputs.gearLever;
          setInput({ gearLever: gear === 'UP' ? 'DOWN' : 'UP' });
          break;
        }
        case 'f': {
          const flaps = useSimStore.getState().inputs.flapLever;
          const next = flaps >= 40 ? 0 : flaps < 5 ? 5 : flaps + 5;
          setInput({ flapLever: next });
          break;
        }
      }
    };
    const onKeyUp = () => setInput({ elevator: 0, aileron: 0, rudder: 0 });
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKeyUp); };
  }, [setInput]);

  const handleTakeoff = () => {
    setInput({ throttle1: 1, throttle2: 1, elevator: -0.3, gearLever: 'UP', flapLever: 5 });
    start();
  };

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <CesiumViewport
        onReady={(viewer) => {
          viewerRef.current = viewer;
          viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(-122.31, 47.45, 5000),
            orientation: { heading: Cesium.Math.toRadians(0), pitch: Cesium.Math.toRadians(-30), roll: 0 },
          });
        }}
      />
      <ThreeLayer viewer={viewerRef.current} />
      <Telemetry />
      <div style={{ position: 'fixed', bottom: 20, left: 20, zIndex: 100, display: 'flex', gap: 8 }}>
        {status === 'stopped' || status === 'paused' ? (
          <>
            <button onClick={handleTakeoff} style={btnStyle}>TAKEOFF</button>
            {status === 'paused' && <button onClick={resume} style={btnStyle}>RESUME</button>}
          </>
        ) : (
          <button onClick={pause} style={btnStyle}>PAUSE</button>
        )}
        <button onClick={reset} style={btnStyle}>RESET</button>
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  background: 'rgba(0,255,0,0.2)', color: '#0f0', border: '1px solid #0f0',
  padding: '8px 16px', fontFamily: 'monospace', cursor: 'pointer', fontSize: 14,
};
```

**Step 3: Update App test** — update mock to include useSimStore

Read current test then add:
```typescript
vi.mock('../store/simStore', () => ({
  useSimStore: vi.fn((sel: any) => {
    const state = {
      aircraft: { position: { lat: 0, lon: 0, alt: 0 }, attitude: { phi: 0, theta: 0, psi: 0 }, velocity: { u: 0, v: 0, w: 0 }, angularVel: { p: 0, q: 0, r: 0 }, config: { flapSetting: 0, gearDown: true, spoilersDeployed: false, speedBrake: 0 }, engines: [{ n1: 0, n2: 0, egt: 0, fuelFlow: 0, thrust: 0, running: false }, { n1: 0, n2: 0, egt: 0, fuelFlow: 0, thrust: 0, running: false }], fuel: { totalFuel: 0, fuelFlowTotal: 0, centerTank: 0, leftTank: 0, rightTank: 0 }, grossWeight: 0, cg: 0, simTime: 0, flightPhase: 'PARKED' },
      status: 'stopped',
      inputs: { elevator: 0, aileron: 0, rudder: 0, throttle1: 0, throttle2: 0, flapLever: 0, gearLever: 'DOWN', spoilers: 0, brake: 0 },
      start: vi.fn(), pause: vi.fn(), resume: vi.fn(), reset: vi.fn(), setInput: vi.fn(),
    };
    return sel ? sel(state) : state;
  }),
}));
```

Run: `npx vitest run` → all tests pass.

**Step 4: Commit**

```bash
git add -A && git commit -m "feat: add RAF simulation loop, keyboard controls, Telemetry in App"
```

---

### Task 11: Integration Smoke Test

**Objective:** Verify the full pipeline: store → tick → integrate → derivatives work together.

**Files:**
- Create: `src/__tests__/integration.test.ts`

**Step 1: Write test** — `src/__tests__/integration.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { useSimStore } from '../store/simStore';
import { B737_800_SPEC } from '../sim/types';

describe('simulation integration', () => {
  beforeEach(() => useSimStore.getState().reset());

  it('takeoff sequence: spool → rotate → climb', () => {
    useSimStore.getState().setInput({
      throttle1: 1, throttle2: 1,
      elevator: 0, gearLever: 'DOWN', flapLever: 5,
    });
    useSimStore.getState().start();

    const dt = 1 / 60;
    for (let i = 0; i < 600; i++) {
      if (i === 180) useSimStore.getState().setInput({ elevator: -0.4 }); // rotate at 3s
      if (i === 300) useSimStore.getState().setInput({ gearLever: 'UP' });  // gear up at 5s
      useSimStore.getState().tick(1000 + i * dt * 1000);
    }

    const a = useSimStore.getState().aircraft;
    expect(a.engines[0].n1).toBeGreaterThan(80);
    expect(a.position.alt).toBeGreaterThan(500);
    expect(a.velocity.u).toBeGreaterThan(50); // forward speed in m/s
    expect(a.attitude.theta).toBeGreaterThan(0.02); // nose up
    expect(a.config.gearDown).toBe(false);
    expect(a.fuel.totalFuel).toBeLessThan(B737_800_SPEC.maxFuel);
  });
});
```

Run: `npx vitest run src/__tests__/integration.test.ts` → 1 passed.

**Step 2: Run full suite**

```bash
npx vitest run && npx tsc --noEmit && npx vite build
```

**Step 3: Commit**

```bash
git add src/__tests__/integration.test.ts && git commit -m "test: add integration smoke test for takeoff"
```

---

## Phase 1 Complete — Verification

- [ ] `npx vitest run` — all tests pass (8+ test files)
- [ ] `npx tsc --noEmit` — no errors
- [ ] `npx vite build` — succeeds
- [ ] `npx vite` — globe renders, click TAKEOFF, telemetry shows altitude climbing
- [ ] WASD controls: W=pitch down, S=pitch up, A/D=roll, Q/E=rudder, arrows=throttle
