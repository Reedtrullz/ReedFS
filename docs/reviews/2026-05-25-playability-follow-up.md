# RFS Playability Follow-up Review — 2026-05-25

## Executive summary

RFS is still difficult/impossible to play for a different reason than the earlier “falls through runway immediately” failure. The first ground-contact patch did stop the immediate terrain tunneling, but the actual player loop is still not viable:

1. At high refresh rates, TAKEOFF can deadlock at 0 kt while the engines burn fuel at 100% N1.
2. When it does roll, TAKEOFF is only a high-speed ground roll. There is no phase-aware takeoff flow, no Vr/rotate cue, no automatic assist, and no guarantee that the player reaches climb.
3. Manual rotation and gear-up can quickly produce unstable dives below terrain with no crash/terrain guard.
4. Visual references are poor: runway is not visible, cockpit mode is not a cockpit view, and the scene is very dark with no clear horizon/runway reference.
5. Controls and guidance feedback are still debug-grade: gamepad can fight UI/keyboard, pitch semantics are confusing, LOAD PLAN is silent, and the first MCP click can appear to do nothing.

The most important new root cause is the frame-rate-dependent ground-roll deadlock. At 90/120/144 Hz, the per-frame thrust acceleration is smaller than the ground solver’s stop epsilon, so `applyLongitudinalGroundDecel()` zeroes forward speed every frame. Existing tests only cover 60 Hz and therefore miss this.

## Browser dogfood evidence

Reviewed local dev build at `http://127.0.0.1:5173/`.

Console status:

- Initial load: no browser console messages or JS errors.
- After takeoff/camera/MCP interactions: no browser console messages or JS errors.
- Cesium default ion-token warning is visible in-page.

Screenshots captured:

- Initial stopped state: `/Users/reidar/.hermes/cache/screenshots/browser_screenshot_3e816f92238d4efabdabb1382d8a0302.png`
- Ground roll at ~18 seconds: `/Users/reidar/.hermes/cache/screenshots/browser_screenshot_3be3023fe7c84f58944201dff3ab5458.png`
- Manual rotation + gear-up failure: `/Users/reidar/.hermes/cache/screenshots/browser_screenshot_2d47ba581b1343bdad0e29e21b4dc23d.png`
- Cockpit mode: `/Users/reidar/.hermes/cache/screenshots/browser_screenshot_ff57be83c44f462888f2f9bfb89ae562.png`
- Tower mode: `/Users/reidar/.hermes/cache/screenshots/browser_screenshot_a20a3604b862426ab303921a08862047.png`

Observed states:

- Initial: `SIM: STOPPED`, `ALT: 432 ft`, `IAS/TAS/GS: 0 kt`, `HDG: 180.0°`, `GEAR: DN`, `FLAPS: 0°`. Aircraft/world load, but no clearly visible runway and the scenery is very dark.
- First TAKEOFF attempt: after ~18 seconds, `ALT: 432 ft`, `IAS: 243 kt`, `GS: 245 kt`, `VS: -0 fpm`, `N1: 100%`, `FLAPS: 5°`, `GEAR: DN`. The aircraft is still glued to the runway/flat ground at excessive speed with no rotate cue.
- Manual W input for ~3 seconds: aircraft left the ground, but after release the state became high-speed/unsettled: `ALT: 1005 ft`, `IAS: 298 kt`, `VS: 3790 fpm`, `PTCH: -3.2°`, `AOA: -10.3°`, gear still down.
- Gear-up shortly after: state degraded rapidly: `ALT: 405 ft`, `IAS: 363 kt`, `VS: -12654 fpm`, `PTCH: -30.3°`, `GEAR: UP`, then screenshot showed `ALT: -2015 ft`, `VS: -28258 fpm`, `PTCH: -47.3°`.
- Reset + second TAKEOFF attempt: sim entered `RUNNING`, engines reached `N1: 100%`, fuel burned, inputs were throttle 1/flaps 5/gear down/brake 0, but velocity remained exactly `u=0` and telemetry stayed `IAS: 0 kt` at ~121 FPS.
- LOAD PLAN from reset stored a `KSEA -> KPDX` flight plan internally, but `apState` remained null and the UI gave no visible route/AP status.
- First HDG MCP click only created the default AP state with `autopilotStatus: OFF`; second HDG click activated `HDG_SEL`/`CMD_A`.

## Quality gates run

Commands run with Node 22:

```text
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test -- src/sim/systems/__tests__/ground.test.ts src/sim/physics/__tests__/integrate.test.ts src/input/__tests__/GamepadManager.test.ts src/viewport/__tests__/cameraMode.test.ts src/__tests__/App.test.tsx
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run typecheck
```

Results:

- Focused Vitest: 5 files passed, 31 tests passed.
- Typecheck: passed.
- Non-fatal jsdom warnings: `HTMLCanvasElement.getContext()` not implemented.

Frame-rate reproduction command:

```text
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm exec -- tsx -e "import { createInitialState, B737_800_SPEC, type ControlInputs } from './src/sim/types.ts'; import { integrate } from './src/sim/physics/integrate.ts'; const idle: ControlInputs={elevator:0,aileron:0,rudder:0,throttle1:1,throttle2:1,flapLever:5,gearLever:'DOWN',spoilers:0,brake:0}; for (const hz of [30,60,90,120,144]) { const s=createInitialState(B737_800_SPEC); for (let i=0;i<20*hz;i++) integrate(s,idle,B737_800_SPEC,1/hz); console.log(JSON.stringify({hz, u_ms:+s.velocity.u.toFixed(3), ias_kt:+(s.velocity.u*1.94384).toFixed(1), alt_ft:+s.position.alt.toFixed(1), n1:+s.engines[0].n1.toFixed(1)})); }"
```

Output:

```json
{"hz":30,"u_ms":62.339,"ias_kt":121.2,"alt_ft":432,"n1":100}
{"hz":60,"u_ms":59.51,"ias_kt":115.7,"alt_ft":432,"n1":100}
{"hz":90,"u_ms":0,"ias_kt":0,"alt_ft":432,"n1":100}
{"hz":120,"u_ms":0,"ias_kt":0,"alt_ft":432,"n1":100}
{"hz":144,"u_ms":0,"ias_kt":0,"alt_ft":432,"n1":100}
```

## Findings and fixes

### P0 — Frame-rate-dependent TAKEOFF deadlock at 90+ Hz

Evidence:

- Store tick uses RAF timestamp delta, capped to 50 ms, not a fixed physics step: `src/store/simStore.ts:50-56`.
- TAKEOFF sets full throttle/flaps/gear down and starts: `src/App.tsx:158-167`.
- Ground contact applies after free-flight integration: `src/sim/physics/integrate.ts:107-115`.
- Ground solver zeroes small longitudinal speed before applying rolling/brake decel: `src/sim/systems/ground.ts:23-38`.
- Stop epsilon is fixed at `0.05 m/s`: `src/sim/systems/ground.ts:9`.
- At 90/120/144 Hz, thrust adds less than this epsilon per frame, so speed is reset to zero every tick.
- Existing takeoff-roll test runs only at 60 Hz for 5 seconds: `src/sim/physics/__tests__/integrate.test.ts:104-121`.

Root cause:

The stop clamp treats any tiny forward speed as “stopped” without considering whether the engines are producing forward thrust. This makes ground roll dependent on display refresh rate.

Gameplay impact:

On a 90/120/144 Hz display, the user can press TAKEOFF, see 100% N1 and fuel burn, but never move. That exactly matches “impossible to play.”

Fix:

- Add 90/120/144 Hz regression tests before changing code.
- Change ground stop logic so it only snaps to zero when no positive thrust command is trying to break static friction, or when braking/deceleration would cross zero.
- Longer-term: run physics at a fixed deterministic substep independent of render FPS.

Acceptance tests:

- 20 seconds full throttle at 120 Hz accelerates above 50 kt.
- 20 seconds full throttle at 144 Hz accelerates above 50 kt.
- Idle/brake at rest still remains exactly stopped.
- Braking from taxi speed cannot reverse the aircraft.

### P0 — TAKEOFF is only a ground roll, not a playable takeoff flow

Evidence:

- Initial aircraft state is parked at zero speed and field altitude: `src/sim/types.ts:167-189`.
- TAKEOFF sets throttle/flaps/gear down but leaves elevator neutral: `src/App.tsx:158-167`.
- `flightPhase` starts as `PARKED` and is not transitioned by TAKEOFF: `src/sim/types.ts:106`, `src/sim/types.ts:188`.
- Ground contact clamps altitude and body vertical velocity while on gear contact: `src/sim/systems/ground.ts:68-73`.
- Browser observation: after ~18 seconds, `IAS: 243 kt`, `ALT: 432 ft`, `VS: -0 fpm`, no liftoff and no rotate cue.

Root cause:

The UI says TAKEOFF, but the current implementation means “start rolling at full power.” There is no explicit TAKEOFF_ROLL/ROTATE/CLIMB phase, no Vr calculation, no cue to the player, no assisted rotation, and no acceptance test proving that clicking TAKEOFF can lead to a stable climb.

Fix:

- Decide the player contract:
  - Rename button to `START ROLL` and show “ROTATE (hold W)” at Vr, or
  - Make TAKEOFF an assisted sequence that auto-rotates and reaches positive climb.
- Add flight-phase transitions: `PARKED -> TAKEOFF_ROLL -> ROTATE -> CLIMB`.
- Add UI/HUD state for phase, Vr cue, positive-rate cue, and gear-up availability.

Acceptance tests:

- TAKEOFF/START ROLL sets `flightPhase = TAKEOFF` or `TAKEOFF_ROLL`.
- Before Vr, aircraft stays on runway and accelerates.
- At/after Vr, pitch-up command or assisted rotation produces positive climb.
- Gear-up is blocked on weight-on-wheels and allowed after positive rate.

### P0 — Manual rotation/gear-up can become an unrecoverable below-terrain dive

Evidence:

- Browser W rotation + gear-up produced steep negative pitch/descent and negative altitude.
- Ground contact only handles gear-down contact; gear-up below-terrain state is not a crash/stop state: `src/sim/systems/ground.ts:61-65`.
- There is no terrain collision guard after gear-up or after leaving the flat KSEA altitude plane: `src/sim/physics/integrate.ts:107-115`.
- Camera follows raw aircraft MSL altitude: `src/App.tsx:127-140`.
- Aircraft proxy uses raw aircraft MSL altitude: `src/viewport/ThreeLayer.tsx:57-58`.

Root cause:

At review time, the ground solver was a post-solve altitude clamp, not a normal-force/weight-on-wheels model. Once the aircraft left or retracted the gear, there was no safe crash/belly-contact/terrain guard. The camera then followed invalid below-ground states. Current repo state has since added explicit gear contact, normal-force liftoff, and gear-up belly/crash runway contact; keep this section as historical evidence.

Fix:

- Add explicit ground contact state to `AircraftState` or a derived ground-state object: weight-on-wheels, AGL, ground altitude, on-runway, crash/belly-contact.
- Release ground contact based on normal force / lift-vs-weight and vertical velocity, not just altitude.
- If gear-up below ground, enter a controlled crash/stopped state instead of tunneling.
- Clamp camera/display target above terrain or show a clear “crashed/below terrain” overlay.

### P1 — Runway/spawn visual reference is missing

Evidence:

- Initial state is a generic KSEA-ish position/heading 180: `src/sim/types.ts:171-174`.
- KSEA runway definitions exist with heading 163: `src/viewport/AirportLayer.tsx:16-21`.
- `AirportLayer` is not mounted in `App.tsx`; mounted layers are Cesium, ThreeLayer, CloudLayer, ContrailLayer: `src/App.tsx:173-176`.
- Browser screenshots show no clear runway surface, markings, centerline, or threshold.

Root cause:

The takeoff scenario is not actually a runway scenario visually. The aircraft is not clearly spawned/aligned to a runway centerline, and the runway layer is absent from the app.

Fix:

- Create a shared runway/scenario data source for KSEA runway start positions.
- Spawn at a runway threshold/centerline with heading matching the selected runway.
- Reintroduce runway visualization using Cesium-native entities/primitives, not the old Three overlay that caused foreground slab issues.
- Add a visible scenario label: runway, heading, field elevation, wind.

### P1 — Control semantics are confusing and gamepad can fight the player

Evidence:

- Control contract: elevator `-1` is nose-up, `+1` is nose-down: `src/sim/types.ts:44-46`.
- Keyboard maps `w` to `-0.5` and `s` to `+0.5`: `src/input/keyboardControls.ts:14-20`.
- The help overlay only says `W/S pitch`, not which key rotates/pitches down.
- Gamepad maps left Y directly to elevator: `src/input/GamepadManager.ts:54-63`; typical gamepad pull-back is positive Y, which becomes nose-down.
- Gamepad throttle fields are cleared to zero when triggers return neutral: `src/input/GamepadManager.ts:20-37`, `src/input/GamepadManager.ts:66-70`.
- Gamepad polling writes partial inputs every RAF with no source arbitration: `src/App.tsx:86-97`.

Root cause:

Manual controls are still debug inputs. There is no input manager, active-source ownership, control inversion setting, or latched throttle behavior.

Fix:

- Add an InputManager with source-tagged commands and recency/priority rules.
- Separate self-centering controls from latched controls.
- Do not clear throttle to zero on trigger release unless that is explicitly the selected throttle mode.
- Invert gamepad pitch by default or expose a calibration setting.
- Make the help overlay explicit: `W = rotate/nose up`, `S = nose down` or switch to conventional game mapping if desired.

### P1 — Camera modes do not provide reliable recovery or cockpit reference

Evidence:

- Running disables Cesium camera inputs: `src/App.tsx:110-116`.
- Follow camera loop calls `lookAt()` for chase/cockpit/tower while running: `src/App.tsx:118-147`.
- Camera modes are only `chase | cockpit | tower`: `src/viewport/cameraMode.ts`.
- Cockpit mode uses `lookAt()` from aircraft position + 2 m with no cockpit/nose/window reference: `src/App.tsx:129-133`.
- Browser cockpit screenshot still looks like an external/overhead aircraft view, not a pilot-eye view.

Root cause:

Camera behavior is embedded in `App.tsx` and lacks an explicit free/manual recovery mode. Cockpit is just another camera offset.

Fix:

- Extract `CameraManager`.
- Add `CHASE`, `FREE`, `TOWER_STATIC`, and either a true `COCKPIT` or rename current behavior to `INSTRUMENT`.
- Enable manual Cesium inputs in free and paused modes.
- Only run `camera.lookAt()` in follow modes.
- Add e2e/visual checks that cockpit/free modes expose sky/horizon/terrain and are not blank/dark.

### P1 — LOAD PLAN/MCP feedback is not trustworthy

Evidence:

- Store starts `apState: null`: `src/store/simStore.ts:44`.
- LOAD PLAN sets `flightPlan`, but only activates LNAV/VNAV/SPEED if `apState` already exists: `src/App.tsx:213-228`.
- First MCP click when `apState` is null creates a default state and returns without activating the clicked mode: `src/instruments/RfsMCP.tsx:26-88`.
- OFF branch clears modes but does not set `autopilotStatus = OFF`; it is set to `CMD_A` before branch handling: `src/instruments/RfsMCP.tsx:90-106`.
- Integrator uses current heading/current altitude and hardcoded `targetSpeed = 250`, not selected MCP targets: `src/sim/physics/integrate.ts:120-140`.
- LNAV active waypoint index is hardcoded to 0: `src/sim/physics/integrate.ts:125-128`.

Root cause:

Guidance state exists internally but is not a clear player-facing workflow. Route load, AP creation, mode activation, selected targets, and active leg are not unified.

Fix:

- Add shared AP default/activation helper so the first MCP click initializes and activates in one action.
- LOAD PLAN should either initialize and annunciate guidance, or explicitly show `ROUTE LOADED / AP OFF`.
- Add FMA/route status strip: AP status, thrust/lateral/vertical modes, selected targets, FROM/TO, distance, VNAV unavailable reason.
- Add active leg state and waypoint sequencing.

### P2 — Aircraft rendering undermines visual trust

Evidence:

- `ThreeLayer` uses only phi/theta from quaternion: `src/viewport/ThreeLayer.tsx:44-47`.
- Model rotation ignores yaw: `src/viewport/ThreeLayer.tsx:53-58`.
- Aircraft proxy is removed/cloned/added every postRender frame: `src/viewport/ThreeLayer.tsx:42-59`, `src/viewport/ThreeLayer.tsx:97-98`.
- Gear compression check uses `position.alt < 100`, which is wrong at KSEA field elevation 432 ft: `src/viewport/ThreeLayer.tsx:84-90`.

Root cause:

The aircraft visual layer is not a stable, full-attitude representation of the sim state.

Fix:

- Keep one persistent aircraft object and update transform in place.
- Apply full quaternion/yaw in the correct Cesium/Three frame.
- Drive gear compression from real weight-on-wheels/ground state, not raw MSL altitude.

## Recommended implementation order

1. P0 frame-rate ground-roll fix.
   - This is the smallest confirmed blocker and should be fixed first.
   - Add 90/120/144 Hz tests before production changes.
2. P0 takeoff phase and player contract.
   - Decide `START ROLL + ROTATE cue` vs assisted TAKEOFF.
   - Add phase/rotate/positive-rate/gear interlock tests.
3. P0 minimal real ground state.
   - weight-on-wheels, AGL, runway altitude provider, normal-force-aware release, gear-up crash guard.
4. P1 runway scenario visibility.
   - runway-aligned spawn and visible Cesium-native runway overlay.
5. P1 control manager.
   - input-source arbitration, gamepad pitch inversion/calibration, latched throttle, clearer help.
6. P1 camera manager.
   - free/manual recovery, real cockpit/instrument behavior.
7. P1 guidance/FMA feedback.
   - route status, first-click MCP activation, selected target wiring, active waypoint state.
8. P2 visual/render cleanup.
   - persistent aircraft proxy, full quaternion orientation, WOW-driven gear animation.

## First concrete TDD slice

Start with the frame-rate deadlock because it is small, deterministic, and directly explains a “nothing happens after TAKEOFF” player experience.

Files:

- Modify tests: `src/sim/physics/__tests__/integrate.test.ts`
- Modify implementation: `src/sim/systems/ground.ts`

Test additions:

- `full-throttle takeoff roll accelerates at 120 Hz`
- `full-throttle takeoff roll accelerates at 144 Hz`
- `idle aircraft at rest remains stopped`
- `braking from low taxi speed stops without reversing`

Expected red result before implementation:

- 120/144 Hz acceleration tests fail with `velocity.u === 0`.

Implementation direction:

- In `applyLongitudinalGroundDecel()`, do not snap `state.velocity.u` to zero when throttle command is non-trivial and positive thrust is trying to break static friction.
- Preserve the stop clamp for idle/braking/no-thrust cases.
- Keep the “no reverse while braking” behavior.

Verification:

```text
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test -- src/sim/systems/__tests__/ground.test.ts src/sim/physics/__tests__/integrate.test.ts
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test -- src/input/__tests__/GamepadManager.test.ts src/viewport/__tests__/cameraMode.test.ts src/__tests__/App.test.tsx
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run typecheck
```

Browser verification after the first fix:

- Load local app.
- Click TAKEOFF.
- At 120 FPS, within 10 seconds IAS/GS should increase above 30 kt.
- Within 20 seconds, IAS/GS should continue increasing and not remain zero.
- RESET + TAKEOFF should repeat deterministically.

## Implementation follow-up

Implemented locally on 2026-05-25:

- High-FPS ground-roll deadlock fixed: takeoff thrust now breaks away from the ground stop epsilon while idle/brake stop behavior remains covered.
- Added 120/144 Hz takeoff-roll regression coverage plus store-level reset -> second roll coverage.
- Button copy changed from `TAKEOFF` to `START ROLL`, with explicit `W rotate/nose up` and `G gear after positive rate` guidance.
- Added takeoff cue text: `TAKEOFF ROLL`, `ROTATE — hold W`, and `POSITIVE RATE — gear up`; cue clears after gear-up.
- Added `startTakeoffRoll()` store action so the player flow explicitly enters `flightPhase = 'TAKEOFF'`.
- Keyboard rotate authority and early-climb assist added so a 3-second W hold after the rotate cue produces positive climb and the aircraft stays recoverable after gear-up/release instead of diving below terrain.
- Browser dogfood passed locally at ~120 FPS: reset -> START ROLL -> accelerate above 30 kt in ~10s -> ROTATE cue -> W rotate -> positive climb -> gear up -> stable early climb -> reset -> START ROLL repeat.
- Local quality gate passed: `npm run check` with 32 test files and 156 tests passing.

## Bottom line

The P0 player loop is now locally usable for the first time: reset -> START ROLL -> accelerate -> rotate -> positive climb -> gear-up -> reset/retry works at high refresh rates. Remaining playability work should focus on runway/visual references, camera/cockpit quality, richer crash/terrain handling, and a less arcade-like but still stable flight model. Do not claim deployed until CI succeeds and `https://fly.reidar.tech/` is verified.
