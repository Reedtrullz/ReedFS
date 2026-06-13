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
      -> computeAutopilotCommandsForState(state, apState, flightPlan, dt, routeStatus.activeLegIndex, routeStatus)
      -> compose pilot inputs + AP-owned axis/throttle commands into effectiveControls
      -> src/sim/physics/integrate.ts
        1. updateEngines(state, effectiveControls, spec, dt)
        2. updateFuel(state, spec, dt)
        3. updateElectrical(state, dt)
        4. updateHydraulic(state, dt)
        5. computeAero(state, effectiveControls, spec, B737_AERO, wind)
        6. integrate angular rates, quaternion, velocity, and position
        7. sample supported-airport runway/off-runway surface, then update ground/contact state and flight phase
      -> recompute routeStatus / activeLegIndex
      -> rebuild phase-aware GuidanceState/checklist/tutorial state from aircraft, scenario, status, and effective controls
      -> commit next Zustand aircraft/control/guidance snapshot
```

The system order is intentional:

- Engine and fuel update before aero so thrust and mass are current.
- Aero receives wind as an input and computes air-relative values without mutating state.
- Surface sampling and friction scaling are ground-contact-only concerns: they may change tire/brake/side forces, but they must not mutate wind inputs or air-relative velocity.
- Pilot inputs, AP commands, and effective controls are separate store fields; AP can own elevator/aileron/throttle without mutating pilot-authored inputs.
- Route status is store-owned and computed before and after integration. The pre-integration route status is passed into AP command resolution, and AP/FMA route-mode logic both use the shared route-status-to-`NavOutput` conversion instead of hardcoded waypoint fallbacks.

## State model

`AircraftState` contains:

- Geodetic position: latitude, longitude, altitude in feet.
- Body velocity: `u`, `v`, `w` in m/s, ground-relative.
- Euler attitude: `phi`, `theta`, `psi`, kept for compatibility and display users.
- Quaternion attitude: authoritative attitude used by integration and display boundaries.
- Angular velocity: `p`, `q`, `r` in rad/s.
- Derived values: IAS/TAS/GS/Mach/VS/AoA/Beta, recomputed from state and wind.
- Engine, fuel, electrical, hydraulic, config, and flight phase data.

`B737_800_SPEC` is loaded from the versioned data module `src/sim/data/aircraft/b737-800.v1.ts`; the exported data version pins the mass, geometry, propulsion, inertia, fuel, CG, and baseline performance numbers used by the runtime. `src/sim/data/performance/b737TrimFixtures.ts` and `src/sim/physics/trimSolver.ts` provide a clearly labeled test-only pitch-trim fixture and solver guard for future coefficient tuning. `src/sim/data/performance/b737PerformanceCards.ts` pins scenario-specific V-speeds plus clean-climb and approach envelopes with explicit runtime/test ownership metadata; the rotate cue and player-facing PFD takeoff-reference strip consume the V-speed cards for every playable scenario.

`src/sim/data/aircraft/b737-800-fdm.v1.ts` is the current B737-800 flight-dynamics-data shell. It includes a source-lineage manifest (`lineage.sourceReferences`) plus per-section `FdmSourceMetadata` on the top-level aero model, configuration-transit model, engine model, each gear station, and the ground model. Each section declares `sourceQuality`, `sourceRefs`, `claimBoundary`, and `lastReviewed` so the runtime data can be audited without implying higher fidelity than the sources support. As of the 2026-06-13 review, the B737 FDM aero coefficients — including speedbrake drag and spoiler positive-lift-dump fraction — flap/gear transit rates, engine spool/fuel-flow/thrust-lapse table values, gear-station constants, tire/brake/steering/contact values, and ground-handling values remain gameplay-placeholder values preserved for simulator behavior; they are not certified, not AFM data, not an AFM table, and not Boeing-published operating/performance data.

`ControlInputs` keeps `brake` as the backward-compatible symmetric brake channel and adds optional `leftBrake`/`rightBrake` side channels. Ground physics treats missing side-specific brake fields as zero, so stored snapshots from older versions restore without stale differential braking. `ControlInputs.flapLever` and `ControlInputs.gearLever` are commanded positions; `AircraftConfig.flapSetting` and `AircraftConfig.gearPosition`/`gearDown` are actual state that moves through the FDM configuration-transit model, with legacy snapshots normalized from the old boolean `gearDown` shape.

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

- `CesiumViewport.tsx` owns the Cesium viewer lifecycle and base globe/terrain setup; it is lazy-loaded behind `LoadingScreen` so Cesium does not inflate the initial app surface.
- `config/cesium.ts` defines the scene policy: with `VITE_CESIUM_ION_TOKEN`, RFS enables Cesium World Terrain and OSM buildings; without it, RFS disables Ion terrain/imagery/buildings, uses degraded ellipsoid scenery, and `SceneStatus.tsx` shows a visible banner.
- `RunwayLayer.tsx` renders the KSEA runway/centerline as Cesium-native entities instead of a ground-attached Three overlay.
- `ThreeLayer.tsx` owns a single `three-to-cesium` bridge for the exterior aircraft and lights.
- `AircraftRenderer.ts` keeps the aircraft object persistent and updates transform/animation state each frame.
- `CockpitLayer.tsx` and `CockpitModel.ts` provide the first-pass pilot-eye cockpit shell for cockpit camera mode. Cockpit raycast metadata now separates real click actions from explicit unavailable placeholders: throttle/flap/gear/speedbrake controls patch pilot inputs, the MCP panel toggles FD L through the same AP state path as the 2D MCP, and the yoke reports an unavailable reason instead of silently no-oping.
- `CameraManager.ts` owns chase/cockpit camera updates from Cesium `preRender` so follow cameras stay live while the sim runs.
- `CloudLayer.tsx` uses scenario-authored METAR/cloud metadata: `App.tsx` supplies the selected scenario cloud seed and cloud anchor, so generated cloud billboard layouts are deterministic per scenario instead of tied to global randomness or a hard-coded KSEA origin. `ContrailLayer.tsx` adds aircraft effects; both are part of the lazy viewport surface set.
- `App.tsx` lazy-loads Cesium/Three viewport surfaces, cockpit/debug overlays, and MCP/PFD instrument surfaces; `RfsLayout.tsx` owns the fixed overlay layout slots, `data-rfs-panel` hooks, responsive breakpoints, debug scroll lane, and Cesium-credit-safe bottom reservation so product panels do not fight direct fixed positioning. `vite.config.ts` pins manual chunks for Cesium, Three, React/Zustand, and generic vendor code, with a documented 550 kB ceiling for the isolated Three.js vendor chunk while keeping the app/index chunk small.

Known rendering follow-up:

- The dependency guard enforces a single Three.js copy before build/test to avoid `instanceof` and bridge mismatch bugs.
- Playwright visual regression snapshots cover deterministic initial chase/cockpit views in CI.
- Continue improving the procedural 737 and cockpit model fidelity.

## Avionics and guidance architecture

RFS bridges RFMS-compatible avionics state into native physics and player-facing feedback:

- `RfsMCP.tsx` edits RFMS-compatible selected speed/heading/altitude/vertical-speed targets, creates an unbacked default AP state for target/FD switch clicks, backs CMD A only when a real AP mode is engaged, exposes clickable FD L/R, SPD, and N1 buttons because those backed controls now exist, keeps the Boeing `speedMode` and `n1` flags mutually exclusive, and keeps unsupported modes hidden.
- `RfsPFD.tsx` renders readable speed/altitude tapes, attitude/heading, low-altitude radio-altitude awareness, selected/managed MCP target strip/tape/footer bugs, honest FD command bars for supported direct HDG SEL/ALT HOLD modes, and an FMA row from the same truth modes the servo laws use. Route-mode FMA truth uses the same route-status-to-`NavOutput` conversion as AP LNAV/VNAV; FD bars consume the shared guidance target bank from `guidanceTargets.ts` instead of recomputing independent AP targets; `N1` is shown from `apState.truth.thrustActive`, not from a cosmetic flag. PFD/debug telemetry selectors subscribe to primitive values to avoid overlay churn.
- `App.tsx` can load the KSEA -> OLM -> BTG -> KPDX sample route. LOAD PLAN applies the safe LNAV + SPEED + ALT_HOLD defaults only in the stopped/PARKED preflight state; during a running takeoff it stores the route without auto-commanding AP modes.
- `flightPlanLoader.ts` keeps the KSEA sample route as a canned source, and `fms/routeAdapter.ts` defines the RFMS-compatible route-edit seam around the shared `FlightPlan` shape: route sources, staged draft operations, DIRECT_TO, explicit DISCONTINUITY insertion, undo, and EXEC are pure data operations. This is not a CDU implementation yet; it prevents canned routes from being the whole FMS boundary while preserving route-status/LNAV ownership in the store.
- `navigation.ts` validates route geometry, computes cross-track/along-track/desired-track/turn metrics, and sequences legs on capture radius, passed-waypoint geometry, or a bounded turn-anticipation gate.
- `RouteStatus.tsx` exposes active leg, next waypoint, DTG, track, ETA, and LNAV unavailable reasons.
- `autopilot.ts` maps active RFMS truth modes to AP-owned control commands. AP LNAV consumes the pre-integration store-owned route status passed by the simulation step, converts it through the shared `routeStatusToNavOutput()` helper, uses a capped cross-track intercept law, and does not fall back to invalid routes; VNAV uses the active route leg constraints. `guidanceTargets.ts` is the shared target bank for AP and FD consumers: backed lateral/vertical/thrust truth becomes heading/altitude/vertical-speed/speed/N1 targets once, while unsupported or unbacked axes stay null. AP thrust modes include SPEED airspeed hold and a separate conservative phase-based N1 target mode; both write rate-limited AP-owned throttle commands, and N1 only commands symmetric throttles when `boeing.autothrottleArm` is true, using target N1 versus average current engine N1 instead of the SPEED airspeed-error law.
- `simulationStep.ts` and `simStore.ts` compose pilot inputs, AP commands, and effective controls through the shared backed/effective autoflight truth. Active ticks, flight-plan updates, manual-input sanitization, `setApState()`, and saved-scenario restore all gate AP command ownership on `deriveEffectiveAutoflightTruth()`/`effectiveAutopilotIsEngaged()` rather than raw `apState.truth.autopilotStatus`, so a malformed or restored raw `CMD_A` state with unbacked command-channel flags cannot apply stale elevator/aileron/throttle AP commands while the FMA/PFD truth is OFF.
- `vnav.ts` looks ahead over the remaining route, resolves future altitude/speed constraints, reports target waypoint/distance/TOD metadata, and exposes an explicit lifecycle (`ARMED`, `PATH`, `ALT_CAPTURE`, `ALT_HOLD`, `SPEED_ONLY`, `COMPLETE`). Armed pre-TOD VNAV stays truthfully shown as VNAV without AP/PFD pitch commands; speed-only constraints expose managed speed metadata/display without vertical VNAV/FMA pitch guidance; PATH/ALT* provide conservative vertical-speed targets, and managed ALT_HOLD preserves the VNAV constraint altitude instead of reverting to the MCP window.
- `GuidanceState` combines scenario phase, tutorial, checklist, coach messages, and alerts for the player-facing flow. It derives preflight/takeoff-roll/rotation/rejected-takeoff/positive-rate/climb plus approach/landing-rollout/landed phases and uses those phases to auto-select checklist and tutorial state while preserving explicit tutorial-step overrides. Landing guidance is intentionally scoped to honest approach, rollout, and reset prompts; route status and AP truth remain adjacent store-owned state used by `RouteStatus`, `RfsPFD`, and the servo laws.
- `scenarioPersistence.ts` saves cloneable scenario snapshots to `localStorage`, and `ScenarioPanel` exposes SAVE/LOAD controls with visible ignored/corrupt-save feedback. Running saves restore as paused so training loops do not surprise-resume.
- `controlBindings.ts`, `ControlsHelp`, and collapsed-by-default `ControlsSettings` provide a validated, visible keyboard/gamepad binding model for repeated play without covering primary instruments unless expanded; `Space` remains symmetric brakes while `Z`/`X` are momentary left/right brake controls that clear on release, blur, visibility change, and cleanup. Manual AP disconnect/override clears stale Boeing thrust flags for both `speedMode` and `n1`, and unbacked raw AP states are not treated as active control owners.

Known guidance follow-up:

- Add RFMS-backed route edits and route modification UI.
- Wire VNAV path lifecycle transitions into live AP truth/FMA updates once gated VNAV/LVL CHG/FMA lifecycle controls are exposed.

## Weather architecture

- `weather.ts` defines scenario-authored weather metadata (`stationIcao`, fallback QNH/temperature/visibility/clouds, deterministic gust/cloud seeds, and cloud anchor), converts it into fallback METAR data, and parses optional METAR gust speed plus scenario gust seed into `WindInfo`.
- `App.tsx` fetches METAR from the selected scenario station (for example KPDX scenarios query KPDX instead of hard-coded KSEA), uses scenario fallback METAR while the external proxy is absent/unavailable, and passes scenario cloud seed/anchor to `CloudLayer.tsx`.
- `aero.ts` derives density-altitude atmosphere from selected scenario QNH and surface temperature for the physics solve while preserving the existing ISA path when no scenario weather is supplied.
- `environment.ts` converts METAR wind to NED then to body axes, and layers deterministic seeded gust perturbations onto air-relative velocity only.
- `computeAirRelativeVelocity()` subtracts wind/gust from ground-relative body velocity and returns a new object.
- Wind/gust never mutate `state.velocity`; position, GS, and VS remain ground-relative while TAS/IAS/AoA/beta use the perturbed air-relative vector.
- Fixed-step scenario tests can inject deterministic wind/weather to assert crosswind takeoff/weathercocking, crosswind approach/touchdown/rollout, and density-altitude behavior without changing the wind contract.

## Ground model architecture

- `GroundState` carries per-station nose/left-main/right-main gear data: body-axis station position, static load fraction, compression, normal force, brake capability, steerability, and steering angle.
- `runwaySurface.ts` classifies the current geodetic position against supported-airport runway rectangles and returns either prepared `runway` contact data or `offRunway` ground data with rolling/brake/side friction scales plus runway-edge metadata (`alongTrackM`, `lateralOffsetM`, `runwayHalfWidthM`) for edge/excursion assertions. `src/viewport/runwayData.ts` exports KSEA and KPDX runways through `SUPPORTED_RUNWAYS` (KPDX 10L/28R, 10R/28L, and 03/21); `sampleSupportedAirportSurface()` samples that catalog, while `sampleKseaSurface()` remains a KSEA-only compatibility wrapper. Off-runway elevation fallback uses the nearest supported runway footprint/reference and is still a simplified runway-reference model, not terrain mesh collision or arbitrary airport surface coverage.
- `ground.ts` distributes normal force across gear stations, computes dynamic oleo spring/damper compression loads, rolling friction, anti-skid-limited symmetric/asymmetric brake forces, and normal-force-scaled tire side forces from loaded stations, scales those rolling/brake/side forces by the sampled surface, limits current rudder-pedal nosewheel steering to B737 pedal-scale authority while fading it out as speed rises, prevents stationary steering from creating motion, adds gear-up runway-tangent belly/crash slide deceleration and angular damping, and records touchdown sink rate. `brakeCommandFromInputs()` clamps `brake`/`leftBrake`/`rightBrake` and commands each main gear with `max(global brake, side brake)`, so symmetric braking remains yaw-neutral while side-specific brakes can yaw only when the aircraft is actually rolling; stopped side-brake commands produce no active brake force/yaw, and reverse rolling reverses yaw sign through the rolling direction.
- `simStore.abortTakeoff()` gives the player a rejected-takeoff control path: idle both throttles, full brakes/spoilers, AP disconnected, sim kept running for the braking rollout, and guidance moves to `rejected-takeoff`.
- `applyGroundContact()` remains a post-solve ground constraint: it prevents sink-through at the sampled supported-airport ground elevation, constrains runway-normal velocity, treats `GroundState.onRunway` as prepared-runway surface status rather than generic ground contact, keeps off-runway `gear`, `belly`, or `crashed` contact explicit instead of making the aircraft silently airborne outside a runway rectangle, damps first-contact angular rates, applies tire rollout forces for gear contact, applies runway-tangent belly/crash slide damping for gear-up contact, and leaves airborne/free-flight equations untouched.
- `aero.ts` applies a conservative ground-effect model below one wingspan AGL: modest lift increase plus induced-drag relief, without changing the wind/air-relative velocity contract.
- `integrate.ts` samples supported-airport surfaces before near-ground/liftoff checks and after position integration for ground contact, transitions APPROACH/DESCENT to LANDED on gear touchdown, and keeps TAKEOFF->CLIMB gated on positive rate using the current sampled `state.ground.groundAltFt` instead of a legacy KSEA-only elevation constant.

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

Browser proof:

- `e2e/rfs-flight.spec.ts` proves ENVA takeoff roll to clean climb with phase-aware guidance and gear-up state, separately proves a scoped ENVA short-final approach state touches down through the real physics/ground-contact path, rolls out slower under braking, and returns to a clean reset state, proves a scoped KPDX short-final approach-to-touchdown/rollout/reset browser proof on a prepared runway, and proves a seeded ENVA DESCENT-to-configured-approach/landing bridge in one browser store session without resetting between descent and landing.
- `e2e/rfs-route.spec.ts` proves the KSEA sample route loads in-browser, exposes backed LNAV, decreases DTG while the route leg is flown, sequences the first and second KSEA route legs while backed LNAV/FMA truth remains active, runs a single-store multi-gate route progression proof through the OLM and BTG gates, starts on the final BTG->KPDX leg to configure an airborne approach with CMD A + LNAV + SPEED still backed while vertical FMA remains OFF, proves a scoped configured-approach-to-manual-handoff state where AP/FMA/thrust truth is OFF, AP command ownership is empty, and pilot/effective axes match while the final route leg remains loaded, separately proves reset cleanup after that manual handoff clears the route, AP state, FMA/AP modes, AP commands, running status, and guidance back to preflight without mixing reset state into active-route samples, bridges the KSEA final route configured approach/manual AP-FMA-thrust OFF handoff into a same-store KPDX 10L short-final manual landing, braking rollout, and reset cleanup proof whose KPDX short-final landing snapshots recompute near-destination route status instead of carrying stale pre-seed BTG->KPDX distance, and now adds an extended pre-handoff final-route descent segment that stays on BTG->KPDX with CMD A + LNAV + SPEED backed, vertical FMA OFF, airborne approach guidance, and at least 1.0 NM / 300 ft additional closure before the truthful manual handoff into that KPDX 10L landing bridge. These are clean-climb, scoped short-final approach-to-touchdown/rollout/reset, seeded descent-to-approach/landing bridge, scoped route-progression, scoped final-leg configured-approach, scoped configured-approach-to-manual-handoff-and-reset, KSEA-to-KPDX landing bridge with recomputed KPDX short-final route status, and extended pre-handoff route-coupled descent bridge proofs, not full-flight, full-route, route-coupled KPDX landing, continuous route-coupled descent/approach/landing, VNAV, CI, deploy, or live claims.

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

1. Advanced gear/tire model details: dynamic oleo spring/damper compression loads, normal-force-scaled tire side-load/cornering stiffness, anti-skid brake limiting, asymmetric brake-force helpers, rollout/taxi/crosswind landing regressions, player-facing differential brake controls, gear-up runway-tangent belly/crash slide damping, and supported KSEA/KPDX prepared-runway/off-runway rectangle sampling with friction scaling are now in the ground model; remaining gaps are deeper ground-handling tuning, broader terrain mesh collision, additional airports beyond KSEA/KPDX, and richer airport surface coverage outside prepared runway rectangles.
2. Worker physics: codec and worker entry scaffolding exist, `src/sim/simulationRuntime.ts` provides a main-thread runtime plus worker-handler parity adapter, and `VITE_RFS_WORKER_PHYSICS` is parsed as an experimental/default-off flag for future browser-Worker wiring. The active runtime still uses main-thread physics; no default-on browser Worker migration is enabled yet, and no SharedArrayBuffer/COOP/COEP dependency is introduced.
3. Advanced flight guidance: RFMS-backed route edits, route modification UI, and VNAV/LVL CHG/FMA lifecycle controls beyond the current conservative target laws remain future work.
4. Data-driven flight model: the B737-800 baseline spec and FDM data shell are versioned, and the FDM shell now carries per-section source-lineage metadata. Validated aircraft coefficient tables, certified/manufacturer-backed replacements for the gameplay-placeholder FDM values, and deeper trim/response tests remain future work.
5. Audio immersion: explicit Web Audio startup and deterministic mapping are in place; richer engine/cockpit/airframe sound layers remain future work.
