# Phase 3: Activation & Polish — Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Activate all dormant systems (autopilot ↔ physics, audio engine, METAR wind, GPWS), add gamepad support, and implement camera modes. Make the sim feel like a complete flight experience.

**Architecture:** The autopilot PID is wired into `integrate()` as the final system step — it reads the current state and overwrites `ControlInputs` that were set by the pilot. A new `useAudioLoop` hook drives engine sounds from N1. Wind from METAR is applied as body-frame velocity components before the aero computation. GPWS monitors altitude/terrain/configuration and posts alerts to the audio engine. Camera modes toggle between chase, cockpit, and tower views.

**Tech Stack:** Same as before — React 18, TypeScript strict, Vite, Zustand, CesiumJS, Three.js, Web Audio API.

---

### Task 1: Add Autopilot State & Flight Plan to SimStore

**Objective:** The simStore holds an optional `AutopilotState` and `FlightPlan`. When present, the autopilot engages and LNAV/VNAV drive the aircraft.

**Files:**
- Modify: `src/store/simStore.ts` — add `apState`, `flightPlan`, `setApState`, `setFlightPlan` fields

---

**Step 1: Extend the SimStore interface and implementation**

Add after the existing `reset` action:

```typescript
  // Autopilot state (null = no AP engaged)
  apState: null,
  flightPlan: null,
  setApState: (ap: AutopilotState | null) => void;
  setFlightPlan: (fp: FlightPlan | null) => void;
```

And in the initial state:
```typescript
  apState: null,
  flightPlan: null,
```

And the actions:
```typescript
  setApState: (ap) => set({ apState: ap }),
  setFlightPlan: (fp) => set({ flightPlan: fp }),
```

Add imports:
```typescript
import type { AutopilotState } from '@shared/autopilot/autopilotTypes';
import type { FlightPlan } from '@shared/types/fmc';
```

Also update `reset()` to clear them:
```typescript
  reset: () => set({
    // ... existing reset ...
    apState: null,
    flightPlan: null,
  }),
```

**Step 2: Update simStore test**

Add tests for the new fields:
```typescript
  it('setApState stores autopilot state', () => {
    const ap = { /* minimal AutopilotState */ } as AutopilotState;
    useSimStore.getState().setApState(ap);
    expect(useSimStore.getState().apState).toBe(ap);
  });

  it('reset clears autopilot state', () => {
    useSimStore.getState().setApState({} as AutopilotState);
    useSimStore.getState().reset();
    expect(useSimStore.getState().apState).toBeNull();
  });
```

**Step 3: Verify and commit**

```bash
npx vitest run src/store/__tests__/simStore.test.ts && npx tsc --noEmit
git add src/store/simStore.ts src/store/__tests__/simStore.test.ts
git commit -m "feat: add autopilot state and flight plan to simStore"
```

---

### Task 2: Wire Autopilot into integrate.ts

**Objective:** Call `updateAutopilot()` as the final step in `integrate()`, AFTER the physics integration. The autopilot overwrites `ControlInputs` with its PID outputs, but those take effect on the NEXT frame (standard semi-implicit pattern).

**Files:**
- Modify: `src/sim/physics/integrate.ts` — add autopilot call at the end
- Modify: `src/store/simStore.ts` — pass apState + flightPlan through tick

---

**Step 1: Modify integrate() signature** to accept optional autopilot params:

```typescript
export function integrate(
  state: AircraftState,
  inputs: ControlInputs,
  spec: AircraftSpec,
  dt: number,
  apState?: AutopilotState | null,
  flightPlan?: FlightPlan | null,
): void {
```

Add imports:
```typescript
import { updateAutopilot } from '../systems/autopilot';
import { computeLNAV } from '../systems/navigation';
import { computeVNAV } from '../systems/vnav';
import type { AutopilotState } from '@shared/autopilot/autopilotTypes';
import type { FlightPlan } from '@shared/types/fmc';
```

Add at the END of integrate (before `simTime`):
```typescript
  // ── Autopilot (overwrites inputs for next frame) ──
  if (apState && apState.truth.autopilotStatus !== 'OFF') {
    let targetHeading = state.attitude.psi;
    let targetAlt = state.position.alt;
    let targetSpeed = 250;

    // LNAV: compute desired track from flight plan
    if (apState.truth.lateralActive === 'LNAV' && flightPlan) {
      const nav = computeLNAV(state, flightPlan, 0); // TODO: track active wpt index
      targetHeading = nav.desiredTrack;
    }

    // VNAV: compute target altitude from flight plan
    if (apState.truth.verticalActive === 'VNAV' && flightPlan) {
      const navDefault = { crossTrackError: 0, alongTrackDist: 0, desiredTrack: targetHeading, activeWaypointIndex: 0, waypointReached: false };
      const vnav = computeVNAV(state, flightPlan, navDefault);
      if (vnav.altitudeConstraint) {
        targetAlt = vnav.targetAlt;
      }
    }

    updateAutopilot(state, inputs, apState, targetHeading, targetAlt, targetSpeed, dt);
  }
```

**Step 2: Update simStore.tick()** to pass apState/flightPlan:

```typescript
  tick: (timestamp: number) => {
    const { status, lastFrameTime, aircraft, inputs, spec, apState, flightPlan } = get();
    if (status !== 'running') return;
    const dt = lastFrameTime > 0 ? Math.min((timestamp - lastFrameTime) / 1000, 0.05) : 1 / 60;
    const state = structuredClone(aircraft);
    integrate(state, inputs, spec, dt, apState, flightPlan);
    set({ aircraft: state, lastFrameTime: timestamp });
  },
```

**Step 3: Verify**

```bash
npx vitest run && npx tsc --noEmit
git add src/sim/physics/integrate.ts src/store/simStore.ts
git commit -m "feat: wire autopilot PID into physics loop with LNAV/VNAV"
```

---

### Task 3: Wire Audio Engine into App

**Objective:** Start audio on first user interaction. Create a hook that drives engine sounds from N1.

**Files:**
- Create: `src/hooks/useAudioLoop.ts`
- Modify: `src/App.tsx` — add audio init + engine sounds

---

**Step 1: Create `src/hooks/useAudioLoop.ts`**

```typescript
import { useEffect, useRef } from 'react';
import { useSimStore } from '../store/simStore';
import { getAudioEngine } from '../audio/AudioEngine';
import { EngineSound } from '../audio/EngineSound';

export function useAudioLoop() {
  const enginesRef = useRef<EngineSound[] | null>(null);

  useEffect(() => {
    // Start audio context (must be triggered by user gesture)
    getAudioEngine().start().catch(() => {});

    // Create engine sounds
    enginesRef.current = [new EngineSound(0), new EngineSound(1)];

    // Drive from sim state
    let raf: number;
    const update = () => {
      const a = useSimStore.getState().aircraft;
      if (enginesRef.current) {
        enginesRef.current[0].update(a.engines[0].n1);
        enginesRef.current[1].update(a.engines[1].n1);
      }
      raf = requestAnimationFrame(update);
    };
    raf = requestAnimationFrame(update);

    return () => {
      cancelAnimationFrame(raf);
      enginesRef.current?.forEach(e => e.dispose());
      enginesRef.current = null;
    };
  }, []);
}
```

**Step 2: Wire into App.tsx**

Add import and call in App component:
```typescript
import { useAudioLoop } from './hooks/useAudioLoop';

// Inside App():
useAudioLoop();
```

**Step 3: Verify and commit**

```bash
npx vitest run && npx tsc --noEmit
git add src/hooks/useAudioLoop.ts src/App.tsx
git commit -m "feat: wire engine sounds driven by N1"
```

---

### Task 4: Apply Wind from METAR to Physics

**Objective:** Fetch METAR for KSEA on sim start. Apply wind as body-frame velocity components before aero computation in `integrate()`.

**Files:**
- Create: `src/sim/systems/environment.ts`
- Create: `src/sim/systems/__tests__/environment.test.ts`
- Modify: `src/sim/physics/integrate.ts` — call environment system
- Modify: `src/store/simStore.ts` — add wind state, load METAR on start

---

**Step 1: Create environment system** — `src/sim/systems/environment.ts`

```typescript
import type { AircraftState } from '../types';
import type { WindInfo } from '../weather';

/**
 * Apply wind to the aircraft by adjusting the body-frame velocity.
 * Wind is subtracted from the inertial velocity to get air-relative velocity,
 * which is what aerodynamics cares about.
 *
 * Phase 3 simplification: apply wind as a direct velocity offset.
 * Full implementation would compute air-relative velocity vector.
 */
export function applyWind(
  state: AircraftState,
  wind: WindInfo,
): void {
  if (wind.speed < 0.5) return; // no significant wind

  // Convert wind from direction/speed (true, kts) to NED components (m/s)
  const windDirRad = wind.dir * (Math.PI / 180);
  const windMs = wind.speed * 0.514444; // kts → m/s
  const windN = -windMs * Math.cos(windDirRad);
  const windE = -windMs * Math.sin(windDirRad);

  // Rotate NED wind into body frame using current attitude
  const { phi, theta, psi } = state.attitude;
  const sphi = Math.sin(phi), cphi = Math.cos(phi);
  const stht = Math.sin(theta), ctht = Math.cos(theta);
  const spsi = Math.sin(psi), cpsi = Math.cos(psi);

  // NED→Body transformation (inverse of body→NED)
  // Body x = NED_n * (cosθ cosψ) + NED_e * (cosθ sinψ) + NED_d * (-sinθ)
  // Body y = NED_n * (sinφ sinθ cosψ - cosφ sinψ) + NED_e * (sinφ sinθ sinψ + cosφ cosψ) + NED_d * (sinφ cosθ)
  // Body z = NED_n * (cosφ sinθ cosψ + sinφ sinψ) + NED_e * (cosφ sinθ sinψ - sinφ cosψ) + NED_d * (cosφ cosθ)
  // Wind in NED: windN north, windE east, 0 down (wind is horizontal)

  const windBodyU = windN * (ctht * cpsi) + windE * (ctht * spsi);
  const windBodyV = windN * (sphi * stht * cpsi - cphi * spsi) + windE * (sphi * stht * spsi + cphi * cpsi);
  const windBodyW = windN * (cphi * stht * cpsi + sphi * spsi) + windE * (cphi * stht * spsi - sphi * cpsi);

  // Subtract wind from inertial velocity to get air-relative velocity
  // (The aero model uses state.velocity directly, so we adjust it)
  state.velocity.u -= windBodyU;
  state.velocity.v -= windBodyV;
  state.velocity.w -= windBodyW;
}
```

**Step 2: Add wind to simStore**

Add field: `wind: WindInfo | null;`
Initialize: `wind: null,`
Add action: `setWind: (w: WindInfo | null) => set({ wind: w }),`

**Step 3: Integrate** — in `integrate()`, before `computeAero`:

```typescript
  // ── Environment (wind) ──
  // Wind is applied by modifying body velocity before aero
```

And in `tick()`:
```typescript
    // Apply wind before integrate
    const { wind } = get();
    if (wind) {
      applyWind(state, wind);
    }
```

**Step 4: Load METAR in App** — add useEffect:

```typescript
useEffect(() => {
  fetchMetar('KSEA').then(metar => {
    if (metar) {
      useSimStore.getState().setWind(parseMetarWind(metar));
    }
  });
}, []);
```

**Step 5: Verify and commit**

```bash
npx vitest run && npx tsc --noEmit
git add src/sim/systems/environment.ts src/sim/systems/__tests__/ src/sim/physics/integrate.ts src/store/simStore.ts src/App.tsx
git commit -m "feat: apply METAR wind to physics"
```

---

### Task 5: GPWS Callouts

**Objective:** Monitor altitude, vertical speed, terrain closure, and configuration. Play synthesized speech callouts through the audio engine.

**Files:**
- Create: `src/audio/GPWS.ts`
- Create: `src/audio/__tests__/GPWS.test.ts`
- Modify: `src/hooks/useAudioLoop.ts` — add GPWS check each frame

---

**Step 1: Create GPWS module** — `src/audio/GPWS.ts`

```typescript
import type { AircraftState } from '../sim/types';
import { getAudioEngine } from './AudioEngine';

// GPWS Mode 1: Excessive descent rate
// Alert when descent rate exceeds threshold based on radio altitude
function checkMode1(state: AircraftState): string | null {
  const vs = Math.sqrt(state.velocity.u ** 2 + state.velocity.v ** 2 + state.velocity.w ** 2) * 1.944;
  const descentRate = -state.velocity.w * 196.85; // ft/min, positive descending
  const alt = state.position.alt;
  
  if (alt < 2500 && descentRate > 5000) return 'SINK RATE';
  if (alt < 1000 && descentRate > 2000) return 'PULL UP';
  return null;
}

// GPWS Mode 4: Unsafe terrain clearance
function checkMode4(state: AircraftState): string | null {
  const alt = state.position.alt;
  if (alt < 500 && !state.config.gearDown) return 'TOO LOW GEAR';
  if (alt < 200 && state.config.flapSetting < 15 && state.velocity.u > 0) return 'TOO LOW FLAPS';
  return null;
}

// GPWS Mode 5: Below glideslope
function checkMode5(state: AircraftState): string | null {
  // Simplified: warn if below 1000ft and descending rapidly near an airport
  const alt = state.position.alt;
  const descentRate = -state.velocity.w * 196.85;
  if (alt < 1000 && descentRate > 500) return 'GLIDESLOPE';
  return null;
}

export type GPWSAlert = string | null;

export function checkGPWS(state: AircraftState): GPWSAlert {
  return checkMode1(state) ?? checkMode4(state) ?? checkMode5(state);
}

let lastAlert = '';
let lastAlertTime = 0;

export function updateGPWS(state: AircraftState): void {
  const now = performance.now();
  const alert = checkGPWS(state);
  if (alert && alert !== lastAlert && now - lastAlertTime > 3000) {
    lastAlert = alert;
    lastAlertTime = now;
    speakCallout(alert);
  }
}

function speakCallout(text: string): void {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.8;
  utterance.pitch = 0.9;
  utterance.volume = 0.7;
  speechSynthesis.speak(utterance);
}
```

**Step 2: Wire into audio loop**

In `useAudioLoop.ts`, add:
```typescript
import { updateGPWS } from '../audio/GPWS';
// In the RAF update:
updateGPWS(a);
```

**Step 3: Verify and commit**

```bash
npx vitest run && npx tsc --noEmit
git add src/audio/GPWS.ts src/audio/__tests__/ src/hooks/useAudioLoop.ts
git commit -m "feat: add GPWS callouts (modes 1, 4, 5)"
```

---

### Task 6: Gamepad API Support

**Objective:** Poll Gamepad API and translate axes/buttons to ControlInputs. Merge with keyboard inputs (gamepad takes priority).

**Files:**
- Create: `src/input/GamepadManager.ts`
- Modify: `src/App.tsx` — add gamepad polling effect

---

**Step 1: Create GamepadManager** — `src/input/GamepadManager.ts`

```typescript
import type { ControlInputs } from '../sim/types';

export function readGamepad(): Partial<ControlInputs> | null {
  const gamepads = navigator.getGamepads();
  const gp = gamepads[0];
  if (!gp) return null;

  // Standard mapping: left stick = pitch/roll, right stick = camera, triggers = rudder
  // Xbox/PS: axes[0]=left X, axes[1]=left Y, axes[2]=right X, axes[3]=right Y
  // Triggers: axes[4]=LT(-1..0), axes[5]=RT(0..1) — but mapping varies
  
  const leftX = gp.axes[0] ?? 0;
  const leftY = gp.axes[1] ?? 0;
  const rightX = gp.axes[2] ?? 0;
  
  // Left stick: Y = pitch (forward = nose down), X = roll
  const elevator = leftY * 0.7; // push forward = positive
  const aileron = leftX * 0.7;
  
  // Rudder from right stick X or triggers
  const rudder = rightX * 0.5;
  
  // Throttle from shoulder buttons or triggers
  let throttle1 = 0.5;
  let throttle2 = 0.5;
  
  // RT (index 7 on Xbox) = increase thrust
  if (gp.buttons[7]?.value) throttle1 = 0.5 + gp.buttons[7].value * 0.5;
  // LT (index 6 on Xbox) = decrease
  if (gp.buttons[6]?.value) throttle1 = 0.5 - gp.buttons[6].value * 0.5;
  throttle2 = throttle1;
  
  // Button mappings
  const gearLever = gp.buttons[0]?.pressed // A = gear toggle — handled in App
    ? undefined : undefined;
  const flapLever = gp.buttons[1]?.pressed // B = flaps down
    ? 15 : gp.buttons[2]?.pressed // X = flaps up
    ? 0 : undefined;
  
  return {
    elevator, aileron, rudder,
    throttle1, throttle2,
    ...(flapLever !== undefined ? { flapLever } : {}),
  };
}
```

**Step 2: Wire into App** — add gamepad polling in the RAF loop or a separate effect:

```typescript
useEffect(() => {
  let raf: number;
  const poll = () => {
    const gpInputs = readGamepad();
    if (gpInputs) {
      useSimStore.getState().setInput(gpInputs);
    }
    raf = requestAnimationFrame(poll);
  };
  raf = requestAnimationFrame(poll);
  return () => cancelAnimationFrame(raf);
}, []);
```

**Step 3: Verify and commit**

```bash
git add src/input/GamepadManager.ts src/App.tsx
git commit -m "feat: add Gamepad API support"
```

---

### Task 7: Camera Modes (Cockpit View)

**Objective:** Add camera mode toggle: chase (default), cockpit (pilot eye point), tower (fixed position watching aircraft).

**Files:**
- Modify: `src/App.tsx` — add camera mode state and toggle

---

**Step 1: Add camera mode**

In App.tsx, add state:
```typescript
const [camMode, setCamMode] = useState<'chase' | 'cockpit' | 'tower'>('chase');
```

In the chase camera effect, branch on camMode:
```typescript
if (camMode === 'chase') {
  viewer.camera.lookAt(/* ... existing chase code ... */);
} else if (camMode === 'cockpit') {
  // Pilot eye: 2m above aircraft CG, 5m forward
  const camPos = Cesium.Cartesian3.fromDegrees(
    a.position.lon, a.position.lat, a.position.alt * 0.3048 + 2,
  );
  viewer.camera.position = camPos;
  viewer.camera.direction = /* body-forward direction */;
} else if (camMode === 'tower') {
  // Fixed tower position at KSEA watching aircraft
  viewer.camera.lookAt(
    Cesium.Cartesian3.fromDegrees(a.position.lon, a.position.lat, a.position.alt * 0.3048),
    new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-10), 2000),
  );
}
```

Add button:
```tsx
<button onClick={() => setCamMode(m => m === 'chase' ? 'cockpit' : m === 'cockpit' ? 'tower' : 'chase')}
  style={btnStyle}>
  CAM: {camMode.toUpperCase()}
</button>
```

**Step 2: Commit**

```bash
git add src/App.tsx && git commit -m "feat: add camera modes (chase, cockpit, tower)"
```

---

### Task 8: Full Integration Verification

**Objective:** Full suite, build, visual checklist.

```bash
npx vitest run && npx tsc --noEmit && npx vite build
```

Visual checklist:
- [ ] Engine sound audible on TAKEOFF (oscillator hum changes with N1)
- [ ] GPWS "TOO LOW GEAR" callout when flying low with gear up
- [ ] "C" key or button toggles camera modes
- [ ] Gamepad stick moves control surfaces (if connected)
- [ ] METAR wind affects ground track (visible drift in chase cam)
- [ ] Autopilot can hold heading/altitude when LNAV/ALT_HOLD modes selected

---

## Phase 3 Complete — What You Get

| Feature | Effect |
|---------|--------|
| Autopilot activation | LNAV follows flight plan waypoints, ALT_HOLD maintains altitude, SPEED holds airspeed |
| Audio activation | Engine hum rises with N1, fades at idle |
| Wind from METAR | Real wind pushes aircraft, visible drift |
| GPWS | "SINK RATE", "PULL UP", "TOO LOW GEAR/FLAPS", "GLIDESLOPE" callouts |
| Gamepad | Left stick pitch/roll, triggers throttle, buttons for gear/flaps |
| Camera modes | Chase → Cockpit → Tower toggle |
