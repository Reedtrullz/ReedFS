# RFS — complete issue assessment and implementation plan

> Current status: paused checkpoint,11/102 Done and91 open. See [current102-item disposition](2026-10-08-rfs-all-issues-checkpoint.md). Earlier counts and execution entries below are historical.

Prepared 2026-10-08 for `Reedtrullz/ReedFS`, using the `github-agent-engineering` skill. This plan covers the complete 102-issue inventory captured in this assessment: proposal issues **#59–#158**, runtime security **#160**, and development dependency security **#162**. It is an implementation program with bounded PR increments and full completion gates. None of the 100 proposals is silently excluded.

The recommended route is to finish the security work already underway, make execution and saves trustworthy, correct alert/audio behavior, establish mathematical and data-quality foundations, then build the cockpit, systems, world and practice features. Aircraft packs, offline scenery and experimental interfaces have explicit qualification tasks. Source procurement can start alongside reliability work; an unresolved aircraft-fidelity packet must not hold up unrelated correctness fixes.

## Evidence baseline and scope

- Canonical application review baseline: `b706c9bf578ea3427fb5aae4d7d7afecc693e166`.
- Canonical planning snapshot after an external merge during this assessment: `b3e3f937ac3be515ec17fdade97136fea20d580d`. [PR #161](https://github.com/Reedtrullz/ReedFS/pull/161) added runtime `pcre2` and the matching release guard. Its two changed paths do not alter application source, e2e source, manifests or the lockfile. The application assessment therefore remains applicable at this snapshot.
- The original working checkout remains `0354c3a8f402a372db05d3cf3f5b55ea3ac1f572`, with existing root documentation/proposal/subdirectory instruction WIP. It was not pulled, reset, built or used as canonical release proof. Fetch updated the remote-tracking reference only.
- `@virtual-cdu/shared` really resolves to `../RFMS/shared`. The observed sibling HEAD is `8f746b3be8a665e9b8653a0580d578934a451018`, with existing dirty files. CI/Docker pins `810fc9652da431eaf8978b85bf4af131605559b5`. Do not bootstrap the primary sibling as a shortcut; use an isolated pair for implementation.
- Node was freshly verified as `v22.22.3`. No dependency installation, simulation test, browser flight, device trial, audio listening, full-flight acceptance or live endpoint check was performed by this assessment.
- Full issue and PR bodies, Project item/field state, canonical identities and source references are retained in [the evidence directory](evidence/2026-10-08-rfs-all-issues/). The complete per-issue assessment is in [the issue ledger](2026-10-08-rfs-all-issues-ledger.md).

The initial and post-merge snapshot both contain 102 open Issues and zero closed Issues. This is not 102 demonstrated defects: many tickets propose substantial new capabilities. Each ledger entry states whether it is a source-confirmed gap, a measurement/investigation, a feature, a qualification-gated scope, or already-merged code awaiting acceptance. The custom assessment classifies **17 source-confirmed gaps, 21 validation-first scopes, 42 features/extensions, 21 qualification-gated scopes and 1 merged implementation awaiting acceptance**. This classification is independent of the current Project Confidence field.

Final bounded GitHub readback retained the same canonical HEAD and 102 open Issues. Two PRs remain open (#58 and #159); #159 is behind the new master. Canonical CodeQL `37716227825` completed successfully; CI/CD `37716227731` remains in progress and #160 remains open. These current receipts are in `final-readback.json`. They do not establish completed delivery or public acceptance.

## Planning-system assessment

[RFS — Engineering Roadmap](https://github.com/users/Reedtrullz/projects/16) exists, is accessible with the current credential, and is linked to `Reedtrullz/ReedFS`. Full readback found **105 items**, all 102 Issues plus PRs #58, #159 and #161. Nineteen fields include the six lifecycle statuses, Priority, Phase, Effort, Confidence, Category and Area. Eleven saved views cover Intake, execution, roadmap, priority, validation and category lanes; repository/view pagination reported no additional pages.

Issue metadata at the snapshot: **93 Intake, 8 Blocked, 1 In Review**; **43 P1, 47 P2, 12 P3**; **49 M, 51 L, 2 S**; **16 Confirmed, 12 Strong evidence, 74 Needs validation**. There is no Ready issue queue yet. The eight Project-blocked issues are #69, #95–#98, #149, #157 and #158. These counts describe GitHub state, not the new assessment classifications.

Setup needs a small completion step. `AGENT_WORKFLOW.md` is absent on canonical master; [PR #159](https://github.com/Reedtrullz/ReedFS/pull/159) contains the matching contract. Its recorded CI failure was the runtime image vulnerability addressed by #161. Reuse #159, refresh it after the security wave's canonical acceptance, and verify its own fresh checks. Do not create another roadmap or workflow PR. The saved Stale/Reconsider filter uses a fixed `2026-07-07` cutoff; decide whether that is intentionally fixed or should be maintained during the workflow step. Native Project automation action targets were not independently read in this assessment and remain a setup verification task.

This request authorizes assessment and a saved plan. GitHub statuses, issue bodies, labels, dependencies and PRs were not changed here. Proposed dispositions below must be applied during authorized execution after a fresh state check.

## Existing work to reuse

| Existing work | Current evidence | Next action |
| --- | --- | --- |
| [#160](https://github.com/Reedtrullz/ReedFS/issues/160) / [PR #161](https://github.com/Reedtrullz/ReedFS/pull/161) | PR merged to `b3e3f937`; issue remains open/In Review in this snapshot. Exact PR checks passed; canonical CI/CD `37716227731` and CodeQL `37716227825` were in progress. | The security task already owns delivery. Consume its canonical image/normal Pages/public revision receipts; reconcile completed issue state after all acceptance. No duplicate patch or manual redeploy. |
| [#162](https://github.com/Reedtrullz/ReedFS/issues/162) | Locked development `source-map-js` is 1.2.1. `css-tree`, `magicast` and `postcss` all declare `^1.2.1`. | Independently qualify a narrow 1.2.2 lock refresh, then clean install, audit and full native checks. |
| [PR #159](https://github.com/Reedtrullz/ReedFS/pull/159) | Existing workflow contract matches Project #16; not on master yet. | Refresh and independently qualify after security acceptance; inspect real closure automation targets and repository-specific gates. |
| [PR #58](https://github.com/Reedtrullz/ReedFS/pull/58) | CodeQL group update with recorded passing checks on older head `7d0ef7d5fedb0882526c25a2428415099851842c`. | Verify upstream SHA/tag, compatibility and fresh candidate checks against the changed master; old checks alone are insufficient. |
| [PR #46](https://github.com/Reedtrullz/ReedFS/pull/46), [#47](https://github.com/Reedtrullz/ReedFS/pull/47), [#50](https://github.com/Reedtrullz/ReedFS/pull/50), [#54](https://github.com/Reedtrullz/ReedFS/pull/54), [#57](https://github.com/Reedtrullz/ReedFS/pull/57) | Staged route editing, effective FMA/LNAV, continuous ENVA descent/autoland, Cesium worker CSP and Pages deployment already landed. | Preserve these behaviors while extending the corresponding issues; they do not satisfy the new broader proposals in full. |

The [primary source-map-js release](https://github.com/7rulnik/source-map-js/releases/tag/v1.2.2), [GitHub advisory](https://github.com/advisories/GHSA-68fv-2mgg-jv7q), and registry metadata were checked. The advisory identifies 1.2.2 as patched. The current ranges admit that patch; this assessment did not install or audit a changed candidate. Do not claim that the proposed lock change is already qualified.

## Dependency and PR rules

The original proposal IDs are **RFS-01–RFS-100**; their GitHub issue numbers are **proposal ID + 58**. The ledger resolves both identities. Each issue has two dependency sets:

1. **First-PR prerequisites:** the minimal inputs required for its first concrete increment. These form a verified acyclic graph.
2. **Full-scope dependencies:** the original proposal dependencies and qualification gates needed for all claimed behavior. A first increment does not erase these.

Waves order the starting work and shared-file ownership. They are not barriers that require every large/source-gated issue in a wave to close before an unrelated next-wave increment can start. Within a wave follow the graph, not numeric issue order. Ship one coherent concern per PR; split large Issues into linked PRs or native sub-issues only when the pieces have independent acceptance. Keep the canonical Issue open while any required residual remains.

Important refinements:

- #69 supplies per-group aircraft qualification. Mathematics, protocol validation, save preservation, source labeling and generic atmosphere correctness can proceed with independently derived fixtures while retaining placeholder aircraft data. Aircraft-specific tolerance/fidelity remains gated.
- #102 master mute, #103 audio lifecycle and #104 COM/ATIS do not require completing #59 UI or #113 NAV. Keep COM and radio-navigation validity distinct.
- #93 profile plumbing can use the existing 737 and a synthetic single-engine fixture before a qualified new pack. #99 validates existing assets before #93. Neither fixture is a shipped aircraft.
- #63 starts with one PFD; its ND component follows #78. #147 coherent overlay snapshots precede #63/#116. #148 can probe context loss on the current aircraft before multi-pack loading.
- #150 local diagnostic export depends on invalid-state containment, while its optional capsule waits for #126. It should not wait for a complete recorder product.
- Implement **#154-A finite trigger/command contract** before **#89-A mission import** and **#117-A instructor actions**, then finish **#154-B integration**. The full-ticket wording mentions authoring/instructor dependencies; treating those as a single indivisible prerequisite would postpone the protection until after its consumers.
- #88 state playback, #126 input re-simulation and #150 support export remain separate outcomes. #90 batch latency, #123 command ordering and #147 instrument coherence also retain separate acceptance.
- #84 scenery, #83 physical surface, #143 authored collision and #149 lawful offline coverage are different claims. A rendered building or cached app shell cannot satisfy the others.

## Execution waves

| Wave | Issues (all included) | Purpose |
| --- | --- | --- |
| W00 — Security and workflow completion | [#160](https://github.com/Reedtrullz/ReedFS/issues/160), [#162](https://github.com/Reedtrullz/ReedFS/issues/162) | Reuse active security/workflow ownership; qualify remaining dependency/action maintenance. |
| W01 — Validation, saves and reproducible builds | [#91](https://github.com/Reedtrullz/ReedFS/issues/91), [#92](https://github.com/Reedtrullz/ReedFS/issues/92), [#124](https://github.com/Reedtrullz/ReedFS/issues/124), [#125](https://github.com/Reedtrullz/ReedFS/issues/125), [#152](https://github.com/Reedtrullz/ReedFS/issues/152) | Establish durable/execution trust; prevent save loss and retain invalid-state evidence. |
| W02 — Runtime, alerts, audio and browser recovery | [#90](https://github.com/Reedtrullz/ReedFS/issues/90), [#100](https://github.com/Reedtrullz/ReedFS/issues/100), [#101](https://github.com/Reedtrullz/ReedFS/issues/101), [#102](https://github.com/Reedtrullz/ReedFS/issues/102), [#103](https://github.com/Reedtrullz/ReedFS/issues/103), [#107](https://github.com/Reedtrullz/ReedFS/issues/107), [#118](https://github.com/Reedtrullz/ReedFS/issues/118), [#123](https://github.com/Reedtrullz/ReedFS/issues/123), [#147](https://github.com/Reedtrullz/ReedFS/issues/147), [#148](https://github.com/Reedtrullz/ReedFS/issues/148), [#150](https://github.com/Reedtrullz/ReedFS/issues/150) | Measure responsiveness and make command/warning/session/update/display truth explicit. |
| W03 — Mathematics, atmosphere, clock and reference conventions | [#69](https://github.com/Reedtrullz/ReedFS/issues/69), [#70](https://github.com/Reedtrullz/ReedFS/issues/70), [#71](https://github.com/Reedtrullz/ReedFS/issues/71), [#74](https://github.com/Reedtrullz/ReedFS/issues/74), [#82](https://github.com/Reedtrullz/ReedFS/issues/82), [#120](https://github.com/Reedtrullz/ReedFS/issues/120), [#132](https://github.com/Reedtrullz/ReedFS/issues/132), [#134](https://github.com/Reedtrullz/ReedFS/issues/134), [#136](https://github.com/Reedtrullz/ReedFS/issues/136) | Derive independently and qualify data groups while preserving uncertainty. |
| W04 — Workspace, input, cockpit and model contracts | [#59](https://github.com/Reedtrullz/ReedFS/issues/59), [#60](https://github.com/Reedtrullz/ReedFS/issues/60), [#61](https://github.com/Reedtrullz/ReedFS/issues/61), [#62](https://github.com/Reedtrullz/ReedFS/issues/62), [#63](https://github.com/Reedtrullz/ReedFS/issues/63), [#64](https://github.com/Reedtrullz/ReedFS/issues/64), [#65](https://github.com/Reedtrullz/ReedFS/issues/65), [#66](https://github.com/Reedtrullz/ReedFS/issues/66), [#78](https://github.com/Reedtrullz/ReedFS/issues/78), [#85](https://github.com/Reedtrullz/ReedFS/issues/85), [#93](https://github.com/Reedtrullz/ReedFS/issues/93), [#99](https://github.com/Reedtrullz/ReedFS/issues/99), [#133](https://github.com/Reedtrullz/ReedFS/issues/133), [#135](https://github.com/Reedtrullz/ReedFS/issues/135), [#151](https://github.com/Reedtrullz/ReedFS/issues/151) | Create usable controls and shared instrument/profile/asset contracts. |
| W05 — Surfaces, weather, contact and aircraft presentation | [#67](https://github.com/Reedtrullz/ReedFS/issues/67), [#68](https://github.com/Reedtrullz/ReedFS/issues/68), [#72](https://github.com/Reedtrullz/ReedFS/issues/72), [#73](https://github.com/Reedtrullz/ReedFS/issues/73), [#80](https://github.com/Reedtrullz/ReedFS/issues/80), [#81](https://github.com/Reedtrullz/ReedFS/issues/81), [#83](https://github.com/Reedtrullz/ReedFS/issues/83), [#84](https://github.com/Reedtrullz/ReedFS/issues/84), [#86](https://github.com/Reedtrullz/ReedFS/issues/86) | Align visual/physical surfaces before changing contact shields and mechanics. |
| W06 — Systems, observations and energy-aware flight | [#75](https://github.com/Reedtrullz/ReedFS/issues/75), [#76](https://github.com/Reedtrullz/ReedFS/issues/76), [#77](https://github.com/Reedtrullz/ReedFS/issues/77), [#108](https://github.com/Reedtrullz/ReedFS/issues/108), [#110](https://github.com/Reedtrullz/ReedFS/issues/110), [#112](https://github.com/Reedtrullz/ReedFS/issues/112), [#113](https://github.com/Reedtrullz/ReedFS/issues/113), [#127](https://github.com/Reedtrullz/ReedFS/issues/127), [#131](https://github.com/Reedtrullz/ReedFS/issues/131) | Connect causal availability to commands, observations and autoflight. |
| W07 — Practice, recorder, navigation data and session workflows | [#79](https://github.com/Reedtrullz/ReedFS/issues/79), [#87](https://github.com/Reedtrullz/ReedFS/issues/87), [#88](https://github.com/Reedtrullz/ReedFS/issues/88), [#94](https://github.com/Reedtrullz/ReedFS/issues/94), [#104](https://github.com/Reedtrullz/ReedFS/issues/104), [#105](https://github.com/Reedtrullz/ReedFS/issues/105), [#106](https://github.com/Reedtrullz/ReedFS/issues/106), [#109](https://github.com/Reedtrullz/ReedFS/issues/109), [#115](https://github.com/Reedtrullz/ReedFS/issues/115), [#116](https://github.com/Reedtrullz/ReedFS/issues/116), [#119](https://github.com/Reedtrullz/ReedFS/issues/119), [#126](https://github.com/Reedtrullz/ReedFS/issues/126), [#137](https://github.com/Reedtrullz/ReedFS/issues/137), [#146](https://github.com/Reedtrullz/ReedFS/issues/146), [#153](https://github.com/Reedtrullz/ReedFS/issues/153) | Use observed state and versioned inputs for practice, replay, navigation and session workflows. |
| W08 — Mission execution, traffic and supported abnormal systems | [#89](https://github.com/Reedtrullz/ReedFS/issues/89), [#111](https://github.com/Reedtrullz/ReedFS/issues/111), [#114](https://github.com/Reedtrullz/ReedFS/issues/114), [#117](https://github.com/Reedtrullz/ReedFS/issues/117), [#128](https://github.com/Reedtrullz/ReedFS/issues/128), [#129](https://github.com/Reedtrullz/ReedFS/issues/129), [#130](https://github.com/Reedtrullz/ReedFS/issues/130), [#138](https://github.com/Reedtrullz/ReedFS/issues/138), [#140](https://github.com/Reedtrullz/ReedFS/issues/140), [#141](https://github.com/Reedtrullz/ReedFS/issues/141), [#143](https://github.com/Reedtrullz/ReedFS/issues/143), [#144](https://github.com/Reedtrullz/ReedFS/issues/144), [#154](https://github.com/Reedtrullz/ReedFS/issues/154) | Install finite workflows and explicit actor/fault mechanisms. |
| W09 — Wake, airport advisories and offline practice | [#139](https://github.com/Reedtrullz/ReedFS/issues/139), [#142](https://github.com/Reedtrullz/ReedFS/issues/142), [#145](https://github.com/Reedtrullz/ReedFS/issues/145), [#149](https://github.com/Reedtrullz/ReedFS/issues/149) | Build bounded fields/advisories/offline coverage on authoritative identities. |
| W10 — Additional aircraft packs | [#95](https://github.com/Reedtrullz/ReedFS/issues/95), [#96](https://github.com/Reedtrullz/ReedFS/issues/96), [#97](https://github.com/Reedtrullz/ReedFS/issues/97), [#98](https://github.com/Reedtrullz/ReedFS/issues/98) | Complete distinct pack data/propulsion/assets/handling or explicit exploration results. |
| W11 — Effects, haptics and creative tools | [#121](https://github.com/Reedtrullz/ReedFS/issues/121), [#122](https://github.com/Reedtrullz/ReedFS/issues/122), [#155](https://github.com/Reedtrullz/ReedFS/issues/155), [#156](https://github.com/Reedtrullz/ReedFS/issues/156) | Use qualified templates/emitters and real device/capture probes. |
| W12 — XR and shared-cockpit feasibility | [#157](https://github.com/Reedtrullz/ReedFS/issues/157), [#158](https://github.com/Reedtrullz/ReedFS/issues/158) | Produce actual headset results or reviewed network authority design before broader commitment. |

## First execution queue

The next implementation session should refresh master, issues, active PRs and the existing security task's receipts, then take this bounded sequence. It must not repeat work another task has completed while this document was being prepared.

1. Finish/reuse #160's acceptance and #159's existing workflow PR; qualify #162 separately and refresh #58. Preserve every native audit/release threshold and the shared pin.
2. #92-A exact dependency identity and current evidence matrix. Establish an isolated RFS/RFMS pair before running gates; verify the actual Node runtime.
3. #124 bounded execution requests and responses, including the real worker failure listener. This unlocks contained recovery and later command/capsule work.
4. #91-A weather round-trip, strict nested state checks and corruption-safe writes. Include explicit paused restore and no lost neighboring saves.
5. #125 last-valid checkpoint recovery and #152 storage-conflict reproduction/solution. Keep numerical failure distinct from gameplay crash behavior.
6. #100 GPWS predicates/priority, then #102 master silence and #103 context lifecycle as focused PRs. #101 and #107 build on these fixes.
7. #90 measurable batch/input budgets → #123 command revisions → #147 coherent instrument snapshots. Measure before introducing interpolation or batching architecture.
8. #118 staged PWA update/cohort behavior and #120 route-boundary fixtures. These can proceed independently once their own prerequisites pass.
9. Start #69 source acquisition and #70 analytic derivation alongside the safe reliability work. Follow with #74 atmosphere/idle and #132 speed-definition consistency.
10. Begin the #59/#85 user-control lane and #83 surface-authority lane. Source-gated cockpit/aircraft art can prepare lawful packets in parallel without blocking usable existing controls.

## Verification by claim

| Claim | Required evidence |
| --- | --- |
| Execution/save/import correctness | Negative finite/range/version/identity cases; stale worker and corruption/quota/two-tab cases; actual browser worker/storage when relevant. |
| Force, frame, speed or conservation correctness | Independently derived analytic fixtures, signs/units, timestep refinement and raw residuals. Smooth internal traces alone do not prove the equations. |
| Source-qualified aircraft behavior | Exact licensed/citable data group, applicability and units; independent holdout cases with justified tolerances; runtime-consumption lineage. |
| AP/FMS/ground-air progress | Preserve selected visible-control black-box tests and effective FMA/RETARD/authority guards; run affected continuous routes, including separate ENVA/ENGM and KSEA/KPDX evidence. |
| UI/cockpit/scene behavior | Responsive/keyboard/zoom/browser checks plus actual real-scene and day/night visual review; seeded screenshots retain their limited claim. |
| Audio | Actual numerical renders and adverse controls, browser queue/context checks, then short human listening for changed content. Mocks and waveform peaks do not prove intelligibility. |
| Controller/touch/haptic/XR support | Specific real device/browser evidence; feature detection or mocks establish only the unsupported/fallback path. |
| Network/shared cockpit | Reviewed authority/security/latency design; separately authorized two-client probe with adverse transport and unauthorized command cases. |
| Release completion | Fresh exact-candidate required CI, then authorized canonical delivery and exact public identity where the Issue requires it; verify Issue closure/Project Done. |

For implementation use the existing manifest and CI contract: Node 22, isolated pinned sibling, `npm ci --legacy-peer-deps`, then applicable checks. Full code PR qualification uses `npm run check`, selected `npm run test:e2e`, `npm run test:visual`, worker smoke where affected, and the separate full-flight lane for flight-model/autoflight/contact changes. Keep secret scan, CodeQL, container health/image and bundle gates intact. #92 adds the missing dedicated KSEA/KPDX continuous lane; do not claim its command already exists.

Before long local loops, follow disk policy (`df -h /System/Volumes/Data`, stop below 30 GiB). Prefer bounded target checks locally and normal native CI for the full expensive suite. Re-run or broaden only for a change, failure or unresolved question. Hardware/listening/pilot acceptance remains a concrete separate item, not an indefinite endurance gate.

## Full completion and handling gates

All 102 issues have a delivery path. Some paths include evidence procurement or feasibility output before implementation can be accepted. Those gates stay visible rather than being replaced with invented constants, unlicensed content or mock acceptance:

- **Aircraft/physics:** #69 and aircraft-dependent #71/#72/#73/#75/#77/#93/#95–#98/#110–#112/#128–#138 need the relevant qualified groups for their stronger claims. Qualify groups independently; preserve explicit uncertainty for the rest.
- **Visual/content rights:** #62/#66/#68/#84/#95–#99/#106/#113/#128/#129/#130/#131/#141/#146/#149 need appropriate references/assets/data. Existing OurAirports runway endpoints are usable within their documented geometric boundary; they are not procedures, terrain or an unrestricted scenery license.
- **Devices:** #60/#85/#121/#157 need actual target-device trials for support claims. Implement deterministic fallbacks and cancellation without waiting for a claim the current hardware cannot establish.
- **Offline pack:** #149 must prove redistribution/storage rights and bounded physical coverage; network tile access does not establish those rights.
- **Feasibility issues:** #97/#98 exploration and #157/#158 investigation/design must produce concrete results. A measured incompatible result can finish an explicitly scoped research increment, while an unbuilt product remains unbuilt. Full VR/service/hosting adoption follows an explicit reviewed decision and required authorization.

During execution, propose Ready only for a bounded, adequately evidenced, unblocked increment or explicit investigation. Represent full residual scope and source gates in the parent. Existing Project-blocked issues stay blocked until their gate is actually met. The plan's order is not a status change.

After an authorized merge, revalidate against canonical code and the Issue's full acceptance. Use closing references only for fully resolved Issues. Keep partials open, update residuals/dependencies when authorized, and read back closure reason and Project Done. A first increment must not close its parent while required scope remains.

## Coverage and delivery ledger

| Issue | Scope | Wave | Current Project / priority / effort | Assessment | First-PR prerequisites |
| --- | --- | --- | --- | --- | --- |
| [#160](2026-10-08-rfs-all-issues-ledger.md#issue-160) | Refresh runtime pcre2 to clear four HIGH image advisories | W00 | In Review / P1 / S | Merged code; acceptance pending | None |
| [#162](2026-10-08-rfs-all-issues-ledger.md#issue-162) | Refresh the remaining HIGH development source-map-js dependency | W00 | Intake / P1 / S | Source-confirmed gap | None |
| [#91](2026-10-08-rfs-all-issues-ledger.md#issue-91) | Harden saves and restore the exact flying conditions | W01 | Intake / P1 / M | Source-confirmed gap | None |
| [#92](2026-10-08-rfs-all-issues-ledger.md#issue-92) | Make improvement acceptance reproducible and current | W01 | Intake / P1 / M | Source-confirmed gap | None |
| [#124](2026-10-08-rfs-all-issues-ledger.md#issue-124) | Validate worker payloads and contain protocol failures | W01 | Intake / P1 / M | Source-confirmed gap | None |
| [#125](2026-10-08-rfs-all-issues-ledger.md#issue-125) | Pause and preserve evidence when simulation state becomes invalid | W01 | Intake / P1 / M | Validation / investigation first | #124 |
| [#152](2026-10-08-rfs-all-issues-ledger.md#issue-152) | Prevent cross-tab save loss and make quota failures recoverable | W01 | Intake / P1 / M | Validation / investigation first | #91 |
| [#90](2026-10-08-rfs-all-issues-ledger.md#issue-90) | Protect input latency while physics catches up | W02 | Intake / P1 / M | Validation / investigation first | None |
| [#100](2026-10-08-rfs-all-issues-ledger.md#issue-100) | Make GPWS warnings depend on the condition they name | W02 | Intake / P1 / M | Source-confirmed gap | None |
| [#101](2026-10-08-rfs-all-issues-ledger.md#issue-101) | Introduce a priority-aware alert and speech queue | W02 | Intake / P1 / M | Source-confirmed gap | #100, #103 |
| [#102](2026-10-08-rfs-all-issues-ledger.md#issue-102) | Give speech and sounds one understandable mixer | W02 | Intake / P1 / M | Source-confirmed gap | None |
| [#103](2026-10-08-rfs-all-issues-ledger.md#issue-103) | Make audio follow the flight session lifecycle | W02 | Intake / P1 / M | Source-confirmed gap | None |
| [#107](2026-10-08-rfs-all-issues-ledger.md#issue-107) | Verify the rendered audio, not only its mocks | W02 | Intake / P1 / M | Validation / investigation first | #101, #102, #103 |
| [#118](2026-10-08-rfs-all-issues-ledger.md#issue-118) | Defer PWA updates until a safe session boundary | W02 | Intake / P1 / M | Validation / investigation first | #91, #124 |
| [#123](2026-10-08-rfs-all-issues-ledger.md#issue-123) | Order commands at explicit simulation boundaries | W02 | Intake / P1 / L | Validation / investigation first | #90, #124 |
| [#147](2026-10-08-rfs-all-issues-ledger.md#issue-147) | Render instruments from coherent, age-labeled simulation snapshots | W02 | Intake / P1 / M | Validation / investigation first | #123 |
| [#148](2026-10-08-rfs-all-issues-ledger.md#issue-148) | Recover from GPU context loss without losing the flight | W02 | Intake / P1 / M | Validation / investigation first | #125 |
| [#150](2026-10-08-rfs-all-issues-ledger.md#issue-150) | Add a privacy-reviewed diagnostic flight bundle | W02 | Intake / P1 / M | Feature or extension | #125, #91 |
| [#69](2026-10-08-rfs-all-issues-ledger.md#issue-69) | Replace placeholder tuning with a source-qualified FDM envelope | W03 | Blocked / P1 / L | Qualification-gated scope | None |
| [#70](2026-10-08-rfs-all-issues-ledger.md#issue-70) | Audit force frames and rigid-body integration | W03 | Intake / P1 / M | Validation / investigation first | None |
| [#71](2026-10-08-rfs-all-issues-ledger.md#issue-71) | Make configuration changes and stall behavior continuous | W03 | Intake / P2 / M | Source-confirmed gap | #70 |
| [#74](2026-10-08-rfs-all-issues-ledger.md#issue-74) | Give the engines correct idle semantics and weather-consistent thrust | W03 | Intake / P1 / M | Source-confirmed gap | None |
| [#82](2026-10-08-rfs-all-issues-ledger.md#issue-82) | Use one simulation clock for sun, cockpit and weather | W03 | Intake / P2 / M | Source-confirmed gap | #91 |
| [#120](2026-10-08-rfs-all-issues-ledger.md#issue-120) | Make route geometry robust at coordinate boundaries | W03 | Intake / P1 / M | Source-confirmed gap | None |
| [#132](2026-10-08-rfs-all-issues-ledger.md#issue-132) | Distinguish equivalent, calibrated and indicated airspeed | W03 | Intake / P1 / M | Validation / investigation first | #74 |
| [#134](2026-10-08-rfs-all-issues-ledger.md#issue-134) | Make true, magnetic and grid heading references explicit | W03 | Intake / P1 / L | Feature or extension | #120 |
| [#136](2026-10-08-rfs-all-issues-ledger.md#issue-136) | Initialize airborne scenarios from a complete equilibrium solution | W03 | Intake / P2 / L | Validation / investigation first | #70, #74, #132 |
| [#59](2026-10-08-rfs-all-issues-ledger.md#issue-59) | Replace overlay clutter with a flight-first workspace | W04 | Intake / P1 / M | Feature or extension | None |
| [#60](2026-10-08-rfs-all-issues-ledger.md#issue-60) | Add genuinely usable touch and accessible flight controls | W04 | Intake / P1 / M | Feature or extension | #59 |
| [#61](2026-10-08-rfs-all-issues-ledger.md#issue-61) | Turn preflight setup into a compact electronic flight bag | W04 | Intake / P2 / M | Feature or extension | #59 |
| [#62](2026-10-08-rfs-all-issues-ledger.md#issue-62) | Rebuild cockpit geometry around a believable pilot eye point | W04 | Intake / P1 / L | Qualification-gated scope | None |
| [#63](2026-10-08-rfs-all-issues-ledger.md#issue-63) | Put live instruments on the cockpit panels | W04 | Intake / P1 / L | Validation / investigation first | #62, #147 |
| [#64](2026-10-08-rfs-all-issues-ledger.md#issue-64) | Replace cockpit click shortcuts with real manipulation | W04 | Intake / P1 / M | Source-confirmed gap | #62, #123 |
| [#65](2026-10-08-rfs-all-issues-ledger.md#issue-65) | Make cameras useful flying instruments | W04 | Intake / P1 / M | Feature or extension | None |
| [#66](2026-10-08-rfs-all-issues-ledger.md#issue-66) | Give the exterior a convincing 737-800 silhouette | W04 | Intake / P1 / L | Qualification-gated scope | None |
| [#78](2026-10-08-rfs-all-issues-ledger.md#issue-78) | Add an ND and extend staged FMS editing | W04 | Intake / P2 / L | Feature or extension | #59, #120 |
| [#85](2026-10-08-rfs-all-issues-ledger.md#issue-85) | Add device profiles and real calibration | W04 | Intake / P1 / M | Source-confirmed gap | None |
| [#93](2026-10-08-rfs-all-issues-ledger.md#issue-93) | Make the selected aircraft a complete simulation contract | W04 | Intake / P1 / L | Feature or extension | #91, #124 |
| [#99](2026-10-08-rfs-all-issues-ledger.md#issue-99) | Add aircraft asset preflight and bounded loading | W04 | Intake / P1 / M | Feature or extension | None |
| [#133](2026-10-08-rfs-all-issues-ledger.md#issue-133) | Add pilot barometric settings and transition-aware indications | W04 | Intake / P1 / M | Feature or extension | #91, #132, #147 |
| [#135](2026-10-08-rfs-all-issues-ledger.md#issue-135) | Add source-aware speed limits and trends to the PFD | W04 | Intake / P2 / M | Qualification-gated scope | #93, #132, #147 |
| [#151](2026-10-08-rfs-all-issues-ledger.md#issue-151) | Separate presentation language and units from simulation values | W04 | Intake / P2 / M | Feature or extension | #59, #60, #93 |
| [#67](2026-10-08-rfs-all-issues-ledger.md#issue-67) | Animate actual aircraft mechanics, not whole assemblies | W05 | Intake / P2 / L | Feature or extension | #66, #72 |
| [#68](2026-10-08-rfs-all-issues-ledger.md#issue-68) | Add aircraft surface detail and readable lighting | W05 | Intake / P2 / M | Qualification-gated scope | #66, #82 |
| [#72](2026-10-08-rfs-all-issues-ledger.md#issue-72) | Let rotation, touchdown and bounce emerge from contact forces | W05 | Intake / P1 / L | Validation / investigation first | #70, #125, #83 |
| [#73](2026-10-08-rfs-all-issues-ledger.md#issue-73) | Model a complete landing and rejected-takeoff braking chain | W05 | Intake / P2 / L | Feature or extension | #72, #74 |
| [#80](2026-10-08-rfs-all-issues-ledger.md#issue-80) | Replace flat gust waves with a spatial, repeatable atmosphere | W05 | Intake / P2 / M | Feature or extension | #70, #82 |
| [#81](2026-10-08-rfs-all-issues-ledger.md#issue-81) | Make weather visibility match the flying conditions | W05 | Intake / P2 / M | Source-confirmed gap | #82 |
| [#83](2026-10-08-rfs-all-issues-ledger.md#issue-83) | Unify rendered and physical surfaces, including runway edits | W05 | Intake / P1 / L | Source-confirmed gap | #91, #120 |
| [#84](2026-10-08-rfs-all-issues-ledger.md#issue-84) | Build small, flyable airport environments | W05 | Intake / P2 / L | Qualification-gated scope | #83, #82 |
| [#86](2026-10-08-rfs-all-issues-ledger.md#issue-86) | Make sound convey aircraft state and camera position | W05 | Intake / P2 / M | Feature or extension | #65, #74, #102, #103 |
| [#75](2026-10-08-rfs-all-issues-ledger.md#issue-75) | Make loading, fuel imbalance and engine asymmetry matter | W06 | Intake / P2 / L | Feature or extension | #70, #74 |
| [#76](2026-10-08-rfs-all-issues-ledger.md#issue-76) | Connect electrical and hydraulic systems to real consequences | W06 | Intake / P2 / L | Feature or extension | #74 |
| [#77](2026-10-08-rfs-all-issues-ledger.md#issue-77) | Make autoflight energy-aware across the flight envelope | W06 | Intake / P1 / L | Validation / investigation first | #70, #74, #132 |
| [#108](2026-10-08-rfs-all-issues-ledger.md#issue-108) | Add a cold-and-dark startup with real enabling conditions | W06 | Intake / P2 / L | Feature or extension | #64, #74, #76 |
| [#110](2026-10-08-rfs-all-issues-ledger.md#issue-110) | Separate aircraft truth from faulty air-data indications | W06 | Intake / P1 / L | Feature or extension | #76, #132, #147 |
| [#112](2026-10-08-rfs-all-issues-ledger.md#issue-112) | Add optional structural and configuration-limit consequences | W06 | Intake / P2 / L | Feature or extension | #70, #71, #72 |
| [#113](2026-10-08-rfs-all-issues-ledger.md#issue-113) | Add tuned raw radio navigation with signal identity | W06 | Intake / P1 / L | Qualification-gated scope | #78, #147, #120 |
| [#127](2026-10-08-rfs-all-issues-ledger.md#issue-127) | Add a coherent master-warning and system-annunciation layer | W06 | Intake / P1 / L | Feature or extension | #76, #101, #147 |
| [#131](2026-10-08-rfs-all-issues-ledger.md#issue-131) | Add an explicit yaw-damper and rudder-authority model | W06 | Intake / P2 / L | Qualification-gated scope | #70, #76 |
| [#79](2026-10-08-rfs-all-issues-ledger.md#issue-79) | Add complete missed-approach and abnormal-flight exercises | W07 | Intake / P3 / L | Feature or extension | #75, #76, #77, #87 |
| [#87](2026-10-08-rfs-all-issues-ledger.md#issue-87) | Turn the checklist coach into truthful, phased practice | W07 | Intake / P2 / M | Source-confirmed gap | #59 |
| [#88](2026-10-08-rfs-all-issues-ledger.md#issue-88) | Add a bounded flight recorder, replay and debrief | W07 | Intake / P3 / L | Feature or extension | #90, #91, #123, #87 |
| [#94](2026-10-08-rfs-all-issues-ledger.md#issue-94) | Add an honest aircraft hangar and selection workflow | W07 | Intake / P2 / M | Feature or extension | #59, #91, #93, #99 |
| [#104](2026-10-08-rfs-all-issues-ledger.md#issue-104) | Add a local radio desk with ATIS and scripted ATC | W07 | Intake / P2 / L | Feature or extension | #101, #102, #82 |
| [#105](2026-10-08-rfs-all-issues-ledger.md#issue-105) | Add a procedural crew that reports observed state | W07 | Intake / P2 / M | Feature or extension | #101, #102, #87 |
| [#106](2026-10-08-rfs-all-issues-ledger.md#issue-106) | Make sound packs inspectable, licensed and aircraft-specific | W07 | Intake / P2 / M | Feature or extension | #93, #102, #86 |
| [#109](2026-10-08-rfs-all-issues-ledger.md#issue-109) | Model cabin pressure and environmental-system consequences | W07 | Intake / P2 / L | Feature or extension | #76, #108, #127 |
| [#115](2026-10-08-rfs-all-issues-ledger.md#issue-115) | Extend a flight from parking brake to parking brake | W07 | Intake / P2 / L | Feature or extension | #72, #73, #84, #108 |
| [#116](2026-10-08-rfs-all-issues-ledger.md#issue-116) | Support a local companion instrument window safely | W07 | Intake / P2 / M | Validation / investigation first | #63, #123, #124, #147 |
| [#119](2026-10-08-rfs-all-issues-ledger.md#issue-119) | Add an in-flight diversion and alternate worksheet | W07 | Intake / P2 / M | Feature or extension | #61, #75, #78, #81 |
| [#126](2026-10-08-rfs-all-issues-ledger.md#issue-126) | Add deterministic re-simulation capsules with honest drift reports | W07 | Intake / P1 / L | Feature or extension | #82, #88, #91, #123 |
| [#137](2026-10-08-rfs-all-issues-ledger.md#issue-137) | Build a bounded flight-model identification workbench | W07 | Intake / P2 / L | Validation / investigation first | #69, #126, #136 |
| [#146](2026-10-08-rfs-all-issues-ledger.md#issue-146) | Establish navigation-database identity and supported procedure semantics | W07 | Intake / P2 / L | Qualification-gated scope | #78, #113, #120, #134 |
| [#153](2026-10-08-rfs-all-issues-ledger.md#issue-153) | Build an opt-in practice progression from demonstrated skills | W07 | Intake / P2 / M | Feature or extension | #87, #88, #91, #93 |
| [#89](2026-10-08-rfs-all-issues-ledger.md#issue-89) | Add a local mission designer and shareable practice packets | W08 | Intake / P3 / L | Feature or extension | #91, #87, #154 |
| [#111](2026-10-08-rfs-all-issues-ledger.md#issue-111) | Give icing and anti-ice bounded physical consequences | W08 | Intake / P2 / L | Qualification-gated scope | #69, #71, #80, #108, #110 |
| [#114](2026-10-08-rfs-all-issues-ledger.md#issue-114) | Add deterministic local traffic with honest scope | W08 | Intake / P2 / L | Feature or extension | #84, #93, #99, #82 |
| [#117](2026-10-08-rfs-all-issues-ledger.md#issue-117) | Add a local live instructor station | W08 | Intake / P2 / M | Feature or extension | #89, #110, #123 |
| [#128](2026-10-08-rfs-all-issues-ledger.md#issue-128) | Add a bounded engine-fire and suppression exercise | W08 | Intake / P2 / L | Qualification-gated scope | #74, #76, #108, #127 |
| [#129](2026-10-08-rfs-all-issues-ledger.md#issue-129) | Model actuator position and asymmetric configuration faults | W08 | Intake / P2 / L | Qualification-gated scope | #67, #71, #76, #127 |
| [#130](2026-10-08-rfs-all-issues-ledger.md#issue-130) | Add stabilizer-runaway, cutout and trim-authority behavior | W08 | Intake / P2 / L | Qualification-gated scope | #64, #76, #127 |
| [#138](2026-10-08-rfs-all-issues-ledger.md#issue-138) | Define a source-qualified high-altitude Mach and buffet envelope | W08 | Intake / P2 / L | Qualification-gated scope | #69, #71, #132, #137 |
| [#140](2026-10-08-rfs-all-issues-ledger.md#issue-140) | Add synthetic convective cells and a truthful weather-radar display | W08 | Intake / P3 / L | Feature or extension | #78, #80, #82, #147 |
| [#141](2026-10-08-rfs-all-issues-ledger.md#issue-141) | Add a source-aware terrain corridor and clearance display | W08 | Intake / P2 / L | Qualification-gated scope | #78, #83, #110 |
| [#143](2026-10-08-rfs-all-issues-ledger.md#issue-143) | Give authored obstacles collision semantics independent of scenery meshes | W08 | Intake / P2 / L | Feature or extension | #72, #83, #99, #112 |
| [#144](2026-10-08-rfs-all-issues-ledger.md#issue-144) | Add inertial-navigation alignment and position-source integrity | W08 | Intake / P2 / L | Feature or extension | #76, #78, #110, #134 |
| [#154](2026-10-08-rfs-all-issues-ledger.md#issue-154) | Keep mission triggers finite, declarative and reversible | W08 | Intake / P1 / M | Feature or extension | #123, #124 |
| [#139](2026-10-08-rfs-all-issues-ledger.md#issue-139) | Add scripted wake encounters with persistent vortex fields | W09 | Intake / P3 / L | Qualification-gated scope | #69, #80, #114, #126 |
| [#142](2026-10-08-rfs-all-issues-ledger.md#issue-142) | Detect wrong-runway alignment and authored surface incursions | W09 | Intake / P2 / M | Feature or extension | #84, #114, #115, #134 |
| [#145](2026-10-08-rfs-all-issues-ledger.md#issue-145) | Add transponder state and clearly simulated traffic advisories | W09 | Intake / P3 / L | Validation / investigation first | #101, #110, #114, #144, #147 |
| [#149](2026-10-08-rfs-all-issues-ledger.md#issue-149) | Package one lawful offline practice airport | W09 | Blocked / P2 / L | Qualification-gated scope | #83, #84, #99, #118, #152 |
| [#95](2026-10-08-rfs-all-issues-ledger.md#issue-95) | Add a genuinely distinct 737 family variant | W10 | Blocked / P2 / L | Qualification-gated scope | #66, #69, #93, #99 |
| [#96](2026-10-08-rfs-all-issues-ledger.md#issue-96) | Add a light piston trainer with its own flight character | W10 | Blocked / P2 / L | Qualification-gated scope | #69, #71, #72, #93, #99 |
| [#97](2026-10-08-rfs-all-issues-ledger.md#issue-97) | Explore a regional turboprop and short-field route pack | W10 | Blocked / P3 / L | Qualification-gated scope | #69, #73, #84, #93, #99 |
| [#98](2026-10-08-rfs-all-issues-ledger.md#issue-98) | Explore a glider energy laboratory | W10 | Blocked / P3 / L | Qualification-gated scope | #69, #71, #80, #93, #99 |
| [#121](2026-10-08-rfs-all-issues-ledger.md#issue-121) | Add optional, bounded haptic flight feedback | W11 | Intake / P3 / M | Validation / investigation first | #72, #85 |
| [#122](2026-10-08-rfs-all-issues-ledger.md#issue-122) | Make aircraft effects match their emitters and conditions | W11 | Intake / P2 / M | Feature or extension | #67, #81, #82, #93, #99 |
| [#155](2026-10-08-rfs-all-issues-ledger.md#issue-155) | Add flight-aware photo capture with honest provenance | W11 | Intake / P2 / M | Validation / investigation first | #65, #88, #99 |
| [#156](2026-10-08-rfs-all-issues-ledger.md#issue-156) | Add a bounded original-livery workshop | W11 | Intake / P3 / M | Feature or extension | #68, #93, #99 |
| [#157](2026-10-08-rfs-all-issues-ledger.md#issue-157) | Investigate VR without committing the main runtime to it | W12 | Blocked / P3 / L | Validation / investigation first | #62, #63, #64, #99, #147 |
| [#158](2026-10-08-rfs-all-issues-ledger.md#issue-158) | Design a single-authority shared-cockpit experiment | W12 | Blocked / P3 / L | Validation / investigation first | #116, #123, #124, #126, #147 |

Detailed entries, implementation steps, source links, prerequisite explanations, targeted verification and full acceptance appear in [the complete issue ledger](2026-10-08-rfs-all-issues-ledger.md). The machine-readable custom work items and captured GitHub/source receipts are in [evidence/2026-10-08-rfs-all-issues](evidence/2026-10-08-rfs-all-issues/).

## Assessment verification and limits

Document verification passed: **102 unique issue entries**, exact inventory/Project coverage, valid dependency references, acyclic original and first-increment graphs, wave-ordered first prerequisites, **101 canonical source path/hash checks**, local Markdown links/anchors, fences and whitespace. `git diff --check` passed and existing WIP was preserved. The hash receipt is `evidence/2026-10-08-rfs-all-issues/verification.json`. This is document/source/GitHub-state verification. This assessment does not claim freshly passing application gates, current live production identity, aerodynamic qualification, device support, listening acceptance or source permissions absent from the inspected repository.

GitHub can change while the security task continues. The saved snapshot and issue union define this plan's coverage; re-read active state before starting each wave, consume new acceptance/merge receipts, and remove completed implementation from the execution queue without deleting its audit history.
