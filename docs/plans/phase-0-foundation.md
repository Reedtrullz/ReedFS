# Phase 0: Project Foundation — Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

> **Status note (2026-05-25):** Historical implementation plan. Use `../architecture.md` for the current implementation, `../physics-invariants.md` for active flight-model contracts, and `../roadmap.md` for prioritized next work. Do not assume older React version, worker, wind, or phase-status wording below reflects the current app.


**Goal:** Scaffold the RFS project with Vite, React, TypeScript, CesiumJS, Three.js, Zustand, and Vitest. Verify by rendering a Cesium globe with a Three.js overlay via `three-to-cesium`.

**Architecture:** Standalone Vite + React + TypeScript project. CesiumJS renders the 3D globe (terrain + imagery via Cesium Ion free tier). Three.js renders aircraft/effects via `three-to-cesium` camera sync. RFMS `shared/` layer is a file: dependency for FMC types. Vitest for unit tests with jsdom environment.

**Tech Stack:** React 18, TypeScript 5.4+ strict, Vite 8, CesiumJS, Three.js, three-to-cesium, Zustand, Vitest, jsdom.

**RFMS conventions to follow:** TypeScript strict, no barrel exports, `@shared` alias for RFMS shared/, `@` alias for RFS src/, tests in `__tests__` folders, no unsafe non-null assertions.

---

### Task 1: Initialize Vite project

**Objective:** Create the Vite scaffold with TypeScript and React template.

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/vite-env.d.ts`

**Step 1: Run Vite scaffold**

```bash
cd /Users/reidar/Projectos/RFS && npm create vite@latest . -- --template react-ts
```

**Step 2: Verify scaffold**

```bash
ls package.json tsconfig.json tsconfig.node.json vite.config.ts index.html src/main.tsx src/App.tsx
```
Expected: all files exist.

**Step 3: Commit**

```bash
cd /Users/reidar/Projectos/RFS && git init && git add -A && git commit -m "chore: scaffold Vite React-TS project"
```

---

### Task 2: Install dependencies

**Objective:** Add CesiumJS, Three.js, three-to-cesium, Zustand, and dev tooling.

**Files:**
- Modify: `package.json`

**Step 1: Install runtime dependencies**

```bash
cd /Users/reidar/Projectos/RFS
npm install cesium three three-to-cesium zustand
npm install --save file:../RFMS/shared
```

**Step 2: Install dev dependencies**

```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom prettier @types/three vite-plugin-cesium
```

**Step 3: Verify install**

```bash
node -e "require('cesium/package.json'); require('three/package.json'); console.log('OK')"
```
Expected: `OK` (no errors).

**Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install cesium, three, three-to-cesium, zustand, RFMS shared, vitest"
```

---

### Task 3: Configure TypeScript

**Objective:** Write strict tsconfig with path aliases matching RFMS conventions.

**Files:**
- Overwrite: `tsconfig.json`
- Overwrite: `tsconfig.node.json`

**Step 1: Write tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "baseUrl": ".",
    "paths": {
      "@shared": ["../RFMS/shared/src/index.ts"],
      "@shared/*": ["../RFMS/shared/src/*"],
      "@/*": ["./src/*"]
    },
    "types": ["vitest/globals"]
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

**Step 2: Write tsconfig.node.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["vite.config.ts", "vitest.config.ts"]
}
```

**Step 3: Write failing typecheck test — import a non-existent module**

Create `src/__tests__/types.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';

describe('type system', () => {
  it('compiles', () => {
    expect(true).toBe(true);
  });
});
```

Run:
```bash
npx vitest run src/__tests__/types.test.ts
```
Expected: 1 passed.

**Step 4: Verify typecheck**

```bash
npx tsc --noEmit
```
Expected: no errors (may need to fix Vite scaffold issues — commit those fixes separately).

**Step 5: Commit**

```bash
git add tsconfig.json tsconfig.node.json src/__tests__/
git commit -m "chore: configure strict TypeScript with @shared and @ aliases"
```

---

### Task 4: Configure Vite with Cesium

**Objective:** Set up Vite to serve Cesium static assets and resolve aliases.

**Files:**
- Overwrite: `vite.config.ts`

**Step 1: Write vite.config.ts**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import cesium from 'vite-plugin-cesium';
import path from 'path';

export default defineConfig({
  plugins: [react(), cesium()],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../RFMS/shared/src'),
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    headers: {
      // Required for SharedArrayBuffer (Phase 1+)
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  build: {
    target: 'esnext',
  },
});
```

**Step 2: Verify Vite starts**

```bash
npx vite --host 0.0.0.0 &
sleep 3
curl -s http://localhost:5173 | head -5
kill %1
```
Expected: returns HTML content.

**Step 3: Commit**

```bash
git add vite.config.ts
git commit -m "chore: configure Vite with cesium plugin, aliases, COOP/COEP headers"
```

---

### Task 5: Configure Vitest

**Objective:** Set up Vitest with jsdom and path aliases.

**Files:**
- Create: `vitest.config.ts`

**Step 1: Write vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../RFMS/shared/src'),
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
```

**Step 2: Verify vitest runs**

```bash
npx vitest run src/__tests__/types.test.ts
```
Expected: 1 passed.

**Step 3: Commit**

```bash
git add vitest.config.ts
git commit -m "test: configure Vitest with jsdom and path aliases"
```

---

### Task 6: Configure ESLint and Prettier

**Objective:** Match RFMS code quality tooling.

**Files:**
- Create: `eslint.config.js`
- Create: `.prettierrc`

**Step 1: Write eslint.config.js**

```javascript
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
    },
  },
  prettierConfig,
  { ignores: ['dist/', 'node_modules/'] },
);
```

Install ESLint deps:
```bash
npm install -D eslint @eslint/js typescript-eslint eslint-plugin-react eslint-plugin-react-hooks eslint-config-prettier
```

**Step 2: Write .prettierrc**

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2
}
```

**Step 3: Verify linting**

```bash
npx eslint src/App.tsx
npx prettier --check src/App.tsx
```
Expected: no errors.

**Step 4: Commit**

```bash
git add eslint.config.js .prettierrc package.json package-lock.json
git commit -m "chore: add ESLint and Prettier matching RFMS conventions"
```

---

### Task 7: Clean up scaffold and add .gitignore

**Objective:** Replace Vite boilerplate with clean RFS placeholder.

**Files:**
- Overwrite: `index.html`
- Overwrite: `src/main.tsx`
- Overwrite: `src/App.tsx`
- Overwrite: `src/index.css`
- Create: `.gitignore`
- Delete: `src/App.css`, `public/vite.svg`, `src/assets/`

**Step 1: Write index.html**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>RFS — Real Flight Simulator</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body, #root { width: 100%; height: 100%; overflow: hidden; }
      body { background: #000; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**Step 2: Write src/main.tsx**

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

**Step 3: Write src/App.tsx**

```tsx
export function App() {
  return (
    <div style={{ color: '#0f0', fontFamily: 'monospace', padding: 20 }}>
      <h1>RFS — Real Flight Simulator</h1>
      <p>Phase 0: Foundation</p>
    </div>
  );
}
```

**Step 4: Write .gitignore**

```
node_modules/
dist/
*.local
.env
```

**Step 5: Clean up boilerplate**

```bash
rm -f src/App.css public/vite.svg
rm -rf src/assets/
```

**Step 6: Write failing test for App component**

Create `src/__tests__/App.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from '../App';

describe('App', () => {
  it('renders RFS heading', () => {
    render(<App />);
    expect(screen.getByText('RFS — Real Flight Simulator')).toBeTruthy();
  });
});
```

Run:
```bash
npx vitest run src/__tests__/App.test.tsx
```
Expected: 1 passed.

**Step 7: Verify dev server**

```bash
npx vite &
sleep 2
curl -s http://localhost:5173 | grep "RFS — Real Flight Simulator"
kill %1
```
Expected: grep finds the match.

**Step 8: Commit**

```bash
git add -A && git rm --cached src/App.css public/vite.svg 2>/dev/null; true
git commit -m "chore: replace Vite boilerplate with RFS placeholder, add App test"
```

---

### Task 8: Cesium Ion token configuration

**Objective:** Create a config module that initializes Cesium Ion.

**Files:**
- Create: `src/config/cesium.ts`

**Step 1: Write src/config/cesium.ts**

```typescript
import { Ion } from 'cesium';

/**
 * Initialize Cesium Ion with an access token.
 *
 * Get a free token at https://ion.cesium.com/signup
 * The free tier includes Cesium World Terrain + Bing Maps imagery.
 *
 * Store the token in VITE_CESIUM_ION_TOKEN env var (never commit).
 */
export function initCesium(token?: string): void {
  const t = token ?? import.meta.env.VITE_CESIUM_ION_TOKEN;
  if (t) {
    Ion.defaultAccessToken = t;
  }
}

/**
 * Check if a valid Cesium Ion token is configured.
 */
export function hasCesiumToken(): boolean {
  return Boolean(Ion.defaultAccessToken);
}
```

**Step 2: Write test**

Create `src/config/__tests__/cesium.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { Ion } from 'cesium';
import { initCesium, hasCesiumToken } from '../cesium';

describe('initCesium', () => {
  beforeEach(() => {
    // Reset token between tests
    Ion.defaultAccessToken = '';
  });

  it('sets the token when provided directly', () => {
    initCesium('test-token-123');
    expect(Ion.defaultAccessToken).toBe('test-token-123');
    expect(hasCesiumToken()).toBe(true);
  });

  it('returns false when no token is set', () => {
    expect(hasCesiumToken()).toBe(false);
  });
});
```

Run:
```bash
npx vitest run src/config/__tests__/cesium.test.ts
```
Expected: 2 passed.

**Step 3: Commit**

```bash
git add src/config/
git commit -m "feat: add Cesium Ion token config with tests"
```

---

### Task 9: CesiumViewport — render the globe

**Objective:** Create a React component that mounts a Cesium Viewer with terrain and imagery.

**Files:**
- Create: `src/viewport/CesiumViewport.tsx`

**Step 1: Write src/viewport/CesiumViewport.tsx**

```tsx
import { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';

export interface CesiumViewportProps {
  /** Called with the viewer instance after mount */
  onReady?: (viewer: Cesium.Viewer) => void;
}

export function CesiumViewport({ onReady }: CesiumViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    if (viewerRef.current) return; // already mounted (React StrictMode double-mount guard)

    const viewer = new Cesium.Viewer(containerRef.current, {
      useDefaultRenderLoop: true,
      // Minimal UI — we build our own
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
      // Terrain + imagery from Cesium Ion
      terrain: Cesium.Terrain.fromWorldTerrain(),
    });

    viewerRef.current = viewer;
    onReady?.(viewer);

    return () => {
      viewer.destroy();
      viewerRef.current = null;
    };
  }, [onReady]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%' }}
      data-testid="cesium-viewport"
    />
  );
}
```

**Step 2: Wire into App**

Modify `src/App.tsx`:
```tsx
import { initCesium } from './config/cesium';
import { CesiumViewport } from './viewport/CesiumViewport';

initCesium(); // reads VITE_CESIUM_ION_TOKEN from env

export function App() {
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <CesiumViewport
        onReady={(viewer) => {
          // Fly to KSEA as default view
          viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(-122.31, 47.45, 5000),
            orientation: {
              heading: Cesium.Math.toRadians(0),
              pitch: Cesium.Math.toRadians(-30),
              roll: 0,
            },
          });
        }}
      />
      <div
        style={{
          position: 'fixed',
          top: 10,
          left: 10,
          color: '#0f0',
          fontFamily: 'monospace',
          zIndex: 10,
          pointerEvents: 'none',
        }}
      >
        RFS — Phase 0
      </div>
    </div>
  );
}
```

Need to add `Cesium` import. Actually, let me make App.tsx self-contained:
```tsx
import * as Cesium from 'cesium';
import { initCesium } from './config/cesium';
import { CesiumViewport } from './viewport/CesiumViewport';

initCesium();

export function App() {
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <CesiumViewport
        onReady={(viewer) => {
          viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(-122.31, 47.45, 5000),
            orientation: {
              heading: Cesium.Math.toRadians(0),
              pitch: Cesium.Math.toRadians(-30),
              roll: 0,
            },
          });
        }}
      />
      <div
        style={{
          position: 'fixed',
          top: 10,
          left: 10,
          color: '#0f0',
          fontFamily: 'monospace',
          zIndex: 10,
          pointerEvents: 'none',
        }}
      >
        RFS — Phase 0
      </div>
    </div>
  );
}
```

**Step 3: Fix the App test — it needs Cesium now**

Update `src/__tests__/App.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';

// Mock Cesium Ion to avoid real API calls in test
vi.mock('cesium', () => ({
  Ion: { defaultAccessToken: '' },
  Viewer: vi.fn().mockReturnValue({
    destroy: vi.fn(),
    camera: { flyTo: vi.fn() },
  }),
  Cartesian3: { fromDegrees: vi.fn(() => ({ x: 0, y: 0, z: 0 })) },
  Math: { toRadians: (d: number) => d * Math.PI / 180 },
  Terrain: { fromWorldTerrain: vi.fn(() => ({})) },
}));

import { render, screen } from '@testing-library/react';
import { App } from '../App';

describe('App', () => {
  it('renders RFS label', () => {
    render(<App />);
    expect(screen.getByText('RFS — Phase 0')).toBeTruthy();
  });
});
```

Run:
```bash
npx vitest run src/__tests__/App.test.tsx
```
Expected: 1 passed.

**Step 4: Verify build**

```bash
npx vite build
```
Expected: produces `dist/` with Cesium assets.

**Step 5: Commit**

```bash
git add src/viewport/ src/App.tsx src/__tests__/App.test.tsx
git commit -m "feat: add CesiumViewport rendering globe with KSEA fly-to"
```

---

### Task 10: Three.js integration via three-to-cesium

**Objective:** Add the `three-to-cesium` integration layer. Verify a Three.js mesh renders on top of the Cesium globe.

**Files:**
- Create: `src/viewport/ThreeLayer.tsx`

**Step 1: Write src/viewport/ThreeLayer.tsx**

```tsx
import { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import * as THREE from 'three';
import ThreeToCesium from 'three-to-cesium';

export interface ThreeLayerProps {
  viewer: Cesium.Viewer | null;
}

export function ThreeLayer({ viewer }: ThreeLayerProps) {
  const ttcRef = useRef<ReturnType<typeof ThreeToCesium> | null>(null);
  const cubeRef = useRef<THREE.Mesh | null>(null);

  useEffect(() => {
    if (!viewer) return;
    if (ttcRef.current) return;

    // Initialize Three-to-Cesium bridge
    const ttc = ThreeToCesium(viewer, {
      cameraFar: 10000000,
      cameraNear: 0.1,
    });
    ttcRef.current = ttc;

    // Create a test cube at KSEA
    const geometry = new THREE.BoxGeometry(50, 50, 50);
    const material = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    const cube = new THREE.Mesh(geometry, material);
    cubeRef.current = cube;

    const position = Cesium.Cartesian3.fromDegrees(-122.31, 47.45, 500);
    ttc.add(cube, position);

    // Add ambient + directional light
    const ambient = new THREE.AmbientLight(0x404040, 0.5);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(1000, 2000, 500);
    ttc.threeScene.add(ambient);
    ttc.threeScene.add(dirLight);

    // Sync in the Cesium postRender
    const sync = () => ttc.update();
    viewer.scene.postRender.addEventListener(sync);

    return () => {
      viewer.scene.postRender.removeEventListener(sync);
      ttc.destroy();
      ttcRef.current = null;
    };
  }, [viewer]);

  return null; // renders into Cesium's canvas via Three-to-Cesium
}
```

**Step 2: Wire ThreeLayer into App**

Modify `src/App.tsx` to use a ref for the viewer:
```tsx
import { useRef } from 'react';
import * as Cesium from 'cesium';
import { initCesium } from './config/cesium';
import { CesiumViewport } from './viewport/CesiumViewport';
import { ThreeLayer } from './viewport/ThreeLayer';

initCesium();

export function App() {
  const viewerRef = useRef<Cesium.Viewer | null>(null);

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <CesiumViewport
        onReady={(viewer) => {
          viewerRef.current = viewer;
          viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(-122.31, 47.45, 5000),
            orientation: {
              heading: Cesium.Math.toRadians(0),
              pitch: Cesium.Math.toRadians(-30),
              roll: 0,
            },
          });
        }}
      />
      <ThreeLayer viewer={viewerRef.current} />
      <div
        style={{
          position: 'fixed',
          top: 10,
          left: 10,
          color: '#0f0',
          fontFamily: 'monospace',
          zIndex: 10,
          pointerEvents: 'none',
        }}
      >
        RFS — Phase 0
      </div>
    </div>
  );
}
```

**Step 3: Update App test for new structure**

Update `src/__tests__/App.test.tsx` mock to include `useRef`:
```tsx
import { describe, it, expect, vi } from 'vitest';

vi.mock('cesium', () => ({
  Ion: { defaultAccessToken: '' },
  Viewer: vi.fn().mockReturnValue({
    destroy: vi.fn(),
    camera: { flyTo: vi.fn() },
    scene: { postRender: { addEventListener: vi.fn(), removeEventListener: vi.fn() } },
  }),
  Cartesian3: { fromDegrees: vi.fn(() => ({ x: 0, y: 0, z: 0 })) },
  Math: { toRadians: (d: number) => (d * Math.PI) / 180 },
  Terrain: { fromWorldTerrain: vi.fn(() => ({})) },
}));

vi.mock('three', () => ({
  BoxGeometry: vi.fn(),
  MeshStandardMaterial: vi.fn(),
  Mesh: vi.fn(() => ({})),
  AmbientLight: vi.fn(),
  DirectionalLight: vi.fn(() => ({ position: { set: vi.fn() } })),
  Scene: vi.fn(() => ({ add: vi.fn() })),
}));

vi.mock('three-to-cesium', () => ({
  default: vi.fn(() => ({
    add: vi.fn(),
    update: vi.fn(),
    destroy: vi.fn(),
    threeScene: { add: vi.fn() },
  })),
}));

import { render, screen } from '@testing-library/react';
import { App } from '../App';

describe('App', () => {
  it('renders RFS label', () => {
    render(<App />);
    expect(screen.getByText('RFS — Phase 0')).toBeTruthy();
  });
});
```

Run:
```bash
npx vitest run src/__tests__/App.test.tsx
```
Expected: 1 passed.

**Step 4: Verify dev build**

```bash
npx vite build 2>&1 | tail -5
```
Expected: no errors, `dist/` produced.

**Step 5: Commit**

```bash
git add src/viewport/ThreeLayer.tsx src/App.tsx src/__tests__/App.test.tsx
git commit -m "feat: add ThreeLayer integration via three-to-cesium"
```

---

### Task 11: Run full test suite and verify build

**Objective:** Confirm all tests pass and production build produces valid output.

**Step 1: Run all tests**

```bash
npx vitest run
```
Expected: all tests pass (types, cesium config, App).

**Step 2: Run typecheck**

```bash
npx tsc --noEmit 2>&1
```
Expected: no errors (or document any pre-existing ones from Cesium type quirks).

**Step 3: Production build**

```bash
npx vite build
ls dist/index.html dist/assets/
```
Expected: `dist/index.html` exists, `dist/assets/` contains JS bundles and Cesium assets.

**Step 4: Verify dist size**

```bash
du -sh dist/
```
Expected: note the size (Cesium adds ~20MB+). This is expected — the PWA cache strategy will handle it in later phases.

**Step 5: Commit**

```bash
git add -A
git commit -m "chore: full test suite pass, production build verified"
```

---

## Phase 0 Complete — Verification Checklist

- [ ] `npx vitest run` — all tests pass (4+ test files)
- [ ] `npx tsc --noEmit` — no type errors
- [ ] `npx vite build` — produces valid `dist/`
- [ ] `npx vite` — dev server starts, browser shows Cesium globe with red cube at KSEA
- [ ] `npx eslint src/` — no lint errors
- [ ] `npx prettier --check src/` — format check passes

## What Phase 0 Delivers

- Vite + React + TypeScript project with strict TS
- CesiumJS globe with terrain + imagery (Cesium Ion free tier)
- Three.js overlay via `three-to-cesium` (test cube rendered at KSEA)
- RFMS `shared/` available via `@shared` import
- Zustand installed (stores not yet created — Phase 1)
- Vitest with jsdom, tests for config and App
- ESLint + Prettier matching RFMS conventions
- COOP/COEP headers configured (SharedArrayBuffer prerequisite for Phase 1)
