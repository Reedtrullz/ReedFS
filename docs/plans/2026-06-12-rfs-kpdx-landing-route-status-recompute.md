# RFS KSEA-to-KPDX Landing Bridge Route-Status Recompute Plan

> **For Hermes:** Use `subagent-driven-development` for the implementation/review loop. Do not use the GPT-5.5 swarm: this is a tightly coupled helper/spec/docs proof-tightening slice touching the same route bridge files, so ordinary serialized subagents avoid git/file overlap.

> **Status note, 2026-06-15:** This plan originally tightened a KPDX 10L short-final seed. The current KSEA→KPDX route/landing proof is aligned on KPDX 10R; any remaining 10L wording in this dated plan is historical context, not a current-state claim.

## Goal

Tighten the KSEA-to-KPDX landing bridge proof so the manual KPDX short-final seed cannot carry stale `routeStatus` values from the earlier BTG→KPDX descent segment.

The existing bridge correctly keeps `flightPlan` and `activeLegIndex` loaded through manual handoff, short-final landing, rollout, and reset, but a probe showed the `landingApproach.distanceToNextNm` can equal the pre-seed manual-handoff distance (`~4.5 NM`) even after the aircraft is repositioned to KPDX 10L short final. That means the proof currently shows route identity remains loaded, but it does not prove route status was recomputed for the seeded KPDX short-final aircraft position.

This slice should make that explicit: after the KPDX 10L manual short-final seed, the route snapshot must report a near-destination distance, not the stale pre-seed BTG→KPDX distance.

## Scope boundary / non-claims

This slice may claim only:

- the KSEA→KPDX route remains loaded through the manual landing bridge;
- after the KPDX 10L manual short-final seed, route status is recomputed for the new aircraft position;
- landing approach/touchdown/rollout snapshots report near-destination KPDX distance instead of stale pre-seed distance;
- AP/FMA/thrust truth stays OFF and AP commands stay empty after handoff;
- reset cleanup still clears route/AP/FMA state.

This slice must not claim:

- full-flight proof;
- full-route proof;
- continuous KSEA descent-to-landing proof;
- route-coupled KPDX landing proof;
- VNAV proof;
- ILS/localizer/glideslope proof;
- CI/deploy/live proof.

## Current evidence / bug shape

A temporary probe at HEAD `f5a23a0` returned:

```text
manualHandoff.distanceToNextNm ~= 4.504
landingApproach.distanceToNextNm ~= 4.504
```

That was after `runLandingBridge()` repositioned the aircraft to KPDX 10L short final. Expected behavior is that `landingApproach.distanceToNextNm` is near KPDX (less than 1.0 NM for this seeded runway position) and materially lower than the manual-handoff distance.

Likely root cause:

- `runLandingBridge()` in `e2e/helpers/rfsRoute.ts` uses `useSimStore.setState(...)` to reposition aircraft, controls, AP state, and timing.
- That direct store seed updates `aircraft` but does not update `routeStatus` in the same state patch.
- The first `landingBridgeSnapshot()` can therefore see stale route status even though the aircraft position has changed.

## Acceptance test

Update existing Playwright route bridge specs in `e2e/rfs-route.spec.ts` to fail before the fix:

1. Existing test `KSEA final route handoff can bridge to KPDX landing without hidden automation` must assert:
   - `result.landingApproach.distanceToNextNm < 1.0`;
   - `result.landingApproach.distanceToNextNm <= result.manualHandoff.distanceToNextNm - 3.0`;
   - `result.touchdown.distanceToNextNm < 1.0`;
   - `result.rollout.distanceToNextNm < 1.0`.
2. Existing test `KSEA final route extended descent can bridge to KPDX landing without hidden automation` must assert the same relative/near-destination route-distance checks.
3. Keep all existing route identity, runway, touchdown, rollout, AP/FMA/thrust OFF, sample-order, reset-separation, and reset-cleanup assertions intact.
4. RED must fail on stale route distance, not an app-load or syntax error.

## Implementation task — stale landing-route-status regression + fix

Files:

- Modify: `e2e/helpers/rfsRoute.ts`
- Modify: `e2e/rfs-route.spec.ts`

Steps:

1. TDD RED: add the assertions above first and run:

   ```bash
   source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
   CI=1 npx playwright test e2e/rfs-route.spec.ts --project=chromium --grep "KSEA final route (handoff|extended descent) can bridge to KPDX landing" --reporter=list
   ```

   Expected RED: at least one assertion fails because `landingApproach.distanceToNextNm` is still the stale pre-landing value (`~4.5 NM` or `~5.5 NM`) instead of `< 1.0`.

2. Minimal fix in `e2e/helpers/rfsRoute.ts`:
   - Import `computeRouteStatus` from `/src/sim/systems/navigation.ts` inside the browser `page.evaluate()` block.
   - In `runLandingBridge()`, when seeding the KPDX 10L short-final aircraft with `useSimStore.setState((state) => { ... })`, compute a fresh route status from the seeded `aircraft`, existing `state.flightPlan`, and active leg `2`.
   - Return that fresh `routeStatus` and matching `activeLegIndex` in the same `setState` patch.
   - Keep `flightPlan` loaded and `apState` null/OFF; do not reset before landing.
   - Do not fabricate route fields in the returned proof snapshots. The snapshots must still read `state.routeStatus` from the real store.
   - Add or keep an internal landing-bridge guard so stale `distanceToNextNm >= 1.0` fails fast when seeding the KPDX landing bridge.

3. GREEN: rerun the targeted grep command until both landing bridge tests pass.

4. Run helper typecheck:

   ```bash
   source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
   npx tsc --ignoreConfig --noEmit --target ES2022 --module ESNext --moduleResolution bundler --strict --skipLibCheck e2e/helpers/rfsRoute.ts
   ```

5. Run full route spec:

   ```bash
   source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
   CI=1 npx playwright test e2e/rfs-route.spec.ts --project=chromium --reporter=list
   ```

6. Run diff hygiene for touched files:

   ```bash
   git diff --check -- e2e/helpers/rfsRoute.ts e2e/rfs-route.spec.ts
   ```

7. Commit:

   ```bash
   git add e2e/helpers/rfsRoute.ts e2e/rfs-route.spec.ts
   git commit -m "test: recompute route status for KPDX landing bridge"
   ```

## Docs task — honest proof-boundary update

Files:

- Modify: `docs/architecture.md`
- Modify: `docs/roadmap.md`
- Modify: `docs/plans/README.md`

Steps:

1. Update `docs/architecture.md` browser proof wording to mention that the KSEA-to-KPDX landing bridge now proves the KPDX short-final landing snapshots use recomputed near-destination route status rather than stale pre-seed route distance.
2. Update `docs/roadmap.md` completed baseline / P2 wording similarly, while preserving remaining work: full-route/full-flight, continuous route-coupled descent/approach/landing, route-coupled KPDX landing, VNAV, CI/deploy/live proof.
3. Add this plan to `docs/plans/README.md` current source-of-truth list as a completed/current proof-tightening record once implementation is done.
4. Run:

   ```bash
   git diff --check docs/architecture.md docs/roadmap.md docs/plans/README.md
   ```

5. Commit:

   ```bash
   git add docs/architecture.md docs/roadmap.md docs/plans/README.md
   git commit -m "docs: record KPDX landing route-status recompute proof"
   ```

## Review plan

After implementation:

- Spec review checks the acceptance tests and helper behavior prove recomputed near-destination route status after the KPDX short-final seed.
- Code-quality review checks the fix is minimal, does not fabricate route truth, preserves existing bridge semantics, and does not weaken AP/FMA/thrust OFF/sample-order/reset assertions.
- Docs review checks wording stays honest and non-claims remain explicit.

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

If `CI=1 npm run test:visual` first fails with a known transient app-load syntax/error-boundary issue, inspect `test-results/**/error-context.md` and process/port state, rerun cleanly, and only claim browser success after a real pass.
