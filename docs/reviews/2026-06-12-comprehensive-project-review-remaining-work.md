# RFS Comprehensive Project Review and Remaining Work — 2026-06-12

Audit time: 2026-06-12, after the guidance-truth / ENVA clean-climb proof slice.  
Repo: `/Users/reidar/Projectos/RFS`  
Branch observed: `master`  
Local HEAD observed: `28ca7a5` / `28ca7a5dfae0a9545c18dfd08a06a3ba53a03b8f`  
`origin/master` observed: `b8457378adef5cf2a3e3f6efbf09214b80ecc39b`  
Ahead/behind observed: `0 15` (`master` is 15 commits ahead of `origin/master`)  
Live commit observed at `https://fly.reidar.tech/rfs-version.json`: `b8457378adef5cf2a3e3f6efbf09214b80ecc39b`

## Non-claims

- I did not push, deploy, or claim production is current.
- I did not read or print secret files.
- I did write this review artifact.
- Local gates below are local-only evidence. Live still serves `b845737`, not local `28ca7a5`.
- The existing `stash@{0}: On master: pre-plan dirty RFS FDM/system batch` was preserved and not applied.

## Project goal

RFS is trying to become a credible, playable, browser-native Boeing 737-800 simulator, not a cosmetic 3D demo. The target state is:

1. A player can complete believable browser flight flows: configure, take off, hand-fly or use honest automation, climb, navigate, descend, approach, land, roll out, taxi/reset.
2. The PFD/MCP/FMA/AP/FMS contract is honest: no displayed mode should imply guidance the simulator is not actually flying, and no hidden AP command should fly while the display says OFF.
3. Physics are testable and increasingly data-backed: gameplay-calibrated constants may be scaffolding, but the path forward is source-lineaged FDM/performance data, narrower envelope tests, and explicit realism bounds.
4. The project is releaseable OSS: clean local gates, reliable CI/deploy, branch protection, clear docs, security/license posture, and no unverified live/deploy claims.

## Evidence collected

### Current repository and live state

```text
date=2026-06-12
branch=master
head=28ca7a5
head_full=28ca7a5dfae0a9545c18dfd08a06a3ba53a03b8f
origin_master=b8457378adef5cf2a3e3f6efbf09214b80ecc39b
ahead_behind=0 15
## master...origin/master [ahead 15]
stash@{0}: On master: pre-plan dirty RFS FDM/system batch
```

Live verification:

```text
https://fly.reidar.tech/ -> HTTP 200
live rfs-version.json commit -> b8457378adef5cf2a3e3f6efbf09214b80ecc39b
live imageRef -> ghcr.io/reedtrullz/rfs:sha-b8457378adef5cf2a3e3f6efbf09214b80ecc39b
live imageDigest -> unknown
```

Branch protection check returned GitHub API 404 `Branch not protected`.

### Local gates

Passed during this review:

- `npm run check`
  - `check:deps`
  - `check:release`
  - lint/typecheck/test/build
  - `83` Vitest files passed
  - `607` Vitest tests passed
  - production build passed
- `CI=1 npm run test:visual`
  - `5` Playwright tests passed in `31.5s`
- Browser dogfood via local Vite:
  - initial page loaded with no console messages/errors
  - deterministic ENVA takeoff loop reached clean climb:
    - time: `38.2s`
    - phase: `climb`
    - AGL: `200.4 ft`
    - IAS: `173.2 kt`
    - VS: `2893 fpm`
    - gear lever: `UP`
    - gear down: `false`
    - weight-on-wheels: `false`
    - route: `NO ROUTE`
    - coach: `Climb stable. Keep pitch changes small and follow the next tutorial step.`

One delegated UX audit saw a non-CI `npm run test:visual` screenshot timeout in `e2e/rfs-visual.spec.ts`, but the parent rerun with `CI=1` and a clean port passed all 5 Playwright tests. Treat this as a flake/determinism risk, not the current gate status.

### Codebase size snapshot

```text
Markdown: 24639 lines in 38 files
TypeScript: 17577 lines in 150 files
TSX: 5196 lines in 36 files
YAML: 206 lines in 1 files
MJS: 183 lines in 3 files
CSS: 15 lines in 1 files

src: 22487 lines
e2e: 301 lines
docs: 24639 lines
.github: 206 lines
scripts: 183 lines
```

Largest implementation/test files include `src/sim/systems/__tests__/ground.test.ts` at 926 lines, while the largest repo files overall are historical docs/plans.

## What is working well now

- The local committed tree is green under the main local gate and browser visual/e2e gate.
- ENVA clean-climb proof is real and browser-backed, not just a unit simulation.
  - `e2e/rfs-flight.spec.ts:5-21`
  - `e2e/helpers/rfsFlight.ts`
- Route status is store-owned and can express route validity, active leg, distance, desired track, sequencing, and LNAV availability.
- PFD display FMA now uses a derived display truth helper rather than raw AP state.
  - `src/instruments/RfsPFD.tsx:374-410`
  - `src/sim/systems/fmaTruth.ts:100-118`
- Store now separates pilot inputs, AP commands, and effective controls.
  - `src/store/simStore.ts:51-60`
- Ground handling has meaningful gear/belly/crash contact outcomes and tire/braking/anti-skid foundations.
  - `src/sim/systems/ground.ts:551-597`
- Release posture is much better than a typical toy repo: pinned Actions, gitleaks, digest-pinned base images, immutable SHA deployment image ref, public post-promotion checks, and local release hardening checks.
  - `.github/workflows/ci.yml:19-27`
  - `.github/workflows/ci.yml:94-113`
  - `.github/workflows/ci.yml:131-206`
  - `Dockerfile:1-44`
  - `scripts/release-hardening-check.mjs:33-80`

## P0 — must fix before stronger project claims

### P0.1 — AP command truth can diverge from displayed FMA truth

Current FMA display requires backed modes, but AP command computation can still use raw truth modes.

Evidence:

- AP engagement is raw truth-only: any `ap.truth.autopilotStatus !== 'OFF'` is engaged.
  - `src/sim/systems/autopilot.ts:80-82`
- FMA display requires backed CMD/CWS/AP flags and returns OFF if not backed.
  - `src/sim/systems/fmaTruth.ts:34-57`
  - `src/sim/systems/fmaTruth.ts:106-110`
- Simulation step computes AP commands from `isAutopilotEngaged(input.apState)` before composing controls.
  - `src/sim/simulationStep.ts:83-99`
- AP command law branches on raw `ap.truth` lateral/vertical/thrust fields.
  - `src/sim/systems/autopilot.ts:230-304`

Why this matters:

This violates the core honesty goal. A malformed/restored/RFMS-supplied state could display OFF or suppress an unbacked mode while still commanding elevator/aileron/throttle.

Remaining work:

- Introduce one shared `effectiveAutoflightTruth` / `backedAutoflightTruth` helper.
- Make AP command computation, FMA display, MCP active lights, and tests consume the same source.
- Add tests proving unbacked `CMD_A`, unbacked `SPEED`, unbacked `LNAV`, and unsupported RFMS/Airbus modes produce no AP commands and no FMA modes.

Autonomous: yes.

### P0.2 — VNAV lifecycle is display-derived, not authoritative end-to-end

Evidence:

- `computeVNAV()` can return `VNAV`, `VNAV_PTH`, `ALT*`, or `ALT_HOLD`.
  - `src/sim/systems/vnav.ts:88-119`
- FMA display derives VNAV lifecycle from route status and `computeVNAV()`.
  - `src/sim/systems/fmaTruth.ts:76-97`
- AP command law still flies raw vertical truth modes and generic VS/pitch logic.
  - `src/sim/systems/autopilot.ts:240-245`
- Store tick commits aircraft, controls, route status, active leg, and guidance; it does not commit or expose a shared authoritative VNAV lifecycle.
  - `src/store/simStore.ts:379-389`

Why this matters:

The PFD can show a derived capture/acquire mode while AP law is not explicitly using the same lifecycle object. That is better than cosmetic overclaiming, but still not a single source of truth.

Remaining work:

- Decide whether VNAV lifecycle mutates RFMS-compatible `apState.truth` or lives as an RFS runtime-derived context.
- Make AP law, FMA, MCP, and tests use that same lifecycle source.
- Add near-capture tests where FMA shows `ALT*` / `ALT_HOLD` and AP law demonstrably uses the same mode.

Autonomous: implementation mostly yes. Product/API decision needed for whether RFMS or RFS owns the lifecycle object.

### P0.3 — Current local HEAD is not origin/CI/live proven, and branch protection is absent

Evidence:

- Local `master` is ahead of `origin/master` by 15 commits.
- Live `rfs-version.json` reports `b845737`, not local `28ca7a5`.
- GitHub API says `master` branch is not protected.
- CI workflow has no top-level `concurrency` block.
  - `.github/workflows/ci.yml:1-10`

Why this matters:

The local project state is strong, but the public project still serves the older commit. With no branch protection, required checks are not enforced. Without deploy concurrency, rapid pushes can race publish/deploy/rollback.

Remaining work:

- Owner/admin: enable branch protection and required checks for `master`.
- Add workflow concurrency to prevent overlapping publish/deploy jobs.
- Push/deploy only when authorized, then wait for actual GitHub Actions completion and verify live `rfs-version.json` before making live claims.

Autonomous: workflow concurrency yes. Branch protection/push/deploy require owner/admin authorization.

## P1 — high-value work to reach the real simulator goal

### P1.1 — RFMS integration is mostly type-sharing, not shared FMS/FMA lifecycle

Evidence:

- RFS imports RFMS shared types, but runtime route state is local store state.
  - `src/store/simStore.ts:68-88`
- Default flight plans are synthetic/canned.
  - `src/sim/flightPlanLoader.ts:4-8`
  - `src/sim/flightPlanLoader.ts:31-53`
- MCP directly toggles local modes; only HDG/LNAV/ALT/VS/SPD/N1/OFF controls are exposed.
  - `src/instruments/RfsMCP.tsx:244-289`

Remaining work:

- Pick an ownership boundary: RFMS owns route modification/EXEC and mode lifecycle, or RFS keeps a simplified runtime and adapters.
- Add RFMS route-modification/EXEC parity tests before UI work.
- Add RFMS mode-manager parity or adapter tests for LNAV/VNAV arm/capture.
- Add a KSEA route/LNAV browser proof: load route, enable LNAV, observe active leg/DTG changes.

Autonomous: adapter/tests yes. Ownership boundary needs product/API decision.

### P1.2 — Full-flight proof is still absent

Evidence:

- Current browser proof stops at ENVA clean climb.
  - `e2e/rfs-flight.spec.ts:5-21`
- Current deterministic helper succeeds once phase is `climb`, AGL > 200 ft, gear up, and vertical speed positive.
- Scenario set is takeoff/pattern-oriented only.
  - `src/sim/scenarios.ts:44-145`
- Default ENVA `LOAD PLAN` intentionally yields no route.
  - `src/sim/flightPlanLoader.ts:46-53`

Remaining work:

- Add one route-tracking proof, likely KSEA→KPDX first because that canned route already exists.
- Add approach/landing/rollout/reset scenario and browser proof.
- Expand guidance/checklists beyond preflight/takeoff/positive-rate/climb.
- Only after those pass should docs claim full-route or full-flight proof.

Autonomous: yes, except for route realism/navdata scope decisions.

### P1.3 — FDM and performance data are still gameplay-calibrated placeholders

Evidence:

- FDM lineage explicitly says gameplay-calibrated placeholder, low confidence, not certified Boeing data.
  - `src/sim/data/aircraft/b737-800-fdm.v1.ts:19-37`
- Active FDM name is `Boeing 737-800 RFS placeholder FDM`.
  - `src/sim/data/aircraft/b737-800-fdm.v1.ts:41-48`
- Performance cards are runtime/test scaffolding, with broad expected envelopes.
  - `src/sim/data/performance/b737PerformanceCards.ts:46-70`

Remaining work:

- Replace or augment placeholder FDM groups with source-lineaged public/authorized data slices.
- Add narrower reference envelopes for clean climb, cruise, approach, stall, trim, engine lapse, turn rate, landing distance.
- Keep claim discipline: current values are suitable for gameplay regression, not training/AFM claims.

Autonomous: plumbing/tests yes. High-confidence data source selection is owner/source/licensing-blocked.

### P1.4 — Aero, spoiler, engine, atmosphere, and ground contact realism need the next fidelity pass

Evidence:

- Aero computes scalar lift/drag/side force; lift is returned directly and drag X is projected, not a full stability-axis force vector projection.
  - `src/sim/physics/aero.ts:130-181`
- Spoilers currently add drag through `speedBrakeCd`; there is no explicit lift-dump term in the shown force calculation.
  - `src/sim/physics/aero.ts:149-156`
- Engine model is simple N1-to-thrust with density/Mach lapse and constant SFC.
  - `src/sim/systems/engine.ts:17-25`
  - `src/sim/systems/engine.ts:52-75`
- Ground contact clamps to sampled ground and uses all gear stations once gear contact is available.
  - `src/sim/systems/ground.ts:568-597`
- Surface model is runway rectangles plus nearest-runway off-runway elevation fallback.
  - `src/sim/runwaySurface.ts:82-116`

Remaining work:

- Convert aero forces to a proper wind/stability-axis vector projected into body axes.
- Add spoiler lift-dump and prove wheel normal force/braking changes after touchdown.
- Add engine-out/asymmetric thrust yaw moment and richer lapse/fuel-flow checks.
- Make weather temperature/QNH affect density altitude, altimetry, aero, engine, and performance cards.
- Evolve ground contact to station-by-station main/nose touchdown, strut compression, bounce/rebound, runway slope, and better off-runway terrain.

Autonomous: most implementation/tests. Exact aircraft data and terrain/navdata sources are partially blocked.

### P1.5 — Player UX/cockpit is usable but not yet a credible 737 cockpit

Evidence:

- PFD is fixed-position and fixed-width.
  - `src/instruments/RfsPFD.tsx:441-454`
- MCP is fixed at top/right coordinates.
  - `src/instruments/RfsMCP.tsx:188-199`
- Bottom toolbar is fixed-position.
  - `src/App.tsx:324-370`
- Cockpit model is built from simple boxes/cylinders; PFD/ND/MCP are static cutouts.
  - `src/viewport/CockpitModel.ts:83-132`
- Yoke and MCP cockpit interactions are placeholders returning `null`.
  - `src/viewport/cockpitInteractions.ts:24-66`
  - `src/viewport/cockpitInteractions.ts:77-95`
- Browser dogfood in debug/cockpit mode showed useful surfaces, but overlays visibly stack/overlap: scenario panel, debug telemetry, PFD, MCP, controls settings, runway editor, engine strip, bottom toolbar.

Remaining work:

- Make layout responsive and collision-aware across 1280x720, 1440x900, 1920x1080, and narrow laptop sizes.
- Add live in-cockpit display surfaces or a deliberate cockpit/HUD design boundary.
- Implement yoke drag and cockpit MCP picking or hide/label them as unavailable.
- Add e2e for cockpit lever clicks, audio toggle, overlay modes, camera modes, controls settings, and responsive layouts.

Autonomous: yes. High-fidelity cockpit assets/art direction require owner decision.

### P1.6 — Flight director/MCP coverage is intentionally limited

Evidence:

- FD roll bars only work for `HDG_SEL`.
  - `src/instruments/RfsPFD.tsx:117-135`
- FD pitch bars only work for `ALT_HOLD`.
  - `src/instruments/RfsPFD.tsx:137-155`
- MCP exposes no VNAV or LVL CHG button today.
  - `src/instruments/RfsMCP.tsx:244-289`

Remaining work:

- Do not expose VNAV/LVL CHG until backed by real laws and shared truth.
- Once AP resolver exposes stable cues, add LNAV roll FD and VS/VNAV pitch FD tests.
- Add armed-vs-active mode lifecycle when RFMS mode manager boundary is chosen.

Autonomous: yes after P0.1/P0.2.

### P1.7 — Simulation architecture is still main-thread; worker path is scaffold/parity only

Evidence:

- `useSimLoop()` drives `requestAnimationFrame` on the main thread.
  - `src/hooks/useSimLoop.ts:4-14`
- Runtime defaults to main-thread; worker handler parity is synchronous/in-process.
  - `src/sim/simulationRuntime.ts:12-57`
- Worker physics flag exists and defaults off, but no real browser Worker is wired here.
  - `src/config/workerPhysics.ts:1-63`
- Store still clones one aircraft per rendered tick then steps in-place through the runtime.
  - `src/store/simStore.ts:346-389`

Remaining work:

- Implement a real `new Worker(...)` bridge behind `VITE_RFS_WORKER_PHYSICS=1`.
- Add worker startup/error/termination tests and a browser smoke.
- Measure postMessage overhead before default-on.
- Keep SharedArrayBuffer/COOP/COEP blocked unless Cesium/Ion header tradeoffs are explicitly accepted.

Autonomous: yes for default-off worker bridge.

### P1.8 — App/store ownership boundaries are concentrated in high-churn files

Evidence:

- `App.tsx` owns input polling, weather fetch, camera lifecycle, audio, route loading, layout, and toolbar behavior.
  - `src/App.tsx:324-370` is only one visible part of this concentration.
- `simStore.ts` owns state schema, tick loop, persistence, scenarios, AP/controls composition, route/guidance commits.
  - `src/store/simStore.ts:51-92`
  - `src/store/simStore.ts:340-389`
- AP PID state is module-global and reset by function, not carried as an instance/runtime state.
  - `src/sim/systems/autopilot.ts:72-78`

Remaining work:

- Split `App` into focused hooks/components: keyboard/gamepad polling, weather, camera lifecycle, route controls, toolbar.
- Split `simStore` into runtime/tick, controls, scenario/persistence, and route/autoflight slices.
- Move AP PID/controller state into explicit runtime/store-carried controller state.

Autonomous: yes, but do it after P0 autoflight truth work.

### P1.9 — CI/deploy hardening has specific remaining gaps

Evidence:

- Local `npm run check` includes `check:deps`, but CI test job does not.
  - `package.json:13-15`
  - `.github/workflows/ci.yml:46-57`
- Rollback function in SSH deploy uses `docker run ... || true` and does not verify rollback health.
  - `.github/workflows/ci.yml:143-152`
  - `.github/workflows/ci.yml:196-205`
- Ansible rollback starts previous image but does not verify public health after rollback.
  - `ansible-playbook.yml:218-236`
- Docker build args do not pass the final pushed digest into `RFS_IMAGE_DIGEST`; live metadata says `unknown`.
  - `Dockerfile:3-6`
  - `.github/workflows/ci.yml:104-107`
- PR CI does not build/smoke the Docker container.
  - `.github/workflows/ci.yml:46-57`
- `.dockerignore` is minimal.
  - `.dockerignore:1-5`

Remaining work:

- Add workflow `concurrency`.
- Add `npm run check:deps` to CI.
- Add PR-safe Docker build/container smoke.
- Harden runtime container: read-only filesystem, tmpfs, cap drop, no-new-privileges where compatible.
- Verify rollback health/version and make rollback failures loud.
- Improve image digest propagation or write post-push metadata with digest.
- Tighten `.dockerignore`.
- Expand `scripts/release-hardening-check.mjs` so these governance expectations are checked.

Autonomous: YAML/scripts/docs yes. Production rollback drill requires owner approval.

## P2 — important polish and scope expansion

### P2.1 — Keyboard/gamepad/cockpit flap behavior is inconsistent

Evidence:

- Keyboard flap cycling uses local 0/5/10/15/... logic.
  - `src/input/keyboardControls.ts:12-14`
  - `src/input/keyboardControls.ts:93-96`
- Cockpit/gamepad path uses B737 detents `[0, 1, 2, 5, 10, 15, 25, 30, 40]`.
  - `src/input/flapDetents.ts:1-8`

Remaining work:

- Route keyboard `F` through `nextB737FlapDetent`.
- Add keyboard/gamepad/cockpit equivalence tests.

### P2.2 — Audio is opt-in but lifecycle/immersion are minimal

Evidence:

- Audio loop creates two engine sounds and directly calls GPWS each frame when enabled.
  - `src/hooks/useAudioLoop.ts:6-35`
- GPWS uses global `speechSynthesis.speak()` directly.
  - `src/audio/GPWS.ts:78-96`

Remaining work:

- Ensure AUDIO OFF cancels queued speech and fully suspends/disposes resources.
- Add wind, runway roll, gear/flap, touchdown, switch, brake, and cockpit ambience layers.
- Add e2e/browser smoke for AUDIO ON/OFF without console errors.

### P2.3 — Aircraft and camera visual contracts need breadth

Remaining work:

- Add spoiler meshes/state animation so commanded speedbrakes are visible.
- Make tower camera a true airport/runway anchored viewpoint rather than a long chase variant.
- Add tower/free camera visual snapshots.
- Add debug/minimal overlay coverage in Playwright.

### P2.4 — Test coverage should expand from clean climb to route/landing/playability matrix

Current browser e2e coverage is valuable but narrow:

- visual states: initial chase, cockpit, route loaded/no-route, start roll.
  - `e2e/rfs-visual.spec.ts:4-29`
- flight loop: ENVA clean climb only.
  - `e2e/rfs-flight.spec.ts:5-21`

Remaining work:

- Add KSEA route/LNAV e2e.
- Add approach/landing/rollout/reset e2e.
- Add responsive layout snapshots.
- Add cockpit interaction e2e.
- Add audio toggle e2e.
- Add gamepad API-injected input path if feasible.

### P2.5 — OSS/governance and docs still need polish

Remaining work:

- Add/decide `LICENSE`.
- Add `SECURITY.md` with disclosure contact/policy.
- Add `CONTRIBUTING.md` and `CODEOWNERS`.
- Add Dependabot/Renovate strategy.
- Update top-level README and architecture wording after current local commits are pushed/deployed; current docs must not imply live equals local HEAD.
- Keep a release checklist that requires: local gates, Actions completed successfully, live curl, live `rfs-version.json` equals intended commit.

Owner-blocked: license/security contact and GitHub admin settings.

## Suggested next execution order

### Batch A — honesty/autoflight truth

1. Build `effectiveAutoflightTruth` and make AP commands use it.
2. Add unbacked-mode no-command tests.
3. Decide VNAV lifecycle authority and expose/commit one shared lifecycle source.
4. Add VNAV capture tests proving FMA and AP law agree.

### Batch B — route/full-flight proof

1. Add KSEA route/LNAV browser proof.
2. Add route sequencing/DTG decrease assertions.
3. Add approach/landing/rollout/reset scenario.
4. Add a deterministic browser proof for approach/landing/rollout.

### Batch C — realism foundations

1. Add spoiler lift-dump and rollout braking proof.
2. Add full force-vector aero projection tests.
3. Add station-by-station main/nose gear contact.
4. Add weather temperature/QNH density-altitude plumbing.
5. Start source-lineaged FDM/performance data replacements.

### Batch D — player UX

1. Fix fixed-overlay collisions/responsive layout.
2. Implement/hide cockpit placeholders.
3. Add live cockpit display strategy.
4. Harmonize flap detents across keyboard/gamepad/cockpit.
5. Expand audio lifecycle and ambience.

### Batch E — release/governance

1. Add CI concurrency and `check:deps`.
2. Add Docker PR smoke and tighter `.dockerignore`.
3. Harden container runtime and rollback verification.
4. Add branch protection/required checks when owner/admin authorizes.
5. Push/deploy only when authorized, then wait for Actions success and verify live metadata.

## Bottom line

RFS is now a serious browser sim prototype with a green local tree, honest clean-climb browser proof, useful PFD/MCP/FMA scaffolding, meaningful ground handling, and real release hardening. The work remaining is no longer “make it do anything”; it is to close the credibility gaps:

- one source of truth for AP/FMA/VNAV,
- RFMS-backed route/mode lifecycle,
- full route/approach/landing proof,
- source-lineaged aircraft/performance realism,
- a more credible cockpit/player UX,
- and production governance that prevents unverified or racing releases.
