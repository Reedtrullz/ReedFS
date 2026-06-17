# RFS Enhancement Roadmap

This roadmap lists the enhancements that remain after the foundation stabilization and first gameplay/usability productization pass. It is ordered by dependency and risk: deepen gear/tire physics and guidance proof, then worker timing, visual regression/release hardening, data quality, and immersion.

Latest comprehensive remaining-work audit, remediation closeout, and next implementation plan:

- `docs/plans/2026-06-17-rfs-enva-engm-full-flight-remediation.md` — ENVA→ENGM issue log and implementation plan for the current slice: synthetic ENGM 19R runway/approach support, ENVA route termination at ENGM 19R IF/FAF/RWY, ENGM 19R short-final landing scenario, and a visible-control ENVA→ENGM route/climb + ENGM landing rollout/reset acceptance gate. Local proof only until pushed/CI verified.
- `docs/reviews/2026-06-16-rfs-e2e-proof-stability-closeout.md` — local closeout for the June 16 proof-stability slice; default E2E, aggregate local check, visual gate, and separate explicit full-flight gate are green after post-positive-rate black-box assertions moved to durable EngineStrip readbacks and dirty-climb cleanup controls stayed visible without reintroducing 1024px overlay overlap. This is local evidence only; no CI/live/continuous-full-route/source-backed realism claim is made.
- `docs/reviews/2026-06-15-rfs-comprehensive-remaining-work-review.md` — latest deep remaining-work review for the current dirty `review/2026-06-14-meaningful-use-round3` tree; the local remediation work now separates proof classes, aligns the KSEA→KPDX route/landing fixtures to KPDX 10R, adds manifest-listed visible-control black-box/stage specs, restores deterministic visual/layout checks, and still requires exact-SHA CI/live verification before any CI, deploy, or live claim.
- `docs/plans/2026-06-15-rfs-comprehensive-remaining-work-remediation.md` — current implementation plan for closing the June 15 review findings in proof-safe order: classify dirty work, fix seeded/visible E2E truth, align KSEA→KPDX on KPDX 10R, repair visual/layout proof, disposition realism/data/source gaps, update docs, then commit/push and verify exact-SHA GitHub Actions/live evidence without overclaiming.
- `docs/plans/2026-06-14-rfs-strict-meaningful-use-round3-remediation.md` — reviewed implementation plan covering RFS-R3-001 through RFS-R3-044 with Task 7 as final continuous black-box acceptance after prerequisite fixes.
- `docs/reviews/2026-06-14-rfs-strict-meaningful-use-round3.md` — current strict round-3 meaningful-use review; Task 7 remains blocked by visible takeoff setup truth, black-box proof scope, AP vertical truth, and route-to-approach/landing continuity gaps.
- `docs/reviews/2026-06-13-rfs-meaningful-use-remediation-closeout.md` — final 46-finding closeout ledger and proof-boundary record for the June 13 meaningful-use remediation pass.
- `docs/reviews/2026-06-12-comprehensive-project-review-remaining-work.md`
- `docs/reviews/2026-06-12-rfs-comprehensive-dogfood-audit.md` — 55-finding local dogfood/deep-review report and evidence ledger.
- `docs/plans/2026-06-12-rfs-comprehensive-remediation-program.md` — current umbrella remediation program for all 55 findings.
- Child implementation plans: `docs/plans/2026-06-12-rfs-p0-truth-playability-remediation.md`, `docs/plans/2026-06-12-rfs-autoflight-fms-vnav-remediation.md`, `docs/plans/2026-06-12-rfs-browser-ux-accessibility-product-remediation.md`, `docs/plans/2026-06-12-rfs-flight-model-ground-landing-realism-remediation.md`, `docs/plans/2026-06-12-rfs-architecture-performance-runtime-remediation.md`, and `docs/plans/2026-06-12-rfs-release-ci-security-oss-remediation.md`.

As of the current repository state, the release-hardening/playability sequence through Task 10.4 and the June Tasks 2-11 guidance-truth slice are implemented locally. AP and FMA now share route-status-derived navigation truth, guidance/checklists/tutorials are phase-aware through landing/rollout/reset states, the ENVA tutorial has deterministic Playwright takeoff-to-clean-climb, scoped short-final approach-to-touchdown/rollout/reset, and seeded DESCENT-to-configured-approach/landing bridge proofs, a scoped KPDX 10R short-final approach-to-touchdown/rollout/reset browser proof is in place, and the KSEA sample has first/second route-leg sequencing, a single-store multi-gate route progression browser proof, a scoped KPDX 10R final-approach configured-approach proof with LNAV coupled and vertical FMA OFF, a scoped configured-approach-to-manual-handoff-and-reset proof that shows AP/FMA/thrust OFF with no AP commands owning axes before reset, then route/AP/FMA cleanup after reset, a bridge proof from KSEA final-route configured approach/manual AP-FMA-thrust OFF handoff to same-store KPDX 10R short-final manual landing, braking rollout, and reset cleanup whose KPDX landing snapshots recompute near-destination route status instead of carrying stale pre-seed route distance, and an extended pre-handoff final-route descent bridge that remains on the KPDX 10R threshold leg with CMD A + LNAV + SPEED backed, vertical FMA OFF, and at least 1.0 NM / 300 ft additional closure before manual handoff. Manifest-listed black-box/stage specs now add visible-control evidence for route setup, takeoff/positive-rate/gear, route-progress/descent command, and KPDX 10R short-final rollout/reset, and aggregate E2E is deterministic locally; these remain local evidence until committed, pushed, and verified in exact-SHA CI/live checks. The remaining roadmap is now advanced realism, fuller continuous route-coupled descent/approach/landing and full-route/full-flight proof beyond the current bounded proof classes, VNAV/FMS depth, broader manual playability, visual/layout polish, data quality, and ongoing release maintenance.

The AP/FMA truth contract also now covers effective-control ownership: active ticks, flight-plan updates, manual-input sanitization, `setApState()`, and saved-scenario restore gate AP-owned elevator/aileron/throttle commands on backed/effective autoflight truth instead of raw AP status. A raw/restored `CMD_A` state whose command-channel backing is missing cannot retain or apply stale AP commands while the FMA/PFD truth is OFF.

## Completed baseline

The completed baseline now includes:

- Quality scripts and CI release gate are in place.
- Branch protection and exact-SHA release closeout runbooks/checkers are in place; `master` branch protection is verified with required `secret-scan`, `test`, `publish`, and `deploy` contexts, and live/deployed claims require exact-SHA checker evidence.
- React hook/lint blockers are cleaned up.
- Quaternion attitude is authoritative and initialized consistently.
- Body/NED transforms are centralized.
- Gravity signs match body-axis conventions.
- Wind is pure air-relative input, not destructive state mutation.
- Longitudinal drag is signed against air-relative flow.
- Physics regressions are covered by unit tests.
- Scenario-level takeoff/climb helpers and envelope tests exist.
- Ground state, supported ENVA/ENGM/KSEA/KPDX prepared-runway/off-runway rectangle sampling, runway-normal contact, off-runway friction scaling, normal-force liftoff, and flight-phase decoupling are implemented.
- Input dynamics, pilot/AP/effective-control separation, effective-truth-gated AP command ownership for active ticks, flight-plan updates, and restored scenario snapshots, stabilizer trim, CG pitch moment, and data-backed aero/engine envelope work are implemented.
- Aircraft visual contract, persistent renderer, visual animation state, Cesium runway layer, cockpit shell, overlay modes, PFD/FMA, cockpit interaction hooks, scenario/tutorial/checklist/coach flow, phase-aware guidance state, active-leg route status, LNAV feedback, conservative VNAV/SPD/VS behavior, conservative N1 thrust mode, rejected-takeoff abort flow, scenario persistence, controls settings, deterministic gusts, rollout/taxi/crosswind landing regressions, player differential brake controls, versioned B737 data, trim fixtures, and performance-card assertions are implemented.
- LNAV now sequences active route legs at capture radius, passed-waypoint geometry, or bounded turn-anticipation gates; AP LNAV consumes the route-status active leg with a capped cross-track intercept, and AP/FMA route-mode availability comes from the same route-status-to-navigation conversion.
- Autopilot thrust guidance now includes both SPEED airspeed hold and a conservative phase-based N1 target mode with armed-A/T gating, symmetric rate-limited AP throttle commands, MCP SPD/N1 controls, and FMA truth display.
- Guidance checklists and tutorial steps auto-select from the current phase through positive-rate, clean-climb, approach, landing-rollout, and landed/reset states, and browser flight tests prove ENVA can take off, raise gear, reach clean climb deterministically, separately run a scoped ENVA short-final approach through touchdown, braking rollout, and reset, run a scoped KPDX short-final approach-to-touchdown/rollout/reset browser proof on a prepared runway, and run a seeded ENVA DESCENT-to-configured-approach/landing bridge without resetting the browser store between descent and landing.
- KSEA sample route loads in-browser, exposes backed LNAV, keeps FMA LNAV, decreases DTG, sequences the first and second route legs, proves OLM-to-BTG multi-gate route progression in one browser store session, proves a scoped KPDX 10R final-approach configured approach with CMD A + LNAV + SPEED backed while vertical FMA remains OFF, proves a scoped configured-approach-to-manual-handoff-and-reset state with route still loaded at handoff, AP/FMA/thrust truth OFF, AP command count zero, pilot/effective elevator/aileron/throttles matching, and reset cleanup clearing route/AP/FMA state back to preflight, proves a KSEA-to-KPDX 10R landing bridge from final-route configured approach/manual AP-FMA-thrust OFF handoff to same-store KPDX 10R short-final manual landing, braking rollout, reset cleanup, and recomputed near-destination route status for the KPDX landing snapshots, and proves an extended pre-handoff final-route descent bridge that remains on the KPDX 10R threshold leg with CMD A + LNAV + SPEED backed, vertical FMA OFF, and at least 1.0 NM / 300 ft additional closure before handoff.
- Controls proof now covers visible blocked gear-up feedback before positive rate, keyboard throttle/rotation/gear/reset flow, mouse-visible throttle/rotate/gear/reset flow, and mocked gamepad command mapping for start/pause/reset, camera, overlay, audio, and MCP intents. Post-positive-rate black-box throttle/flap/gear assertions use the durable named EngineStrip readback rather than the phase-gated takeoff setup panel, while mouse cleanup controls remain visible only through dirty climb and hide again after clean climb. Durable gamepad calibration UI/persistence remains a deferred product follow-up.

- The ENVA→ENGM visible-control full-flight gate now loads the default ENVA→ENGM route, proves ENVA takeoff/positive-rate/gear/flap cleanup plus backed LNAV/SPEED/VS route-climb smoke, then resets into the ENGM 19R synthetic short-final scenario and proves ENGM touchdown/rollout/STOPPED/reset readbacks. This is local full-flow evidence for the requested ENVA→ENGM acceptance path, while continuous route-coupled descent/approach/landing, official ENGM procedure data, certified 737 realism, CI, deploy, and live proof remain separate non-claims.

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

Why this remains: the current pass establishes runway-normal contact, supported-airport prepared-runway/off-runway rectangle sampling for ENVA, synthetic ENGM 19R, KSEA, and KPDX, off-runway rolling/brake/side friction scaling, normal-force liftoff, phase semantics, normal-force-scaled tire side-load/cornering stiffness, anti-skid brake limiting, asymmetric brake-force helpers, dynamic oleo spring/damper compression loads, rudder-pedal-limited nosewheel steering, deterministic crosswind/weathercocking takeoff-roll regressions, KSEA 16L low-speed taxi, KPDX runway/off-runway integration and takeoff elevation regressions, crosswind approach/touchdown/rollout and rollout-braking regressions, player-facing side-specific differential brake controls, and gear-up runway-tangent belly/crash slide deceleration/damping. RFS still needs deeper ground-handling tuning and broader contact/surface coverage before touchdown, rollout, taxi, and crosswind handling can feel fully like an airliner.

Remaining P1 scope:

- Deeper rollout, taxi, touchdown, braking, and crosswind tuning beyond the current deterministic guard scenarios.
- Broader terrain mesh collision.
- Additional airport runway surface coverage beyond ENVA, synthetic ENGM 19R, KSEA, and KPDX prepared runway rectangles, plus broader airport surface modeling outside those rectangles.

2026-06-17 disposition for surface/crosswind/tire realism: defer source-backed wet/off-runway/high-speed/low-speed tire side-load tuning, wet/contaminated runway behavior, broader airport/taxiway/apron surfaces, and terrain mesh collision until permitted tire/brake/ground-contact, runway/airport, and surface-condition source packets exist. Current coverage remains deterministic gameplay guard scenarios on handcrafted dry ENVA, synthetic ENGM 19R, KSEA, and KPDX prepared-runway rectangles plus simplified off-runway friction scaling; it is not certified or broad airport-surface proof.

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
- Any future wet-runway, tire side-load, or expanded airport-surface claim must add source metadata and focused tests before public docs describe it as more than gameplay-placeholder behavior.

## P2 — Advanced flight guidance and RFMS integration

Why this follows the current guidance pass: active-leg state, route feedback, capped LNAV cross-track intercept, bounded turn-anticipation sequencing, shared AP/FMA route truth, phase-aware guidance/checklists/tutorials through landing/rollout/reset, honest VNAV/SPD/VS, SPEED airspeed hold, conservative N1 thrust mode, deterministic ENVA clean-climb proof, scoped ENVA short-final approach-to-touchdown/rollout/reset proof, seeded ENVA descent-to-approach/landing bridge proof, scoped KPDX 10R short-final approach-to-touchdown/rollout/reset browser proof, KSEA first/second route-leg sequencing proofs, KSEA single-store multi-gate route progression proof, scoped KSEA final-leg configured-approach proof, scoped KSEA configured-approach-to-manual-handoff-and-reset proof, scoped KSEA final-route configured-approach/manual AP-FMA-thrust OFF handoff to same-store KPDX 10R short-final manual landing, braking rollout, reset cleanup, and recomputed near-destination KPDX 10R route-status bridge proof, extended pre-handoff final-route descent bridge proof, and manifest-listed visible-control black-box/stage specs for route setup, positive-rate/gear-up, route-progress/descent-command, and KPDX 10R short-final rollout/reset are now in place locally. Remaining RFMS-backed route editing, route modification UI, continuous route-coupled descent/approach/landing proof, and full-route/full-flight proof beyond these bounded proof classes still need fuller avionics integration, selectable cockpit controls, and exact-SHA CI/live evidence.

Remaining scope:

- RFMS-backed route modification UI. The pure `fms/routeAdapter.ts` seam already covers route sources, staged DIRECT_TO, DISCONTINUITY insertion, undo, and EXEC in unit tests; the missing product work is a visible CDU/FMS workflow that applies those operations to store-owned route state and recomputes route status without pretending the current route panel is editable.
- RFMS Flight Mode Annunciator lifecycle integration beyond current truth-mode display.
- Continuous route-coupled descent/approach/landing proof beyond the current deterministic ENVA clean-climb, ENVA→ENGM visible-control route/climb + ENGM short-final landing rollout/reset gate, scoped ENVA seeded short-final approach-to-touchdown/rollout/reset, scoped KPDX 10R short-final approach-to-touchdown/rollout/reset, seeded ENVA descent-to-approach/landing bridge, KSEA route-progression, KSEA final-leg configured-approach, KSEA configured-approach-to-manual-handoff-and-reset, KSEA-to-KPDX 10R landing bridge with recomputed KPDX short-final route status, extended KSEA final-route pre-handoff descent bridge, and manifest-listed visible-control black-box/stage browser tests, including broader manual playability, deeper landing realism, VNAV coverage, and broader FMS behavior.

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

Why this follows state stabilization: moving a broken state contract to a worker makes bugs harder to see. The state contract is now stable enough to serialize, but the live store loop is still intentionally synchronous.

Scope:

- Worker codec, feature flag, worker entry scaffolding, runtime adapters, worker-handler parity tests, and an experimental browser-Worker `stepAsync()` path exist.
- Current disposition: experimental browser-Worker runtime remains default-off; `simStore.tick()` remains synchronous; sync `step()` still falls back to main-thread physics even when `VITE_RFS_WORKER_PHYSICS=1` selects the browser-worker adapter. The flag proves protocol/parity only and is not a production-active physics loop.
- Remaining: async scheduler/store bridge plan is required before default-on migration, covering input frames, AP/controller state, flight plan, route status, wind, worker lifecycle errors, timeout fallback, pause/resume/reset disposal, and visual/E2E parity.
- Keep the fixed-timestep accumulator and deterministic main-thread tests green while migrating.

Suggested implementation files:

- `src/runtime/frameScheduler.ts`
- `src/hooks/useSimLoop.ts`
- `src/store/simStore.ts`
- `src/sim/simulationRuntime.ts`
- `src/sim/simulationWorker.ts`
- `src/sim/workerCodec.ts`

Acceptance tests:

- Codec round-trips all state fields required by rendering/instruments.
- Worker produces deterministic output for fixed inputs.
- Main thread can start, pause, resume, reset, and dispose the worker.
- Inputs and weather updates are applied on worker ticks without stale closures.
- Async migration tests must prove `FrameScheduler`/`useSimLoop` can await worker `stepAsync()` without skipping render/audio phases or applying stale state.
- `npm run check` passes, and a worker-enabled browser/E2E smoke passes, before worker physics can become default-on.

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

Why this is required for realism: current coefficients are approximations. Simulator quality depends on validated aero/engine/ground data and trim behavior. Before tuning constants, FDM/performance source packets must follow [`docs/runbooks/fdm-source-governance.md`](runbooks/fdm-source-governance.md). Current disposition: P1.1 is blocked for source-backed replacement until permitted source packets exist for aero polars/control derivatives, engine lapse/spool/fuel-flow, gear/flap transit and gear geometry, tire/brake/ground handling, performance cards, and runway/airport/procedure data.

Scope:

- Apply the FDM/performance source-governance checklist before replacing gameplay-placeholder values with source-backed or derived values.
- Do not replace or publicly describe any group as source-backed until its missing source-packet ID in the governance runbook is resolved with citation, license/redistribution permission, derivation notes, claim boundary, and runtime/data tests.
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

- Every upgraded data group carries source ID, confidence, license/redistribution, and claim-boundary metadata, and tests prove runtime reads it from the versioned data shell.
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

2026-06-16 rendering/weather/audio/immersion disposition:

- Cockpit/interior: partial. Implemented baseline includes the cockpit camera/shell, PFD/FMA, MCP, cockpit interaction hooks, route/scenario controls, and visual layout guards; deferred scope is a complete modeled 737 cockpit interior, panel-system depth, lighting, and product-grade instrument layout.
- Weather/atmosphere: partial. Implemented baseline includes METAR wind/cloud parsing, scenario weather fallback, deterministic gusts, and simple cloud billboards; deferred scope is visibility rendering, QNH/temperature pressure-altitude and density-altitude effects, precipitation, and weather-driven scene degradation.
- Audio: partial. Implemented baseline includes explicit Web Audio startup, N1-driven engine tone mapping, persisted mute/volume/caption settings, and GPWS captions/speech; deferred scope is richer engine, cockpit, airframe, warning, and spatial sound layers.
- Scene loading/error states: partial. Implemented baseline includes the app ErrorBoundary, visible `SCENERY DEGRADED` status for missing Cesium Ion scenery, and degraded ellipsoid fallback; deferred scope is richer loading, retry, scenery-error, and network-failure UX.
- PWA: deferred. RFS does not yet claim installability/offline support; manifest icons, service worker strategy, cache policy, and offline/error fallback screens remain future product work.

Visual snapshots are not proof of audio, weather, PWA, or error-state behavior; those claims require dedicated unit/component/browser evidence for the behavior itself.

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
