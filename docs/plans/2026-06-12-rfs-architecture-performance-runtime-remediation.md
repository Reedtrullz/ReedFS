# RFS Architecture, Performance, and Runtime Remediation Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task. Use strict TDD for code tasks, run two-stage reviews after each task, and preserve the non-claim discipline from the RFS project memory.

**Goal:** Reduce main-thread/runtime risk by connecting worker physics, splitting App/store responsibilities, centralizing frame scheduling, memoizing instrument snapshots, and moving AP controller state out of module globals.

**Architecture:** This plan intentionally isolates cross-cutting runtime migrations as [PARENT-DIRECT]. Each migration first adds a seam and parity tests, then switches one caller at a time. Do not batch the worker, store split, and frame scheduler in one commit.

**Tech Stack:** React 19, TypeScript 6, Vite, Zustand, Vitest, Playwright, CesiumJS, Three.js, Docker/GitHub Actions where applicable.

**Source audit:** Derived from `/Users/reidar/Projectos/RFS/dogfood-output/2026-06-12-rfs-comprehensive-review/report.md` and the repo copy `/Users/reidar/Projectos/RFS/docs/reviews/2026-06-12-rfs-comprehensive-dogfood-audit.md`.

**Covers findings:** RFS-016, RFS-017, RFS-018, RFS-019, RFS-042, RFS-043, RFS-044, RFS-045, RFS-046

**Global rules:**
- Start every code task by writing the failing test and watching it fail for the expected reason.
- Use `source ~/.nvm/nvm.sh && nvm use 22` before every `npm`, `npx`, or `node` command.
- Do not push, deploy, rewrite history, read secrets, or modify credentials without explicit current authorization.
- Do not claim CI/live/full-flight/full-route/VNAV/data-backed FDM proof unless the exact evidence has actually been run.
- Use `patch` for existing source edits and `write_file` for new files.
- Commit after coherent task groups. Do not let parallel subagents commit in the same worktree.

---

### Task 1: Add scenario-owned weather station metadata

**Objective:** Stop hard-coding KSEA METAR for the default ENVA scenario.

**Files:**
- Modify: `src/sim/scenarios.ts`
- Modify: `src/App.tsx:179-186`
- Modify: `src/sim/__tests__/scenarios.test.ts`
- Modify: `src/__tests__/App.test.tsx`

**Step 1: Write failing test**

```typescript
it('fetches METAR for the selected scenario airport station', async () => {
  render(<App />);
  expect(fetchMetar).toHaveBeenCalledWith('ENVA');
  await selectScenario('ksea-tutorial');
  expect(fetchMetar).toHaveBeenCalledWith('KSEA');
});
```

**Step 2: Run test to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/__tests__/App.test.tsx -t "METAR"`
Expected: FAIL for the missing behavior, not a syntax/import error.

**Step 3: Write minimal implementation**

```typescript
export interface FlightScenario {
  // existing fields
  weatherStationIcao?: string;
}

// App effect depends on selected scenario weatherStationIcao.
const station = scenario.weatherStationIcao ?? scenario.runway.airport;
fetchMetar(station);
```

**Step 4: Run test to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/__tests__/scenarios.test.ts src/__tests__/App.test.tsx`
Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`
Expected: PASS. For browser/runtime tasks also run `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npm run test:visual` after ensuring no stale local dev server owns port 5173.

**Step 6: Commit**

```bash
git add src/sim/scenarios.ts src/App.tsx src/sim/__tests__/scenarios.test.ts src/__tests__/App.test.tsx
git commit -m "fix: fetch scenario-specific weather"
```


### Task 2: Add async worker runtime interface without switching default [PARENT-DIRECT]

**Objective:** Create a real Worker-backed runtime seam while keeping main-thread default until parity is proven.

**Files:**
- Create: `src/sim/browserWorkerRuntime.ts`
- Create: `src/sim/__tests__/browserWorkerRuntime.test.ts`
- Modify: `src/sim/simulationRuntime.ts`
- Modify: `src/config/workerPhysics.ts`

**Step 1: Write failing test**

```typescript
it('falls back to main-thread runtime when Worker construction fails', async () => {
  const runtime = createSimulationRuntime({ workerFactory: () => { throw new Error('blocked'); } });
  expect(runtime.kind).toBe('main-thread');
});
```

**Step 2: Run test to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/__tests__/browserWorkerRuntime.test.ts`
Expected: FAIL for the missing behavior, not a syntax/import error.

**Step 3: Write minimal implementation**

```typescript
export interface AsyncSimulationRuntime {
  readonly kind: 'main-thread' | 'browser-worker';
  step(input: SimulationStepInput): Promise<SimulationStepResult>;
  dispose(): void;
}
```

**Step 4: Run test to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/__tests__/browserWorkerRuntime.test.ts src/sim/__tests__/simulationRuntime.test.ts src/sim/__tests__/simulationWorker.test.ts`
Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`
Expected: PASS. For browser/runtime tasks also run `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npm run test:visual` after ensuring no stale local dev server owns port 5173.

**Step 6: Commit**

```bash
git add src/sim/browserWorkerRuntime.ts src/sim/__tests__/browserWorkerRuntime.test.ts src/sim/simulationRuntime.ts src/config/workerPhysics.ts
git commit -m "feat: add browser worker simulation runtime seam"
```

**Safety note:** Do not enable worker runtime by default in this task. Keep the current synchronous store tick path intact.

### Task 3: Switch store tick to worker-capable step behind feature flag [PARENT-DIRECT]

**Objective:** Use the worker runtime only when explicitly enabled and proven to preserve state/control ordering.

**Files:**
- Modify: `src/store/simStore.ts`
- Modify: `src/store/__tests__/simStore.test.ts`
- Modify: `src/config/__tests__/workerPhysics.test.ts`
- Modify: `docs/architecture.md`

**Step 1: Write failing test**

```typescript
it('uses worker runtime only when worker physics flag is enabled', async () => {
  setWorkerPhysicsFlagForTest(true);
  const runtime = createMockAsyncRuntime();
  useSimStore.getState().setSimulationRuntime(runtime);
  await useSimStore.getState().tickAsync(performance.now());
  expect(runtime.step).toHaveBeenCalled();
});

it('preserves the documented heartbeat order through the worker tick seam', async () => {
  const order: string[] = [];
  const runtime = createOrderRecordingRuntime(order);
  useSimStore.getState().setSimulationRuntime(runtime);
  await useSimStore.getState().tickAsync(performance.now());
  expect(order).toEqual([
    'clone-aircraft',
    'pre-integration-route-status',
    'resolve-ap-commands',
    'apply-effective-controls',
    'physics-integration',
    'post-integration-route-status',
    'derive-guidance',
    'commit-snapshot',
  ]);
});
```

**Step 2: Run test to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/store/__tests__/simStore.test.ts -t "worker runtime"`
Expected: FAIL for the missing behavior, not a syntax/import error.

**Step 3: Write minimal implementation**

```typescript
// Add async tick seam first; keep `tick()` for current RAF caller if needed.
async tickAsync(nowMs: number) {
  const runtime = getSimulationRuntime();
  const result = await runtime.step(input);
  set(applySimulationStepResult(result));
}
```

**Step 4: Run test to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/store/__tests__/simStore.test.ts src/sim/__tests__/simulationRuntime.test.ts src/sim/__tests__/simulationStep.test.ts`
Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`
Expected: PASS. For browser/runtime tasks also run `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npm run test:visual` after ensuring no stale local dev server owns port 5173.

**Heartbeat safety verification:** Re-read `docs/architecture.md` after implementation and confirm the worker path still follows the documented order: clone aircraft → pre-integration route status → AP command resolution → effective controls → physics integration → post-integration route status/guidance → snapshot commit. The failing/passing test above must prove this order, not only that `runtime.step()` was called.

**Step 6: Commit**

```bash
git add src/store/simStore.ts src/store/__tests__/simStore.test.ts src/config/__tests__/workerPhysics.test.ts docs/architecture.md
git commit -m "feat: wire feature-flagged worker tick path"
```


### Task 4: Extract App controllers one at a time [PARENT-DIRECT]

**Objective:** Split App.tsx orchestration into focused controllers without changing behavior.

**Files:**
- Create: `src/components/SimulationShell.tsx`
- Create: `src/components/InputController.tsx`
- Create: `src/components/WeatherController.tsx`
- Create: `src/components/SceneLayers.tsx`
- Modify: `src/App.tsx`
- Modify: `src/__tests__/App.test.tsx`

**Step 1: Write failing test**

```typescript
it('App still renders the flight shell after controller extraction', async () => {
  render(<App />);
  expect(await screen.findByRole('button', { name: 'START ROLL' })).toBeVisible();
  expect(screen.getByText(/AUDIO:/)).toBeVisible();
});
```

**Step 2: Run test to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/__tests__/App.test.tsx -t "flight shell"`
Expected: FAIL for the missing behavior, not a syntax/import error.

**Step 3: Write minimal implementation**

```typescript
export function WeatherController() {
  // Own only METAR/weather side effects; render null.
  return null;
}

export function InputController() {
  // Own keyboard/gamepad effects; render null.
  return null;
}
```

**Step 4: Run test to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/__tests__/App.test.tsx`
Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`
Expected: PASS. For browser/runtime tasks also run `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npm run test:visual` after ensuring no stale local dev server owns port 5173.

**Step 6: Commit**

```bash
git add src/components/SimulationShell.tsx src/components/InputController.tsx src/components/WeatherController.tsx src/components/SceneLayers.tsx src/App.tsx src/__tests__/App.test.tsx
git commit -m "refactor: split App runtime controllers"
```

**Task split guidance:** If this grows beyond ~150 changed lines, split into four commits: WeatherController, InputController, SceneLayers, ControlBar.

### Task 5: Extract store slices behind compatibility exports [PARENT-DIRECT]

**Objective:** Reduce simStore domain coupling while keeping `useSimStore` API stable for callers.

**Files:**
- Create: `src/store/slices/simulationSlice.ts`
- Create: `src/store/slices/autoflightSlice.ts`
- Create: `src/store/slices/routeSlice.ts`
- Create: `src/store/slices/scenarioPersistenceSlice.ts`
- Modify: `src/store/simStore.ts`
- Modify: `src/store/__tests__/simStore.test.ts`

**Step 1: Write failing test**

```typescript
it('preserves public simStore actions after slice extraction', () => {
  const s = useSimStore.getState();
  expect(typeof s.startTakeoffRoll).toBe('function');
  expect(typeof s.setFlightPlan).toBe('function');
  expect(typeof s.saveScenarioState).toBe('function');
});
```

**Step 2: Run test to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/store/__tests__/simStore.test.ts -t "public simStore actions"`
Expected: FAIL for the missing behavior, not a syntax/import error.

**Step 3: Write minimal implementation**

```typescript
// Keep the existing exported `useSimStore` and type names.
// Move implementation chunks into slice factories, but compose in simStore.ts.
export const useSimStore = create<SimStoreState>()((set, get) => ({
  ...createSimulationSlice(set, get),
  ...createAutoflightSlice(set, get),
  ...createRouteSlice(set, get),
}));
```

**Step 4: Run test to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/store/__tests__/simStore.test.ts src/__tests__/App.test.tsx`
Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`
Expected: PASS. For browser/runtime tasks also run `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npm run test:visual` after ensuring no stale local dev server owns port 5173.

**Step 6: Commit**

```bash
git add src/store/slices/simulationSlice.ts src/store/slices/autoflightSlice.ts src/store/slices/routeSlice.ts src/store/slices/scenarioPersistenceSlice.ts src/store/simStore.ts src/store/__tests__/simStore.test.ts
git commit -m "refactor: split simStore into domain slices"
```


### Task 6: Add centralized frame scheduler [PARENT-DIRECT]

**Objective:** Coordinate simulation, input, audio, contrails, FPS, and visibility throttling through one scheduler seam.

**Files:**
- Create: `src/hooks/useFrameScheduler.ts`
- Create: `src/hooks/__tests__/useFrameScheduler.test.tsx`
- Modify: `src/hooks/useSimLoop.ts`
- Modify: `src/hooks/useAudioLoop.ts`
- Modify: `src/components/FPSMonitor.tsx`
- Modify: `docs/architecture.md`

**Step 1: Write failing test**

```typescript
it('notifies subscribers from one animation frame loop', () => {
  const scheduler = createFrameScheduler();
  const a = vi.fn();
  const b = vi.fn();
  scheduler.subscribe(a);
  scheduler.subscribe(b);
  scheduler.step(1000);
  expect(a).toHaveBeenCalledWith(expect.objectContaining({ now: 1000 }));
  expect(b).toHaveBeenCalledTimes(1);
});

it('keeps simulation ticks single-owned and ordered before audio/diagnostic subscribers', () => {
  const order: string[] = [];
  const scheduler = createFrameScheduler();
  scheduler.subscribeSimulation(() => order.push('simulation'));
  scheduler.subscribeAudio(() => order.push('audio'));
  scheduler.subscribeDiagnostics(() => order.push('diagnostics'));
  scheduler.step(1000);
  expect(order).toEqual(['simulation', 'audio', 'diagnostics']);
});
```

**Step 2: Run test to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/hooks/__tests__/useFrameScheduler.test.tsx`
Expected: FAIL for the missing behavior, not a syntax/import error.

**Step 3: Write minimal implementation**

```typescript
export interface FrameTick { now: number; dtMs: number; }
export interface FrameScheduler { subscribe(fn: (tick: FrameTick) => void): () => void; }
```

**Step 4: Run test to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/hooks/__tests__/useFrameScheduler.test.tsx src/hooks/__tests__/useSimLoop.test.tsx src/hooks/__tests__/useAudioLoop.test.tsx`
Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`
Expected: PASS. For browser/runtime tasks also run `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npm run test:visual` after ensuring no stale local dev server owns port 5173.

**Heartbeat safety verification:** Update `docs/architecture.md` to show the new scheduler entry point and prove one simulation tick per RAF when running, no simulation tick when paused/stopped, and simulation before audio/diagnostics so inputs/effective controls are not applied after audio/visual subscribers observe state.

**Step 6: Commit**

```bash
git add src/hooks/useFrameScheduler.ts src/hooks/__tests__/useFrameScheduler.test.tsx src/hooks/useSimLoop.ts src/hooks/useAudioLoop.ts src/components/FPSMonitor.tsx docs/architecture.md
git commit -m "feat: add shared frame scheduler"
```


### Task 7: Add memoized instrument snapshot selector

**Objective:** Compute PFD/debug derived values once per state snapshot instead of repeating derived calculations across selectors.

**Files:**
- Create: `src/instruments/instrumentSnapshot.ts`
- Create: `src/instruments/__tests__/instrumentSnapshot.test.ts`
- Modify: `src/instruments/RfsPFD.tsx`
- Modify: `src/components/Telemetry.tsx`

**Step 1: Write failing test**

```typescript
it('returns stable snapshot values for unchanged primitive inputs', () => {
  const a = createInstrumentSnapshot(state, wind, apState, routeStatus);
  const b = createInstrumentSnapshot(state, wind, apState, routeStatus);
  expect(b.iasKt).toBe(a.iasKt);
  expect(b.pitchDeg).toBe(a.pitchDeg);
});
```

**Step 2: Run test to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/instruments/__tests__/instrumentSnapshot.test.ts`
Expected: FAIL for the missing behavior, not a syntax/import error.

**Step 3: Write minimal implementation**

```typescript
export interface InstrumentSnapshot {
  iasKt: number;
  altitudeFt: number;
  verticalSpeedFpm: number;
  pitchDeg: number;
  rollDeg: number;
  fma: DisplayFmaTruth;
}
```

**Step 4: Run test to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/instruments/__tests__/instrumentSnapshot.test.ts src/instruments/__tests__/RfsPFD.test.tsx src/components/__tests__/Telemetry.test.tsx`
Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`
Expected: PASS. For browser/runtime tasks also run `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npm run test:visual` after ensuring no stale local dev server owns port 5173.

**Step 6: Commit**

```bash
git add src/instruments/instrumentSnapshot.ts src/instruments/__tests__/instrumentSnapshot.test.ts src/instruments/RfsPFD.tsx src/components/Telemetry.tsx
git commit -m "perf: add shared instrument snapshot"
```


### Task 8: Move AP controller PID state into runtime state [PARENT-DIRECT]

**Objective:** Eliminate module-level AP mutable state so multiple runtimes/tests cannot leak PID/throttle state.

**Files:**
- Modify: `src/sim/systems/autopilot.ts`
- Modify: `src/sim/simulationStep.ts`
- Modify: `src/sim/systems/__tests__/autopilot.test.ts`
- Modify: `src/sim/__tests__/simulationStep.test.ts`

**Step 1: Write failing test**

```typescript
it('keeps autopilot controller state isolated per simulation runtime', () => {
  const a = createAutopilotControllerState();
  const b = createAutopilotControllerState();
  runSpeedModeWithState(a);
  expect(b.throttleLimited).not.toBe(a.throttleLimited);
});
```

**Step 2: Run test to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/systems/__tests__/autopilot.test.ts -t "controller state isolated"`
Expected: FAIL for the missing behavior, not a syntax/import error.

**Step 3: Write minimal implementation**

```typescript
export interface AutopilotControllerState {
  pitchPid: PidState;
  rollPid: PidState;
  throttlePid: PidState;
  throttleLimited: number;
}

export function computeAutopilotCommandsForState(input: { controller: AutopilotControllerState; /* existing args */ }) {
  // mutate/return controller state explicitly, not module globals.
}
```

**Step 4: Run test to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/systems/__tests__/autopilot.test.ts src/sim/__tests__/simulationStep.test.ts src/store/__tests__/simStore.test.ts`
Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`
Expected: PASS. For browser/runtime tasks also run `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npm run test:visual` after ensuring no stale local dev server owns port 5173.

**Step 6: Commit**

```bash
git add src/sim/systems/autopilot.ts src/sim/simulationStep.ts src/sim/systems/__tests__/autopilot.test.ts src/sim/__tests__/simulationStep.test.ts
git commit -m "refactor: store autopilot controller state explicitly"
```


### Task 9: Reduce App test brittleness with component test doubles

**Objective:** Keep App tests focused on shell wiring and move detailed MCP/PFD assertions to component tests.

**Files:**
- Modify: `src/__tests__/App.test.tsx`
- Read: `src/instruments/__tests__/RfsMCP.test.tsx`
- Read: `src/instruments/__tests__/RfsPFD.test.tsx`

**Step 1: Write failing test**

```typescript
it('renders stable App shell controls without waiting on lazy instrument internals', async () => {
  render(<App />);
  expect(await screen.findByRole('button', { name: 'START ROLL' })).toBeVisible();
  expect(screen.getByTestId('mock-rfs-mcp')).toBeVisible();
});
```

**Step 2: Run test to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/__tests__/App.test.tsx -t "stable App shell"`
Expected: FAIL for the missing behavior, not a syntax/import error.

**Step 3: Write minimal implementation**

```typescript
vi.mock('../instruments/RfsMCP', () => ({
  RfsMCP: () => <div data-testid="mock-rfs-mcp">MCP</div>,
}));
```

**Step 4: Run test to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/__tests__/App.test.tsx src/instruments/__tests__/RfsMCP.test.tsx src/instruments/__tests__/RfsPFD.test.tsx`
Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`
Expected: PASS. For browser/runtime tasks also run `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npm run test:visual` after ensuring no stale local dev server owns port 5173.

**Step 6: Commit**

```bash
git add src/__tests__/App.test.tsx
git commit -m "test: stabilize App shell tests"
```


### Task 10: Plan RFMS shared dependency packaging path [PARENT-DIRECT]

**Objective:** Make the repo self-contained or explicitly bootstrappable instead of relying on an undocumented sibling checkout.

**Files:**
- Modify: `README.md`
- Modify: `package.json` only if choosing a package/workspace path
- Modify: `.github/workflows/ci.yml` only if the path changes
- Create: `docs/plans/2026-06-12-rfs-rfms-shared-dependency-packaging.md` if the decision needs a separate plan

**Step 1: Write failing test**

```typescript
it('documents a one-command bootstrap for RFMS shared dependency', () => {
  const readme = readFileSync('README.md', 'utf8');
  expect(readme).toContain('npm run bootstrap:shared');
});
```

**Step 2: Run test to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/config/__tests__/docsPosture.test.ts`
Expected: FAIL for the missing behavior, not a syntax/import error.

**Step 3: Write minimal implementation**

```jsonc
// Minimal first step: add a bootstrap script instead of changing package ownership.
"bootstrap:shared": "git -C ../RFMS rev-parse --is-inside-work-tree || git clone https://github.com/Reedtrullz/RFMC.git ../RFMS"
```

**Step 4: Run test to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check:release`
Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`
Expected: PASS. For browser/runtime tasks also run `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npm run test:visual` after ensuring no stale local dev server owns port 5173.

**Step 6: Commit**

```bash
git add README.md package.json
git commit -m "docs: define RFMS shared dependency bootstrap path"
```

**Decision point:** A published package/submodule/workspace migration is larger than docs. If chosen, write a dedicated plan before changing package ownership.

## Dependency map

- Task 1 is small and should land before App extraction so WeatherController has correct behavior.
- Tasks 2-3 are [PARENT-DIRECT] and must not be delegated as one “move physics to worker” mega-task.
- Tasks 4-5 are refactors; change one file/domain at a time and run `App.test.tsx` plus store tests after each.
- Task 8 should happen after worker/store seams are understood, because controller state must serialize cleanly.

## Plan review history

- Initial controller pass: based on runtime heartbeat in `docs/architecture.md`, current `simulationRuntime.ts`, `App.tsx`, `simStore.ts` architecture findings, and RFS skill warnings about worker tasks being parent-direct.
- Independent coverage review: PASS — RFS-001 through RFS-055 are mapped with no missing/extra IDs and each child plan has actionable tasks.
- Independent command/path review: initial blockers found for invalid `git add` pathspecs, bare visual-test commands, and code-fence language mismatches; all were patched.
- Independent architecture/deploy-governance review: initial blockers found for worker/scheduler heartbeat safety and deploy-security parent-direct markings; all were patched.
- Final focused re-review: PASS — no remaining command/path/fence blockers and architecture/deploy-governance blockers are closed.
