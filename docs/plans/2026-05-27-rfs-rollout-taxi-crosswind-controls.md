# RFS Rollout, Taxi, Crosswind, and Differential Brake Controls Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task. Parent-direct is allowed for tasks that touch shared control/input shapes across multiple layers.

**Goal:** Finish the next P1 ground-handling slice by adding deterministic rollout/taxi/crosswind landing regressions and player-facing differential brake controls without weakening the existing KSEA runway/off-runway surface contract.

**Architecture:** Keep the existing `brake` input as symmetric braking for backward compatibility, then add optional/explicit left/right brake channels that ground physics converts into per-main-gear brake commands. Keyboard/input layers expose left/right brake as momentary controls; `Space` remains symmetric braking. Scenario tests must set KSEA runway heading and position explicitly so they test landing/rollout behavior rather than accidental off-runway drift.

**Tech Stack:** TypeScript strict, Vitest, React, Zustand, RFS 6-DOF physics, KSEA surface sampler, Node 22 via nvm.

---

## Scope and non-goals

In scope:

- More detailed deterministic landing/rollout/crosswind scenario coverage.
- Differential brake command path through `ControlInputs` -> `InputActions`/`InputManager` -> `simStore` -> `ground.ts`.
- Keyboard and help/settings surface for left/right brake controls.
- Docs/roadmap update after behavior is green.

Out of scope for this slice:

- Full terrain mesh collision outside KSEA.
- Non-KSEA airport surface datasets.
- Separate low-speed tiller axis.
- RFMS route edit UI or advanced LNAV/VNAV.
- Worker physics enablement.

## Required command prefix

Use Node 22 for all npm/vitest work:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
```

## Critical contracts

- Wind and gusts must remain pure air-relative inputs and must not mutate `state.velocity` directly.
- `state.velocity` remains ground-relative body velocity.
- `GroundState.onRunway` means prepared KSEA runway, not generic ground contact.
- Off-runway `gear`/`belly`/`crashed` contact remains explicit ground contact.
- Rudder pedals are not a tiller; do not increase current 7° pedal steering authority.
- Differential brakes must not yaw a parked aircraft in place. Existing stopped differential brake safeguards in `computeWheelBrakeForces()` must remain true.
- Symmetric `brake` must continue to work and must be equivalent to applying equal left/right brakes.

## Dependency map

Task 1 adds scenario coverage and helper patterns first.
Task 2 adds the differential brake physics/control shape.
Task 3 exposes player input/UI controls once the physics path exists.
Task 4 updates docs/status after code behavior is green.

---

## Task 1: Add deterministic rollout/taxi/crosswind landing regressions

**Objective:** Expand integration-level coverage so landing/rollout/crosswind behavior is guarded before adding more controls.

**Files:**

- Modify: `src/sim/physics/__tests__/integrate.test.ts`
- Optional Modify: `src/sim/__tests__/scenarioHelpers.ts` only if a helper is clearly reusable and small.

**Step 1: Write failing tests**

Add tests that explicitly seed KSEA runway geometry:

1. A low-speed taxi/rudder-pedal scenario at KSEA 16L heading that proves heading changes at taxi speed while the aircraft remains prepared-runway contact.
2. A crosswind approach/touchdown/rollout scenario that proves touchdown occurs, phase becomes `LANDED`, side velocity is damped during rollout, and `ground.onRunway` remains true when the initial conditions are on the prepared runway.
3. A rejected/rollout braking distance sanity test that proves braking reduces groundspeed substantially without reversing.

Implementation notes:

- Use `KSEA_RUNWAY_16L.start`, `KSEA_RUNWAY_16L.headingDeg`, and `KSEA_RUNWAY_ALT_FT`.
- Use existing `setRunwayHeading()` style helper in the file; do not rely on default south heading for long rollouts.
- Keep tests deterministic and local to `integrate.test.ts` unless a helper reduces duplication.

**Step 2: Verify RED**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/physics/__tests__/integrate.test.ts
```

Expected: any assertion describing currently missing or undertested behavior should fail before production fixes. If a new scenario already passes because the behavior exists, keep it as a regression guard and record that no production change was needed for that assertion.

**Step 3: Minimal implementation**

Prefer helper-only/setup fixes first. Do not change production physics unless a test exposes a real behavior bug.

**Step 4: Verify GREEN**

Run targeted test again, then:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/physics/__tests__/integrate.test.ts src/sim/systems/__tests__/ground.test.ts
```

**Step 5: Commit**

```bash
git add src/sim/physics/__tests__/integrate.test.ts src/sim/__tests__/scenarioHelpers.ts
git commit -m "test: expand rollout and crosswind landing regressions"
```

---

## Task 2: Wire differential brake commands through ground physics

**Objective:** Let the physics consume independent left/right brake channels while preserving symmetric `brake` compatibility.

**Files:**

- Modify: `src/sim/types.ts`
- Modify: `src/sim/systems/ground.ts`
- Modify: `src/sim/systems/__tests__/ground.test.ts`
- Modify any typed test fixtures that need explicit default fields.

**Step 1: Write failing tests**

In `ground.test.ts`, add behavior tests:

- `computeGroundRollForces()` with `brake: 0, leftBrake: 1, rightBrake: 0` produces a nonzero yaw moment while rolling forward.
- `computeWheelBrakeForces()` confirms the same side-specific command loads only the left main station.
- `brake: 1` remains equivalent to `leftBrake: 1, rightBrake: 1` for total brake force/yaw neutrality.
- At zero speed, differential brake commands produce zero active brake force/yaw moment.
- Reverse rolling preserves the existing yaw sign reversal behavior for side-specific commands.

**Step 2: Verify RED**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/systems/__tests__/ground.test.ts
```

Expected: tests fail because `ControlInputs`/`computeGroundRollForces()` do not yet read side-specific brake channels.

**Step 3: Minimal implementation**

- Extend `ControlInputs` with `leftBrake` and `rightBrake` channels, preferably keeping them optional or defaulted to avoid disruptive migrations.
- Add a small helper in `ground.ts`, e.g. `brakeCommandFromInputs(inputs)`, that clamps all brake inputs and combines symmetric plus side-specific brakes as:
  - left command = `max(inputs.brake, inputs.leftBrake ?? 0)`
  - right command = `max(inputs.brake, inputs.rightBrake ?? 0)`
- Keep `computeWheelBrakeForces()` as the per-station primitive.
- Update `computeGroundRollForces()` to call `computeWheelBrakeForces(state, brakeCommandFromInputs(inputs), ...)`.

**Step 4: Verify GREEN**

Run targeted tests, then typecheck:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/systems/__tests__/ground.test.ts && npx tsc -b --pretty false
```

**Step 5: Commit**

```bash
git add src/sim/types.ts src/sim/systems/ground.ts src/sim/systems/__tests__/ground.test.ts
git commit -m "feat: support differential brake physics"
```

---

## Task 3: Expose player differential brake input and help/settings

**Objective:** Give players momentary keyboard controls for left/right braking while keeping `Space` as symmetric braking.

**Files:**

- Modify: `src/input/InputManager.ts`
- Modify: `src/input/keyboardControls.ts`
- Modify: `src/input/controlBindings.ts`
- Modify: `src/input/__tests__/InputManager.test.ts`
- Modify: `src/input/__tests__/keyboardControls.test.ts`
- Modify: `src/input/__tests__/controlBindings.test.ts`
- Modify: `src/store/simStore.ts`
- Modify: `src/store/__tests__/simStore.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/__tests__/App.test.tsx`
- Modify: `src/components/ControlsHelp.tsx`
- Modify: `src/components/__tests__/ControlsSettings.test.tsx` only if binding assumptions need updates.

**Step 1: Write failing tests**

Add tests proving:

- `computeHeldKeyActions(new Set(['z']))` returns left-brake action only.
- `computeHeldKeyActions(new Set(['x']))` returns right-brake action only.
- Holding `Space` still returns symmetric `brake: 1`.
- `updateInputManager()` propagates left/right brake channels momentarily and resets them to zero when released.
- `inputManagerStateToControlInputs()` includes side-specific brake channels.
- `App.tsx` tracks `z`/`x` as held keys in the live key path and clears `leftBrake`/`rightBrake` on cleanup/blur with the rest of the held controls.
- `useSimStore.applyInputActions({ leftBrake: 1 }, dt)` updates pilot/effective controls without disconnecting AP axes unless pitch/roll/throttle are manually changed.
- Control bindings validate without duplicates and display a differential brake row.

Suggested keys:

- `Z`: left brake
- `X`: right brake
- `Space`: symmetric brakes

**Step 2: Verify RED**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/input/__tests__/InputManager.test.ts src/input/__tests__/keyboardControls.test.ts src/input/__tests__/controlBindings.test.ts src/store/__tests__/simStore.test.ts src/components/__tests__/ControlsSettings.test.tsx src/__tests__/App.test.tsx
```

Expected: new tests fail until input/state bindings are implemented.

**Step 3: Minimal implementation**

- Extend `InputActions` and `InputManagerState` with `leftBrake` and `rightBrake`.
- Merge brake actions using max/clamped semantics like symmetric brake.
- Add `leftBrake`/`rightBrake` to `InputManagedControlInputs` and `inputManagerStateToControlInputs()`.
- Update `simStore` seed/sync/control patch logic for side-specific brakes.
- Normalize old persisted snapshots and scenario/reset/start-takeoff defaults so missing `leftBrake`/`rightBrake` become zero and stale side-brake values do not survive into a new takeoff roll.
- Update `App.tsx` held-key allowlist from `['w', 's', 'a', 'd', 'q', 'e', ' ']` to include `z` and `x`; clear side brakes on unmount/visibility cleanup.
- Keep RTO brake latch setting symmetric `brake: 1`; it need not set left/right because symmetric brake supersedes both sides in `ground.ts`.
- Update keyboard actions and help/settings labels.

**Step 4: Verify GREEN**

Run targeted tests, then:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/input/__tests__/InputManager.test.ts src/input/__tests__/keyboardControls.test.ts src/input/__tests__/controlBindings.test.ts src/store/__tests__/simStore.test.ts src/components/__tests__/ControlsSettings.test.tsx src/__tests__/App.test.tsx
```

**Step 5: Commit**

```bash
git add src/input src/store src/components src/App.tsx src/__tests__/App.test.tsx
git commit -m "feat: expose differential brake controls"
```

---

## Task 4: Update docs and roadmap status

**Objective:** Keep current-state docs accurate after expanded rollout/crosswind coverage and differential brake controls land.

**Files:**

- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/physics-invariants.md`
- Modify: `docs/roadmap.md`
- Modify: `docs/plans/README.md`
- Modify: this plan file with implementation status.

**Step 1: Update docs**

Docs must state:

- Symmetric brake still works.
- Side-specific brake channels exist for player differential braking.
- Differential braking is tied to actual rolling direction and cannot yaw a parked aircraft.
- Rollout/taxi/crosswind landing regressions now cover the next P1 ground-handling slice.
- Remaining P1 scope should no longer list player-facing differential brakes as pending; remaining scope is deeper tuning, terrain mesh collision, and non-KSEA airport surfaces.

**Step 2: Verify docs/search**

Run:

```bash
git diff --check
```

Use search tools for stale phrases:

- `Player-facing differential brake controls if desired`
- `differential brake controls if desired`
- `Remaining advanced scope`

**Step 3: Commit**

```bash
git add README.md docs/architecture.md docs/physics-invariants.md docs/roadmap.md docs/plans/README.md docs/plans/2026-05-27-rfs-rollout-taxi-crosswind-controls.md
git commit -m "docs: document differential brake ground handling"
```

---

## Final verification before reporting

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check && npm run test:visual
```

Then push and verify exactly:

```bash
git push origin master
gh run list --repo Reedtrullz/ReedFS --branch master --limit 1 --json databaseId,headSha,status,conclusion,workflowName,url
gh run watch <run-id> --repo Reedtrullz/ReedFS --exit-status
gh run list --repo Reedtrullz/ReedFS --branch master --limit 1 --json databaseId,headSha,status,conclusion,workflowName,url
curl -fsSI https://fly.reidar.tech/
git status --short
```

Do not report CI/CD or deployment success unless GitHub Actions shows `status: completed`, `conclusion: success`, and the live endpoint returns HTTP 200.
