# RFS Multi-Airport Runway Surface Coverage Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task. Parent-direct is allowed for cross-cutting sampler/integration edits.

**Goal:** Extend the prepared-runway/off-runway surface model beyond KSEA by adding KPDX runway geometry and a generic supported-airport surface sampler while preserving the existing KSEA wrapper and physics contracts.

**Architecture:** Runway geometry stays as static TypeScript data in `src/viewport/runwayData.ts`, exposed through a generic supported runway list. `src/sim/runwaySurface.ts` uses one pure sampler to classify supported runways; `integrate()` calls the generic sampler, not a KSEA-only helper, while `sampleKseaSurface()` remains as a compatibility wrapper for existing tests/callers.

**Tech Stack:** TypeScript strict, Vitest, RFS 6-DOF ground physics, KSEA/KPDX runway catalog, Node 22 via nvm.

**Implementation status:** Complete through Task 4. Runtime ground contact now samples supported KSEA/KPDX runway rectangles through the generic sampler; remaining P1 surface scope is broader terrain mesh collision, richer airport surfaces outside prepared runway rectangles, and additional airports beyond KSEA/KPDX.

---

## Current baseline

Relevant current state:

- `src/viewport/runwayData.ts` exports KSEA and KPDX runway references through `SUPPORTED_RUNWAYS`.
- KPDX runway coverage is limited to prepared runway rectangles for 10L/28R, 10R/28L, and 03/21.
- `src/sim/runwaySurface.ts` exports `sampleSupportedAirportSurface(position)` for supported runways and preserves `sampleKseaSurface(position)` as a KSEA-only compatibility wrapper.
- `GroundSurfaceSample` includes optional `airport` metadata along with prepared-runway `runwayId` when applicable.
- Off-runway fallback elevation uses the nearest supported runway footprint/reference and remains simplified; it is not terrain mesh collision or full airport surface coverage.
- `src/sim/physics/integrate.ts` calls `sampleSupportedAirportSurface()` for pre-integration near-ground/liftoff checks and post-integration ground contact.
- `updateTakeoffPhase()` uses current/sampled `state.ground.groundAltFt` instead of a KSEA-only elevation constant.
- `GroundState.onRunway` means prepared-runway surface status, not generic ground contact.
- Existing KSEA behavior, default-state alignment, surface friction scales, and KSEA 16L tests must not regress.
- Regression coverage now includes runwayData catalog tests, KPDX/generic sampler tests, KPDX runway/off-runway integration tests, and a KPDX takeoff-to-climb elevation test.

Data source for this slice:

- KSEA stays on the existing current constants because many tests and scenario contracts depend on those synthetic aligned values.
- KPDX runway data comes from OurAirports runway CSV, fetched during planning on 2026-05-27:
  - 10L/28R: start `45.596537, -122.600062`, elevation 29 ft, heading 119°, length 9825 ft, width 150 ft.
  - 10R/28L: start `45.595155, -122.621510`, elevation 22 ft, heading 119°, length 11000 ft, width 150 ft.
  - 03/21: start `45.582405, -122.616856`, elevation 22 ft, heading 45°, length 6000 ft, width 150 ft.
- Convert lengths/widths to meters in static constants (`ft * 0.3048`) or precomputed rounded meter values; keep comments/doc note to avoid magic-looking numbers.

Required command prefix for all Node/test/build work:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
```

---

## Constraints and invariants

- Do not change the existing KSEA constants unless a task explicitly says so. KSEA scenario/default state tests rely on the current synthetic geometry.
- `sampleKseaSurface()` must remain exported and must continue to classify only KSEA runways.
- The generic sampler must classify supported KSEA and KPDX prepared runways without making unsupported airports look like runways.
- Off-runway samples must remain `kind: 'offRunway'`, `onRunway: false`, with the current off-runway friction scales.
- The nearest-supported-airport fallback elevation is acceptable for off-runway ground in this slice; do not claim terrain mesh collision.
- Surface sampling must remain pure and must not touch wind or air-relative velocity.
- Takeoff phase height must use the sampled/current `state.ground.groundAltFt`, not the legacy KSEA-only runway elevation constant, once runtime sampling is generic.
- `GroundState.onRunway` semantics remain prepared-runway-only.
- Keep TypeScript strict and avoid barrel exports.

---

## Task 1: Expand runway catalog with KPDX references

**Status:** Complete; `src/viewport/runwayData.ts` exports KSEA/KPDX catalogs, `SUPPORTED_RUNWAYS`, and primary/opposite runway lookup for supported airports.

**Objective:** Add KPDX runways to the static runway catalog without changing KSEA behavior.

**Files:**

- Modify: `src/viewport/runwayData.ts`
- Test: `src/viewport/__tests__/runwayData.test.ts` (create if missing)

**Step 1: Write failing tests**

Create or update `src/viewport/__tests__/runwayData.test.ts` with tests that assert:

- `KSEA_RUNWAYS` still has 3 runways and includes 16L.
- `KPDX_RUNWAYS` has 3 runways: `10L`, `10R`, and `03`.
- `SUPPORTED_RUNWAYS` includes both KSEA and KPDX references.
- `runwayByAirportAndId('KPDX', '10R')` returns the KPDX 10R runway.
- `runwayByAirportAndId('KPDX', '28L')` returns the same physical runway as 10R by opposite ID lookup.
- `runwayByAirportAndId('KSEA', '16L')` still returns the existing KSEA runway.

**Step 2: Verify RED**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/viewport/__tests__/runwayData.test.ts
```

Expected: FAIL because KPDX exports/opposite-ID lookup do not exist yet.

**Step 3: Implement catalog changes**

In `src/viewport/runwayData.ts`:

- Change `RunwayReference.airport` from literal `'KSEA'` to a reusable `SupportedAirportId` union or `string` if the existing code needs flexibility.
- Add `KPDX_RUNWAY_10L`, `KPDX_RUNWAY_10R`, and `KPDX_RUNWAY_03` constants.
- Add `KPDX_RUNWAYS` and `SUPPORTED_RUNWAYS` exports.
- Update `runwayByAirportAndId()` to search `SUPPORTED_RUNWAYS` and match either `id` or `oppositeId`.
- Preserve `KSEA_RUNWAYS` export and current KSEA constants exactly.

Suggested KPDX constants:

```ts
const FT_TO_M = 0.3048;

export const KPDX_RUNWAY_10L: RunwayReference = {
  airport: 'KPDX',
  id: '10L',
  oppositeId: '28R',
  label: '10L/28R',
  start: { lat: 45.596537, lon: -122.600062, altFt: 29 },
  headingDeg: 119,
  elevationFt: 29,
  lengthM: 9825 * FT_TO_M,
  widthM: 150 * FT_TO_M,
};
```

Use similar values for 10R and 03 from the data-source section.

**Step 4: Verify GREEN**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/viewport/__tests__/runwayData.test.ts
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx tsc -b --pretty false
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/viewport/runwayData.ts src/viewport/__tests__/runwayData.test.ts
git commit -m "feat: add kpdx runway references"
```

---

## Task 2: Generalize surface sampler beyond KSEA

**Status:** Complete; `sampleSupportedAirportSurface()` samples `SUPPORTED_RUNWAYS`, `GroundSurfaceSample.airport` identifies KSEA/KPDX samples when known, and `sampleKseaSurface()` remains KSEA-only.

**Objective:** Add a pure generic surface sampler that supports KSEA and KPDX while preserving `sampleKseaSurface()` behavior.

**Files:**

- Modify: `src/sim/runwaySurface.ts`
- Test: `src/sim/__tests__/runwaySurface.test.ts`

**Step 1: Write failing tests**

Extend `src/sim/__tests__/runwaySurface.test.ts` to cover:

- `sampleSupportedAirportSurface(geoPositionForRunwayStart(KPDX_RUNWAY_10R))` returns `kind: 'runway'`, `onRunway: true`, `airport: 'KPDX'`, `runwayId: '10R'`, and KPDX ground elevation.
- A KPDX point laterally outside runway width returns `offRunway`, `onRunway: false`, KPDX fallback elevation, and off-runway friction scales.
- `sampleKseaSurface(geoPositionForRunwayStart(KPDX_RUNWAY_10R))` returns `offRunway` to prove the compatibility wrapper remains KSEA-only.
- `sampleSupportedAirportSurface()` returns the same prepared-runway classification fields as `sampleKseaSurface()` for a KSEA 16L threshold position.
- Existing KSEA tests still pass unchanged.

Do not pass `runway.start` directly to sampler functions because `RunwayGeoPoint` uses `altFt` while `GeoPosition` requires `alt`. Use a helper in the test file:

```ts
function geoPositionForRunwayStart(runway: RunwayReference): GeoPosition {
  return { lat: runway.start.lat, lon: runway.start.lon, alt: runway.elevationFt };
}
```

**Step 2: Verify RED**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/__tests__/runwaySurface.test.ts
```

Expected: FAIL because generic sampler and airport metadata do not exist yet.

**Step 3: Implement generic sampler**

In `src/sim/runwaySurface.ts`:

- Import `SUPPORTED_RUNWAYS` and keep `KSEA_RUNWAYS` for wrapper behavior.
- Add optional `airport?: string` to `GroundSurfaceSample`.
- Extract an internal pure helper such as `sampleRunwaySurface(position, runways, fallbackElevationFt)`.
- Export `sampleSupportedAirportSurface(position: GeoPosition): GroundSurfaceSample` that samples all supported runways and chooses the matching rectangle.
- Preserve `sampleKseaSurface(position)` by calling the internal helper with KSEA runways only.
- For off-runway fallback, use the elevation of the nearest supported runway airport/reference instead of always 432 ft. Simple nearest-start-distance is enough for this slice.

**Step 4: Verify GREEN**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/__tests__/runwaySurface.test.ts src/viewport/__tests__/runwayData.test.ts
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx tsc -b --pretty false
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/sim/runwaySurface.ts src/sim/__tests__/runwaySurface.test.ts
git commit -m "feat: generalize runway surface sampler"
```

---

## Task 3: Wire generic sampler into integration and scenario validation

**Status:** Complete; `integrate()` uses `sampleSupportedAirportSurface()` for near-ground/liftoff checks and post-integration contact, and takeoff phase height uses current `state.ground.groundAltFt`.

**Objective:** Ensure runtime ground contact uses the generic supported-airport sampler, and scenario initialization can validate non-KSEA runway starts.

**Files:**

- Modify: `src/sim/physics/integrate.ts`
- Modify: `src/sim/scenarios.ts` if validation/start alignment needs supported runway lookup
- Test: `src/sim/physics/__tests__/integrate.test.ts`
- Test: `src/sim/__tests__/scenarios.test.ts` if scenario validation changes

**Step 1: Write failing tests**

Add tests that prove:

- A gear-down aircraft placed at `geoPositionForRunwayStart(KPDX_RUNWAY_10R)` remains in `ground.onRunway === true` after one integration step.
- A gear-down aircraft placed near KPDX but laterally outside runway width remains in explicit gear contact with `ground.onRunway === false` and `ground.groundAltFt` near KPDX elevation.
- A TAKEOFF-phase aircraft above a KPDX runway transitions toward CLIMB using KPDX/current ground elevation rather than the KSEA-only constant.
- Existing KSEA integration tests still pass.

As in Task 2, use a helper to convert `RunwayReference.start` to `{ lat, lon, alt }` before passing it into state positions or sampler calls.

If scenario validation is updated, add a focused scenario test for any helper used to align/check supported runway starts. Do not add a new player scenario unless it is needed for testability.

**Step 2: Verify RED**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/physics/__tests__/integrate.test.ts src/sim/__tests__/scenarios.test.ts
```

Expected: FAIL because `integrate()` still calls the KSEA-only sampler.

**Step 3: Implement runtime wiring**

In `src/sim/physics/integrate.ts`:

- Import `sampleSupportedAirportSurface` instead of `sampleKseaSurface`.
- Use the generic sample for both pre-integration near-ground estimate and post-integration ground-contact solve.
- Update `updateTakeoffPhase()` so height above runway is based on `state.ground.groundAltFt` (or the current sampled surface ground altitude if the helper signature is changed), not `KSEA_RUNWAY_ALT_FT`.
- Remove the now-unused `KSEA_RUNWAY_ALT_FT` import from `integrate.ts` if no longer needed there.
- Preserve comments: this is still supported-airport runway/off-runway rectangle sampling, not terrain mesh collision.

Only modify `src/sim/scenarios.ts` if tests reveal scenario validation needs supported runway lookup; keep existing KSEA scenarios stable.

**Step 4: Verify GREEN**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/physics/__tests__/integrate.test.ts src/sim/__tests__/runwaySurface.test.ts src/viewport/__tests__/runwayData.test.ts src/sim/__tests__/scenarios.test.ts
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx tsc -b --pretty false
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/sim/physics/integrate.ts src/sim/physics/__tests__/integrate.test.ts src/sim/scenarios.ts src/sim/__tests__/scenarios.test.ts
git commit -m "feat: sample supported airport surfaces in physics"
```

If `src/sim/scenarios.ts` or `src/sim/__tests__/scenarios.test.ts` are unchanged, omit them from `git add`.

---

## Task 4: Update docs and roadmap status

**Status:** Complete; current-source docs and roadmap now describe KSEA/KPDX supported-airport runway sampling without claiming terrain mesh collision or arbitrary airport support.

**Objective:** Sync current-state docs after KPDX runway surface coverage is implemented.

**Files:**

- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/physics-invariants.md`
- Modify: `docs/roadmap.md`
- Modify: `docs/plans/README.md`
- Modify: `docs/plans/2026-05-27-rfs-multi-airport-surface-coverage.md`
- Modify: `docs/plans/2026-05-27-rfs-advanced-gear-tire-ground-handling.md` if its current-status baseline still describes non-KSEA surface coverage as pending.

**Step 1: Update docs**

Docs must state:

- Supported-airport runway surface sampling now covers KSEA and KPDX prepared runway rectangles.
- `sampleKseaSurface()` remains a KSEA-only compatibility wrapper.
- Runtime integration uses the generic supported-airport sampler.
- Takeoff phase height uses the sampled/current `state.ground.groundAltFt` instead of the legacy KSEA-only constant, so future supported-airport departures do not require KSEA elevation.
- Off-runway fallback is still a simplified nearest-supported-airport elevation, not terrain mesh collision.
- Remaining P1 scope should no longer say only KSEA runway/off-runway rectangle coverage; it should say broader terrain mesh collision and more airports beyond KSEA/KPDX remain.

**Step 2: Verify docs**

Run:

```bash
git diff --check
```

Search for stale exact phrases and update if they contradict current state:

- `KSEA runway/off-runway rectangle model`
- `sampleKseaSurface(state.position)`
- `KSEA prepared-runway/off-runway surface sampling`

Some historical plan files may retain old wording if clearly historical. Current-status files, README, architecture, invariants, roadmap, and plan index must not contradict the new KSEA/KPDX support.

**Step 3: Commit**

```bash
git add README.md docs/architecture.md docs/physics-invariants.md docs/roadmap.md docs/plans/README.md docs/plans/2026-05-27-rfs-multi-airport-surface-coverage.md docs/plans/2026-05-27-rfs-advanced-gear-tire-ground-handling.md
git commit -m "docs: document multi-airport runway surfaces"
```

---

## Final verification and deploy

After all tasks and two-stage reviews pass:

1. Run parent-side final checks:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test:visual
```

2. Dispatch final integration audit.
3. Push to `master`.
4. Wait for GitHub Actions actual run to complete with `status=completed` and `conclusion=success`.
5. Verify live endpoint:

```bash
curl -fsSI https://fly.reidar.tech/
```

Report success only after CI is green and the live endpoint returns HTTP 200.
