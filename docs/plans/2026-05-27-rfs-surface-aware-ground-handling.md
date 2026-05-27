# RFS Surface-Aware Ground Handling Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Add tested runway/off-runway surface sampling and ground-force scaling so RFS knows when a rollout leaves the prepared KSEA runway.

**Architecture:** Add a pure sim-side KSEA surface sampler that classifies geodetic position against the existing runway rectangles. Thread the sampled surface through `integrate()` into `applyGroundContact()` so contact state can distinguish prepared runway from off-runway ground and scale tire/brake/side friction without changing the wind contract or adding player-facing controls.

**Tech Stack:** TypeScript strict, Vitest, RFS 6-DOF physics, Zustand store integration through the existing `integrate()` heartbeat.

---

## Scope and non-goals

This plan addresses the remaining P1 roadmap item: non-runway surface handling beyond the current flat KSEA runway model.

In scope:

- Pure geometry helper to classify a position as `runway` or `offRunway` around KSEA.
- Prepared-runway vs off-runway friction scaling for rolling, braking, and lateral tire side force.
- `GroundState.onRunway` should mean prepared runway, not merely any ground contact.
- Deterministic integration tests proving off-runway contact is detected and decelerates differently.

Out of scope for this slice:

- No terrain mesh collision.
- No damage model or crash UI.
- No player-facing differential-brake/tiller controls.
- No refactor of runway data out of `src/viewport/runwayData.ts`; `src/sim/scenarios.ts` already imports that data, so keep the smallest safe change now and document the coupling.

---

## Architecture docs audit

Read before implementing:

- `docs/architecture.md`
- `docs/physics-invariants.md`
- `docs/roadmap.md`
- `docs/plans/2026-05-27-rfs-advanced-gear-tire-ground-handling.md`

Runtime heartbeat touched by this plan:

```text
src/App.tsx
  -> src/hooks/useSimLoop.ts
    -> src/store/simStore.ts tick()
      -> src/sim/physics/integrate.ts
        -> src/sim/runwaySurface.ts sampleKseaSurface()
        -> src/sim/systems/ground.ts applyGroundContact()
```

Import-safety audit:

- This is not a try/catch-swallowed plugin chain; import failures in `integrate.ts` or `ground.ts` should fail tests/build loudly.
- Still treat `integrate.ts` + `ground.ts` as runtime-heartbeat files. Tasks touching them are marked `[PARENT-DIRECT]` and must run targeted tests immediately after each change.
- Do not import React/Cesium components into sim physics. The only acceptable existing dependency in this slice is the already-used plain data module `src/viewport/runwayData.ts`.

Manual import/build verification after Task 1 uses existing project tooling only:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/__tests__/runwaySurface.test.ts
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx tsc -b --pretty false
```

Expected: Vitest passes and typecheck exits 0.

---

## Dependency map

```text
Task 1: create src/sim/runwaySurface.ts + tests — independent, but must happen first.
Task 2: align the legacy default initial state with a sampled runway point — depends on Task 1.
Task 3: modify ground pure helpers to accept surface friction — depends on Tasks 1-2.
Task 4: modify applyGroundContact() onRunway semantics — depends on Task 3.
Task 5: modify integrate.ts to sample surface each tick — depends on Tasks 1-4.
Task 6: update docs/roadmap/architecture/physics invariants — after code behavior is green.
```

Do not parallelize Tasks 2-5; they touch default sim state or the runtime physics heartbeat.

Required command prefix for all Node/test commands:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
```

---

### Task 1: Create pure KSEA surface sampler

**Objective:** Add a deterministic helper that classifies positions against KSEA runway rectangles and returns surface friction scales.

**Files:**

- Create: `src/sim/runwaySurface.ts`
- Create: `src/sim/__tests__/runwaySurface.test.ts`

**Step 1: Write failing test**

Create `src/sim/__tests__/runwaySurface.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { KSEA_RUNWAY_16L } from '../../viewport/runwayData';
import { KSEA_TUTORIAL_SCENARIO } from '../scenarios';
import { createInitialState, B737_800_SPEC } from '../types';
import { sampleKseaSurface } from '../runwaySurface';

function offsetPositionMeters(
  position: { lat: number; lon: number; altFt?: number; alt?: number },
  northM: number,
  eastM: number,
): { lat: number; lon: number; alt: number } {
  const metersPerDegreeLat = 111_320;
  const metersPerDegreeLon = 111_320 * Math.cos(position.lat * Math.PI / 180);
  return {
    lat: position.lat + northM / metersPerDegreeLat,
    lon: position.lon + eastM / metersPerDegreeLon,
    alt: position.alt ?? position.altFt ?? KSEA_RUNWAY_16L.elevationFt,
  };
}

describe('sampleKseaSurface', () => {
  it('classifies a runway threshold position as prepared runway', () => {
    const sample = sampleKseaSurface({
      lat: KSEA_RUNWAY_16L.start.lat,
      lon: KSEA_RUNWAY_16L.start.lon,
      alt: KSEA_RUNWAY_16L.elevationFt,
    });

    expect(sample.kind).toBe('runway');
    expect(sample.onRunway).toBe(true);
    expect(sample.runwayId).toBe('16L');
    expect(sample.groundAltFt).toBe(KSEA_RUNWAY_16L.elevationFt);
    expect(Math.abs(sample.lateralOffsetM ?? 0)).toBeLessThan(1e-6);
    expect(sample.alongTrackM ?? 0).toBeGreaterThanOrEqual(-1);
    expect(sample.frictionScale.rolling).toBe(1);
    expect(sample.frictionScale.brake).toBe(1);
    expect(sample.frictionScale.side).toBe(1);
  });

  it('classifies a point beyond runway width as off-runway ground', () => {
    const eastOfRunway = offsetPositionMeters(KSEA_RUNWAY_16L.start, 0, 80);

    const sample = sampleKseaSurface(eastOfRunway);

    expect(sample.kind).toBe('offRunway');
    expect(sample.onRunway).toBe(false);
    expect(sample.runwayId).toBeUndefined();
    expect(sample.groundAltFt).toBe(KSEA_RUNWAY_16L.elevationFt);
    expect(sample.frictionScale.rolling).toBeGreaterThan(1);
    expect(sample.frictionScale.brake).toBeLessThan(1);
    expect(sample.frictionScale.side).toBeLessThan(1);
  });

  it('classifies a point beyond runway length as off-runway ground', () => {
    const headingRad = KSEA_RUNWAY_16L.headingDeg * Math.PI / 180;
    const beyondDepartureEnd = offsetPositionMeters(
      KSEA_RUNWAY_16L.start,
      Math.cos(headingRad) * (KSEA_RUNWAY_16L.lengthM + 200),
      Math.sin(headingRad) * (KSEA_RUNWAY_16L.lengthM + 200),
    );

    const sample = sampleKseaSurface(beyondDepartureEnd);

    expect(sample.kind).toBe('offRunway');
    expect(sample.onRunway).toBe(false);
  });

  it('classifies scenario start positions as prepared runway', () => {
    const tutorialSurface = sampleKseaSurface(KSEA_TUTORIAL_SCENARIO.position);

    expect(tutorialSurface.kind).toBe('runway');
    expect(tutorialSurface.onRunway).toBe(true);
    expect(tutorialSurface.runwayId).toBe(KSEA_TUTORIAL_SCENARIO.runway.runway);
  });

  it('documents the legacy default initial state mismatch until Task 2 aligns it', () => {
    const defaultState = createInitialState(B737_800_SPEC);

    expect(sampleKseaSurface(defaultState.position).onRunway).toBe(false);
    expect(defaultState.ground.onRunway).toBe(true);
  });
});
```

**Step 2: Run test to verify failure**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/__tests__/runwaySurface.test.ts
```

Expected: FAIL — `Cannot find module '../runwaySurface'`.

**Step 3: Write minimal implementation**

Create `src/sim/runwaySurface.ts`:

```typescript
import type { GeoPosition } from './types';
import { KSEA_RUNWAYS, type RunwayReference } from '../viewport/runwayData';

export type GroundSurfaceKind = 'runway' | 'offRunway';

export interface GroundSurfaceFrictionScale {
  rolling: number;
  brake: number;
  side: number;
}

export interface GroundSurfaceSample {
  kind: GroundSurfaceKind;
  onRunway: boolean;
  groundAltFt: number;
  frictionScale: GroundSurfaceFrictionScale;
  runwayId?: string;
  alongTrackM?: number;
  lateralOffsetM?: number;
}

export const RUNWAY_FRICTION_SCALE: GroundSurfaceFrictionScale = {
  rolling: 1,
  brake: 1,
  side: 1,
};

export const OFF_RUNWAY_FRICTION_SCALE: GroundSurfaceFrictionScale = {
  rolling: 3,
  brake: 0.45,
  side: 0.55,
};

const RUNWAY_EDGE_MARGIN_M = 3;
const KSEA_FALLBACK_ELEVATION_FT = 432;

function localNorthEastMeters(position: GeoPosition, origin: RunwayReference['start']): { northM: number; eastM: number } {
  const metersPerDegreeLat = 111_320;
  const metersPerDegreeLon = 111_320 * Math.cos(origin.lat * Math.PI / 180);
  return {
    northM: (position.lat - origin.lat) * metersPerDegreeLat,
    eastM: (position.lon - origin.lon) * metersPerDegreeLon,
  };
}

function runwayCoordinates(position: GeoPosition, runway: RunwayReference): { alongTrackM: number; lateralOffsetM: number } {
  const { northM, eastM } = localNorthEastMeters(position, runway.start);
  const headingRad = runway.headingDeg * Math.PI / 180;
  return {
    alongTrackM: northM * Math.cos(headingRad) + eastM * Math.sin(headingRad),
    lateralOffsetM: -northM * Math.sin(headingRad) + eastM * Math.cos(headingRad),
  };
}

function isWithinRunwayRectangle(runway: RunwayReference, alongTrackM: number, lateralOffsetM: number): boolean {
  return (
    alongTrackM >= -RUNWAY_EDGE_MARGIN_M &&
    alongTrackM <= runway.lengthM + RUNWAY_EDGE_MARGIN_M &&
    Math.abs(lateralOffsetM) <= runway.widthM / 2 + RUNWAY_EDGE_MARGIN_M
  );
}

export function sampleKseaSurface(position: GeoPosition): GroundSurfaceSample {
  for (const runway of KSEA_RUNWAYS) {
    const { alongTrackM, lateralOffsetM } = runwayCoordinates(position, runway);
    if (isWithinRunwayRectangle(runway, alongTrackM, lateralOffsetM)) {
      return {
        kind: 'runway',
        onRunway: true,
        groundAltFt: runway.elevationFt,
        frictionScale: RUNWAY_FRICTION_SCALE,
        runwayId: runway.id,
        alongTrackM,
        lateralOffsetM,
      };
    }
  }

  return {
    kind: 'offRunway',
    onRunway: false,
    groundAltFt: KSEA_FALLBACK_ELEVATION_FT,
    frictionScale: OFF_RUNWAY_FRICTION_SCALE,
  };
}
```

**Step 4: Run test to verify pass**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/__tests__/runwaySurface.test.ts
```

Expected: PASS — 3 tests passed.

Then run typecheck:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx tsc -b --pretty false
```

Expected: exit 0.

**Step 5: Commit**

```bash
git add src/sim/runwaySurface.ts src/sim/__tests__/runwaySurface.test.ts
git commit -m "feat: add ksea surface sampler"
```

---

### Task 2: Align legacy default initial state with sampled runway geometry

**Objective:** Prevent the runtime sampler from immediately classifying the default `createInitialState()` aircraft as off-runway while its `GroundState` still says `onRunway: true`.

**Files:**

- Modify: `src/sim/types.ts:254-287`
- Modify: `src/sim/__tests__/runwaySurface.test.ts`
- Test: `src/sim/__tests__/runwaySurface.test.ts`

**Step 1: Change the mismatch test to the desired behavior**

In `src/sim/__tests__/runwaySurface.test.ts`, replace the Task 1 mismatch test with:

```typescript
  it('classifies the default initial state consistently with its ground state', () => {
    const defaultState = createInitialState(B737_800_SPEC);
    const surface = sampleKseaSurface(defaultState.position);

    expect(surface.kind).toBe('runway');
    expect(surface.onRunway).toBe(true);
    expect(defaultState.ground.onRunway).toBe(true);
    expect(defaultState.ground.groundAltFt).toBe(surface.groundAltFt);
  });
```

**Step 2: Run test to verify failure**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/__tests__/runwaySurface.test.ts
```

Expected: FAIL — `sampleKseaSurface(createInitialState(...).position).onRunway` is false because the default longitude is `-122.31`, outside the planned KSEA runway rectangles.

**Step 3: Write minimal implementation**

In `src/sim/types.ts`, keep the default heading unchanged for this slice to avoid broad takeoff/crosswind retuning, but move the default geodetic position onto the existing 16L threshold used by scenarios.

Replace:

```typescript
  const initialAltFt = 432;
```

with:

```typescript
  const initialLat = 47.45;
  const initialLon = -122.301;
  const initialAltFt = 432;
```

Replace:

```typescript
    position: { lat: 47.45, lon: -122.31, alt: initialAltFt },
```

with:

```typescript
    position: { lat: initialLat, lon: initialLon, alt: initialAltFt },
```

Do not change `const attitude: Attitude = { phi: 0, theta: 0, psi: Math.PI };` in this task. A future runway-heading realism pass can retune default heading; this task only removes the surface-classification contradiction.

**Step 4: Run test to verify pass**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/__tests__/runwaySurface.test.ts src/sim/systems/__tests__/ground.test.ts src/sim/physics/__tests__/integrate.test.ts
```

Expected: PASS. If any existing test fails because it assumes the old default longitude, update that test to use an explicit saved position instead of depending on the legacy default.

**Step 5: Commit**

```bash
git add src/sim/types.ts src/sim/__tests__/runwaySurface.test.ts
git commit -m "fix: align default state with sampled runway"
```

---

### Task 3 [PARENT-DIRECT]: Scale ground tire/brake forces by surface kind

**Objective:** Make prepared runway and off-runway ground produce different rolling, braking, and lateral tire friction while preserving existing runway behavior.

**Files:**

- Modify: `src/sim/systems/ground.ts`
- Modify: `src/sim/systems/__tests__/ground.test.ts`
- Test: `src/sim/systems/__tests__/ground.test.ts`

**Step 1: Write failing tests**

Add imports to `src/sim/systems/__tests__/ground.test.ts`:

```typescript
import { KSEA_RUNWAY_16L } from '../../../viewport/runwayData';
import { sampleKseaSurface } from '../../runwaySurface';
```

Add this helper near the test-local constants:

```typescript
function offsetPositionMeters(
  position: { lat: number; lon: number; altFt?: number; alt?: number },
  northM: number,
  eastM: number,
): { lat: number; lon: number; alt: number } {
  const metersPerDegreeLat = 111_320;
  const metersPerDegreeLon = 111_320 * Math.cos(position.lat * Math.PI / 180);
  return {
    lat: position.lat + northM / metersPerDegreeLat,
    lon: position.lon + eastM / metersPerDegreeLon,
    alt: position.alt ?? position.altFt ?? KSEA_RUNWAY_ALT_FT,
  };
}
```

Add tests inside `describe('applyGroundContact', ...)` before the final attitude/snapping tests:

```typescript
  it('scales rolling resistance higher on off-runway ground than prepared runway', () => {
    const state = createInitialState(B737_800_SPEC);
    state.velocity.u = 20;
    const gearStations = createB737GearStations(100_000, true);
    const runwaySurface = sampleKseaSurface({
      lat: KSEA_RUNWAY_16L.start.lat,
      lon: KSEA_RUNWAY_16L.start.lon,
      alt: KSEA_RUNWAY_16L.elevationFt,
    });
    const offRunwaySurface = sampleKseaSurface(offsetPositionMeters(KSEA_RUNWAY_16L.start, 0, 80));

    const runwayForces = computeGroundRollForces(state, idle, gearStations, runwaySurface);
    const offRunwayForces = computeGroundRollForces(state, idle, gearStations, offRunwaySurface);

    expect(runwaySurface.kind).toBe('runway');
    expect(offRunwaySurface.kind).toBe('offRunway');
    expect(offRunwayForces.rollingFrictionForceN).toBeGreaterThan(runwayForces.rollingFrictionForceN * 2);
  });

  it('reduces peak brake and side grip on off-runway ground', () => {
    const state = createInitialState(B737_800_SPEC);
    state.velocity.u = 35;
    state.velocity.v = 8;
    const gearStations = createB737GearStations(100_000, true);
    const runwaySurface = sampleKseaSurface({
      lat: KSEA_RUNWAY_16L.start.lat,
      lon: KSEA_RUNWAY_16L.start.lon,
      alt: KSEA_RUNWAY_16L.elevationFt,
    });
    const offRunwaySurface = sampleKseaSurface(offsetPositionMeters(KSEA_RUNWAY_16L.start, 0, 80));

    const runwayBrake = computeWheelBrakeForces(state, { leftBrake: 1, rightBrake: 1 }, gearStations, runwaySurface);
    const offRunwayBrake = computeWheelBrakeForces(state, { leftBrake: 1, rightBrake: 1 }, gearStations, offRunwaySurface);
    const runwaySide = computeTireSideForces(state, gearStations, runwaySurface);
    const offRunwaySide = computeTireSideForces(state, gearStations, offRunwaySurface);

    expect(offRunwayBrake.brakeForceN).toBeLessThan(runwayBrake.brakeForceN);
    expect(offRunwayBrake.antiSkidLimited).toBe(true);
    expect(offRunwaySide.peakSideForceN).toBeLessThan(runwaySide.peakSideForceN);
  });
```

**Step 2: Run test to verify failure**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/systems/__tests__/ground.test.ts
```

Expected: FAIL — off-runway and runway forces are identical because `ground.ts` ignores the new surface sample.

**Step 3: Write minimal implementation**

In `src/sim/systems/ground.ts`, add imports:

```typescript
import type { GroundSurfaceSample } from '../runwaySurface';
import { RUNWAY_FRICTION_SCALE } from '../runwaySurface';
```

Add helper:

```typescript
function frictionScaleForSurface(surface?: GroundSurfaceSample) {
  return surface?.frictionScale ?? RUNWAY_FRICTION_SCALE;
}
```

Change signatures:

```typescript
export function computeWheelBrakeForces(
  state: AircraftState,
  command: BrakeCommand,
  gearStations: GearStationState[] = state.ground.gearStations,
  surface?: GroundSurfaceSample,
): WheelBrakeForceBreakdown {
```

Inside `computeWheelBrakeForces`, before the loop:

```typescript
  const frictionScale = frictionScaleForSurface(surface);
```

Replace the available brake friction line:

```typescript
    const availableStationBrakeForceN = MAX_BRAKE_FRICTION_COEFFICIENT * frictionScale.brake * normalForceN;
```

Change `computeGroundRollForces` signature:

```typescript
export function computeGroundRollForces(
  state: AircraftState,
  inputs: ControlInputs,
  gearStations: GearStationState[] = state.ground.gearStations,
  surface?: GroundSurfaceSample,
): GroundRollForceBreakdown {
```

Inside `computeGroundRollForces`, pass surface and scale rolling friction:

```typescript
  const frictionScale = frictionScaleForSurface(surface);
  const brakeForces = computeWheelBrakeForces(
    state,
    { leftBrake: inputs.brake, rightBrake: inputs.brake },
    gearStations,
    surface,
  );
  const rollingFrictionForceN = ROLLING_FRICTION_COEFFICIENT * frictionScale.rolling * rollingNormalForceN;
```

Change `computeTireSideForces` signature:

```typescript
export function computeTireSideForces(
  state: AircraftState,
  gearStations: GearStationState[] = state.ground.gearStations,
  surface?: GroundSurfaceSample,
): TireSideForceBreakdown {
```

Inside `computeTireSideForces`, before the loop:

```typescript
  const frictionScale = frictionScaleForSurface(surface);
```

Replace peak side force:

```typescript
    const stationPeakSideForceN = MAX_TIRE_SIDE_FRICTION_COEFFICIENT * frictionScale.side * normalForceN;
```

Do not change existing callers yet except the internal `computeGroundRollForces -> computeWheelBrakeForces` path. Undefined surface must preserve runway behavior.

**Step 4: Run test to verify pass**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/systems/__tests__/ground.test.ts
```

Expected: PASS.

Then run targeted typecheck because signatures changed:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx tsc -b --pretty false
```

Expected: exit 0.

**Step 5: Commit**

```bash
git add src/sim/systems/ground.ts src/sim/systems/__tests__/ground.test.ts
git commit -m "feat: scale ground forces by surface"
```

---

### Task 4 [PARENT-DIRECT]: Preserve prepared-runway `onRunway` semantics in ground contact

**Objective:** Make `GroundState.onRunway` reflect whether the contact is on a prepared runway, while still allowing off-runway ground contact.

**Files:**

- Modify: `src/sim/systems/ground.ts`
- Modify: `src/sim/systems/__tests__/ground.test.ts`

**Step 1: Write failing test**

Add tests inside `describe('applyGroundContact', ...)` near existing gear-up/ground-contact tests:

```typescript
  it('reports off-runway gear contact without pretending it is prepared runway', () => {
    const state = createInitialState(B737_800_SPEC);
    state.position = offsetPositionMeters(KSEA_RUNWAY_16L.start, 0, 80);
    state.position.alt = KSEA_RUNWAY_ALT_FT;
    state.config.gearDown = true;
    const offRunwaySurface = sampleKseaSurface(state.position);

    const contact = applyGroundContact(state, idle, 1 / 60, KSEA_RUNWAY_ALT_FT, {
      surface: offRunwaySurface,
    });

    expect(offRunwaySurface.kind).toBe('offRunway');
    expect(contact.contact).toBe('gear');
    expect(contact.weightOnWheels).toBe(true);
    expect(contact.onRunway).toBe(false);
  });

  it('reports off-runway gear-up belly contact without setting onRunway', () => {
    const state = createInitialState(B737_800_SPEC);
    state.position = offsetPositionMeters(KSEA_RUNWAY_16L.start, 0, 80);
    state.position.alt = KSEA_RUNWAY_ALT_FT - 1;
    state.config.gearDown = false;
    const gearUp: ControlInputs = { ...idle, gearLever: 'UP' };
    const offRunwaySurface = sampleKseaSurface(state.position);

    const contact = applyGroundContact(state, gearUp, 1 / 60, KSEA_RUNWAY_ALT_FT, {
      surface: offRunwaySurface,
    });

    expect(offRunwaySurface.kind).toBe('offRunway');
    expect(contact.contact).toBe('belly');
    expect(contact.weightOnWheels).toBe(false);
    expect(contact.onRunway).toBe(false);
  });
```

**Step 2: Run test to verify failure**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/systems/__tests__/ground.test.ts
```

Expected: FAIL — `contact.onRunway` is currently true for any non-`none` contact.

**Step 3: Write minimal implementation**

Extend `GroundContactOptions`:

```typescript
export interface GroundContactOptions {
  normalForceN?: number;
  allowLiftoff?: boolean;
  surface?: GroundSurfaceSample;
}
```

Change `setGroundState` signature:

```typescript
function setGroundState(
  state: AircraftState,
  groundAltFt: number,
  contact: GroundContactType,
  weightOnWheels: boolean,
  normalForceN: number,
  gearStationsOverride?: GearStationState[],
  touchdownSinkRateMps?: number,
  onRunway = contact !== 'none',
): GroundState {
```

Change the field assignment:

```typescript
    onRunway: contact !== 'none' && onRunway,
```

Inside `applyGroundContact`, define near the top:

```typescript
  const surfaceOnRunway = options.surface?.onRunway ?? true;
```

Update `setGroundState` calls:

- Airborne/no-contact calls should pass no override or `false`; they already result in `onRunway: false` because `contact === 'none'`.
- Gear-up contact should pass `undefined` gear stations, `undefined` touchdown, and `surfaceOnRunway`:

```typescript
    return setGroundState(
      state,
      groundAltFt,
      contact,
      false,
      options.normalForceN ?? grossWeightForceN(state),
      undefined,
      undefined,
      surfaceOnRunway,
    );
```

- Gear contact final return should pass `surfaceOnRunway`:

```typescript
  return setGroundState(
    state,
    groundAltFt,
    'gear',
    true,
    gearNormalForceN,
    loadedGearStations,
    touchdownSinkRateMps,
    surfaceOnRunway,
  );
```

Also thread `options.surface` into force application in this task:

```typescript
  applyTireSideForces(state, dt, loadedGearStations, options.surface);
  applyLongitudinalGroundDecel(state, inputs, dt, loadedGearStations, options.surface);
```

That requires updating helper signatures:

```typescript
function applyTireSideForces(
  state: AircraftState,
  dt: number,
  gearStations: GearStationState[],
  surface?: GroundSurfaceSample,
): void {
  const tireSideForces = computeTireSideForces(state, gearStations, surface);
  // rest unchanged
}

function applyLongitudinalGroundDecel(
  state: AircraftState,
  inputs: ControlInputs,
  dt: number,
  gearStations: GearStationState[],
  surface?: GroundSurfaceSample,
): void {
  // rest unchanged except:
  const forces = computeGroundRollForces(state, inputs, gearStations, surface);
}
```

**Step 4: Run test to verify pass**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/systems/__tests__/ground.test.ts
```

Expected: PASS.

Then run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx tsc -b --pretty false
```

Expected: exit 0.

**Step 5: Commit**

```bash
git add src/sim/systems/ground.ts src/sim/systems/__tests__/ground.test.ts
git commit -m "feat: report off-runway ground contact"
```

---

### Task 5 [PARENT-DIRECT]: Wire surface sampling into the integration loop

**Objective:** Make the runtime physics heartbeat sample the current surface and pass it into ground contact.

**Files:**

- Modify: `src/sim/physics/integrate.ts`
- Modify: `src/sim/physics/__tests__/integrate.test.ts`

**Step 1: Write failing test**

Add imports to `src/sim/physics/__tests__/integrate.test.ts`:

```typescript
import { KSEA_RUNWAY_16L } from '../../../viewport/runwayData';
```

Add local helper near the existing helper functions:

```typescript
function offsetPositionMeters(
  position: { lat: number; lon: number; altFt?: number; alt?: number },
  northM: number,
  eastM: number,
): { lat: number; lon: number; alt: number } {
  const metersPerDegreeLat = 111_320;
  const metersPerDegreeLon = 111_320 * Math.cos(position.lat * Math.PI / 180);
  return {
    lat: position.lat + northM / metersPerDegreeLat,
    lon: position.lon + eastM / metersPerDegreeLon,
    alt: position.alt ?? position.altFt ?? KSEA_RUNWAY_ALT_FT,
  };
}

function setRunwayHeading(state: ReturnType<typeof createInitialState>): void {
  const headingRad = KSEA_RUNWAY_16L.headingDeg * Math.PI / 180;
  setAttitude(state, { ...state.attitude, psi: headingRad });
}
```

Add tests near the other ground/rollout tests:

```typescript
  it('marks ground contact off-runway when the aircraft is outside the prepared runway rectangle', () => {
    const state = createInitialState(B737_800_SPEC);
    state.position = offsetPositionMeters(KSEA_RUNWAY_16L.start, 0, 80);
    state.position.alt = KSEA_RUNWAY_ALT_FT;
    setRunwayHeading(state);
    state.config.gearDown = true;
    state.velocity.u = 10;

    integrate(state, idle, B737_800_SPEC, 1 / 60);

    expect(state.ground.contact).toBe('gear');
    expect(state.ground.weightOnWheels).toBe(true);
    expect(state.ground.onRunway).toBe(false);
  });

  it('off-runway rollout decelerates faster than prepared-runway rollout without reversing', () => {
    const runway = createInitialState(B737_800_SPEC);
    runway.position = {
      lat: KSEA_RUNWAY_16L.start.lat,
      lon: KSEA_RUNWAY_16L.start.lon,
      alt: KSEA_RUNWAY_ALT_FT,
    };
    setRunwayHeading(runway);
    runway.velocity.u = ktToMs(60);
    runway.config.gearDown = true;

    const offRunway = createInitialState(B737_800_SPEC);
    offRunway.position = offsetPositionMeters(KSEA_RUNWAY_16L.start, 0, 80);
    offRunway.position.alt = KSEA_RUNWAY_ALT_FT;
    setRunwayHeading(offRunway);
    offRunway.velocity.u = ktToMs(60);
    offRunway.config.gearDown = true;

    const braking: ControlInputs = { ...idle, brake: 0.5, spoilers: 1, gearLever: 'DOWN' };
    for (let i = 0; i < 5 * 120; i += 1) {
      integrate(runway, braking, B737_800_SPEC, 1 / 120);
      integrate(offRunway, braking, B737_800_SPEC, 1 / 120);
    }

    expect(runway.ground.onRunway).toBe(true);
    expect(offRunway.ground.onRunway).toBe(false);
    expect(offRunway.velocity.u).toBeGreaterThanOrEqual(-0.1);
    expect(offRunway.velocity.u).toBeLessThan(runway.velocity.u);
  });
```

**Step 2: Run test to verify failure**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/physics/__tests__/integrate.test.ts
```

Expected: FAIL — `state.ground.onRunway` remains true because `integrate.ts` always uses the flat KSEA runway default.

**Step 3: Write minimal implementation**

In `src/sim/physics/integrate.ts`, add import:

```typescript
import { sampleKseaSurface } from '../runwaySurface';
```

Before `nearRunwaySurface`, sample the pre-integration surface:

```typescript
  const preIntegrationSurface = sampleKseaSurface(state.position);
  const nearRunwaySurface = state.position.alt <= preIntegrationSurface.groundAltFt + GROUND_CONTACT_EPSILON_FT;
```

Replace existing `nearRunwaySurface` line; do not keep the old `state.ground.groundAltFt` comparison.

After position integration and before `applyGroundContact`, sample again because position may have moved:

```typescript
  const groundSurface = sampleKseaSurface(state.position);
  const groundContact = applyGroundContact(state, controls, dt, groundSurface.groundAltFt, {
    allowLiftoff,
    normalForceN,
    surface: groundSurface,
  });
```

Remove the previous `applyGroundContact(... KSEA_RUNWAY_ALT_FT, ...)` call.

Keep `updateTakeoffPhase()` using `KSEA_RUNWAY_ALT_FT` for now. This plan only adds KSEA runway/off-runway surface classification, not generalized airport terrain altitude.

**Step 4: Run test to verify pass**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/physics/__tests__/integrate.test.ts src/sim/systems/__tests__/ground.test.ts src/sim/__tests__/runwaySurface.test.ts
```

Expected: PASS.

Then run full typecheck:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx tsc -b --pretty false
```

Expected: exit 0.

**Step 5: Commit**

```bash
git add src/sim/physics/integrate.ts src/sim/physics/__tests__/integrate.test.ts
git commit -m "feat: wire surface sampling into ground contact"
```

---

### Task 6: Update docs and roadmap status

**Objective:** Keep current-state docs honest after surface-aware ground contact lands.

**Files:**

- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/physics-invariants.md`
- Modify: `docs/roadmap.md`
- Modify: `docs/plans/README.md`
- Modify: `docs/plans/2026-05-27-rfs-surface-aware-ground-handling.md` after implementation status is known

**Step 1: Update docs**

Patch current-state docs with wording like:

```markdown
- Ground contact samples KSEA runway rectangles and distinguishes prepared-runway contact from off-runway ground contact. Off-runway ground uses higher rolling resistance with reduced brake/side grip while preserving ground-relative velocity and runway-normal contact constraints.
```

In `docs/physics-invariants.md`, extend the Ground and runway contact section:

```markdown
- `GroundState.onRunway` means prepared runway surface, not merely any ground contact.
- Off-runway ground contact may still be `contact: 'gear'`, `belly`, or `crashed`; it must not silently become airborne just because it is outside the runway rectangle.
- Surface friction scaling must never mutate wind/air-relative velocity; it only changes ground-contact tire/brake/side forces.
```

In `docs/roadmap.md`, move “Non-runway surface friction/terrain handling beyond the current KSEA runway model” from remaining P1 scope to completed baseline if fully implemented, or narrow the remaining line to terrain mesh/non-KSEA airports if only KSEA off-runway is complete.

**Step 2: Search for stale contradictions**

Use the Hermes `search_files` tool with:

```text
pattern: flat KSEA runway|current KSEA runway model|onRunway|off-runway|non-runway surface
path: docs
```

If using terminal instead, run:

```bash
python3 - <<'PY'
from pathlib import Path
for path in Path('docs').rglob('*.md'):
    text = path.read_text()
    if any(term in text for term in ['flat KSEA runway', 'current KSEA runway model', 'onRunway', 'off-runway', 'non-runway surface']):
        print(path)
PY
```

Expected: every hit is either current and accurate or explicitly historical “at review time” wording.

**Step 3: Run docs/code verification**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check
```

Expected: PASS.

**Step 4: Commit**

```bash
git add README.md docs/architecture.md docs/physics-invariants.md docs/roadmap.md docs/plans/README.md docs/plans/2026-05-27-rfs-surface-aware-ground-handling.md
git commit -m "docs: document surface-aware ground handling"
```

---

## Final verification before reporting

Run the full local gate:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test:visual
```

Expected:

- `npm run check`: lint, typecheck, tests, build pass.
- `npm run test:visual`: Playwright visual tests pass.

Run final implementation audit from `subagent-driven-development/references/post-implementation-audit.md`, with special attention to:

- Runway rectangle math signs: heading 163° must produce correct along-track/lateral axes.
- `GroundState.onRunway` semantics: prepared runway only.
- Off-runway contact still constrains runway/ground-normal velocity.
- Surface scaling changes only tire/brake/side forces, not wind or air-relative velocity.
- Existing takeoff/crosswind/gear-up belly tests still pass.

If pushed to `master`, do not report deployment until:

```bash
gh run list --repo Reedtrullz/ReedFS --branch master --limit 1 --json databaseId,headSha,status,conclusion,workflowName,url
gh run watch <run-id> --repo Reedtrullz/ReedFS --exit-status
curl -fsSI https://fly.reidar.tech/
```

Expected:

- GitHub Actions latest run: `status=completed`, `conclusion=success`.
- Live endpoint: `HTTP/2 200`.
