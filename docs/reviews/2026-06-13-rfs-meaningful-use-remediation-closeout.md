# RFS meaningful-use remediation closeout — 2026-06-14

Repo: `/Users/reidar/Projectos/RFS`
Closeout branch/worktree base before this report: `origin/master` after protected PR #13 (`f4f3c8f0bece93f7c8f130b46e0102f59aee35ed`)
Primary source review: `docs/reviews/2026-06-13-rfs-meaningful-use-deep-review-round2.md`
Implementation plan: `docs/plans/2026-06-13-rfs-meaningful-use-remediation-plan.md`

## Bottom line

RFS has moved from “impressive but not meaningfully usable” to a **meaningfully usable browser-native 737-800 simulator prototype for scoped training/playability loops**:

- A normal user can load the KSEA route, see and use visible takeoff setup controls, start the roll, and exercise guarded MCP/AP/A/T behavior.
- The simulator has scoped browser proofs for takeoff-to-clean-climb, short-final landing/rollout/reset, KSEA route-leg progression, route-coupled approach slices, manual handoff, and landing bridge slices.
- The PFD/MCP/FMA/AP/A/T ownership model is much stricter: displayed active modes are tied to backing command/state, and unbacked automation cannot silently keep owning axes.
- Local and protected-branch gates now enforce lint/typecheck/unit tests/build/bundle, visual timing, no-store-mutation black-box boundaries, release hardening, Docker smoke, branch protection, and exact-SHA live release verification.

Strictly, RFS is **not yet a continuous full-route/full-flight 737 simulator**. The remaining milestone is Task 7: a final continuous no-store-mutation black-box acceptance that flies from route setup through route-coupled descent/approach/landing/rollout/stop/reset using only player-visible controls/keyboard/gamepad. Current landing and route-coupled proofs remain scoped/seeded/browser-assisted where stated below.

## Non-claims

- No claim of FAA/AFM-grade or certified B737-800 flight dynamics. The current FDM/performance data is source-lineaged and fixture-guarded, but still a simulator-prototype model.
- No claim of a continuous full-route/full-flight proof. The final continuous black-box acceptance remains pending as Task 7.
- No claim that RFMS is a complete FMS with full CDU route editing, EXEC lifecycle, holds, procedures, or discontinuity UX. RFS has an RFMS adapter/seam and typed route contracts.
- No claim that production physics defaults to the browser Worker path. The real browser Worker runtime exists behind a default-off flag.
- No claim that cockpit mode is a fully flyable cockpit. Placeholder/no-op controls are now explicit or guarded, and cockpit render/interaction surfaces are improved.
- CI/live success below must be read only for the exact SHA verified by the release checker. Pushed/merged is not the same as deployed until `scripts/check-exact-sha-release.mjs` passes.

## Verification evidence

### Local gate on corrected closeout worktree

Commands run on the corrected worktree before writing this report:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check
```

Result: PASS.

Evidence excerpt:

- `check:deps`: `single three version: 0.184.0`
- `check:release`: `release hardening checks passed`
- `lint:ci`: exit 0 with the known React-version settings warning only
- `typecheck`: exit 0
- Vitest: `99 passed (99)` test files, `827 passed (827)` tests
- `build`: Vite production build succeeded and wrote `dist/rfs-version.json`
- `check:bundle`: `bundle budgets ok`

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && CI=1 npm run test:visual
```

Result: PASS.

Evidence excerpt:

- Playwright: `28 passed (7.6m)`
- Visual timing budget: `visual timing budget ok: 28 executed results, total 444635ms, max 42994ms`

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check:blackbox && node scripts/check-blackbox-e2e.mjs
```

Result: PASS.

Evidence excerpt:

- `Black-box E2E guard passed (2 files scanned).`
- The black-box entrypoint now remains `e2e/rfs-blackbox-player-loop.spec.ts` plus `e2e/helpers/rfsBlackbox.ts`; browser-store fast-forward proof has been split into explicit browser-assisted files so it is not misrepresented as black-box.

### Protected release/governance evidence before closeout-doc PR

Protected `master` exact-SHA evidence from Task 49:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && node scripts/check-branch-protection.mjs --repo Reedtrullz/ReedFS --branch master --required secret-scan,test,publish,deploy --require-admins --forbid-force-push --forbid-delete
```

Result:

```text
branch protection ok for Reedtrullz/ReedFS@master: required contexts ["deploy","publish","secret-scan","test"]
```

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && FINAL_SHA=$(git rev-parse origin/master) && node scripts/check-exact-sha-release.mjs --repo Reedtrullz/ReedFS --branch master --sha "$FINAL_SHA" --live-url https://fly.reidar.tech/rfs-version.json
```

Result for `f4f3c8f0bece93f7c8f130b46e0102f59aee35ed`:

```text
exact-SHA release ok for Reedtrullz/ReedFS@f4f3c8f0bece93f7c8f130b46e0102f59aee35ed
run: https://github.com/Reedtrullz/ReedFS/actions/runs/27510740802
deploy job: https://github.com/Reedtrullz/ReedFS/actions/runs/27510740802/job/81310913223
live: https://fly.reidar.tech/rfs-version.json
```

CI/CD run `27510740802` for that SHA completed `secret-scan`, `test`, `docker-smoke`, `publish`, and `deploy` successfully.

## Finding closeout matrix

| Finding | Status | Implemented/verified closeout | Proof boundary |
|---|---|---|---|
| RFS-MU2-001 | Partially closed; Task 7 remains | No-store-mutation black-box guard; visible KSEA route/setup/start proof; browser-assisted airborne MCP proof; multiple scoped route/landing bridge proofs. | No continuous full-route/full-flight black-box proof yet. Browser-assisted proof is explicitly non-black-box. |
| RFS-MU2-002 | Materially improved | B737 data lineage manifest and stall/climb/cruise/approach/engine-lapse fixture gates added. | Not AFM/certified-grade; still prototype data. |
| RFS-MU2-003 | Materially improved | Gear-station helpers, wheel-by-wheel contact, runway-normal helpers, main-gear pivot/nosewheel unload, runway/off-runway checks. | Broader terrain mesh and all-airport surface modeling remain future realism work. |
| RFS-MU2-004 | Closed for current default loop | Visible takeoff setup panel, route-load reminder, shared visible flaps/trim/throttle controls, black-box route/setup/start proof. | Not a full interactive tutorial overhaul. |
| RFS-MU2-005 | Closed for guarded takeoff cue/pitch behavior | Premature rotation guidance blocked below VR; main-gear pivot/nosewheel unload/tailstrike envelope tests added. | Further tuning can still improve feel. |
| RFS-MU2-006 | Materially improved; Task 7 remains | Touchdown/derotation/rollout/taxi/stopped phase work, landing cards, stopping-distance acceptance, short-final landing/rollout/reset browser proofs. | Continuous route-coupled descent-to-landing black-box proof is still pending. |
| RFS-MU2-007 | Closed | VNAV managed capture target is carried through `ALT*`/`ALT HOLD` rather than reverting to selected MCP altitude. | Broader VNAV path/procedure fidelity remains future work. |
| RFS-MU2-008 | Closed | AP and A/T truth/ownership split; A/T-only controls; browser proof of airborne MCP/AP/thrust ownership. | Full Boeing AFDS edge cases remain future fidelity work. |
| RFS-MU2-009 | Closed | Branch protection enabled; required contexts verified; exact-SHA release checker requires CI/CD push run, deploy job, live commit/version/image/digest. | Each future release still requires running the exact-SHA checker for that SHA. |
| RFS-MU2-010 | Closed | Spoilers dump lift/increase wheel loading; stopping-distance effects are fixture-guarded. | Tuning can still improve rollout feel. |
| RFS-MU2-011 | Closed | Commanded vs actual gear/flap state with transit rates and UI/engine strip truth. | Abnormal/hydraulic failure depth remains future work. |
| RFS-MU2-012 | Materially improved | Engine operation is coupled to fuel availability and data tables; starvation/spool behavior guarded. | No claim of high-fidelity engine-out/reverse/thrust-management model. |
| RFS-MU2-013 | Materially improved | RFMS route adapter and edit/direct-to/discontinuity seam defined. | Full RFMS-backed CDU/FMS route editing UX remains future work. |
| RFS-MU2-014 | Materially improved | VNAV lookahead/TOD/path capture/lifecycle tests and behavior added. | Full managed VNAV/procedure fidelity remains future work. |
| RFS-MU2-015 | Closed | Managed-speed indication separated from vertical VNAV pitch guidance. | Broader FMA lifecycle fidelity can still deepen. |
| RFS-MU2-016 | Closed | MCP unavailable states explicit with reasons/ARIA; A/T-only controls added. | Additional cockpit-specific affordances remain future polish. |
| RFS-MU2-017 | Closed | Flight-director bars share AP command targets/guidance output. | Advanced FD mode details remain future work. |
| RFS-MU2-018 | Closed | Loose crosswind tolerances replaced with runway-edge/excursion checks. | Broader airports/weather cases remain future realism work. |
| RFS-MU2-019 | Closed | Weather/clouds/density-altitude tied to scenario metadata and deterministic seeds. | Rich METAR/cloud/visibility rendering remains future expansion. |
| RFS-MU2-020 | Materially improved | Cockpit interactions are implemented or explicitly unavailable/labelled; tests cover real vs unavailable paths. | Cockpit mode is still not a complete flyable 737 cockpit. |
| RFS-MU2-021 | Closed | Responsive layout manager and viewport matrix non-overlap tests added. | More visual polish remains product backlog. |
| RFS-MU2-022 | Closed | Landmarks, headings, named regions, ARIA button states, and live statuses added. | Not a full screen-reader audit certification. |
| RFS-MU2-023 | Closed | Keyboard/cockpit/takeoff setup flap detents share the B737 detent model. | None beyond normal future aircraft-variant support. |
| RFS-MU2-024 | Closed/guarded | Visual/E2E timing budgets, readback/performance budget checks, and split faster browser-assisted proof added. | GPU/WebGL performance still needs continued monitoring on real hardware. |
| RFS-MU2-025 | Closed | PR-safe Docker build/smoke and container scanning added. | Local Docker daemon was unavailable during closeout; GitHub `docker-smoke` is the authoritative container proof. |
| RFS-MU2-026 | Closed | Rollback failures are fatal and previous public version verification is required. | Only future failed promotions can exercise the rollback path end-to-end. |
| RFS-MU2-027 | Closed | nginx container hardened for non-root/read-only-style runtime and deploy flags. | Future nginx/base-image CVEs still require maintenance. |
| RFS-MU2-028 | Closed | Immutable image digest is injected into live release provenance; exact-SHA checker rejects `unknown`. | Each future release needs a real digest in live metadata. |
| RFS-MU2-029 | Implemented default-off | Real browser Worker runtime exists behind a default-off flag with codec/parity tests. | Production default remains main-thread physics. |
| RFS-MU2-030 | Closed | Central scheduler orders input → fixed sim → render/effects → audio. | Further performance tuning remains possible. |
| RFS-MU2-031 | Closed | AP controller/PID state moved into runtime-owned state. | Future worker/multi-runtime work must preserve this boundary. |
| RFS-MU2-032 | Closed | App shell responsibilities split into `RfsShell` and focused modules. | Continued refactors can further shrink shell responsibilities. |
| RFS-MU2-033 | Closed | Store split into stable domain slices behind compatibility API. | Compatibility API remains a migration bridge. |
| RFS-MU2-034 | Closed | View-model selectors and render-count guards added. | More perf profiling can still be added. |
| RFS-MU2-035 | Closed | Enforceable bundle budget added to local and CI checks. | Cesium/Three chunk size remains monitored, not eliminated. |
| RFS-MU2-036 | Closed | Compatible security headers added without COOP/COEP breakage. | Full strict CSP remains constrained by Cesium external resources. |
| RFS-MU2-037 | Closed | Docker build context exclusions hardened. | Keep reviewing as new generated directories appear. |
| RFS-MU2-038 | Closed | OSS governance files/package metadata/license/security/contributing/templates added. | Normal OSS maintenance continues. |
| RFS-MU2-039 | Closed | Dependabot/CodeQL/container security automation added. | Dependabot updates still need review/merge discipline. |
| RFS-MU2-040 | Closed for clone/bootstrap | RFMS shared dependency is one-command bootstrapped at a pinned audited commit. | Publishing/versioning RFMS as a normal package remains a possible future improvement. |
| RFS-MU2-041 | Closed | CI/local gate parity tightened; release checks cover local/CI drift. | Visual/Docker checks remain separate named gates by design. |
| RFS-MU2-042 | Closed | Named save slots with metadata and overwrite confirmation added. | Rich scenario library UX remains future product work. |
| RFS-MU2-043 | Closed | Gamepad bindings cover the meaningful loop controls and are tested through app behavior. | Device-specific controller UX may need more profiles. |
| RFS-MU2-044 | Closed | Audio settings, persistence, captions, and blocked-audio help added. | Audio immersion remains a product polish area. |
| RFS-MU2-045 | Closed | Attribution/scenery non-overlap tests and product layout handling added. | Legal/scenery entitlement strategy remains a product decision if premium tiles are used. |
| RFS-MU2-046 | Closed/guarded | Visual suite timing budgets, faster proof split, and first-retry/trace behavior added. | CI capacity variability can still happen; failures must be investigated, not hand-waved. |

## Remaining meaningful-use backlog

1. **Task 7 / final acceptance:** continuous no-store-mutation black-box route setup → takeoff → clean climb → route capture → descent/approach → landing → rollout/stop → reset.
2. **FMS/RFMS depth:** route editing UI, EXEC lifecycle, discontinuities/direct-to/holds/procedure loading.
3. **Flight model data quality:** continue replacing prototype coefficients with source-lineaged tables and tighter validation fixtures.
4. **Ground/landing realism:** broader terrain/runway surface coverage and deeper rollout/taxi/crosswind/reverse/autobrake/tire tuning.
5. **Cockpit fidelity:** make cockpit mode progressively more flyable or keep unavailable controls clearly labelled.
6. **Worker rollout:** decide when to enable the browser Worker runtime by default after parity/performance evidence.

## Closeout decision

The round-2 remediation set is complete except for the intentionally preserved full-flight Task 7 acceptance. RFS is now suitable to present as a serious, guarded, browser-native 737-800 simulator prototype with meaningful scoped playability. It should not be marketed as a complete continuous 737 route simulator until Task 7 and the remaining RFMS/FDM/ground-fidelity backlog close.
