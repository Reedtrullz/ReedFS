# RFS Advanced Gear/Tire Ground Handling Implementation Plan

> **For Hermes:** Use subagent-driven-development skill for review, but execute cross-cutting physics edits directly in the parent session.

**Goal:** Continue the P1 roadmap by making RFS ground handling less arcade-like through tested tire side-load behavior, then prepare follow-up anti-skid/asymmetric-braking work.

**Architecture:** Keep physics conventions unchanged: body axes x-forward/y-right/z-down, NED down-positive, and store velocity ground-relative. Extend the existing `src/sim/systems/ground.ts` post-solve runway model with pure tire-force helpers first, then apply those forces only while gear stations carry weight. Avoid UI changes in this slice; no player-facing control mapping changes until the pure ground model is proven.

**Tech Stack:** TypeScript strict, Vitest, RFS 6-DOF physics, Zustand store integration through existing `integrate()` ground-contact call.

---

## Current baseline

Relevant files:

- `src/sim/systems/ground.ts` already has station loads, dynamic oleo spring/damper compression, rolling/brake deceleration, nosewheel steering, touchdown damping, gear-up belly/crash slide damping, and runway-normal velocity constraint.
- `src/sim/systems/__tests__/ground.test.ts` is the primary regression target for ground-system contracts.
- `docs/roadmap.md` now lists remaining advanced P1 ground/tire gaps: deeper rollout/taxi and crosswind landing scenarios, optional player-facing differential brake controls, and non-runway surfaces.

Required command prefix for all test/build work:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
```

---

## Task 1 [PARENT-DIRECT]: Add tire side-force/cornering stiffness helper

**Status:** Complete in `07e97ed feat: add tire side-load ground handling`.

**Objective:** Replace the current fixed lateral scrub damping with a normal-force-scaled tire side-force model that opposes lateral slip and exposes yaw moment for crosswind/taxi handling.

**Files:**

- Modify: `src/sim/systems/ground.ts`
- Modify: `src/sim/systems/__tests__/ground.test.ts`

**Step 1: Write failing tests**

Add tests that prove:

- Positive body lateral velocity (`v > 0`, rightward skid) produces a negative tire side force.
- Tire side force is friction-limited by loaded gear normal force and zero when gear is unloaded.
- `applyGroundContact()` reduces lateral velocity on loaded wheels without relying on a fixed per-second multiplier.

**Step 2: Verify RED**

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/systems/__tests__/ground.test.ts
```

Expected: FAIL because `computeTireSideForces` does not exist yet.

**Step 3: Implement minimal code**

Add a pure exported helper in `ground.ts` and call it from the gear-contact path after nosewheel steering has updated station steering angles.

Constraints:

- Side force must oppose body lateral slip.
- Side force must scale with loaded gear station normal force.
- Side force must clamp to a bounded tire friction coefficient.
- Applying the force must not flip lateral velocity through zero during neutral steering.
- Preserve existing nosewheel steering behavior and runway-normal velocity constraint.

**Step 4: Verify GREEN**

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/systems/__tests__/ground.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/sim/systems/ground.ts src/sim/systems/__tests__/ground.test.ts docs/plans/2026-05-27-rfs-advanced-gear-tire-ground-handling.md
git commit -m "feat: add tire side-load ground handling"
```

---

## Task 2 [PARENT-DIRECT]: Add asymmetric braking and anti-skid pure helpers

**Status:** Complete in the current follow-up after `07e97ed`; implemented as `ground.ts` pure-helper `BrakeCommand`/`computeWheelBrakeForces()` behavior without changing `ControlInputs` or player-facing UI.

**Objective:** Prepare directional braking realism without changing the current keyboard/gamepad UI.

**Files:**

- Modify: `src/sim/systems/ground.ts`
- Modify: `src/sim/systems/__tests__/ground.test.ts`
- No `src/sim/types.ts` change was required because Task 2 used a ground-system-local brake command type rather than extending player controls.

**Test first:**

- Symmetric brake input keeps zero brake yaw moment.
- Left/right brake deltas create opposite yaw moments around the main gear.
- Anti-skid limiting caps brake force to available tire friction and avoids reversing the aircraft through zero speed.

**Note:** This task should be deferred until Task 1 is green and reviewed; it may require optional `leftBrake`/`rightBrake` fields or a separate internal braking command type.

---

## Task 3: Update docs and roadmap status

**Objective:** Keep current-state docs honest after the tire side-load and brake-force slices land.

**Files:**

- Modify: `docs/architecture.md`
- Modify: `docs/roadmap.md`
- Modify: `README.md` if its completed-baseline summary changes.

**Verification:**

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check
```

Expected: PASS.

---

## Task 4 [PARENT-DIRECT]: Add dynamic oleo strut spring/damper loads

**Status:** Complete in the current follow-up after `8c04058`; implemented as `ground.ts` pure-helper `computeOleoStrutLoads()` behavior wired into gear contact.

**Objective:** Move beyond purely static station compression by giving loaded gear stations tested spring/damper normal loads during runway penetration and touchdown sink-rate events, while preserving the post-solve runway-normal constraint and existing ground-force consumers.

**Files:**

- Modify: `src/sim/systems/ground.ts`
- Modify: `src/sim/systems/__tests__/ground.test.ts`
- Modify docs after the slice lands: `README.md`, `docs/architecture.md`, `docs/roadmap.md`

**Test first:**

- Oleo spring compression increases a station's compression and normal force when the aircraft penetrates the runway plane.
- Oleo damping adds transient normal force for positive runway-normal sink rate but not for upward/rebound motion.
- `applyGroundContact()` reports dynamic station loads on touchdown without breaking static load distribution for settled ground contact.

**Constraints:**

- Keep body axes x-forward/y-right/z-down and NED down-positive.
- Compute dynamic loads only for gear stations carrying weight; airborne or belly/crash contact must still clear gear station load.
- Preserve runway-normal velocity constraint and no-reversal braking/side-load safeguards.
- Avoid player-facing UI/control changes in this slice.

---

## Task 5 [PARENT-DIRECT]: Add crosswind runway/taxi scenario coverage and weathercocking guards

**Status:** Complete in the current follow-up after `43f339c`; implemented with wind-capable fixed-step scenario helpers, crosswind/weathercocking regressions, and B737 pedal-scale nosewheel steering limits.

**Objective:** Lock down crosswind ground behavior with deterministic scenario tests before deeper rollout/taxi tuning. The current `rudder` input represents rudder pedals, not a separate tiller, so nosewheel steering must stay in a realistic pedal-authority range during crosswind takeoff rolls while still permitting low-speed taxi turns.

**Files:**

- Modify: `src/sim/systems/ground.ts`
- Modify: `src/sim/systems/__tests__/ground.test.ts`
- Modify: `src/sim/__tests__/scenarioHelpers.ts`
- Modify: `src/sim/physics/__tests__/integrate.test.ts`
- Modify docs after the slice lands: `README.md`, `docs/architecture.md`, `docs/roadmap.md`

**Test first:**

- Full rudder-pedal nosewheel steering at taxi speed is limited to B737 pedal-scale authority rather than tiller-scale 45-degree authority, and fades out at takeoff speed.
- Fixed-step scenario helper can run deterministic wind/crosswind cases without mutating ground velocity through the wind helper.
- Opposite direct crosswinds create symmetric weathercock heading tendencies into the wind during a takeoff roll.
- A modest counter-rudder crosswind takeoff roll remains bounded in heading/lateral drift instead of spinning across the runway due to excessive nosewheel steering.

**Constraints:**

- Keep `ControlInputs.rudder` as rudder-pedal input; do not add tiller or differential-brake UI in this slice.
- Preserve the wind contract: wind affects air-relative velocity only and never destructively mutates ground-relative `state.velocity`.
- Preserve stopped-aircraft safeguards: held rudder while stopped must not create lateral motion or yaw in place.
- Avoid broad aero retuning; this slice is a ground/runway behavior guard.

---

## Task 6 [PARENT-DIRECT]: Add gear-up belly/crash slide behavior

**Status:** Complete in the current follow-up after `41e67ff`; implemented with deterministic gear-up runway-tangent belly/crash slide deceleration, no-reverse low-speed clamping, and stronger hard-crash angular damping.

**Objective:** Move gear-up contact beyond a marker-only `belly`/`crashed` state by applying deterministic slide deceleration and angular damping when the fuselage contacts the runway without usable landing gear. The behavior should remain conservative: prevent sink-through, avoid reversing horizontal velocity, and distinguish hard crash contact from lower-energy belly slide.

**Files:**

- Modify: `src/sim/systems/ground.ts`
- Modify: `src/sim/systems/__tests__/ground.test.ts`
- Modify docs after the slice lands: `README.md`, `docs/architecture.md`, `docs/roadmap.md`

**Test first:**

- Gear-up belly contact below the runway reduces horizontal slide speed while preserving explicit `belly` contact state.
- Belly-slide deceleration clamps at zero instead of reversing low-speed ground-relative velocity.
- Hard gear-up crash contact from high runway-normal sink rate decelerates and damps angular rates more aggressively than a lower-energy belly slide, and remains `crashed` across fixed-step slide updates.

**Constraints:**

- Keep body axes x-forward/y-right/z-down and NED down-positive.
- Continue classifying gear-up contact using runway-normal sink rate, not body-axis `w` alone.
- Do not treat gear-up belly/crash contact as `weightOnWheels`; gear station loads should remain cleared.
- Do not add aircraft damage UI, crash reset flow, or player-facing controls in this slice.

---

## Final verification before reporting

Run the full gate:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check
```

If changes are pushed to `master`, do not report deployment until GitHub Actions shows `completed` + `success` and `curl -fsSI https://fly.reidar.tech/` succeeds.
