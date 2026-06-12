# RFS Enhancement Roadmap

This roadmap lists the enhancements that remain after the foundation stabilization and first gameplay/usability productization pass. It is ordered by dependency and risk: deepen gear/tire physics and guidance proof, then worker timing, visual regression/release hardening, data quality, and immersion.

Latest comprehensive remaining-work audit and next implementation plan:

- `docs/reviews/2026-06-12-comprehensive-project-review-remaining-work.md`
- `docs/plans/2026-06-12-rfs-autoflight-truth-and-route-proof.md`

As of the current repository state, the release-hardening/playability sequence through Task 10.4 and the June Tasks 2-11 guidance-truth slice are implemented. AP and FMA now share route-status-derived navigation truth, guidance/checklists/tutorials are phase-aware through landing/rollout/reset states, the ENVA tutorial has deterministic Playwright takeoff-to-clean-climb, scoped short-final approach-to-touchdown/rollout/reset, and seeded DESCENT-to-configured-approach/landing bridge proofs, a scoped KPDX short-final approach-to-touchdown/rollout/reset browser proof is in place, and the KSEA sample has first/second route-leg sequencing, a single-store multi-gate route progression browser proof, a scoped final BTG->KPDX route-leg configured-approach proof with LNAV coupled and vertical FMA OFF, a scoped configured-approach-to-manual-handoff-and-reset proof that shows AP/FMA/thrust OFF with no AP commands owning axes before reset, then route/AP/FMA cleanup after reset, and a bridge proof from KSEA final route configured approach/manual AP-FMA-thrust OFF handoff to same-store KPDX 10L short-final manual landing, braking rollout, and reset cleanup. The remaining roadmap is now advanced realism, full-route/full-flight proof beyond those scoped browser proofs, continuous route-coupled descent/approach/landing coverage, VNAV coverage, broader manual playability, visual/layout polish, data quality, and CI/deploy/live verification.

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
- Ground state, supported KSEA/KPDX prepared-runway/off-runway rectangle sampling, runway-normal contact, off-runway friction scaling, normal-force liftoff, and flight-phase decoupling are implemented.
- Input dynamics, pilot/AP/effective-control separation, stabilizer trim, CG pitch moment, and data-backed aero/engine envelope work are implemented.
- Aircraft visual contract, persistent renderer, visual animation state, Cesium runway layer, cockpit shell, overlay modes, PFD/FMA, cockpit interaction hooks, scenario/tutorial/checklist/coach flow, phase-aware guidance state, active-leg route status, LNAV feedback, conservative VNAV/SPD/VS behavior, conservative N1 thrust mode, rejected-takeoff abort flow, scenario persistence, controls settings, deterministic gusts, rollout/taxi/crosswind landing regressions, player differential brake controls, versioned B737 data, trim fixtures, and performance-card assertions are implemented.
- LNAV now sequences active route legs at capture radius, passed-waypoint geometry, or bounded turn-anticipation gates; AP LNAV consumes the route-status active leg with a capped cross-track intercept, and AP/FMA route-mode availability comes from the same route-status-to-navigation conversion.
- Autopilot thrust guidance now includes both SPEED airspeed hold and a conservative phase-based N1 target mode with armed-A/T gating, symmetric rate-limited AP throttle commands, MCP SPD/N1 controls, and FMA truth display.
- Guidance checklists and tutorial steps auto-select from the current phase through positive-rate, clean-climb, approach, landing-rollout, and landed/reset states, and browser flight tests prove ENVA can take off, raise gear, reach clean climb deterministically, separately run a scoped ENVA short-final approach through touchdown, braking rollout, and reset, run a scoped KPDX short-final approach-to-touchdown/rollout/reset browser proof on a prepared runway, and run a seeded ENVA DESCENT-to-configured-approach/landing bridge without resetting the browser store between descent and landing.
- KSEA sample route loads in-browser, exposes backed LNAV, keeps FMA LNAV, decreases DTG, sequences the first and second route legs, proves OLM-to-BTG multi-gate route progression in one browser store session, proves a scoped final BTG->KPDX configured approach with CMD A + LNAV + SPEED backed while vertical FMA remains OFF, proves a scoped configured-approach-to-manual-handoff-and-reset state with route still loaded at handoff, AP/FMA/thrust truth OFF, AP command count zero, pilot/effective elevator/aileron/throttles matching, and reset cleanup clearing route/AP/FMA state back to preflight, and proves a KSEA-to-KPDX landing bridge from final route configured approach/manual AP-FMA-thrust OFF handoff to same-store KPDX 10L short-final manual landing, braking rollout, and reset cleanup.

Completion records:

- `docs/plans/2026-05-25-rfs-foundation-stabilization.md`
- `docs/plans/2026-05-26-rfs-comprehensive-usability-realism-plan.md`
- `docs/plans/2026-05-27-rfs-advanced-gear-tire-ground-handling.md`
- `docs/plans/2026-05-27-rfs-surface-aware-ground-handling.md`
- `docs/plans/2026-05-27-rfs-rollout-taxi-crosswind-controls.md`
- `docs/plans/2026-05-27-rfs-multi-airport-surface-coverage.md`
- `docs/plans/2026-05-27-rfs-lnav-turn-anticipation.md`
- `docs/plans/2026-05-27-rfs-n1-autothrottle.md`

## P1 — Finish gear/tire ground model and takeoff/landing realism

Why this remains: the current pass establishes runway-normal contact, supported-airport prepared-runway/off-runway rectangle sampling for KSEA and KPDX, off-runway rolling/brake/side friction scaling, normal-force liftoff, phase semantics, normal-force-scaled tire side-load/cornering stiffness, anti-skid brake limiting, asymmetric brake-force helpers, dynamic oleo spring/damper compression loads, rudder-pedal-limited nosewheel steering, deterministic crosswind/weathercocking takeoff-roll regressions, KSEA 16L low-speed taxi, KPDX runway/off-runway integration and takeoff elevation regressions, crosswind approach/touchdown/rollout and rollout-braking regressions, player-facing side-specific differential brake controls, and gear-up runway-tangent belly/crash slide deceleration/damping. RFS still needs deeper ground-handling tuning and broader contact/surface coverage before touchdown, rollout, taxi, and crosswind handling can feel fully like an airliner.

Remaining P1 scope:

- Deeper rollout, taxi, touchdown, braking, and crosswind tuning beyond the current deterministic guard scenarios.
- Broader terrain mesh collision.
- Additional airport runway surface coverage beyond KSEA/KPDX prepared runway rectangles, plus broader airport surface modeling outside those rectangles.

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
- KSEA 16L taxi, KPDX runway/off-runway integration, crosswind approach/touchdown/rollout, and rollout-braking sanity scenarios remain deterministic.
- Rotation produces liftoff only after realistic speed/angle combination.
- Touchdown compresses gear and damps vertical velocity.
- Gear-up belly/crash contact remains explicit, damps runway-tangent slide without reversing, and preserves hard `crashed` state across fixed-step updates.

## P2 — Advanced flight guidance and RFMS integration

Why this follows the current guidance pass: active-leg state, route feedback, capped LNAV cross-track intercept, bounded turn-anticipation sequencing, shared AP/FMA route truth, phase-aware guidance/checklists/tutorials through landing/rollout/reset, honest VNAV/SPD/VS, SPEED airspeed hold, conservative N1 thrust mode, deterministic ENVA clean-climb proof, scoped ENVA short-final approach-to-touchdown/rollout/reset proof, seeded ENVA descent-to-approach/landing bridge proof, scoped KPDX short-final approach-to-touchdown/rollout/reset browser proof, KSEA first/second route-leg sequencing proofs, KSEA single-store multi-gate route progression proof, scoped KSEA final-leg configured-approach proof, scoped KSEA configured-approach-to-manual-handoff-and-reset proof, and scoped KSEA final-route configured-approach/manual AP-FMA-thrust OFF handoff to same-store KPDX 10L short-final manual landing, braking rollout, and reset cleanup bridge proof are now in place. Remaining RFMS-backed route editing, route modification UI, continuous route-coupled descent/approach/landing proof, and full-route/full-flight proof beyond clean climb, seeded landing bridge, scoped KPDX short-final approach-to-touchdown/rollout/reset, and the route-progression/final-leg configured-approach/manual-handoff/reset/landing-bridge foundation still need fuller avionics integration and selectable cockpit controls.

Remaining scope:

- RFMS-backed route edits and route modification UI.
- RFMS Flight Mode Annunciator lifecycle integration beyond current truth-mode display.
- Full-route/full-flight proof beyond the current deterministic ENVA clean-climb, scoped ENVA seeded short-final approach-to-touchdown/rollout/reset, scoped KPDX short-final approach-to-touchdown/rollout/reset, seeded ENVA descent-to-approach/landing bridge, KSEA route-progression, KSEA final-leg configured-approach, KSEA configured-approach-to-manual-handoff-and-reset, and KSEA-to-KPDX landing bridge browser tests, including continuous route-coupled descent/approach/landing coverage, broader manual playability, deeper landing realism, VNAV coverage, broader FMS behavior, and CI/deploy/live proof.

Suggested implementation files:

- `src/sim/systems/navigation.ts`
- `src/sim/systems/vnav.ts`
- `src/sim/systems/autopilot.ts`
- `src/store/simStore.ts`
- `src/instruments/RfsMCP.tsx`
- RFMS shared type touchpoints as needed.

Acceptance tests:

- Active waypoint/leg advances at capture radius, passed-waypoint geometry, or bounded turn-anticipation gates.
- LNAV consumes the active route leg and a capped cross-track intercept when flying toward a desired track from an offset intercept.
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

## 2026-06-12 note on completed May dogfood follow-ups

The immediate follow-ups from the 2026-05-26 dogfood are completed historical records. The June next slice now focuses on AP/FMA truth plus full-flight proof beyond the already-implemented ENVA clean-climb and KSEA route-progression browser proofs.

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
