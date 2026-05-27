# RFS Advanced Gear/Tire Ground Handling Implementation Plan

> **For Hermes:** Use subagent-driven-development skill for review, but execute cross-cutting physics edits directly in the parent session.

**Goal:** Continue the P1 roadmap by making RFS ground handling less arcade-like through tested tire side-load behavior, then prepare follow-up anti-skid/asymmetric-braking work.

**Architecture:** Keep physics conventions unchanged: body axes x-forward/y-right/z-down, NED down-positive, and store velocity ground-relative. Extend the existing `src/sim/systems/ground.ts` post-solve runway model with pure tire-force helpers first, then apply those forces only while gear stations carry weight. Avoid UI changes in this slice; no player-facing control mapping changes until the pure ground model is proven.

**Tech Stack:** TypeScript strict, Vitest, RFS 6-DOF physics, Zustand store integration through existing `integrate()` ground-contact call.

---

## Current baseline

Relevant files:

- `src/sim/systems/ground.ts` already has station loads, rolling/brake deceleration, nosewheel steering, touchdown damping, and runway-normal velocity constraint.
- `src/sim/systems/__tests__/ground.test.ts` is the primary regression target for ground-system contracts.
- `docs/roadmap.md` now lists advanced P1 ground/tire gaps: dynamic oleo response, tire cornering stiffness/side-loads, asymmetric braking, anti-skid, crosswind ground handling, rollout/taxi scenarios, and gear-up belly-contact handling.

Required command prefix for all test/build work:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
```

---

## Task 1 [PARENT-DIRECT]: Add tire side-force/cornering stiffness helper

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

**Objective:** Prepare directional braking realism without changing the current keyboard/gamepad UI.

**Files:**

- Modify: `src/sim/types.ts`
- Modify: `src/sim/systems/ground.ts`
- Modify: `src/sim/systems/__tests__/ground.test.ts`

**Test first:**

- Symmetric brake input keeps zero brake yaw moment.
- Left/right brake deltas create opposite yaw moments around the main gear.
- Anti-skid limiting caps brake force to available tire friction and avoids reversing the aircraft through zero speed.

**Note:** This task should be deferred until Task 1 is green and reviewed; it may require optional `leftBrake`/`rightBrake` fields or a separate internal braking command type.

---

## Task 3: Update docs and roadmap status

**Objective:** Keep current-state docs honest after the tire side-load slice lands.

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

## Final verification before reporting

Run the full gate:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check
```

If changes are pushed to `master`, do not report deployment until GitHub Actions shows `completed` + `success` and `curl -fsSI https://fly.reidar.tech/` succeeds.
