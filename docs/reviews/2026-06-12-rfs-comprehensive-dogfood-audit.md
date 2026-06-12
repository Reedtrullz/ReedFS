# RFS Comprehensive Dogfood + Deep Review Report

Target: local RFS app at `http://127.0.0.1:5173/` plus repository/release posture
Date: 2026-06-12
Scope: entire current app surface — initial load, ENVA/KSEA scenarios, takeoff controls, route/AP/MCP/FMA, save/load, camera/overlay/audio controls, screenshots/responsive passes, console events, source architecture, tests, CI/deploy/security/docs/OSS readiness.
Tester: Hermes Agent, dogfood skill workflow + read-only specialist audits + local gates.

Report artifacts:
- Dogfood report: `/Users/reidar/Projectos/RFS/dogfood-output/2026-06-12-rfs-comprehensive-review/report.md`
- Repo review copy: `/Users/reidar/Projectos/RFS/docs/reviews/2026-06-12-rfs-comprehensive-dogfood-audit.md`
- Browser state capture: `/Users/reidar/Projectos/RFS/dogfood-output/2026-06-12-rfs-comprehensive-review/browser-states.json`
- Browser console/event capture: `/Users/reidar/Projectos/RFS/dogfood-output/2026-06-12-rfs-comprehensive-review/browser-events.json`
- Screenshots directory: `/Users/reidar/Projectos/RFS/dogfood-output/2026-06-12-rfs-comprehensive-review/screenshots`

## Executive summary

| Severity | Count |
|---|---:|
| Critical | 2 |
| High | 22 |
| Medium | 26 |
| Low | 5 |
| Total | 55 |

Overall assessment: RFS is locally buildable/testable and the browser app runs, but the review found major remaining truth/playability, accessibility/product, architecture/performance, and release-governance gaps. The most important blockers are: local code is not shipped or CI/live-proven, branch/deploy protections are incomplete, positive-rate/gear-up and LOAD PLAN/AP semantics can mislead the player, VNAV is not reachable/provable, the debug/product overlay layout is not production-ready, and the flight model remains gameplay-calibrated rather than source-lineaged.

## Evidence ledger

Local verification actually run in this review:
- `npm run check`: passed. Evidence: 84 Vitest files passed, 630 tests passed, production build passed. Existing warning: React ESLint settings warning; jsdom canvas getContext notices during unit tests.
- `CI=1 npm run test:visual`: passed, 17 Playwright visual/browser tests.
- Browser dogfood script: captured 16 state snapshots and 13 screenshots across initial ENVA, ENVA manual roll/gear command, ENVA LOAD PLAN no-op, KSEA LOAD PLAN, overlay modes, audio, save/load, camera modes, and 1024/1440/1920 responsive screenshots.
- Console/event capture: Vite/React dev messages plus repeated WebGL ReadPixels stall warnings; no app crash was observed during the scripted local dogfood pass.
- Live/local check: local HEAD `fc1f88ecce19dd8e421161d56615080af35a44b4`; `origin/master` and live `/rfs-version.json` stayed at `b8457378adef5cf2a3e3f6efbf09214b80ecc39b`; local branch is ahead by 70 commits.

Important non-claims:
- I did not push.
- I did not deploy.
- I did not verify GitHub Actions for local HEAD.
- I did not claim live production contains the reviewed local code. It does not; live is stale relative to local.
- I did not claim a full-flight, full-route, route-coupled landing, VNAV lifecycle, ILS/LOC/GS, or data-backed 737 FDM proof.

## High-priority next task batches

1. P0 truth/playability: shared positive-rate predicate; gear-up gating; scenario-card VR in guidance; ENVA LOAD PLAN feedback/route; parked LOAD PLAN route-vs-AP semantics.
2. P0 AP/FMS proof: route UI Playwright proof through actual controls; VNAV MCP button + constrained KSEA→KPDX route; route completion state; IAS-based SPEED mode.
3. P1 browser product/accessibility: semantic page structure; MCP aria-pressed; overlay layout manager; responsive HUD; cockpit-placeholder cleanup.
4. P1 flight-model realism: source-lineaged FDM tables; spoiler lift dump; gear/flap transit; tighter climb/crosswind/landing envelopes; explicit rollout/taxi states.
5. P1 release readiness: push/CI/live exact-SHA discipline when authorized; branch protection; deploy concurrency; CI `npm run check`; PR Docker smoke; rollback verification; image digest metadata; container/security headers; OSS governance.
6. P2 architecture/performance: worker runtime, store/App decomposition, centralized RAF scheduling, memoized instrument snapshots, AP controller state inside runtime.

## Issues summary table

| # | Title | Severity | Category |
|---|---|---|---|
| RFS-001 | Local HEAD is not pushed, CI-proven, or live-deployed | Critical | Release |
| RFS-002 | No branch protection and no deploy concurrency guard | Critical | Release |
| RFS-003 | Positive-rate/gear-up guidance does not require a positive vertical rate | High | Functional / Flight model |
| RFS-004 | Rotation guidance hardcodes 135 kt instead of scenario VR | High | Functional / Flight model |
| RFS-005 | KSEA LOAD PLAN auto-engages CMD_A/LNAV/ALT_HOLD/SPEED while parked | High | Functional / Autoflight |
| RFS-006 | START ROLL clears the AP truth created by LOAD PLAN | High | Functional / Autoflight |
| RFS-007 | ENVA LOAD PLAN is a silent no-op | High | UX / Functional |
| RFS-008 | VNAV logic exists but is unreachable from the UI | High | Functional / Autoflight |
| RFS-009 | Default KSEA route has no VNAV constraints | High | Functional / FMS |
| RFS-010 | Route browser proof bypasses the real LOAD PLAN/START ROLL/MCP UI | High | Testing / Functional |
| RFS-011 | The app has no semantic headings or page structure | High | Accessibility |
| RFS-012 | MCP mode buttons lack active-state ARIA | High | Accessibility |
| RFS-013 | DEBUG overlay panels overlap primary instruments and controls | High | Visual / UX |
| RFS-014 | Cesium commercial watermark is visible throughout the app | High | Visual / Product |
| RFS-015 | WebGL ReadPixels GPU-stall warnings and low debug FPS observed | High | Performance / Console |
| RFS-016 | Worker-physics plumbing exists but is not production-connected | High | Architecture / Performance |
| RFS-017 | App.tsx is an orchestration god-object | High | Architecture |
| RFS-018 | simStore mixes runtime, AP, route, weather, persistence, and UI side effects | High | Architecture |
| RFS-019 | Repository is not self-contained because it depends on sibling RFMS checkout | High | OSS / Build |
| RFS-020 | CI omits the full local release gate | High | CI |
| RFS-021 | PR CI does not build or smoke-test the Docker image that is deployed | High | CI / Deploy |
| RFS-022 | Rollback can fail silently and lacks health/version verification | High | Deploy |
| RFS-023 | Release metadata records `imageDigest: unknown` | High | Release provenance |
| RFS-024 | Runtime container is not hardened | High | Security / Deploy |
| RFS-025 | Spoilers add drag but do not dump lift or increase wheel loading | Medium | Flight model |
| RFS-026 | Initial climb envelope still allows rocket-like behavior | Medium | Flight model / UX |
| RFS-027 | FDM data is explicitly placeholder/gameplay-calibrated | Medium | Flight model / Data |
| RFS-028 | Gear and flaps have no transit model | Medium | Systems |
| RFS-029 | Landing phase collapses directly to LANDED on touchdown | Medium | Systems / Landing |
| RFS-030 | Ground contact uses flat runway rectangles and nearest-runway fallback, not real terrain/airport surfaces | Medium | World / Physics |
| RFS-031 | Crosswind takeoff test allows leaving the runway by a large margin | Medium | Testing / Ground handling |
| RFS-032 | ENVA default takeoff path is not covered by the main performance-envelope profiles | Medium | Testing / Flight model |
| RFS-033 | Landing proof lacks VREF, glidepath, flare, touchdown-zone, and stopping-distance envelope | Medium | Testing / Landing |
| RFS-034 | Tire/brake/runway-condition constants are gameplay values | Medium | Ground model |
| RFS-035 | Route completion never transitions out of the final leg | Medium | FMS |
| RFS-036 | First MCP target capture uses arbitrary defaults | Medium | Autoflight / UX |
| RFS-037 | Flight director bars only support HDG_SEL and ALT_HOLD | Medium | Autoflight / PFD |
| RFS-038 | SPEED mode controls body/TAS-like speed while PFD/MCP present IAS | Medium | Autoflight / Physics |
| RFS-039 | HUD uses fixed pixel positioning and overflow-hidden viewport | Medium | Responsive / Visual |
| RFS-040 | 3D cockpit interactions are partial placeholders with little discoverability | Medium | Cockpit / UX |
| RFS-041 | Gear can be commanded UP on the runway despite “after positive rate” guidance | Medium | UX / Systems |
| RFS-042 | Weather fetch is hard-coded to KSEA while default scenario is ENVA | Medium | Weather / Product |
| RFS-043 | Multiple independent RAF loops poll or mutate state | Medium | Performance / Architecture |
| RFS-044 | Instrument selectors recompute derived flight data many times per frame | Medium | Performance / React |
| RFS-045 | Autopilot controller state is hidden module-level mutable state | Medium | Architecture / Testing |
| RFS-046 | App test remains broad and async/mock brittle | Medium | Testing |
| RFS-047 | Baseline HTTP security headers are missing | Medium | Security |
| RFS-048 | Open-source governance files/package metadata are missing | Medium | OSS |
| RFS-049 | No dependency update automation is configured | Medium | Maintenance |
| RFS-050 | Deployment docs still lean on mutable latest wording | Medium | Docs / Release |
| RFS-051 | Save/load is one unnamed global slot with little context | Low | UX |
| RFS-052 | CAM/OVL/AUDIO mode buttons lack toggle semantics/announcements | Low | Accessibility |
| RFS-053 | jsdom canvas warnings add noise and one canvas path has uneven null handling | Low | Testing |
| RFS-054 | Cloud visuals can be nondeterministic if METAR clouds are enabled | Low | Testing / Visual |
| RFS-055 | ESLint emits React-version settings warning | Low | Tooling |

## Detailed findings and next tasks

### RFS-001: Local HEAD is not pushed, CI-proven, or live-deployed

| Field | Value |
|---|---|
| Severity | Critical |
| Category | Release |
| URL/surface | Local app `http://127.0.0.1:5173/`, source tree, docs, and release metadata as applicable |

Evidence: `git rev-parse HEAD` = `fc1f88ecce19dd8e421161d56615080af35a44b4`; `origin/master` and live `/rfs-version.json` = `b8457378adef5cf2a3e3f6efbf09214b80ecc39b`; branch is ahead 70.

Impact: This blocks or weakens the project goal of a truthful, playable, releaseable browser-native 737-800 simulator.

Next task: When authorized: push, wait for GitHub Actions completed/success on the exact SHA, then verify live `/rfs-version.json` equals the intended SHA.

### RFS-002: No branch protection and no deploy concurrency guard

| Field | Value |
|---|---|
| Severity | Critical |
| Category | Release |
| URL/surface | Local app `http://127.0.0.1:5173/`, source tree, docs, and release metadata as applicable |

Evidence: GitHub branch protection query returned no rules; `.github/workflows/ci.yml` has no top-level `concurrency:`.

Impact: This blocks or weakens the project goal of a truthful, playable, releaseable browser-native 737-800 simulator.

Next task: Enable master branch protection with required checks and add workflow concurrency for master deploys.

### RFS-003: Positive-rate/gear-up guidance does not require a positive vertical rate

| Field | Value |
|---|---|
| Severity | High |
| Category | Functional / Flight model |
| URL/surface | Local app `http://127.0.0.1:5173/`, source tree, docs, and release metadata as applicable |

Evidence: `src/sim/takeoffCue.ts:20-31`, `src/sim/guidanceState.ts:67-70`, and `src/sim/checklistCoach.ts:135-144` use airborne/AGL/gear state; stricter vertical-rate logic exists only in `src/sim/physics/integrate.ts:28-33`. Dogfood also observed gear-up command at alt 56 ft / RA 0.

Impact: This blocks or weakens the project goal of a truthful, playable, releaseable browser-native 737-800 simulator.

Next task: Create shared `isPositiveRate(state)` using !WoW, AGL, and NED down/vertical speed, then wire takeoff cue, guidance phase, checklist, and gear-up gating tests.

### RFS-004: Rotation guidance hardcodes 135 kt instead of scenario VR

| Field | Value |
|---|---|
| Severity | High |
| Category | Functional / Flight model |
| URL/surface | Local app `http://127.0.0.1:5173/`, source tree, docs, and release metadata as applicable |

Evidence: `src/sim/guidanceState.ts:47-49` hardcodes `ROTATION_SPEED_KT = 135`, while PFD/cue cards use VR 149 for ENVA/KSEA in `src/sim/data/performance/b737PerformanceCards.ts:54,88`.

Impact: This blocks or weakens the project goal of a truthful, playable, releaseable browser-native 737-800 simulator.

Next task: Pass the scenario performance-card VR into guidance phase derivation and prove ENVA/KSEA/light/heavy rotation timing in tests.

### RFS-005: KSEA LOAD PLAN auto-engages CMD_A/LNAV/ALT_HOLD/SPEED while parked

| Field | Value |
|---|---|
| Severity | High |
| Category | Functional / Autoflight |
| URL/surface | Local app `http://127.0.0.1:5173/`, source tree, docs, and release metadata as applicable |

Evidence: Browser evidence `browser-states.json` label `ksea-load-plan-stopped`: flightPlanLoaded true and AP truth `CMD_A/LNAV/ALT_HOLD/SPEED` while status stopped/PARKED; code path `src/App.tsx:355-365`. Screenshot: `/Users/reidar/Projectos/RFS/dogfood-output/2026-06-12-rfs-comprehensive-review/screenshots/05-ksea-load-plan-stopped.png`.

Impact: This blocks or weakens the project goal of a truthful, playable, releaseable browser-native 737-800 simulator.

Next task: Make LOAD PLAN route-only, or add explicit “armed but not engaged” semantics; browser-test parked KSEA LOAD PLAN FMA/AP truth.

### RFS-006: START ROLL clears the AP truth created by LOAD PLAN

| Field | Value |
|---|---|
| Severity | High |
| Category | Functional / Autoflight |
| URL/surface | Local app `http://127.0.0.1:5173/`, source tree, docs, and release metadata as applicable |

Evidence: `src/store/simStore.ts:436-464` sets `apState: null` in `startTakeoffRoll()`, so the pre-start LOAD PLAN AP truth is not part of the actual takeoff flow.

Impact: This blocks or weakens the project goal of a truthful, playable, releaseable browser-native 737-800 simulator.

Next task: Decide intended KSEA workflow: no AP before start, or preserve explicit armed modes through START ROLL with matching FMA proof.

### RFS-007: ENVA LOAD PLAN is a silent no-op

| Field | Value |
|---|---|
| Severity | High |
| Category | UX / Functional |
| URL/surface | Local app `http://127.0.0.1:5173/`, source tree, docs, and release metadata as applicable |

Evidence: Browser evidence `enva-load-plan-clicked`: flightPlanLoaded false, message null, RouteStatus still NO ROUTE; `src/sim/flightPlanLoader.ts:46-52` returns null for non-KSEA; `src/App.tsx:355-361` returns silently. Screenshot: `/Users/reidar/Projectos/RFS/dogfood-output/2026-06-12-rfs-comprehensive-review/screenshots/04-enva-load-plan-noop.png`.

Impact: This blocks or weakens the project goal of a truthful, playable, releaseable browser-native 737-800 simulator.

Next task: Disable the button with a reason when no route exists, or add an ENVA default route and visible RouteStatus/message feedback.

### RFS-008: VNAV logic exists but is unreachable from the UI

| Field | Value |
|---|---|
| Severity | High |
| Category | Functional / Autoflight |
| URL/surface | Local app `http://127.0.0.1:5173/`, source tree, docs, and release metadata as applicable |

Evidence: `src/instruments/RfsMCP.tsx:43` omits VNAV from enabled MCP modes; vertical buttons at `src/instruments/RfsMCP.tsx:264-277` expose ALT and VS only.

Impact: This blocks or weakens the project goal of a truthful, playable, releaseable browser-native 737-800 simulator.

Next task: Add a VNAV MCP button with availability gating, FMA/PFD truth, and browser proof.

### RFS-009: Default KSEA route has no VNAV constraints

| Field | Value |
|---|---|
| Severity | High |
| Category | Functional / FMS |
| URL/surface | Local app `http://127.0.0.1:5173/`, source tree, docs, and release metadata as applicable |

Evidence: `src/sim/flightPlanLoader.ts:37-42` builds KSEA/OLM/BTG/KPDX without altitude/speed constraints; `src/sim/systems/vnav.ts:99-107` requires actionable constraints.

Impact: This blocks or weakens the project goal of a truthful, playable, releaseable browser-native 737-800 simulator.

Next task: Add realistic altitude/speed constraints or a simple descent profile for KSEA→KPDX, then prove VNAV_PTH/ALT capture.

### RFS-010: Route browser proof bypasses the real LOAD PLAN/START ROLL/MCP UI

| Field | Value |
|---|---|
| Severity | High |
| Category | Testing / Functional |
| URL/surface | Local app `http://127.0.0.1:5173/`, source tree, docs, and release metadata as applicable |

Evidence: `e2e/helpers/rfsRoute.ts:492-583` injects route/AP/aircraft state directly instead of driving buttons and player flow.

Impact: This blocks or weakens the project goal of a truthful, playable, releaseable browser-native 737-800 simulator.

Next task: Add Playwright proof that uses actual UI actions: select scenario, LOAD PLAN, inspect RouteStatus/FMA, START ROLL, MCP interactions.

### RFS-011: The app has no semantic headings or page structure

| Field | Value |
|---|---|
| Severity | High |
| Category | Accessibility |
| URL/surface | Local app `http://127.0.0.1:5173/`, source tree, docs, and release metadata as applicable |

Evidence: Dogfood `browser-states.json` reports h1Count 0 and headingCount 0 across states/viewports; `src/App.tsx:264-374` and panels are mostly div-based.

Impact: This blocks or weakens the project goal of a truthful, playable, releaseable browser-native 737-800 simulator.

Next task: Add `<main>`, section landmarks, one real h1, and h2/h3 panel headings without disrupting canvas overlays.

### RFS-012: MCP mode buttons lack active-state ARIA

| Field | Value |
|---|---|
| Severity | High |
| Category | Accessibility |
| URL/surface | Local app `http://127.0.0.1:5173/`, source tree, docs, and release metadata as applicable |

Evidence: Dogfood mcpButtonAria shows HDG/LNAV/ALT/VS/SPD/N1/OFF `ariaPressed: null`; only FD buttons expose aria-pressed. Code: `src/instruments/RfsMCP.tsx:249-291`.

Impact: This blocks or weakens the project goal of a truthful, playable, releaseable browser-native 737-800 simulator.

Next task: Add `aria-pressed`, descriptive labels/titles, and keyboard/focus tests for all MCP toggle modes.

### RFS-013: DEBUG overlay panels overlap primary instruments and controls

| Field | Value |
|---|---|
| Severity | High |
| Category | Visual / UX |
| URL/surface | Local app `http://127.0.0.1:5173/`, source tree, docs, and release metadata as applicable |

Evidence: Screenshot shows RunwayEditor, Telemetry, ControlsHelp/settings, PFD, MCP, scenario, and RouteStatus competing for the same viewport. Evidence: `/Users/reidar/Projectos/RFS/dogfood-output/2026-06-12-rfs-comprehensive-review/screenshots/07-ksea-debug-overlay-overlap.png`; `src/App.tsx:289-306`; `src/viewport/RunwayEditor.tsx:184-189`; `src/components/RouteStatus.tsx:4-9`.

Impact: This blocks or weakens the project goal of a truthful, playable, releaseable browser-native 737-800 simulator.

Next task: Build an overlay layout manager with reserved regions, collapsible debug panels, and responsive safe zones.

### RFS-014: Cesium commercial watermark is visible throughout the app

| Field | Value |
|---|---|
| Severity | High |
| Category | Visual / Product |
| URL/surface | Local app `http://127.0.0.1:5173/`, source tree, docs, and release metadata as applicable |

Evidence: Dogfood body/screenshot evidence starts with “Upgrade for commercial use.Data attribution” on every captured state; e.g. `/Users/reidar/Projectos/RFS/dogfood-output/2026-06-12-rfs-comprehensive-review/screenshots/01-initial-enva-flight-overlay.png`.

Impact: This blocks or weakens the project goal of a truthful, playable, releaseable browser-native 737-800 simulator.

Next task: Decide product/legal path: commercial Cesium entitlement, compliant attribution placement, or non-commercial/degraded base-layer strategy.

### RFS-015: WebGL ReadPixels GPU-stall warnings and low debug FPS observed

| Field | Value |
|---|---|
| Severity | High |
| Category | Performance / Console |
| URL/surface | Local app `http://127.0.0.1:5173/`, source tree, docs, and release metadata as applicable |

Evidence: `browser-events.json:39-85` logs repeated “GPU stall due to ReadPixels”; debug screenshot/body shows as low as 3 FPS.

Impact: This blocks or weakens the project goal of a truthful, playable, releaseable browser-native 737-800 simulator.

Next task: Profile Cesium/Three screenshot/readback path, avoid ReadPixels in normal frames, and evaluate requestRenderMode/single-renderer strategy.

### RFS-016: Worker-physics plumbing exists but is not production-connected

| Field | Value |
|---|---|
| Severity | High |
| Category | Architecture / Performance |
| URL/surface | Local app `http://127.0.0.1:5173/`, source tree, docs, and release metadata as applicable |

Evidence: `src/config/workerPhysics.ts:1-2` defines the flag; `src/sim/simulationRuntime.ts:42-48` hard-wires main-thread runtime; `src/store/simStore.ts:386-389` calls it every fixed step.

Impact: This blocks or weakens the project goal of a truthful, playable, releaseable browser-native 737-800 simulator.

Next task: Implement actual async Web Worker runtime selected by `isWorkerPhysicsEnabled()`, with fallback and parity/perf tests.

### RFS-017: App.tsx is an orchestration god-object

| Field | Value |
|---|---|
| Severity | High |
| Category | Architecture |
| URL/surface | Local app `http://127.0.0.1:5173/`, source tree, docs, and release metadata as applicable |

Evidence: `src/App.tsx:1-34` imports scene/input/audio/weather/AP/routing/UI; `src/App.tsx:82-187` owns loops/effects; `src/App.tsx:264-373` owns scene and control bar composition.

Impact: This blocks or weakens the project goal of a truthful, playable, releaseable browser-native 737-800 simulator.

Next task: Split into SimulationShell, InputController, WeatherController, SceneLayers, and ControlBar.

### RFS-018: simStore mixes runtime, AP, route, weather, persistence, and UI side effects

| Field | Value |
|---|---|
| Severity | High |
| Category | Architecture |
| URL/surface | Local app `http://127.0.0.1:5173/`, source tree, docs, and release metadata as applicable |

Evidence: `src/store/simStore.ts:54-95` exposes many domains; `src/store/simStore.ts:334-424` sim loop; `src/store/simStore.ts:620-653` localStorage persistence.

Impact: This blocks or weakens the project goal of a truthful, playable, releaseable browser-native 737-800 simulator.

Next task: Split store into typed slices/services: simulation runtime, controls, autoflight, route, scenario persistence.

### RFS-019: Repository is not self-contained because it depends on sibling RFMS checkout

| Field | Value |
|---|---|
| Severity | High |
| Category | OSS / Build |
| URL/surface | Local app `http://127.0.0.1:5173/`, source tree, docs, and release metadata as applicable |

Evidence: `package.json:21` uses `@virtual-cdu/shared: file:../RFMS/shared`; `tsconfig.json:14-15` maps `@shared` there; CI clones RFMS manually in `.github/workflows/ci.yml:35-40`.

Impact: This blocks or weakens the project goal of a truthful, playable, releaseable browser-native 737-800 simulator.

Next task: Publish/version shared package, use submodule/subtree/workspace, or add one-command bootstrap and compatibility pinning.

### RFS-020: CI omits the full local release gate

| Field | Value |
|---|---|
| Severity | High |
| Category | CI |
| URL/surface | Local app `http://127.0.0.1:5173/`, source tree, docs, and release metadata as applicable |

Evidence: `package.json:13-15` defines `check` including `check:deps`; `.github/workflows/ci.yml:46-57` runs pieces but omits `check:deps`.

Impact: This blocks or weakens the project goal of a truthful, playable, releaseable browser-native 737-800 simulator.

Next task: Run `npm run check` in CI or add `npm run check:deps` explicitly.

### RFS-021: PR CI does not build or smoke-test the Docker image that is deployed

| Field | Value |
|---|---|
| Severity | High |
| Category | CI / Deploy |
| URL/surface | Local app `http://127.0.0.1:5173/`, source tree, docs, and release metadata as applicable |

Evidence: Docker publish is master-only at `.github/workflows/ci.yml:59-61`; PR job only npm tests/builds.

Impact: This blocks or weakens the project goal of a truthful, playable, releaseable browser-native 737-800 simulator.

Next task: Add PR-safe Docker build with `push: false`, run container, curl `/` and `/rfs-version.json`.

### RFS-022: Rollback can fail silently and lacks health/version verification

| Field | Value |
|---|---|
| Severity | High |
| Category | Deploy |
| URL/surface | Local app `http://127.0.0.1:5173/`, source tree, docs, and release metadata as applicable |

Evidence: Workflow rollback uses `|| true` at `.github/workflows/ci.yml:143-151`; post-promotion rollback lacks public health/version verification; Ansible rollback similarly starts previous image without live proof.

Impact: This blocks or weakens the project goal of a truthful, playable, releaseable browser-native 737-800 simulator.

Next task: Make rollback failures loud; verify container, public `/`, and public `/rfs-version.json` after rollback.

### RFS-023: Release metadata records `imageDigest: unknown`

| Field | Value |
|---|---|
| Severity | High |
| Category | Release provenance |
| URL/surface | Local app `http://127.0.0.1:5173/`, source tree, docs, and release metadata as applicable |

Evidence: `scripts/write-version-metadata.mjs:14` defaults imageDigest to unknown; workflow build args omit digest; live metadata currently shows unknown.

Impact: This blocks or weakens the project goal of a truthful, playable, releaseable browser-native 737-800 simulator.

Next task: Propagate `steps.build.outputs.digest` into metadata or publish a post-push manifest.

### RFS-024: Runtime container is not hardened

| Field | Value |
|---|---|
| Severity | High |
| Category | Security / Deploy |
| URL/surface | Local app `http://127.0.0.1:5173/`, source tree, docs, and release metadata as applicable |

Evidence: Final Docker image has no `USER`; deploy `docker run` lacks `--read-only`, `--tmpfs`, `--cap-drop`, `--security-opt no-new-privileges`.

Impact: This blocks or weakens the project goal of a truthful, playable, releaseable browser-native 737-800 simulator.

Next task: Add nginx-compatible non-root/read-only/cap-drop hardening and test canary promotion.

### RFS-025: Spoilers add drag but do not dump lift or increase wheel loading

| Field | Value |
|---|---|
| Severity | Medium |
| Category | Flight model |
| URL/surface | Local app `http://127.0.0.1:5173/`, source tree, docs, and release metadata as applicable |

Evidence: `src/sim/physics/aero.ts:149` adds speedBrakeCd only; normal force uses weight minus lift in `src/sim/physics/integrate.ts:47-49`.

Impact: This blocks or weakens the project goal of a truthful, playable, releaseable browser-native 737-800 simulator.

Next task: Add spoiler lift-dump/ground-spoiler coefficients and stopping-distance tests.

### RFS-026: Initial climb envelope still allows rocket-like behavior

| Field | Value |
|---|---|
| Severity | Medium |
| Category | Flight model / UX |
| URL/surface | Local app `http://127.0.0.1:5173/`, source tree, docs, and release metadata as applicable |

Evidence: Dogfood long manual run showed ~25° pitch and ~5798 fpm; existing guard allows gear-down post-rotation VS <6000 fpm while profile target is 800-4000 fpm. Screenshots: `/Users/reidar/Projectos/RFS/dogfood-output/2026-06-12-rfs-comprehensive-review/screenshots/02-enva-climb-before-gear.png`, `/Users/reidar/Projectos/RFS/dogfood-output/2026-06-12-rfs-comprehensive-review/screenshots/03-enva-climb-after-gear.png`.

Impact: This blocks or weakens the project goal of a truthful, playable, releaseable browser-native 737-800 simulator.

Next task: Add long-held manual climb tests/browser assertions for pitch, AoA, IAS, VS; tune elevator/stabilizer/moment tables.

### RFS-027: FDM data is explicitly placeholder/gameplay-calibrated

| Field | Value |
|---|---|
| Severity | Medium |
| Category | Flight model / Data |
| URL/surface | Local app `http://127.0.0.1:5173/`, source tree, docs, and release metadata as applicable |

Evidence: `src/sim/data/aircraft/b737-800-fdm.v1.ts:19-37` labels current FDM low-confidence placeholders; flap polars are B737-ish gameplay values.

Impact: This blocks or weakens the project goal of a truthful, playable, releaseable browser-native 737-800 simulator.

Next task: Replace hidden literals with source-lineaged tables and confidence metadata by subsystem.

### RFS-028: Gear and flaps have no transit model

| Field | Value |
|---|---|
| Severity | Medium |
| Category | Systems |
| URL/surface | Local app `http://127.0.0.1:5173/`, source tree, docs, and release metadata as applicable |

Evidence: `src/sim/types.ts:140-145` has `flapSetting` and boolean `gearDown`; `src/sim/physics/integrate.ts:61-65` applies commands directly; ground contact forces gear down.

Impact: This blocks or weakens the project goal of a truthful, playable, releaseable browser-native 737-800 simulator.

Next task: Split commanded vs actual state, add transit rates/squat-lock behavior, test gear/flap timing.

### RFS-029: Landing phase collapses directly to LANDED on touchdown

| Field | Value |
|---|---|
| Severity | Medium |
| Category | Systems / Landing |
| URL/surface | Local app `http://127.0.0.1:5173/`, source tree, docs, and release metadata as applicable |

Evidence: `FlightPhase` has no rollout phase; `src/sim/physics/integrate.ts:37-44` sets LANDED on gear contact; guidance reconstructs rollout from LANDED+speed.

Impact: This blocks or weakens the project goal of a truthful, playable, releaseable browser-native 737-800 simulator.

Next task: Introduce explicit landing-rollout/stopped/taxi state and tests for touchdown → rollout → stopped.

### RFS-030: Ground contact uses flat runway rectangles and nearest-runway fallback, not real terrain/airport surfaces

| Field | Value |
|---|---|
| Severity | Medium |
| Category | World / Physics |
| URL/surface | Local app `http://127.0.0.1:5173/`, source tree, docs, and release metadata as applicable |

Evidence: `src/sim/runwaySurface.ts:82-105` returns fixed runway elevation; off-runway fallback uses nearest supported runway/elevation.

Impact: This blocks or weakens the project goal of a truthful, playable, releaseable browser-native 737-800 simulator.

Next task: Add airport surface polygons/terrain sampling or explicit unsupported-surface warnings/gates.

### RFS-031: Crosswind takeoff test allows leaving the runway by a large margin

| Field | Value |
|---|---|
| Severity | Medium |
| Category | Testing / Ground handling |
| URL/surface | Local app `http://127.0.0.1:5173/`, source tree, docs, and release metadata as applicable |

Evidence: KSEA 16L width is 46 m; crosswind “bounded” test allows lateral displacement <250 m in `src/sim/physics/__tests__/integrate.test.ts:865-876`.

Impact: This blocks or weakens the project goal of a truthful, playable, releaseable browser-native 737-800 simulator.

Next task: Tighten assertions to runway width/edge or explicit off-runway transition/abort guidance.

### RFS-032: ENVA default takeoff path is not covered by the main performance-envelope profiles

| Field | Value |
|---|---|
| Severity | Medium |
| Category | Testing / Flight model |
| URL/surface | Local app `http://127.0.0.1:5173/`, source tree, docs, and release metadata as applicable |

Evidence: `b737TakeoffProfiles` use KSEA field elevation 432; ENVA has a separate card but envelope tests iterate only profiles.

Impact: This blocks or weakens the project goal of a truthful, playable, releaseable browser-native 737-800 simulator.

Next task: Add ENVA scenario envelope coverage: 20s IAS, VR, liftoff, positive-rate, gear-up, pitch, VS.

### RFS-033: Landing proof lacks VREF, glidepath, flare, touchdown-zone, and stopping-distance envelope

| Field | Value |
|---|---|
| Severity | Medium |
| Category | Testing / Landing |
| URL/surface | Local app `http://127.0.0.1:5173/`, source tree, docs, and release metadata as applicable |

Evidence: Performance cards include approach AoA only; integration tests validate simplified touchdown/rollout from low AGL.

Impact: This blocks or weakens the project goal of a truthful, playable, releaseable browser-native 737-800 simulator.

Next task: Add approach/landing cards with VREF, sink-rate, flare pitch, touchdown zone, stopping-distance bounds.

### RFS-034: Tire/brake/runway-condition constants are gameplay values

| Field | Value |
|---|---|
| Severity | Medium |
| Category | Ground model |
| URL/surface | Local app `http://127.0.0.1:5173/`, source tree, docs, and release metadata as applicable |

Evidence: Ground friction/tire values in `src/sim/data/aircraft/b737-800-fdm.v1.ts:131-150`; off-runway friction fixed in `src/sim/runwaySurface.ts:29-33`.

Impact: This blocks or weakens the project goal of a truthful, playable, releaseable browser-native 737-800 simulator.

Next task: Add source-lineaged tire/brake/runway condition tables and RTO/landing-distance regression envelopes.

### RFS-035: Route completion never transitions out of the final leg

| Field | Value |
|---|---|
| Severity | Medium |
| Category | FMS |
| URL/surface | Local app `http://127.0.0.1:5173/`, source tree, docs, and release metadata as applicable |

Evidence: `src/sim/systems/navigation.ts:397-407` sequences only before final leg; final leg still returns LNAV available in `src/sim/systems/navigation.ts:431-456`.

Impact: This blocks or weakens the project goal of a truthful, playable, releaseable browser-native 737-800 simulator.

Next task: Add routeComplete/arrived state and final-waypoint/landing behavior tests.

### RFS-036: First MCP target capture uses arbitrary defaults

| Field | Value |
|---|---|
| Severity | Medium |
| Category | Autoflight / UX |
| URL/surface | Local app `http://127.0.0.1:5173/`, source tree, docs, and release metadata as applicable |

Evidence: `src/instruments/defaultAutopilotState.ts:8-12` defaults heading 0, altitude 10000, speed null; `src/instruments/RfsMCP.tsx:150-154` creates it on first mode click.

Impact: This blocks or weakens the project goal of a truthful, playable, releaseable browser-native 737-800 simulator.

Next task: Seed MCP speed/heading/altitude from current aircraft values when AP state is first created or mode first engages.

### RFS-037: Flight director bars only support HDG_SEL and ALT_HOLD

| Field | Value |
|---|---|
| Severity | Medium |
| Category | Autoflight / PFD |
| URL/surface | Local app `http://127.0.0.1:5173/`, source tree, docs, and release metadata as applicable |

Evidence: `src/instruments/RfsPFD.tsx:117-154` returns FD commands for HDG_SEL roll and ALT_HOLD pitch only.

Impact: This blocks or weakens the project goal of a truthful, playable, releaseable browser-native 737-800 simulator.

Next task: Reuse AP target resolution to draw FD bars for LNAV, VS, VNAV_PTH, ALT*.

### RFS-038: SPEED mode controls body/TAS-like speed while PFD/MCP present IAS

| Field | Value |
|---|---|
| Severity | Medium |
| Category | Autoflight / Physics |
| URL/surface | Local app `http://127.0.0.1:5173/`, source tree, docs, and release metadata as applicable |

Evidence: `src/sim/systems/autopilot.ts:48-50,284-286` compute speed error from body velocity; `src/instruments/RfsPFD.tsx:383` displays IAS.

Impact: This blocks or weakens the project goal of a truthful, playable, releaseable browser-native 737-800 simulator.

Next task: Drive SPEED mode from the same IAS/CAS value shown on the PFD, with wind/altitude tests.

### RFS-039: HUD uses fixed pixel positioning and overflow-hidden viewport

| Field | Value |
|---|---|
| Severity | Medium |
| Category | Responsive / Visual |
| URL/surface | Local app `http://127.0.0.1:5173/`, source tree, docs, and release metadata as applicable |

Evidence: `src/index.css:6-10` hides overflow; ScenarioPanel/PFD/MCP/App button bar all use fixed positions and widths. Responsive screenshots: `/Users/reidar/Projectos/RFS/dogfood-output/2026-06-12-rfs-comprehensive-review/screenshots/11-responsive-1024x768.png`, `/Users/reidar/Projectos/RFS/dogfood-output/2026-06-12-rfs-comprehensive-review/screenshots/12-responsive-1440x900.png`, `/Users/reidar/Projectos/RFS/dogfood-output/2026-06-12-rfs-comprehensive-review/screenshots/13-responsive-1920x1080.png`.

Impact: This blocks or weakens the project goal of a truthful, playable, releaseable browser-native 737-800 simulator.

Next task: Add breakpoint tests and implement wrap/stack/scroll-safe HUD behavior.

### RFS-040: 3D cockpit interactions are partial placeholders with little discoverability

| Field | Value |
|---|---|
| Severity | Medium |
| Category | Cockpit / UX |
| URL/surface | Local app `http://127.0.0.1:5173/`, source tree, docs, and release metadata as applicable |

Evidence: `src/viewport/cockpitInteractions.ts:24-66` marks yoke/MCP interactions; `cockpitInputForInteraction` returns null for yoke and MCP panel.

Impact: This blocks or weakens the project goal of a truthful, playable, releaseable browser-native 737-800 simulator.

Next task: Implement real yoke/MCP cockpit controls with visible affordances or remove placeholder interactions.

### RFS-041: Gear can be commanded UP on the runway despite “after positive rate” guidance

| Field | Value |
|---|---|
| Severity | Medium |
| Category | UX / Systems |
| URL/surface | Local app `http://127.0.0.1:5173/`, source tree, docs, and release metadata as applicable |

Evidence: Dogfood label `enva-climb-after-gear`: alt 56 / RA 0, GEAR CMD UP / ACT DN; `src/input/keyboardControls.ts:93-94` toggles unconditionally. Screenshot: `/Users/reidar/Projectos/RFS/dogfood-output/2026-06-12-rfs-comprehensive-review/screenshots/03-enva-climb-after-gear.png`.

Impact: This blocks or weakens the project goal of a truthful, playable, releaseable browser-native 737-800 simulator.

Next task: Gate gear-up command until positive rate/airborne, or show warning/confirm and keep command rejected.

### RFS-042: Weather fetch is hard-coded to KSEA while default scenario is ENVA

| Field | Value |
|---|---|
| Severity | Medium |
| Category | Weather / Product |
| URL/surface | Local app `http://127.0.0.1:5173/`, source tree, docs, and release metadata as applicable |

Evidence: `src/App.tsx:179-186` calls `fetchMetar("KSEA")`; initial/default scenario is ENVA.

Impact: This blocks or weakens the project goal of a truthful, playable, releaseable browser-native 737-800 simulator.

Next task: Add scenario airport/METAR station metadata and refetch on scenario changes.

### RFS-043: Multiple independent RAF loops poll or mutate state

| Field | Value |
|---|---|
| Severity | Medium |
| Category | Performance / Architecture |
| URL/surface | Local app `http://127.0.0.1:5173/`, source tree, docs, and release metadata as applicable |

Evidence: `src/hooks/useSimLoop.ts`, `src/App.tsx` input loop, `src/hooks/useAudioLoop.ts`, `src/viewport/ContrailLayer.tsx`, `src/components/FPSMonitor.tsx`, and Cesium render loop all run independently.

Impact: This blocks or weakens the project goal of a truthful, playable, releaseable browser-native 737-800 simulator.

Next task: Centralize frame scheduling or drive non-visual updates from one sim/render clock.

### RFS-044: Instrument selectors recompute derived flight data many times per frame

| Field | Value |
|---|---|
| Severity | Medium |
| Category | Performance / React |
| URL/surface | Local app `http://127.0.0.1:5173/`, source tree, docs, and release metadata as applicable |

Evidence: `src/instruments/RfsPFD.tsx:374-423` calls `deriveDisplayFmaTruth`, `computeDerived`, and `quatToEuler` across selectors; Telemetry repeats.

Impact: This blocks or weakens the project goal of a truthful, playable, releaseable browser-native 737-800 simulator.

Next task: Add memoized instrument/debug snapshots or store-derived view models.

### RFS-045: Autopilot controller state is hidden module-level mutable state

| Field | Value |
|---|---|
| Severity | Medium |
| Category | Architecture / Testing |
| URL/surface | Local app `http://127.0.0.1:5173/`, source tree, docs, and release metadata as applicable |

Evidence: PID/throttle state lives in module globals in `src/sim/systems/autopilot.ts:14-20`; resets are manual.

Impact: This blocks or weakens the project goal of a truthful, playable, releaseable browser-native 737-800 simulator.

Next task: Move AP controller state into simulation/runtime state and pass through step results.

### RFS-046: App test remains broad and async/mock brittle

| Field | Value |
|---|---|
| Severity | Medium |
| Category | Testing |
| URL/surface | Local app `http://127.0.0.1:5173/`, source tree, docs, and release metadata as applicable |

Evidence: One full-suite run failed on `src/__tests__/App.test.tsx` unable to find HDG, isolated rerun passed, and final full check passed; `App.test.tsx` has a large mutable store mock and lazy-settling helpers.

Impact: This blocks or weakens the project goal of a truthful, playable, releaseable browser-native 737-800 simulator.

Next task: Split broad App assertions into controller/component tests and deterministic App shell smoke tests.

### RFS-047: Baseline HTTP security headers are missing

| Field | Value |
|---|---|
| Severity | Medium |
| Category | Security |
| URL/surface | Local app `http://127.0.0.1:5173/`, source tree, docs, and release metadata as applicable |

Evidence: `nginx.conf:1-14` has routing/cache only; no CSP, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, HSTS found.

Impact: This blocks or weakens the project goal of a truthful, playable, releaseable browser-native 737-800 simulator.

Next task: Add safe headers first, then evaluate a Cesium-compatible CSP.

### RFS-048: Open-source governance files/package metadata are missing

| Field | Value |
|---|---|
| Severity | Medium |
| Category | OSS |
| URL/surface | Local app `http://127.0.0.1:5173/`, source tree, docs, and release metadata as applicable |

Evidence: No LICENSE, SECURITY.md, CONTRIBUTING.md, CODEOWNERS; `package.json` is private and lacks license/repository/bugs metadata.

Impact: This blocks or weakens the project goal of a truthful, playable, releaseable browser-native 737-800 simulator.

Next task: Choose license and add SECURITY/CONTRIBUTING/CODEOWNERS and package metadata.

### RFS-049: No dependency update automation is configured

| Field | Value |
|---|---|
| Severity | Medium |
| Category | Maintenance |
| URL/surface | Local app `http://127.0.0.1:5173/`, source tree, docs, and release metadata as applicable |

Evidence: `.github/` contains workflow only; no Dependabot/Renovate. `npm audit` reported 0 current vulnerabilities in audit context, so this is process debt.

Impact: This blocks or weakens the project goal of a truthful, playable, releaseable browser-native 737-800 simulator.

Next task: Add Dependabot/Renovate for npm, GitHub Actions, and Docker base digest refreshes.

### RFS-050: Deployment docs still lean on mutable latest wording

| Field | Value |
|---|---|
| Severity | Medium |
| Category | Docs / Release |
| URL/surface | Local app `http://127.0.0.1:5173/`, source tree, docs, and release metadata as applicable |

Evidence: README/architecture mention `latest` publish/deploy while workflow deploys SHA tags; `docs/architecture.md` and `README.md` need exact-SHA wording.

Impact: This blocks or weakens the project goal of a truthful, playable, releaseable browser-native 737-800 simulator.

Next task: Update docs to say publish latest + sha, deploy only sha, verify live metadata exact SHA.

### RFS-051: Save/load is one unnamed global slot with little context

| Field | Value |
|---|---|
| Severity | Low |
| Category | UX |
| URL/surface | Local app `http://127.0.0.1:5173/`, source tree, docs, and release metadata as applicable |

Evidence: ScenarioPanel exposes SAVE/LOAD only; `src/store/scenarioPersistence.ts` stores one `rfs.scenarioSnapshot.v1`; dogfood showed generic “Scenario state saved/loaded”. Screenshot: `/Users/reidar/Projectos/RFS/dogfood-output/2026-06-12-rfs-comprehensive-review/screenshots/08-save-load-message-debug.png`.

Impact: This blocks or weakens the project goal of a truthful, playable, releaseable browser-native 737-800 simulator.

Next task: Add slot name/timestamp/scenario summary and confirmation before replacing current state.

### RFS-052: CAM/OVL/AUDIO mode buttons lack toggle semantics/announcements

| Field | Value |
|---|---|
| Severity | Low |
| Category | Accessibility |
| URL/surface | Local app `http://127.0.0.1:5173/`, source tree, docs, and release metadata as applicable |

Evidence: `src/App.tsx:337-353` renders mode buttons without aria-pressed or aria-live state; state is encoded only in text.

Impact: This blocks or weakens the project goal of a truthful, playable, releaseable browser-native 737-800 simulator.

Next task: Add aria labels/pressed state and announce mode changes.

### RFS-053: jsdom canvas warnings add noise and one canvas path has uneven null handling

| Field | Value |
|---|---|
| Severity | Low |
| Category | Testing |
| URL/surface | Local app `http://127.0.0.1:5173/`, source tree, docs, and release metadata as applicable |

Evidence: `npm run check` emits repeated “HTMLCanvasElement.getContext() not implemented”; `CloudLayer` non-null asserts canvas context while `ContrailLayer` guards.

Impact: This blocks or weakens the project goal of a truthful, playable, releaseable browser-native 737-800 simulator.

Next task: Add shared canvas mock or canvas dev dependency and make CloudLayer null-safe.

### RFS-054: Cloud visuals can be nondeterministic if METAR clouds are enabled

| Field | Value |
|---|---|
| Severity | Low |
| Category | Testing / Visual |
| URL/surface | Local app `http://127.0.0.1:5173/`, source tree, docs, and release metadata as applicable |

Evidence: `src/viewport/CloudLayer.tsx:17-31` creates billboards and uses `Math.random()` for scale; visual snapshots exist.

Impact: This blocks or weakens the project goal of a truthful, playable, releaseable browser-native 737-800 simulator.

Next task: Seed cloud randomness or disable/random-free it in visual-test mode.

### RFS-055: ESLint emits React-version settings warning

| Field | Value |
|---|---|
| Severity | Low |
| Category | Tooling |
| URL/surface | Local app `http://127.0.0.1:5173/`, source tree, docs, and release metadata as applicable |

Evidence: Final `npm run check` passed, but lint prints “React version not specified in eslint-plugin-react settings”.

Impact: This blocks or weakens the project goal of a truthful, playable, releaseable browser-native 737-800 simulator.

Next task: Set React version to detect/19 in ESLint settings to remove warning noise.


## Browser coverage details

Pages/features tested:
- Initial app load at `/`.
- ENVA Tutorial Takeoff default scenario.
- START ROLL, flaps, trim, throttle, gear key, reset.
- ENVA LOAD PLAN.
- Scenario select to KSEA Tutorial Takeoff.
- KSEA LOAD PLAN, RouteStatus, AP/FMA truth.
- Overlay modes FLIGHT/MINIMAL/DEBUG.
- Camera mode cycling.
- Audio ON/OFF smoke.
- Save/load scenario state.
- Responsive screenshots at 1024x768, 1440x900, and 1920x1080.

Screenshots captured:
- `/Users/reidar/Projectos/RFS/dogfood-output/2026-06-12-rfs-comprehensive-review/screenshots/01-initial-enva-flight-overlay.png` — initial ENVA flight overlay.
- `/Users/reidar/Projectos/RFS/dogfood-output/2026-06-12-rfs-comprehensive-review/screenshots/02-enva-climb-before-gear.png` — ENVA start roll after throttle before gear command.
- `/Users/reidar/Projectos/RFS/dogfood-output/2026-06-12-rfs-comprehensive-review/screenshots/03-enva-climb-after-gear.png` — ENVA gear command while still at runway altitude.
- `/Users/reidar/Projectos/RFS/dogfood-output/2026-06-12-rfs-comprehensive-review/screenshots/04-enva-load-plan-noop.png` — ENVA LOAD PLAN no-op.
- `/Users/reidar/Projectos/RFS/dogfood-output/2026-06-12-rfs-comprehensive-review/screenshots/05-ksea-load-plan-stopped.png` — KSEA LOAD PLAN while stopped.
- `/Users/reidar/Projectos/RFS/dogfood-output/2026-06-12-rfs-comprehensive-review/screenshots/06-ksea-minimal-overlay.png` — minimal overlay.
- `/Users/reidar/Projectos/RFS/dogfood-output/2026-06-12-rfs-comprehensive-review/screenshots/07-ksea-debug-overlay-overlap.png` — debug overlay overlap.
- `/Users/reidar/Projectos/RFS/dogfood-output/2026-06-12-rfs-comprehensive-review/screenshots/08-save-load-message-debug.png` — save/load message in debug context.
- `/Users/reidar/Projectos/RFS/dogfood-output/2026-06-12-rfs-comprehensive-review/screenshots/09-camera-after-one-cycle.png` and `/Users/reidar/Projectos/RFS/dogfood-output/2026-06-12-rfs-comprehensive-review/screenshots/10-camera-after-two-cycles.png` — camera cycles.
- `/Users/reidar/Projectos/RFS/dogfood-output/2026-06-12-rfs-comprehensive-review/screenshots/11-responsive-1024x768.png`, `/Users/reidar/Projectos/RFS/dogfood-output/2026-06-12-rfs-comprehensive-review/screenshots/12-responsive-1440x900.png`, `/Users/reidar/Projectos/RFS/dogfood-output/2026-06-12-rfs-comprehensive-review/screenshots/13-responsive-1920x1080.png` — responsive captures.

Not tested / blocked:
- Real iPhone Safari/PWA evidence was not run; desktop/headless browser evidence is not mobile device proof.
- Physical gamepad hardware was not tested; only keyboard/browser-driven controls were exercised.
- A continuous hand-flown full KSEA→KPDX flight was not completed.
- Live production was not dogfooded as current code because live is stale relative to local HEAD.
- Cesium commercial license/account status was not inspected beyond observing the visible watermark.
- Secrets and `.env` contents were not read.

## Gate notes

A previous full-suite `npm run check` run during the review failed once in `src/__tests__/App.test.tsx` while waiting for the HDG button; the isolated App test then passed, and the final full `npm run check` passed. I classified this as a possible App-test brittleness gap, not a current failing gate.

The report artifacts are intentionally uncommitted. Current git status after writing the report should show review artifacts under `dogfood-output/` and `docs/reviews/2026-06-12-rfs-comprehensive-dogfood-audit.md` unless you choose to commit them.
