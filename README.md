# RFS — Reed Flight Simulator

[![CI/CD](https://github.com/Reedtrullz/ReedFS/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/Reedtrullz/ReedFS/actions/workflows/ci.yml?query=branch%3Amaster)
[![CodeQL](https://github.com/Reedtrullz/ReedFS/actions/workflows/codeql.yml/badge.svg?branch=master)](https://github.com/Reedtrullz/ReedFS/actions/workflows/codeql.yml?query=branch%3Amaster)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

RFS is a standalone web-based Boeing 737-800 flight simulator. It combines a TypeScript 6-DOF flight model, CesiumJS globe rendering, a Three.js aircraft layer, RFMS shared avionics/autopilot types, METAR-driven weather, cockpit instruments, audio cues, and a Docker/GHCR deployment pipeline.

Live deployment: https://fly.reidar.tech
Repository: https://github.com/Reedtrullz/ReedFS
License: MIT — see [`LICENSE`](LICENSE)

## Current status

The simulator now has a stabilized flight-model foundation plus the first gameplay/usability productization pass:

- Quaternion attitude is authoritative; Euler attitude is mirrored only for compatibility and display boundaries.
- Body/NED frame transforms, gravity signs, air-relative wind, signed drag, and physics regressions are covered by tests.
- Ground contact now has explicit ground state, per-gear station loads, dynamic oleo spring/damper compression, runway-normal constraints, tire braking/rolling friction, anti-skid brake limiting, symmetric and side-specific brake commands for player differential braking, asymmetric brake-force helpers, normal-force-scaled tire side-loads, rudder-pedal-limited nosewheel steering, low-speed taxi, rollout braking, crosswind/weathercocking, and crosswind approach/touchdown/rollout scenario regressions, gear-up runway-tangent belly/crash slide damping, touchdown damping, ground effect, normal-force liftoff gating, and phase handling. It samples supported-airport prepared runway rectangles for KSEA and KPDX (KPDX 10L/28R, 10R/28L, and 03/21), distinguishes prepared-runway contact from off-runway ground contact, and treats `GroundState.onRunway` as prepared-runway surface status rather than generic ground contact; off-runway gear/belly/crashed contact stays explicit, with higher rolling resistance and reduced brake/side grip while preserving ground-relative velocity and runway-normal constraints. Off-runway elevation fallback is still a simplified nearest-supported-runway reference, not terrain mesh collision.
- Ground realism non-claims: current runway/surface coverage is dry gameplay friction on handcrafted KSEA/KPDX prepared-runway rectangles plus simplified off-runway fallbacks. RFS does not yet model wet/contaminated runway surfaces, airport aprons/taxiway networks, source-backed tire relaxation/heat/wear or high-fidelity side-load curves, broad terrain mesh collision, or certified crosswind/rollout performance behavior.
- Pilot inputs, autopilot commands, and effective controls are separated in the store; input dynamics, stabilizer trim, CG pitch moment, and AP-owned axes have regression coverage. `ControlInputs` keeps `brake` as symmetric braking and accepts optional `leftBrake`/`rightBrake` side channels; `Space` applies symmetric brakes, `Z` applies left brake, and `X` applies right brake as momentary controls that clear on key release, blur, visibility change, and cleanup, while old saved snapshots restore side-specific brakes as zero.
- The aircraft renderer uses a persistent named visual contract with animated control surfaces/gear, Cesium-native runway references, and chase/cockpit camera management.
- The default player view has scenario/tutorial/checklist/coach flow, readable PFD/FMA, MCP controls, route status, active-leg LNAV feedback, conservative VNAV/SPD/VS behavior, and honest SPEED/N1 thrust modes that do not advertise unsupported modes.
- FDM/performance source-data governance is documented in [`docs/runbooks/fdm-source-governance.md`](docs/runbooks/fdm-source-governance.md). Current FDM/performance data remains gameplay-placeholder unless versioned metadata says otherwise; the 2026-06-16 source-packet disposition records P1.1 as blocked until permitted aero, engine, gear, tire/brake, performance-card, and runway/airport source packets exist.
- CI enforces lint, typecheck, tests, and production build before publish/deploy.

The next major enhancements are the prioritized realism/product phases documented in `docs/roadmap.md`, including source-backed ground-handling/tire tuning, broader terrain mesh collision and airport/runway surface coverage beyond KSEA/KPDX prepared runway rectangles, RFMS route-edit/FMA lifecycle fidelity, worker timing, flight-model data quality, and product polish.

### Rendering/weather/audio/immersion disposition

- Cockpit/interior: partial. RFS has a cockpit camera/shell, PFD/FMA, MCP, cockpit interaction hooks, route/scenario controls, and visual layout guards; a complete modeled 737 cockpit interior, panel-system depth, lighting, and product-grade instrument layout remain deferred.
- Weather/atmosphere: partial. RFS parses METAR wind/cloud data, provides scenario weather fallback, deterministic gusts, and simple cloud billboards; visibility rendering, QNH/temperature pressure-altitude and density-altitude effects, precipitation, and weather-driven scene degradation remain deferred.
- Audio: partial. RFS has explicit Web Audio startup, N1-driven engine tone mapping, persisted mute/volume/caption settings, and GPWS captions/speech; richer engine, cockpit, airframe, warning, and spatial sound layers remain deferred.
- Scene loading/error states: partial. RFS has an app ErrorBoundary, a visible `SCENERY DEGRADED` status for missing Cesium Ion scenery, and degraded ellipsoid fallback; richer loading, retry, scenery-error, and network-failure UX remain deferred.
- PWA: deferred. RFS does not yet claim installability/offline support; manifest icons, service worker strategy, cache policy, and offline/error fallback screens remain future product work.

Visual snapshots are not proof of audio, weather, PWA, or error-state behavior; those claims require dedicated unit/component/browser evidence for the behavior itself.

## Stack

- React 19 + TypeScript strict
- Vite 8
- Vitest 4 + jsdom
- Zustand store
- CesiumJS globe/terrain
- Three.js aircraft/effects layer via `three-to-cesium`
- RFMS shared types and avionics contracts from sibling repo `../RFMS/shared`
- Docker + nginx image published to GHCR
- GitHub Actions deploys to the VPS behind Caddy at `fly.reidar.tech`

## Repository layout

```text
src/
  App.tsx                         ErrorBoundary wrapper around the simulator shell
  app/RfsShell.tsx                 Browser UI shell: lazy viewport, input/camera/audio wiring, layout composition
  app/useScenarioWeather.ts        Scenario weather fallback, METAR fetch, and store wind bootstrap
  components/BottomControlBar.tsx  Bottom simulator controls and route-load status
  runtime/frameScheduler.ts          Single app RAF scheduler: input -> fixed sim -> render/effects -> audio
  hooks/useSimLoop.ts              Central scheduler hook into store tick and frame phases
  store/simStore.ts                Compatibility API + fixed-step tick assembly for the Zustand simulator store
  store/slices/                    Domain slices for aircraft lifecycle, input, autoflight, route, persistence
  sim/
    types.ts                       Aircraft state/spec/control types and initial state
    physics/
      integrate.ts                 Main 6-DOF integration loop
      aero.ts                      Aero forces/moments and signed drag
      frames.ts                    Body-frame <-> NED velocity transforms
      quaternion.ts                Euler/quaternion conversions and integration helper
      derived.ts                   IAS/TAS/Mach/GS/VS derived data
      atmosphere.ts                ISA atmosphere
      geodesy.ts                   WGS84/ECEF/ENU helpers
    systems/
      environment.ts               Pure wind -> air-relative body velocity helpers
      ground.ts                    Gear stations, supported-airport runway/off-runway contact, tire forces, taxi steering, touchdown/rollout, belly/crash slide
      engine.ts fuel.ts            Engine spool/fuel burn systems
      electrical.ts hydraulic.ts   Simplified aircraft systems
      navigation.ts vnav.ts        Route validation, active-leg LNAV, conservative VNAV targets
      autopilot.ts                 RFMS AutopilotState -> AP-owned control commands, including SPEED/N1 thrust
    runwaySurface.ts               Supported KSEA/KPDX runway/off-runway sampler, KSEA wrapper, and friction scales
    scenarios.ts                   Player scenarios and initial conditions
    guidanceState.ts               Scenario/tutorial/checklist coach projection
    tutorialState.ts               Tutorial step state helpers
    checklistCoach.ts              Checklist and coach-message evaluation
    weather.ts                     METAR fetch + wind parsing
  viewport/                        Cesium, Three.js, runway, cockpit, cloud, contrail layers
  instruments/                     RFS PFD/FMA and MCP
  components/                      Scenario, route, telemetry, controls, error UI
  audio/                           Web Audio engine and GPWS checks
  input/                           Gamepad/keyboard/input dynamics support

docs/
  architecture.md                  Current implementation architecture
  physics-invariants.md            Flight-model sign/frame/state contracts
  roadmap.md                       Prioritized enhancement backlog
  plans/                           Historical and future implementation plans
```

## Prerequisites

Use Node 22. The local shell default may be older, so source nvm before Node/npm commands:

```bash
source ~/.nvm/nvm.sh && nvm use 22
```

RFS imports RFMS shared types through the Vite alias `@shared`, which resolves to a sibling checkout managed by the bootstrap script:

```text
/Users/reidar/Projectos/RFS
/Users/reidar/Projectos/RFMS/shared
```

Fresh clones should bootstrap the sibling dependency before installing packages:

```bash
source ~/.nvm/nvm.sh && nvm use 22
npm run bootstrap
npm run bootstrap:check
```

The bootstrap script fetches `https://github.com/Reedtrullz/RFMC.git` at the audited RFMS/RFMC commit `810fc9652da431eaf8978b85bf4af131605559b5`. Local developer checkouts at another commit are allowed for day-to-day work when `../RFMS/shared/package.json` exists, but CI and Docker use the pinned bootstrap path for reproducible builds.

RFMS integration is currently a shared-type/source bridge, not a full CDU/FMS. `src/sim/fms/routeAdapter.ts` has pure data tests for route sources, staged `DIRECT_TO`, explicit `DISCONTINUITY`, undo, and `EXEC`, but the browser route panel still presents the KSEA→KPDX route as a canned training route and explicitly says route editing is unavailable. Do not claim a visible CDU, direct-to, discontinuity-resolution, or EXEC route-editing workflow until a dedicated UI wires those adapter operations into the store and route-status recompute path.

## Local development

```bash
cd /Users/reidar/Projectos/RFS
source ~/.nvm/nvm.sh && nvm use 22
npm run bootstrap
npm install --legacy-peer-deps
npm run dev -- --host 127.0.0.1
```

The app starts at the default Vite URL. RFS intentionally does **not** set COOP/COEP headers in dev or production because `require-corp` breaks Cesium Ion imagery/terrain/building tiles. SharedArrayBuffer-backed physics remains out of scope until the scenery policy changes; worker experiments use plain structured-clone messages first.

### Cesium scenery token

RFS can run without a Cesium Ion token. Without `VITE_CESIUM_ION_TOKEN`, it uses degraded ellipsoid scenery, disables Cesium Ion terrain/imagery/buildings requests, and shows a visible `SCENERY DEGRADED` status banner. With a valid token, it enables Cesium World Terrain and OSM buildings.

```bash
cp .env.example .env.local
# edit .env.local and set VITE_CESIUM_ION_TOKEN if desired
```

Never commit a real Cesium token.

Production Docker images are built by GitHub Actions, so `VITE_CESIUM_ION_TOKEN`
must also exist as a repository secret named `VITE_CESIUM_ION_TOKEN`; local
`.env` files are not copied into CI or Docker builds.

## Quality gate

Run the same gate CI uses:

```bash
source ~/.nvm/nvm.sh && nvm use 22
npm run check
```

`npm run check` expands to:

```text
npm run check:deps && npm run check:release && npm run check:blackbox && npm run lint:ci && npm run typecheck && npm run test && npm run build && npm run check:bundle
```

Browser proof is split into layers: unit/static gates verify source contracts, seeded/scoped Playwright helpers guard specific physics/guidance states, and manifest-listed black-box specs use visible controls plus visible readbacks only. Seeded proofs are not full-flight/full-route evidence; full-flight claims require a continuous visible-control proof that actually covers that path, plus exact-SHA CI/live verification where applicable.

Use `npm run test:e2e` for the full Playwright browser-proof suite and `npm run test:visual` for the scoped deterministic visual snapshot/timing gate. CI runs both, but only the scoped visual spec is subject to the strict visual timing budget.

Useful targeted commands:

```bash
npm run lint:ci
npm run typecheck
npm run test
npm run test:e2e
npm run test:visual
npm run test -- src/sim/physics/__tests__/integrate.test.ts
npm run build
```

Expected non-blocking warnings today:

- ESLint may print a React-version settings warning while still exiting 0.
- jsdom may print canvas `getContext()` notices while tests pass.
- Vite may warn about large Cesium-heavy chunks.

## Contributing, Security, and License

RFS is open source under the MIT License. See [`LICENSE`](LICENSE) for the full text.

Contributions are welcome when they preserve RFS's proof discipline: simulator displays must match actual backing state, partial or seeded proofs must not be overstated, and release/deploy success requires real CI or endpoint evidence. Start with [`CONTRIBUTING.md`](CONTRIBUTING.md), use the GitHub issue templates for bugs and feature requests, and include a proof-boundary section in pull requests.

Report vulnerabilities, suspected secret exposure, CI/deploy bypasses, or supply-chain issues through [`SECURITY.md`](SECURITY.md) rather than public issues.

## Repository governance status

Verified with `gh repo view`, branch-protection, and community-profile API checks on 2026-06-16:

- Repository: public `Reedtrullz/ReedFS`, default branch `master`, MIT license, issues and wiki enabled, not archived.
- Branch protection: `master` has admin enforcement enabled, force pushes and deletions disabled, and strict required status checks: `secret-scan`, `test`, `publish`, `deploy`.
- Automation posture: pinned GitHub Actions, Gitleaks secret scan, CodeQL, Dependabot for npm/actions/Docker, PR-safe Docker smoke, Trivy image scan, CODEOWNERS, pull request template, and bug/feature issue forms are present in the repo.
- Contributor/security posture: `CONTRIBUTING.md`, `SECURITY.md`, MIT `LICENSE`, proof-boundary PR checklist, and private-vulnerability reporting path are present.

Governance is not yet complete: GitHub About description, homepage, and topics are still blank; the community profile API reports 71% health; no code of conduct is currently published; and GitHub's community-profile response did not surface an issue template despite the repository containing issue-form YAML files. Do not claim OSS governance complete until those repository-level items are fixed or intentionally accepted.

## Physics conventions

RFS uses aerospace body axes and NED world velocity conventions:

```text
Body axes: x forward, y right, z down
NED axes:  north, east, down
Vertical speed display: positive climbing = -ned.down
METAR wind direction: where wind is coming FROM
```

Important contracts:

- `state.velocity` is ground-relative body velocity.
- `computeAirRelativeVelocity(state, wind)` returns a copy and never mutates `state.velocity`.
- Aero/IAS/TAS/Mach/AoA/Beta use air-relative velocity.
- Position, ground speed, and vertical speed use ground-relative velocity transformed through NED.
- `quatDerivative()` uses `dq/dt = 0.5 * q ⊗ ω` for body-axis rates.
- Longitudinal drag uses signed `dragBodyX`, not always `-drag`.
- Symmetric `brake` remains supported; optional `leftBrake`/`rightBrake` combine per side as `max(brake, sideBrake)`.
- Differential braking is tied to actual rolling direction: side brakes cannot yaw a parked aircraft, and reverse rolling reverses the yaw sign.

See `docs/physics-invariants.md` for the regression checklist.

## Runtime heartbeat

Current implementation is still main-thread physics:

```text
React App
  -> useSimLoop single RAF via runtime/FrameScheduler
    -> input phase: held keyboard + gamepad actions -> applyInputActions(dt)
    -> fixedSimulation phase: simStore.tick(timestamp)
      -> computeRouteStatus before physics for active-leg AP targets
      -> computeAutopilotCommandsForStateWithControllerState (HDG/LNAV/VNAV/VS plus SPEED/N1 thrust; AP PID/rate-limit state is explicit and serializable)
      -> compose pilotInputs + apCommands into effectiveControls
      -> getSimulationRuntime().step(...)
        -> MainThreadSimulationRuntime (default) or BrowserWorkerSimulationRuntime sync fallback when explicitly flagged
        -> advanceSimulationStep(..., cloneAircraft=false inside the store loop)
          -> integrate(state, effectiveControls, spec, dt, wind)
        -> updateEngines
        -> updateFuel
        -> updateElectrical
        -> updateHydraulic
        -> computeAero(..., wind)
        -> integrate angular velocity, quaternion, velocity, position
        -> update ground/contact and flight phase
      -> recompute routeStatus / activeLegIndex
      -> rebuild GuidanceState
      -> Zustand state update
    -> render/effects phase: reserved central hook for browser-frame effects; Cesium camera remains on scene.preRender
    -> audio phase: when AUDIO is enabled, update EngineSound and GPWS from the committed sim state
```

Moving physics to a default-on browser `Worker` remains a recommended follow-up after the state/control/route contracts stabilize. The current bridge slice provides runtime adapters, main-thread/worker-handler parity tests, and an experimental browser module Worker selected only by `VITE_RFS_WORKER_PHYSICS=1`; production still defaults to the main-thread adapter. Current disposition: no default-on worker migration is claimed until an async `FrameScheduler`/`useSimLoop`/`simStore` bridge can await `stepAsync()` while preserving input, route, AP, wind, error-fallback, pause/resume/reset, and visual/E2E parity.

Autopilot thrust guidance currently includes SPEED airspeed hold and a conservative phase-based N1 target mode. Both produce AP-owned, rate-limited throttle commands before engine integration; N1 is gated by Boeing A/T arm state, uses target N1 versus average current engine N1 rather than the SPEED airspeed-error law, and clears stale `boeing.n1` on AP disconnect/override.

### Experimental worker physics flag

`VITE_RFS_WORKER_PHYSICS` is parsed by `src/config/workerPhysics.ts` as an experimental, default-off feature flag for browser-Worker physics wiring. Truthy tokens are `1`, `true`, `yes`, `on`, and `enabled`; false/off tokens are `0`, `false`, `no`, `off`, `disabled`, and an empty value. Invalid values fall back safely to main-thread physics with an explanatory config reason.

With `VITE_RFS_WORKER_PHYSICS=1`, `src/sim/simulationRuntime.ts` instantiates a real browser module Worker and exposes Worker-backed `stepAsync()` with request/response IDs, one-request backpressure, timeout/error main-thread fallback, and `dispose()`. The current `simStore.tick()` path remains synchronous, so sync `step()` still falls back to main-thread physics until the frame scheduler becomes async-aware. This is an experimental parity/protocol path, not production-active worker physics. The flag does **not** require SharedArrayBuffer/COOP/COEP, and RFS still does **not** set COOP/COEP headers.

### Audio startup

Audio is explicit and browser-autoplay-safe. The `AUDIO: OFF` cockpit control is the only path that starts the `AudioContext`; mounting the app no longer resumes Web Audio or creates engine oscillators. Once enabled, `useAudioLoop(true)` contributes an audio phase to the central `FrameScheduler` so engine sound parameters and GPWS callouts run after the committed sim tick in the same app RAF. Turning audio off stops the audio phase work, disposes engine sounds, and mutes the master bus.

## Deployment

Pushes to `master` trigger GitHub Actions:

```text
test job:    install -> lint:ci -> typecheck -> test -> build
publish job: docker build -> ghcr.io/reedtrullz/rfs:latest
deploy job:  SSH to VPS -> pull -> canary :3004 -> health check -> promote :3005
```

Production path:

```text
https://fly.reidar.tech
  -> Cloudflare/Caddy on VPS 198.23.137.16
    -> localhost:3005
      -> Docker container rfs
```

VPS port map:

- 3001: Heimdall
- 3002: Frontpage
- 3004: RFS canary
- 3005: RFS production
- 8082: RFMS/VirtualCDU

Do not claim a deploy is complete until the GitHub Actions run is completed/successful and `curl https://fly.reidar.tech/` returns HTTP 200.

## Documentation

- `docs/architecture.md` — current architecture and integration contracts.
- `docs/physics-invariants.md` — physics sign/frame/wind/drag invariants.
- `docs/roadmap.md` — prioritized remaining enhancement backlog.
- `docs/reviews/2026-05-26-comprehensive-gameplay-review.md` — audit that drove the current usability/realism pass.
- `docs/reviews/templates/playability-dogfood-checklist.md` — browser dogfood checklist for future playable/deployed claims.
- `docs/plans/2026-05-26-rfs-comprehensive-usability-realism-plan.md` — current implementation plan/status for gameplay, cockpit, visuals, and guidance work.
- `docs/plans/2026-05-27-rfs-surface-aware-ground-handling.md` — completed/current status record for the original KSEA-only surface-aware ground-handling slice and prepared-runway `onRunway` semantics.
- `docs/plans/2026-05-27-rfs-rollout-taxi-crosswind-controls.md` — completed/current status record for rollout/taxi/crosswind landing regressions and player differential brake controls.
- `docs/plans/2026-05-27-rfs-multi-airport-surface-coverage.md` — completed/current status record for supported KSEA/KPDX runway surface sampling, the generic runtime sampler, and KSEA wrapper compatibility.
- `docs/plans/2026-05-27-rfs-lnav-turn-anticipation.md` — completed/current status record for bounded LNAV turn-anticipation sequencing and AP/route-status integration proof.
- `docs/plans/2026-05-27-rfs-n1-autothrottle.md` — completed/current status record for conservative Boeing-style N1 autothrottle behavior, MCP/FMA affordance, and simulation/store integration proof.
- `docs/plans/2026-05-25-rfs-foundation-stabilization.md` — completed stabilization record.
- `docs/plans/phase-*.md` — historical/future implementation plans; check each file's status note before treating it as current.
