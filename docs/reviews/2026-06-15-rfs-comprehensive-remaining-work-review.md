# RFS comprehensive remaining-work review — 2026-06-15

Date: 2026-06-15T15:50:41Z / 2026-06-15 17:50:41 CEST
Review branch: `review/2026-06-14-meaningful-use-round3`
Observed local HEAD: `4e7bb706c561c6b77016e7dfc97a051c2e7635d6`
Live endpoint checked: `https://fly.reidar.tech/rfs-version.json` reported commit `fefca39c0ebf824b40d0f3c2ef07bedab85de73d`, image `ghcr.io/reedtrullz/rfs:sha-fefca39c0ebf824b40d0f3c2ef07bedab85de73d`, digest `sha256:4fb067c1bde3b5987e136eb1e106c10c7d2e40c3d18c67663fc0539913020cc4`.

## Scope

This is a deep remaining-work review of the current RFS working tree. It covers:

- local repo state and verification gates;
- browser dogfood evidence;
- full-flight / Task 7 black-box readiness;
- physics, ground, takeoff, landing, and data truth;
- autoflight, FMS, route, VNAV, MCP, and FMA truth;
- browser/player UX, layout, controls, audio, rendering, and accessibility;
- CI, deploy, release, security, and public-project posture.

The goal is not to re-open every historical item. The goal is to identify what still blocks an honest claim that RFS is a credible playable browser-native 737-800 sim rather than a set of scoped proofs.

## Remediation status

As of the 2026-06-16 local remediation pass, the working tree has addressed the original P0 visual/E2E/runway/proof-boundary blockers with bounded evidence: refreshed visual/layout checks, deterministic manifest-listed visible-control black-box/stage specs, KPDX 10R-aligned route/landing fixtures, proof-layer docs, and local `npm run check` passing with 100 Vitest files / 911 tests plus build and bundle checks. This updates the status of the review findings but does not rewrite the review-time evidence below.

Still not claimed: continuous full-route/full-flight proof, source-validated/certified 737 realism, CI green, deployment, or live verification for this branch. CI still requires a pushed exact SHA with GitHub Actions `completed/success`; live/deployed still requires `/rfs-version.json` to report that exact SHA.

## Non-claims for this review

Do not claim any of the following from this branch yet:

- Not a certified or source-validated Boeing 737-800 simulator.
- Not real-world training, dispatch, maintenance, performance, or procedure data.
- Not a proven full-route or full-flight browser acceptance pass.
- Not a proven continuous route-coupled KSEA-to-KPDX descent / approach / landing.
- Not a current live deployment of this local branch: live endpoint reports `fefca39...`, while local HEAD is `4e7bb70...` and the working tree is dirty.
- Not CI green for this working tree: local remediation later made the visual/E2E layer deterministic, but CI still requires an exact pushed SHA with GitHub Actions `completed/success`.

## Evidence gathered

### Repository state

`git status --short --branch`:

```text
## review/2026-06-14-meaningful-use-round3
 M e2e/blackbox-manifest.json
 M e2e/helpers/rfsBlackbox.ts
 M src/__tests__/App.test.tsx
 M src/app/RfsShell.tsx
 M src/components/RouteStatus.tsx
 M src/components/__tests__/RouteStatus.test.tsx
 M src/sim/__tests__/flightPhasePredicates.test.ts
 M src/sim/__tests__/simulationStep.test.ts
 M src/sim/flightPhasePredicates.ts
 M src/sim/simulationStep.ts
 M src/sim/systems/__tests__/autopilot.test.ts
 M src/sim/systems/autopilot.ts
 M src/store/__tests__/simStore.test.ts
 M src/store/simStore.ts
?? dogfood-output/
?? e2e/rfs-full-flight-blackbox.spec.ts
```

This matters because the review is against uncommitted work. The working tree itself is part of the remaining work: decide what is intended, make it pass, then commit or discard it.

### Local gates

Ran with Node 22 via `source ~/.nvm/nvm.sh && nvm use 22`.

`npm run check`: PASS.

Relevant output:

```text
npm run check exit=0
Test Files  100 passed (100)
Tests       889 passed (889)
vite v8.0.14 building client environment for production...
✓ built in 434ms
bundle budgets ok
app: raw=309.3 KiB gzip=98.6 KiB files=19
vendorReact: raw=182.4 KiB gzip=56.7 KiB files=1
vendor: raw=3.5 KiB gzip=1.5 KiB files=1
three: raw=500.6 KiB gzip=124.9 KiB files=1
threeBridge: raw=2.8 KiB gzip=1.1 KiB files=1
cesium: raw=24.8 KiB gzip=6.1 KiB files=3
```

Local visual regression command:

```text
VITE_RFS_VISUAL_TEST=1 CI=1 npx playwright test e2e/rfs-visual.spec.ts --workers=1 --reporter=line
```

Result: FAIL, exit 1.

Observed failures:

- `initial-chase.png`: ~30,292-30,298 pixels different, about 3% of image pixels.
- `cockpit-mode.png`: screenshot expectation timed out after 10s inside a 30s test timeout; first attempt also saw ~36,590 pixels different.
- `route-loaded.png`: ~37,568-37,580 pixels different, about 3% of image pixels.
- `start roll state is visually stable`: expected visible text `/Set flaps 5, trim 5\.0, then advance takeoff thrust smoothly\./i`, but the element was not found.

Source evidence: `e2e/rfs-visual.spec.ts:5-32` defines these four deterministic visual expectations.

Post-remediation note: the local working tree now includes a visual non-overlap guard, updated product copy/layout, refreshed snapshots, and deterministic visual runs. This is local evidence only until it is committed and verified by exact-SHA CI.

Full E2E status: failed before the run was killed. Earlier in this review pass, `npm run test:e2e` was started under Node 22, waited on repeatedly, and killed manually. The later background-process output plus a targeted rerun identified a concrete blocker before termination:

```text
CI=1 VITE_RFS_VISUAL_TEST=0 npx playwright test e2e/rfs-flight.spec.ts -g 'seeded descent configures approach' --workers=1 --reporter=line --timeout=120000
```

Result: FAIL. The failing test is `e2e/rfs-flight.spec.ts:116-153`. Both first run and retry failed in `flyDescentApproachToLandingRolloutAndReset()` with:

```text
Unable to seed airborne descent proof state: {"iasKt":148.99,"altitudeFt":357,"aglFt":301,"weightOnWheels":false,"gearDown":false,"gearLever":"UP","flapSetting":5,"flightPhase":"DESCENT","guidancePhase":"descent","autopilotCleared":true,"routeCleared":true,...}
```

The immediate mismatch is in `e2e/helpers/rfsFlight.ts:839-848`: the helper seeds an airborne `DESCENT` state with gear up, flaps 5, no route/AP, then requires `descent.guidancePhase === 'approach'`. Current product guidance maps `DESCENT` to `descent` and `APPROACH` to `approach`: `src/sim/guidanceState.ts:85-87`. Route-driven promotion to `APPROACH` also requires a valid route with final/threshold handoff and approach configuration: `src/sim/flightPhasePredicates.ts:54-68`; the failing seeded state has `flightPlan: null` and `activeLegIndex: null` from `e2e/helpers/rfsFlight.ts:818-829`. This is now a specific P0 E2E blocker, not merely an inconclusive long run.

### Browser dogfood evidence

Dogfood path:

1. Started local Vite dev server.
2. Opened `http://127.0.0.1:5173/`.
3. Selected `KSEA Tutorial Takeoff`.
4. Loaded route.
5. Started roll, advanced throttle to 100%, set sim rate 16x, rotated, raised gear after positive rate.

Console result: no JS errors. Console only showed Vite connect/debug and React DevTools info.

Observed route/setup/readback before takeoff:

- Takeoff setup: `Flaps 5 | Trim 5.0 | Throttle 0% | Gear DOWN`.
- Route load status: `CANNED TRAINING ROUTE KSEA→KPDX loaded. Route editing is unavailable; synthetic approach fixes are not official procedure data...`.
- Route status: `KSEA→KPDX`, `ACTIVE`, `LEG 1/5`, `KSEA → OLM`, `DTG 39.3 NM`, `TRK 220°T`.
- FMA/PFD initially: `THR OFF`, `ROLL OFF`, `PITCH OFF`, `AP OFF`, `PHASE PARKED`.

Observed after takeoff / dogfood climb/descent:

- The visible flow can start, accelerate, rotate, enter climb, and gear-up via visible controls.
- At 16x and manual inputs, the aircraft overshot into a high-energy state quickly: observed `PHASE DESCENT`, about `122-127 KT`, about `16,393-17,346 FT`, with FMA still `OFF/OFF/OFF/AP OFF` because no MCP/AP mode was engaged.
- Route remained `LEG 1/5 KSEA → OLM` and route DTG grew in the dogfood run, which is expected if the player hand-flies away from the canned course, but it reinforces that current browser dogfood is not a full-route proof.
- Visible layout is crowded: scenario panel, takeoff setup panel, controls, MCP, PFD, route panel, Cesium credit/watermark, and bottom status message overlap or compete for the same viewport space at 1280x720.

## Executive judgment

RFS is much more than a toy demo now. The current tree has real strengths:

- the local static/unit/build/bundle gate passes;
- the app opens in the browser and the basic takeoff setup/start-roll/rotate/gear-up flow is visible and usable;
- the PFD/MCP/FMA avoid inventing hidden AP truth while AP is off;
- route status is visible and openly labels canned/synthetic route limitations;
- gear-up is gated behind positive rate in the visible flow;
- tests now contain manifest-listed visible-control-only black-box/stage acceptance; keep it bounded unless a continuous full-route/full-flight proof is separately added and verified.

But the remaining work is still substantial. The biggest blockers are not tiny polish items. They are:

1. make the working tree coherent and green, including visual/E2E;
2. keep the new black-box/stage specs honest, deterministic, and distinct from continuous full-flight/full-route claims;
3. align the route/approach/landing runway truth across KSEA→KPDX instead of proving route and landing through separate seeded/scoped bridges;
4. replace broad placeholder aircraft/performance data with source-lineaged data before claiming realism;
5. build real VNAV/FMS/route-editing depth beyond current truth-preserving MCP/FMA scaffolding;
6. make the product viewport/layout playable without debug-style panel collisions;
7. verify CI and live deployment by actual run/endpoints before making public/live claims.

## P0 — Must finish before claiming this branch is meaningfully complete

### P0.1 — Dirty working tree must be resolved and made reproducible

Evidence:

- 14 modified files and 2 untracked paths are present in the review branch.
- The untracked black-box spec was referenced by the modified manifest at review time: `e2e/blackbox-manifest.json:1-7`.
- Package scripts make `check:blackbox` part of `npm run check`: `package.json:24-41`.

Remaining work:

- Decide whether every modified file belongs to the current remediation branch.
- Add the new black-box/stage spec intentionally or remove it from the manifest.
- Remove or intentionally keep `dogfood-output/`; if kept, document what it is and avoid committing transient screenshots/traces unless wanted.
- Re-run `npm run check`, `npm run test:visual`, and the relevant E2E suite after the tree is clean.

Acceptance:

- `git status --short` is clean except intentional review artifact changes.
- All committed test manifests point only at tracked specs.
- No transient local-only test artifacts are accidentally committed.

### P0.2 — Visual regression was red at review time; remediation must stay bounded

Evidence:

- `e2e/rfs-visual.spec.ts:5-32` expects stable initial, cockpit, route-loaded, and start-roll states.
- Local run failed all 4 tests.
- The start-roll test still expects the older text `Set flaps 5, trim 5.0, then advance takeoff thrust smoothly.` at `e2e/rfs-visual.spec.ts:28-32`, while current UI copy/dogfood showed phase-aware coach text such as `Set takeoff thrust smoothly, then keep the runway centerline.`
- App layout mounts the main panels simultaneously: PFD/MCP in `src/app/RfsShell.tsx:345-350`, scenario/route/takeoff panels in `src/app/RfsShell.tsx:351-354`, and the bottom controls in `src/app/RfsShell.tsx:358-384`.
- MCP itself is fixed at `top: 400, right: 10`: `src/instruments/RfsMCP.tsx:185-196`.
- Route status is fixed at top-right: `src/components/RouteStatus.tsx:5-19`.
- Takeoff setup is fixed at top-left-ish: `src/components/TakeoffSetupPanel.tsx:78-120`.

Remaining work:

- Preserve the non-overlap guard and refreshed snapshots as intentional remediation evidence.
- Keep visual/layout claims local-only until exact-SHA CI runs `npm run test:visual` successfully.

Acceptance:

- `npm run test:visual` passes locally and in CI.
- Start-roll visual test asserts current product copy, not stale text.
- The route panel, PFD, MCP, setup panel, controls, status messages, and Cesium credit are readable without critical overlap.

### P0.3 — Visible-control black-box proof is staged; do not overclaim it as continuous full-flight/full-route evidence

Evidence:

- Review-time evidence: the original draft full-flight spec was listed in the black-box manifest and had a 720s timeout, but the aggregate E2E run did not complete and the seeded ENVA descent bridge failed on a stale `guidancePhase === 'approach'` expectation.
- Local remediation split the proof into deterministic, manifest-listed visible-control black-box/stage specs: visible route setup, takeoff/positive-rate/gear-up, route-progress/descent command, and KPDX 10R short-final rollout/reset.
- The black-box guard now scans those manifest-listed specs and helpers; local `npm run test:e2e` completed after replacing the old long continuous proof with bounded stage evidence.
- This is meaningful player-facing evidence, but it is not a continuous full-route/full-flight proof, not continuous route-coupled KSEA→KPDX descent/approach/landing, not VNAV proof, and not CI/deploy/live evidence.

Remaining work:

- Keep the stage specs in the manifest and black-box guard.
- Add a separate continuous route-coupled full-route/full-flight proof only after route editing/FMS/VNAV/approach lifecycle work is ready for that claim.
- Keep exact-SHA CI/live verification separate from local Playwright evidence.

Acceptance:

- `npm run check:blackbox` passes against all manifest-listed specs.
- `npm run test:e2e` completes locally.
- Docs and reports call the result visible-control black-box/stage evidence, not continuous full-flight/full-route or CI/live proof.

### P0.4 — Route/approach/landing runway truth is not yet coherent enough for full-route claims

Evidence:

- The canned KSEA→KPDX route contract targets KPDX runway 10R: `src/sim/flightPlanLoader.ts:6-17`.
- The route waypoints are synthetic and include KPDX 10R approach fixtures: `src/sim/flightPlanLoader.ts:72-115` and `src/viewport/runwayData.ts:177-199`.
- Route status openly says route editing is unavailable and the approach is synthetic: `src/components/RouteStatus.tsx:94-103`.
- Found at review time: a same-session landing bridge helper manually seeded a KPDX 10L short final: `e2e/helpers/rfsRoute.ts:893-966`.
- Found at review time: the KPDX short-final E2E expected touchdown on KPDX 10L: `e2e/rfs-flight.spec.ts:155-180`.
- Remediation status: the current local working tree has been aligned to KPDX 10R for the route bridge and short-final touchdown assertions; verify committed paths before treating this review finding as closed.
- The roadmap itself still says full-route/full-flight proof and continuous route-coupled descent/approach/landing remain: `docs/roadmap.md:81-90`.

Remaining work:

- The intended KSEA→KPDX route/landing proof runway is KPDX 10R.
- Keep the landing proof, runway surface target, route contract, and labels on KPDX 10R.
- Ensure route status, scenario metadata, approach fixtures, MCP/FMA truth, and landing/touchdown tests all refer to the same runway.

Acceptance:

- One visible-control route proof progresses from KSEA through the final route segment to the same runway named by the route contract.
- The route status panel shows final/threshold handoff for that same runway.
- Touchdown proof verifies that same runway and does not rely on a manual store seed that bypasses the route path.

### P0.5 — Seeded/scoped proofs remain useful but cannot be sold as full-flight evidence

Evidence:

- Route tests intentionally seed aircraft/AP/flight-plan state inside `page.evaluate` and set CMD A/LNAV/SPEED directly: `e2e/helpers/rfsRoute.ts:457-590`.
- The landing bridge manually relocates aircraft to KPDX short final and configures aircraft/control state: `e2e/helpers/rfsRoute.ts:893-966`.
- Existing route specs prove important scoped truths, including LNAV/FMA and manual handoff states: `e2e/rfs-route.spec.ts:132-195` and `e2e/rfs-route.spec.ts:220-319`.
- The ENVA/KPDX landing specs prove scoped touchdown/rollout/reset behavior, but also use helper-driven seeded states: `e2e/rfs-flight.spec.ts:87-187` and `e2e/helpers/rfsFlight.ts:520-582`.

Remaining work:

- Keep these scoped tests; they are valuable regression guards.
- Label them as scoped seeded proofs in docs and reports.
- Use the manifest-listed visible-control black-box/stage specs as the evidence layer for player-facing claims.
- Keep CI/live claims separate: local black-box evidence is not CI green, deployed, or live-verified until the exact pushed SHA is verified in GitHub Actions and `/rfs-version.json`.

Current local remediation note:

- README, architecture, roadmap, and plan-index docs now name the proof classes explicitly: unit/static gates, seeded/scoped browser proofs, manifest-listed visible-control black-box specs, exact-SHA CI, and live endpoint evidence.
- The local working tree now contains manifest-listed visible-control black-box/stage specs for visible takeoff/positive-rate/gear-up, route-progress/descent command, and KPDX 10R short-final rollout/reset. These improve player-facing evidence, but they still do not convert older seeded route/landing bridges into full-route/full-flight proof.

Acceptance:

- Docs and README distinguish: unit/static tests, seeded browser proofs, visible-control black-box proofs, and live/CI evidence.
- No release notes call seeded route/landing bridges a full flight.
- Reports state whether evidence is local-only, exact-SHA CI, or live endpoint verified.

### P0.6 — CI/live claims are blocked until visual/E2E and endpoint verification are real

Evidence:

- CI includes `npm run test:visual`: `.github/workflows/ci.yml:60-63`.
- CI also has secret scan, test/build/bundle, Docker smoke, and release metadata checks: `.github/workflows/ci.yml:16-63` and `.github/workflows/ci.yml:84-110`.
- At review time local visual was red. Local remediation later made visual/E2E deterministic, but CI should still be treated as unknown until the pushed SHA runs to `completed/success`.
- Live endpoint is not this local HEAD.

Remaining work:

- Keep local visual/E2E state green before pushing.
- Push only when ready.
- Verify GitHub Actions `completed/success` before saying CI green.
- Verify `/rfs-version.json` reports the intended SHA before saying live/deployed.

Acceptance:

- Local gates pass.
- GitHub Actions required jobs pass at the intended SHA.
- Live endpoint SHA and image reference match the intended deployed commit/image.

## P1 — High-value work after P0 gates are honest

### P1.1 — Replace placeholder FDM/performance data before realism claims

Evidence:

- Current FDM lineage says the values are gameplay-calibrated placeholders, low confidence, not certified Boeing data: `src/sim/data/aircraft/b737-800-fdm.v1.ts:21-38`.
- Each section carries a claim boundary saying it is not AFM/Boeing-published operating data: `src/sim/data/aircraft/b737-800-fdm.v1.ts:44-49`.
- Gear/flap transit, engine spool/lapse, ground handling, tire/brake/steering, and rotation laws are still placeholder values: `src/sim/data/aircraft/b737-800-fdm.v1.ts:111-139` and `src/sim/data/aircraft/b737-800-fdm.v1.ts:198-244`.
- Performance fixtures explicitly say placeholder/non-AFM: `src/sim/data/performance/b737PerformanceCards.ts:115-135`.
- Stall/climb/cruise fixtures are broad placeholder envelopes: `src/sim/data/performance/b737PerformanceCards.ts:158-250`.
- Roadmap still calls flight-model data quality out as remaining work: `docs/roadmap.md:158-183`.

Remaining work:

- Establish source/licensing policy for B737-800 aero, engine, gear, performance, and runway data.
- Split source-backed data from gameplay-calibrated constants.
- Add source metadata per coefficient group, not only a global placeholder boundary.
- Replace broad acceptance ranges with tighter source-backed reference cards where possible.
- Keep all real-world limitations explicit.

Acceptance:

- Each FDM/performance data group has source ID, confidence, allowed claim boundary, and tests that fail if source/placeholder data are mixed silently.
- Public docs say exactly what is source-backed and what remains gameplay-calibrated.

### P1.2 — Deepen ground, takeoff, landing, rollout, taxi, and crosswind realism

Evidence:

- The physics integrator now has deliberate liftoff gating and command-vs-actual configuration movement: `src/sim/physics/integrate.ts:156-198`.
- Main integration still applies engine/fuel/electrical/hydraulic/aero and then ground contact in a compact per-frame pipeline: `src/sim/physics/integrate.ts:200-217`.
- Liftoff is allowed based on normal force, speed, pitch, and deliberate elevator: `src/sim/physics/integrate.ts:264-276`.
- Ground contact contains explicit gear/belly/crash handling, oleo loads, nosewheel steering, tire side forces, braking, and rollout constraints: `src/sim/systems/ground.ts:697-807`.
- The FDM still labels the actual tire/brake/steering/ground constants as gameplay placeholders: `src/sim/data/aircraft/b737-800-fdm.v1.ts:198-244`.
- Roadmap says deeper rollout/taxi/touchdown/braking/crosswind tuning, broader terrain mesh collision, and more airport surface coverage remain: `docs/roadmap.md:52-80`.

Remaining work:

- Tune takeoff rotation and liftoff against better reference envelopes.
- Improve landing flare, touchdown zone, sink-rate, derotation, and rollout behavior.
- Expand airport/runway surface coverage beyond the current handcrafted supported runways.
- Add more realistic tire side-load behavior across wet/off-runway/low-speed/high-speed cases.
- Add failure/abnormal behavior only after normal behavior is stable.

Acceptance:

- Manual takeoff, climb, approach, touchdown, braking, taxi, and rejected takeoff can be repeated without helper seeding.
- Landing proof measures VREF, glidepath, touchdown zone, sink rate, stopping distance, and runway remaining against declared data boundaries.

### P1.3 — Build real VNAV/FMS depth beyond truth-preserving scaffolding

Evidence:

- MCP mode availability now gates unavailable modes and reasons: `src/store/selectors.ts:134-186`.
- MCP view model derives effective autoflight truth from aircraft, flight plan, and route status: `src/store/selectors.ts:210-240`.
- MCP UI supports HDG/LNAV/ALT/VNAV/VS/SPD/N1/OFF and selected targets: `src/instruments/RfsMCP.tsx:110-183` and `src/instruments/RfsMCP.tsx:221-289`.
- The UI openly warns when AP is lateral-only or FD guidance is unavailable: `src/instruments/RfsMCP.tsx:201-219`.
- Existing route tests intentionally assert final route approach with LNAV/SPEED backed and vertical FMA OFF: `e2e/rfs-route.spec.ts:149-195`.
- Roadmap says VNAV computes/tracks an altitude path and FMS/RFMS integration remain: `docs/roadmap.md:81-107`.

Remaining work:

- Implement route altitude/speed constraint parsing and VNAV path construction.
- Make VNAV truth track real computed path state, not only availability/backed-mode guards.
- Add FMS route editing and modification workflow or keep route editing explicitly out of scope.
- Add CDU/RFMS integration tests if RFMS is intended as a real dependency rather than a type/source bridge.
- Add route discontinuities, direct-to, leg modification, missed-approach/non-normal limitations only when base lateral/vertical path is stable.

Acceptance:

- VNAV has a source of altitude constraints, computes a descent/climb path over distance, commands pitch/vertical path within declared authority, and displays FMA truth from the same state used by servo laws.
- Visible-control tests show player can use MCP/FMS controls without hidden AP ownership or fake modes.

### P1.4 — Product layout/playability needs a non-debug cockpit presentation

Evidence:

- Dogfood screenshot showed panel crowding at 1280x720.
- Product UI currently composes several fixed overlays at once: `src/app/RfsShell.tsx:337-384`.
- Route status and takeoff setup are fixed panels: `src/components/RouteStatus.tsx:5-19`, `src/components/TakeoffSetupPanel.tsx:6-19`.
- MCP is a fixed floating panel: `src/instruments/RfsMCP.tsx:185-196`.
- Debug help/settings/telemetry can be mounted as debug panels: `src/app/RfsShell.tsx:337-344`.
- At review time visual tests were red, so layout regressions were not protected; local remediation later added non-overlap guards and refreshed snapshots, but CI protection still requires exact-SHA verification.

Remaining work:

- Define a player cockpit layout separate from debug/development overlays.
- Move debug telemetry/help/settings behind an explicit dev/debug mode that does not obscure flight-critical panels.
- Add responsive layout rules for 1280x720, laptop, and larger desktop sizes.
- Decide how Cesium attribution/watermark should coexist with product UI.

Acceptance:

- At supported viewport sizes, the player can see runway/outside reference, PFD, MCP, route status, setup/coach, and controls without major overlap.
- Visual tests protect this layout.

### P1.5 — Make controls and accessibility first-class for a playable loop

Evidence:

- Gear command gating is cleanly modeled: `src/input/gearCommand.ts:8-18` and applied in input slice at `src/store/slices/inputSlice.ts:25-44`.
- Takeoff setup/current configuration is visible and controlled through buttons: `src/components/TakeoffSetupPanel.tsx:78-120`.
- Gamepad support now includes command buttons for start/pause/reset/camera/overlay/audio/MCP basics: `src/input/GamepadManager.ts:4-18` and `src/input/GamepadManager.ts:36-48`.
- Binding docs expose keyboard/gamepad labels: `src/input/controlBindings.ts:34-130`.

Remaining work:

- Dogfood with keyboard-only, mouse-only, and gamepad flows.
- Persist or expose control calibration if gamepad support is meant to be durable.
- Add accessible status for rejected commands, gear-up rejection before positive rate, audio/caption state, and route/MCP reasons.
- Ensure buttons remain reachable and understandable when panels move for layout cleanup.

Acceptance:

- A user can complete the tutorial takeoff and reset with keyboard-only and gamepad-only flows, with visible feedback for blocked commands.

### P1.6 — Worker/runtime performance is scaffolded but not actually async in the main loop

Evidence:

- Browser worker runtime exists, but sync `step()` falls back to the main-thread runtime because the store loop is synchronous: `src/sim/simulationRuntime.ts:94-99`.
- Async worker `stepAsync()` exists separately: `src/sim/simulationRuntime.ts:101-120`.
- Frame scheduler phases are synchronous: `src/runtime/frameScheduler.ts:66-77`.
- `useSimLoop` calls `tickRef.current(timestamp)` synchronously: `src/hooks/useSimLoop.ts:23-30`.
- Roadmap still lists worker timing as remaining: `docs/roadmap.md:108-132`.

Remaining work:

- Decide whether the worker path is required before public launch or after playability.
- If required, make the frame/store loop async-aware or design a double-buffered state handoff.
- Measure postMessage cost before default-on.
- Keep deterministic tests for main-thread and worker-handler parity.

Acceptance:

- Worker-enabled local check passes.
- Runtime reports whether physics is main-thread or worker.
- No stale input/AP/route/weather state crosses worker boundaries.

## P2 — Strategic/deeper work

### P2.1 — Public repo self-containment and dependency policy

Evidence:

- `@virtual-cdu/shared` is a file dependency: `package.json:43-50`.
- CI bootstraps RFMS shared before `npm ci`: `.github/workflows/ci.yml:44-48`.
- Docker bootstrap assumes the shared dependency can be created/resolved before install: `Dockerfile:12-16`.
- Route source limitation still notes RFMS shared remains a sibling checkout via path mapping: `src/sim/flightPlanLoader.ts:111-115`.

Remaining work:

- Decide whether RFMS shared should be a published package, vendored subtree/submodule, generated types, or a documented bootstrap dependency.
- Ensure a normal public contributor can clone and build with one documented command.
- Keep CI/Docker/local bootstrap paths identical.

Acceptance:

- Fresh clone on a clean machine builds with documented commands and no hidden sibling checkout assumptions.

### P2.2 — Rendering, environment, and immersion depth

Evidence:

- Roadmap still lists rendering release hardening and product polish: `docs/roadmap.md:134-157` and `docs/roadmap.md:196-204`.
- Weather/atmosphere expansion remains: `docs/roadmap.md:184-194`.
- Audio loop includes engine sound updates plus GPWS caption/speech handling: `src/hooks/useAudioLoop.ts:14-43` and `src/audio/GPWS.ts:91-117`.

Remaining work:

- More complete cockpit/interior model.
- Better clouds/visibility/QNH/density-altitude presentation.
- Better engine/cockpit/airframe sounds, with caption/persistence/accessibility behavior.
- Better scene loading/error states.
- PWA completeness if desired.

Acceptance:

- The simulator feels like a coherent product rather than development overlays on a Cesium scene.
- Immersion features have graceful degradation and accessible alternatives.

### P2.3 — OSS/project presentation and maintenance posture

Evidence:

- Package metadata is now public/MIT/repository-linked: `package.json:1-23`.
- CI contains pinned actions, secret scan, Docker smoke, and release metadata checks: `.github/workflows/ci.yml:16-63` and `.github/workflows/ci.yml:64-110`.

Remaining work:

- Confirm repository admin settings, required checks, branch protection, release permissions, and security contact are correct on GitHub.
- Keep README/status/docs aligned with actual gates and live endpoint.
- Avoid stale review claims; link this review from roadmap if accepted.

Acceptance:

- A contributor can see build status, license, security policy, contribution path, and current simulation truth boundaries without reading old review history.

## Recommended next execution order

1. P0 gate cleanup:
   - fix visual spec/copy/snapshots/layout;
   - run the manifest-listed visible-control black-box/stage specs;
   - split/quarantine any continuous full-flight smoke if it is too long/flaky;
   - make `npm run test:e2e` finish deterministically;
   - clean/commit or discard dirty files.
2. Route/landing truth alignment:
   - keep KPDX 10R as the chosen KSEA→KPDX proof runway;
   - keep route contract, scenario, route panel, runway surface, touchdown assertions, and black-box spec aligned to KPDX 10R.
3. Visible-control acceptance:
   - promote visible-control route/landing stages to stable CI tests;
   - keep seeded helper tests as lower-level scoped regression tests.
4. Product layout pass:
   - remove overlapping debug-style panel layout;
   - make visual tests green and meaningful.
5. Realism/data pass:
   - source-backed FDM/performance envelopes;
   - improved ground/landing/VNAV realism with explicit data boundaries.
6. Release/live pass:
   - local gates;
   - GitHub Actions completed/success;
   - live endpoint SHA/image verification.

## Current bottom line

RFS is a serious playable-prototype candidate with green local static/unit/build gates, deterministic visual/layout checks, KPDX 10R-aligned route/landing fixtures, and manifest-listed visible-control black-box/stage evidence. It is still not safe to call this branch a proven continuous full-flight/full-route simulator, CI green, deployed, or live without exact-SHA GitHub Actions and endpoint verification. The next major work is realism depth: source-backed FDM/performance data, real VNAV/FMS behavior, broader ground/landing/taxi tuning, continuous route-coupled descent/approach/landing proof, and product-grade browser polish.
