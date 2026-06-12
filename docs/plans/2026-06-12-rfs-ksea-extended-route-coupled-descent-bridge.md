# RFS KSEA Extended Route-Coupled Descent Bridge Browser Proof Plan

> **For Hermes:** Use `subagent-driven-development` for implementation and review, but keep implementation/docs tasks serialized because they touch the same Playwright route helper/spec/docs. This is not a GPT-5.5 swarm candidate: there are fewer than three independent implementation tracks, the edits are tightly coupled in `e2e/helpers/rfsRoute.ts` and `e2e/rfs-route.spec.ts`, and parallel commits in the main worktree would race.

## Goal

Reduce the current seeded gap between the KSEA final-route configured approach proof and the KPDX landing bridge by adding an extended browser-backed route-coupled descent segment before manual handoff.

The proof should connect these scoped phases in one browser store session:

`KSEA final BTG→KPDX configured approach → extended route-coupled descent/approach with CMD_A + LNAV + SPEED still backed and vertical OFF → truthful manual AP/FMA/thrust OFF handoff → KPDX 10L manual short-final landing → braking rollout → reset cleanup`

This is an incremental bridge proof. It is not full-route/full-flight, not VNAV, and not route-coupled landing.

## Scope boundary / non-claims

This slice may claim only:

- a single browser store session keeps the KSEA→KPDX route loaded on active leg `BTG→KPDX`;
- before handoff, the aircraft continues beyond the current configured-approach snapshot for a longer route-coupled descent/approach segment;
- throughout that extended pre-handoff segment, raw/display AP remains `CMD_A`, lateral remains `LNAV`, thrust remains `SPEED`, vertical remains `OFF`, and no landing/weight-on-wheels occurs;
- route distance-to-KPDX and altitude/AGL decrease by meaningful minimums after the configured-approach snapshot;
- manual handoff then clears AP/FMA/thrust and AP command ownership;
- the existing KPDX 10L manual short-final landing/rollout/reset bridge still happens through real `tick()`, `setInput()`, and `reset()` outcomes.

This slice must not claim:

- full-flight proof;
- full-route proof;
- continuous KSEA departure-to-KPDX landing proof;
- route-coupled KPDX landing proof;
- VNAV proof;
- ILS/localizer/glideslope proof;
- broad manual playability;
- CI/deploy/live proof.

## Current code facts

- Existing helper: `e2e/helpers/rfsRoute.ts`
  - `KSEA_FINAL_ROUTE_CONFIGURED_APPROACH_PROOF` seeds final leg `BTG→KPDX` near `45.69, -122.596`, airborne at 3,500 ft, active leg index `2`, `CMD_A + LNAV + SPEED`, and vertical FMA `OFF`.
  - `runConfiguredApproach()` currently returns when the route is at least `0.5 nm` closer and `100 ft` lower, gear/flaps are configured, and guidance is `approach`.
  - `runManualHandoff()` clears AP/FMA/thrust truth and AP commands after pilot elevator input.
  - `runLandingBridge()` currently seeds only the manual KPDX 10L short-final aircraft position after handoff, then proves touchdown/rollout/reset through real ticks and inputs.
- Existing bridge test: `e2e/rfs-route.spec.ts` test name `KSEA final route handoff can bridge to KPDX landing without hidden automation`.
- Helper files outside tsconfig require explicit TypeScript 6 `--ignoreConfig` typecheck.

## Acceptance test

Add a new Playwright test under `e2e/rfs-route.spec.ts` importing a new helper from `e2e/helpers/rfsRoute.ts`, likely:

```ts
flyKseaFinalRouteExtendedDescentToKpdxLandingAndReset(page)
```

The test must prove:

1. `configuredApproach` snapshot still matches the existing configured approach boundary:
   - `routeName === 'KSEA→KPDX'`
   - `activeLegIndex === 2`
   - `fromIdent === 'BTG'`
   - `nextWaypointIdent === 'KPDX'`
   - `lnavAvailable === true`
   - raw/display AP `CMD_A`
   - raw/display lateral `LNAV`
   - raw/display thrust `SPEED`
   - raw/display vertical `OFF`
   - gear down/flaps configured, airborne, approach guidance.
2. New `extendedDescent` snapshot:
   - still `routeName === 'KSEA→KPDX'`, active leg `2`, `BTG→KPDX`, LNAV available;
   - raw/display AP `CMD_A`, lateral `LNAV`, thrust `SPEED`, vertical `OFF`;
   - `distanceToNextNm <= configuredApproach.distanceToNextNm - 1.0`;
   - `altitudeFt <= configuredApproach.altitudeFt - 300`;
   - `aglFt <= configuredApproach.aglFt - 300`;
   - gear down/flaps >= 25, guidance `approach`, airborne, not landed.
3. Pre-handoff samples from `configuredApproach` through `extendedDescent`:
   - all keep route loaded on `BTG→KPDX`;
   - all keep raw/display `CMD_A + LNAV + SPEED`, vertical `OFF`;
   - all remain airborne and not `LANDED`;
   - `distanceToNextNm` is monotonically non-increasing within a small tolerance, e.g. `<= previous + 0.05`.
4. `manualHandoff` snapshot:
   - route still loaded on `BTG→KPDX`;
   - raw/display AP/lateral/vertical/thrust all `OFF`;
   - `apCommandCount === 0`;
   - pilot/effective elevator, aileron, throttle1, throttle2 match;
   - still airborne and not landed.
5. Landing bridge snapshots:
   - active sample tail is exactly `extendedDescent → manualHandoff → landingApproach → touchdown → rollout`;
   - active samples contain no reset-only `NO ROUTE` sample and do not contain `reset`;
   - `landingApproach`, `touchdown`, `rollout`, and `reset` keep the same assertions as the existing KSEA-to-KPDX landing bridge test, including KPDX 10L runway evidence, bounded touchdown sink rate, rollout speed reduction, AP/FMA/thrust OFF, and reset cleanup.

## Implementation tasks

### Task 1 — Browser proof helper + Playwright spec

Files:

- Modify: `e2e/helpers/rfsRoute.ts`
- Modify: `e2e/rfs-route.spec.ts`

Steps:

1. TDD RED: add the new test/import first and run:

   ```bash
   source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
   CI=1 npx playwright test e2e/rfs-route.spec.ts --project=chromium --grep "KSEA final route extended descent can bridge to KPDX landing" --reporter=list
   ```

   Expected RED: missing helper export or missing `extendedDescent` result, not an unrelated app-load failure.

2. Extend `e2e/helpers/rfsRoute.ts` minimally:
   - add an interface such as `RouteExtendedLandingBridgeProofResult` with:
     - `configuredApproach: RouteProofSnapshot`
     - `extendedDescent: RouteProofSnapshot`
     - `manualHandoff: RouteProofSnapshot`
     - existing landing bridge snapshots: `landingApproach`, `touchdown`, `rollout`, `reset`
     - `samples: RouteProofSnapshot[]`
   - add setup support for an extended route-coupled descent segment after `runConfiguredApproach()` and before `runManualHandoff()`.
   - implement an internal runner that continues real `tick()` calls with the existing configured approach controls and AP state until the extended criteria are met:
     - route remains `KSEA→KPDX` active leg `2` / `BTG→KPDX`;
     - raw/display `CMD_A + LNAV + SPEED`, vertical `OFF`;
     - distance decreases by at least `1.0 nm` from configured approach;
     - altitude and AGL decrease by at least `300 ft` from configured approach;
     - gear/flaps configured, guidance `approach`, airborne, not landed.
   - keep sampling real `useSimStore.getState().routeStatus`, `deriveDisplayFmaTruth()`, and `computeDerived()`; do not fabricate route/FMA truth.
   - if the exact thresholds above are too aggressive for current deterministic physics, tune the setup first by changing frame count/control inputs, not by weakening truth assertions. If thresholds must change, keep them meaningful and document the reason in the subagent summary.
   - do not alter existing public helper behavior used by current route tests.

3. Add an exported helper:

   ```ts
   export async function flyKseaFinalRouteExtendedDescentToKpdxLandingAndReset(page: Page): Promise<RouteExtendedLandingBridgeProofResult>
   ```

4. GREEN: run the targeted new test until it passes.

5. Run helper typecheck:

   ```bash
   source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
   npx tsc --ignoreConfig --noEmit --target ES2022 --module ESNext --moduleResolution bundler --strict --skipLibCheck e2e/helpers/rfsRoute.ts
   ```

6. Run full route spec:

   ```bash
   source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
   CI=1 npx playwright test e2e/rfs-route.spec.ts --project=chromium --reporter=list
   ```

7. Commit:

   ```bash
   git add e2e/helpers/rfsRoute.ts e2e/rfs-route.spec.ts
   git commit -m "test: extend route-coupled descent bridge proof"
   ```

### Task 2 — Honest docs update

Files:

- Modify: `docs/architecture.md`
- Modify: `docs/roadmap.md`
- Modify: `docs/plans/README.md`

Steps:

1. Update the browser-proof paragraph in `docs/architecture.md` to mention the extended pre-handoff route-coupled descent bridge and explicitly preserve non-claims.
2. Update `docs/roadmap.md` completed baseline and P2 remaining-scope language to include the extended route-coupled descent bridge, while keeping continuous route-coupled descent/approach/landing, VNAV, full-route/full-flight, CI/deploy/live proof as remaining work.
3. Add this plan to `docs/plans/README.md` current source-of-truth list.
4. Run:

   ```bash
   git diff --check docs/architecture.md docs/roadmap.md docs/plans/README.md
   ```

5. Commit:

   ```bash
   git add docs/architecture.md docs/roadmap.md docs/plans/README.md
   git commit -m "docs: record extended route-coupled descent bridge boundary"
   ```

## Review plan

After Task 1:

- Spec review checks all acceptance criteria above, especially that `extendedDescent` is before manual handoff and still backed by raw/display `CMD_A + LNAV + SPEED` with vertical `OFF`.
- Code-quality review checks no false positives, no weakened current bridge assertions, no fabricated route/FMA values, stable sample ordering, and no widened claims.

After Task 2:

- Spec review checks docs accurately describe the proof boundary and preserve non-claims.
- Final integration review checks the whole slice for consistency.

## Final verification

Run from `/Users/reidar/Projectos/RFS`:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npx tsc --ignoreConfig --noEmit --target ES2022 --module ESNext --moduleResolution bundler --strict --skipLibCheck e2e/helpers/rfsRoute.ts
CI=1 npx playwright test e2e/rfs-route.spec.ts --project=chromium --reporter=list
npm run check
CI=1 npm run test:visual
git diff --check <slice-base>..HEAD
```

If the full visual gate first fails while opening the app with the known transient Vite/Cesium `ClassificationPipelineStage` error, inspect error context and port state, rerun cleanly, and only claim the browser gate after a real pass.
