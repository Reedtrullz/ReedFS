# RFS KSEA Route-Coupled Configured Approach Browser Proof Implementation Plan

> **For Hermes:** Use subagent-driven-development for the implementation task and two-stage review. Verify subagent work in the parent session before finalizing.

**Goal:** Add the next scoped flight-flow proof after KSEA multi-gate route progression and ENVA seeded descent/landing: a deterministic browser run that starts on the final KSEA→KPDX route leg, keeps backed LNAV/FMA truth active, descends toward KPDX, configures a stable approach with gear/flaps through real store actions, and proves the route remains coupled without resetting the browser store.

**Architecture:** Keep production navigation/physics unchanged unless a real blocker appears. Extend the existing KSEA Playwright route helper instead of duplicating setup. The proof should seed only an initial final-leg descent-adjacent state, load the real `createKseaKpdxFlight()` plan, use a backed CMD A + LNAV + SPEED AP state with no vertical mode backing, and sample real Zustand route/FMA/derived/guidance/control state after real `tick()` calls.

**Tech Stack:** TypeScript, Playwright, Zustand browser store, existing `computeDerived()`, `deriveDisplayFmaTruth()`, `createKseaKpdxFlight()`, route status/navigation helpers.

---

## Selected slice and acceptance test

Chosen because `docs/roadmap.md` P2 now identifies the gap between current route-leg/multi-gate proofs and route-coupled descent/approach/landing coverage. This slice adds measurable browser evidence for the next milestone without claiming full-route or full-flight.

Concrete acceptance test before code changes:

- Add a Playwright test in `e2e/rfs-route.spec.ts` importing `flyKseaFinalRouteToConfiguredApproach(page)`.
- Initial RED should fail because that export does not exist.
- The final proof must return snapshots for:
  - `initial`: route `KSEA→KPDX`, `activeLegIndex === 2`, from `BTG`, next waypoint `KPDX`, LNAV available, FMA lateral `LNAV`, vertical FMA `OFF`, airborne `DESCENT`, gear up or not landing-configured.
  - `configuredApproach`: same route and final leg still active, LNAV/FMA still backed, distance to KPDX lower than initial by a meaningful margin, altitude/AGL lower than initial, gear down, landing flaps, airborne, guidance `approach`, vertical FMA still `OFF` so descent is not advertised as AP vertical guidance.
  - `samples`: monotonic non-increasing distance-to-next, every sample keeps route valid/LNAV available/FMA LNAV, and no sample reports weight-on-wheels or `LANDED`.

Non-goals:

- Do not claim this lands at KPDX.
- Do not claim continuous full route, full flight, CI, deploy, live, manual dogfood, or source-backed B737 performance accuracy.
- Do not introduce RFMS route-edit UI or VNAV/LVL CHG controls.

## Task 1: Add final-leg route-coupled approach proof

**Objective:** Prove a browser-store final-leg route-coupled descent-to-configured-approach gate while keeping route/AP/FMA truth honest.

**Files:**
- Modify: `e2e/helpers/rfsRoute.ts`
- Modify: `e2e/rfs-route.spec.ts`
- Modify: `docs/architecture.md`
- Modify: `docs/roadmap.md`

**TDD cycle:**
1. Add the Playwright test importing `flyKseaFinalRouteToConfiguredApproach()` and asserting the acceptance snapshots.
2. Run:
   ```bash
   source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
   CI=1 npx playwright test e2e/rfs-route.spec.ts --project=chromium
   ```
   Expected RED: missing export or helper not implemented.
3. Implement the minimal helper in `e2e/helpers/rfsRoute.ts`, reusing existing route setup/snapshot patterns.
4. Use real `setInput()` for approach configuration and real `tick()` calls for route/descent progression. If direct state seeding is needed, synchronize through a real store action before first snapshot.
5. Run:
   ```bash
   source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
   npx tsc --ignoreConfig --noEmit --target ES2022 --module ESNext --moduleResolution bundler --strict --skipLibCheck e2e/helpers/rfsRoute.ts
   CI=1 npx playwright test e2e/rfs-route.spec.ts --project=chromium
   git diff --check
   ```
   Expected GREEN: helper type-check exits 0 and the route Playwright spec passes.
6. Update `docs/architecture.md` and `docs/roadmap.md` with scoped wording.
7. Commit the implementation slice.

## Verification and non-claims

Final verification for this slice must include:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npx tsc --ignoreConfig --noEmit --target ES2022 --module ESNext --moduleResolution bundler --strict --skipLibCheck e2e/helpers/rfsRoute.ts
CI=1 npx playwright test e2e/rfs-route.spec.ts --project=chromium
npm run check
CI=1 npm run test:visual
```

Report this as a scoped KSEA final-leg route-coupled configured-approach browser proof. It does not prove KPDX landing, full route, full flight, route edits, VNAV lifecycle, broad manual playability, CI/deploy/live, or source-backed B737 performance accuracy.
