# RFS Approach Landing Rollout Browser Proof Implementation Plan

> **For Hermes:** Use subagent-driven-development for the implementation task and two-stage review. Verify subagent work in the parent session before finalizing.

**Goal:** Add truthful landing/rollout guidance phases and a deterministic browser proof that an approach-state 737 touches down, rolls out under braking, and can reset to a clean playable state.

**Architecture:** Keep the physics integrator and ground model behavior unchanged unless a real test failure proves a bug. Extend the guidance projection so `APPROACH`/`DESCENT` and `LANDED` aircraft states do not reuse takeoff-roll guidance. Add one Playwright helper that seeds the real browser Zustand store into a short-final approach state, lets the existing physics/ground model perform gear touchdown, applies rollout braking after touchdown, and verifies reset.

**Tech Stack:** TypeScript, Vitest, Playwright, Zustand browser store, existing `computeDerived()`, `eulerToQuat()`, ENVA runway data, `integrate()`/ground contact runtime.

---

## Task 1: Add landing/rollout guidance phases and browser proof

**Objective:** Prove the next credible flight-flow milestone after clean climb: a scoped approach-to-touchdown/rollout/reset browser slice with honest guidance copy. This is not full-flight proof because the helper seeds short-final state instead of flying departure, route, descent, and approach end-to-end.

**Files:**
- Modify: `src/sim/guidanceState.ts`
- Modify: `src/sim/checklistCoach.ts`
- Modify: `src/sim/__tests__/guidanceState.test.ts`
- Modify: `src/sim/__tests__/checklistCoach.test.ts`
- Modify: `e2e/helpers/rfsFlight.ts`
- Modify: `e2e/rfs-flight.spec.ts`
- Modify: `docs/architecture.md`
- Modify: `docs/roadmap.md`

**Step 1: Write failing unit tests**

Add guidance tests that initially fail:

- `deriveGuidancePhase()` returns `approach` for airborne `APPROACH`/`DESCENT` aircraft with gear down instead of `positive-rate`.
- `deriveGuidancePhase()` returns `landing-rollout` for `LANDED` aircraft on gear with forward speed above taxi/stop speed instead of `takeoff-roll`.
- `deriveGuidancePhase()` returns `landed` for `LANDED` aircraft on gear at very low speed instead of `takeoff-roll`.
- `coachMessageForState()` for `LANDED` rollout includes landing/rollout/reset language and does not ask for takeoff thrust.

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npm run test -- src/sim/__tests__/guidanceState.test.ts src/sim/__tests__/checklistCoach.test.ts
```

Expected: FAIL because the new phases/copy are not implemented yet.

**Step 2: Implement minimal guidance projection**

In `src/sim/guidanceState.ts`:

- Extend `GuidancePhase` with `approach`, `landing-rollout`, and `landed`.
- Check landing/approach states before the generic airborne/takeoff logic:
  - `APPROACH` or `DESCENT` while airborne -> `approach`.
  - `LANDED` with gear contact and meaningful forward speed -> `landing-rollout`.
  - `LANDED` with gear contact and low/near-stop speed -> `landed`.
- Keep existing takeoff/positive-rate/climb behavior unchanged.
- Tutorial auto-step fallback may reuse the scenario's final step if no landing-specific tutorial step exists; do not add unrelated scenario UI work.

In `src/sim/checklistCoach.ts`:

- Extend checklist phase handling with landing phases.
- For `approach`, show a small landing checklist: gear down, landing flaps, speedbrakes armed/retracted as appropriate.
- For `landing-rollout`, show rollout checklist: weight on wheels/contact, spoilers/brakes, reset once stopped.
- For `landed`, show stopped/reset-ready checklist.
- Coach copy must not tell a landed aircraft to set takeoff thrust.

**Step 3: Verify unit GREEN**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npm run test -- src/sim/__tests__/guidanceState.test.ts src/sim/__tests__/checklistCoach.test.ts
```

Expected: PASS.

**Step 4: Add failing browser proof**

In `e2e/rfs-flight.spec.ts`, add a second test importing `flyApproachToLandingRolloutAndReset(page)` from `e2e/helpers/rfsFlight.ts` and asserting:

- approach/initial sample has guidance phase `approach`, gear down, airborne, and AGL > 50 ft.
- touchdown sample has `weightOnWheels === true`, `groundContact === 'gear'`, `flightPhase === 'LANDED'`, and positive `touchdownSinkRateMps`.
- rollout sample has lower ground speed than touchdown sample and guidance phase `landing-rollout` or `landed`.
- reset sample has status `stopped`, guidance phase `preflight`, weight on wheels, and no lingering AP/route/landing state.

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
CI=1 npx playwright test e2e/rfs-flight.spec.ts --project=chromium
```

Expected: FAIL because the helper is not exported yet.

**Step 5: Implement browser helper**

In `e2e/helpers/rfsFlight.ts`:

- Add a `LandingProofResult` shape with `approach`, `touchdown`, `rollout`, and `reset` snapshots.
- Extend snapshot data with ground speed, status, flight phase, contact type, touchdown sink rate, and selected guidance phase.
- Use one `page.evaluate()` call and real browser modules: `useSimStore`, `computeDerived()`, `eulerToQuat()`, and runway/geodesy helpers as needed.
- Seed the browser store into a deterministic short-final ENVA approach state:
  - selected/default scenario can remain ENVA tutorial, but aircraft `flightPhase` must be `APPROACH`.
  - gear down, flaps 30, modest landing throttle, runway-aligned heading, plausible approach speed, slight descent, AGL > 50 ft.
  - no fabricated contact/phase results after the seed; touchdown and rollout must come from `tick()`/physics/ground contact.
- Tick until real touchdown sets `flightPhase === 'LANDED'` and gear contact.
- Apply brakes/spoilers after touchdown and tick until speed has decreased materially.
- Call `reset()` and return the post-reset snapshot.
- If deterministic tuning is needed, tune initial position/speed/descent; do not weaken assertions or fabricate route/ground state.

**Step 6: Update scoped docs**

- `docs/architecture.md`: browser proof section should mention ENVA clean-climb, scoped approach-to-touchdown/rollout/reset proof, and KSEA route progression proof. Keep explicit non-claim wording: not full-flight/full-route completion.
- `docs/roadmap.md`: completed baseline should mention approach-to-touchdown/rollout/reset browser proof and landing/rollout guidance truth. Remaining scope should still include full-flight proof, continuous route/descent/approach/landing end-to-end, broader manual playability, and deeper landing realism.

**Step 7: Verify GREEN and commit**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npm run test -- src/sim/__tests__/guidanceState.test.ts src/sim/__tests__/checklistCoach.test.ts
npx tsc --ignoreConfig --noEmit --target ES2022 --module ESNext --moduleResolution bundler --strict --skipLibCheck e2e/helpers/rfsFlight.ts
CI=1 npx playwright test e2e/rfs-flight.spec.ts --project=chromium
git diff --check
```

Expected: unit tests pass, helper type-check passes, flight Playwright spec passes with 2 tests.

Commit:

```bash
git add src/sim/guidanceState.ts src/sim/checklistCoach.ts src/sim/__tests__/guidanceState.test.ts src/sim/__tests__/checklistCoach.test.ts e2e/helpers/rfsFlight.ts e2e/rfs-flight.spec.ts docs/architecture.md docs/roadmap.md docs/plans/2026-06-12-rfs-approach-landing-rollout-browser-proof.md
git commit -m "test: prove approach landing rollout reset slice"
```

## Verification and non-claims

Final verification for this slice should include:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npm run test -- src/sim/__tests__/guidanceState.test.ts src/sim/__tests__/checklistCoach.test.ts
npx tsc --ignoreConfig --noEmit --target ES2022 --module ESNext --moduleResolution bundler --strict --skipLibCheck e2e/helpers/rfsFlight.ts
CI=1 npx playwright test e2e/rfs-flight.spec.ts --project=chromium
npm run check
CI=1 npm run test:visual
```

Report this as scoped approach/landing-rollout/reset browser proof only. It is still not full-flight proof, full-route proof, continuous descent/approach proof, broad manual playability proof, CI green, deployed, or live-verified unless those are separately run and checked.

## Implementation evidence

- Added RED unit coverage for approach/descent guidance, landed rollout/near-stop phase selection, and landed rollout coach copy; initial targeted run failed as expected with `positive-rate`/`takeoff-roll` phases and takeoff-oriented copy.
- Implemented `approach`, `landing-rollout`, and `landed` guidance phases ahead of generic airborne/takeoff fallback, plus landing/rollout/reset checklist and coach copy that does not request takeoff thrust once landed.
- Added the Playwright browser proof test RED by importing `flyApproachToLandingRolloutAndReset()` before the helper existed; initial browser run failed with the expected missing export.
- Implemented `flyApproachToLandingRolloutAndReset()` as one browser `page.evaluate()` helper using the real Zustand sim store, `computeDerived()`, `eulerToQuat()`, and ENVA runway data. The helper seeds only the initial short-final APPROACH state; touchdown, gear contact, LANDED phase, braking rollout deceleration, and reset state come from the existing runtime/physics/store paths.
- Final targeted verification passed:
  - `npm run test -- src/sim/__tests__/guidanceState.test.ts src/sim/__tests__/checklistCoach.test.ts`
  - `npx tsc --ignoreConfig --noEmit --target ES2022 --module ESNext --moduleResolution bundler --strict --skipLibCheck e2e/helpers/rfsFlight.ts`
  - `CI=1 npx playwright test e2e/rfs-flight.spec.ts --project=chromium`
- Non-claim remains: this is scoped ENVA clean-climb plus seeded short-final approach-to-touchdown/rollout/reset browser proof, not continuous full-flight/full-route/descent/approach completion proof, broader manual playability proof, CI/deploy proof, or live verification.
