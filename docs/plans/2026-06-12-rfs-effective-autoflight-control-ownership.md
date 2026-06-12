# RFS Effective Autoflight Control Ownership Plan

> **For Hermes:** Use `subagent-driven-development` for the implementation/review loop. Do not use the GPT-5.5 swarm: this is a tightly coupled truth/ownership slice in the store/simulation-step path, so serialized ordinary subagents avoid file overlap and commit races.

## Goal

Close the remaining AP/FMA honesty gap where saved or restored AP command axes can still be applied to `effectiveControls` when raw AP truth says `CMD_A` but the shared effective/autoflight truth says the mode is unbacked and should display `OFF`.

The current tree already has `deriveEffectiveAutoflightTruth()` and uses it for FMA/MCP display plus AP command generation. The remaining risk is the ownership/composition boundary: `composeControlsSlice()`, saved-scenario restore, and input sanitization still use raw `isAutopilotEngaged()` in a few places. That can preserve or apply stale `apCommands` from a malformed/restored snapshot while the display truth is OFF.

## Scope boundary / non-claims

This slice may claim only:

- AP command ownership composition uses effective autoflight engagement, not raw AP truth, when deciding whether saved/current `apCommands` may own axes;
- restored scenario snapshots with raw `CMD_A` but unbacked command-channel flags do not apply stale AP elevator/aileron/throttle commands;
- manual input sanitization does not treat an unbacked raw AP state as an active AP owner;
- existing backed AP, LNAV, SPEED, N1, route, and browser proofs remain green.

This slice must not claim:

- a complete VNAV lifecycle authority solution;
- RFMS route modification or EXEC parity;
- full-flight proof;
- full-route proof;
- route-coupled KPDX landing proof;
- CI/deploy/live proof.

## Current evidence / bug shape

Relevant current code:

- `src/sim/systems/effectiveAutoflightTruth.ts` derives backed/visible truth.
- `src/sim/systems/fmaTruth.ts` delegates display truth to `deriveEffectiveAutoflightTruth()`.
- `src/sim/systems/autopilot.ts` derives effective truth before computing AP commands.
- `src/sim/simulationStep.ts` still uses raw `isAutopilotEngaged()` inside `composeControlsSlice()` and before AP command computation.
- `src/store/simStore.ts` uses `composeControlsSlice()` during saved-scenario restore before route-aware effective context is available to that helper.
- `src/store/simStoreInputReducers.ts` gates manual AP-axis disconnects on raw `isAutopilotEngaged()`.

Likely failing scenario:

1. A saved snapshot or malformed RFMS-adapter state has `apState.truth.autopilotStatus === 'CMD_A'`.
2. The actual backing flag is missing, e.g. `apState.boeing.cmdA === false`, so PFD/FMA effective truth displays OFF.
3. The snapshot still contains stale `apCommands` from a previous active AP state, such as elevator/aileron/throttle commands.
4. Restore/control composition uses raw AP engagement and applies those stale commands to `effectiveControls` even though visible truth is OFF.

That violates the RFS north-star invariant: no hidden AP/AT/FD command may fly while the display says OFF/unbacked.

## Acceptance test

Add or update unit tests so they fail before the fix:

1. In `src/store/__tests__/simStore.test.ts`, add a test that loads a saved scenario snapshot whose raw truth says `CMD_A` / active modes but whose backing flags make effective truth OFF:
   - `apState.truth.autopilotStatus = 'CMD_A'`;
   - `apState.truth.lateralActive = 'HDG_SEL'` or `LNAV`;
   - `apState.truth.verticalActive = 'ALT_HOLD'`;
   - `apState.truth.thrustActive = 'SPEED'`;
   - `apState.boeing.cmdA = false`;
   - include stale `apCommands` with nonzero `elevator`, `aileron`, `throttle1`, and `throttle2`;
   - include neutral/different `pilotInputs`.
2. After `loadScenarioState(storage)`, assert:
   - `restored.effectiveControls.elevator === restored.pilotInputs.elevator`;
   - `restored.effectiveControls.aileron === restored.pilotInputs.aileron`;
   - `restored.effectiveControls.throttle1 === restored.pilotInputs.throttle1`;
   - `restored.effectiveControls.throttle2 === restored.pilotInputs.throttle2`;
   - `restored.apCommands` does not retain stale AP-owned axis commands, or at minimum none of those stale commands influence `effectiveControls`;
   - `restored.inputs === restored.effectiveControls`.
3. Add a direct `src/sim/__tests__/simulationStep.test.ts` regression if useful: `composeControlsSlice()` with raw `CMD_A`, `boeing.cmdA=false`, and stale AP commands must return pilot-owned `effectiveControls` and empty/ignored active AP commands.
4. Keep existing backed AP tests green: active backed `CMD_A` with supported modes still applies AP commands, and unbacked `SPEED`/`LNAV` still only drops the unbacked mode without disabling a legitimately backed autopilot.

Expected RED:

- Before the fix, the restore or direct composition test should fail because raw AP engagement applies stale AP axis commands to `effectiveControls`.

## Implementation task — effective control ownership uses shared truth

Files:

- Modify: `src/sim/simulationStep.ts`
- Modify: `src/store/simStore.ts`
- Modify: `src/store/simStoreInputReducers.ts` if needed to remove raw AP active gating from manual-axis disconnect decisions
- Modify: `src/sim/__tests__/simulationStep.test.ts` and/or `src/store/__tests__/simStore.test.ts`

Steps:

1. TDD RED: add the failing saved-scenario/control-composition test first and run the narrow target:

   ```bash
   source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
   npx vitest run src/store/__tests__/simStore.test.ts src/sim/__tests__/simulationStep.test.ts --runInBand
   ```

   Expected RED: stale AP commands apply to effective controls for an unbacked raw AP state.

2. Minimal implementation:
   - Import and use `effectiveAutopilotIsEngaged()` / `deriveEffectiveAutoflightTruth()` at the control-composition boundary.
   - Make `composeControlsSlice()` decide AP command ownership from effective truth, not raw `ap.truth.autopilotStatus`.
   - Let `composeControlsSlice()` accept enough context (`aircraft`, `flightPlan`, `routeStatus`) for route-aware effective truth where the caller has it.
   - In `advanceSimulationStep()`, compute `routeBeforeTick` first, derive effective AP engagement from `{ aircraft: state, flightPlan, routeStatus: routeBeforeTick }`, and use that same truth context for command computation and control composition.
   - In saved-scenario restore, compute `routeStatus` before `composeControlsSlice()` and pass `{ aircraft, flightPlan, routeStatus }` into composition so restored effective controls cannot apply stale AP commands when effective truth is OFF.
   - In `setInput()` / `applyInputActions()`, use effective AP engagement for disconnect/sanitize decisions. Do not treat an unbacked raw AP state as an active AP owner.
   - Preserve existing semantics for backed Boeing `CMD_A` plus supported HDG/LNAV/ALT/VS/SPEED/N1 modes.
   - Do not widen Airbus/RFMS behavior in this slice.

3. GREEN: rerun the narrow vitest command until the new regression and neighboring tests pass.

4. Run broader targeted tests:

   ```bash
   source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
   npx vitest run src/sim/systems/__tests__/effectiveAutoflightTruth.test.ts src/sim/__tests__/simulationStep.test.ts src/store/__tests__/simStore.test.ts src/instruments/__tests__/RfsMCP.test.tsx src/instruments/__tests__/RfsPFD.test.tsx --runInBand
   ```

5. Run typecheck and diff hygiene for touched files:

   ```bash
   source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
   npm run typecheck
   git diff --check -- src/sim/simulationStep.ts src/store/simStore.ts src/store/simStoreInputReducers.ts src/sim/__tests__/simulationStep.test.ts src/store/__tests__/simStore.test.ts
   ```

6. Commit:

   ```bash
   git add src/sim/simulationStep.ts src/store/simStore.ts src/store/simStoreInputReducers.ts src/sim/__tests__/simulationStep.test.ts src/store/__tests__/simStore.test.ts
   git commit -m "fix: gate AP command ownership on effective truth"
   ```

## Docs task — honest proof-boundary update

Files:

- Modify: `docs/architecture.md`
- Modify: `docs/roadmap.md`
- Modify: `docs/plans/README.md`

Steps:

1. Update `docs/architecture.md` browser/implementation wording to mention that AP command ownership/control composition now uses effective backed truth, including saved/restored stale-command cleanup.
2. Update `docs/roadmap.md` completed baseline / P0 wording to reflect this local truth gap is closed for AP command ownership, while preserving remaining VNAV lifecycle / RFMS route-edit / full-flight / CI/live work.
3. Add this plan to `docs/plans/README.md` current source-of-truth list as a completed/current AP/FMA truth-tightening record once implementation is done.
4. Run:

   ```bash
   git diff --check docs/architecture.md docs/roadmap.md docs/plans/README.md
   ```

5. Commit:

   ```bash
   git add docs/architecture.md docs/roadmap.md docs/plans/README.md
   git commit -m "docs: record effective autoflight control ownership"
   ```

## Review plan

After implementation:

- Spec review checks the acceptance test proves unbacked raw AP truth cannot apply stale AP commands to effective controls, especially after saved-scenario restore.
- Code-quality review checks the fix is minimal, uses the shared effective truth helper rather than duplicating backing logic, preserves backed AP behavior, and does not fabricate route/FMA state.
- Docs review checks wording stays honest and non-claims remain explicit.

## Final verification

Run from `/Users/reidar/Projectos/RFS`:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
npx vitest run src/sim/systems/__tests__/effectiveAutoflightTruth.test.ts src/sim/__tests__/simulationStep.test.ts src/store/__tests__/simStore.test.ts src/instruments/__tests__/RfsMCP.test.tsx src/instruments/__tests__/RfsPFD.test.tsx --runInBand
npm run check
CI=1 npm run test:visual
git diff --check <slice-base>..HEAD
```

If any browser/visual gate fails with a known transient app-load issue, inspect `test-results/**/error-context.md` and process/port state, rerun cleanly, and only claim browser success after a real pass.
