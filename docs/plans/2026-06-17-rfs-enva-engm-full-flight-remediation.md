# RFS ENVA→ENGM Full-Flight Remediation Plan — 2026-06-17

## Goal

Make the requested ENVA→ENGM proof truthful and executable in the browser with visible controls only: ENVA takeoff/route/climb smoke, reset into an ENGM destination short-final fixture, ENGM 19R touchdown/rollout/stop/reset, and clear proof-boundary reporting.

This plan does **not** claim certified/source-backed 737 realism, official ENGM procedure data, VNAV, live deployment, or exact-SHA CI until those are separately verified.

## Issue log from browser/source analysis

1. **ENGM was not a supported runway/surface destination.**
   - Evidence: `SupportedAirport` only included `ENVA | KSEA | KPDX`; `SUPPORTED_RUNWAYS` omitted ENGM, so a landing at Oslo/Gardermoen could not be classified as prepared runway terrain.
   - Impact: A complete ENVA→ENGM landing proof would have been false; the route ended at a generic airport coordinate with no runway threshold.
   - Fix: Add synthetic ENGM 19R runway reference, approach IF/FAF/threshold fixture, and surface tests.

2. **The ENVA→ENGM route ended at a generic `ENGM` en-route waypoint.**
   - Evidence: `createEnvaEngmFlight()` route was `ENVA ENVA09_CLB RFS_DOVRE RFS_MJOSA ENGM`; destination constraint was `AT_OR_ABOVE 10000`, not runway/approach semantics.
   - Impact: The route could support climb/en-route guidance, but not truthful approach/landing handoff evidence.
   - Fix: Replace the terminal generic waypoint with `ENGM19R_IF`, `ENGM19R_FAF`, and `ENGM19R_RWY` synthetic approach/threshold waypoints.

3. **There was no ENGM short-final landing scenario.**
   - Evidence: Only KPDX had a short-final scenario tied to a destination runway/approach fixture.
   - Impact: A practical browser proof could not bridge route work to an ENGM landing/rollout/reset without direct state seeding.
   - Fix: Add `engm-19r-short-final` with visible-control landing setup, ENGM weather metadata, and approach/runway linkage.

4. **The slow full-flight browser spec still proved KSEA→KPDX, not ENVA→ENGM.**
   - Evidence: `e2e/rfs-full-flight-blackbox.spec.ts` selected KSEA and KPDX short-final helpers.
   - Impact: Passing the old full-flight gate did not satisfy the user’s ENVA→ENGM request.
   - Fix: Convert the slow full-flight spec to load default ENVA→ENGM, verify ENVA route/climb smoke, then select ENGM 19R short-final for landing rollout/reset.

5. **Route-load E2E helpers were hardcoded to KSEA→KPDX `LEG 1/5`.**
   - Evidence: `loadSelectedRouteThroughVisibleControls()` asserted `KSEA→KPDX`, `LEG 1/5`, and `KSEA → OLM`.
   - Impact: ENVA→ENGM proof could not use the shared helper despite being product-visible and black-box safe.
   - Fix: Parameterize route-load expectations and add an ENVA→ENGM helper expecting `ENVA→ENGM`, `LEG 1/6`, `ENVA → ENVA09_CLB`.

6. **UI copy underreported ENVA→ENGM as en-route-only after approach waypoints were added.**
   - Evidence: route-load status used `synthetic en-route fixes` for non-KPDX destinations; `RouteStatus` only flagged KSEA→KPDX as a synthetic approach route.
   - Impact: The UI contradicted the new ENGM 19R approach/threshold route semantics.
   - Fix: Treat ENGM like KPDX for synthetic approach warning text in route-load result and RouteStatus readback.

7. **Fast visible route sequencing made a brittle exact active-leg assertion fail.**
   - Evidence: At 16x, post-cleanup ENVA route status had already advanced to leg 2 before the readback. The route status still showed a valid ENVA→ENGM route with 6 legs.
   - Impact: The proof should verify a valid active leg and route availability, not freeze a timing-sensitive leg index after a short first leg.
   - Fix: Assert non-null active leg `>= 1`, fixed active leg count `6`, and route availability/no LNAV-unavailable message.

8. **Default E2E mouse-rotate helper waited too long before holding the visible rotate control.**
   - Evidence: `npm run test:e2e` produced `test-results/rfs-blackbox-player-loop-R-2c718--and-complete-takeoff-reset-chromium/error-context.md`: the KSEA mouse-visible test advanced to a later stopped/landing state, then waited for the phase-gated `Takeoff setup` `Hold Rotate` control that was no longer mounted.
   - Impact: This was not an ENVA route product failure, but it blocked the default E2E gate after the ENVA→ENGM work landed.
   - Fix: Start holding the visible mouse rotate control immediately after visible takeoff thrust is advanced, while the setup control is still mounted, instead of polling separately to 145 kt first.

## Implementation plan

1. Add ENGM 19R runway, approach fixture, and supported-surface coverage.
2. Convert ENVA→ENGM route to terminate at ENGM 19R IF/FAF/RWY waypoints.
3. Add ENGM 19R short-final scenario and register it without changing the default ENVA tutorial.
4. Parameterize visible route-load E2E helpers and add ENVA→ENGM helper/selector.
5. Convert slow full-flight browser acceptance to ENVA→ENGM route/climb plus ENGM landing rollout/reset.
6. Update user-facing route limitation/readback copy for synthetic ENGM approach data.
7. Fix the default E2E mouse-visible rotate helper so it holds the visible control before phase-gated setup UI can disappear.
8. Run targeted unit/spec checks, the ENVA→ENGM browser proof, full local gates, commit, push, and report exact evidence.

## Current implementation status

Implemented locally before final aggregate gates:

- `src/viewport/runwayData.ts` — ENGM 19R runway + synthetic approach fixture.
- `src/sim/flightPlanLoader.ts` — ENVA→ENGM route ends at `ENGM19R_IF`, `ENGM19R_FAF`, `ENGM19R_RWY`.
- `src/sim/scenarios.ts` — `ENGM 19R Short Final` scenario.
- `src/app/RfsShell.tsx` and `src/components/RouteStatus.tsx` — synthetic approach warning covers ENVA→ENGM.
- `e2e/helpers/rfsBlackbox.ts` — route-load helper is parameterized; ENGM short-final selector added; mouse rotate helper is used before long fake-clock advances can phase-gate away the setup panel.
- `e2e/rfs-full-flight-blackbox.spec.ts` — slow proof converted to ENVA→ENGM.
- `e2e/rfs-blackbox-player-loop.spec.ts` — mouse-visible KSEA proof now starts holding visible rotate immediately after thrust advance, preventing stale/missing setup-panel locator failures.

## Final local evidence

- Targeted unit/spec slice after ENGM fixture work: `npx vitest run src/__tests__/App.test.tsx src/components/__tests__/RouteStatus.test.tsx src/viewport/__tests__/runwayData.test.ts src/sim/__tests__/runwaySurface.test.ts src/sim/__tests__/flightPlanLoader.test.ts src/sim/data/__tests__/performanceCards.test.ts` — `6 passed` files / `82 passed` tests.
- Focused ENGM/source-note slice after bundle-trim copy change: `npx vitest run src/viewport/__tests__/runwayData.test.ts src/sim/__tests__/scenarios.test.ts src/sim/data/__tests__/performanceCards.test.ts` — `3 passed` files / `37 passed` tests.
- E2E helper TypeScript + black-box guard after final E2E patches: `npx tsc --ignoreConfig --noEmit ... e2e/helpers/rfsBlackbox.ts e2e/rfs-blackbox-player-loop.spec.ts e2e/rfs-full-flight-blackbox.spec.ts && npm run check:blackbox` — pass; black-box guard scanned 4 files across 3 entrypoints.
- ENVA→ENGM browser proof: `RFS_ENVA_ENGM_FINAL=2 npm run test:e2e:full-flight` — `1 passed (2.0m)`. This opens the app, loads ENVA→ENGM, flies ENVA takeoff/positive-rate/cleanup/route-climb smoke with visible controls/readbacks, resets, selects ENGM 19R Short Final, lands/rolls out/stops/resets via visible controls.
- Aggregate local check: `npm run check` — pass: dependency guard, release-hardening checker, black-box guard, ESLint, TypeScript, `100 passed` Vitest files / `921 passed` tests, production build, and bundle budget (`app raw=324.7 KiB`).
- Visual gate: `CI=1 npm run test:visual` — `6 passed (1.0m)`; visual timing budget OK (`total 60525ms`, `max 22872ms`).
- Default E2E: `npm run test:e2e` — `28 passed (10.1m)` after fixing the mouse-visible rotate helper.

## Remaining non-claims

- This is local evidence until the commit is pushed and remote checks are verified.
- The ENVA→ENGM gate is a visible-control full-flow proof with a deliberate reset into ENGM 19R short-final for landing; it is not continuous route-coupled descent/approach/landing.
- ENGM 19R data is a synthetic training fixture for RFS proof, not official ENGM procedure data.
- No certified/source-backed 737 realism, CI success, deployment, or live endpoint claim is made by this local proof alone.
