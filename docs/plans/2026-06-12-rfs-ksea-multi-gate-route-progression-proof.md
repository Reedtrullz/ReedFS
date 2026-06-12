# RFS KSEA Multi-Gate Route Progression Browser Proof Implementation Plan

> **For Hermes:** Use subagent-driven-development for the implementation task and two-stage review. Verify subagent work in the parent session before finalizing.

**Goal:** Add a browser proof that the KSEA sample route can progress through two consecutive active-leg transitions in one browser store run while backed LNAV/FMA truth remains active.

**Architecture:** Keep production navigation code unchanged. Extend the existing `e2e/helpers/rfsRoute.ts` route-proof runner with one purpose-built multi-gate helper that seeds the real browser Zustand store once, flies through the OLM transition, then repositions the same running store near the BTG transition without resetting the flight plan, AP state, or active-leg state. This is a deterministic route-progression proof, not a full-route/full-flight proof.

**Tech Stack:** TypeScript, Playwright, Zustand browser store, existing `createKseaKpdxFlight()`, `computeDerived()`, `deriveDisplayFmaTruth()`, `eulerToQuat()`.

---

## Task 1: Add a single-store multi-gate route progression proof

**Objective:** Prove in-browser that the KSEA canned route can progress from leg 0 KSEA→OLM to leg 1 OLM→BTG and then to leg 2 BTG→KPDX in one continuous browser store session, without reloading the page or reinitializing route/AP state between transitions.

**Files:**
- Modify: `e2e/helpers/rfsRoute.ts`
- Modify: `e2e/rfs-route.spec.ts`
- Modify: `docs/architecture.md`
- Modify: `docs/roadmap.md`

**Step 1: Write failing test**

Add a fourth Playwright test in `e2e/rfs-route.spec.ts` that imports `flyKseaRouteThroughMultiGateProgression(page)` and asserts:

- initial route name is `KSEA→KPDX`
- initial active leg is `0`
- final active leg is `2`
- final `fromIdent` is `BTG`
- final `nextWaypointIdent` is `KPDX`
- the sample set contains an explicit `0 -> 1` transition
- the sample set contains an explicit `1 -> 2` transition
- active leg index is monotonic across all samples
- every sample keeps `lnavAvailable === true`
- every sample keeps `fmaLateralActive === 'LNAV'`

Do not allow a loose `samples.some(sample => sample.sequenced)` fallback to be the only proof of either transition.

**Step 2: Verify RED**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
CI=1 npx playwright test e2e/rfs-route.spec.ts --project=chromium
```

Expected: FAIL because `flyKseaRouteThroughMultiGateProgression` is not exported yet.

**Step 3: Implement helper**

In `e2e/helpers/rfsRoute.ts`:

- Preserve existing public exports and behavior:
  - `flyKseaRouteWithLnav(page)`
  - `flyKseaRouteThroughFirstSequence(page)`
  - `flyKseaRouteThroughSecondSequence(page)`
- Add `flyKseaRouteThroughMultiGateProgression(page)`.
- The helper must use one `page.evaluate()` call and one running browser store session.
- It should seed the same real store/AP/route setup as the existing route helpers.
- Start near the OLM transition on leg 0, tick until the store reports leg 1.
- Then reposition the same aircraft state near the BTG transition, preserving `flightPlan`, `apState`, and the store's active leg, and tick until the store reports leg 2.
- Return samples from real `useSimStore.getState().routeStatus`, `deriveDisplayFmaTruth()`, and `computeDerived()`. Do not fabricate route/FMA truth.
- Prefer reusing the existing snapshot/setup code; avoid adding another fully duplicated browser-local runner.

**Step 4: Update scoped docs**

Update docs without overclaiming:

- `docs/architecture.md`: browser proof section should say route tests prove KSEA route load, backed LNAV, DTG decrease, first/second leg sequencing, and a single-store multi-gate route progression proof. It must also say this is not full-route/full-flight proof.
- `docs/roadmap.md`: completed baseline should mention the multi-gate KSEA route progression proof, while remaining scope should still include full-route/full-flight, approach/landing, and broader FMS behavior.

**Step 5: Verify GREEN**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npx tsc --ignoreConfig --noEmit --target ES2022 --module ESNext --moduleResolution bundler --strict --skipLibCheck e2e/helpers/rfsRoute.ts
CI=1 npx playwright test e2e/rfs-route.spec.ts --project=chromium
```

Expected: PASS with 4 route proof tests.

**Step 6: Commit**

Run:

```bash
git add e2e/helpers/rfsRoute.ts e2e/rfs-route.spec.ts docs/architecture.md docs/roadmap.md docs/plans/2026-06-12-rfs-ksea-multi-gate-route-progression-proof.md docs/plans/README.md
git commit -m "test: prove KSEA multi-gate route progression"
```

## Verification and non-claims

Final verification for this slice should include:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npx tsc --ignoreConfig --noEmit --target ES2022 --module ESNext --moduleResolution bundler --strict --skipLibCheck e2e/helpers/rfsRoute.ts
CI=1 npx playwright test e2e/rfs-route.spec.ts --project=chromium
npm run check
CI=1 npm run test:visual
```

Report this as KSEA multi-gate route progression browser proof only. It is still not full-route proof, full-flight proof, approach/landing proof, broad manual playability proof, CI green, deployed, or live-verified unless those are separately run and checked.
