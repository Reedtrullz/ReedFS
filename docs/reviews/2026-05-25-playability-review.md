# RFS Playability Review — 2026-05-25

## Executive summary

RFS is technically stable enough to load, render, and pass its current automated checks, but the playable flight loop is not yet viable. The main issue is architectural rather than cosmetic: the app presents a runway/takeoff scenario, but the physics model is still airborne-only. Pressing TAKEOFF starts from zero speed at field elevation, retracts the gear immediately, applies a persistent elevator preset, and then the free-flight integrator lets the aircraft fall through terrain.

Observed live on https://fly.reidar.tech/?review=playability:

- Initial load is visually coherent: aircraft visible at KSEA, telemetry reads STOPPED, 0 kt, 432 ft, gear down.
- After TAKEOFF the aircraft immediately enters an unrecoverable state: negative altitude, extreme descent rate, steep nose-down pitch, black/no-world view.
- COCKPIT camera mode is a blank/gray view with HUD overlays, not a usable cockpit/outside view.
- LOAD PLAN and first MCP interactions provide little/no player-visible feedback.
- Current unit/type/lint checks pass, but they do not cover the core player experience.

Quality gates run during review:

```text
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run lint:ci
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run typecheck && npm test
```

Results:

- ESLint exit 0. Non-blocking React-version settings warning only.
- Typecheck passed.
- Vitest passed: 27 files, 114 tests.

Evidence screenshots:

- Initial loaded state: `/Users/reidar/.hermes/cache/screenshots/browser_screenshot_72924b3146b54619a9438997d25fc6d4.png`
- After TAKEOFF failure: `/Users/reidar/.hermes/cache/screenshots/browser_screenshot_ea078ebc4b354881b52256c08d29ca0a.png`
- COCKPIT camera blank/gray state: `/Users/reidar/.hermes/cache/screenshots/browser_screenshot_a963c4750e714f08b0f3eb8307810fb7.png`

## Review scope

Reviewed:

- Live deployed app at `https://fly.reidar.tech/?review=playability`
- Runtime visual/DOM state via browser tools
- Console after load and after TAKEOFF
- Keyboard/control code
- Gamepad code
- Zustand sim loop/store
- Integrator and aero model
- Three/Cesium rendering layer
- Camera behavior
- PFD/MCP/HUD layout
- Audio startup path
- Existing roadmap and physics invariant docs

Important source files inspected:

- `src/App.tsx`
- `src/store/simStore.ts`
- `src/hooks/useSimLoop.ts`
- `src/input/GamepadManager.ts`
- `src/sim/types.ts`
- `src/sim/physics/integrate.ts`
- `src/sim/physics/aero.ts`
- `src/sim/systems/autopilot.ts`
- `src/viewport/CesiumViewport.tsx`
- `src/viewport/ThreeLayer.tsx`
- `src/instruments/RfsPFD.tsx`
- `src/instruments/RfsMCP.tsx`
- `src/hooks/useAudioLoop.ts`
- `src/audio/AudioEngine.ts`
- `docs/roadmap.md`
- `docs/physics-invariants.md`

## Findings

### P0 — TAKEOFF starts a runway scenario in an airborne-only physics model

Evidence:

- Initial state is parked at zero speed, KSEA-ish field elevation: `src/sim/types.ts:167-189`.
- TAKEOFF applies full throttle, nose-up elevator, gear UP, flaps 5, then starts: `src/App.tsx:158-160`.
- `integrate()` always applies free-flight gravity/body acceleration and integrates altitude directly: `src/sim/physics/integrate.ts:67-104`.
- There is no ground contact, runway elevation clamp, weight-on-wheels, gear compression force, rolling friction, braking force, nosewheel steering, or touchdown model in the integration path.
- `brake` exists in the input type/defaults, but content search only found declarations/tests/defaults, not runtime physics use: `src/sim/types.ts:53`, `src/store/simStore.ts:31-36`.
- Live observation immediately after TAKEOFF: `ALT: -193 ft`, `VS: -8849 fpm`, `PTCH: -52.9°`, `GEAR: UP`; shortly after, visual screenshot showed `ALT: -1804 ft`, `VS: -23315 fpm`, `PTCH: -70.4°`.

Root cause:

The player flow says “take off from a runway,” but the physics contract is “free body in air.” At zero speed there is no lift. The aircraft starts falling before thrust and speed can produce a valid takeoff roll/liftoff. Since terrain/ground contact is absent, it falls through the runway/world.

Gameplay impact:

This blocks the core playable loop. Taxi, takeoff roll, rotation, landing, braking, and recovery are not playable. A player cannot reach a normal flight state from the provided TAKEOFF button.

Recommended remediation:

1. Add a ground model before tuning more airborne behavior:
   - runway/terrain AGL source
   - weight-on-wheels flag
   - gear station positions: nose, left main, right main
   - oleo spring-damper compression
   - tire rolling/side friction
   - brake force and anti-skid placeholder
   - nosewheel steering/tiller blend
   - touchdown constraints and vertical damping
2. Keep gear down while weight-on-wheels is true; block or ignore gear retraction on ground.
3. Add flight-phase state transitions: PARKED -> TAXI -> TAKEOFF_ROLL -> ROTATE -> CLIMB -> APPROACH -> FLARE -> ROLLOUT.
4. Add tests first:
   - parked aircraft remains at runway elevation and does not sink
   - full throttle from standstill accelerates on runway without negative altitude
   - brake input decelerates on ground
   - rotation only lifts off after plausible speed/AoA
   - landing contact damps vertical velocity instead of tunneling below terrain

This aligns with the existing roadmap P1 in `docs/roadmap.md:20-50`.

### P0 — TAKEOFF preset is a brittle scripted input, not a phase-aware takeoff flow

Evidence:

- `src/App.tsx:158-160` sets `elevator: -0.3`, `gearLever: 'UP'`, `flapLever: 5`, and full throttle in one click.
- `integrate()` copies gear/flaps directly into aircraft config each frame: `src/sim/physics/integrate.ts:106-110`.
- The initial state starts with engines off and zero velocity: `src/sim/types.ts:171-180`.

Root cause:

TAKEOFF is currently a persistent control preset. It does not model spool-up, brake release, ground roll, Vr, rotate, positive-rate climb, then gear up. It commands gear up immediately and holds elevator until the user does something else.

Gameplay impact:

Even after adding a ground model, this TAKEOFF button would still feel wrong: gear retracts on the ground, elevator is not pilot-rate-limited, and there is no takeoff phase feedback.

Recommended remediation:

- Change TAKEOFF into either:
  - a realistic “start scenario” button that places the aircraft already airborne, trimmed, and stable, or
  - a phase-aware assisted takeoff sequence.
- If keeping runway takeoff, initial click should set flaps/throttle/brake-release only; rotation should happen at Vr; gear up only after positive climb.
- Add tests for phase transitions and gear interlock.

### P0 — After TAKEOFF, visual references disappear or turn black

Evidence:

- Browser screenshot after TAKEOFF shows a mostly black/empty world while aircraft/HUD remain visible.
- Telemetry reports aircraft far below field elevation with steep negative pitch/descent.
- Camera target uses raw aircraft MSL altitude: `src/App.tsx:128-140`.
- Aircraft proxy also uses raw MSL altitude: `src/viewport/ThreeLayer.tsx:57-58`.
- Cesium terrain is world terrain with 1.5 exaggeration: `src/viewport/CesiumViewport.tsx:35`, `src/viewport/CesiumViewport.tsx:47-50`.

Root cause:

The aircraft is falling below terrain while the chase camera follows that invalid state. There is also a display mismatch risk because Cesium terrain is exaggerated but aircraft/camera altitude is not adjusted or terrain-clamped.

Gameplay impact:

The player loses horizon/runway/terrain references within seconds of starting. Manual recovery becomes impossible.

Recommended remediation:

- Fix ground model first so aircraft cannot tunnel below terrain/runway.
- Remove terrain exaggeration for playable builds, or apply a consistent display-height strategy for terrain, aircraft, and camera.
- Sample terrain height around the aircraft and clamp visual camera/aircraft target above terrain for safety.
- Add a runtime guard that detects below-ground state and pauses with a clear debug message rather than following the aircraft into blackness.

### P1 — Gamepad input can override keyboard/TAKEOFF every frame

Evidence:

- App polls gamepad every RAF and writes returned values directly to store: `src/App.tsx:90-101`.
- `readGamepad()` returns elevator/aileron/rudder and throttle every time a gamepad exists: `src/input/GamepadManager.ts:3-21`.
- Neutral throttle defaults to 0.5: `src/input/GamepadManager.ts:16-19`.
- Keyboard and gamepad write into the same `inputs` object: `src/App.tsx:41-73`, `src/App.tsx:90-101`.

Root cause:

There is no active-input-source arbitration and no deadzone/neutral filtering. A connected but untouched controller still emits a command, including half throttle.

Gameplay impact:

Keyboard controls and TAKEOFF throttle can be silently overwritten. A player with a controller plugged in may see controls behave inconsistently.

Recommended remediation:

- Add deadzones.
- Return `null` or a partial object when the gamepad is neutral.
- Preserve throttle unless an actual throttle axis/button changed.
- Track active input source with precedence: explicit UI > keyboard > gamepad, or allow user selection.
- Tests:
  - neutral gamepad does not call `setInput`
  - keyboard W/S remains active while gamepad sticks are centered
  - TAKEOFF throttle remains 1.0 with idle gamepad connected

### P1 — Keyboard controls are too coarse and incomplete for flight

Evidence:

- Keyboard bindings: W/S/A/D/Q/E, ArrowUp, ArrowDown, G, F only: `src/App.tsx:41-73`.
- Throttle is binary full/idle: `src/App.tsx:60-61`.
- Brake and spoilers exist in state but are not meaningfully wired to player controls or ground physics: `src/store/simStore.ts:31-36`, `src/sim/types.ts:53`.

Root cause:

The current controls are debug controls, not a playable flight-control scheme. There is no trim, no incremental throttle, no brakes, no speedbrake, no smoothing/rate limits, no control help overlay, and no touch controls.

Gameplay impact:

Even once airborne, the user has little ability to manage energy, flare, land, taxi, or make subtle pitch/roll corrections.

Recommended remediation:

- Incremental throttle controls, e.g. Shift+ArrowUp/Down or +/-.
- Brake binding and physics support.
- Spoilers/speedbrake binding.
- Elevator trim.
- Rate-limited/smoothed keyboard surfaces.
- Visible controls/help overlay.
- Optional on-screen mobile controls or explicitly mark app as desktop-keyboard only.

### P1 — Camera system fights the player and cockpit mode is not usable

Evidence:

- Camera inputs are disabled while running: `src/App.tsx:114-120`.
- Separate camera RAF loop calls `lookAt()` continuously regardless of sim status: `src/App.tsx:122-148`.
- COCKPIT mode uses `lookAt()` from aircraft position + 2m with heading/pitch range, but there is no cockpit model/interior/window framing: `src/App.tsx:129-133`.
- Live cockpit test produced a blank gray scene with HUD overlays and no outside/cockpit reference.

Root cause:

The camera manager is embedded in `App.tsx` as an unconditional loop. It does not have explicit follow/free/cockpit/tower semantics, and cockpit mode is just a camera offset, not a real cockpit view.

Gameplay impact:

The player cannot pan/zoom/recover camera while flying. Paused/stopped camera inspection is also overwritten by the RAF loop. Cockpit mode fails as a playable view.

Recommended remediation:

- Extract `CameraManager`.
- Add modes with explicit behavior:
  - chase follow
  - free camera
  - tower/static observer
  - cockpit/instrument view
- Gate `lookAt()` to running+follow mode only.
- Enable manual camera controls in free/pause modes.
- For cockpit mode, either build a minimal cockpit/nose/window reference or rename it to “instrument view” until it is actually usable.
- Tests:
  - paused/stopped mode does not call camera `lookAt()` continuously
  - free mode leaves Cesium inputs enabled
  - cockpit mode keeps a visible outside reference

### P1 — Aircraft visual orientation ignores yaw/heading

Evidence:

- `ThreeLayer` derives only `phi` and `theta`: `src/viewport/ThreeLayer.tsx:44-47`.
- Model rotation is `model.rotation.set(theta, 0, -phi)`: `src/viewport/ThreeLayer.tsx:53-58`.
- Camera uses aircraft heading/yaw: `src/App.tsx:137-140`.

Root cause:

Rendering does not apply the full quaternion/Euler attitude. The camera can chase based on heading while the model does not yaw accordingly.

Gameplay impact:

Aircraft heading, motion direction, and visual nose direction can disagree, reducing spatial awareness and making controls feel wrong.

Recommended remediation:

- Apply full quaternion orientation to the Three object in the correct ENU/local frame.
- Add visual/unit tests for yaw 0/90/180/270 degrees.
- Verify the model nose, camera-behind view, and heading tape agree.

### P1 — Three aircraft proxy is rebuilt every render frame

Evidence:

- Old proxy removed every sync: `src/viewport/ThreeLayer.tsx:48-51`.
- Model template cloned and re-added every sync: `src/viewport/ThreeLayer.tsx:53-58`.
- `ttc.update()` called per postRender: `src/viewport/ThreeLayer.tsx:94-99`.

Root cause:

The aircraft model is treated as disposable per-frame state instead of a persistent object whose transform is updated.

Gameplay impact:

This likely causes unnecessary GC churn, possible flicker/jitter, animation reset issues, and performance headroom loss before richer visuals are added.

Recommended remediation:

- Add the aircraft model once.
- Keep the `ThreeToCesium` proxy persistent.
- Update position/orientation/matrix per frame.
- Dispose only on unmount.
- Test that `ttc.add()` is called once and `ttc.remove()` is not called during normal flight frames.

### P1 — MCP/autopilot looks interactive but does not honor selected targets

Evidence:

- MCP default selected heading/altitude are created in UI state: `src/instruments/RfsMCP.tsx:30-56`.
- First click when `apState` is null only creates default AP state and returns without activating the clicked mode: `src/instruments/RfsMCP.tsx:26-88`.
- Integrator hard-codes target speed 250 and defaults target heading/altitude to current aircraft state: `src/sim/physics/integrate.ts:112-133`.
- `updateAutopilot()` mutates the input object after the physics update, making effects next-frame and not separately visible: `src/sim/systems/autopilot.ts:25-61`, `src/sim/physics/integrate.ts:112-133`.
- `LOAD PLAN` sets a flight plan, but only modifies AP modes if `apState` already exists: `src/App.tsx:205-221`.

Root cause:

There is no complete source-of-truth for selected MCP targets and active waypoint lifecycle. UI and physics are loosely connected.

Gameplay impact:

Buttons can appear to do nothing, first click is a hidden initialization, LOAD PLAN has no obvious effect, and autopilot modes cannot be trusted as a player aid.

Recommended remediation:

- Store selected heading/speed/altitude/VS explicitly.
- First MCP click should both initialize AP state and activate the requested mode.
- LOAD PLAN should show feedback and initialize route/AP state predictably.
- Integrator should use selected targets, not current heading/altitude or hard-coded speed.
- Add FMA/status annunciation visible near the PFD.
- Tests:
  - first HDG click activates HDG_SEL
  - selected heading drives a turn command
  - selected altitude drives climb/descent
  - selected speed drives autothrottle
  - LOAD PLAN shows route/waypoint status and initializes active leg

### P2 — HUD/readability is debug-heavy and cramped

Evidence:

- Telemetry panel is fixed top-left: `src/components/Telemetry.tsx`.
- RFS label is also fixed top-left: `src/App.tsx:174-185`.
- PFD is fixed bottom/right with hardcoded dimensions: `src/instruments/RfsPFD.tsx:24-35`.
- MCP is fixed at top 400/right 10: `src/instruments/RfsMCP.tsx:115-170`.
- Altitude tape uses `pxPerFt = 0.018`, so 100 ft ticks are only 1.8 px high while labels use 9-11 px font: `src/instruments/RfsPFD.tsx:13-20`, `src/instruments/RfsPFD.tsx:140-160`.

Root cause:

The UI is built as debug overlays with absolute pixel positioning. The tapes are not scaled for readability.

Gameplay impact:

The HUD eats screen space, obscures scenery, and makes key flight references hard to read. It also likely breaks on smaller screens.

Recommended remediation:

- Create a responsive HUD layout with safe areas.
- Separate debug telemetry from flight instruments; make debug collapsible.
- Fix altitude/speed tape scaling and label density.
- Add viewport-size tests for overlap/visibility.

### P2 — Audio may fail silently because startup is not actually user-gesture gated

Evidence:

- `useAudioLoop()` tries to start/resume audio context inside mount effect and swallows failures: `src/hooks/useAudioLoop.ts:11-16`.
- It sets `startedRef` true even if `start()` rejects: `src/hooks/useAudioLoop.ts:13-16`.
- `AudioEngine` constructs `AudioContext` eagerly: `src/audio/AudioEngine.ts:8-10`.

Root cause:

Browser autoplay policy requires a user gesture. The code comments say TAKEOFF will trigger audio, but the actual start attempt is in an effect and failures are ignored/no retry.

Gameplay impact:

Engine audio may be silent forever for some users, reducing feedback during takeoff/flight.

Recommended remediation:

- Start/resume audio directly in TAKEOFF/RESUME or an explicit ENABLE AUDIO button.
- Only set `startedRef` after `start()` resolves.
- Show audio enabled/suspended status.
- Retry on later user gestures.

### P2 — Timing is variable-step with dropped elapsed time

Evidence:

- `useSimLoop()` ticks from RAF timestamps: `src/hooks/useSimLoop.ts:7-12`.
- `simStore.tick()` caps dt at 0.05 and then sets `lastFrameTime` to current timestamp: `src/store/simStore.ts:50-56`.

Root cause:

Long frames discard elapsed time rather than using fixed substeps or an accumulator.

Gameplay impact:

Physics depends on frame rate and may slow/skip under load or after tab stalls, making tuning and controls inconsistent.

Recommended remediation:

- Use a fixed-step accumulator, e.g. 60/120 Hz physics, with a bounded catch-up budget.
- Eventually move to the physics worker phase already documented in `docs/roadmap.md:84-110`.
- Tests comparing 60x1/60s vs equivalent substepped elapsed time.

### P2 — Cesium default ion token warning is visible in-game

Evidence:

- Live screenshots show a bottom warning about using Cesium’s default ion token.
- `src/config/cesium.ts` has token helper coverage, but the live app still renders the default-token warning.

Root cause:

Production is using default Cesium ion access rather than a configured token or a no-ion/basic fallback path.

Gameplay impact:

It looks broken/unprofessional, overlaps bottom controls/attribution, and can lead to quota or asset availability problems.

Recommended remediation:

- Configure a proper token or remove ion-dependent defaults for the public build.
- Show a clear non-blocking warning in app UI if terrain/buildings are degraded.
- Ensure controls do not overlap Cesium warning/attribution.

### P2 — Loading/error/degraded-mode UX is missing

Evidence:

- `LoadingScreen` exists but is not imported/used anywhere except its own file.
- Search found no app usage of `LoadingScreen`.
- OSM buildings load errors are swallowed: `src/viewport/CesiumViewport.tsx:39-44`.
- Async Cesium failures are not surfaced to the player.

Root cause:

The app has no explicit ready/degraded/error state for terrain, imagery, 3D buildings, audio, or weather.

Gameplay impact:

Blank or degraded scenes appear without explanation. The player cannot tell whether loading is still happening, failed, or simply unsupported.

Recommended remediation:

- Use `LoadingScreen` until viewer/imagery/terrain readiness is established.
- Show degraded-mode banners for missing token, terrain failure, METAR failure, or audio suspended.
- Keep core flight controls usable even if scenery extras fail.

## What is already good

- App loads without JS errors in my browser run.
- Reset works and returns to the initial state.
- Current lint/type/unit test suite passes.
- Core physics sign/frame conventions are documented in `docs/physics-invariants.md`.
- Existing roadmap correctly identifies ground model as the next major dependency.
- The recent crash/black-runway-overlay fixes appear stable: only one Three overlay canvas is present and the initial world is visible.

## Recommended execution order

### Phase 1 — Make TAKEOFF not immediately fail

Goal: user can press TAKEOFF and remain in a plausible, controllable state for at least 60 seconds.

Preferred approach:

1. Add failing tests for current takeoff failure:
   - from initial state + TAKEOFF inputs, altitude must not drop below runway elevation before reaching rotation speed
   - gear remains down while weight-on-wheels
   - brake input affects ground deceleration
2. Implement minimal ground/runway model.
3. Replace TAKEOFF preset with phase-aware logic or an airborne-stable scenario.
4. Browser verify live/local: no negative altitude, no black world, player reaches positive climb.

### Phase 2 — Make controls actually playable

1. Input arbitration: keyboard/gamepad/UI priorities and gamepad deadzones.
2. Incremental throttle, brakes, spoilers, trim.
3. Visible controls/help overlay.
4. Smooth/rate-limit keyboard control surfaces.

### Phase 3 — Make camera/HUD playable

1. Extract camera manager.
2. Free camera and chase camera that do not fight user input.
3. Fix cockpit mode or rename it until usable.
4. Apply full aircraft yaw/orientation.
5. Make debug telemetry collapsible and PFD tapes readable.

### Phase 4 — Make route/AP features trustworthy

1. Selected targets source-of-truth.
2. First-click MCP activation.
3. LOAD PLAN visible feedback, active leg, route display/annunciation.
4. LNAV/VNAV target tests.

### Phase 5 — Performance/render cleanup

1. Persistent aircraft object/proxy.
2. Consolidated update loop or fewer redundant RAF loops.
3. Fixed-step physics accumulator / worker.

## Suggested first concrete task plan

If the next session is implementation, start with this narrow TDD slice:

1. Add `src/sim/systems/ground.ts` and `src/sim/systems/__tests__/ground.test.ts`.
2. Define a flat KSEA runway elevation constant initially, then abstract later.
3. Add `weightOnWheels`, normal force, rolling friction, and brake force.
4. Integrate ground forces before/inside `integrate()` without breaking airborne tests.
5. Update TAKEOFF to keep gear down and release brakes/throttle only.
6. Add `App`/store tests proving TAKEOFF does not set gear UP immediately.
7. Browser verify the aircraft rolls instead of falling through terrain.
8. Only after local tests pass, push/deploy and verify live with curl/browser.

## Bottom line

At review time, the app was a strong technical prototype but not yet a playable simulator. The blocking issue was not that the UI needed polish; it was that the player-facing start mode depended on ground/runway/takeoff mechanics that did not exist yet. The current repo has since implemented the ground model and phase-aware takeoff foundation; keep this bottom line as historical evidence and use `docs/roadmap.md` for remaining work.
