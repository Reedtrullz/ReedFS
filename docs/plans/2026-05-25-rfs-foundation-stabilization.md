# RFS Foundation Stabilization — Completed Record

Status: complete and deployed.
Date: 2026-05-25.

This file records the stabilization pass that corrected the simulator's physics/state foundation before deeper realism work. It supersedes the original step-by-step task list that lived here; use the current architecture docs for the active source of truth:

- `../architecture.md`
- `../physics-invariants.md`
- `../roadmap.md`

## Goal

Stabilize the RFS simulator foundation so future flight-model, ground-model, guidance, and rendering work builds on correct state semantics, verified sign conventions, and a strict release gate.

## Scope completed

1. Added explicit quality scripts:
   - `npm run lint:ci`
   - `npm run typecheck`
   - `npm run test`
   - `npm run check`

2. Cleaned release-gate blockers:
   - React hook ordering and stable Cesium `onReady` callback.
   - FPS monitor render purity.
   - RFMS autopilot mode typing instead of `any` casts.
   - Weather JSON parsing type narrowing.
   - Unused imports/vars and localized lint issues.

3. Stabilized attitude state:
   - `AircraftState.quaternion` is authoritative.
   - Initial quaternion is derived from initial Euler attitude, preserving the south-facing spawn heading.
   - Quaternion derivative uses body-axis convention `dq/dt = 0.5 * q ⊗ ω`.
   - Euler attitude is mirrored from quaternion after each integration step for compatibility.

4. Centralized frame transforms:
   - Added `bodyToNed()` and `nedToBody()` helpers.
   - Derived ground speed and vertical speed now use attitude-aware NED velocity.

5. Corrected physics signs:
   - Gravity components now match x-forward/y-right/z-down body axes.
   - Elevator pitch moment sign was restored so nose-up elevator produces a nose-up pitching moment.

6. Refactored wind handling:
   - Removed destructive wind mutation from the store tick path.
   - Added pure helpers in `src/sim/systems/environment.ts`.
   - Aero and airspeed-derived quantities use air-relative velocity.
   - Ground speed, vertical speed, and position remain ground-relative.

7. Fixed drag polarity:
   - Added signed `dragBodyX` to oppose the air-relative longitudinal flow direction.
   - Covered tailwind/reverse-flow behavior with regression tests.

8. Strengthened CI/CD:
   - GitHub Actions test job now runs lint, typecheck, tests, and build.
   - Pushes to `master` still publish GHCR and deploy through canary promotion.

## Current runtime heartbeat

```text
src/App.tsx
  -> src/hooks/useSimLoop.ts
    -> src/store/simStore.ts tick()
      -> structuredClone(aircraft)
      -> integrate(state, inputs, spec, dt, apState, flightPlan, wind)
        1. updateEngines
        2. updateFuel
        3. updateElectrical
        4. updateHydraulic
        5. computeAero(..., wind)
        6. integrate angular rates, quaternion, velocity, position
        7. updateAutopilot for next-frame inputs
      -> computeDerived(state, wind)
      -> commit next aircraft snapshot
```

## Files changed by the stabilization pass

Primary source files:

- `package.json`
- `.github/workflows/ci.yml`
- `src/App.tsx`
- `src/components/FPSMonitor.tsx`
- `src/instruments/RfsMCP.tsx`
- `src/sim/types.ts`
- `src/sim/weather.ts`
- `src/sim/flightPlanLoader.ts`
- `src/sim/physics/aero.ts`
- `src/sim/physics/derived.ts`
- `src/sim/physics/frames.ts`
- `src/sim/physics/integrate.ts`
- `src/sim/physics/quaternion.ts`
- `src/sim/systems/environment.ts`
- `src/store/simStore.ts`
- `src/viewport/CesiumViewport.tsx`

Primary tests:

- `src/__tests__/App.test.tsx`
- `src/store/__tests__/simStore.test.ts`
- `src/sim/__tests__/types.test.ts`
- `src/sim/physics/__tests__/aero.test.ts`
- `src/sim/physics/__tests__/derived.test.ts`
- `src/sim/physics/__tests__/frames.test.ts`
- `src/sim/physics/__tests__/integrate.test.ts`
- `src/sim/physics/__tests__/quaternion.test.ts`
- `src/sim/systems/__tests__/environment.test.ts`
- `src/sim/systems/__tests__/autopilot.test.ts`

## Verification performed

Local verification:

```bash
source ~/.nvm/nvm.sh && nvm use 22
npm run check
```

The local gate passed after stabilization:

- lint
- typecheck
- unit/integration tests
- production build

Deployment verification:

- Changes were pushed to `master`.
- GitHub Actions completed successfully.
- The live site at `https://fly.reidar.tech/` returned HTTP 200.

## Known non-blocking warnings

These warnings are known and not release blockers today:

- ESLint can emit a React-version settings warning while exiting 0.
- Vitest/jsdom can emit canvas `getContext()` notices while tests pass.
- Vite can emit Cesium-heavy chunk size warnings.
- GitHub Actions can warn about upstream action runtime deprecations.

## Follow-up work

Do not fold these into the completed stabilization phase. Use separate plans:

1. Ground model: terrain/runway AGL, gear stations, oleo compression, brakes, anti-skid, nosewheel steering.
2. Flight guidance: active-leg sequencing, MCP selected-target lifecycle, VNAV SPD/PTH, RFMS FMA integration.
3. Physics worker: codec, worker loop, bridge, deterministic state handoff.
4. Rendering lifecycle: single viewer/bridge owner, persistent aircraft object, camera manager, full quaternion orientation.
5. Data-driven FDM: validated coefficient tables, trim solver, and aircraft-specific performance regression tests.

See `../roadmap.md` for the prioritized backlog.
