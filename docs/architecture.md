# RFS Current Architecture

This document describes the implementation in the repository now. Older files under `docs/plans/` may describe target architecture or historical migration steps; use this file as the current source of truth.

## System overview

RFS runs as a browser app with main-thread simulation today:

```text
Browser
  React UI + instruments + controls
  CesiumJS globe and terrain
  Three.js aircraft/effects layer via three-to-cesium
  Zustand store for aircraft/input/AP/weather/flight-plan state
  TypeScript 6-DOF integration loop on requestAnimationFrame
```

RFMS avionics logic is not duplicated in this repo. RFS imports shared autopilot and flight-plan types from the sibling RFMS checkout through the `@shared` Vite alias.

## Runtime heartbeat

```text
src/App.tsx
  -> src/hooks/useSimLoop.ts
    -> src/store/simStore.ts tick()
      -> structuredClone(aircraft)
      -> src/sim/physics/integrate.ts
        1. updateEngines(state, inputs, spec, dt)
        2. updateFuel(state, spec, dt)
        3. updateElectrical(state, dt)
        4. updateHydraulic(state, dt)
        5. computeAero(state, inputs, spec, B737_AERO, wind)
        6. integrate angular rates, quaternion, velocity, and position
        7. updateAutopilot(state, inputs, apState, targets, dt) for the next frame
      -> computeDerived(state, wind)
      -> commit next Zustand aircraft snapshot
```

The system order is intentional:

- Engine and fuel update before aero so thrust and mass are current.
- Aero receives wind as an input and computes air-relative values without mutating state.
- Autopilot runs after physics integration and writes commands into `inputs` for the next tick.

## State model

`AircraftState` contains:

- Geodetic position: latitude, longitude, altitude in feet.
- Body velocity: `u`, `v`, `w` in m/s, ground-relative.
- Euler attitude: `phi`, `theta`, `psi`, kept for compatibility and display users.
- Quaternion attitude: authoritative attitude used by integration and display boundaries.
- Angular velocity: `p`, `q`, `r` in rad/s.
- Derived values: IAS/TAS/GS/Mach/VS/AoA/Beta, recomputed from state and wind.
- Engine, fuel, electrical, hydraulic, config, and flight phase data.

Quaternion is authoritative. `integrate()` updates quaternion from body rates, normalizes it, then mirrors Euler angles from the normalized quaternion.

## Coordinate and velocity contracts

```text
Body axes: x forward, y right, z down
NED axes:  north, east, down
```

Contracts that must not be broken:

- `state.velocity` is ground-relative body-frame velocity.
- `computeAirRelativeVelocity(state, wind)` returns a new body-frame velocity and does not mutate `state.velocity`.
- Aero, TAS, IAS, Mach, angle of attack, and sideslip use air-relative velocity.
- Ground speed and vertical speed use ground-relative velocity transformed to NED.
- METAR wind direction is treated as where the wind is coming FROM.
- Longitudinal drag uses signed `dragBodyX` so reverse-flow and tailwind cases oppose the air-relative flow direction.

See `docs/physics-invariants.md` for the detailed checklist and test locations.

## Rendering architecture

RFS currently renders with Cesium plus a Three.js overlay:

- `CesiumViewport.tsx` owns the Cesium viewer lifecycle and base globe/terrain setup.
- `ThreeLayer.tsx` bridges Three.js into Cesium, creates a Boeing 737 model template once, and clones it per frame.
- `AirportLayer.tsx`, `CloudLayer.tsx`, and `ContrailLayer.tsx` add scene content and effects.
- Camera behavior lives in `App.tsx` and follows the aircraft in chase/cockpit/tower modes.

Known rendering follow-up:

- Consolidate Cesium/Three lifecycle into a single viewer provider/bridge.
- Keep a persistent aircraft object instead of per-frame cloning.
- Apply full quaternion orientation consistently in camera and model code.
- Extract a dedicated camera manager.

## Avionics and guidance architecture

RFS bridges RFMS avionics state into native physics:

- `RfsMCP.tsx` edits an RFMS-compatible `AutopilotState`.
- `App.tsx` can load a KSEA -> KPDX sample flight plan.
- `autopilot.ts` maps active RFMS truth modes to control inputs.
- `navigation.ts` and `vnav.ts` provide basic LNAV/VNAV target helpers.

Known guidance follow-up:

- Add durable active-leg state and waypoint sequencing.
- Use MCP selected targets throughout the AP lifecycle.
- Implement VNAV SPD/PTH mode behavior instead of one-shot altitude targeting.
- Feed RFMS Flight Mode Annunciator state from the same source as the servo logic.

## Weather architecture

- `weather.ts` fetches/parses METAR data.
- `parseMetarWind()` interprets wind direction as FROM direction.
- `environment.ts` converts METAR wind to NED then to body axes.
- Wind is threaded into `integrate()`, `computeAero()`, and `computeDerived()` without modifying ground velocity.

## Quality and release architecture

Local gate:

```bash
source ~/.nvm/nvm.sh && nvm use 22
npm run check
```

CI gate:

```text
npm run lint:ci
npm run typecheck
npm run test
npm run build
```

Deployment pipeline:

```text
push master
  -> GitHub Actions test
  -> GHCR publish ghcr.io/reedtrullz/rfs:latest
  -> SSH deploy to VPS
  -> canary on localhost:3004
  -> promote to localhost:3005 after health check
  -> Caddy serves https://fly.reidar.tech
```

## Not implemented yet

These are intentional gaps, not regressions:

1. Ground model: terrain/runway AGL, gear stations, oleo compression, brakes, anti-skid, nosewheel steering.
2. Worker physics: codec, worker loop, main-thread bridge, deterministic state handoff.
3. Advanced flight guidance: active-leg sequencing, LNAV turn anticipation, VNAV SPD/PTH, RFMS FMA lifecycle.
4. Data-driven flight model: validated aircraft coefficient tables and trim/response tests.
5. Rendering lifecycle cleanup: persistent objects, full quaternion use, camera manager.
