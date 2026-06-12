# RFS Route Sequencing Browser Proof Implementation Plan

> **For Hermes:** This is a small autonomous TDD slice. Use subagent-driven-development for implementation/review unless the subagent provider is unavailable; verify all child work in the parent session.

**Goal:** Extend the existing KSEA route-leg browser proof so it also proves the active route leg can sequence in-browser from the KSEA→OLM leg to the OLM→BTG leg while LNAV/FMA truth remains backed.

**Architecture:** Reuse the existing Playwright helper in `e2e/helpers/rfsRoute.ts`. Add a focused helper that initializes the browser store near the OLM transition gate on the canned KSEA→KPDX route, runs deterministic fixed steps through the store heartbeat, captures route/FMA samples, and returns evidence that active leg index advanced. Keep claims scoped to route sequencing; this is not a full-route or full-flight proof.

**Tech Stack:** TypeScript, Playwright, Zustand store imported in browser context, existing `createKseaKpdxFlight()`, `computeDerived()`, and `deriveDisplayFmaTruth()` helpers.

---

## Task 1: Add route-sequencing Playwright proof

**Objective:** Prove in-browser that the canned KSEA route can advance from active leg 0 to leg 1 with backed LNAV/FMA truth.

**Files:**
- Modify: `e2e/helpers/rfsRoute.ts`
- Modify: `e2e/rfs-route.spec.ts`

**Step 1: Write failing test**

Add a second Playwright test in `e2e/rfs-route.spec.ts` that imports a new helper, for example `flyKseaRouteThroughFirstSequence(page)`, and asserts:

- initial route name is `KSEA→KPDX`
- initial active leg is `0`
- final active leg is `1`
- final `fromIdent` is `OLM`
- final `nextWaypointIdent` is `BTG`
- every sample keeps `lnavAvailable === true`
- every sample keeps `fmaLateralActive === 'LNAV'`
- final sample reports `sequenced === true` at least once or the sample set contains a transition from leg 0 to leg 1

**Step 2: Verify RED**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
CI=1 npx playwright test e2e/rfs-route.spec.ts --project=chromium
```

Expected: FAIL because the new helper does not exist yet.

**Step 3: Implement helper**

In `e2e/helpers/rfsRoute.ts`:

- Extend `RouteProofSnapshot` with route identifiers needed by the new assertions: `fromIdent`, `nextWaypointIdent`, `sequenced`.
- Keep the existing helper behavior compatible.
- Add `flyKseaRouteThroughFirstSequence(page)` that:
  - loads `createKseaKpdxFlight()`
  - backs `CMD_A`, `LNAV`, `ALT_HOLD`, and `SPEED` the same way as `flyKseaRouteWithLnav()`
  - starts airborne near the end of the KSEA→OLM leg, close enough for capture or bounded turn anticipation to sequence without requiring a long flight
  - runs deterministic ticks using `performance.now()`-style timestamps
  - returns initial/final/samples from the same snapshot function

Do not claim full-route completion; only prove first-leg sequencing.

**Step 4: Verify GREEN**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npx tsc --ignoreConfig --noEmit --target ES2022 --module ESNext --moduleResolution bundler --strict --skipLibCheck e2e/helpers/rfsRoute.ts
CI=1 npx playwright test e2e/rfs-route.spec.ts --project=chromium
```

Expected: PASS.

**Step 5: Commit**

Run:

```bash
git add e2e/helpers/rfsRoute.ts e2e/rfs-route.spec.ts docs/plans/2026-06-12-rfs-route-sequencing-browser-proof.md docs/plans/README.md
git commit -m "test: prove KSEA route leg sequencing in browser"
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

Report this as route-sequencing browser proof only. It is still not full-route proof, not full-flight proof, not approach/landing proof, not CI green, and not deployed/live unless separately pushed/deployed/verified.

## Implementation evidence

- RED: `CI=1 npx playwright test e2e/rfs-route.spec.ts --project=chromium` failed because `./helpers/rfsRoute` did not provide `flyKseaRouteThroughFirstSequence`.
- GREEN: `npx tsc --ignoreConfig --noEmit --target ES2022 --module ESNext --moduleResolution bundler --strict --skipLibCheck e2e/helpers/rfsRoute.ts` passed.
- GREEN: `CI=1 npx playwright test e2e/rfs-route.spec.ts --project=chromium` passed with 2 tests.
