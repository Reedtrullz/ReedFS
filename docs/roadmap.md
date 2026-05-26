# RFS Enhancement Roadmap

This roadmap lists the enhancements that remain after the foundation stabilization and first gameplay/usability productization pass. It is ordered by dependency and risk: finish gear/tire physics and guidance fidelity, then worker timing, visual regression/release hardening, data quality, and immersion.

Latest comprehensive gameplay/cockpit/realism audit and implementation plan:

- `docs/reviews/2026-05-26-comprehensive-gameplay-review.md`
- `docs/plans/2026-05-26-rfs-comprehensive-usability-realism-plan.md`

As of the current repository state, phases 0 through 5.5 of the 2026-05-26 plan are implemented and tested. Phase 6 release-hardening tasks remain pending.

## Completed baseline

The completed baseline now includes:

- Quality scripts and CI release gate are in place.
- React hook/lint blockers are cleaned up.
- Quaternion attitude is authoritative and initialized consistently.
- Body/NED transforms are centralized.
- Gravity signs match body-axis conventions.
- Wind is pure air-relative input, not destructive state mutation.
- Longitudinal drag is signed against air-relative flow.
- Physics regressions are covered by unit tests.
- Scenario-level takeoff/climb helpers and envelope tests exist.
- Ground state, runway-normal contact, normal-force liftoff, and flight-phase decoupling are implemented.
- Input dynamics, pilot/AP/effective-control separation, stabilizer trim, CG pitch moment, and data-backed aero/engine envelope work are implemented.
- Aircraft visual contract, persistent renderer, visual animation state, Cesium runway layer, cockpit shell, overlay modes, PFD/FMA, cockpit interaction hooks, scenario/tutorial/checklist/coach flow, guidance state, active-leg route status, LNAV feedback, and conservative VNAV/SPD/VS behavior are implemented.

Completion records:

- `docs/plans/2026-05-25-rfs-foundation-stabilization.md`
- `docs/plans/2026-05-26-rfs-comprehensive-usability-realism-plan.md`

## P1 — Finish gear/tire ground model and takeoff/landing realism

Why this remains: the current pass establishes runway-normal contact, normal-force liftoff, and phase semantics, but RFS still needs detailed gear/tire/brake behavior before touchdown, rollout, taxi, and crosswind handling can feel like an airliner.

Remaining scope:

- Landing gear station model: nose, left main, right main.
- Oleo spring-damper compression.
- Tire friction with rolling, braking, and side loads.
- Brake input and anti-skid logic.
- Nosewheel steering and rudder/tiller blending.
- Ground effect near runway.
- Touchdown, rollout, taxi, and rejected-takeoff handling.

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

## P2 — Advanced flight guidance and RFMS integration

Why this follows the current guidance pass: active-leg state, route feedback, and honest VNAV/SPD/VS are now in place, but advanced LNAV/VNAV needs the aircraft energy model and selectable cockpit controls to be more complete.

Remaining scope:

- LNAV track intercept and cross-track error law.
- Turn anticipation and RFMS-backed route edits.
- MCP selected heading/speed/altitude/vertical-speed lifecycle with knobs/values, not only mode buttons/defaults.
- Full VNAV SPD, VNAV PTH, ALT ACQ, and ALT HOLD transitions.
- Autothrottle N1 behavior in addition to SPEED behavior.
- RFMS Flight Mode Annunciator lifecycle integration beyond current truth-mode display.

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

## P4 — Release rendering hardening

Why this matters: the renderer now has a persistent aircraft, cockpit shell, camera manager, and Cesium-native runway layer. The next rendering risk is release confidence: dependency duplication and deterministic visual proof.

Remaining scope:

- Remove the browser warning from duplicate Three.js instances.
- Add deterministic visual regression snapshots for initial runway, takeoff/climb, cockpit mode, and route/PFD/MCP overlays.
- Keep lifecycle cleanup assertions for event listeners, Cesium entities, and the single Three/Cesium bridge.

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

Remaining scope:

- Scenario persistence and saved flight states.
- Keyboard/gamepad settings UI.
- Better loading/error/scenery-status screens.
- PWA completeness if desired: manifest link, icons, service worker strategy.
- Bundle splitting for Cesium-heavy chunks.
- More complete cockpit/interior model, instrument layout, and audio immersion.

## Immediate Phase 6 tasks

Track the next batch in `docs/plans/2026-05-26-rfs-comprehensive-usability-realism-plan.md`:

1. Cesium token/degraded scene policy.
2. Deduplicate Three.js.
3. Add deterministic visual regression snapshots.
4. Fixed timestep / worker migration after contracts stabilize.
5. Audio immersion pass.

## Execution discipline

For each roadmap phase:

1. Write a focused plan in `docs/plans/`.
2. Start with regression tests for the contract being changed.
3. Run targeted tests after each task.
4. Run `npm run check` before committing.
5. If pushing to `master`, wait for GitHub Actions and verify the live endpoint before reporting success.
