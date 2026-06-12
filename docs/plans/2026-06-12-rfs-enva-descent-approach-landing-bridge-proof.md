# RFS ENVA Descent-to-Landing Bridge Browser Proof Implementation Plan

> **For Hermes:** Use subagent-driven-development for the implementation task and two-stage review. Verify subagent work in the parent session before finalizing.

**Goal:** Add the next scoped flight-flow proof after seeded short-final: a deterministic ENVA browser run that starts in a higher/farther DESCENT state, reaches a stable configured approach state, touches down through real physics/ground contact, rolls out slower under braking, and resets cleanly without resetting the store between descent and landing.

**Architecture:** Keep production physics/ground/integrator behavior unchanged unless tests reveal a real bug. Extend the Playwright flight helper with a second landing proof path that seeds only the initial descent-adjacent state, uses real store actions for landing configuration, advances by real `tick()` calls, and reuses the same snapshot/non-claim discipline as the existing short-final approach proof.

**Tech Stack:** TypeScript, Playwright, Zustand browser store, existing `computeDerived()`, `eulerToQuat()`, ENVA runway data, runtime `tick()`/physics/ground contact.

---

## Task 1: Add continuous descent-to-landing bridge browser proof

**Objective:** Prove a longer, single-store ENVA descent/approach/landing/rollout/reset slice without claiming full-flight proof.

**Files:**
- Modify: `e2e/helpers/rfsFlight.ts`
- Modify: `e2e/rfs-flight.spec.ts`
- Modify: `docs/architecture.md`
- Modify: `docs/roadmap.md`

**Acceptance criteria:**
- Add a Playwright test that initially fails because `flyDescentApproachToLandingRolloutAndReset(page)` is not exported.
- Implement the helper as one browser `page.evaluate()` using the real Zustand store and runtime modules.
- Seed only the initial DESCENT/final-approach-adjacent state:
  - ENVA runway-aligned heading.
  - Above and farther out than the existing short-final helper, e.g. several hundred feet AGL and materially farther along final than 220 m.
  - Airborne, no gear contact, no touchdown sink rate, no `LANDED` phase.
  - AP/route cleared so this proof does not imply route/FMS coverage.
- Synchronize derived store-owned state after direct seeding through a real store action such as `setInput()`, following `references/approach-landing-rollout-browser-proof.md`.
- Use real store actions to configure the approach from the seeded descent state where applicable, e.g. gear/flaps/spoilers/brakes through `setInput()` rather than post-seeding fabricated success state.
- Tick forward without resetting the store between descent, configured approach, touchdown, rollout, and reset.
- Assert and return snapshots for at least:
  - `descent`: `flightPhase === 'DESCENT'`, airborne, guidance `approach`, AGL clearly above short-final.
  - `configuredApproach`: gear down, landing flaps, guidance `approach`, AGL lower than descent, airborne, stable descent.
  - `touchdown`: `flightPhase === 'LANDED'`, `groundContact === 'gear'`, `weightOnWheels === true`, positive touchdown sink rate.
  - `rollout`: lower ground speed than touchdown and guidance `landing-rollout` or `landed`.
  - `reset`: stopped/preflight, weight on wheels, AP and route cleared.
- Keep docs honest: this is a seeded descent-to-landing bridge proof, not full-flight, full-route, continuous route descent, manual dogfood, CI, deploy, or live proof.

**TDD cycle:**
1. Add the Playwright test importing `flyDescentApproachToLandingRolloutAndReset()` and asserting the acceptance snapshots.
2. Run:
   ```bash
   source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
   CI=1 npx playwright test e2e/rfs-flight.spec.ts --project=chromium
   ```
   Expected RED: missing export or helper not implemented.
3. Implement the minimal helper and shared types needed to pass.
4. Run:
   ```bash
   source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
   npx tsc --ignoreConfig --noEmit --target ES2022 --module ESNext --moduleResolution bundler --strict --skipLibCheck e2e/helpers/rfsFlight.ts
   CI=1 npx playwright test e2e/rfs-flight.spec.ts --project=chromium
   git diff --check
   ```
   Expected GREEN: helper type-check exits 0 and the flight Playwright spec passes.
5. Update `docs/architecture.md` and `docs/roadmap.md` with scoped wording.
6. Commit the implementation slice.

## Verification and non-claims

Final verification for this slice must include:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npx tsc --ignoreConfig --noEmit --target ES2022 --module ESNext --moduleResolution bundler --strict --skipLibCheck e2e/helpers/rfsFlight.ts
CI=1 npx playwright test e2e/rfs-flight.spec.ts --project=chromium
npm run check
CI=1 npm run test:visual
```

Report this as a scoped seeded ENVA descent-to-landing bridge browser proof. It does not prove full-flight, full-route, route-coupled descent, broad manual playability, CI green, deploy, live, or source-backed B737 performance accuracy.
