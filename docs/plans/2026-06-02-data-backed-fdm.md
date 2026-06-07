# RFS Data-Backed Aircraft-Agnostic FDM Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task. Cross-cutting runtime/type/integrator tasks marked `[PARENT-DIRECT]` must be executed in the parent session, not by an isolated subagent.

**Goal:** Migrate RFS from a B737-ish gameplay-tuned flight model toward an aircraft-agnostic, source-cited FDM without breaking the current playable baseline.

**Architecture:** Introduce a typed `AircraftModel/FdmSpec` boundary, move B737-specific constants out of generic systems, attach source metadata to every aerodynamic/propulsion/ground-performance table, and add dynamic-mode/performance tests before tuning coefficients. The migration must preserve current behavior first, then tighten source-backed envelopes through explicit data changes rather than hidden generic-physics rewrites.

**Tech Stack:** TypeScript strict, Vitest, Zustand store, RFS 6-DOF body/NED physics, versioned aircraft data, Node 22.

---

## Current baseline read for this plan

Read before writing this plan:

- `docs/architecture.md`
- `docs/physics-invariants.md`
- `docs/roadmap.md`
- `src/sim/types.ts`
- `src/sim/data/aircraft/b737-800.v1.ts`
- `src/sim/physics/aero.ts`
- `src/sim/systems/ground.ts`
- `src/sim/systems/AeroModel.ts`
- `src/sim/physics/trimSolver.ts`
- `src/sim/data/performance/b737TrimFixtures.ts`
- `src/sim/data/performance/b737PerformanceCards.ts`
- `src/sim/physics/__tests__/performanceEnvelope.test.ts`
- `src/sim/physics/__tests__/trimSolver.test.ts`

Important current facts:

- Runtime heartbeat is `App -> useSimLoop -> simStore.tick -> compute route/AP -> integrate()`.
- Physics axes are body `x forward / y right / z down`, NED `north/east/down`; wind is air-relative input and must not mutate ground-relative `state.velocity`.
- `B737_800_SPEC` is already loaded from `src/sim/data/aircraft/b737-800.v1.ts`, but `AircraftSpec` is still a limited geometry/mass/propulsion shape.
- `B737_AERO` currently lives in `src/sim/systems/AeroModel.ts`; it has flap polars and moment coefficients but no source metadata.
- B737-specific constants still live in generic files:
  - `src/sim/types.ts`: `B737_GEAR_STATION_BASE`, `createB737GearStations()`.
  - `src/sim/physics/aero.ts`: elevator deflection, trim range/effect, nose-up elevator fade, side-force coefficients, ground-effect tuning.
  - `src/sim/systems/ground.ts`: B737-ish yaw inertia, rudder-pedal nosewheel steering authority, generic friction/tire constants that may need aircraft metadata.
- Existing data/performance tests cover basic versioned data, takeoff performance profiles, and one trim fixture. They do not yet cover phugoid, short-period, dutch-roll, stall, cruise, climb, or approach as a data-backed suite.

---

## Source-citation policy

Do not claim exact B737 certification fidelity unless the data source supports it. Every new table should declare what kind of source it is:

- `official`: manufacturer/FAA/EASA/manual data, for dimensions, masses, limits, V-speeds, field planning, etc.
- `research`: NASA/academic generic transport or public stability data, useful for shape, methods, and sanity ranges.
- `derived`: computed from another cited table.
- `gameplayGuard`: intentionally broad bounds that preserve current playability until better data is available.

Reference candidates found for future implementation:

- Boeing 737 NG Airplane Characteristics for Airport Planning: `https://www.boeing.com/content/dam/boeing/boeingdotcom/commercial/airports/acaps/737NG_REVA.pdf`
- NASA NTRS Transport Class Model / Generic Transport Model material: `https://ntrs.nasa.gov/citations/20110014509`
- NASA NTRS generic transport wind-tunnel/system-identification paper: `https://ntrs.nasa.gov/api/citations/20080033697/downloads/20080033697.pdf`
- NASA GTM DesignSim public code/data reference: `https://github.com/nasa/GTM_DesignSim`
- Flight-dynamics literature for mode definitions and test interpretation: Etkin & Reid, `Dynamics of Flight: Stability and Control`.

Policy:

1. A citation is not a magic number source unless the implementation states exactly which field came from it.
2. If a value is tuned for RFS playability, label it `gameplayGuard` instead of pretending it is sourced.
3. Dynamic-mode tests should initially assert directional/plausibility properties; tighten numeric ranges only after a cited table or reproducible derivation exists.
4. Do not tune by changing coordinate-frame math, wind semantics, gravity signs, or runway-contact constraints. Tune through `FdmSpec` tables after invariant tests are green.

---

## Design constraints

- Preserve current playable baseline first. The first implementation commits should be parity moves, not tuning.
- Keep `computeAero()` pure with respect to aircraft state except for reading current state; wind remains an input and `state.velocity` stays ground-relative.
- Keep quaternion authoritative and mirror Euler after integration.
- Mark tasks that touch `src/sim/types.ts`, `src/sim/physics/integrate.ts`, `src/store/simStore.ts`, or cross-file runtime selection `[PARENT-DIRECT]`.
- Do not move physics to a worker until a data-backed baseline and dynamic-mode tests are green.
- Keep all test fixtures explicit: position, altitude, heading, quaternion, weight, CG, flap/gear, wind, and initial rates. Never rely on `createInitialState()` defaults for physics-mode tests.
- Use Node 22 for all RFS checks:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
```

---

## Dependency map

```text
Phase 1 tasks 1-4: type/data boundary and parity tests; mostly independent except Task 3 depends on Task 1.
Phase 2 tasks 5-7: move B737 constants out of generic systems; serialize because they touch shared runtime files.
Phase 3 tasks 8-12: dynamic-mode fixture/test harness; can mostly run in parallel after the fixture helper exists.
Phase 4 tasks 13-15: coefficient migration/tuning; serialize and review after each envelope.
Phase 5 task 16: worker/fixed-timestep follow-up plan only after green baseline.
```

---

## Phase 1 — Create an aircraft model/FDM boundary without behavior changes

### Task 1: Define source metadata and FDM table types

**Objective:** Create reusable source/citation and FDM data types without wiring them into runtime.

**Files:**
- Create: `src/sim/data/fdm/types.ts`
- Create: `src/sim/data/__tests__/fdm-types.test.ts`

**Step 1: Write failing tests**

Add tests that validate metadata shape and required unit/source fields:

```ts
import { describe, expect, it } from 'vitest';
import type { DataSourceKind, FdmSourceCitation } from '../fdm/types';

const officialSource: FdmSourceCitation = {
  kind: 'official',
  title: '737 NG Airplane Characteristics for Airport Planning',
  url: 'https://www.boeing.com/content/dam/boeing/boeingdotcom/commercial/airports/acaps/737NG_REVA.pdf',
  accessed: '2026-06-02',
  notes: 'Used for dimensions and mass/limit sanity checks, not aerodynamic coefficients.',
};

describe('FDM source metadata types', () => {
  it('allows official, research, derived, and gameplay guard source kinds', () => {
    const kinds: DataSourceKind[] = ['official', 'research', 'derived', 'gameplayGuard'];
    expect(kinds).toHaveLength(4);
  });

  it('requires citation titles and explicit notes', () => {
    expect(officialSource.title).toContain('737');
    expect(officialSource.notes).toContain('not aerodynamic coefficients');
  });
});
```

**Step 2: Verify RED**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/data/__tests__/fdm-types.test.ts
```

Expected: FAIL because `src/sim/data/fdm/types.ts` does not exist.

**Step 3: Implement minimal types**

Create `types.ts` with interfaces only. Include at minimum:

```ts
export type DataSourceKind = 'official' | 'research' | 'derived' | 'gameplayGuard';

export interface FdmSourceCitation {
  kind: DataSourceKind;
  title: string;
  url?: string;
  accessed?: string;
  notes: string;
}

export interface FdmTableMetadata {
  name: string;
  units: string;
  referenceFrame: string;
  axes: string;
  signConvention: string;
  breakpoints?: string[];
  validRange?: string;
  sources: FdmSourceCitation[];
}

export interface VersionedFdmSpec<TAircraft = unknown, TAero = unknown, TGround = unknown> {
  schemaVersion: 1;
  dataVersion: string;
  id: string;
  name: string;
  aircraft: TAircraft;
  aero: TAero;
  ground: TGround;
  sources: FdmSourceCitation[];
}
```

**Step 4: Verify GREEN**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/data/__tests__/fdm-types.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/sim/data/fdm/types.ts src/sim/data/__tests__/fdm-types.test.ts
git commit -m "feat: add fdm source metadata types"
```

---

### Task 2: Add a B737 FDM data module that mirrors current runtime data

**Objective:** Create a versioned B737 FDM module that contains current mass/geometry/propulsion/inertia data plus metadata, but does not yet change runtime imports.

**Files:**
- Create: `src/sim/data/aircraft/b737-800.fdm.v1.ts`
- Create/Modify: `src/sim/data/__tests__/b737-800-fdm.test.ts`

**Step 1: Write failing tests**

Test that the new FDM module exposes:

- `schemaVersion: 1`
- `dataVersion`
- `id: 'b737-800'`
- source citations
- mass/geometry/propulsion/inertia fields equal to the current `B737_800_AIRCRAFT_DATA` values.

**Step 2: Verify RED**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/data/__tests__/b737-800-fdm.test.ts
```

Expected: FAIL because the FDM module does not exist.

**Step 3: Implement parity-only data**

Create the new module by importing or copying from `B737_800_AIRCRAFT_DATA`. Do not tune values. Add source notes that clearly say the current values are gameplay-preserving until audited source tables replace them.

**Step 4: Verify GREEN**

Run the same Vitest command. Expected: PASS.

**Step 5: Commit**

```bash
git add src/sim/data/aircraft/b737-800.fdm.v1.ts src/sim/data/__tests__/b737-800-fdm.test.ts
git commit -m "feat: add versioned b737 fdm data shell"
```

---

### Task 3: [PARENT-DIRECT] Adapt `AircraftSpec` loading to the FDM boundary while preserving exact output

**Objective:** Make `B737_800_SPEC` load through the new FDM boundary without changing any runtime values.

**Files:**
- Modify: `src/sim/types.ts`
- Modify: `src/sim/data/__tests__/b737-800-data.test.ts`
- Modify: `src/sim/data/__tests__/b737-800-fdm.test.ts`

**Why parent-direct:** This touches the core `AircraftSpec` runtime entry and current `createInitialState()` source assumptions.

**Step 1: Write failing parity test**

Add a test that compares `loadAircraftSpec()` before/after migration against the current `B737_800_AIRCRAFT_DATA` and new `B737_800_FDM_SPEC` adapter.

**Step 2: Verify RED**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/data/__tests__/b737-800-data.test.ts src/sim/data/__tests__/b737-800-fdm.test.ts
```

Expected: FAIL only because the adapter path is missing, not because numbers changed.

**Step 3: Implement adapter**

Add a small `loadAircraftSpecFromFdm()` helper or equivalent adapter. Keep exported `B737_800_SPEC` unchanged for all existing call sites.

**Step 4: Verify exact parity**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/data/__tests__/b737-800-data.test.ts src/sim/__tests__/types.test.ts
```

Expected: PASS and no snapshots/behavior changes.

**Step 5: Commit**

```bash
git add src/sim/types.ts src/sim/data/__tests__/b737-800-data.test.ts src/sim/data/__tests__/b737-800-fdm.test.ts
git commit -m "refactor: load aircraft spec through fdm adapter"
```

---

### Task 4: Move `B737_AERO` into source-cited FDM data with a compatibility export

**Objective:** Put current flap polars and moment coefficients in the B737 FDM module with metadata while preserving the existing `B737_AERO` import path.

**Files:**
- Modify: `src/sim/data/aircraft/b737-800.fdm.v1.ts`
- Modify: `src/sim/systems/AeroModel.ts`
- Modify: `src/sim/systems/__tests__/AeroModel.test.ts`
- Modify: `src/sim/data/__tests__/b737-800-fdm.test.ts`

**Step 1: Write failing parity tests**

Assert that the exported `B737_AERO` still has detents `[0, 1, 5, 15, 30, 40]` and that the FDM module has source metadata for the aero table.

**Step 2: Verify RED**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/systems/__tests__/AeroModel.test.ts src/sim/data/__tests__/b737-800-fdm.test.ts
```

Expected: FAIL because metadata/data relocation is missing.

**Step 3: Implement parity move**

Move the actual `B737_AERO` object into `b737-800.fdm.v1.ts` or export it from there. Keep `src/sim/systems/AeroModel.ts` as the type definition plus compatibility re-export if needed:

```ts
export { B737_AERO } from '../data/aircraft/b737-800.fdm.v1';
```

Add per-table metadata for the aero table. It must explicitly state:

- body axes are `x forward / y right / z down`
- world flight-dynamics frame is NED `north/east/down`
- stable pitch slope requires `cmAlpha < 0`
- negative elevator input is nose-up and must produce positive pitch moment / nose-up tendency in the current RFS convention
- drag body-X is signed to oppose air-relative flow, including reverse-flow/tailwind cases
- beta/rudder/yaw sign conventions for lateral-directional coefficients
- table breakpoints and valid ranges for flap detents, AoA, Mach, and configuration assumptions

Do not change coefficient values in this task.

**Step 4: Verify GREEN and broad aero parity**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/systems/__tests__/AeroModel.test.ts src/sim/physics/__tests__/aero.test.ts src/sim/physics/__tests__/performanceEnvelope.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/sim/data/aircraft/b737-800.fdm.v1.ts src/sim/systems/AeroModel.ts src/sim/systems/__tests__/AeroModel.test.ts src/sim/data/__tests__/b737-800-fdm.test.ts
git commit -m "refactor: move b737 aero coefficients into fdm data"
```

---

## Phase 2 — Remove B737 constants from generic systems

### Task 5: [PARENT-DIRECT] Parameterize aero hardcoded control/moment constants

**Objective:** Move B737-specific aero constants out of `aero.ts` and into `AeroModel`/FDM data without changing current results.

**Files:**
- Modify: `src/sim/physics/aero.ts`
- Modify: `src/sim/systems/AeroModel.ts`
- Modify: `src/sim/data/aircraft/b737-800.fdm.v1.ts`
- Modify: `src/sim/physics/__tests__/aero.test.ts`
- Modify: `src/sim/physics/__tests__/trimSolver.test.ts`

**Why parent-direct:** `aero.ts` is central to lift/drag/moments and sign/axis mistakes can silently make the simulator feel plausible but wrong.

**Move these current hardcoded values first as parity fields:**

- `MAX_ELEVATOR_DEFLECTION_RAD`
- `MIN_STABILIZER_TRIM_UNITS`
- `MAX_STABILIZER_TRIM_UNITS`
- `STABILIZER_TRIM_CM_PER_UNIT`
- `NOSE_UP_ELEVATOR_FADE_START_RAD`
- `NOSE_UP_ELEVATOR_FADE_END_RAD`
- `cyBeta`
- `cyRudder`
- ground-effect lift/induced-drag tuning constants

**Verification:** Compare `computeAero()` output for a matrix of states before/after the move. Include at least:

- clean level flight
- flaps 5 takeoff
- flaps 30 approach
- gear down and speedbrake extended
- reverse-flow/tailwind drag polarity case

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/physics/__tests__/aero.test.ts src/sim/physics/__tests__/trimSolver.test.ts src/sim/physics/__tests__/performanceEnvelope.test.ts
```

Expected: PASS.

Commit:

```bash
git add src/sim/physics/aero.ts src/sim/systems/AeroModel.ts src/sim/data/aircraft/b737-800.fdm.v1.ts src/sim/physics/__tests__/aero.test.ts src/sim/physics/__tests__/trimSolver.test.ts
git commit -m "refactor: parameterize b737 aero constants"
```

---

### Task 6: [PARENT-DIRECT] Move gear-station data out of `types.ts`

**Objective:** Make `types.ts` generic again by moving B737 gear station definitions into the B737 FDM data module.

**Files:**
- Modify: `src/sim/types.ts`
- Modify: `src/sim/data/aircraft/b737-800.fdm.v1.ts`
- Modify: `src/sim/__tests__/types.test.ts`
- Modify: `src/sim/systems/__tests__/ground.test.ts`

**Why parent-direct:** `createInitialState()` and `GroundState` are used across many tests and runtime paths.

**Steps:**

1. Write a failing test that `createB737GearStations()` output equals gear stations from the B737 FDM data.
2. Move `B737_GEAR_STATION_BASE` to the FDM module.
3. Keep `createB737GearStations()` as a compatibility helper initially, but make it read from the FDM module.
4. Do not change compression/load calculations in this task.

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/__tests__/types.test.ts src/sim/systems/__tests__/ground.test.ts
```

Expected: PASS.

Commit:

```bash
git add src/sim/types.ts src/sim/data/aircraft/b737-800.fdm.v1.ts src/sim/__tests__/types.test.ts src/sim/systems/__tests__/ground.test.ts
git commit -m "refactor: move b737 gear stations into fdm data"
```

---

### Task 7: [PARENT-DIRECT] Parameterize B737 ground/tire constants through FDM data

**Objective:** Move aircraft-specific ground handling values out of `ground.ts` while preserving generic contact/constraint logic.

**Files:**
- Modify: `src/sim/systems/ground.ts`
- Modify: `src/sim/physics/integrate.ts`
- Modify: `src/sim/data/aircraft/b737-800.fdm.v1.ts`
- Modify: `src/sim/systems/__tests__/ground.test.ts`
- Modify: `src/sim/physics/__tests__/integrate.test.ts`

**Move or classify these values:**

- `APPROX_B737_YAW_INERTIA_KGM2` -> should come from `spec.izz` or FDM inertia, not a duplicated constant.
- `MAX_RUDDER_PEDAL_NOSEWHEEL_STEERING_RAD` -> B737 ground-control data.
- tire cornering stiffness / brake friction / oleo damping values -> keep as generic defaults only if explicitly marked generic; otherwise move into aircraft ground data.
- runway elevation constants are airport/surface data, not aircraft FDM data; do not mix them into the FDM module.

**Implementation split inside this task:**

1. Thread yaw inertia / ground-model options through the actual call path first: `integrate()` -> `applyGroundContact()` -> `computeGroundRollForces()` / `computeWheelBrakeForces()` / `computeTireSideForces()` as needed. Do not leave helper functions silently using `APPROX_B737_YAW_INERTIA_KGM2` after `integrate.ts` has a real `spec` argument available.
2. Add parity tests for yaw acceleration sign and magnitude before and after the move: symmetric braking stays yaw-neutral, left/right side braking signs match current expectations, reverse rolling reverses sign, and numeric yaw acceleration stays within a tight parity tolerance for the current B737 data.
3. Only after yaw inertia is threaded, move steering/tire/brake constants that are truly aircraft-specific. If a constant remains generic, document that decision in the FDM metadata or `ground.ts` comment.

**Critical invariants to preserve:**

- stopped rudder/side-brake commands produce no movement/yaw
- reverse rolling reverses differential-brake yaw sign
- gear-up belly/crash slide damping is runway-tangent NED, not body-axis damping
- off-runway contact remains explicit and does not become airborne

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/systems/__tests__/ground.test.ts src/sim/physics/__tests__/integrate.test.ts
```

Expected: PASS.

Commit:

```bash
git add src/sim/systems/ground.ts src/sim/physics/integrate.ts src/sim/data/aircraft/b737-800.fdm.v1.ts src/sim/systems/__tests__/ground.test.ts src/sim/physics/__tests__/integrate.test.ts
git commit -m "refactor: parameterize b737 ground model constants"
```

---

## Phase 3 — Build explicit dynamic-mode and performance fixtures before tuning

### Task 8: Add explicit FDM test-state fixture helpers

**Objective:** Provide reusable physics test fixtures that never rely on drifting `createInitialState()` defaults.

**Files:**
- Create: `src/sim/physics/__tests__/fdmFixtureHelpers.ts`
- Create: `src/sim/physics/__tests__/fdmFixtureHelpers.test.ts`

**Helpers should require or set explicitly:**

- position lat/lon/alt
- runway/surface when relevant
- heading and quaternion
- body velocity `u/v/w`
- angular rates `p/q/r`
- gross weight and CG
- flap/gear/speedbrake/trim
- wind or `null`
- matching `ControlInputs` for the first integration tick

**Required helper APIs:**

- `bodyVelocityFromIasAoA({ iasKt, altitudeFt, aoaRad, betaRad, wind })`: convert IAS to TAS using the same ISA density convention as RFS (`tasKt = iasKt / Math.sqrt(rho / 1.225)`), then derive body `u/v/w` from AoA/beta. Never set `state.velocity.u = iasKt * KNOT_TO_MPS` at altitude.
- `createConfiguredFdmFixture(options)`: returns `{ state, controls }`, not just state. It must set `state.config.flapSetting === controls.flapLever`, `state.config.gearDown === (controls.gearLever === 'DOWN')`, and `state.config.speedBrake === controls.spoilers` so tests avoid the one-tick config lag in `integrate()`.
- `bodyVelocityFromNedProfile(...)` or `bodyVelocityFromIasFlightPath(...)`: build climb/descent fixtures by converting NED vertical profile to body axes with `nedToBody()` or by deriving body velocity from IAS + flight-path angle + attitude.
- `createNearEquilibriumAirborneFixture(...)`: create a clean/approach airborne state with wind explicitly `null` unless requested, engines and controls set, angular rates zero, and residuals checked before perturbation.

**Tests must prove:**

- heading changes update quaternion
- ground-relative velocity remains ground-relative
- fixture wind affects derived TAS/AoA only through `computeAirRelativeVelocity()`
- IAS fixtures at altitude convert through ISA density before setting body velocity
- descent fixtures have positive NED `down` and negative display VS
- returned controls match state config for flap/gear/speedbrake
- near-equilibrium fixtures start airborne (`ground.contact === 'none'`), with `p/q/r === 0`, lift/weight broadly bounded, thrust/drag residual bounded, and pitch/roll/yaw moments broadly bounded before any perturbation

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/physics/__tests__/fdmFixtureHelpers.test.ts
```

Expected: PASS after helper implementation.

Commit:

```bash
git add src/sim/physics/__tests__/fdmFixtureHelpers.ts src/sim/physics/__tests__/fdmFixtureHelpers.test.ts
git commit -m "test: add explicit fdm fixture helpers"
```

---

### Task 9: Expand trim fixtures before any coefficient changes

**Objective:** Add data-backed trim fixtures for clean, takeoff, climb, cruise, and approach configurations.

**Files:**
- Modify: `src/sim/data/performance/b737TrimFixtures.ts`
- Modify: `src/sim/physics/__tests__/trimSolver.test.ts`

**Fixture requirements:**

- each fixture has weight, CG, altitude, speed value, speed kind (`IAS` or `TAS`), flap, gear, AoA, expected trim range, expected lift/weight range, and source metadata
- all IAS-at-altitude fixtures use `bodyVelocityFromIasAoA()` from Task 8; do not set body `u` directly from IAS
- every trim test uses `{ state, controls }` from `createConfiguredFdmFixture()` so `state.config` and `ControlInputs` agree on flap/gear/speedbrake before the first tick/aero call
- include at least:
  - clean 220 kt / 10,000 ft existing fixture
  - flaps 5 takeoff/climb fixture
  - clean cruise fixture
  - flaps 30 approach fixture
  - forward-CG and aft-CG sanity pair

**Important:** If exact B737 trim charts are unavailable, keep expected ranges broad and label them `gameplayGuard` until a source is found.

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/physics/__tests__/trimSolver.test.ts
```

Expected: PASS.

Commit:

```bash
git add src/sim/data/performance/b737TrimFixtures.ts src/sim/physics/__tests__/trimSolver.test.ts
git commit -m "test: expand b737 trim fixture coverage"
```

---

### Task 10: Add stall envelope tests for clean and landing configurations

**Objective:** Prove the coefficient tables produce finite stall behavior instead of hidden attitude clamps or unlimited lift.

**Files:**
- Create: `src/sim/physics/__tests__/stallEnvelope.test.ts`
- Modify: `src/sim/data/performance/b737PerformanceCards.ts` or create `src/sim/data/performance/b737StallFixtures.ts`

**Tests should cover:**

- clean stall speed plausibility around current `vStall`; each fixture declares speed kind (`IAS` or `TAS`) and uses Task 8 helpers for conversion
- flaps 30/40 lower stall speed than clean; state config and controls agree before calling `computeAero()`/`integrate()`
- AoA increases as speed decays at fixed lift requirement
- beyond `clMax`, lift does not grow linearly forever and drag rise increases
- no test depends on the nose-up elevator fade as a stall substitute

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/physics/__tests__/stallEnvelope.test.ts src/sim/physics/__tests__/aero.test.ts
```

Expected: PASS after adding broad baseline ranges.

Commit:

```bash
git add src/sim/physics/__tests__/stallEnvelope.test.ts src/sim/data/performance/b737StallFixtures.ts
git commit -m "test: add b737 stall envelope fixtures"
```

---

### Task 11: Add climb, cruise, and approach performance-envelope tests

**Objective:** Replace one-off gameplay assertions with named, source-labeled performance cards that cover the important flight regimes.

**Files:**
- Modify: `src/sim/data/performance/b737PerformanceCards.ts`
- Modify: `src/sim/physics/__tests__/performanceEnvelope.test.ts`
- Optionally create: `src/sim/physics/__tests__/cruiseApproachEnvelope.test.ts`

**Tests should cover:**

- climb at representative weights, flaps/gear state, N1/throttle, speed kind (`IAS` or `TAS`), and altitude
- cruise drag/thrust balance at representative altitude and speed kind (`IAS` or `TAS`), with initial velocity created through Task 8 helpers
- approach descent at flaps 30, gear down, target IAS, and glidepath-like sink rate using `bodyVelocityFromNedProfile()` or `bodyVelocityFromIasFlightPath()`; do not set body `w` directly because body `w` is not display VS when pitch/roll are nonzero
- existing takeoff envelope remains green

**Fixture caution:** Use `fdmFixtureHelpers.ts`; do not call raw `createInitialState()` and rely on ENVA defaults for KSEA/performance tests. All first-tick fixtures must return `{ state, controls }` with flap/gear/speedbrake config matching controls.

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/physics/__tests__/performanceEnvelope.test.ts src/sim/data/__tests__/performanceCards.test.ts
```

Expected: PASS.

Commit:

```bash
git add src/sim/data/performance/b737PerformanceCards.ts src/sim/physics/__tests__/performanceEnvelope.test.ts src/sim/physics/__tests__/cruiseApproachEnvelope.test.ts
git commit -m "test: add b737 climb cruise approach envelopes"
```

---

### Task 12: Add dynamic-mode smoke tests: phugoid, short-period, and dutch-roll

**Objective:** Add dynamic-mode tests that catch obviously wrong stability behavior before coefficient tuning.

**Files:**
- Create: `src/sim/physics/__tests__/dynamicModes.test.ts`
- Use: `src/sim/physics/__tests__/fdmFixtureHelpers.ts`

**Test design:**

Before perturbing any dynamic mode, build the state through `createNearEquilibriumAirborneFixture()` and assert the baseline is actually near-equilibrium:

- `ground.contact === 'none'` and `ground.weightOnWheels === false`
- `p/q/r === 0`
- wind is explicitly `null` unless the test is about wind
- speed declares `IAS` or `TAS` and uses Task 8 conversion helpers
- `state.config` and `controls` agree on flap/gear/speedbrake
- lift/weight, thrust/drag residual, and pitch/roll/yaw moments are broadly bounded before perturbation

Mode tests:

- Phugoid: trimmed clean cruise, small pitch/velocity perturbation, longer integration. Assert bounded altitude/speed exchange and no divergent blow-up over the smoke-test window.
- Short-period: trimmed clean state, small positive pitch-rate or pitch perturbation, short integration. Assert pitch rate damps or remains bounded and sign behavior matches body-axis convention.
- Dutch-roll: trimmed clean state, documented perturbation source (`positive body v`, positive beta, or positive yaw rate). Assert yaw/roll response remains bounded and does not amplify explosively while wind/ground-velocity semantics remain unchanged.

Explicit sign assertions:

- positive `q` increases pitch angle `theta`
- `cmq` damping opposes pitch rate
- negative elevator input creates positive pitch moment / nose-up tendency in RFS convention
- aileron `-1` produces negative roll tendency/rate according to existing RFS tests
- lateral-directional tests document beta/rudder/yaw sign convention before asserting dutch-roll boundedness

**Do not overfit yet:** These are smoke tests, not certification matching. Initial acceptance should be broad and source-labeled as `research`/`gameplayGuard` until cited derivative tables exist.

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/physics/__tests__/dynamicModes.test.ts
```

Expected: PASS after adding broad baseline guards.

Commit:

```bash
git add src/sim/physics/__tests__/dynamicModes.test.ts
git commit -m "test: add fdm dynamic mode smoke tests"
```

---

## Phase 4 — Tune only through data after green parity and dynamic-mode baseline

### Task 13: [PARENT-DIRECT] Establish coefficient-change protocol

**Objective:** Create a small document and test gate that prevents hidden physics rewrites during coefficient tuning.

**Files:**
- Create: `docs/fdm-coefficient-change-protocol.md`
- Modify: `docs/physics-invariants.md`

**Protocol must require:**

- every numeric coefficient change names the source, source kind, and affected test envelope
- no generic frame/wind/gravity/contact code changes in the same commit as coefficient tuning
- targeted test + `npm run check` before merge
- reviewer checks coordinate-frame and unit consistency

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check
```

Expected: PASS.

Commit:

```bash
git add docs/fdm-coefficient-change-protocol.md docs/physics-invariants.md
git commit -m "docs: add fdm coefficient change protocol"
```

---

### Task 14: Tune longitudinal coefficients against trim/stall/climb/cruise tests

**Objective:** Adjust B737 aero data, not generic physics, so longitudinal behavior satisfies the new source-backed envelopes.

**Files:**
- Modify: `src/sim/data/aircraft/b737-800.fdm.v1.ts`
- Modify only if tests require tighter fixtures: `src/sim/data/performance/*`
- Test: `src/sim/physics/__tests__/trimSolver.test.ts`
- Test: `src/sim/physics/__tests__/stallEnvelope.test.ts`
- Test: `src/sim/physics/__tests__/performanceEnvelope.test.ts`
- Test: `src/sim/physics/__tests__/dynamicModes.test.ts`

**Rules:**

- Tune `clAlpha`, `clMax`, `cd0`, `k`, `cm0`, `cmAlpha`, `cmElevator`, `cmq`, trim effect, and flap `deltaCm` only through the FDM/aero data table.
- Keep signs consistent: stable `cmAlpha < 0`; elevator sign must preserve RFS convention where negative elevator input is nose-up.
- If a change fixes stall but breaks trim, stop and re-evaluate data/units instead of compensating with hidden control fades.

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/physics/__tests__/trimSolver.test.ts src/sim/physics/__tests__/stallEnvelope.test.ts src/sim/physics/__tests__/performanceEnvelope.test.ts src/sim/physics/__tests__/dynamicModes.test.ts
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check
```

Expected: PASS.

Commit:

```bash
git add src/sim/data/aircraft/b737-800.fdm.v1.ts src/sim/data/performance src/sim/physics/__tests__
git commit -m "fix: tune b737 longitudinal fdm data"
```

---

### Task 15: Tune lateral-directional and ground-control data after longitudinal baseline

**Objective:** Adjust lateral/yaw and ground-control data through the FDM tables without breaking ground-contact invariants.

**Files:**
- Modify: `src/sim/data/aircraft/b737-800.fdm.v1.ts`
- Test: `src/sim/physics/__tests__/dynamicModes.test.ts`
- Test: `src/sim/systems/__tests__/ground.test.ts`
- Test: `src/sim/physics/__tests__/integrate.test.ts`

**Rules:**

- Tune `clBeta`, `clAileron`, `clp`, `cnBeta`, `cnRudder`, `cnr`, and nosewheel/tire values through FDM data.
- Do not use rudder-pedal nosewheel steering as a tiller; keep B737-like pedal-scale authority.
- Preserve stationary safeguards: held rudder/side brake at zero speed cannot create yaw/motion.

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/physics/__tests__/dynamicModes.test.ts src/sim/systems/__tests__/ground.test.ts src/sim/physics/__tests__/integrate.test.ts
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check
```

Expected: PASS.

Commit:

```bash
git add src/sim/data/aircraft/b737-800.fdm.v1.ts src/sim/physics/__tests__/dynamicModes.test.ts src/sim/systems/__tests__/ground.test.ts src/sim/physics/__tests__/integrate.test.ts
git commit -m "fix: tune b737 lateral and ground fdm data"
```

---

## Phase 5 — Aircraft selection and worker timing only after green baseline

### Task 16: [PARENT-DIRECT] Add aircraft-model selection seam without adding a second aircraft yet

**Objective:** Make runtime APIs capable of accepting an `AircraftModel/FdmSpec` while keeping B737-800 as the only selectable/default model.

**Files:**
- Modify: `src/sim/types.ts`
- Modify: `src/store/simStore.ts`
- Modify: `src/sim/physics/integrate.ts` only if required
- Modify: `src/sim/__tests__/simulationStep.test.ts`
- Modify: `src/store/__tests__/simStore.test.ts`

**Why parent-direct:** This is a cross-cutting runtime state and integrator seam.

**Rules:**

- Default remains B737-800.
- Do not add a second aircraft in this task.
- State snapshots must stay cloneable.
- Existing saved scenarios must not break; if model id is absent, infer `b737-800`.

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check
```

Expected: PASS.

Commit:

```bash
git add src/sim/types.ts src/store/simStore.ts src/sim/physics/integrate.ts src/sim/__tests__/simulationStep.test.ts src/store/__tests__/simStore.test.ts
git commit -m "refactor: add aircraft model selection seam"
```

---

### Task 17: Plan worker/fixed-timestep migration only after FDM baseline is green

**Objective:** Create a follow-up worker/fixed-timestep implementation plan, not code, after data-backed FDM tests are stable.

**Files:**
- Create: `docs/plans/YYYY-MM-DD-rfs-worker-physics-after-fdm.md`

**Gate before writing this plan:**

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/physics/__tests__/dynamicModes.test.ts src/sim/physics/__tests__/performanceEnvelope.test.ts
```

Expected: PASS.

**Worker plan must cover:**

- codec coverage for `FdmSpec`/model id
- fixed-timestep accumulator behavior
- AP command composition before worker tick
- wind/weather updates without mutating ground-relative velocity
- worker lifecycle errors and fallback to main-thread physics
- deterministic parity between main-thread and worker for the same fixed inputs

Commit:

```bash
git add docs/plans/YYYY-MM-DD-rfs-worker-physics-after-fdm.md
git commit -m "docs: plan worker physics after fdm baseline"
```

---

## Required review after this plan

Ask one reviewer to check only physics/test validity, specifically:

- initial conditions are explicit and not default-state dependent
- body/NED axes and signs are preserved
- wind stays air-relative and does not mutate ground velocity
- generic physics code is not tuned to hide B737 data problems
- `[PARENT-DIRECT]` markings cover all cross-cutting type/integrator/runtime tasks
- task granularity is small enough for implementation and review
- worker/fixed-timestep work is correctly deferred until the FDM baseline is green

## Verification commands for this plan-only task

Run after saving this plan:

```bash
set -u
for f in docs/plans/2026-06-02-data-backed-fdm.md docs/architecture.md docs/physics-invariants.md docs/roadmap.md src/sim/types.ts src/sim/data/aircraft/b737-800.v1.ts src/sim/physics/aero.ts src/sim/systems/ground.ts; do
  test -f "$f" && echo "exists $f" || echo "MISSING $f"
done
for p in 'AircraftModel/FdmSpec' 'source metadata' 'phugoid' 'short-period' 'dutch-roll' 'stall' 'climb' 'cruise' 'approach' 'worker/fixed-timestep' '\[PARENT-DIRECT\]'; do
  if grep -qE "$p" docs/plans/2026-06-02-data-backed-fdm.md; then
    echo "marker OK: $p"
  else
    echo "marker MISSING: $p"
  fi
done
git diff --check
git status -sb
```

Expected: all files exist, all markers OK, `git diff --check` clean.

## Plan review history

- 2026-06-02: Initial plan authored from current RFS architecture/physics docs and source inspection.
- 2026-06-02: Physics/test-validity reviewer returned BLOCKED. Blockers: IAS-at-altitude fixtures lacked TAS conversion; dynamic-mode tests lacked near-equilibrium preconditions; fixtures did not address RFS config-vs-control one-tick lag; approach/climb vertical setup lacked NED/body conversion; Task 7 missed `integrate.ts` yaw-inertia threading; coefficient metadata lacked frame/sign/range fields; dynamic-mode sign assertions were too vague.
- 2026-06-02: Patched plan to require `bodyVelocityFromIasAoA()`, `createConfiguredFdmFixture()`, vertical-profile helpers, `createNearEquilibriumAirborneFixture()`, explicit state/control consistency, `integrate.ts` ground-model threading and yaw parity tests, frame/sign/range metadata, and concrete q/elevator/aileron/dutch-roll sign assertions.
- 2026-06-02: Focused physics/test-validity re-review returned PASS. All previous blockers resolved; no new blockers found.
