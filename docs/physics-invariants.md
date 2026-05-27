# RFS Physics Invariants

This checklist captures the flight-model contracts that were stabilized in the foundation and ground-model passes. Use it before changing `src/sim/physics/*`, `src/sim/systems/environment.ts`, `src/sim/systems/ground.ts`, or `src/store/simStore.ts`.

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

## Ground and runway/off-runway contact

Ground contact is a post-solve constraint, not an alternate wind/velocity frame.

Current contract:

- `state.velocity` remains ground-relative body velocity throughout ground contact.
- `sampleKseaSurface()` classifies KSEA runway rectangles as prepared runway and off-rectangle KSEA ground as off-runway ground with separate rolling/brake/side friction scales.
- `GroundState.onRunway` means prepared runway surface, not merely any ground contact.
- Off-runway ground contact may still be `contact: 'gear'`, `belly`, or `crashed`; it must not silently become airborne just because it is outside the runway rectangle.
- Gear-down contact may load nose/left-main/right-main gear stations; gear-up `belly`/`crashed` contact must not set `weightOnWheels` or leave gear station loads active.
- Runway-normal velocity is constrained in NED `down`, not by blindly zeroing body-axis `w` while pitched or rolled.
- Gear-up belly/crash slide damping acts on runway-tangent NED `north/east` velocity and then converts back to body axes.
- Belly/crash slide damping must clamp low-speed runway-tangent velocity at zero instead of reversing motion.
- Gear-up angular damping is timestep-scaled retention per second, not a per-tick multiplier.
- A high runway-normal sink-rate impact that enters `crashed` must remain `crashed` while the gear-up aircraft stays in ground contact.
- Surface friction scaling must never mutate wind/air-relative velocity; it only changes ground-contact tire/brake/side forces and leaves the ground-relative velocity contract intact.

Regression coverage:

- `src/sim/systems/__tests__/ground.test.ts`
- `src/sim/physics/__tests__/integrate.test.ts`

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
7. Surface sampling, ground/contact constraint, and flight-phase updates

Reasoning:

- Engine state must be current before thrust is computed.
- Fuel burn and gross weight must be current before accelerations are computed.
- Autopilot commands are composed upstream before `integrate()`; the legacy AP parameters accepted by `integrate()` are intentionally ignored.
- Surface sampling happens after position integration for the contact solve, while the pre-integration sample is used only for near-ground normal-force/liftoff checks.

## Required verification before claiming a physics change works

At minimum:

```bash
source ~/.nvm/nvm.sh && nvm use 22
npm run test -- src/sim/physics/__tests__/integrate.test.ts src/sim/physics/__tests__/aero.test.ts src/sim/physics/__tests__/derived.test.ts src/sim/systems/__tests__/environment.test.ts src/sim/systems/__tests__/ground.test.ts
npm run check
```

For deployment-affecting changes, also wait for GitHub Actions to complete successfully and verify the live URL with `curl https://fly.reidar.tech/`.
