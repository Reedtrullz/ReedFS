# RFS Browser UX, Accessibility, Product, and Test-Noise Remediation Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task. Use strict TDD for code tasks, run two-stage reviews after each task, and preserve the non-claim discipline from the RFS project memory.

**Goal:** Make the browser app more usable and inspectable by fixing semantic structure, ARIA state, overlay collisions, responsive layout, Cesium watermark/product posture, console/perf warnings, cockpit placeholders, save/load clarity, and test noise.

**Architecture:** Introduce small presentational helpers and tests before layout changes. Separate production flight UI from debug surfaces, keep visual proof deterministic, and avoid claiming mobile/PWA evidence unless real-device proof is run.

**Tech Stack:** React 19, TypeScript 6, Vite, Zustand, Vitest, Playwright, CesiumJS, Three.js, Docker/GitHub Actions where applicable.

**Source audit:** Derived from `/Users/reidar/Projectos/RFS/dogfood-output/2026-06-12-rfs-comprehensive-review/report.md` and the repo copy `/Users/reidar/Projectos/RFS/docs/reviews/2026-06-12-rfs-comprehensive-dogfood-audit.md`.

**Covers findings:** RFS-011, RFS-012, RFS-013, RFS-014, RFS-015, RFS-039, RFS-040, RFS-051, RFS-052, RFS-053, RFS-054, RFS-055

**Global rules:**
- Start every code task by writing the failing test and watching it fail for the expected reason.
- Use `source ~/.nvm/nvm.sh && nvm use 22` before every `npm`, `npx`, or `node` command.
- Do not push, deploy, rewrite history, read secrets, or modify credentials without explicit current authorization.
- Do not claim CI/live/full-flight/full-route/VNAV/data-backed FDM proof unless the exact evidence has actually been run.
- Use `patch` for existing source edits and `write_file` for new files.
- Commit after coherent task groups. Do not let parallel subagents commit in the same worktree.

---

### Task 1: Add semantic app shell and headings

**Objective:** Give the page one h1, main landmark, and panel headings without breaking canvas overlays.

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/ScenarioPanel.tsx`
- Modify: `src/components/RouteStatus.tsx`
- Modify: `src/__tests__/App.test.tsx`

**Step 1: Write failing test**

```typescript
it('exposes one page heading and a main landmark', async () => {
  render(<App />);
  expect(screen.getByRole('heading', { level: 1, name: /RFS/i })).toBeVisible();
  expect(screen.getByRole('main', { name: /flight simulator/i })).toBeVisible();
});
```

**Step 2: Run test to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/__tests__/App.test.tsx -t "page heading"`
Expected: FAIL for the missing behavior, not a syntax/import error.

**Step 3: Write minimal implementation**

```typescript
<main aria-label="RFS flight simulator" style={{ position: 'fixed', inset: 0 }}>
  <h1 className="sr-only">RFS Boeing 737-800 simulator</h1>
  {/* existing viewport and overlays */}
</main>
```

**Step 4: Run test to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/__tests__/App.test.tsx src/components/__tests__/ScenarioPanel.test.tsx src/components/__tests__/RouteStatus.test.tsx`
Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`
Expected: PASS. For browser/runtime tasks also run `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npm run test:visual` after ensuring no stale local dev server owns port 5173.

**Step 6: Commit**

```bash
git add src/App.tsx src/components/ScenarioPanel.tsx src/components/RouteStatus.tsx src/__tests__/App.test.tsx
git commit -m "feat: add semantic app shell landmarks"
```


### Task 2: Add ARIA pressed state to MCP and global mode buttons

**Objective:** Expose toggle state for MCP modes and CAM/OVL/AUDIO controls to assistive tech and tests.

**Files:**
- Modify: `src/instruments/RfsMCP.tsx`
- Modify: `src/instruments/__tests__/RfsMCP.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/__tests__/App.test.tsx`

**Step 1: Write failing test**

```typescript
it('sets aria-pressed on active MCP modes', async () => {
  renderMcpWithBackedMode('HDG_SEL');
  expect(screen.getByRole('button', { name: 'HDG' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'LNAV' })).toHaveAttribute('aria-pressed', 'false');
});
```

**Step 2: Run test to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/instruments/__tests__/RfsMCP.test.tsx -t "aria-pressed"`
Expected: FAIL for the missing behavior, not a syntax/import error.

**Step 3: Write minimal implementation**

```typescript
<button
  aria-pressed={displayedLatActive === 'HDG_SEL'}
  aria-label="MCP heading select"
  onClick={() => toggleMode('HDG_SEL')}
>
  HDG
</button>
```

**Step 4: Run test to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/instruments/__tests__/RfsMCP.test.tsx src/__tests__/App.test.tsx`
Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`
Expected: PASS. For browser/runtime tasks also run `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npm run test:visual` after ensuring no stale local dev server owns port 5173.

**Step 6: Commit**

```bash
git add src/instruments/RfsMCP.tsx src/instruments/__tests__/RfsMCP.test.tsx src/App.tsx src/__tests__/App.test.tsx
git commit -m "fix: expose toggle state for flight controls"
```


### Task 3: Introduce overlay layout manager [PARENT-DIRECT]

**Objective:** Prevent debug panels from stacking over primary instruments by assigning named regions/collapsible debug panels.

**Files:**
- Create: `src/components/OverlayLayout.tsx`
- Create: `src/components/__tests__/OverlayLayout.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/viewport/RunwayEditor.tsx` if region props are needed

**Step 1: Write failing test**

```typescript
it('assigns debug panels to non-overlapping named regions', () => {
  render(<OverlayLayout mode="debug" left={<Telemetry />} rightTop={<RunwayEditor />} rightMiddle={<RfsMCP />} bottom={<EngineStrip />} />);
  expect(screen.getByTestId('overlay-region-right-top')).toBeVisible();
  expect(screen.getByTestId('overlay-region-right-middle')).toBeVisible();
});
```

**Step 2: Run test to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/components/__tests__/OverlayLayout.test.tsx`
Expected: FAIL for the missing behavior, not a syntax/import error.

**Step 3: Write minimal implementation**

```typescript
export function OverlayLayout(props: OverlayLayoutProps) {
  return <div className={`overlay-layout overlay-layout--${props.mode}`}>
<section data-testid="overlay-region-left" className="overlay-region overlay-region--left">{props.left}</section>
<section data-testid="overlay-region-right-top" className="overlay-region overlay-region--right-top">{props.rightTop}</section>
<section data-testid="overlay-region-right-middle" className="overlay-region overlay-region--right-middle">{props.rightMiddle}</section>
<section data-testid="overlay-region-bottom" className="overlay-region overlay-region--bottom">{props.bottom}</section>
  </div>;
}
```

**Step 4: Run test to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/components/__tests__/OverlayLayout.test.tsx src/__tests__/App.test.tsx && CI=1 npm run test:visual`
Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`
Expected: PASS. For browser/runtime tasks also run `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npm run test:visual` after ensuring no stale local dev server owns port 5173.

**Step 6: Commit**

```bash
git add src/components/OverlayLayout.tsx src/components/__tests__/OverlayLayout.test.tsx src/App.tsx src/viewport/RunwayEditor.tsx
git commit -m "feat: manage overlay layout regions"
```

**CSS note:** Put layout CSS in `src/index.css`; add breakpoints in the next task rather than mixing large inline styles.

### Task 4: Add responsive HUD breakpoints

**Objective:** Make HUD panels wrap/stack at 1024px and avoid clipping from fixed overflow-hidden layout.

**Files:**
- Modify: `src/index.css`
- Modify: `src/components/OverlayLayout.tsx`
- Modify: `e2e/rfs-visual.spec.ts`

**Step 1: Write failing test**

```typescript
test('flight HUD remains usable at 1024x768', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'START ROLL' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /RFS/i })).toBeAttached();
});
```

**Step 2: Run test to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npx playwright test e2e/rfs-visual.spec.ts --reporter=line`
Expected: FAIL for the missing behavior, not a syntax/import error.

**Step 3: Write minimal implementation**

```css
@media (max-width: 1100px) {
  .overlay-layout { grid-template-columns: 1fr; overflow: auto; }
  .rfs-bottom-controls { flex-wrap: wrap; max-width: calc(100vw - 40px); }
}
```

**Step 4: Run test to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npm run test:visual`
Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`
Expected: PASS. For browser/runtime tasks also run `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npm run test:visual` after ensuring no stale local dev server owns port 5173.

**Step 6: Commit**

```bash
git add src/index.css src/components/OverlayLayout.tsx e2e/rfs-visual.spec.ts
git commit -m "fix: add responsive HUD layout"
```


### Task 5: Make Cesium watermark/product posture explicit [PARENT-DIRECT]

**Objective:** Choose and implement an honest product/legal path for the visible Cesium commercial watermark.

**Files:**
- Modify: `src/components/SceneStatus.tsx`
- Modify: `src/config/cesium.ts`
- Modify: `docs/architecture.md`
- Modify: `README.md`

**Step 1: Write failing test**

```typescript
it('shows clear degraded/product copy when commercial Cesium entitlement is absent', () => {
  render(<SceneStatus policy={{ mode: 'ion', commercialEntitlement: false }} />);
  expect(screen.getByText(/Cesium attribution/i)).toBeVisible();
});
```

**Step 2: Run test to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/components/__tests__/SceneStatus.test.tsx`
Expected: FAIL for the missing behavior, not a syntax/import error.

**Step 3: Write minimal implementation**

```typescript
// Do not hide legal attribution. Either document the watermark, add entitlement config, or expose a degraded non-commercial scene mode.
export interface CesiumScenePolicy {
  mode: 'ion' | 'degraded';
  attributionNote?: string;
}
```

**Step 4: Run test to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/config/__tests__/cesium.test.ts src/components/__tests__/SceneStatus.test.tsx`
Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`
Expected: PASS. For browser/runtime tasks also run `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npm run test:visual` after ensuring no stale local dev server owns port 5173.

**Step 6: Commit**

```bash
git add src/components/SceneStatus.tsx src/config/cesium.ts docs/architecture.md README.md
git commit -m "docs: clarify Cesium attribution posture"
```

**External blocker:** If this requires a Cesium commercial account/license decision, mark the task blocked with the exact decision needed. Do not remove or obscure attribution just to make screenshots pretty.

### Task 6: Capture WebGL stall/FPS diagnostics without normal-frame readbacks [PARENT-DIRECT]

**Objective:** Find and remove/guard any normal-runtime ReadPixels path causing GPU stalls; add a diagnostic-only perf sample.

**Files:**
- Modify: `src/components/FPSMonitor.tsx`
- Modify: `src/viewport/CesiumViewport.tsx`
- Modify: `src/viewport/ThreeLayer.tsx`
- Create/Modify: `src/viewport/__tests__/renderLoopPerformance.test.ts`

**Step 1: Write failing test**

```typescript
it('does not call canvas readback APIs during normal frame updates', () => {
  const readPixels = vi.fn();
  runOneVisualFrame({ gl: { readPixels } });
  expect(readPixels).not.toHaveBeenCalled();
});
```

**Step 2: Run test to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/viewport/__tests__/renderLoopPerformance.test.ts`
Expected: FAIL for the missing behavior, not a syntax/import error.

**Step 3: Write minimal implementation**

```typescript
// If a screenshot/diagnostic readback is needed, gate it behind explicit visual-test or debug-only code.
if (!isVisualTestMode() && !debugCaptureRequested) return;
```

**Step 4: Run test to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/viewport/__tests__/renderLoopPerformance.test.ts && CI=1 npm run test:visual`
Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`
Expected: PASS. For browser/runtime tasks also run `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npm run test:visual` after ensuring no stale local dev server owns port 5173.

**Step 6: Commit**

```bash
git add src/components/FPSMonitor.tsx src/viewport/CesiumViewport.tsx src/viewport/ThreeLayer.tsx src/viewport/__tests__/renderLoopPerformance.test.ts
git commit -m "fix: avoid runtime WebGL readback stalls"
```


### Task 7: Remove or implement cockpit placeholder interactions

**Objective:** Stop advertising yoke/MCP cockpit targets as interactive until they actually perform visible actions.

**Files:**
- Modify: `src/viewport/cockpitInteractions.ts`
- Modify: `src/viewport/__tests__/cockpitInteractions.test.ts`
- Modify: `src/viewport/__tests__/useCockpitInteractions.test.tsx`

**Step 1: Write failing test**

```typescript
it('does not mark placeholder yoke and MCP panel as active click interactions', () => {
  expect(interactionForObjectName('yoke')?.hint).toMatch(/not yet interactive/i);
  expect(cockpitInputForInteraction('yoke', defaultInputs)).toBeNull();
});
```

**Step 2: Run test to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/viewport/__tests__/cockpitInteractions.test.ts`
Expected: FAIL for the missing behavior, not a syntax/import error.

**Step 3: Write minimal implementation**

```typescript
// Option A: remove yoke/mcp-panel from COCKPIT_INTERACTIONS until implemented.
// Option B: keep metadata but set interactive false and show a visible "not implemented" tooltip.
```

**Step 4: Run test to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/viewport/__tests__/cockpitInteractions.test.ts src/viewport/__tests__/useCockpitInteractions.test.tsx`
Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`
Expected: PASS. For browser/runtime tasks also run `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npm run test:visual` after ensuring no stale local dev server owns port 5173.

**Step 6: Commit**

```bash
git add src/viewport/cockpitInteractions.ts src/viewport/__tests__/cockpitInteractions.test.ts src/viewport/__tests__/useCockpitInteractions.test.tsx
git commit -m "fix: make cockpit placeholder affordances honest"
```


### Task 8: Improve save/load slot clarity

**Objective:** Replace the single anonymous save/load message with timestamp/scenario summary and confirmation before replacing state.

**Files:**
- Modify: `src/store/scenarioPersistence.ts`
- Modify: `src/store/__tests__/scenarioPersistence.test.ts`
- Modify: `src/components/ScenarioPanel.tsx`
- Modify: `src/components/__tests__/ScenarioPanel.test.tsx`

**Step 1: Write failing test**

```typescript
it('stores save metadata with scenario id and timestamp', () => {
  saveScenarioSnapshot(snapshot, { now: () => 1718190600000 });
  expect(loadScenarioSnapshot()?.metadata).toMatchObject({ scenarioId: snapshot.selectedScenarioId, savedAt: '2024-06-12T' });
});
```

**Step 2: Run test to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/store/__tests__/scenarioPersistence.test.ts -t "metadata"`
Expected: FAIL for the missing behavior, not a syntax/import error.

**Step 3: Write minimal implementation**

```typescript
export interface ScenarioSnapshotMetadata {
  scenarioId: string;
  savedAt: string;
  routeName: string | null;
}
```

**Step 4: Run test to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/store/__tests__/scenarioPersistence.test.ts src/components/__tests__/ScenarioPanel.test.tsx`
Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`
Expected: PASS. For browser/runtime tasks also run `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npm run test:visual` after ensuring no stale local dev server owns port 5173.

**Step 6: Commit**

```bash
git add src/store/scenarioPersistence.ts src/store/__tests__/scenarioPersistence.test.ts src/components/ScenarioPanel.tsx src/components/__tests__/ScenarioPanel.test.tsx
git commit -m "feat: add scenario save metadata"
```


### Task 9: Add canvas test mock and null-safe CloudLayer context

**Objective:** Remove noisy jsdom getContext warnings and make canvas context handling consistent.

**Files:**
- Create: `src/test/setupCanvas.ts` or `src/test/setup.ts` if harness exists
- Modify: `vitest.config.ts`
- Modify: `src/viewport/CloudLayer.tsx`
- Modify: `src/viewport/__tests__/CloudLayer.test.tsx` if present/create focused test

**Step 1: Write failing test**

```typescript
it('does not throw when canvas context is unavailable', () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  expect(() => render(<CloudLayer viewerRef={viewerRef} clouds={clouds} />)).not.toThrow();
});
```

**Step 2: Run test to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/viewport/__tests__/CloudLayer.test.tsx`
Expected: FAIL for the missing behavior, not a syntax/import error.

**Step 3: Write minimal implementation**

```typescript
const ctx = canvas.getContext('2d');
if (!ctx) return null;
```

**Step 4: Run test to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test`
Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`
Expected: PASS. For browser/runtime tasks also run `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npm run test:visual` after ensuring no stale local dev server owns port 5173.

**Step 6: Commit**

```bash
git add src/test/setupCanvas.ts vitest.config.ts src/viewport/CloudLayer.tsx src/viewport/__tests__/CloudLayer.test.tsx
git commit -m "test: add canvas mock and null-safe cloud rendering"
```


### Task 10: Seed cloud visual randomness and fix ESLint React settings

**Objective:** Make cloud visuals deterministic in visual-test mode and remove the React-version lint warning.

**Files:**
- Modify: `src/viewport/CloudLayer.tsx`
- Modify: `src/viewport/__tests__/CloudLayer.test.tsx`
- Modify: `eslint.config.js` or current ESLint config file
- Modify: `src/config/__tests__/docsPosture.test.ts` if lint config is contract-tested

**Step 1: Write failing test**

```typescript
it('uses deterministic cloud scale for the same cloud key', () => {
  expect(cloudScaleForKey('KSEA-BKN-030')).toBe(cloudScaleForKey('KSEA-BKN-030'));
});
```

**Step 2: Run test to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/viewport/__tests__/CloudLayer.test.tsx`
Expected: FAIL for the missing behavior, not a syntax/import error.

**Step 3: Write minimal implementation**

```typescript
export function cloudScaleForKey(key: string): number {
  let hash = 0;
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return 0.8 + (hash % 40) / 100;
}

// ESLint settings:
settings: { react: { version: 'detect' } }
```

**Step 4: Run test to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run lint:ci && CI=1 npm run test:visual`
Expected: PASS.

**Step 5: Broader verification**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check`
Expected: PASS. For browser/runtime tasks also run `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npm run test:visual` after ensuring no stale local dev server owns port 5173.

**Step 6: Commit**

```bash
git add src/viewport/CloudLayer.tsx src/viewport/__tests__/CloudLayer.test.tsx eslint.config.js src/config/__tests__/docsPosture.test.ts
git commit -m "fix: make cloud visuals deterministic and quiet lint"
```


## Dependency map

- Tasks 1-2 can run early and unlock more robust Playwright selectors.
- Tasks 3-4 should serialize because they both alter layout CSS/App wiring.
- Task 5 may block on a product/legal decision; if blocked, document the decision needed and continue with other tasks.
- Tasks 9-10 are safe small test-noise cleanups.

## Plan review history

- Initial controller pass: based on dogfood screenshots/state evidence plus `App.tsx`, `RfsMCP.tsx`, `cockpitInteractions.ts`, `package.json`, and visual-test outputs.
- Independent coverage review: PASS — RFS-001 through RFS-055 are mapped with no missing/extra IDs and each child plan has actionable tasks.
- Independent command/path review: initial blockers found for invalid `git add` pathspecs, bare visual-test commands, and code-fence language mismatches; all were patched.
- Independent architecture/deploy-governance review: initial blockers found for worker/scheduler heartbeat safety and deploy-security parent-direct markings; all were patched.
- Final focused re-review: PASS — no remaining command/path/fence blockers and architecture/deploy-governance blockers are closed.
