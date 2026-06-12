# RFS KPDX Short-Final Landing Browser Proof Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task. This slice is intentionally serialized; do not use parallel commit-writing subagents because the helper/spec/docs touch overlapping files.

**Goal:** Add a scoped browser proof that the supported KPDX destination airport can run a short-final approach through real touchdown, braking rollout, and reset cleanup.

**Architecture:** Reuse the existing Playwright flight-loop pattern in `e2e/helpers/rfsFlight.ts`. Keep the proof scoped to a seeded short-final state on a KPDX prepared runway; seed only initial conditions, then require real `tick()` physics/ground contact for touchdown and rollout. Do not claim full-route, route-coupled landing, continuous descent, or full-flight proof.

**Tech Stack:** TypeScript, Playwright, Zustand browser store, RFS physics/ground systems, Node 22 via nvm.

---

## Current context

Already proven:

- ENVA clean climb browser proof.
- ENVA seeded short-final approach-to-touchdown/rollout/reset proof.
- ENVA seeded descent-to-approach/landing bridge proof.
- KSEA route progression through OLM and BTG gates.
- KSEA final BTG->KPDX configured route-coupled approach gate.
- KSEA configured-approach manual handoff plus reset cleanup.

Gap this slice closes:

- KPDX prepared-runway support is unit-covered, and KPDX is the destination of the canned KSEA→KPDX route, but no browser landing proof currently touches down and rolls out at KPDX.

Non-goals:

- No route-coupled KPDX landing claim.
- No KSEA→KPDX full-route/full-flight claim.
- No VNAV lifecycle claim.
- No broad manual playability claim.
- No deploy/live claim.

## Acceptance contract

The new proof must show, in Chromium Playwright, that:

1. The browser store is seeded airborne over a KPDX prepared runway short-final state with gear down, landing flaps, no AP state, and no loaded route.
2. The first proof snapshot is airborne with `guidancePhase === 'approach'`, `weightOnWheels === false`, and positive AGL.
3. Touchdown is reached only after repeated real `tick()` calls, with:
   - `flightPhase === 'LANDED'`
   - `groundContact === 'gear'`
   - `weightOnWheels === true`
   - `onRunway === true`
   - `0 < touchdownSinkRateMps < 15`
   - a KPDX airport/runway evidence field from the real ground sampler, not a hardcoded assertion in the spec.
4. Braking rollout uses real `setInput()` controls and reduces groundspeed relative to touchdown.
5. Reset returns to `status === 'stopped'`, `guidancePhase === 'preflight'`, WOW true, AP cleared, and route cleared.
6. Existing ENVA proofs continue to pass.

## Task 1: Add the KPDX short-final proof with TDD

**Objective:** Extend the existing landing helper/spec so KPDX short-final touchdown/rollout/reset is browser-proven without duplicating a second huge landing helper block.

**Files:**

- Modify: `e2e/helpers/rfsFlight.ts`
- Modify: `e2e/rfs-flight.spec.ts`

**Implementation guidance:**

- Prefer refactoring the duplicated ENVA landing helper logic into an internal browser-evaluated runner that accepts a runway selector/config.
- Keep exported functions stable:
  - `flyApproachToLandingRolloutAndReset(page)` must still drive ENVA.
  - `flyDescentApproachToLandingRolloutAndReset(page)` must still drive the existing ENVA descent bridge.
- Add a new export with a specific name, for example:
  - `flyKpdxShortFinalToLandingRolloutAndReset(page)`
- Add evidence fields to `LandingSnapshot` only if they come from real store/ground state or the real sampler. Preferred fields:
  - `surfaceAirport?: string`
  - `surfaceRunwayId?: string`
- Inside `page.evaluate()`, import `KPDX_RUNWAY_10L` or another specific KPDX runway from `/src/viewport/runwayData.ts` and use `sampleSupportedAirportSurface()` from `/src/sim/runwaySurface.ts` for the airport/runway evidence in snapshots.
- Do not seed `LANDED`, WOW, touchdown sink, rollout slowdown, or reset success.
- After direct `useSimStore.setState(...)` seeding, call the real store `setInput(...)` with the seed controls before the first snapshot so guidance/effective controls are synchronized.
- Use RAF-style `performance.now()` timestamps plus the existing fixed step milliseconds.

**Step 1: Write the failing browser test**

In `e2e/rfs-flight.spec.ts`, import the new helper and add a test similar to:

- name: `KPDX short-final approach touches down on prepared runway, rolls out, and resets cleanly`
- assertions:
  - approach: `guidancePhase === 'approach'`, gear down, airborne, AGL > 50, AP/route cleared.
  - touchdown: `flightPhase === 'LANDED'`, `groundContact === 'gear'`, WOW true, `onRunway === true`, `surfaceAirport === 'KPDX'`, `surfaceRunwayId === '<chosen runway id>'`, sink rate > 0 and < 15.
  - rollout: groundspeed lower than touchdown, guidance phase is `landing-rollout` or `landed`.
  - reset: stopped/preflight/WOW true/AP cleared/route cleared.

Run first and expect RED because the helper export does not exist yet:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
CI=1 npx playwright test e2e/rfs-flight.spec.ts --project=chromium --grep "KPDX short-final" --reporter=list
```

Expected: fail at import/compile or missing helper.

**Step 2: Implement the helper minimally**

- Add the new helper and any small internal refactor needed to avoid a second full copy of the ENVA landing runner.
- If refactor risk grows too large, keep scope small, but do not weaken existing ENVA proofs.
- KPDX seed should use a real KPDX runway reference and land on that runway through `tick()`.
- Throw descriptive errors if approach seed, touchdown, or rollout does not meet the contract.

**Step 3: Run targeted checks**

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npx tsc --ignoreConfig --noEmit --target ES2022 --module ESNext --moduleResolution bundler --strict --skipLibCheck e2e/helpers/rfsFlight.ts
CI=1 npx playwright test e2e/rfs-flight.spec.ts --project=chromium --reporter=list
```

Expected: helper typecheck passes and all flight-loop Playwright tests pass, including the new KPDX proof and existing ENVA proofs.

**Step 4: Commit Task 1**

```bash
git add e2e/helpers/rfsFlight.ts e2e/rfs-flight.spec.ts
git commit -m "test: prove KPDX short-final landing cleanup"
```

## Task 2: Update honest proof documentation

**Objective:** Record the new proof boundary without overclaiming route-coupled landing, full-route, full-flight, CI, deploy, or live success.

**Files:**

- Modify: `docs/architecture.md`
- Modify: `docs/roadmap.md`
- Modify: `docs/plans/README.md`

**Step 1: Update current proof docs**

- In `docs/architecture.md`, extend the browser proof bullet for `e2e/rfs-flight.spec.ts` to mention scoped KPDX short-final touchdown/rollout/reset.
- In `docs/roadmap.md`, add the KPDX proof to the completed baseline/current-state prose and keep remaining scope focused on continuous route-coupled descent/approach/landing, full-route/full-flight, broader manual playability, and deeper landing realism.
- In `docs/plans/README.md`, link this plan as a current autonomous slice plan.

**Step 2: Verify docs diff hygiene**

```bash
git diff --check docs/architecture.md docs/roadmap.md docs/plans/README.md docs/plans/2026-06-12-rfs-kpdx-short-final-landing-proof.md
```

Expected: no whitespace errors.

**Step 3: Commit Task 2**

```bash
git add docs/architecture.md docs/roadmap.md docs/plans/README.md
git commit -m "docs: record KPDX landing proof boundary"
```

## Review plan

After Task 1 and Task 2:

1. Run spec-compliance review against this plan.
2. Fix any blockers and re-run spec review until PASS.
3. Run code-quality review after spec PASS.
4. Fix important/critical issues and re-run quality review until APPROVED.
5. Run final integration review.

Reviewer checklist:

- The proof does not seed touchdown/WOW/rollout/reset outcomes.
- The proof proves KPDX runway evidence from real browser-side surface sampling or store ground state.
- Existing ENVA landing/descent proofs were not weakened.
- Docs do not claim full-route/full-flight, route-coupled landing, VNAV, CI, deploy, or live success.

## Final verification gate

Run from repo root:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npx tsc --ignoreConfig --noEmit --target ES2022 --module ESNext --moduleResolution bundler --strict --skipLibCheck e2e/helpers/rfsFlight.ts
CI=1 npx playwright test e2e/rfs-flight.spec.ts --project=chromium --reporter=list
npm run check
CI=1 npm run test:visual
```

Then check live drift without claiming deploy:

```bash
curl -fsSL -A 'Hermes-Agent-RFS-Verification' https://fly.reidar.tech/rfs-version.json || true
git status --short --branch
git log --oneline -10
```

## Expected final report boundaries

Report this as a “scoped KPDX short-final approach-to-touchdown/rollout/reset browser proof.” Explicitly state it is not full-flight, full-route, continuous descent/approach, route-coupled landing, VNAV, CI/deploy, or live proof unless separately verified.
