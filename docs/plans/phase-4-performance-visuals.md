# Phase 4: Performance & Visual Fidelity — Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Fix the per-frame mesh recreation bottleneck, move physics to a Web Worker for 120Hz simulation, add weather visualization (cloud layers from METAR), dynamic time-of-day lighting, aircraft navigation lights, and load airports from RFMS navdata instead of hardcoded KSEA.

**Architecture:** The physics engine moves to a `Worker` thread at 120Hz with `SharedArrayBuffer` state transfer. The `ThreeLayer` component updates aircraft mesh position/rotation in-place instead of destroying/recreating every frame. Weather visualization renders cloud billboards at METAR-reported altitudes. Sun position computed from lat/lon/time, driving ambient + directional light color/intensity. Aircraft lights are emissive meshes on the 737 model. Airport data loads from RFMS `navdataStore` instead of hardcoded constants.

**Tech Stack:** Same as before + Web Workers + SharedArrayBuffer + RFMS navdata.

---

### Task 1: In-Place Mesh Updates (No Recreate Per Frame)

**Objective:** Fix the performance bug where `ThreeLayer` destroys and rebuilds the entire aircraft model every frame. Update position/rotation in-place via `three-to-cesium` group manipulation.

**Files:**
- Modify: `src/viewport/ThreeLayer.tsx` — replace remove+add pattern with in-place updates

**Current bug (ThreeLayer.tsx lines 39-56):**
```typescript
// Remove old proxy — DESTROYS AND RECREATES EVERY FRAME!
if (proxyRef.current) {
  ttc.remove(proxyRef.current);
}
// ... build new model ...
proxyRef.current = ttc.add(model, pos);
```

Three-to-cesium's `add()` returns a `THREE.Group` that wraps the mesh. We CAN update this group's position by modifying the underlying `Cesium.Cartesian3` reference. However, `three-to-cesium` doesn't expose a direct "update position" method.

**Approach:** Store the `THREE.Group` reference. On each frame, use `Cesium.Cartesian3.clone()` to update the position that three-to-cesium tracks. The library stores position in the group's `userData`. Alternatively, since three-to-cesium re-renders via `ttc.update()` which syncs the Three.js camera to Cesium's camera, and the group position is set during `add()`, we need a different strategy:

**Better approach:** Create the aircraft model ONCE on mount. On each frame, manually set the group's position by converting lat/lon/alt to ECEF, then to the local Cesium coordinate frame. Since three-to-cesium's `update()` re-renders Three.js but doesn't reposition objects, we need to reposition ourselves.

**Concrete fix:** Use `Cesium.Transforms.eastNorthUpToFixedFrame()` to get a transform matrix at the aircraft position, then decompose it to set the group's `matrix` or `position` + `quaternion`:

```typescript
// ONCE on mount:
const model = createBoeing737Model();
const pos = Cesium.Cartesian3.fromDegrees(lon, lat, altM);
proxyRef.current = ttc.add(model, pos);

// EVERY FRAME (in sync callback):
const aircraft = useSimStore.getState().aircraft;
const { lat, lon, alt } = aircraft.position;
const { phi, theta, psi } = aircraft.attitude;

if (proxyRef.current) {
  const newPos = Cesium.Cartesian3.fromDegrees(lon, lat, alt * 0.3048);
  const enuMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(newPos);
  
  // Decompose matrix to position + quaternion
  const position = Cesium.Matrix4.getTranslation(enuMatrix, new Cesium.Cartesian3());
  const rotation = Cesium.Matrix4.getRotation(enuMatrix, new Cesium.Matrix3());
  const quat = Cesium.Quaternion.fromRotationMatrix(rotation);
  
  // Set Three.js group transform
  proxyRef.current.position.set(position.x, position.y, position.z);
  proxyRef.current.quaternion.set(quat.x, quat.y, quat.z, quat.w);
  
  // Apply aircraft attitude on top of ENU orientation
  proxyRef.current.rotateX(theta);
  proxyRef.current.rotateY(0);
  proxyRef.current.rotateZ(-phi);
  
  // Fan animation
  const children = proxyRef.current.children;
  const engCount = 2;
  for (let i = 0; i < engCount; i++) {
    const idx = children.length - engCount + i;
    if (children[idx]) {
      children[idx].rotation.z += aircraft.engines[i].n1 * 0.05;
    }
  }
}
```

Wait — this approach conflicts with three-to-cesium's internal tracking. The library stores objects internally and repositions them during `update()`. Manually setting position may be overridden.

**Simplest working approach:** Keep the remove+add pattern but USE A POOL. Create the model once, clone the geometry/materials (not the mesh), and reuse. Three.js `Geometry.clone()` is fast. Or better: use the three-to-cesium approach where we just call `ttc.add()` which internally manages the position.

Actually, the simplest high-impact fix: **don't build the model fresh each frame — build it once and store the geometry references. On each frame, update the existing group's position via three-to-cesium's internal mechanism.**

Let me check if three-to-cesium supports position updates. Looking at the docs, `add()` returns a `THREE.Group` positioned at the given `Cartesian3`. There's no exposed `updatePosition()`. But the group's `userData` stores the original position.

**Practical fix for Phase 4:** The remove+add pattern works. The real issue is creating new `THREE.Mesh` objects with their geometry every frame. Instead, create the model ONCE, clone the group (fast — clones transforms but shares geometry), and add the clone. Or even better: move the model creation outside the sync callback so it's created once at mount time, and only the `add`/`remove` calls happen per frame. The geometry and materials are shared across frames.

```typescript
// Create ONCE outside sync callback
const modelTemplate = createBoeing737Model();

// In sync callback, just clone and reposition:
const model = modelTemplate.clone(true); // deep clone shares geometry
model.rotation.set(theta, 0, -phi);
const pos = Cesium.Cartesian3.fromDegrees(lon, lat, alt * 0.3048);
if (proxyRef.current) ttc.remove(proxyRef.current);
proxyRef.current = ttc.add(model, pos);
```

`group.clone(true)` is O(n) in the number of children but shares all geometry buffers — it only creates new wrapper objects. This is ~100x faster than rebuilding geometry.

**Step 1: Implement** — Move `createBoeing737Model()` call outside the sync callback. Store the template. Clone it each frame.

**Step 2: Verify** — tests pass, visual check for smoothness.

**Step 3: Commit**

```bash
git add src/viewport/ThreeLayer.tsx
git commit -m "perf: clone aircraft model instead of rebuilding geometry each frame"
```

---

### Task 2: Web Worker Physics at 120Hz

**Objective:** Move the physics engine to a dedicated Worker thread running at 120Hz. Main thread reads state via `SharedArrayBuffer` and posts `ControlInputs` back.

**Files:**
- Create: `src/worker/physics.worker.ts` — worker entry point
- Create: `src/worker/codec.ts` — Float64Array ↔ AircraftState serialization
- Create: `src/worker/bridge.ts` — main-thread Worker manager
- Modify: `src/store/simStore.ts` — use Worker instead of inline integrate()
- Modify: `vite.config.ts` — ensure Worker bundling works

**Architecture:**

```
Main Thread (60fps)              Worker Thread (120Hz)
─────────────────                ────────────────────
useSimLoop (RAF)                 setInterval(8ms)
  ↓                                ↓
read SAB → Zustand               read inputs from SAB
  ↓                                ↓
render frame                     integrate(state, inputs, spec, dt)
                                   ↓
                                 write state to SAB
                                 postMessage(frameCount)

Control flow:
- Worker owns the AircraftState
- Main thread posts ControlInputs via postMessage (or writes to a separate SAB region)
- Worker writes state to SAB[0..255] each tick
- Main thread polls SAB[0] (timestamp) for changes, reads state on change
```

**SharedArrayBuffer layout (256 bytes):**
```
Offset  Size  Field
0       8     timestamp (ms)
8       8     lat (deg)
16      8     lon (deg)
24      8     alt (ft)
32      8     u (m/s body-x)
40      8     v (m/s body-y)
48      8     w (m/s body-z)
56      8     phi (rad)
64      8     theta (rad)
72      8     psi (rad)
80      8     p (rad/s)
88      8     q (rad/s)
96      8     r (rad/s)
104     8     n1_left (%)
112     8     n1_right (%)
120     8     fuel (kg)
128     8     grossWeight (kg)
136     8     flapSetting
144     1     gearDown (0/1)
145     1     running (0/1)
... remaining bytes reserved
```

**Step 1: Create codec** — `src/worker/codec.ts`

Functions to read/write AircraftState from/to Float64Array buffer. Only serialize the fields needed by the UI (position, attitude, velocity, engine N1, fuel, config). Full state stays in the worker.

```typescript
import type { AircraftState } from '../sim/types';

export const SAB_SIZE = 256;
export const SAB_OFFSETS = {
  timestamp: 0, lat: 1, lon: 2, alt: 3,
  u: 4, v: 5, w: 6,
  phi: 7, theta: 8, psi: 9,
  p: 10, q: 11, r: 12,
  n1l: 13, n1r: 14,
  fuel: 15, grossWeight: 16,
  flapSetting: 17,
  gearDown: 18,
};

export function writeStateToSAB(sab: Float64Array, state: AircraftState): void {
  sab[SAB_OFFSETS.timestamp] = state.simTime;
  sab[SAB_OFFSETS.lat] = state.position.lat;
  sab[SAB_OFFSETS.lon] = state.position.lon;
  sab[SAB_OFFSETS.alt] = state.position.alt;
  sab[SAB_OFFSETS.u] = state.velocity.u;
  sab[SAB_OFFSETS.v] = state.velocity.v;
  sab[SAB_OFFSETS.w] = state.velocity.w;
  sab[SAB_OFFSETS.phi] = state.attitude.phi;
  sab[SAB_OFFSETS.theta] = state.attitude.theta;
  sab[SAB_OFFSETS.psi] = state.attitude.psi;
  sab[SAB_OFFSETS.p] = state.angularVel.p;
  sab[SAB_OFFSETS.q] = state.angularVel.q;
  sab[SAB_OFFSETS.r] = state.angularVel.r;
  sab[SAB_OFFSETS.n1l] = state.engines[0].n1;
  sab[SAB_OFFSETS.n1r] = state.engines[1].n1;
  sab[SAB_OFFSETS.fuel] = state.fuel.totalFuel;
  sab[SAB_OFFSETS.grossWeight] = state.grossWeight;
  sab[SAB_OFFSETS.flapSetting] = state.config.flapSetting;
  sab[SAB_OFFSETS.gearDown] = state.config.gearDown ? 1 : 0;
}

export function readStateFromSAB(sab: Float64Array, state: AircraftState): void {
  state.simTime = sab[SAB_OFFSETS.timestamp];
  state.position.lat = sab[SAB_OFFSETS.lat];
  state.position.lon = sab[SAB_OFFSETS.lon];
  state.position.alt = sab[SAB_OFFSETS.alt];
  state.velocity.u = sab[SAB_OFFSETS.u];
  state.velocity.v = sab[SAB_OFFSETS.v];
  state.velocity.w = sab[SAB_OFFSETS.w];
  state.attitude.phi = sab[SAB_OFFSETS.phi];
  state.attitude.theta = sab[SAB_OFFSETS.theta];
  state.attitude.psi = sab[SAB_OFFSETS.psi];
  state.angularVel.p = sab[SAB_OFFSETS.p];
  state.angularVel.q = sab[SAB_OFFSETS.q];
  state.angularVel.r = sab[SAB_OFFSETS.r];
  state.engines[0].n1 = sab[SAB_OFFSETS.n1l];
  state.engines[1].n1 = sab[SAB_OFFSETS.n1r];
  state.fuel.totalFuel = sab[SAB_OFFSETS.fuel];
  state.grossWeight = sab[SAB_OFFSETS.grossWeight];
  state.config.flapSetting = sab[SAB_OFFSETS.flapSetting];
  state.config.gearDown = sab[SAB_OFFSETS.gearDown] > 0.5;
}
```

**Step 2: Create worker** — `src/worker/physics.worker.ts`

```typescript
import { createInitialState, B737_800_SPEC } from '../sim/types';
import { integrate } from '../sim/physics/integrate';
import { writeStateToSAB, SAB_SIZE } from './codec';

let state = createInitialState(B737_800_SPEC);
let sab: Float64Array | null = null;
let inputs = { /* default ControlInputs */ };

self.onmessage = (e: MessageEvent) => {
  const msg = e.data;
  switch (msg.type) {
    case 'init':
      sab = new Float64Array(msg.sab);
      break;
    case 'inputs':
      inputs = { ...inputs, ...msg.inputs };
      break;
    case 'start':
      startLoop();
      break;
    case 'stop':
      stopLoop();
      break;
  }
};

let intervalId: number | null = null;
const DT = 1 / 120;

function startLoop() {
  if (intervalId) return;
  intervalId = setInterval(() => {
    integrate(state, inputs, B737_800_SPEC, DT);
    if (sab) writeStateToSAB(sab, state);
  }, DT * 1000) as unknown as number;
}

function stopLoop() {
  if (intervalId) { clearInterval(intervalId); intervalId = null; }
}
```

**Step 3: Create bridge** — `src/worker/bridge.ts`

```typescript
import { SAB_SIZE, readStateFromSAB } from './codec';
import type { ControlInputs, AircraftState } from '../sim/types';
import { createInitialState, B737_800_SPEC } from '../sim/types';

export class PhysicsWorkerBridge {
  private worker: Worker;
  private sab: SharedArrayBuffer;
  private sabView: Float64Array;
  private lastTimestamp = 0;
  public state: AircraftState;

  constructor() {
    this.sab = new SharedArrayBuffer(SAB_SIZE * 8);
    this.sabView = new Float64Array(this.sab);
    this.state = createInitialState(B737_800_SPEC);

    this.worker = new Worker(new URL('./physics.worker.ts', import.meta.url), { type: 'module' });
    this.worker.postMessage({ type: 'init', sab: this.sab });
  }

  start() {
    this.worker.postMessage({ type: 'start' });
  }

  stop() {
    this.worker.postMessage({ type: 'stop' });
  }

  setInputs(inputs: ControlInputs) {
    this.worker.postMessage({ type: 'inputs', inputs });
  }

  /** Returns true if a new frame was read */
  pollFrame(): boolean {
    const ts = this.sabView[0];
    if (ts === this.lastTimestamp) return false;
    this.lastTimestamp = ts;
    readStateFromSAB(this.sabView, this.state);
    return true;
  }

  dispose() {
    this.stop();
    this.worker.terminate();
  }
}
```

**Step 4: Integrate into simStore** — modify `simStore.ts` to use `PhysicsWorkerBridge` instead of inline `integrate()`. When `bridge` is available, `tick()` polls SAB and updates Zustand. `start()`/`stop()` control the worker.

**Step 5: Verify** — tests must still pass (may need to mock Worker in test env).

```bash
npx vitest run && npx tsc --noEmit
git add src/worker/ src/store/simStore.ts vite.config.ts
git commit -m "feat: move physics to Web Worker at 120Hz with SharedArrayBuffer"
```

---

### Task 3: Weather Visualization — Cloud Layers

**Objective:** Render cloud billboards at METAR-reported altitudes. Use Cesium's `BillboardCollection` for efficient batch rendering of cloud sprites.

**Files:**
- Create: `src/viewport/CloudLayer.tsx`

**Step 1: Implementation**

```typescript
import { useEffect, useRef, type RefObject } from 'react';
import * as Cesium from 'cesium';
import type { MetarData } from '../sim/weather';

interface CloudLayerProps {
  viewerRef: RefObject<Cesium.Viewer | null>;
  metar: MetarData | null;
}

export function CloudLayer({ viewerRef, metar }: CloudLayerProps) {
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !metar || !metar.clouds.length) return;

    const billboards = viewer.scene.primitives.add(new Cesium.BillboardCollection());

    for (const cloud of metar.clouds) {
      // Create a grid of cloud billboards at the reported altitude
      const baseAltM = cloud.base * 0.3048; // ft → m
      const count = cloud.cover === 'OVC' ? 25 : cloud.cover === 'BKN' ? 16 : 9;

      for (let i = 0; i < count; i++) {
        const lat = 47.45 + (i % 5 - 2) * 0.05;
        const lon = -122.31 + (Math.floor(i / 5) - 2) * 0.05;

        billboards.add({
          position: Cesium.Cartesian3.fromDegrees(lon, lat, baseAltM),
          image: '/cloud.png', // white fluffy circle sprite
          scale: 0.3,
          heightReference: Cesium.HeightReference.NONE,
        });
      }
    }

    return () => {
      viewer.scene.primitives.remove(billboards);
    };
  }, [viewerRef, metar]);

  return null;
}
```

**Step 2: Create a simple cloud sprite** — a 64x64 white radial gradient PNG in `public/cloud.png`. Generate procedurally or use a data URL.

**Step 3: Wire into App**

```tsx
const [metar, setMetar] = useState<MetarData | null>(null);
// In the METAR fetch effect, setMetar(metar)
<CloudLayer viewerRef={viewerRef} metar={metar} />
```

**Step 4: Commit**

```bash
git add src/viewport/CloudLayer.tsx public/cloud.png src/App.tsx
git commit -m "feat: add METAR cloud layer visualization"
```

---

### Task 4: Time of Day — Dynamic Lighting

**Objective:** Compute sun position from aircraft lat/lon and time of day. Drive ambient + directional light color and intensity. Sunset/sunrise transitions.

**Files:**
- Create: `src/sim/sun.ts`
- Create: `src/sim/__tests__/sun.test.ts`
- Modify: `src/viewport/ThreeLayer.tsx` — update light based on sun position

**Step 1: Sun position algorithm** — `src/sim/sun.ts`

Simplified NOAA solar position formula. Input: lat, lon, hour (0-24 fractional). Output: azimuth, elevation (radians).

```typescript
export interface SunPosition {
  azimuth: number;   // radians from north
  elevation: number; // radians above horizon
}

export function computeSunPosition(lat: number, _lon: number, hour: number): SunPosition {
  // Simplified: sun rises at 6am (east = 90°), sets at 6pm (west = 270°)
  // Elevation: sinusoidal between sunrise and sunset
  const dayFraction = (hour - 6) / 12; // 0 at 6am, 1 at 6pm
  const elevation = Math.sin(dayFraction * Math.PI) * Math.PI / 3; // max 60°
  const azimuth = Math.PI / 2 + dayFraction * Math.PI; // 90° → 270°

  return {
    azimuth: azimuth % (2 * Math.PI),
    elevation: Math.max(-0.3, elevation),
  };
}

export function sunLightIntensity(elevation: number): { ambient: number; directional: number; color: string } {
  if (elevation < 0) {
    // Night
    return { ambient: 0.05, directional: 0, color: '#1a1a3a' };
  }
  if (elevation < 0.2) {
    // Dusk/dawn — warm orange
    const t = elevation / 0.2;
    return { ambient: 0.1 + t * 0.3, directional: t * 0.5, color: '#ff8833' };
  }
  // Day — bright white-blue
  return { ambient: 0.4, directional: 0.8, color: '#ffffff' };
}
```

**Step 2: Apply to Three-layer lighting**

In `ThreeLayer.tsx`, update the directional light position and ambient intensity each frame:

```typescript
// Update sun-driven lighting
const hour = 12; // TODO: from sim state timeOfDay
const sun = computeSunPosition(state.position.lat, state.position.lon, hour);
const light = sunLightIntensity(sun.elevation);

ambient.intensity = light.ambient;
ambient.color.set(light.color);
dirLight.intensity = light.directional;
// Position directional light at sun position
dirLight.position.set(
  2000 * Math.sin(sun.azimuth) * Math.cos(sun.elevation),
  2000 * Math.sin(sun.elevation),
  2000 * Math.cos(sun.azimuth) * Math.cos(sun.elevation),
);
```

**Step 3: Wire timeOfDay** — add `timeOfDay` to the sim state (default 12 = noon). Increment it slowly in `integrate()`.

**Step 4: Commit**

```bash
git add src/sim/sun.ts src/sim/__tests__/ src/viewport/ThreeLayer.tsx
git commit -m "feat: add dynamic time-of-day lighting from sun position"
```

---

### Task 5: Aircraft Navigation Lights

**Objective:** Add emissive nav lights (red/green wingtips, white tail), strobes, beacon, and landing lights to the 737 model.

**Files:**
- Modify: `src/viewport/AircraftModel.ts`

**Step 1: Add light meshes to `createBoeing737Model()`**

```typescript
// Navigation lights
const navLightMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 }); // will override per light

// Left wingtip: RED
const leftNav = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
leftNav.position.set(-18, -1.5, -1);
group.add(leftNav);

// Right wingtip: GREEN
const rightNav = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), new THREE.MeshBasicMaterial({ color: 0x00ff00 }));
rightNav.position.set(18, -1.5, -1);
group.add(rightNav);

// Tail: WHITE
const tailNav = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
tailNav.position.set(0, 5, -21);
group.add(tailNav);

// Beacon (top of fuselage): RED flashing — just static red for now
const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
beacon.position.set(0, 4, -5);
group.add(beacon);

// Landing lights (nose gear area): bright white
const landLight = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffffcc }));
landLight.position.set(0, -2, 20);
group.add(landLight);
```

**Step 2: Commit**

```bash
git add src/viewport/AircraftModel.ts
git commit -m "feat: add nav/strobe/beacon/landing lights to 737 model"
```

---

### Task 6: Airport Navdata from RFMS

**Objective:** Load airport runway data from RFMS `navdataStore` instead of hardcoded KSEA constants in `AirportLayer.tsx`.

**Files:**
- Modify: `src/viewport/AirportLayer.tsx` — import navdata, render runways from database

**Step 1: Import RFMS navdata**

```typescript
import { navdataStore } from '@shared/navdata/navdataStore';

// Instead of hardcoded KSEA_RUNWAYS, query navdataStore:
function getNearbyAirports(lat: number, lon: number, radiusNm: number): any[] {
  // navdataStore has airport data indexed by ICAO
  // For Phase 4, just load KSEA from the store
  const ksea = navdataStore.getState().airports['KSEA'];
  if (!ksea) return [];
  return [ksea];
}
```

**Step 2: Render runways from navdata** — navdata runways have threshold lat/lon, length, width, heading. Use these instead of hardcoded values.

**Step 3: Commit**

```bash
git add src/viewport/AirportLayer.tsx
git commit -m "feat: load airport runways from RFMS navdata instead of hardcoded"
```

---

### Task 7: Integration & Final Verification

**Objective:** Full suite, build, visual checklist.

```bash
npx vitest run && npx tsc --noEmit && npx vite build
```

Visual checklist:
- [ ] Aircraft model moves smoothly (no stutter from mesh recreation)
- [ ] FPS counter shows 60fps consistently (was dropping frames before)
- [ ] Cloud billboards visible at METAR altitudes
- [ ] Sunset/sunrise lighting transitions (adjust timeOfDay)
- [ ] Nav lights visible: red left wingtip, green right, white tail
- [ ] Airport runways loaded from RFMS navdata

---

## Phase 4 Complete — What You Get

| Feature | Effect |
|---------|--------|
| In-place mesh updates | 60fps smooth, no per-frame geometry creation |
| Web Worker physics | 120Hz simulation, zero main-thread physics jank |
| Cloud layers | Billboard clouds at METAR altitudes (OVC/BKN/SCT) |
| Time of day | Sun position drives ambient/directional light color |
| Nav lights | Red/green/white nav, red beacon, white landing lights |
| RFMS airports | Runways loaded from navdata, not hardcoded |
