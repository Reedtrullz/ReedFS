# RFS Release-Hardening Playability Dogfood Review

Date: 2026-05-26 23:23 CEST
URL tested: http://127.0.0.1:5173/
Code under test: 9352d94 (`feat: add controls settings model`)
Browser: Hermes browser session against local Vite dev server
Screenshot evidence: /Users/reidar/.hermes/cache/screenshots/browser_screenshot_4fd870f91b4848469dacad08cf1ce3eb.png

## Executive summary

The local RFS player loop is materially more usable than the original “impossible to play” state. The app loads without JavaScript console errors, truthfully announces degraded Cesium scenery when no Ion token is configured, starts a runway roll from KSEA, accelerates on repeated attempts, rotates into a positive climb with manual W input, allows gear-up after positive rate, resets cleanly, and exposes route/MCP/FMA feedback, audio startup, scenario save/load, and controls settings.

Quality gates run after the implementation pass:

- `npm run check`: PASS (70 test files, 425 tests, build PASS)
- `npm run test:visual`: PASS (4 Playwright visual tests)

Dogfood result: PASS for the release-hardening milestone, with two UX follow-ups before calling the broader simulator “polished”: phase-gate LOAD PLAN/AP engagement during takeoff/low-altitude states, and reduce debug overlay overlap around the new controls settings panel.

## Checklist results

### Initial load

- [x] No JS console errors after navigation.
- [x] Scenery status visible and truthful: `SCENERY DEGRADED` with `VITE_CESIUM_ION_TOKEN is not configured with a usable Cesium Ion token.`
- [x] Aircraft/sim UI visible; PFD/FMA/MCP/Scenario/Route panels render.
- [x] STOPPED, 0 kt, KSEA runway/field elevation 432 ft visible.

### Takeoff and control loop

- [x] START ROLL accelerates on first attempt.
  - Sample after about 5 seconds: IAS 113 kt, ALT 432 ft, VS 0 fpm, pitch 5.9°.
- [x] Manual W rotation produces liftoff and positive climb.
  - Sample after holding W about 4 seconds: IAS 151 kt, ALT 918 ft, VS 3124 fpm, pitch 17.3°.
- [x] Gear-up after positive rate remains recoverable.
  - Sample after G and 3 seconds: IAS 149 kt, ALT 1786 ft, VS 2464 fpm, pitch 14.8°.
- [x] RESET restores the initial stopped state.
  - Sample after reset: IAS 0 kt, ALT 432 ft, VS 0 fpm, START ROLL visible again.
- [x] Second START ROLL accelerates normally.
  - Sample after about 3 seconds: IAS 57 kt, ALT 432 ft, VS 0 fpm.

### Views, overlays, route, and audio

- [x] Camera mode button cycles through modes; TOWER mode visible.
- [x] Overlay mode cycles to DEBUG and exposes telemetry plus controls help/settings.
- [x] LOAD PLAN exposes route feedback.
  - Route sample: KSEA→KPDX active, leg 0 KSEA → OLM, DTG visible, track 220°T.
- [x] FMA/MCP feedback visible after route load.
  - FMA sample: THR SPEED, ROLL LNAV, PITCH ALT_HOLD, AP CMD_A.
- [x] Audio starts only after explicit click; `AUDIO: ON` appeared after pressing AUDIO.
- [x] Scenario SAVE/LOAD works and shows visible status.
  - Sample: `Saved scenario loaded.` after saving, resetting, and loading.
- [x] Controls settings UI visible in debug overlay and validates bindings.
  - Sample: Pitch W/S + gamepad left stick Y, throttle ArrowUp/ArrowDown + RT/LT, `Bindings valid.`

## Findings

### Finding 1 — LOAD PLAN immediately engages AP/LNAV/ALT_HOLD even during low-altitude/takeoff states

Severity: Medium
Category: UX / Flight guidance honesty

Observed behavior:

- Clicking LOAD PLAN during a running takeoff/low-altitude state immediately set the FMA to SPEED/LNAV/ALT_HOLD/CMD_A.
- The aircraft began route/AP behavior while still close to runway/low-energy state. One sample showed route active, AP CMD_A, LNAV, ALT_HOLD, and a noticeable bank close to the runway.

Expected behavior:

- Loading a route should be separable from engaging AP modes during manual takeoff.
- Safer behavior would be: load route + display LNAV availability, but leave AP modes armed/off until an explicit MCP/CMD action or a phase gate permits engagement.

Why it matters:

- This is no longer a crash/blocker, but it can surprise the player during the most workload-heavy part of the flight and makes the simulator feel less aircraft-like.

Suggested follow-up:

- Split LOAD PLAN into route load only, or gate the current auto-CMD defaults behind airborne/above-safe-altitude or explicit user confirmation.
- Add a regression test that LOAD PLAN does not auto-bank the aircraft while weight-on-wheels or below a configured safe altitude.

### Finding 2 — Debug controls settings panel overlaps flight instruments

Severity: Low
Category: Visual / UX

Observed behavior:

- In DEBUG overlay, the new Controls settings panel renders and is useful, but it overlaps the PFD/MCP area and partially obscures attitude/autopilot controls in the screenshot evidence.

Expected behavior:

- Debug overlays should remain readable without covering the primary flight instruments used for dogfood.

Suggested follow-up:

- Move Controls settings to a collapsible panel, below ControlsHelp, or behind a dedicated settings toggle.
- Keep it in debug mode, but avoid covering PFD/MCP.

### Watch item — Saved running-state snapshots resume as running

Severity: Low
Category: UX

Observed behavior:

- Saving while running and loading after reset restores the running state, including AP/route state.

Expected behavior:

- This may be acceptable for exact-state resume, but repeated training loops often benefit from load-as-paused behavior.

Suggested follow-up:

- Consider a `Load paused` policy or a visible status line explaining that the saved state resumes immediately.

## Console status

- Initial load: no console messages or JS errors.
- START ROLL / rotate / gear-up / reset / second roll: no console errors observed.
- LOAD PLAN / audio / save-load / debug overlay: no console errors observed.

## Evidence samples

Text telemetry captured through the browser session:

- Initial: `IAS 0 KT`, `ALT 432 FT`, `NO ROUTE`, `AP OFF`.
- First roll: `IAS 113 KT`, `ALT 432 FT`, `VS -0`.
- Rotation/climb: `IAS 151 KT`, `ALT 918 FT`, `VS 3124`, coach: `Positive rate: raise the gear and hold a stable climb attitude.`
- Gear-up climb: `IAS 149 KT`, `ALT 1786 FT`, `VS 2464`, coach: `Climb stable.`
- Reset: `IAS 0 KT`, `ALT 432 FT`, `START ROLL` visible.
- Second roll: `IAS 57 KT`, `ALT 432 FT` after about 3 seconds.
- Debug overlay: controls settings visible and `Bindings valid.`

Screenshot evidence path:

/Users/reidar/.hermes/cache/screenshots/browser_screenshot_4fd870f91b4848469dacad08cf1ce3eb.png

## Verification commands

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run test:visual
```

Both passed in this session.

## Release-hardening milestone conclusion

The milestone passes local dogfood and automated gates. The remaining issues are not P0 blockers for the release-hardening pass, but they are important for the next realism/playability iteration: make route/AP activation phase-honest and reduce debug overlay crowding.
