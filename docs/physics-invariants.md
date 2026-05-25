# RFS Physics Invariants

This checklist captures the flight-model contracts that were stabilized in the foundation pass. Use it before changing `src/sim/physics/*`, `src/sim/systems/environment.ts`, or `src/store/simStore.ts`.

## Axes and signs

```text
Body axes: x forward, y right, z down
NED axes:  north, east, down
```

- Positive `u`: forward along aircraft nose.
- Positive `v`: right wing.
- Positive `w`: down through aircraft belly.
- Positive NED `down`: descending.
- Display vertical speed is positive climbing, so `vsFpm = -ned.down * 196.850394`.
- Initial aircraft heading is south: `psi = Math.PI`.

Regression coverage:

- `src/sim/__tests__/types.test.ts`
- `src/sim/physics/__tests__/frames.test.ts`
- `src/sim/physics/__tests__/integrate.test.ts`
- `src/sim/physics/__tests__/derived.test.ts`

## Quaternion attitude

Quaternion is the authoritative attitude representation.

- `createInitialState()` derives `quaternion` from initial Euler attitude with `eulerToQuat()`.
- `integrate()` updates quaternion from body rates and normalizes it every tick.
- Euler attitude is mirrored from quaternion after integration for compatibility.
- Display components should derive Euler angles from `state.quaternion` at the display boundary where practical.

Derivative convention:

```text
dq/dt = 0.5 * q ⊗ ω
ω = (0, p, q, r) in body axes
```

Regression coverage:

- `src/sim/physics/__tests__/quaternion.test.ts`
- `src/sim/physics/__tests__/integrate.test.ts`

## Gravity

With body x-forward/y-right/z-down and pitch `theta` positive nose-up, body-frame gravity components are:

```typescript
const gx = -G * Math.sin(theta);
const gy = G * Math.cos(theta) * Math.sin(phi);
const gz = G * Math.cos(theta) * Math.cos(phi);
```

Expected behavior:

- Level freefall increases positive `w`.
- Nose-up attitude adds a negative x-axis gravity component.
- Right roll adds a positive y-axis gravity component.

Regression coverage:

- `src/sim/physics/__tests__/integrate.test.ts`

## Wind and air-relative velocity

Wind is a frame-of-reference input, not an impulse.

- `state.velocity` is ground-relative body velocity and must not be mutated by weather/wind helpers.
- `windToNed(wind)` converts METAR wind to NED velocity.
- METAR wind direction is where the wind is coming FROM.
- `computeAirRelativeVelocity(state, wind)` returns `groundBody - windBody`.
- Calling `computeAirRelativeVelocity()` repeatedly with the same state and wind must return the same result and leave state unchanged.

Expected split:

- Aero forces/moments use air-relative velocity.
- TAS/IAS/Mach/AoA/Beta use air-relative velocity.
- Position, GS, and VS use ground-relative velocity.

Regression coverage:

- `src/sim/systems/__tests__/environment.test.ts`
- `src/sim/physics/__tests__/aero.test.ts`
- `src/sim/physics/__tests__/derived.test.ts`
- `src/store/__tests__/simStore.test.ts`

## Drag polarity

Drag must oppose air-relative flow, not always point backward in body X.

Current contract:

```typescript
const dragBodyX = tasMs > 1 ? -drag * (u / tasMs) : 0;
```

Expected behavior:

- Forward air-relative `u > 0`: `dragBodyX < 0`.
- Reverse air-relative `u < 0`: `dragBodyX > 0`.
- Strong tailwind/reverse-flow low-speed cases must not pull the aircraft backward.

Regression coverage:

- `src/sim/physics/__tests__/aero.test.ts`
- `src/sim/physics/__tests__/integrate.test.ts`

## System update order

`integrate()` must keep this order unless a new plan proves why it should change:

1. `updateEngines()`
2. `updateFuel()`
3. `updateElectrical()`
4. `updateHydraulic()`
5. `computeAero()`
6. Physics integration
7. `updateAutopilot()` for next-frame inputs

Reasoning:

- Engine state must be current before thrust is computed.
- Fuel burn and gross weight must be current before accelerations are computed.
- Autopilot writes control commands for the next tick, avoiding same-frame hidden feedback.

## Required verification before claiming a physics change works

At minimum:

```bash
source ~/.nvm/nvm.sh && nvm use 22
npm run test -- src/sim/physics/__tests__/integrate.test.ts src/sim/physics/__tests__/aero.test.ts src/sim/physics/__tests__/derived.test.ts src/sim/systems/__tests__/environment.test.ts
npm run check
```

For deployment-affecting changes, also wait for GitHub Actions to complete successfully and verify the live URL with `curl https://fly.reidar.tech/`.
