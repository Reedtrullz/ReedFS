# RFS — Reed Flight Simulator

RFS is a standalone web-based Boeing 737-800 flight simulator. It combines a TypeScript 6-DOF flight model, CesiumJS globe rendering, a Three.js aircraft layer, RFMS shared avionics/autopilot types, METAR-driven weather, cockpit instruments, audio cues, and a Docker/GHCR deployment pipeline.

Live deployment: https://fly.reidar.tech
Repository: https://github.com/Reedtrullz/ReedFS

## Current status

The simulator now has a stabilized flight-model foundation plus the first gameplay/usability productization pass:

- Quaternion attitude is authoritative; Euler attitude is mirrored only for compatibility and display boundaries.
- Body/NED frame transforms, gravity signs, air-relative wind, signed drag, and physics regressions are covered by tests.
- Ground contact now has explicit ground state, per-gear station loads, dynamic oleo spring/damper compression, runway-normal constraints, tire braking/rolling friction, anti-skid brake limiting, asymmetric brake-force helpers, normal-force-scaled tire side-loads, rudder-pedal-limited nosewheel steering, crosswind/weathercocking scenario regressions, touchdown damping, ground effect, normal-force liftoff gating, and phase handling so takeoff/landing are no longer driven by core attitude hacks.
- Pilot inputs, autopilot commands, and effective controls are separated in the store; input dynamics, stabilizer trim, CG pitch moment, and AP-owned axes have regression coverage.
- The aircraft renderer uses a persistent named visual contract with animated control surfaces/gear, Cesium-native runway references, and chase/cockpit camera management.
- The default player view has scenario/tutorial/checklist/coach flow, readable PFD/FMA, MCP controls, route status, active-leg LNAV feedback, and conservative VNAV/SPD/VS behavior that does not advertise unsupported modes.
- CI enforces lint, typecheck, tests, and production build before publish/deploy.

The next major enhancements are the prioritized realism/product phases documented in `docs/roadmap.md`, including advanced gear/tire/brake behavior, guidance fidelity, worker timing, flight-model data quality, and product polish.

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
  App.tsx                         Browser UI shell and controls
  hooks/useSimLoop.ts              RAF heartbeat into the store tick
  store/simStore.ts                Zustand sim state, inputs, AP state, wind, flight plan
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
      ground.ts                    Gear stations, runway contact, tire forces, taxi steering, touchdown/rollout
      engine.ts fuel.ts            Engine spool/fuel burn systems
      electrical.ts hydraulic.ts   Simplified aircraft systems
      navigation.ts vnav.ts        Route validation, active-leg LNAV, conservative VNAV targets
      autopilot.ts                 RFMS AutopilotState -> AP-owned control commands
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

RFS imports RFMS shared types through the Vite alias `@shared`, which resolves to a sibling checkout:

```text
/Users/reidar/Projectos/RFS
/Users/reidar/Projectos/RFMS/shared
```

CI and Docker clone `https://github.com/Reedtrullz/RFMC.git` into an `RFMS` directory before installing/building.

## Local development

```bash
cd /Users/reidar/Projectos/RFS
source ~/.nvm/nvm.sh && nvm use 22
npm install --legacy-peer-deps
npm run dev -- --host 127.0.0.1
```

The app starts at the default Vite URL. The dev server sets COOP/COEP headers in `vite.config.ts` so future SharedArrayBuffer/worker work can run locally.

### Cesium scenery token

RFS can run without a Cesium Ion token. Without `VITE_CESIUM_ION_TOKEN`, it uses degraded ellipsoid scenery, disables Cesium Ion terrain/imagery/buildings requests, and shows a visible `SCENERY DEGRADED` status banner. With a valid token, it enables Cesium World Terrain and OSM buildings.

```bash
cp .env.example .env.local
# edit .env.local and set VITE_CESIUM_ION_TOKEN if desired
```

Never commit a real Cesium token.

## Quality gate

Run the same gate CI uses:

```bash
source ~/.nvm/nvm.sh && nvm use 22
npm run check
```

`npm run check` expands to:

```text
npm run lint:ci && npm run typecheck && npm run test && npm run build
```

Useful targeted commands:

```bash
npm run lint:ci
npm run typecheck
npm run test
npm run test -- src/sim/physics/__tests__/integrate.test.ts
npm run build
```

Expected non-blocking warnings today:

- ESLint may print a React-version settings warning while still exiting 0.
- jsdom may print canvas `getContext()` notices while tests pass.
- Vite may warn about large Cesium-heavy chunks.

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

See `docs/physics-invariants.md` for the regression checklist.

## Runtime heartbeat

Current implementation is still main-thread physics:

```text
React App
  -> useSimLoop RAF
    -> simStore.tick(dt)
      -> computeRouteStatus before physics for active-leg AP targets
      -> computeAutopilotCommandsForState
      -> compose pilotInputs + apCommands into effectiveControls
      -> structuredClone(aircraft)
      -> integrate(state, effectiveControls, spec, dt, null, flightPlan, wind)
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
```

Moving physics to a fixed-timestep Web Worker remains a recommended follow-up after the state/control/route contracts stabilize.

### Experimental worker physics flag

`VITE_RFS_WORKER_PHYSICS` is parsed by `src/config/workerPhysics.ts` as an experimental, default-off feature flag for future worker-physics wiring. Truthy tokens are `1`, `true`, `yes`, `on`, and `enabled`; false/off tokens are `0`, `false`, `no`, `off`, `disabled`, and an empty value. Invalid values fall back safely to main-thread physics with an explanatory config reason.

The current runtime still keeps `simStore.tick()` and physics execution on the main thread. Enabling the flag today does not migrate ticks to a Worker or instantiate a runtime Worker; that bridge remains future work.

### Audio startup

Audio is explicit and browser-autoplay-safe. The `AUDIO: OFF` cockpit control is the only path that starts the `AudioContext`; mounting the app no longer resumes Web Audio or creates engine oscillators. Once enabled, `useAudioLoop(true)` drives engine sound parameters and GPWS callouts from the current sim state. Turning audio off stops the loop and mutes the master bus.

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
- `docs/plans/2026-05-25-rfs-foundation-stabilization.md` — completed stabilization record.
- `docs/plans/phase-*.md` — historical/future implementation plans; check each file's status note before treating it as current.
