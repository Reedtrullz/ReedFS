# RFS Meaningful-Use Remediation Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task. Use a fresh subagent per safe task with two-stage review. Execute `[PARENT-DIRECT]` tasks in the parent session because they touch the runtime heartbeat, physics/contact model, scheduler/worker runtime, deploy, or external governance.

**Goal:** Fix every issue uncovered in the 2026-06-13 strict meaningful-use round-2 review and move RFS toward a browser flight simulator that can be used meaningfully.

**Architecture:** The plan works from proof boundaries outward: black-box player-loop acceptance first, then player setup/takeoff truth, autoflight/VNAV/A/T ownership, landing/ground/FDM realism, product UI/accessibility/cockpit, runtime/performance, and release/OSS governance. All simulation changes preserve the documented heartbeat in `docs/architecture.md`: clone aircraft -> route status -> AP commands -> effective controls -> `integrate()` -> route/guidance recompute -> Zustand commit.

**Tech Stack:** React 19, TypeScript 6, Vite, Zustand 5, Vitest 4, Playwright, CesiumJS, Three.js, Docker, GitHub Actions, nginx.

---

## Source context read before writing this plan

- `docs/reviews/2026-06-13-rfs-meaningful-use-deep-review-round2.md`
- `docs/architecture.md`
- `docs/physics-invariants.md`
- `docs/roadmap.md`
- `docs/plans/README.md`
- `package.json`
- `.github/workflows/ci.yml`, `Dockerfile`, `nginx.conf`, `.dockerignore`
- Representative current source/test files under `src/sim`, `src/store`, `src/instruments`, `src/components`, `src/viewport`, `src/input`, and `e2e`.

## Non-claims and permissions

- This plan is not implementation and not proof that RFS is meaningful-use ready.
- Do not push, deploy, rewrite history, apply stash, read secrets, or change credentials unless the user explicitly authorizes that in the active session.
- CI success requires a completed/success GitHub Actions run for the exact SHA.
- Live/deployed success requires fetching `https://fly.reidar.tech/rfs-version.json` and proving the live SHA equals the intended SHA.
- Seeded/scoped proofs remain valuable but cannot be reported as full-flight/full-route/player-loop proof.

## Global execution rules

1. Before every npm/node command:
   ```bash
   source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
   ```
2. Before Playwright proof, avoid stale Vite reuse:
   ```bash
   lsof -nP -iTCP:5173 -sTCP:LISTEN || true
   ```
   Prefer `CI=1 npx playwright test ...` so Playwright owns the server.
3. For physics/autoflight/runtime tasks, reread `docs/physics-invariants.md` and preserve axes/signs/wind/contact/order contracts.
4. Add RED tests first. If a full acceptance test is too large to make pass in one task, split prerequisites before adding it to the always-run gate.
5. Commit after coherent task groups. Do not let parallel subagents commit in the same worktree.
6. Do not stage read-only files. `git add` commands in this plan list repo paths only.

## Dependency map

- **Must serialize:** Tasks 1-7, 14-23, 34-36, 49-50.
- **Physics parent-direct:** Tasks 4-5, 10-13, 17-19, 24-25.
- **Runtime parent-direct:** Tasks 34-36 and 38.
- **Deploy/governance parent-direct:** Tasks 30-33, 41-45, 49-50 when they touch workflows, Docker, branch protection, push, CI, or live verification.
- **Can parallelize after Task 1:** UI/accessibility/product tasks 25-29 and product/OSS tasks 37-48 if they do not touch the same files.

## Issue-to-task matrix

| Finding | Primary task(s) |
|---|---|
| RFS-MU2-001 | 1, 2, 6, 7, 50 |
| RFS-MU2-002 | 8, 9, 50 |
| RFS-MU2-003 | 5, 10, 11, 50 |
| RFS-MU2-004 | 2, 3, 50 |
| RFS-MU2-005 | 4, 5, 50 |
| RFS-MU2-006 | 7, 12, 13, 50 |
| RFS-MU2-007 | 14 |
| RFS-MU2-008 | 6, 15, 16 |
| RFS-MU2-009 | 49, 50 |
| RFS-MU2-010 | 17 |
| RFS-MU2-011 | 18 |
| RFS-MU2-012 | 9, 19 |
| RFS-MU2-013 | 20 |
| RFS-MU2-014 | 7, 21 |
| RFS-MU2-015 | 22 |
| RFS-MU2-016 | 16, 28 |
| RFS-MU2-017 | 23 |
| RFS-MU2-018 | 24 |
| RFS-MU2-019 | 25 |
| RFS-MU2-020 | 26 |
| RFS-MU2-021 | 27 |
| RFS-MU2-022 | 28 |
| RFS-MU2-023 | 3 |
| RFS-MU2-024 | 29 |
| RFS-MU2-025 | 30 |
| RFS-MU2-026 | 31 |
| RFS-MU2-027 | 32 |
| RFS-MU2-028 | 33 |
| RFS-MU2-029 | 34 |
| RFS-MU2-030 | 35 |
| RFS-MU2-031 | 36 |
| RFS-MU2-032 | 37 |
| RFS-MU2-033 | 38 |
| RFS-MU2-034 | 39 |
| RFS-MU2-035 | 40 |
| RFS-MU2-036 | 41 |
| RFS-MU2-037 | 42 |
| RFS-MU2-038 | 43 |
| RFS-MU2-039 | 44 |
| RFS-MU2-040 | 20, 45 |
| RFS-MU2-041 | 30 |
| RFS-MU2-042 | 46 |
| RFS-MU2-043 | 47 |
| RFS-MU2-044 | 48 |
| RFS-MU2-045 | 27 |
| RFS-MU2-046 | 29 |

---
### Task 1: Add no-store-mutation black-box E2E guard

**Objective:** Prevent future meaningful-use tests from cheating through app internals.

**Covers findings:** RFS-MU2-001

**Files:**
- Create: `scripts/check-blackbox-e2e.mjs`
- Modify: `package.json`
- Create: `e2e/rfs-blackbox-player-loop.spec.ts`
- Create: `e2e/helpers/rfsBlackbox.ts`

**Step 1: Write failing test/check**

Guard script fails when `e2e/rfs-blackbox-player-loop.spec.ts` or any helper it imports for the black-box proof contains `useSimStore`, `setState(`, `/src/store/simStore.ts`, direct app-module imports, `aircraft: {`, or `flightPlan: {`.

**Step 2: Run test/check to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check:blackbox`

Expected: FAIL for the behavior described in Step 1, not a syntax/import error. If the command unexpectedly passes before implementation, tighten the test so it proves the finding.

**Step 3: Write minimal implementation**

- Add `check:blackbox` script in `package.json`.
- Create the black-box spec and `e2e/helpers/rfsBlackbox.ts` with Playwright page interactions only; the guard must scan the spec plus this helper/import surface.
- Allow DOM reads; forbid app-module imports, direct Zustand/aircraft/route mutation, and helper-hidden store-backed `page.evaluate()` cheating.

**Step 4: Run test/check to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check:blackbox`

Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx playwright test e2e/rfs-blackbox-player-loop.spec.ts --list`

Expected: PASS or, for explicitly external/manual checks, record the exact blocker without claiming completion.

**Step 6: Commit**

```bash
git add scripts/check-blackbox-e2e.mjs package.json e2e/rfs-blackbox-player-loop.spec.ts e2e/helpers/rfsBlackbox.ts
git commit -m "test: guard black-box player-loop proof"
```

### Task 2: Prove visible KSEA route load and takeoff setup

**Objective:** Start the player-loop proof with route loading and setup discoverability through visible UI.

**Covers findings:** RFS-MU2-001, RFS-MU2-004

**Files:**
- Modify: `e2e/rfs-blackbox-player-loop.spec.ts`
- Modify: `src/components/ScenarioPanel.tsx` if stable labels are missing
- Modify: `src/App.tsx` if visible status/setup copy is missing

**Step 1: Write failing test/check**

Playwright test: fresh app -> click `LOAD PLAN` -> visible `KSEA→KPDX` -> visible flaps/trim/throttle setup copy. Expected initial failure on setup discoverability.

**Step 2: Run test/check to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npx playwright test e2e/rfs-blackbox-player-loop.spec.ts -g "KSEA route" --reporter=line`

Expected: FAIL for the behavior described in Step 1, not a syntax/import error. If the command unexpectedly passes before implementation, tighten the test so it proves the finding.

**Step 3: Write minimal implementation**

- Expose route-load result text in an accessible live region.
- Keep user-preferred manual START ROLL policy; solve discoverability with visible controls/help.
- Use role/text assertions, not screenshots only.

**Step 4: Run test/check to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npx playwright test e2e/rfs-blackbox-player-loop.spec.ts -g "KSEA route" --reporter=line`

Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check:blackbox`

Expected: PASS or, for explicitly external/manual checks, record the exact blocker without claiming completion.

**Step 6: Commit**

```bash
git add e2e/rfs-blackbox-player-loop.spec.ts src/components/ScenarioPanel.tsx src/App.tsx
git commit -m "test: prove visible route setup path"
```

### Task 3: Add visible takeoff setup panel and unify flap detents

**Objective:** Make takeoff configuration discoverable and make all flap controls share one detent model.

**Covers findings:** RFS-MU2-004, RFS-MU2-023

**Files:**
- Create: `src/components/TakeoffSetupPanel.tsx`
- Create: `src/components/__tests__/TakeoffSetupPanel.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/input/keyboardControls.ts`
- Modify: `src/input/__tests__/keyboardControls.test.ts`
- Modify: `src/input/controlBindings.ts`
- Modify: `src/input/__tests__/controlBindings.test.ts`

**Step 1: Write failing test/check**

Component test clicks Flaps Up, Trim Nose Up, Throttle Up, Gear and expects existing input actions; keyboard test expects shared `nextB737FlapDetent()` sequence including B737 detents.

**Step 2: Run test/check to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/components/__tests__/TakeoffSetupPanel.test.tsx src/input/__tests__/keyboardControls.test.ts src/input/__tests__/controlBindings.test.ts`

Expected: FAIL for the behavior described in Step 1, not a syntax/import error. If the command unexpectedly passes before implementation, tighten the test so it proves the finding.

**Step 3: Write minimal implementation**

- Implement panel with accessible buttons and current values.
- Dispatch existing store input actions; do not create duplicate control state.
- Replace keyboard flap sequence with the shared flap-detent helper.

**Step 4: Run test/check to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/components/__tests__/TakeoffSetupPanel.test.tsx src/input/__tests__/keyboardControls.test.ts src/input/__tests__/controlBindings.test.ts`

Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npx playwright test e2e/rfs-blackbox-player-loop.spec.ts -g "takeoff setup" --reporter=line`

Expected: PASS or, for explicitly external/manual checks, record the exact blocker without claiming completion.

**Step 6: Commit**

```bash
git add src/components/TakeoffSetupPanel.tsx src/components/__tests__/TakeoffSetupPanel.test.tsx src/App.tsx src/input/keyboardControls.ts src/input/__tests__/keyboardControls.test.ts src/input/controlBindings.ts src/input/__tests__/controlBindings.test.ts
git commit -m "feat: add visible takeoff setup controls"
```

### Task 4: Block premature rotation guidance below VR [PARENT-DIRECT]

**Objective:** Prevent guidance from calling rotation before the scenario rotate speed or explicit rotation intent.

**Covers findings:** RFS-MU2-005

**Files:**
- Modify: `src/sim/guidanceState.ts`
- Modify: `src/sim/__tests__/guidanceState.test.ts`
- Create: `src/sim/physics/__tests__/takeoffRotationRealism.test.ts`

**Step 1: Write failing test/check**

RED test: KSEA takeoff state at IAS 89 kt, pitch 6.7 deg, weight-on-wheels, neutral elevator returns `takeoff-roll`, not `rotation`.

**Step 2: Run test/check to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/__tests__/guidanceState.test.ts src/sim/physics/__tests__/takeoffRotationRealism.test.ts`

Expected: FAIL for the behavior described in Step 1, not a syntax/import error. If the command unexpectedly passes before implementation, tighten the test so it proves the finding.

**Step 3: Write minimal implementation**

- Gate rotation guidance on scenario VR or explicit rotation intent, not pitch alone.
- Keep `isPositiveRateEstablished()` as the gear-up/climb gate.
- Record dogfood sample in the test name/comment without claiming real B737 calibration.

**Step 4: Run test/check to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/__tests__/guidanceState.test.ts src/sim/physics/__tests__/takeoffRotationRealism.test.ts`

Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test -- src/sim/__tests__/guidanceState.test.ts src/sim/physics/__tests__/integrate.test.ts`

Expected: PASS or, for explicitly external/manual checks, record the exact blocker without claiming completion.

**Step 6: Commit**

```bash
git add src/sim/guidanceState.ts src/sim/__tests__/guidanceState.test.ts src/sim/physics/__tests__/takeoffRotationRealism.test.ts
git commit -m "fix: prevent premature rotation guidance below vr"
```

### Task 5: Model main-gear pivot, nosewheel unload, and tailstrike envelope [PARENT-DIRECT]

**Objective:** Make ground-roll pitch behavior credible enough to prevent trim/thrust-only rotation below VR.

**Covers findings:** RFS-MU2-003, RFS-MU2-005

**Files:**
- Modify: `src/sim/systems/ground.ts`
- Modify: `src/sim/systems/__tests__/ground.test.ts`
- Modify: `src/sim/physics/integrate.ts`
- Modify: `src/sim/physics/__tests__/integrate.test.ts`
- Modify: `src/sim/types.ts` if new fields are needed

**Step 1: Write failing test/check**

RED tests: neutral elevator below VR keeps max pitch under threshold, nose gear remains loaded, no tailstrike; elevator at/after VR permits main-gear pivot and liftoff within envelope.

**Step 2: Run test/check to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/systems/__tests__/ground.test.ts src/sim/physics/__tests__/integrate.test.ts -t "VR"`

Expected: FAIL for the behavior described in Step 1, not a syntax/import error. If the command unexpectedly passes before implementation, tighten the test so it proves the finding.

**Step 3: Write minimal implementation**

- Add gear-station moment and tail-clearance helpers before changing integration.
- Constrain ground pitch around loaded gear stations.
- Represent tailstrike explicitly, separate from normal rotation.

**Step 4: Run test/check to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/systems/__tests__/ground.test.ts src/sim/physics/__tests__/integrate.test.ts -t "VR"`

Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`

Expected: PASS or, for explicitly external/manual checks, record the exact blocker without claiming completion.

**Step 6: Commit**

```bash
git add src/sim/systems/ground.ts src/sim/systems/__tests__/ground.test.ts src/sim/physics/integrate.ts src/sim/physics/__tests__/integrate.test.ts src/sim/types.ts
git commit -m "fix: bound takeoff rotation with gear contact"
```

### Task 6: Extend black-box proof through legal airborne AP/A/T

**Objective:** Prove legal airborne automation engagement through UI without hidden command authority.

**Covers findings:** RFS-MU2-001, RFS-MU2-008

**Files:**
- Modify: `e2e/rfs-blackbox-player-loop.spec.ts`
- Modify: `src/instruments/RfsMCP.tsx` if accessible labels are missing
- Modify: `src/instruments/__tests__/RfsMCP.test.tsx`

**Step 1: Write failing test/check**

Playwright RED: visible-control takeoff reaches positive rate, then clicks LNAV and SPD/N1; AP/A/T displays must reflect actual ownership and no hidden store mutation is allowed.

**Step 2: Run test/check to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npx playwright test e2e/rfs-blackbox-player-loop.spec.ts -g "airborne" --reporter=line`

Expected: FAIL for the behavior described in Step 1, not a syntax/import error. If the command unexpectedly passes before implementation, tighten the test so it proves the finding.

**Step 3: Write minimal implementation**

- Use UI controls and keyboard only.
- Assert bounded IAS/pitch/VS after engagement.
- If A/T-only is not yet implemented, keep this scoped until Tasks 15-16 land.

**Step 4: Run test/check to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npx playwright test e2e/rfs-blackbox-player-loop.spec.ts -g "airborne" --reporter=line`

Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check:blackbox`

Expected: PASS or, for explicitly external/manual checks, record the exact blocker without claiming completion.

**Step 6: Commit**

```bash
git add e2e/rfs-blackbox-player-loop.spec.ts src/instruments/RfsMCP.tsx src/instruments/__tests__/RfsMCP.test.tsx
git commit -m "test: extend black-box proof to airborne autoflight"
```

### Task 7: Add final continuous black-box flight acceptance [PARENT-DIRECT]

**Objective:** Create the milestone no-store-mutation flight proof after prerequisite fixes land.

**Covers findings:** RFS-MU2-001, RFS-MU2-006, RFS-MU2-014

**Files:**
- Modify: `e2e/rfs-blackbox-player-loop.spec.ts`
- Modify: `e2e/helpers/rfsPage.ts` only for UI-level helpers
- Modify: `docs/reviews/templates/playability-dogfood-checklist.md`

**Step 1: Write failing test/check**

Final RED when prerequisites are ready: visible KSEA route load -> configure -> take off -> legal AP/A/T -> sequence first leg -> descend/handoff -> land -> rollout/stop -> reset; no direct store mutation.

**Step 2: Run test/check to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npx playwright test e2e/rfs-blackbox-player-loop.spec.ts --reporter=line`

Expected: FAIL for the behavior described in Step 1, not a syntax/import error. If the command unexpectedly passes before implementation, tighten the test so it proves the finding.

**Step 3: Write minimal implementation**

- Add this to the always-run visual suite only when the same branch can make it green.
- Keep helper names UI-oriented and store-free.
- Document that local black-box proof is still not CI/live proof.

**Step 4: Run test/check to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npx playwright test e2e/rfs-blackbox-player-loop.spec.ts --reporter=line`

Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npm run test:visual`

Expected: PASS or, for explicitly external/manual checks, record the exact blocker without claiming completion.

**Step 6: Commit**

```bash
git add e2e/rfs-blackbox-player-loop.spec.ts e2e/helpers/rfsPage.ts docs/reviews/templates/playability-dogfood-checklist.md
git commit -m "test: add continuous black-box flight acceptance"
```

### Task 8: Create source-lineage manifest for B737 FDM data

**Objective:** Make flight-model data quality auditable and prevent realism overclaims.

**Covers findings:** RFS-MU2-002

**Files:**
- Modify: `src/sim/data/aircraft/fdmTypes.ts`
- Modify: `src/sim/data/aircraft/b737-800-fdm.v1.ts`
- Modify: `src/sim/data/__tests__/b737-800-data.test.ts`
- Modify: `docs/architecture.md`

**Step 1: Write failing test/check**

RED test: every FDM section has `sourceQuality`, `sourceRefs`, `claimBoundary`, and `lastReviewed`; no anonymous gameplay values remain.

**Step 2: Run test/check to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/data/__tests__/b737-800-data.test.ts`

Expected: FAIL for the behavior described in Step 1, not a syntax/import error. If the command unexpectedly passes before implementation, tighten the test so it proves the finding.

**Step 3: Write minimal implementation**

- Extend FDM types with source-quality metadata.
- Keep tuned values stable unless replacing them with cited data in the same task.
- Update docs with what remains gameplay-placeholder.

**Step 4: Run test/check to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/data/__tests__/b737-800-data.test.ts`

Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`

Expected: PASS or, for explicitly external/manual checks, record the exact blocker without claiming completion.

**Step 6: Commit**

```bash
git add src/sim/data/aircraft/fdmTypes.ts src/sim/data/aircraft/b737-800-fdm.v1.ts src/sim/data/__tests__/b737-800-data.test.ts docs/architecture.md
git commit -m "docs: add source lineage to fdm data"
```

### Task 9: Add stall, climb, cruise, approach, and engine-lapse fixture gates

**Objective:** Bound current placeholder performance behavior with explicit tests.

**Covers findings:** RFS-MU2-002, RFS-MU2-012

**Files:**
- Modify: `src/sim/physics/__tests__/stallEnvelope.test.ts`
- Modify: `src/sim/physics/__tests__/performanceEnvelope.test.ts`
- Modify: `src/sim/systems/__tests__/engine.test.ts`
- Modify: `src/sim/data/performance/b737PerformanceCards.ts`
- Modify: `src/sim/data/__tests__/performanceCards.test.ts`

**Step 1: Write failing test/check**

RED tests assert explicit placeholder envelopes for stall speeds, climb, cruise trim, approach VREF, and engine lapse by altitude/Mach/OAT.

**Step 2: Run test/check to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/physics/__tests__/stallEnvelope.test.ts src/sim/physics/__tests__/performanceEnvelope.test.ts src/sim/systems/__tests__/engine.test.ts src/sim/data/__tests__/performanceCards.test.ts`

Expected: FAIL for the behavior described in Step 1, not a syntax/import error. If the command unexpectedly passes before implementation, tighten the test so it proves the finding.

**Step 3: Write minimal implementation**

- Add wide but honest fixture tables with metadata.
- Do not claim AFM validation.
- Make engine tests table-driven instead of only N1-squared behavior.

**Step 4: Run test/check to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/physics/__tests__/stallEnvelope.test.ts src/sim/physics/__tests__/performanceEnvelope.test.ts src/sim/systems/__tests__/engine.test.ts src/sim/data/__tests__/performanceCards.test.ts`

Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`

Expected: PASS or, for explicitly external/manual checks, record the exact blocker without claiming completion.

**Step 6: Commit**

```bash
git add src/sim/physics/__tests__/stallEnvelope.test.ts src/sim/physics/__tests__/performanceEnvelope.test.ts src/sim/systems/__tests__/engine.test.ts src/sim/data/performance/b737PerformanceCards.ts src/sim/data/__tests__/performanceCards.test.ts
git commit -m "test: add bounded performance envelope fixtures"
```

### Task 10: Add gear-station world-position and runway-normal helpers [PARENT-DIRECT]

**Objective:** Introduce pure wheel-contact geometry before changing the contact solver.

**Covers findings:** RFS-MU2-003

**Files:**
- Create: `src/sim/systems/wheelContact.ts`
- Create: `src/sim/systems/__tests__/wheelContact.test.ts`
- Modify: `src/sim/types.ts` if station fields need expansion

**Step 1: Write failing test/check**

RED tests compute nose/left-main/right-main runway clearance for level, flare, banked, and off-runway states.

**Step 2: Run test/check to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/systems/__tests__/wheelContact.test.ts`

Expected: FAIL for the behavior described in Step 1, not a syntax/import error. If the command unexpectedly passes before implementation, tighten the test so it proves the finding.

**Step 3: Write minimal implementation**

- Keep helper pure: aircraft + surface + spec in, clearances/penetrations/normal sink rates out.
- Use existing body/NED frame helpers.
- Do not wire into `ground.ts` until Task 11.

**Step 4: Run test/check to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/systems/__tests__/wheelContact.test.ts`

Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test -- src/sim/physics/__tests__/frames.test.ts src/sim/systems/__tests__/wheelContact.test.ts`

Expected: PASS or, for explicitly external/manual checks, record the exact blocker without claiming completion.

**Step 6: Commit**

```bash
git add src/sim/systems/wheelContact.ts src/sim/systems/__tests__/wheelContact.test.ts src/sim/types.ts
git commit -m "feat: add wheel contact geometry helper"
```

### Task 11: Use wheel-by-wheel contact in ground solver [PARENT-DIRECT]

**Objective:** Replace single altitude-snap contact with per-station runway/off-runway contact behavior.

**Covers findings:** RFS-MU2-003

**Files:**
- Modify: `src/sim/systems/ground.ts`
- Modify: `src/sim/systems/__tests__/ground.test.ts`
- Modify: `src/sim/physics/integrate.ts`
- Modify: `src/sim/physics/__tests__/integrate.test.ts`
- Modify: `src/sim/runwaySurface.ts`
- Modify: `src/sim/__tests__/runwaySurface.test.ts`

**Step 1: Write failing test/check**

RED tests: main gear touches before nose during flare; lateral runway excursion becomes off-runway; unsupported terrain is explicit, not silently airborne.

**Step 2: Run test/check to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/systems/__tests__/ground.test.ts src/sim/physics/__tests__/integrate.test.ts src/sim/__tests__/runwaySurface.test.ts`

Expected: FAIL for the behavior described in Step 1, not a syntax/import error. If the command unexpectedly passes before implementation, tighten the test so it proves the finding.

**Step 3: Write minimal implementation**

- Feed wheel clearances into `applyGroundContact()`.
- Keep prepared-runway vs off-runway semantics explicit.
- Preserve wind/air-relative and runway-normal invariants.

**Step 4: Run test/check to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/systems/__tests__/ground.test.ts src/sim/physics/__tests__/integrate.test.ts src/sim/__tests__/runwaySurface.test.ts`

Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`

Expected: PASS or, for explicitly external/manual checks, record the exact blocker without claiming completion.

**Step 6: Commit**

```bash
git add src/sim/systems/ground.ts src/sim/systems/__tests__/ground.test.ts src/sim/physics/integrate.ts src/sim/physics/__tests__/integrate.test.ts src/sim/runwaySurface.ts src/sim/__tests__/runwaySurface.test.ts
git commit -m "feat: use wheel-by-wheel ground contact"
```

### Task 12: Introduce touchdown, derotation, rollout, taxi, and stopped phases [PARENT-DIRECT]

**Objective:** Make landing and rollout states explicit instead of collapsing to LANDED.

**Covers findings:** RFS-MU2-006

**Files:**
- Modify: `src/sim/types.ts`
- Modify: `src/sim/physics/integrate.ts`
- Modify: `src/sim/physics/__tests__/integrate.test.ts`
- Modify: `src/sim/guidanceState.ts`
- Modify: `src/sim/__tests__/guidanceState.test.ts`
- Modify: `src/sim/checklistCoach.ts`
- Modify: `src/sim/__tests__/checklistCoach.test.ts`

**Step 1: Write failing test/check**

RED landing scenario samples must include `TOUCHDOWN`, `DEROTATION`, `ROLLOUT`, and `STOPPED` before reset; no direct APPROACH/DESCENT -> LANDED collapse.

**Step 2: Run test/check to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/physics/__tests__/integrate.test.ts src/sim/__tests__/guidanceState.test.ts src/sim/__tests__/checklistCoach.test.ts`

Expected: FAIL for the behavior described in Step 1, not a syntax/import error. If the command unexpectedly passes before implementation, tighten the test so it proves the finding.

**Step 3: Write minimal implementation**

- Expand `FlightPhase` and update exhaustive switches.
- Derive player guidance from new phases without AP/FMA overclaims.
- Keep reset cleanup explicit.

**Step 4: Run test/check to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/physics/__tests__/integrate.test.ts src/sim/__tests__/guidanceState.test.ts src/sim/__tests__/checklistCoach.test.ts`

Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npx playwright test e2e/rfs-flight.spec.ts -g "landing" --reporter=line`

Expected: PASS or, for explicitly external/manual checks, record the exact blocker without claiming completion.

**Step 6: Commit**

```bash
git add src/sim/types.ts src/sim/physics/integrate.ts src/sim/physics/__tests__/integrate.test.ts src/sim/guidanceState.ts src/sim/__tests__/guidanceState.test.ts src/sim/checklistCoach.ts src/sim/__tests__/checklistCoach.test.ts
git commit -m "feat: add explicit landing phase machine"
```

### Task 13: Add landing performance cards and stopping-distance acceptance [PARENT-DIRECT]

**Objective:** Define data-owned VREF/glidepath/touchdown/stopping metrics for landing proof.

**Covers findings:** RFS-MU2-006

**Files:**
- Modify: `src/sim/data/performance/b737PerformanceCards.ts`
- Modify: `src/sim/data/__tests__/performanceCards.test.ts`
- Modify: `src/sim/physics/__tests__/performanceEnvelope.test.ts`
- Modify: `e2e/rfs-flight.spec.ts`

**Step 1: Write failing test/check**

RED tests require every approach scenario to define VREF, glidepath/sink limits, touchdown-zone distance, and stop-distance bounds.

**Step 2: Run test/check to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/data/__tests__/performanceCards.test.ts src/sim/physics/__tests__/performanceEnvelope.test.ts`

Expected: FAIL for the behavior described in Step 1, not a syntax/import error. If the command unexpectedly passes before implementation, tighten the test so it proves the finding.

**Step 3: Write minimal implementation**

- Add landing-card fields with source/placeholder metadata.
- Have E2E record touchdown speed/sink/distance and stop distance.
- Report placeholder envelope proof only.

**Step 4: Run test/check to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/data/__tests__/performanceCards.test.ts src/sim/physics/__tests__/performanceEnvelope.test.ts`

Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npx playwright test e2e/rfs-flight.spec.ts -g "landing" --reporter=line`

Expected: PASS or, for explicitly external/manual checks, record the exact blocker without claiming completion.

**Step 6: Commit**

```bash
git add src/sim/data/performance/b737PerformanceCards.ts src/sim/data/__tests__/performanceCards.test.ts src/sim/physics/__tests__/performanceEnvelope.test.ts e2e/rfs-flight.spec.ts
git commit -m "test: add landing performance acceptance cards"
```

### Task 14: Carry VNAV managed capture target through ALT* and ALT HOLD

**Objective:** Keep VNAV managed constraints from reverting to selected MCP altitude at capture.

**Covers findings:** RFS-MU2-007

**Files:**
- Modify: `src/sim/systems/vnav.ts`
- Modify: `src/sim/systems/__tests__/vnav.test.ts`
- Modify: `src/sim/systems/autopilot.ts`
- Modify: `src/sim/systems/__tests__/autopilot.test.ts`
- Modify: `src/sim/systems/fmaTruth.ts`
- Modify: `src/sim/systems/__tests__/fmaTruth.test.ts`

**Step 1: Write failing test/check**

RED test: aircraft near 10,000 ft VNAV constraint with MCP altitude 30,000 ft captures managed 10,000 target instead of climbing to MCP altitude.

**Step 2: Run test/check to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/systems/__tests__/vnav.test.ts src/sim/systems/__tests__/autopilot.test.ts src/sim/systems/__tests__/fmaTruth.test.ts`

Expected: FAIL for the behavior described in Step 1, not a syntax/import error. If the command unexpectedly passes before implementation, tighten the test so it proves the finding.

**Step 3: Write minimal implementation**

- Add target source/capture altitude to VNAV output.
- AP target resolver prefers managed target for VNAV family modes.
- FMA displays managed source without unsupported guidance.

**Step 4: Run test/check to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/systems/__tests__/vnav.test.ts src/sim/systems/__tests__/autopilot.test.ts src/sim/systems/__tests__/fmaTruth.test.ts`

Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`

Expected: PASS or, for explicitly external/manual checks, record the exact blocker without claiming completion.

**Step 6: Commit**

```bash
git add src/sim/systems/vnav.ts src/sim/systems/__tests__/vnav.test.ts src/sim/systems/autopilot.ts src/sim/systems/__tests__/autopilot.test.ts src/sim/systems/fmaTruth.ts src/sim/systems/__tests__/fmaTruth.test.ts
git commit -m "fix: preserve managed vnav capture target"
```

### Task 15: Split autothrottle truth and ownership from AP engagement [PARENT-DIRECT]

**Objective:** Allow A/T to own throttles independently while pilot or AP owns pitch/roll.

**Covers findings:** RFS-MU2-008

**Files:**
- Modify: `src/sim/systems/effectiveAutoflightTruth.ts`
- Modify: `src/sim/systems/__tests__/effectiveAutoflightTruth.test.ts`
- Modify: `src/sim/simulationStep.ts`
- Modify: `src/sim/__tests__/simulationStep.test.ts`
- Modify: `src/store/simStore.ts`
- Modify: `src/store/__tests__/simStore.test.ts`

**Step 1: Write failing test/check**

RED test: AP OFF + A/T SPEED owns throttle only; pilot elevator/aileron remain effective; FMA thrust active is SPEED while autopilot remains OFF.

**Step 2: Run test/check to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/systems/__tests__/effectiveAutoflightTruth.test.ts src/sim/__tests__/simulationStep.test.ts src/store/__tests__/simStore.test.ts`

Expected: FAIL for the behavior described in Step 1, not a syntax/import error. If the command unexpectedly passes before implementation, tighten the test so it proves the finding.

**Step 3: Write minimal implementation**

- Derive `thrustActive` independently from backed AP status.
- Gate pitch/roll on AP truth and throttles on A/T truth.
- Make manual throttle override explicitly disconnect/ignore only A/T as intended.

**Step 4: Run test/check to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/systems/__tests__/effectiveAutoflightTruth.test.ts src/sim/__tests__/simulationStep.test.ts src/store/__tests__/simStore.test.ts`

Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`

Expected: PASS or, for explicitly external/manual checks, record the exact blocker without claiming completion.

**Step 6: Commit**

```bash
git add src/sim/systems/effectiveAutoflightTruth.ts src/sim/systems/__tests__/effectiveAutoflightTruth.test.ts src/sim/simulationStep.ts src/sim/__tests__/simulationStep.test.ts src/store/simStore.ts src/store/__tests__/simStore.test.ts
git commit -m "fix: split autothrottle ownership from autopilot"
```

### Task 16: Make MCP unavailable states explicit and add A/T-only controls

**Objective:** Turn silent parked MCP no-ops into truthful unavailable states and A/T controls.

**Covers findings:** RFS-MU2-008, RFS-MU2-016

**Files:**
- Modify: `src/instruments/RfsMCP.tsx`
- Modify: `src/instruments/__tests__/RfsMCP.test.tsx`
- Modify: `src/instruments/RfsPFD.tsx`
- Modify: `src/instruments/__tests__/RfsPFD.test.tsx`

**Step 1: Write failing test/check**

RED tests: stopped LNAV/SPD/VS/N1 buttons expose `aria-disabled`, reason text, and no active truth; airborne A/T SPEED/N1 can be active without forcing CMD A after Task 15.

**Step 2: Run test/check to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/instruments/__tests__/RfsMCP.test.tsx src/instruments/__tests__/RfsPFD.test.tsx`

Expected: FAIL for the behavior described in Step 1, not a syntax/import error. If the command unexpectedly passes before implementation, tighten the test so it proves the finding.

**Step 3: Write minimal implementation**

- Add tested `mcpModeAvailability()` helper.
- Use visible reason text, `title`, and `aria-disabled` consistently.
- Do not silently no-op mode clicks.

**Step 4: Run test/check to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/instruments/__tests__/RfsMCP.test.tsx src/instruments/__tests__/RfsPFD.test.tsx`

Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npx playwright test e2e/rfs-truth-flow.spec.ts --reporter=line`

Expected: PASS or, for explicitly external/manual checks, record the exact blocker without claiming completion.

**Step 6: Commit**

```bash
git add src/instruments/RfsMCP.tsx src/instruments/__tests__/RfsMCP.test.tsx src/instruments/RfsPFD.tsx src/instruments/__tests__/RfsPFD.test.tsx
git commit -m "fix: expose MCP mode availability truthfully"
```

### Task 17: Make spoilers dump lift and increase wheel loading [PARENT-DIRECT]

**Objective:** Make spoilers affect rollout/RTO physics through lift dump and wheel loading.

**Covers findings:** RFS-MU2-010

**Files:**
- Modify: `src/sim/physics/aero.ts`
- Modify: `src/sim/physics/__tests__/aero.test.ts`
- Modify: `src/sim/physics/integrate.ts`
- Modify: `src/sim/physics/__tests__/integrate.test.ts`
- Modify: `src/sim/data/aircraft/b737-800-fdm.v1.ts`

**Step 1: Write failing test/check**

RED test: at landing speed, spoilers=1 reduces lift and increases runway normal force compared with spoilers=0.

**Step 2: Run test/check to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/physics/__tests__/aero.test.ts src/sim/physics/__tests__/integrate.test.ts`

Expected: FAIL for the behavior described in Step 1, not a syntax/import error. If the command unexpectedly passes before implementation, tighten the test so it proves the finding.

**Step 3: Write minimal implementation**

- Move spoiler lift-dump coefficient into FDM data.
- Apply lift reduction before normal-force computation.
- Add stopping-distance regression only if deterministic.

**Step 4: Run test/check to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/physics/__tests__/aero.test.ts src/sim/physics/__tests__/integrate.test.ts`

Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`

Expected: PASS or, for explicitly external/manual checks, record the exact blocker without claiming completion.

**Step 6: Commit**

```bash
git add src/sim/physics/aero.ts src/sim/physics/__tests__/aero.test.ts src/sim/physics/integrate.ts src/sim/physics/__tests__/integrate.test.ts src/sim/data/aircraft/b737-800-fdm.v1.ts
git commit -m "fix: model spoiler lift dump"
```

### Task 18: Split commanded and actual gear/flap state with transit rates [PARENT-DIRECT]

**Objective:** Represent gear/flap transit rather than instant actual-state changes.

**Covers findings:** RFS-MU2-011

**Files:**
- Modify: `src/sim/types.ts`
- Modify: `src/sim/physics/integrate.ts`
- Modify: `src/sim/physics/__tests__/integrate.test.ts`
- Modify: `src/sim/data/aircraft/fdmTypes.ts`
- Modify: `src/components/EngineStrip.tsx`
- Modify: `src/components/__tests__/EngineStrip.test.tsx`

**Step 1: Write failing test/check**

RED tests: flap actual moves toward commanded detent over time, gear actual transits over time, aero uses actual not commanded state, old snapshots migrate safely.

**Step 2: Run test/check to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/physics/__tests__/integrate.test.ts src/components/__tests__/EngineStrip.test.tsx`

Expected: FAIL for the behavior described in Step 1, not a syntax/import error. If the command unexpectedly passes before implementation, tighten the test so it proves the finding.

**Step 3: Write minimal implementation**

- Add command vs actual fields or migration-safe nested config.
- Aero uses actual state; UI shows command/transit.
- Default missing actual fields from existing config on load.

**Step 4: Run test/check to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/physics/__tests__/integrate.test.ts src/components/__tests__/EngineStrip.test.tsx`

Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`

Expected: PASS or, for explicitly external/manual checks, record the exact blocker without claiming completion.

**Step 6: Commit**

```bash
git add src/sim/types.ts src/sim/physics/integrate.ts src/sim/physics/__tests__/integrate.test.ts src/sim/data/aircraft/fdmTypes.ts src/components/EngineStrip.tsx src/components/__tests__/EngineStrip.test.tsx
git commit -m "feat: add gear and flap transit state"
```

### Task 19: Couple engine operation to fuel availability and data tables [PARENT-DIRECT]

**Objective:** Make engine/fuel behavior table-driven and system-coupled.

**Covers findings:** RFS-MU2-012

**Files:**
- Modify: `src/sim/systems/engine.ts`
- Modify: `src/sim/systems/__tests__/engine.test.ts`
- Modify: `src/sim/systems/fuel.ts`
- Modify: `src/sim/systems/__tests__/fuel.test.ts`
- Modify: `src/sim/data/aircraft/b737-800-fdm.v1.ts`

**Step 1: Write failing test/check**

RED tests: zero fuel spools engines down despite throttle; takeoff/climb thrust varies by altitude/Mach/OAT table; fuel flow stops on starvation.

**Step 2: Run test/check to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/systems/__tests__/engine.test.ts src/sim/systems/__tests__/fuel.test.ts`

Expected: FAIL for the behavior described in Step 1, not a syntax/import error. If the command unexpectedly passes before implementation, tighten the test so it proves the finding.

**Step 3: Write minimal implementation**

- Pass fuel availability into engine update without circular dependencies.
- Use FDM thrust-lapse placeholder tables.
- Keep asymmetric engine-out yaw as separate follow-up unless represented in this task.

**Step 4: Run test/check to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/systems/__tests__/engine.test.ts src/sim/systems/__tests__/fuel.test.ts`

Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test -- src/sim/physics/__tests__/integrate.test.ts src/sim/systems/__tests__/engine.test.ts`

Expected: PASS or, for explicitly external/manual checks, record the exact blocker without claiming completion.

**Step 6: Commit**

```bash
git add src/sim/systems/engine.ts src/sim/systems/__tests__/engine.test.ts src/sim/systems/fuel.ts src/sim/systems/__tests__/fuel.test.ts src/sim/data/aircraft/b737-800-fdm.v1.ts
git commit -m "feat: couple engine operation to fuel availability"
```

### Task 20: Define RFMS route adapter and edit/direct-to/discontinuity seam

**Objective:** Create a future-proof FMS route boundary beyond canned routes.

**Covers findings:** RFS-MU2-013, RFS-MU2-040

**Files:**
- Create: `src/sim/fms/routeAdapter.ts`
- Create: `src/sim/fms/__tests__/routeAdapter.test.ts`
- Modify: `src/sim/flightPlanLoader.ts`
- Modify: `src/sim/__tests__/flightPlanLoader.test.ts`
- Modify: `docs/architecture.md`

**Step 1: Write failing test/check**

RED tests: route draft supports DIRECT_TO, INSERT_DISCONTINUITY, EXEC/undo semantics and can wrap current KSEA route as an adapter source.

**Step 2: Run test/check to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/fms/__tests__/routeAdapter.test.ts src/sim/__tests__/flightPlanLoader.test.ts`

Expected: FAIL for the behavior described in Step 1, not a syntax/import error. If the command unexpectedly passes before implementation, tighten the test so it proves the finding.

**Step 3: Write minimal implementation**

- Keep canned KSEA route as one source, not the whole FMS.
- Define adapter operations without building the full CDU UI yet.
- Document RFMS shared dependency limitations.

**Step 4: Run test/check to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/fms/__tests__/routeAdapter.test.ts src/sim/__tests__/flightPlanLoader.test.ts`

Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`

Expected: PASS or, for explicitly external/manual checks, record the exact blocker without claiming completion.

**Step 6: Commit**

```bash
git add src/sim/fms/routeAdapter.ts src/sim/fms/__tests__/routeAdapter.test.ts src/sim/flightPlanLoader.ts src/sim/__tests__/flightPlanLoader.test.ts docs/architecture.md
git commit -m "feat: add RFMS route adapter seam"
```

### Task 21: Add VNAV lookahead, TOD, path capture, and lifecycle

**Objective:** Move VNAV toward route-lookahead managed path behavior.

**Covers findings:** RFS-MU2-014

**Files:**
- Modify: `src/sim/systems/vnav.ts`
- Modify: `src/sim/systems/__tests__/vnav.test.ts`
- Modify: `src/sim/systems/autopilot.ts`
- Modify: `src/sim/systems/__tests__/autopilot.test.ts`
- Modify: `src/instruments/RfsPFD.tsx`
- Modify: `src/instruments/__tests__/RfsPFD.test.tsx`

**Step 1: Write failing test/check**

RED tests: future constraint arms VNAV path before TOD, captures at TOD, transitions ALT*, managed ALT HOLD, and route-complete without MCP fallback.

**Step 2: Run test/check to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/systems/__tests__/vnav.test.ts src/sim/systems/__tests__/autopilot.test.ts src/instruments/__tests__/RfsPFD.test.tsx`

Expected: FAIL for the behavior described in Step 1, not a syntax/import error. If the command unexpectedly passes before implementation, tighten the test so it proves the finding.

**Step 3: Write minimal implementation**

- Look ahead over remaining route legs.
- Represent lifecycle states explicitly.
- Keep AP pitch commands conservative and backed.

**Step 4: Run test/check to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/systems/__tests__/vnav.test.ts src/sim/systems/__tests__/autopilot.test.ts src/instruments/__tests__/RfsPFD.test.tsx`

Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npx playwright test e2e/rfs-route.spec.ts --reporter=line`

Expected: PASS or, for explicitly external/manual checks, record the exact blocker without claiming completion.

**Step 6: Commit**

```bash
git add src/sim/systems/vnav.ts src/sim/systems/__tests__/vnav.test.ts src/sim/systems/autopilot.ts src/sim/systems/__tests__/autopilot.test.ts src/instruments/RfsPFD.tsx src/instruments/__tests__/RfsPFD.test.tsx
git commit -m "feat: add VNAV path lifecycle"
```

### Task 22: Separate managed-speed indication from vertical VNAV pitch guidance

**Objective:** Stop speed-only constraints from implying unsupported pitch guidance.

**Covers findings:** RFS-MU2-015

**Files:**
- Modify: `src/sim/systems/vnav.ts`
- Modify: `src/sim/systems/__tests__/vnav.test.ts`
- Modify: `src/sim/systems/fmaTruth.ts`
- Modify: `src/sim/systems/__tests__/fmaTruth.test.ts`
- Modify: `src/instruments/RfsPFD.tsx`
- Modify: `src/instruments/__tests__/RfsPFD.test.tsx`

**Step 1: Write failing test/check**

RED test: speed-only constraint sets managed speed but vertical FMA remains OFF and no pitch command is generated.

**Step 2: Run test/check to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/systems/__tests__/vnav.test.ts src/sim/systems/__tests__/fmaTruth.test.ts src/instruments/__tests__/RfsPFD.test.tsx`

Expected: FAIL for the behavior described in Step 1, not a syntax/import error. If the command unexpectedly passes before implementation, tighten the test so it proves the finding.

**Step 3: Write minimal implementation**

- Add `managedSpeedKt`/source distinct from `verticalMode`.
- Display managed speed without active vertical VNAV.
- Define selected-vs-managed speed precedence.

**Step 4: Run test/check to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/systems/__tests__/vnav.test.ts src/sim/systems/__tests__/fmaTruth.test.ts src/instruments/__tests__/RfsPFD.test.tsx`

Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`

Expected: PASS or, for explicitly external/manual checks, record the exact blocker without claiming completion.

**Step 6: Commit**

```bash
git add src/sim/systems/vnav.ts src/sim/systems/__tests__/vnav.test.ts src/sim/systems/fmaTruth.ts src/sim/systems/__tests__/fmaTruth.test.ts src/instruments/RfsPFD.tsx src/instruments/__tests__/RfsPFD.test.tsx
git commit -m "fix: separate managed speed from VNAV pitch mode"
```

### Task 23: Share AP command targets with flight-director bars

**Objective:** Keep FD bars and AP commands generated from one backed target source.

**Covers findings:** RFS-MU2-017

**Files:**
- Create: `src/sim/systems/guidanceTargets.ts`
- Create: `src/sim/systems/__tests__/guidanceTargets.test.ts`
- Modify: `src/sim/systems/autopilot.ts`
- Modify: `src/sim/systems/__tests__/autopilot.test.ts`
- Modify: `src/instruments/RfsPFD.tsx`
- Modify: `src/instruments/__tests__/RfsPFD.test.tsx`

**Step 1: Write failing test/check**

RED test: AP command computation and PFD FD bars consume the same target bank/pitch object and backing flags.

**Step 2: Run test/check to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/systems/__tests__/guidanceTargets.test.ts src/sim/systems/__tests__/autopilot.test.ts src/instruments/__tests__/RfsPFD.test.tsx`

Expected: FAIL for the behavior described in Step 1, not a syntax/import error. If the command unexpectedly passes before implementation, tighten the test so it proves the finding.

**Step 3: Write minimal implementation**

- Extract target computation without changing tuned outputs initially.
- FD bars consume shared targets.
- Unsupported cue families stay hidden until servo parity exists.

**Step 4: Run test/check to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/systems/__tests__/guidanceTargets.test.ts src/sim/systems/__tests__/autopilot.test.ts src/instruments/__tests__/RfsPFD.test.tsx`

Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`

Expected: PASS or, for explicitly external/manual checks, record the exact blocker without claiming completion.

**Step 6: Commit**

```bash
git add src/sim/systems/guidanceTargets.ts src/sim/systems/__tests__/guidanceTargets.test.ts src/sim/systems/autopilot.ts src/sim/systems/__tests__/autopilot.test.ts src/instruments/RfsPFD.tsx src/instruments/__tests__/RfsPFD.test.tsx
git commit -m "fix: share autopilot and FD guidance targets"
```

### Task 24: Replace loose crosswind tolerances with runway-edge checks [PARENT-DIRECT]

**Objective:** Make crosswind tests fail on real runway excursions.

**Covers findings:** RFS-MU2-018

**Files:**
- Modify: `src/sim/physics/__tests__/integrate.test.ts`
- Modify: `src/sim/__tests__/scenarioHelpers.ts`
- Modify: `src/sim/runwaySurface.ts`
- Modify: `src/sim/__tests__/runwaySurface.test.ts`

**Step 1: Write failing test/check**

RED tests assert crosswind takeoff/landing samples remain inside runway half-width or explicitly transition to excursion/off-runway/abort; no `<250 m` tolerance.

**Step 2: Run test/check to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/physics/__tests__/integrate.test.ts src/sim/__tests__/runwaySurface.test.ts`

Expected: FAIL for the behavior described in Step 1, not a syntax/import error. If the command unexpectedly passes before implementation, tighten the test so it proves the finding.

**Step 3: Write minimal implementation**

- Expose runway lateral offset and half-width in helpers/surface snapshots.
- Separate assertion changes from physics retuning.
- Add explicit off-runway classification checks.

**Step 4: Run test/check to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/physics/__tests__/integrate.test.ts src/sim/__tests__/runwaySurface.test.ts`

Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test -- src/sim/physics/__tests__/integrate.test.ts src/sim/systems/__tests__/ground.test.ts`

Expected: PASS or, for explicitly external/manual checks, record the exact blocker without claiming completion.

**Step 6: Commit**

```bash
git add src/sim/physics/__tests__/integrate.test.ts src/sim/__tests__/scenarioHelpers.ts src/sim/runwaySurface.ts src/sim/__tests__/runwaySurface.test.ts
git commit -m "test: assert runway-edge bounds in crosswind cases"
```

### Task 25: Bind weather, clouds, and density altitude to scenario metadata [PARENT-DIRECT]

**Objective:** Make weather/scenery scenario-correct and deterministic.

**Covers findings:** RFS-MU2-019

**Files:**
- Modify: `src/sim/scenarios.ts`
- Modify: `src/sim/__tests__/scenarios.test.ts`
- Modify: `src/sim/weather.ts`
- Modify: `src/sim/__tests__/weather.test.ts`
- Modify: `src/viewport/CloudLayer.tsx`
- Modify: `src/App.tsx`
- Modify: `src/sim/physics/aero.ts`
- Modify: `src/sim/physics/__tests__/aero.test.ts`

**Step 1: Write failing test/check**

RED tests: KPDX scenario fetches KPDX weather, clouds are deterministic for a seed, QNH/temp affect density altitude through tested helper.

**Step 2: Run test/check to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/__tests__/scenarios.test.ts src/sim/__tests__/weather.test.ts src/sim/physics/__tests__/aero.test.ts`

Expected: FAIL for the behavior described in Step 1, not a syntax/import error. If the command unexpectedly passes before implementation, tighten the test so it proves the finding.

**Step 3: Write minimal implementation**

- Add weather station/QNH/temp/cloud seed to scenario data.
- Pass scenario metadata to weather and cloud layers.
- Apply density-altitude effects via tested atmosphere/data helpers only.

**Step 4: Run test/check to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/__tests__/scenarios.test.ts src/sim/__tests__/weather.test.ts src/sim/physics/__tests__/aero.test.ts`

Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`

Expected: PASS or, for explicitly external/manual checks, record the exact blocker without claiming completion.

**Step 6: Commit**

```bash
git add src/sim/scenarios.ts src/sim/__tests__/scenarios.test.ts src/sim/weather.ts src/sim/__tests__/weather.test.ts src/viewport/CloudLayer.tsx src/App.tsx src/sim/physics/aero.ts src/sim/physics/__tests__/aero.test.ts
git commit -m "feat: bind weather to scenario metadata"
```

### Task 26: Make cockpit interactions real or explicitly unavailable

**Objective:** Remove ambiguous cockpit no-ops.

**Covers findings:** RFS-MU2-020

**Files:**
- Modify: `src/viewport/cockpitInteractions.ts`
- Modify: `src/viewport/__tests__/cockpitPointerInteractions.test.ts`
- Modify: `src/viewport/__tests__/useCockpitInteractions.test.tsx`
- Modify: `src/viewport/CockpitLayer.tsx`

**Step 1: Write failing test/check**

RED tests: throttle, gear, flaps, and MCP hotspots map to real actions; unimplemented yoke/complex controls return visible `unavailable` metadata, not null/no-op.

**Step 2: Run test/check to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/viewport/__tests__/cockpitPointerInteractions.test.ts src/viewport/__tests__/useCockpitInteractions.test.tsx`

Expected: FAIL for the behavior described in Step 1, not a syntax/import error. If the command unexpectedly passes before implementation, tighten the test so it proves the finding.

**Step 3: Write minimal implementation**

- Implement simple cockpit controls using existing input actions.
- Label unimplemented placeholders honestly.
- Add cockpit smoke after accessible labels exist.

**Step 4: Run test/check to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/viewport/__tests__/cockpitPointerInteractions.test.ts src/viewport/__tests__/useCockpitInteractions.test.tsx`

Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`

Expected: PASS or, for explicitly external/manual checks, record the exact blocker without claiming completion.

**Step 6: Commit**

```bash
git add src/viewport/cockpitInteractions.ts src/viewport/__tests__/cockpitPointerInteractions.test.ts src/viewport/__tests__/useCockpitInteractions.test.tsx src/viewport/CockpitLayer.tsx
git commit -m "fix: make cockpit interactions honest"
```

### Task 27: Add responsive layout manager and attribution non-overlap tests

**Objective:** Make common viewports usable and preserve attribution/scenery status layout.

**Covers findings:** RFS-MU2-021, RFS-MU2-045

**Files:**
- Create: `src/components/layout/RfsLayout.tsx`
- Create: `src/components/layout/__tests__/RfsLayout.test.tsx`
- Modify: `src/App.tsx`
- Create: `e2e/rfs-responsive-accessibility.spec.ts`
- Modify: `e2e/rfs-visual.spec.ts`

**Step 1: Write failing test/check**

RED Playwright matrix 1024/1280/1440/1920 asserts PFD/MCP/Route/controls/debug/Cesium credit bounding boxes do not overlap in product mode.

**Step 2: Run test/check to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npx playwright test e2e/rfs-responsive-accessibility.spec.ts e2e/rfs-visual.spec.ts --reporter=line`

Expected: FAIL for the behavior described in Step 1, not a syntax/import error. If the command unexpectedly passes before implementation, tighten the test so it proves the finding.

**Step 3: Write minimal implementation**

- Add `data-rfs-panel` attributes and CSS grid/flex breakpoints.
- Keep debug panels collapsible.
- Reserve legal attribution area.

**Step 4: Run test/check to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npx playwright test e2e/rfs-responsive-accessibility.spec.ts e2e/rfs-visual.spec.ts --reporter=line`

Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test:visual`

Expected: PASS or, for explicitly external/manual checks, record the exact blocker without claiming completion.

**Step 6: Commit**

```bash
git add src/components/layout/RfsLayout.tsx src/components/layout/__tests__/RfsLayout.test.tsx src/App.tsx e2e/rfs-responsive-accessibility.spec.ts e2e/rfs-visual.spec.ts
git commit -m "feat: add responsive simulator layout"
```

### Task 28: Add landmarks, named regions, ARIA states, and live status

**Objective:** Make the simulator navigable and truthful through accessibility semantics.

**Covers findings:** RFS-MU2-016, RFS-MU2-022

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/instruments/RfsMCP.tsx`
- Modify: `src/instruments/__tests__/RfsMCP.test.tsx`
- Modify: `src/components/RouteStatus.tsx`
- Modify: `src/components/__tests__/RouteStatus.test.tsx`
- Modify: `src/components/ScenarioPanel.tsx`
- Modify: `src/components/__tests__/ScenarioPanel.test.tsx`
- Modify: `e2e/rfs-responsive-accessibility.spec.ts`

**Step 1: Write failing test/check**

RED Playwright asserts `main`, heading, named Scenario/Route/PFD/MCP regions, `aria-pressed` buttons, and `aria-live` route/coach status.

**Step 2: Run test/check to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npx playwright test e2e/rfs-responsive-accessibility.spec.ts -g "landmarks" --reporter=line`

Expected: FAIL for the behavior described in Step 1, not a syntax/import error. If the command unexpectedly passes before implementation, tighten the test so it proves the finding.

**Step 3: Write minimal implementation**

- Add a simulator heading and `<main>`.
- Give control-heavy panels named regions.
- Use `aria-pressed` and `aria-disabled` truthfully.

**Step 4: Run test/check to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npx playwright test e2e/rfs-responsive-accessibility.spec.ts -g "landmarks" --reporter=line`

Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/instruments/__tests__/RfsMCP.test.tsx src/components/__tests__/RouteStatus.test.tsx src/components/__tests__/ScenarioPanel.test.tsx`

Expected: PASS or, for explicitly external/manual checks, record the exact blocker without claiming completion.

**Step 6: Commit**

```bash
git add src/App.tsx src/instruments/RfsMCP.tsx src/instruments/__tests__/RfsMCP.test.tsx src/components/RouteStatus.tsx src/components/__tests__/RouteStatus.test.tsx src/components/ScenarioPanel.tsx src/components/__tests__/ScenarioPanel.test.tsx e2e/rfs-responsive-accessibility.spec.ts
git commit -m "feat: add simulator accessibility landmarks"
```

### Task 29: Reduce visual/E2E flake and add performance/readback budgets

**Objective:** Improve trust in first-run browser proof and rendering performance headroom.

**Covers findings:** RFS-MU2-024, RFS-MU2-046

**Files:**
- Modify: `playwright.config.ts`
- Modify: `e2e/rfs-route.spec.ts`
- Modify: `e2e/helpers/rfsRoute.ts`
- Create: `scripts/check-visual-timings.mjs`
- Modify: `package.json`
- Modify: `src/components/FPSMonitor.tsx`
- Modify: `src/components/__tests__/snapshotSubscriptions.test.ts`

**Step 1: Write failing test/check**

RED check fails when a visual test exceeds a timing budget or no timing artifact exists; Playwright trace must be enabled on first retry.

**Step 2: Run test/check to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npm run test:visual`

Expected: FAIL for the behavior described in Step 1, not a syntax/import error. If the command unexpectedly passes before implementation, tighten the test so it proves the finding.

**Step 3: Write minimal implementation**

- Split slow route proofs and reduce long `page.evaluate` loops.
- Collect traces on first retry and keep CI worker count stable.
- Profile/remove synchronous WebGL readback from normal ticks.

**Step 4: Run test/check to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npm run test:visual`

Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`

Expected: PASS or, for explicitly external/manual checks, record the exact blocker without claiming completion.

**Step 6: Commit**

```bash
git add playwright.config.ts e2e/rfs-route.spec.ts e2e/helpers/rfsRoute.ts scripts/check-visual-timings.mjs package.json src/components/FPSMonitor.tsx src/components/__tests__/snapshotSubscriptions.test.ts
git commit -m "test: harden visual proof timing"
```

### Task 30: Align CI with local gate and add PR Docker smoke [PARENT-DIRECT]

**Objective:** Catch dependency/Docker/nginx drift before merge.

**Covers findings:** RFS-MU2-025, RFS-MU2-041

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `scripts/release-hardening-check.mjs`
- Modify: `src/config/__tests__/docsPosture.test.ts`

**Step 1: Write failing test/check**

RED posture test: CI contains `npm run check:deps`, PR-safe Docker build with `push: false`, container smoke, and `/rfs-version.json` curl.

**Step 2: Run test/check to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check:release && npx vitest run src/config/__tests__/docsPosture.test.ts`

Expected: FAIL for the behavior described in Step 1, not a syntax/import error. If the command unexpectedly passes before implementation, tighten the test so it proves the finding.

**Step 3: Write minimal implementation**

- Add dependency check to CI or use exact local aggregate gate where feasible.
- Add Docker smoke with `load: true`, curl `/`, curl version JSON.
- Keep publish/deploy master-only.

**Step 4: Run test/check to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check:release && npx vitest run src/config/__tests__/docsPosture.test.ts`

Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`

Expected: PASS or, for explicitly external/manual checks, record the exact blocker without claiming completion.

**Step 6: Commit**

```bash
git add .github/workflows/ci.yml scripts/release-hardening-check.mjs src/config/__tests__/docsPosture.test.ts
git commit -m "ci: add dependency and Docker smoke gates"
```

### Task 31: Make rollback failures fatal and verify public previous version [PARENT-DIRECT]

**Objective:** Ensure rollback failures are not hidden and public state is verified.

**Covers findings:** RFS-MU2-026

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `scripts/release-hardening-check.mjs`
- Modify: `src/config/__tests__/docsPosture.test.ts`

**Step 1: Write failing test/check**

RED posture test rejects rollback `docker run ... || true` and requires post-rollback public `/rfs-version.json` verification.

**Step 2: Run test/check to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check:release && npx vitest run src/config/__tests__/docsPosture.test.ts`

Expected: FAIL for the behavior described in Step 1, not a syntax/import error. If the command unexpectedly passes before implementation, tighten the test so it proves the finding.

**Step 3: Write minimal implementation**

- Make rollback container start failure exit nonzero.
- Record previous ref/commit before promotion where possible.
- Do not claim rollback exercise without a real workflow run.

**Step 4: Run test/check to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check:release && npx vitest run src/config/__tests__/docsPosture.test.ts`

Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`

Expected: PASS or, for explicitly external/manual checks, record the exact blocker without claiming completion.

**Step 6: Commit**

```bash
git add .github/workflows/ci.yml scripts/release-hardening-check.mjs src/config/__tests__/docsPosture.test.ts
git commit -m "ci: make deployment rollback verifiable"
```

### Task 32: Harden nginx container runtime as non-root/read-only compatible [PARENT-DIRECT]

**Objective:** Reduce avoidable container runtime attack surface.

**Covers findings:** RFS-MU2-027

**Files:**
- Modify: `Dockerfile`
- Modify: `nginx.conf`
- Modify: `.github/workflows/ci.yml`
- Modify: `scripts/release-hardening-check.mjs`
- Modify: `src/config/__tests__/docsPosture.test.ts`

**Step 1: Write failing test/check**

RED posture test requires `USER`, `--read-only`, `--cap-drop ALL`, `--security-opt no-new-privileges`, tmpfs, pids/user/memory limits in smoke/deploy.

**Step 2: Run test/check to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check:release && npx vitest run src/config/__tests__/docsPosture.test.ts`

Expected: FAIL for the behavior described in Step 1, not a syntax/import error. If the command unexpectedly passes before implementation, tighten the test so it proves the finding.

**Step 3: Write minimal implementation**

- Use fixed UID/GID if compatible with nginx image.
- Move nginx temp/cache paths to tmpfs-compatible locations.
- Do not add COOP/COEP.

**Step 4: Run test/check to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check:release && npx vitest run src/config/__tests__/docsPosture.test.ts`

Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && docker build -t rfs:hardened-smoke .`

Expected: PASS or, for explicitly external/manual checks, record the exact blocker without claiming completion.

**Step 6: Commit**

```bash
git add Dockerfile nginx.conf .github/workflows/ci.yml scripts/release-hardening-check.mjs src/config/__tests__/docsPosture.test.ts
git commit -m "build: harden nginx runtime container"
```

### Task 33: Inject immutable image digest into release provenance [PARENT-DIRECT]

**Objective:** Make live runtime provenance map to immutable image digest.

**Covers findings:** RFS-MU2-028

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `Dockerfile`
- Modify: `scripts/write-version-metadata.mjs`
- Modify: `scripts/release-hardening-check.mjs`
- Modify: `src/config/__tests__/docsPosture.test.ts`

**Step 1: Write failing test/check**

RED posture test requires `steps.build.outputs.digest` to flow into release metadata or a post-build provenance artifact; release builds must not serve `imageDigest: unknown`.

**Step 2: Run test/check to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check:release && npx vitest run src/config/__tests__/docsPosture.test.ts`

Expected: FAIL for the behavior described in Step 1, not a syntax/import error. If the command unexpectedly passes before implementation, tighten the test so it proves the finding.

**Step 3: Write minimal implementation**

- Do not pretend Docker knows final digest before push.
- Patch or publish metadata after digest is known and verify before promotion.
- Keep local non-release builds allowed to use placeholder only when explicitly local.

**Step 4: Run test/check to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check:release && npx vitest run src/config/__tests__/docsPosture.test.ts`

Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run build`

Expected: PASS or, for explicitly external/manual checks, record the exact blocker without claiming completion.

**Step 6: Commit**

```bash
git add .github/workflows/ci.yml Dockerfile scripts/write-version-metadata.mjs scripts/release-hardening-check.mjs src/config/__tests__/docsPosture.test.ts
git commit -m "ci: record immutable image digest provenance"
```

### Task 34: Implement real browser Worker runtime behind default-off flag [PARENT-DIRECT]

**Objective:** Connect worker scaffolding to a real browser Worker without making it default-on prematurely.

**Covers findings:** RFS-MU2-029

**Files:**
- Modify: `src/sim/simulationRuntime.ts`
- Modify: `src/sim/simulationWorker.ts`
- Modify: `src/sim/__tests__/simulationRuntime.test.ts`
- Modify: `src/sim/__tests__/simulationWorker.test.ts`
- Modify: `src/config/workerPhysics.ts`
- Modify: `src/config/__tests__/workerPhysics.test.ts`
- Modify: `vite.config.ts`
- Modify: `e2e/rfs-flight.spec.ts`

**Step 1: Write failing test/check**

RED parity test: worker runtime step output matches main-thread runtime for same input; worker-enabled Playwright clean-climb smoke passes with flag.

**Step 2: Run test/check to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/__tests__/simulationRuntime.test.ts src/sim/__tests__/simulationWorker.test.ts src/config/__tests__/workerPhysics.test.ts`

Expected: FAIL for the behavior described in Step 1, not a syntax/import error. If the command unexpectedly passes before implementation, tighten the test so it proves the finding.

**Step 3: Write minimal implementation**

- Add request/response IDs, backpressure, timeout/error fallback, dispose.
- Keep `VITE_RFS_WORKER_PHYSICS` default-off until proven.
- Do not introduce SharedArrayBuffer or COOP/COEP.

**Step 4: Run test/check to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/__tests__/simulationRuntime.test.ts src/sim/__tests__/simulationWorker.test.ts src/config/__tests__/workerPhysics.test.ts`

Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && VITE_RFS_WORKER_PHYSICS=1 CI=1 npx playwright test e2e/rfs-flight.spec.ts -g "clean climb" --reporter=line`

Expected: PASS or, for explicitly external/manual checks, record the exact blocker without claiming completion.

**Step 6: Commit**

```bash
git add src/sim/simulationRuntime.ts src/sim/simulationWorker.ts src/sim/__tests__/simulationRuntime.test.ts src/sim/__tests__/simulationWorker.test.ts src/config/workerPhysics.ts src/config/__tests__/workerPhysics.test.ts vite.config.ts e2e/rfs-flight.spec.ts
git commit -m "feat: add experimental worker physics runtime"
```

### Task 35: Centralize input, fixed sim, render, effects, and audio scheduling [PARENT-DIRECT]

**Objective:** Make frame-loop ordering explicit and testable.

**Covers findings:** RFS-MU2-030

**Files:**
- Create: `src/runtime/frameScheduler.ts`
- Create: `src/runtime/__tests__/frameScheduler.test.ts`
- Modify: `src/hooks/useSimLoop.ts`
- Modify: `src/hooks/useAudioLoop.ts`
- Modify: `src/App.tsx`
- Modify: `src/viewport/CameraManager.ts` if needed

**Step 1: Write failing test/check**

RED unit test asserts tick order: input -> fixed simulation -> commit -> render/effects -> audio, with no duplicate independent RAF loops for sim/audio/input.

**Step 2: Run test/check to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/runtime/__tests__/frameScheduler.test.ts src/__tests__/App.test.tsx`

Expected: FAIL for the behavior described in Step 1, not a syntax/import error. If the command unexpectedly passes before implementation, tighten the test so it proves the finding.

**Step 3: Write minimal implementation**

- Implement pure scheduler first.
- Wire hooks after tests pass.
- Keep Cesium camera/preRender semantics explicit.

**Step 4: Run test/check to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/runtime/__tests__/frameScheduler.test.ts src/__tests__/App.test.tsx`

Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npm run test:visual`

Expected: PASS or, for explicitly external/manual checks, record the exact blocker without claiming completion.

**Step 6: Commit**

```bash
git add src/runtime/frameScheduler.ts src/runtime/__tests__/frameScheduler.test.ts src/hooks/useSimLoop.ts src/hooks/useAudioLoop.ts src/App.tsx src/viewport/CameraManager.ts
git commit -m "feat: centralize frame scheduling"
```

### Task 36: Move AP controller/PID state into runtime-owned state [PARENT-DIRECT]

**Objective:** Remove hidden module AP state so replay and worker runtime are deterministic.

**Covers findings:** RFS-MU2-031

**Files:**
- Modify: `src/sim/systems/autopilot.ts`
- Modify: `src/sim/systems/__tests__/autopilot.test.ts`
- Modify: `src/sim/simulationStep.ts`
- Modify: `src/sim/__tests__/simulationStep.test.ts`
- Modify: `src/store/simStore.ts`
- Modify: `src/store/__tests__/simStore.test.ts`
- Modify: `src/sim/simulationRuntime.ts`

**Step 1: Write failing test/check**

RED test: two runtimes do not share AP integrator/PID state; reset/save/restore explicitly resets or serializes controller state.

**Step 2: Run test/check to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/systems/__tests__/autopilot.test.ts src/sim/__tests__/simulationStep.test.ts src/store/__tests__/simStore.test.ts`

Expected: FAIL for the behavior described in Step 1, not a syntax/import error. If the command unexpectedly passes before implementation, tighten the test so it proves the finding.

**Step 3: Write minimal implementation**

- Define serializable `AutopilotControllerState`.
- Command computation accepts prior controller state and returns next state.
- Update worker codec and store reset semantics.

**Step 4: Run test/check to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/systems/__tests__/autopilot.test.ts src/sim/__tests__/simulationStep.test.ts src/store/__tests__/simStore.test.ts`

Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`

Expected: PASS or, for explicitly external/manual checks, record the exact blocker without claiming completion.

**Step 6: Commit**

```bash
git add src/sim/systems/autopilot.ts src/sim/systems/__tests__/autopilot.test.ts src/sim/simulationStep.ts src/sim/__tests__/simulationStep.test.ts src/store/simStore.ts src/store/__tests__/simStore.test.ts src/sim/simulationRuntime.ts
git commit -m "refactor: own autopilot controller state in runtime"
```

### Task 37: Split App shell responsibilities into focused modules

**Objective:** Reduce `App.tsx` ownership risk without behavior changes.

**Covers findings:** RFS-MU2-032

**Files:**
- Create: `src/app/RfsShell.tsx`
- Create: `src/app/useScenarioWeather.ts`
- Create: `src/app/__tests__/useScenarioWeather.test.ts`
- Create: `src/components/BottomControlBar.tsx`
- Create: `src/components/__tests__/BottomControlBar.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/__tests__/App.test.tsx`

**Step 1: Write failing test/check**

RED component/hook tests cover BottomControlBar buttons and scenario weather bootstrap while App remains composition-only.

**Step 2: Run test/check to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/components/__tests__/BottomControlBar.test.tsx src/app/__tests__/useScenarioWeather.test.ts src/__tests__/App.test.tsx`

Expected: FAIL for the behavior described in Step 1, not a syntax/import error. If the command unexpectedly passes before implementation, tighten the test so it proves the finding.

**Step 3: Write minimal implementation**

- Extract one surface at a time.
- Preserve lazy viewer readiness gating.
- Do not change behavior except ownership.

**Step 4: Run test/check to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/components/__tests__/BottomControlBar.test.tsx src/app/__tests__/useScenarioWeather.test.ts src/__tests__/App.test.tsx`

Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`

Expected: PASS or, for explicitly external/manual checks, record the exact blocker without claiming completion.

**Step 6: Commit**

```bash
git add src/app/RfsShell.tsx src/app/useScenarioWeather.ts src/app/__tests__/useScenarioWeather.test.ts src/components/BottomControlBar.tsx src/components/__tests__/BottomControlBar.test.tsx src/App.tsx src/__tests__/App.test.tsx
git commit -m "refactor: split RFS app shell responsibilities"
```

### Task 38: Split simStore into stable domain slices behind compatibility API [PARENT-DIRECT]

**Objective:** Reduce store monolith risk while preserving public API and heartbeat order.

**Covers findings:** RFS-MU2-033

**Files:**
- Create: `src/store/slices/aircraftSlice.ts`
- Create: `src/store/slices/inputSlice.ts`
- Create: `src/store/slices/autoflightSlice.ts`
- Create: `src/store/slices/routeSlice.ts`
- Create: `src/store/slices/persistenceSlice.ts`
- Modify: `src/store/simStore.ts`
- Modify: `src/store/__tests__/simStore.test.ts`

**Step 1: Write failing test/check**

Safety test first: public actions `startTakeoffRoll`, `setInput`, `setApState`, `loadFlightPlan`, `reset`, `tick` still exist and heartbeat order stays unchanged.

**Step 2: Run test/check to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/store/__tests__/simStore.test.ts`

Expected: FAIL for the behavior described in Step 1, not a syntax/import error. If the command unexpectedly passes before implementation, tighten the test so it proves the finding.

**Step 3: Write minimal implementation**

- Add compatibility test before refactor.
- Move one slice at a time with store tests after each move.
- Do not reorder `tick()`; add order assertions if touched.

**Step 4: Run test/check to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/store/__tests__/simStore.test.ts`

Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`

Expected: PASS or, for explicitly external/manual checks, record the exact blocker without claiming completion.

**Step 6: Commit**

```bash
git add src/store/slices/aircraftSlice.ts src/store/slices/inputSlice.ts src/store/slices/autoflightSlice.ts src/store/slices/routeSlice.ts src/store/slices/persistenceSlice.ts src/store/simStore.ts src/store/__tests__/simStore.test.ts
git commit -m "refactor: split simulator store slices"
```

### Task 39: Add primitive view-model selectors and render-count guards

**Objective:** Reduce React render churn from high-frequency store updates.

**Covers findings:** RFS-MU2-034

**Files:**
- Create: `src/store/selectors.ts`
- Create: `src/store/__tests__/selectors.test.ts`
- Modify: `src/instruments/RfsPFD.tsx`
- Modify: `src/instruments/RfsMCP.tsx`
- Modify: `src/components/Telemetry.tsx`
- Modify: `src/components/EngineStrip.tsx`
- Modify: `src/components/__tests__/snapshotSubscriptions.test.ts`

**Step 1: Write failing test/check**

RED tests assert selectors return primitives/stable view models and key instruments do not rerender on unrelated 300-tick updates.

**Step 2: Run test/check to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/store/__tests__/selectors.test.ts src/components/__tests__/snapshotSubscriptions.test.ts`

Expected: FAIL for the behavior described in Step 1, not a syntax/import error. If the command unexpectedly passes before implementation, tighten the test so it proves the finding.

**Step 3: Write minimal implementation**

- Avoid fresh objects in Zustand selectors.
- Derive view models through memoized helpers where needed.
- Keep display math at component boundary.

**Step 4: Run test/check to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/store/__tests__/selectors.test.ts src/components/__tests__/snapshotSubscriptions.test.ts`

Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`

Expected: PASS or, for explicitly external/manual checks, record the exact blocker without claiming completion.

**Step 6: Commit**

```bash
git add src/store/selectors.ts src/store/__tests__/selectors.test.ts src/instruments/RfsPFD.tsx src/instruments/RfsMCP.tsx src/components/Telemetry.tsx src/components/EngineStrip.tsx src/components/__tests__/snapshotSubscriptions.test.ts
git commit -m "perf: add stable simulator view selectors"
```

### Task 40: Add enforceable bundle budget to local and CI checks

**Objective:** Turn bundle-size drift into a gate.

**Covers findings:** RFS-MU2-035

**Files:**
- Create: `scripts/check-bundle-budget.mjs`
- Modify: `package.json`
- Modify: `src/config/__tests__/manualChunks.test.ts`
- Modify: `manualChunks.config.ts`

**Step 1: Write failing test/check**

RED script fails after build if app/vendor/Cesium/Three chunk raw or gzip budgets exceed current agreed limits.

**Step 2: Run test/check to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run build && node scripts/check-bundle-budget.mjs`

Expected: FAIL for the behavior described in Step 1, not a syntax/import error. If the command unexpectedly passes before implementation, tighten the test so it proves the finding.

**Step 3: Write minimal implementation**

- Set budgets from current build output plus intentional margin.
- Run after `npm run build` so `dist` exists.
- Keep manual chunk tests aligned with budget categories.

**Step 4: Run test/check to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run build && node scripts/check-bundle-budget.mjs`

Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`

Expected: PASS or, for explicitly external/manual checks, record the exact blocker without claiming completion.

**Step 6: Commit**

```bash
git add scripts/check-bundle-budget.mjs package.json src/config/__tests__/manualChunks.test.ts manualChunks.config.ts
git commit -m "build: enforce bundle size budget"
```

### Task 41: Add compatible security headers without breaking Cesium [PARENT-DIRECT]

**Objective:** Add browser security baseline without reintroducing Cesium tile breakage.

**Covers findings:** RFS-MU2-036

**Files:**
- Modify: `nginx.conf`
- Modify: `scripts/release-hardening-check.mjs`
- Modify: `src/config/__tests__/docsPosture.test.ts`
- Modify: `docs/architecture.md`

**Step 1: Write failing test/check**

RED posture test requires X-Content-Type-Options, Referrer-Policy, Permissions-Policy, frame policy/HSTS where appropriate, and rejects COOP/COEP.

**Step 2: Run test/check to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check:release && npx vitest run src/config/__tests__/docsPosture.test.ts`

Expected: FAIL for the behavior described in Step 1, not a syntax/import error. If the command unexpectedly passes before implementation, tighten the test so it proves the finding.

**Step 3: Write minimal implementation**

- Add headers with `always` as appropriate.
- Treat CSP as Cesium-tested separate substep if not straightforward.
- Do not reintroduce COOP/COEP.

**Step 4: Run test/check to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check:release && npx vitest run src/config/__tests__/docsPosture.test.ts`

Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && docker build -t rfs:headers-smoke .`

Expected: PASS or, for explicitly external/manual checks, record the exact blocker without claiming completion.

**Step 6: Commit**

```bash
git add nginx.conf scripts/release-hardening-check.mjs src/config/__tests__/docsPosture.test.ts docs/architecture.md
git commit -m "build: add compatible browser security headers"
```

### Task 42: Harden Docker build context exclusions [PARENT-DIRECT]

**Objective:** Keep local artifacts and env variants out of Docker builds.

**Covers findings:** RFS-MU2-037

**Files:**
- Modify: `.dockerignore`
- Modify: `scripts/release-hardening-check.mjs`
- Modify: `src/config/__tests__/docsPosture.test.ts`

**Step 1: Write failing test/check**

RED posture test requires `.git`, `dogfood-output`, `coverage`, `test-results`, `.env*`, reports, local artifacts to be excluded while build inputs remain available.

**Step 2: Run test/check to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check:release && npx vitest run src/config/__tests__/docsPosture.test.ts`

Expected: FAIL for the behavior described in Step 1, not a syntax/import error. If the command unexpectedly passes before implementation, tighten the test so it proves the finding.

**Step 3: Write minimal implementation**

- Add broad exclusions and explicit allowlist exceptions only if needed.
- Verify Docker build still works.
- Do not exclude package/source/public/nginx inputs.

**Step 4: Run test/check to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check:release && npx vitest run src/config/__tests__/docsPosture.test.ts`

Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && docker build -t rfs:dockerignore-smoke .`

Expected: PASS or, for explicitly external/manual checks, record the exact blocker without claiming completion.

**Step 6: Commit**

```bash
git add .dockerignore scripts/release-hardening-check.mjs src/config/__tests__/docsPosture.test.ts
git commit -m "build: harden Docker build context"
```

### Task 43: Add OSS governance files and package metadata [PARENT-DIRECT]

**Objective:** Make the public project contributor- and security-ready.

**Covers findings:** RFS-MU2-038

**Files:**
- Create: `LICENSE`
- Create: `SECURITY.md`
- Create: `CONTRIBUTING.md`
- Create: `.github/CODEOWNERS`
- Create: `.github/ISSUE_TEMPLATE/bug_report.yml`
- Create: `.github/ISSUE_TEMPLATE/feature_request.yml`
- Create: `.github/pull_request_template.md`
- Modify: `package.json`
- Modify: `README.md`

**Step 1: Write failing test/check**

RED posture test: package has repository/license metadata and governance files exist.

**Step 2: Run test/check to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/config/__tests__/docsPosture.test.ts`

Expected: FAIL for the behavior described in Step 1, not a syntax/import error. If the command unexpectedly passes before implementation, tighten the test so it proves the finding.

**Step 3: Write minimal implementation**

- Confirm license choice before implementation if not already settled.
- Add SECURITY.md without secrets.
- Require proof boundaries/non-claims in PR template.

**Step 4: Run test/check to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/config/__tests__/docsPosture.test.ts`

Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`

Expected: PASS or, for explicitly external/manual checks, record the exact blocker without claiming completion.

**Step 6: Commit**

```bash
git add LICENSE SECURITY.md CONTRIBUTING.md .github/CODEOWNERS .github/ISSUE_TEMPLATE/bug_report.yml .github/ISSUE_TEMPLATE/feature_request.yml .github/pull_request_template.md package.json README.md
git commit -m "docs: add OSS governance files"
```

### Task 44: Add dependency, action, and container security automation [PARENT-DIRECT]

**Objective:** Automate update and static/container security posture.

**Covers findings:** RFS-MU2-039

**Files:**
- Create: `.github/dependabot.yml`
- Create: `.github/workflows/codeql.yml`
- Modify: `.github/workflows/ci.yml`
- Modify: `scripts/release-hardening-check.mjs`
- Modify: `src/config/__tests__/docsPosture.test.ts`

**Step 1: Write failing test/check**

RED posture test requires Dependabot, CodeQL, and PR-safe container scan workflow/step.

**Step 2: Run test/check to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check:release && npx vitest run src/config/__tests__/docsPosture.test.ts`

Expected: FAIL for the behavior described in Step 1, not a syntax/import error. If the command unexpectedly passes before implementation, tighten the test so it proves the finding.

**Step 3: Write minimal implementation**

- Configure npm, GitHub Actions, and Docker update automation.
- Add CodeQL for JS/TS.
- Add Trivy/Grype-style scanner after Docker smoke without secret requirements.

**Step 4: Run test/check to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check:release && npx vitest run src/config/__tests__/docsPosture.test.ts`

Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && git diff --check .github/dependabot.yml .github/workflows/codeql.yml .github/workflows/ci.yml`

Expected: PASS or, for explicitly external/manual checks, record the exact blocker without claiming completion.

**Step 6: Commit**

```bash
git add .github/dependabot.yml .github/workflows/codeql.yml .github/workflows/ci.yml scripts/release-hardening-check.mjs src/config/__tests__/docsPosture.test.ts
git commit -m "ci: add dependency and security automation"
```

### Task 45: Make RFMS shared dependency self-contained or one-command bootstrap [PARENT-DIRECT]

**Objective:** Make fresh clone/build workflows honest and reproducible.

**Covers findings:** RFS-MU2-040

**Files:**
- Create: `scripts/bootstrap-rfms-shared.mjs`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `.github/workflows/ci.yml`
- Modify: `Dockerfile`
- Modify: `src/config/__tests__/docsPosture.test.ts`

**Step 1: Write failing test/check**

RED posture test requires `npm run bootstrap`/equivalent and docs for a fresh clone; pinned RFMS/RFMC commit matches CI and Docker.

**Step 2: Run test/check to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && node scripts/bootstrap-rfms-shared.mjs --check && npx vitest run src/config/__tests__/docsPosture.test.ts`

Expected: FAIL for the behavior described in Step 1, not a syntax/import error. If the command unexpectedly passes before implementation, tighten the test so it proves the finding.

**Step 3: Write minimal implementation**

- Preferred: publish/version shared package or vendor pinned subtree. Interim: one-command bootstrap matching CI.
- Keep pinned shared commit consistent.
- Document fresh-clone build path.

**Step 4: Run test/check to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && node scripts/bootstrap-rfms-shared.mjs --check && npx vitest run src/config/__tests__/docsPosture.test.ts`

Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm install --legacy-peer-deps --package-lock-only`

Expected: PASS or, for explicitly external/manual checks, record the exact blocker without claiming completion.

**Step 6: Commit**

```bash
git add scripts/bootstrap-rfms-shared.mjs package.json README.md .github/workflows/ci.yml Dockerfile src/config/__tests__/docsPosture.test.ts
git commit -m "build: add RFMS shared dependency bootstrap"
```

### Task 46: Add named save slots with metadata and overwrite confirmation

**Objective:** Make training saves understandable and repeatable.

**Covers findings:** RFS-MU2-042

**Files:**
- Modify: `src/store/scenarioPersistence.ts`
- Modify: `src/store/__tests__/scenarioPersistence.test.ts`
- Modify: `src/components/ScenarioPanel.tsx`
- Modify: `src/components/__tests__/ScenarioPanel.test.tsx`

**Step 1: Write failing test/check**

RED tests: save/list/load named slots with scenario, route, phase, timestamp, restore policy; old single-slot save migrates to default slot.

**Step 2: Run test/check to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/store/__tests__/scenarioPersistence.test.ts src/components/__tests__/ScenarioPanel.test.tsx`

Expected: FAIL for the behavior described in Step 1, not a syntax/import error. If the command unexpectedly passes before implementation, tighten the test so it proves the finding.

**Step 3: Write minimal implementation**

- Version localStorage format.
- Restore running saves as paused unless explicitly resumed.
- Add overwrite confirmation and corrupt-slot feedback.

**Step 4: Run test/check to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/store/__tests__/scenarioPersistence.test.ts src/components/__tests__/ScenarioPanel.test.tsx`

Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`

Expected: PASS or, for explicitly external/manual checks, record the exact blocker without claiming completion.

**Step 6: Commit**

```bash
git add src/store/scenarioPersistence.ts src/store/__tests__/scenarioPersistence.test.ts src/components/ScenarioPanel.tsx src/components/__tests__/ScenarioPanel.test.tsx
git commit -m "feat: add named simulator save slots"
```

### Task 47: Add gamepad bindings for full meaningful-use loop

**Objective:** Let gamepad users operate the core simulator loop.

**Covers findings:** RFS-MU2-043

**Files:**
- Modify: `src/input/GamepadManager.ts`
- Modify: `src/input/__tests__/GamepadManager.test.ts`
- Modify: `src/input/controlBindings.ts`
- Modify: `src/input/__tests__/controlBindings.test.ts`
- Modify: `src/components/ControlsSettings.tsx`
- Modify: `src/components/__tests__/ControlsSettings.test.tsx`

**Step 1: Write failing test/check**

RED tests: edge-triggered gamepad can start/pause/reset, flaps, gear, throttle, brakes, camera, overlay, audio, and key MCP controls; help UI lists mappings.

**Step 2: Run test/check to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/input/__tests__/GamepadManager.test.ts src/input/__tests__/controlBindings.test.ts src/components/__tests__/ControlsSettings.test.tsx`

Expected: FAIL for the behavior described in Step 1, not a syntax/import error. If the command unexpectedly passes before implementation, tighten the test so it proves the finding.

**Step 3: Write minimal implementation**

- Use edge-triggered buttons for toggles.
- Use deadzones for axes.
- Expose mapping/conflicts in ControlsSettings.

**Step 4: Run test/check to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/input/__tests__/GamepadManager.test.ts src/input/__tests__/controlBindings.test.ts src/components/__tests__/ControlsSettings.test.tsx`

Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`

Expected: PASS or, for explicitly external/manual checks, record the exact blocker without claiming completion.

**Step 6: Commit**

```bash
git add src/input/GamepadManager.ts src/input/__tests__/GamepadManager.test.ts src/input/controlBindings.ts src/input/__tests__/controlBindings.test.ts src/components/ControlsSettings.tsx src/components/__tests__/ControlsSettings.test.tsx
git commit -m "feat: expand gamepad simulator controls"
```

### Task 48: Add audio settings, persistence, captions, and blocked-audio help

**Objective:** Make audio controllable, persistent, and accessible.

**Covers findings:** RFS-MU2-044

**Files:**
- Modify: `src/audio/AudioEngine.ts`
- Modify: `src/audio/__tests__/AudioEngine.test.ts`
- Modify: `src/audio/GPWS.ts`
- Modify: `src/audio/__tests__/GPWS.test.ts`
- Create: `src/components/AudioSettings.tsx`
- Create: `src/components/__tests__/AudioSettings.test.tsx`
- Modify: `src/App.tsx`

**Step 1: Write failing test/check**

RED tests: volume/mute/captions persist; GPWS captions emit `aria-live` text; blocked AudioContext shows visible help after user gesture failure.

**Step 2: Run test/check to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/components/__tests__/AudioSettings.test.tsx src/audio/__tests__/AudioEngine.test.ts src/audio/__tests__/GPWS.test.ts`

Expected: FAIL for the behavior described in Step 1, not a syntax/import error. If the command unexpectedly passes before implementation, tighten the test so it proves the finding.

**Step 3: Write minimal implementation**

- Version audio settings in localStorage.
- Do not auto-start audio on mount.
- Expose captions/log without requiring sound.

**Step 4: Run test/check to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/components/__tests__/AudioSettings.test.tsx src/audio/__tests__/AudioEngine.test.ts src/audio/__tests__/GPWS.test.ts`

Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`

Expected: PASS or, for explicitly external/manual checks, record the exact blocker without claiming completion.

**Step 6: Commit**

```bash
git add src/audio/AudioEngine.ts src/audio/__tests__/AudioEngine.test.ts src/audio/GPWS.ts src/audio/__tests__/GPWS.test.ts src/components/AudioSettings.tsx src/components/__tests__/AudioSettings.test.tsx src/App.tsx
git commit -m "feat: add audio settings and GPWS captions"
```

### Task 49: Enable branch protection and exact-SHA release closeout only with authorization [PARENT-DIRECT]

**Objective:** Make public release governance and deployment proof unambiguous.

**Covers findings:** RFS-MU2-009

**Files:**
- Create: `docs/runbooks/release-closeout.md`
- Create: `docs/runbooks/branch-protection.md`
- Create: `scripts/check-branch-protection.mjs`
- Create: `scripts/check-exact-sha-release.mjs`
- Modify: `docs/roadmap.md`
- Modify: `docs/plans/README.md`

**Step 1: Write failing test/check**

Manual verification packet records current branch protection, required checks, exact pushed SHA run status/conclusion, deploy job, and live `/rfs-version.json` SHA. Initial state may be blocked until authorized.

**Step 2: Run test/check to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && node scripts/check-branch-protection.mjs --repo Reedtrullz/ReedFS --branch master --required secret-scan,test,publish,deploy --require-admins --forbid-force-push --forbid-delete`

Expected: FAIL for the behavior described in Step 1, not a syntax/import error. If the command unexpectedly passes before implementation, tighten the test so it proves the finding.

**Step 3: Write minimal implementation**

- Document exact branch rules: require secret-scan/test/publish/deploy, no force-push/delete.
- When authorized, configure with GitHub UI/API and record commands/results.
- Add `scripts/check-branch-protection.mjs` to assert required checks, enforce-admins policy, and force-push/delete restrictions instead of merely printing API fields.
- Add `scripts/check-exact-sha-release.mjs` to assert an exact-SHA run exists with `status=completed`, `conclusion=success`, and live JSON commit/SHA equals the requested SHA.
- Push/deploy only after clean tree and explicit active authorization.

**Step 4: Run test/check to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && node scripts/check-branch-protection.mjs --repo Reedtrullz/ReedFS --branch master --required secret-scan,test,publish,deploy --require-admins --forbid-force-push --forbid-delete`

Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && FINAL_SHA=$(git rev-parse HEAD) && node scripts/check-exact-sha-release.mjs --repo Reedtrullz/ReedFS --branch master --sha "$FINAL_SHA" --live-url https://fly.reidar.tech/rfs-version.json`

Expected: PASS or, for explicitly external/manual checks, record the exact blocker without claiming completion.

**Step 6: Commit**

```bash
git add docs/runbooks/release-closeout.md docs/runbooks/branch-protection.md scripts/check-branch-protection.mjs scripts/check-exact-sha-release.mjs docs/roadmap.md docs/plans/README.md
git commit -m "docs: add exact-sha release closeout runbooks"
```

### Task 50: Final meaningful-use evidence ledger and non-claim closeout [PARENT-DIRECT]

**Objective:** Close the program only with complete evidence and truthful proof boundaries.

**Covers findings:** RFS-MU2-001 through RFS-MU2-046

**Files:**
- Create: `docs/reviews/2026-06-13-rfs-meaningful-use-remediation-closeout.md`
- Modify: `docs/reviews/2026-06-13-rfs-meaningful-use-deep-review-round2.md`
- Modify: `docs/roadmap.md`
- Modify: `docs/plans/README.md`

**Step 1: Write failing test/check**

Closeout fails if any finding lacks status/commit/tests/proof boundary, any gate fails, or CI/live/full-flight claims lack exact evidence.

**Step 2: Run test/check to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check && CI=1 npm run test:visual && npm run check:blackbox && node scripts/check-blackbox-e2e.mjs && git diff --check`

Expected: FAIL for the behavior described in Step 1, not a syntax/import error. If the command unexpectedly passes before implementation, tighten the test so it proves the finding.

**Step 3: Write minimal implementation**

- Create a 46-row closeout matrix.
- Record exact local test counts and first-run visual result.
- If push/deploy is not authorized, state local-only and no CI/live claim.

**Step 4: Run test/check to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check && CI=1 npm run test:visual && npm run check:blackbox && node scripts/check-blackbox-e2e.mjs && git diff --check`

Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && FINAL_SHA=$(git rev-parse HEAD) && node scripts/check-exact-sha-release.mjs --repo Reedtrullz/ReedFS --branch master --sha "$FINAL_SHA" --live-url https://fly.reidar.tech/rfs-version.json`

Expected: PASS or, for explicitly external/manual checks, record the exact blocker without claiming completion.

**Step 6: Commit**

```bash
git add docs/reviews/2026-06-13-rfs-meaningful-use-remediation-closeout.md docs/reviews/2026-06-13-rfs-meaningful-use-deep-review-round2.md docs/roadmap.md docs/plans/README.md
git commit -m "docs: close meaningful-use remediation evidence ledger"
```

## Plan review history

- Initial planner pass: read the round-2 strict review, current architecture, physics invariants, roadmap, plans README, package scripts, workflow, Dockerfile, nginx config, and representative source files.
- Coverage intent: every `RFS-MU2-001` through `RFS-MU2-046` is mapped in the issue-to-task matrix and appears in task coverage.
- Command/path/fence review status: initial independent review requested changes for invalid release-verification prose commands, non-existent responsive E2E file marked `Modify`, and pending review-history placeholder; patched with executable verification-script commands and `Create` path.
- Architecture/deploy-governance review status: initial independent review requested changes for missing `[PARENT-DIRECT]` markers, incomplete black-box helper guard scope, weak branch-protection/live verification assertions, and runbook/reference mismatch; patched by marking all risky tasks parent-direct, expanding the black-box guard to helper/import surfaces, and adding branch/exact-SHA verification scripts.
- Final focused re-review verdict: PASS — blocker classes `PARENT_DIRECT_MISSING`, `BLACKBOX_GUARD_SCOPE_INCOMPLETE`, `RELEASE_GOVERNANCE_VERIFICATION_INADEQUATE`, `INVALID_RELEASE_VERIFICATION_COMMANDS`, `RUNBOOK_PATH_SCOPE_MISMATCH`, and missing responsive E2E `Create` path are closed.

## Final plan-only verification checklist

Run before committing this plan file:

```bash
python3 - <<'PY'
from pathlib import Path
p = Path('docs/plans/2026-06-13-rfs-meaningful-use-remediation-plan.md')
text = p.read_text()
for i in range(1, 47):
    marker = f'RFS-MU2-{i:03d}'
    assert marker in text, marker
fence = '`' * 3
assert text.count(fence) % 2 == 0
bad_patterns = [
    'git add src/App.tsx' + ':',
    'git add ' + 'gh ',
    'git add ' + 'http',
    'npx vitest run ' + 'e2e/',
]
for bad in bad_patterns:
    assert bad not in text, bad
print('plan structural checks OK')
PY
git diff --check docs/plans/2026-06-13-rfs-meaningful-use-remediation-plan.md
git status --short --branch
```

## Execution handoff

Plan complete and saved. Ready to execute using `subagent-driven-development`: dispatch a fresh subagent per safe task, run spec-compliance review, then code-quality review, and keep `[PARENT-DIRECT]` tasks in the parent session. Do not proceed to push/deploy/branch-protection tasks without explicit active authorization.
