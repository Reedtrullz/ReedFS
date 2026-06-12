# RFS P0 Truth and Playability Remediation Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task. Use strict TDD for code tasks, run two-stage reviews after each task, and preserve the non-claim discipline from the RFS project memory.

**Goal:** Fix the highest-priority player-truth gaps around positive rate, gear-up, rotation guidance, LOAD PLAN behavior, and climb envelope honesty.

**Architecture:** Introduce shared flight predicates and scenario-card-owned thresholds, then route all guidance/cue/checklist/input paths through those predicates. Keep LOAD PLAN route loading separate from AP engagement so displayed FMA/AP truth never describes hidden or immediately-cleared behavior.

**Tech Stack:** React 19, TypeScript 6, Vite, Zustand, Vitest, Playwright, CesiumJS, Three.js, Docker/GitHub Actions where applicable.

**Source audit:** Derived from `/Users/reidar/Projectos/RFS/dogfood-output/2026-06-12-rfs-comprehensive-review/report.md` and the repo copy `/Users/reidar/Projectos/RFS/docs/reviews/2026-06-12-rfs-comprehensive-dogfood-audit.md`.

**Covers findings:** RFS-003, RFS-004, RFS-005, RFS-006, RFS-007, RFS-026, RFS-041

**Global rules:**
- Start every code task by writing the failing test and watching it fail for the expected reason.
- Use `source ~/.nvm/nvm.sh && nvm use 22` before every `npm`, `npx`, or `node` command.
- Do not push, deploy, rewrite history, read secrets, or modify credentials without explicit current authorization.
- Do not claim CI/live/full-flight/full-route/VNAV/data-backed FDM proof unless the exact evidence has actually been run.
- Use `patch` for existing source edits and `write_file` for new files.
- Commit after coherent task groups. Do not let parallel subagents commit in the same worktree.

---

### Task 1: Create shared positive-rate predicate

**Objective:** Provide one tested predicate that requires airborne, AGL, and actual upward vertical motion before “positive rate” can be true.

**Files:**
- Create: `src/sim/flightPhasePredicates.ts`
- Create: `src/sim/__tests__/flightPhasePredicates.test.ts`
- Modify later: `src/sim/takeoffCue.ts`, `src/sim/guidanceState.ts`, `src/sim/checklistCoach.ts`

**Step 1: Write failing test**

```typescript
import { describe, expect, it } from 'vitest';
import { B737_800_SPEC, createInitialState } from '../types';
import { isPositiveRateEstablished } from '../flightPhasePredicates';

describe('isPositiveRateEstablished', () => {
  it('is false when airborne but descending above the runway', () => {
const s = createInitialState(B737_800_SPEC);
s.ground.weightOnWheels = false;
s.ground.aglFt = 80;
s.velocity.w = 2; // body down; descending for level attitude
expect(isPositiveRateEstablished(s)).toBe(false);
  });

  it('is true only after gear is unloaded and vertical speed is upward', () => {
const s = createInitialState(B737_800_SPEC);
s.ground.weightOnWheels = false;
s.ground.aglFt = 80;
s.velocity.w = -1.5;
expect(isPositiveRateEstablished(s)).toBe(true);
  });
});
```

**Step 2: Run test to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/__tests__/flightPhasePredicates.test.ts`
Expected: FAIL for the missing behavior, not a syntax/import error.

**Step 3: Write minimal implementation**

```typescript
import type { AircraftState } from './types';

const MIN_POSITIVE_RATE_AGL_FT = 10;
const MIN_UPWARD_BODY_W_MPS = -0.25;

export function isPositiveRateEstablished(state: AircraftState): boolean {
  return !state.ground.weightOnWheels
&& state.ground.aglFt > MIN_POSITIVE_RATE_AGL_FT
&& state.velocity.w < MIN_UPWARD_BODY_W_MPS;
}
```

**Step 4: Run test to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/__tests__/flightPhasePredicates.test.ts`
Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`
Expected: PASS. For browser/runtime tasks also run `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npm run test:visual` after ensuring no stale local dev server owns port 5173.

**Step 6: Commit**

```bash
git add src/sim/flightPhasePredicates.ts src/sim/__tests__/flightPhasePredicates.test.ts src/sim/takeoffCue.ts
git commit -m "fix: add shared positive-rate predicate"
```


### Task 2: Wire positive-rate predicate into cues, guidance, and checklist

**Objective:** Replace AGL-only positive-rate logic with the shared predicate everywhere the player sees positive-rate/gear-up guidance.

**Files:**
- Modify: `src/sim/takeoffCue.ts`
- Modify: `src/sim/guidanceState.ts`
- Modify: `src/sim/checklistCoach.ts`
- Test: `src/sim/__tests__/takeoffCue.test.ts`
- Test: `src/sim/__tests__/guidanceState.test.ts`
- Test: `src/sim/__tests__/checklistCoach.test.ts`

**Step 1: Write failing test**

```typescript
it('does not cue gear up while airborne but descending', () => {
  const s = takeoffStateAt({ aglFt: 80, bodyW: 2, gearDown: true });
  expect(takeoffCueText(s, 155, 'enva-tutorial')).not.toContain('POSITIVE RATE');
});

it('keeps guidance in rotation until vertical rate is actually positive', () => {
  const s = takeoffStateAt({ aglFt: 80, bodyW: 2, gearDown: true });
  expect(deriveGuidancePhase('running', s, controlsWithGearDown)).toBe('rotation');
});
```

**Step 2: Run test to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/__tests__/takeoffCue.test.ts src/sim/__tests__/guidanceState.test.ts src/sim/__tests__/checklistCoach.test.ts`
Expected: FAIL for the missing behavior, not a syntax/import error.

**Step 3: Write minimal implementation**

```typescript
import { isPositiveRateEstablished } from './flightPhasePredicates';

// takeoffCue.ts
if (isPositiveRateEstablished(state) && state.config.gearDown) {
  return 'POSITIVE RATE — gear up';
}

// guidanceState.ts
if (!aircraft.ground.weightOnWheels || aircraft.ground.aglFt > 5) {
  if (!isPositiveRateEstablished(aircraft)) return 'rotation';
  return aircraft.config.gearDown || controls.gearLever === 'DOWN' ? 'positive-rate' : 'climb';
}

// checklistCoach.ts
complete: isPositiveRateEstablished(aircraft)
```

**Step 4: Run test to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/__tests__/takeoffCue.test.ts src/sim/__tests__/guidanceState.test.ts src/sim/__tests__/checklistCoach.test.ts`
Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`
Expected: PASS. For browser/runtime tasks also run `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npm run test:visual` after ensuring no stale local dev server owns port 5173.

**Step 6: Commit**

```bash
git add src/sim/takeoffCue.ts src/sim/guidanceState.ts src/sim/checklistCoach.ts src/sim/__tests__/takeoffCue.test.ts src/sim/__tests__/guidanceState.test.ts src/sim/__tests__/checklistCoach.test.ts
git commit -m "fix: require real positive rate for gear-up guidance"
```


### Task 3: Gate gear-up commands behind positive rate at one input boundary [PARENT-DIRECT]

**Objective:** Reject gear-UP commands until positive rate is established, while still allowing gear-DOWN commands and preserving tests for keyboard/cockpit paths.

**Files:**
- Create: `src/input/gearCommand.ts`
- Create: `src/input/__tests__/gearCommand.test.ts`
- Modify: `src/store/simStore.ts`
- Modify: `src/input/keyboardControls.ts` only if a pure helper signature change is needed
- Modify: `src/viewport/cockpitInteractions.ts` only if it can receive aircraft context safely

**Step 1: Write failing test**

```typescript
import { describe, expect, it } from 'vitest';
import { resolveGearLeverCommand } from '../gearCommand';

it('rejects gear up before positive rate', () => {
  expect(resolveGearLeverCommand({ current: 'DOWN', positiveRate: false })).toEqual({ gearLever: 'DOWN', rejectedReason: 'positive-rate-required' });
});

it('allows gear down at any time', () => {
  expect(resolveGearLeverCommand({ current: 'UP', positiveRate: false })).toEqual({ gearLever: 'DOWN', rejectedReason: null });
});
```

**Step 2: Run test to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/input/__tests__/gearCommand.test.ts`
Expected: FAIL for the missing behavior, not a syntax/import error.

**Step 3: Write minimal implementation**

```typescript
import type { ControlInputs } from '../sim/types';

export interface GearCommandResult {
  gearLever: ControlInputs['gearLever'];
  rejectedReason: 'positive-rate-required' | null;
}

export function resolveGearLeverCommand(input: {
  current: ControlInputs['gearLever'];
  positiveRate: boolean;
}): GearCommandResult {
  if (input.current === 'UP') return { gearLever: 'DOWN', rejectedReason: null };
  if (!input.positiveRate) return { gearLever: 'DOWN', rejectedReason: 'positive-rate-required' };
  return { gearLever: 'UP', rejectedReason: null };
}
```

**Step 4: Run test to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/input/__tests__/gearCommand.test.ts src/store/__tests__/simStore.test.ts src/viewport/__tests__/cockpitInteractions.test.ts src/input/__tests__/keyboardControls.test.ts`
Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`
Expected: PASS. For browser/runtime tasks also run `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npm run test:visual` after ensuring no stale local dev server owns port 5173.

**Step 6: Commit**

```bash
git add src/input/gearCommand.ts src/input/__tests__/gearCommand.test.ts src/store/simStore.ts src/input/keyboardControls.ts
git commit -m "fix: gate gear-up commands on positive rate"
```

**Safety note:** Prefer centralizing the gate in store action handling so keyboard and cockpit paths cannot diverge. If UI feedback needs a message, add it in a separate task after the rejected command is tested.

### Task 4: Make guidance rotation speed scenario-card owned

**Objective:** Remove the 135 kt hardcoded rotation transition and use the same performance-card VR that the PFD/takeoff cue uses.

**Files:**
- Modify: `src/sim/guidanceState.ts`
- Modify: `src/sim/__tests__/guidanceState.test.ts`
- Read: `src/sim/data/performance/b737PerformanceCards.ts`

**Step 1: Write failing test**

```typescript
it('does not enter rotation before the ENVA performance-card VR', () => {
  const s = takeoffStateAtSpeed(140); // below ENVA VR 149
  expect(buildGuidanceState({ scenario: ENVA_TUTORIAL_SCENARIO, status: 'running', aircraft: s, controls }).phase).toBe('takeoff-roll');
});

it('enters rotation at the scenario performance-card VR', () => {
  const s = takeoffStateAtSpeed(149);
  expect(buildGuidanceState({ scenario: ENVA_TUTORIAL_SCENARIO, status: 'running', aircraft: s, controls }).phase).toBe('rotation');
});
```

**Step 2: Run test to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/__tests__/guidanceState.test.ts`
Expected: FAIL for the missing behavior, not a syntax/import error.

**Step 3: Write minimal implementation**

```typescript
import { rotateSpeedKtForScenario } from './takeoffCue';

export function deriveGuidancePhase(
  status: SimStatus,
  aircraft: AircraftState,
  controls: ControlInputs,
  scenarioId?: string | null,
): GuidancePhase {
  const rotationSpeedKt = rotateSpeedKtForScenario(scenarioId);
  if (speedKt >= rotationSpeedKt || aircraft.attitude.theta >= ROTATION_PITCH_RAD) return 'rotation';
}

// buildGuidanceState passes scenario.id into deriveGuidancePhase.
```

**Step 4: Run test to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/__tests__/guidanceState.test.ts src/sim/__tests__/takeoffCue.test.ts`
Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`
Expected: PASS. For browser/runtime tasks also run `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npm run test:visual` after ensuring no stale local dev server owns port 5173.

**Step 6: Commit**

```bash
git add src/sim/guidanceState.ts src/sim/__tests__/guidanceState.test.ts
git commit -m "fix: drive guidance rotation from performance cards"
```


### Task 5: Make LOAD PLAN route-only while stopped [PARENT-DIRECT]

**Objective:** Prevent the parked/stopped LOAD PLAN button from engaging CMD_A or active AP modes; it should load a route and leave AP/FMA truth OFF until the player deliberately selects MCP modes.

**Files:**
- Modify: `src/App.tsx:355-365`
- Modify: `src/__tests__/App.test.tsx`
- Modify: `src/store/__tests__/simStore.test.ts` if store defaults need adjustment

**Step 1: Write failing test**

```typescript
it('LOAD PLAN stores KSEA route but does not engage AP while stopped', async () => {
  render(<App />);
  await selectScenario('ksea-tutorial');
  await user.click(screen.getByRole('button', { name: 'LOAD PLAN' }));
  expect(mockSetFlightPlan).toHaveBeenCalledWith(expect.objectContaining({ origin: 'KSEA', destination: 'KPDX' }));
  expect(mockSetApState).not.toHaveBeenCalled();
});
```

**Step 2: Run test to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/__tests__/App.test.tsx -t "LOAD PLAN stores KSEA route"`
Expected: FAIL for the missing behavior, not a syntax/import error.

**Step 3: Write minimal implementation**

```typescript
// App.tsx LOAD PLAN handler after route creation:
store.setFlightPlan(fp);
if (!fp) {
  store.setScenarioPersistenceMessage?.('No default route is available for this scenario.');
}
// Do not call applyLoadedRouteAutopilotDefaults from LOAD PLAN.
// AP engagement belongs to explicit MCP buttons.
```

**Step 4: Run test to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/__tests__/App.test.tsx`
Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`
Expected: PASS. For browser/runtime tasks also run `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npm run test:visual` after ensuring no stale local dev server owns port 5173.

**Step 6: Commit**

```bash
git add src/App.tsx src/__tests__/App.test.tsx src/store/__tests__/simStore.test.ts
git commit -m "fix: keep load-plan route loading separate from AP engagement"
```

**Scope boundary:** If the product still wants one-click demo AP defaults, add a separate button such as `ARM DEMO AP` in a later task, not hidden side effects in LOAD PLAN.

### Task 6: Surface ENVA no-route feedback

**Objective:** Give visible feedback when a scenario has no default route instead of silently doing nothing.

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/ScenarioPanel.tsx` or `src/components/RouteStatus.tsx`
- Modify: `src/__tests__/App.test.tsx`
- Modify: `src/components/__tests__/ScenarioPanel.test.tsx` if ScenarioPanel owns the message

**Step 1: Write failing test**

```typescript
it('LOAD PLAN explains that ENVA has no default route', async () => {
  render(<App />);
  await user.click(screen.getByRole('button', { name: 'LOAD PLAN' }));
  expect(await screen.findByText(/no default route/i)).toBeVisible();
});
```

**Step 2: Run test to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/__tests__/App.test.tsx -t "no default route"`
Expected: FAIL for the missing behavior, not a syntax/import error.

**Step 3: Write minimal implementation**

```typescript
// Minimal implementation option: reuse existing scenarioPersistenceMessage or add routeLoadMessage.
if (!fp) {
  store.setScenarioPersistenceMessage('No default route is available for this scenario.');
  return;
}
```

**Step 4: Run test to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/__tests__/App.test.tsx src/components/__tests__/ScenarioPanel.test.tsx`
Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`
Expected: PASS. For browser/runtime tasks also run `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npm run test:visual` after ensuring no stale local dev server owns port 5173.

**Step 6: Commit**

```bash
git add src/App.tsx src/components/ScenarioPanel.tsx src/__tests__/App.test.tsx src/components/__tests__/ScenarioPanel.test.tsx
git commit -m "fix: show no-route feedback for unsupported scenarios"
```


### Task 7: Add browser proof for LOAD PLAN truth and gear-up gating

**Objective:** Prove the fixed player flow through real browser UI, not store injection.

**Files:**
- Modify: `e2e/rfs-flight.spec.ts`
- Modify: `e2e/rfs-route.spec.ts` or create focused `e2e/rfs-truth-flow.spec.ts`
- Modify: `docs/reviews/2026-06-12-rfs-comprehensive-dogfood-audit.md` after proof

**Step 1: Write failing test**

```typescript
test('LOAD PLAN does not engage AP while stopped and gear-up is rejected before positive rate', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'LOAD PLAN' }).click();
  await expect(page.getByText(/no default route/i)).toBeVisible();
  await page.getByRole('button', { name: 'START ROLL' }).click();
  await page.keyboard.press('G');
  await expect(page.getByText(/GEAR CMD DN|gear up after positive rate/i)).toBeVisible();
});
```

**Step 2: Run test to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npx playwright test e2e/rfs-truth-flow.spec.ts --reporter=line`
Expected: FAIL for the missing behavior, not a syntax/import error.

**Step 3: Write minimal implementation**

```typescript
// Use existing app text/selectors. Avoid direct store mutation for this proof.
// If selectors are ambiguous, add aria-labels in the product task first and use those.
```

**Step 4: Run test to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npx playwright test e2e/rfs-truth-flow.spec.ts --reporter=line`
Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`
Expected: PASS. For browser/runtime tasks also run `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npm run test:visual` after ensuring no stale local dev server owns port 5173.

**Step 6: Commit**

```bash
git add e2e/rfs-flight.spec.ts e2e/rfs-route.spec.ts docs/reviews/2026-06-12-rfs-comprehensive-dogfood-audit.md
git commit -m "test: add browser proof for load-plan and gear-up truth"
```


### Task 8: Constrain initial-climb envelope evidence [PARENT-DIRECT]

**Objective:** Add targeted tests that fail on rocket-like climb rates/pitch instead of accepting near-6000 fpm climbs as normal.

**Files:**
- Modify: `src/sim/physics/__tests__/performanceEnvelope.test.ts`
- Modify: `src/sim/physics/__tests__/integrate.test.ts`
- Modify later: `src/sim/physics/aero.ts` or FDM data if test fails

**Step 1: Write failing test**

```typescript
it('ENVA tutorial manual climb stays inside a bounded initial climb envelope', () => {
  const sample = runEnvaTakeoffForSeconds({ seconds: 20, throttle: 1, rotateAtKt: 149 });
  expect(sample.maxPitchDeg).toBeLessThanOrEqual(18);
  expect(sample.maxVerticalSpeedFpm).toBeLessThanOrEqual(4200);
  expect(sample.minIasAfterLiftoffKt).toBeGreaterThanOrEqual(125);
});
```

**Step 2: Run test to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/physics/__tests__/performanceEnvelope.test.ts -t "initial climb envelope"`
Expected: FAIL for the missing behavior, not a syntax/import error.

**Step 3: Write minimal implementation**

```typescript
// Minimal green should tune through data-owned coefficients, not hidden literals.
// If helper setup is missing, first add the helper with the same fixed-step integrator used by existing performance-envelope tests.
```

**Step 4: Run test to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/physics/__tests__/performanceEnvelope.test.ts src/sim/physics/__tests__/integrate.test.ts`
Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`
Expected: PASS. For browser/runtime tasks also run `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npm run test:visual` after ensuring no stale local dev server owns port 5173.

**Step 6: Commit**

```bash
git add src/sim/physics/__tests__/performanceEnvelope.test.ts src/sim/physics/__tests__/integrate.test.ts src/sim/physics/aero.ts
git commit -m "test: bound ENVA initial climb envelope"
```

**Do not retune blindly:** If this test fails, collect pitch/IAS/VS samples and update the flight-model-realism plan task for data-owned tuning. Do not claim the envelope is realistic until source-lineage improves.

## Dependency map

- Tasks 1-4 must serialize because they touch guidance predicates and phase logic.
- Tasks 5-7 must follow Tasks 1-4 because gear/load-plan browser proof depends on the final truth semantics.
- Task 8 can run after Task 4 and before or after Task 5, but do not tune physics in the same commit as UI/AP truth changes.

## Plan review history

- Initial controller pass: created from RFS-003/004/005/006/007/026/041 findings and current reads of `guidanceState.ts`, `takeoffCue.ts`, `checklistCoach.ts`, `keyboardControls.ts`, `cockpitInteractions.ts`, `flightPlanLoader.ts`, and `App.tsx`.
- Independent coverage review: PASS — RFS-001 through RFS-055 are mapped with no missing/extra IDs and each child plan has actionable tasks.
- Independent command/path review: initial blockers found for invalid `git add` pathspecs, bare visual-test commands, and code-fence language mismatches; all were patched.
- Independent architecture/deploy-governance review: initial blockers found for worker/scheduler heartbeat safety and deploy-security parent-direct markings; all were patched.
- Final focused re-review: PASS — no remaining command/path/fence blockers and architecture/deploy-governance blockers are closed.
