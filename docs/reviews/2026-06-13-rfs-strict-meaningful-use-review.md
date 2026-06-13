# RFS strict meaningful-use review — 2026-06-13

Repo: `/Users/reidar/Projectos/RFS`  
Observed branch: `master`  
Observed HEAD: `80c5c6f741b63fda1315642620d3802fb88a2c94`  
Review goal: find the remaining issues, bugs, gaps, and enhancement needs that block RFS from becoming a flight simulator that can be used meaningfully rather than a technically impressive browser demo.

## Non-claims

- This started as a review and evidence ledger; a follow-up local remediation pass was applied after the original audit findings were captured.
- I did not push, deploy, rewrite history, apply stash, or read secrets.
- I did create this report and new local dogfood artifacts.
- Local/browser evidence below is local unless explicitly marked live.
- Scoped/seeded browser proofs are not full-flight, full-route, continuous VNAV, route-coupled landing, or aircraft-data validation proof.
- Follow-up fixes are local/unpushed unless separately verified through GitHub Actions and the live `/rfs-version.json` endpoint.

## Evidence ledger

### Repository/release state

- `git status --short --branch`: `## master...origin/master` plus pre-existing/new untracked `dogfood-output/`.
- Preserved existing stash: `stash@{0}: On master: pre-plan dirty RFS FDM/system batch`.
- Local HEAD: `80c5c6f741b63fda1315642620d3802fb88a2c94`.
- Live `https://fly.reidar.tech/rfs-version.json`: commit `80c5c6f741b63fda1315642620d3802fb88a2c94`, image `ghcr.io/reedtrullz/rfs:sha-80c5c6f741b63fda1315642620d3802fb88a2c94`, `imageDigest: unknown`.
- GitHub Actions run `27462190225`: `secret-scan`, `test`, `publish`, and `deploy` all `completed/success` for the same SHA.
- GitHub branch protection API: `Branch not protected`; repo rulesets: empty.
- Live root: HTTP 200. Header probe only exposed `server: cloudflare`; no HSTS/CSP/X-Content-Type-Options/Referrer-Policy/Permissions-Policy/X-Frame-Options headers were observed.
- `npm audit --audit-level=moderate --json`: 0 total vulnerabilities across 465 dependencies.

### Gates run locally with Node 22

Original audit gates:

- `npm run check`: passed.
  - `check:deps`: single Three version `0.184.0`.
  - `check:release`: passed.
  - `lint:ci`, `typecheck`, `test`, `build`: passed.
  - Vitest: 87 files / 661 tests passed.
  - Known warnings/noise: React ESLint version-settings warning; jsdom canvas `getContext()` not implemented notices in tests.
- `CI=1 npm run test:visual`: passed, 19 Playwright tests in one worker.
- `lsof -nP -iTCP:5173 -sTCP:LISTEN` after dogfood: no dev server left listening.

Follow-up remediation gates:

- `npm run check`: passed after fixes.
  - `check:deps`: single Three version `0.184.0`.
  - `check:release`: passed.
  - `lint:ci`, `typecheck`, `test`, `build`: passed.
  - Vitest: 87 files / 663 tests passed.
  - Known warnings/noise unchanged: React ESLint version-settings warning; jsdom canvas `getContext()` notices.
- Targeted regression batch passed: `check:release`; `AttitudeIndicator.test.tsx`; `RfsMCP.test.tsx`; `simulationStep.test.ts`; Playwright `LOAD PLAN stays truthful` and `KSEA route is loaded` proofs.
- `CI=1 npm run test:visual`: passed, 19 Playwright tests in one worker.

### Browser dogfood artifacts

New local artifacts:

- Dogfood directory: `/Users/reidar/Projectos/RFS/dogfood-output/2026-06-13-rfs-comprehensive-review/`
- State capture: `/Users/reidar/Projectos/RFS/dogfood-output/2026-06-13-rfs-comprehensive-review/browser-states.json`
- Console/events: `/Users/reidar/Projectos/RFS/dogfood-output/2026-06-13-rfs-comprehensive-review/browser-events.json`
- Screenshots: `/Users/reidar/Projectos/RFS/dogfood-output/2026-06-13-rfs-comprehensive-review/screenshots/`

Dogfood covered initial ENVA, ENVA no-route LOAD PLAN, KSEA LOAD PLAN route-only, KSEA stopped LNAV click, manual ENVA start roll/rotation/gear-up, overlay/camera cycles, save/load, and 1024/1280/1440/1920 responsive captures.

Key browser observations:

- ENVA default LOAD PLAN now gives visible no-route feedback and keeps FMA/AP OFF.
- KSEA LOAD PLAN now loads the route with FMA/AP OFF.
- Clicking LNAV while stopped at KSEA engages visible `AP CMD_A` + `ROLL LNAV` at 0 kt / weight-on-wheels / PARKED. Screenshot: `04-ksea-lnav-clicked-stopped.png`.
- Manual ENVA takeoff was flyable locally: after rotation/gear command the browser reached CLIMB, gear UP, RA ~693 ft, IAS ~181 kt, VS shown by PFD ~2846 fpm. Screenshot: `07-enva-after-gear-command.png`.
- Continuing the climb in debug/camera checks showed high pitch / high VS / speed decay: debug body text had pitch ~24.9°, VS ~6648 fpm, IAS ~168 kt; later ~19.4°, VS ~4017 fpm, IAS ~142 kt. This is playable evidence, not realism proof.
- Debug/responsive UI is not product-ready: at 1024x768, Telemetry, Runway Editor, PFD, MCP, Controls settings, Engine strip, bottom buttons, and Cesium credits compete for the same viewport. Screenshot: `13-responsive-1024x768.png`.
- Accessibility DOM capture found `headingCount: 0`, `mainCount: 0` across all states.
- Console/events captured repeated WebGL `GPU stall due to ReadPixels` warnings and 40 SVG errors of the form `<rect> attribute height: A negative value is not valid`, traced to the debug `AttitudeIndicator` horizon rectangle at high pitch.

## Definition of “meaningful use” for RFS

Before calling RFS meaningfully usable, I would require this evidence, at minimum:

1. A visible-control browser flow from scenario selection/configuration through takeoff, clean climb, route capture, descent/approach, landing, rollout, and reset — without direct store teleports for the main proof.
2. PFD/MCP/FMA/AP/A/T truth must be one-source-of-truth: no displayed active mode without actual command backing, and no hidden AP/A/T command when displays say OFF.
3. Flight dynamics must be bounded by source-lineaged or explicitly labeled performance data; gameplay placeholders can remain only where labels/tests prevent realism overclaims.
4. Landing/rollout/taxi must have credible energy, touchdown, braking, steering, and surface behavior, not only a seeded short-final touchdown smoke.
5. The browser UI must be readable, accessible enough for normal desktop use, and responsive at realistic laptop/desktop sizes.
6. Public release claims must be backed by exact-SHA CI/deploy/live evidence and protected from accidental broken deploys.

## Current high-level assessment

RFS is materially better than the 2026-06-12 audit state: live is current, gates are green, route-only LOAD PLAN truth improved, positive-rate/gear-up gating is in place, VNAV is at least exposed/partly constrained, and browser clean-climb/route/landing bridge proofs exist.

After this follow-up pass, four audit blockers are locally remediated but not pushed/deployed: deploy concurrency is encoded and covered by release-hardening checks; stopped/on-ground MCP active-mode clicks are gated; route-complete LNAV command ownership is cleared in the committed step result; and the debug `AttitudeIndicator` no longer emits negative-height SVG rectangles at high pitch.

Strictly: it is still not yet a meaningful 737 flight simulator. It is a strong, locally/live-shipped simulator prototype with a serious proof harness, but the next blockers are continuous flight proof, managed/autoflight truth edges, FDM/ground/landing realism, cockpit/product usability, runtime architecture, and public release governance.

## Follow-up local remediation applied after audit

The original findings table remains an audit ledger. These issue IDs are now partially or fully mitigated in the current local working tree:

- **RFS-2026-06-13-001 / 053 partial:** added top-level workflow `concurrency` with `cancel-in-progress: false` and expanded `scripts/release-hardening-check.mjs` so overlapping same-ref deploys are caught locally. Branch protection/rulesets are still open and require GitHub-side configuration.
- **RFS-2026-06-13-006:** added MCP runtime gating so stopped/PARKED/weight-on-wheels clicks on active MCP modes do not create visible `CMD_A/LNAV` or SPEED FMA authority; existing unit tests now explicitly seed airborne runtime state for legal MCP engagement.
- **RFS-2026-06-13-007:** recomposes the committed controls slice after post-integration route status, so final-leg route completion clears LNAV lateral command ownership in the same step result.
- **RFS-2026-06-13-031:** clamps the debug attitude horizon fill geometry and covers +30° pitch with a non-negative-rectangle regression.

## Resolved or materially improved since the 2026-06-12 55-finding audit

- Old “local HEAD not live/CI-proven” is resolved for current HEAD: live, origin, and successful CI/CD all point to `80c5c6f741b63fda1315642620d3802fb88a2c94`.
- Positive-rate / gear-up gating is materially resolved: shared predicate and store gear gate exist (`src/sim/flightPhasePredicates.ts:7-10`, `src/store/simStore.ts:143-161`, `src/store/simStore.ts:335`); browser truth-flow covers pre-positive-rate gear rejection (`e2e/rfs-truth-flow.spec.ts:118-130`).
- Runtime rotate guidance now uses scenario VR (`src/sim/takeoffCue.ts:7-9`, `src/sim/guidanceState.ts:61-83`), though the browser helper still hardcodes 135 kt.
- ENVA LOAD PLAN silent no-op is resolved: route-load message at `src/App.tsx:327-345`, browser truth-flow at `e2e/rfs-truth-flow.spec.ts:94-103`.
- KSEA LOAD PLAN route-only is resolved for the button path: `src/App.tsx:327-337`; browser truth-flow asserts FMA/AP OFF after route load (`e2e/rfs-truth-flow.spec.ts:105-116`).
- SPEED mode now uses IAS (`src/sim/systems/autopilot.ts:50-51`, `src/sim/systems/autopilot.ts:287-289`).
- Route completion now exists and disables LNAV when complete (`src/sim/systems/navigation.ts:438-452`), with UI “Arrived — route complete” (`src/components/RouteStatus.tsx:85-88`).
- MCP target seeding now uses current aircraft-ish values (`src/instruments/defaultAutopilotState.ts:74-85`).

## Prioritized findings

### P0 — blockers to truthful, meaningful use

| ID | Severity | Status | Evidence | Finding | Next task/test |
|---|---|---|---|---|---|
| RFS-2026-06-13-001 | Critical | Old-open | GitHub API: branch not protected / rulesets empty. Workflow has no top-level `concurrency` (`.github/workflows/ci.yml:2-7`, deploy at `116-123`). | Release governance is still unsafe: direct master pushes are not protected, and overlapping deploys can race shared VPS canary/prod names. | Add deploy concurrency first; then enable branch protection/rulesets requiring `secret-scan`, `test`, `publish`, `deploy`, no force-push/delete. |
| RFS-2026-06-13-002 | Critical | Old-open | `docs/architecture.md:171-174`, `docs/roadmap.md:81-85`; route helper seeds state at `e2e/helpers/rfsRoute.ts:531-610` and KPDX landing bridge teleports at `890-959`. | No continuous full-flight/full-route browser proof exists. Current proofs are valuable but scoped, seeded, and bridge-based. | Add a separate visible-control continuous proof: KSEA route load → takeoff → LNAV/A/T/VNAV or managed descent → approach/handoff → landing/rollout/reset, with no route/aircraft teleports. |
| RFS-2026-06-13-003 | Critical | Old-open | `src/sim/data/aircraft/b737-800-fdm.v1.ts:19-36`, `49-63`; `src/sim/data/performance/b737PerformanceCards.ts:68-75`, `102-109`. | Core B737 FDM/performance data is explicitly low-confidence gameplay placeholder data. This blocks credible 737 simulation claims. | Build source-lineaged FDM/performance tables by subsystem and test stall, climb, cruise trim, approach, engine lapse, landing distance against independent fixtures. |
| RFS-2026-06-13-004 | Critical | Old-open | `src/sim/runwaySurface.ts:82-107`; `src/sim/systems/ground.ts:524-598`. | Ground/contact/landing model still relies on flat runway rectangles, nearest-runway fallback, aggregate normal force, and snap-to-ground behavior rather than true multi-point wheel/runway/terrain contact. | Add wheel-by-wheel contact with gear station world positions, runway slope/surface data, independent strut loads, touchdown-zone/rollout/taxi/off-runway tests. |
| RFS-2026-06-13-005 | High | New | `src/sim/simulationStep.ts:121-155`. | One-tick AP truth risk: AP commands/effective controls are computed from pre-integration route status, but the committed `routeStatus` is recomputed after integration. A final-waypoint/capture tick can display route/LNAV unavailable while retaining prior AP commands until next tick. | Regression: cross final waypoint in one tick; assert committed routeComplete/FMA OFF and AP command ownership cleared in the same snapshot. Recompute controls after post-integration route truth. |
| RFS-2026-06-13-006 | High | New/product-truth | Dogfood `ksea-lnav-clicked-stopped`: FMA `CMD_A/LNAV` at `status=stopped`, `PARKED`, `IAS=0`, `WOW=true`. Code forces CMD A for any non-OFF MCP mode (`src/instruments/RfsMCP.tsx:127-166`, click path `176-183`). | MCP can engage active AP/CMD_A/LNAV while stopped/on the runway. That is misleading for a 737-like sim; AP should be phase-gated or explicitly armed/unavailable until allowed. | Add ground/phase gating: LNAV/HDG/ALT modes can be armed or rejected preflight, not active CMD_A. Browser-test KSEA stopped LNAV click and takeoff transition. |
| RFS-2026-06-13-007 | High | New | VNAV returns `ALT_HOLD` at capture (`src/sim/systems/vnav.ts:81-85`); AP target resolution only treats `VNAV`/`VNAV_PTH`/`ALT*` as VNAV (`src/sim/systems/autopilot.ts:173-189`); `ALT_HOLD` uses MCP altitude (`152-155`). | VNAV capture can lose the managed constraint target and fall back to the MCP selected altitude once the lifecycle becomes `ALT_HOLD`. | Test VNAV capture with MCP altitude deliberately different from active constraint; carry managed target/source through capture. |
| RFS-2026-06-13-008 | High | Old-open/new detail | Effective truth returns OFF when AP is not backed before considering thrust (`src/sim/systems/effectiveAutoflightTruth.ts:113-117`); MCP forces `CMD_A` for SPEED/N1 (`src/instruments/RfsMCP.tsx:139-165`). | A/T SPEED/N1 cannot be used independently of CMD A, preventing manual-flight-with-autothrottle and blurring AP/A/T truth. | Split AP and A/T truth/ownership. Browser-test A/T-only: AP OFF, thrust active, pilot owns elevator/aileron. |
| RFS-2026-06-13-009 | High | Old-open | Main-thread architecture documented (`docs/architecture.md:7-16`); worker flag default-off (`src/config/workerPhysics.ts:1-2`); runtime hard-wired main-thread (`src/sim/simulationRuntime.ts:42-57`); store calls sync runtime in RAF (`src/store/simStore.ts:411-428`). | Simulation still runs synchronously on the main thread. Performance headroom and deterministic timing remain fragile as visual/cockpit complexity grows. | Implement a real async browser-worker runtime selected by `VITE_RFS_WORKER_PHYSICS`, with parity, fallback, and Playwright worker-enabled smoke tests. |
| RFS-2026-06-13-010 | High | Old-open | Browser DOM `headingCount=0`, `mainCount=0`; fixed panels at `src/App.tsx:235-350`, `src/instruments/RfsPFD.tsx:551-563`, `src/instruments/RfsMCP.tsx:226-237`; 1024 screenshot shows severe overlap. | Product UI is not yet meaningfully usable at common desktop/laptop sizes and lacks basic semantic structure. | Add layout manager/responsive visual matrix and accessibility smoke: landmarks, heading, named regions, non-overlap assertions at 1024/1280/1366/1440/1920. |

### P1 — high-value functional and realism gaps

| ID | Severity | Status | Evidence | Finding | Next task/test |
|---|---|---|---|---|---|
| RFS-2026-06-13-011 | High | Old-open/residual | `e2e/helpers/rfsFlight.ts:57-63` hardcodes `ROTATION_IAS_KT = 135`; performance cards use VR 149 (`src/sim/data/performance/b737PerformanceCards.ts:54`, `88`). | Browser clean-climb helper rotates early relative to the displayed/scenario VR, weakening proof that the player flow respects V-speeds. | Make helpers read scenario performance card/cue before applying elevator; assert no rotation input before VR. |
| RFS-2026-06-13-012 | High | Old-open | Route helper direct store mutation (`e2e/helpers/rfsRoute.ts:546-610`), active-leg seeding (`607-609`), landing bridge seed (`890-959`). | Route/landing browser tests prove scoped contracts, not the playable UI loop. | Keep seeded tests, add one public-control-only route/landing proof. |
| RFS-2026-06-13-013 | High | Old-open | VNAV only evaluates active waypoint (`src/sim/systems/vnav.ts:44-47`, `96-107`); MCP hides VNAV unless currently available (`src/instruments/RfsMCP.tsx:85-100`, `305-311`). | VNAV is a narrow active-waypoint constraint follower, not managed VNAV with arm/lookahead/TOD/capture/hold lifecycle. | Add VNAV state machine tests: no route, future constraints armed, path capture, ALT*, managed ALT HOLD, route complete; render disabled VNAV with reason. |
| RFS-2026-06-13-014 | High | New | MCP selected speed is normally finite (`src/sim/systems/autopilot.ts:130-131`); VNAV speed constraint only applies if selected speed is undefined (`184-186`); default AP seeds speed (`defaultAutopilotState.ts:74-85`). | VNAV speed constraints can be ignored whenever the MCP selected-speed window exists. | Define managed vs selected speed semantics; test constrained route with selected speed above limit. |
| RFS-2026-06-13-015 | High | Old-open | RFS only depends on RFMS shared types (`package.json:21`); canned route loader at `src/sim/flightPlanLoader.ts:31-69`; store only `setFlightPlan` (`src/store/simStore.ts:626-642`). | FMS is a canned-route loader, not RFMS-backed route editing/EXEC/direct-to/discontinuity logic. | Define RFMS ownership/adaptation; add route edit/direct-to/discontinuity/EXEC tests and UI. |
| RFS-2026-06-13-016 | Medium-high | Old-open | FMA truth is current active truth only (`src/sim/systems/fmaTruth.ts:9-14`); future lifecycle noted in `docs/architecture.md:123-126`. | FMA lacks realistic armed/capture/change lifecycle and mode-change annunciation. | Introduce FMA lifecycle state: active/armed/capture/change timestamps; test against servo law. |
| RFS-2026-06-13-017 | Medium-high | Old-open/residual | AP uses PID/integrator law (`src/sim/systems/autopilot.ts:16-23`, `224-237`); PFD FD duplicates simplified math (`src/instruments/RfsPFD.tsx:175-247`). | Flight director bars are not generated by the same target/law path as AP commands, so FD and AP can diverge. | Expose shared AP guidance/target output and feed both AP commands and FD bars. |
| RFS-2026-06-13-018 | Medium-high | Old-open | N1 target is a hardcoded phase table (`src/sim/systems/autopilot.ts:103-109`) and simple percent-to-throttle (`325-330`). | N1 is not a 737 thrust-limit model with derates, temperature/altitude, engine limits, or target display. | Add source-lineaged thrust-limit tables and N1 target tests by phase/alt/OAT/derate. |
| RFS-2026-06-13-019 | Medium-high | Old-open | Synthetic coordinates and sparse constraints in `src/sim/flightPlanLoader.ts:4-8`, `31-69`. | The default route remains synthetic/sparse; useful for tests but not realistic FMS/navdata behavior. | Either label tutorial route constraints as synthetic in UI or add a procedure-backed sample route with provenance. |
| RFS-2026-06-13-020 | High | Old-open | Spoilers only add drag (`src/sim/physics/aero.ts:149-151`); lift remains `q*S*effectiveCl` (`156`); normal force estimate subtracts lift (`src/sim/physics/integrate.ts:47-49`). | Spoilers/speedbrakes do not dump lift or increase wheel loading, so rollout/RTO braking behavior is physically wrong. | Add spoiler lift-dump data and tests for normal force/stopping distance with spoilers. |
| RFS-2026-06-13-021 | High | Old-open | Config directly follows controls: flaps/gear set instantly (`src/sim/physics/integrate.ts:61-65`); ground contact forces gear down (`src/sim/systems/ground.ts:578-579`). | Gear/flaps have no commanded-vs-actual transit, timing, hydraulic dependencies, intermediate aero, or abnormal states. | Split commanded/actual gear/flap positions; add transit-rate and partial-aero interpolation tests. |
| RFS-2026-06-13-022 | High | Old-open | Flight phases only include `LANDED` after approach/descent touchdown (`src/sim/physics/integrate.ts:37-44`); guidance reconstructs rollout from landed/speed (`src/sim/guidanceState.ts:64-66`). | Landing collapses directly to LANDED; no explicit touchdown/derotation/rollout/taxi/stopped state machine. | Add `TOUCHDOWN`, `ROLLOUT`, `TAXI`, `STOPPED` phases with tests for sink, pitch, speed, braking, runway remaining. |
| RFS-2026-06-13-023 | High | Old-open | Approach card lacks VREF/glidepath/flare/landing distance (`src/sim/data/performance/b737PerformanceCards.ts:24-29`); seeded landing tests are broad. | Landing proof does not validate VREF, stabilized approach, glidepath, flare, touchdown zone, or stopping distance. | Add landing performance cards and browser/physics tests for stabilized approach through stopped rollout. |
| RFS-2026-06-13-024 | High | Old-open | Free angular dynamics run before ground contact (`src/sim/physics/integrate.ts:88-96`); liftoff is hard speed/pitch/load gates (`52-58`); ground attitude is broad clamp (`src/sim/systems/ground.ts:509-522`). | Takeoff rotation lacks main-gear pivot, nosewheel unloading, tailstrike margin, and true gear-geometry constraints. | Add ground rotation model and tests for VR pitch rate, tailstrike clearance, liftoff distance, RTO around V1. |
| RFS-2026-06-13-025 | High | Old-open | Engine thrust is N1² × density/Mach lapse (`src/sim/systems/engine.ts:17-25`); throttle maps to `20 + throttle*80` (`52-53`); fixed SFC (`70-74`). | Engine/thrust model is unvalidated and lacks idle/reverse/thrust ratings/spool/lapse tables. | Add engine data tables and takeoff acceleration, climb gradient, idle descent, reverse/RTO tests. |
| RFS-2026-06-13-026 | Medium-high | Old-open | Tire/brake constants are placeholder data (`src/sim/data/aircraft/b737-800-fdm.v1.ts:121-172`); ground brake uses command/coefficient/normal force. | Tire/brake model lacks wheel angular speeds, slip ratio, autobrake, reverse thrust integration, and runway condition effects. | Add wheel dynamics/anti-skid/autobrake/reverse-thrust and wet/contaminated runway tests. |
| RFS-2026-06-13-027 | Medium-high | Old-open | Crosswind counter-rudder test permits lateral displacement `<250 m` (`src/sim/physics/__tests__/integrate.test.ts:865-875`) while KSEA runway width is ~46 m. | A “bounded” crosswind takeoff can pass while effectively leaving the runway. | Replace with runway-edge/excursion bounds and explicit off-runway/abort state tests. |
| RFS-2026-06-13-028 | Medium-high | Old-open | Aero model uses broad CL/CD scalar model (`src/sim/physics/aero.ts:138-181`) and placeholder flap polars (`b737-800-fdm.v1.ts:49-63`). | Stall/high-lift/approach/upset behavior is smoke-level, not validated 737 dynamics. | Add source-backed clean/takeoff/landing polar tables, stall warning/buffet, and dynamic-mode sanity tests. |
| RFS-2026-06-13-029 | Medium-high | Old-open | App fetches KSEA METAR unconditionally (`src/App.tsx:150-158`); CloudLayer hardcodes KSEA coordinates and `Math.random()` (`src/viewport/CloudLayer.tsx:23-30`); aero uses ISA density (`src/sim/physics/aero.ts:133-135`). | Weather is scenario-mismatched and only wind/gust affects air-relative velocity; QNH/temp/density altitude/visibility are not in performance. | Add scenario weather station metadata, QNH/temp into atmosphere/performance, deterministic clouds, and hot/high/cold tests. |
| RFS-2026-06-13-030 | High | Old-open | Cockpit model is primitive/static (`src/viewport/CockpitModel.ts:106-123`); interaction definitions are placeholders/no-ops (`src/viewport/cockpitInteractions.ts:24-66`, `92-94`). | Cockpit mode is not a credible flyable cockpit; it is a camera shell with partial placeholder interactions. | Implement or hide/label no-op cockpit interactions; add live PFD/ND/MCP surfaces and cockpit pointer/keyboard tests. |
| RFS-2026-06-13-031 | High | New bug | Dogfood captured 40 SVG errors. Source: `src/components/AttitudeIndicator.tsx:35-37` uses `height={center + pitchOffset}`, which becomes negative above ~23.3° pitch. | Debug attitude indicator emits invalid SVG errors during climb/high-pitch states. | Clamp horizon rectangle y/height to `[0,size]`; add test with ±30° pitch. |
| RFS-2026-06-13-032 | High | Old-open | Dogfood console: WebGL `GPU stall due to ReadPixels`; debug screenshot body showed `4 FPS` at 1024 and `2 FPS` in another capture. | Performance warnings/low debug FPS remain visible during ordinary local dogfood. | Profile ReadPixels source; remove synchronous readback paths or gate debug-only captures; add FPS/perf budget smoke. |
| RFS-2026-06-13-033 | High | Old-open | MCP mode buttons lack `aria-pressed` (`src/instruments/RfsMCP.tsx:283-335`); CAM/OVL/AUDIO text-only (`src/App.tsx:308-325`); no headings/main. | Accessibility semantics are incomplete; mode state is visual/text only for core controls. | Add `<main>`, h1/regions, aria-pressed/current/labels, keyboard/focus tests. |
| RFS-2026-06-13-034 | Medium | Old-open | Save/load buttons only one global slot (`src/components/ScenarioPanel.tsx:71-77`); persistence key is single slot (`src/store/scenarioPersistence.ts:8`). | Save/load is too opaque for training loops: one unnamed slot, little context, no overwrite/load confirmation. | Add slot metadata summary: scenario, phase, route, timestamp, paused/running policy; tests for messages/confirmation. |
| RFS-2026-06-13-035 | Medium | New | Gamepad maps axes/flaps/gear/brake only (`src/input/GamepadManager.ts:72-103`); camera/overlay bindings empty (`src/input/controlBindings.ts:91-102`). | Gamepad cannot control START/PAUSE/RESET/camera/overlay/audio; not usable for full sim loop. | Add edge-trigger gamepad bindings and visible help/settings tests. |
| RFS-2026-06-13-036 | Low-medium | Old-open | Audio button states only (`src/App.tsx:223-229`, `320-325`); enabling hard-sets volume 0.5 (`210-216`). | Audio UX is functional but opaque: no volume/mute persistence, blocked-audio help, or GPWS captions/log. | Add audio settings/persistence and accessible status/caption tests. |
| RFS-2026-06-13-037 | Medium | Old-open | Cesium credit/commercial watermark visible in screenshots; degraded banner is small/fixed (`src/components/SceneStatus.tsx:13-17`). | Cesium product/legal posture needs a deliberate release decision; credits/attribution overlap product UI. | Decide entitlement/attribution/degraded strategy and assert non-overlap in visual tests. |

### P2 — architecture, release, OSS, and maintainability gaps

| ID | Severity | Status | Evidence | Finding | Next task/test |
|---|---|---|---|---|---|
| RFS-2026-06-13-038 | High | Old-open | `App.tsx` owns sim/audio loops, keyboard/gamepad, weather, camera, viewport layers, overlays, route load, toolbar (`src/App.tsx:1-30`, `52-158`, `160-184`, `235-350`). | `App.tsx` remains an orchestration god-object. | Extract input/weather/scene/control-bar/sim shell components and focused tests. |
| RFS-2026-06-13-039 | High | Old-open | Store combines aircraft, inputs, AP, route, wind, persistence, tick, UI messages (`src/store/simStore.ts:56-97`, `359-450`, `645-677`). | `simStore` is still a domain monolith and hot runtime choke point. | Split slices behind stable public API; add compatibility tests for reset/load/start/tick. |
| RFS-2026-06-13-040 | Medium-high | Old-open | Separate RAF loops: sim (`src/hooks/useSimLoop.ts:7-12`), input (`src/App.tsx:135-148`), audio (`src/hooks/useAudioLoop.ts:17-28`), contrails/FPS elsewhere. | Multiple independent RAF loops make ordering and hidden-tab/worker timing hard to reason about. | Central frame scheduler: input → simulation → visual/audio/diagnostics; visibility throttling tests. |
| RFS-2026-06-13-041 | Medium | Old-open | PFD/Telemetry recompute derived snapshots repeatedly (`src/instruments/RfsPFD.tsx:471-527`, `src/components/Telemetry.tsx:8-21`). | Instrument selectors duplicate compute work and can churn React/Zustand subscriptions. | Add memoized instrument snapshot/view-model and selector stability tests. |
| RFS-2026-06-13-042 | Medium | Old-open | AP PID/throttle limiter module globals (`src/sim/systems/autopilot.ts:16-23`), manual reset (`75-81`). | AP controller state is hidden module-level mutable state, blocking deterministic replay/multiple runtimes/worker migration. | Move AP controller state into runtime/store/worker codec; test two runtimes cannot share integrator state. |
| RFS-2026-06-13-043 | Medium | Old-open/new detail | Worker codec structured-clones every request/response (`src/sim/workerCodec.ts:55-57`, `155-178`, `181-214`); parity runtime is synchronous (`src/sim/simulationRuntime.ts:27-39`). | Worker bridge design can multiply clone/postMessage cost and lacks payload budget tests. | Benchmark representative payloads; move stable spec/route data into runtime state or delta messages; add perf budget tests. |
| RFS-2026-06-13-044 | High | Old-open | PR path runs npm/build/visual only; Docker build/push is master-only (`.github/workflows/ci.yml:59-61`, `94-108`). | PR CI does not build/run/curl-smoke the actual nginx/Docker artifact that deploys later. | Add PR-safe Docker build with `push:false`, run image, curl `/` and `/rfs-version.json`. |
| RFS-2026-06-13-045 | High | Old-open | Rollback ignores failed previous-image start (`.github/workflows/ci.yml:144-153`); public failure rolls back without verifying rollback health/version (`197-205`); Ansible rollback similarly lacks post-rollback public version verification (`ansible-playbook.yml:218-236`). | Rollback can fail silently or leave production unverified after a failed promotion. | Make rollback start failures loud; verify container state + public `/` + version after rollback. |
| RFS-2026-06-13-046 | High | Old-open | Metadata default digest unknown (`scripts/write-version-metadata.mjs:13-14`); Docker `RFS_IMAGE_DIGEST` not passed by CI build args (`Dockerfile:5`, `.github/workflows/ci.yml:104-108`); live has `imageDigest: unknown`. | Release provenance still lacks image digest in runtime metadata. | Publish post-build provenance keyed by `steps.build.outputs.digest`, or inject digest after build via manifest/version endpoint. |
| RFS-2026-06-13-047 | High | Old-open | Final image has no `USER` (`Dockerfile:31-46`); docker runs omit read-only/no-new-privileges/cap-drop/pids/user (`.github/workflows/ci.yml:148-152`, `160-162`, `186-190`; `ansible-playbook.yml:141-154`). | Runtime container is not hardened. | Make nginx non-root/read-only compatible; add tmpfs, cap-drop, no-new-privileges, pids-limit, explicit user, and canary proof. |
| RFS-2026-06-13-048 | Medium | Old-open | `nginx.conf:1-14` only routes/cache; live header probe lacks HSTS/CSP/X-Content-Type-Options/Referrer-Policy/Permissions-Policy/frame-ancestors. | Baseline HTTP security headers are missing. | Add safe headers first; evaluate Cesium-compatible CSP separately. Do not add COOP/COEP. |
| RFS-2026-06-13-049 | High | Old-open | Local sibling dependency `@virtual-cdu/shared: file:../RFMS/shared` (`package.json:21`); CI/Docker clone RFMC (`.github/workflows/ci.yml:35-40`, `72-77`; `Dockerfile:9-15`). | Public repo is not self-contained for a normal clone/build. | Publish/version shared package, submodule/subtree, or one-command bootstrap matching CI pinned checkout. |
| RFS-2026-06-13-050 | Medium | Old-open/new docs mismatch | CI omits `check:deps` but docs call local gate same as CI (`package.json:13-15`, `.github/workflows/ci.yml:47-57`); architecture still says LOAD PLAN applies safe AP defaults (`docs/architecture.md:113`) while current code is route-only (`src/App.tsx:327-337`). | CI/docs state is inconsistent; stale docs can mislead future work. | Either run exact `npm run check` + visual in CI or document differences; update LOAD PLAN architecture wording. |
| RFS-2026-06-13-051 | Medium | Old-open | GitHub repo is public with `license:null`; no `LICENSE*`, `SECURITY*`, `CONTRIBUT*`, `CODE_OF_CONDUCT*`, `SUPPORT*`, `CODEOWNERS`, issue/PR templates found; `package.json:2-4` has private/no metadata. | OSS governance/package metadata are incomplete for a public simulator project. | Choose license; add SECURITY, CONTRIBUTING, CODE_OF_CONDUCT, CODEOWNERS, issue/PR templates, package repository/license metadata. |
| RFS-2026-06-13-052 | Medium | Old-open | No Dependabot/Renovate/CodeQL config found; GitHub API reports Dependabot security updates disabled. | Dependency update automation is absent/disabled. | Add Dependabot/Renovate for npm, Actions, Docker digest refresh; consider CodeQL/SBOM/attestation. |
| RFS-2026-06-13-053 | Medium | New/expanded | Release check covers useful string invariants but not branch protection, concurrency, rollback verification, headers, container hardening, OSS files, dependency automation (`scripts/release-hardening-check.mjs:33-81`). | Release-hardening script is too narrow relative to current release-risk surface. | Add a local/optional-GitHub policy check script for release governance. |
| RFS-2026-06-13-054 | Low-medium | New | Manual chunk map exists (`manualChunks.config.ts:1-18`); Vite `chunkSizeWarningLimit` is warning-only (`vite.config.ts:21-29`); no built-output budget test. | Bundle/chunk policy can regress silently. Current Three chunk is near the documented ceiling. | Add post-build raw/gzip size budget check for app, React/vendor, Three, Cesium chunks. |

## Recommended execution order

1. **Remaining release safety first**
   - Enable branch protection/rulesets requiring `secret-scan`, `test`, `publish`, and `deploy`; disable force-push/delete.
   - Add rollback verification, image-digest provenance, container hardening, and HTTP security headers.
   - Keep the local deploy-concurrency check as a guard, but do not claim it is live until pushed and verified.

2. **One meaningful flight proof**
   - Build a no-teleport browser acceptance flow that uses visible controls.
   - Fix the browser takeoff helper’s 135 kt rotation mismatch before using it as evidence.
   - Treat all seeded route/landing tests as scoped fixtures, not full-route/full-flight proof.

3. **Autoflight/VNAV truth**
   - Separate AP and A/T truth/ownership.
   - Carry VNAV managed target through ALT* / ALT HOLD capture.
   - Define managed-vs-selected speed behavior.
   - Add FMA armed/capture/change lifecycle.

4. **Flight-model realism pass**
   - Source-lineaged FDM/performance tables.
   - Spoiler lift dump, gear/flap transit, engine/reverse/autobrake/tire dynamics.
   - Landing/rollout/taxi phases and touchdown/stopping-distance tests.

5. **Product usability pass**
   - Responsive layout manager and accessibility semantics.
   - Cockpit interaction/productization or honest placeholder removal.
   - Investigate remaining WebGL stall/perf warnings separately from the fixed AttitudeIndicator SVG issue.

6. **Architecture/runtime pass**
   - Split App/store hot paths.
   - Centralize frame scheduler.
   - Move AP controller state into runtime state.
   - Implement real worker runtime with payload budgets.

7. **OSS/release hardening**
   - PR Docker smoke, verified rollback, image digest provenance, hardened container, HTTP headers.
   - Self-contained RFMS dependency story.
   - Governance files and dependency automation.

## First concrete acceptance test I would write next

A Playwright test named something like:

`e2e/rfs-meaningful-flight.spec.ts`

Acceptance scope:

1. Select KSEA tutorial through visible scenario picker.
2. Click LOAD PLAN; assert route loaded and FMA/AP OFF.
3. Verify clicking LNAV while stopped does **not** show active CMD_A/LNAV; it should either arm, reject, or explain unavailable.
4. START ROLL, set flaps/trim/thrust through keyboard/visible controls, rotate no earlier than scenario VR.
5. Raise gear only after positive-rate predicate is true.
6. At a safe airborne gate, explicitly engage legal LNAV/A/T/vertical mode through MCP and assert FMA equals command ownership.
7. Continue until at least one route leg sequences without direct `setState` teleport.
8. Record bounded pitch/VS/IAS envelopes and no console errors.

This does not need to prove the entire KSEA→KPDX landing on day one, but it should become the trunk test for “actual player-loop simulator proof” instead of another seeded bridge.
