# RFS Flight Model, Ground, and Landing Realism Remediation Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task. Use strict TDD for code tasks, run two-stage reviews after each task, and preserve the non-claim discipline from the RFS project memory.

**Goal:** Move the physics model toward source-lineaged 737 behavior by fixing spoiler lift dump, gear/flap transit, landing rollout state, surface/terrain limitations, tighter envelope tests, and data ownership.

**Architecture:** Every realism change starts as a regression/envelope test. Runtime constants should migrate into versioned FDM data with honest metadata before tuning. This plan is deliberately staged so tests first expose unrealistic behavior, then implementation changes only the data/model layer needed to pass.

**Tech Stack:** React 19, TypeScript 6, Vite, Zustand, Vitest, Playwright, CesiumJS, Three.js, Docker/GitHub Actions where applicable.

**Source audit:** Derived from `/Users/reidar/Projectos/RFS/dogfood-output/2026-06-12-rfs-comprehensive-review/report.md` and the repo copy `/Users/reidar/Projectos/RFS/docs/reviews/2026-06-12-rfs-comprehensive-dogfood-audit.md`.

**Covers findings:** RFS-025, RFS-027, RFS-028, RFS-029, RFS-030, RFS-031, RFS-032, RFS-033, RFS-034

**Global rules:**
- Start every code task by writing the failing test and watching it fail for the expected reason.
- Use `source ~/.nvm/nvm.sh && nvm use 22` before every `npm`, `npx`, or `node` command.
- Do not push, deploy, rewrite history, read secrets, or modify credentials without explicit current authorization.
- Do not claim CI/live/full-flight/full-route/VNAV/data-backed FDM proof unless the exact evidence has actually been run.
- Use `patch` for existing source edits and `write_file` for new files.
- Commit after coherent task groups. Do not let parallel subagents commit in the same worktree.

---

### Task 1: Add source-lineage metadata shells for aero/ground tables

**Objective:** Create a place to record placeholder/source confidence for coefficients before moving more literals.

**Files:**
- Modify: `src/sim/data/aircraft/fdmTypes.ts`
- Modify: `src/sim/data/aircraft/b737-800-fdm.v1.ts`
- Modify: `src/sim/data/__tests__/b737-800-data.test.ts`
- Modify: `docs/architecture.md`

**Step 1: Write failing test**

```typescript
it('labels placeholder aero and ground coefficients with confidence metadata', () => {
  expect(B737_800_FDM.aero.metadata.confidence).toMatch(/placeholder|source/i);
  expect(B737_800_FDM.ground.metadata.units).toBeTruthy();
});
```

**Step 2: Run test to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/data/__tests__/b737-800-data.test.ts`
Expected: FAIL for the missing behavior, not a syntax/import error.

**Step 3: Write minimal implementation**

```typescript
export interface DataLineage {
  units: string;
  source: string;
  confidence: 'placeholder' | 'derived' | 'source-backed';
  notes: string;
}
```

**Step 4: Run test to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/data/__tests__/b737-800-data.test.ts`
Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`
Expected: PASS. For browser/runtime tasks also run `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npm run test:visual` after ensuring no stale local dev server owns port 5173.

**Step 6: Commit**

```bash
git add src/sim/data/aircraft/fdmTypes.ts src/sim/data/aircraft/b737-800-fdm.v1.ts src/sim/data/__tests__/b737-800-data.test.ts docs/architecture.md
git commit -m "docs: add FDM lineage metadata shells"
```


### Task 2: Model spoiler lift dump and wheel-loading effect

**Objective:** Speedbrakes/spoilers should reduce lift and increase normal force during rollout/RTO, not only add drag.

**Files:**
- Modify: `src/sim/physics/aero.ts`
- Modify: `src/sim/physics/__tests__/aero.test.ts`
- Modify: `src/sim/physics/__tests__/integrate.test.ts`
- Modify: `src/sim/data/aircraft/b737-800-fdm.v1.ts`

**Step 1: Write failing test**

```typescript
it('spoilers reduce lift and increase wheel normal force on rollout', () => {
  const clean = computeAeroAt({ spoilers: 0, speedKt: 140, aglFt: 0 });
  const deployed = computeAeroAt({ spoilers: 1, speedKt: 140, aglFt: 0 });
  expect(deployed.liftN).toBeLessThan(clean.liftN * 0.85);
});
```

**Step 2: Run test to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/physics/__tests__/aero.test.ts -t "spoilers reduce lift"`
Expected: FAIL for the missing behavior, not a syntax/import error.

**Step 3: Write minimal implementation**

```typescript
const spoilerLiftFactor = 1 - fdm.aero.spoilers.liftDumpFraction * clamp(inputs.spoilers, 0, 1);
const lift = baseLift * spoilerLiftFactor;
const drag = baseDrag + spoilerCd;
```

**Step 4: Run test to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/physics/__tests__/aero.test.ts src/sim/physics/__tests__/integrate.test.ts`
Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`
Expected: PASS. For browser/runtime tasks also run `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npm run test:visual` after ensuring no stale local dev server owns port 5173.

**Step 6: Commit**

```bash
git add src/sim/physics/aero.ts src/sim/physics/__tests__/aero.test.ts src/sim/physics/__tests__/integrate.test.ts src/sim/data/aircraft/b737-800-fdm.v1.ts
git commit -m "feat: add spoiler lift-dump effect"
```


### Task 3: Split commanded and actual gear/flap state [PARENT-DIRECT]

**Objective:** Introduce transit timing so gear and flaps do not teleport between states.

**Files:**
- Modify: `src/sim/types.ts`
- Modify: `src/sim/physics/integrate.ts`
- Modify: `src/sim/physics/__tests__/integrate.test.ts`
- Modify: `src/store/__tests__/scenarioPersistence.test.ts` for snapshot compatibility

**Step 1: Write failing test**

```typescript
it('gear actual position transits instead of instantly retracting', () => {
  const s = createTakeoffClimbState({ gearCommand: 'UP', gearPosition: 1 });
  const next = integrate(s, controlsWithGearUp, B737_800_SPEC, 0.5, null);
  expect(next.config.gearPosition).toBeLessThan(1);
  expect(next.config.gearPosition).toBeGreaterThan(0);
});
```

**Step 2: Run test to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/physics/__tests__/integrate.test.ts -t "gear actual position transits"`
Expected: FAIL for the missing behavior, not a syntax/import error.

**Step 3: Write minimal implementation**

```typescript
export interface AircraftConfig {
  gearDown: boolean; // backward-compatible derived actual down flag
  gearPosition: number; // 0 up, 1 down
  flapSetting: number; // actual setting
  commandedFlapSetting?: number;
}
```

**Step 4: Run test to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/physics/__tests__/integrate.test.ts src/store/__tests__/scenarioPersistence.test.ts`
Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`
Expected: PASS. For browser/runtime tasks also run `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npm run test:visual` after ensuring no stale local dev server owns port 5173.

**Step 6: Commit**

```bash
git add src/sim/types.ts src/sim/physics/integrate.ts src/sim/physics/__tests__/integrate.test.ts src/store/__tests__/scenarioPersistence.test.ts
git commit -m "feat: add gear and flap transit state"
```

**Snapshot safety:** Old snapshots must decode by defaulting missing `gearPosition` from `gearDown` and missing commanded flaps from actual flaps.

### Task 4: Add explicit landing-rollout flight phase [PARENT-DIRECT]

**Objective:** Represent touchdown/rollout/stopped separately instead of collapsing directly to LANDED.

**Files:**
- Modify: `src/sim/types.ts`
- Modify: `src/sim/physics/integrate.ts`
- Modify: `src/sim/guidanceState.ts`
- Modify: `src/sim/physics/__tests__/integrate.test.ts`
- Modify: `src/sim/__tests__/guidanceState.test.ts`

**Step 1: Write failing test**

```typescript
it('transitions touchdown to LANDING_ROLLOUT before LANDED', () => {
  const touched = integrate(shortFinalState(), landingControls, B737_800_SPEC, 0.5, null);
  expect(touched.flightPhase).toBe('LANDING_ROLLOUT');
  const stopped = runUntilStopped(touched);
  expect(stopped.flightPhase).toBe('LANDED');
});
```

**Step 2: Run test to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/physics/__tests__/integrate.test.ts -t "LANDING_ROLLOUT"`
Expected: FAIL for the missing behavior, not a syntax/import error.

**Step 3: Write minimal implementation**

```typescript
export type FlightPhase = 'PARKED' | 'TAKEOFF' | 'CLIMB' | 'CRUISE' | 'DESCENT' | 'APPROACH' | 'LANDING_ROLLOUT' | 'LANDED';
```

**Step 4: Run test to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/physics/__tests__/integrate.test.ts src/sim/__tests__/guidanceState.test.ts`
Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npx playwright test e2e/rfs-flight.spec.ts --reporter=line`
Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`
Expected: PASS. For browser/runtime tasks also run `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npm run test:visual` after ensuring no stale local dev server owns port 5173.

**Step 6: Commit**

```bash
git add src/sim/types.ts src/sim/physics/integrate.ts src/sim/guidanceState.ts src/sim/physics/__tests__/integrate.test.ts src/sim/__tests__/guidanceState.test.ts
git commit -m "feat: add explicit landing rollout phase"
```


### Task 5: Tighten crosswind runway-bound assertions

**Objective:** Make crosswind takeoff tests fail if the aircraft leaves the prepared runway instead of allowing 250 m displacement.

**Files:**
- Modify: `src/sim/physics/__tests__/integrate.test.ts`
- Read: `src/viewport/runwayData.ts`

**Step 1: Write failing test**

```typescript
it('stays within the KSEA runway edge during bounded crosswind takeoff', () => {
  const result = runCrosswindTakeoff();
  expect(Math.abs(result.maxLateralDisplacementM)).toBeLessThanOrEqual(KSEA_RUNWAY_16L.widthM / 2);
});
```

**Step 2: Run test to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/physics/__tests__/integrate.test.ts -t "crosswind"`
Expected: FAIL for the missing behavior, not a syntax/import error.

**Step 3: Write minimal implementation**

```typescript
const runwayEdgeLimitM = KSEA_RUNWAY_16L.widthM / 2;
expect(Math.abs(maxLateralDisplacementM)).toBeLessThanOrEqual(runwayEdgeLimitM);
```

**Step 4: Run test to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/physics/__tests__/integrate.test.ts`
Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`
Expected: PASS. For browser/runtime tasks also run `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npm run test:visual` after ensuring no stale local dev server owns port 5173.

**Step 6: Commit**

```bash
git add src/sim/physics/__tests__/integrate.test.ts
git commit -m "test: tighten crosswind runway bounds"
```


### Task 6: Add ENVA scenario performance-envelope coverage

**Objective:** Cover the default ENVA takeoff path in the same class of tests as KSEA profiles.

**Files:**
- Modify: `src/sim/physics/__tests__/performanceEnvelope.test.ts`
- Read: `src/sim/data/performance/b737PerformanceCards.ts`
- Read: `src/sim/scenarios.ts`

**Step 1: Write failing test**

```typescript
it('ENVA tutorial reaches liftoff and clean positive-rate inside card bounds', () => {
  const sample = runScenarioCardTakeoff('enva-tutorial');
  expect(sample.vrKt).toBeCloseTo(149, 0);
  expect(sample.liftoffAfterVr).toBe(true);
  expect(sample.maxVsFpm).toBeLessThanOrEqual(4000);
});
```

**Step 2: Run test to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/physics/__tests__/performanceEnvelope.test.ts -t "ENVA"`
Expected: FAIL for the missing behavior, not a syntax/import error.

**Step 3: Write minimal implementation**

```typescript
// Reuse scenario performance card data; do not duplicate V-speed constants in the test.
const card = findPerformanceCardForScenario('enva-tutorial');
```

**Step 4: Run test to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/physics/__tests__/performanceEnvelope.test.ts`
Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`
Expected: PASS. For browser/runtime tasks also run `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npm run test:visual` after ensuring no stale local dev server owns port 5173.

**Step 6: Commit**

```bash
git add src/sim/physics/__tests__/performanceEnvelope.test.ts
git commit -m "test: cover ENVA takeoff envelope"
```


### Task 7: Add landing performance cards and approach-energy tests

**Objective:** Track VREF, sink rate, flare, touchdown zone, and stopping distance as explicit scenario acceptance data.

**Files:**
- Modify: `src/sim/data/performance/b737PerformanceCards.ts`
- Modify: `src/sim/physics/__tests__/performanceCards.test.ts`
- Modify: `src/sim/physics/__tests__/integrate.test.ts`
- Modify: `e2e/rfs-flight.spec.ts`

**Step 1: Write failing test**

```typescript
it('KPDX short final lands inside the touchdown and stopping-distance envelope', () => {
  const result = runKpdxShortFinalLanding();
  expect(result.touchdownDistanceFromThresholdM).toBeGreaterThan(300);
  expect(result.touchdownDistanceFromThresholdM).toBeLessThan(900);
  expect(result.stopDistanceM).toBeLessThan(2300);
});
```

**Step 2: Run test to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/physics/__tests__/integrate.test.ts -t "touchdown zone"`
Expected: FAIL for the missing behavior, not a syntax/import error.

**Step 3: Write minimal implementation**

```typescript
export interface LandingPerformanceCard {
  vrefKt: number;
  maxSinkRateFpm: number;
  touchdownZoneM: { min: number; max: number };
  maxStoppingDistanceM: number;
}
```

**Step 4: Run test to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/physics/__tests__/performanceCards.test.ts src/sim/physics/__tests__/integrate.test.ts`
Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npx playwright test e2e/rfs-flight.spec.ts --reporter=line`
Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`
Expected: PASS. For browser/runtime tasks also run `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npm run test:visual` after ensuring no stale local dev server owns port 5173.

**Step 6: Commit**

```bash
git add src/sim/data/performance/b737PerformanceCards.ts src/sim/physics/__tests__/performanceCards.test.ts src/sim/physics/__tests__/integrate.test.ts e2e/rfs-flight.spec.ts
git commit -m "feat: add landing performance envelopes"
```


### Task 8: Move tire/brake/runway-condition constants into FDM tables [PARENT-DIRECT]

**Objective:** Make tire/brake/runway-condition behavior data-owned and source-lineaged instead of anonymous runtime constants.

**Files:**
- Modify: `src/sim/data/aircraft/fdmTypes.ts`
- Modify: `src/sim/data/aircraft/b737-800-fdm.v1.ts`
- Modify: `src/sim/systems/ground.ts`
- Modify: `src/sim/systems/__tests__/ground.test.ts`

**Step 1: Write failing test**

```typescript
it('custom runway condition table changes braking distance', () => {
  const dry = runRejectedTakeoff({ runwayCondition: 'dry' });
  const wet = runRejectedTakeoff({ runwayCondition: 'wet' });
  expect(wet.stopDistanceM).toBeGreaterThan(dry.stopDistanceM);
});
```

**Step 2: Run test to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/systems/__tests__/ground.test.ts -t "runway condition"`
Expected: FAIL for the missing behavior, not a syntax/import error.

**Step 3: Write minimal implementation**

```typescript
export interface GroundFdmData {
  tireFriction: Record<'dry' | 'wet' | 'offRunway', number>;
  brakeEfficiency: Record<'dry' | 'wet', number>;
  metadata: DataLineage;
}
```

**Step 4: Run test to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/systems/__tests__/ground.test.ts src/sim/physics/__tests__/integrate.test.ts`
Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`
Expected: PASS. For browser/runtime tasks also run `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npm run test:visual` after ensuring no stale local dev server owns port 5173.

**Step 6: Commit**

```bash
git add src/sim/data/aircraft/fdmTypes.ts src/sim/data/aircraft/b737-800-fdm.v1.ts src/sim/systems/ground.ts src/sim/systems/__tests__/ground.test.ts
git commit -m "feat: move ground friction data into FDM"
```


### Task 9: Document unsupported terrain/airport-surface boundary

**Objective:** Add runtime/docs/tests so unsupported ground surfaces cannot be mistaken for terrain-mesh proof.

**Files:**
- Modify: `src/sim/runwaySurface.ts`
- Modify: `src/sim/__tests__/runwaySurface.test.ts`
- Modify: `docs/architecture.md`
- Modify: `docs/roadmap.md`

**Step 1: Write failing test**

```typescript
it('marks nearest-runway fallback as unsupported terrain approximation', () => {
  const surface = sampleSupportedAirportSurface(offAirportPosition());
  expect(surface.surfaceKind).toBe('unsupportedFallback');
  expect(surface.warning).toMatch(/not terrain/i);
});
```

**Step 2: Run test to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/__tests__/runwaySurface.test.ts -t "unsupported"`
Expected: FAIL for the missing behavior, not a syntax/import error.

**Step 3: Write minimal implementation**

```typescript
// Add warning metadata to fallback return objects; do not change collision behavior in the same task.
warning: 'nearest-runway elevation fallback; not terrain mesh collision'
```

**Step 4: Run test to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/__tests__/runwaySurface.test.ts`
Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`
Expected: PASS. For browser/runtime tasks also run `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npm run test:visual` after ensuring no stale local dev server owns port 5173.

**Step 6: Commit**

```bash
git add src/sim/runwaySurface.ts src/sim/__tests__/runwaySurface.test.ts docs/architecture.md docs/roadmap.md
git commit -m "docs: mark unsupported surface fallback honestly"
```


## Dependency map

- Task 1 should precede Tasks 2 and 8 so new coefficients have metadata.
- Task 3 and Task 4 are [PARENT-DIRECT] because they touch core state and snapshots.
- Tasks 5-7 add stricter tests before tuning; do not silently loosen them to make current code pass.
- Task 9 is documentation/runtime honesty and can ship independently.

## Plan review history

- Initial controller pass: based on RFS physics/ground findings and current architecture docs.
- Independent coverage review: PASS — RFS-001 through RFS-055 are mapped with no missing/extra IDs and each child plan has actionable tasks.
- Independent command/path review: initial blockers found for invalid `git add` pathspecs, bare visual-test commands, and code-fence language mismatches; all were patched.
- Independent architecture/deploy-governance review: initial blockers found for worker/scheduler heartbeat safety and deploy-security parent-direct markings; all were patched.
- Final focused re-review: PASS — no remaining command/path/fence blockers and architecture/deploy-governance blockers are closed.
