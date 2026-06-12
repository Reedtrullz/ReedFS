# RFS KSEA Route-Coupled Approach Manual-Handoff Browser Proof Implementation Plan

> **For Hermes:** Use subagent-driven-development for the implementation task and two-stage review. Verify subagent work in the parent session before finalizing.

**Goal:** Extend the current scoped KSEA final-leg configured-approach proof with a deterministic browser handoff point: after backed CMD A + LNAV + SPEED has configured the approach, a manual pitch input must disconnect automation truthfully, leave the route loaded, and prove no hidden AP/AT axis command keeps flying while the FMA/AP display is OFF.

**Architecture:** Keep production runtime behavior unchanged unless a regression test exposes a real truth bug. Extend the existing KSEA Playwright route helper instead of duplicating setup. The proof should reuse the real `createKseaKpdxFlight()` plan, real `deriveDisplayFmaTruth()`, real store `setInput()`/`tick()` calls, and sample pilot/effective/AP-owned controls from the Zustand store after the manual handoff.

**Tech Stack:** TypeScript, Playwright, Zustand browser store, existing KSEA route helper, `deriveDisplayFmaTruth()`, `computeDerived()`, route status/navigation helpers.

---

## Selected slice and acceptance test

Chosen because the previous KSEA final-leg proof now demonstrates route-coupled configured approach, but the north-star player loop still needs truthful handoff from honest automation to manual landing. This slice closes a P0 truth/playability gap: AP/FMA may be OFF only if no hidden AP/AT command continues to own elevator, aileron, or throttles.

Concrete acceptance test before code changes:

- Add a Playwright test in `e2e/rfs-route.spec.ts` importing `flyKseaFinalRouteApproachToManualHandoff(page)`.
- Initial RED should fail because that export does not exist.
- The final proof must return snapshots for:
  - `configuredApproach`: same evidence as the existing final-leg approach gate — route `KSEA→KPDX`, active leg `2`, from `BTG`, next `KPDX`, LNAV available, raw/effective `CMD_A`, `LNAV`, `SPEED`, vertical OFF, gear down, landing flaps, airborne.
  - `manualHandoff`: same route still loaded/valid and final leg still active, but raw/effective AP status, lateral, vertical, and thrust modes all `OFF`; AP command count is zero; pilot and effective elevator/aileron/throttle values match, proving no hidden AP/AT command still owns the axes while the display says OFF.
  - `samples`: approach-phase samples before handoff keep backed CMD A + LNAV + SPEED; after handoff there is at least one sample with AP/FMA OFF and no AP commands; no sample lands or reports weight-on-wheels.

Non-goals:

- Do not claim KPDX landing, route-coupled landing, full-route, or full-flight proof.
- Do not add VNAV/LVL CHG lifecycle, RFMS route-edit UI, or production autopilot features unless tests expose a root-cause bug.
- Do not push, deploy, or claim CI/live.

## Task 1: Add route-coupled approach manual-handoff proof

**Objective:** Prove the handoff from backed route-coupled automation to manual control is truthful in-browser.

**Files:**
- Modify: `e2e/helpers/rfsRoute.ts`
- Modify: `e2e/rfs-route.spec.ts`
- Modify: `docs/architecture.md`
- Modify: `docs/roadmap.md`

**TDD cycle:**
1. Add the Playwright test importing `flyKseaFinalRouteApproachToManualHandoff()` and asserting the acceptance snapshots.
2. Run:
   ```bash
   source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
   CI=1 npx playwright test e2e/rfs-route.spec.ts --project=chromium
   ```
   Expected RED: missing export or helper not implemented.
3. Implement the minimal helper in `e2e/helpers/rfsRoute.ts`, reusing the existing KSEA route proof runner and current final-leg configured approach setup.
4. Extend route snapshots only as needed to expose pilot/effective/AP-command axis ownership and AP command count. Do not fabricate proof fields; read them from the browser store.
5. Use real `setInput({ elevator: ... })` to trigger manual AP disconnect, then `tick()` once before the handoff snapshot so store-derived route/FMA/guidance/control state is synchronized.
6. Run:
   ```bash
   source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
   npx tsc --ignoreConfig --noEmit --target ES2022 --module ESNext --moduleResolution bundler --strict --skipLibCheck e2e/helpers/rfsRoute.ts
   CI=1 npx playwright test e2e/rfs-route.spec.ts --project=chromium
   git diff --check
   ```
   Expected GREEN: helper type-check exits 0 and the route Playwright spec passes.
7. Update `docs/architecture.md` and `docs/roadmap.md` with scoped wording.
8. Commit the implementation slice.

## Verification and non-claims

Final verification for this slice must include:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npx tsc --ignoreConfig --noEmit --target ES2022 --module ESNext --moduleResolution bundler --strict --skipLibCheck e2e/helpers/rfsRoute.ts
CI=1 npx playwright test e2e/rfs-route.spec.ts --project=chromium
npm run check
CI=1 npm run test:visual
```

Report this as a scoped KSEA route-coupled configured-approach-to-manual-handoff browser proof. It does not prove KPDX landing, route-coupled landing, full-route, full-flight, VNAV lifecycle, broad manual playability, CI/deploy/live, or source-backed B737 performance accuracy.
