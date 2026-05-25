# Phase 1.5: Live Viewport & Camera — Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Wire the Three.js aircraft proxy to follow live sim state, implement chase/orbit cameras, add KSEA runway rendering, fix the two bugs from the Phase 1 audit (thrust dimension, key-up zeroing).

**Architecture:** The `ThreeLayer` component subscribes to `useSimStore` and updates the aircraft mesh position/orientation each frame. Camera modes (chase, orbit, cockpit) implemented in a `CameraController`. KSEA runways rendered as textured quads on the Cesium globe via `three-to-cesium`.

**Tech Stack:** Same as before.

---

### Task 0: Fix Phase 1 Bugs

**Objective:** Fix the thrust computation and keyboard input bugs found in the audit.

**Files:**
- Modify: `src/sim/physics/aero.ts:47`
- Modify: `src/App.tsx:24-52`

**Step 1: Fix thrust computation**

In `src/sim/physics/aero.ts`, change line 47 from:
```typescript
const staticThrust = spec.maxThrust * lbfToN(Math.max(n1Avg, 0));
```
to:
```typescript
const staticThrust = lbfToN(spec.maxThrust) * Math.max(n1Avg, 0);
```

**Step 2: Fix keyboard input**

Replace the keyboard `useEffect` in `src/App.tsx` (lines 24-52) with a pressed-keys Set pattern:

```typescript
const keysRef = useRef(new Set<string>());

useEffect(() => {
  const updateFromKeys = () => {
    const k = keysRef.current;
    setInput({
      elevator: (k.has('w') ? -0.4 : 0) + (k.has('s') ? 0.4 : 0),
      aileron: (k.has('a') ? -0.5 : 0) + (k.has('d') ? 0.5 : 0),
      rudder: (k.has('q') ? -0.5 : 0) + (k.has('e') ? 0.5 : 0),
    });
  };

  const onKey = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    if (['w','s','a','d','q','e'].includes(key)) {
      keysRef.current.add(key);
      updateFromKeys();
    }
    switch (key) {
      case 'arrowup': setInput({ throttle1: 1, throttle2: 1 }); break;
      case 'arrowdown': setInput({ throttle1: 0, throttle2: 0 }); break;
      case 'g': {
        const gear = useSimStore.getState().inputs.gearLever;
        setInput({ gearLever: gear === 'UP' ? 'DOWN' : 'UP' });
        break;
      }
      case 'f': {
        const flaps = useSimStore.getState().inputs.flapLever;
        const next = flaps >= 40 ? 0 : flaps < 5 ? 5 : flaps + 5;
        setInput({ flapLever: next });
        break;
      }
    }
  };

  const onKeyUp = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    keysRef.current.delete(key);
    updateFromKeys();
  };

  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKeyUp);
  return () => {
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('keyup', onKeyUp);
  };
}, [setInput]);
```

**Step 3: Verify tests still pass**

```bash
npx vitest run && npx tsc --noEmit
```

**Step 4: Commit**

```bash
git add src/sim/physics/aero.ts src/App.tsx
git commit -m "fix: correct thrust dimension bug and key-up zeroing all axes"
```

---

### Task 1: Aircraft Proxy Follows Sim State

**Objective:** Update the ThreeLayer's red cube position/orientation from the Zustand sim store each frame.

**Files:**
- Modify: `src/viewport/ThreeLayer.tsx`
- Modify: `src/viewport/ThreeLayer.test.tsx` (if it exists)

**Step 1: Modify ThreeLayer** to import the store and update the cube each frame:

In `ThreeLayer.tsx`, inside the `useEffect` after creating the cube, add a per-frame update in the sync callback:

```typescript
// After the sync setup, replace the sync function:
const sync = () => {
  const aircraft = useSimStore.getState().aircraft;
  const { lat, lon, alt } = aircraft.position;
  const { phi, theta, psi } = aircraft.attitude;

  // Update position
  const pos = Cesium.Cartesian3.fromDegrees(lon, lat, alt * 0.3048); // ft → m
  // For a simple position update, remove old and add new
  // (three-to-cesium doesn't expose direct position set on added objects)
  if (cubeRef.current) {
    ttc.remove(cubeRef.current);
  }
  const newCube = new THREE.Mesh(
    new THREE.BoxGeometry(30, 10, 60), // aircraft-shaped: long, thin, wide
    new THREE.MeshStandardMaterial({ color: 0xcccccc }),
  );
  newCube.rotation.set(phi, theta, psi);
  ttc.add(newCube, pos);
  cubeRef.current = newCube;

  ttc.update();
};
```

Actually, removing and re-adding every frame is expensive. Better approach: use `ttc.add` once, then update the mesh's `matrixAutoUpdate` and set position/rotation manually. But three-to-cesium wraps objects in a Group — we need to access that group.

Simpler approach for Phase 1.5: keep the remove+add pattern. At 60fps, Three.js can handle creating/destroying a simple mesh. The GC pressure is minimal for a BoxGeometry. We'll optimize later.

Wait, even simpler: three-to-cesium's `add()` returns a `THREE.Group`. We can store that group and update its `.position` and `.rotation` properties directly, then call `ttc.update()`. But the position needs to be in Cesium's local coordinate system (relative to the group's anchor), not world coordinates.

Actually, the cleanest approach is: store the `ttc` instance and the returned group from `add()`. On each frame, compute the new Cesium Cartesian3 position, remove the group, and re-add at the new position. This is the documented pattern from three-to-cesium examples.

Let me write it cleanly:

```typescript
const sync = () => {
  const aircraft = useSimStore.getState().aircraft;
  const { lat, lon, alt } = aircraft.position;
  const { phi, theta, psi } = aircraft.attitude;

  // Remove old proxy
  if (proxyGroupRef.current) {
    ttc.remove(proxyGroupRef.current);
  }

  // Create new proxy at current position
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(10, 3, 30),
    new THREE.MeshStandardMaterial({ color: 0xdddddd }),
  );
  const wing = new THREE.Mesh(
    new THREE.BoxGeometry(35, 1, 8),
    new THREE.MeshStandardMaterial({ color: 0xcccccc }),
  );
  const tail = new THREE.Mesh(
    new THREE.BoxGeometry(14, 8, 2),
    new THREE.MeshStandardMaterial({ color: 0xffffff }),
  );
  tail.position.set(0, 4, -13);

  const group = new THREE.Group();
  group.add(body);
  group.add(wing);
  group.add(tail);
  group.rotation.set(theta, psi + Math.PI / 2, -phi); // body→world orientation

  const pos = Cesium.Cartesian3.fromDegrees(lon, lat, alt * 0.3048);
  proxyGroupRef.current = ttc.add(group, pos);

  // Update chase camera (later task)
  ttc.update();
};
```

This gives a crude 737-shaped proxy (fuselage box + wing box + tail box) that follows the aircraft state.

**Step 2: Run tests**

```bash
npx vitest run && npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add src/viewport/ThreeLayer.tsx
git commit -m "feat: aircraft proxy follows live sim state"
```

---

### Task 2: Chase Camera

**Objective:** Camera follows the aircraft from behind. Cesium's camera automatically tracks.

**Files:**
- Modify: `src/App.tsx`

**Step 1: Add a `useEffect`** in App that updates the Cesium camera to follow the aircraft each frame.

Since `useSimLoop` already runs a RAF loop, we can piggyback on it or add a separate effect. Better: add it to the existing `useSimLoop` subscription.

Actually, the simplest approach is a separate `useEffect` with `requestAnimationFrame` that reads aircraft position from the store and updates the Cesium camera:

```typescript
useEffect(() => {
  if (!viewerRef.current) return;
  let raf: number;
  const update = () => {
    const a = useSimStore.getState().aircraft;
    const { lat, lon, alt } = a.position;
    const heading = a.attitude.psi;
    const camAlt = alt * 0.3048 + 100; // 100m above
    const behind = 200; // 200m behind

    const pos = Cesium.Cartesian3.fromDegrees(
      lon, lat, camAlt,
    );
    // Offset behind based on heading
    const offset = new Cesium.Cartesian3(
      -behind * Math.sin(heading),
      -behind * Math.cos(heading),
      0,
    );
    const camPos = Cesium.Cartesian3.add(pos, offset, new Cesium.Cartesian3());

    viewerRef.current!.camera.setView({
      destination: camPos,
      orientation: {
        heading: heading - Math.PI,
        pitch: Cesium.Math.toRadians(-10),
        roll: 0,
      },
    });
    raf = requestAnimationFrame(update);
  };
  raf = requestAnimationFrame(update);
  return () => cancelAnimationFrame(raf);
}, []);
```

Wait, this uses `viewerRef` which is null on first render. Better to wait for `viewerRef.current` in the effect.

Actually, `camera.setView` every frame will fight with the Cesium camera controller. Better approach: use `camera.lookAtTransform` or just update the camera position directly. But the simplest that works: set `viewer.scene.screenSpaceCameraController.enableInputs = false` to disable mouse camera control, then just move the camera via `camera.position` and `camera.direction`.

Even simpler: Cesium's `camera.flyTo` is animated. For a per-frame chase cam, just directly set the camera transform:

```typescript
const cam = viewer.camera;
cam.position = camPos;
cam.direction = Cesium.Cartesian3.subtract(
  Cesium.Cartesian3.fromDegrees(lon, lat, alt * 0.3048),
  camPos,
  new Cesium.Cartesian3(),
);
Cesium.Cartesian3.normalize(cam.direction, cam.direction);
```

Actually this is getting complicated. For Phase 1.5, the simpler approach: just call `camera.flyTo` with a 0-second duration on each frame, or better yet, use `camera.lookAt`:

```typescript
viewer.camera.lookAt(
  Cesium.Cartesian3.fromDegrees(lon, lat, alt * 0.3048),
  new Cesium.HeadingPitchRange(heading - Math.PI, Cesium.Math.toRadians(-10), 300),
);
```

`lookAt` doesn't animate — it snaps instantly. And it works even with `screenSpaceCameraController` enabled. This is the right approach.

Let me write this cleanly for the subagent.

---

**FULL TASK SPEC:**

Add a `useEffect` in `App.tsx` (after the existing effects) that updates the Cesium camera each frame:

```typescript
// Chase camera — follows aircraft
useEffect(() => {
  let raf: number;
  const update = () => {
    const viewer = viewerRef.current;
    if (!viewer) { raf = requestAnimationFrame(update); return; }
    const a = useSimStore.getState().aircraft;
    viewer.camera.lookAt(
      Cesium.Cartesian3.fromDegrees(a.position.lon, a.position.lat, a.position.alt * 0.3048),
      new Cesium.HeadingPitchRange(
        a.attitude.psi - Math.PI, // behind the aircraft
        Cesium.Math.toRadians(-15), // slightly above
        300, // 300m behind
      ),
    );
    raf = requestAnimationFrame(update);
  };
  raf = requestAnimationFrame(update);
  return () => cancelAnimationFrame(raf);
}, []);
```

Also disable default camera controls so the camera stays on the aircraft:
In `CesiumViewport.tsx`, add to the Viewer options:
```typescript
sceneMode: Cesium.SceneMode.SCENE3D,
```

And after viewer creation:
```typescript
viewer.scene.screenSpaceCameraController.enableInputs = false;
```

**Step 2: Restore camera controls on pause**

When sim is paused, re-enable camera controls so the user can look around:
```typescript
// In App.tsx, watch status
const status = useSimStore((s) => s.status);
useEffect(() => {
  const viewer = viewerRef.current;
  if (!viewer) return;
  viewer.scene.screenSpaceCameraController.enableInputs = (status !== 'running');
}, [status]);
```

**Step 3: Verify**

```bash
npx vitest run && npx tsc --noEmit && npx vite build
```

**Step 4: Commit**

```bash
git add -A && git commit -m "feat: add chase camera following aircraft"
```

---

### Task 3: KSEA Runway Rendering

**Objective:** Render runway rectangles at KSEA (16L/34R, 16R/34L, 16C/34C) on the Cesium globe.

**Files:**
- Create: `src/viewport/AirportLayer.tsx`

**Step 1: Hardcode KSEA runway data**

KSEA runways (approximate from navdata):
```
16L: lat=47.4393, lon=-122.3100, length=3627m, width=46m, heading=163° true
16R: lat=47.4543, lon=-122.3100, length=2591m, width=46m, heading=163°
16C: lat=47.4468, lon=-122.3100, length=2865m, width=46m, heading=163°
```

**Step 2: Create AirportLayer component**

Use `three-to-cesium` to place textured plane geometries at runway positions:

```typescript
interface Runway {
  name: string;
  lat: number;
  lon: number;
  length: number; // meters
  width: number;  // meters
  heading: number; // degrees true
}

function addRunway(ttc: ReturnType<typeof ThreeToCesium>, rw: Runway) {
  const geo = new THREE.PlaneGeometry(rw.width, rw.length);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x333333,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2; // lay flat
  mesh.rotation.z = (rw.heading - 90) * Math.PI / 180; // orient

  const pos = Cesium.Cartesian3.fromDegrees(rw.lon, rw.lat, 1); // 1m above terrain
  ttc.add(mesh, pos);
}
```

Add `AirportLayer` to `App.tsx`, passing `viewerRef`.

**Step 3: Wire into App**

```tsx
<AirportLayer viewerRef={viewerRef} />
```

**Step 4: Verify**

Build and visually confirm runways appear at KSEA.

**Step 5: Commit**

```bash
git add src/viewport/AirportLayer.tsx src/App.tsx
git commit -m "feat: add KSEA runway rendering"
```

---

### Task 4: HUD Attitude Indicator (Basic)

**Objective:** Add a simple pitch ladder + roll indicator to the Telemetry or as a new component.

**Files:**
- Create: `src/components/AttitudeIndicator.tsx`
- Modify: `src/components/Telemetry.tsx` (or keep separate)

**Step 1: Create a small SVG-based attitude indicator**

A fixed-size div with an SVG that renders:
- A horizon line that rotates with roll
- Pitch marks that shift up/down
- A fixed aircraft symbol in the center

```tsx
export function AttitudeIndicator() {
  const phi = useSimStore(s => s.aircraft.attitude.phi);
  const theta = useSimStore(s => s.aircraft.attitude.theta);

  const size = 150;
  const center = size / 2;
  const pitchOffset = (theta * 180 / Math.PI) * 3; // 3px per degree

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}
      style={{ background: '#111', borderRadius: '50%', border: '2px solid #333' }}>
      <g transform={`rotate(${-phi * 180 / Math.PI}, ${center}, ${center})`}>
        {/* Horizon */}
        <rect x={0} y={center + pitchOffset} width={size} height={size} fill="#4a6" opacity={0.6} />
        <rect x={0} y={0} width={size} height={center + pitchOffset} fill="#68b" opacity={0.6} />
        {/* Horizon line */}
        <line x1={20} y1={center + pitchOffset} x2={size - 20} y2={center + pitchOffset}
          stroke="#fff" strokeWidth={2} />
        {/* Aircraft symbol */}
        <line x1={center - 25} y1={center} x2={center + 25} y2={center} stroke="#ff0" strokeWidth={2} />
        <line x1={center} y1={center - 10} x2={center} y2={center} stroke="#ff0" strokeWidth={2} />
      </g>
    </svg>
  );
}
```

**Step 2: Wire into App below Telemetry**

**Step 3: Commit**

```bash
git add src/components/AttitudeIndicator.tsx src/App.tsx
git commit -m "feat: add basic attitude indicator to HUD"
```

---

### Task 5: Integration Verification

**Objective:** Full suite verification — tests, typecheck, build, visual check.

**Step 1: Run all tests**

```bash
npx vitest run && npx tsc --noEmit && npx vite build
```

**Step 2: Visual checklist**

- [ ] Click TAKEOFF → aircraft proxy (white boxes) climbs away from KSEA
- [ ] Chase camera follows behind the aircraft
- [ ] Runway rectangles visible at KSEA
- [ ] WASD controls work simultaneously (hold W+D = pitch+roll together)
- [ ] Attitude indicator shows pitch/roll in real-time
- [ ] Pause → camera unlocks for pan/zoom

**Step 3: Commit**

```bash
git add -A && git commit -m "chore: Phase 1.5 complete — live viewport, chase cam, runways, attitude indicator"
```
