# RFS Next Phases: Release Hardening and Realism Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task. Tasks marked `[PARENT-DIRECT]` touch cross-cutting physics/rendering/worker architecture and should be executed directly by the parent session, with specialist subagents used for focused implementation help and two-stage review.

**Goal:** Finish the release-hardening backlog from the gameplay/usability pass, then move RFS from “usable loop” toward credible airline-sim behavior: deterministic visuals, stable timing, better audio, detailed ground handling, and richer guidance.

**Architecture:** Preserve the current main-thread heartbeat until fixed-timestep contracts are extracted and tested. Release-hardening tasks should isolate policies/configuration first, then wire UI/runtime behavior. Worker, ground-model, and advanced-guidance work must split pure simulation logic from React/Zustand/worker boundaries so each layer is testable before integration.

**Tech Stack:** React 19, TypeScript strict, Vite 8, Vitest 4, Zustand 5, CesiumJS, Three.js, three-to-cesium, Web Audio, optional Playwright visual tests, RFMS shared types.

## Current execution status

This plan has now been executed through Task 10.4 in the local repository. The release-hardening dogfood proof is recorded in `docs/reviews/2026-05-26-rfs-release-hardening-playability-review.md`. Current follow-ups moved back to `docs/roadmap.md`: phase-gated route/AP engagement, debug overlay crowding, and save/load resume policy.

---

## Current baseline

This plan starts after commit `bc3e6b8 feat: improve RFS gameplay usability`.

Completed baseline:

- Phases 0 through 5.5 of `docs/plans/2026-05-26-rfs-comprehensive-usability-realism-plan.md` are implemented and deployed.
- Full gate at that point: `npm run check` passed with 54 test files and 329 tests.
- Live deploy at `https://fly.reidar.tech` was verified HTTP 200.

Read before implementing any task:

- `README.md`
- `docs/architecture.md`
- `docs/roadmap.md`
- `docs/physics-invariants.md`
- `docs/plans/2026-05-26-rfs-comprehensive-usability-realism-plan.md`
- `docs/reviews/2026-05-26-comprehensive-gameplay-review.md`

Use Node 22 for every Node/npm command:

```bash
cd /Users/reidar/Projectos/RFS
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
```

Full quality gate:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check
```

Before reporting pushed code as deployed:

```bash
gh run list --branch master --limit 5 --json databaseId,headSha,status,conclusion,workflowName,url
curl -fsSI https://fly.reidar.tech/ | head
```

## Architecture audit and silent-degradation risks

The heartbeat from `docs/architecture.md` is:

```text
src/App.tsx
  -> src/hooks/useSimLoop.ts
    -> src/store/simStore.ts tick()
      -> computeRouteStatus(...)
      -> computeAutopilotCommandsForState(...)
      -> compose pilot/AP/effectiveControls
      -> src/sim/physics/integrate.ts
      -> recompute routeStatus / activeLegIndex
      -> rebuild GuidanceState
      -> Zustand update
```

Risky chains for this plan:

1. `App.tsx -> initCesium() -> CesiumViewport -> Cesium.Terrain.fromWorldTerrain() / createOsmBuildingsAsync()`
   - `createOsmBuildingsAsync().catch(() => {})` currently swallows failures.
   - Every Cesium-token task must expose visible degraded-scene state and test both Ion and no-token paths.

2. `App.tsx -> ThreeLayer -> three-to-cesium -> three`
   - `npm ls three three-to-cesium --depth=3` currently reports two Three versions: app `three@0.184.0`, nested `three-to-cesium -> three@0.174.0`.
   - Dedup work must add a dependency guard so the warning cannot silently return.

3. `useSimLoop -> simStore.tick() -> integrate()`
   - Worker/fixed-step changes can silently change physics timing without compile errors.
   - Extract a pure simulation step first, then add an accumulator, then add worker transport behind a feature flag.

4. `useAudioLoop -> getAudioEngine() -> AudioContext / speechSynthesis`
   - Browser autoplay policy failures and `start().catch(() => {})` can silently disable audio.
   - Audio tasks must add explicit availability/started state and tests with fake Web Audio objects.

5. Docs drift risk:
   - After each phase, search docs for stale architecture terms. Use the current-state doc sync checklist from `rfs-development/references/current-state-doc-sync.md`.

## Dependency map

```text
Phase 6.1 Cesium policy must happen before visual snapshots so test screenshots have deterministic degraded/ion modes.
Phase 6.2 Three dedup should happen before visual snapshots so rendering warnings are not normalized into baselines.
Phase 6.3 visual snapshots can start after 6.1 and 6.2.
Phase 6.4 fixed timestep/worker must wait until 6.1-6.3 are green so visual diffs can catch timing regressions.
Phase 6.5 audio can run after 6.1 because it does not touch render dependencies, but serialize App.tsx edits with 6.1/6.3.
Phase 7 gear/tire work should happen before advanced taxi/landing scenarios and before final aero tuning.
Phase 8 guidance should wait for selectable MCP target controls and stable timing.
Phase 9 data quality should wait for gear/tire and guidance tests so tuning has meaningful scenario metrics.
```

Tasks that touch the same files must be serialized:

```text
App.tsx: 6.1C, 6.3D, 6.5C, 8.x UI tasks
CesiumViewport.tsx: 6.1B, 6.3B
package.json/package-lock.json: 6.2A/B, 6.3A
simStore.ts: 6.4A/B/E, 7.x, 8.x
integrate.ts/ground.ts/types.ts: 7.x parent-direct tasks
```

---

# Phase 6: Release hardening and deterministic proof

## Task 6.1A: Add explicit Cesium scene policy

**Objective:** Replace implicit token handling with a pure, testable scene policy that tells the runtime whether Ion terrain/buildings are available or degraded.

**Files:**
- Modify: `src/config/cesium.ts`
- Modify: `src/config/__tests__/cesium.test.ts`

**Step 1: Write failing tests**

Append/replace tests in `src/config/__tests__/cesium.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { Ion } from 'cesium';
import { getCesiumScenePolicy, hasCesiumToken, initCesium, normalizeCesiumToken } from '../cesium';

describe('cesium scene policy', () => {
  beforeEach(() => {
    Ion.defaultAccessToken = '';
  });

  it('normalizes empty and placeholder tokens as missing', () => {
    expect(normalizeCesiumToken(undefined)).toBeNull();
    expect(normalizeCesiumToken('')).toBeNull();
    expect(normalizeCesiumToken('   ')).toBeNull();
    expect(normalizeCesiumToken('YOUR_CESIUM_ION_TOKEN')).toBeNull();
    expect(normalizeCesiumToken('[REDACTED]')).toBeNull();
  });

  it('reports degraded mode when no usable token is configured', () => {
    const policy = getCesiumScenePolicy('');

    expect(policy.mode).toBe('degraded');
    expect(policy.terrain).toBe('ellipsoid');
    expect(policy.osmBuildings).toBe(false);
    expect(policy.reason).toContain('VITE_CESIUM_ION_TOKEN');
  });

  it('reports ion mode and initializes Ion when a token is configured', () => {
    const policy = initCesium('test-token-123');

    expect(policy.mode).toBe('ion');
    expect(policy.terrain).toBe('world');
    expect(policy.osmBuildings).toBe(true);
    expect(Ion.defaultAccessToken).toBe('test-token-123');
    expect(hasCesiumToken()).toBe(true);
  });
});
```

**Step 2: Run test to verify failure**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/config/__tests__/cesium.test.ts
```

Expected: FAIL because `getCesiumScenePolicy` and `normalizeCesiumToken` do not exist.

**Step 3: Implement minimal policy**

Update `src/config/cesium.ts`:

```ts
import { Ion } from 'cesium';

export type CesiumSceneMode = 'ion' | 'degraded';
export type CesiumTerrainMode = 'world' | 'ellipsoid';

export interface CesiumScenePolicy {
  mode: CesiumSceneMode;
  terrain: CesiumTerrainMode;
  osmBuildings: boolean;
  token: string | null;
  reason: string | null;
}

const PLACEHOLDER_TOKENS = new Set(['YOUR_CESIUM_ION_TOKEN', '[REDACTED]', 'REDACTED']);

export function normalizeCesiumToken(token?: string): string | null {
  const trimmed = token?.trim() ?? '';
  if (!trimmed) return null;
  if (PLACEHOLDER_TOKENS.has(trimmed)) return null;
  return trimmed;
}

export function getCesiumScenePolicy(token: string | undefined = import.meta.env.VITE_CESIUM_ION_TOKEN): CesiumScenePolicy {
  const normalized = normalizeCesiumToken(token);
  if (!normalized) {
    return {
      mode: 'degraded',
      terrain: 'ellipsoid',
      osmBuildings: false,
      token: null,
      reason: 'VITE_CESIUM_ION_TOKEN is not configured; using degraded ellipsoid scenery.',
    };
  }

  return {
    mode: 'ion',
    terrain: 'world',
    osmBuildings: true,
    token: normalized,
    reason: null,
  };
}

export function initCesium(token?: string): CesiumScenePolicy {
  const policy = getCesiumScenePolicy(token);
  Ion.defaultAccessToken = policy.token ?? '';
  return policy;
}

export function hasCesiumToken(): boolean {
  return normalizeCesiumToken(Ion.defaultAccessToken) !== null;
}
```

**Step 4: Run test to verify pass**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/config/__tests__/cesium.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/config/cesium.ts src/config/__tests__/cesium.test.ts
git commit -m "feat: add cesium scene policy"
```

## Task 6.1B: Use Cesium scene policy in the viewport

**Objective:** Make the viewport avoid Ion-only terrain/buildings when scene policy is degraded.

**Files:**
- Modify: `src/viewport/CesiumViewport.tsx`
- Create: `src/viewport/__tests__/CesiumViewport.test.tsx`
- Modify if mocks need updates: `src/__tests__/App.test.tsx`

**Step 1: Write failing viewport tests**

Create `src/viewport/__tests__/CesiumViewport.test.tsx`:

```tsx
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CesiumViewport } from '../CesiumViewport';

const mockDestroy = vi.fn();
const mockFromWorldTerrain = vi.fn(() => ({ kind: 'world-terrain' }));
const mockCreateOsmBuildingsAsync = vi.fn(async () => ({ kind: 'buildings' }));
const mockPrimitiveAdd = vi.fn();

vi.mock('cesium', () => ({
  Viewer: vi.fn().mockImplementation((_container: HTMLElement, options: Record<string, unknown>) => ({
    options,
    destroy: mockDestroy,
    isDestroyed: () => false,
    scene: {
      primitives: { add: mockPrimitiveAdd },
      screenSpaceCameraController: { enableInputs: true },
      globe: {},
      skyAtmosphere: { show: false },
    },
  })),
  Terrain: { fromWorldTerrain: mockFromWorldTerrain },
  createOsmBuildingsAsync: mockCreateOsmBuildingsAsync,
}));

describe('CesiumViewport scene policy', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('does not request Ion terrain or OSM buildings in degraded mode', () => {
    render(<CesiumViewport scenePolicy={{ mode: 'degraded', terrain: 'ellipsoid', osmBuildings: false, token: null, reason: 'missing token' }} />);

    expect(mockFromWorldTerrain).not.toHaveBeenCalled();
    expect(mockCreateOsmBuildingsAsync).not.toHaveBeenCalled();
  });

  it('requests world terrain and OSM buildings in Ion mode', () => {
    render(<CesiumViewport scenePolicy={{ mode: 'ion', terrain: 'world', osmBuildings: true, token: 'token', reason: null }} />);

    expect(mockFromWorldTerrain).toHaveBeenCalledTimes(1);
    expect(mockCreateOsmBuildingsAsync).toHaveBeenCalledTimes(1);
  });
});
```

**Step 2: Run test to verify failure**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/viewport/__tests__/CesiumViewport.test.tsx
```

Expected: FAIL because `scenePolicy` prop is not implemented and degraded mode still creates world terrain/buildings.

**Step 3: Implement policy usage**

Update `src/viewport/CesiumViewport.tsx`:

```tsx
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import { getCesiumScenePolicy, type CesiumScenePolicy } from '../config/cesium';

export interface CesiumViewportProps {
  onReady?: (viewer: Cesium.Viewer) => void;
  scenePolicy?: CesiumScenePolicy;
}

// inside CesiumViewport:
const policy = scenePolicy ?? getCesiumScenePolicy();
const viewerOptions: ConstructorParameters<typeof Cesium.Viewer>[1] = {
  useDefaultRenderLoop: true,
  animation: false,
  timeline: false,
  baseLayerPicker: false,
  fullscreenButton: false,
  geocoder: false,
  homeButton: false,
  infoBox: false,
  sceneModePicker: false,
  selectionIndicator: false,
  navigationHelpButton: false,
};
if (policy.terrain === 'world') {
  viewerOptions.terrain = Cesium.Terrain.fromWorldTerrain();
}
const viewer = new Cesium.Viewer(containerRef.current, viewerOptions);

if (policy.osmBuildings) {
  Cesium.createOsmBuildingsAsync()
    .then((buildings) => {
      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        viewerRef.current.scene.primitives.add(buildings);
      }
    })
    .catch(() => {});
}
```

Preserve existing cleanup and scene enhancement logic.

**Step 4: Run targeted tests**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/viewport/__tests__/CesiumViewport.test.tsx src/__tests__/App.test.tsx src/config/__tests__/cesium.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/viewport/CesiumViewport.tsx src/viewport/__tests__/CesiumViewport.test.tsx src/__tests__/App.test.tsx
git commit -m "feat: respect cesium degraded scene policy"
```

## Task 6.1C: Show visible scenery status in the app

**Objective:** Make degraded scenery visible to the player instead of silently swallowing missing-token behavior.

**Files:**
- Create: `src/components/SceneStatus.tsx`
- Create: `src/components/__tests__/SceneStatus.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/__tests__/App.test.tsx`

**Step 1: Write failing component test**

Create `src/components/__tests__/SceneStatus.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SceneStatus } from '../SceneStatus';

describe('SceneStatus', () => {
  it('shows a degraded scenery message when Cesium Ion is unavailable', () => {
    render(<SceneStatus policy={{ mode: 'degraded', terrain: 'ellipsoid', osmBuildings: false, token: null, reason: 'missing token' }} />);

    expect(screen.getByText(/SCENERY DEGRADED/i)).toBeTruthy();
    expect(screen.getByText(/missing token/i)).toBeTruthy();
  });

  it('stays quiet when full Ion scenery is available', () => {
    const { container } = render(<SceneStatus policy={{ mode: 'ion', terrain: 'world', osmBuildings: true, token: 'token', reason: null }} />);

    expect(container.textContent).toBe('');
  });
});
```

**Step 2: Run test to verify failure**

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/components/__tests__/SceneStatus.test.tsx
```

Expected: FAIL — component does not exist.

**Step 3: Implement component and wire App**

Create `src/components/SceneStatus.tsx`:

```tsx
import type { CesiumScenePolicy } from '../config/cesium';

export function SceneStatus({ policy }: { policy: CesiumScenePolicy }) {
  if (policy.mode === 'ion') return null;

  return (
    <div className="scene-status" role="status" aria-live="polite">
      <strong>SCENERY DEGRADED</strong>
      <span>{policy.reason}</span>
    </div>
  );
}
```

In `src/App.tsx`, keep a module-level policy so `initCesium()` and the viewport/UI agree:

```tsx
const cesiumScenePolicy = initCesium();
```

Pass it to the viewport and render `SceneStatus` in flight/debug overlays:

```tsx
<CesiumViewport ref... scenePolicy={cesiumScenePolicy} />
<SceneStatus policy={cesiumScenePolicy} />
```

Do not render it in minimal cinematic overlay unless it blocks safe operation.

**Step 4: Run targeted tests**

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/components/__tests__/SceneStatus.test.tsx src/__tests__/App.test.tsx
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/components/SceneStatus.tsx src/components/__tests__/SceneStatus.test.tsx src/App.tsx src/__tests__/App.test.tsx
git commit -m "feat: show degraded scenery status"
```

## Task 6.1D: Document Cesium token setup

**Objective:** Give local and deployment environments an explicit token/degraded-mode contract.

**Files:**
- Create: `.env.example`
- Modify: `README.md`
- Modify: `docs/architecture.md`

**Step 1: Add docs-only content**

Create `.env.example`:

```bash
# Optional. When unset, RFS runs in degraded ellipsoid scenery mode and shows a visible scenery banner.
# Never commit a real token.
VITE_CESIUM_ION_TOKEN=
```

Add to README under local development:

```md
### Cesium scenery token

RFS can run without a Cesium Ion token. Without `VITE_CESIUM_ION_TOKEN`, it uses degraded ellipsoid scenery and shows a visible status banner. With a valid token, it enables Cesium World Terrain and OSM buildings.

```bash
cp .env.example .env.local
# edit .env.local and set VITE_CESIUM_ION_TOKEN if desired
```
```

**Step 2: Verify docs diff**

```bash
git diff --check README.md docs/architecture.md .env.example
```

Expected: no output.

**Step 3: Commit**

```bash
git add .env.example README.md docs/architecture.md
git commit -m "docs: document cesium scenery policy"
```

## Task 6.2A: Add a dependency guard for duplicate Three.js

**Objective:** Add an executable guard that fails while more than one Three.js version is installed.

**Files:**
- Create: `scripts/check-single-three.mjs`
- Modify: `package.json`

**Step 1: Write failing guard script**

Create `scripts/check-single-three.mjs`:

```js
import { execFileSync } from 'node:child_process';

const output = execFileSync('npm', ['ls', 'three', '--json', '--all'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
});

const tree = JSON.parse(output);
const versions = new Set();

function walk(node) {
  if (!node || typeof node !== 'object') return;
  if (node.name === 'three' && node.version) versions.add(node.version);
  for (const child of Object.values(node.dependencies ?? {})) walk(child);
}

walk(tree);

if (versions.size !== 1) {
  console.error(`Expected exactly one installed three version, found: ${[...versions].join(', ') || 'none'}`);
  process.exit(1);
}

console.log(`single three version: ${[...versions][0]}`);
```

Add script to `package.json`:

```json
"check:deps": "node scripts/check-single-three.mjs"
```

**Step 2: Run guard to verify failure**

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check:deps
```

Expected: FAIL because current dependency tree has app `three@0.184.0` and nested `three-to-cesium -> three@0.174.0`.

**Step 3: Commit only if intentionally leaving RED**

Do not commit this task alone unless the next task immediately follows in the same execution window. Prefer implementing Task 6.2B before committing.

## Task 6.2B: Deduplicate Three.js via npm overrides

**Objective:** Force `three-to-cesium` to use the app's Three.js version and make the guard pass.

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Use: `scripts/check-single-three.mjs`

**Step 1: Add override**

In `package.json`, add:

```json
"overrides": {
  "three-to-cesium": {
    "three": "$three"
  }
}
```

Also update the full check script after the guard is green:

```json
"check": "npm run check:deps && npm run lint:ci && npm run typecheck && npm run test && npm run build"
```

**Step 2: Refresh lockfile**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm install --legacy-peer-deps
```

Expected: lockfile updates so `npm ls three three-to-cesium --depth=3` reports only `three@0.184.x`.

**Step 3: Verify guard and tests**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check:deps && npm run check
```

Expected: PASS.

**Step 4: Commit**

```bash
git add package.json package-lock.json scripts/check-single-three.mjs
git commit -m "fix: deduplicate three dependency"
```

## Task 6.2C: Remove stale Three-based AirportLayer if still orphaned

**Objective:** Delete the old Three/Cesium runway overlay if it remains unmounted and only historical docs reference it.

**Files:**
- Delete if orphaned: `src/viewport/AirportLayer.tsx`
- Modify docs only if they still mention active `AirportLayer`

**Step 1: Verify ownership**

Run:

```bash
search_files() { rg "$1" "$2"; }
search_files "AirportLayer" /Users/reidar/Projectos/RFS/src /Users/reidar/Projectos/RFS/docs
```

Expected before deletion: no non-test runtime import in `src/App.tsx` or active viewport code.

Use Hermes `search_files` in agent sessions rather than shell `rg` if available.

**Step 2: Delete only if orphaned**

If only the file itself and historical reviews mention it, delete `src/viewport/AirportLayer.tsx`. Do not delete `RunwayLayer.tsx`.

**Step 3: Verify**

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check
```

Expected: PASS.

**Step 4: Commit**

```bash
git add -A src/viewport/AirportLayer.tsx docs
git commit -m "chore: remove stale airport overlay"
```

## Task 6.3A: Add Playwright visual-test infrastructure

**Objective:** Add a deterministic browser-test runner without making screenshots mandatory until baselines are stable.

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `playwright.config.ts`
- Create: `e2e/.gitkeep`

**Step 1: Add dependency and scripts**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm install -D @playwright/test --legacy-peer-deps
```

Add scripts:

```json
"test:visual": "playwright test",
"test:visual:update": "playwright test --update-snapshots"
```

**Step 2: Create config**

Create `playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.02,
    },
  },
  use: {
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
    reducedMotion: 'reduce',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      VITE_RFS_VISUAL_TEST: '1',
    },
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
```

**Step 3: Verify setup**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx playwright install chromium && npm run test:visual -- --list
```

Expected: command succeeds and lists zero tests.

**Step 4: Commit**

```bash
git add package.json package-lock.json playwright.config.ts e2e/.gitkeep
git commit -m "test: add visual regression harness"
```

## Task 6.3B: Add visual-test runtime flag

**Objective:** Provide deterministic runtime behavior for screenshots without changing normal gameplay.

**Files:**
- Create: `src/config/visualTest.ts`
- Create: `src/config/__tests__/visualTest.test.ts`
- Modify: `src/viewport/CesiumViewport.tsx`

**Step 1: Write failing test**

Create `src/config/__tests__/visualTest.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isVisualTestMode } from '../visualTest';

describe('visual test config', () => {
  it('treats only explicit 1 as enabled', () => {
    expect(isVisualTestMode('1')).toBe(true);
    expect(isVisualTestMode('true')).toBe(false);
    expect(isVisualTestMode(undefined)).toBe(false);
  });
});
```

**Step 2: Run failure**

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/config/__tests__/visualTest.test.ts
```

Expected: FAIL — module missing.

**Step 3: Implement helper**

Create `src/config/visualTest.ts`:

```ts
export function isVisualTestMode(value: string | undefined = import.meta.env.VITE_RFS_VISUAL_TEST): boolean {
  return value === '1';
}
```

In `CesiumViewport.tsx`, use the flag only for deterministic scene decorations:

```ts
const visualTest = isVisualTestMode();
if (!visualTest) {
  globe.enableLighting = true;
  globe.showWaterEffect = true;
  if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = true;
} else {
  globe.enableLighting = false;
  globe.showWaterEffect = false;
  if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = false;
}
```

**Step 4: Verify**

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/config/__tests__/visualTest.test.ts src/viewport/__tests__/CesiumViewport.test.tsx
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/config/visualTest.ts src/config/__tests__/visualTest.test.ts src/viewport/CesiumViewport.tsx src/viewport/__tests__/CesiumViewport.test.tsx
git commit -m "test: add deterministic visual mode"
```

## Task 6.3C: Add Playwright helpers for RFS controls

**Objective:** Centralize deterministic page operations so each visual spec does not duplicate button/settling logic.

**Files:**
- Create: `e2e/helpers/rfsPage.ts`

**Step 1: Create helper**

Create `e2e/helpers/rfsPage.ts`:

```ts
import type { Page } from '@playwright/test';

export async function openRfs(page: Page) {
  await page.goto('/');
  await page.getByTestId('cesium-viewport').waitFor({ state: 'visible' });
  await page.waitForTimeout(500);
}

export async function clickButton(page: Page, name: string | RegExp) {
  await page.getByRole('button', { name }).click();
  await page.waitForTimeout(250);
}

export async function startRoll(page: Page) {
  await clickButton(page, /START ROLL/i);
}

export async function cycleCameraTo(page: Page, label: 'COCKPIT' | 'TOWER' | 'CHASE') {
  for (let i = 0; i < 3; i += 1) {
    const button = page.getByRole('button', { name: new RegExp(`CAM: ${label}`, 'i') });
    if (await button.count()) return;
    await clickButton(page, /CAM:/i);
  }
}
```

**Step 2: Verify typecheck**

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run typecheck
```

Expected: PASS.

**Step 3: Commit**

```bash
git add e2e/helpers/rfsPage.ts
git commit -m "test: add rfs visual test helpers"
```

## Task 6.3D: Add first visual screenshots

**Objective:** Capture stable baselines for initial runway/chase state and cockpit mode.

**Files:**
- Create: `e2e/rfs-visual.spec.ts`
- Snapshot files generated by Playwright
- Modify if needed: CSS to reduce nondeterministic blinking/animations in visual mode

**Step 1: Write tests**

Create `e2e/rfs-visual.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { clickButton, cycleCameraTo, openRfs, startRoll } from './helpers/rfsPage';

test.describe('RFS deterministic visual states', () => {
  test('initial runway/chase overlay is stable', async ({ page }) => {
    await openRfs(page);
    await expect(page).toHaveScreenshot('initial-chase.png', { fullPage: true });
  });

  test('cockpit mode keeps outside reference and instruments visible', async ({ page }) => {
    await openRfs(page);
    await cycleCameraTo(page, 'COCKPIT');
    await expect(page).toHaveScreenshot('cockpit-mode.png', { fullPage: true });
  });

  test('route overlay and safe AP modes are visible after LOAD PLAN', async ({ page }) => {
    await openRfs(page);
    await clickButton(page, /LOAD PLAN/i);
    await expect(page).toHaveScreenshot('route-loaded.png', { fullPage: true });
  });

  test('start roll state is visually stable', async ({ page }) => {
    await openRfs(page);
    await startRoll(page);
    await page.waitForTimeout(1000);
    await expect(page).toHaveScreenshot('start-roll.png', { fullPage: true });
  });
});
```

**Step 2: Generate baselines intentionally**

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test:visual:update
```

Expected: PASS and snapshot files are created.

**Step 3: Re-run without updating**

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test:visual
```

Expected: PASS.

**Step 4: Commit**

```bash
git add e2e/rfs-visual.spec.ts e2e/**/*-snapshots package.json package-lock.json
git commit -m "test: add deterministic rfs visual snapshots"
```

## Task 6.3E: Wire visual tests into CI as a non-deploy gate

**Objective:** Run visual tests in the test job before publish/deploy once baselines are stable.

**Files:**
- Modify: `.github/workflows/ci.yml`

**Step 1: Update workflow**

Add after `npm run build` in the `test` job:

```yaml
      - name: Install Playwright Chromium
        run: npx playwright install --with-deps chromium
      - run: npm run test:visual
```

Do not add this to `publish` or `deploy` jobs.

**Step 2: Validate YAML**

```bash
ruby -ryaml -e "YAML.load_file('.github/workflows/ci.yml'); puts 'OK'"
```

Expected: `OK`.

**Step 3: Run local gate**

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check && npm run test:visual
```

Expected: PASS.

**Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run rfs visual regression tests"
```

## Task 6.4A [PARENT-DIRECT]: Extract pure simulation step

**Objective:** Move the logic inside `simStore.tick()` into a pure function so fixed-timestep and worker execution can reuse the same contract.

**Files:**
- Create: `src/sim/simulationStep.ts`
- Create: `src/sim/__tests__/simulationStep.test.ts`
- Modify: `src/store/simStore.ts`

**Step 1: Write failing tests**

Create `src/sim/__tests__/simulationStep.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { B737_800_SPEC, createInitialState, createDefaultControls } from '../types';
import { createNoRouteStatus } from '../systems/navigation';
import { advanceSimulationStep } from '../simulationStep';

describe('advanceSimulationStep', () => {
  it('does not mutate the input aircraft snapshot', () => {
    const aircraft = createInitialState(B737_800_SPEC);
    const before = structuredClone(aircraft);

    const result = advanceSimulationStep({
      aircraft,
      spec: B737_800_SPEC,
      pilotInputs: createDefaultControls(),
      apState: null,
      flightPlan: null,
      activeLegIndex: null,
      routeStatus: createNoRouteStatus(),
      wind: null,
      dt: 1 / 60,
      status: 'running',
      selectedScenarioId: 'ksea-takeoff-tutorial',
      guidance: null,
    });

    expect(aircraft).toEqual(before);
    expect(result.aircraft).not.toBe(aircraft);
  });
});
```

Adjust the input shape to match real store types. If `guidance` cannot be null, pass `useSimStore.getState().guidance` in the test.

**Step 2: Run failure**

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/__tests__/simulationStep.test.ts
```

Expected: FAIL — function missing.

**Step 3: Implement pure function**

Move the body of `tick()` into `advanceSimulationStep(input)`. Return the next aircraft, route status/index, ap commands, controls, and guidance. Do not import Zustand in `simulationStep.ts`.

Minimum output shape:

```ts
export interface SimulationStepResult {
  aircraft: AircraftState;
  routeStatus: RouteStatus;
  activeLegIndex: number | null;
  apCommands: Partial<ControlInputs>;
  controls: ControlsSlice;
  guidance: GuidanceState;
}
```

`simStore.tick()` should become timestamp/dt bookkeeping plus:

```ts
const next = advanceSimulationStep({ ... });
set({ ...next, lastFrameTime: timestamp });
```

**Step 4: Verify equivalence**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/__tests__/simulationStep.test.ts src/store/__tests__/simStore.test.ts src/sim/systems/__tests__/autopilot.test.ts src/sim/systems/__tests__/navigation.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/sim/simulationStep.ts src/sim/__tests__/simulationStep.test.ts src/store/simStore.ts src/store/__tests__/simStore.test.ts
git commit -m "refactor: extract pure simulation step"
```

## Task 6.4B [PARENT-DIRECT]: Add main-thread fixed-timestep accumulator

**Objective:** Decouple render FPS from physics dt before introducing a worker.

**Files:**
- Modify: `src/store/simStore.ts`
- Modify: `src/store/__tests__/simStore.test.ts`

**Step 1: Write failing store test**

Add test:

```ts
it('splits a long frame into fixed simulation steps', () => {
  const store = useSimStore.getState();
  store.reset();
  useSimStore.getState().startTakeoffRoll();

  useSimStore.getState().tick(1000);
  useSimStore.getState().tick(1200);

  const after = useSimStore.getState();
  expect(after.lastFrameTime).toBe(1200);
  expect(after.simulationTimeSeconds).toBeGreaterThanOrEqual(0.19);
  expect(after.simulationTimeSeconds).toBeLessThanOrEqual(0.21);
});
```

If `simulationTimeSeconds` does not exist, this test should first fail and then Task 6.4B should add it as an observable accumulator diagnostic.

**Step 2: Run failure**

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/store/__tests__/simStore.test.ts -t "fixed simulation steps"
```

Expected: FAIL.

**Step 3: Implement accumulator**

Add constants near store setup:

```ts
const FIXED_STEP_SECONDS = 1 / 60;
const MAX_STEPS_PER_FRAME = 8;
```

Store fields:

```ts
fixedStepAccumulatorSeconds: number;
simulationTimeSeconds: number;
```

`tick(timestamp)` should add real frame dt to accumulator, then call `advanceSimulationStep` in a loop using `FIXED_STEP_SECONDS`. If more than `MAX_STEPS_PER_FRAME` would run, drop the excess accumulator and record an alert or diagnostic rather than spiraling.

**Step 4: Verify**

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/store/__tests__/simStore.test.ts src/sim/physics/__tests__/integrate.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/store/simStore.ts src/store/__tests__/simStore.test.ts
git commit -m "feat: add fixed timestep accumulator"
```

## Task 6.4C [PARENT-DIRECT]: Add worker codec without runtime wiring

**Objective:** Prove aircraft/control/route snapshots can serialize before worker transport exists.

**Files:**
- Create: `src/worker/codec.ts`
- Create: `src/worker/__tests__/codec.test.ts`

**Step 1: Write failing codec test**

```ts
import { describe, expect, it } from 'vitest';
import { B737_800_SPEC, createDefaultControls, createInitialState } from '../../sim/types';
import { decodeWorkerSnapshot, encodeWorkerSnapshot } from '../codec';

describe('worker codec', () => {
  it('round-trips aircraft and controls without losing fields', () => {
    const snapshot = {
      aircraft: createInitialState(B737_800_SPEC),
      controls: createDefaultControls(),
      dt: 1 / 60,
    };

    expect(decodeWorkerSnapshot(encodeWorkerSnapshot(snapshot))).toEqual(snapshot);
  });
});
```

**Step 2: Implement JSON-compatible codec first**

Do not start with SharedArrayBuffer. Start with structured-clone-safe plain data:

```ts
export function encodeWorkerSnapshot<T>(snapshot: T): T {
  return structuredClone(snapshot);
}

export function decodeWorkerSnapshot<T>(payload: T): T {
  return structuredClone(payload);
}
```

**Step 3: Verify**

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/worker/__tests__/codec.test.ts
```

Expected: PASS.

**Step 4: Commit**

```bash
git add src/worker/codec.ts src/worker/__tests__/codec.test.ts
git commit -m "feat: add worker state codec"
```

## Task 6.4D [PARENT-DIRECT]: Add worker entry point behind a disabled flag

**Objective:** Create the worker loop and bridge API without changing default runtime behavior.

**Files:**
- Create: `src/worker/physics.worker.ts`
- Create: `src/worker/bridge.ts`
- Create: `src/worker/__tests__/bridge.test.ts`
- Modify: `src/vite-env.d.ts` if worker type declarations require it

**Step 1: Write bridge test**

Test with a fake Worker class. Expected behavior: `start`, `postStep`, `dispose`, and error propagation work without touching real browser workers.

**Step 2: Implement minimal bridge**

`bridge.ts` should expose:

```ts
export interface PhysicsWorkerBridge {
  step(message: WorkerStepRequest): Promise<WorkerStepResponse>;
  dispose(): void;
}

export function createPhysicsWorkerBridge(worker: Worker = new Worker(new URL('./physics.worker.ts', import.meta.url), { type: 'module' })): PhysicsWorkerBridge {
  // request/response id map
}
```

`physics.worker.ts` should call `advanceSimulationStep()` for one fixed dt per message.

**Step 3: Verify without enabling runtime**

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/worker/__tests__/bridge.test.ts src/sim/__tests__/simulationStep.test.ts
```

Expected: PASS.

**Step 4: Commit**

```bash
git add src/worker/physics.worker.ts src/worker/bridge.ts src/worker/__tests__/bridge.test.ts src/vite-env.d.ts
git commit -m "feat: add disabled physics worker bridge"
```

## Task 6.4E [PARENT-DIRECT]: Runtime feature flag for worker physics

**Objective:** Let development builds opt into worker physics while production remains main-thread until browser dogfood validates it.

**Files:**
- Create: `src/config/physicsRuntime.ts`
- Create: `src/config/__tests__/physicsRuntime.test.ts`
- Modify: `src/store/simStore.ts`
- Modify: `README.md`

**Step 1: Add config helper test**

```ts
import { describe, expect, it } from 'vitest';
import { useWorkerPhysics } from '../physicsRuntime';

describe('physics runtime config', () => {
  it('requires explicit worker flag', () => {
    expect(useWorkerPhysics('1')).toBe(true);
    expect(useWorkerPhysics(undefined)).toBe(false);
    expect(useWorkerPhysics('true')).toBe(false);
  });
});
```

**Step 2: Wire but default off**

`simStore` should use main-thread fixed-step by default. If `VITE_RFS_WORKER_PHYSICS=1`, construct a bridge and use it for step requests. On worker error, set a visible guidance/alert and fall back to main-thread stepping.

**Step 3: Verify**

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check
VITE_RFS_WORKER_PHYSICS=1 npm run test -- src/store/__tests__/simStore.test.ts src/worker/__tests__/bridge.test.ts
```

Expected: PASS.

**Step 4: Commit**

```bash
git add src/config/physicsRuntime.ts src/config/__tests__/physicsRuntime.test.ts src/store/simStore.ts README.md
git commit -m "feat: gate physics worker runtime"
```

## Task 6.5A: Add pure audio mapping tests

**Objective:** Move sound parameter math into pure functions before touching Web Audio nodes.

**Files:**
- Create: `src/audio/audioModel.ts`
- Create: `src/audio/__tests__/audioModel.test.ts`

**Step 1: Write failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { engineSoundForN1, windSoundForAirspeed } from '../audioModel';

describe('audio model', () => {
  it('maps N1 to bounded engine frequency and gain', () => {
    expect(engineSoundForN1(0)).toEqual({ frequencyHz: 40, gain: 0 });
    expect(engineSoundForN1(100).frequencyHz).toBeLessThanOrEqual(220);
    expect(engineSoundForN1(150).gain).toBeLessThanOrEqual(0.18);
  });

  it('maps airspeed to bounded wind noise', () => {
    expect(windSoundForAirspeed(0).gain).toBe(0);
    expect(windSoundForAirspeed(250).gain).toBeGreaterThan(windSoundForAirspeed(120).gain);
    expect(windSoundForAirspeed(600).gain).toBeLessThanOrEqual(0.2);
  });
});
```

**Step 2: Implement pure mapping**

```ts
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function engineSoundForN1(n1: number) {
  const bounded = clamp(n1, 0, 110);
  return {
    frequencyHz: 40 + bounded * 1.6,
    gain: (bounded / 100) * 0.14,
  };
}

export function windSoundForAirspeed(iasKt: number) {
  const normalized = clamp((iasKt - 60) / 280, 0, 1);
  return {
    frequencyHz: 500 + normalized * 1200,
    gain: normalized * 0.2,
  };
}
```

**Step 3: Verify**

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/audio/__tests__/audioModel.test.ts
```

Expected: PASS.

**Step 4: Commit**

```bash
git add src/audio/audioModel.ts src/audio/__tests__/audioModel.test.ts
git commit -m "feat: add pure audio model"
```

## Task 6.5B: Make AudioEngine lifecycle explicit and testable

**Objective:** Avoid constructing/resuming AudioContext silently before a user gesture and expose status for UI/tests.

**Files:**
- Modify: `src/audio/AudioEngine.ts`
- Create: `src/audio/__tests__/AudioEngine.test.ts`

**Step 1: Write tests with a fake context**

Test that `getAudioEngine()` can accept a factory and that `start()` flips status only after resume resolves. Do not require real browser audio in Vitest.

**Step 2: Implement injectable factory**

Add:

```ts
export type AudioEngineStatus = 'idle' | 'starting' | 'running' | 'failed';
export type AudioContextFactory = () => AudioContext;

let audioContextFactory: AudioContextFactory = () => new AudioContext();

export function setAudioContextFactory(factory: AudioContextFactory): void {
  audioContextFactory = factory;
  instance = null;
}
```

`AudioEngine` should store `status` and `lastError`.

**Step 3: Verify**

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/audio/__tests__/AudioEngine.test.ts
```

Expected: PASS.

**Step 4: Commit**

```bash
git add src/audio/AudioEngine.ts src/audio/__tests__/AudioEngine.test.ts
git commit -m "feat: make audio engine lifecycle explicit"
```

## Task 6.5C: Add audio controls and hook integration

**Objective:** Let the player start/mute audio from a visible control and route engine/wind/GPWS updates through explicit state.

**Files:**
- Create: `src/components/AudioControls.tsx`
- Create: `src/components/__tests__/AudioControls.test.tsx`
- Modify: `src/hooks/useAudioLoop.ts`
- Modify: `src/App.tsx`
- Modify: `src/__tests__/App.test.tsx`

**Step 1: Write component test**

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AudioControls } from '../AudioControls';

describe('AudioControls', () => {
  it('starts audio from a visible user action', () => {
    const onStart = vi.fn();
    render(<AudioControls status="idle" muted={false} onStart={onStart} onToggleMute={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /start audio/i }));

    expect(onStart).toHaveBeenCalledTimes(1);
  });
});
```

**Step 2: Implement UI and hook changes**

`useAudioLoop` should not call `getAudioEngine().start()` automatically on mount. It should update sounds only after the engine status is running. `App.tsx` should pass explicit `onStart` from `AudioControls`.

**Step 3: Verify**

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/components/__tests__/AudioControls.test.tsx src/__tests__/App.test.tsx
```

Expected: PASS.

**Step 4: Commit**

```bash
git add src/components/AudioControls.tsx src/components/__tests__/AudioControls.test.tsx src/hooks/useAudioLoop.ts src/App.tsx src/__tests__/App.test.tsx
git commit -m "feat: add explicit audio controls"
```

## Phase 6 final verification and docs sync

After all Phase 6 tasks:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check
npm run test:visual
npm ls three three-to-cesium --depth=3
git diff --check
```

Search docs for stale statements:

```bash
rg "default ion token|duplicate Three|Phase 6 remains pending|worker migration after contracts stabilize" README.md docs
```

Update:

- `README.md`
- `docs/architecture.md`
- `docs/roadmap.md`
- `docs/plans/README.md`
- this plan's status section

Then run a final integration review via `subagent-driven-development` and commit:

```bash
git add README.md docs package.json package-lock.json src e2e playwright.config.ts scripts .github
git commit -m "feat: complete rfs release hardening"
```

---

# Phase 7: Gear/tire ground model and takeoff/landing realism

Use parent-direct execution for tasks touching `types.ts`, `ground.ts`, and `integrate.ts` together.

## Task 7.1 [PARENT-DIRECT]: Add gear station data model

**Objective:** Represent nose/left-main/right-main gear stations with compression and wheel contact state.

**Files:**
- Modify: `src/sim/types.ts`
- Modify: `src/sim/systems/ground.ts`
- Modify: `src/sim/systems/__tests__/ground.test.ts`

**Test first:** Add tests for three station positions and parked static compression.

Expected test command:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/systems/__tests__/ground.test.ts
```

Acceptance:

- Parked aircraft has all gear on runway and non-negative compression.
- Main gear carries more load than nose gear.
- Gear-up state does not pretend wheel contact exists.

Commit:

```bash
git add src/sim/types.ts src/sim/systems/ground.ts src/sim/systems/__tests__/ground.test.ts
git commit -m "feat: add gear station contact model"
```

## Task 7.2 [PARENT-DIRECT]: Add rolling friction and brake force

**Objective:** Make brake input and tire rolling friction affect ground roll and rollout speed.

**Files:**
- Modify: `src/sim/systems/ground.ts`
- Modify: `src/sim/physics/integrate.ts`
- Modify: `src/sim/systems/__tests__/ground.test.ts`
- Modify: `src/sim/physics/__tests__/integrate.test.ts`

**Test first:**

- Brake input reduces ground speed over 5 seconds.
- No-brake takeoff roll still accelerates at 60/120/144 Hz.
- Braking force cannot reverse the aircraft through zero speed in one tick.

Command:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/systems/__tests__/ground.test.ts src/sim/physics/__tests__/integrate.test.ts
```

Commit:

```bash
git add src/sim/systems/ground.ts src/sim/physics/integrate.ts src/sim/systems/__tests__/ground.test.ts src/sim/physics/__tests__/integrate.test.ts
git commit -m "feat: add ground rolling and brake forces"
```

## Task 7.3 [PARENT-DIRECT]: Add nosewheel steering and low-speed taxi behavior

**Objective:** Give low-speed rudder/tiller input a heading/yaw effect while weight-on-wheels.

**Files:**
- Modify: `src/sim/systems/ground.ts`
- Modify: `src/input/keyboardControls.ts`
- Modify: `src/sim/systems/__tests__/ground.test.ts`
- Modify: `src/input/__tests__/keyboardControls.test.ts`

**Test first:**

- At 10 kt with nose gear contact, rudder/tiller changes heading.
- At 120 kt, steering authority fades so takeoff roll is not twitchy.
- Airborne rudder path remains aerodynamic, not nosewheel-driven.

Commit:

```bash
git add src/sim/systems/ground.ts src/input/keyboardControls.ts src/sim/systems/__tests__/ground.test.ts src/input/__tests__/keyboardControls.test.ts
git commit -m "feat: add nosewheel steering behavior"
```

## Task 7.4 [PARENT-DIRECT]: Add touchdown damping and rollout scenario test

**Objective:** Make landings absorb vertical velocity through gear instead of snapping/clamping.

**Files:**
- Modify: `src/sim/systems/ground.ts`
- Modify: `src/sim/__tests__/scenarioHelpers.ts`
- Modify: `src/sim/physics/__tests__/integrate.test.ts`

**Test first:**

- A descent at realistic sink rate compresses gear and remains above runway.
- Excessive sink triggers a hard-landing diagnostic/alert, not NaN state.
- Rollout with gear down and brakes remains stable for 20 seconds.

Commit:

```bash
git add src/sim/systems/ground.ts src/sim/__tests__/scenarioHelpers.ts src/sim/physics/__tests__/integrate.test.ts
git commit -m "feat: add touchdown damping scenario"
```

## Task 7.5: Add ground-effect lift/drag adjustment

**Objective:** Improve flare/rotation realism near runway without hiding bad ground contact.

**Files:**
- Modify: `src/sim/physics/aero.ts`
- Modify: `src/sim/physics/__tests__/aero.test.ts`

**Test first:**

- At low height above runway, induced drag reduces and lift curve changes within bounded limits.
- Above one wingspan, ground effect is negligible.

Commit:

```bash
git add src/sim/physics/aero.ts src/sim/physics/__tests__/aero.test.ts
git commit -m "feat: add bounded ground effect"
```

---

# Phase 8: Advanced guidance and MCP lifecycle

## Task 8.1: Add selected MCP target editing controls

**Objective:** Let the player change heading/speed/altitude/vertical-speed targets, not only press mode buttons.

**Files:**
- Modify: `src/instruments/RfsMCP.tsx`
- Modify: `src/instruments/__tests__/RfsMCP.test.tsx`
- Modify: `src/store/simStore.ts`

**Test first:**

- Heading knob increments selected heading and wraps 0-359.
- Speed knob clamps to a safe range.
- Altitude knob uses 100/1000 ft increments.
- First mode click keeps selected target consistent with displayed value.

Commit:

```bash
git add src/instruments/RfsMCP.tsx src/instruments/__tests__/RfsMCP.test.tsx src/store/simStore.ts
git commit -m "feat: add selectable mcp targets"
```

## Task 8.2: Add LNAV cross-track intercept law

**Objective:** LNAV should intercept and track the active leg instead of simply pointing at the next waypoint.

**Files:**
- Modify: `src/sim/systems/navigation.ts`
- Modify: `src/sim/systems/autopilot.ts`
- Modify: `src/sim/systems/__tests__/navigation.test.ts`
- Modify: `src/sim/systems/__tests__/autopilot.test.ts`

**Test first:**

- Off-route aircraft receives an intercept heading biased toward the leg.
- Cross-track error decreases over repeated fixed steps.
- Invalid route status still preserves current heading and never falls back to waypoint 0.

Commit:

```bash
git add src/sim/systems/navigation.ts src/sim/systems/autopilot.ts src/sim/systems/__tests__/navigation.test.ts src/sim/systems/__tests__/autopilot.test.ts
git commit -m "feat: add lnav cross-track intercept"
```

## Task 8.3: Add turn anticipation metrics

**Objective:** Expose upcoming-leg geometry so LNAV can start turns before overflying waypoints.

**Files:**
- Modify: `src/sim/systems/navigation.ts`
- Modify: `src/sim/systems/__tests__/navigation.test.ts`
- Modify: `src/components/RouteStatus.tsx`
- Modify: `src/components/__tests__/RouteStatus.test.tsx`

**Test first:**

- Route status exposes next leg and turn direction when a next leg exists.
- No anticipation is reported for final leg.
- RouteStatus renders a compact turn cue only when available.

Commit:

```bash
git add src/sim/systems/navigation.ts src/sim/systems/__tests__/navigation.test.ts src/components/RouteStatus.tsx src/components/__tests__/RouteStatus.test.tsx
git commit -m "feat: expose lnav turn anticipation"
```

## Task 8.4: Add VNAV path mode lifecycle

**Objective:** Move from constraint targeting to explicit VNAV PTH / VNAV SPD / ALT ACQ / ALT HOLD transitions.

**Files:**
- Modify: `src/sim/systems/vnav.ts`
- Modify: `src/sim/systems/autopilot.ts`
- Modify: `src/instruments/RfsPFD.tsx`
- Modify: tests for all three files

**Test first:**

- VNAV PTH captures a path when within tolerance.
- VNAV SPD is annunciated when path requires speed priority.
- ALT ACQ arms before target altitude and transitions to ALT HOLD.
- PFD FMA matches servo-law state.

Commit:

```bash
git add src/sim/systems/vnav.ts src/sim/systems/autopilot.ts src/instruments/RfsPFD.tsx src/sim/systems/__tests__/vnav.test.ts src/sim/systems/__tests__/autopilot.test.ts src/instruments/__tests__/RfsPFD.test.tsx
git commit -m "feat: add vnav mode lifecycle"
```

---

# Phase 9: Flight-model data quality

## Task 9.1: Create versioned B737-800 data file

**Objective:** Move remaining magic aero/engine constants into a versioned aircraft data module.

**Files:**
- Create: `src/sim/data/b737-800.ts`
- Create: `src/sim/data/__tests__/b737-800.test.ts`
- Modify: `src/sim/types.ts`

**Test first:**

- Data exports wing area/span, mass limits, thrust limits, and known V-speed reference points.
- Units are explicit in field names.

Commit:

```bash
git add src/sim/data/b737-800.ts src/sim/data/__tests__/b737-800.test.ts src/sim/types.ts
git commit -m "feat: add versioned b737 data"
```

## Task 9.2: Add trim solver fixture

**Objective:** Compute steady-flight trim targets for representative configurations.

**Files:**
- Create: `src/sim/physics/trim.ts`
- Create: `src/sim/physics/__tests__/trim.test.ts`

**Test first:**

- Clean cruise trim converges to bounded AoA/elevator.
- Flaps 5 climb trim converges without requiring extreme elevator.
- Solver fails clearly for impossible inputs.

Commit:

```bash
git add src/sim/physics/trim.ts src/sim/physics/__tests__/trim.test.ts
git commit -m "feat: add steady flight trim solver"
```

## Task 9.3: Add performance-card scenario assertions

**Objective:** Compare climb/cruise/approach behavior against conservative B737 envelopes.

**Files:**
- Create: `src/sim/physics/__tests__/performanceCards.test.ts`
- Modify: `src/sim/__tests__/scenarioHelpers.ts`

**Test first:**

- Flaps 5 takeoff climb is positive but not rocket-like.
- Clean climb rate at 250 kt is in a plausible range.
- Approach at landing config does not require impossible AoA.

Commit:

```bash
git add src/sim/physics/__tests__/performanceCards.test.ts src/sim/__tests__/scenarioHelpers.ts
git commit -m "test: add b737 performance card assertions"
```

---

# Phase 10: Weather, product polish, and final playability proof

## Task 10.1: Add gust/turbulence model as air-relative perturbation

**Objective:** Add gust effects without violating the wind contract that ground velocity is not mutated.

**Files:**
- Modify: `src/sim/systems/environment.ts`
- Modify: `src/sim/systems/__tests__/environment.test.ts`
- Modify: `src/sim/weather.ts`

**Test first:**

- Gust changes air-relative velocity.
- Ground-relative state velocity remains unchanged by gust helper.
- Seeded gust model is deterministic in tests.

Commit:

```bash
git add src/sim/systems/environment.ts src/sim/systems/__tests__/environment.test.ts src/sim/weather.ts
git commit -m "feat: add deterministic gust model"
```

## Task 10.2: Add scenario persistence

**Objective:** Let players save/reset named scenario states for repeated training loops.

**Files:**
- Create: `src/store/scenarioPersistence.ts`
- Create: `src/store/__tests__/scenarioPersistence.test.ts`
- Modify: `src/components/ScenarioPanel.tsx`
- Modify: `src/components/__tests__/ScenarioPanel.test.tsx`

**Test first:**

- Save serializes only cloneable sim state.
- Load restores aircraft, inputs, route, AP state, and scenario id.
- Corrupt localStorage data is ignored with a visible reason.

Commit:

```bash
git add src/store/scenarioPersistence.ts src/store/__tests__/scenarioPersistence.test.ts src/components/ScenarioPanel.tsx src/components/__tests__/ScenarioPanel.test.tsx
git commit -m "feat: add scenario persistence"
```

## Task 10.3: Add keyboard/gamepad settings UI

**Objective:** Make controls discoverable and configurable enough for repeated play.

**Files:**
- Create: `src/input/controlBindings.ts`
- Create: `src/input/__tests__/controlBindings.test.ts`
- Create: `src/components/ControlsSettings.tsx`
- Create: `src/components/__tests__/ControlsSettings.test.tsx`
- Modify: `src/components/ControlsHelp.tsx`

**Test first:**

- Default bindings include pitch, roll, rudder, throttle, brake, gear, flaps, trim, camera, overlay.
- Invalid duplicate binding is rejected.
- Settings UI renders current binding names.

Commit:

```bash
git add src/input/controlBindings.ts src/input/__tests__/controlBindings.test.ts src/components/ControlsSettings.tsx src/components/__tests__/ControlsSettings.test.tsx src/components/ControlsHelp.tsx
git commit -m "feat: add controls settings model"
```

## Task 10.4: Browser dogfood review and release report

**Objective:** Prove the next milestone with actual browser behavior, not only automated tests.

**Files:**
- Create: `docs/reviews/YYYY-MM-DD-rfs-release-hardening-playability-review.md`
- Update: `docs/roadmap.md`
- Update: relevant plan status docs

**Step 1: Run local or deployed dogfood flow**

Checklist:

1. Initial load, no blocking console errors.
2. Scenery status visible and truthful.
3. START ROLL, ROTATE, positive climb.
4. Gear up after positive rate.
5. Camera modes: CHASE, COCKPIT, TOWER.
6. LOAD PLAN and route status.
7. MCP SPD/VS/HDG/LNAV honest behavior.
8. Audio start/mute if Phase 6.5 is complete.
9. Reset and repeat.
10. Visual snapshots pass.

**Step 2: Save report**

Use `docs/reviews/templates/playability-dogfood-checklist.md` as the base.

**Step 3: Verify docs**

```bash
git diff --check docs
```

**Step 4: Commit**

```bash
git add docs/reviews docs/roadmap.md docs/plans
git commit -m "docs: add release hardening playability review"
```

---

# Final execution checklist

After each task:

```bash
git status --short
git diff --stat
```

After each phase:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check
```

After Phase 6+ code is pushed to `master`:

```bash
gh run list --branch master --limit 5 --json databaseId,headSha,status,conclusion,workflowName,url
# Wait until target run is status=completed and conclusion=success.
curl -fsSI https://fly.reidar.tech/ | head
```

Run post-implementation audit after each phase using:

- `subagent-driven-development/references/post-implementation-audit.md`
- `rfs-development/references/current-state-doc-sync.md`
- `rfs-development/references/playability-review-patterns.md`

Do not mark the sim “playable” from unit tests or CI alone; browser-dogfood the actual player loop and record the evidence.
