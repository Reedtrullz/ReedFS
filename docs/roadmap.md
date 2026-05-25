# RFS Enhancement Roadmap

This roadmap lists the enhancements that are still necessary after the foundation stabilization pass. It is ordered by dependency and risk: fix the aircraft/ground interaction first, then guidance, then performance architecture and rendering cleanup.

Latest comprehensive gameplay/cockpit/realism audit and detailed implementation plan:

- `docs/reviews/2026-05-26-comprehensive-gameplay-review.md`
- `docs/plans/2026-05-26-rfs-comprehensive-usability-realism-plan.md`

The 2026-05-26 review reorders near-term work slightly: product loop, cockpit, UI feedback, input feel, and visual model quality are now treated as core usability work rather than late polish, because browser dogfood showed they are part of why the simulator still feels arcadey and unfinished.

## Completed baseline

Foundation stabilization is complete:

- Quality scripts and CI release gate are in place.
- React hook/lint blockers are cleaned up.
- Quaternion attitude is authoritative and initialized consistently.
- Body/NED transforms are centralized.
- Gravity signs match body-axis conventions.
- Wind is pure air-relative input, not destructive state mutation.
- Longitudinal drag is signed against air-relative flow.
- Physics regressions are covered by unit tests.

Completion record: `docs/plans/2026-05-25-rfs-foundation-stabilization.md`.

## P1 — Ground model and takeoff/landing realism

Why this is next: without a real ground model, RFS cannot evaluate takeoff roll, rotation, touchdown, braking, taxiing, or runway handling realistically.

Scope:

- Terrain/runway AGL source.
- Landing gear station model: nose, left main, right main.
- Oleo spring-damper compression.
- Tire friction with rolling, braking, and side loads.
- Brake input and anti-skid logic.
- Nosewheel steering and rudder/tiller blending.
- Ground effect near runway.
- Flight-phase transitions: PARKED, TAXI, TAKEOFF, CLIMB, APPROACH, LANDED.

Suggested implementation files:

- `src/sim/systems/ground.ts`
- `src/sim/systems/__tests__/ground.test.ts`
- `src/sim/physics/integrate.ts`
- `src/sim/types.ts`
- `src/store/simStore.ts`

Acceptance tests:

- Parked aircraft rests on gear without sinking or bouncing uncontrollably.
- Brake input reduces groundspeed on rollout.
- Nosewheel steering changes heading during taxi at low speed.
- Rotation produces liftoff only after realistic speed/angle combination.
- Touchdown compresses gear and damps vertical velocity.
- Gear-up belly contact is explicitly handled or prevented.

## P2 — Flight guidance and RFMS integration

Why this follows ground model: the autopilot needs reliable energy/trajectory behavior before detailed LNAV/VNAV tuning is meaningful.

Scope:

- Durable active-leg state in the store.
- Waypoint sequencing with capture radius and turn anticipation.
- LNAV track intercept and cross-track error law.
- MCP selected heading/speed/altitude/vertical-speed lifecycle.
- VNAV SPD and VNAV PTH modes.
- ALT ACQ and ALT HOLD transitions.
- RFMS Flight Mode Annunciator source-of-truth integration.
- Autothrottle N1/SPEED behavior with throttle rate limits.

Suggested implementation files:

- `src/sim/systems/navigation.ts`
- `src/sim/systems/vnav.ts`
- `src/sim/systems/autopilot.ts`
- `src/store/simStore.ts`
- `src/instruments/RfsMCP.tsx`
- RFMS shared type touchpoints as needed.

Acceptance tests:

- Active waypoint advances only when the aircraft passes the sequencing gate.
- LNAV flies toward a desired track from an offset intercept.
- HDG SEL honors selected heading independent of loaded route.
- VNAV computes and tracks an altitude path over distance.
- FMA modes reflect the same state used by the servo laws.

## P3 — Physics worker and deterministic timing

Why this follows state stabilization: moving a broken state contract to a worker makes bugs harder to see. The state contract is now stable enough to serialize.

Scope:

- State codec between `AircraftState` and transferable/SharedArrayBuffer storage.
- Worker loop at a fixed simulation timestep.
- Main-thread bridge for inputs, AP state, flight plan, and wind.
- Deterministic accumulator to decouple render FPS from physics tick rate.
- Worker lifecycle and error handling in Zustand.

Suggested implementation files:

- `src/worker/codec.ts`
- `src/worker/physics.worker.ts`
- `src/worker/bridge.ts`
- `src/store/simStore.ts`
- `vite.config.ts`

Acceptance tests:

- Codec round-trips all state fields required by rendering/instruments.
- Worker produces deterministic output for fixed inputs.
- Main thread can start, pause, resume, reset, and dispose the worker.
- Inputs and weather updates are applied on worker ticks without stale closures.
- `npm run check` passes with worker enabled.

## P4 — Rendering lifecycle cleanup

Why this matters: Cesium + Three.js can be expensive; lifecycle churn will limit performance before richer scenery/aircraft models are added.

Scope:

- Single Cesium viewer provider.
- Single `three-to-cesium` bridge owner.
- Persistent aircraft object; no per-frame object reconstruction.
- Full quaternion model orientation.
- Dedicated camera manager for chase/cockpit/tower modes.
- Explicit cleanup for event listeners and post-render hooks.

Suggested implementation files:

- `src/viewport/CesiumViewport.tsx`
- `src/viewport/ThreeLayer.tsx`
- `src/viewport/AircraftModel.ts`
- `src/viewport/CameraManager.ts`
- `src/App.tsx`

Acceptance tests:

- Viewer and bridge are created once and disposed once.
- Camera modes switch without losing Cesium controls permanently.
- Aircraft orientation matches quaternion-derived roll/pitch/yaw.
- App tests cover lifecycle mocks for new Cesium/Three constructs.

## P5 — Flight-model data quality

Why this is required for realism: current coefficients are approximations. Simulator quality depends on validated aero/engine/ground data and trim behavior.

Scope:

- Move remaining hardcoded aero and moment coefficients into aircraft data.
- Add multiple aircraft spec/model interface boundaries.
- Add trim solver for steady flight conditions.
- Validate climb, cruise, approach, stall, and turn performance against references.
- Add phugoid/short-period/dutch-roll sanity tests.

Suggested implementation files:

- `src/sim/data/b737.json`
- `src/sim/systems/AeroModel.ts`
- `src/sim/physics/aero.ts`
- `src/sim/physics/__tests__/aero.test.ts`
- new trim/performance test fixtures.

Acceptance tests:

- Clean and landing-configuration stall speeds are plausible.
- Cruise trim holds near-zero pitch acceleration at representative weight/speed/altitude.
- Coordinated turn yaw/roll behavior is directionally correct.
- Engine thrust varies plausibly with altitude and Mach.

## P6 — Weather and atmosphere expansion

Scope:

- Gusts/turbulence as stochastic air-relative velocity perturbations.
- Crosswind runway tests after ground model exists.
- Cloud/visibility rendering tied to parsed METAR layers.
- QNH/temperature effects for pressure/density altitude.

Acceptance tests:

- Gust changes affect airspeed and loads without changing ground velocity directly.
- Crosswind takeoff and landing produce correct sideslip/track effects.

## P7 — Product polish

Scope:

- Scenario picker and saved flight states.
- Keyboard/gamepad settings UI.
- Better loading/error screens.
- PWA completeness if desired: manifest link, icons, service worker strategy.
- Bundle splitting for Cesium-heavy chunks.
- Visual regression testing for cockpit/instruments.

## Execution discipline

For each roadmap phase:

1. Write a focused plan in `docs/plans/`.
2. Start with regression tests for the contract being changed.
3. Run targeted tests after each task.
4. Run `npm run check` before committing.
5. If pushing to `master`, wait for GitHub Actions and verify the live endpoint before reporting success.
