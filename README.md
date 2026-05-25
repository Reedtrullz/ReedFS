# RFS — Reed Flight Simulator

RFS is a standalone web-based Boeing 737-800 flight simulator. It combines a TypeScript 6-DOF flight model, CesiumJS globe rendering, a Three.js aircraft layer, RFMS shared avionics/autopilot types, METAR-driven weather, cockpit instruments, audio cues, and a Docker/GHCR deployment pipeline.

Live deployment: https://fly.reidar.tech
Repository: https://github.com/Reedtrullz/ReedFS

## Current status

The simulator foundation is stabilized and release-gated:

- Quaternion attitude is authoritative; Euler attitude is mirrored only for compatibility and display boundaries.
- Initial south-facing attitude is aligned between Euler and quaternion state.
- Body/NED frame transforms are centralized and covered by regression tests.
- Gravity signs follow the simulator convention: body x-forward, y-right, z-down; NED down-positive.
- Wind is non-mutating and air-relative; ground velocity remains ground-relative.
- Drag is signed against air-relative flow, including reverse-flow/tailwind cases.
- CI enforces lint, typecheck, tests, and production build before publish/deploy.

The next major enhancements are documented in `docs/roadmap.md`.

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
      engine.ts fuel.ts            Engine spool/fuel burn systems
      electrical.ts hydraulic.ts   Simplified aircraft systems
      autopilot.ts                 RFMS AutopilotState -> control input bridge
      navigation.ts vnav.ts        LNAV/VNAV helpers
    weather.ts                     METAR fetch + wind parsing
  viewport/                        Cesium, Three.js, airport, cloud, contrail layers
  instruments/                     RFS PFD and MCP
  audio/                           Web Audio engine and GPWS checks
  input/                           Gamepad/keyboard support

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
      -> structuredClone(aircraft)
      -> integrate(state, inputs, spec, dt, apState, flightPlan, wind)
        -> updateEngines
        -> updateFuel
        -> updateElectrical
        -> updateHydraulic
        -> computeAero(..., wind)
        -> integrate angular velocity, quaternion, velocity, position
        -> updateAutopilot for the next frame
      -> computeDerived(state, wind)
      -> Zustand state update
```

Moving physics to a Web Worker remains a recommended follow-up after the stabilized state contract.

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
- `docs/roadmap.md` — prioritized necessary enhancements.
- `docs/plans/2026-05-25-rfs-foundation-stabilization.md` — completed stabilization record.
- `docs/plans/phase-*.md` — historical/future implementation plans; check each file's status note before treating it as current.
