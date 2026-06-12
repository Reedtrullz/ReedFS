# RFS KSEA Second-Leg Sequencing Browser Proof Implementation Plan

> **For Hermes:** Use subagent-driven-development for the implementation task and two-stage review. Verify subagent work in the parent session before finalizing.

**Goal:** Refactor the duplicated route proof Playwright helper setup and add a second KSEA browser proof that sequences from OLM→BTG to BTG→KPDX while backed LNAV/FMA truth remains active.

**Architecture:** Keep all production navigation code unchanged. Consolidate `e2e/helpers/rfsRoute.ts` around one browser-evaluated route proof runner that seeds the Zustand store, backs CMD A/LNAV/ALT HOLD/SPEED, samples real route status and FMA truth, and can start near different route transition gates. Existing `flyKseaRouteWithLnav()` and `flyKseaRouteThroughFirstSequence()` must keep their public APIs; the new proof adds `flyKseaRouteThroughSecondSequence()`.

**Tech Stack:** TypeScript, Playwright, Zustand browser store, existing `createKseaKpdxFlight()`, `computeDerived()`, `deriveDisplayFmaTruth()`, `eulerToQuat()`.

---

## Task 1: Refactor route proof helper and add second-leg sequencing proof

**Objective:** Prove in-browser that the canned KSEA route can advance from active leg 1 OLM→BTG to active leg 2 BTG→KPDX, without duplicating another full browser setup block.

**Files:**
- Modify: `e2e/helpers/rfsRoute.ts`
- Modify: `e2e/rfs-route.spec.ts`
- Modify: `docs/architecture.md`
- Modify: `docs/roadmap.md`

**Step 1: Write failing test**

Add a third Playwright test in `e2e/rfs-route.spec.ts` that imports `flyKseaRouteThroughSecondSequence(page)` and asserts:

- initial route name is `KSEA→KPDX`
- initial active leg is `1`
- initial `fromIdent` is `OLM`
- initial `nextWaypointIdent` is `BTG`
- final active leg is `2`
- final `fromIdent` is `BTG`
- final `nextWaypointIdent` is `KPDX`
- every sample keeps `lnavAvailable === true`
- every sample keeps `fmaLateralActive === 'LNAV'`
- the sample set contains a transition from leg 1 to leg 2, or at least one sample with `sequenced === true`

**Step 2: Verify RED**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
CI=1 npx playwright test e2e/rfs-route.spec.ts --project=chromium
```

Expected: FAIL because `flyKseaRouteThroughSecondSequence` is not exported yet.

**Step 3: Refactor and implement**

In `e2e/helpers/rfsRoute.ts`:

- Extract the duplicated browser-local interfaces/import/setup/snapshot logic into one reusable internal runner.
- Keep the current exported helpers and behavior:
  - `flyKseaRouteWithLnav(page)`
  - `flyKseaRouteThroughFirstSequence(page)`
- Add `flyKseaRouteThroughSecondSequence(page)`.
- Seed the second-sequence helper near the BTG transition on the OLM→BTG leg, with `activeLegIndex` starting at `1` and with heading/position chosen so the real store/navigation logic sequences to leg `2` within a short deterministic tick loop.
- Return samples from real `useSimStore.getState().routeStatus`, `deriveDisplayFmaTruth()`, and `computeDerived()`. Do not fabricate route/FMA values.

**Step 4: Update claim-scoped docs**

Update docs so they do not overclaim:

- `docs/architecture.md`: browser proof section should say route tests prove KSEA route load, backed LNAV, DTG decrease, and first/second leg sequencing. It must also say this is not full-route/full-flight proof.
- `docs/roadmap.md`: completed baseline should mention first/second KSEA route sequencing browser proofs, while remaining scope should still include full-route/full-flight, approach/landing, and broader FMS behavior.

**Step 5: Verify GREEN**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npx tsc --ignoreConfig --noEmit --target ES2022 --module ESNext --moduleResolution bundler --strict --skipLibCheck e2e/helpers/rfsRoute.ts
CI=1 npx playwright test e2e/rfs-route.spec.ts --project=chromium
```

Expected: PASS with 3 route proof tests.

**Step 6: Commit**

Run:

```bash
git add e2e/helpers/rfsRoute.ts e2e/rfs-route.spec.ts docs/architecture.md docs/roadmap.md docs/plans/2026-06-12-rfs-ksea-second-leg-sequencing-proof.md docs/plans/README.md
git commit -m "test: prove second KSEA route leg sequencing"
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

Report this as KSEA first/second leg route-sequencing browser proof only. It is still not full-route proof, full-flight proof, approach/landing proof, CI green, deployed, or live-verified unless those are separately run and checked.
