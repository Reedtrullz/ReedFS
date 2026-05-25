# Phase 1: Flight Dynamics Core — Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Scaffold the RFS project with a point-mass flight physics engine, Zustand aircraft state stores, and a 60Hz simulation loop.

**Architecture:** New standalone Vite + React + TypeScript project in `RFS/`. References RFMS `shared/` types via file: dependency for avionics compatibility (AutopilotState, FlightPlan, etc.). Owns its own sim-core (physics engine, aircraft systems) and will grow a Three.js viewport in Phase 2. The simulation runs in the main thread via `requestAnimationFrame` for Phase 1; Web Worker offload considered for Phase 2+ when 3D rendering competes for frame budget.

**Tech Stack:** React 18, TypeScript, Vite, Zustand, Vitest, Three.js (minimal — just a skybox canvas for Phase 1 verification), ESLint + Prettier.

**Reference project:** RFMS at `../RFMS/shared/src/` — we import AutopilotState, FlightPlan, and PositionData types from there.

---

### Task 1: Project Scaffold

**Objective:** Create the RFS Vite + React + TypeScript project with all tooling.

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/index.css`
- Create: `vitest.config.ts`
- Create: `eslint.config.js`
- Create: `.prettierrc`
- Create: `.gitignore`

**Step 1: Scaffold with Vite**

Run:
```bash
cd /Users/reidar/Projectos/RFS
npm create vite@latest . -- --template react-ts
```

This creates the baseline `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`.

**Step 2: Install dependencies**

```bash
cd /Users/reidar/Projectos/RFS
npm install zustand three @types/three
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom prettier
```

**Step 3: Add RFMS shared/ reference**

In `package.json`, add a file: dependency:
```json
"dependencies": {
  "@virtual-cdu/shared": "file:../RFMS/shared"
}
```

Then `npm install`.

**Step 4: Configure Vite aliases**

In `vite.config.ts`, add resolve aliases:
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../RFMS/shared/src'),
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
```

**Step 5: Configure TypeScript**

In `tsconfig.json`, add path aliases:
```json
{
  "compilerOptions": {
    "paths": {
      "@shared/*": ["../RFMS/shared/src/*"],
      "@/*": ["./src/*"]
    }
  }
}
```

**Step 6: Configure Vitest**

Create `vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../RFMS/shared/src'),
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
```

**Step 7: Clean up defaults**

Replace `src/App.tsx` with a minimal placeholder:
```tsx
function App() {
  return (
    <div className="app">
      <h1>RFS — Real Flight Simulator</h1>
      <p>Phase 1: Flight Dynamics Core</p>
    </div>
  );
}

export default App;
```

Replace `src/index.css` with a dark background reset:
```css
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body, #root { height: 100%; background: #0a0a0a; color: #ccc; font-family: monospace; }
.app { padding: 2rem; }
```

Replace `index.html` title:
```html
<title>RFS — Real Flight Simulator</title>
```

**Step 8: Create .gitignore**

```
node_modules
dist
*.local
```

**Step 9: Verify**

```bash
npm run dev        # should start on :5173, show placeholder
npm run build      # should produce dist/
```

**Step 10: Initialize git and commit**

```bash
cd /Users/reidar/Projectos/RFS
git init
git add -A
git commit -m "chore: scaffold RFS project (Vite + React + TypeScript)"
```

---

### Task 2: Aircraft State Types

**Objective:** Define the core aircraft state types that the physics engine will mutate and the UI will render.

**Files:**
- Create: `src/sim/types.ts`

**Step 1: Write the types file**

```typescript
// src/sim/types.ts

// ── Geographic position ──
export interface GeoPosition {
  lat: number;   // decimal degrees (-90 to 90)
  lon: number;   // decimal degrees (-180 to 180)
  alt: number;   // feet MSL
}

// ── 3D attitude ──
export interface Attitude {
  pitch: number; // degrees, positive = nose up
  roll: number;  // degrees, positive = right bank
  yaw: number;   // degrees true heading (0-360)
}

// ── Velocity vector ──
export interface Velocity {
  ias: number;        // indicated airspeed (knots)
  tas: number;        // true airspeed (knots)
  gs: number;         // ground speed (knots)
  mach: number;       // mach number
  vs: number;         // vertical speed (ft/min, positive = climb)
}

// ── Engine state (simple twin-engine model) ──
export interface EngineState {
  n1: number;          // N1 % (0-110)
  n2: number;          // N2 % (0-110)
  egt: number;         // exhaust gas temp (°C)
  fuelFlow: number;    // kg/hr per engine
  thrust: number;      // lbf per engine
  running: boolean;
}

// ── Aircraft configuration ──
export interface AircraftConfig {
  flapSetting: number;   // flap detent (0, 1, 2, 5, 10, 15, 25, 30, 40)
  gearDown: boolean;
  spoilersArmed: boolean;
  spoilersDeployed: boolean;
  speedBrake: number;    // 0-1
}

// ── Fuel system ──
export interface FuelState {
  totalFuel: number;     // kg
  fuelFlowTotal: number; // kg/hr (both engines)
  centerTank: number;    // kg
  leftTank: number;      // kg
  rightTank: number;     // kg
}

// ── Environmental ──
export interface Environment {
  windDir: number;       // degrees true
  windSpeed: number;     // knots
  temperature: number;   // °C at current altitude
  qnh: number;           // hPA
  pressureAlt: number;   // feet
  densityAlt: number;    // feet
}

// ── The complete aircraft state ──
export interface AircraftState {
  // Current state
  position: GeoPosition;
  attitude: Attitude;
  velocity: Velocity;
  config: AircraftConfig;
  engines: [EngineState, EngineState];
  fuel: FuelState;
  environment: Environment;

  // Derived
  grossWeight: number;  // kg
  cg: number;           // % MAC

  // Clock
  simTime: number;      // simulation elapsed ms
  lastTick: number;     // performance.now() of last tick

  // Time of day
  timeOfDay: number;    // hours (0-24), fractional

  // Phase
  flightPhase: FlightPhase;
}

export type FlightPhase =
  | 'PARKED'
  | 'TAXI'
  | 'TAKEOFF'
  | 'CLIMB'
  | 'CRUISE'
  | 'DESCENT'
  | 'APPROACH'
  | 'LANDED';

// ── Control inputs (what the pilot / autopilot commands) ──
export interface ControlInputs {
  elevator: number;    // -1 (full nose-up) to +1 (full nose-down)
  aileron: number;     // -1 (full left) to +1 (full right)
  rudder: number;      // -1 (full left) to +1 (full right)
  throttle1: number;   // 0 (idle) to 1 (TOGA)
  throttle2: number;   // 0 (idle) to 1 (TOGA)
  flapLever: number;   // 0 to max flap detent
  gearLever: 'UP' | 'DOWN';
  spoilers: number;    // 0 to 1
  brake: number;       // 0 to 1
}

// ── Aircraft performance constants (Boeng 737-800 approximation for Phase 1) ──
export interface AircraftSpec {
  emptyWeight: number;       // kg
  maxFuel: number;           // kg
  maxTakeoffWeight: number;  // kg
  wingArea: number;          // m²
  wingSpan: number;          // m
  maxThrust: number;         // lbf per engine at sea level ISA
  engineCount: number;
  vRef: number;              // reference approach speed (kts)
  vStall: number;            // clean stall speed at MTOW (kts)
  maxFlaps: number;
  cgLimits: [number, number]; // % MAC
  fuelCapacity: {
    center: number;
    left: number;
    right: number;
  };
}
```

**Step 2: Add default spec for 737-800**

At the bottom of `src/sim/types.ts`:

```typescript
export const B737_800_SPEC: AircraftSpec = {
  emptyWeight: 41413,
  maxFuel: 20894,
  maxTakeoffWeight: 79015,
  wingArea: 124.6,
  wingSpan: 35.8,
  maxThrust: 27300,
  engineCount: 2,
  vRef: 140,
  vStall: 120,
  maxFlaps: 40,
  cgLimits: [7, 30],
  fuelCapacity: { center: 13066, left: 3914, right: 3914 },
};
```

**Step 3: Create initial state factory**

At the bottom of `src/sim/types.ts`:

```typescript
export function createInitialState(spec: AircraftSpec): AircraftState {
  return {
    position: { lat: 47.45, lon: -122.31, alt: 432 }, // KSEA
    attitude: { pitch: 0, roll: 0, yaw: 180 },
    velocity: { ias: 0, tas: 0, gs: 0, mach: 0, vs: 0 },
    config: { flapSetting: 0, gearDown: true, spoilersArmed: false, spoilersDeployed: false, speedBrake: 0 },
    engines: [
      { n1: 0, n2: 0, egt: 20, fuelFlow: 0, thrust: 0, running: false },
      { n1: 0, n2: 0, egt: 20, fuelFlow: 0, thrust: 0, running: false },
    ],
    fuel: {
      totalFuel: spec.maxFuel,
      fuelFlowTotal: 0,
      centerTank: spec.fuelCapacity.center,
      leftTank: spec.fuelCapacity.left,
      rightTank: spec.fuelCapacity.right,
    },
    environment: { windDir: 0, windSpeed: 0, temperature: 15, qnh: 1013.25, pressureAlt: 0, densityAlt: 0 },
    grossWeight: spec.emptyWeight + spec.maxFuel,
    cg: 25,
    simTime: 0,
    lastTick: 0,
    timeOfDay: 12,
    flightPhase: 'PARKED',
  };
}
```

**Step 4: Create test for types**

Create `src/sim/__tests__/types.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { createInitialState, B737_800_SPEC } from '../types';

describe('createInitialState', () => {
  it('returns parked at KSEA with full fuel', () => {
    const state = createInitialState(B737_800_SPEC);
    expect(state.position.lat).toBeCloseTo(47.45);
    expect(state.position.lon).toBeCloseTo(-122.31);
    expect(state.flightPhase).toBe('PARKED');
    expect(state.fuel.totalFuel).toBe(B737_800_SPEC.maxFuel);
    expect(state.engines[0].running).toBe(false);
  });

  it('calculates correct gross weight', () => {
    const state = createInitialState(B737_800_SPEC);
    expect(state.grossWeight).toBe(B737_800_SPEC.emptyWeight + B737_800_SPEC.maxFuel);
  });
});
```

**Step 5: Run tests**

```bash
npx vitest run src/sim/__tests__/types.test.ts
```
Expected: 2 passed.

**Step 6: Commit**

```bash
git add src/sim/types.ts src/sim/__tests__/types.test.ts
git commit -m "feat: add aircraft state types and initial state factory"
```

---

### Task 3: Physics Engine — Atmosphere & Conversions

**Objective:** Build atmospheric model and unit conversion utilities needed by the physics engine.

**Files:**
- Create: `src/sim/physics/atmosphere.ts`
- Create: `src/sim/physics/__tests__/atmosphere.test.ts`
- Create: `src/sim/physics/units.ts`

**Step 1: Write units module**

`src/sim/physics/units.ts`:

```typescript
// Unit conversion constants and helpers

export const FT_TO_M = 0.3048;
export const M_TO_FT = 1 / FT_TO_M;
export const KT_TO_MS = 0.514444;
export const MS_TO_KT = 1 / KT_TO_MS;
export const LBF_TO_N = 4.44822;
export const KG_TO_LB = 2.20462;
export const HPA_TO_INHG = 0.02953;
export const DEG_TO_RAD = Math.PI / 180;
export const RAD_TO_DEG = 180 / Math.PI;
export const NM_TO_DEG = 1 / 60; // 1 nautical mile ≈ 1/60 degree

export function fpmToMs(vsFpm: number): number {
  return vsFpm * FT_TO_M / 60; // ft/min → m/s
}

export function msToFpm(vsMs: number): number {
  return vsMs * 60 * M_TO_FT;
}
```

**Step 2: Write atmosphere model**

`src/sim/physics/atmosphere.ts`:

```typescript
/**
 * ISA (International Standard Atmosphere) model.
 *
 * Troposphere only (0 – 36,089 ft) for Phase 1.
 * Stratosphere extension trivial if needed later.
 *
 * References:
 *   - T0 = 288.15 K at sea level
 *   - Lapse rate = -6.5 K/km (-0.0019812 K/ft)
 *   - P0 = 101325 Pa (1013.25 hPa)
 *   - ρ0 = 1.225 kg/m³
 */

// Constants
const T0 = 288.15; // K at sea level
const P0 = 101325; // Pa at sea level
const RHO0 = 1.225; // kg/m³ at sea level
const LAPSE_RATE = -0.0065; // K/m
const G = 9.80665; // m/s²
const R = 287.058; // J/(kg·K) — specific gas constant for dry air
const G_OVER_R = G / R;
const TROPOPAUSE_M = 11000; // m
const TROPOPAUSE_K = 216.65; // K

const FT_TO_M = 0.3048;
const M_TO_FT = 1 / FT_TO_M;

export interface AtmoConditions {
  temperatureK: number;
  temperatureC: number;
  pressurePa: number;
  pressureHpa: number;
  density: number;     // kg/m³
  speedOfSound: number; // m/s
}

/**
 * Compute ISA conditions at a given altitude (feet MSL).
 * Uses the standard troposphere model.
 */
export function isaAtAltitude(altFt: number): AtmoConditions {
  const altM = altFt * FT_TO_M;

  let tempK: number;
  let pressPa: number;

  if (altM <= TROPOPAUSE_M) {
    // Troposphere
    tempK = T0 + LAPSE_RATE * altM;
    pressPa = P0 * Math.pow(tempK / T0, -G_OVER_R / LAPSE_RATE);
  } else {
    // Lower stratosphere (constant temp, exponential pressure)
    tempK = TROPOPAUSE_K;
    const pTropo = P0 * Math.pow(TROPOPAUSE_K / T0, -G_OVER_R / LAPSE_RATE);
    pressPa = pTropo * Math.exp(-G / (R * TROPOPAUSE_K) * (altM - TROPOPAUSE_M));
  }

  const density = pressPa / (R * tempK);
  const speedOfSound = Math.sqrt(1.4 * R * tempK); // γ = 1.4 for dry air

  return {
    temperatureK: tempK,
    temperatureC: tempK - 273.15,
    pressurePa: pressPa,
    pressureHpa: pressPa / 100,
    density,
    speedOfSound,
  };
}

/**
 * Compute pressure altitude from actual altitude and QNH.
 * pressureAlt = actualAlt + (1013.25 - QNH) * 29.92
 */
export function pressureAltitude(actualAltFt: number, qnhHpa: number): number {
  return actualAltFt + (1013.25 - qnhHpa) * 29.92;
}

/**
 * Compute density altitude from pressure altitude and temperature.
 * densityAlt = pressureAlt + 120 * (Tactual - Tstandard)
 */
export function densityAltitude(pressureAltFt: number, actualTempC: number): number {
  const tempStdC = 15 - 1.98 * (pressureAltFt / 1000);
  return pressureAltFt + 120 * (actualTempC - tempStdC);
}
```

**Step 3: Write tests**

`src/sim/physics/__tests__/atmosphere.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { isaAtAltitude, pressureAltitude, densityAltitude } from '../atmosphere';

describe('isaAtAltitude', () => {
  it('returns standard sea level values', () => {
    const a = isaAtAltitude(0);
    expect(a.temperatureC).toBeCloseTo(15, 0);
    expect(a.pressureHpa).toBeCloseTo(1013.25, -1);
    expect(a.density).toBeCloseTo(1.225, 1);
  });

  it('returns colder and thinner at 10,000 ft', () => {
    const a = isaAtAltitude(10000);
    expect(a.temperatureC).toBeCloseTo(-4.8, 0);
    expect(a.pressureHpa).toBeLessThan(750);
    expect(a.density).toBeLessThan(1.0);
  });

  it('returns tropopause values at 36,000 ft', () => {
    const a = isaAtAltitude(36000);
    expect(a.temperatureC).toBeCloseTo(-56.5, 0);
  });
});

describe('pressureAltitude', () => {
  it('returns same altitude at standard QNH', () => {
    expect(pressureAltitude(5000, 1013.25)).toBeCloseTo(5000, -1);
  });

  it('returns higher pressure altitude with low QNH', () => {
    const result = pressureAltitude(1000, 990);
    expect(result).toBeGreaterThan(1000);
  });
});

describe('densityAltitude', () => {
  it('returns higher DA on a hot day', () => {
    // At sea level, ISA temp is 15°C.  At 35°C, DA ≈ 2400 ft higher
    const da = densityAltitude(0, 35);
    expect(da).toBeCloseTo(2400, -1);
  });
});
```

**Step 4: Run tests**

```bash
npx vitest run src/sim/physics/__tests__/atmosphere.test.ts
```
Expected: 4+ passed.

**Step 5: Commit**

```bash
git add src/sim/physics/ src/sim/physics/__tests__/
git commit -m "feat: add ISA atmosphere model and unit conversions"
```

---

### Task 4: Physics Engine — Point-Mass Model (Forces)

**Objective:** Implement aerodynamic forces (lift, drag, thrust, weight) acting on a point mass.

**Files:**
- Create: `src/sim/physics/forces.ts`
- Create: `src/sim/physics/__tests__/forces.test.ts`

**Step 1: Write the forces module**

`src/sim/physics/forces.ts`:

```typescript
import type { AircraftState, AircraftSpec, ControlInputs } from '../types';
import { isaAtAltitude } from './atmosphere';
import { KT_TO_MS, LBF_TO_N, DEG_TO_RAD } from './units';

const G = 9.80665; // m/s²

export interface ForceResult {
  thrust: number;       // N
  drag: number;         // N
  lift: number;         // N
  weight: number;       // N
  totalForceX: number;  // N along velocity (thrust - drag - weight*sin(γ))
  totalForceZ: number;  // N perpendicular to velocity (lift - weight*cos(γ))
}

/**
 * Compute all forces acting on the aircraft.
 *
 * Simplified model:
 * - Thrust is linear with N1 and falls off with altitude
 * - Drag = 0.5 * ρ * v² * S * CD
 * - Lift = 0.5 * ρ * v² * S * CL
 * - Weight = mass * g
 *
 * @param state   Current aircraft state
 * @param inputs  Pilot/AP control inputs
 * @param spec    Aircraft performance constants
 * @param dt      Time step (seconds) — used for smoothing
 */
export function computeForces(
  state: AircraftState,
  inputs: ControlInputs,
  spec: AircraftSpec,
  dt: number,
): ForceResult {
  const atmo = isaAtAltitude(state.position.alt);
  const rho = atmo.density;
  const tasMs = state.velocity.tas * KT_TO_MS;

  // Weight
  const massKg = state.grossWeight;
  const weight = massKg * G;

  // Thrust (both engines)
  const thrustPerEngine = computeThrust(
    (state.engines[0].n1 + state.engines[1].n1) / 2 / 100,
    state.position.alt,
    tasMs,
    spec,
  );
  const totalThrust = thrustPerEngine * spec.engineCount;

  // Dynamic pressure
  const q = 0.5 * rho * tasMs * tasMs;

  // Lift coefficient — simplified linear model
  const cl0 = 0.2;       // CL at zero AoA
  const clAlpha = 5.5;   // CL per radian AoA
  const flapCl = flapCLIncrement(state.config.flapSetting);
  const aoa = computeAoA(state, inputs);
  const cl = cl0 + clAlpha * aoa * DEG_TO_RAD + flapCl;

  // Drag coefficient — parabolic polar
  const cd0 = 0.02 + 0.01 * (state.config.flapSetting > 0 ? 1 : 0) + (state.config.gearDown ? 0.03 : 0);
  const k = 1 / (Math.PI * 8 * 0.8); // 1 / (π * AR * e), AR ≈ 8, e ≈ 0.8
  const cd = cd0 + k * cl * cl + state.config.speedBrake * 0.05;

  const lift = q * spec.wingArea * cl;
  const drag = q * spec.wingArea * cd;

  // Flight path angle (gamma): sin(γ) = vertical_speed / TAS
  const gamma = state.velocity.tas > 1
    ? Math.asin(Math.max(-1, Math.min(1, (state.velocity.vs * 0.00508) / tasMs))) // vs ft/min → m/s
    : 0;

  // Total forces in flight-path axes
  const totalForceX = totalThrust - drag - weight * Math.sin(gamma);
  const totalForceZ = lift - weight * Math.cos(gamma);

  return { thrust: totalThrust, drag, lift, weight, totalForceX, totalForceZ };
}

/**
 * Approximate thrust from N1 setting.
 * Falls off with altitude via density ratio.
 */
function computeThrust(
  n1Fraction: number,
  altFt: number,
  tasMs: number,
  spec: AircraftSpec,
): number {
  if (n1Fraction <= 0) return 0;

  const atmo = isaAtAltitude(altFt);
  const rhoRatio = atmo.density / 1.225; // density relative to sea level

  // Static thrust at current altitude
  const staticThrustSl = spec.maxThrust * LBF_TO_N;
  const staticThrust = staticThrustSl * Math.pow(rhoRatio, 0.7); // empirical altitude falloff

  // Ram effect (very approximate)
  const ramFactor = 1 + 0.15 * (tasMs / atmo.speedOfSound);

  return staticThrust * n1Fraction * ramFactor;
}

/**
 * Compute angle of attack from elevator input and pitch attitude.
 * Very simplified — AoA = pitch + elevator_effect * elevator_input.
 */
function computeAoA(state: AircraftState, inputs: ControlInputs): number {
  // In steady flight, the aircraft pitches to maintain path.  Elevator
  // deflects AoA from that equilibrium.  For now, AoA ≈ pitch_trim + elevator * 10°.
  const trimAoA = state.velocity.tas > 50 ? 2.5 : 0; // approximate level-flight AoA at speed
  return trimAoA - inputs.elevator * 10; // elevator back = nose up = positive AoA
}

/**
 * CL increment from flap setting (approximate for 737).
 */
function flapCLIncrement(flapDetent: number): number {
  // Rough CL increments per flap setting
  if (flapDetent <= 0) return 0;
  if (flapDetent <= 5) return 0.4;
  if (flapDetent <= 10) return 0.6;
  if (flapDetent <= 15) return 0.8;
  if (flapDetent <= 25) return 1.1;
  return 1.3; // flaps 30-40
}
```

**Step 2: Write tests**

`src/sim/physics/__tests__/forces.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { computeForces } from '../forces';
import { createInitialState, B737_800_SPEC } from '../../types';

const zeroInputs = {
  elevator: 0, aileron: 0, rudder: 0,
  throttle1: 0, throttle2: 0,
  flapLever: 0, gearLever: 'UP' as const,
  spoilers: 0, brake: 0,
};

describe('computeForces', () => {
  it('at rest, thrust and lift are zero, weight is present', () => {
    const state = createInitialState(B737_800_SPEC);
    const forces = computeForces(state, zeroInputs, B737_800_SPEC, 1 / 60);
    expect(forces.thrust).toBe(0);
    expect(forces.lift).toBe(0);
    expect(forces.weight).toBeGreaterThan(0);
  });

  it('at cruise speed, lift ≈ weight', () => {
    const state = createInitialState(B737_800_SPEC);
    state.velocity.tas = 250; // knots
    state.velocity.ias = 250;
    state.position.alt = 35000;
    state.engines[0].n1 = 90;
    state.engines[1].n1 = 90;
    state.engines[0].running = true;
    state.engines[1].running = true;

    const inputs = { ...zeroInputs, throttle1: 0.9, throttle2: 0.9, elevator: -0.25 };
    const forces = computeForces(state, inputs, B737_800_SPEC, 1 / 60);

    expect(forces.thrust).toBeGreaterThan(0);
    expect(forces.drag).toBeGreaterThan(0);
    // Lift should be close to weight in cruise
    const liftWeightRatio = forces.lift / forces.weight;
    expect(liftWeightRatio).toBeGreaterThan(0.5);
    expect(liftWeightRatio).toBeLessThan(2.0);
  });

  it('flaps increase lift and drag', () => {
    const state = createInitialState(B737_800_SPEC);
    state.velocity.tas = 140;
    state.velocity.ias = 140;
    state.position.alt = 1000;

    const cleanForces = computeForces(state, { ...zeroInputs, elevator: -0.5 }, B737_800_SPEC, 1 / 60);

    state.config.flapSetting = 15;
    const flapForces = computeForces(state, { ...zeroInputs, elevator: -0.5 }, B737_800_SPEC, 1 / 60);

    expect(flapForces.lift).toBeGreaterThan(cleanForces.lift);
    expect(flapForces.drag).toBeGreaterThan(cleanForces.drag);
  });
});
```

**Step 3: Run tests**

```bash
npx vitest run src/sim/physics/__tests__/forces.test.ts
```
Expected: 3+ passed.

**Step 4: Commit**

```bash
git add src/sim/physics/forces.ts src/sim/physics/__tests__/forces.test.ts
git commit -m "feat: add point-mass force model (thrust, drag, lift, weight)"
```

---

### Task 5: Physics Engine — Integration Step

**Objective:** Implement the Euler integrator that advances the aircraft state by one physics tick.

**Files:**
- Create: `src/sim/physics/integrate.ts`
- Create: `src/sim/physics/__tests__/integrate.test.ts`

**Step 1: Write the integrator**

`src/sim/physics/integrate.ts`:

```typescript
import type { AircraftState, AircraftSpec, ControlInputs } from '../types';
import { computeForces } from './forces';
import { KT_TO_MS, DEG_TO_RAD, RAD_TO_DEG, NM_TO_DEG, fpmToMs, msToFpm } from './units';

const G = 9.80665;

/**
 * Advance the aircraft state by one time step using semi-implicit Euler.
 *
 * Updates: position (lat/lon/alt), attitude (pitch/yaw), velocity (tas/vs).
 *
 * Phase 1 simplifications:
 * - No side-slip or lateral forces (coordinated flight assumed)
 * - Roll simplified (aileron → roll rate → heading change)
 * - No ground effect
 * - No compressibility corrections beyond atmosphere model
 */
export function integrate(
  state: AircraftState,
  inputs: ControlInputs,
  spec: AircraftSpec,
  dt: number, // seconds
): void {
  const forces = computeForces(state, inputs, spec, dt);
  const massKg = state.grossWeight;

  // ── Update velocity ──
  const accelX = forces.totalForceX / massKg; // m/s² along flight path
  const oldTasMs = state.velocity.tas * KT_TO_MS;

  // New true airspeed
  const newTasMs = Math.max(0, oldTasMs + accelX * dt);
  state.velocity.tas = newTasMs / KT_TO_MS;

  // Vertical speed from force balance
  // Climb if lift > weight — the excess normal force goes into curvature
  const accelZ = forces.totalForceZ / massKg;
  const oldVsMs = fpmToMs(state.velocity.vs);
  const newVsMs = oldVsMs + accelZ * dt;
  state.velocity.vs = msToFpm(newVsMs);

  // Indicated airspeed (approximate: TAS scaled by sqrt(density ratio))
  // Will be properly computed later; for now IAS ≈ TAS * sqrt(ρ/ρ0)
  const rhoRatio = 1 + (state.position.alt * -0.000023); // rough density ratio
  state.velocity.ias = state.velocity.tas * Math.sqrt(Math.max(0.1, rhoRatio));

  // Mach
  const atmoImport = require('./atmosphere') as typeof import('./atmosphere');
  const atmo = atmoImport.isaAtAltitude(state.position.alt);
  state.velocity.mach = newTasMs / atmo.speedOfSound;

  // ── Update attitude ──
  // Pitch: elevator input + natural stability
  const pitchRate = -inputs.elevator * 3; // degrees/sec
  state.attitude.pitch += pitchRate * dt;
  state.attitude.pitch = Math.max(-20, Math.min(30, state.attitude.pitch));

  // Roll: aileron input
  const rollRate = -inputs.aileron * 15; // degrees/sec
  state.attitude.roll += rollRate * dt;
  state.attitude.roll = Math.max(-60, Math.min(60, state.attitude.roll));

  // Heading (yaw) change from bank angle — coordinated turn formula
  // Rate of turn (deg/s) = g * tan(bank) / (TAS in m/s) * RAD_TO_DEG
  if (newTasMs > 10) {
    const bankRad = state.attitude.roll * DEG_TO_RAD;
    const turnRate = (G * Math.tan(bankRad) / newTasMs) * RAD_TO_DEG;
    state.attitude.yaw += turnRate * dt;
  }
  // Normalize yaw
  while (state.attitude.yaw < 0) state.attitude.yaw += 360;
  while (state.attitude.yaw >= 360) state.attitude.yaw -= 360;

  // ── Update position ──
  // Latitude: vs * sin(pitch) (just altitude for now handled by vs)
  const headingRad = state.attitude.yaw * DEG_TO_RAD;
  const gsMs = newTasMs * Math.cos(state.attitude.pitch * DEG_TO_RAD);

  // Use approximate degree-per-meter conversion at current latitude
  const latDegPerM = 1 / 111320; // degrees per meter (latitude)
  const lonDegPerM = 1 / (111320 * Math.cos(state.position.lat * DEG_TO_RAD));

  state.position.lat += gsMs * Math.cos(headingRad) * latDegPerM * dt;
  state.position.lon += gsMs * Math.sin(headingRad) * lonDegPerM * dt;
  state.position.alt += state.velocity.vs * dt / 60; // vs is ft/min, dt in seconds

  // ── Update N1 based on throttle ──
  // Simple lag filter: N1 approaches commanded value with time constant
  const n1Tc = 1.5; // seconds
  const n1Cmd1 = inputs.throttle1 * 100;
  const n1Cmd2 = inputs.throttle2 * 100;
  state.engines[0].n1 += (n1Cmd1 - state.engines[0].n1) * (dt / n1Tc);
  state.engines[1].n1 += (n1Cmd2 - state.engines[1].n1) * (dt / n1Tc);
  state.engines[0].running = state.engines[0].n1 > 0.1;
  state.engines[1].running = state.engines[1].n1 > 0.1;

  // ── Update fuel ──
  // Simple fuel flow model: fuel flow proportional to N1
  const ffPerEngine = state.engines[0].n1 * 0.3 + state.engines[1].n1 * 0.3; // kg/hr rough
  const fuelUsed = (ffPerEngine / 3600) * dt; // kg this tick
  state.fuel.totalFuel = Math.max(0, state.fuel.totalFuel - fuelUsed);
  state.grossWeight = spec.emptyWeight + state.fuel.totalFuel;

  // ── Update config ──
  state.config.flapSetting = inputs.flapLever;
  state.config.gearDown = inputs.gearLever === 'DOWN';
  state.config.spoilersDeployed = inputs.spoilers > 0.5;
  state.config.speedBrake = inputs.spoilers;

  // ── Update clock ──
  state.simTime += dt * 1000;
  state.lastTick = performance.now();

  // ── Update environment ──
  state.environment.pressureAlt = state.position.alt; // simplified — no QNH correction yet
  state.environment.densityAlt = state.position.alt; // simplified
}

// Re-export for convenience
export { isaAtAltitude } from './atmosphere';
```

Wait — the `require` call is wrong in an ESM project. Let me fix that by importing at the top. Let me rewrite properly:

```typescript
import type { AircraftState, AircraftSpec, ControlInputs } from '../types';
import { computeForces } from './forces';
import { isaAtAltitude } from './atmosphere';
import { KT_TO_MS, DEG_TO_RAD, RAD_TO_DEG, fpmToMs, msToFpm } from './units';

const G = 9.80665;

/**
 * Advance the aircraft state by one time step using semi-implicit Euler.
 */
export function integrate(
  state: AircraftState,
  inputs: ControlInputs,
  spec: AircraftSpec,
  dt: number,
): void {
  const forces = computeForces(state, inputs, spec, dt);
  const massKg = state.grossWeight;

  // ── Velocity ──
  const accelX = forces.totalForceX / massKg;
  const oldTasMs = state.velocity.tas * KT_TO_MS;
  const newTasMs = Math.max(0, oldTasMs + accelX * dt);
  state.velocity.tas = newTasMs / KT_TO_MS;

  const accelZ = forces.totalForceZ / massKg;
  const oldVsMs = fpmToMs(state.velocity.vs);
  const newVsMs = oldVsMs + accelZ * dt;
  state.velocity.vs = msToFpm(newVsMs);

  // IAS ≈ TAS * sqrt(ρ/ρ0)
  const rhoRatio = Math.max(0.1, 1 - state.position.alt / 145000);
  state.velocity.ias = state.velocity.tas * Math.sqrt(rhoRatio);

  // Mach
  const atmo = isaAtAltitude(state.position.alt);
  state.velocity.mach = newTasMs / atmo.speedOfSound;

  // ── Attitude ──
  const pitchRate = -inputs.elevator * 3;
  state.attitude.pitch += pitchRate * dt;
  state.attitude.pitch = Math.max(-20, Math.min(30, state.attitude.pitch));

  const rollRate = -inputs.aileron * 15;
  state.attitude.roll += rollRate * dt;
  state.attitude.roll = Math.max(-60, Math.min(60, state.attitude.roll));

  if (newTasMs > 10) {
    const bankRad = state.attitude.roll * DEG_TO_RAD;
    const turnRate = (G * Math.tan(bankRad) / newTasMs) * RAD_TO_DEG;
    state.attitude.yaw += turnRate * dt;
  }
  while (state.attitude.yaw < 0) state.attitude.yaw += 360;
  while (state.attitude.yaw >= 360) state.attitude.yaw -= 360;

  // ── Position ──
  const headingRad = state.attitude.yaw * DEG_TO_RAD;
  const gsMs = newTasMs * Math.cos(state.attitude.pitch * DEG_TO_RAD);
  const latDegPerM = 1 / 111320;
  const lonDegPerM = 1 / (111320 * Math.cos(state.position.lat * DEG_TO_RAD));

  state.position.lat += gsMs * Math.cos(headingRad) * latDegPerM * dt;
  state.position.lon += gsMs * Math.sin(headingRad) * lonDegPerM * dt;
  state.position.alt += state.velocity.vs * dt / 60;

  // ── Engine spool ──
  const n1Tc = 1.5;
  state.engines[0].n1 += (inputs.throttle1 * 100 - state.engines[0].n1) * (dt / n1Tc);
  state.engines[1].n1 += (inputs.throttle2 * 100 - state.engines[1].n1) * (dt / n1Tc);
  state.engines[0].running = state.engines[0].n1 > 0.1;
  state.engines[1].running = state.engines[1].n1 > 0.1;

  // ── Fuel ──
  const ffPerEngine = state.engines[0].n1 * 0.3 + state.engines[1].n1 * 0.3;
  const fuelUsed = (ffPerEngine / 3600) * dt;
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

**Step 2: Write tests**

`src/sim/physics/__tests__/integrate.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { integrate } from '../integrate';
import { createInitialState, B737_800_SPEC } from '../../types';
import type { ControlInputs } from '../../types';

const idleInputs: ControlInputs = {
  elevator: 0, aileron: 0, rudder: 0,
  throttle1: 0, throttle2: 0,
  flapLever: 0, gearLever: 'DOWN',
  spoilers: 0, brake: 0,
};

describe('integrate', () => {
  it('does nothing at rest with idle throttles', () => {
    const state = createInitialState(B737_800_SPEC);
    const altBefore = state.position.alt;
    const yawBefore = state.attitude.yaw;

    integrate(state, idleInputs, B737_800_SPEC, 1 / 60);

    expect(state.position.alt).toBeCloseTo(altBefore, 0);
    expect(state.attitude.yaw).toBeCloseTo(yawBefore, 0);
    expect(state.velocity.tas).toBe(0);
  });

  it('accelerates with TOGA thrust', () => {
    const state = createInitialState(B737_800_SPEC);
    state.velocity.tas = 60; // already moving
    state.engines[0].running = true;
    state.engines[1].running = true;

    const togaInputs: ControlInputs = {
      ...idleInputs,
      throttle1: 1, throttle2: 1,
      elevator: -0.3, // slight nose-up
      gearLever: 'UP',
    };

    for (let i = 0; i < 60; i++) {
      integrate(state, togaInputs, B737_800_SPEC, 1 / 60);
    }

    // After 1 second at TOGA, should be faster and climbing
    expect(state.velocity.tas).toBeGreaterThan(60);
    expect(state.velocity.vs).toBeGreaterThan(100); // climbing
  });

  it('turning changes heading', () => {
    const state = createInitialState(B737_800_SPEC);
    state.velocity.tas = 250;
    state.engines[0].running = true;
    state.engines[1].running = true;
    const yawBefore = state.attitude.yaw;

    const bankInputs: ControlInputs = {
      ...idleInputs,
      throttle1: 0.6, throttle2: 0.6,
      aileron: -1, // full right bank
    };

    // Simulate banking and turning for several seconds
    for (let i = 0; i < 180; i++) {
      integrate(state, bankInputs, B737_800_SPEC, 1 / 60);
    }

    // Should have rolled and changed heading
    expect(state.attitude.roll).toBeLessThan(0); // right bank
    expect(state.attitude.yaw).not.toBeCloseTo(yawBefore, 0);
  });
});
```

**Step 3: Run tests**

```bash
npx vitest run src/sim/physics/__tests__/integrate.test.ts
```
Expected: 3 passed.

**Step 4: Commit**

```bash
git add src/sim/physics/integrate.ts src/sim/physics/__tests__/integrate.test.ts
git commit -m "feat: add semi-implicit Euler integrator for point-mass physics"
```

---

### Task 6: Zustand Store — Simulation State

**Objective:** Create the Zustand store that holds the live AircraftState and a ref to the latest ControlInputs, with actions to start/stop/pause/reset the sim.

**Files:**
- Create: `src/store/simStore.ts`
- Create: `src/store/__tests__/simStore.test.ts`
- Create: `src/store/index.ts`

**Step 1: Write the store**

`src/store/simStore.ts`:

```typescript
import { create } from 'zustand';
import type { AircraftState, ControlInputs, AircraftSpec } from '../sim/types';
import { createInitialState, B737_800_SPEC } from '../sim/types';
import { integrate } from '../sim/physics/integrate';

export type SimStatus = 'stopped' | 'running' | 'paused';

export interface SimStore {
  // State
  aircraft: AircraftState;
  inputs: ControlInputs;
  spec: AircraftSpec;
  status: SimStatus;

  // Last frame timing
  lastFrameTime: number;

  // Actions
  setInput: (partial: Partial<ControlInputs>) => void;
  tick: (timestamp: number) => void;
  start: () => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
}

const defaultInputs: ControlInputs = {
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

export const useSimStore = create<SimStore>((set, get) => ({
  aircraft: createInitialState(B737_800_SPEC),
  inputs: { ...defaultInputs },
  spec: B737_800_SPEC,
  status: 'stopped',
  lastFrameTime: 0,

  setInput: (partial) =>
    set((s) => ({
      inputs: { ...s.inputs, ...partial },
    })),

  tick: (timestamp: number) => {
    const { status, lastFrameTime, aircraft, inputs, spec } = get();
    if (status !== 'running') return;

    const dt = lastFrameTime > 0
      ? Math.min((timestamp - lastFrameTime) / 1000, 0.05) // cap at 50ms to prevent spiral
      : 1 / 60;

    const state = { ...aircraft };
    integrate(state, inputs, spec, dt);

    set({
      aircraft: state,
      lastFrameTime: timestamp,
    });
  },

  start: () => set({ status: 'running', lastFrameTime: 0 }),
  pause: () => set({ status: 'paused' }),
  resume: () => set({ status: 'running', lastFrameTime: 0 }),
  reset: () =>
    set({
      aircraft: createInitialState(B737_800_SPEC),
      inputs: { ...defaultInputs },
      status: 'stopped',
      lastFrameTime: 0,
    }),
}));
```

**Step 2: Barrel export**

`src/store/index.ts`:

```typescript
export { useSimStore } from './simStore';
export type { SimStore, SimStatus } from './simStore';
```

**Step 3: Write tests**

`src/store/__tests__/simStore.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { useSimStore } from '../simStore';

describe('useSimStore', () => {
  beforeEach(() => {
    useSimStore.getState().reset();
  });

  it('starts in stopped state', () => {
    expect(useSimStore.getState().status).toBe('stopped');
  });

  it('start transitions to running', () => {
    useSimStore.getState().start();
    expect(useSimStore.getState().status).toBe('running');
  });

  it('pause transitions to paused', () => {
    useSimStore.getState().start();
    useSimStore.getState().pause();
    expect(useSimStore.getState().status).toBe('paused');
  });

  it('setInput updates partial inputs', () => {
    useSimStore.getState().setInput({ throttle1: 0.8 });
    expect(useSimStore.getState().inputs.throttle1).toBe(0.8);
    expect(useSimStore.getState().inputs.throttle2).toBe(0); // unchanged
  });

  it('tick advances sim time when running', () => {
    useSimStore.getState().start();
    const timeBefore = useSimStore.getState().aircraft.simTime;
    useSimStore.getState().tick(performance.now());
    // After one tick, simTime should increase
    expect(useSimStore.getState().aircraft.simTime).toBeGreaterThanOrEqual(timeBefore);
  });

  it('tick does nothing when stopped', () => {
    const altBefore = useSimStore.getState().aircraft.position.alt;
    useSimStore.getState().tick(performance.now());
    // Altitude unchanged
    expect(useSimStore.getState().aircraft.position.alt).toBe(altBefore);
  });

  it('reset returns to initial state', () => {
    useSimStore.getState().setInput({ throttle1: 1 });
    useSimStore.getState().start();
    useSimStore.getState().tick(performance.now());
    useSimStore.getState().reset();

    expect(useSimStore.getState().status).toBe('stopped');
    expect(useSimStore.getState().inputs.throttle1).toBe(0);
  });
});
```

**Step 4: Run tests**

```bash
npx vitest run src/store/__tests__/simStore.test.ts
```
Expected: 7 passed.

**Step 5: Commit**

```bash
git add src/store/
git commit -m "feat: add Zustand simulation store with start/pause/reset"
```

---

### Task 7: Simulation Loop — RAF Hook

**Objective:** Wire `requestAnimationFrame` to the Zustand store's `tick()` method via a React hook. Display a simple telemetry overlay to verify the sim is running.

**Files:**
- Create: `src/hooks/useSimLoop.ts`
- Create: `src/hooks/__tests__/useSimLoop.test.ts`
- Modify: `src/App.tsx`
- Create: `src/components/Telemetry.tsx`

**Step 1: Write the hook**

`src/hooks/useSimLoop.ts`:

```typescript
import { useEffect, useRef } from 'react';
import { useSimStore } from '../store';

/**
 * Drives the simulation loop via requestAnimationFrame.
 * Starts automatically on mount; stops on unmount.
 * Only ticks when simStore.status === 'running'.
 */
export function useSimLoop() {
  const tickFn = useRef<((ts: number) => void) | null>(null);

  // Keep tickFn ref fresh without re-creating the RAF loop
  tickFn.current = useSimStore.getState().tick;

  useEffect(() => {
    // Subscribe to store changes so tickFn stays current
    const unsub = useSimStore.subscribe((state) => {
      tickFn.current = state.tick;
    });

    let rafId: number;

    const loop = (timestamp: number) => {
      tickFn.current?.(timestamp);
      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafId);
      unsub();
    };
  }, []);
}
```

**Step 2: Write the Telemetry component**

`src/components/Telemetry.tsx`:

```tsx
import { useSimStore } from '../store';

export function Telemetry() {
  const aircraft = useSimStore((s) => s.aircraft);
  const status = useSimStore((s) => s.status);

  return (
    <div style={{
      position: 'fixed', top: 10, left: 10,
      background: 'rgba(0,0,0,0.8)', color: '#0f0',
      fontFamily: 'monospace', fontSize: 12,
      padding: 12, borderRadius: 4, zIndex: 100,
      lineHeight: 1.6, minWidth: 280,
    }}>
      <div>SIM: <b>{status.toUpperCase()}</b></div>
      <div>ALT: {aircraft.position.alt.toFixed(0)} ft</div>
      <div>IAS: {aircraft.velocity.ias.toFixed(0)} kt</div>
      <div>TAS: {aircraft.velocity.tas.toFixed(0)} kt</div>
      <div>GS:  {aircraft.velocity.gs?.toFixed(0) ?? '---'} kt</div>
      <div>VS:  {aircraft.velocity.vs.toFixed(0)} fpm</div>
      <div>MACH: {aircraft.velocity.mach.toFixed(3)}</div>
      <div>HDG: {aircraft.attitude.yaw.toFixed(1)}°</div>
      <div>PITCH: {aircraft.attitude.pitch.toFixed(1)}°</div>
      <div>ROLL: {aircraft.attitude.roll.toFixed(1)}°</div>
      <div>N1 L: {aircraft.engines[0].n1.toFixed(1)}% R: {aircraft.engines[1].n1.toFixed(1)}%</div>
      <div>FUEL: {aircraft.fuel.totalFuel.toFixed(0)} kg</div>
      <div>GW: {aircraft.grossWeight.toFixed(0)} kg</div>
      <div>FLAPS: {aircraft.config.flapSetting}° GEAR: {aircraft.config.gearDown ? 'DN' : 'UP'}</div>
      <div>PHASE: {aircraft.flightPhase}</div>
    </div>
  );
}
```

**Step 3: Wire into App**

Modify `src/App.tsx`:

```tsx
import { useSimLoop } from './hooks/useSimLoop';
import { useSimStore } from './store';
import { Telemetry } from './components/Telemetry';

function App() {
  useSimLoop();

  const start = useSimStore((s) => s.start);
  const pause = useSimStore((s) => s.pause);
  const reset = useSimStore((s) => s.reset);
  const status = useSimStore((s) => s.status);
  const setInput = useSimStore((s) => s.setInput);

  const handleTakeoff = () => {
    setInput({
      throttle1: 1,
      throttle2: 1,
      elevator: -0.3,
      gearLever: 'UP',
      flapLever: 5,
    });
    start();
  };

  return (
    <div className="app">
      <Telemetry />
      <div style={{ marginTop: 400, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {status === 'stopped' || status === 'paused' ? (
          <button onClick={status === 'stopped' ? handleTakeoff : () => { resume(); }}>
            {status === 'stopped' ? 'TAKEOFF (KSEA 16L)' : 'RESUME'}
          </button>
        ) : (
          <button onClick={pause}>PAUSE</button>
        )}
        <button onClick={reset}>RESET</button>
      </div>
    </div>
  );
}

export default App;
```

Wait, there's a bug — `resume` isn't destructured. Let me fix:

```tsx
import { useSimLoop } from './hooks/useSimLoop';
import { useSimStore } from './store';
import { Telemetry } from './components/Telemetry';

function App() {
  useSimLoop();

  const start = useSimStore((s) => s.start);
  const pause = useSimStore((s) => s.pause);
  const resume = useSimStore((s) => s.resume);
  const reset = useSimStore((s) => s.reset);
  const status = useSimStore((s) => s.status);
  const setInput = useSimStore((s) => s.setInput);

  const handleTakeoff = () => {
    setInput({
      throttle1: 1,
      throttle2: 1,
      elevator: -0.3,
      gearLever: 'UP',
      flapLever: 5,
    });
    start();
  };

  return (
    <div className="app">
      <Telemetry />
      <div style={{ marginTop: 400, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {status === 'stopped' || status === 'paused' ? (
          <button onClick={status === 'stopped' ? handleTakeoff : () => resume()}>
            {status === 'stopped' ? 'TAKEOFF (KSEA 16L)' : 'RESUME'}
          </button>
        ) : (
          <button onClick={pause}>PAUSE</button>
        )}
        <button onClick={reset}>RESET</button>
      </div>
    </div>
  );
}

export default App;
```

**Step 4: Run dev server and verify**

```bash
npm run dev
```
Click TAKEOFF — telemetry should show N1 spooling up, altitude climbing, airspeed increasing.

**Step 5: Commit**

```bash
git add src/hooks/ src/components/ src/App.tsx
git commit -m "feat: add RAF simulation loop and telemetry overlay"
```

---

### Task 8: Three.js Skybox (Minimal Viewport Foundation)

**Objective:** Add a minimal Three.js canvas that renders a gradient sky and a simple terrain plane. This is the foundation for Phase 2's full 3D world, but for Phase 1 it gives visual confirmation the sim is running.

**Files:**
- Create: `src/components/WorldView.tsx`
- Modify: `src/App.tsx`

**Step 1: Write WorldView component**

`src/components/WorldView.tsx`:

```tsx
import { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useSimStore } from '../store';

export function WorldView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const aircraft = useSimStore((s) => s.aircraft);
  const aircraftRef = useRef(aircraft);
  aircraftRef.current = aircraft;

  useEffect(() => {
    if (!containerRef.current) return;

    const w = containerRef.current.clientWidth;
    const h = containerRef.current.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb); // sky blue
    scene.fog = new THREE.Fog(0x87ceeb, 500, 10000);

    // Camera
    const camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 50000);
    camera.position.set(0, 100, 200);
    camera.lookAt(0, 0, 0);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    containerRef.current.appendChild(renderer.domElement);

    // Ambient light
    scene.add(new THREE.AmbientLight(0x404060, 0.6));

    // Sun (directional)
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(1000, 2000, 500);
    sun.castShadow = true;
    scene.add(sun);

    // Ground plane
    const groundGeo = new THREE.PlaneGeometry(50000, 50000);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x3a5f3a, roughness: 0.8 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Aircraft proxy (simple triangle)
    const acGeo = new THREE.ConeGeometry(15, 60, 4);
    const acMat = new THREE.MeshStandardMaterial({ color: 0xcccccc });
    const acMesh = new THREE.Mesh(acGeo, acMat);
    acMesh.castShadow = true;
    scene.add(acMesh);

    // Grid helper for ground reference
    const grid = new THREE.GridHelper(2000, 20, 0x444444, 0x222222);
    scene.add(grid);

    // Animation loop
    let rafId: number;
    const animate = () => {
      const a = aircraftRef.current;

      // Position aircraft proxy
      // Simple world-space: x = lon offset, z = lat offset, y = altitude
      // For now, use relative offsets from initial KSEA position
      const dx = (a.position.lon - (-122.31)) * 111320 * Math.cos(47.45 * Math.PI / 180);
      const dz = -(a.position.lat - 47.45) * 111320;
      acMesh.position.set(dx, a.position.alt * 0.3048, dz); // ft → m

      // Rotation
      acMesh.rotation.y = -(a.attitude.yaw * Math.PI / 180) + Math.PI / 2;
      acMesh.rotation.z = a.attitude.roll * Math.PI / 180;
      acMesh.rotation.x = a.attitude.pitch * Math.PI / 180;

      // Camera follow (chase cam)
      const offset = new THREE.Vector3(0, 30, -100);
      offset.applyQuaternion(new THREE.Quaternion().setFromEuler(
        new THREE.Euler(
          -0.2,
          -(a.attitude.yaw * Math.PI / 180),
          0,
        ),
      ));
      camera.position.copy(acMesh.position).add(offset);
      camera.lookAt(acMesh.position);

      renderer.render(scene, camera);
      rafId = requestAnimationFrame(animate);
    };

    rafId = requestAnimationFrame(animate);

    // Resize handler
    const onResize = () => {
      if (!containerRef.current) return;
      const nw = containerRef.current.clientWidth;
      const nh = containerRef.current.clientHeight;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      if (containerRef.current?.contains(renderer.domElement)) {
        containerRef.current.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: -1,
      }}
    />
  );
}
```

**Step 2: Wire into App**

Modify `src/App.tsx` — add `import { WorldView } from './components/WorldView';` and render `<WorldView />` before the Telemetry:

```tsx
function App() {
  // ... existing code ...
  return (
    <div className="app">
      <WorldView />
      <Telemetry />
      {/* ... buttons ... */}
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add src/components/WorldView.tsx src/App.tsx
git commit -m "feat: add minimal Three.js world view with chase camera"
```

---

### Task 9: Integration Smoke Test

**Objective:** Verify the full pipeline works end-to-end: RAF → store tick → integrate → telemetry update.

**Files:**
- Create: `src/__tests__/integration.test.ts`

**Step 1: Write integration test**

```typescript
import { describe, it, expect } from 'vitest';
import { useSimStore } from '../store';

describe('simulation integration', () => {
  beforeEach(() => {
    useSimStore.getState().reset();
  });

  it('takeoff sequence: spool → rotate → climb', () => {
    // Configure for takeoff
    useSimStore.getState().setInput({
      throttle1: 1,
      throttle2: 1,
      elevator: 0,    // on the ground
      gearLever: 'DOWN',
      flapLever: 5,
    });
    useSimStore.getState().start();

    // Run 10 seconds of sim time at 60Hz
    const dt = 1 / 60;
    const steps = 10 * 60;
    for (let i = 0; i < steps; i++) {
      // After 3 seconds, rotate
      if (i === 3 * 60) {
        useSimStore.getState().setInput({ elevator: -0.4 });
      }
      // After 5 seconds, gear up
      if (i === 5 * 60) {
        useSimStore.getState().setInput({ gearLever: 'UP' });
      }
      useSimStore.getState().tick(performance.now() + i * dt * 1000);
    }

    const state = useSimStore.getState().aircraft;

    // After 10 seconds:
    // - N1 should be spooled up
    expect(state.engines[0].n1).toBeGreaterThan(80);
    // - Should be airborne
    expect(state.position.alt).toBeGreaterThan(500);
    // - Tas should have increased
    expect(state.velocity.tas).toBeGreaterThan(100);
    // - Pitch should be positive (nose up)
    expect(state.attitude.pitch).toBeGreaterThan(2);
    // - Gear should be up
    expect(state.config.gearDown).toBe(false);
    // - Fuel decreased
    expect(state.fuel.totalFuel).toBeLessThan(B737_800_SPEC.maxFuel);
  });
});
```

Wait, B737_800_SPEC isn't imported in the test. Let me fix:

```typescript
import { describe, it, expect } from 'vitest';
import { useSimStore } from '../store';
import { B737_800_SPEC } from '../sim/types';

describe('simulation integration', () => {
  beforeEach(() => {
    useSimStore.getState().reset();
  });

  it('takeoff sequence: spool → rotate → climb', () => {
    useSimStore.getState().setInput({
      throttle1: 1, throttle2: 1,
      elevator: 0, gearLever: 'DOWN', flapLever: 5,
    });
    useSimStore.getState().start();

    const dt = 1 / 60;
    const steps = 10 * 60;
    for (let i = 0; i < steps; i++) {
      if (i === 3 * 60) useSimStore.getState().setInput({ elevator: -0.4 });
      if (i === 5 * 60) useSimStore.getState().setInput({ gearLever: 'UP' });
      useSimStore.getState().tick(1000 + i * dt * 1000);
    }

    const a = useSimStore.getState().aircraft;
    expect(a.engines[0].n1).toBeGreaterThan(80);
    expect(a.position.alt).toBeGreaterThan(500);
    expect(a.velocity.tas).toBeGreaterThan(100);
    expect(a.attitude.pitch).toBeGreaterThan(2);
    expect(a.config.gearDown).toBe(false);
    expect(a.fuel.totalFuel).toBeLessThan(B737_800_SPEC.maxFuel);
  });
});
```

**Step 2: Run integration test**

```bash
npx vitest run src/__tests__/integration.test.ts
```
Expected: 1 passed.

**Step 3: Run full test suite**

```bash
npx vitest run
```
Expected: all tests pass (types, atmosphere, forces, integrate, simStore, integration).

**Step 4: Commit**

```bash
git add src/__tests__/
git commit -m "test: add integration smoke test for takeoff sequence"
```

---

## Phase 1 Complete — Verification Checklist

- [ ] `npm run dev` starts without errors
- [ ] Clicking TAKEOFF shows: N1 spooling to ~100%, altitude climbing, airspeed > 100 kts within seconds
- [ ] Pause freezes all values; Resume continues from where it was
- [ ] Reset returns to KSEA parked
- [ ] Three.js viewport shows a green ground plane with a triangle proxy moving
- [ ] `npx vitest run` — all tests pass
- [ ] `npm run build` — clean production build

## What Phase 1 Does NOT Include

- No 3D terrain or satellite imagery (Phase 2)
- No MSFS/SimConnect integration (Phase 3 controls + later)
- No sound (Phase 5)
- No full autopilot following FMC routes (Phase 4 systems)
- No gamepad support (Phase 3 input)
- No aircraft systems beyond basic engine spool model (Phase 4)
- No aerodynamic ground effect, flaps lift/drag curves from real tables (will refine in Phase 4)
