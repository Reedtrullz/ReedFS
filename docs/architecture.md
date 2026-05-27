# RFS Current Architecture

This document describes the implementation in the repository now. Older files under `docs/plans/` may describe target architecture or historical migration steps; use this file as the current source of truth.

## System overview

RFS runs as a browser app with main-thread simulation today:

```text
Browser
  React UI + instruments + controls
  CesiumJS globe and terrain
  Three.js aircraft/effects layer via three-to-cesium
  Zustand store for aircraft/input/AP/weather/flight-plan state
  TypeScript 6-DOF integration loop on requestAnimationFrame
```

RFMS avionics logic is not duplicated in this repo. RFS imports shared autopilot and flight-plan types from the sibling RFMS checkout through the `@shared` Vite alias.

## Runtime heartbeat

```text
src/App.tsx
  -> src/hooks/useSimLoop.ts
    -> src/store/simStore.ts tick()
      -> structuredClone(aircraft)
      -> computeRouteStatus(state, flightPlan, activeLegIndex)
      -> computeAutopilotCommandsForState(state, apState, flightPlan, dt, activeLegIndex)
      -> compose pilot inputs + AP-owned axis commands into effectiveControls
      -> src/sim/physics/integrate.ts
        1. updateEngines(state, effectiveControls, spec, dt)
        2. updateFuel(state, spec, dt)
        3. updateElectrical(state, dt)
        4. updateHydraulic(state, dt)
        5. computeAero(state, effectiveControls, spec, B737_AERO, wind)
        6. integrate angular rates, quaternion, velocity, and position
        7. update ground/contact state and flight phase
      -> recompute routeStatus / activeLegIndex
      -> rebuild GuidanceState from aircraft, scenario, status, and effective controls
      -> commit next Zustand aircraft/control/guidance snapshot
```

The system order is intentional:

- Engine and fuel update before aero so thrust and mass are current.
- Aero receives wind as an input and computes air-relative values without mutating state.
- Pilot inputs, AP commands, and effective controls are separate store fields; AP can own elevator/aileron/throttle without mutating pilot-authored inputs.
- Route status is store-owned and computed before and after integration so LNAV/VNAV use the active leg instead of hardcoded waypoint fallbacks.

## State model

`AircraftState` contains:

- Geodetic position: latitude, longitude, altitude in feet.
- Body velocity: `u`, `v`, `w` in m/s, ground-relative.
- Euler attitude: `phi`, `theta`, `psi`, kept for compatibility and display users.
- Quaternion attitude: authoritative attitude used by integration and display boundaries.
- Angular velocity: `p`, `q`, `r` in rad/s.
- Derived values: IAS/TAS/GS/Mach/VS/AoA/Beta, recomputed from state and wind.
- Engine, fuel, electrical, hydraulic, config, and flight phase data.

`B737_800_SPEC` is loaded from the versioned data module `src/sim/data/aircraft/b737-800.v1.ts`; the exported data version pins the mass, geometry, propulsion, inertia, fuel, CG, and baseline performance numbers used by the runtime. `src/sim/data/performance/b737TrimFixtures.ts` and `src/sim/physics/trimSolver.ts` provide the first level-flight pitch-trim fixture and solver guard for future coefficient tuning. `src/sim/data/performance/b737PerformanceCards.ts` pins scenario-specific V-speeds plus clean-climb and approach envelopes that are asserted against current physics.

Quaternion is authoritative. `integrate()` updates quaternion from body rates, normalizes it, then mirrors Euler angles from the normalized quaternion.

## Coordinate and velocity contracts

```text
Body axes: x forward, y right, z down
NED axes:  north, east, down
```

Contracts that must not be broken:

- `state.velocity` is ground-relative body-frame velocity.
- `computeAirRelativeVelocity(state, wind)` returns a new body-frame velocity and does not mutate `state.velocity`.
- Aero, TAS, IAS, Mach, angle of attack, and sideslip use air-relative velocity.
- Ground speed and vertical speed use ground-relative velocity transformed to NED.
- METAR wind direction is treated as where the wind is coming FROM.
- Longitudinal drag uses signed `dragBodyX` so reverse-flow and tailwind cases oppose the air-relative flow direction.

See `docs/physics-invariants.md` for the detailed checklist and test locations.

## Rendering architecture

RFS renders with Cesium plus a focused Three.js overlay:

- `CesiumViewport.tsx` owns the Cesium viewer lifecycle and base globe/terrain setup.
- `config/cesium.ts` defines the scene policy: with `VITE_CESIUM_ION_TOKEN`, RFS enables Cesium World Terrain and OSM buildings; without it, RFS disables Ion terrain/imagery/buildings, uses degraded ellipsoid scenery, and `SceneStatus.tsx` shows a visible banner.
- `RunwayLayer.tsx` renders the KSEA runway/centerline as Cesium-native entities instead of a ground-attached Three overlay.
- `ThreeLayer.tsx` owns a single `three-to-cesium` bridge for the exterior aircraft and lights.
- `AircraftRenderer.ts` keeps the aircraft object persistent and updates transform/animation state each frame.
- `CockpitLayer.tsx` and `CockpitModel.ts` provide the first-pass pilot-eye cockpit shell for cockpit camera mode.
- `CameraManager.ts` owns chase/cockpit camera updates from Cesium `preRender` so follow cameras stay live while the sim runs.
- `CloudLayer.tsx` and `ContrailLayer.tsx` add scene content and effects.

Known rendering follow-up:

- The dependency guard enforces a single Three.js copy before build/test to avoid `instanceof` and bridge mismatch bugs.
- Playwright visual regression snapshots cover deterministic initial chase/cockpit views in CI.
- Continue improving the procedural 737 and cockpit model fidelity.

## Avionics and guidance architecture

RFS bridges RFMS-compatible avionics state into native physics and player-facing feedback:

- `RfsMCP.tsx` edits RFMS-compatible selected speed/heading/altitude/vertical-speed targets, creates a default AP state on first valid mode/target click, and keeps unsupported modes hidden.
- `RfsPFD.tsx` renders readable speed/altitude tapes, attitude/heading, and an FMA row from the same truth modes the servo laws use.
- `App.tsx` can load the KSEA -> OLM -> BTG -> KPDX sample route. LOAD PLAN applies the safe LNAV + SPEED + ALT_HOLD defaults only in the stopped/PARKED preflight state; during a running takeoff it stores the route without auto-commanding AP modes.
- `navigation.ts` validates route coordinates/discontinuities, computes store-owned active-leg status including signed cross-track/along-track metrics, estimates next-leg turn angle/anticipation distance, and sequences the active leg.
- `RouteStatus.tsx` exposes active leg, next waypoint, DTG, track, ETA, and LNAV unavailable reasons.
- `autopilot.ts` maps active RFMS truth modes to AP-owned control commands. LNAV uses the store-owned active route leg plus a capped cross-track intercept law; VNAV uses the active route leg constraints. Invalid route status does not fall back to waypoint 0.
- `vnav.ts` reports VNAV availability, unavailable reasons, altitude targets, target vertical speed, speed constraints, and the conservative VNAV_PTH -> ALT* -> ALT_HOLD path lifecycle for actionable altitude constraints.
- `GuidanceState` combines scenario phase, tutorial, checklist, coach messages, and alerts for the player-facing flow; route status and AP truth remain adjacent store-owned state used by `RouteStatus`, `RfsPFD`, and the servo laws.
- `scenarioPersistence.ts` saves cloneable scenario snapshots to `localStorage`, and `ScenarioPanel` exposes SAVE/LOAD controls with visible ignored/corrupt-save feedback. Running saves restore as paused so training loops do not surprise-resume.
- `controlBindings.ts`, `ControlsHelp`, and collapsed-by-default `ControlsSettings` provide a validated, visible keyboard/gamepad binding model for repeated play without covering primary instruments unless expanded.

Known guidance follow-up:

- Use turn anticipation metrics to advance LNAV guidance before leg transitions and add RFMS-backed route edits.
- Wire VNAV path lifecycle transitions into live AP truth/FMA updates once a gated VNAV MCP control is exposed.

## Weather architecture

- `weather.ts` parses optional METAR gust speed into `WindInfo.gustSpeed`.
- `environment.ts` converts METAR wind to NED then to body axes, and layers deterministic seeded gust perturbations onto air-relative velocity only.
- `computeAirRelativeVelocity()` subtracts wind/gust from ground-relative body velocity and returns a new object.
- Wind/gust never mutate `state.velocity`; position, GS, and VS remain ground-relative while TAS/IAS/AoA/beta use the perturbed air-relative vector.

## Ground model architecture

- `GroundState` carries per-station nose/left-main/right-main gear data: body-axis station position, static load fraction, compression, normal force, brake capability, steerability, and steering angle.
- `ground.ts` distributes normal force across gear stations, computes rolling friction, anti-skid-limited symmetric/asymmetric brake forces, and normal-force-scaled tire side forces from loaded stations, fades nosewheel steering out as speed rises, prevents stationary steering from creating motion, and records touchdown sink rate.
- `simStore.abortTakeoff()` gives the player a rejected-takeoff control path: idle both throttles, full brakes/spoilers, AP disconnected, sim kept running for the braking rollout, and guidance moves to `rejected-takeoff`.
- `applyGroundContact()` remains a post-solve runway constraint: it prevents sink-through, constrains runway-normal velocity, damps first-contact angular rates, applies tire rollout forces, and leaves airborne/free-flight equations untouched.
- `aero.ts` applies a conservative ground-effect model below one wingspan AGL: modest lift increase plus induced-drag relief, without changing the wind/air-relative velocity contract.
- `integrate.ts` transitions APPROACH/DESCENT to LANDED on gear touchdown and keeps TAKEOFF->CLIMB gated on positive rate away from the runway.

## Audio architecture

- `audioMapping.ts` contains pure mappings for gain clamping, engine N1 -> oscillator parameters, and GPWS speech parameters.
- `AudioEngine.ts` owns the `AudioContext`, master/engine/cockpit buses, explicit `start()`, idempotent `dispose()`, and lifecycle status reporting.
- `App.tsx` exposes the `AUDIO: OFF/ON` control. Mounting the app does not start or resume Web Audio; the player must click the audio control to satisfy browser autoplay policy.
- `useAudioLoop(true)` creates engine oscillators, updates them from sim state each RAF, and runs GPWS callout checks. When disabled, no audio loop or engine oscillators are created.

## Quality and release architecture

Local gate:

```bash
source ~/.nvm/nvm.sh && nvm use 22
npm run check
```

CI gate:

```text
npm run lint:ci
npm run typecheck
npm run test
npm run build
```

Deployment pipeline:

```text
push master
  -> GitHub Actions test
  -> GHCR publish ghcr.io/reedtrullz/rfs:latest
  -> SSH deploy to VPS
  -> canary on localhost:3004
  -> promote to localhost:3005 after health check
  -> Caddy serves https://fly.reidar.tech
```

## Not implemented yet

These are intentional gaps, not regressions:

1. Advanced gear/tire model details: normal-force-scaled tire side-load/cornering stiffness, anti-skid brake limiting, and asymmetric brake-force helpers are now in the ground model; remaining gaps include dynamic oleo spring/damper response, broader crosswind scenario coverage, player-facing differential brake controls if desired, and non-runway surface support beyond the current station/load/friction/brake/side-load/steering/touchdown model.
2. Worker physics: codec and worker entry scaffolding exist, and `VITE_RFS_WORKER_PHYSICS` is parsed as an experimental/default-off runtime flag for future wiring. The active runtime still uses main-thread physics; no `simStore` tick migration or runtime Worker bridge is enabled yet.
3. Advanced flight guidance: RFMS route edits and wiring turn-anticipation/VNAV lifecycle metrics into live AP truth/FMA updates beyond the current conservative target laws.
4. Data-driven flight model: the B737-800 baseline spec is versioned, but validated aircraft coefficient tables and trim/response tests remain future work.
5. Audio immersion: explicit Web Audio startup and deterministic mapping are in place; richer engine/cockpit/airframe sound layers remain future work.
