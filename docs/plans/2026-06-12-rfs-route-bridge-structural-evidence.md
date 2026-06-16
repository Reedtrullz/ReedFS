# RFS Route Bridge Structural Evidence Cleanup Plan

> **For Hermes:** This is a small follow-up from the KSEA-to-KPDX landing bridge review. Use `subagent-driven-development` if available, but do not escalate to the GPT-5.5 swarm: this is one tightly coupled helper/spec cleanup in the main worktree, not three independent tracks.

> **Status note, 2026-06-15:** This plan originally described a KPDX 10L manual short-final bridge. The current KSEA→KPDX route/landing proof is aligned on KPDX 10R; any remaining 10L wording in this dated plan is historical context, not a current-state claim.

## Goal

Remove the tautological `sameStoreSession: true` proof field from the KSEA-to-KPDX landing bridge helper and replace it with stronger structural evidence in the Playwright spec.

The bridge proof should continue to show:

`KSEA final route configured approach → manual AP/FMA/thrust OFF handoff → KPDX 10L manual short-final landing → braking rollout → reset cleanup`

But same-store/no-reset-before-landing should be proven by control flow and sampled state order, not by asserting a boolean that the helper hardcodes.

## Scope boundary / non-claims

This cleanup may claim only that the existing KSEA-to-KPDX bridge proof no longer relies on a tautological same-store boolean.

It must not claim:

- full-flight proof;
- full-route proof;
- continuous KSEA→KPDX flight from departure;
- continuous route-coupled descent/approach/landing;
- VNAV proof;
- route-coupled KPDX landing proof;
- CI/deploy/live proof.

## Acceptance test

Update the existing Playwright bridge test in `e2e/rfs-route.spec.ts` so it proves same-store/no-reset-before-landing structurally:

1. Remove any assertion of `result.landingApproach.sameStoreSession`.
2. Assert the active-route sample tail is ordered exactly:
   - `manualHandoff`
   - `landingApproach`
   - `touchdown`
   - `rollout`
3. Assert active samples do not contain reset cleanup state:
   - no sample route name is `NO ROUTE`;
   - the reset snapshot is not contained in `result.samples`.
4. Keep the existing route/AP/FMA/thrust/surface/touchdown/rollout/reset assertions.
5. Remove the `sameStoreSession` field from `RouteLandingBridgeSnapshot` and from `landingBridgeSnapshot()` in `e2e/helpers/rfsRoute.ts`.

## Implementation task

Files:

- `e2e/helpers/rfsRoute.ts`
- `e2e/rfs-route.spec.ts`

Steps:

1. RED: remove only the `sameStoreSession` field from `RouteLandingBridgeSnapshot` / `landingBridgeSnapshot()` and run:

   ```bash
   source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
   CI=1 npx playwright test e2e/rfs-route.spec.ts --project=chromium --grep "KSEA final route handoff can bridge to KPDX landing" --reporter=list
   ```

   Expected: TypeScript/test failure because the spec still references `sameStoreSession`.

2. GREEN: replace the `sameStoreSession` assertion with structural assertions:

   ```ts
   expect(result.samples.slice(-4), routeDebug).toEqual([
     result.manualHandoff,
     result.landingApproach,
     result.touchdown,
     result.rollout,
   ]);
   expect(result.samples.some((sample) => sample.routeName === 'NO ROUTE'), routeDebug).toBe(false);
   expect(result.samples, routeDebug).not.toContainEqual(result.reset);
   ```

   If TypeScript needs a small cast for comparing reset against route samples, keep it local to the assertion and do not weaken the runtime check.

3. Run helper typecheck:

   ```bash
   source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
   npx tsc --ignoreConfig --noEmit --target ES2022 --module ESNext --moduleResolution bundler --strict --skipLibCheck e2e/helpers/rfsRoute.ts
   ```

4. Run full route spec:

   ```bash
   source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
   CI=1 npx playwright test e2e/rfs-route.spec.ts --project=chromium --reporter=list
   ```

5. Commit:

   ```bash
   git add e2e/helpers/rfsRoute.ts e2e/rfs-route.spec.ts
   git commit -m "test: prove route bridge structure without tautological flag"
   ```

## Review plan

Because this is a review-found proof-quality cleanup, reviews must specifically check:

- the hardcoded `sameStoreSession` field is gone everywhere;
- the new assertion proves sample ordering and reset separation;
- route/AP/FMA/touchdown/rollout/reset assertions remain intact;
- no proof boundary was broadened.

## Final verification

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npx tsc --ignoreConfig --noEmit --target ES2022 --module ESNext --moduleResolution bundler --strict --skipLibCheck e2e/helpers/rfsRoute.ts
CI=1 npx playwright test e2e/rfs-route.spec.ts --project=chromium --reporter=list
npm run check
CI=1 npm run test:visual
git diff --check HEAD~1..HEAD
```

If the visual gate hits the known transient Vite/Cesium `ClassificationPipelineStage` app-open failure, inspect error context and port state, rerun cleanly, and only claim the browser gate after a real pass.
