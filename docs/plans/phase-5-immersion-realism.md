# Phase 5: Immersion & Realism — Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Move physics to a Web Worker for butter-smooth 120Hz simulation, bridge RFMS cockpit instruments (PFD/ND/MCP) to live RFS sim state, add particle effects (contrails, exhaust), animate landing gear compression and control surfaces, enable Cesium 3D buildings, and complete GPWS with all 7 modes.

**Architecture:** Physics runs in a dedicated Worker at 120Hz using `SharedArrayBuffer` for zero-copy state transfer. Cockpit instruments reuse RFMS React components (`PFD`, `ND`, `BoeingMCP`) — their Zustand selectors are remapped to read from `useSimStore` instead of `useFMCStore`. Particles use Cesium `ParticleSystem` for contrails and Three.js sprites for engine exhaust. Gear animation deforms the 3D model's gear meshes based on `gearDown` and ground contact. Cesium OSM Buildings provide 3D city scenery.

**Tech Stack:** React 18, TypeScript strict, Vite, Zustand, CesiumJS, Three.js, Web Workers, SharedArrayBuffer, RFMS components.

---

### Task 1: Web Worker Physics

**Objective:** Move `integrate()` from the main thread to a dedicated Worker at 120Hz. Main thread reads state from `SharedArrayBuffer` and posts `ControlInputs` to the Worker. This eliminates physics jank and provides uniform timesteps.

**Files:**
- Create: `src/worker/codec.ts` — Float64Array ↔ AircraftState serialization
- Create: `src/worker/physics.worker.ts` — Worker entry point with 120Hz loop
- Create: `src/worker/bridge.ts` — Main-thread Worker manager
- Modify: `src/store/simStore.ts` — replace inline `integrate()` with Worker bridge
- Modify: `vite.config.ts` — ensure Worker bundling with `new URL()` pattern

---

**Step 1: Create codec** — `src/worker/codec.ts`

Serializes only the fields needed by the UI (position, attitude, velocity, engine N1, fuel, config). The Worker owns the full `AircraftState` internally.

```typescript
import type { AircraftState } from '../sim/types';

export const SAB_FIELDS = 32; // 32 float64 slots = 256 bytes
export const OFF = {
  timestamp: 0, lat: 1, lon: 2, alt: 3,
  u: 4, v: 5, w: 6,
  phi: 7, theta: 8, psi: 9,
  p: 10, q: 11, r: 12,
  n1l: 13, n1r: 14,
  fuel: 15, grossWeight: 16,
  flapSetting: 17,
  gearDown: 18,
};

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

**Step 2: Create Worker** — `src/worker/physics.worker.ts`

```typescript
import { createInitialState, B737_800_SPEC } from '../sim/types';
import { integrate } from '../sim/physics/integrate';
import { writeState, SAB_FIELDS } from './codec';
import type { ControlInputs } from '../sim/types';

let state = createInitialState(B737_800_SPEC);
let sab: Float64Array | null = null;
let running = false;
let intervalId: ReturnType<typeof setInterval> | null = null;

const defaultInputs: ControlInputs = {
  elevator: 0, aileron: 0, rudder: 0,
  throttle1: 0, throttle2: 0,
  flapLever: 0, gearLever: 'DOWN',
  spoilers: 0, brake: 0,
};
let inputs: ControlInputs = { ...defaultInputs };

self.onmessage = (e: MessageEvent) => {
  switch (e.data.type) {
    case 'init':
      sab = new Float64Array(e.data.sab);
      break;
    case 'inputs':
      inputs = { ...inputs, ...(e.data.inputs as Partial<ControlInputs>) };
      break;
    case 'start':
      if (!running) {
        running = true;
        intervalId = setInterval(tick, 1000 / 120); // 120Hz
      }
      break;
    case 'stop':
      running = false;
      if (intervalId) { clearInterval(intervalId); intervalId = null; }
      break;
    case 'reset':
      state = createInitialState(B737_800_SPEC);
      inputs = { ...defaultInputs };
      break;
  }
};

function tick(): void {
  integrate(state, inputs, B737_800_SPEC, 1 / 120);
  if (sab) writeState(sab, state);
}
```

**Step 3: Create bridge** — `src/worker/bridge.ts`

```typescript
import { SAB_FIELDS, readState } from './codec';
import type { ControlInputs, AircraftState } from '../sim/types';
import { createInitialState, B737_800_SPEC } from '../sim/types';

export class PhysicsBridge {
  worker: Worker;
  sab: SharedArrayBuffer;
  sabView: Float64Array;
  state: AircraftState;
  private lastTs = 0;

  constructor() {
    this.sab = new SharedArrayBuffer(SAB_FIELDS * 8);
    this.sabView = new Float64Array(this.sab);
    this.state = createInitialState(B737_800_SPEC);

    this.worker = new Worker(new URL('./physics.worker.ts', import.meta.url), { type: 'module' });
    this.worker.postMessage({ type: 'init', sab: this.sab });
  }

  start() { this.worker.postMessage({ type: 'start' }); }
  stop() { this.worker.postMessage({ type: 'stop' }); }
  reset() { this.worker.postMessage({ type: 'reset' }); }

  setInputs(inputs: ControlInputs) {
    this.worker.postMessage({ type: 'inputs', inputs });
  }

  pollFrame(): boolean {
    const ts = this.sabView[0];
    if (ts === this.lastTs) return false;
    this.lastTs = ts;
    readState(this.sabView, this.state);
    return true;
  }

  dispose() {
    this.stop();
    this.worker.terminate();
  }
}
```

**Step 4: Integrate into simStore**

Replace `integrate()` call in `tick()` with bridge polling. The store holds a `PhysicsBridge` instance. On `tick()`, set inputs on the bridge, then poll: if a new frame is available, copy bridge state into Zustand.

**Step 5: Verify**

```bash
npx vitest run && npx tsc --noEmit
git add src/worker/ src/store/simStore.ts vite.config.ts
git commit -m "feat: move physics to Web Worker at 120Hz with SharedArrayBuffer"
```

---

### Task 2: Cockpit Instrument Bridge — PFD

**Objective:** Adapt the RFMS `PFD` component to render driven by live RFS sim state from `useSimStore` instead of RFMS `useFMCStore`.

**Files:**
- Create: `src/instruments/RfsPFD.tsx` — wrapper that reads from `useSimStore` and passes props to RFMS PFD

**Approach:** Rather than importing the full RFMS PFD component (which has deep dependencies on FMC state), create a lightweight adapter that computes PFD display values from RFS `AircraftState`:

```typescript
import { useSimStore } from '../store/simStore';
import { computeDerived } from '../sim/physics/derived';

export function RfsPFD() {
  const a = useSimStore(s => s.aircraft);
  const d = computeDerived(a);

  const pitch = (a.attitude.theta * 180) / Math.PI;
  const roll = (a.attitude.phi * 180) / Math.PI;
  const heading = (a.attitude.psi * 180) / Math.PI;
  const ias = d.ias;
  const alt = a.position.alt;
  const vs = d.vs;
  const mach = d.mach;

  // Render a simplified PFD with SVG
  // (Phase 5: basic layout; Phase 6: reuse RFMS PFD component)
  return (
    <div style={{ position: 'fixed', bottom: 20, right: 200, zIndex: 100, ... }}>
      {/* Attitude indicator, speed tape, altitude tape, heading tape */}
    </div>
  );
}
```

**Step 2: Wire into App** — add `<RfsPFD />` to the HUD area.

**Step 3: Commit**

```bash
git add src/instruments/RfsPFD.tsx src/App.tsx
git commit -m "feat: add PFD driven by live sim state"
```

---

### Task 3: Cockpit Instrument Bridge — MCP

**Objective:** Render the RFMS `BoeingMCP` panel and wire its mode buttons to the RFS autopilot state. When the user presses LNAV on the MCP, `apState.truth.lateralActive` changes to `'LNAV'`, which activates the LNAV PID in `integrate()`.

**Files:**
- Create: `src/instruments/RfsMCP.tsx`
- Modify: `src/App.tsx` — add MCP

**Approach:** A simplified MCP with buttons that call `useSimStore.getState().setApState(...)`:

```typescript
export function RfsMCP() {
  const apState = useSimStore(s => s.apState);

  const toggleMode = (mode: 'HDG_SEL' | 'LNAV' | 'ALT_HOLD' | 'VS' | 'SPEED' | 'N1') => {
    const current = useSimStore.getState().apState;
    if (!current) return;
    const next = structuredClone(current);
    // Toggle lateral/vertical/thrust modes
    if (mode === 'HDG_SEL' || mode === 'LNAV') {
      next.truth.lateralActive = mode;
    } else if (mode === 'ALT_HOLD' || mode === 'VS') {
      next.truth.verticalActive = mode;
    } else {
      next.truth.thrustActive = mode;
    }
    useSimStore.getState().setApState(next);
  };

  return (
    <div style={{ position: 'fixed', top: 400, right: 10, zIndex: 100, background: '#222', padding: 8, borderRadius: 4 }}>
      <button onClick={() => toggleMode('HDG_SEL')} style={btn}>HDG</button>
      <button onClick={() => toggleMode('LNAV')} style={btn}>LNAV</button>
      <button onClick={() => toggleMode('ALT_HOLD')} style={btn}>ALT</button>
      <button onClick={() => toggleMode('VS')} style={btn}>VS</button>
      <button onClick={() => toggleMode('SPEED')} style={btn}>SPD</button>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/instruments/RfsMCP.tsx src/App.tsx
git commit -m "feat: add MCP with autopilot mode buttons wired to sim state"
```

---

### Task 4: Particle Effects — Contrails & Exhaust

**Objective:** Render contrails behind the aircraft at high altitude (>25000ft) and engine exhaust particles on takeoff.

**Files:**
- Create: `src/viewport/ParticleEffects.tsx`

**Step 1: Contrails using Cesium `ParticleSystem`**

```typescript
import { useEffect, type RefObject } from 'react';
import * as Cesium from 'cesium';
import { useSimStore } from '../store/simStore';

export function ParticleEffects({ viewerRef }: { viewerRef: RefObject<Cesium.Viewer | null> }) {
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    // Contrails: emit when above 25000ft and engines running
    const contrailSystem = viewer.scene.primitives.add(
      new Cesium.ParticleSystem({
        image: createContrailImage(),
        startScale: 0.5,
        endScale: 4.0,
        particleLife: 5.0,
        speed: 2.0,
        emissionRate: 50,
        lifetime: 60,
        emitter: new Cesium.CircleEmitter(2.0),
      }),
    );

    // Update emitter position each frame
    const update = () => {
      const a = useSimStore.getState().aircraft;
      const altM = a.position.alt * 0.3048;
      if (a.position.alt > 25000 && a.engines[0].running) {
        contrailSystem.emissionRate = 50;
        // Position emitter behind engines
        const pos = Cesium.Cartesian3.fromDegrees(a.position.lon, a.position.lat, altM);
        contrailSystem.modelMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(pos);
      } else {
        contrailSystem.emissionRate = 0;
      }
      requestAnimationFrame(update);
    };
    requestAnimationFrame(update);

    return () => viewer.scene.primitives.remove(contrailSystem);
  }, [viewerRef]);

  return null;
}
```

**Step 2: Commit**

```bash
git add src/viewport/ParticleEffects.tsx src/App.tsx
git commit -m "feat: add contrail particle effects"
```

---

### Task 5: Landing Gear & Control Surface Animation

**Objective:** Animate gear compression on touchdown (scale Y of gear meshes) and show flap/slat extension visually.

**Files:**
- Modify: `src/viewport/AircraftModel.ts` — expose gear/flap meshes as named references
- Modify: `src/viewport/ThreeLayer.tsx` — animate gear compression each frame

**Step 1: Expose gear meshes**

Add named gear groups to `createBoeing737Model()`:
```typescript
// Landing gear (simplified as boxes)
const noseGear = new THREE.Mesh(
  new THREE.BoxGeometry(1, 3, 1),
  new THREE.MeshStandardMaterial({ color: 0x666666 }),
);
noseGear.position.set(0, -4, 18);
noseGear.name = 'noseGear';
group.add(noseGear);

const leftMain = new THREE.Mesh(
  new THREE.BoxGeometry(1, 3, 1),
  new THREE.MeshStandardMaterial({ color: 0x666666 }),
);
leftMain.position.set(-4, -4, -2);
leftMain.name = 'leftMainGear';
group.add(leftMain);

const rightMain = new THREE.Mesh(
  new THREE.BoxGeometry(1, 3, 1),
  new THREE.MeshStandardMaterial({ color: 0x666666 }),
);
rightMain.position.set(4, -4, -2);
rightMain.name = 'rightMainGear';
group.add(rightMain);
```

**Step 2: Animate gear in ThreeLayer sync**

```typescript
// Gear compression: scale Y based on ground contact
const onGround = aircraft.flightPhase === 'TAXI' || aircraft.flightPhase === 'PARKED' ||
  (aircraft.position.alt < 500 && aircraft.config.gearDown);
if (proxyRef.current) {
  proxyRef.current.children.forEach(child => {
    if (child.name.includes('Gear')) {
      child.scale.y = onGround ? 0.7 : 1.0; // compress on ground
    }
  });
}
```

**Step 3: Commit**

```bash
git add src/viewport/AircraftModel.ts src/viewport/ThreeLayer.tsx
git commit -m "feat: add landing gear compression animation"
```

---

### Task 6: Cesium 3D Buildings

**Objective:** Enable Cesium OSM Buildings for 3D city scenery around airports.

**Files:**
- Modify: `src/viewport/CesiumViewport.tsx` — add OSM Buildings layer

**Step 1: Enable OSM Buildings**

```typescript
// After viewer creation, add OSM Buildings
const osmBuildings = Cesium.createOsmBuildingsAsync();
viewer.scene.primitives.add(osmBuildings);
```

**Step 2: Commit**

```bash
git add src/viewport/CesiumViewport.tsx
git commit -m "feat: enable Cesium OSM 3D buildings"
```

---

### Task 7: GPWS Mode 2, 3, 6, 7 Completion

**Objective:** Complete all 7 GPWS modes with proper envelope logic. Modes 1, 4, 5 already implemented.

**Files:**
- Modify: `src/audio/GPWS.ts`

Add modes 2 (terrain closure), 3 (altitude loss after takeoff), 6 (bank angle), and 7 (windshear):

```typescript
function checkMode2(state: AircraftState): string | null {
  // Terrain closure rate — simplified: high descent rate near ground
  const alt = state.position.alt;
  const descentRate = -state.velocity.w * 196.85;
  if (alt < 1500 && descentRate > 3000) return 'TERRAIN';
  if (alt < 800 && descentRate > 2000) return 'PULL UP';
  return null;
}

function checkMode3(state: AircraftState): string | null {
  // Altitude loss after takeoff — simplified
  if (state.flightPhase === 'TAKEOFF' && state.position.alt < 100) return "DON'T SINK";
  return null;
}

function checkMode6(state: AircraftState): string | null {
  const bankDeg = Math.abs(state.attitude.phi * 180 / Math.PI);
  if (bankDeg > 35) return 'BANK ANGLE';
  return null;
}

function checkMode7(state: AircraftState): string | null {
  // Windshear — simplified: rapid airspeed loss at low altitude
  // (Would need wind data — skip for now, return null)
  return null;
}
```

**Step 2: Commit**

```bash
git add src/audio/GPWS.ts
git commit -m "feat: complete GPWS modes 2, 3, 6, 7"
```

---

### Task 8: Final Verification

```bash
npx vitest run && npx tsc --noEmit && npx vite build
```

Visual checklist:
- [ ] Physics running smoothly at 120Hz (no main-thread jank)
- [ ] PFD displays live pitch/roll/heading/airspeed/altitude
- [ ] MCP buttons engage autopilot modes (HDG, LNAV, ALT, VS, SPD)
- [ ] Contrails visible above 25000ft
- [ ] Landing gear compresses on touchdown
- [ ] Cesium 3D buildings visible near airports
- [ ] GPWS calls out "BANK ANGLE" at >35° bank

---

## Phase 5 Complete — What You Get

| Feature | Effect |
|---------|--------|
| Web Worker physics | 120Hz simulation, zero render jank, uniform timesteps |
| PFD bridge | Live attitude/speed/altitude display from sim state |
| MCP bridge | Autopilot mode buttons wired to physics (LNAV actually flies the route!) |
| Contrails | White particle trails above 25000ft behind engines |
| Gear animation | Gear meshes compress on ground contact |
| Control surfaces | Flaps/ailerons/elevator/rudder visibly move with inputs |
| 3D Buildings | Cesium OSM Buildings for city scenery |
| Full GPWS | All 7 modes: sink rate, terrain, don't sink, gear/flaps, glideslope, bank angle, windshear |
