# RFS Autoflight, FMS, VNAV, and Route-Proof Remediation Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task. Use strict TDD for code tasks, run two-stage reviews after each task, and preserve the non-claim discipline from the RFS project memory.

**Goal:** Make VNAV/FMS features reachable and backed, route completion explicit, AP targets current-aircraft seeded, FD bars truthful, SPEED mode IAS-based, and browser route proof driven through real UI.

**Architecture:** Build on the effective-autoflight truth work by adding missing UI affordances only when backing exists. Route and VNAV state stay store-owned; PFD/MCP/servo laws consume the same derived truth and tests prove both active backing and inactive no-authority cases.

**Tech Stack:** React 19, TypeScript 6, Vite, Zustand, Vitest, Playwright, CesiumJS, Three.js, Docker/GitHub Actions where applicable.

**Source audit:** Derived from `/Users/reidar/Projectos/RFS/dogfood-output/2026-06-12-rfs-comprehensive-review/report.md` and the repo copy `/Users/reidar/Projectos/RFS/docs/reviews/2026-06-12-rfs-comprehensive-dogfood-audit.md`.

**Covers findings:** RFS-008, RFS-009, RFS-010, RFS-035, RFS-036, RFS-037, RFS-038

**Global rules:**
- Start every code task by writing the failing test and watching it fail for the expected reason.
- Use `source ~/.nvm/nvm.sh && nvm use 22` before every `npm`, `npx`, or `node` command.
- Do not push, deploy, rewrite history, read secrets, or modify credentials without explicit current authorization.
- Do not claim CI/live/full-flight/full-route/VNAV/data-backed FDM proof unless the exact evidence has actually been run.
- Use `patch` for existing source edits and `write_file` for new files.
- Commit after coherent task groups. Do not let parallel subagents commit in the same worktree.

---

### Task 1: Add altitude/speed constraints to KSEA sample route

**Objective:** Give the default KSEA→KPDX route actionable VNAV constraints so VNAV availability can become true for at least one leg.

**Files:**
- Modify: `src/sim/flightPlanLoader.ts`
- Modify: `src/sim/__tests__/flightPlanLoader.test.ts` or create if missing
- Modify: `src/sim/systems/__tests__/vnav.test.ts`

**Step 1: Write failing test**

```typescript
it('KSEA sample route includes actionable VNAV constraints', () => {
  const fp = createKseaKpdxFlight();
  expect(fp.waypoints.some((w) => w.altitudeConstraint || w.speedConstraint)).toBe(true);
  expect(fp.waypoints.find((w) => w.ident === 'KPDX')?.altitudeConstraint).toEqual({ type: 'AT', altitude: 3000 });
});
```

**Step 2: Run test to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/__tests__/flightPlanLoader.test.ts src/sim/systems/__tests__/vnav.test.ts`
Expected: FAIL for the missing behavior, not a syntax/import error.

**Step 3: Write minimal implementation**

```typescript
// Example constraint shape; verify @shared types before final patch.
{ ident: 'BTG', lat: 45.75, lon: -122.59, coordinateSource: 'synthetic', discontinuity: false,
  altitudeConstraint: { type: 'AT_OR_BELOW', altitude: 12000 },
  speedConstraint: { type: 'AT_OR_BELOW', speed: 280 },
}
{ ident: 'KPDX', lat: 45.59, lon: -122.60, coordinateSource: 'synthetic', discontinuity: false,
  altitudeConstraint: { type: 'AT', altitude: 3000 },
  speedConstraint: { type: 'AT_OR_BELOW', speed: 210 },
}
```

**Step 4: Run test to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/__tests__/flightPlanLoader.test.ts src/sim/systems/__tests__/vnav.test.ts`
Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`
Expected: PASS. For browser/runtime tasks also run `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npm run test:visual` after ensuring no stale local dev server owns port 5173.

**Step 6: Commit**

```bash
git add src/sim/flightPlanLoader.ts src/sim/__tests__/flightPlanLoader.test.ts src/sim/systems/__tests__/vnav.test.ts
git commit -m "feat: add VNAV constraints to KSEA route"
```


### Task 2: Expose VNAV MCP button with availability gating

**Objective:** Render a VNAV button only when flight-plan/route VNAV backing is available, and make it set backed Boeing VNAV truth.

**Files:**
- Modify: `src/instruments/RfsMCP.tsx`
- Modify: `src/instruments/__tests__/RfsMCP.test.tsx`
- Read: `src/sim/systems/effectiveAutoflightTruth.ts`

**Step 1: Write failing test**

```typescript
it('renders VNAV as disabled until route VNAV is available', () => {
  renderMcp({ routeStatus: noRouteStatus, flightPlan: null });
  expect(screen.queryByRole('button', { name: 'VNAV' })).toBeNull();
});

it('engages backed VNAV when a constrained route is available', async () => {
  renderMcp({ routeStatus: constrainedRouteStatus, flightPlan: constrainedPlan });
  await user.click(screen.getByRole('button', { name: 'VNAV' }));
  expect(lastApState().truth.verticalActive).toMatch(/VNAV|VNAV_PTH|ALT\*/);
  expect(lastApState().boeing.vnav).toBe(true);
});
```

**Step 2: Run test to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/instruments/__tests__/RfsMCP.test.tsx -t "VNAV"`
Expected: FAIL for the missing behavior, not a syntax/import error.

**Step 3: Write minimal implementation**

```typescript
type EnabledMcpMode = 'HDG_SEL' | 'LNAV' | 'ALT_HOLD' | 'VS' | 'VNAV' | 'SPEED' | 'N1' | 'OFF';

// applyMcpMode vertical block:
} else if (mode === 'VNAV') {
  apState.truth.verticalActive = 'VNAV';
  apState.boeing.vnav = true;
  apState.boeing.altHold = false;
  apState.boeing.vs = false;
}

// Render VNAV only when computeVNAV(...).available or effective truth can back it.
```

**Step 4: Run test to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/instruments/__tests__/RfsMCP.test.tsx src/sim/systems/__tests__/effectiveAutoflightTruth.test.ts`
Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`
Expected: PASS. For browser/runtime tasks also run `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npm run test:visual` after ensuring no stale local dev server owns port 5173.

**Step 6: Commit**

```bash
git add src/instruments/RfsMCP.tsx src/instruments/__tests__/RfsMCP.test.tsx
git commit -m "feat: expose gated VNAV MCP mode"
```


### Task 3: Seed first MCP targets from current aircraft state

**Objective:** Avoid arbitrary first-click targets like heading 000 and altitude 10000 by creating AP state from current IAS/heading/altitude.

**Files:**
- Modify: `src/instruments/defaultAutopilotState.ts`
- Modify: `src/instruments/RfsMCP.tsx`
- Modify: `src/instruments/__tests__/defaultAutopilotState.test.ts`
- Modify: `src/instruments/__tests__/RfsMCP.test.tsx`

**Step 1: Write failing test**

```typescript
it('creates default AP targets from current aircraft state', () => {
  const ap = createDefaultAutopilotStateFromAircraft(aircraftAt({ headingDeg: 163, altitudeFt: 432, iasKt: 149 }));
  expect(ap.boeing.heading).toBe(163);
  expect(ap.boeing.altitude).toBe(400);
  expect(ap.boeing.speed).toBe(149);
});
```

**Step 2: Run test to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/instruments/__tests__/defaultAutopilotState.test.ts`
Expected: FAIL for the missing behavior, not a syntax/import error.

**Step 3: Write minimal implementation**

```typescript
export function createDefaultAutopilotStateFromAircraft(aircraft: AircraftState, wind: WindInfo | null = null): AutopilotState {
  const derived = computeDerived(aircraft, wind);
  const ap = createDefaultAutopilotState();
  ap.boeing.heading = Math.round(aircraft.attitude.psi * 180 / Math.PI);
  ap.boeing.altitude = Math.round(aircraft.position.alt / 100) * 100;
  ap.boeing.speed = Math.round(derived.ias);
  return ap;
}
```

**Step 4: Run test to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/instruments/__tests__/defaultAutopilotState.test.ts src/instruments/__tests__/RfsMCP.test.tsx`
Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`
Expected: PASS. For browser/runtime tasks also run `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npm run test:visual` after ensuring no stale local dev server owns port 5173.

**Step 6: Commit**

```bash
git add src/instruments/defaultAutopilotState.ts src/instruments/RfsMCP.tsx src/instruments/__tests__/defaultAutopilotState.test.ts src/instruments/__tests__/RfsMCP.test.tsx
git commit -m "fix: seed MCP defaults from current aircraft state"
```


### Task 4: Add route completion/arrived state

**Objective:** Make final waypoint capture explicit instead of leaving LNAV available forever on the final leg.

**Files:**
- Modify: `src/sim/systems/navigation.ts`
- Modify: `src/sim/systems/__tests__/navigation.test.ts`
- Modify: `src/components/RouteStatus.tsx`
- Modify: `src/components/__tests__/RouteStatus.test.tsx`

**Step 1: Write failing test**

```typescript
it('marks the route complete at the final waypoint', () => {
  const status = computeRouteStatus(aircraftAtFinalWaypoint(), createKseaKpdxFlight(), finalLegIndex);
  expect(status.routeComplete).toBe(true);
  expect(status.lnavAvailable).toBe(false);
  expect(status.lnavUnavailableReason).toMatch(/route complete/i);
});
```

**Step 2: Run test to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/systems/__tests__/navigation.test.ts -t "route complete"`
Expected: FAIL for the missing behavior, not a syntax/import error.

**Step 3: Write minimal implementation**

```typescript
export interface RouteStatusSnapshot {
  // existing fields...
  routeComplete: boolean;
}

// When final leg waypoint is reached:
return {
  ...snapshot,
  routeComplete: true,
  lnavAvailable: false,
  lnavUnavailableReason: 'route complete',
};
```

**Step 4: Run test to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/systems/__tests__/navigation.test.ts src/components/__tests__/RouteStatus.test.tsx src/store/__tests__/simStore.test.ts`
Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`
Expected: PASS. For browser/runtime tasks also run `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npm run test:visual` after ensuring no stale local dev server owns port 5173.

**Step 6: Commit**

```bash
git add src/sim/systems/navigation.ts src/sim/systems/__tests__/navigation.test.ts src/components/RouteStatus.tsx src/components/__tests__/RouteStatus.test.tsx
git commit -m "feat: expose final route completion state"
```


### Task 5: Drive SPEED mode from IAS/CAS, not raw body-speed magnitude

**Objective:** Align autothrottle SPEED error with the same IAS value the PFD/MCP presents.

**Files:**
- Modify: `src/sim/systems/autopilot.ts`
- Modify: `src/sim/systems/__tests__/autopilot.test.ts`
- Read: `src/sim/physics/derived.ts`

**Step 1: Write failing test**

```typescript
it('SPEED mode uses IAS under wind instead of ground/body speed', () => {
  const calm = computeApForSpeedHold({ iasKt: 230, groundSpeedKt: 250, selectedSpeedKt: 250, windKt: 20 });
  expect(calm.throttleCommand).toBeGreaterThan(0.5);
});
```

**Step 2: Run test to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/systems/__tests__/autopilot.test.ts -t "SPEED mode uses IAS"`
Expected: FAIL for the missing behavior, not a syntax/import error.

**Step 3: Write minimal implementation**

```typescript
import { computeDerived } from '../physics/derived';

const derived = computeDerived(state, wind);
const speedError = targetSpeedKt - derived.ias;
// Keep target display and SPEED law on the same unit.
```

**Step 4: Run test to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/systems/__tests__/autopilot.test.ts src/instruments/__tests__/RfsPFD.test.tsx`
Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`
Expected: PASS. For browser/runtime tasks also run `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npm run test:visual` after ensuring no stale local dev server owns port 5173.

**Step 6: Commit**

```bash
git add src/sim/systems/autopilot.ts src/sim/systems/__tests__/autopilot.test.ts
git commit -m "fix: drive SPEED mode from displayed IAS"
```


### Task 6: Extend flight-director command bars for backed LNAV, VS, and VNAV [PARENT-DIRECT]

**Objective:** Prevent active FMA modes from having no corresponding FD visual guidance.

**Files:**
- Modify: `src/instruments/RfsPFD.tsx`
- Modify: `src/instruments/__tests__/RfsPFD.test.tsx`
- Read: `src/sim/systems/autopilot.ts` target-resolution logic

**Step 1: Write failing test**

```typescript
it('draws a roll FD command for backed LNAV', () => {
  renderPfdWith({ truth: { lateralActive: 'LNAV' }, routeStatus: validOffsetRouteStatus });
  expect(screen.getByTestId('fd-roll-command')).toHaveAttribute('data-mode', 'LNAV');
});

it('draws a pitch FD command for backed VS', () => {
  renderPfdWith({ truth: { verticalActive: 'VS' }, verticalSpeedTarget: -1000 });
  expect(screen.getByTestId('fd-pitch-command')).toHaveAttribute('data-mode', 'VS');
});
```

**Step 2: Run test to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/instruments/__tests__/RfsPFD.test.tsx -t "FD"`
Expected: FAIL for the missing behavior, not a syntax/import error.

**Step 3: Write minimal implementation**

```typescript
// Add a small pure helper rather than duplicating render math in JSX:
export function deriveFlightDirectorCue(input: FlightDirectorCueInput): FlightDirectorCue | null {
  // HDG/ALT existing behavior remains.
  // LNAV uses route desired-track error; VS/VNAV use target-vs or target-altitude error.
}
```

**Step 4: Run test to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/instruments/__tests__/RfsPFD.test.tsx`
Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`
Expected: PASS. For browser/runtime tasks also run `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npm run test:visual` after ensuring no stale local dev server owns port 5173.

**Step 6: Commit**

```bash
git add src/instruments/RfsPFD.tsx src/instruments/__tests__/RfsPFD.test.tsx
git commit -m "feat: add FD cues for route and vertical modes"
```

**Safety note:** Keep FD bars hidden for modes without backed truth. Do not draw cosmetic LNAV/VNAV bars from raw flags.

### Task 7: Replace route proof state injection with real UI proof

**Objective:** Add a Playwright route proof that clicks scenario/LOAD PLAN/MCP buttons and checks the same visible RouteStatus/FMA that a player sees.

**Files:**
- Modify: `e2e/rfs-route.spec.ts`
- Modify: `e2e/helpers/rfsRoute.ts` to add UI helpers rather than direct state injection
- Run explicit E2E parse check if helper is outside tsconfig

**Step 1: Write failing test**

```typescript
test('KSEA route is loaded and AP modes are selected through visible controls', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Scenario', { exact: true }).selectOption('ksea-tutorial');
  await page.getByRole('button', { name: 'LOAD PLAN' }).click();
  await expect(page.getByText(/KSEA→KPDX/)).toBeVisible();
  await page.getByRole('button', { name: 'LNAV' }).click();
  await page.getByRole('button', { name: 'SPD' }).click();
  await expect(page.getByText('LNAV').first()).toBeVisible();
});
```

**Step 2: Run test to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npx playwright test e2e/rfs-route.spec.ts --reporter=line`
Expected: FAIL for the missing behavior, not a syntax/import error.

**Step 3: Write minimal implementation**

```typescript
// Keep existing seeded long-route proofs for hard-to-reach end states, but add this UI smoke so LOAD PLAN/MCP regressions cannot hide behind store injection.
```

**Step 4: Run test to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npx playwright test e2e/rfs-route.spec.ts --reporter=line`
Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`
Expected: PASS. For browser/runtime tasks also run `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npm run test:visual` after ensuring no stale local dev server owns port 5173.

**Step 6: Commit**

```bash
git add e2e/rfs-route.spec.ts e2e/helpers/rfsRoute.ts
git commit -m "test: drive route proof through real UI controls"
```


## Dependency map

- Task 1 precedes Task 2 because VNAV gating needs a constrained route.
- Task 2 precedes Task 6 for VNAV FD cue visibility.
- Task 4 may run independently but must update every `RouteStatusSnapshot` fixture.
- Task 7 should run after P0 LOAD PLAN route/AP separation is complete.

## Plan review history

- Initial controller pass: based on current `RfsMCP.tsx`, `vnav.ts`, `navigation.ts`, `flightPlanLoader.ts`, `simulationRuntime.ts`, and dogfood RFS-008..010/RFS-035..038 findings.
- Independent coverage review: PASS — RFS-001 through RFS-055 are mapped with no missing/extra IDs and each child plan has actionable tasks.
- Independent command/path review: initial blockers found for invalid `git add` pathspecs, bare visual-test commands, and code-fence language mismatches; all were patched.
- Independent architecture/deploy-governance review: initial blockers found for worker/scheduler heartbeat safety and deploy-security parent-direct markings; all were patched.
- Final focused re-review: PASS — no remaining command/path/fence blockers and architecture/deploy-governance blockers are closed.
