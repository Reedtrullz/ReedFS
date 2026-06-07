# RFS Physics Invariants

This checklist captures the flight-model contracts that were stabilized in the foundation and ground-model passes. Use it before changing `src/sim/physics/*`, `src/sim/systems/environment.ts`, `src/sim/systems/ground.ts`, `src/sim/systems/autopilot.ts`, or `src/store/simStore.ts`.

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
- `sampleSupportedAirportSurface()` classifies supported KSEA/KPDX prepared runway rectangles as prepared runway and off-rectangle supported-airport ground as `offRunway` with separate rolling/brake/side friction scales. Current KPDX coverage is the 10L/28R, 10R/28L, and 03/21 runway rectangles.
- `sampleKseaSurface()` remains a KSEA-only compatibility wrapper for existing KSEA-specific callers and tests.
- Off-runway fallback elevation comes from the nearest supported runway footprint/reference; this is not terrain mesh collision, arbitrary airport support, or full non-runway airport surface modeling.
- `GroundState.onRunway` means prepared runway surface, not merely any ground contact.
- Off-runway ground contact may still be `contact: 'gear'`, `belly`, or `crashed`; it must not silently become airborne just because it is outside the runway rectangle.
- Gear-down contact may load nose/left-main/right-main gear stations; gear-up `belly`/`crashed` contact must not set `weightOnWheels` or leave gear station loads active.
- Runway-normal velocity is constrained in NED `down`, not by blindly zeroing body-axis `w` while pitched or rolled.
- Gear-up belly/crash slide damping acts on runway-tangent NED `north/east` velocity and then converts back to body axes.
- Belly/crash slide damping must clamp low-speed runway-tangent velocity at zero instead of reversing motion.
- Gear-up angular damping is timestep-scaled retention per second, not a per-tick multiplier.
- A high runway-normal sink-rate impact that enters `crashed` must remain `crashed` while the gear-up aircraft stays in ground contact.
- Surface friction scaling must never mutate wind/air-relative velocity; it only changes ground-contact tire/brake/side forces and leaves the ground-relative velocity contract intact.
- `ControlInputs.brake` remains the symmetric brake channel; optional `leftBrake`/`rightBrake` side channels default to zero for older callers and restored snapshots.
- `brakeCommandFromInputs()` must combine commands per side as `max(global brake, side brake)`, preserving symmetric braking while allowing player differential braking.
- Differential-brake force and yaw must be tied to actual rolling direction: side-specific brakes cannot yaw a parked aircraft, and reverse rolling reverses the yaw sign.
- Momentary player side brakes must clear on release, blur, visibility change, and cleanup so stale side-specific brake values cannot survive into a new control state.

Regression coverage:

- `src/sim/systems/__tests__/ground.test.ts` covers side-specific brake commands, symmetric-brake equivalence, stopped-aircraft guards, and reverse-rolling yaw sign.
- `src/viewport/__tests__/runwayData.test.ts` and `src/sim/__tests__/runwaySurface.test.ts` cover the KSEA/KPDX runway catalog, generic sampler, KSEA wrapper compatibility, and KPDX off-runway fallback behavior.
- `src/sim/physics/__tests__/integrate.test.ts` covers KSEA 16L low-speed taxi steering, KPDX prepared-runway and off-runway integration, KPDX takeoff-to-climb elevation handling, crosswind approach/touchdown/rollout, and rollout braking sanity.
- `src/input/__tests__/keyboardControls.test.ts`, `src/input/__tests__/InputManager.test.ts`, `src/input/__tests__/controlBindings.test.ts`, `src/store/__tests__/simStore.test.ts`, `src/components/__tests__/ControlsSettings.test.tsx`, and `src/__tests__/App.test.tsx` cover differential brake input/UI/store behavior and cleanup.

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

1. `applyPilotConfiguration()` copies same-tick flap/gear/spoiler controls into aircraft config
2. `updateEngines()`
3. `updateFuel()`
4. `updateElectrical()`
5. `updateHydraulic()`
6. `computeAero()`
7. Physics integration
8. Surface sampling, ground/contact constraint, and flight-phase updates

Reasoning:

- Pilot-facing configuration controls are applied before `computeAero()` so flap/gear/spoiler changes affect the same tick's aero solve.
- Engine state must be current before thrust is computed.
- Fuel burn and gross weight must be current before accelerations are computed.
- Autopilot commands are composed upstream before `integrate()`; AP-owned SPEED/N1 throttle commands must be present in `effectiveControls` before `updateEngines()` runs. `integrate()` intentionally accepts only aircraft, effective controls, spec, timestep, and optional wind so route/AP state cannot leak into the physics integrator.
- Surface sampling happens after position integration for the contact solve, while the pre-integration sample is used only for near-ground normal-force/liftoff checks.

Autopilot/control regression coverage:

- `src/sim/systems/__tests__/autopilot.test.ts` covers SPEED and conservative N1 target/command laws, including A/T-arm gating.
- `src/sim/__tests__/simulationStep.test.ts` covers AP commands being composed into effective controls before engine integration.
- `src/store/__tests__/simStore.test.ts` covers pilot/AP/effective-control separation and stale AP mode flag cleanup on manual override.

## Required verification before claiming a physics change works

At minimum:

```bash
source ~/.nvm/nvm.sh && nvm use 22
npm run test -- src/sim/physics/__tests__/integrate.test.ts src/sim/physics/__tests__/aero.test.ts src/sim/physics/__tests__/derived.test.ts src/sim/systems/__tests__/environment.test.ts src/sim/systems/__tests__/ground.test.ts
npm run check
```

For deployment-affecting changes, also wait for GitHub Actions to complete successfully and verify the live URL with `curl https://fly.reidar.tech/`.
