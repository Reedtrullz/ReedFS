# RFS — Real Flight Simulator: Comprehensive Implementation Plan

> **For Hermes:** Use subagent-driven-development skill. This is a multi-phase plan — execute one phase at a time, task-by-task within each phase.

> **Status note (2026-05-25):** This is the original target architecture plan, not the current implementation record. The current implementation is documented in `../architecture.md`. In particular, physics currently still runs on the main thread; the worker/SharedArrayBuffer design below remains a future enhancement. The active stack is React 19 + Vite 8.

**Goal:** Build a professional-grade web-based flight simulator that combines the RFMS avionics suite (FMC/CDU, PFD, ND, MCP) with real-time 6-DOF physics, global 3D terrain, atmospheric rendering, aircraft systems, and immersive audio.

**Architecture:** CesiumJS globe + Three.js aircraft layer synchronized via `three-to-cesium`. Physics engine runs in a dedicated Web Worker at 120Hz with SharedArrayBuffer for zero-copy state transfer. Zustand stores bridge the worker state to React UI. RFMS `shared/` layer provides FMC logic, flight plan management, and autopilot types. Input layer abstracts keyboard, gamepad, and MSFS bridge into unified ControlInputs.

**Tech Stack:** React 18, TypeScript strict, Vite, Zustand, CesiumJS, Three.js, three-to-cesium, Web Workers, Web Audio API, Vitest, Playwright.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                    Main Thread (60fps)                       │
│                                                              │
│  ┌────────────────────┐  ┌──────────────────────────────┐   │
│  │   React UI Layer    │  │   3D Viewport                │   │
│  │   - CDU/MCDU panels │  │   ┌──────────┐ ┌──────────┐ │   │
│  │   - PFD/ND displays │  │   │ CesiumJS │ │ Three.js │ │   │
│  │   - MCP/FCU         │  │   │ (globe,  │ │(aircraft,│ │   │
│  │   - Telemetry HUD   │  │   │ terrain, │ │ effects, │ │   │
│  │   - Settings panel  │  │   │ imagery) │ │ sky)     │ │   │
│  └────────┬───────────┘  │   └──────────┘ └──────────┘ │   │
│           │              │        ↑ three-to-cesium ↑   │   │
│  ┌────────┴───────────┐  └──────────────────────────────┘   │
│  │   Zustand Store    │                                      │
│  │   (UI state +      │◄──── SharedArrayBuffer ────┐        │
│  │    derived views)  │                            │        │
│  └────────┬───────────┘                            │        │
│           │                                        │        │
│  ┌────────┴───────────┐              ┌─────────────┴──────┐ │
│  │   Input Manager    │              │   Audio Engine     │ │
│  │   - Keyboard       │              │   - Web Audio API  │ │
│  │   - Gamepad API    │              │   - Engine loops   │ │
│  │   - MSFS Bridge    │              │   - GPWS callouts  │ │
│  └────────┬───────────┘              │   - Switch clicks  │ │
│           │                          └────────────────────┘ │
└───────────┼──────────────────────────────────────────────────┘
            │ ControlInputs (via postMessage)
┌───────────┴──────────────────────────────────────────────────┐
│                Physics Worker (120Hz)                         │
│                                                              │
│  ┌────────────────────┐  ┌──────────────────────────────┐   │
│  │ 6-DOF Flight Model  │  │   Systems ECS                │   │
│  │ - Rigid body forces │  │   - EngineSystem            │   │
│  │ - Aerodynamic coeffs│  │   - FuelSystem              │   │
│  │ - Ground reactions  │  │   - ElectricalSystem        │   │
│  │ - Atmosphere model  │  │   - HydraulicSystem         │   │
│  │ - WGS84 geodesy     │  │   - AutopilotSystem         │   │
│  └────────────────────┘  │   - NavigationSystem         │   │
│                          └──────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │   SharedArrayBuffer ring buffer                       │   │
│  │   [timestamp | lat | lon | alt | pitch | roll | yaw  │   │
│  │    | tas | ias | vs | mach | n1[2] | egt[2] | ...]  │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

---

## Phase 0: Project Foundation & Tooling

### Task 0.1: Project Scaffold with Cesium

**Objective:** Create the full Vite + React + TypeScript project with CesiumJS, Three.js, and three-to-cesium.

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`
- Create: `.env` (Cesium Ion token placeholder)
- Modify: `vite.config.ts` — Cesium static assets + WASM support

**Key decisions:**
- Cesium Ion token: free tier provides Bing Maps imagery + Cesium World Terrain
- `vite-plugin-cesium` or manual copy of Cesium assets to `public/`
- Three.js via npm, `three-to-cesium` via npm
- RFMS shared/ via `file:../RFMS/shared` dependency

**Step 1: Initialize project**

```bash
cd /Users/reidar/Projectos/RFS
npm create vite@latest . -- --template react-ts
npm install cesium three three-to-cesium zustand
npm install -D @types/three vite-plugin-cesium vitest jsdom prettier
npm install --save file:../RFMS/shared  # @virtual-cdu/shared
```

**Step 2: Configure Vite for Cesium**

```typescript
// vite.config.ts
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
  build: {
    target: 'esnext', // for SharedArrayBuffer + WASM
  },
});
```

**Step 3: Configure Cesium Ion token**

Create `src/config/cesium.ts`:
```typescript
import { Ion } from 'cesium';

// Free Cesium Ion token — sign up at https://ion.cesium.com
// This token provides access to Cesium World Terrain + Bing Maps imagery
export function initCesium(token: string) {
  Ion.defaultAccessToken = token;
}
```

**Step 4: Verify**

```bash
npm run dev    # should start, Cesium globe renders
npm run build  # should bundle Cesium assets correctly
```

---

### Task 0.2: Directory Structure & Barrel Exports

```
RFS/
├── src/
│   ├── config/           # Cesium init, constants, feature flags
│   │   └── cesium.ts
│   ├── sim/              # Simulation core
│   │   ├── types.ts      # AircraftState, ControlInputs, AircraftSpec
│   │   ├── physics/      # Flight model
│   │   │   ├── atmosphere.ts
│   │   │   ├── forces.ts
│   │   │   ├── integrate.ts
│   │   │   ├── geodesy.ts    # WGS84 conversions
│   │   │   └── worker.ts     # Web Worker entry point
│   │   ├── systems/      # ECS aircraft systems
│   │   │   ├── engine.ts
│   │   │   ├── fuel.ts
│   │   │   ├── electrical.ts
│   │   │   ├── hydraulic.ts
│   │   │   ├── autopilot.ts  # Drives physics from MCP state
│   │   │   └── navigation.ts # FMC route following
│   │   └── data/          # Aircraft specs, engine tables
│   │       └── b738.ts    # Boeing 737-800 full spec
│   ├── worker/           # Web Worker bridge
│   │   ├── bridge.ts     # Worker spawn, postMessage, SAB setup
│   │   └── codec.ts      # Float64Array ↔ AircraftState serialization
│   ├── store/            # Zustand stores
│   │   ├── simStore.ts   # Aircraft state (reads from SAB)
│   │   ├── controlStore.ts # Control inputs
│   │   ├── viewStore.ts  # Camera, view mode, zoom
│   │   └── settingsStore.ts # Persisted settings
│   ├── viewport/         # 3D rendering
│   │   ├── CesiumViewport.tsx   # Cesium globe container
│   │   ├── ThreeLayer.tsx       # Three.js overlay via three-to-cesium
│   │   ├── AircraftModel.ts     # 3D aircraft mesh + animations
│   │   ├── Atmosphere.ts        # Sky, clouds, fog
│   │   ├── AirportLayer.ts      # Runway/taxiway visualization
│   │   └── Effects.ts           # Engine trails, contrails, lights
│   ├── input/            # Input abstraction
│   │   ├── InputManager.ts      # Aggregates all input sources
│   │   ├── KeyboardBindings.ts  # Default keymap
│   │   ├── GamepadManager.ts    # Gamepad API
│   │   └── MSFSBridge.ts        # MSFS WebSocket input (future)
│   ├── audio/            # Sound engine
│   │   ├── AudioEngine.ts       # Web Audio API manager
│   │   ├── EngineSound.ts       # N1-driven loops
│   │   ├── CockpitSound.ts      # Switches, alerts, GPWS
│   │   └── EnvironmentSound.ts  # Wind, gear, flaps
│   ├── instruments/      # Cockpit instruments (from RFMS adapted)
│   │   ├── PFD.tsx       # Primary Flight Display
│   │   ├── ND.tsx        # Navigation Display
│   │   ├── MCP.tsx       # Mode Control Panel
│   │   └── CDU.tsx       # FMC interface
│   ├── hooks/
│   │   ├── useSimBridge.ts  # SAB → Zustand sync
│   │   ├── useInput.ts      # Input → ControlInputs
│   │   └── useFrameLoop.ts  # RAF orchestrator
│   ├── App.tsx
│   └── main.tsx
├── public/
│   ├── models/           # 3D aircraft models (glTF)
│   └── sounds/           # Audio samples
├── docs/
│   └── plans/
└── scripts/              # Build/generate scripts
```

---

## Phase 1: Physics Engine & Worker Architecture

### Task 1.1: WGS84 Geodesy Module

**Why:** Converting between lat/lon/alt and local ENU (East-North-Up) coordinates is fundamental. CesiumJS uses ECEF (Earth-Centered Earth-Fixed) internally; our physics model uses ENU relative to a reference point.

**Implement:**
- `src/sim/physics/geodesy.ts`
- WGS84 constants: `a = 6378137.0` (semi-major axis), `f = 1/298.257223563` (flattening), `e² = f*(2-f)`
- `geodeticToEcef(lat, lon, alt)` → `[x, y, z]` meters
- `ecefToGeodetic(x, y, z)` → `{lat, lon, alt}`
- `ecefToEnu(ecef, refEcef, refLat, refLon)` → local East-North-Up
- `enuToEcef(enu, refEcef, refLat, refLon)` → back to ECEF
- `enuToGeodetic(enu, refLat, refLon, refAlt)` → direct conversion

**Tests:** Verify round-trip accuracy to within 1cm at various altitudes and latitudes.

---

### Task 1.2: ISA Atmosphere Model (Production Grade)

**Why:** Accurate atmosphere is critical for engine performance, aerodynamic forces, and altimetry.

**Implement:**
- Full ISA 1976 model: troposphere (0-11km), tropopause (11-20km), stratosphere layers (20-32km, 32-47km)
- Functions:
  - `temperature(altM)` → Kelvin
  - `pressure(altM)` → Pascals
  - `density(altM)` → kg/m³
  - `speedOfSound(altM)` → m/s
  - `dynamicViscosity(altM)` → kg/(m·s) (Sutherland's formula)
  - `kinematicViscosity(altM)` → m²/s
- Non-ISA support: temperature offset, pressure offset → density altitude
- `pressureAltitude(actualAlt, qnh)` → feet
- `densityAltitude(pressureAlt, temperature)` → feet

**Tests:** Verify against published ISA tables at 0, 5000, 10000, 18000, 30000, 36000, 45000 ft.

---

### Task 1.3: Aerodynamic Model — Full 6-DOF

**Why:** Point-mass is insufficient for realistic flight. A 6-DOF model captures the full rigid-body dynamics.

**State vector (13 components):**
```
Position:  lat, lon, alt (geodetic)
Velocity:  u, v, w (body-frame, m/s)
Attitude:  φ (roll), θ (pitch), ψ (yaw) — Euler angles
Angular velocity: p, q, r (body-frame, rad/s)
```

**Forces (body-frame):**
```
F_x = T_x + D_x + L_x + W_x    (axial: thrust - drag + gravity component)
F_y = T_y + D_y + L_y + W_y    (side force)
F_z = T_z + D_z + L_z + W_z    (normal force)
```

**Moments (body-frame):**
```
M_roll  = L (rolling moment)
M_pitch = M (pitching moment)
M_yaw   = N (yawing moment)
```

**Aerodynamic coefficients (function of α, β, Mach, Re, configuration):**
- `C_L(α, β, M, flaps, gear)` — lift coefficient
- `C_D(α, β, M, flaps, gear)` — drag coefficient (parasitic + induced)
- `C_Y(α, β, M)` — side force coefficient
- `C_l(α, β, M, p_hat, r_hat, δ_a, δ_r)` — rolling moment
- `C_m(α, β, M, q_hat, δ_e, flaps)` — pitching moment
- `C_n(α, β, M, p_hat, r_hat, δ_a, δ_r)` — yawing moment

**Stability derivatives (Boeing 737-800 approximation):**
- Use DATCOM-type empirical formulas for initial values
- Plan for JSON-based coefficient table loading (enables swapping aircraft)

**Ground effect:**
- Lift enhancement: ΔC_L = f(altitude/wingspan) * C_L_ground
- Drag reduction near ground
- Pitching moment change in ground effect

**Gear model:**
- Gear drag when extended
- Ground contact forces (normal + friction via spring-damper at each contact point)
- Tire friction model (rolling + braking)

**Tests:**
- Trim at multiple flight conditions (cruise, climb, approach)
- Phugoid and short-period modes exhibit correct stability
- Ground roll acceleration matches 737-800 performance data
- Coordinated turn: roll → yaw rate matches g*tan(φ)/V

---

### Task 1.4: Web Worker Physics Loop

**Why:** Physics at 120Hz would cause jank on the main thread alongside React + Cesium + Three.js rendering.

**Architecture:**
```
Main Thread                    Physics Worker
    │                               │
    │── spawn Worker ──────────────→│
    │                               │
    │── ControlInputs ─────────────→│ (postMessage, ~60Hz)
    │                               │
    │                               │  loop (120Hz):
    │                               │    integrate(dt=1/120)
    │                               │    write state to SAB
    │                               │
    │←── SAB poll (RAF, 60Hz) ─────│
    │    read state from SAB         │
    │    update Zustand              │
    │    render frame                │
```

**SharedArrayBuffer layout:**
```
Byte 0-7:    timestamp (float64) — worker frame time
Byte 8-15:   lat (float64)
Byte 16-23:  lon (float64)
Byte 24-31:  alt (float64)
Byte 32-39:  pitch (float64)
Byte 40-47:  roll (float64)
Byte 48-55:  yaw (float64)
Byte 56-63:  tas (float64)
... (expand to ~256 bytes for full state)
```

**Worker entry point:** `src/sim/physics/worker.ts`
- Receives `init` message with aircraft spec + initial state
- Receives `input` messages with ControlInputs
- Runs `setInterval` at 120Hz (or uses `Atomics.wait` for precise timing)
- Writes frame to SAB, posts frame counter back to main thread

**SAB requirement:** Needs `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` headers. Configure in `vite.config.ts` dev server.

**Tests:** Integration test verifying worker produces consistent state updates at ~120Hz.

---

### Task 1.5: Zustand SimStore with SAB Bridge

**The bridge (`src/hooks/useSimBridge.ts`):**
- Reads from SAB on each RAF tick
- Deserializes Float64Array → `AircraftState` (via codec)
- Batches Zustand updates (one `setState` per frame, not per field)
- Posts ControlInputs to worker via `postMessage` when they change

**`src/store/simStore.ts`:**
```typescript
interface SimStore {
  // Latest aircraft state snapshot (read from SAB)
  aircraft: AircraftState;

  // Derived values (computed in selector, not stored)
  // e.g., isAirborne, flightPhase, energyState

  // Worker lifecycle
  workerStatus: 'uninitialized' | 'starting' | 'running' | 'error';
  startWorker: () => void;
  stopWorker: () => void;
}
```

---

## Phase 2: Aircraft Systems (ECS Architecture)

### Design Principle: Entity-Component-System

Each system is a pure function: `(state: AircraftState, inputs: ControlInputs, dt: number, spec: AircraftSpec) => Partial<AircraftState>`

Systems run in order within the physics tick:
1. Atmosphere → environment pressure/density/temp
2. Input → control surface positions (with actuator rates)
3. Engine → thrust, fuel flow, N1/N2/EGT
4. Fuel → tank balance, CG shift
5. Aerodynamics → forces + moments from current state
6. GroundContact → gear forces (if on ground)
7. Integrate → advance state vector
8. Electrical → bus voltages, battery drain
9. Hydraulic → pressure, system availability
10. Autopilot → servo commands overwriting control inputs
11. Navigation → position along flight plan

### Task 2.1: Engine System

**Model:** High-bypass turbofan, N1/N2 spool dynamics.

**Inputs:** Throttle lever position (0-1), altitude, Mach, bleed air demand, anti-ice state.

**State:** N1, N2, EGT, fuel flow, oil pressure, oil temp, vib N1/N2.

**Spool dynamics:** First-order lag for each spool with time constant varying by power setting:
- N1 TC: ~1.5s idle→TOGA, ~3s TOGA→idle (spool-down slower than spool-up)
- N2 TC: ~0.8s idle→TOGA

**Thrust model:** Referenced to sea-level static thrust, multiplied by:
- Density ratio ^ 0.7 (altitude)
- Ram recovery factor (Mach) 
- N1 correction factor (N1^2 relationship)
- Bleed air penalty

**EGT model:** Function of N2, fuel flow, altitude. Redline at 950°C.

**Fuel flow:** SFC varies with altitude and power setting. ~0.35-0.60 lb/lbf/hr.

**Start sequence:** N2 spool-up with starter, light-off at ~20% N2, EGT rise, idle stabilization at ~60% N2.

**Tests:** Validate thrust vs N1 curve, fuel flow vs thrust, EGT margin at MCT/MTO.

### Task 2.2: Fuel System

**Tank configuration (737-800):**
- Main tank 1 (left wing): 3,915 kg
- Main tank 2 (right wing): 3,915 kg
- Center tank: 13,066 kg
- Total: 20,896 kg

**Dynamics:**
- Fuel burn from center tank first (if fuel present), then wings
- Cross-feed logic
- Fuel pumps: 2 per main tank, 2 center tank
- Fuel temperature

**CG shift:** Track fuel mass distribution → CG position (% MAC). Center tank forward, wing tanks aft.

### Task 2.3: Electrical System

**Simplified for Phase 2:**
- Two engine-driven generators (IDG), 115VAC 400Hz
- APU generator
- Battery (28VDC)
- Transfer bus, DC bus, battery bus
- Load shed logic

### Task 2.4: Hydraulic System

**737-800:**
- System A: Left engine pump + electric pump
- System B: Right engine pump + electric pump
- Standby system: electric pump
- Pressure: 3000 psi nominal
- Services: flight controls, landing gear, nose wheel steering, thrust reversers, autopilot servos

### Task 2.5: Autopilot — Physics Bridge

**This is the critical link between RFMS avionics and RFS physics.**

The autopilot system reads `AutopilotState` (from RFMS shared/ types) and translates lateral/vertical/thrust modes into `ControlInputs` that drive the physics model.

**Autopilot servos:**
- **Roll channel:** PID controller on heading/bank angle → aileron deflection
  - HDG_SEL: target heading → bank angle cmd → roll PID → aileron
  - LNAV: cross-track error + track angle error → bank angle cmd → aileron
  - VOR_LOC: CDI deflection → bank angle cmd → aileron
  - APP: localizer + glideslope coupled

- **Pitch channel:** PID controller on pitch/altitude → elevator deflection
  - ALT_HOLD: altitude error → pitch cmd → pitch PID → elevator
  - VS: vertical speed error → pitch cmd → elevator
  - LVL_CHG: pitch to hold speed (fixed throttle)
  - VNAV: FMC-computed vertical path

- **Thrust channel:** 
  - SPEED: PID on airspeed error → throttle position
  - N1: direct N1 target → throttle position
  - THR_CLB/MCT/MTO: fixed throttle positions

- **Pitch limits:** ±25°, roll limits: ±30°
- **Actuator rates:** realistic servo rates (aileron ~30°/s, elevator ~20°/s, stabilizer trim ~0.2°/s)

**Key insight:** When RFS controls the aircraft (not MSFS), the autopilot IS the bridge between the FMC's commands and the physics. This was previously done by MSFS. Now RFS does it natively.

### Task 2.6: Navigation System — FMC Route Following

**LNAV implementation:**
- Given current position + active flight plan waypoints (from RFMS `FlightPlan`)
- Compute: cross-track error, along-track distance to active waypoint, track angle error
- Waypoint sequencing: automatic when within capture radius
- Turn anticipation: lead-in based on speed and turn angle
- Discontinuity handling: wings-level hold at discontinuity

**VNAV implementation:**
- Compute required vertical path: altitude constraints at waypoints
- Target vertical speed = (Δaltitude / Δdistance) * groundspeed
- Geometric descent path (3° = 318 ft/NM = 5.24% gradient)
- Speed/altitude restrictions enforcement

---

## Phase 3: 3D World & Rendering

### Task 3.1: CesiumJS Globe Foundation

**Cesium Viewer configuration:**
```typescript
const viewer = new Cesium.Viewer('cesiumContainer', {
  useDefaultRenderLoop: false,  // We control the render loop
  targetFrameRate: 60,
  sceneMode: Cesium.SceneMode.SCENE3D,
  terrain: Cesium.Terrain.fromWorldTerrain(), // Cesium World Terrain
  imageryProvider: Cesium.IonWorldImageryStyleMap(), // or Bing Maps
  // No UI widgets — we build our own
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
});
```

**Camera modes:**
- Chase cam: fixed offset behind aircraft in aircraft frame
- Cockpit cam: positioned at pilot eye point
- External free cam: mouse orbit around aircraft
- Tower/spot: fixed ground position tracking aircraft
- Fly-by: camera on spline path

### Task 3.2: Three.js Integration via three-to-cesium

**Setup:**
```typescript
const ttc = ThreeToCesium(viewer, {
  cameraFar: 10000000, // 10,000 km for satellite view
  cameraNear: 0.1,
});

// TTC provides: ttc.threeScene, ttc.threeCamera, ttc.threeRenderer
```

**Aircraft model placement:**
```typescript
// Every frame, update aircraft position
const position = Cesium.Cartesian3.fromDegrees(
  state.position.lon, state.position.lat, state.position.alt * 0.3048
);

// TTC handles the ENU→ECEF conversion internally
aircraftGroup.position.copy(/* ... */);
aircraftGroup.quaternion.copy(/* from pitch/roll/yaw */);

// Sync in the Cesium postRender
viewer.scene.postRender.addEventListener(() => {
  ttc.update(); // syncs cameras + renders Three.js layer
});
```

### Task 3.3: Aircraft 3D Model & Animations

**Phase 3 minimum:** Low-poly 737-800 model (glTF) with:
- Control surface animations (ailerons, elevator, rudder, flaps, slats, spoilers, gear)
- Landing gear compression on ground
- Engine fan rotation (N1-speed driven)
- Navigation lights (red/green/white strobes)
- Landing/taxi lights

**Model source options:**
- Free: sketchfab.com low-poly 737 models (need attribution)
- Procedural: generate basic shape from Three.js primitives
- Purchase: turbosquid/cgtrader commercial model

### Task 3.4: Atmospheric Rendering

**Sky:**
- Rayleigh scattering (sky color gradient based on sun position)
- Mie scattering (haze near horizon)
- Sun disc rendering
- Dynamic time-of-day transitions

**Approach:** Implement as a full-screen post-processing pass or use Cesium's built-in atmosphere (which uses the same physics). Cesium's atmosphere is already good — start there, customize later.

### Task 3.5: Cloud & Weather Visualization

**Phase 3: METAR-driven basic weather**
- Fetch METAR for nearest airport
- Cloud layers: scattered/broken/overcast at reported altitudes
- Visibility reduction for fog/mist
- Precipitation effects (rain particle system)

**Phase 4+: Volumetric clouds** (expensive, defer)

### Task 3.6: Airport & Scenery Layer

**Using RFMS navdata:**
- Render airports from navdata: runways (rectangles with markings), taxiways, aprons
- Runway threshold coordinates from navdata → Cesium Cartographic positions
- Elevation from Cesium terrain sampling
- Basic terminal buildings as extruded OSM data
- PAPI/VASI approach lighting

---

## Phase 4: Input System

### Task 4.1: Abstract Input Pipeline

```
Physical Input          InputManager        ControlInputs
─────────────────      ────────────────      ──────────────
Keyboard events    →    KeyboardBindings  →  elevator: -1..1
Gamepad state      →    GamepadManager    →  aileron:  -1..1
MSFS bridge        →    MSFSBridge        →  rudder:    -1..1
Touch (future)     →    TouchManager      →  throttle1: 0..1
                                            throttle2: 0..1
                                            flapLever:  0..40
                                            gearLever:  UP/DOWN
                                            spoilers:   0..1
                                            brake:      0..1
```

**Design:**
- Each input source produces a partial `ControlInputs`
- `InputManager.merge()` combines them with priority (MSFS > Gamepad > Keyboard)
- Dead zones, sensitivity curves, and axis inversion are configurable
- Default keyboard bindings based on MSFS standard

### Task 4.2: Gamepad Support

- Gamepad API polling (not events — must poll `navigator.getGamepads()`)
- Standard Xbox/PlayStation mapping
- Left stick: pitch/roll, right stick: camera look
- Triggers: rudder (LT/RT differential)
- Bumpers: throttle increment/decrement
- Face buttons: gear toggle, flaps up/down, spoilers, brake

### Task 4.3: MSFS Bridge (Bidirectional)

**Extend the existing RFMS MSFS bridge to also SEND control inputs:**

Currently RFMS reads from MSFS. RFS adds the WRITE direction:
- WebSocket sends `controlInput` messages to the MSFS bridge server
- Server translates to SimConnect events (AXIS_ELEVATOR_SET, THROTTLE_SET, etc.)
- This allows RFMS instruments + RFS viewport with MSFS as the physics engine

**Dual mode:**
1. **Standalone:** RFS physics worker drives everything
2. **MSFS-bridge:** MSFS is the physics engine, RFS renders the viewport, RFMS provides instruments

---

## Phase 5: Audio System

### Task 5.1: Audio Engine Foundation

**Web Audio API architecture:**
```
AudioContext
├── Master Gain
│   ├── Engine Bus
│   │   ├── Engine 1 Loop (N1-pitch-shifted loop)
│   │   └── Engine 2 Loop
│   ├── Cockpit Bus
│   │   ├── GPWS Callouts (pull-up, terrain, windshear, etc.)
│   │   ├── Altitude Alerts
│   │   ├── Switch Clicks
│   │   └── Autopilot Disconnect
│   └── Environment Bus
│       ├── Wind Noise (speed-dependent)
│       ├── Gear/Flap Mechanical
│       ├── Ground Roll
│       └── Rain/Hail
```

### Task 5.2: Engine Sound Generation

**Approach:** Load a base engine loop sample. Pitch-shift in real-time using playbackRate based on N1%.

**N1 → pitch mapping:** playbackRate = 0.4 + N1% * 0.6 (idle = 0.4x, TOGA = 1.0x speed)

**Dual engines:** Two independent playback nodes with slightly different pitch (±2% detune) for natural beating.

**Volume:** N1-based curve + distance attenuation (camera position relative to aircraft).

### Task 5.3: GPWS Callouts

**Implement all 7 modes:**
1. Excessive descent rate ("SINK RATE", "PULL UP")
2. Excessive terrain closure ("TERRAIN", "PULL UP")  
3. Altitude loss after takeoff ("DON'T SINK")
4. Unsafe terrain clearance ("TOO LOW TERRAIN", "TOO LOW FLAPS", "TOO LOW GEAR")
5. Below glideslope ("GLIDESLOPE")
6. Bank angle ("BANK ANGLE")
7. Windshear ("WINDSHEAR")

**Trigger logic:** Run in physics worker, post GPWS alert events to main thread audio.

---

## Phase 6: Cockpit Instruments Integration

### Task 6.1: PFD (Primary Flight Display)

**Adapt from RFMS ND components, driven by live physics state:**

- Attitude indicator (pitch ladder + roll pointer + slip/skid ball)
- Airspeed tape with trend vector
- Altitude tape with trend vector  
- Vertical speed indicator
- Heading tape with track indicator
- Flight Mode Annunciator (FMA) — lateral/vertical/thrust modes
- Radio altitude (below 2500 ft)
- Decision height bug

### Task 6.2: ND (Navigation Display)

**Adapt from RFMS ND — already has:**
- MAP/PLAN/APP/VOR modes
- Waypoint/airport/navaid symbology
- Route line rendering
- Range selection (10-640 NM)

**Add:**
- Terrain rendering (from Cesium height sampling)
- Weather radar simulation
- TCAS traffic display
- Own-aircraft symbol with track vector

### Task 6.3: MCP (Mode Control Panel)

**Adapt from RFMS `BoeingMCP` — already has full state:**
- Course knobs, speed/mach, heading, altitude, vertical speed
- Mode buttons: LNAV, VNAV, LVL CHG, HDG SEL, VOR LOC, APP, ALT HOLD, VS, N1, SPEED
- CMD A/B, CWS A/B
- Autothrottle ARM

**Wiring:** MCP state changes → `AutopilotState` → physics worker autopilot system → `ControlInputs`

---

## Phase 7: Scenarios & Content

### Task 7.1: Flight Scenarios

- **Free flight:** Spawn at any airport, fly anywhere
- **Circuit training:** Repeat touch-and-go with scoring
- **Route flying:** FMC-programmed IFR routes, graded on path following
- **Emergency procedures:** Engine failure, hydraulic loss, electrical failure
- **Approach challenges:** Crosswind landings, low visibility, single-engine approaches

### Task 7.2: Multiplayer (Future Architecture)

**Sketch only — not implemented in Phase 1-6:**
- WebRTC data channel for aircraft state exchange
- Cesium `Entity` API for other aircraft visualization
- Simple chat/ATC text channel

---

## Development Phases Summary

| Phase | Name | Estimated Effort | Core Deliverable |
|-------|------|-----------------|------------------|
| 0 | Foundation | 2-3 days | Project scaffold, Cesium+Three.js rendering, directory structure |
| 1 | Physics Engine | 5-7 days | 6-DOF model, Web Worker, SAB bridge, Zustand store |
| 2 | Aircraft Systems | 4-6 days | ECS systems: engines, fuel, electrics, hydraulics, autopilot, navigation |
| 3 | 3D World | 5-8 days | Cesium globe, aircraft model, atmosphere, weather, airports |
| 4 | Input System | 2-3 days | Keyboard, gamepad, MSFS bridge |
| 5 | Audio System | 2-3 days | Engine sounds, GPWS, cockpit environment |
| 6 | Cockpit Integration | 3-5 days | PFD, ND, MCP driven by physics, FMC route following |
| 7 | Scenarios | 3-5 days | Training scenarios, emergencies, content pipeline |

**Total: ~26-40 days of focused development**

---

## Current execution guidance

This document is retained as the original long-range concept plan. Do not restart Phase 0 from here. For current work:

1. Use `../architecture.md` to understand the implementation that exists now.
2. Use `../physics-invariants.md` before touching flight-model code.
3. Use `../roadmap.md` to choose the next enhancement phase.
4. Write a focused plan in `docs/plans/` before implementing large migrations.
