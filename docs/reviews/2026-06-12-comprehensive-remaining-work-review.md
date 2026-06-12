# RFS Comprehensive Remaining-Work Review — 2026-06-12

Audit time: 2026-06-12 03:20 CEST  
Repo: `/Users/reidar/Projectos/RFS`  
Branch observed: `master`  
HEAD observed: `b845737` / `b8457378adef5cf2a3e3f6efbf09214b80ecc39b`  
`origin/master` observed: `b845737`  
Ahead/behind observed: `0 0`

## Non-claims

- I did not commit, push, deploy, or change production.
- I did write this review artifact.
- I did not read or print secret files.
- I did not claim CI/live success from memory. The CI and live checks below are from tool output during this audit.
- The working tree was already dirty before this review artifact was written. The review must be read against that dirty local state, not only `HEAD`.

## Current goal

The project goal is not merely to display a 737-looking toy. The target remains a credible, playable, browser-native 737-800 simulator:

1. A player can complete believable flight flows in-browser: configure, take off, hand-fly or use honest automation, climb, navigate, approach, land, taxi/reset.
2. PFD/MCP/FMA/AP/FMS state must be honest: no mode should advertise guidance the simulator is not actually flying.
3. Physics should be aircraft-data-backed and testable: current gameplay-calibrated constants are acceptable scaffolding, but the path forward is source-lineaged data, envelope tests, and explicit realism bounds.
4. The repo should be deployable and publicly presentable as OSS: reproducible checks, reliable CI/deploy, clean docs, and no unverified claims.

## Evidence ledger

### Repo baseline

Observed with `git`:

```text
branch: master
HEAD: b845737
origin/master: b845737
ahead/behind: 0 0
```

Dirty files observed before this report write:

```text
 M docs/architecture.md
 M src/__tests__/App.test.tsx
 M src/sim/data/__tests__/b737-800-data.test.ts
 M src/sim/data/aircraft/b737-800-fdm.v1.ts
 M src/sim/data/aircraft/fdmTypes.ts
 M src/sim/physics/__tests__/aero.test.ts
 M src/sim/physics/aero.ts
 M src/sim/scenarios.ts
 M src/sim/systems/AeroModel.ts
 M src/sim/systems/__tests__/AeroModel.test.ts
 M src/sim/systems/__tests__/electrical.test.ts
 M src/sim/systems/__tests__/engine.test.ts
 M src/sim/systems/__tests__/fuel.test.ts
 M src/sim/systems/__tests__/ground.test.ts
 M src/sim/systems/__tests__/hydraulic.test.ts
 M src/sim/systems/electrical.ts
 M src/sim/systems/engine.ts
 M src/sim/systems/fuel.ts
 M src/sim/systems/ground.ts
 M src/sim/systems/hydraulic.ts
```

Diff stat before this report write:

```text
20 files changed, 556 insertions(+), 57 deletions(-)
```

Approximate repo size excluding `.git`, `node_modules`, build/test artifacts:

```text
total_files=245 total_lines=53255
.md: files=37 lines=23000
.ts: files=156 lines=17479
.json: files=5 lines=6836
.tsx: files=36 lines=5220
```

### Local gates

Node discipline: use Node 22 via `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null`.

`npm run check` passed on the dirty local tree:

```text
CHECK_STATUS=0
Test Files  83 passed (83)
Tests       604 passed (604)
build       passed
```

Build output is now chunked. Biggest chunk observed:

```text
dist/assets/three-BSHc8xfZ.js 512.63 kB │ gzip: 128.90 kB
```

This is under the current accepted 550 kB chunk warning policy in `vite.config.ts:21-30`.

`npm run test:visual` was run twice after ensuring no stale dev server was listening on `:5173`; both runs passed:

```text
VISUAL_STATUS=0
4 passed (46.7s)

VISUAL2_STATUS=0
4 passed (28.7s)
```

Important local-test pitfall found: because `playwright.config.ts:23-30` uses `reuseExistingServer: !process.env.CI`, a manually-started dev server without `VITE_RFS_VISUAL_TEST=1` can make visual tests fail with huge screenshot diffs. Kill the stale server or force CI-like server startup before trusting local visual failures.

### Security/dependency/release checks

`npm audit --audit-level=moderate --json` summary:

```text
vulnerabilities={"info":0,"low":0,"moderate":0,"high":0,"critical":0,"total":0}
dependencies=465
```

Latest observed GitHub Actions runs for `master`:

```text
CI/CD b8457378adef5cf2a3e3f6efbf09214b80ecc39b status=completed conclusion=success
```

Live metadata check:

```json
{
  "name": "rfs",
  "version": "b8457378adef5cf2a3e3f6efbf09214b80ecc39b",
  "commit": "b8457378adef5cf2a3e3f6efbf09214b80ecc39b",
  "imageRef": "ghcr.io/reedtrullz/rfs:sha-b8457378adef5cf2a3e3f6efbf09214b80ecc39b",
  "imageDigest": "unknown"
}
```

Live header sample for `https://fly.reidar.tech/`:

```text
HTTP/2 200
content-type: text/html
server: cloudflare
```

No COOP/COEP headers were observed in that live header sample.

GitHub branch protection check returned:

```text
Branch not protected
```

### Browser dogfood

I started the local app, loaded ENVA, pressed `START ROLL`, set flaps 5, trim 5.0, advanced thrust to 100%, rotated, and retracted gear.

Observed after liftoff/gear-up from browser text and screenshot:

```text
IAS 160 KT
ALT 383 FT
RA 327
VS 2170
N1 ACT L/R 100.0%
FLAPS ACT/CMD 5°
GEAR ACT/CMD UP
Coach: Climb stable. Keep pitch changes small and follow the next tutorial step.
Route: NO ROUTE / LNAV unavailable: no flight plan loaded
```

No browser console errors were observed at load time.

Qualitative browser finding: ENVA takeoff is now genuinely playable enough to demonstrate the core loop. The scene, PFD, MCP, checklist, route status, engine strip, keyboard controls, and guidance work together. Remaining issues are no longer “does this move?”; they are “does this remain believable through full flight, automation, edge cases, and release workflows?”

## What appears materially improved since the 2026-06-07 audit

The older deep audit remains useful historically, but several high-risk items appear remediated in the current dirty tree:

1. Scenario-aware route loading exists. `createDefaultFlightForScenario()` returns a KSEA route only for KSEA and returns `null` otherwise (`src/sim/flightPlanLoader.ts:46-52`). ENVA `LOAD PLAN` now results in `NO ROUTE`, not a hardcoded KSEA/KPDX route.
2. Route/scenario mismatch is guarded. `computeRouteStatus()` rejects routes too far from the current aircraft position (`src/sim/systems/navigation.ts:336-343`).
3. LOAD PLAN AP defaults are gated. `shouldApplyLoadedRouteAutopilotDefaults()` requires route compatibility, stopped status, and PARKED phase (`src/App.tsx:74-76`), and `LOAD PLAN` returns early if no flight plan is available (`src/App.tsx:355-366`).
4. START ROLL tutorial wording now matches the user-preferred zeroing behavior. ENVA says START ROLL resets levers and tells the pilot to set flaps 5 / trim 5.0 manually (`src/sim/scenarios.ts:61-65`), while `startTakeoffRoll()` zeros flap/trim config (`src/store/simStore.ts:401-407`).
5. Visual tests are now deterministic when run in their intended environment. They passed twice after killing stale local Vite.
6. Release hardening has advanced: pinned actions/RFMS, immutable SHA image refs, gitleaks, public version checks, digest-pinned Docker bases, and a `check:release` script exist (`.github/workflows/ci.yml:8-57`, `:84-113`, `:130-206`; `Dockerfile:1-29`; `scripts/release-hardening-check.mjs:25-87`).
7. COOP/COEP posture is aligned. `nginx.conf` no longer sets those headers (`nginx.conf:1-14`), Vite documents why not (`vite.config.ts:15-20`), and docs tests enforce that posture (`src/config/__tests__/docsPosture.test.ts:6-18`).
8. FDM/data migration has started. The B737 FDM shell includes lineage and explicit non-certified/gameplay-calibrated notes (`src/sim/data/aircraft/b737-800-fdm.v1.ts:31-49`), and `B737_AERO` is now exported from FDM data (`src/sim/systems/AeroModel.ts:1-65`).
9. Engine Mach/lapse now uses air-relative velocity with wind (`src/sim/systems/engine.ts:13-17`, `:43-51`).
10. Same-tick config/aero lag appears fixed: `applyPilotConfiguration()` runs before engine/aero inside `integrate()` (`src/sim/physics/integrate.ts:61-84`).
11. GPWS now uses AGL/ground state and weight-on-wheels gates (`src/audio/GPWS.ts:15-24`, `:27-63`).
12. Cockpit pointer plumbing exists for click interactions (`src/viewport/CockpitLayer.tsx:35-40`; `src/viewport/cockpitPointerInteractions.ts:52-71`), though yoke/MCP manipulation remains placeholder.

## Remaining work, prioritized

### P0 — Close the current dirty batch honestly

Status: local checks are green, but 20 source/doc files are still uncommitted/unpushed. Until this is reviewed, committed, pushed, CI-completed, and live-verified if deployed, it is not “done” by this project’s standard.

Evidence:

- Dirty tree is 20 modified files / 556 insertions / 57 deletions.
- Local `npm run check` passed: 83 files / 604 tests.
- Local `npm run test:visual` passed twice after environment cleanup.
- Latest CI/live success is for clean `HEAD` `b845737`, not the dirty local modifications.

Recommended closeout:

1. Review the dirty diff for accidental broad changes.
2. Run `npm run check` and `npm run test:visual` from a clean visual-test environment.
3. Commit/push only if the diff matches intent.
4. Wait for GitHub Actions `status=completed`, `conclusion=success`.
5. If deployed, verify `https://fly.reidar.tech/rfs-version.json` matches the pushed commit before claiming live success.

### P0 — Replace gameplay-calibrated placeholder FDM with source-lineaged data slices

The current FDM boundary is a strong step, but the simulator is still openly using placeholder/gameplay-calibrated values.

Evidence:

- `src/sim/data/aircraft/b737-800-fdm.v1.ts:31-49` identifies current FDM values as gameplay-calibrated placeholders, low confidence, not certified Boeing data.
- `docs/architecture.md:186-190` still lists audited coefficient tables and broader trim/response validation as future work.
- `docs/roadmap.md:148-172` still calls out flight-model data quality: validated aero/engine/ground data, trim cards, stall, cruise, coordinated turn, engine lapse.
- Performance cards are explicitly gameplay baseline cards, not AFM tables (`src/sim/data/performance/b737PerformanceCards.ts:68-79`, `:102-113`, `:136-147`).
- Trim fixtures contain one clean 220 kt / 10,000 ft case (`src/sim/data/performance/b737TrimFixtures.ts:23-43`).

Remaining concrete work:

1. Define a coefficient-change protocol: every coefficient/table needs units, source kind, confidence, and a regression target.
2. Expand fixture helpers into a proper FDM test harness, not just `applyIasFlightCondition()` (`src/sim/physics/__tests__/fdmFixtureHelpers.ts:7-52`).
3. Add more trim fixtures: climb, cruise, descent, approach, landing config, forward/aft CG, light/heavy weights.
4. Add more envelope tests: coordinated turns, climb schedule, descent/approach energy, engine lapse, stall speed by config and weight.
5. Only after tests exist, tune coefficient tables in the FDM data rather than hiding tuning in generic physics.

Autonomous vs blocked:

- Autonomous: test harness, source metadata structure, fixture expansion, broad public-reference/gameplay-guard envelopes.
- Blocked/needs owner/domain decision: exact Boeing certification-level data, source policy for manuals, and any claim of real training/dispatch fidelity.

### P0 — AP/FMA/VNAV truth must be made authoritative end-to-end

Current route and FMA gating are much better, but there are still mismatches between displayed mode truth, AP target derivation, and player-facing controls.

Evidence:

- `computeVNAV()` returns a lifecycle mode (`VNAV`, `VNAV_PTH`, `ALT*`, `ALT_HOLD`) (`src/sim/systems/vnav.ts:81-119`).
- Display FMA derives VNAV mode from route status (`src/sim/systems/fmaTruth.ts:90-132`).
- AP target derivation computes VNAV targets but does not feed the derived lifecycle mode back into authoritative AP state (`src/sim/systems/autopilot.ts:159-175`).
- AP command law still branches on raw `ap.truth.verticalActive` (`src/sim/systems/autopilot.ts:245-249`).
- `simStore.tick()` commits aircraft/controls/route/guidance but not an authoritative VNAV lifecycle update to `apState` (`src/store/simStore.ts:303-389`).
- MCP has HDG/LNAV/ALT/VS/SPD/N1/OFF, but no player-facing VNAV or LVL CHG controls (`src/instruments/RfsMCP.tsx:42-43`, `:260-289`).
- `deriveThrustMode()` and `deriveVerticalMode()` still pass through unsupported raw modes in some fallthrough paths (`src/sim/systems/fmaTruth.ts:59-64`, `:105-111`).

Remaining concrete work:

1. Create one authoritative `NavOutput` builder from `RouteStatusSnapshot`; use it in both AP control and FMA display.
2. Decide whether VNAV lifecycle updates `apState.truth` each tick or is carried as a derived AP/FMA context object.
3. Make AP command law, FMA display, and MCP active lights use the same derived truth source.
4. Add unsupported-mode downgrades for RFMS/Airbus/foreign modes that RFS does not fly yet.
5. Add VNAV and LVL CHG controls only when control laws and availability gates are implemented.
6. Add RFMS-backed route edit lifecycle: active vs pending route, EXEC/cancel, direct-to, leg sequencing, discontinuities.

Autonomous vs blocked:

- Autonomous: truth derivation refactor, VNAV distance-source parity, unsupported-mode degradation tests.
- Needs product/API decision: how strict RFMS integration should be, and whether RFS owns a temporary route model or delegates more state to RFMS shared.

### P0 — Full-flight playability is not proven yet

The ENVA takeoff loop is playable. The full simulator goal requires more than takeoff.

Evidence:

- Browser dogfood reached a stable ENVA climb: IAS 160, ALT 383 ft, VS 2170, gear up.
- Current e2e visual tests cover initial, cockpit, route-loaded, and start-roll states only (`e2e/rfs-visual.spec.ts:4-29`). They do not fly a full takeoff, climb, route leg, approach, landing, taxi, or reset.
- Roadmap still says full product polish and dogfood remain required (`docs/roadmap.md:186-202`).

Observed UX gaps during dogfood:

1. After gear-up, the left checklist still includes “Gear down” as an unchecked item while coach says climb stable. That checklist appears pre-takeoff-specific but persists into climb.
2. Tutorial remains on “Line up and configure” / step 1 while the flight has already lifted off.
3. No route is loaded for ENVA, so the default training loop is takeoff-only unless the user switches scenario.
4. The UI is dense and fixed-positioned; usable on desktop, but not yet polished as a flight-deck training experience.

Remaining concrete work:

1. Add a full ENVA takeoff e2e: start roll, configure, rotate, positive rate, gear up, stable climb, checklist/tutorial step transition.
2. Add KSEA route e2e: load compatible route, safe AP mode engagement, LNAV tracking, leg sequencing.
3. Add approach/landing scenario e2e: gear/flaps, GPWS sanity, touchdown, rollout, reset.
4. Split checklist state by phase so pre-takeoff items do not become misleading after cleanup.
5. Add browser dogfood reports to release closeout, not only screenshot tests.

### P1 — Browser Worker/performance migration remains scaffolded, not real runtime isolation

Evidence:

- Architecture explicitly says active runtime still uses main-thread physics and no default-on browser Worker (`docs/architecture.md:187`).
- Worker config defaults to disabled (`src/config/workerPhysics.ts:1-31`).
- `simulationRuntime.ts` has a main-thread runtime and a worker-handler parity adapter, not an instantiated browser Worker lifecycle (`src/sim/simulationRuntime.ts:12-57`).
- `useSimLoop()` still drives `tick()` with `requestAnimationFrame` on the main thread (`src/hooks/useSimLoop.ts:7-12`).

Remaining concrete work:

1. Add a real browser Worker lifecycle behind `VITE_RFS_WORKER_PHYSICS=1`.
2. Keep plain structured-clone messaging first; do not introduce SharedArrayBuffer/COOP/COEP until scenery policy changes.
3. Add worker startup/error/termination tests and browser smoke.
4. Measure fixed-step cost and clone overhead before default-on migration.
5. Keep main-thread runtime as rollback until parity and dogfood are green.

### P1 — Cockpit/interior needs credible manipulation, not just click toggles

Evidence:

- Cockpit interaction metadata includes yoke and MCP placeholders (`src/viewport/cockpitInteractions.ts:24-67`).
- `cockpitInputForInteraction()` returns `null` for yoke and MCP (`src/viewport/cockpitInteractions.ts:77-96`).
- Pointer raycast activation exists (`src/viewport/cockpitPointerInteractions.ts:52-71`), and `CockpitLayer` installs it (`src/viewport/CockpitLayer.tsx:35-40`).

Remaining concrete work:

1. Implement drag manipulation for yoke axes, throttle levers, speedbrake, and flap lever, or label them clearly as non-manipulable.
2. Implement MCP sub-target picking or keep MCP as UI overlay only; do not imply the 3D MCP works if it does not.
3. Add cockpit visual affordances: hover highlight, cursor, tooltip/status, and input feedback.
4. Add browser tests for at least throttle/flaps/gear/speedbrake cockpit picking.

### P1 — Route/FMS data is synthetic and shallow

Evidence:

- Airport and waypoint coordinates in `flightPlanLoader.ts` are synthetic (`src/sim/flightPlanLoader.ts:4-8`, `:31-43`).
- ENVA has no default route (`src/sim/flightPlanLoader.ts:46-52`).
- Route display is improved to 1-based leg numbering (`src/components/RouteStatus.tsx:72-78`), but route content is still canned.

Remaining concrete work:

1. Decide route source strategy: RFMS imports, local canned training routes, or public navdata subset.
2. Add ENVA training route or explicitly market ENVA as takeoff-only.
3. Add route editor lifecycle once RFMS boundary is clear.
4. Add origin/runway/heading compatibility and “why unavailable” UX for every route-load failure.

### P1 — Ground/terrain/airport surface realism is still narrow

Evidence:

- Architecture says remaining gaps include deeper ground-handling tuning, broader terrain mesh collision, additional airports, and richer airport surface coverage outside prepared rectangles (`docs/architecture.md:186`).
- Ground model is strong for the current runway envelope, but airport/runway support is still handcrafted.

Remaining concrete work:

1. Expand supported airport/runway data beyond ENVA/KSEA/KPDX training rectangles.
2. Add taxiway/apron/grass/water/terrain surface classification policy.
3. Add crosswind landing/rollout dogfood beyond unit tests.
4. Add crash/recovery/reset UX for runway excursions and gear-up events.

Blocked/needs decision:

- Terrain mesh collision source and performance design.
- Airport geometry data source/licensing.

### P1 — Release governance is better, but not complete

Evidence:

- CI pins actions and runs secret scan/test/build/visual (`.github/workflows/ci.yml:8-57`).
- Publish creates immutable SHA image and latest tag (`.github/workflows/ci.yml:84-113`).
- Deploy does canary, public health, and public version verification (`.github/workflows/ci.yml:130-206`).
- Branch protection is not enabled: GitHub API returned “Branch not protected”.
- Docker live metadata still reports `imageDigest: "unknown"`, even though image ref is immutable.

Remaining concrete work:

1. Enable branch protection and required checks for `master`.
2. Add workflow concurrency so two master pushes cannot deploy/rollback over each other.
3. Make rollback fail loudly if previous production cannot restart, and verify rollback health.
4. Record the GHCR image digest in deployed metadata instead of `unknown`.
5. Add PR-time Docker build/container smoke, not only post-merge publish.
6. Harden runtime container flags: read-only filesystem, tmpfs for nginx writable paths, drop caps, no-new-privileges.
7. Expand `.dockerignore` so build context does not include unnecessary repo/admin material.

Blocked/needs owner/admin:

- GitHub branch protection and environment approvals.
- Real rollback drill against the VPS.

### P1 — Product/OSS presentation remains incomplete

Evidence:

- The project has strong README/docs, but static file search in the release audit did not find standard governance files such as `LICENSE`, `SECURITY.md`, `CONTRIBUTING.md`, or code-of-conduct templates.
- `docs/roadmap.md:186-193` still lists loading/error/scenery screens, PWA completeness, cockpit/interior, and audio immersion as product polish.
- There is no visible service worker/PWA registration in `src` from static search.

Remaining concrete work:

1. Decide and add a license.
2. Add `SECURITY.md`, `CONTRIBUTING.md`, issue/PR templates, and a concise project status/fidelity disclaimer.
3. Add PWA manifest link, icons, installability choice, and service-worker/cache strategy if offline mode is desired.
4. Add public screenshots/GIFs generated from the verified visual/browser flows.
5. Keep claims precise: “browser-native playable training sim prototype” unless/ until data fidelity supports stronger wording.

Blocked/needs owner decision:

- License choice.
- Security contact/disclosure policy.
- Whether PWA/offline is a product goal or deferrable.

### P2 — Audio/weather/visual immersion needs another fidelity pass

Evidence:

- Architecture says richer engine/cockpit/airframe sound layers remain future work (`docs/architecture.md:190`).
- Weather roadmap says cloud/visibility rendering tied to parsed METAR layers and QNH/temperature effects remain (`docs/roadmap.md:174-184`).
- Browser dogfood shows usable terrain/scenery, but the flight-deck visual remains an overlay-heavy desktop layout rather than an immersive cockpit.

Remaining concrete work:

1. Add engine spool, wind, runway roll, flap/gear, overspeed/stall, and cockpit ambience layers.
2. Keep GPWS/callouts inside a deterministic app audio engine rather than raw speech side effects where possible.
3. Tie METAR layers to visibility/cloud rendering and density-altitude effects.
4. Add scenery status/loading/error UI that explains degraded Cesium mode or missing token.
5. Add responsive/mobile/tablet policy: either support it or explicitly desktop-only.

### P2 — Documentation is improved but still drifts around “current source of truth”

Evidence:

- `docs/plans/README.md:5-13` still names older 2026-05-26 review/plan artifacts as current source of truth.
- `docs/roadmap.md:195-202` references “Immediate follow-ups from the 2026-05-26 dogfood” even though the 2026-06-07 audit and this 2026-06-12 review supersede parts of it.
- `docs/architecture.md:170-179` still describes publish as `ghcr.io/reedtrullz/rfs:latest` in the high-level pipeline even though deploy now uses immutable SHA refs.

Remaining concrete work:

1. Update docs index/source-of-truth pointers to include this review and the 2026-06-07 audit as historical/current appropriately.
2. Update architecture deploy diagram to show both `latest` publication and SHA deployment, emphasizing SHA is used for prod.
3. Mark completed plan items in the 2026-06-02 FDM plan or write a new current FDM-next-slice plan using actual file names (`b737-800-fdm.v1.ts`, `fdmTypes.ts`).
4. Add a “claim checklist” doc: local gates, visual gates, CI wait, live version curl.

## Blocked or owner-directed work

These are real remaining work items, but not safe to treat as unattended agent tasks:

| Work | Why blocked / owner-directed |
|---|---|
| Exact/certified B737 aerodynamic and performance data | Needs source policy, licensing/terms review, and likely domain review. |
| Strong “training-grade” or “certification-like” fidelity claims | Must wait for source-backed tables and envelope validation. |
| RFMS ownership boundary for FMC state and route modifications | Needs product/API decision across RFS and RFMS. |
| Branch protection, required checks, environment approval | Requires GitHub admin settings. |
| Production deploy/rollback drills | Requires explicit deploy authorization and live infrastructure access. |
| License/security contact/governance policy | Owner decision. |
| Physical gamepad/audio validation | Needs actual target devices and user testing. |
| Terrain mesh collision / airport geometry data | Needs data source, licensing, and performance policy. |

## Recommended next autonomous execution batches

### Batch 1 — Release closeout for the dirty tree

Goal: make the current local improvements real without overclaiming.

1. Inspect the 20-file dirty diff.
2. Run `npm run check`.
3. Ensure no stale Vite server on `:5173`; run `npm run test:visual` twice.
4. Commit/push if approved.
5. Wait for CI completed/success.
6. If deployed, curl `https://fly.reidar.tech/rfs-version.json` and verify the exact commit.

### Batch 2 — FDM test/data harness

Goal: move from placeholder FDM to testable data slices.

1. Add fixture helper tests for IAS/TAS, AoA/beta, weight/CG/config, near-equilibrium setup.
2. Add more trim fixtures and performance cards with explicit source notes.
3. Add coordinated-turn and climb/cruise/approach smoke tests.
4. Only then tune FDM coefficients.

### Batch 3 — AP/FMA/VNAV truth unification

Goal: one source of truth for what the airplane is actually flying.

1. Extract route-status-to-nav-output helper.
2. Use it in AP and FMA.
3. Add authoritative VNAV lifecycle handling.
4. Add unsupported-mode degradation tests.
5. Add VNAV/LVL CHG UI only after law and display parity exist.

### Batch 4 — Full-flight dogfood/e2e

Goal: prove a meaningful pilot loop, not just screenshots.

1. ENVA takeoff-to-stable-climb e2e.
2. KSEA route/LNAV e2e.
3. Approach/landing/rollout/reset e2e.
4. Browser dogfood report template with exact observations and screenshots.

### Batch 5 — Product/public polish

Goal: make the project easier to trust and evaluate.

1. Docs truth cleanup.
2. OSS governance files after owner decisions.
3. PWA/installability choice.
4. Screenshots/GIFs from verified flows.
5. Container/deploy hardening refinements.

## Short answer: what remains?

RFS has crossed the threshold from “foundation/demo” into “playable prototype with credible architecture.” The remaining work is now mostly about raising truth and fidelity:

1. Close the current dirty batch with CI/live honesty.
2. Replace placeholder FDM constants with source-lineaged, test-backed data.
3. Make AP/FMA/VNAV/RFMS state authoritative and player-facing.
4. Prove full-flight playability, not just takeoff and screenshots.
5. Upgrade cockpit, route/FMS, terrain/airport, audio/weather, and product governance to match the project’s professional/public ambition.