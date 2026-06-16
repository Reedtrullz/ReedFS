# RFS physics playability dogfood

Date: 2026-06-16
Target: local browser app at `http://127.0.0.1:5173/`
Scope: focused post-envelope browser proof for takeoff, landing, rollout/taxi, stop, and reset loops.

## Result

Status: PASS for the scoped local browser proof.

No new blocker was found in this pass. The focused Playwright browser proof passed, and the telemetry capture stayed inside the currently declared gameplay-placeholder performance envelopes.

## Commands run

Focused browser proof required by the remediation plan:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 VITE_RFS_VISUAL_TEST=0 npx playwright test e2e/rfs-blackbox-player-loop.spec.ts e2e/rfs-flight.spec.ts --workers=1 --reporter=line --timeout=240000
```

Observed result: `7 passed (4.5m)`.

Telemetry capture helper, run through Playwright against the same browser app:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 VITE_RFS_VISUAL_TEST=0 npx playwright test e2e/__task16-dogfood-telemetry.tmp.spec.ts --workers=1 --reporter=line --timeout=240000
```

Observed result: `1 passed (37.6s)`.

The temporary telemetry spec was removed after the run. Raw JSON evidence is in ignored local test output at `test-results/task16-dogfood-telemetry.json`; do not commit raw `test-results/` output.

## Browser proof covered

- KSEA route load through visible controls shows player-facing takeoff setup before manual start.
- KSEA route takeoff through visible controls reaches positive rate and gear-up command/state.
- KSEA visible-control LNAV/SPD/ALT engagement after positive rate remains truthful: no hidden `PITCH OFF / CMD_A`, visible FMA remains controlled, and sampled vertical speed did not drop below the test floor.
- ENVA takeoff helper reaches clean climb in the browser runtime.
- ENVA short-final landing touches down, transitions through derotation/rollout/taxi/stopped, and resets cleanly.
- ENVA seeded descent configures approach, lands, transitions through rollout/taxi/stopped, and resets without an intermediate store reset.
- KPDX 10R short-final landing touches down on the prepared KPDX 10R surface, rolls out/stops, and resets cleanly.

## Telemetry evidence

### ENVA takeoff to clean climb

- IAS at clean-climb proof point: `138.1 kt`.
- Altitude / radio-height proxy: `256.8 ft MSL`, `200.8 ft AGL`.
- Vertical speed: `2930.6 fpm`.
- Weight on wheels: `false`.
- Gear: lever `UP`, actual gear down `false`.
- Guidance phase: `climb`.
- Coach message: `Climb stable. Keep pitch changes small and follow the next tutorial step.`
- Checklist labels included `Positive rate established` and `Gear up`.

### ENVA short-final landing / rollout / reset

- Approach setup: `149.4 kt IAS`, `120.0 ft AGL`, gear down, flaps 30, guidance `approach`.
- Touchdown: `134.3 kt IAS`, `134.4 kt GS`, touchdown sink `11.23 m/s`, runway along-track `678.3 m`, phase `TOUCHDOWN`, gear contact on prepared ENVA 09 runway.
- Rollout/stop: `2.36 kt GS`, phase `STOPPED`, guidance `stopped`, runway along-track `1059.5 m`.
- Landing phase sequence observed: `TOUCHDOWN -> DEROTATION -> ROLLOUT -> TAXI -> STOPPED`.
- Reset: status `stopped`, flight phase `PARKED`, guidance `preflight`, weight on wheels `true`, route/autopilot cleared.

### ENVA seeded descent to landing / rollout / reset

- Descent seed: `149.0 kt IAS`, `301.0 ft AGL`, vertical speed `-30.2 fpm`, phase `DESCENT`.
- Configured approach: `131.8 kt IAS`, `280.9 ft AGL`, vertical speed `-614.8 fpm`, gear down, flaps 30, phase `APPROACH`.
- Touchdown: `131.9 kt IAS`, `132.0 kt GS`, touchdown sink `10.34 m/s`, runway along-track `932.3 m`, phase `TOUCHDOWN`, gear contact on prepared ENVA 09 runway.
- Rollout/stop: `2.32 kt GS`, phase `STOPPED`, guidance `stopped`, runway along-track `1307.0 m`.
- Landing phase sequence observed: `TOUCHDOWN -> DEROTATION -> ROLLOUT -> TAXI -> STOPPED`.
- Reset: status `stopped`, flight phase `PARKED`, guidance `preflight`, weight on wheels `true`, route/autopilot cleared.

### KPDX 10R short-final landing / rollout / reset

- Approach setup: `154.4 kt IAS`, `120.0 ft AGL`, gear down, flaps 30, guidance `approach`, prepared surface `KPDX 10R`.
- Touchdown: `136.4 kt IAS`, `131.5 kt GS`, touchdown sink `10.69 m/s`, runway along-track `725.7 m`, phase `TOUCHDOWN`, gear contact on prepared KPDX 10R runway.
- Rollout/stop: `2.49 kt GS`, phase `STOPPED`, guidance `stopped`, runway along-track `1088.0 m`.
- Landing phase sequence observed: `TOUCHDOWN -> DEROTATION -> ROLLOUT -> TAXI -> STOPPED`.
- Reset: status `stopped`, flight phase `PARKED`, guidance `preflight`, weight on wheels `true`, route/autopilot cleared.

## Non-claims

- This is local browser proof only. It is not CI, live, deployed, or exact-SHA production proof.
- The ENVA/KPDX landing flows are scoped browser-runtime helper proofs with seeded approach/descent states. They are not a hand-flown uninterrupted gate-to-gate route.
- The visible-control proof covers route load, takeoff, positive-rate, gear-up, and post-liftoff MCP truth. It does not prove a continuous visible-control full-flight landing.
- The performance numbers remain gameplay-placeholder envelopes unless source metadata says otherwise. They are not certified Boeing, AFM, FCOM, QRH, or operator-performance data.
- Surface proof is scoped to the currently prepared ENVA 09 and KPDX 10R surfaces used by the tests. It is not broad airport/terrain/wet-runway/tire-fidelity proof.
- Audio, weather rendering, graphics fidelity, and immersion are outside this focused physics playability pass.

## Follow-up

- Task 16A should either add/deepen tests for surface, crosswind, and tire-side-load realism or explicitly defer them with public non-claims.
- Task 17 should address VNAV path truth separately; this pass does not upgrade VNAV depth.
