# Phase 6: Scenery, Content & Final Polish — Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Complete the flight sim experience: Web Worker physics for buttery-smooth 120Hz simulation, contrail particle effects, time-of-day progression during flight, multi-airport spawning with navdata, SimBrief flight plan loading with live LNAV/VNAV following, Cesium scene enhancements (terrain exaggeration, water), smooth camera transitions, and a proper speed/altitude tape PFD.

**Architecture:** Physics moves to a Worker with `SharedArrayBuffer` — the last major architectural piece. Contrail particles use Cesium `ParticleSystem`. Time-of-day increments in the physics tick and drives sun position dynamically. Airport data loads from RFMS `NAV_FIXES` with runway geometry. Flight plans parse SimBrief XML/JSON into `FlightPlan` type, stored in simStore, fed to LNAV/VNAV. Camera interpolates between modes over 1 second. PFD renders tapes using SVG.

**Tech Stack:** Same — React 18, TypeScript strict, Vite, Zustand, CesiumJS, Three.js, Web Workers, RFMS navdata.

---

### Task 1: Live Time-of-Day Progression

**Objective:** Increment `timeOfDay` in the physics tick so the sun moves across the sky during flight. Currently hardcoded to noon (12).

**Files:**
- Modify: `src/sim/types.ts` — add `timeOfDay` to state if not present
- Modify: `src/sim/physics/integrate.ts` — increment timeOfDay each tick
- Modify: `src/viewport/ThreeLayer.tsx` — use live timeOfDay instead of hardcoded 12

**Step 1: Add `timeOfDay` to integrate**

In `integrate()`, add after the clock line:
```typescript
  // ── Time of day (1 hour = 30 real seconds at 1x sim rate) ──
  state.timeOfDay = (state.timeOfDay + dt / 30) % 24;
```

**Step 2: Use live timeOfDay in ThreeLayer**

In the sync callback, change:
```typescript
const sun = computeSunPosition(lat, lon, 12); // noon default
```
to:
```typescript
const sun = computeSunPosition(lat, lon, aircraft.timeOfDay ?? 12);
```

**Step 3: Add `timeOfDay` to `createInitialState` if missing**

```typescript
timeOfDay: 12, // noon start
```

**Step 4: Add `timeOfDay` to the SAB codec** (for future Worker)

**Step 5: Verify and commit**

```bash
npx vitest run && npx tsc --noEmit
git add src/sim/ src/viewport/ThreeLayer.tsx
git commit -m "feat: live time-of-day progression during flight"
```

---

### Task 2: Contrail Particle Effects

**Objective:** Render white particle trails behind engines above 25,000ft. Uses Cesium `ParticleSystem` with procedural circle image.

**Files:**
- Create: `src/viewport/ContrailLayer.tsx`
- Modify: `src/App.tsx` — add component

**Step 1: Create `src/viewport/ContrailLayer.tsx`**

```typescript
import { useEffect, type RefObject } from 'react';
import * as Cesium from 'cesium';
import { useSimStore } from '../store/simStore';

export function ContrailLayer({ viewerRef }: { viewerRef: RefObject<Cesium.Viewer | null> }) {
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    const image = createContrailImage();
    const system = viewer.scene.primitives.add(
      new Cesium.ParticleSystem({
        image,
        startScale: 0.3,
        endScale: 3.0,
        particleLife: 8.0,
        speed: 5.0,
        emissionRate: 0,
        lifetime: 120,
        emitter: new Cesium.CircleEmitter(1.5),
        updateCallback: (_particle, dt) => {
          // Particles fade over lifetime
        },
      }),
    );

    let raf: number;
    const update = () => {
      const a = useSimStore.getState().aircraft;
      const altM = a.position.alt * 0.3048;
      if (a.position.alt > 25000 && a.engines[0].running) {
        system.emissionRate = 80;
        const pos = Cesium.Cartesian3.fromDegrees(a.position.lon, a.position.lat, altM - 5);
        system.modelMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(pos);
      } else {
        system.emissionRate = 0;
      }
      raf = requestAnimationFrame(update);
    };
    raf = requestAnimationFrame(update);

    return () => {
      cancelAnimationFrame(raf);
      viewer.scene.primitives.remove(system);
    };
  }, [viewerRef]);

  return null;
}

function createContrailImage(): HTMLCanvasElement {
  const s = 64;
  const c = document.createElement('canvas');
  c.width = s; c.height = s;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.6)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.2)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  return c;
}
```

**Step 2: Wire into App**

Add import and `<ContrailLayer viewerRef={viewerRef} />` after CloudLayer.

**Step 3: Commit**

```bash
git add src/viewport/ContrailLayer.tsx src/App.tsx
git commit -m "feat: add contrail particles above FL250"
```

---

### Task 3: Multi-Airport Spawning

**Objective:** Load airport data from RFMS `NAV_FIXES` and allow spawning at different airports. Add a dropdown or keyboard shortcut to cycle airports.

**Files:**
- Modify: `src/viewport/AirportLayer.tsx` — load runways from navdata
- Modify: `src/store/simStore.ts` — add `setAirport()` action
- Modify: `src/App.tsx` — add airport selector UI

**Step 1: Load airports from RFMS navdata**

```typescript
import { NAV_FIXES } from '@shared/navdata/navdataStore';

function getAirports(): string[] {
  return Object.keys(NAV_FIXES).filter(k => NAV_FIXES[k].type === 'AIRPORT');
}

function getAirportPosition(icao: string): { lat: number; lon: number; elev: number } | null {
  const fix = NAV_FIXES[icao];
  if (!fix || fix.type !== 'AIRPORT') return null;
  return { lat: fix.lat!, lon: fix.lon!, elev: fix.elevationFt ?? 0 };
}
```

**Step 2: Add `setAirport` to simStore**

```typescript
setAirport: (icao: string) => {
  const pos = getAirportPosition(icao);
  if (!pos) return;
  set(s => ({
    aircraft: {
      ...s.aircraft,
      position: { lat: pos.lat, lon: pos.lon, alt: pos.elev },
    },
  }));
},
```

**Step 3: Add airport selector UI**

```tsx
const [airports] = useState(() => getAirports());
// In JSX: dropdown that calls useSimStore.getState().setAirport(value)
```

**Step 4: Commit**

```bash
git add src/viewport/AirportLayer.tsx src/store/simStore.ts src/App.tsx
git commit -m "feat: multi-airport spawning from RFMS navdata"
```

---

### Task 4: SimBrief Flight Plan Loading

**Objective:** Parse a SimBrief flight plan (JSON format) into RFMS `FlightPlan` type, store in simStore, and have LNAV/VNAV follow it automatically.

**Files:**
- Create: `src/sim/flightPlanLoader.ts`
- Create: `src/sim/__tests__/flightPlanLoader.test.ts`
- Modify: `src/App.tsx` — add "Load Plan" button

**Step 1: Create flight plan loader** — `src/sim/flightPlanLoader.ts`

```typescript
import type { FlightPlan, FlightPlanWaypoint } from '@shared/types/fmc';

export function parseSimBriefJSON(json: any): FlightPlan | null {
  try {
    const origin = json.origin?.icao_code ?? '';
    const dest = json.destination?.icao_code ?? '';
    const route = json.general?.route ?? '';

    // Parse navlog waypoints
    const navlog = json.navlog?.fix ?? [];
    const waypoints: FlightPlanWaypoint[] = navlog.map((fix: any) => ({
      ident: fix.ident ?? '',
      lat: fix.pos_lat ? parseFloat(fix.pos_lat) : undefined,
      lon: fix.pos_long ? parseFloat(fix.pos_long) : undefined,
      discontinuity: false,
      airway: fix.airway ?? undefined,
    }));

    return {
      origin,
      destination: dest,
      flightNumber: json.general?.callsign ?? '',
      route,
      waypoints,
    };
  } catch {
    return null;
  }
}

/** Create a simple flight plan from origin/destination ICAO codes */
export function createDirectFlight(origin: string, destination: string): FlightPlan {
  return {
    origin,
    destination,
    flightNumber: '',
    route: `${origin} ${destination}`,
    waypoints: [
      { ident: origin, discontinuity: false },
      { ident: destination, discontinuity: false },
    ],
  };
}
```

**Step 2: Add "LOAD PLAN" to App**

A text input or fetch from a SimBrief URL. For Phase 6, hardcode a KSEA→KPDX route:

```typescript
const handleLoadPlan = () => {
  const fp = createDirectFlight('KSEA', 'KPDX');
  useSimStore.getState().setFlightPlan(fp);
  // Also engage AP with LNAV + VNAV
  const ap = useSimStore.getState().apState;
  if (ap) {
    const next = structuredClone(ap);
    next.truth.lateralActive = 'LNAV';
    next.truth.verticalActive = 'VNAV';
    next.truth.thrustActive = 'SPEED';
    next.truth.autopilotStatus = 'CMD_A';
    useSimStore.getState().setApState(next);
  }
};
```

**Step 3: Commit**

```bash
git add src/sim/flightPlanLoader.ts src/sim/__tests__/ src/App.tsx
git commit -m "feat: SimBrief flight plan loading with LNAV/VNAV activation"
```

---

### Task 5: Cesium Scene Enhancements

**Objective:** Enable terrain exaggeration, water mask, and improved atmosphere for better visuals.

**Files:**
- Modify: `src/viewport/CesiumViewport.tsx` — add scene settings

**Step 1: Enable scene enhancements**

After viewer creation:
```typescript
// Terrain exaggeration (1.5x for more dramatic terrain)
viewer.scene.globe.terrainExaggeration = 1.5;

// Enable lighting
viewer.scene.globe.enableLighting = true;

// Water mask
viewer.scene.globe.showWaterEffect = true;

// Atmosphere
viewer.scene.skyAtmosphere.show = true;
viewer.scene.skyAtmosphere.brightnessShift = 0.1;
```

**Step 2: Commit**

```bash
git add src/viewport/CesiumViewport.tsx
git commit -m "feat: Cesium terrain exaggeration, water, atmosphere"
```

---

### Task 6: Smooth Camera Transitions

**Objective:** Interpolate camera position when switching modes instead of snapping instantly.

**Files:**
- Modify: `src/App.tsx` — add camera interpolation logic

**Step 1: Use `camera.flyTo` with 1s duration instead of `camera.lookAt`**

Replace the chase camera effect's `camera.lookAt()` with `camera.flyTo()`:
```typescript
viewer.camera.flyTo({
  destination: Cesium.Cartesian3.fromDegrees(a.position.lon, a.position.lat, altM),
  orientation: new Cesium.HeadingPitchRange(
    a.attitude.psi - Math.PI,
    Cesium.Math.toRadians(camMode === 'tower' ? -5 : -15),
    camMode === 'tower' ? 1500 : 300,
  ),
  duration: 0.5, // half-second smooth transition
});
```

Also track `prevCamMode` and only fly on mode change, use `lookAt` for continuous following:
```typescript
const prevCamMode = useRef(camMode);
useEffect(() => {
  if (prevCamMode.current !== camMode) {
    prevCamMode.current = camMode;
  }
}, [camMode]);

// Use lookAt when following (60fps smooth), flyTo on mode switch
if (prevCamMode.current !== camMode) {
  viewer.camera.flyTo({ ... duration: 1.0 });
  prevCamMode.current = camMode;
} else {
  viewer.camera.lookAt(...);
}
```

**Step 2: Commit**

```bash
git add src/App.tsx
git commit -m "feat: smooth camera transitions between modes"
```

---

### Task 7: Speed & Altitude Tape PFD

**Objective:** Replace the simple number display in `RfsPFD` with proper scrolling speed and altitude tapes.

**Files:**
- Modify: `src/instruments/RfsPFD.tsx`

**Step 1: Implement tape-style PFD**

Replace the number-only display with SVG-based tapes:

```tsx
export function RfsPFD() {
  const a = useSimStore(s => s.aircraft);
  const d = computeDerived(a);
  const pitch = (a.attitude.theta * 180) / Math.PI;
  const roll = (a.attitude.phi * 180) / Math.PI;
  const hdg = ((a.attitude.psi * 180) / Math.PI) % 360;

  const tapeH = 300;
  const tapeW = 60;
  const pxPerKt = 2;
  const pxPerFt = 0.02;

  // Speed tape offset: center is current IAS
  const spdOffset = -d.ias * pxPerKt + tapeH / 2;

  return (
    <div style={{ position: 'fixed', bottom: 20, right: 200, zIndex: 100, display: 'flex', gap: 4, pointerEvents: 'none' }}>
      {/* Speed tape */}
      <div style={{ background: '#0a0a0a', border: '1px solid #333', borderRadius: 4, overflow: 'hidden', width: tapeW, height: tapeH, position: 'relative' }}>
        <div style={{ position: 'absolute', top: spdOffset, left: 0, right: 0, transition: 'none' }}>
          {Array.from({ length: 40 }, (_, i) => {
            const spd = Math.floor(d.ias / 10) * 10 - 100 + i * 10;
            return (
              <div key={spd} style={{ height: pxPerKt * 10, textAlign: 'right', paddingRight: 4, fontFamily: 'monospace', fontSize: 11, color: '#fff', lineHeight: `${pxPerKt * 10}px` }}>
                {spd % 20 === 0 ? spd : ''}
              </div>
            );
          })}
        </div>
        {/* Center marker */}
        <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 2, background: '#ff0', marginTop: -1 }} />
        <div style={{ position: 'absolute', top: '50%', right: 4, transform: 'translateY(-50%)', color: '#0f0', fontFamily: 'monospace', fontSize: 20, fontWeight: 'bold' }}>
          {d.ias.toFixed(0)}
        </div>
      </div>

      {/* Attitude center */}
      <div style={{ background: '#0a0a0a', border: '1px solid #333', borderRadius: 4, width: 80, height: tapeH, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ color: '#0f0', fontFamily: 'monospace', fontSize: 14 }}>HDG {hdg.toFixed(0)}°</div>
        <div style={{ color: '#0f0', fontFamily: 'monospace', fontSize: 12 }}>P {pitch.toFixed(1)}°</div>
        <div style={{ color: '#0f0', fontFamily: 'monospace', fontSize: 12 }}>R {roll.toFixed(1)}°</div>
      </div>

      {/* Altitude tape */}
      <div style={{ background: '#0a0a0a', border: '1px solid #333', borderRadius: 4, overflow: 'hidden', width: tapeW, height: tapeH, position: 'relative' }}>
        <div style={{ position: 'absolute', top: -a.position.alt * pxPerFt + tapeH / 2, left: 0, right: 0 }}>
          {Array.from({ length: 40 }, (_, i) => {
            const alt = Math.floor(a.position.alt / 100) * 100 - 2000 + i * 100;
            return (
              <div key={alt} style={{ height: pxPerFt * 100, textAlign: 'left', paddingLeft: 4, fontFamily: 'monospace', fontSize: 11, color: '#fff', lineHeight: `${pxPerFt * 100}px` }}>
                {alt % 200 === 0 ? alt : ''}
              </div>
            );
          })}
        </div>
        <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 2, background: '#ff0', marginTop: -1 }} />
        <div style={{ position: 'absolute', top: '50%', left: 4, transform: 'translateY(-50%)', color: '#0f0', fontFamily: 'monospace', fontSize: 20, fontWeight: 'bold' }}>
          {a.position.alt.toFixed(0)}
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/instruments/RfsPFD.tsx
git commit -m "feat: speed and altitude tape PFD"
```

---

### Task 8: Final Verification & Polish

**Objective:** Full suite, build, visual smoke test. Update README.

```bash
npx vitest run && npx tsc --noEmit && npx vite build
```

Visual checklist:
- [ ] Sun moves across sky during flight (time-of-day live)
- [ ] Contrails visible above FL250 behind engines
- [ ] Can spawn at different airports (KSEA, KPDX, KJFK, KDCA)
- [ ] "LOAD PLAN" button creates KSEA→KPDX route, LNAV follows it
- [ ] Terrain is more dramatic (1.5x exaggeration)
- [ ] Water visible on coastlines
- [ ] Camera transitions smoothly between chase/cockpit/tower
- [ ] PFD shows scrolling speed and altitude tapes
- [ ] PFD center shows heading, pitch, roll

---

## Phase 6 Complete — The Full Experience

| Feature | Effect |
|---------|--------|
| Time-of-day live | Sun moves across sky — dawn, noon, dusk, night cycle during flight |
| Contrails | White particle trails above FL250 |
| Multi-airport | Spawn at any airport in RFMS navdata (KJFK, KDCA, KPDX, KSEA) |
| Flight plans | Load route → LNAV follows magenta line, VNAV meets altitude constraints |
| Terrain 1.5x | More dramatic mountains and valleys |
| Water mask | Coastlines and lakes visible |
| Smooth camera | 0.5s interpolation on mode switch |
| Tape PFD | Scrolling speed tape (IAS) and altitude tape with center markers |
