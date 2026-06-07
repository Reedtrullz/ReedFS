# RFS Autonomous Deep Audit — 2026-06-07

Audit time: 07-06-2026 04:26 CEST  
Repo: `/Users/reidar/Projectos/RFS`  
Branch: `remediation/2026-06-portfolio-gaps`  
HEAD: `15081fe2c37c891d03dbd5372920b7407c69679f` (`docs: plan data-backed aircraft-agnostic fdm`)  
Base observed: `origin/master` = `7a336ea5cb1636ce0ac326385023a8c68a1999eb`; current branch is 10 commits ahead of `origin/master`.

## Non-claims

- This is a local/read-only audit plus one report artifact write. No source code was changed.
- I did **not** push anything.
- I did **not** verify a GitHub Actions run; `gh` was not installed in the local environment.
- I did **not** verify that this branch/HEAD is deployed.
- I did not claim deployment success. A live `curl -I https://fly.reidar.tech/` returned HTTP 200 at audit time, but response headers still included `Cross-Origin-Embedder-Policy: require-corp` and `Cross-Origin-Opener-Policy: same-origin`, so live/prod is not aligned with local Vite Cesium guidance.

## Evidence ledger

### Baseline and size

- `git status --short --branch`: clean before this report was written, on `remediation/2026-06-portfolio-gaps`.
- `git rev-list --count origin/master..HEAD`: `10`.
- Tracked files: `228`.
- Pygount excluding `.git,node_modules,dist,build,.cache,coverage`:
  - TypeScript: 134 files / 10,931 code lines.
  - TSX: 35 files / 3,197 code lines.
  - Markdown docs: 36 files / 10,311 comment lines.
  - Total code: 14,575 lines.
- Local repo shape: 164 source files, 74 test files, 36 docs files.

### Local gates

Initial `npm run check` failed because dependencies were not installed:

```text
expected exactly one installed three version, found 0: (none)
```

After `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm install --legacy-peer-deps`, the full local gate passed:

```text
npm run check
  check:deps: single three version: 0.184.0
  lint:ci: pass, with existing React-version settings warning
  typecheck: pass
  vitest: 72 files passed, 517 tests passed
  build: pass, Vite warning: one chunk > 500 kB; built app JS 829.53 kB / gzip 228.73 kB
```

`npm run test:visual` failed 3/4:

- `initial runway/chase overlay is stable`: pass.
- `cockpit mode keeps outside reference and instruments visible`: fail, unstable/different screenshots.
- `route overlay and safe AP modes are visible after LOAD PLAN`: fail, unstable/different screenshots.
- `start roll state is visually stable`: fail, screenshot diff.

Important visual observations from actual artifacts:

- Cockpit-mode actual still shows an external Cesium terrain view; stopped cockpit camera does not snap to cockpit eye.
- Route-loaded actual has selected scenario **ENVA Tutorial Takeoff** but route **KSEA→KPDX**, active leg **KSEA→OLM**, DTG **4688.4 NM**, and FMA **SPEED/LNAV/ALT_HOLD/CMD_A**.
- Start-roll actual shows flaps/trim reset to 0 and coach asks for flaps 5, which conflicts with the scenario text/checklist but matches the known user-preferred `START ROLL` behavior that zeros throttle/flaps/trim for manual setup.

## Executive analysis

RFS has a strong tested foundation: quaternion/NED/body-frame physics, ground contact, route/AP command composition, scenario/guidance UI, cockpit/aircraft rendering, and CI-quality local gates are materially better than the early playable baseline. The strongest current risk is no longer unit-test stability; it is **product and release honesty at boundaries**:

1. Visual/release gates are red and structurally nondeterministic.
2. Default ENVA gameplay state and hardcoded KSEA route loading contradict each other.
3. AP/FMA can advertise active route modes without enough availability/safety validation.
4. Production nginx headers contradict the local Cesium no-COOP/COEP policy and the live endpoint currently exposes those headers.
5. The data-backed aircraft-agnostic FDM plan is still mostly a plan: B737-ish constants remain in generic runtime files.
6. Deployment uses mutable `latest`, unpinned RFMS clone/install paths, and no public post-promotion verification in workflow code.

The work below is classified for autonomous agents. “Autonomous” here means: locally implementable and verifiable with tests/build/browser automation, no secrets, no external infra changes, no production deploy, no source-owner decision.

---

# Autonomous work backlog

## P0 — Gate and product-truth blockers

| ID | Task | Why / evidence | Primary files | Verification |
|---|---|---|---|---|
| RFS-AUTO-001 | Stabilize visual tests and make visual mode deterministic. Add explicit app/render readiness; remove arbitrary sleeps; freeze/step sim time for screenshots; disable/seed nondeterministic scene effects; force deterministic/degraded scenery under `VITE_RFS_VISUAL_TEST=1` unless a token-backed mode is deliberately selected. | `npm run test:visual` failed 3/4. E2E fixed sleeps at `e2e/helpers/rfsPage.ts:3-11`; start-roll real-time wait at `e2e/rfs-visual.spec.ts:22-26`; continuous RAF in `src/hooks/useSimLoop.ts:7-12`; Cesium default render loop in `src/viewport/CesiumViewport.tsx:29-44`; visual mode only disables lighting/water/sky at `src/viewport/CesiumViewport.tsx:57-69`. | `e2e/helpers/rfsPage.ts`, `e2e/rfs-visual.spec.ts`, `src/config/visualTest.ts`, `src/viewport/CesiumViewport.tsx`, `src/hooks/useSimLoop.ts`, `src/viewport/CloudLayer.tsx` | `npm run test:visual` passes 4/4 locally; run it twice without snapshot churn. |
| RFS-AUTO-002 | Fix scenario-aware route loading. `LOAD PLAN` should not hardcode KSEA→KPDX while default scenario is ENVA. Provide scenario-route mapping, scenario switch, or visible “no route for this scenario” handling. | Default ENVA scenario: `src/sim/scenarios.ts:45-57`; `LOAD PLAN` hardcodes `createKseaKpdxFlight()` at `src/App.tsx:302-309`; KSEA plan at `src/sim/flightPlanLoader.ts:30-41`; screenshot confirms ENVA + KSEA route + 4688 NM DTG. | `src/App.tsx`, `src/sim/flightPlanLoader.ts`, `src/sim/scenarios.ts`, `src/store/simStore.ts`, `src/components/RouteStatus.tsx`, tests | `npm run test -- src/__tests__/App.test.tsx src/store/__tests__/simStore.test.ts src/components/__tests__/RouteStatus.test.tsx`; `npm run test:visual -- --grep "route overlay"`. |
| RFS-AUTO-003 | Add route/scenario/origin compatibility before LNAV availability and AP defaults. A valid route geometry is not enough if the aircraft is thousands of NM from origin. | `computeRouteStatus()` validates waypoint geometry but not scenario/aircraft proximity at `src/sim/systems/navigation.ts:112-163` and returns available for valid geometry at `src/sim/systems/navigation.ts:299-306`; `setFlightPlan` computes route status around current aircraft at `src/store/simStore.ts:708-714`. | `src/sim/systems/navigation.ts`, `src/store/simStore.ts`, `src/sim/flightPlanLoader.ts`, tests | Add ENVA + KSEA mismatch regression. Run `npm run test -- src/sim/systems/__tests__/navigation.test.ts src/store/__tests__/simStore.test.ts`. |
| RFS-AUTO-004 | Stop auto-engaging active CMD/LNAV/SPEED/ALT_HOLD on `LOAD PLAN` unless compatibility and safe engagement criteria pass. | `applyLoadedRouteAutopilotDefaults()` forces `LNAV`, `ALT_HOLD`, `SPEED`, `CMD_A`; invoked at `src/App.tsx:303-309`. This made screenshot FMA active while route was irrelevant to ENVA. | `src/App.tsx`, `src/instruments/RfsMCP.tsx`, `src/instruments/RfsPFD.tsx`, `src/store/simStore.ts`, tests | `npm run test -- src/__tests__/App.test.tsx src/instruments/__tests__/RfsPFD.test.tsx src/instruments/__tests__/RfsMCP.test.tsx`. |
| RFS-AUTO-005 | Resolve START ROLL/tutorial/checklist contradiction without violating the known user preference that START ROLL zeros throttle/flaps/trim. Recommended autonomous path: keep zeroing behavior, but update ENVA scenario initial config/tutorial/checklist/visual expectations so the player is told to set flaps 5 and trim after START ROLL or before a separate “ready” gate. | User-preferred behavior is encoded at `src/store/simStore.ts:545-571`: “pilot sets their own throttle, flaps, and trim.” ENVA scenario currently says flaps 5/trim set at `src/sim/scenarios.ts:56-63`, so start-roll screenshot shows coach warning. | `src/sim/scenarios.ts`, `src/store/simStore.ts`, `src/sim/guidanceState.ts`, `src/sim/checklistCoach.ts`, `e2e/rfs-visual.spec.ts`, tests | `npm run test -- src/store/__tests__/simStore.test.ts src/sim/__tests__/guidanceState.test.ts src/sim/__tests__/checklistCoach.test.ts src/__tests__/App.test.tsx`; start-roll visual test passes under intended semantics. |
| RFS-AUTO-006 | Make cockpit camera behavior deterministic when stopped/paused. Either camera modes should snap to selected view even when stopped, or visual test should start/resume before cockpit screenshot. | Auto-follow returns true only when `status === 'running'` at `src/viewport/cameraMode.ts:5-10`; cockpit visual test toggles cockpit while stopped at `e2e/rfs-visual.spec.ts:10-13`; camera update lives at `src/App.tsx` via `CameraManager`. | `src/viewport/cameraMode.ts`, `src/viewport/CameraManager.ts`, `src/App.tsx`, `e2e/rfs-visual.spec.ts`, tests | `npm run test -- src/viewport/__tests__/cameraMode.test.ts src/viewport/__tests__/CameraManager.test.ts src/__tests__/App.test.tsx`; targeted visual cockpit test. |
| RFS-AUTO-007 | Fix production COOP/COEP mismatch. Remove or conditionally disable nginx COOP/COEP headers unless Cesium Ion compatibility is proven. | `nginx.conf:6-7` sets COOP/COEP require-corp; `vite.config.ts:14-19` explicitly says not to add these headers because they block Cesium Ion tiles; live `curl -I https://fly.reidar.tech/` currently returns these headers. | `nginx.conf`, `Dockerfile`, `README.md`, deployment docs/tests | Build/serve Docker locally and `curl -I` headers; browser smoke with token/degraded mode if available. |

## P1 — CI, deploy, and release governance

| ID | Task | Why / evidence | Primary files | Verification |
|---|---|---|---|---|
| RFS-AUTO-008 | Publish and deploy immutable image tags/digests, not only `latest`; keep rollback candidate until post-promotion checks pass. | Workflow pushes only `ghcr.io/reedtrullz/rfs:latest` at `.github/workflows/ci.yml:48-53`; deploy pulls/runs `latest` at `.github/workflows/ci.yml:67-85`; Ansible stops prod before start at `ansible-playbook.yml:82-103`. | `.github/workflows/ci.yml`, `ansible-playbook.yml`, `Dockerfile`, release docs | CI publishes `sha-<commit>` tag and logs digest; failed canary leaves previous prod running in a dry-run/tested script. |
| RFS-AUTO-009 | Add public post-promotion verification before workflow prints deploy success. | Workflow canary checks only `http://localhost:3004/` at `.github/workflows/ci.yml:77-78` and echoes success at `.github/workflows/ci.yml:87`; README requires public curl verification. | `.github/workflows/ci.yml`, `ansible-playbook.yml`, README/deploy docs | Completed deploy job includes `curl -fsS https://fly.reidar.tech/` after promotion and verifies expected app content/version. |
| RFS-AUTO-010 | Make CI/Docker installs reproducible: pin RFMS/RFMC commit or submodule strategy, use `npm ci --legacy-peer-deps` if lockfile supports it. | CI clones `RFMC.git` unpinned at `.github/workflows/ci.yml:13-18` and `:35-41`; Docker clones unpinned and uses `npm install` at `Dockerfile:3-12`; `package-lock.json` encodes local `file:../RFMS/shared`. | `.github/workflows/ci.yml`, `Dockerfile`, `package-lock.json`, docs | Clean clone build with pinned RFMS and `npm ci --legacy-peer-deps`; Docker build succeeds. |
| RFS-AUTO-011 | Harden workflow permissions and supply chain. Add top-level least-privilege permissions; pin third-party actions and Docker base images to digests; consider SBOM/attestation. | Actions referenced by mutable tags in `.github/workflows/ci.yml:12,15,43,49,61`; base images `node:22-alpine`, `nginx:alpine` at `Dockerfile:1,17`; no top-level permissions for all jobs. | `.github/workflows/ci.yml`, `Dockerfile` | Workflow still passes; action refs are SHAs; base images use digest refs. |
| RFS-AUTO-012 | Remove `--pass-with-no-tests` from visual scripts or restrict it to explicit local-only use. | `package.json:16-17` uses `playwright test --pass-with-no-tests`; CI relies on visual tests at `.github/workflows/ci.yml:23-25`. | `package.json`, CI docs | Intentionally misconfigured test discovery fails instead of passing with 0 tests. |
| RFS-AUTO-013 | Add secret scanning. | `.env` is ignored and excluded from Docker context, but local audit found a non-empty ignored `.env` token; no scanner is present. | `.github/workflows/ci.yml`, `.gitleaks.toml` or equivalent, docs | Scanner passes repo; seeded fake token in test branch fails scanner. |
| RFS-AUTO-014 | Re-enable Ansible host key checking and manage known hosts. | `ansible.cfg:2` has `host_key_checking = false`; inventory contains VPS IP/user/key. | `ansible.cfg`, `inventory/hosts.yml`, deploy docs | Ansible check/dry-run fails on unknown host key and passes with expected known host. |
| RFS-AUTO-015 | Add release/version metadata and deploy manifest. | `package.json:4` remains `0.0.0`; workflow/image does not expose commit/version in deployed app. | `package.json`, app config, Docker labels, CI summary | App/image exposes commit SHA/version; deploy summary records exact SHA and digest. |

## P1/P2 — AP, FMA, route, and mode honesty

| ID | Task | Why / evidence | Primary files | Verification |
|---|---|---|---|---|
| RFS-AUTO-016 | Gate MCP LNAV activation on route availability. If no compatible route is available, do not show active LNAV; leave OFF/HDG_SEL or visible unavailable/armed state. | MCP currently forces CMD_A and LNAV without checking route status in `src/instruments/RfsMCP.tsx`; AP resolver can preserve heading when no nav target, but truth may still display LNAV. | `src/instruments/RfsMCP.tsx`, `src/store/simStore.ts`, `src/sim/systems/autopilot.ts`, tests | `npm run test -- src/instruments/__tests__/RfsMCP.test.tsx src/sim/systems/__tests__/autopilot.test.ts src/store/__tests__/simStore.test.ts`. |
| RFS-AUTO-017 | Centralize FMA truth derivation so PFD displays command-valid modes only. Include route availability, VNAV availability, N1/SPD ownership, and AP disconnect cleanup. | PFD renders raw `apState.truth` at `src/instruments/RfsPFD.tsx`; route and AP command validity are currently distributed. | new helper/module, `src/instruments/RfsPFD.tsx`, `src/instruments/RfsMCP.tsx`, `src/store/simStore.ts`, AP tests | RfsPFD/RfsMCP/AP/store tests; new invalid-route FMA tests. |
| RFS-AUTO-018 | Feed `computeVNAV().verticalMode` into truth/FMA when VNAV is active and available; downgrade/flag when unavailable. | `src/sim/systems/vnav.ts` returns `verticalMode`, but AP/PFD display remains raw `apState.truth.verticalActive`. | `src/sim/systems/vnav.ts`, `src/sim/systems/autopilot.ts`, `src/sim/simulationStep.ts`, `src/store/simStore.ts`, tests | `npm run test -- src/sim/systems/__tests__/vnav.test.ts src/sim/systems/__tests__/autopilot.test.ts src/sim/__tests__/simulationStep.test.ts`. |
| RFS-AUTO-019 | Change route leg display from zero-based `LEG 0` to pilot-facing `LEG 1/N` while preserving internal zero-based indices. | Screenshot and tests show `LEG 0`; `RouteStatus` renders raw index. | `src/components/RouteStatus.tsx`, route tests | `npm run test -- src/components/__tests__/RouteStatus.test.tsx`. |

## P2 — Physics, FDM, and realism scaffolding

| ID | Task | Why / evidence | Primary files | Verification |
|---|---|---|---|---|
| RFS-AUTO-020 | Implement FDM source metadata types and B737 FDM shell that mirrors current runtime data with no behavior change. | Plan exists at `docs/plans/2026-06-02-data-backed-fdm.md`; no `src/sim/data/fdm` implementation found. Current aircraft data says gameplay-tuned pending audited tables. | `src/sim/data/fdm/types.ts`, `src/sim/data/aircraft/b737-800.fdm.v1.ts`, tests | Plan-targeted Vitest for data/FDM modules; `npm run check`. |
| RFS-AUTO-021 | Move `B737_AERO` data behind FDM/source-cited data while preserving compatibility exports and parity. | `B737_AERO` currently in `src/sim/systems/AeroModel.ts`; roadmap calls for moving hardcoded coefficients into versioned data. | `src/sim/systems/AeroModel.ts`, FDM module, aero/model tests | `npm run test -- src/sim/systems/__tests__/AeroModel.test.ts src/sim/physics/__tests__/aero.test.ts src/sim/physics/__tests__/performanceEnvelope.test.ts`. |
| RFS-AUTO-022 | Parameterize generic aero constants through the AeroModel/FDM: elevator deflection, trim range/effect, nose-up fade, side-force coefficients, ground effect. | Generic constants in `src/sim/physics/aero.ts:8-21` and side-force constants later in file. | `src/sim/physics/aero.ts`, `src/sim/systems/AeroModel.ts`, FDM module, tests | Aero, trim, performance envelope tests. |
| RFS-AUTO-023 | Move B737 gear-station data out of generic `types.ts` into aircraft/FDM data, keep compatibility helper. | B737 gear constants in `src/sim/types.ts:199-254`. | `src/sim/types.ts`, FDM module, ground/types tests | `npm run test -- src/sim/__tests__/types.test.ts src/sim/systems/__tests__/ground.test.ts`. |
| RFS-AUTO-024 | Parameterize ground model B737-ish constants (yaw inertia, steering/tire/brake tuning) through aircraft/ground model data. | Ground hardcoded constants at `src/sim/systems/ground.ts:14-36`, including `APPROX_B737_YAW_INERTIA_KGM2`. | `src/sim/systems/ground.ts`, `src/sim/physics/integrate.ts`, FDM/ground data, tests | Ground/integrate tests and fixed-step scenario tests. |
| RFS-AUTO-025 | Fix IAS/TAS confusion in trim/performance tests. Add fixture helpers that convert IAS to TAS at altitude and keep config/control aligned. | Subagent quantified 220 KIAS at 10,000 ft ≈ 256 KTAS; current tests set body velocity directly from IAS. FDM plan warns about this. | `src/sim/physics/__tests__/fdmFixtureHelpers.ts`, `trimSolver.test.ts`, `performanceCards.test.ts`, fixtures | Targeted trim/performance-card tests; `npm run check`. |
| RFS-AUTO-026 | Add stall-envelope tests for clean and landing configurations with broad, source-labeled bounds. | Roadmap P5 calls for stall/performance cards and data quality. | new `stallEnvelope.test.ts`, performance fixtures/data | `npx vitest run src/sim/physics/__tests__/stallEnvelope.test.ts`. |
| RFS-AUTO-027 | Add phugoid, short-period, and dutch-roll smoke tests before coefficient tuning. | Roadmap P5 calls for dynamic-mode tests; current baseline lacks them. | new `dynamicModes.test.ts`, fixture helpers | `npx vitest run src/sim/physics/__tests__/dynamicModes.test.ts`. |
| RFS-AUTO-028 | Make engine Mach/lapse air-relative by threading wind or computing air-relative speed for engine lapse. | Engine `machFromState()` uses ground-relative state velocity at `src/sim/systems/engine.ts:9-11`; `updateEngines()` has no wind input at `src/sim/systems/engine.ts:32-37`. | `src/sim/systems/engine.ts`, `src/sim/physics/integrate.ts`, environment/engine tests | `npm run test -- src/sim/systems/__tests__/engine.test.ts src/sim/physics/__tests__/integrate.test.ts src/sim/systems/__tests__/environment.test.ts`. |
| RFS-AUTO-029 | Use scenario performance-card VR for takeoff cues with fallback for scenarios without cards. | `takeoffCue.ts` uses hardcoded VR; performance cards contain scenario VRs. | `src/sim/takeoffCue.ts`, `src/components/Telemetry.tsx`, performance card data/tests | `npm run test -- src/sim/__tests__/takeoffCue.test.ts src/components/__tests__/Telemetry.test.tsx src/sim/data/__tests__/performanceCards.test.ts`. |
| RFS-AUTO-030 | Document or fix one-tick control/config lag before aero. Add regression first, then decide if config update should happen before `computeAero()`. | `computeAero()` runs before config copied from controls in `integrate.ts`; can delay flap/speedbrake/gear aero by one tick. | `src/sim/physics/integrate.ts`, integrate/aero tests | `npm run test -- src/sim/physics/__tests__/integrate.test.ts src/sim/physics/__tests__/aero.test.ts`. |

## P2 — UX, cockpit, input, audio

| ID | Task | Why / evidence | Primary files | Verification |
|---|---|---|---|---|
| RFS-AUTO-031 | Wire cockpit raycast/pointer interaction using existing metadata/hook, or mark/remove placeholders honestly. | Metadata exists in `src/viewport/cockpitInteractions.ts`; `useCockpitInteractions.ts` exists; `CockpitLayer.tsx` renders/syncs but no pointer/raycast wiring. | `src/viewport/CockpitLayer.tsx`, `src/viewport/useCockpitInteractions.ts`, `src/viewport/cockpitInteractions.ts`, tests/e2e | Cockpit interaction unit tests plus browser smoke for clickable gear/flap/throttle/MCP if implemented. |
| RFS-AUTO-032 | Rework GPWS to use AGL/ground state and vertical trend, not raw MSL altitude; gate takeoff callouts after liftoff. | ENVA elevation is 56 ft; GPWS Mode 3 uses `position.alt < 100` during TAKEOFF, likely causing false warnings. | `src/audio/GPWS.ts`, audio tests, maybe ground/derived helpers | Add GPWS unit tests; audio mapping/engine tests pass. |
| RFS-AUTO-033 | Add keyboard shortcuts for camera/overlay or update binding docs to be honest. | Binding labels mention CAM/OVL buttons; keyboard controls implement flight axes/brakes/throttle/trim/flaps/gear only. | `src/input/keyboardControls.ts`, `src/input/controlBindings.ts`, `src/App.tsx`, tests | Keyboard controls and App tests. |
| RFS-AUTO-034 | Add gamepad mappings for brake/flaps/gear or expose explicit remapping/settings. | Gamepad currently axes/throttle/trim; bindings leave brake/gear/flaps without gamepad controls. | `src/input/GamepadManager.ts`, `src/input/controlBindings.ts`, settings UI/tests | Gamepad/input binding tests. |
| RFS-AUTO-035 | Clarify EngineStrip actual-vs-commanded state; optionally show both lever command and actual config for flaps/gear. | EngineStrip reads aircraft config, while stopped/pre-tick pilot input changes can lag. | `src/components/EngineStrip.tsx`, store/input tests | Component/App tests. |

## P2 — Architecture, performance, maintainability

| ID | Task | Why / evidence | Primary files | Verification |
|---|---|---|---|---|
| RFS-AUTO-036 | Split/lazy-load heavy app surfaces and add manual chunks for Cesium/Three/vendor. | Build warns single app JS chunk 829.53 kB; Vite config only `target: esnext`; `App.tsx` eagerly imports many heavy surfaces. | `vite.config.ts`, `src/App.tsx`, viewport/instrument/debug imports | `npm run build`; no app JS chunk >500 kB or an explicitly accepted chunk policy; visual smoke. |
| RFS-AUTO-037 | Add a worker bridge design slice without default-on migration: define `SimulationRuntime` adapter and parity tests for main-thread vs worker handler. | Worker codec/handler exists, but docs and runtime say main-thread sim only. | `src/sim/simulationWorker.ts`, `src/sim/workerCodec.ts`, new bridge/adapter, `src/store/simStore.ts`, tests | Targeted worker parity tests; `npm run check`. |
| RFS-AUTO-038 | Split `simStore.ts` into pure reducer/action modules while keeping public store API stable. | `simStore.ts` is 751 lines and owns state shape, tick loop, input reducers, AP cleanup, route, scenario persistence, lifecycle. | `src/store/simStore.ts`, new store modules, store tests | Existing store tests pass; no public selectors/actions broken. |
| RFS-AUTO-039 | Benchmark and reduce clone cost in simulation step. | `simulationStep.ts` clones aircraft every step; store can run up to 16 fixed steps in one frame; worker codec also clones payloads. | `src/sim/simulationStep.ts`, `src/store/simStore.ts`, `src/sim/workerCodec.ts`, benchmarks/tests | Add microbenchmark/perf test; fixed-step tests pass; clone count/cost reduced. |
| RFS-AUTO-040 | Decouple instrument/debug renders from full aircraft snapshots. Use selector/view-model helpers and throttle low-priority debug UI. | `RfsPFD`/`Telemetry` subscribe to full aircraft and derive values on every store update. | `src/instruments/RfsPFD.tsx`, `src/components/Telemetry.tsx`, store selectors/view models | Render-count/profiler test or unit tests; PFD/Telemetry tests pass. |
| RFS-AUTO-041 | Narrow `integrate()` signature by removing ignored AP/flightPlan params after updating callers/tests. | `integrate()` accepts legacy `apState`/`flightPlan` and discards them. | `src/sim/physics/integrate.ts`, callers/tests | `npm run typecheck`; integrate tests. |
| RFS-AUTO-042 | Resolve stale/unused `LoadingScreen`: wire it to app/Cesium readiness or delete it. | No inbound runtime imports found for `src/components/LoadingScreen.tsx`. | `src/components/LoadingScreen.tsx`, `src/App.tsx`, tests | Import graph clean; App tests pass. |
| RFS-AUTO-043 | Audit orphan/test-only performance data modules and label ownership explicitly. | Some performance cards/fixtures are test-only or not runtime-owned; FDM plan needs clear source/data ownership. | `src/sim/data/performance/*`, docs/tests | Data ownership docs/tests; no stale misleading runtime claims. |
| RFS-AUTO-044 | Fix docs drift around COOP/COEP and worker/SAB posture. README says Vite sets COOP/COEP; `vite.config.ts` says explicitly not to. | README line around local development contradicts `vite.config.ts:14-19`. | `README.md`, `docs/architecture.md`, `docs/physics-invariants.md`, `vite.config.ts` comments | Grep for contradictory COOP/COEP claims outside historical docs. |

---

# Blocked / parent-direct work

These are real work items but not safe unattended without a user/product/infrastructure/source decision.

| Item | Blocker |
|---|---|
| Exact B737 certification-level aerodynamic coefficient tuning | Current data is gameplay-tuned. Needs accepted official/research data source policy and likely domain review. |
| Exact V-speeds/takeoff distance/climb/cruise/landing performance tables | Needs accepted QRH/FPPM/AFM/public-derived source and source-citation policy. |
| Broader terrain mesh collision | Requires terrain API/source/performance design, possibly Cesium depth/terrain constraints. |
| Full airport/taxiway/apron surface modeling outside supported runway rectangles | Needs airport geometry data and classification policy. |
| Adding a second aircraft type | Needs product/data selection after FDM boundary/parity tests. |
| Full worker physics runtime default-on migration | The FDM plan says do not move physics to worker until data-backed baseline/dynamic-mode tests are green. |
| SharedArrayBuffer worker design | Would require COOP/COEP, which currently conflicts with Cesium Ion tile policy. Use plain Worker first. |
| GitHub branch protection / required checks / secrets / environment approvals | Requires GitHub admin access. |
| VPS/Caddy/GHCR settings, deploy key validity, rollback drill | Requires live infrastructure/secrets and explicit deploy authorization. |
| Production Cesium Ion token validity and real token asset access | Requires secret/token and external Cesium account state. |
| Physical gamepad/audio/device validation | Needs target hardware and user/device testing. |
| Changing the core START ROLL zeroing semantics | Known user preference says START ROLL zeros throttle/flaps/trim so the pilot sets levels. Fix the tutorial/checklist conflict first unless user explicitly changes preference. |

---

# Recommended autonomous execution batches

## Batch 1 — Restore release confidence

1. RFS-AUTO-001 visual determinism.
2. RFS-AUTO-006 cockpit stopped/paused camera determinism.
3. RFS-AUTO-002/RFS-AUTO-003 scenario-aware route loading and compatibility.
4. RFS-AUTO-004 mode default honesty on LOAD PLAN.
5. RFS-AUTO-005 START ROLL/tutorial/checklist alignment.

Why first: these are visible, current, and directly explain the red visual gate.

## Batch 2 — Production/deploy safety without deploying

1. RFS-AUTO-007 nginx COOP/COEP mismatch.
2. RFS-AUTO-008 immutable image tags and rollback path.
3. RFS-AUTO-009 public post-promotion verification.
4. RFS-AUTO-010 reproducible RFMS/npm install path.
5. RFS-AUTO-012 no zero-test visual pass.

Why second: these reduce “false success” risk before any push/deploy.

## Batch 3 — AP/FMA honesty

1. RFS-AUTO-016 gate MCP LNAV.
2. RFS-AUTO-017 centralized command-valid FMA truth.
3. RFS-AUTO-018 VNAV lifecycle truth.
4. RFS-AUTO-019 pilot-facing route leg display.

Why third: route fixes and FMA truth should be consistent before deeper RFMS integration.

## Batch 4 — FDM boundary and realism tests

1. RFS-AUTO-020 FDM metadata/shell.
2. RFS-AUTO-025 IAS/TAS fixture helper.
3. RFS-AUTO-026 stall envelope tests.
4. RFS-AUTO-027 dynamic mode smoke tests.
5. RFS-AUTO-021 through RFS-AUTO-024 parity migrations of aero/gear/ground constants.
6. RFS-AUTO-028/RFS-AUTO-029/RFS-AUTO-030 physics correctness follow-ups.

Why fourth: build data boundaries and regression harnesses before tuning.

## Batch 5 — UX/cockpit/input/audio polish

1. RFS-AUTO-031 cockpit interaction wiring/removal.
2. RFS-AUTO-032 GPWS AGL gating.
3. RFS-AUTO-033/RFS-AUTO-034 input coverage.
4. RFS-AUTO-035 actual-vs-commanded strip clarity.

Why fifth: product polish with local tests and browser smoke; some user preference/device decisions may emerge.

## Batch 6 — Architecture/performance

1. RFS-AUTO-044 docs drift cleanup.
2. RFS-AUTO-041 integrator signature cleanup.
3. RFS-AUTO-042 stale LoadingScreen.
4. RFS-AUTO-036 bundle splitting.
5. RFS-AUTO-038 store split.
6. RFS-AUTO-040 instrument selector/view-model decoupling.
7. RFS-AUTO-039 clone-cost benchmarking/reduction.
8. RFS-AUTO-037 worker bridge parity after the FDM baseline is in place.

Why last: these touch broad surfaces; sequence them after gate/product truth is repaired.

---

# Current strengths worth preserving

- Full local `npm run check` is green after installing dependencies.
- Physics invariants are well documented and tested: body/NED transforms, quaternion, wind, signed drag, ground contact, and AP/effective controls.
- Ground model has many advanced features already implemented: prepared/off-runway contact, normal force, oleo loads, anti-skid, differential braking, side friction, belly/crash slide, low-speed steering, crosswind regressions.
- AP has much better command composition than early versions: SPEED/N1 are upstream AP-owned controls, not hidden engine magic.
- The repo already has strong docs/plans; the remaining risk is drift between docs, live deploy, visual tests, and default product flow.

# Files produced by this audit

- `docs/reviews/2026-06-07-rfs-autonomous-deep-audit.md` (this report)
