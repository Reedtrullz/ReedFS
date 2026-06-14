# RFS meaningful-use deep review — round 2 — 2026-06-13

> Supersession note — 2026-06-14: this strict review is preserved as the source audit for `RFS-MU2-001` through `RFS-MU2-046`. The remediation closeout and current proof boundaries are recorded in `docs/reviews/2026-06-13-rfs-meaningful-use-remediation-closeout.md`. Do not read the `Open` statuses below as current without checking that closeout ledger and the current roadmap.

Repo: `/Users/reidar/Projectos/RFS`
Review mode: strict, evidence-backed, read-mostly audit plus local browser dogfood
Local HEAD reviewed: `d76567db28ade53b5568cae58fe3d5dabd5dd634` (`Tighten RFS autoflight truth and release concurrency`)
Branch state during review: `master...origin/master [ahead 1]` with untracked `dogfood-output/`
Live endpoint during review: `https://fly.reidar.tech/rfs-version.json` still reports `80c5c6f741b63fda1315642620d3802fb88a2c94`, not `d76567d`.

## Non-claims

- I did **not** push, deploy, rewrite history, apply stash, or read secrets.
- `d76567d` is local only relative to `origin/master`; CI/live success is verified only for the older `80c5c6f...` SHA.
- Browser dogfood below is local dev-server evidence, not production evidence.
- Scoped/seeded tests are treated as scoped contracts, not as proof of a continuous full-flight/full-route player loop.
- This report is intentionally strict: green tests and a successful local takeoff attempt do not equal a meaningful 737 simulator.

## Evidence ledger

### Repository/release state

- `git status --short --branch`: `## master...origin/master [ahead 1]`, untracked `dogfood-output/`.
- Local HEAD: `d76567db28ade53b5568cae58fe3d5dabd5dd634`.
- `git rev-list --left-right --count origin/master...HEAD`: `0 1`.
- Live `rfs-version.json`: commit/image `80c5c6f741b63fda1315642620d3802fb88a2c94`, `imageDigest: unknown`.
- Latest GitHub Actions run observed: `27462190225`, `completed/success`, `headSha=80c5c6f...`.
- GitHub branch metadata: `master protected=false`.
- `npm run check:release`: passed.
- `npm audit --omit=dev --audit-level=moderate`: `found 0 vulnerabilities`.
- Final local `npm run check`: passed after this report was written.
  - `check:deps`: single Three version `0.184.0`.
  - `check:release`: passed.
  - `lint:ci`, `typecheck`, `test`, `build`: passed.
  - Vitest: 87 files / 663 tests passed.
  - Known noise: React ESLint version-settings warning; jsdom canvas `getContext()` notices.
- Final local visual/e2e verification was flaky but ended green:
  - First `CI=1 npm run test:visual`: 17 passed, 2 timed out (`rfs-route` extended descent bridge and `rfs-truth-flow` LOAD PLAN truth-flow).
  - Targeted reruns of both failed tests passed individually.
  - Full retry `CI=1 npm run test:visual`: 19 passed in one worker.

### Codebase size snapshot

Fallback line-count script excluding `.git`, dependencies, build output, test artifacts, coverage, and dogfood output:

- 284 source/docs/config files, 68,389 lines.
- Major buckets: Markdown 33,187 lines; TypeScript 22,005; TSX 5,600; JSON 6,836.
- Largest active test/helper files: `e2e/helpers/rfsRoute.ts` 1,225 lines, `e2e/helpers/rfsFlight.ts` 891 lines, `src/store/__tests__/simStore.test.ts` 1,034 lines, `src/sim/physics/__tests__/integrate.test.ts` 888 lines.

### Specialist audit probes

Read-only specialist passes inspected physics/FDM/ground, autoflight/FMS/VNAV/PFD/MCP/FMA, UX/cockpit/accessibility, architecture/runtime/performance/tests, and release/CI/security/OSS posture.

Targeted suites run by specialists:

- Physics/systems focused batch: 5 files / 135 tests passed.
- Autoflight/instruments/store focused batch: 7 files / 140 tests passed.
- Release checks: `npm run check:release` passed.

### Browser dogfood artifacts

New local dogfood directory:

- `/Users/reidar/Projectos/RFS/dogfood-output/2026-06-13-rfs-meaningful-use-round2/`
- `browser-states.json`
- `browser-events.json`
- `takeoff-samples.json`
- screenshots under `screenshots/`:
  - `01-initial-enva-flight-overlay.png`
  - `02-enva-load-plan-no-route.png`
  - `03-ksea-load-plan-route-only.png`
  - `04-ksea-stopped-lnav-spd-click-after-gating.png`
  - `05-ksea-start-roll-configured-by-keyboard.png`
  - `06-ksea-manual-visible-control-takeoff-attempt.png`
  - `07-camera-overlay-audio-cycles.png`
  - `08-responsive-1024x768.png`
  - `09-responsive-1280x720.png`
  - `10-responsive-1440x900.png`
  - `11-responsive-1920x1080.png`

Dogfood facts:

- ENVA `LOAD PLAN` now shows visible no-route feedback: `No default route is available for ENVA Tutorial Takeoff.`
- KSEA `LOAD PLAN` loads `KSEA→KPDX`, keeps AP/FMA OFF while stopped.
- Clicking stopped/on-ground `LNAV` and `SPD` no longer creates visible `CMD_A/LNAV/SPEED` truth. This confirms the local `d76567d` gating fix worked locally.
- However, stopped MCP buttons remain visually clickable/enabled and mostly lack disabled/unavailable semantics; the click simply does nothing.
- Local visible-control/keyboard dogfood could reach KSEA climb: screenshot `06`, phase `climb`, flight phase `CLIMB`, AGL ~487 ft, IAS ~158 kt, VS ~3,385 fpm, pitch ~17.3°, gear up, AP OFF.
- Continued climb showed speed decay and high pitch/high VS: final snapshot AGL ~1,719 ft, IAS ~136 kt, VS ~3,104 fpm, pitch ~19.1°.
- Takeoff samples showed premature rotation/attitude rise before VR: at IAS ~89 kt, phase already `rotation`, pitch ~6.7°, even though the script did not begin elevator rotation until IAS >= 149 kt.
- Console captured 0 errors/page errors/request failures, but 4 WebGL `GPU stall due to ReadPixels` warnings.
- Accessibility DOM counters remained `h1=0`, `main=0`, `heading=0` across dogfood states.
- 1024×768 debug layout is not product-ready: Scenario panel, debug telemetry, Runway Editor, Route panel, PFD, MCP, Controls settings, bottom controls, Cesium credit, and FPS badge compete for the same viewport.

## Meaningful-use bar

Before RFS can honestly be called meaningful as a flight simulator, it needs proof of all of these, not just local green tests:

1. A black-box browser/player loop from scenario selection/configuration → takeoff → clean climb → route capture → descent/approach → landing → rollout/stop → reset, using visible controls/keyboard/gamepad only.
2. One-source-of-truth PFD/MCP/FMA/AP/A/T/control ownership: no displayed active mode without real command backing, and no hidden command authority while displays say OFF.
3. Flight dynamics bounded by source-lineaged 737 data or explicitly labeled gameplay placeholders with tests preventing realism overclaims.
4. Takeoff/landing/rollout/taxi physics with credible energy, wheel contact, braking, steering, runway surface, and stopping-distance behavior.
5. UI that is discoverable, readable, accessible enough for normal desktop use, and responsive at laptop/desktop sizes.
6. Public release posture where exact-SHA CI/deploy/live status, rollback, container hardening, branch protection, and provenance are not ambiguous.

## High-level assessment

RFS is significantly stronger than a toy demo: it has a real simulation loop, route state, PFD/MCP/FMA surfaces, browser proofs, release checks, and local dogfood can get a 737-like aircraft airborne. The prior local follow-up fixed several truth bugs: stopped/on-ground AP mode clicks no longer falsely engage, route-complete commands are recomposed, deploy concurrency exists locally, and the debug attitude SVG error is gone.

Strictly, it is **not yet meaningfully usable as a 737 flight simulator**. It is a serious browser-native simulator prototype with an unusually good regression harness, but it still lacks a continuous black-box flight proof, validated FDM/performance data, credible takeoff/landing ground-contact physics, discoverable player controls, usable cockpit mode, mature VNAV/FMS behavior, and production release governance.

## Resolved/materially improved in local `d76567d`

| Area | Evidence | Status |
|---|---|---|
| Stopped/on-ground MCP truth | Dogfood `04-ksea-stopped-lnav-spd-click-after-gating.png`; state shows AP truth null, AP commands `{}` after stopped LNAV/SPD clicks. Code gate: `src/instruments/RfsMCP.tsx:120`, `180-184`. | Locally improved, not live. |
| Deploy concurrency | `.github/workflows/ci.yml:11-13`; release check passed. | Locally improved, not live; branch protection still absent. |
| Debug attitude SVG negative-height issue | Dogfood round 2 captured no SVG errors; console only WebGL warnings. | Locally improved. |
| ENVA no-route feedback | `src/App.tsx:327-345`; dogfood `02` body text includes no-route message. | Improved. |

## P0 — blockers to truthful meaningful use

| ID | Severity | Status | Evidence | Finding | Next test/task |
|---|---|---|---|---|---|
| RFS-MU2-001 | Critical | Open | Landing helpers directly seed aircraft state: `e2e/helpers/rfsFlight.ts:447-497`; route landing bridge seeds KPDX short final: `e2e/helpers/rfsRoute.ts:911-959`; docs scope browser proofs as seeded/scoped: `docs/architecture.md:171-174`. | No continuous black-box full-flight/full-route browser proof exists. Current tests prove valuable slices, not that a user can complete a meaningful simulator flight. | Add `e2e/rfs-blackbox-player-loop.spec.ts`: select KSEA, load route, configure, take off, engage legal AP/A/T after airborne, sequence at least one leg, descend/approach or handoff, land, roll out, reset — no direct `useSimStore.setState`, no route/aircraft teleport. |
| RFS-MU2-002 | Critical | Open | FDM lineage explicitly placeholder/low-confidence: `src/sim/data/aircraft/b737-800-fdm.v1.ts:19-36`; flap/drag constants are “B737-ish gameplay values”: `49-63`; performance cards say broad gameplay guard, not AFM table: `src/sim/data/performance/b737PerformanceCards.ts:70-75`, `102-109`, `136-143`. | Core B737 flight/performance data is not source-lineaged enough for meaningful 737 simulation claims. | Build source-lineaged data tables for mass/CG/aero/engine/ground/performance. Add stall, climb, cruise trim, approach, engine-lapse, landing-distance, RTO/brake-energy fixtures. |
| RFS-MU2-003 | Critical | Open | Surface sampling is runway rectangles plus nearest-runway fallback: `src/sim/runwaySurface.ts:82-107`; surface kind is only `'runway' | 'offRunway'`: `4-21`; ground model snaps altitude to sampled ground: `src/sim/systems/ground.ts:568-586` per specialist read. | Ground/contact/terrain is not wheel-by-wheel runway/terrain physics. Landings, taxi, runway excursions, off-runway behavior, derotation, and tailstrike proof are not credible enough. | Implement wheel-by-wheel contact using gear station world positions, runway slope/width/thresholds, strut compression, and off-runway/unsupported classifications. Test main-gear touchdown, derotation, lateral runway excursion, rollout, taxi. |
| RFS-MU2-004 | Critical | Open/new dogfood | `START ROLL` resets scenario flaps/trim to zero: `src/store/simStore.ts:461-487`; scenarios are authored with flaps/trim already set and tutorial says set flaps/trim after START ROLL: `src/sim/scenarios.ts:56-63`, `90-98`; visible controls lack flaps/trim/throttle/gear strip: `src/App.tsx:295-347`; ControlsHelp only appears in debug overlay: `src/App.tsx:260-266`. | The default player loop is not discoverable: a new user is told to configure flaps/trim, but the controls are hidden/keyboard-only/debug-only. | Add visible takeoff setup controls or a “set takeoff config” action. Browser test fresh app → complete checklist using visible controls → start roll → rotate. Preserve scenario config or explicitly choose “manual setup” mode. |
| RFS-MU2-005 | Critical | Open/new dogfood | Dogfood samples: phase `rotation` at IAS ~89 kt, pitch ~6.7°, before scripted elevator rotation at VR 149. Guidance enters rotation when pitch >=5° regardless of VR: `src/sim/guidanceState.ts:61-84`; liftoff is hard normal-force/speed/pitch gates: `src/sim/physics/integrate.ts:52-58`; free angular dynamics occur before ground contact constraints: `88-96`. | Takeoff rotation/ground attitude model is not credible. The aircraft can pitch/enter rotation well below VR because trim/thrust/ground constraints are too loose. | Add main-gear pivot/nosewheel unloading/tailstrike model; assert no rotation guidance before VR unless user elevator input + proper pitch-rate envelope. Test RTO/V1, tailstrike margin, liftoff distance. |
| RFS-MU2-006 | Critical | Open | Landing phase collapses directly to `LANDED` when APPROACH/DESCENT touches gear: `src/sim/physics/integrate.ts:37-44`; guidance infers rollout/landed from speed while flight phase is LANDED: `src/sim/guidanceState.ts:64-66`; approach cards lack VREF/glidepath/flare/touchdown/stopping metrics: `src/sim/data/performance/b737PerformanceCards.ts:24-29`, `61-66`, `95-100`. | Landing is not yet a meaningful landing model: no explicit touchdown/derotation/rollout/taxi/stopped phase machine and no VREF/stabilized/touchdown-zone/stopping-distance acceptance. | Add phases `TOUCHDOWN`, `DEROTATION`, `ROLLOUT`, `TAXI`, `STOPPED`; add landing cards with VREF, glidepath, flare, touchdown zone, sink-rate, stop distance. |
| RFS-MU2-007 | Critical | Open | `computeVNAV()` returns `ALT_HOLD` at constraint capture: `src/sim/systems/vnav.ts:81-85`; AP target resolver treats `ALT_HOLD` as MCP selected altitude: `src/sim/systems/autopilot.ts:152-155`; VNAV target branch excludes `ALT_HOLD`: `173-189`. | VNAV can lose the managed constraint target at capture and revert to selected MCP altitude. | Regression: VNAV active near 10,000 ft constraint with MCP altitude 30,000 ft must not climb toward MCP altitude at capture. Carry managed capture target/source. |
| RFS-MU2-008 | Critical | Open | `deriveEffectiveAutoflightTruth()` computes thrust mode but returns all-off if AP CMD is not backed: `src/sim/systems/effectiveAutoflightTruth.ts:66-70`, `107-117`; MCP `SPEED`/`N1` unconditionally sets `CMD_A`: `src/instruments/RfsMCP.tsx:131-170`. | Autothrottle cannot be truthfully independent of autopilot. Manual flight with A/T SPEED/N1 is a core 737-like mode and is blocked/misrepresented. | Split AP and A/T ownership. Test AP OFF + A/T SPEED active: pilot owns elevator/aileron, A/T owns throttles, FMA thrust active without CMD A. |
| RFS-MU2-009 | Critical | Open/release | Local HEAD `d76567d` is one commit ahead; live reports `80c5c6f...`; branch protection API returns `protected=false`; deploy triggers on push to master: `.github/workflows/ci.yml:2-6`, `120-123`. | Public release posture is unsafe/ambiguous: current audited fixes are not live, and direct master pushes can auto-deploy without branch protection. | Push only when intended; wait for exact-SHA CI/CD success; verify live endpoint equals pushed SHA. Enable branch rules requiring secret-scan/test/publish/deploy and no force-push/delete. |

## P1 — high-value functional/realism/product gaps

| ID | Severity | Status | Evidence | Finding | Next test/task |
|---|---|---|---|---|---|
| RFS-MU2-010 | High | Open | Spoilers only add drag: `src/sim/physics/aero.ts:149-151`; lift remains independent: `156`; normal force subtracts lift: `src/sim/physics/integrate.ts:47-49`. | Spoilers/speedbrakes do not dump lift or increase wheel loading, so rollout/RTO braking is physically wrong. | Add spoiler lift-dump data. Test normal force and stopping distance with spoilers 0 vs 1 at landing speed. |
| RFS-MU2-011 | High | Open | Gear/flap actual state directly follows controls: `src/sim/physics/integrate.ts:61-65`; ground contact can force gear down: `src/sim/systems/ground.ts:578-579` per audit; `types.ts` has no commanded-vs-actual split. | Gear/flaps have no transit time, intermediate aero, hydraulic dependency, or abnormal state. | Split commanded/actual gear/flaps; add migration and transit-rate tests. |
| RFS-MU2-012 | High | Open | Engine thrust is N1²/density/Mach model: `src/sim/systems/engine.ts:17-25`; throttle maps to `20 + throttle*80`: `52-53`; fuel burn does not feed starvation back into engine operation per audit. | Engine/thrust/fuel model is unvalidated and not system-coupled enough for longer flight, idle descent, RTO, reverse, or engine-out. | Add engine tables and fuel availability coupling; test zero fuel spool-down, idle descent, takeoff/climb thrust by OAT/alt/Mach, engine-out yaw. |
| RFS-MU2-013 | High | Open | Synthetic navdata: `src/sim/flightPlanLoader.ts:4-8`, `31-58`; only KSEA has default route: `62-68`; package only consumes RFMS shared types: `package.json:20-22`. | FMS is a canned synthetic route loader, not an RFMS-backed FMS with edits/EXEC/discontinuities/direct-to. | Define RFMS active-route ownership and adapter. Add route edit/direct-to/discontinuity/EXEC tests. |
| RFS-MU2-014 | High | Open | VNAV only evaluates active waypoint: `src/sim/systems/vnav.ts:96-107`; VS computed from distance to active waypoint: `73-79`; speed constraints apply only when selected speed is undefined: `src/sim/systems/autopilot.ts:184-186`. | VNAV is a narrow active-waypoint constraint follower, not managed VNAV with lookahead/TOD/path/capture/managed speed. | VNAV lifecycle tests: future constraint armed, TOD, path capture, ALT*, managed ALT HOLD, managed-vs-selected speed, route complete. |
| RFS-MU2-015 | High | Open | Speed-only VNAV sets vertical mode `VNAV`: `src/sim/systems/vnav.ts:99-104`; AP/FD vertical commands only exist if altitude constraint exists per audit (`autopilot.ts:178-183`, `RfsPFD.tsx:234-244`). | FMA can imply vertical VNAV guidance when only speed management exists. | FMA/PFD test: speed-only VNAV must not show active pitch VNAV unless pitch guidance exists; introduce separate managed-speed display if needed. |
| RFS-MU2-016 | High | Open/local UX | Stopped MCP gate returns early: `src/instruments/RfsMCP.tsx:180-184`; buttons look enabled except LNAV route availability: `src/instruments/RfsMCP.tsx:287-340`; dogfood button metadata shows LNAV/SPD/VS/N1 enabled/no `aria-pressed`. | Truth bug fixed, but user feedback is still poor: parked mode buttons silently no-op. | Add disabled state/unavailable reason for all gated modes while stopped/WOW; browser assert titles/aria-disabled/status message. |
| RFS-MU2-017 | High | Open | Flight director bars use separate simplified PFD math per audit; AP commands derive from `autopilot.ts`; PFD path not one shared guidance object. | FD and AP can diverge because FD bars are not generated by the same target/law output as servo commands. | Expose shared guidance target object used by both AP command computation and PFD FD bars. |
| RFS-MU2-018 | High | Open | Crosswind test permits lateral displacement `<250 m` per audit; typical runway width is far lower. | Ground handling can pass while leaving the runway. | Replace tolerance with runway-edge bounds and explicit excursion/off-runway/abort state tests. |
| RFS-MU2-019 | High | Open | Weather fetch always KSEA: `src/App.tsx:150-158`; cloud placement hardcodes KSEA lat/lon and `Math.random()`: `src/viewport/CloudLayer.tsx:22-30`; aero uses ISA density: `src/sim/physics/aero.ts:133-135`. | Weather is scenario-mismatched and not tied to density altitude/visibility/cloud determinism. | Add scenario weather station metadata, deterministic cloud seeds, QNH/temp/density altitude effects, hot/high/cold tests. |
| RFS-MU2-020 | High | Open | Cockpit interactions label yoke/MCP as placeholders: `src/viewport/cockpitInteractions.ts:24-65`; yoke/MCP return null: `92-94`; throttle only increments: `82-85`. | Cockpit mode is not a flyable cockpit; it is a visual shell with partial/no-op controls. | Implement or hide/label placeholders. Add cockpit interaction tests for throttle ±/drag, yoke, gear/flap, MCP hit targets, keyboard equivalents. |
| RFS-MU2-021 | High | Open | Fixed panel positions: bottom bar `src/App.tsx:295-347`, RouteStatus fixed top/right `src/components/RouteStatus.tsx:4-18`, MCP fixed top/right `src/instruments/RfsMCP.tsx:231-242`; dogfood 1024 screenshot shows overlap. | Responsive layout is not product-ready at common laptop sizes, especially debug mode. | Layout manager/breakpoints; visual matrix 1024/1280/1366/1440/1920; non-overlap bounding-box assertions. |
| RFS-MU2-022 | High | Open | Accessibility dogfood counters: `h1=0`, `main=0`, `heading=0`; PFD/MCP/Route/Scenario are mostly generic divs; MCP mode buttons lack `aria-pressed`: `src/instruments/RfsMCP.tsx:287-340`. | Accessibility semantics are incomplete for a control-heavy simulator. | Add `<main>`, headings, named regions, `aria-live`, `aria-pressed`, meters/progress where useful; add Playwright role assertions/axe smoke. |
| RFS-MU2-023 | High | Open | Keyboard flaps use local 0/5/10/15… increments: `src/input/keyboardControls.ts:12-14`; B737 detents include 1 and 2: `src/input/flapDetents.ts:1-8`; cockpit uses shared detents: `src/viewport/cockpitInteractions.ts:86-87`. | Control methods disagree on flap detents. | Use shared `nextB737FlapDetent` for keyboard; test keyboard/cockpit sequences match. |
| RFS-MU2-024 | High | Open/perf | Dogfood console captured 4 WebGL `GPU stall due to ReadPixels` warnings; debug FPS in screenshots can be very low; multiple render/RAF loops exist. | Performance headroom is fragile; debug/product rendering can stutter as cockpit/scenery grows. | Profile readback source, remove/gate synchronous readbacks, add FPS/tick-time budget smoke. |
| RFS-MU2-025 | High | Open | PR test job runs npm/Vite checks; Docker build/push is master-only publish: `.github/workflows/ci.yml:50-61`, `63-112`. | PRs do not build/run/curl the actual nginx/Docker artifact that deploys. | Add PR-safe Docker build (`push:false`), run container, curl `/` and `/rfs-version.json`. |
| RFS-MU2-026 | High | Open | Rollback ignores failed previous-image start with `|| true`: `.github/workflows/ci.yml:148-156`; no post-rollback public version verification. | Failed promotion can leave production down or wrong without hard failure. | Make rollback start failure fatal; verify public `/` and `rfs-version.json` expected previous commit after rollback. |
| RFS-MU2-027 | High | Open | Docker final image has no `USER`: `Dockerfile:31-46`; deploy `docker run` lacks read-only, cap-drop, no-new-privileges, pids/user/tmpfs: `.github/workflows/ci.yml:190-194`. | Runtime container has avoidable root/cap/writeable FS attack surface. | Make nginx non-root/read-only compatible; add tmpfs/cap-drop/no-new-privileges/pids-limit/explicit user and canary proof. |
| RFS-MU2-028 | High | Open | `RFS_IMAGE_DIGEST` defaults unknown: `Dockerfile:5`, version writer defaults unknown per audit; CI build args omit digest: `.github/workflows/ci.yml:108-112`; live reports `imageDigest: unknown`. | Release provenance cannot map live runtime to immutable image digest/SBOM. | Generate post-build provenance keyed by `steps.build.outputs.digest` or inject digest after build. |

## P2 — architecture/maintainability/OSS gaps

| ID | Severity | Status | Evidence | Finding | Next test/task |
|---|---|---|---|---|---|
| RFS-MU2-029 | Medium-high | Open | Worker default-off flag: `src/config/workerPhysics.ts:1-31`; runtime is main-thread with synchronous worker-handler parity: `src/sim/simulationRuntime.ts:12-45`; docs say no active worker: `docs/architecture.md:188-194`. | Physics worker is scaffolding only; production remains main-thread. | Implement real browser Worker runtime with postMessage/backpressure/fallback; run worker-enabled Playwright smoke. |
| RFS-MU2-030 | Medium-high | Open | Sim loop RAF, input RAF, audio RAF, Cesium render loop, camera preRender, Three postRender, contrails RAF per specialist audit; App input RAF at `src/App.tsx:135-147`. | Multiple independent frame loops make ordering and one-frame input latency hard to reason about. | Central scheduler: input → fixed sim → camera/render/effects/audio; add RAF-order test. |
| RFS-MU2-031 | Medium-high | Open | AP controller PID state is module-level globals: `src/sim/systems/autopilot.ts:16-23`, reset manually. | Hidden module state blocks deterministic replay, multiple runtimes, worker migration, and save/resume purity. | Move AP controller state into runtime/store/worker codec; test two runtimes do not share integrator state. |
| RFS-MU2-032 | Medium | Open | `App.tsx` owns weather, input, audio, camera, viewport, overlays, route load, controls; visible in imports/effects and render `src/App.tsx:52-158`, `245-347`. | `App.tsx` remains a god-object. | Extract shell/control-bar/weather/input/scenery modules with focused tests. |
| RFS-MU2-033 | Medium | Open | `simStore.ts` owns aircraft, inputs, AP, route, wind, persistence, tick, UI messages across `src/store/simStore.ts:56-97`, `359-450`, `626-642`. | Store is a domain monolith and hot runtime choke point. | Split slices behind stable public API; add reset/load/start/tick compatibility tests. |
| RFS-MU2-034 | Medium | Open | PFD/MCP/Telemetry/EngineStrip subscribe to large/high-frequency objects per specialist audit; no shallow selector helper found. | React render churn can grow with sim complexity. | Add memoized view-model selectors; render-count/perf tests for 300 ticks. |
| RFS-MU2-035 | Medium | Open | Build chunk warning is warning-only: `vite.config.ts:21-30` per audit; manual chunk tests verify mapping only. | Bundle/chunk size can regress silently. | Add post-build raw/gzip budget script to `npm run check`. |
| RFS-MU2-036 | Medium | Open | `nginx.conf:1-14` lacks security headers; live header probe previously showed no HSTS/CSP/X-Content-Type-Options/Referrer-Policy/Permissions-Policy/X-Frame-Options. | Browser security baseline is under-specified. | Add compatible headers; evaluate Cesium-compatible CSP separately; do not add COOP/COEP unless needed. |
| RFS-MU2-037 | Medium | Open | `.dockerignore:1-5` only excludes `node_modules`, `dist`, `*.local`, `.env`, `.DS_Store`; Dockerfile `COPY . .`: `Dockerfile:23`. | Docker build context can include `.git`, docs/reports/test output, `.env.*` variants. | Harden `.dockerignore` with `.git`, `.github` if not needed, reports, coverage, test-results, `dogfood-output`, `.env*` allowlist. |
| RFS-MU2-038 | Medium | Open | Public package is `private`, no license/repository metadata: `package.json:1-5`; GitHub community profile health reported 14, only README present. | OSS governance is incomplete for a public simulator project. | Choose license; add `LICENSE`, `SECURITY.md`, `CONTRIBUTING.md`, `CODEOWNERS`, issue/PR templates, package metadata. |
| RFS-MU2-039 | Medium | Open | No Dependabot/Renovate/CodeQL workflow found; dependency ranges broad: `package.json:20-57`. | Dependency/update/security automation is absent. | Add Dependabot/Renovate for npm/actions/Docker; add CodeQL and container scan. |
| RFS-MU2-040 | Medium | Open | `@virtual-cdu/shared` is a local sibling file dependency: `package.json:20-22`; CI/Docker manually clone RFMC/RFMS: `.github/workflows/ci.yml:39-44`, `76-81`; `Dockerfile:9-15`. | Public repo is not self-contained for normal clone/build. | Publish/version shared package, submodule/subtree, or one-command bootstrap matching CI pinned checkout. |
| RFS-MU2-041 | Medium | Open | CI now runs visual tests, but package local `check` includes `check:deps` while CI test job omits it: `package.json:13-15`, `.github/workflows/ci.yml:50-61`. | Local/CI gate drift remains. | Either run exact `npm run check` in CI or add `check:deps` explicitly and document visual/Docker differences. |
| RFS-MU2-042 | Low-medium | Open | Save/load is one global slot per audit (`ScenarioPanel`/`scenarioPersistence`); dogfood save/load path exists but is opaque. | Training loops need named slots and summary metadata. | Add save slot metadata: scenario, route, phase, timestamp, paused/running policy, overwrite confirmation. |
| RFS-MU2-043 | Low-medium | Open | Gamepad mappings do not cover full loop per audit; camera/overlay/audio/start/pause/reset are not complete. | Gamepad cannot operate meaningful sim loop. | Add edge-trigger gamepad bindings and visible help/settings tests. |
| RFS-MU2-044 | Low-medium | Open | Audio has explicit ON/OFF but no volume persistence/captions/status nuance per audit. | Audio UX is functional but thin. | Add audio settings, mute/volume persistence, GPWS captions/log, blocked-audio help. |
| RFS-MU2-045 | Low-medium | Open | Cesium credits/watermark and degraded scenery banner overlap product UI in screenshots. | Legal/attribution/scenery posture needs deliberate product layout. | Decide entitlement/attribution strategy; assert non-overlap in visual tests. |
| RFS-MU2-046 | Medium-high | Open/new verification | First final `CI=1 npm run test:visual` run timed out 2/19 tests; both targeted reruns passed and full retry passed 19/19. Timeout contexts were `test-results/rfs-route-RFS-route-and-LN-9edb7-g-without-hidden-automation-chromium/error-context.md` and `test-results/rfs-truth-flow-RFS-truth-f-26851--gated-before-positive-rate-chromium/error-context.md`. | The visual/e2e suite still has flake/performance margin issues even when it can eventually pass. | Add per-test timing budgets, reduce long `page.evaluate` proof loops, split slow route proofs, and collect traces on first retry. |

## Recommended execution order

1. **Truth/release guardrails before more feature breadth**
   - Push/deploy only when intended; then verify exact SHA live.
   - Enable branch protection/rulesets.
   - Fix rollback verification, image digest provenance, container hardening, PR Docker smoke, and security headers.

2. **Build the first black-box meaningful-flight acceptance**
   - Use visible controls and keyboard/gamepad only.
   - Start with KSEA: route load → manual configured takeoff → clean climb → legal AP/A/T engagement → first leg sequence.
   - Then extend to descent/approach/landing/rollout/reset.
   - Keep seeded tests, but label them as scoped fixtures.

3. **Make the takeoff/player setup real**
   - Preserve scenario flaps/trim or add explicit visible setup controls.
   - Fix premature rotation below VR.
   - Add main-gear pivot/nosewheel unload/tailstrike/RTO tests.

4. **Autoflight/FMS/VNAV truth pass**
   - Split A/T from AP.
   - Carry VNAV managed capture targets through `ALT*`/`ALT_HOLD`.
   - Define selected vs managed speed.
   - Add FMA armed/capture/change lifecycle and shared AP/FD guidance output.

5. **Landing/ground realism pass**
   - Wheel-by-wheel contact and surface classification.
   - Spoiler lift dump, gear/flap transit, engine/reverse/autobrake/tire dynamics.
   - Explicit touchdown/derotation/rollout/taxi/stopped phases.
   - VREF/stabilized/glidepath/flare/touchdown-zone/stopping-distance cards.

6. **Product cockpit/UI pass**
   - Visible setup controls, responsive layout, accessibility semantics, non-overlap tests.
   - Either implement cockpit interactions or honestly hide/label placeholders.
   - Add route/FMS editing UI only once the truth model is ready.

7. **Runtime/performance architecture**
   - Central frame scheduler.
   - Move AP controller state into runtime state.
   - Real worker runtime with payload budget/parity tests.
   - Render-count and p95 tick-time budgets.

8. **OSS/public maturity**
   - License/security/contributing/CODEOWNERS/templates.
   - Dependabot/Renovate/CodeQL/container scanning.
   - Self-contained RFMS/shared dependency story.

## First concrete tests to write next

1. `e2e/rfs-blackbox-player-loop.spec.ts`
   - Forbid app-module imports and direct store mutation.
   - Select KSEA, load route, configure takeoff using visible controls/keyboard, start roll, do not rotate before VR, gear up only after positive rate, engage legal LNAV/A/T airborne, sequence one leg, assert no console errors and bounded IAS/pitch/VS.

2. `src/sim/physics/__tests__/takeoffRotationRealism.test.ts`
   - With KSEA flaps 5/trim 5/takeoff thrust and neutral elevator, assert pitch does not exceed rotation threshold before VR.
   - With elevator at/after VR, assert main-gear pivot/nosewheel unload, pitch-rate envelope, tailstrike margin, liftoff distance.

3. `src/sim/systems/__tests__/vnavManagedCapture.test.ts`
   - VNAV constraint at 10,000 ft, MCP altitude 30,000 ft, aircraft within capture window: assert target remains managed 10,000 and FMA/source is not ambiguous.

4. `src/sim/systems/__tests__/autothrottleOwnership.test.ts`
   - AP OFF + A/T SPEED active owns throttle only; pilot elevator/aileron remain effective; FMA thrust shows SPEED while AP remains OFF.

5. `e2e/rfs-responsive-accessibility.spec.ts`
   - Assert `<main>`, heading, named Scenario/Route/PFD/MCP regions, aria-pressed for modes, live coach/route status, and non-overlap at 1024/1280/1440/1920.

## Bottom line

The next milestone should not be “more features”; it should be a **truthful black-box player flight** plus the physics/autoflight/UI fixes that make that flight meaningful. RFS can already generate impressive local proofs, but the useful simulator threshold requires fewer direct seeds, stricter aircraft-data honesty, better player controls, and tighter release governance.
