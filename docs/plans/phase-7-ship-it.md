# Phase 7: Ship It — Deployment, Production & Final Polish

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

> **Status note (2026-05-25):** Treat this as a historical/future plan, not a complete description of the current app. Deployment, Docker/GHCR, error boundary, FPS monitor, and manifest basics exist. The physics worker, service-worker PWA setup, bundle splitting, and deeper production polish remain roadmap items. Current architecture is in `../architecture.md`; prioritized follow-up work is in `../roadmap.md`.

**Goal:** Make RFS production-ready: Web Worker physics for buttery-smooth 120Hz simulation, production build optimization with code splitting and lazy loading, PWA manifest + service worker for offline capability, VPS deployment via Ansible + Docker, error boundaries, loading screen, FPS monitor, and comprehensive README.

**Architecture:** Physics moves to a dedicated Worker with `SharedArrayBuffer` — eliminates all main-thread physics jank. Vite build splits Cesium into a separate chunk and lazy-loads the globe. PWA uses `vite-plugin-pwa` matching RFMS conventions. Deployment follows the user's existing Ansible + GHCR pattern from Frontpage/Heimdahl. Error boundaries catch React rendering errors gracefully. Loading screen shows progress while Cesium initializes.

**Tech Stack:** React 18, TypeScript strict, Vite, Zustand, CesiumJS, Three.js, Web Workers, vite-plugin-pwa, Docker, Ansible, GHCR.

---

### Task 1: Web Worker Physics

**Objective:** Move `integrate()` from the main thread to a Worker at 120Hz. This is the single biggest performance improvement — eliminates all physics jank and provides uniform timesteps regardless of render frame rate.

**Files:**
- Create: `src/worker/codec.ts` — Float64Array ↔ AircraftState serialization
- Create: `src/worker/physics.worker.ts` — Worker with 120Hz `setInterval`
- Create: `src/worker/bridge.ts` — Main-thread manager
- Modify: `src/store/simStore.ts` — replace inline `integrate()` with bridge

**Step 1: Codec** — `src/worker/codec.ts`

```typescript
import type { AircraftState } from '../sim/types';

const OFF = {
  timestamp: 0, lat: 1, lon: 2, alt: 3,
  u: 4, v: 5, w: 6,
  phi: 7, theta: 8, psi: 9,
  p: 10, q: 11, r: 12,
  n1l: 13, n1r: 14,
  fuel: 15, grossWeight: 16,
  flapSetting: 17, gearDown: 18,
  timeOfDay: 19,
};
export const SAB_SIZE = 32; // float64 slots

export function writeState(sab: Float64Array, state: AircraftState): void {
  const o = OFF;
  sab[o.timestamp] = state.simTime;
  sab[o.lat] = state.position.lat;
  sab[o.lon] = state.position.lon;
  sab[o.alt] = state.position.alt;
  sab[o.u] = state.velocity.u;
  sab[o.v] = state.velocity.v;
  sab[o.w] = state.velocity.w;
  sab[o.phi] = state.attitude.phi;
  sab[o.theta] = state.attitude.theta;
  sab[o.psi] = state.attitude.psi;
  sab[o.p] = state.angularVel.p;
  sab[o.q] = state.angularVel.q;
  sab[o.r] = state.angularVel.r;
  sab[o.n1l] = state.engines[0].n1;
  sab[o.n1r] = state.engines[1].n1;
  sab[o.fuel] = state.fuel.totalFuel;
  sab[o.grossWeight] = state.grossWeight;
  sab[o.flapSetting] = state.config.flapSetting;
  sab[o.gearDown] = state.config.gearDown ? 1 : 0;
  sab[o.timeOfDay] = state.timeOfDay ?? 12;
}

export function readState(sab: Float64Array, state: AircraftState): void {
  const o = OFF;
  state.simTime = sab[o.timestamp];
  state.position.lat = sab[o.lat];
  state.position.lon = sab[o.lon];
  state.position.alt = sab[o.alt];
  state.velocity.u = sab[o.u];
  state.velocity.v = sab[o.v];
  state.velocity.w = sab[o.w];
  state.attitude.phi = sab[o.phi];
  state.attitude.theta = sab[o.theta];
  state.attitude.psi = sab[o.psi];
  state.angularVel.p = sab[o.p];
  state.angularVel.q = sab[o.q];
  state.angularVel.r = sab[o.r];
  state.engines[0].n1 = sab[o.n1l];
  state.engines[1].n1 = sab[o.n1r];
  state.fuel.totalFuel = sab[o.fuel];
  state.grossWeight = sab[o.grossWeight];
  state.config.flapSetting = sab[o.flapSetting];
  state.config.gearDown = sab[o.gearDown] > 0.5;
}
```

**Step 2: Worker** — `src/worker/physics.worker.ts`

```typescript
import { createInitialState, B737_800_SPEC } from '../sim/types';
import { integrate } from '../sim/physics/integrate';
import { writeState, SAB_SIZE } from './codec';
import type { ControlInputs } from '../sim/types';

let state = createInitialState(B737_800_SPEC);
let sab: Float64Array | null = null;
let running = false;
let intervalId: number | null = null;

const defaultInputs: ControlInputs = {
  elevator: 0, aileron: 0, rudder: 0,
  throttle1: 0, throttle2: 0,
  flapLever: 0, gearLever: 'DOWN',
  spoilers: 0, brake: 0,
};
let inputs: ControlInputs = { ...defaultInputs };
let apState: any = null;
let flightPlan: any = null;

self.onmessage = (e: MessageEvent) => {
  switch (e.data.type) {
    case 'init':
      sab = new Float64Array(e.data.sab);
      break;
    case 'inputs':
      inputs = { ...inputs, ...(e.data.inputs as Partial<ControlInputs>) };
      break;
    case 'apState':
      apState = e.data.apState;
      break;
    case 'flightPlan':
      flightPlan = e.data.flightPlan;
      break;
    case 'start':
      if (!running) {
        running = true;
        intervalId = setInterval(tick, 1000 / 120) as unknown as number;
      }
      break;
    case 'stop':
      running = false;
      if (intervalId) { clearInterval(intervalId); intervalId = null; }
      break;
    case 'reset':
      state = createInitialState(B737_800_SPEC);
      inputs = { ...defaultInputs };
      apState = null;
      flightPlan = null;
      break;
  }
};

function tick(): void {
  integrate(state, inputs, B737_800_SPEC, 1 / 120, apState, flightPlan);
  if (sab) writeState(sab, state);
}
```

**Step 3: Bridge** — `src/worker/bridge.ts`

```typescript
import { SAB_SIZE, readState } from './codec';
import type { AircraftState } from '../sim/types';
import { createInitialState, B737_800_SPEC } from '../sim/types';

export class PhysicsBridge {
  worker: Worker;
  sab: SharedArrayBuffer;
  sabView: Float64Array;
  state: AircraftState;
  private lastTs = 0;

  constructor() {
    this.sab = new SharedArrayBuffer(SAB_SIZE * 8);
    this.sabView = new Float64Array(this.sab);
    this.state = createInitialState(B737_800_SPEC);
    this.worker = new Worker(new URL('./physics.worker.ts', import.meta.url), { type: 'module' });
    this.worker.postMessage({ type: 'init', sab: this.sab });
  }

  start() { this.worker.postMessage({ type: 'start' }); }
  stop() { this.worker.postMessage({ type: 'stop' }); }
  reset() { this.worker.postMessage({ type: 'reset' }); }
  setInputs(inputs: any) { this.worker.postMessage({ type: 'inputs', inputs }); }
  setApState(apState: any) { this.worker.postMessage({ type: 'apState', apState }); }
  setFlightPlan(fp: any) { this.worker.postMessage({ type: 'flightPlan', flightPlan: fp }); }

  pollFrame(): boolean {
    const ts = this.sabView[0];
    if (ts === this.lastTs) return false;
    this.lastTs = ts;
    readState(this.sabView, this.state);
    return true;
  }

  dispose() { this.stop(); this.worker.terminate(); }
}
```

**Step 4: Integrate into simStore** — replace `integrate()` call in `tick()` with bridge polling.

**Step 5: Verify**

```bash
npx vitest run && npx tsc --noEmit
git add src/worker/ src/store/simStore.ts
git commit -m "feat: move physics to Web Worker at 120Hz with SharedArrayBuffer"
```

---

### Task 2: Production Build Optimization

**Objective:** Code-split Cesium into a separate chunk and lazy-load the globe. Reduce initial JS payload by ~500KB.

**Files:**
- Modify: `vite.config.ts` — rollupOptions for manual chunks
- Modify: `src/App.tsx` — lazy-load CesiumViewport

**Step 1: Code-split Cesium**

In `vite.config.ts`, add to `build.rollupOptions`:
```typescript
output: {
  manualChunks: {
    cesium: ['cesium'],
    three: ['three'],
    vendor: ['react', 'react-dom', 'zustand'],
  },
},
```

**Step 2: Lazy-load CesiumViewport**

```typescript
const CesiumViewport = lazy(() => import('./viewport/CesiumViewport'));
const ThreeLayer = lazy(() => import('./viewport/ThreeLayer'));

// Wrap in Suspense with loading fallback
<Suspense fallback={<LoadingScreen />}>
  <CesiumViewport ... />
  <ThreeLayer ... />
</Suspense>
```

**Step 3: Verify build size**

```bash
npx vite build && du -sh dist/assets/*.js
git add vite.config.ts src/App.tsx
git commit -m "perf: code-split Cesium and lazy-load viewport"
```

---

### Task 3: PWA Support

**Objective:** Add service worker, manifest, and install prompt — matching RFMS PWA conventions.

**Files:**
- Create: `public/manifest.json`
- Create: `public/icons/icon-192.png`, `icon-512.png`
- Modify: `vite.config.ts` — add `VitePWA` plugin
- Modify: `index.html` — add manifest link

**Step 1: Create manifest** — `public/manifest.json`

```json
{
  "name": "RFS — Real Flight Simulator",
  "short_name": "RFS",
  "description": "Web-based Boeing 737 flight simulator",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#000000",
  "theme_color": "#000000",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

**Step 2: Add PWA plugin to Vite**

```typescript
import { VitePWA } from 'vite-plugin-pwa';

// In plugins array:
VitePWA({
  registerType: 'prompt',
  manifest: false, // use public/manifest.json
  workbox: {
    globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
    runtimeCaching: [{
      urlPattern: /^https:\/\/assets\.cesium\.com\/.*/i,
      handler: 'CacheFirst',
      options: { cacheName: 'cesium-assets', expiration: { maxEntries: 50, maxAgeSeconds: 86400 } },
    }],
  },
}),
```

**Step 3: Commit**

```bash
git add public/manifest.json vite.config.ts
git commit -m "feat: add PWA manifest and service worker"
```

---

### Task 4: Loading Screen & Error Boundary

**Objective:** Show a loading screen while Cesium initializes. Catch React errors gracefully.

**Files:**
- Create: `src/components/LoadingScreen.tsx`
- Create: `src/components/ErrorBoundary.tsx`
- Modify: `src/App.tsx` — wrap in ErrorBoundary + Suspense

**Step 1: LoadingScreen** — `src/components/LoadingScreen.tsx`

```tsx
export function LoadingScreen() {
  return (
    <div style={{
      width: '100%', height: '100%', background: '#000',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#0f0', fontFamily: 'monospace', fontSize: 24,
    }}>
      <div>
        <div style={{ fontSize: 48, marginBottom: 16 }}>✈</div>
        <div>RFS — Loading...</div>
      </div>
    </div>
  );
}
```

**Step 2: ErrorBoundary** — `src/components/ErrorBoundary.tsx`

```tsx
import { Component, type ReactNode } from 'react';

interface Props { children: ReactNode; }
interface State { error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ color: '#f00', fontFamily: 'monospace', padding: 40 }}>
          <h1>Something went wrong</h1>
          <pre>{this.state.error.message}</pre>
          <button onClick={() => this.setState({ error: null })}>Try Again</button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

**Step 3: Commit**

```bash
git add src/components/LoadingScreen.tsx src/components/ErrorBoundary.tsx src/App.tsx
git commit -m "feat: add loading screen and error boundary"
```

---

### Task 5: FPS Monitor

**Objective:** Show real-time FPS counter in the corner for performance debugging.

**Files:**
- Create: `src/components/FPSMonitor.tsx`
- Modify: `src/App.tsx` — add component

**Step 1: FPSMonitor** — `src/components/FPSMonitor.tsx`

```tsx
import { useEffect, useRef, useState } from 'react';

export function FPSMonitor() {
  const [fps, setFps] = useState(0);
  const frames = useRef(0);
  const lastTime = useRef(performance.now());

  useEffect(() => {
    let raf: number;
    const update = () => {
      frames.current++;
      const now = performance.now();
      if (now - lastTime.current >= 1000) {
        setFps(frames.current);
        frames.current = 0;
        lastTime.current = now;
      }
      raf = requestAnimationFrame(update);
    };
    raf = requestAnimationFrame(update);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div style={{
      position: 'fixed', bottom: 10, right: 10, zIndex: 200,
      color: fps > 50 ? '#0f0' : fps > 30 ? '#ff0' : '#f00',
      fontFamily: 'monospace', fontSize: 12, pointerEvents: 'none',
    }}>
      {fps} FPS
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/FPSMonitor.tsx src/App.tsx
git commit -m "feat: add FPS monitor"
```

---

### Task 6: Docker + Ansible Deploy

**Objective:** Create Dockerfile and Ansible playbook for VPS deployment, following the user's established patterns (Frontpage, Heimdall).

**Files:**
- Create: `Dockerfile`
- Create: `nginx.conf`
- Create: `ansible/` directory with playbook
- Create: `.dockerignore`

**Step 1: Dockerfile**

```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

**Step 2: nginx.conf** — serve with COOP/COEP headers for SharedArrayBuffer:

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;
    add_header Cross-Origin-Opener-Policy "same-origin" always;
    add_header Cross-Origin-Embedder-Policy "require-corp" always;
    location / { try_files $uri /index.html; }
    location /assets/ { expires 1y; }
}
```

**Step 3: Ansible playbook**

```yaml
- hosts: vps
  vars:
    image: ghcr.io/reedtrullz/rfs:latest
  tasks:
    - name: Pull image
      docker_image: name={{ image }} source=pull
    - name: Run container
      docker_container:
        name: rfs
        image: "{{ image }}"
        ports: ["3001:80"]
        restart_policy: always
```

**Step 4: Commit**

```bash
git add Dockerfile nginx.conf ansible/ .dockerignore
git commit -m "feat: add Docker + Ansible deployment"
```

---

### Task 7: README & Documentation

**Objective:** Write comprehensive README with setup instructions, architecture overview, controls reference, and screenshots.

**Files:**
- Modify: `README.md`

**Step 1: Write README** covering:
- Project description
- Quick start (`npm install && npm run dev`)
- Controls (WASD, gamepad, MCP buttons, camera modes)
- Architecture overview (diagram)
- Tech stack
- Deployment instructions

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: comprehensive README with setup, controls, architecture"
```

---

### Task 8: Final Verification & GitHub CI

**Objective:** Full suite, build, docker build. Add GitHub Actions CI.

**Files:**
- Create: `.github/workflows/ci.yml`

**Step 1: CI workflow**

```yaml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
```

**Step 2: Final verification**

```bash
npx vitest run && npx tsc --noEmit && npx vite build && docker build -t rfs .
```

**Step 3: Commit**

```bash
git add .github/
git commit -m "ci: add GitHub Actions workflow"
```

---

## Phase 7 Complete — Ship-Ready

| Feature | Status |
|---------|--------|
| Web Worker physics | 120Hz simulation, zero main-thread jank |
| Code splitting | Cesium lazy-loaded, initial JS ~300KB |
| PWA | Install prompt, offline cache, service worker |
| Loading screen | Shows while Cesium initializes |
| Error boundary | Graceful error recovery |
| FPS monitor | Real-time performance counter |
| Docker | Multi-stage build, nginx with COOP/COEP |
| Ansible | Deploy to VPS at rfs.reidar.tech |
| README | Full documentation |
| CI | GitHub Actions: typecheck + test + build |
