# RFS Comprehensive Gameplay, Realism, Visual, and Cockpit Review — 2026-05-26

## Executive summary

RFS is no longer blocked by the earlier catastrophic “falls through the runway” and “wing-first aircraft” failures, but it still feels like a flight-test/debug harness rather than a usable flight simulator. The current live build can start a roll, rotate, climb, and keep the aircraft visually nose-first, yet the experience remains arcadey and weird because the deeper contracts are not realistic enough:

1. The ground model still constrains the wrong velocity component. While weight-on-wheels, pitching the body can project forward speed into upward inertial velocity, so the airplane can appear to climb from pitch alone instead of from a proper lift-vs-weight/normal-force release.
2. `integrate()` contains a “playable takeoff assist” that directly edits attitude, clamps pitch to 15 degrees, and zeroes/clamps pitch rate. This makes W feel like an arcade “point nose up” command instead of a rate-limited yoke/elevator/stabilizer system.
3. The aero model is too broad and linear. Flaps 5 generate very high lift at zero AoA, there is no CLmax/stall behavior, drag increments are coarse, gear/flap drag is too weak, and thrust/performance is not calibrated against a 737-like envelope.
4. The aircraft model is still a simple procedural grey proxy. It has no livery, cockpit windows, cabin windows, control-surface detail, gear doors, flap/slat articulation, realistic nacelles, or PBR/material polish.
5. “Cockpit” is only a near-aircraft camera offset. It shows a black/grey obstruction and floating debug HUD overlays; there is no cockpit shell, windshield frame, glareshield, panel, yoke, throttle quadrant, PFD/ND/MCP integration, or mouselook.
6. The player loop is still mostly START ROLL plus debug overlays. There is no scenario picker, tutorial/checklist flow, route status, success/fail criteria, or usable cockpit-first presentation.
7. The MCP/autopilot/route UI is visibly present but not trustworthy. First clicks can initialize without activating the requested mode, selected targets are not consistently wired into control laws, LNAV always uses active waypoint 0, VNAV is not a real path/speed mode, and the PFD has no FMA row.

The next plan should not be “one more small bug fix.” It should be a staged realism and product pass: lock in scenario-level regressions first, fix runway-normal ground physics and remove core attitude assists, calibrate aero/engine/control feel, then build a proper aircraft/cockpit/overlay system and route/guidance workflow.

Companion implementation plan: `docs/plans/2026-05-26-rfs-comprehensive-usability-realism-plan.md`.

Status note: this review captures the pre-implementation audit that motivated the current pass. The repository now implements phases 0 through 5.5 of that plan; use `docs/architecture.md` and `docs/roadmap.md` for the current state and remaining work.

## Review inputs

### Live browser dogfood

Reviewed live deployment at `https://fly.reidar.tech/?review=2026-05-25`.

Screenshots captured during review:

- Initial state: `/Users/reidar/.hermes/cache/screenshots/browser_screenshot_eb2ea02f05da4f44866d25a7058e810d.png`
- Start roll / rotate cue: `/Users/reidar/.hermes/cache/screenshots/browser_screenshot_3798391aea084216afb9babc9500b767.png`
- High climb after W: `/Users/reidar/.hermes/cache/screenshots/browser_screenshot_da76bc7480354cb88059a2f891d21fa0.png`
- Cockpit mode: `/Users/reidar/.hermes/cache/screenshots/browser_screenshot_5e7a45c751494369ba3f4551c3d69289.png`

Console status:

- No JavaScript errors observed.
- Browser console warning: `WARNING: Multiple instances of Three.js being imported.`
- In-page Cesium ion default-token warning is visible and overlaps the bottom UI.

### Static and specialist audit scope

Reviewed or audited:

- `src/App.tsx`
- `src/store/simStore.ts`
- `src/input/keyboardControls.ts`
- `src/input/GamepadManager.ts`
- `src/sim/types.ts`
- `src/sim/physics/integrate.ts`
- `src/sim/physics/aero.ts`
- `src/sim/physics/derived.ts`
- `src/sim/systems/ground.ts`
- `src/sim/systems/AeroModel.ts`
- `src/sim/systems/autopilot.ts`
- `src/sim/systems/navigation.ts`
- `src/sim/systems/vnav.ts`
- `src/sim/flightPlanLoader.ts`
- `src/viewport/ThreeLayer.tsx`
- `src/viewport/AircraftModel.ts`
- `src/viewport/aircraftModelAnimation.ts`
- `src/viewport/CesiumViewport.tsx`
- `src/instruments/RfsPFD.tsx`
- `src/instruments/RfsMCP.tsx`
- `src/components/Telemetry.tsx`
- `src/components/ControlsHelp.tsx`
- `src/config/cesium.ts`
- `docs/architecture.md`
- `docs/roadmap.md`

Parallel specialist audits covered:

- Flight dynamics / physics realism.
- Rendering / aircraft visual model / cockpit / instruments.
- Gameplay UX / inputs / autopilot / route flow.

## Browser observations

### Initial state

Telemetry and DOM show:

- `SIM: STOPPED`
- `ALT: 432 ft`
- `IAS/TAS/GS: 0 kt`
- `HDG: 180.0°`
- `PTCH: 0.0°`
- `ROLL: 0.0°`
- `FLAPS: 0°`
- `GEAR: DN`

What works:

- The app loads.
- World imagery, terrain, water, airport region, and broad scenery are visible.
- Telemetry is readable.
- The aircraft orientation bug from the previous pass is fixed; the rendered aircraft remains nose-first during later observations.

What feels unfinished:

- The actual runway/centerline relationship is unclear before starting the roll.
- The aircraft is small and grey, without enough visual detail to feel like a 737.
- The screen is dominated by debug overlays: telemetry, controls help, PFD strips, MCP, FPS, Cesium attribution/warning, and bottom buttons.
- The PFD is functional but prototype-like. The altitude/speed tapes are large black slabs, and the separate round attitude indicator does not feel integrated into a cockpit.

### START ROLL / rotate cue

Observed after START ROLL:

- `SIM: RUNNING`
- Cue: `ROTATE — hold W`
- `ALT: 432 ft`
- `IAS: 216 kt`
- `TAS: 217 kt`
- `GS: 217 kt`
- `VS: -0 fpm`
- `MACH: M0.329`
- `HDG: 180.0°`
- `PTCH: 0.0°`
- `AOA: 0.0°`
- `N1: L:100.0% R:100.0%`
- `FLAPS: 5°`
- `GEAR: DN`

Gameplay read:

- Roll acceleration feels too hot. The sim reaches very high takeoff-roll speeds quickly, with little sense of mass, runway distance, spool-up, brake release, tire friction, or airliner inertia.
- The aircraft remains visually nose-first, but the chase view does not strongly communicate runway alignment or speed down the centerline.
- `ROTATE — hold W` is an improvement over the earlier invisible takeoff contract, but it is still a debug cue rather than a full takeoff tutorial/checklist.

### W / climb

Observed shortly after pressing W:

- `ALT: 4381 ft`
- `IAS: 293 kt`
- `TAS: 313 kt`
- `GS: 290 kt`
- `VS: 11959 fpm`
- `MACH: M0.480`
- `PTCH: 15.0°`
- `ROLL: 0.0°`
- `AOA: -7.2°`
- `N1: 100%`
- `FLAPS: 5°`
- `GEAR: DN`

A later visual capture saw roughly:

- `ALT: 7850 ft`
- `IAS: 264 kt`
- `VS: 10988 fpm`
- `PTCH: 15.0°`
- `AOA: -6.4°`
- `GEAR: DN`
- `FLAPS: 5°`

Gameplay read:

- The climb is extremely overpowered for a 737-like aircraft with gear down and flaps 5.
- 10,000-12,000 fpm while still near 250-300 kt IAS, gear down, and flaps 5 feels arcade-like.
- Negative AoA during a high pitch/high climb state is a red flag. It implies the flight path is steeper than pitch or that ground/assist/aero interactions are producing non-airliner dynamics.
- The pitch locks at exactly 15 degrees, which reads as scripted behavior rather than aircraft response.
- Gear remains down despite the cue. The sim warns but does not help the user complete the checklist or model gear-down consequences strongly enough.

### Cockpit mode

Observed after switching to `CAM: COCKPIT`:

- No true cockpit interior.
- Large dark/black obstruction in the lower/forward view.
- No visible windshield frame, glareshield, panel, yoke, throttles, seats, side windows, MCP/glareshield, or embedded instruments.
- The external world/horizon is partly visible, but the cockpit presentation is not usable as a cockpit.
- Debug overlays remain floating across the view.

Gameplay read:

- Cockpit mode is currently a camera mode, not a cockpit.
- It is useful as a debugging angle, but it does not satisfy “fleshed out cockpit.”
- It should either be renamed until implemented, or replaced with a real pilot-eye camera and separate cockpit model/instrument layer.

## Prioritized findings

### P0 — Ground contact constrains body vertical velocity instead of runway-normal/inertial vertical motion

Evidence:

- `src/sim/systems/ground.ts:62` defines `applyGroundContact()`.
- `src/sim/systems/ground.ts:75-80` clamps altitude and only sets body `velocity.w = 0`, then applies longitudinal ground decel.
- `src/sim/physics/integrate.ts:155` applies ground contact after integration.
- `src/sim/physics/derived.ts:21` computes AoA from body `w/u`.

Root cause:

On the runway, the solver treats body vertical velocity as the constrained component. But if the aircraft is pitched nose-up, forward body speed projects into inertial/NED vertical motion. With body `w = 0`, a high forward speed plus pitch can produce a large upward flight path even when the tires should still be constrained by the runway and normal force.

Impact:

- Rotation feels like “pitch equals climb.”
- The aircraft can lift or show positive VS before a realistic lift/weight/normal-force release.
- Negative AoA in climb becomes easier to produce because pitch and flight path are being distorted by contact/assist interactions.

Required direction:

- Ground contact must constrain runway-normal velocity in world/NED/runway frame while weight-on-wheels.
- Liftoff should occur when normal force unloads, not merely because pitch has projected velocity upward.
- Normal force should drive rolling friction, braking, tire side force, gear compression, and liftoff state.

### P0 — Core physics directly edits attitude through `applyPlayableTakeoffAssist()`

Evidence:

- `src/sim/physics/integrate.ts:20-21` defines early-climb pitch min/max of 5-15 degrees.
- `src/sim/physics/integrate.ts:33` defines `applyPlayableTakeoffAssist()`.
- `src/sim/physics/integrate.ts:45-55` clamps pitch to the configured early-climb range.
- `src/sim/physics/integrate.ts:162` calls this assist inside the physics integration path.

Root cause:

A playability helper bypasses aircraft dynamics by mutating pitch/quaternion and suppressing pitch rate. This was useful for recovering the P0 loop, but it is now a major reason the simulator feels unnatural.

Impact:

- W quickly lands at exactly 15 degrees.
- Rotation has no realistic rate, inertia, elevator authority curve, stabilizer trim dependency, or speed-dependent control feel.
- Tests can pass while the aircraft feels like an arcade object.

Required direction:

- Remove direct attitude mutation from core physics.
- If an assist is desired, put it outside the physics model as an explicit tutorial/arcade mode that commands pilot inputs, not aircraft attitude.
- Add virtual yoke/elevator rate limits, pitch trim, and realistic pitch-rate envelopes.

### P0 — Aero model is too linear and over-lifty for takeoff/climb realism

Evidence:

- `src/sim/systems/AeroModel.ts:25` sets `cl0: 0.65` with comment “elevated to compensate for simplified model.”
- `src/sim/systems/AeroModel.ts:30-31` uses one `cdFlap` and one `cdGear` increment.
- `src/sim/physics/aero.ts:39` computes `cl = (cl0 + clAlpha * aoa + clFlap) * clMach`.
- `src/sim/physics/aero.ts:44` computes drag from a simple quadratic polar with coarse increments.
- There is no CLmax, stall, post-stall, flap-detent polar, alpha-zero shift, or high-AoA drag rise.

Root cause:

The current polar is a broad stabilization model, not calibrated aircraft data. Flaps add a large lift increment at zero AoA, lift never saturates, drag is too weak/coarse, and configuration effects are not strong enough.

Impact:

- Flaps 5 can generate more than enough lift at zero or even negative AoA at high speed.
- Gear-down/flaps climb remains too strong.
- The aircraft can accelerate and climb in configurations that should produce strong drag/limits/warnings.

Required direction:

- Add per-flap polar data: `alpha0`, `CLalpha`, `CLmax`, `CD0`, `k`, `deltaCD`, `deltaCM`, and stall/post-stall behavior.
- Add gear/flap placard speeds and warnings.
- Add golden takeoff/climb/approach envelope tests.

### P0 — Performance model is not calibrated: thrust, mass, drag, and climb envelope are off

Evidence:

- `src/sim/physics/aero.ts:61` computes thrust from static thrust, density ratio, a `ramFactor`, and engine count.
- `src/sim/systems/engine.ts` computes engine thrust separately, but `computeAero()` does not consume the engine system’s thrust output.
- `src/sim/types.ts` initializes gross weight as empty weight plus fuel, with no payload scenario/ZFW configuration.
- Browser dogfood shows 10,000-12,000 fpm climbs at 250-300 kt with gear down/flaps 5.

Root cause:

The simulator lacks calibrated B737-like performance targets. There are no scenario-level assertions for roll distance/time, V-speeds, climb gradient, gear-down climb penalty, thrust lapse, or energy behavior.

Impact:

- The aircraft feels weightless/overpowered.
- Users cannot learn realistic pitch/speed/energy management.

Required direction:

- Define light/medium/heavy takeoff scenarios.
- Add performance envelope tests before tuning constants.
- Use one source of truth for engine thrust.
- Add payload/ZFW, CG, and temperature/altitude/Mach thrust lapse.

### P1 — Keyboard/gamepad controls are event patches, not pilot controls

Evidence:

- `src/input/keyboardControls.ts:4` uses `ELEVATOR_KEY_DEFLECTION = 1`.
- `src/input/keyboardControls.ts:16` maps W directly to full nose-up elevator and S to full nose-down.
- `src/input/keyboardControls.ts:33` toggles gear from a raw key event.
- `src/input/GamepadManager.ts:44` reads the first active gamepad directly.
- `src/input/GamepadManager.ts:67-69` computes throttle from triggers and writes throttle fields directly.
- `src/store/simStore.ts:49` merges input patches straight into the sim input object.

Root cause:

There is no normalized input action layer, no smoothing/rate limits, no trim, no control calibration, no device ownership, and no separation between pilot intent, AP commands, and effective surfaces.

Impact:

- W feels like a full-deflection arcade button.
- Neutral or connected gamepads can fight keyboard/UI commands.
- There is no fine energy/control management for takeoff, climb, approach, flare, or landing.

Required direction:

- Add an InputManager/action layer.
- Separate latched controls from self-centering controls.
- Add virtual yoke smoothing, trim, throttle lever inertia/rate, gamepad calibration, and focus guards.
- Separate `pilotInputs`, `apCommands`, and `effectiveControls`.

### P1 — Aircraft visual model is a placeholder

Evidence:

- `src/viewport/AircraftModel.ts:14` uses a simple `CylinderGeometry` fuselage.
- `src/viewport/AircraftModel.ts:35` uses box wings.
- `src/viewport/AircraftModel.ts:56` uses simple cylinder engines.
- `src/viewport/AircraftModel.ts:107-119` uses box landing gear.
- Materials are mostly grey/white/dark grey and simple `MeshBasicMaterial` instances.

Root cause:

The current model was built as a debug/procedural proxy. It has no asset pipeline or named visual parts beyond the minimal parts recently needed to prevent root rotation.

Impact:

- The aircraft does not look like a finished simulator aircraft.
- There is no cockpit window detail, livery, windows, gear doors, control surfaces, animated flaps/slats, or convincing nacelles/fans.

Required direction:

- Either import a GLB/glTF 737-style model with PBR materials and named parts, or build a significantly richer procedural v2.
- Add explicit named visual contracts and visual regression screenshots.

### P1 — Gear/fan/flap/control-surface animations are incomplete

Evidence:

- `src/viewport/aircraftModelAnimation.ts:8` applies animations.
- `src/viewport/aircraftModelAnimation.ts:21-26` only applies simplistic gear compression.
- `src/viewport/aircraftModelAnimation.ts:22` uses `position.alt < 100`, which is MSL and therefore wrong at KSEA field elevation.
- Gear meshes are always present in `src/viewport/AircraftModel.ts:107-120`.

Root cause:

Animations are placeholder transforms, not tied to a visual state model with gear transition, flap positions, control-surface deflections, weight-on-wheels, and engine fan discs.

Impact:

- Gear-down/gear-up is not visually satisfying.
- There is no visible feedback for flap/aileron/elevator/rudder commands.
- Cockpit and chase modes lack essential aircraft movement cues.

Required direction:

- Add visual state derivation and named mesh animation tests.
- Animate gear retraction, wheels, flaps/slats, spoilers, ailerons, elevators, rudder, fan discs, landing lights, beacon/strobes.

### P1 — Three/Cesium aircraft renderer rebuilds the model every frame

Evidence:

- `src/viewport/ThreeLayer.tsx:42` creates a model template once.
- `src/viewport/ThreeLayer.tsx:52` removes the previous proxy.
- `src/viewport/ThreeLayer.tsx:56` clones the model every frame.
- `src/viewport/ThreeLayer.tsx:79` registers sync on `postRender`.

Root cause:

The integration uses remove/clone/add as a transform update mechanism. That was acceptable for a lightweight debug model but will not scale to a high-detail aircraft/cockpit/animation system.

Impact:

- GC churn and potential jitter/flicker.
- Animation state is hard to preserve.
- A richer model will be expensive.

Required direction:

- Introduce an `AircraftRenderer` boundary.
- Keep a persistent model object and update transform/parts in place, or switch to a Cesium-native model path for glTF.
- Add lifecycle tests: `add()` once, no per-frame remove/add churn.

### P1 — Cockpit mode is not a cockpit

Evidence:

- `src/App.tsx:130-137` uses `chaseCameraOffset()` for cockpit and tower modes.
- `src/App.tsx:117` disables Cesium camera inputs whenever the sim is running.
- `src/viewport/ThreeLayer.tsx:173` mounted layer is always the exterior aircraft layer.
- No source file defines a cockpit shell, panel, yoke, throttle quadrant, first-person model, or integrated cockpit instruments.

Root cause:

“Cockpit” is implemented as a camera offset into/near the exterior aircraft model, not a pilot-eye view with a first-person cockpit model.

Impact:

- Cockpit mode shows black/grey obstruction and floating debug overlays.
- The user cannot mouse-look or use a cockpit as the primary flight view.

Required direction:

- Extract `CameraManager`.
- Define a tested pilot-eye anchor in aircraft body axes.
- Hide exterior model in cockpit mode or render a first-person cockpit-only shell.
- Build `CockpitLayer` / `CockpitModel` and integrate PFD/ND/MCP.

### P1 — Instruments and overlays are debug-heavy and not cockpit-ready

Evidence:

- `src/App.tsx:176-180` always renders `Telemetry`, `ControlsHelp`, `AttitudeIndicator`, `RfsPFD`, and `RfsMCP`.
- `src/components/Telemetry.tsx:29` renders raw debug telemetry.
- `src/instruments/RfsPFD.tsx:16` uses `pxPerFt = 0.018`; altitude labels can have unreadably small row heights.
- `src/instruments/RfsPFD.tsx:119-124` shows simplified HDG/P/VS text instead of a full integrated PFD/FMA.

Root cause:

The app has independent debug widgets, not presentation modes. There is no separation between developer HUD, chase HUD, and cockpit panel.

Impact:

- The screen feels cluttered and prototype-like.
- The cockpit is just overlays on top of scenery.
- Autopilot/route state is not communicated through realistic FMA/ND/MCP feedback.

Required direction:

- Add an overlay manager with modes: player/chase, cockpit, debug.
- Rebuild PFD as a coherent instrument with attitude, speed, altitude, VS, heading/track, selected bugs, FMA, and route info.
- Hide debug telemetry by default.

### P1 — MCP/autopilot route flow is visible but underimplemented

Evidence:

- `src/instruments/RfsMCP.tsx:82` creates AP state with `autopilotStatus: 'OFF'`.
- `src/instruments/RfsMCP.tsx:91` later sets `autopilotStatus = 'CMD_A'` before mode branch handling.
- First clicks can initialize without activating the intended mode.
- `src/sim/physics/integrate.ts:166-168` defaults targets to current heading/current altitude/hardcoded speed 250.
- `src/sim/physics/integrate.ts:172` calls `computeLNAV(state, flightPlan, 0)` with active index 0.
- `src/sim/systems/navigation.ts:45-52` computes `waypointReached` and `activeWaypointIndex`, but no durable store state consumes sequencing.
- `src/sim/systems/vnav.ts:24-25` exits if the waypoint has no altitude constraint.

Root cause:

At review time, there was no unified guidance/state ownership model. Display state, truth/FMA modes, selected targets, active route leg, and servo laws were loosely connected.

Impact:

- LOAD PLAN and MCP buttons look like simulator systems but do not behave predictably.
- A user cannot trust the autopilot or route UI.

Required direction:

- Add store-owned guidance/route/AP truth state with selected targets, active/armed modes, FMA, active leg, nav validity, and AP/FD/AT status. Current implementation keeps these as separate `guidance`, `routeStatus`, and `apState` slices rather than one monolithic object.
- Make first MCP click do the thing clicked.
- Disable/hide unsupported modes until they have real control laws.
- Add route/waypoint feedback and clear invalid-state messages.

### P2 — Runway/airport scene reference is insufficient

Evidence:

- `AirportLayer` exists but is not mounted in `App.tsx`.
- `docs/roadmap.md` already identifies ground/runway modeling as a major follow-up.
- Live view lacks clear runway markings, centerline, threshold, edge lights, scenario label, or takeoff alignment cues.

Root cause:

The app uses Cesium imagery but does not render a simulator-grade runway/taxiway layer or align the scenario to a visible runway start.

Impact:

- Takeoff feels disconnected from a runway environment.
- Cockpit and chase modes lack the visual references needed for rotation, rejected takeoff, or landing.

Required direction:

- Add a Cesium-native runway layer and shared runway/scenario data source.
- Spawn on runway threshold/centerline with heading, field elevation, wind, and runway label.

### P2 — Cesium/token and duplicate Three warnings reduce polish

Evidence:

- `src/config/cesium.ts:12` only sets a token from `VITE_CESIUM_ION_TOKEN`.
- `src/config/cesium.ts:21` defines `hasCesiumToken()` but it is not used by the scene policy.
- Live page shows the Cesium default-token warning.
- `package.json:21-22` depends on `three` and `three-to-cesium`.
- `vite.config.ts` has no `resolve.dedupe` for `three`.
- Browser console warns about multiple Three.js instances.

Root cause:

The deployment/scenery policy is incomplete, and dependency resolution allows duplicate Three versions.

Impact:

- The app looks unfinished because Cesium warnings overlap the UI.
- Duplicate Three imports may cause subtle rendering/material/class identity issues.

Required direction:

- Configure token or add a no-token degraded scene path.
- Dedupe Three via package overrides / Vite resolve settings / bridge upgrade.

## Reordered roadmap recommendation

The existing `docs/roadmap.md` has the right big buckets, but the observed “everything feels weird” problem requires a different near-term ordering. Product loop, cockpit, and visual quality cannot stay at P7; they are part of the core usability problem.

Recommended order:

1. Measurement and scenario-level regression harness.
2. Runway-normal ground physics and normal-force liftoff.
3. Remove core attitude assist; add input dynamics and trim.
4. Calibrate aero/engine/mass/drag envelopes.
5. Upgrade aircraft renderer/model/animations.
6. Build true cockpit camera/model and cockpit-ready instruments.
7. Rework UI into player HUD, cockpit instruments, and debug overlays.
8. Fix MCP/route/guidance truth state and FMA.
9. Add scenario/tutorial/checklist/product loop.
10. Add performance/worker/dedupe/visual regression release hardening.

## Definition of “usable” for the next milestone

A useful next milestone is not “passes tests” or “can leave runway once.” It should be:

- User chooses KSEA takeoff tutorial/scenario.
- Aircraft visibly starts on a runway centerline with correct heading and field elevation.
- START ROLL applies a realistic brake-release/spool/thrust sequence.
- Speed, distance, and acceleration are plausible for light/medium 737-like takeoff.
- ROTATE cue appears around a computed Vr.
- W/yoke input produces 2-4 deg/sec rotation, not an immediate 15-degree pitch clamp.
- Liftoff happens when lift/normal force unloads the gear.
- Initial climb with flaps 5/gear transitioning is plausible, with positive AoA and believable VS.
- Gear/flaps/control surfaces visibly move.
- Cockpit view shows a real cockpit shell and usable PFD/MCP, not a black obstruction.
- Debug telemetry is toggleable, not always the primary UI.
- Route/MCP features either work with clear FMA/feedback or are disabled until implemented.
- The loop survives reset/retry and a 60-second manual flight without losing visual reference.
