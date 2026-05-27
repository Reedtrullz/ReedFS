# RFS Enhancement Roadmap

This roadmap lists the enhancements that remain after the foundation stabilization and first gameplay/usability productization pass. It is ordered by dependency and risk: finish gear/tire physics and guidance fidelity, then worker timing, visual regression/release hardening, data quality, and immersion.

Latest comprehensive gameplay/cockpit/realism audit, implementation plan, and release-hardening dogfood report:

- `docs/reviews/2026-05-26-comprehensive-gameplay-review.md`
- `docs/plans/2026-05-26-rfs-comprehensive-usability-realism-plan.md`
- `docs/reviews/2026-05-26-rfs-release-hardening-playability-review.md`

As of the current repository state, the release-hardening/playability sequence through Task 10.4 is implemented and locally dogfooded. The remaining roadmap is now advanced realism, AP/route phase honesty, visual/layout polish, and deploy verification.

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
- Ground state, KSEA prepared-runway/off-runway surface sampling, runway-normal contact, off-runway friction scaling, normal-force liftoff, and flight-phase decoupling are implemented.
- Input dynamics, pilot/AP/effective-control separation, stabilizer trim, CG pitch moment, and data-backed aero/engine envelope work are implemented.
- Aircraft visual contract, persistent renderer, visual animation state, Cesium runway layer, cockpit shell, overlay modes, PFD/FMA, cockpit interaction hooks, scenario/tutorial/checklist/coach flow, guidance state, active-leg route status, LNAV feedback, conservative VNAV/SPD/VS behavior, rejected-takeoff abort flow, scenario persistence, controls settings, deterministic gusts, rollout/taxi/crosswind landing regressions, player differential brake controls, versioned B737 data, trim fixtures, and performance-card assertions are implemented.

Completion records:

- `docs/plans/2026-05-25-rfs-foundation-stabilization.md`
- `docs/plans/2026-05-26-rfs-comprehensive-usability-realism-plan.md`
- `docs/plans/2026-05-27-rfs-advanced-gear-tire-ground-handling.md`
- `docs/plans/2026-05-27-rfs-surface-aware-ground-handling.md`
- `docs/plans/2026-05-27-rfs-rollout-taxi-crosswind-controls.md`

## P1 — Finish gear/tire ground model and takeoff/landing realism

Why this remains: the current pass establishes runway-normal contact, prepared-runway/off-runway KSEA surface sampling, off-runway rolling/brake/side friction scaling, normal-force liftoff, phase semantics, normal-force-scaled tire side-load/cornering stiffness, anti-skid brake limiting, asymmetric brake-force helpers, dynamic oleo spring/damper compression loads, rudder-pedal-limited nosewheel steering, deterministic crosswind/weathercocking takeoff-roll regressions, KSEA 16L low-speed taxi, crosswind approach/touchdown/rollout and rollout-braking regressions, player-facing side-specific differential brake controls, and gear-up runway-tangent belly/crash slide deceleration/damping. RFS still needs deeper ground-handling tuning and broader contact/surface coverage before touchdown, rollout, taxi, and crosswind handling can feel fully like an airliner.

Remaining P1 scope:

- Deeper rollout, taxi, touchdown, braking, and crosswind tuning beyond the current deterministic guard scenarios.
- Broader terrain mesh collision.
- Non-KSEA airport surface coverage beyond the current KSEA runway/off-runway rectangle model.

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
- Symmetric brake remains yaw-neutral; side-specific brakes yaw only while rolling and reverse yaw sign when rolling backward.
- KSEA 16L taxi, crosswind approach/touchdown/rollout, and rollout-braking sanity scenarios remain deterministic.
- Rotation produces liftoff only after realistic speed/angle combination.
- Touchdown compresses gear and damps vertical velocity.
- Gear-up belly/crash contact remains explicit, damps runway-tangent slide without reversing, and preserves hard `crashed` state across fixed-step updates.

## P2 — Advanced flight guidance and RFMS integration

Why this follows the current guidance pass: active-leg state, route feedback, and honest VNAV/SPD/VS are now in place, but advanced LNAV/VNAV needs the aircraft energy model and selectable cockpit controls to be more complete.

Remaining scope:

- RFMS-backed route edits and route modification UI.
- Use turn anticipation metrics to advance LNAV guidance before leg transitions.
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

- Worker codec, feature flag, and worker entry scaffolding exist.
- Remaining: main-thread bridge for inputs, AP state, flight plan, wind, lifecycle errors, and actually enabling the worker path.
- Keep the fixed-timestep accumulator and deterministic main-thread tests green while migrating.

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

- Keep lifecycle cleanup assertions for event listeners, Cesium entities, and the single Three/Cesium bridge.
- Bundle splitting for Cesium-heavy chunks; current build still warns about >500 kB chunks.

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

- Move remaining hardcoded aero and moment coefficients into versioned aircraft/aero data.
- Add multiple aircraft spec/model interface boundaries.
- Expand trim/performance cards into validated reference tables for climb, cruise, approach, stall, turn, and engine lapse behavior.
- Add phugoid/short-period/dutch-roll sanity tests.

Suggested implementation files:

- `src/sim/data/aircraft/b737-800.v1.ts`
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

- Deterministic gusts now perturb air-relative velocity without mutating ground velocity, and fixed-step scenario regressions cover direct-crosswind weathercocking takeoff rolls plus crosswind approach/touchdown/rollout.
- Remaining: cloud/visibility rendering tied to parsed METAR layers and QNH/temperature effects for pressure/density altitude. Deeper crosswind landing/rollout feel tuning remains part of P1 ground handling, not missing weather plumbing.

Acceptance tests:

- Gust changes affect airspeed and loads without changing ground velocity directly.
- Crosswind takeoff and landing produce correct sideslip/track effects.

## P7 — Product polish

Remaining scope:

- Better loading/error/scenery-status screens.
- PWA completeness if desired: manifest link, icons, service worker strategy.
- Bundle splitting for Cesium-heavy chunks.
- More complete cockpit/interior model, instrument layout, and audio immersion.

## Immediate follow-ups from the 2026-05-26 dogfood

Completed in the follow-up pass after Task 10.4:

1. LOAD PLAN phase-gating: stopped/PARKED can apply safe LNAV + SPEED + ALT_HOLD defaults, while running takeoff states only load the route and never auto-command AP modes.
2. DEBUG overlay crowding: Controls settings now starts collapsed and expands only on demand.
3. Scenario LOAD policy: saved running states restore as paused for repeatable training loops.
4. Keep `npm run check`, `npm run test:visual`, and browser dogfood in the release checklist.

## Execution discipline

For each roadmap phase:

1. Write a focused plan in `docs/plans/`.
2. Start with regression tests for the contract being changed.
3. Run targeted tests after each task.
4. Run `npm run check` before committing.
5. If pushing to `master`, wait for GitHub Actions and verify the live endpoint before reporting success.
