# RFS KSEA Final-Route to KPDX Landing Bridge Browser Proof Plan

> **For Hermes:** Use `subagent-driven-development` for the implementation slice, but keep tasks serialized because they touch the same Playwright helper/spec/docs and would race on the same files. This is not a GPT-5.5 swarm candidate: there are fewer than three independent implementation tracks, no isolated worktree benefit, and the core edit is tightly coupled in `e2e/helpers/rfsRoute.ts`.

> **Status note, 2026-06-15:** This plan originally targeted a KPDX 10L short-final bridge. The current KSEA→KPDX route/landing proof is aligned on KPDX 10R; any remaining 10L wording in this dated plan is historical context, not a current-state claim.

## Goal

Close the next proof gap between two already-scoped browser proofs:

1. KSEA final BTG→KPDX route-leg configured approach with backed `CMD_A + LNAV + SPEED` and vertical FMA `OFF`.
2. Truthful manual handoff with AP/FMA/thrust `OFF` and zero AP commands.
3. KPDX short-final landing/touchdown/rollout/reset proof on runway 10L.

The new proof should connect those phases in one browser store session:

`KSEA final route configured approach → manual AP/FMA/thrust OFF handoff → KPDX 10L short-final manual landing → braking rollout → reset cleanup`

This is a bridge proof, not a full-route/full-flight claim.

## Scope boundary / non-claims

This slice may claim only:

- a single browser store session starts with a real KSEA→KPDX flight plan loaded on active leg `BTG→KPDX`;
- route-coupled configured approach remains backed by displayed truth before handoff;
- manual handoff clears AP/FMA/thrust modes and AP command ownership while the route remains loaded;
- after the handoff, the helper seeds only the manual KPDX short-final position/configuration in the same store session;
- touchdown, rollout deceleration, and reset happen through real `tick()`, `setInput()`, and store `reset()` calls;
- touchdown is on prepared KPDX runway `10L`, with bounded sink rate and gear contact;
- reset clears route/AP/FMA state back to preflight.

This slice must not claim:

- full-flight proof;
- full-route proof;
- continuous KSEA→KPDX flight from departure;
- continuous route-coupled descent all the way to runway;
- VNAV proof;
- ILS/localizer/glideslope behavior;
- broad manual playability;
- CI/deploy/live proof.

## Acceptance test

Add a Playwright test under `e2e/rfs-route.spec.ts` that imports a new helper from `e2e/helpers/rfsRoute.ts` and proves:

1. `configuredApproach` snapshot:
   - `routeName === 'KSEA→KPDX'`
   - `activeLegIndex === 2`
   - `fromIdent === 'BTG'`
   - `nextWaypointIdent === 'KPDX'`
   - `lnavAvailable === true`
   - raw/display AP status `CMD_A`
   - raw/display lateral `LNAV`
   - raw/display thrust `SPEED`
   - raw/display vertical `OFF`
   - gear down/flaps configured, airborne, approach guidance.
2. `manualHandoff` snapshot:
   - route still loaded on `BTG→KPDX`;
   - raw/display AP/lateral/vertical/thrust all `OFF`;
   - `apCommandCount === 0`;
   - pilot/effective elevator, aileron, throttle1, throttle2 match;
   - still airborne and not landed.
3. `landingApproach` snapshot:
   - same browser store session, no reset before landing;
   - route still loaded on `BTG→KPDX`;
   - AP/FMA/thrust remain `OFF` and `apCommandCount === 0`;
   - KPDX surface sampler reports `surfaceAirport === 'KPDX'` and `surfaceRunwayId === '10L'`;
   - gear down, flaps >= 25, guidance `approach`, airborne, not landed.
4. `touchdown` snapshot:
   - `flightPhase === 'LANDED'`;
   - `groundContact === 'gear'`;
   - `weightOnWheels === true`;
   - `onRunway === true`;
   - `surfaceAirport === 'KPDX'`;
   - `surfaceRunwayId === '10L'`;
   - `0 < touchdownSinkRateMps < 15`;
   - AP/FMA/thrust remain `OFF` and `apCommandCount === 0`;
   - route still loaded until reset.
5. `rollout` snapshot:
   - ground speed is lower than touchdown speed under real brake/spoiler `setInput()` controls;
   - guidance phase is `landing-rollout` or `landed`;
   - AP/FMA/thrust remain `OFF` and `apCommandCount === 0`.
6. `reset` snapshot:
   - `flightPlan === null`;
   - `activeLegIndex === null`;
   - `apStateCleared === true`;
   - route status `NO ROUTE` / LNAV unavailable;
   - AP/FMA/thrust all `OFF`;
   - `apCommandCount === 0`;
   - `status === 'stopped'`;
   - `guidancePhase === 'preflight'`;
   - WOW true.

## Implementation tasks

### Task 1 — Browser proof helper + Playwright spec

Files:

- `e2e/helpers/rfsRoute.ts`
- `e2e/rfs-route.spec.ts`

Steps:

1. TDD RED: add the new test/import first and run:

   ```bash
   source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
   CI=1 npx playwright test e2e/rfs-route.spec.ts --project=chromium --grep "KSEA final route handoff can bridge to KPDX landing" --reporter=list
   ```

   The expected RED is a missing export or failing new helper contract, not an unrelated app-load failure.

2. Extend `rfsRoute.ts` with a new helper, likely named:

   ```ts
   flyKseaFinalRouteHandoffToKpdxLandingAndReset(page)
   ```

3. Reuse the existing route proof setup path for configured approach and manual handoff; do not duplicate the entire route setup block if avoidable.
4. Add a landing-bridge path inside the same browser `page.evaluate()` store session:
   - after `runManualHandoff()`, do not call `reset()`;
   - reposition the aircraft to a KPDX 10L short-final state using the same runway-offset math pattern already proven in `e2e/helpers/rfsFlight.ts`;
   - keep `flightPlan`, `activeLegIndex`, and route status loaded through landing/rollout;
   - keep `apState` null or OFF after handoff; no AP commands may own axes;
   - synchronize derived store state through `setInput()` before the first landing snapshot;
   - touchdown and rollout must come from real ticks and real controls.
5. Surface enough fields in the bridge snapshots for the spec to assert route state, AP/FMA truth, surface/runway evidence, touchdown evidence, rollout speed reduction, and reset cleanup.
6. TDD GREEN: run the targeted grep test until it passes.
7. Run helper typecheck:

   ```bash
   source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
   npx tsc --ignoreConfig --noEmit --target ES2022 --module ESNext --moduleResolution bundler --strict --skipLibCheck e2e/helpers/rfsRoute.ts
   ```

8. Run the full route spec:

   ```bash
   source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
   CI=1 npx playwright test e2e/rfs-route.spec.ts --project=chromium --reporter=list
   ```

9. Commit with a precise message, for example:

   ```bash
   git add e2e/helpers/rfsRoute.ts e2e/rfs-route.spec.ts
   git commit -m "test: bridge KSEA route handoff to KPDX landing"
   ```

### Task 2 — Honest docs update

Files:

- `docs/architecture.md`
- `docs/roadmap.md`
- `docs/plans/README.md`

Steps:

1. Update browser-proof language to include the new bridge proof.
2. Keep the proof boundary explicit: bridge proof only, not full-route/full-flight/continuous route-coupled descent/VNAV/live.
3. Link this plan from `docs/plans/README.md`.
4. Run `git diff --check` for edited docs and commit, for example:

   ```bash
   git add docs/architecture.md docs/roadmap.md docs/plans/README.md
   git commit -m "docs: record KSEA to KPDX landing bridge boundary"
   ```

## Review plan

After each task:

1. Parent verifies `git status`, `git log --oneline -5`, and the actual changed files.
2. Spec-compliance reviewer checks the task against this plan and returns explicit `PASS` or concrete gaps.
3. Code-quality reviewer checks for false-positive assertions, overclaims, duplicated browser setup, stale state, hidden AP commands, route reset/landing boundary mistakes, and test adequacy.
4. Fix blockers and re-review before moving on.

## Final verification

Run from repo root:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npx tsc --ignoreConfig --noEmit --target ES2022 --module ESNext --moduleResolution bundler --strict --skipLibCheck e2e/helpers/rfsRoute.ts
CI=1 npx playwright test e2e/rfs-route.spec.ts --project=chromium --reporter=list
npm run check
CI=1 npm run test:visual
git diff --check HEAD~2..HEAD
```

If `CI=1 npm run test:visual` first fails while opening the app with `Unexpected identifier 'ClassificationPipelineStage'`, inspect the Playwright error context and port state, then rerun cleanly before changing product code. Only claim the browser gate from a real passing run.

## Reporting checklist

Final report must include:

- improved proof level;
- changed files;
- commits;
- exact verification commands and pass counts;
- browser evidence summary;
- subagent review verdicts or honest controller-review fallback if subagents fail;
- non-claims: no push/deploy/live/CI/full-flight/full-route/continuous route-coupled descent/VNAV;
- local/live SHA state if checked;
- clean/dirty git status.
