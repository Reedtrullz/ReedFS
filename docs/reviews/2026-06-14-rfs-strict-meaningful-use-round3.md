# RFS strict meaningful-use review — round 3 — 2026-06-14

Repo: `/Users/reidar/Projectos/RFS`
Audited SHA: `fefca39c0ebf824b40d0f3c2ef07bedab85de73d`
Live URL checked: `https://fly.reidar.tech/rfs-version.json`
Scope: strict review for making RFS meaningfully usable as a browser-native 737-800 simulator, with special focus on the remaining Task 7 continuous black-box acceptance.

## Executive conclusion

RFS is materially stronger than before the prior remediation pass, but it is **not yet ready for a truthful full meaningful-flight claim**. The current application can load a KSEA→KPDX route, start a takeoff roll, climb, and engage visible MCP modes, but the path still depends on hidden knowledge, overly narrow tests, seeded/teleported proof slices, and avionics/vertical-mode behavior that can mislead the player.

The largest blocker is still Task 7:

> A continuous no-store-mutation black-box route flight from visible setup through takeoff, route capture, descent/approach, landing, rollout/stop/reset.

That proof does not exist yet, and the browser dogfood run found new user-visible blockers that should be fixed before writing it.

## Baseline evidence collected in this pass

- Exact live SHA/release checker passed for `fefca39c0ebf824b40d0f3c2ef07bedab85de73d`.
- Branch protection checker passed for current required contexts `secret-scan`, `test`, `publish`, `deploy`.
- Quick local guards passed:
  - `npm run check:blackbox`
  - `npm run check:release`
  - `npm run check:deps`
  - `npm run check:bundle`
- `npm audit --audit-level=moderate --json` reported zero known vulnerabilities across 465 dependencies.
- Local browser dogfood was run against `http://127.0.0.1:5173/` with the app started by `npm run dev -- --host 127.0.0.1`.
- Worktree was otherwise clean except the pre-existing untracked `dogfood-output/` directory.

## Browser dogfood transcript summary

The actual visible-control path produced these observations:

1. Fresh default ENVA state showed flaps 5 / trim 5.0 and the coach said “Checklist complete. Press START ROLL when ready.”
2. Pressing visible `START ROLL` immediately changed the visible takeoff setup to flaps 0 / trim 0.0 / throttle 0, while the panel still said “Configure the B737 before pressing START ROLL.”
3. KSEA selection and route load showed `KSEA→KPDX`, `ACTIVE`, `LEG 1/3`, `KSEA → OLM`, but the route-load status repeated the same misleading instruction to confirm flaps/trim before `START ROLL`.
4. After `START ROLL`, KSEA also reset to flaps 0 / trim 0.0.
5. To continue the player path without store mutation, the run used real visible button clicks: `Flaps Next` x3, `Trim Nose Up` x50, `Throttle Up` x20. This reached flaps 5 / trim 5.0 / throttle 100%, proving the current visible setup flow is technically possible but human-hostile.
6. The airplane was already airborne/climbing by the first sampled rotation point: IAS 161 kt, pitch 21.5°, RA 517 ft, VS 4671 fpm. This means trim/thrust alone can produce an aggressive auto-rotation/climb before deliberate pilot rotation.
7. Gear could be retracted by visible/keyboard input, and MCP buttons became enabled once airborne.
8. Clicking visible `LNAV` and `SPD` engaged FMA `SPEED / LNAV / PITCH OFF / CMD_A`, after which the aircraft entered a steep descent of roughly -3000 fpm.
9. Clicking visible `ALT` changed FMA to `ALT_HOLD`, but the airplane was still descending around -2000 fpm and continued below the selected altitude before stabilizing below it.

This proves the sim has useful pieces, but also proves that the current route-to-autoflight dogfood path is not yet a credible meaningful-flight acceptance.

## Prioritized findings matrix

| ID | Severity | Task 7 blocker | Finding | Primary evidence | Required acceptance |
|---|---:|---:|---|---|---|
| RFS-R3-001 | P0 | Yes | No continuous no-store-mutation black-box route-to-landing acceptance exists. | `e2e/rfs-blackbox-player-loop.spec.ts:9-27` only loads KSEA, checks setup controls, and starts roll. Main route/flight helpers use store imports, `page.evaluate`, direct ticks, and state seeding. | Add a guarded black-box spec from cold start through route load, takeoff, route capture, descent/approach, landing, rollout/stop/reset using only visible controls/keyboard/gamepad-like inputs. |
| RFS-R3-002 | P0 | Yes | `START ROLL` destroys the visible/scenario takeoff setup. | `src/store/slices/aircraftSlice.ts:98-123` sets flaps/trim/throttle to zero; browser dogfood confirmed flaps 5/trim 5.0 became flaps 0/trim 0.0. | `START ROLL` must preserve configured takeoff setup or the UI must explicitly require start-first configuration and provide one-click configuration after start. |
| RFS-R3-003 | P0 | Yes | Takeoff guidance contradicts runtime behavior. | `TakeoffSetupPanel.tsx:76-77` says configure before START ROLL; route-load message in `RfsShell.tsx:246-248` repeats that; runtime resets setup on START ROLL. | All tutorial, route-load, coach, and panel instructions must match actual state transitions. |
| RFS-R3-004 | P0 | Yes | Visible setup controls are not meaningfully human-operable. | Only `Flaps Next`, `Trim Nose Up`, `Throttle Up`, `Gear` exist at `TakeoffSetupPanel.tsx:87-99`; dogfood required 3+50+20 clicks after start. | Add bidirectional controls, target buttons, or a “Set takeoff config” action; overshoot must be recoverable visibly. |
| RFS-R3-005 | P0 | Yes | Route continuity to approach/landing is missing. | KSEA route ends at KPDX with only a 3000 ft airport waypoint in `flightPlanLoader.ts:32-60`; `computeRouteStatus` disables LNAV when route complete at `navigation.ts:447-452`. | Route must include approach/final/threshold/landing handoff or route completion must be landing-aware. |
| RFS-R3-006 | P0 | Yes | No production CLIMB/CRUISE→DESCENT/APPROACH lifecycle is evident for a continuous flight. | Landing FSM starts touchdown only from `APPROACH`/`DESCENT`; current proofs seed approach/descent states. | Continuous takeoff-to-landing run must transition into descent/approach without manual store seeding. |
| RFS-R3-007 | P0 | Yes | Browser-assisted/route proofs are still stitched by store mutation and teleports. | `e2e/helpers/rfsFlight.ts`, `e2e/helpers/rfsRoute.ts`, and `e2e/helpers/rfsBrowserAssisted.ts` import app internals, call `tick`, and seed state. | Keep seeded tests as subsystem proofs, but do not count them as full-flight acceptance. |
| RFS-R3-008 | P0 | Yes | First visible AP sequence can produce a dangerous vertical-mode state. | Browser dogfood: `LNAV`+`SPD` showed `PITCH OFF / CMD_A` while descending about -3000 fpm. | MCP engagement should either refuse incomplete vertical ownership or provide safe/explicit vertical guidance before AP CMD is shown as controlling. |
| RFS-R3-009 | P0 | Yes | `ALT_HOLD` can display while aircraft is still rapidly descending and below/through selected altitude. | Browser dogfood: after clicking `ALT`, FMA showed `ALT_HOLD`; VS remained roughly -2000 fpm and the aircraft stabilized below selected ALT 2900. | Active `ALT_HOLD` must only show after capture criteria are met, or show `ALT*`/capture/descent mode truthfully until stabilized. |
| RFS-R3-010 | P0 | Yes | Takeoff can auto-rotate/climb aggressively from trim/thrust before deliberate pilot rotation. | Dogfood sample before any intentional rotation command: IAS 161 kt, pitch 21.5°, RA 517 ft, VS 4671 fpm. | Manual takeoff proof must show aircraft remains on runway until credible rotation input/physics; trim should not produce uncontrolled liftoff. |
| RFS-R3-011 | P0 | Yes | VNAV can display active vertical state without a command target. | `vnav.ts:177-180` can return lifecycle `ARMED` with verticalMode `VNAV`; `guidanceTargets.ts:156-159` returns no target when verticalMode is `VNAV`; `effectiveAutoflightTruth.ts:129-139` can display VNAV family modes. | Separate armed/active FMA; every active vertical FMA must map to a concrete guidance command or be shown unavailable/armed. |
| RFS-R3-012 | P0 | Yes | VNAV target search can stop at a speed-only constraint and miss later altitude constraints. | `vnav.ts:137-147` returns the first waypoint with altitude or speed target; `flightPlanLoader.ts:47-58` has BTG speed/alt constraints and KPDX 3000 ft. | Planner must independently resolve vertical path and speed targets; speed-only constraints must not block later descent/approach constraints. |
| RFS-R3-013 | P1 | Yes | Black-box guard scans only one shallow entrypoint. | `scripts/check-blackbox-e2e.mjs:11` hard-codes `rfs-blackbox-player-loop.spec.ts`. | Guard should scan a manifest/glob of all strict black-box acceptance specs and their import graphs. |
| RFS-R3-014 | P1 | Yes | Black-box guard is not part of `npm run check` or CI `test` job. | `package.json:37` omits `check:blackbox`; `.github/workflows/ci.yml:49-61` omits it. | Add `npm run check:blackbox` to aggregate local and CI checks. |
| RFS-R3-015 | P1 | Partial | Playwright CI proofs run under visual-test runtime mode. | `playwright.config.ts:31-33` always sets `VITE_RFS_VISUAL_TEST=1`; `package.json:39` runs all Playwright tests under `test:visual`. | Split production-like e2e from visual snapshot mode; Task 7 must run production-like. |
| RFS-R3-016 | P1 | Partial | Route visual proof can pass with no route loaded. | `e2e/rfs-visual.spec.ts:19-23` accepts `/NO ROUTE|KSEA→KPDX/`. | Select KSEA and require exact KSEA route text in route visual proof. |
| RFS-R3-017 | P1 | Partial | Managed speed is often overridden by synthetic selected speed. | Default AP state seeds selected speed; `guidanceTargets.ts:173-187` prefers selected speed before route-managed speed. | Distinguish managed speed from speed-intervention selected speed; lateral mode clicks must not open a synthetic speed window. |
| RFS-R3-018 | P1 | Partial | LOC/APP/G/S/LVL_CHG can be effective/display truth without real servo backing. | `effectiveAutoflightTruth.ts:124-141` can derive these modes; AP/guidance target support is narrower. | Suppress until implemented or add real target resolution/commands/tests. |
| RFS-R3-019 | P1 | Partial | RFMS route adapter is a local wrapper, not a visible CDU route workflow. | `flightPlanLoader.ts:63-72` explicitly says CDU editing UI is not implemented; app `LOAD PLAN` only loads scenario default. | Add visible RFMS/CDU route entry, direct-to, discontinuity resolution, and EXEC flow or label current flow canned-only. |
| RFS-R3-020 | P1 | Partial | Discontinuities invalidate the entire route rather than allowing flight to discontinuity. | Route validation rejects any waypoint discontinuity; route adapter can create discontinuities. | LNAV should remain valid until the discontinuity and alert/stop there. |
| RFS-R3-021 | P1 | Partial | Flight Director switches are a false affordance without AP engagement. | FD switch state can show on PFD, while guidance targets require backed AP for commands. | FD-only guidance bars should work without AP authority, or UI must label FD as non-commanding. |
| RFS-R3-022 | P1 | Partial | Takeoff A/T/N1 usage is blocked by shared MCP airborne gating. | MCP mode availability gates all modes until running/airborne. | Split A/T takeoff mode gating from AP lateral/vertical gating. |
| RFS-R3-023 | P1 | Partial | Main-gear/nose-gear contact can be over-broadened after first contact. | Ground solver can include all gear stations once nearby established contact exists. | Add main-gear-only touchdown test: nose gear must remain unloaded until geometry actually contacts. |
| RFS-R3-024 | P1 | Partial | Touchdown sink/contact can be missed or under-recorded during flare/bounce. | Solver computes wheel sink but touchdown recording/early return can rely on aircraft-reference vertical motion. | Record wheel/contact sink and do not skip contact when gear geometry contacts during reference-point upward motion. |
| RFS-R3-025 | P1 | Partial | Descent/approach proof is currently not meaningful. | Route/flight e2e helpers seed approach/descent and often expect vertical FMA `OFF`. | Prove a visible descent workflow from climb to approach without direct state seeding. |
| RFS-R3-026 | P1 | Partial | KPDX scenario/runway/performance-card proof is inconsistent. | Scenario KPDX runway differs from route landing bridge/test assumptions; landing cards are broad/test-only. | Align runway/procedure/performance card for KPDX and validate against destination-specific envelope. |
| RFS-R3-027 | P1 | No | Live image digest provenance is self-attested by mounted JSON. | CI pulls/runs by tag at `.github/workflows/ci.yml:285-301`, mounts generated metadata, then greps metadata for digest at `316-318` and `357-359`. | Deploy by digest or inspect the pulled/running image `RepoDigests` before canary/promotion. |
| RFS-R3-028 | P1 | No | Branch protection omits PR Docker smoke/Trivy job. | Current required-context checker uses `secret-scan,test,publish,deploy`; `docker-smoke` exists in CI. | Add `docker-smoke` to required contexts and docs/checker commands. |
| RFS-R3-029 | P1 | No | Cesium Ion token docs treat a Vite browser token as a secret. | Token is passed as `VITE_CESIUM_ION_TOKEN` and read client-side. | Document it as a public restricted browser credential, not a confidential runtime secret. |
| RFS-R3-030 | P1 | No | README deploy-complete wording is weaker than exact-SHA runbook. | README allows HTTP 200 + successful CI as deploy-complete bar; runbook requires exact metadata. | README should require exact SHA/image metadata checker, not HTTP 200 alone. |
| RFS-R3-031 | P1 | No | Ansible deploy path appears stale relative to Docker/nginx contract. | Docker/nginx exposes 8080; Ansible path reportedly uses container port 80 and lacks all CI runtime hardening. | Align Ansible with CI deploy or explicitly deprecate it. |
| RFS-R3-032 | P2 | No | Unsupported terrain has no collision/contact model. | Ground solver intentionally returns no synthetic unsupported-terrain contact. | Add warning/crash/belly/terrain-floor semantics or explicitly scope simulator to prepared surfaces. |
| RFS-R3-033 | P2 | No | Browser worker flag does not make live store loop use worker physics. | `simulationRuntime.ts:94-99` sync `step()` falls back; `simStore.ts:139-155` only calls sync `step()`. | Wire async worker stepping into store/scheduler or label worker mode as protocol-only. |
| RFS-R3-034 | P2 | No | PFD render path likely has avoidable per-frame derived work. | PFD uses many primitive subscriptions; selectors recompute derived physics/FMA values. | Add memoized `selectPfdViewModel` and render/selector budget tests. |
| RFS-R3-035 | P2 | No | Persistence restore validates snapshot fields too weakly. | Scenario persistence accepts any string status and broad numeric fields. | Validate status union, finite values, safe active leg index, and fuzz corrupted localStorage. |
| RFS-R3-036 | P2 | No | Cockpit mode is not yet a playable cockpit. | Yoke unavailable; cockpit interactions are one-way/toggle-heavy and have no DOM feedback. | Either label cockpit controls as visual-only or add usable yoke/throttle/flap/trim/MCP interactions with feedback. |
| RFS-R3-037 | P2 | No | Control/help system is hidden behind debug overlay. | Default `OVL: FLIGHT` does not show keyboard/gamepad help; ControlsHelp is debug-only. | Add default-visible controls help/onboarding or discoverable “Controls” action. |
| RFS-R3-038 | P2 | No | Gamepad/settings UI is mostly read-only. | Calibration/remapping types exist, but UI displays bindings only and app reads defaults. | Add calibration/remapping persistence or rename as read-only bindings info. |
| RFS-R3-039 | P2 | No | Accessibility coverage proves landmarks more than operability. | Tests check named regions/ARIA states; cockpit/canvas actions are not DOM-operable. | Add keyboard-only tab-flow proof, axe checks, and equivalent DOM controls for required actions. |
| RFS-R3-040 | P2 | No | Responsive proof misses small-height/split-pane viewports. | Current responsive e2e uses desktop widths with height 900. | Add 1024×768, 900×700, 800×600, and Hermes split-pane no-overlap/reachability tests. |
| RFS-R3-041 | P2 | No | Audio captions can become stale and only cover alerts. | Caption state is set but not generally expired; non-GPWS cues are not captioned. | Captions should expire/update and cover important audio/state cues. |
| RFS-R3-042 | P2 | No | No CSP/report-only policy yet. | nginx has several security headers but no CSP. | Add Cesium-compatible CSP report-only first, then enforce if practical. |
| RFS-R3-043 | P2 | No | Docker builds are not fully reproducible despite pinned bases. | Dockerfile uses live `apk add`/`apk upgrade` against moving repos. | Either document as not bit-reproducible or pin package snapshots/SBOM. |
| RFS-R3-044 | P2 | No | OSS/community profile lacks a Code of Conduct. | License, security, contributing, CODEOWNERS exist; no CoC found. | Add `CODE_OF_CONDUCT.md` or document intentional absence. |

## What is already strong

- The live deployed SHA and version metadata are exact-SHA verifiable.
- Release hardening, bundle budget, Three dedupe, and npm audit checks are currently green.
- The black-box guard design is good for its current scanned entrypoint: it blocks store access, `setState`, `/src/` imports, direct aircraft/flightPlan seeding, and `page.evaluate`.
- Route status, PFD, MCP, takeoff setup, and scenario panels expose useful player-visible state.
- The sim can reach an airborne state from visible controls and enable MCP modes after positive rate.
- Ground/landing subsystem foundations are substantially better than early prototypes: wheel stations, oleo damping, tire/brake forces, and explicit touchdown/derotation/rollout/taxi/stopped phases exist.
- Security/runtime posture is stronger than typical hobby web sims: pinned actions/bases, gitleaks, PR Docker smoke, Trivy, non-root/read-only container, rollback path, `.dockerignore`, and exact metadata runbooks exist.

## Task 7 readiness verdict

Task 7 remains **blocked**.

It should not be attempted as one monolithic E2E until these are fixed first:

1. Fix `START ROLL` setup reset or align instructions and provide a fast visible setup action.
2. Add a strict black-box proof that reaches at least legal airborne LNAV/SPD/ALT/gear-up from visible controls and fails on the current reset trap.
3. Fix AP vertical truth so `PITCH OFF / CMD_A`, misleading `ALT_HOLD`, and uncommanded descent cannot be treated as success.
4. Add route/phase logic for climb→descent→approach and route-to-runway continuity.
5. Only then extend black-box acceptance through descent, landing, rollout, stop, and reset.

## Recommended next execution order

### Slice A — make takeoff dogfood honest

- Preserve flaps/trim/throttle across `START ROLL`, or make `START ROLL` the start of configuration and change all guidance accordingly.
- Add bidirectional setup controls and a one-click scenario target action.
- Add black-box test: KSEA route load → START ROLL → visible config remains/recovers → rotate → positive rate → gear up.
- Put `check:blackbox` into `npm run check` and CI.

### Slice B — make first airborne AP sequence truthful

- Ensure AP CMD cannot display with `PITCH OFF` unless the UI clearly labels lateral-only AP authority.
- Fix `ALT_HOLD` capture criteria and display `ALT*` or another transient mode while vertical speed is still materially nonzero.
- Add browser proof for visible `LNAV` + vertical mode engagement that stabilizes without diving.

### Slice C — build route-to-approach continuity

- Extend KSEA→KPDX route with approach/final/threshold semantics or explicit manual approach handoff.
- Add descent/approach phase manager from normal climb/cruise state.
- Align KPDX runway, scenario, route bridge, and performance card.

### Slice D — finish full continuous black-box acceptance

- Guard the new spec and helpers with the black-box scanner.
- Run it production-like, not under visual-test mode.
- Acceptance: setup → takeoff → clean climb → route capture → descent/approach → landing → rollout/stop/reset using visible controls only.

## Non-claims after this review

Do not claim yet:

- full-route/full-flight black-box proof;
- route-coupled descent/approach/landing;
- production-default Worker physics;
- playable cockpit;
- certified or AFM-grade 737 dynamics;
- exact immutable running image digest proof beyond metadata self-attestation.

It is fair to claim:

- RFS has a deployed, exact-SHA-verifiable browser prototype with meaningful scoped subsystem proofs;
- KSEA route load and visible takeoff setup exist;
- a browser-visible takeoff/climb path exists but has serious UX/physics/autoflight caveats;
- Task 7 remains explicitly blocked by the findings above.
