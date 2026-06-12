# RFS KSEA Route Manual-Handoff Reset Browser Proof Implementation Plan

> **For Hermes:** Use subagent-driven-development for the implementation task and two-stage review. Verify subagent work in the parent session before finalizing. Swarm/GPT-5.5 worktree escalation was considered but is not used because this is one serialized E2E/helper/docs slice touching the same route-proof files.

**Goal:** Extend the current KSEA final-leg configured-approach-to-manual-handoff proof with a deterministic browser reset cleanup gate: after backed route-coupled automation has been manually disconnected, the real store reset must clear route/AP state and return to preflight without stale FMS/AP/FMA truth.

**Architecture:** Keep production runtime behavior unchanged unless a regression test exposes a real truth bug. Extend the existing KSEA Playwright route helper instead of duplicating setup. The proof should reuse the real `createKseaKpdxFlight()` plan, real `deriveDisplayFmaTruth()`, real store `setInput()` and `reset()` actions, and the existing route manual-handoff runner. Reset evidence must be read from the Zustand store after the reset action, not fabricated from assumptions.

**Tech Stack:** TypeScript, Playwright, Zustand browser store, existing KSEA route helper, `deriveDisplayFmaTruth()`, `computeDerived()`, route status/navigation helpers.

---

## Selected slice and acceptance test

Chosen because the project now has separate browser proof for ENVA reset after landing and KSEA route-coupled manual handoff, but not proof that a complex route/AP/FMA state cleans up truthfully after reset. This closes a narrow north-star reset-flow gap without claiming landing/full-flight coverage.

Concrete acceptance test before code changes:

- Add a Playwright test in `e2e/rfs-route.spec.ts` importing `flyKseaFinalRouteApproachManualHandoffAndReset(page)`.
- Initial RED should fail because that export does not exist.
- The final proof must return snapshots for:
  - `configuredApproach`: same evidence as the current final-leg approach gate — route `KSEA→KPDX`, active leg `2`, from `BTG`, next `KPDX`, LNAV available, raw/effective `CMD_A`, `LNAV`, `SPEED`, vertical OFF, gear down, landing flaps, airborne.
  - `manualHandoff`: same route still loaded/valid and final leg still active, but raw/effective AP status, lateral, vertical, and thrust modes all `OFF`; AP command count is zero; pilot and effective elevator/aileron/throttle values match; still airborne and not landed.
  - `reset`: route cleared (`flightPlan === null`, `activeLegIndex === null`, route status `NO ROUTE`/LNAV unavailable), AP state cleared, FMA/AP modes OFF, AP command count zero, status stopped, guidance preflight, weight on wheels true.
  - `samples`: pre-handoff samples keep backed CMD A + LNAV + SPEED; the handoff sample is OFF/no commands; reset is returned as a separate reset snapshot and should not be mixed into pre-handoff route samples that require an active route.

Non-goals:

- Do not claim KPDX landing, route-coupled landing, full-route, or full-flight proof.
- Do not add VNAV/LVL CHG lifecycle, RFMS route-edit UI, or production autopilot features unless tests expose a root-cause bug.
- Do not push, deploy, or claim CI/live.

## Task 1: Add route manual-handoff reset cleanup proof

**Objective:** Prove in-browser that a complex KSEA route/AP state resets without stale route/AP/FMA truth after manual automation handoff.

**Files:**
- Modify: `e2e/helpers/rfsRoute.ts`
- Modify: `e2e/rfs-route.spec.ts`
- Modify: `docs/architecture.md`
- Modify: `docs/roadmap.md`

**TDD cycle:**
1. Add the Playwright test importing `flyKseaFinalRouteApproachManualHandoffAndReset()` and asserting the acceptance snapshots.
2. Run:
   ```bash
   source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
   CI=1 npx playwright test e2e/rfs-route.spec.ts --project=chromium
   ```
   Expected RED: missing export or helper not implemented.
3. Implement the minimal helper in `e2e/helpers/rfsRoute.ts`, reusing the existing KSEA route proof runner and current final-leg manual-handoff setup.
4. Add a reset snapshot type only as needed. Do not weaken the existing active-route `RouteProofSnapshot` checks; reset should be a separate shape because no active route should remain after reset.
5. Use the real store `reset()` action after manual handoff, then snapshot route/AP/FMA/guidance/control state from the store.
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

Report this as a scoped KSEA route-coupled configured-approach-to-manual-handoff-and-reset browser proof. It does not prove KPDX landing, route-coupled landing, full-route, full-flight, VNAV lifecycle, broad manual playability, CI green, deploy, live, or source-backed B737 performance accuracy.
