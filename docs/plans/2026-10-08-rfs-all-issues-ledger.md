# RFS — all-issue implementation ledger

> Current status: paused checkpoint,11/102 Done and91 open. See [current102-item disposition](2026-10-08-rfs-all-issues-checkpoint.md). Earlier counts and execution entries below are historical.

Prepared 2026-10-08; canonical source snapshot `b3e3f937ac3be515ec17fdade97136fea20d580d`. Coverage **102/102**: proposal IDs **RFS-01–RFS-100** plus #160/#162. See [the program](2026-10-08-rfs-all-issues-implementation-plan.md).

Assessment concerns current source, not a newly reproduced flight incident. First-PR prerequisites describe bounded increments; original full-scope dependencies and acceptance remain binding. G means qualification is required for completion, not that every preparatory task is currently blocked.

<a id="issue-160"></a>
## #160 — Refresh runtime pcre2 to clear four HIGH image advisories

GitHub: [#160](https://github.com/Reedtrullz/ReedFS/issues/160) · **W00: Security and workflow completion** · current **In Review / P1 / S / Confirmed**

**Assessment — Merged code; acceptance pending:** PR #161 merged during assessment; Dockerfile and guard now include pcre2. Issue acceptance remains pending.

**Source context:** PR #161 merged during assessment; Dockerfile and guard now include pcre2. Issue acceptance remains pending.

**Owning source:** [Dockerfile](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/Dockerfile); [scripts/release-hardening-check.mjs](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/scripts/release-hardening-check.mjs).

**Implementation sequence:** Reuse the merged fix; read exact canonical CI/image package/native Pages/public identity evidence from the owning task; reconcile only after all required acceptance.

**First-PR prerequisites:** No product issue prerequisite.
**Original full-scope dependencies:** None stated. Original wording: No product prerequisites stated; see security/workflow gates.

**Verification:** pcre2 fixed image and unchanged Trivy/non-root health gates; canonical run 37716227731 and normal delivery readback.

**Full completion / residual:** Do not duplicate implementation or claim closure/live acceptance from PR checks; coordinating task owns the ongoing delivery.

**Issue acceptance retained:** - [ ] Add pcre2 to the runtime targeted Alpine upgrade without changing base digest, OS series, shared dependency pin or application behavior; strengthen the existing guard.
- [ ] Fresh runtime image contains pcre2>=10.49-r0 and unchanged HIGH/CRITICAL Trivy policy passes; non-root read-only nginx health/version smoke passes.
- [ ] Run applicable Node22 composite/unit/build/bundle and native complete CI/browser/visual/CodeQL/secret/image checks on the exact candidate.
- [ ] Merge the qualified focused fix through the normal path; verify canonical native gates and authorized normal Pages delivery/public exact revision before Issue closure and Project Done.

<a id="issue-162"></a>
## #162 — Refresh the remaining HIGH development source-map-js dependency

GitHub: [#162](https://github.com/Reedtrullz/ReedFS/issues/162) · **W00: Security and workflow completion** · current **Intake / P1 / S / Confirmed**

**Assessment — Source-confirmed gap:** Canonical lock still contains dev source-map-js 1.2.1; primary advisory/release and registry confirm 1.2.2.

**Source context:** Canonical lock still contains dev source-map-js 1.2.1; primary advisory/release and registry confirm 1.2.2.

**Owning source:** [package-lock.json](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/package-lock.json); [package.json](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/package.json).

**Implementation sequence:** Recheck every owning range; make a narrow compatible lock refresh in a separate PR; clean-install/audit without forced override or policy suppression.

**First-PR prerequisites:** No product issue prerequisite.
**Original full-scope dependencies:** None stated. Original wording: No product prerequisites stated; see security/workflow gates.

**Verification:** Full npm audit and remaining LOW detail; composite, native browser/visual/image/CodeQL/secret gates on fresh candidate.

**Full completion / residual:** Current parents inspected use ^1.2.1, but clean-install qualification is still required; preserve runtime fix/shared pin.

**Issue acceptance retained:** - [ ] Revalidate canonical package ownership, primary advisory and patched registry metadata; deduplicate current Issues/PRs and prove proposed version satisfies all parents.
- [ ] Apply the smallest compatible dependency remediation in its own PR; preserve runtime pcre2 fix, pinned shared source, application behavior and scan policies.
- [ ] Clean install/full npm audit, composite/unit/build/bundle and native complete browser/visual/image gates pass; state any remaining LOW findings explicitly.
- [ ] Verify canonical/native and normally authorized delivery acceptance before closing this Issue/Project Done.

<a id="issue-91"></a>
## #91 — Harden saves and restore the exact flying conditions

GitHub: [#91](https://github.com/Reedtrullz/ReedFS/issues/91) · draft **RFS-33** · **W01: Validation, saves and reproducible builds** · current **Intake / P1 / M / Confirmed**

**Assessment — Source-confirmed gap:** Snapshot excludes effective weather and uses shallow nested validation; invalid stored collections become empty on write.

**Source context:** `scenarioPersistence.ts` validates many nested values only as records; it omits current weather from snapshots. `persistenceSlice.ts` restores scenario weather, not necessarily the weather in force when saved; invalid stored collections can become an empty collection during writes.

**Owning source:** [src/store/scenarioPersistence.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/store/scenarioPersistence.ts); [src/store/slices/persistenceSlice.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/store/slices/persistenceSlice.ts).

**Implementation sequence:** Add finite/ranged nested validation and exact effective weather; preserve corrupt raw collections; restore paused and migrate explicitly.

**First-PR prerequisites:** No product issue prerequisite.
**Original full-scope dependencies:** None stated. Original wording: P1 / M | Persistence and trust boundaries | Depends: none

**Verification:** Malformed nested values, unsupported identities, quota failures and weather round-trip without other-slot loss.

**Full completion / residual:** Add clock/profile/shared identities as #82/#93 land; restore must invalidate all older worker generations.

**Issue acceptance retained:** Valid saves restore paused under the same atmosphere; malformed/quota-denied/version-incompatible data cannot corrupt active state or other slots. Restore invalidates in-flight worker results and rejects impossible state before physics runs.

**Execution evidence (2026-10-10):** Revalidated against master at 196bd98: every #91 acceptance criterion is already implemented. v4 scenario snapshots carry effective weather plus clock/profile/aircraft identities (`SCENARIO_SNAPSHOT_IDENTITIES`); restore keeps saved weather and starts paused when the saved aircraft was airborne; `collectionForWrite` preserves corrupt raw collections instead of emptying them; ranged finite nested validation runs across `simulationValidation.ts`; cross-tab save serialization uses `withBrowserScenarioSaveLock`; restore bumps `asyncPhysicsGeneration` and sets `lastValidCheckpoint`, invalidating in-flight worker results.

Verification: all 27 persistence-focused unit tests pass locally. Project item PVTI_lAHOAB-TC84BmFlSzg_L15E was already Done from prior work. No product-code PR needed.

Non-claims: explicit format migration rules and cross-version import/export compatibility remain out of scope per the issue text; no live-deploy or cross-tab integration was run this session. Closed as covered.

<a id="issue-92"></a>
## #92 — Make improvement acceptance reproducible and current

GitHub: [#92](https://github.com/Reedtrullz/ReedFS/issues/92) · draft **RFS-34** · **W01: Validation, saves and reproducible builds** · current **Intake / P1 / M / Needs validation**

**Assessment — Source-confirmed gap:** bootstrap --check only warns on pinned-sibling mismatch; test lanes and current documentation differ in scope.

**Source context:** `package.json` separates unit, selected browser, worker, visual and continuous full-flight lanes. `bootstrap:check` is a presence check; existing docs include historical identities. Remote `master` adds Cloudflare Pages deployment and a pinned-shared preview check beyond this local checkout.

**Owning source:** [package.json](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/package.json); [scripts/bootstrap-rfms-shared.mjs](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/scripts/bootstrap-rfms-shared.mjs); [scripts/check-blackbox-e2e.mjs](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/scripts/check-blackbox-e2e.mjs).

**Implementation sequence:** Add read-only exact pin verification and an isolated sibling build recipe; create a capability/evidence matrix; add separate KSEA/KPDX continuous-flight coverage.

**First-PR prerequisites:** No product issue prerequisite.
**Original full-scope dependencies:** None stated. Original wording: P1 / M | Tests, builds and documentation | Depends: none

**Verification:** Clean Node22/pinned RFMC build; deliberate mismatch refusal; preserve ENVA, selected black-box, worker and visual contracts.

**Full completion / residual:** Keep matrix current across all waves and add real-scene/cockpit acceptance without weakening existing release/CSP/PWA gates.

**Issue acceptance retained:** A clean pinned checkout reproduces the gates; mismatched siblings fail clearly or use a separately authorized isolated build. No source presence, seeded screenshot or sampled endpoint is promoted into full-flight, aerodynamic, visual or production acceptance. Keep existing Pages/CSP/PWA/release protections and exact-SHA readback.

<a id="issue-124"></a>
## #124 — Validate worker payloads and contain protocol failures

GitHub: [#124](https://github.com/Reedtrullz/ReedFS/issues/124) · draft **RFS-66** · **W01: Validation, saves and reproducible builds** · current **Intake / P1 / M / Confirmed**

**Assessment — Source-confirmed gap:** Envelope checks cast request/result payloads; batch step count lacks a finite upper bound and decoding can throw in listener.

**Source context:** `src/sim/workerCodec.ts` validates envelope version/type/request ID but casts cloned input/result payloads. `src/sim/simulationStep.ts` floors batch steps without an explicit finite upper limit there. `src/sim/simulationRuntime.ts` decodes responses in its message listener.

**Owning source:** [src/sim/simulationRuntime.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/simulationRuntime.ts); [src/sim/simulationStep.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/simulationStep.ts); [src/sim/workerCodec.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/workerCodec.ts).

**Implementation sequence:** Validate dt/steps/payload shape/identity at dispatch and commit; catch decoding errors; resolve failure/fallback once with validated input.

**First-PR prerequisites:** No product issue prerequisite.
**Original full-scope dependencies:** None stated. Original wording: P1 / M | Runtime trust boundary | Depends: none

**Verification:** NaN/infinite/extreme counts, null, versions, duplicates/late responses, timeout and real browser worker.

**Full completion / residual:** Add profile/build/cohort identity as #93/#118 land without per-substep recursive validation.

**Issue acceptance retained:** NaN/infinite/extreme step counts, null payloads, wrong versions, duplicate/late responses and decode errors cannot hang execution or commit invalid state. Timeouts resolve exactly once; fallback receives validated inputs. Verify a real browser worker separately from handler-parity tests.

<a id="issue-125"></a>
## #125 — Pause and preserve evidence when simulation state becomes invalid

GitHub: [#125](https://github.com/Reedtrullz/ReedFS/issues/125) · draft **RFS-67** · **W01: Validation, saves and reproducible builds** · current **Intake / P1 / M / Strong evidence**

**Assessment — Validation / investigation first:** Physics mutates state without a user-visible last-valid-checkpoint recovery contract.

**Source context:** `docs/physics-invariants.md` specifies quaternion/frame/control/update-order contracts; `src/sim/physics/integrate.ts` mutates state through successive solves. Existing smoke tests check finite/broadly bounded motion, but do not define an end-user recovery contract.

**Owning source:** [docs/physics-invariants.md](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/docs/physics-invariants.md); [src/sim/physics/integrate.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/physics/integrate.ts).

**Implementation sequence:** Check compact committed-state invariants; stop on invalid result before publication; retain offending result/input and last valid checkpoint.

**First-PR prerequisites:** [#124 first increment](#issue-124).
**Original full-scope dependencies:** [#124](https://github.com/Reedtrullz/ReedFS/issues/124). Original wording: P1 / M | Numerical failure containment | Depends: RFS-66

**Verification:** Inject NaN/unusable attitude/identity mismatch; no live invalid instruments/retry loop; extreme valid landings remain valid.

**Full completion / residual:** Offer explicit restore/export/reset and integrate privacy-limited evidence with #150.

**Issue acceptance retained:** Deliberately inject a nonfinite result and inconsistent attitude: instruments never continue displaying it as live truth, evidence survives, and restore is explicit. Legitimate hard landings/extreme but valid attitudes do not trigger numerical recovery. Verify no infinite retry loop or lost save.

<a id="issue-152"></a>
## #152 — Prevent cross-tab save loss and make quota failures recoverable

GitHub: [#152](https://github.com/Reedtrullz/ReedFS/issues/152) · draft **RFS-94** · **W01: Validation, saves and reproducible builds** · current **Intake / P1 / M / Confirmed**

**Assessment — Validation / investigation first:** One localStorage read/modify/write collection has no cross-tab arbitration.

**Source context:** `src/store/scenarioPersistence.ts` stores a read/modify/write slot collection under one local-storage key and checks explicit overwrite. That same-tab confirmation does not itself arbitrate simultaneous tab writes.

**Owning source:** [src/store/scenarioPersistence.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/store/scenarioPersistence.ts).

**Implementation sequence:** Reproduce two-tab lost updates; choose supported atomic transaction or explicit enforced single-writer policy; preserve conflicting payloads and export on quota failure.

**First-PR prerequisites:** [#91 first increment](#issue-91).
**Original full-scope dependencies:** [#91](https://github.com/Reedtrullz/ReedFS/issues/91). Original wording: P1 / M | Local persistence concurrency | Depends: RFS-33

**Verification:** Concurrent create/update/delete, denied/quota storage and cancel; revision-only checks cannot claim atomicity.

**Full completion / residual:** Coordinate companion windows as non-writers after #116; bound storage growth and retain previous valid collections.

**Issue acceptance retained:** Concurrent create/update/delete cannot silently discard another session's slot; cancel preserves both versions. Quota exceptions retain the previous valid collection and offer export. Companion windows are not independent save writers. Test on actual supported browser storage, including denied persistence and full quota.

<a id="issue-90"></a>
## #90 — Protect input latency while physics catches up

GitHub: [#90](https://github.com/Reedtrullz/ReedFS/issues/90) · draft **RFS-32** · **W02: Runtime, alerts, audio and browser recovery** · current **Intake / P1 / M / Strong evidence**

**Assessment — Validation / investigation first:** Worker batching/generation protection exists; accelerated batches and end-to-end latency need measurement.

**Source context:** `simStore.ts` already batches worker steps, tracks generations and preserves live pilot intent; accelerated frame caps can permit large step batches. `CameraManager.ts` and render layers project the latest committed state directly.

**Owning source:** [src/store/simStore.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/store/simStore.ts); [src/viewport/CameraManager.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/viewport/CameraManager.ts).

**Implementation sequence:** Instrument frame/input/worker duration and target-versus-achieved rate; select measured limits; bound work and expose dropped time.

**First-PR prerequisites:** No product issue prerequisite.
**Original full-scope dependencies:** None stated. Original wording: P1 / M | Runtime performance | Depends: none

**Verification:** Low FPS/delayed worker/high rates with responsive input/pause/reset; fixed scenarios and representative devices.

**Full completion / residual:** Add render-only interpolation/adaptive quality only where data shows need; never feed interpolated poses into truth.

**Issue acceptance retained:** Low FPS/worker delay/high sim rates retain responsive pause/reset/control changes and discard stale generations. Interpolation never feeds physics or changes instrument truth; evaluate representative desktop/mobile devices before making performance claims.

<a id="issue-100"></a>
## #100 — Make GPWS warnings depend on the condition they name

GitHub: [#100](https://github.com/Reedtrullz/ReedFS/issues/100) · draft **RFS-42** · **W02: Runtime, alerts, audio and browser recovery** · current **Intake / P1 / M / Confirmed**

**Assessment — Source-confirmed gap:** GPWS GLIDESLOPE checks descent/AGL only; severe overlap can be masked by earlier SINK RATE.

**Source context:** `src/audio/GPWS.ts` returns GLIDESLOPE from low AGL plus descent rate without a glideslope-deviation input. Its sink-rate branch precedes PULL UP in overlapping conditions. Existing tests cover AGL, ground suppression and repeats, but these predicates need a targeted truth review.

**Owning source:** [src/audio/GPWS.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/audio/GPWS.ts).

**Implementation sequence:** Define valid alert inputs and severity selection; suppress unsupported GLIDESLOPE until applicable deviation exists; add invalid-data behavior.

**First-PR prerequisites:** No product issue prerequisite.
**Original full-scope dependencies:** None stated. Original wording: P1 / M | Alert correctness | Depends: none

**Verification:** Climb/normal descent/gear/flap/invalid AGL and overlapping hazard predicate fixtures.

**Full completion / residual:** When #113 offers a qualified signal, integrate deviation applicability without claiming certified GPWS/TAWS.

**Issue acceptance retained:** No glideslope warning without a valid applicable signal/deviation; severe overlapping alerts are not masked by weaker predicates. Test climb, landing configuration, low-altitude normal descent, invalid radio altitude and overlapping hazards. No GPWS certification claim.

<a id="issue-101"></a>
## #101 — Introduce a priority-aware alert and speech queue

GitHub: [#101](https://github.com/Reedtrullz/ReedFS/issues/101) · draft **RFS-43** · **W02: Runtime, alerts, audio and browser recovery** · current **Intake / P1 / M / Confirmed**

**Assessment — Source-confirmed gap:** GPWS uses global cooldown, direct speech enqueue and reset without queued-speech cancellation.

**Source context:** `src/audio/GPWS.ts` uses one global repeat timestamp, calls browser speech directly, and emits captions at enqueue time. Reset clears the timestamp but does not cancel queued speech.

**Owning source:** [src/audio/GPWS.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/audio/GPWS.ts).

**Implementation sequence:** Add one GPWS alert scheduler with per-identity priority/cooldown, interruption and session cancellation; report captions and audible delivery separately.

**First-PR prerequisites:** [#100 first increment](#issue-100), [#103 first increment](#issue-103).
**Original full-scope dependencies:** [#100](https://github.com/Reedtrullz/ReedFS/issues/100). Original wording: P1 / M | Alert presentation | Depends: RFS-42

**Verification:** Rapid alert changes, urgent preemption, mute/reset, missing/rejected voice and no obsolete queue.

**Full completion / residual:** Extend the same scheduler to crew/radio/system sources later; do not introduce competing queues.

**Issue acceptance retained:** Rapidly changing alerts never build a stale speech backlog; a new urgent warning is not delayed by another warning's cooldown. Muting, reset and session changes cancel appropriately. Captions remain useful with missing voices or rejected speech, and do not falsely report spoken playback.

<a id="issue-102"></a>
## #102 — Give speech and sounds one understandable mixer

GitHub: [#102](https://github.com/Reedtrullz/ReedFS/issues/102) · draft **RFS-44** · **W02: Runtime, alerts, audio and browser recovery** · current **Intake / P1 / M / Confirmed**

**Assessment — Source-confirmed gap:** Speech volume is fixed and shell gating only checks mute/enabled, so master zero does not silence speech.

**Source context:** `src/audio/AudioEngine.ts` has Web Audio master/engine/cockpit gains, while `src/audio/audioMapping.ts` assigns speech a fixed volume. `src/app/RfsShell.tsx` gates speech with mute/enabled flags, not the master gain; master volume zero does not itself zero the utterance volume.

**Owning source:** [src/app/RfsShell.tsx](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/app/RfsShell.tsx); [src/audio/AudioEngine.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/audio/AudioEngine.ts); [src/audio/audioMapping.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/audio/audioMapping.ts).

**Implementation sequence:** Apply validated effective master volume to speech and Web Audio; cancel/gate queued speech on zero/mute; preserve independent captions.

**First-PR prerequisites:** No product issue prerequisite.
**Original full-scope dependencies:** [#59](https://github.com/Reedtrullz/ReedFS/issues/59). Original wording: P1 / M | Audio UI and accessibility | Depends: RFS-01

**Verification:** Master-zero/mute across all sources, queued utterance cancellation, persisted levels and keyboard controls.

**Full completion / residual:** Add category gains for #86/#104/#105 through existing settings; full category UX can follow #59.

**Issue acceptance retained:** Master zero and mute silence every enabled source, including queued speech. Caption-only warning access works independently. Levels restore predictably, do not clip under overlapping sources, and remain keyboard/touch operable.

<a id="issue-103"></a>
## #103 — Make audio follow the flight session lifecycle

GitHub: [#103](https://github.com/Reedtrullz/ReedFS/issues/103) · draft **RFS-45** · **W02: Runtime, alerts, audio and browser recovery** · current **Intake / P1 / M / Confirmed**

**Assessment — Source-confirmed gap:** AudioEngine.start exits once started even after later suspension; audio loop lacks status/rate lifecycle policy.

**Source context:** `src/audio/AudioEngine.ts` returns early once started, even if its context is later suspended. `src/hooks/useAudioLoop.ts` updates from aircraft state without a simulation-status or rate policy.

**Owning source:** [src/audio/AudioEngine.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/audio/AudioEngine.ts); [src/hooks/useAudioLoop.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/hooks/useAudioLoop.ts).

**Implementation sequence:** Define observable locked/running/suspended/failed states; resume on gesture; make reset/teardown idempotent and cancel old audio.

**First-PR prerequisites:** No product issue prerequisite.
**Original full-scope dependencies:** None stated. Original wording: P1 / M | Audio lifecycle | Depends: none

**Verification:** Real browser first/later gesture, suspension, pause/resume, reset, StrictMode remount and node count.

**Full completion / residual:** Cover supported desktop/mobile contexts and background/rate policy without tying pitch directly to simulation rate.

**Issue acceptance retained:** First gesture, later suspension, mute/unmute, pause/resume, StrictMode remount and reset produce no duplicate oscillators or stale speech. UI reflects actual context state. Real-browser checks cover supported desktop/mobile audio behavior; mock success alone is insufficient.

<a id="issue-107"></a>
## #107 — Verify the rendered audio, not only its mocks

GitHub: [#107](https://github.com/Reedtrullz/ReedFS/issues/107) · draft **RFS-49** · **W02: Runtime, alerts, audio and browser recovery** · current **Intake / P1 / M / Needs validation**

**Assessment — Validation / investigation first:** Mocked AudioContext and alert tests cannot establish actual waveform or browser speech.

**Source context:** `src/audio/__tests__/AudioEngine.test.ts` uses mocked contexts; existing GPWS tests inspect alerts/repeats. These checks do not establish rendered waveform quality or browser-speech behavior.

**Owning source:** [src/audio/__tests__/AudioEngine.test.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/audio/__tests__/AudioEngine.test.ts).

**Implementation sequence:** Offline-render fixed N1 steps through supported actual nodes; verify finite duration, silence and peaks; add real-browser alert/lifecycle capture.

**First-PR prerequisites:** [#101 first increment](#issue-101), [#102 first increment](#issue-102), [#103 first increment](#issue-103).
**Original full-scope dependencies:** [#101](https://github.com/Reedtrullz/ReedFS/issues/101), [#102](https://github.com/Reedtrullz/ReedFS/issues/102), [#103](https://github.com/Reedtrullz/ReedFS/issues/103). Original wording: P1 / M | Audio verification | Depends: RFS-43, RFS-44, RFS-45

**Verification:** Intentionally silent/clipped/discontinuous controls fail; speech/caption cancellation tested separately.

**Full completion / residual:** Run short human listening checks for changed content/cameras after #86; platform voice quality remains separate evidence.

**Issue acceptance retained:** The lane detects an intentionally silent, clipped or discontinuous source; bounds are meaningful rather than arbitrary snapshot hashes. Browser queue/cancellation tests pass separately. Numerical audio checks are not reported as listening acceptance or proof of consistent platform voices.

<a id="issue-118"></a>
## #118 — Defer PWA updates until a safe session boundary

GitHub: [#118](https://github.com/Reedtrullz/ReedFS/issues/118) · draft **RFS-60** · **W02: Runtime, alerts, audio and browser recovery** · current **Intake / P1 / M / Needs validation**

**Assessment — Validation / investigation first:** PWA autoUpdate and uncached worker bundles create a cohort/update risk; no incident reproduced here.

**Source context:** `vite.config.ts` registers the PWA with `registerType: 'autoUpdate'` and excludes physics-worker bundles from precache. `src/main.tsx` has no explicit flight-aware update workflow. This is an update-coherence risk to validate, not a newly reproduced production outage.

**Owning source:** [src/main.tsx](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/main.tsx); [vite.config.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/vite.config.ts).

**Implementation sequence:** Expose app/worker version cohort and waiting update state; stage activation at parked/saved boundary; preserve saves and fallback.

**First-PR prerequisites:** [#91 first increment](#issue-91), [#124 first increment](#issue-124).
**Original full-scope dependencies:** None stated. Original wording: P1 / M | Browser reliability | Depends: none

**Verification:** Staged v1/v2 active flight, cancellation, save/reload/offline and failed-worker recovery in a real browser.

**Full completion / residual:** Complete installed-PWA behavior without custom cache infrastructure or unsaved forced reload.

**Issue acceptance retained:** A staged v1-to-v2 browser test covers active flight, save, reload, offline and failed-worker recovery. App and physics worker cannot silently form an incompatible cohort. Update cancellation preserves the current flight; no forced reload loses unsaved state.

<a id="issue-123"></a>
## #123 — Order commands at explicit simulation boundaries

GitHub: [#123](https://github.com/Reedtrullz/ReedFS/issues/123) · draft **RFS-65** · **W02: Runtime, alerts, audio and browser recovery** · current **Intake / P1 / L / Confirmed**

**Assessment — Validation / investigation first:** Live pilot intent is reconciled, but dispatched AP/route/controller revisions stay batch-bound; races require injected schedules.

**Source context:** `src/store/simStore.ts` already preserves current pilot inputs when an async physics result arrives, while the dispatched AP state/route/controller inputs remain associated with that batch. `src/store/simStoreInputReducers.ts` separates pilot intent from AP-owned axes; pause/reset already invalidate older generations.

**Owning source:** [src/store/simStore.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/store/simStore.ts); [src/store/simStoreInputReducers.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/store/simStoreInputReducers.ts).

**Implementation sequence:** Trace accepted/applied command revisions and committed step index; specify AP/route/pilot boundaries; preserve immediate input feedback and generation rejection.

**First-PR prerequisites:** [#90 first increment](#issue-90), [#124 first increment](#issue-124).
**Original full-scope dependencies:** [#90](https://github.com/Reedtrullz/ReedFS/issues/90). Original wording: P1 / L | Control authority and concurrency | Depends: RFS-32

**Verification:** AP disconnect, EXEC, throttle and reset mid-batch; no stale modes/routes; sync/worker schedules and measured delay.

**Full completion / residual:** Split batches only when needed and measured; no event-sourcing framework or last-write-wins replacement.

**Issue acceptance retained:** Inject AP disconnect, EXEC, throttle movement and pause/reset while a batch is in flight. No result reactivates old modes/routes or overwrites newer intent; each committed state identifies its applied revisions. Test synchronous/worker parity for equivalent command schedules and explicit maximum command-to-simulation delay.

<a id="issue-147"></a>
## #147 — Render instruments from coherent, age-labeled simulation snapshots

GitHub: [#147](https://github.com/Reedtrullz/ReedFS/issues/147) · draft **RFS-89** · **W02: Runtime, alerts, audio and browser recovery** · current **Intake / P1 / M / Strong evidence**

**Assessment — Validation / investigation first:** Separate selectors compute current fields; mixed revisions and latency need measured evidence.

**Source context:** `src/store/selectors.ts` exposes separate live-derived quantities; `src/hooks/useSimLoop.ts` schedules effects/audio around async stepping; cockpit/pop-out displays are future consumers of the same authority.

**Owning source:** [src/hooks/useSimLoop.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/hooks/useSimLoop.ts); [src/store/selectors.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/store/selectors.ts).

**Implementation sequence:** Derive a timestamped coherent observation snapshot for current overlays first; tag immediate selections separately; expose age/invalid state.

**First-PR prerequisites:** [#123 first increment](#issue-123).
**Original full-scope dependencies:** [#63](https://github.com/Reedtrullz/ReedFS/issues/63), [#123](https://github.com/Reedtrullz/ReedFS/issues/123). Original wording: P1 / M | Display consistency | Depends: RFS-05, RFS-65

**Verification:** Delay worker and compare mode/speed/altitude revision; pause versus disconnect, no interpolated FMA capture.

**Full completion / residual:** Reuse in #63/#116 and measured display refresh/readability; avoid blanket memoization.

**Issue acceptance retained:** Mode/airspeed/altitude/source-validity fields identify one coherent revision; slow workers and owner loss show age/state honestly. Pause is not confused with disconnection. Camera interpolation cannot announce uncommitted mode capture. Verify rendered instrument latency/readability rather than only selector equality.

<a id="issue-148"></a>
## #148 — Recover from GPU context loss without losing the flight

GitHub: [#148](https://github.com/Reedtrullz/ReedFS/issues/148) · draft **RFS-90** · **W02: Runtime, alerts, audio and browser recovery** · current **Intake / P1 / M / Needs validation**

**Assessment — Validation / investigation first:** Generic scene retry/cleanup does not prove coupled Cesium/Three context restoration.

**Source context:** `src/viewport/CesiumViewport.tsx` reports scene/render failures; `src/components/SceneStatus.tsx` offers scenery retry; `src/viewport/ThreeLayer.tsx` owns bridge/aircraft cleanup. Existing recovery does not prove context-loss restoration across all these owners.

**Owning source:** [src/components/SceneStatus.tsx](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/components/SceneStatus.tsx); [src/viewport/CesiumViewport.tsx](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/viewport/CesiumViewport.tsx); [src/viewport/ThreeLayer.tsx](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/viewport/ThreeLayer.tsx).

**Implementation sequence:** Probe forced loss on existing aircraft; use supported renderer restoration or explicit reduced-view fallback; preserve authority and debounce retries.

**First-PR prerequisites:** [#125 first increment](#issue-125).
**Original full-scope dependencies:** [#99](https://github.com/Reedtrullz/ReedFS/issues/99), [#125](https://github.com/Reedtrullz/ReedFS/issues/125). Original wording: P1 / M | Rendering reliability | Depends: RFS-41, RFS-67

**Verification:** Approach loss/restore, same state/routes/saves, nonblank/fallback, listener/viewer/resource count on both canvases.

**Full completion / residual:** Integrate asset recreation ownership with #99; no reload-first recovery or infinite renderer loop.

**Issue acceptance retained:** Forced loss/restoration during approach retains state/route/saves and yields a nonblank correctly framed scene or honest fallback. No duplicate viewers/listeners, growing GPU allocations or unbounded retry loops. Render tests cover both Cesium and Three surfaces; mock cleanup alone is insufficient.

<a id="issue-150"></a>
## #150 — Add a privacy-reviewed diagnostic flight bundle

GitHub: [#150](https://github.com/Reedtrullz/ReedFS/issues/150) · draft **RFS-92** · **W02: Runtime, alerts, audio and browser recovery** · current **Intake / P1 / M / Needs validation**

**Assessment — Feature or extension:** Error/FPS paths expose useful state but no previewed redacted export exists.

**Source context:** `src/components/ErrorBoundary.tsx` shows an error/retry; `src/components/FPSMonitor.tsx` and store/runtime state expose useful local diagnostics. There is no reviewed user export contract in that error path.

**Owning source:** [src/components/ErrorBoundary.tsx](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/components/ErrorBoundary.tsx); [src/components/FPSMonitor.tsx](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/components/FPSMonitor.tsx).

**Implementation sequence:** Whitelist bounded build/runtime/error/timing fields and optional location selection; preview/export locally; enforce size and redact secrets/names.

**First-PR prerequisites:** [#125 first increment](#issue-125), [#91 first increment](#issue-91).
**Original full-scope dependencies:** [#125](https://github.com/Reedtrullz/ReedFS/issues/125), [#126](https://github.com/Reedtrullz/ReedFS/issues/126). Original wording: P1 / M | Support and failure evidence | Depends: RFS-67, RFS-68

**Verification:** Planted token/name absent, preview equals payload, recursive error cap and no session mutation.

**Full completion / residual:** Optional re-simulation capsule follows #126; diagnostic export should not be blocked by complete recorder.

**Issue acceptance retained:** A planted token/name never appears in default output; preview matches actual exported fields. Size/trace limits are enforced and errors cannot recursively explode the bundle. Import/debug readers treat content as data, not instructions. Verify that exporting does not mutate or resume the session.

<a id="issue-69"></a>
## #69 — Replace placeholder tuning with a source-qualified FDM envelope

GitHub: [#69](https://github.com/Reedtrullz/ReedFS/issues/69) · draft **RFS-11** · **W03: Mathematics, atmosphere, clock and reference conventions** · current **Blocked / P1 / L / Needs validation**

**Assessment — Qualification-gated scope:** FDM data explicitly retains placeholder lineage; no aircraft-wide qualified replacement is available.

**Source context:** `b737-800-fdm.v1.ts` explicitly labels aero, engine, configuration and ground data as low-confidence gameplay placeholders. `docs/runbooks/fdm-source-governance.md` records missing permitted source packets; lineage infrastructure already exists.

**Owning source:** [docs/runbooks/fdm-source-governance.md](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/docs/runbooks/fdm-source-governance.md); [src/sim/data/aircraft/b737-800-fdm.v1.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/data/aircraft/b737-800-fdm.v1.ts).

**Implementation sequence:** Inventory each data group and permitted primary reference; build one source packet with units, permission, conditions and independent holdouts; replace only the qualified group.

**First-PR prerequisites:** No product issue prerequisite.
**Original full-scope dependencies:** None stated. Original wording: P1 / L, source-gated | Flight-model evidence | Depends: none

**Verification:** Independent trim/performance residuals within declared tolerances; tests proving runtime consumption and lineage.

**Full completion / residual:** Track aero, engine, gear, tires/brakes, performance and atmosphere separately; one qualified group cannot close the whole envelope issue.

**Issue acceptance retained:** Every replaced group has citation, permission, confidence, units, applicability and independent acceptance tolerances. Tests distinguish preservation regressions from aircraft-validity evidence. No Boeing/AFM/training-grade claim without supporting evidence.


### Implementation evidence (2026-10-10)

**First increment — PR #187 merged:** Engine takeoff static-thrust anchor qualified to FAA TCDS A16WE Rev 45 (27,300 lbf). Governance packet added. FDM data version 1.1.0. Legacy persistence snapshot pinned to 1.0.0 identity. CI run 38048687074: all checks green. Merge commit 45d13e5d242dce41cdfd02d9498dd4fa9d8b50ff.

**Residual scope retained:** Aero coefficients, gear/tires/brakes, performance envelope, remaining engine operating points, atmosphere model. Each requires its own qualifying source packet. Issue remains open.

<a id="issue-70"></a>
## #70 — Audit force frames and rigid-body integration

GitHub: [#70](https://github.com/Reedtrullz/ReedFS/issues/70) · draft **RFS-12** · **W03: Mathematics, atmosphere, clock and reference conventions** · current **Intake / P1 / M / Strong evidence**

**Assessment — Validation / investigation first:** Longitudinal drag/lift resolution and diagonal inertia expressions warrant independent derivation; impact is not measured.

**Source context:** `physics/aero.ts` computes lift/drag from air-relative flow but exposes only longitudinal `dragBodyX`; `physics/integrate.ts` applies lift to body Z and uses separate diagonal-divided angular acceleration formulas with nonzero `ixz`.

**Owning source:** [src/sim/physics/aero.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/physics/aero.ts); [src/sim/physics/integrate.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/physics/integrate.ts).

**Implementation sequence:** Write analytic wind/body force and coupled-inertia fixtures; document signs/units; change the smallest proven discrepancy and retain integrator unless convergence demands more.

**First-PR prerequisites:** No product issue prerequisite.
**Original full-scope dependencies:** None stated. Original wording: P1 / M | Core physics | Depends: none

**Verification:** Nonzero AoA/sideslip/ixz cases, quaternion norm, timestep convergence and affected flight regressions.

**Full completion / residual:** Requalify takeoff, stall and AP response after correction; no tuning to conceal a frame error.

**Issue acceptance retained:** Analytic forces/moments and angular accelerations match the selected conventions; quaternion norm stays bounded and results converge with timestep refinement. Revalidate takeoff, stall and AP envelopes after any correction.

**Execution evidence (2026-10-10):**
- PR #188 merged as 05a0ff2fb2f90d328e91a49929c55885beb6e80a; CI run 38057586962 green (CodeQL 38057586968, CI/CD all shards pass).
- aero.ts: drag resolves opposite full air-relative velocity (dragBodyX/Y/Z = -D*(u,v,w)/V); lift perpendicular to it (liftBodyX = L*w/V, liftBodyZ = -L*u/V).
- integrate.ts: velocity update sums all body components (thrust + drag + lift on each axis).
- levelEquilibrium.ts: wind-axis residuals (cos(theta_w)=u/V, sin(theta_w)=w/V, axial T + D_x + L_x - W*sin(theta_w)).
- New forceFrames.test.ts: 5 analytic tests (drag direction at AoA, lift perpendicularity, sideslip drag, integration components, thrust-vs-wind-axis-drag balance).
- Envelope requalification (no tuning to hide frame error): gear-down full-elevator climb VS 4200->6600 fpm; level-equilibrium pitch drift 0.2 deg -> 0.3 deg; ENVA manual climb max pitch 18 -> 20 deg; ENVA manual climb max VS 4200 -> 6600 fpm.
- E2E requalification: airborne MCP pitch <18 -> <20; descent approach throttle 0.65 -> 0.55 (corrected lift glides further).
- envaClimbRegression stage-3 break now also accepts routeComplete (aircraft reaches final waypoint at t~895s before the leg-3 assertion threshold; valid terminal, not navigation failure).
- 1303/1303 vitest, typecheck/lint/build/bundle clean locally; full sharded e2e+visual green in CI.
- Non-claims: coupled inertia expressions (ixz cross-term) are out of scope; quaternion norm and timestep convergence fixtures were not added. These belong to the full issue acceptance and remain open.

<a id="issue-71"></a>
## #71 — Make configuration changes and stall behavior continuous

GitHub: [#71](https://github.com/Reedtrullz/ReedFS/issues/71) · draft **RFS-13** · **W03: Mathematics, atmosphere, clock and reference conventions** · current **Intake / P2 / M / Strong evidence**

**Assessment — Source-confirmed gap:** Flap polar selection uses detent thresholds while actual flap position transits continuously.

**Source context:** `aero.ts` selects the last flap polar below the current setting while actual flaps transit continuously; post-stall lift is a bounded piecewise heuristic and elevator authority fades by pitch attitude.

**Owning source:** [src/sim/physics/aero.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/physics/aero.ts).

**Implementation sequence:** Interpolate neighboring polar/configuration effects; prove force continuity throughout transit; review authority by flow/AoA separately.

**First-PR prerequisites:** [#70 first increment](#issue-70).
**Original full-scope dependencies:** [#69](https://github.com/Reedtrullz/ReedFS/issues/69), [#70](https://github.com/Reedtrullz/ReedFS/issues/70). Original wording: P2 / M | Aerodynamic envelope | Depends: RFS-11 for aircraft-specific calibration, RFS-12

**Verification:** Sweep every flap transit and verify no coefficient/force jumps; finite stall/recovery and sideslip cases.

**Full completion / residual:** Aircraft-specific stall/buffet calibration waits for #69; #138 owns high-altitude compressibility.

**Issue acceptance retained:** Flap transit produces no force discontinuity; clean/landing stalls, recovery, steep turns and sideslip remain finite and explainable. Preserve explicit limits on unsupported high-AoA/backward-flight behavior.

**Execution evidence (2026-10-10):**
- PR #190 merged as a3e452eb01c401dae184354ff1d57d357cf2e52e; branch commit f9ff7cf. Issue #71 closed as COMPLETED on merge.
- aero.ts: effectiveElevatorInput multiplies a new flow fade (authority decays linearly from 0.8 cl-max to 1.0 cl-max of the active flap polar's linear lift; provisional band marked in source, #69 owns calibration) by the kept 8-12.5 deg pitch-envelope fade; nose-down push is never faded.
- New relative-structure test in src/sim/physics/__tests__/aero.test.ts; pre-existing over-rotation guards pass unchanged, so no e2e bounds requalification was needed.
- Local gates green: typecheck, lint, 1304/1304 vitest, build, bundle.
- CI run 38066529702: secret-scan, CodeQL, unit test, e2e shards 1/3 and 3/3 pass. Shard 2/3 failed twice on the single documented fixture-family case rfs-heading-reference.spec.ts (startup-predicate 15 s timeout under runner load, both attempts, all other specs passing). The AGENT_WORKFLOW.md one-rerun rule was applied; disclosure comment 6100131354 records it. No test weakened, no timeout raised.
- Non-claims: the 0.8-1.0 cl-max flow-fade band is provisional until #69 sources it; stall/buffet cue acceptance belongs to #69; compressibility behavior belongs to #138.

<a id="issue-74"></a>
## #74 — Give the engines correct idle semantics and weather-consistent thrust

GitHub: [#74](https://github.com/Reedtrullz/ReedFS/issues/74) · draft **RFS-16** · **W03: Mathematics, atmosphere, clock and reference conventions** · current **Intake / P1 / M / Confirmed**

**Assessment — Source-confirmed gap:** Zero throttle requests zero N1; engine Mach uses ISA while aero uses scenario weather.

**Source context:** `engine.ts` requests zero N1 at throttle <=0.01 and uses ISA-based Mach plus an altitude/Mach lapse table. `aero.ts` separately adjusts pressure/temperature for scenario weather; table OAT values are not interpolation inputs.

**Owning source:** [src/sim/physics/aero.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/physics/aero.ts); [src/sim/systems/engine.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/systems/engine.ts).

**Implementation sequence:** Separate running-idle from explicit fuel cutoff; create a shared atmosphere input; migrate engine thrust/spool consumers without broad start-system scope.

**First-PR prerequisites:** No product issue prerequisite.
**Original full-scope dependencies:** [#69](https://github.com/Reedtrullz/ReedFS/issues/69). Original wording: P1 / M | Propulsion | Depends: RFS-11 for quantitative calibration

**Verification:** Idle/cutoff/depletion, hot/high/cold consistency, engine independence and synchronous/worker parity.

**Full completion / residual:** Qualify quantitative lapse/spool data under #69; startup belongs to #108 and reversers to #73.

**Issue acceptance retained:** Idle does not imply shutdown; explicit cutoff does. Hot/high and cold cases change thrust consistently, depletion remains safe, and independent engine response is reproduced through synchronous and worker paths.

<a id="issue-82"></a>
## #82 — Use one simulation clock for sun, cockpit and weather

GitHub: [#82](https://github.com/Reedtrullz/ReedFS/issues/82) · draft **RFS-24** · **W03: Mathematics, atmosphere, clock and reference conventions** · current **Intake / P2 / M / Confirmed**

**Assessment — Source-confirmed gap:** Physics advances timeOfDay at dt/30 while sun lighting uses wall time.

**Source context:** `integrate.ts` advances `timeOfDay` at one hour per 30 simulated seconds, while `sunLighting.ts` uses wall-clock dates for globe illumination and disables night-side lighting for visibility.

**Owning source:** [src/sim/physics/integrate.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/physics/integrate.ts); [src/viewport/sunLighting.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/viewport/sunLighting.ts).

**Implementation sequence:** Add scenario UTC epoch plus explicit simulation-time progression; route sun/lighting/weather time through it; migrate saves without losing old slots.

**First-PR prerequisites:** [#91 first increment](#issue-91).
**Original full-scope dependencies:** None stated. Original wording: P2 / M | Time and lighting | Depends: none

**Verification:** Pause/rate/reset/save/restore clock agreement and fixed-date sunrise/night cases.

**Full completion / residual:** Finish readable night/runway lighting while preserving the existing no-black-globe protection.

**Issue acceptance retained:** Pause, acceleration and restore keep all clocks aligned; sunrise/night conditions are reproducible at a fixed location/date. Cockpit instruments and runway cues remain usable without flattening every night into daylight.

<a id="issue-120"></a>
## #120 — Make route geometry robust at coordinate boundaries

GitHub: [#120](https://github.com/Reedtrullz/ReedFS/issues/120) · draft **RFS-62** · **W03: Mathematics, atmosphere, clock and reference conventions** · current **Intake / P1 / M / Strong evidence**

**Assessment — Source-confirmed gap:** Route generation uses raw longitude difference/linear interpolation; navigation only checks finiteness.

**Source context:** `src/sim/flightPlanLoader.ts` includes linear latitude/longitude interpolation and an unwrapped local longitude-difference distance helper; `src/sim/systems/navigation.ts` checks coordinate finiteness. `src/sim/physics/geodesy.ts` already supplies WGS84 transforms to reuse and probe.

**Owning source:** [src/sim/flightPlanLoader.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/flightPlanLoader.ts); [src/sim/physics/geodesy.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/physics/geodesy.ts); [src/sim/systems/navigation.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/systems/navigation.ts).

**Implementation sequence:** Enforce coordinate ranges at input boundaries; add antimeridian/high-latitude/duplicate fixtures; replace unsuitable route math with existing helpers.

**First-PR prerequisites:** No product issue prerequisite.
**Original full-scope dependencies:** None stated. Original wording: P1 / M | Geodesy and input trust | Depends: none

**Verification:** 179/-179 short path, near-pole/zero distance validity, no partial mutation and unchanged local airport lengths.

**Full completion / residual:** Preserve declared short-runway local approximation; fix only independently demonstrated geodesy failures.

**Issue acceptance retained:** A route across 179/-179 degrees takes the intended short path; polar/high-latitude and duplicate-waypoint cases remain finite with sensible bearings/validity. Malformed imported coordinates are rejected without partial state mutation. Existing airport routes retain their expected lengths within declared tolerance.

<a id="issue-132"></a>
## #132 — Distinguish equivalent, calibrated and indicated airspeed

GitHub: [#132](https://github.com/Reedtrullz/ReedFS/issues/132) · draft **RFS-74** · **W03: Mathematics, atmosphere, clock and reference conventions** · current **Intake / P1 / M / Strong evidence**

**Assessment — Validation / investigation first:** Derived IAS is density-scaled TAS and Mach uses ISA while aero applies weather.

**Source context:** `src/sim/physics/derived.ts` labels TAS times square-root density ratio as IAS and derives Mach from ISA sound speed; `src/sim/physics/aero.ts` separately applies weather-related atmosphere. This warrants a shared-condition and speed-definition review, not an assumed measured defect across all regimes.

**Owning source:** [src/sim/physics/aero.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/physics/aero.ts); [src/sim/physics/derived.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/physics/derived.ts).

**Implementation sequence:** Document approximation envelope; share atmosphere; add independent pressure-speed and low-/high-Mach fixtures; separate EAS/CAS/IAS.

**First-PR prerequisites:** [#74 first increment](#issue-74).
**Original full-scope dependencies:** [#69](https://github.com/Reedtrullz/ReedFS/issues/69). Original wording: P1 / M | Air-data numerical truth | Depends: RFS-11

**Verification:** Round trips/low-speed limit, invalid pressure/domain, and deliberate PFD/AP speed-quantity usage.

**Full completion / residual:** Instrument error remains separate #110 calibration; aircraft-specific validity requires #69.

**Issue acceptance retained:** Low-speed limits and round trips agree with independent references; zero/invalid pressure and out-of-domain regimes fail safely. PFD, AP speed loop and performance fixtures deliberately use the intended quantity. Weather changes cannot leave force and indication models using incompatible atmospheres unnoticed.

<a id="issue-134"></a>
## #134 — Make true, magnetic and grid heading references explicit

GitHub: [#134](https://github.com/Reedtrullz/ReedFS/issues/134) · draft **RFS-76** · **W03: Mathematics, atmosphere, clock and reference conventions** · current **Intake / P1 / L / Needs validation**

**Assessment — Feature or extension:** Heading paths implicitly use true north without explicit magnetic/reference identity.

**Source context:** `src/sim/types.ts` defines heading zero as north; `src/store/selectors.ts` projects quaternion yaw to heading, while `src/sim/systems/autopilot.ts` consumes selected heading. The inspected paths do not declare a magnetic model/reference conversion.

**Owning source:** [src/sim/systems/autopilot.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/systems/autopilot.ts); [src/sim/types.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/types.ts); [src/store/selectors.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/store/selectors.ts).

**Implementation sequence:** Label true heading and add reference-tagged imported courses; qualify epoch/location variation data; convert once at defined boundaries.

**First-PR prerequisites:** [#120 first increment](#issue-120).
**Original full-scope dependencies:** [#113](https://github.com/Reedtrullz/ReedFS/issues/113), [#120](https://github.com/Reedtrullz/ReedFS/issues/120). Original wording: P1 / L | Navigation conventions | Depends: RFS-55, RFS-62

**Verification:** Nonzero variation once-only, no physical rotation/AP offset on display switch, unsupported dates and runway-label distinction.

**Full completion / residual:** Radio/ND/database integration follows #113/#78/#146; polar grid support is only for admitted scenarios.

**Issue acceptance retained:** A supplied nonzero variation converts displayed/selected courses once, not twice; runway number is never treated as surveyed bearing. Date/location changes and unsupported epochs are labeled. True/magnetic mode changes do not silently rotate the aircraft or redirect AP by an unintended offset.

<a id="issue-136"></a>
## #136 — Initialize airborne scenarios from a complete equilibrium solution

GitHub: [#136](https://github.com/Reedtrullz/ReedFS/issues/136) · draft **RFS-78** · **W03: Mathematics, atmosphere, clock and reference conventions** · current **Intake / P2 / L / Strong evidence**

**Assessment — Validation / investigation first:** trimSolver solves pitch moment, while scenarios independently initialize other flight quantities.

**Source context:** `src/sim/physics/trimSolver.ts` solves pitching moment for a supplied state; `src/sim/scenarios.ts` independently sets airspeed, pitch, vertical speed and engine N1. A pitch-only solution does not establish full force/thrust equilibrium.

**Owning source:** [src/sim/physics/trimSolver.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/physics/trimSolver.ts); [src/sim/scenarios.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/scenarios.ts).

**Implementation sequence:** Extend solver offline for one level equilibrium with AoA/pitch/trim/thrust residuals and finite iteration caps; report infeasible.

**First-PR prerequisites:** [#70 first increment](#issue-70), [#74 first increment](#issue-74), [#132 first increment](#issue-132).
**Original full-scope dependencies:** [#69](https://github.com/Reedtrullz/ReedFS/issues/69), [#70](https://github.com/Reedtrullz/ReedFS/issues/70). Original wording: P2 / L | Scenario physics | Depends: RFS-11, RFS-12

**Verification:** Short unassisted drift, raw residual tolerance, no limit-as-trim deception and sync/worker starts.

**Full completion / residual:** Add supported climb/descent/bank cases with #69 holdouts; preserve deliberately upset scenarios.

**Issue acceptance retained:** A converged state remains near its declared condition over a short unassisted run; residuals and tolerances are auditable. Unreachable configurations do not silently pick a limit and call it trimmed. Intentional upset scenarios retain their authored state, and reset/worker starts agree.

<a id="issue-59"></a>
## #59 — Replace overlay clutter with a flight-first workspace

GitHub: [#59](https://github.com/Reedtrullz/ReedFS/issues/59) · draft **RFS-01** · **W04: Workspace, input, cockpit and model contracts** · current **Intake / P1 / M / Needs validation**

**Assessment — Feature or extension:** The current layout combines fixed corner panels and a 332px compact-PFD minimum; usability still needs browser measurement.

**Source context:** `src/components/layout/RfsLayout.tsx` positions multiple corner panels, overrides child positioning with `!important`, and gives the compact PFD a 332px minimum width. `src/app/RfsShell.tsx` mounts setup, routing and instruments together.

**Owning source:** [src/app/RfsShell.tsx](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/app/RfsShell.tsx); [src/components/layout/RfsLayout.tsx](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/components/layout/RfsLayout.tsx).

**Implementation sequence:** Introduce Briefing/Flight/Debrief shell state and a setup dock; centralize existing spacing and color tokens; retain the mounted viewport and visible flight controls.

**First-PR prerequisites:** No product issue prerequisite.
**Original full-scope dependencies:** None stated. Original wording: P1 / M | UI | Depends: none

**Verification:** Exercise existing black-box selectors at desktop/narrow widths, 200% zoom and keyboard focus; inspect cockpit sightlines.

**Full completion / residual:** Finish every workspace and responsive variant before closure; recorder-backed debrief content follows #88.

**Issue acceptance retained:** Desktop and narrow-screen views expose every essential control without overlap, clipping or hidden focus; cockpit mode preserves the outside sightline. Existing black-box controls remain usable.

<a id="issue-60"></a>
## #60 — Add genuinely usable touch and accessible flight controls

GitHub: [#60](https://github.com/Reedtrullz/ReedFS/issues/60) · draft **RFS-02** · **W04: Workspace, input, cockpit and model contracts** · current **Intake / P1 / M / Needs validation**

**Assessment — Feature or extension:** Keyboard/gamepad and accessibility tests exist; touch axes and robust cancellation are additional scope.

**Source context:** `src/app/RfsShell.tsx` integrates keyboard/gamepad input; `src/components/BottomControlBar.tsx`, `src/instruments/RfsMCP.tsx` and `e2e/rfs-responsive-accessibility.spec.ts` provide existing controls and accessibility coverage.

**Owning source:** [e2e/rfs-responsive-accessibility.spec.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/e2e/rfs-responsive-accessibility.spec.ts); [src/app/RfsShell.tsx](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/app/RfsShell.tsx); [src/components/BottomControlBar.tsx](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/components/BottomControlBar.tsx); [src/instruments/RfsMCP.tsx](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/instruments/RfsMCP.tsx).

**Implementation sequence:** Add an optional pointer-controlled flight pad through input reducers; add numeric MCP entry and scale settings; neutralize held axes on cancel, blur, release and unmount.

**First-PR prerequisites:** [#59 first increment](#issue-59).
**Original full-scope dependencies:** [#59](https://github.com/Reedtrullz/ReedFS/issues/59). Original wording: P1 / M | UI and accessibility | Depends: RFS-01

**Verification:** Touch-only short flight, keyboard-only setup/MCP, accessible names, focus order and actual target-device checks.

**Full completion / residual:** Complete rudder/throttle, cancellation and accessibility acceptance; phone support remains gated by actual devices.

**Issue acceptance retained:** Complete a short takeoff/manual-flight exercise using touch alone and all setup/MCP actions using keyboard alone; verify zoom, screen-reader names, focus order and no stuck axes. Do not claim full phone support before device testing.

<a id="issue-61"></a>
## #61 — Turn preflight setup into a compact electronic flight bag

GitHub: [#61](https://github.com/Reedtrullz/ReedFS/issues/61) · draft **RFS-03** · **W04: Workspace, input, cockpit and model contracts** · current **Intake / P2 / M / Needs validation**

**Assessment — Feature or extension:** Setup values and reference-speed infrastructure exist; this is consolidation plus qualified calculations.

**Source context:** `src/components/TakeoffSetupPanel.tsx`, `src/components/RouteBuilderPanel.tsx`, `src/sim/scenarios.ts` and `src/sim/data/performance/` already provide scenario configuration and gameplay reference speeds.

**Owning source:** [src/components/RouteBuilderPanel.tsx](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/components/RouteBuilderPanel.tsx); [src/components/TakeoffSetupPanel.tsx](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/components/TakeoffSetupPanel.tsx); [src/sim/data/performance/b737PerformanceCards.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/data/performance/b737PerformanceCards.ts); [src/sim/data/performance/b737TakeoffProfiles.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/data/performance/b737TakeoffProfiles.ts); [src/sim/data/performance/b737TrimFixtures.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/data/performance/b737TrimFixtures.ts); [src/sim/scenarios.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/scenarios.ts).

**Implementation sequence:** Build a preflight view from existing route/runway/weather/loading selectors; label provenance and unsupported combinations; add explicit dependent-value recomputation.

**First-PR prerequisites:** [#59 first increment](#issue-59).
**Original full-scope dependencies:** [#59](https://github.com/Reedtrullz/ReedFS/issues/59), [#69](https://github.com/Reedtrullz/ReedFS/issues/69). Original wording: P2 / M | Flight preparation | Depends: RFS-01, RFS-11 for sourced performance claims

**Verification:** Change mass, runway, weather and configuration and verify references invalidate/update consistently.

**Full completion / residual:** Add supported fuel/landing/performance calculations only after #69/#75 qualification; leave uncertain values labeled.

**Issue acceptance retained:** Changing weight/weather/configuration updates dependent references consistently; impossible or unsupported configurations are clearly rejected or labeled. No generated takeoff distance is presented as dispatch data.

<a id="issue-62"></a>
## #62 — Rebuild cockpit geometry around a believable pilot eye point

GitHub: [#62](https://github.com/Reedtrullz/ReedFS/issues/62) · draft **RFS-04** · **W04: Workspace, input, cockpit and model contracts** · current **Intake / P1 / L / Needs validation**

**Assessment — Qualification-gated scope:** Box-based cockpit and fixed eye offset are present; licensed dimension references and visual acceptance remain required.

**Source context:** `src/viewport/CockpitModel.ts` builds box-based panels, a central control column, seats and rectangular windows at a fixed cockpit station. `CameraManager.ts` uses a fixed eye offset.

**Owning source:** [src/viewport/CameraManager.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/viewport/CameraManager.ts); [src/viewport/CockpitModel.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/viewport/CockpitModel.ts).

**Implementation sequence:** Prepare a lawful reference/axis packet; rebuild captain eye, windshield and glareshield first; retain named interaction nodes and adjustable seat height.

**First-PR prerequisites:** No product issue prerequisite.
**Original full-scope dependencies:** None stated. Original wording: P1 / L | Cockpit geometry | Depends: none

**Verification:** Inspect horizon/runway/panel readability across bank and headings, near-plane clipping and named-node regressions.

**Full completion / residual:** Complete captain/first-officer stations, pedestal/overhead proportions and human visual review.

**Issue acceptance retained:** From captain eye level the horizon/runway and essential panel remain readable, with no near-plane clipping or impossible window framing across headings and bank angles. Human visual review is required, not bounding-box tests alone.

<a id="issue-63"></a>
## #63 — Put live instruments on the cockpit panels

GitHub: [#63](https://github.com/Reedtrullz/ReedFS/issues/63) · draft **RFS-05** · **W04: Workspace, input, cockpit and model contracts** · current **Intake / P1 / L / Needs validation**

**Assessment — Validation / investigation first:** Panel display cutouts are static meshes; a live overlay PFD already exists and must remain the authority.

**Source context:** `CockpitModel.ts` uses fixed-color `pfdCutout`, `ndCutout` and standby meshes. `CockpitLayer.tsx` renders the shell while `RfsShell.tsx` separately overlays React PFD/MCP components.

**Owning source:** [src/app/RfsShell.tsx](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/app/RfsShell.tsx); [src/viewport/CockpitLayer.tsx](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/viewport/CockpitLayer.tsx); [src/viewport/CockpitModel.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/viewport/CockpitModel.ts).

**Implementation sequence:** Probe one overlay/projection or texture approach with measured update cost; render the existing coherent PFD snapshot on its panel; add dimming, invalid and unpowered states.

**First-PR prerequisites:** [#62 first increment](#issue-62), [#147 first increment](#issue-147).
**Original full-scope dependencies:** [#62](https://github.com/Reedtrullz/ReedFS/issues/62), [#78](https://github.com/Reedtrullz/ReedFS/issues/78). Original wording: P1 / L | Cockpit displays | Depends: RFS-04; RFS-20 for richer ND content

**Verification:** Compare FMA/value revisions with the overlay through EXEC, AP handoff, pause and restore; measure readability/update memory.

**Full completion / residual:** Add ND after #78 and engine/standby panels; close only after cockpit/pop-out parity and day/night review.

**Issue acceptance retained:** Cockpit and pop-out values/FMA agree during AP handoff, route edits, pause and restore. Readability survives day/night lighting and display scaling within a measured texture/update budget.

<a id="issue-64"></a>
## #64 — Replace cockpit click shortcuts with real manipulation

GitHub: [#64](https://github.com/Reedtrullz/ReedFS/issues/64) · draft **RFS-06** · **W04: Workspace, input, cockpit and model contracts** · current **Intake / P1 / M / Confirmed**

**Assessment — Source-confirmed gap:** Cockpit clicks raise both throttles, cycle flaps and map the entire MCP to left FD; yoke is explicitly unavailable.

**Source context:** `cockpitInteractions.ts` marks yoke drag unavailable, advances both throttles only upward, cycles flap detents, and maps the whole MCP panel to left FD. `useCockpitInteractions.ts` derives actions from the effective-input alias.

**Owning source:** [src/viewport/cockpitInteractions.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/viewport/cockpitInteractions.ts); [src/viewport/useCockpitInteractions.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/viewport/useCockpitInteractions.ts).

**Implementation sequence:** Read pilotInputs for manipulation; add reversible independent throttle controls and named MCP targets; use pointer capture and shared command reducers.

**First-PR prerequisites:** [#62 first increment](#issue-62), [#123 first increment](#issue-123).
**Original full-scope dependencies:** [#62](https://github.com/Reedtrullz/ReedFS/issues/62). Original wording: P1 / M | Cockpit interaction | Depends: RFS-04

**Verification:** Mouse/touch/keyboard command parity; AP/A/T ownership, disabled controls and cancellation without stuck axes.

**Full completion / residual:** Complete flap/gear/speedbrake/trim and continuous yoke manipulation with command-versus-position feedback.

**Issue acceptance retained:** Mouse, touch and keyboard equivalents produce identical commands; cancellation never leaves a held control; AP commands are not accidentally copied into pilot intent. Disabled actions and command-versus-actual positions remain truthful.

<a id="issue-65"></a>
## #65 — Make cameras useful flying instruments

GitHub: [#65](https://github.com/Reedtrullz/ReedFS/issues/65) · draft **RFS-07** · **W04: Workspace, input, cockpit and model contracts** · current **Intake / P1 / M / Needs validation**

**Assessment — Feature or extension:** Follow cameras use fixed offsets; tower is aircraft-relative and cockpit follow disables camera inputs.

**Source context:** `CameraManager.ts` follows fixed chase/tower/cockpit offsets and disables camera inputs while following. The current tower mode is aircraft-relative rather than an airport-fixed observation point.

**Owning source:** [src/viewport/CameraManager.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/viewport/CameraManager.ts).

**Implementation sequence:** Add constrained look-around and reset using existing camera transforms; separate view input from flight input; add seat/FOV and chase distance settings.

**First-PR prerequisites:** No product issue prerequisite.
**Original full-scope dependencies:** [#62](https://github.com/Reedtrullz/ReedFS/issues/62). Original wording: P1 / M | Camera experience | Depends: RFS-04 for cockpit presets

**Verification:** Verify reset, horizon orientation, clipping, hidden-control hit testing and pause/free modes.

**Full completion / residual:** Add panel presets after #62, a fixed airport observation point after #84, and optional reduced-motion-aware head motion.

**Issue acceptance retained:** Looking around never steers the aircraft or clicks a hidden control; view reset restores a known eye point. Camera transitions preserve horizon orientation without clipping, and pause/free modes remain controllable.

<a id="issue-66"></a>
## #66 — Give the exterior a convincing 737-800 silhouette

GitHub: [#66](https://github.com/Reedtrullz/ReedFS/issues/66) · draft **RFS-08** · **W04: Workspace, input, cockpit and model contracts** · current **Intake / P1 / L / Needs validation**

**Assessment — Qualification-gated scope:** Procedural named parts exist; silhouette geometry is still simple and fidelity needs visual reference review.

**Source context:** `AircraftModel.ts` uses rectangular wings/tailplanes, cone nose/tail, box wheels and solid fan discs. `docs/assets/aircraft-model-strategy.md` already defines named nodes and procedural-first asset boundaries.

**Owning source:** [docs/assets/aircraft-model-strategy.md](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/docs/assets/aircraft-model-strategy.md); [src/viewport/AircraftModel.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/viewport/AircraftModel.ts).

**Implementation sequence:** Qualify visual references and variant dimensions; replace rectangular wing/tail silhouettes and shape nose/nacelles; preserve named nodes and pivots.

**First-PR prerequisites:** No product issue prerequisite.
**Original full-scope dependencies:** None stated. Original wording: P1 / L | Aircraft geometry | Depends: none

**Verification:** Front/side/top/quarter visual comparison, model axes/bounds tests and measured triangle/draw budgets.

**Full completion / residual:** Finish selected-variant winglets, pylons and cylindrical wheel assemblies; external GLB remains optional and rights-gated.

**Issue acceptance retained:** Front/side/top/three-quarter comparisons support the selected 737-800 variant and model scale; existing axis/node tests pass and representative-device draw/triangle budgets are measured.

<a id="issue-78"></a>
## #78 — Add an ND and extend staged FMS editing

GitHub: [#78](https://github.com/Reedtrullz/ReedFS/issues/78) · draft **RFS-20** · **W04: Workspace, input, cockpit and model contracts** · current **Intake / P2 / L / Needs validation**

**Assessment — Feature or extension:** Staged DIRECT TO/discontinuity/Undo/EXEC already exists; a rendered ND and richer editing remain.

**Source context:** `routeAdapter.ts` supports direct-to/discontinuity/Undo/EXEC. There is an `ndCutout` in cockpit geometry, but no corresponding RFS navigation-display component in the source inventory.

**Owning source:** [src/sim/fms/routeAdapter.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/fms/routeAdapter.ts).

**Implementation sequence:** Create an ND from active/draft route truth with range, track and cross-track error; reuse routeAdapter commands; add insert/delete and constraints.

**First-PR prerequisites:** [#59 first increment](#issue-59), [#120 first increment](#issue-120).
**Original full-scope dependencies:** [#59](https://github.com/Reedtrullz/ReedFS/issues/59), [#77](https://github.com/Reedtrullz/ReedFS/issues/77). Original wording: P2 / L | Navigation and FMS | Depends: RFS-01, RFS-19 for trajectory previews

**Verification:** Draft never steers before EXEC; Undo/replace recomputes route state and controls/panel remain equivalent.

**Full completion / residual:** Trajectory preview follows #77; qualified procedure legs and database identity belong to #146.

**Issue acceptance retained:** Preview never commands the aircraft before EXEC; route replacement/undo recomputes leg truth consistently. Synthetic routes and official-data limitations stay visible; editing through the display and panel yields identical active plans.

<a id="issue-85"></a>
## #85 — Add device profiles and real calibration

GitHub: [#85](https://github.com/Reedtrullz/ReedFS/issues/85) · draft **RFS-27** · **W04: Workspace, input, cockpit and model contracts** · current **Intake / P1 / M / Confirmed**

**Assessment — Source-confirmed gap:** Calibration parameters exist but the shell calls readGamepadActions with defaults and picks the first device.

**Source context:** `GamepadManager.ts` chooses the first connected pad and uses fixed axis/button mapping. Calibration fields exist, but `RfsShell.tsx` calls `readGamepadActions()` with defaults; `ControlsSettings.tsx` displays binding descriptions rather than an editor.

**Owning source:** [src/app/RfsShell.tsx](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/app/RfsShell.tsx); [src/components/ControlsSettings.tsx](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/components/ControlsSettings.tsx); [src/input/GamepadManager.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/input/GamepadManager.ts).

**Implementation sequence:** Persist validated selected-device/calibration profiles; wire the actual shell call; add live axis preview and editable mappings.

**First-PR prerequisites:** No product issue prerequisite.
**Original full-scope dependencies:** None stated. Original wording: P1 / M | Inputs | Depends: none

**Verification:** Two devices, reorder/reconnect, noise/inversion/deadzone and reset; actual controllers for compatibility claims.

**Full completion / residual:** Complete multi-device HOTAS/pedals and independent throttle/brake axes after measured browser/device support.

**Issue acceptance retained:** Two devices, reconnect/reorder, noisy axes and profile reset behave predictably; calibration actually changes flight input. Do not claim HOTAS compatibility from mocked browser tests alone.

<a id="issue-93"></a>
## #93 — Make the selected aircraft a complete simulation contract

GitHub: [#93](https://github.com/Reedtrullz/ReedFS/issues/93) · draft **RFS-35** · **W04: Workspace, input, cockpit and model contracts** · current **Intake / P1 / L / Needs validation**

**Assessment — Feature or extension:** Two engines, B737 data and gear construction are embedded across simulation/store paths.

**Source context:** `src/sim/types.ts` has an aircraft spec but a fixed two-engine state tuple and 737 gear creation. `src/sim/systems/engine.ts` iterates two engines; `src/store/slices/aircraftSlice.ts`, `src/store/slices/routeSlice.ts` and `src/sim/physics/integrate.ts` contain direct B737 assumptions.

**Owning source:** [src/sim/physics/integrate.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/physics/integrate.ts); [src/sim/systems/engine.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/systems/engine.ts); [src/sim/types.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/types.ts); [src/store/slices/aircraftSlice.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/store/slices/aircraftSlice.ts); [src/store/slices/routeSlice.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/store/slices/routeSlice.ts).

**Implementation sequence:** Thread a versioned profile through scenario/store/step/worker/save; preserve 737 output; use a single-engine fixture to expose concrete assumptions.

**First-PR prerequisites:** [#91 first increment](#issue-91), [#124 first increment](#issue-124).
**Original full-scope dependencies:** [#69](https://github.com/Reedtrullz/ReedFS/issues/69). Original wording: P1 / L | Aircraft architecture | Depends: RFS-11

**Verification:** No fallback to B737 constants; sync/worker parity and unchanged supported 737 regressions.

**Full completion / residual:** Generalize only capabilities required by #95-#98; qualified aircraft data remains #69 and pack-specific work.

**Issue acceptance retained:** No selected-aircraft simulation path silently falls back to B737 constants; worker and synchronous execution agree for both fixtures. Existing 737 scenario regressions remain unchanged unless separately justified. Profile mismatches and unsupported capabilities fail clearly.

<a id="issue-99"></a>
## #99 — Add aircraft asset preflight and bounded loading

GitHub: [#99](https://github.com/Reedtrullz/ReedFS/issues/99) · draft **RFS-41** · **W04: Workspace, input, cockpit and model contracts** · current **Intake / P1 / M / Needs validation**

**Assessment — Feature or extension:** Model factories and named visual nodes exist; admission/resource contracts are incomplete.

**Source context:** `src/viewport/AircraftRenderer.ts` already accepts a model factory. `src/viewport/ThreeLayer.tsx` owns the shared rendering bridge; named model nodes are used by `src/viewport/aircraftVisualState.ts`.

**Owning source:** [src/viewport/AircraftRenderer.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/viewport/AircraftRenderer.ts); [src/viewport/ThreeLayer.tsx](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/viewport/ThreeLayer.tsx); [src/viewport/aircraftVisualState.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/viewport/aircraftVisualState.ts).

**Implementation sequence:** Validate the current procedural model manifest for units/axes/bounds/eye/nodes/licenses and budgets; probe optional GLB cancellation/fallback.

**First-PR prerequisites:** No product issue prerequisite.
**Original full-scope dependencies:** [#93](https://github.com/Reedtrullz/ReedFS/issues/93). Original wording: P1 / M | Asset pipeline and rendering | Depends: RFS-35

**Verification:** Malformed/missing assets, stale completion, repeated load/unload resource ownership and nonblank framing.

**Full completion / residual:** Integrate selected-profile assets after #93; add measured LODs only where required.

**Issue acceptance retained:** Invalid/missing assets leave the current aircraft usable; stale load completion cannot replace a newer selection. Repeated selection/unload releases owned resources. Desktop/mobile visual checks verify scale, framing, animation and nonblank output within measured budgets.

<a id="issue-133"></a>
## #133 — Add pilot barometric settings and transition-aware indications

GitHub: [#133](https://github.com/Reedtrullz/ReedFS/issues/133) · draft **RFS-75** · **W04: Workspace, input, cockpit and model contracts** · current **Intake / P1 / M / Needs validation**

**Assessment — Feature or extension:** Displayed altitude uses weather QNH directly; no separate pilot-selected pressure is present.

**Source context:** `src/store/selectors.ts` derives indicated altitude directly from weather QNH using a fixed feet-per-hPa approximation; `src/instruments/RfsPFD.tsx` displays QNH/STD text. There is no independently selected pressure setting in that inspected indication path.

**Owning source:** [src/instruments/RfsPFD.tsx](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/instruments/RfsPFD.tsx); [src/store/selectors.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/store/selectors.ts).

**Implementation sequence:** Add selected pressure/STD and unit formatting without modifying ambient pressure; persist it; author wrong-setting/transition cases.

**First-PR prerequisites:** [#91 first increment](#issue-91), [#132 first increment](#issue-132), [#147 first increment](#issue-147).
**Original full-scope dependencies:** [#63](https://github.com/Reedtrullz/ReedFS/issues/63), [#110](https://github.com/Reedtrullz/ReedFS/issues/110). Original wording: P1 / M | Altimetry and cockpit workflow | Depends: RFS-05, RFS-52

**Verification:** Weather update leaves knob unchanged; wrong setting changes indication only; STD reversibility and hPa/inHg.

**Full completion / residual:** Review guidance/source policy with #110 and finish #63 standby/panel indications and scenario transition datums.

**Issue acceptance retained:** Wrong setting changes indicated altitude only through the documented observation model. Weather updates do not move the pilot knob; STD selection is reversible. Test climb/descent transition reminders, hPa/inHg conversion, disagreement, invalid settings and saved state without altering route truth secretly.

<a id="issue-135"></a>
## #135 — Add source-aware speed limits and trends to the PFD

GitHub: [#135](https://github.com/Reedtrullz/ReedFS/issues/135) · draft **RFS-77** · **W04: Workspace, input, cockpit and model contracts** · current **Intake / P2 / M / Needs validation**

**Assessment — Qualification-gated scope:** Speed tapes/bugs exist; profile/configuration envelope markers and timestamped trends remain.

**Source context:** `src/instruments/RfsPFD.tsx` has speed/altitude tapes and selected/managed bugs; `src/store/selectors.ts` provides current quantities. Existing takeoff references do not define a full dynamic speed-envelope display.

**Owning source:** [src/instruments/RfsPFD.tsx](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/instruments/RfsPFD.tsx); [src/store/selectors.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/store/selectors.ts).

**Implementation sequence:** Add sourced/provisional limit identity and filtered committed-time speed trend; suppress unknown markers; consume selected profile.

**First-PR prerequisites:** [#93 first increment](#issue-93), [#132 first increment](#issue-132), [#147 first increment](#issue-147).
**Original full-scope dependencies:** [#63](https://github.com/Reedtrullz/ReedFS/issues/63), [#69](https://github.com/Reedtrullz/ReedFS/issues/69), [#93](https://github.com/Reedtrullz/ReedFS/issues/93), [#132](https://github.com/Reedtrullz/ReedFS/issues/132). Original wording: P2 / M | Instrument legibility | Depends: RFS-05, RFS-11, RFS-35, RFS-74

**Verification:** Configuration changes, conflicting marker readability, pause/restore trend reset and cockpit/overlay equality.

**Full completion / residual:** Qualified low-speed/buffet/load margins depend on #69/#138; no always-safe envelope band.

**Issue acceptance retained:** Flap/gear/weight changes update only justified limits; unknown data suppresses markers. Trend resets at reposition/restore and does not grow from wall-time pause. Cockpit/pop-out/overlay match, labels remain readable on narrow views, and conflicting bugs/limits never conceal the current speed.

<a id="issue-151"></a>
## #151 — Separate presentation language and units from simulation values

GitHub: [#151](https://github.com/Reedtrullz/ReedFS/issues/151) · draft **RFS-93** · **W04: Workspace, input, cockpit and model contracts** · current **Intake / P2 / M / Needs validation**

**Assessment — Feature or extension:** Labels are English and unit formatting is inline; canonical conversion helpers exist.

**Source context:** `src/instruments/RfsPFD.tsx`, `src/instruments/RfsMCP.tsx` and component controls embed English labels/unit formatting; `src/sim/physics/units.ts` already supplies numerical conversion helpers.

**Owning source:** [src/instruments/RfsMCP.tsx](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/instruments/RfsMCP.tsx); [src/instruments/RfsPFD.tsx](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/instruments/RfsPFD.tsx); [src/sim/physics/units.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/physics/units.ts).

**Implementation sequence:** Extract shell copy for English/Norwegian and native formatting; add selectable fuel/weather display units; parse numeric input explicitly.

**First-PR prerequisites:** [#59 first increment](#issue-59), [#60 first increment](#issue-60), [#93 first increment](#issue-93).
**Original full-scope dependencies:** [#59](https://github.com/Reedtrullz/ReedFS/issues/59), [#60](https://github.com/Reedtrullz/ReedFS/issues/60), [#93](https://github.com/Reedtrullz/ReedFS/issues/93). Original wording: P2 / M | Internationalization and accessibility | Depends: RFS-01, RFS-02, RFS-35

**Verification:** Decimal/paste magnitude, display-precision round trips, long labels/narrow zoom and no simulation changes.

**Full completion / residual:** Review aviation terminology, captions/speech and save/profile compatibility; cockpit-standard units stay explicit.

**Issue acceptance retained:** Decimal separators and pasted numbers cannot silently change magnitude; conversions round-trip within declared display precision. Long labels, zoom and narrow screens remain usable. Saves retain canonical units and locale changes do not move levers or route coordinates. Untranslated technical terms are labeled consistently.

<a id="issue-67"></a>
## #67 — Animate actual aircraft mechanics, not whole assemblies

GitHub: [#67](https://github.com/Reedtrullz/ReedFS/issues/67) · draft **RFS-09** · **W05: Surfaces, weather, contact and aircraft presentation** · current **Intake / P2 / L / Needs validation**

**Assessment — Feature or extension:** Animation scales entire gear groups and uses separate model/contact geometry constants.

**Source context:** `aircraftModelAnimation.ts` rotates flaps and controls, translates retracting gear and compresses it by scaling whole groups. Exterior gear placement and `b737-800-fdm.v1.ts` contact stations use independent geometry constants.

**Owning source:** [src/sim/data/aircraft/b737-800-fdm.v1.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/data/aircraft/b737-800-fdm.v1.ts); [src/viewport/aircraftModelAnimation.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/viewport/aircraftModelAnimation.ts).

**Implementation sequence:** Create an explicit body-to-model contact mapping; animate individual struts and wheels; add articulated gear/doors and actual-position surface animation.

**First-PR prerequisites:** [#66 first increment](#issue-66), [#72 first increment](#issue-72).
**Original full-scope dependencies:** [#66](https://github.com/Reedtrullz/ReedFS/issues/66), [#72](https://github.com/Reedtrullz/ReedFS/issues/72). Original wording: P2 / L | Aircraft animation | Depends: RFS-08, RFS-14 for contact correspondence

**Verification:** Visual/physical contact coincidence, asymmetric compression, gear transit and allocation/resource checks.

**Full completion / residual:** Complete slats/spoilers and supported mechanics; wing flex stays a bounded visual approximation.

**Issue acceptance retained:** Wheels meet the runway at modeled contact points; commands and actual transit differ visibly; spoilers/flaps show effective configuration. No allocation of geometry per frame, and animation never changes simulation truth.

<a id="issue-68"></a>
## #68 — Add aircraft surface detail and readable lighting

GitHub: [#68](https://github.com/Reedtrullz/ReedFS/issues/68) · draft **RFS-10** · **W05: Surfaces, weather, contact and aircraft presentation** · current **Intake / P2 / M / Needs validation**

**Assessment — Qualification-gated scope:** Shared solid materials and light meshes exist; original textures and exposure improvements are new work.

**Source context:** `AircraftModel.ts` largely uses shared solid-color materials and emissive light spheres; existing named light state is already animated.

**Owning source:** [src/viewport/AircraftModel.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/viewport/AircraftModel.ts).

**Implementation sequence:** Author one lawful original texture set; add window/door/seam details on the qualified model; implement readable light intensity/flash behavior.

**First-PR prerequisites:** [#66 first increment](#issue-66), [#82 first increment](#issue-82).
**Original full-scope dependencies:** [#66](https://github.com/Reedtrullz/ReedFS/issues/66), [#82](https://github.com/Reedtrullz/ReedFS/issues/82). Original wording: P2 / M | Aircraft materials | Depends: RFS-08, RFS-24

**Verification:** Day/dusk/night images, cockpit-display readability and measured texture memory.

**Full completion / residual:** Complete lighting and attribution before closure; additional liveries remain within the same budgets.

**Issue acceptance retained:** Aircraft detail reads at practical camera distances in daylight/dusk/night, with no overbright windshield or unreadable displays. Assets have provenance; day/night screenshots and texture-memory measurements accompany review.

<a id="issue-72"></a>
## #72 — Let rotation, touchdown and bounce emerge from contact forces

GitHub: [#72](https://github.com/Reedtrullz/ReedFS/issues/72) · draft **RFS-14** · **W05: Surfaces, weather, contact and aircraft presentation** · current **Intake / P1 / L / Strong evidence**

**Assessment — Validation / investigation first:** Per-wheel spring/damper calculations coexist with liftoff gates, attitude clamps and runway-normal velocity removal.

**Source context:** `integrate.ts` gates liftoff by elevator command, weight-based reference speed, pitch and normal force; `ground.ts` also clamps attitudes, redistributes pivot loads and removes runway-normal velocity despite having per-wheel spring/damper calculations.

**Owning source:** [src/sim/physics/integrate.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/physics/integrate.ts); [src/sim/systems/ground.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/systems/ground.ts).

**Implementation sequence:** Instrument station loads and contacts; add symmetric/asymmetric/drop/rotation fixtures; replace each clamp only after its shield is reproduced physically.

**First-PR prerequisites:** [#70 first increment](#issue-70), [#125 first increment](#issue-125), [#83 first increment](#issue-83).
**Original full-scope dependencies:** [#69](https://github.com/Reedtrullz/ReedFS/issues/69), [#70](https://github.com/Reedtrullz/ReedFS/issues/70). Original wording: P1 / L | Ground-air transition | Depends: RFS-12; RFS-11 for calibration

**Verification:** No false low-speed liftoff/stuck runway, timestep-refined bounce and geometric tail clearance; continuous flight regression.

**Full completion / residual:** Qualify contact/gear parameters under #69 and retire remaining gameplay gates incrementally.

**Issue acceptance retained:** No low-speed false liftoff, stuck-to-runway behavior or timestep-dependent bounce; asymmetric touchdowns and tailstrike follow geometry. Preserve full-flight progress and avoid silently changing the aircraft altitude reference.

<a id="issue-73"></a>
## #73 — Model a complete landing and rejected-takeoff braking chain

GitHub: [#73](https://github.com/Reedtrullz/ReedFS/issues/73) · draft **RFS-15** · **W05: Surfaces, weather, contact and aircraft presentation** · current **Intake / P2 / L / Needs validation**

**Assessment — Feature or extension:** Differential brakes and simplified anti-skid exist; armed spoiler, reverser and autobrake chains are incomplete.

**Source context:** `ground.ts` already has separate brakes, friction limits and simplified anti-skid; `types.ts` has spoiler arming state, but the reviewed integration maps deployment directly from pilot spoiler input and exposes forward throttle only.

**Owning source:** [src/sim/systems/ground.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/systems/ground.ts); [src/sim/types.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/types.ts).

**Implementation sequence:** Add armed ground spoilers and ground-only reverse-idle interlocks; introduce explicit mode transitions; combine longitudinal/lateral grip budgets.

**First-PR prerequisites:** [#72 first increment](#issue-72), [#74 first increment](#issue-74).
**Original full-scope dependencies:** [#69](https://github.com/Reedtrullz/ReedFS/issues/69), [#72](https://github.com/Reedtrullz/ReedFS/issues/72), [#74](https://github.com/Reedtrullz/ReedFS/issues/74). Original wording: P2 / L | Ground handling | Depends: RFS-14, RFS-16; RFS-11 for numerical fidelity

**Verification:** Dry/wet and RTO comparisons, asymmetric braking, airborne reverse rejection and energy/sign checks.

**Full completion / residual:** Complete autobrake/disarm, reverse thrust and supported wheel/brake-energy behavior with #69 evidence.

**Issue acceptance retained:** Compare manual/autobrake/RTO stopping runs, dry/wet bounds, asymmetric braking and airborne reverse inhibition. Brake forces cannot add energy; all new modes are visible and the current RETARD/rollout sequence remains observable.

<a id="issue-80"></a>
## #80 — Replace flat gust waves with a spatial, repeatable atmosphere

GitHub: [#80](https://github.com/Reedtrullz/ReedFS/issues/80) · draft **RFS-22** · **W05: Surfaces, weather, contact and aircraft presentation** · current **Intake / P2 / M / Needs validation**

**Assessment — Feature or extension:** Current seeded gusts have no vertical component and only one wind layer.

**Source context:** `environment.ts` uses seeded sinusoidal along/lateral gusts and always returns zero vertical gust; `WindInfo` represents a single wind layer.

**Owning source:** [src/sim/systems/environment.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/systems/environment.ts).

**Implementation sequence:** Add smooth altitude layers and a seeded spatial three-axis field using explicit simulation time; author bounded shear profiles.

**First-PR prerequisites:** [#70 first increment](#issue-70), [#82 first increment](#issue-82).
**Original full-scope dependencies:** [#70](https://github.com/Reedtrullz/ReedFS/issues/70). Original wording: P2 / M | Weather physics | Depends: RFS-12

**Verification:** Same position/time/seed yields main/worker parity; smooth layers and FPS-independent exposure.

**Full completion / residual:** Keep METAR surface observations and authored/estimated winds aloft distinct; advanced spectra require measured need.

**Issue acceptance retained:** Same seed/position/time gives the same field in worker and main-thread runs; layer transitions are smooth and air-relative/ground-relative velocity conventions remain intact. Changing frame rate does not change turbulence exposure.

<a id="issue-81"></a>
## #81 — Make weather visibility match the flying conditions

GitHub: [#81](https://github.com/Reedtrullz/ReedFS/issues/81) · draft **RFS-23** · **W05: Surfaces, weather, contact and aircraft presentation** · current **Intake / P2 / M / Confirmed**

**Assessment — Source-confirmed gap:** Cloud base is placed directly as globe altitude; observation age and request cancellation are absent from the data contract.

**Source context:** `CloudLayer.tsx` draws seeded billboards at a fixed anchor and uses cloud base directly as globe altitude. `weather.ts` keeps visibility but drops observation timestamps; `fetchMetar` has no explicit cancellation/timeout parameter.

**Owning source:** [src/sim/weather.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/weather.ts); [src/viewport/CloudLayer.tsx](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/viewport/CloudLayer.tsx).

**Implementation sequence:** Add station/datum/freshness/source identity and abort/timeout handling; convert cloud base correctly; render visibility and reuse cloud textures.

**First-PR prerequisites:** [#82 first increment](#issue-82).
**Original full-scope dependencies:** [#80](https://github.com/Reedtrullz/ReedFS/issues/80). Original wording: P2 / M | Weather rendering and data | Depends: RFS-22 for shared spatial state

**Verification:** Station elevation, stale/offline fallback, late response, cloud-entry visibility and GPU budget tests.

**Full completion / residual:** Use #80 spatial fields for weather movement and optional precipitation; label scenario fallback and validate ranges.

**Issue acceptance retained:** Verify cloud base against station elevation, inside/outside-cloud visibility, stale/offline fallback and late station responses. GPU budgets are measured; no volumetric-cloud rewrite is assumed.

<a id="issue-83"></a>
## #83 — Unify rendered and physical surfaces, including runway edits

GitHub: [#83](https://github.com/Reedtrullz/ReedFS/issues/83) · draft **RFS-25** · **W05: Surfaces, weather, contact and aircraft presentation** · current **Intake / P1 / L / Confirmed**

**Assessment — Source-confirmed gap:** Rendered runway overrides are separate from static physics sampling; unsupported surface altitude is aircraft altitude.

**Source context:** `RunwayLayer.tsx` applies editor overrides to its local rendered runway list; `runwaySurface.ts` samples the static catalog. Off-runway elevation follows the nearest runway, and unsupported terrain returns the aircraft's own altitude as a placeholder.

**Owning source:** [src/sim/runwaySurface.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/runwaySurface.ts); [src/viewport/RunwayLayer.tsx](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/viewport/RunwayLayer.tsx).

**Implementation sequence:** Create a validated shared surface revision consumed by renderer, route and contact sampling; expose unknown terrain; apply edits atomically.

**First-PR prerequisites:** [#91 first increment](#issue-91), [#120 first increment](#issue-120).
**Original full-scope dependencies:** None stated. Original wording: P1 / L | Terrain and surface truth | Depends: none

**Verification:** Move/elevate a runway and compare visuals/contact/guidance; stale/missing samples never claim known ground.

**Full completion / residual:** Add bounded authoritative terrain/slope/datum coverage asynchronously; preserve surface identity in save/replay.

**Issue acceptance retained:** A runway position/elevation edit moves both visual and contact geometry; surface validity and stale samples are explicit. Hills/off-airport contact work only where trusted coverage exists; missing tiles never masquerade as known terrain.

<a id="issue-84"></a>
## #84 — Build small, flyable airport environments

GitHub: [#84](https://github.com/Reedtrullz/ReedFS/issues/84) · draft **RFS-26** · **W05: Surfaces, weather, contact and aircraft presentation** · current **Intake / P2 / L / Needs validation**

**Assessment — Qualification-gated scope:** Runway endpoints/markings and KSEA reference scenery exist; ENVA taxi/stand/airport surfaces are additional scope.

**Source context:** `RunwayLayer.tsx` provides generic markings/lights and KSEA-specific apron/taxiway reference geometry; the Norway runway catalog already supplies endpoints, not a complete airport surface network.

**Owning source:** [src/viewport/RunwayLayer.tsx](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/viewport/RunwayLayer.tsx).

**Implementation sequence:** Build one original or licensed ENVA surface/marking pack; share geometry and datums with physics; add taxi route and hold-short/stand references.

**First-PR prerequisites:** [#83 first increment](#issue-83), [#82 first increment](#issue-82).
**Original full-scope dependencies:** [#82](https://github.com/Reedtrullz/ReedFS/issues/82), [#83](https://github.com/Reedtrullz/ReedFS/issues/83). Original wording: P2 / L | Airport scenery and taxi | Depends: RFS-25, RFS-24

**Verification:** Manual circuit-to-stand and visual/contact agreement, runway IDs, attribution and supported-area tests.

**Full completion / residual:** Add approach/PAPI and restrained airport detail; retain explicit synthetic-versus-sourced data boundaries.

**Issue acceptance retained:** Fly a circuit and taxi clear to a stand without visual/physical mismatch, floating markings or misleading runway IDs. Attribution, geometry datums and procedural-data non-claims are reviewed alongside visual quality.

<a id="issue-86"></a>
## #86 — Make sound convey aircraft state and camera position

GitHub: [#86](https://github.com/Reedtrullz/ReedFS/issues/86) · draft **RFS-28** · **W05: Surfaces, weather, contact and aircraft presentation** · current **Intake / P2 / M / Needs validation**

**Assessment — Feature or extension:** EngineSound synthesizes simple N1 oscillators; routing/captions/autoplay activation already exist.

**Source context:** `EngineSound.ts` uses one sawtooth oscillator per engine driven by N1. GPWS, captions, audio buses/settings and explicit autoplay activation already exist.

**Owning source:** [src/audio/EngineSound.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/audio/EngineSound.ts).

**Implementation sequence:** Add bounded procedural engine/airflow layers and camera filtering; spatialize independent engines through current routing; preserve warning priority.

**First-PR prerequisites:** [#65 first increment](#issue-65), [#74 first increment](#issue-74), [#102 first increment](#issue-102), [#103 first increment](#issue-103).
**Original full-scope dependencies:** [#65](https://github.com/Reedtrullz/ReedFS/issues/65), [#74](https://github.com/Reedtrullz/ReedFS/issues/74). Original wording: P2 / M | Audio | Depends: RFS-16, RFS-07

**Verification:** Cockpit/chase idle/climb/asymmetry listening, overlap clipping and lifecycle node cleanup.

**Full completion / residual:** Add gear/flap/brake cues and optional lawful samples through #106; require human listening acceptance.

**Issue acceptance retained:** Human listening compares cockpit/chase, idle/climb and asymmetry; no clipping, warning masking or autoplay regressions. Pause/reset/unmount stop obsolete cues and do not accumulate audio nodes.

<a id="issue-75"></a>
## #75 — Make loading, fuel imbalance and engine asymmetry matter

GitHub: [#75](https://github.com/Reedtrullz/ReedFS/issues/75) · draft **RFS-17** · **W06: Systems, observations and energy-aware flight** · current **Intake / P2 / L / Strong evidence**

**Assessment — Feature or extension:** Fuel uses fixed longitudinal arms and CG clamps; thrust is summed without explicit engine-arm yaw and inertias are fixed.

**Source context:** `fuel.ts` recomputes longitudinal CG with fixed tank arms and clamps to limits. `aero.ts` sums engine thrust without an explicit engine-arm yaw moment; `integrate.ts` takes inertias from fixed aircraft specification values.

**Owning source:** [src/sim/physics/aero.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/physics/aero.ts); [src/sim/physics/integrate.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/physics/integrate.ts); [src/sim/systems/fuel.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/systems/fuel.ts).

**Implementation sequence:** Add auditable loading stations and asymmetric-thrust moment; reject invalid authored loading; preserve corruption safeguards.

**First-PR prerequisites:** [#70 first increment](#issue-70), [#74 first increment](#issue-74).
**Original full-scope dependencies:** [#69](https://github.com/Reedtrullz/ReedFS/issues/69), [#70](https://github.com/Reedtrullz/ReedFS/issues/70), [#74](https://github.com/Reedtrullz/ReedFS/issues/74). Original wording: P2 / L | Mass and balance | Depends: RFS-11, RFS-12, RFS-16

**Verification:** Mass/moment conservation, left/right symmetry, engine-out yaw sign and worker/save parity.

**Full completion / residual:** Complete tank feed/crossfeed, lateral CG and loading-dependent inertia with qualified #69 data.

**Issue acceptance retained:** Mass/CG conservation, left/right symmetry and engine-out yaw sign have analytic checks. Burning/transferring fuel updates loading consistently, and unsupported loading envelopes remain explicitly unavailable.

<a id="issue-76"></a>
## #76 — Connect electrical and hydraulic systems to real consequences

GitHub: [#76](https://github.com/Reedtrullz/ReedFS/issues/76) · draft **RFS-18** · **W06: Systems, observations and energy-aware flight** · current **Intake / P2 / L / Strong evidence**

**Assessment — Feature or extension:** Electrical/hydraulic state is modeled simply but does not consistently govern actuator/display availability.

**Source context:** `electrical.ts` derives a single powered-bus flag from engines; `hydraulic.ts` tracks engine-driven target pressures and battery-based standby pressure. The reviewed config/control integration does not use those pressures to determine actuator availability.

**Owning source:** [src/sim/systems/electrical.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/systems/electrical.ts); [src/sim/systems/hydraulic.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/systems/hydraulic.ts).

**Implementation sequence:** Define a small bus/pump/consumer graph in existing systems; implement one bus-loss case; project availability to actuators and existing displays.

**First-PR prerequisites:** [#74 first increment](#issue-74).
**Original full-scope dependencies:** [#63](https://github.com/Reedtrullz/ReedFS/issues/63), [#74](https://github.com/Reedtrullz/ReedFS/issues/74). Original wording: P2 / L | Aircraft systems | Depends: RFS-16, RFS-05 for cockpit indications

**Verification:** Healthy-flight preservation, power-loss causal effects, bounded pressure response and complete reset/restore.

**Full completion / residual:** Finish A/B/standby controls, generator isolation, gear/flap/control dependencies and #63 cockpit indications.

**Issue acceptance retained:** A selected failure causes documented, bounded effects through physics, instruments and sound. Restore/reset recovers all states; healthy flight is unchanged. Detailed pneumatic/pressurization/ice-protection systems are separate source-gated follow-ups.

<a id="issue-77"></a>
## #77 — Make autoflight energy-aware across the flight envelope

GitHub: [#77](https://github.com/Reedtrullz/ReedFS/issues/77) · draft **RFS-19** · **W06: Systems, observations and energy-aware flight** · current **Intake / P1 / L / Strong evidence**

**Assessment — Validation / investigation first:** Energy fixes from PR #50 already exist; fixed VNAV path/minimum climb assumptions remain.

**Source context:** `vnav.ts` uses a fixed 318 ft/NM descent estimate and minimum climb VS; `autopilot.ts` already contains controller state, saturation limits and mode-dependent throttle logic.

**Owning source:** [src/sim/systems/autopilot.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/systems/autopilot.ts); [src/sim/systems/vnav.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/systems/vnav.ts).

**Implementation sequence:** Measure infeasible climb/descent cases; add explicit unable-path truth and constrain requests with existing controller limits; avoid rewriting FMA ownership.

**First-PR prerequisites:** [#70 first increment](#issue-70), [#74 first increment](#issue-74), [#132 first increment](#issue-132).
**Original full-scope dependencies:** [#69](https://github.com/Reedtrullz/ReedFS/issues/69), [#70](https://github.com/Reedtrullz/ReedFS/issues/70), [#74](https://github.com/Reedtrullz/ReedFS/issues/74). Original wording: P1 / L | AP, A/T and VNAV | Depends: RFS-12, RFS-16; RFS-11 for tuning

**Verification:** Mass/wind/temperature matrix, speed floor, capture/handoff, constraints/discontinuities and RETARD observability.

**Full completion / residual:** Add feasible route/deceleration trajectory and IAS/Mach scheduling only against qualified #69 envelopes.

**Issue acceptance retained:** Light/heavy, head/tailwind and hot/high runs avoid speed collapse and mode chatter; MCP limits and discontinuities still govern authority. FMA reports effective behavior, including RETARD, not merely selected modes.

<a id="issue-108"></a>
## #108 — Add a cold-and-dark startup with real enabling conditions

GitHub: [#108](https://github.com/Reedtrullz/ReedFS/issues/108) · draft **RFS-50** · **W06: Systems, observations and energy-aware flight** · current **Intake / P2 / L / Needs validation**

**Assessment — Feature or extension:** Current engine state initializes warm; starter/bleed/APU enabling sequence is absent.

**Source context:** `src/sim/types.ts` initializes engine state; `src/sim/systems/engine.ts` focuses on N1/thrust. `src/sim/simulationStep.ts` is the integration point for systems; Round 1 covers electrical/hydraulic and engine groundwork.

**Owning source:** [src/sim/simulationStep.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/simulationStep.ts); [src/sim/systems/engine.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/systems/engine.ts); [src/sim/types.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/types.ts).

**Implementation sequence:** Add one bounded startup state machine with battery/external power, APU/starter availability and fuel introduction; expose real controls.

**First-PR prerequisites:** [#64 first increment](#issue-64), [#74 first increment](#issue-74), [#76 first increment](#issue-76).
**Original full-scope dependencies:** [#64](https://github.com/Reedtrullz/ReedFS/issues/64), [#74](https://github.com/Reedtrullz/ReedFS/issues/74), [#76](https://github.com/Reedtrullz/ReedFS/issues/76). Original wording: P2 / L | Aircraft systems and cockpit | Depends: RFS-06, RFS-16, RFS-18

**Verification:** Impossible enables rejected, aborted start coherent, shutdown/warm starts, save/reset/worker parity.

**Full completion / residual:** Document simplifications and source limits; add pneumatic complexity only for actual prerequisites.

**Issue acceptance retained:** Engines cannot start from impossible enabling states; aborted/failed starts leave coherent temperatures, power and spool states within modeled fidelity. Warm starts and existing scenarios remain supported. Every simplification and reference limit is visible in the evidence packet.

<a id="issue-110"></a>
## #110 — Separate aircraft truth from faulty air-data indications

GitHub: [#110](https://github.com/Reedtrullz/ReedFS/issues/110) · draft **RFS-52** · **W06: Systems, observations and energy-aware flight** · current **Intake / P1 / L / Needs validation**

**Assessment — Feature or extension:** PFD derives ideal state directly; fault observation/validity is not separated.

**Source context:** `src/sim/physics/derived.ts` directly derives ideal IAS/Mach/altitude from air-relative state and atmosphere; `src/store/selectors.ts` projects that truth to instruments with barometric adjustment.

**Owning source:** [src/sim/physics/derived.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/physics/derived.ts); [src/store/selectors.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/store/selectors.ts).

**Implementation sequence:** Introduce a small air-data observation layer; add blocked-pitot/static-source cases with source/power/validity; declare each guidance consumer policy.

**First-PR prerequisites:** [#76 first increment](#issue-76), [#132 first increment](#issue-132), [#147 first increment](#issue-147).
**Original full-scope dependencies:** [#69](https://github.com/Reedtrullz/ReedFS/issues/69), [#76](https://github.com/Reedtrullz/ReedFS/issues/76). Original wording: P1 / L | Sensors and instrument integrity | Depends: RFS-11, RFS-18

**Verification:** Fault indications diverge while physical truth remains unchanged; valid/invalid guidance, reset/save/worker preservation.

**Full completion / residual:** Add standby/disagreement and AP availability; calibrated fault/fidelity claims require #69 evidence.

**Issue acceptance retained:** Failed indications diverge as the documented fault model predicts while true flight remains coherent. Each AP/FD consumer explicitly chooses valid observed data or documented simulation truth; failures cannot secretly leave certified-looking guidance active. Save/worker/replay paths preserve validity and fault identity.

<a id="issue-112"></a>
## #112 — Add optional structural and configuration-limit consequences

GitHub: [#112](https://github.com/Reedtrullz/ReedFS/issues/112) · draft **RFS-54** · **W06: Systems, observations and energy-aware flight** · current **Intake / P2 / L / Needs validation**

**Assessment — Feature or extension:** No dedicated exceedance/consequence contract exists.

**Source context:** `src/sim/physics/integrate.ts` and `src/sim/physics/derived.ts` provide state/load quantities; `src/sim/types.ts` does not define a dedicated damage/consequence state in the inspected contract.

**Owning source:** [src/sim/physics/derived.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/physics/derived.ts); [src/sim/physics/integrate.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/physics/integrate.ts); [src/sim/types.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/types.ts).

**Implementation sequence:** Add opt-in sustained exceedance records using qualified limits and hysteresis; begin warnings/scoring; separate numerical invalidity from gameplay damage.

**First-PR prerequisites:** [#70 first increment](#issue-70), [#71 first increment](#issue-71), [#72 first increment](#issue-72).
**Original full-scope dependencies:** [#69](https://github.com/Reedtrullz/ReedFS/issues/69), [#70](https://github.com/Reedtrullz/ReedFS/issues/70), [#71](https://github.com/Reedtrullz/ReedFS/issues/71), [#72](https://github.com/Reedtrullz/ReedFS/issues/72). Original wording: P2 / L | Flight envelope and challenge modes | Depends: RFS-11, RFS-12, RFS-13, RFS-14

**Verification:** Spike versus sustained exceedance, reset/replay thresholds, practice recovery and no unsupported permanent damage.

**Full completion / residual:** Degraded handling/contact effects wait for #69 and justified models; no arbitrary hit-point breakup.

**Issue acceptance retained:** Brief numerical spikes do not produce unexplained permanent damage; sustained exceedances accumulate predictably. Thresholds, hysteresis, reset and replay are tested. Clearly separate gameplay consequence rules from engineering fatigue/crashworthiness claims.

<a id="issue-113"></a>
## #113 — Add tuned raw radio navigation with signal identity

GitHub: [#113](https://github.com/Reedtrullz/ReedFS/issues/113) · draft **RFS-55** · **W06: Systems, observations and energy-aware flight** · current **Intake / P1 / L / Needs validation**

**Assessment — Qualification-gated scope:** Approach guidance is synthetic runway geometry and does not require tuned signal identity.

**Source context:** `src/sim/systems/guidanceTargets.ts` generates approach guidance from runway geometry; `src/sim/systems/effectiveAutoflightTruth.ts` gates that synthetic approach profile. The flown approach path does not require a tuned station/signal identity.

**Owning source:** [src/sim/systems/effectiveAutoflightTruth.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/systems/effectiveAutoflightTruth.ts); [src/sim/systems/guidanceTargets.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/systems/guidanceTargets.ts).

**Implementation sequence:** Qualify a tiny station set; add NAV tune/ident and validity/deviation observations; render raw data before AP coupling.

**First-PR prerequisites:** [#78 first increment](#issue-78), [#147 first increment](#issue-147), [#120 first increment](#issue-120).
**Original full-scope dependencies:** [#63](https://github.com/Reedtrullz/ReedFS/issues/63), [#78](https://github.com/Reedtrullz/ReedFS/issues/78). Original wording: P1 / L | Navigation instruments | Depends: RFS-05, RFS-20

**Verification:** Wrong frequency/range, loss/acquisition, front/back-course policy and invalid needles/modes.

**Full completion / residual:** Integrate supported AP radio modes and #63 panel displays with preserved FMA/RETARD truth.

**Issue acceptance retained:** Wrong frequency, out-of-range/invalid stations and unsuitable geometry cannot produce a valid-looking needle or arm a supported radio mode. Test front/back-course policy and acquisition/loss. Preserve existing FMA/RETARD boundaries and never imply current real-world navigation data.

<a id="issue-127"></a>
## #127 — Add a coherent master-warning and system-annunciation layer

GitHub: [#127](https://github.com/Reedtrullz/ReedFS/issues/127) · draft **RFS-69** · **W06: Systems, observations and energy-aware flight** · current **Intake / P1 / L / Needs validation**

**Assessment — Feature or extension:** GPWS, engine indications and FMA exist separately; system annunciation has no unified lifecycle.

**Source context:** `src/components/EngineStrip.tsx` exposes engine values, `src/sim/types.ts` exposes electrical/hydraulic state, and `src/instruments/RfsPFD.tsx` handles guidance advisories. GPWS has its own alert path; there is no unified aircraft-system annunciation contract in the inspected flown path.

**Owning source:** [src/components/EngineStrip.tsx](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/components/EngineStrip.tsx); [src/instruments/RfsPFD.tsx](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/instruments/RfsPFD.tsx); [src/sim/types.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/types.ts).

**Implementation sequence:** Derive one qualified bus/pressure alert set with active/new/acknowledged/cleared states; expose master caution and recall.

**First-PR prerequisites:** [#76 first increment](#issue-76), [#101 first increment](#issue-101), [#147 first increment](#issue-147).
**Original full-scope dependencies:** [#63](https://github.com/Reedtrullz/ReedFS/issues/63), [#76](https://github.com/Reedtrullz/ReedFS/issues/76), [#101](https://github.com/Reedtrullz/ReedFS/issues/101). Original wording: P1 / L | Cockpit system awareness | Depends: RFS-05, RFS-18, RFS-43

**Verification:** Acknowledgement does not clear fault; new fault reannunciates; power/invalid detection and GPWS priority/text parity.

**Full completion / residual:** Complete test/inhibit/status behavior and #63/#116 display parity for modeled conditions only.

**Issue acceptance retained:** Acknowledgement silences the eligible cue but never clears the underlying fault; a new qualifying fault reannunciates. Invalid/unpowered detection is distinct from healthy state. Simultaneous system/GPWS alerts respect priority and caption parity; cockpit/overlay/pop-out states agree.

<a id="issue-131"></a>
## #131 — Add an explicit yaw-damper and rudder-authority model

GitHub: [#131](https://github.com/Reedtrullz/ReedFS/issues/131) · draft **RFS-73** · **W06: Systems, observations and energy-aware flight** · current **Intake / P2 / L / Needs validation**

**Assessment — Qualification-gated scope:** Rudder dynamics/Dutch-roll checks exist; dedicated augmentation is new scope.

**Source context:** `src/sim/physics/aero.ts` models rudder/sideslip/yaw-rate effects; `src/sim/types.ts` AP commands omit rudder. `src/sim/physics/__tests__/dynamicModes.test.ts` already checks bounded Dutch-roll perturbations.

**Owning source:** [src/sim/physics/__tests__/dynamicModes.test.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/physics/__tests__/dynamicModes.test.ts); [src/sim/physics/aero.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/physics/aero.ts); [src/sim/types.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/types.ts).

**Implementation sequence:** Qualify one yaw-rate feedback condition; add bounded rudder command/actual power/availability and off/on comparison.

**First-PR prerequisites:** [#70 first increment](#issue-70), [#76 first increment](#issue-76).
**Original full-scope dependencies:** [#69](https://github.com/Reedtrullz/ReedFS/issues/69), [#70](https://github.com/Reedtrullz/ReedFS/issues/70), [#76](https://github.com/Reedtrullz/ReedFS/issues/76). Original wording: P2 / L | Lateral-directional dynamics | Depends: RFS-11, RFS-12, RFS-18

**Verification:** Direction, damping, timestep robustness, saturation, pilot rudder and engine asymmetry coexist.

**Full completion / residual:** Add speed/rudder scheduling only with #69 data; intentional crosswind slip cannot be invisibly overridden.

**Issue acceptance retained:** Off/on response has documented damping/authority and timestep robustness; loss of power removes only supported augmentation. Saturation, pilot rudder and engine asymmetry coexist without feedback runaway. Test direction/sign and preserve manual-input truth; aircraft-specific evidence is required before fidelity claims.

<a id="issue-79"></a>
## #79 — Add complete missed-approach and abnormal-flight exercises

GitHub: [#79](https://github.com/Reedtrullz/ReedFS/issues/79) · draft **RFS-21** · **W07: Practice, recorder, navigation data and session workflows** · current **Intake / P3 / L / Needs validation**

**Assessment — Feature or extension:** Current approach/autoland is delivered; complete go-around and supported abnormal exercise flows remain.

**Source context:** The project has approach/autoland/rollout guidance and scenarios; RFS input commands have no visible end-to-end TOGA/go-around exercise in the inspected command paths. This is a proposed flow, not proof that shared RFMS has no TOGA support.

**Owning source:** [src/instruments/mcpCommands.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/instruments/mcpCommands.ts); [src/sim/scenarios.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/scenarios.ts); [src/sim/simulationStep.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/simulationStep.ts); [src/sim/systems/effectiveAutoflightTruth.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/systems/effectiveAutoflightTruth.ts).

**Implementation sequence:** Add one normal short-final go-around command/state transition; implement manual and coupled choices; score observed configuration/route/FMA transitions.

**First-PR prerequisites:** [#75 first increment](#issue-75), [#76 first increment](#issue-76), [#77 first increment](#issue-77), [#87 first increment](#issue-87).
**Original full-scope dependencies:** [#75](https://github.com/Reedtrullz/ReedFS/issues/75), [#76](https://github.com/Reedtrullz/ReedFS/issues/76), [#77](https://github.com/Reedtrullz/ReedFS/issues/77), [#87](https://github.com/Reedtrullz/ReedFS/issues/87). Original wording: P3 / L | Scenario realism | Depends: RFS-17, RFS-18, RFS-19, RFS-29

**Verification:** Visible-control manual/coupled departure from approach, truthful TOGA/modes and no forced pilot success.

**Full completion / residual:** Complete supported engine-out, power-loss and aborted-landing variants; failures need their causal systems.

**Issue acceptance retained:** Both manual and coupled paths can safely leave an unstable approach in simulator terms, with truthful modes and no premature success badge. Real-world procedure/training equivalence is explicitly out of scope.

<a id="issue-87"></a>
## #87 — Turn the checklist coach into truthful, phased practice

GitHub: [#87](https://github.com/Reedtrullz/ReedFS/issues/87) · draft **RFS-29** · **W07: Practice, recorder, navigation data and session workflows** · current **Intake / P2 / M / Needs validation**

**Assessment — Source-confirmed gap:** Cruise route monitoring is unconditionally complete in checklistCoach.

**Source context:** `checklistCoach.ts` provides phase-specific checks but marks cruise route monitoring complete unconditionally and often ends flights with RESET guidance. `tutorialState.ts` stores a selected step index.

**Owning source:** [src/sim/checklistCoach.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/checklistCoach.ts); [src/sim/tutorialState.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/tutorialState.ts).

**Implementation sequence:** Replace unconditional completion with observed valid route/mode state; add one sustained takeoff-to-level objective and assisted/free modes.

**First-PR prerequisites:** [#59 first increment](#issue-59).
**Original full-scope dependencies:** [#59](https://github.com/Reedtrullz/ReedFS/issues/59), [#77](https://github.com/Reedtrullz/ReedFS/issues/77). Original wording: P2 / M | Flight learning | Depends: RFS-01; RFS-19 for managed-flight exercises

**Verification:** Button presses alone cannot pass; hold-duration/invalid-data/assistance fixtures and visible lesson flight.

**Full completion / residual:** Complete phase lessons and configured stabilized-approach scoring; managed exercises consume #77.

**Issue acceptance retained:** Success requires sustained observable performance; unavailable route/system features cannot count as complete. Coaching never silently manipulates controls, distracts during critical phases or claims real pilot qualification.

<a id="issue-88"></a>
## #88 — Add a bounded flight recorder, replay and debrief

GitHub: [#88](https://github.com/Reedtrullz/ReedFS/issues/88) · draft **RFS-30** · **W07: Practice, recorder, navigation data and session workflows** · current **Intake / P3 / L / Needs validation**

**Assessment — Feature or extension:** Persistence is snapshots; there is no bounded state-timeline recorder.

**Source context:** `simStore.ts` exposes aircraft, control ownership, AP controller and route/guidance truth; current persistence stores snapshots rather than a time-series recorder.

**Owning source:** [src/store/simStore.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/store/simStore.ts).

**Implementation sequence:** Add a capped local checkpoint/event recorder with identities; build read-only state playback and timeline seeking; separate live authority.

**First-PR prerequisites:** [#90 first increment](#issue-90), [#91 first increment](#issue-91), [#123 first increment](#issue-123), [#87 first increment](#issue-87).
**Original full-scope dependencies:** [#87](https://github.com/Reedtrullz/ReedFS/issues/87), [#90](https://github.com/Reedtrullz/ReedFS/issues/90), [#91](https://github.com/Reedtrullz/ReedFS/issues/91). Original wording: P3 / L | Practice and diagnosis | Depends: RFS-32, RFS-33, RFS-29

**Verification:** Cap/rollover, seek without commands, mode/route events, gaps and comparison of recorded versus displayed values.

**Full completion / residual:** Complete supported energy/approach/touchdown debrief; deterministic re-simulation remains #126.

**Issue acceptance retained:** Recording never grows without limit or sends data off-device; seeking does not command live physics. Playback and re-simulation are clearly distinguished, with exact FDM/scenario/build identity and honest missing-data gaps.

<a id="issue-94"></a>
## #94 — Add an honest aircraft hangar and selection workflow

GitHub: [#94](https://github.com/Reedtrullz/ReedFS/issues/94) · draft **RFS-36** · **W07: Practice, recorder, navigation data and session workflows** · current **Intake / P2 / M / Needs validation**

**Assessment — Feature or extension:** There is one aircraft session today; a hangar needs atomic whole-contract selection.

**Source context:** `src/app/RfsShell.tsx` assembles a single-aircraft experience; `src/store/slices/aircraftSlice.ts` constructs the 737 state. Existing persistence and scenarios provide the workflow to extend.

**Owning source:** [src/app/RfsShell.tsx](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/app/RfsShell.tsx); [src/store/slices/aircraftSlice.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/store/slices/aircraftSlice.ts).

**Implementation sequence:** Add a parked preflight selection transaction, current 737 preview and compatibility summary; preserve per-profile settings/saves.

**First-PR prerequisites:** [#59 first increment](#issue-59), [#91 first increment](#issue-91), [#93 first increment](#issue-93), [#99 first increment](#issue-99).
**Original full-scope dependencies:** [#59](https://github.com/Reedtrullz/ReedFS/issues/59), [#91](https://github.com/Reedtrullz/ReedFS/issues/91), [#93](https://github.com/Reedtrullz/ReedFS/issues/93). Original wording: P2 / M | Aircraft selection and UI | Depends: RFS-01, RFS-33, RFS-35

**Verification:** Cancel leaves live flight intact; physics/model/instrument/input identities switch together; explain incompatible saves.

**Full completion / residual:** Add the first completed additional pack in #95/#96; one 737 plus mock content cannot close the full hangar outcome.

**Issue acceptance retained:** Selection changes model, physics, instruments, controls and scenario compatibility together. Cancel leaves the current session intact; incompatible saves offer an explanation without destructive conversion. The hangar stays out of the flying sightline.

<a id="issue-104"></a>
## #104 — Add a local radio desk with ATIS and scripted ATC

GitHub: [#104](https://github.com/Reedtrullz/ReedFS/issues/104) · draft **RFS-46** · **W07: Practice, recorder, navigation data and session workflows** · current **Intake / P2 / L / Needs validation**

**Assessment — Feature or extension:** Warnings provide speech, but COM tuning/readback and deterministic ATIS do not exist.

**Source context:** `src/audio/GPWS.ts` provides speech but not a tuned communications workflow. `src/sim/scenarios.ts` and `src/sim/weather.ts` provide local scenario/weather truth from which scripted messages can be authored.

**Owning source:** [src/audio/GPWS.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/audio/GPWS.ts); [src/sim/scenarios.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/scenarios.ts); [src/sim/weather.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/weather.ts).

**Implementation sequence:** Add COM active/standby and captioned ATIS from scenario truth; implement one short deterministic tower exchange and bounded readbacks.

**First-PR prerequisites:** [#101 first increment](#issue-101), [#102 first increment](#issue-102), [#82 first increment](#issue-82).
**Original full-scope dependencies:** [#101](https://github.com/Reedtrullz/ReedFS/issues/101), [#102](https://github.com/Reedtrullz/ReedFS/issues/102), [#113](https://github.com/Reedtrullz/ReedFS/issues/113). Original wording: P2 / L | Radio and inhabited-world gameplay | Depends: RFS-43, RFS-44, RFS-55

**Verification:** Wrong-frequency silence, current runway/weather, warning preemption and pause/reset message state.

**Full completion / residual:** Complete departure/arrival workflow; COM/ATIS does not technically require #113 NAV implementation.

**Issue acceptance retained:** Wrong frequency does not receive that station's scripted clearance; messages reference current runway/weather and correctly await supported readbacks. Radio never blocks warnings. Pause/reset/replay preserves message state; all voice content has equivalent accessible text.

<a id="issue-105"></a>
## #105 — Add a procedural crew that reports observed state

GitHub: [#105](https://github.com/Reedtrullz/ReedFS/issues/105) · draft **RFS-47** · **W07: Practice, recorder, navigation data and session workflows** · current **Intake / P2 / M / Needs validation**

**Assessment — Feature or extension:** Existing coach and warning paths do not define procedural crew transitions.

**Source context:** `src/audio/GPWS.ts` handles alerts; `src/sim/simulationStep.ts` and store selectors provide flight/configuration truth. Round 1's RFS-29 covers teaching/coaching, not a crew callout contract.

**Owning source:** [src/audio/GPWS.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/audio/GPWS.ts); [src/sim/simulationStep.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/simulationStep.ts).

**Implementation sequence:** Create optional observed-state callouts and one challenge/response checklist; share priority/mixer lifecycle; preserve tutorial separation.

**First-PR prerequisites:** [#101 first increment](#issue-101), [#102 first increment](#issue-102), [#87 first increment](#issue-87).
**Original full-scope dependencies:** [#101](https://github.com/Reedtrullz/ReedFS/issues/101), [#102](https://github.com/Reedtrullz/ReedFS/issues/102). Original wording: P2 / M | Crew audio and cockpit workflow | Depends: RFS-43, RFS-44

**Verification:** Valid transition only, missing-data suppression, no repeated/reset duplicate calls and text parity.

**Full completion / residual:** Review terminology for selected aircraft and extend the bounded takeoff/landing set.

**Issue acceptance retained:** Calls trigger on valid transitions, not every frame; replay/reset creates no duplicate conversation. Missing/invalid source data suppresses unsupported calls. Captions, quiet mode and warning priority work without requiring audio, and callout terminology is reviewed for the selected aircraft.

<a id="issue-106"></a>
## #106 — Make sound packs inspectable, licensed and aircraft-specific

GitHub: [#106](https://github.com/Reedtrullz/ReedFS/issues/106) · draft **RFS-48** · **W07: Practice, recorder, navigation data and session workflows** · current **Intake / P2 / M / Needs validation**

**Assessment — Feature or extension:** No flown sound-pack identity exists; synthetic audio must remain an inspectable fallback.

**Source context:** `src/audio/EngineSound.ts` synthesizes engine tone; `src/audio/audioMapping.ts` maps N1 and speech settings. There is no pack identity in the inspected flown audio path.

**Owning source:** [src/audio/EngineSound.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/audio/EngineSound.ts); [src/audio/audioMapping.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/audio/audioMapping.ts).

**Implementation sequence:** Create a small synthetic-pack manifest with ranges/filtering/level targets; add a one-layer audition harness and license review.

**First-PR prerequisites:** [#93 first increment](#issue-93), [#102 first increment](#issue-102), [#86 first increment](#issue-86).
**Original full-scope dependencies:** [#93](https://github.com/Reedtrullz/ReedFS/issues/93), [#102](https://github.com/Reedtrullz/ReedFS/issues/102). Original wording: P2 / M | Audio content pipeline | Depends: RFS-35, RFS-44

**Verification:** Missing/corrupt sample fallback, loop/loudness/clip listening and decoded-resource cleanup.

**Full completion / residual:** Admit only required qualified samples/aircraft mappings; avoid a sample-library framework.

**Issue acceptance retained:** Missing/corrupt samples fall back without silencing warnings; pack swaps release decoded resources and preserve master settings. Audition steady states and transitions for loops/clicks, loudness and clipping. No undocumented copyrighted cockpit recordings or misleading turbine recordings on a piston aircraft.

<a id="issue-109"></a>
## #109 — Model cabin pressure and environmental-system consequences

GitHub: [#109](https://github.com/Reedtrullz/ReedFS/issues/109) · draft **RFS-51** · **W07: Practice, recorder, navigation data and session workflows** · current **Intake / P2 / L / Needs validation**

**Assessment — Feature or extension:** Aircraft state lacks a cabin-pressure subsystem.

**Source context:** `src/sim/types.ts` contains flight/engine/fuel state but no cabin-pressure state in the inspected aircraft contract; atmospheric calculations in `src/sim/physics/derived.ts` currently serve flight behavior.

**Owning source:** [src/sim/physics/derived.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/physics/derived.ts); [src/sim/types.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/types.ts).

**Implementation sequence:** Add bounded cabin altitude/differential/rate and pack/bleed/outflow dependencies; show distinct cabin/ambient indications; author one loss case.

**First-PR prerequisites:** [#76 first increment](#issue-76), [#108 first increment](#issue-108), [#127 first increment](#issue-127).
**Original full-scope dependencies:** [#76](https://github.com/Reedtrullz/ReedFS/issues/76), [#108](https://github.com/Reedtrullz/ReedFS/issues/108). Original wording: P2 / L | Aircraft systems | Depends: RFS-18, RFS-50

**Verification:** Normal climb/descent and bleed loss finite/bounded; reset/restore and sourced warning thresholds.

**Full completion / residual:** Finish usable gauges/alerts and declared pressure schedule; comfort temperature/sound is optional follow-on.

**Issue acceptance retained:** Normal schedules, rapid altitude changes, bleed loss and reset remain finite and physically bounded. Ambient altitude and cabin altitude cannot be confused in UI/alerts. Procedures and warning thresholds require sourced aircraft evidence; this is simulation gameplay, not emergency guidance.

<a id="issue-115"></a>
## #115 — Extend a flight from parking brake to parking brake

GitHub: [#115](https://github.com/Reedtrullz/ReedFS/issues/115) · draft **RFS-57** · **W07: Practice, recorder, navigation data and session workflows** · current **Intake / P2 / L / Needs validation**

**Assessment — Feature or extension:** Runway-start scenarios exist; chock/service/pushback ownership is additional scope.

**Source context:** `src/sim/scenarios.ts` provides flight starts; `src/sim/systems/ground.ts` provides wheel/contact behavior; `src/viewport/RunwayLayer.tsx` provides airport geometry. Round 1's scenery pack does not define service/pushback state.

**Owning source:** [src/sim/scenarios.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/scenarios.ts); [src/sim/systems/ground.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/systems/ground.ts); [src/viewport/RunwayLayer.tsx](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/viewport/RunwayLayer.tsx).

**Implementation sequence:** Add one parked scenario with chocks/external power and bounded pushback stop/cancel; finish through observed taxi/parking milestones.

**First-PR prerequisites:** [#72 first increment](#issue-72), [#73 first increment](#issue-73), [#84 first increment](#issue-84), [#108 first increment](#issue-108).
**Original full-scope dependencies:** [#72](https://github.com/Reedtrullz/ReedFS/issues/72), [#73](https://github.com/Reedtrullz/ReedFS/issues/73), [#84](https://github.com/Reedtrullz/ReedFS/issues/84), [#108](https://github.com/Reedtrullz/ReedFS/issues/108). Original wording: P2 / L | Ground operations and session lifecycle | Depends: RFS-14, RFS-15, RFS-26, RFS-50

**Verification:** Immediate override/cancel, no attached services at takeoff, coherent start/finish and unchanged quick starts.

**Full completion / residual:** Complete gate-to-gate scenario and service availability; scripted radio can integrate #104.

**Issue acceptance retained:** Ground services cannot remain attached during takeoff; pushback stop/cancel and pilot override work immediately without invalid control ownership. Start/finish milestones depend on observed aircraft/service state. Existing runway-start scenarios remain a quick path to flying.

<a id="issue-116"></a>
## #116 — Support a local companion instrument window safely

GitHub: [#116](https://github.com/Reedtrullz/ReedFS/issues/116) · draft **RFS-58** · **W07: Practice, recorder, navigation data and session workflows** · current **Intake / P2 / M / Needs validation**

**Assessment — Validation / investigation first:** A pop-out must consume one authority; same-origin transport and owner-loss behavior need a probe.

**Source context:** `src/app/RfsShell.tsx` already composes instruments from shared state; `src/store/simStore.ts` owns the simulation store. A second window must not create a second physics authority.

**Owning source:** [src/app/RfsShell.tsx](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/app/RfsShell.tsx); [src/store/simStore.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/store/simStore.ts).

**Implementation sequence:** Probe same-origin native window/message channel; start read-only with session/age identity; then admit bounded validated MCP actions.

**First-PR prerequisites:** [#63 first increment](#issue-63), [#123 first increment](#issue-123), [#124 first increment](#issue-124), [#147 first increment](#issue-147).
**Original full-scope dependencies:** [#63](https://github.com/Reedtrullz/ReedFS/issues/63), [#64](https://github.com/Reedtrullz/ReedFS/issues/64), [#93](https://github.com/Reedtrullz/ReedFS/issues/93). Original wording: P2 / M | Cockpit ergonomics and integration | Depends: RFS-05, RFS-06, RFS-35

**Verification:** No duplicate stepping, wrong-origin/stale-session rejection, close/reload and owner-loss disconnect.

**Full completion / residual:** Reuse RFMS displays where compatible and finish command ownership before closing interactive scope.

**Issue acceptance retained:** Pop-out values/FMA match the owner; opening/closing/reloading windows cannot start duplicate stepping. Reject stale-session, unsupported and wrong-origin messages. Owner loss produces a visible disconnected state, not frozen live-looking instruments.

<a id="issue-119"></a>
## #119 — Add an in-flight diversion and alternate worksheet

GitHub: [#119](https://github.com/Reedtrullz/ReedFS/issues/119) · draft **RFS-61** · **W07: Practice, recorder, navigation data and session workflows** · current **Intake / P2 / M / Needs validation**

**Assessment — Feature or extension:** Route editing and weather exist; in-flight alternate comparison is additional scope.

**Source context:** `src/components/RouteBuilderPanel.tsx`, `src/sim/flightPlanLoader.ts` and weather/state paths expose route editing and scenario conditions. RFS-03's fuel estimate is preflight-oriented.

**Owning source:** [src/components/RouteBuilderPanel.tsx](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/components/RouteBuilderPanel.tsx); [src/sim/flightPlanLoader.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/flightPlanLoader.ts).

**Implementation sequence:** Compare a fixed verified airport set using current fuel/profile/weather freshness; stage diversion route until EXEC; show uncertainty.

**First-PR prerequisites:** [#61 first increment](#issue-61), [#75 first increment](#issue-75), [#78 first increment](#issue-78), [#81 first increment](#issue-81).
**Original full-scope dependencies:** [#61](https://github.com/Reedtrullz/ReedFS/issues/61), [#75](https://github.com/Reedtrullz/ReedFS/issues/75), [#78](https://github.com/Reedtrullz/ReedFS/issues/78), [#81](https://github.com/Reedtrullz/ReedFS/issues/81). Original wording: P2 / M | Flight decisions and UI | Depends: RFS-03, RFS-17, RFS-20, RFS-23

**Verification:** Cancel preserves guidance; route handoff, unavailable weather and low-fuel unknowns do not claim safety.

**Full completion / residual:** Finish compatible runway/fuel/time worksheet with qualified assumptions and gameplay reserve settings.

**Issue acceptance retained:** Candidate evaluation uses the selected aircraft, current modeled fuel and weather freshness; unknown inputs never produce false precision or a green safe-to-land claim. Cancel leaves guidance intact. Test route handoff, unavailable weather and insufficient-fuel uncertainty.

<a id="issue-126"></a>
## #126 — Add deterministic re-simulation capsules with honest drift reports

GitHub: [#126](https://github.com/Reedtrullz/ReedFS/issues/126) · draft **RFS-68** · **W07: Practice, recorder, navigation data and session workflows** · current **Intake / P1 / L / Needs validation**

**Assessment — Feature or extension:** Deterministic step entry exists; recorded-state replay is not input re-simulation.

**Source context:** `src/sim/simulationStep.ts` is a reusable deterministic step entry point; `src/sim/simulationRuntime.ts` has synchronous/worker paths. State playback in RFS-30 deliberately leaves deterministic re-simulation separate.

**Owning source:** [src/sim/simulationRuntime.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/simulationRuntime.ts); [src/sim/simulationStep.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/simulationStep.ts).

**Implementation sequence:** Create one bounded capsule with initial state, commands, dt, seeds, external observations, surface/profile/shared/build IDs; rerun and report first divergence.

**First-PR prerequisites:** [#82 first increment](#issue-82), [#88 first increment](#issue-88), [#91 first increment](#issue-91), [#123 first increment](#issue-123).
**Original full-scope dependencies:** [#82](https://github.com/Reedtrullz/ReedFS/issues/82), [#88](https://github.com/Reedtrullz/ReedFS/issues/88), [#91](https://github.com/Reedtrullz/ReedFS/issues/91), [#123](https://github.com/Reedtrullz/ReedFS/issues/123). Original wording: P1 / L | Reproducibility and investigation | Depends: RFS-24, RFS-30, RFS-33, RFS-65

**Verification:** Equivalent main/worker tolerance, deliberate omitted command/change detection and missing identity refusal.

**Full completion / residual:** Publish cross-platform tolerance and raw residuals; never silently refetch external inputs or repin expected traces.

**Issue acceptance retained:** Identical supported runs agree within declared tolerances; changed weather/model/control data produces an attributable mismatch. Missing identity/input fails closed. A deliberately omitted command is detected. Preserve originals and never repair drift by repinning expected output without review.

<a id="issue-137"></a>
## #137 — Build a bounded flight-model identification workbench

GitHub: [#137](https://github.com/Reedtrullz/ReedFS/issues/137) · draft **RFS-79** · **W07: Practice, recorder, navigation data and session workflows** · current **Intake / P2 / L / Needs validation**

**Assessment — Validation / investigation first:** Existing perturbation tests are broad smoke bounds; parameter identification needs qualified equilibrium and traces.

**Source context:** `src/sim/physics/__tests__/dynamicModes.test.ts` already has finite/broad phugoid, pitch-kick and Dutch-roll checks; `src/sim/physics/__tests__/performanceEnvelope.test.ts` and trim fixtures provide existing cases.

**Owning source:** [src/sim/physics/__tests__/dynamicModes.test.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/physics/__tests__/dynamicModes.test.ts); [src/sim/physics/__tests__/performanceEnvelope.test.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/physics/__tests__/performanceEnvelope.test.ts).

**Implementation sequence:** Build offline step/pulse runs and raw transient measures; keep tuning and holdout cases separate; perturb parameters within bounds.

**First-PR prerequisites:** [#69 first increment](#issue-69), [#126 first increment](#issue-126), [#136 first increment](#issue-136).
**Original full-scope dependencies:** [#69](https://github.com/Reedtrullz/ReedFS/issues/69), [#126](https://github.com/Reedtrullz/ReedFS/issues/126), [#136](https://github.com/Reedtrullz/ReedFS/issues/136). Original wording: P2 / L | Physics investigation | Depends: RFS-11, RFS-68, RFS-78

**Verification:** Detect sign/damping regression and reject untrimmed/nonlinear/saturated analysis cases.

**Full completion / residual:** Add linearization/frequency methods only to answer a demonstrated missing question.

**Issue acceptance retained:** A deliberate sign/damping regression is detected; analysis rejects untrimmed/nonlinear/saturated cases outside its assumptions. Fitted and holdout cases stay separate. No parameter is declared real-aircraft accurate merely because internal traces are smooth or stable.

<a id="issue-146"></a>
## #146 — Establish navigation-database identity and supported procedure semantics

GitHub: [#146](https://github.com/Reedtrullz/ReedFS/issues/146) · draft **RFS-88** · **W07: Practice, recorder, navigation data and session workflows** · current **Intake / P2 / L / Needs validation**

**Assessment — Qualification-gated scope:** Canned/generated routes are synthetic and staged edits use RFMS shared semantics.

**Source context:** `src/sim/flightPlanLoader.ts` creates canned/generated routes and synthetic runway approaches; `src/sim/fms/routeAdapter.ts` implements staged edits using the sibling shared contract.

**Owning source:** [src/sim/flightPlanLoader.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/flightPlanLoader.ts); [src/sim/fms/routeAdapter.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/fms/routeAdapter.ts).

**Implementation sequence:** Review RFMS contract; qualify tiny licensed airport/runway/cycle fixtures and supported leg subset; reject unsupported terminators atomically.

**First-PR prerequisites:** [#78 first increment](#issue-78), [#113 first increment](#issue-113), [#120 first increment](#issue-120), [#134 first increment](#issue-134).
**Original full-scope dependencies:** [#78](https://github.com/Reedtrullz/ReedFS/issues/78), [#113](https://github.com/Reedtrullz/ReedFS/issues/113), [#120](https://github.com/Reedtrullz/ReedFS/issues/120), [#134](https://github.com/Reedtrullz/ReedFS/issues/134). Original wording: P2 / L | FMS data and route execution | Depends: RFS-20, RFS-55, RFS-62, RFS-76

**Verification:** Exact leg geometry/turns, EXEC/save/replay identity, missing runway and unsupported-terminator rejection.

**Full completion / residual:** Broaden holds/arcs/procedures only with independent fixtures and data rights.

**Issue acceptance retained:** Insertion/EXEC/save/replay preserves database and leg identity; unsupported terminators or missing runway references fail without changing the active route. Track/turn fixtures match independently reviewed geometry. No claim of current navigation suitability or rights to redistribute a commercial database.

<a id="issue-153"></a>
## #153 — Build an opt-in practice progression from demonstrated skills

GitHub: [#153](https://github.com/Reedtrullz/ReedFS/issues/153) · draft **RFS-95** · **W07: Practice, recorder, navigation data and session workflows** · current **Intake / P2 / M / Needs validation**

**Assessment — Feature or extension:** Current coach/tutorial steps do not establish aircraft-versioned longitudinal skill records.

**Source context:** `src/sim/checklistCoach.ts`, `src/sim/tutorialState.ts` and scenario guidance provide local lesson progression. They do not yet establish a longitudinal, aircraft-specific practice record.

**Owning source:** [src/sim/checklistCoach.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/checklistCoach.ts); [src/sim/tutorialState.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/tutorialState.ts).

**Implementation sequence:** Add opt-in local record for one lesson with assistance/profile/scoring identity; recommend skippable repeat/harder variation.

**First-PR prerequisites:** [#87 first increment](#issue-87), [#88 first increment](#issue-88), [#91 first increment](#issue-91), [#93 first increment](#issue-93).
**Original full-scope dependencies:** [#87](https://github.com/Reedtrullz/ReedFS/issues/87), [#88](https://github.com/Reedtrullz/ReedFS/issues/88), [#91](https://github.com/Reedtrullz/ReedFS/issues/91), [#93](https://github.com/Reedtrullz/ReedFS/issues/93). Original wording: P2 / M | Learning continuity | Depends: RFS-29, RFS-30, RFS-33, RFS-35

**Verification:** Invalid/incomplete attempts unscored, reset cannot manufacture mastery and incompatible profile/model scores stay separate.

**Full completion / residual:** Complete inspection/export/deletion and versioned scoring migrations without cloud-account dependency.

**Issue acceptance retained:** Resetting a flight cannot manufacture mastery; incomplete/invalid observations remain unscored. Assistance level is explicit, records are inspectable/exportable/deletable, and no cloud account is required. Recommendations remain simulator practice, not a credential or assessment of real-flight competence.

<a id="issue-89"></a>
## #89 — Add a local mission designer and shareable practice packets

GitHub: [#89](https://github.com/Reedtrullz/ReedFS/issues/89) · draft **RFS-31** · **W08: Mission execution, traffic and supported abnormal systems** · current **Intake / P3 / L / Needs validation**

**Assessment — Feature or extension:** Curated scenarios and save slots exist; local mission remix/import are new capability.

**Source context:** `scenarios.ts` and tutorial state already define curated exercises; named save slots provide an existing local persistence path.

**Owning source:** [src/sim/scenarios.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/scenarios.ts).

**Implementation sequence:** Define a versioned bounded practice packet; remix one existing start/weather/loading/objective; install only validated declarative triggers.

**First-PR prerequisites:** [#91 first increment](#issue-91), [#87 first increment](#issue-87), [#154 first increment](#issue-154).
**Original full-scope dependencies:** [#80](https://github.com/Reedtrullz/ReedFS/issues/80), [#83](https://github.com/Reedtrullz/ReedFS/issues/83), [#87](https://github.com/Reedtrullz/ReedFS/issues/87), [#91](https://github.com/Reedtrullz/ReedFS/issues/91). Original wording: P3 / L | Creative scenarios | Depends: RFS-22, RFS-25, RFS-29, RFS-33

**Verification:** Schema/size/range rejection, no executable content/fetches, atomic import and same initial conditions.

**Full completion / residual:** Extend weather/surface options after #80/#83 and supported faults after causal systems; retain format/version limits.

**Issue acceptance retained:** Imported packets have strict schema/size/range validation and no executable scripts or external resource fetches. Same packet reproduces initial conditions; unsupported versions fail visibly. No backend/community marketplace is required.

<a id="issue-111"></a>
## #111 — Give icing and anti-ice bounded physical consequences

GitHub: [#111](https://github.com/Reedtrullz/ReedFS/issues/111) · draft **RFS-53** · **W08: Mission execution, traffic and supported abnormal systems** · current **Intake / P2 / L / Needs validation**

**Assessment — Qualification-gated scope:** Weather lacks ice accumulation and METAR alone cannot supply accretion inputs.

**Source context:** `src/sim/weather.ts` carries weather inputs; `src/sim/physics/aero.ts` applies aerodynamic coefficients. The inspected state does not carry accumulated ice or protection-system effectiveness.

**Owning source:** [src/sim/physics/aero.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/physics/aero.ts); [src/sim/weather.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/weather.ts).

**Implementation sequence:** Define one authored icing exposure and qualified component response; model bounded accumulation/decay and actual anti-ice power/bleed availability.

**First-PR prerequisites:** [#69 first increment](#issue-69), [#71 first increment](#issue-71), [#80 first increment](#issue-80), [#108 first increment](#issue-108), [#110 first increment](#issue-110).
**Original full-scope dependencies:** [#69](https://github.com/Reedtrullz/ReedFS/issues/69), [#71](https://github.com/Reedtrullz/ReedFS/issues/71), [#80](https://github.com/Reedtrullz/ReedFS/issues/80), [#108](https://github.com/Reedtrullz/ReedFS/issues/108), [#110](https://github.com/Reedtrullz/ReedFS/issues/110). Original wording: P2 / L | Weather and aircraft systems | Depends: RFS-11, RFS-13, RFS-22, RFS-50, RFS-52

**Verification:** Same inputs replay, dry cases no ice, affected components respond and unsupported severity is explicit.

**Full completion / residual:** Complete qualified aero/engine/sensor consequences and reversible practice scenario.

**Issue acceptance retained:** Identical seeds/inputs replay identical accretion; dry/no-icing conditions do not create ice. Protection changes the modeled affected component, not a cosmetic icon. Unsupported severity regimes are rejected/labeled and recovery respects the chosen aircraft evidence.

<a id="issue-114"></a>
## #114 — Add deterministic local traffic with honest scope

GitHub: [#114](https://github.com/Reedtrullz/ReedFS/issues/114) · draft **RFS-56** · **W08: Mission execution, traffic and supported abnormal systems** · current **Intake / P2 / L / Needs validation**

**Assessment — Feature or extension:** Only the player aircraft has a simulation/render actor contract.

**Source context:** `src/viewport/ThreeLayer.tsx` renders the user's aircraft; `src/sim/scenarios.ts` is the existing scenario surface. No scripted traffic actor contract is present in the inspected flown state.

**Owning source:** [src/sim/scenarios.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/scenarios.ts); [src/viewport/ThreeLayer.tsx](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/viewport/ThreeLayer.tsx).

**Implementation sequence:** Add capped scripted actors driven by scenario time; begin a runway-crossing actor and approach conflict; reuse measured LOD/model rendering.

**First-PR prerequisites:** [#84 first increment](#issue-84), [#93 first increment](#issue-93), [#99 first increment](#issue-99), [#82 first increment](#issue-82).
**Original full-scope dependencies:** [#84](https://github.com/Reedtrullz/ReedFS/issues/84), [#93](https://github.com/Reedtrullz/ReedFS/issues/93), [#99](https://github.com/Reedtrullz/ReedFS/issues/99). Original wording: P2 / L | World and traffic awareness | Depends: RFS-26, RFS-35, RFS-41

**Verification:** Repeatable pause/rate/reset scheduling, no frame-drop teleport, actor/render bounds and clear labels.

**Full completion / residual:** Complete supported taxi/departure/arrival behaviors; advisories are separate #145.

**Issue acceptance retained:** Traffic follows pause/rate/reset and repeatable scenario time, never teleports because frames dropped, and respects a declared actor/render budget. Conflict cues identify simulated traffic and remain readable without obscuring the runway. Separate visual-contact gameplay from certified collision avoidance.

<a id="issue-117"></a>
## #117 — Add a local live instructor station

GitHub: [#117](https://github.com/Reedtrullz/ReedFS/issues/117) · draft **RFS-59** · **W08: Mission execution, traffic and supported abnormal systems** · current **Intake / P2 / M / Needs validation**

**Assessment — Feature or extension:** Scenario starts exist but safe live intervention/timeline is new capability.

**Source context:** `src/sim/scenarios.ts` and `src/sim/simulationStep.ts` support authored starts/stepping. RFS-31 concerns saved mission packets, not safe interventions in an active session.

**Owning source:** [src/sim/scenarios.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/scenarios.ts); [src/sim/simulationStep.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/simulationStep.ts).

**Implementation sequence:** Add same-window pause and validated sensor-failure intervention first; add paused reposition with complete derived/contact/guidance reinitialization.

**First-PR prerequisites:** [#89 first increment](#issue-89), [#110 first increment](#issue-110), [#123 first increment](#issue-123).
**Original full-scope dependencies:** [#79](https://github.com/Reedtrullz/ReedFS/issues/79), [#89](https://github.com/Reedtrullz/ReedFS/issues/89), [#110](https://github.com/Reedtrullz/ReedFS/issues/110). Original wording: P2 / M | Scenario orchestration | Depends: RFS-21, RFS-31, RFS-52

**Verification:** Unsupported failure rejection, acknowledged/recorded reposition, reset and pilot/instructor distinction.

**Full completion / residual:** Integrate weather changes, supported #79 failures and optional companion #116 after authority tests.

**Issue acceptance retained:** Reposition reinitializes derived/contact/guidance state coherently; destructive interventions require visible acknowledgement and are recorded. Unsupported failures cannot be selected. Reset removes prior interventions, and replay/debrief distinguishes pilot actions from instructor changes.

<a id="issue-128"></a>
## #128 — Add a bounded engine-fire and suppression exercise

GitHub: [#128](https://github.com/Reedtrullz/ReedFS/issues/128) · draft **RFS-70** · **W08: Mission execution, traffic and supported abnormal systems** · current **Intake / P2 / L / Needs validation**

**Assessment — Qualification-gated scope:** Engine fire/detection/suppression has no causal state contract.

**Source context:** `src/sim/types.ts` has engine running/spool/temperature/fuel-flow state but no explicit fire-detection or suppression state. `src/sim/systems/engine.ts` and `src/sim/systems/fuel.ts` are the existing engine/feed paths to extend.

**Owning source:** [src/sim/systems/engine.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/systems/engine.ts); [src/sim/systems/fuel.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/systems/fuel.ts); [src/sim/types.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/types.ts).

**Implementation sequence:** Qualify a simplification packet; implement one authored fire with detection validity, supported isolation and finite bottle charge/outcome.

**First-PR prerequisites:** [#74 first increment](#issue-74), [#76 first increment](#issue-76), [#108 first increment](#issue-108), [#127 first increment](#issue-127).
**Original full-scope dependencies:** [#74](https://github.com/Reedtrullz/ReedFS/issues/74), [#76](https://github.com/Reedtrullz/ReedFS/issues/76), [#108](https://github.com/Reedtrullz/ReedFS/issues/108), [#127](https://github.com/Reedtrullz/ReedFS/issues/127). Original wording: P2 / L | Abnormal systems | Depends: RFS-16, RFS-18, RFS-50, RFS-69

**Verification:** Acknowledge cannot extinguish, depleted bottle cannot reuse, supported dependency effects, reset/save/replay.

**Full completion / residual:** Keep fire, false warning and detector failure distinct; no probabilistic/heat rewrite without evidence.

**Issue acceptance retained:** Acknowledging a fire alert cannot extinguish the fire; an unavailable/used bottle cannot discharge again; reset restores scenario resources. Isolation affects only supported dependencies without silently deleting engine mass/thrust. Save/worker/debrief preserve cause and actions. No certified procedure claim.

<a id="issue-129"></a>
## #129 — Model actuator position and asymmetric configuration faults

GitHub: [#129](https://github.com/Reedtrullz/ReedFS/issues/129) · draft **RFS-71** · **W08: Mission execution, traffic and supported abnormal systems** · current **Intake / P2 / L / Needs validation**

**Assessment — Qualification-gated scope:** One scalar actual flap/gear state cannot express left/right fault mechanics.

**Source context:** `src/sim/physics/integrate.ts` moves one scalar flap/gear position toward the command; `src/sim/types.ts` distinguishes commanded controls from actual configuration but not left/right flap states.

**Owning source:** [src/sim/physics/integrate.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/physics/integrate.ts); [src/sim/types.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/types.ts).

**Implementation sequence:** Add independent actual flap positions and one qualified jam/protection rule; consume actual positions in force and animation.

**First-PR prerequisites:** [#67 first increment](#issue-67), [#71 first increment](#issue-71), [#76 first increment](#issue-76), [#127 first increment](#issue-127).
**Original full-scope dependencies:** [#67](https://github.com/Reedtrullz/ReedFS/issues/67), [#71](https://github.com/Reedtrullz/ReedFS/issues/71), [#76](https://github.com/Reedtrullz/ReedFS/issues/76), [#127](https://github.com/Reedtrullz/ReedFS/issues/127). Original wording: P2 / L | Flight controls and mechanical systems | Depends: RFS-09, RFS-13, RFS-18, RFS-69

**Verification:** Jammed side fixed, signs/moments and supported surviving motion, detector/power invalidity and symmetric regressions.

**Full completion / residual:** Extend other mechanisms only after coherent first fault; commands remain pilot-owned.

**Issue acceptance retained:** The jammed side stops at the fault position; surviving motion and roll/yaw consequences follow documented assumptions. Detector/power loss is not falsely healthy. Restore/replay preserves mechanism state; existing symmetric transitions retain their behavior and no discontinuity is hidden by the visual model.

<a id="issue-130"></a>
## #130 — Add stabilizer-runaway, cutout and trim-authority behavior

GitHub: [#130](https://github.com/Reedtrullz/ReedFS/issues/130) · draft **RFS-72** · **W08: Mission execution, traffic and supported abnormal systems** · current **Intake / P2 / L / Needs validation**

**Assessment — Qualification-gated scope:** Trim position and static solve exist; motor/cutout/runaway authority does not.

**Source context:** `src/sim/physics/trimSolver.ts` solves pitch trim; `src/sim/types.ts` stores stabilizer trim units; `src/sim/physics/aero.ts` converts trim into pitching moment. These do not establish motor, cutout or runaway behavior.

**Owning source:** [src/sim/physics/aero.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/physics/aero.ts); [src/sim/physics/trimSolver.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/physics/trimSolver.ts); [src/sim/types.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/types.ts).

**Implementation sequence:** Add source-qualified motor rate/limits, pilot/AP precedence, cutout and one authored runaway; project actual position.

**First-PR prerequisites:** [#64 first increment](#issue-64), [#76 first increment](#issue-76), [#127 first increment](#issue-127).
**Original full-scope dependencies:** [#64](https://github.com/Reedtrullz/ReedFS/issues/64), [#69](https://github.com/Reedtrullz/ReedFS/issues/69), [#76](https://github.com/Reedtrullz/ReedFS/issues/76), [#127](https://github.com/Reedtrullz/ReedFS/issues/127). Original wording: P2 / L | Trim and manual recovery gameplay | Depends: RFS-06, RFS-11, RFS-18, RFS-69

**Verification:** Cutout stops motor without reset, saturation, disconnect/reset stale commands and reproducible pitch response.

**Full completion / residual:** Manual-wheel authority waits for #69/usable reference; preserve recoverable practice exit.

**Issue acceptance retained:** Cutout stops the modeled powered motion without resetting trim; reset/disconnect cannot leave a stale motor command. Saturation and mechanical limits are explicit. Fault timelines and pitch response reproduce; support a simulator practice exit without presenting the exercise as real emergency instruction.

<a id="issue-138"></a>
## #138 — Define a source-qualified high-altitude Mach and buffet envelope

GitHub: [#138](https://github.com/Reedtrullz/ReedFS/issues/138) · draft **RFS-80** · **W08: Mission execution, traffic and supported abnormal systems** · current **Intake / P2 / L / Needs validation**

**Assessment — Qualification-gated scope:** Current Mach lift factor is a simple heuristic without qualified high-altitude envelope.

**Source context:** `src/sim/physics/aero.ts` applies a simple Mach factor above 0.6 in lift slope; current stall/polar tests and performance cards are the evidence surface to extend.

**Owning source:** [src/sim/physics/aero.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/physics/aero.ts).

**Implementation sequence:** Audit declared validity; qualify one drag-rise/buffet group and independent conditions; bound/labeled extrapolation and continuous transitions.

**First-PR prerequisites:** [#69 first increment](#issue-69), [#71 first increment](#issue-71), [#132 first increment](#issue-132), [#137 first increment](#issue-137).
**Original full-scope dependencies:** [#69](https://github.com/Reedtrullz/ReedFS/issues/69), [#71](https://github.com/Reedtrullz/ReedFS/issues/71), [#132](https://github.com/Reedtrullz/ReedFS/issues/132), [#137](https://github.com/Reedtrullz/ReedFS/issues/137). Original wording: P2 / L | Aerodynamic operating envelope | Depends: RFS-11, RFS-13, RFS-74, RFS-79

**Verification:** Cruise/turn/load residuals, threshold continuity and unsupported-region indication.

**Full completion / residual:** Expand Mach trim/downwash/control groups separately; never induce arbitrary high-altitude upsets.

**Issue acceptance retained:** Boundary crossings are continuous, source residuals are published, and extrapolation is bounded/labeled. Matched-condition cruise/turn/load cases agree with references where available. There is no arbitrary high-altitude forced upset or claim of certified maneuver margin.

<a id="issue-140"></a>
## #140 — Add synthetic convective cells and a truthful weather-radar display

GitHub: [#140](https://github.com/Reedtrullz/ReedFS/issues/140) · draft **RFS-82** · **W08: Mission execution, traffic and supported abnormal systems** · current **Intake / P3 / L / Needs validation**

**Assessment — Feature or extension:** METAR/cloud billboards contain no radar reflectivity observation contract.

**Source context:** `src/sim/weather.ts` and `src/viewport/CloudLayer.tsx` model scenario/METAR weather and visual clouds; the inspected runtime has no volumetric reflectivity/radar observation contract.

**Owning source:** [src/sim/weather.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/weather.ts); [src/viewport/CloudLayer.tsx](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/viewport/CloudLayer.tsx).

**Implementation sequence:** Author one synthetic deterministic cell; add bounded beam/scan snapshot and ND tilt/range/gain layer with age/invalid states.

**First-PR prerequisites:** [#78 first increment](#issue-78), [#80 first increment](#issue-80), [#82 first increment](#issue-82), [#147 first increment](#issue-147).
**Original full-scope dependencies:** [#63](https://github.com/Reedtrullz/ReedFS/issues/63), [#78](https://github.com/Reedtrullz/ReedFS/issues/78), [#80](https://github.com/Reedtrullz/ReedFS/issues/80), [#82](https://github.com/Reedtrullz/ReedFS/issues/82). Original wording: P3 / L | Weather avionics and scenario world | Depends: RFS-05, RFS-20, RFS-22, RFS-24

**Verification:** Tilt/range geometry, no-return versus invalid, pause/rate/reset, CPU/memory and non-color cues.

**Full completion / residual:** Add attenuation/masking only under documented approximations; never portray cloud billboards as measured radar.

**Issue acceptance retained:** Tilt/range changes affect observed geometry predictably; no-return, unpowered and stale scan are distinguishable. Pause/rate/reset preserve scan policy; cockpit/ND projections agree. Cell fields and scan resolution have measured CPU/memory budgets; colors alone are not the only cue.

<a id="issue-141"></a>
## #141 — Add a source-aware terrain corridor and clearance display

GitHub: [#141](https://github.com/Reedtrullz/ReedFS/issues/141) · draft **RFS-83** · **W08: Mission execution, traffic and supported abnormal systems** · current **Intake / P2 / L / Needs validation**

**Assessment — Qualification-gated scope:** Physical surface and Cesium terrain coverage differ; forward corridor needs an authoritative source.

**Source context:** `src/sim/runwaySurface.ts` provides supported surface samples; `src/store/selectors.ts` derives radio altitude from ground state. `src/viewport/CesiumViewport.tsx` separately loads world terrain.

**Owning source:** [src/sim/runwaySurface.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/runwaySurface.ts); [src/store/selectors.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/store/selectors.ts); [src/viewport/CesiumViewport.tsx](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/viewport/CesiumViewport.tsx).

**Implementation sequence:** Asynchronously sample a bounded source-identified corridor; display height datum, coverage/age/uncertainty and chosen route path.

**First-PR prerequisites:** [#78 first increment](#issue-78), [#83 first increment](#issue-83), [#110 first increment](#issue-110).
**Original full-scope dependencies:** [#78](https://github.com/Reedtrullz/ReedFS/issues/78), [#83](https://github.com/Reedtrullz/ReedFS/issues/83), [#110](https://github.com/Reedtrullz/ReedFS/issues/110). Original wording: P2 / L | Terrain awareness and navigation UI | Depends: RFS-20, RFS-25, RFS-52

**Verification:** Ridge/missing/stale cases; unknown never sea level/green clearance; fixed step never waits for tiles.

**Full completion / residual:** Optional simulator clearance alerts share captured surface data; no predictive TAWS equivalence.

**Issue acceptance retained:** Missing terrain cannot appear as sea level or green clearance. Height datums and route/true/indicated altitude are distinguished. Ridge, unsupported coverage and stale-response scenarios remain truthful; cached/network imagery never silently overrides physical surface identity.

<a id="issue-143"></a>
## #143 — Give authored obstacles collision semantics independent of scenery meshes

GitHub: [#143](https://github.com/Reedtrullz/ReedFS/issues/143) · draft **RFS-85** · **W08: Mission execution, traffic and supported abnormal systems** · current **Intake / P2 / L / Needs validation**

**Assessment — Feature or extension:** Streamed OSM buildings are visual assets without collision authority.

**Source context:** `src/sim/systems/ground.ts` and `src/sim/runwaySurface.ts` handle surfaces; `src/viewport/CesiumViewport.tsx` adds visual OSM buildings. Rendering a building does not establish its collision authority.

**Owning source:** [src/sim/runwaySurface.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/runwaySurface.ts); [src/sim/systems/ground.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/systems/ground.ts); [src/viewport/CesiumViewport.tsx](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/viewport/CesiumViewport.tsx).

**Implementation sequence:** Create one authored obstacle collider with validated wing/fuselage/gear volumes; define taxi contact policy; test swept motion.

**First-PR prerequisites:** [#72 first increment](#issue-72), [#83 first increment](#issue-83), [#99 first increment](#issue-99), [#112 first increment](#issue-112).
**Original full-scope dependencies:** [#72](https://github.com/Reedtrullz/ReedFS/issues/72), [#83](https://github.com/Reedtrullz/ReedFS/issues/83), [#99](https://github.com/Reedtrullz/ReedFS/issues/99), [#112](https://github.com/Reedtrullz/ReedFS/issues/112). Original wording: P2 / L | Ground/world contact | Depends: RFS-14, RFS-25, RFS-41, RFS-54

**Verification:** Wing-only collision, different timesteps, unloaded visual mesh and declared unknown coverage.

**Full completion / residual:** Expand only supported speeds/obstacles; independent authoritative collider must survive renderer unload.

**Issue acceptance retained:** Wings cannot pass through the authored obstacle while the fuselage alone remains clear; frame-rate differences do not skip supported contacts. Unloaded visual scenery does not delete an authoritative collider. Unknown collision coverage is disclosed; no detailed crashworthiness claim or unbounded mesh intersection loop.

<a id="issue-144"></a>
## #144 — Add inertial-navigation alignment and position-source integrity

GitHub: [#144](https://github.com/Reedtrullz/ReedFS/issues/144) · draft **RFS-86** · **W08: Mission execution, traffic and supported abnormal systems** · current **Intake / P2 / L / Needs validation**

**Assessment — Feature or extension:** Navigation consumes exact physical position; inertial alignment/source quality is absent.

**Source context:** `src/sim/types.ts` supplies exact aircraft position/attitude; `src/sim/systems/navigation.ts` consumes route/position truth directly. No separate inertial alignment/source-quality state exists in the inspected flown navigation path.

**Owning source:** [src/sim/systems/navigation.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/systems/navigation.ts); [src/sim/types.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/types.ts).

**Implementation sequence:** Add one off/aligning/ready/invalid source lifecycle and stationary initialization/power case; make consumers select source.

**First-PR prerequisites:** [#76 first increment](#issue-76), [#78 first increment](#issue-78), [#110 first increment](#issue-110), [#134 first increment](#issue-134).
**Original full-scope dependencies:** [#76](https://github.com/Reedtrullz/ReedFS/issues/76), [#78](https://github.com/Reedtrullz/ReedFS/issues/78), [#110](https://github.com/Reedtrullz/ReedFS/issues/110), [#134](https://github.com/Reedtrullz/ReedFS/issues/134). Original wording: P2 / L | Avionics systems | Depends: RFS-18, RFS-20, RFS-52, RFS-76

**Verification:** Move-during-alignment rejection, invalid guidance, reset/save/replay epoch and power restoration.

**Full completion / residual:** Add bounded sourced drift/update comparison; sensor drift never moves physical aircraft.

**Issue acceptance retained:** Moving during an unsupported alignment cannot produce ready state; invalid source suppresses eligible guidance instead of freezing a live-looking track. Save/reset/replay preserve alignment epoch and quality. Power restoration does not instantly invent certified position accuracy.

<a id="issue-154"></a>
## #154 — Keep mission triggers finite, declarative and reversible

GitHub: [#154](https://github.com/Reedtrullz/ReedFS/issues/154) · draft **RFS-96** · **W08: Mission execution, traffic and supported abnormal systems** · current **Intake / P1 / M / Needs validation**

**Assessment — Feature or extension:** Finite trigger execution rules must exist before expanding mission/instructor actions.

**Source context:** `src/sim/scenarios.ts` uses authored data; the future mission/instructor workflows add runtime events. `src/sim/simulationStep.ts` already provides a fixed-step owner to protect.

**Owning source:** [src/sim/scenarios.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/scenarios.ts); [src/sim/simulationStep.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/simulationStep.ts).

**Implementation sequence:** Define declarative allowed predicates/actions, deterministic step order and bounded one-shot/rearm budgets; reject cycles/conflicts atomically.

**First-PR prerequisites:** [#123 first increment](#issue-123), [#124 first increment](#issue-124).
**Original full-scope dependencies:** [#89](https://github.com/Reedtrullz/ReedFS/issues/89), [#117](https://github.com/Reedtrullz/ReedFS/issues/117), [#124](https://github.com/Reedtrullz/ReedFS/issues/124). Original wording: P1 / M | Scenario authoring trust boundary | Depends: RFS-31, RFS-59, RFS-66

**Verification:** Self-trigger/oversize/unsupported action rejection, deterministic simultaneous events and restore consumed-event state.

**Full completion / residual:** Integrate #89 and #117 afterward; contract precedes authoring so full-issue dependency text cannot create an execution cycle.

**Issue acceptance retained:** Self-triggering events, impossible thresholds, oversized packets and unsupported failure actions are rejected without partial state changes. Equivalent events at one step have deterministic ordering. Reset/restore/replay does not refire already-consumed triggers unexpectedly; render/audio effects cannot issue hidden physics writes.

<a id="issue-139"></a>
## #139 — Add scripted wake encounters with persistent vortex fields

GitHub: [#139](https://github.com/Reedtrullz/ReedFS/issues/139) · draft **RFS-81** · **W09: Wake, airport advisories and offline practice** · current **Intake / P3 / L / Needs validation**

**Assessment — Qualification-gated scope:** Ambient turbulence and visual traffic do not produce persistent wake fields.

**Source context:** `src/sim/systems/environment.ts` supplies air-relative wind; Round 1's seeded atmosphere and Round 2's traffic provide future producers/consumers. The current flown path has no traffic-generated wake field.

**Owning source:** [src/sim/systems/environment.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/systems/environment.ts).

**Implementation sequence:** Qualify one authored vortex pair; emit world-position field with bounded strength/advection/decay/lifetime; record producers/inputs.

**First-PR prerequisites:** [#69 first increment](#issue-69), [#80 first increment](#issue-80), [#114 first increment](#issue-114), [#126 first increment](#issue-126).
**Original full-scope dependencies:** [#69](https://github.com/Reedtrullz/ReedFS/issues/69), [#80](https://github.com/Reedtrullz/ReedFS/issues/80), [#114](https://github.com/Reedtrullz/ReedFS/issues/114), [#126](https://github.com/Reedtrullz/ReedFS/issues/126). Original wording: P3 / L | Atmosphere and traffic physics | Depends: RFS-11, RFS-22, RFS-56, RFS-68

**Verification:** Persistent after producer departure, encounter/non-encounter, sign/energy, bounds and replay.

**Full completion / residual:** Expand emitters/ground interactions only with evidence and costs; synthetic educational spacing stays labeled.

**Issue acceptance retained:** Wake persists after the producer moves away, samples consistently in physics space and replays identically with captured inputs. Fields cannot grow without bound or inject energy through frame/sign mistakes. Clearly synthetic separation rules are never represented as safe real-flight spacing.

<a id="issue-142"></a>
## #142 — Detect wrong-runway alignment and authored surface incursions

GitHub: [#142](https://github.com/Reedtrullz/ReedFS/issues/142) · draft **RFS-84** · **W09: Wake, airport advisories and offline practice** · current **Intake / P2 / M / Needs validation**

**Assessment — Feature or extension:** Runway footprint membership does not establish selected-runway alignment or clearance.

**Source context:** `src/viewport/runwayData.ts` and `src/sim/runwaySurface.ts` describe runway footprints; current scenario/route state identifies a selected runway. Existing on-runway classification alone is not a clearance/identity test.

**Owning source:** [src/sim/runwaySurface.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/runwaySurface.ts); [src/viewport/runwayData.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/viewport/runwayData.ts).

**Implementation sequence:** Author one airport's hold lines/hotspots and explicit simulator clearance state; distinguish selected/occupied runway; debounce events.

**First-PR prerequisites:** [#84 first increment](#issue-84), [#114 first increment](#issue-114), [#115 first increment](#issue-115), [#134 first increment](#issue-134).
**Original full-scope dependencies:** [#84](https://github.com/Reedtrullz/ReedFS/issues/84), [#114](https://github.com/Reedtrullz/ReedFS/issues/114), [#115](https://github.com/Reedtrullz/ReedFS/issues/115), [#134](https://github.com/Reedtrullz/ReedFS/issues/134). Original wording: P2 / M | Airport situational awareness | Depends: RFS-26, RFS-56, RFS-57, RFS-76

**Verification:** Parallel/opposite identity, threshold/boundary stops, cancellation and repeated-alert suppression.

**Full completion / residual:** Add occupancy advisories from traffic truth and debrief distinction after base crossing exercise.

**Issue acceptance retained:** Parallel/opposite runways, threshold crossings, canceled clearance and stopped-on-boundary cases behave predictably without repeated alert spam. Heading-reference labels agree. Debrief distinguishes wrong selection from clearance violation and avoids claiming operational runway-awareness certification.

<a id="issue-145"></a>
## #145 — Add transponder state and clearly simulated traffic advisories

GitHub: [#145](https://github.com/Reedtrullz/ReedFS/issues/145) · draft **RFS-87** · **W09: Wake, airport advisories and offline practice** · current **Intake / P3 / L / Needs validation**

**Assessment — Validation / investigation first:** Visual traffic is not transponder/traffic-advisory avionics.

**Source context:** Round 2's RFS-56 explicitly limits initial traffic to visual/scripted awareness. `src/sim/types.ts` and the current instrument composition lack a transponder/advisory state contract.

**Owning source:** [src/sim/types.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/types.ts).

**Implementation sequence:** Add transponder mode/code and a clearly simulated observed traffic display; implement one bounded authored proximity cue.

**First-PR prerequisites:** [#101 first increment](#issue-101), [#110 first increment](#issue-110), [#114 first increment](#issue-114), [#144 first increment](#issue-144), [#147 first increment](#issue-147).
**Original full-scope dependencies:** [#63](https://github.com/Reedtrullz/ReedFS/issues/63), [#101](https://github.com/Reedtrullz/ReedFS/issues/101), [#110](https://github.com/Reedtrullz/ReedFS/issues/110), [#114](https://github.com/Reedtrullz/ReedFS/issues/114), [#144](https://github.com/Reedtrullz/ReedFS/issues/144). Original wording: P3 / L | Traffic avionics | Depends: RFS-05, RFS-43, RFS-52, RFS-56, RFS-86

**Verification:** Standby/unpowered/invalid, time/source altitude closure, duplicate actors and speech priority.

**Full completion / residual:** Resolution advisories require separate primary-source feasibility; initial scope must not invent maneuver instructions.

**Issue acceptance retained:** Standby/unpowered/invalid observations do not appear as operational advisories. Relative altitude/closure use stated sources and times; duplicate actors do not duplicate speech. Clearly label simplified logic, avoid unsafe-looking maneuver instructions, and preserve visual awareness without audio.

<a id="issue-149"></a>
## #149 — Package one lawful offline practice airport

GitHub: [#149](https://github.com/Reedtrullz/ReedFS/issues/149) · draft **RFS-91** · **W09: Wake, airport advisories and offline practice** · current **Blocked / P2 / L / Needs validation**

**Assessment — Qualification-gated scope:** App-shell caching does not provide lawful offline scenery/physical coverage.

**Source context:** `vite.config.ts` precaches the app shell, while `src/viewport/CesiumViewport.tsx` can load network terrain/buildings. A cached app shell is not an offline flyable airport with declared physical coverage.

**Owning source:** [src/viewport/CesiumViewport.tsx](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/viewport/CesiumViewport.tsx); [vite.config.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/vite.config.ts).

**Implementation sequence:** Qualify one original/licensed practice-airport pack; specify bounds/version/size; add explicit cancellable install/delete and quota-safe storage.

**First-PR prerequisites:** [#83 first increment](#issue-83), [#84 first increment](#issue-84), [#99 first increment](#issue-99), [#118 first increment](#issue-118), [#152 first increment](#issue-152).
**Original full-scope dependencies:** [#83](https://github.com/Reedtrullz/ReedFS/issues/83), [#84](https://github.com/Reedtrullz/ReedFS/issues/84), [#99](https://github.com/Reedtrullz/ReedFS/issues/99), [#118](https://github.com/Reedtrullz/ReedFS/issues/118). Original wording: P2 / L | Offline world availability | Depends: RFS-25, RFS-26, RFS-41, RFS-60

**Verification:** Network-disabled airplane/instruments/contact, corrupt/interrupted download, quota and active-session version/delete handling.

**Full completion / residual:** Unknown exterior stays unknown; commercial/Ion/OSM redistribution is never inferred from cacheability.

**Issue acceptance retained:** Airplane, instruments and physical surfaces work in the declared area with the network disabled. Unknown exterior terrain stays unknown. Interrupted/corrupt download never replaces a valid pack; quota errors preserve saves, and deletion/version update respects the active session.

<a id="issue-95"></a>
## #95 — Add a genuinely distinct 737 family variant

GitHub: [#95](https://github.com/Reedtrullz/ReedFS/issues/95) · draft **RFS-37** · **W10: Additional aircraft packs** · current **Blocked / P2 / L / Needs validation**

**Assessment — Qualification-gated scope:** Only the 737-800 pack exists; 737-700 data/geometry/rights are unqualified.

**Source context:** `src/sim/types.ts` loads the B737-800 dataset; `src/viewport/AircraftModel.ts` and `src/viewport/CockpitModel.ts` create a single 737 representation.

**Owning source:** [src/sim/types.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/types.ts); [src/viewport/AircraftModel.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/viewport/AircraftModel.ts); [src/viewport/CockpitModel.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/viewport/CockpitModel.ts).

**Implementation sequence:** Select lawful variant references; build dimension/mass/performance profile and matching exterior/contact stations; reuse explicitly common systems.

**First-PR prerequisites:** [#66 first increment](#issue-66), [#69 first increment](#issue-69), [#93 first increment](#issue-93), [#99 first increment](#issue-99).
**Original full-scope dependencies:** [#66](https://github.com/Reedtrullz/ReedFS/issues/66), [#69](https://github.com/Reedtrullz/ReedFS/issues/69), [#93](https://github.com/Reedtrullz/ReedFS/issues/93), [#99](https://github.com/Reedtrullz/ReedFS/issues/99). Original wording: P2 / L | Aircraft pack | Depends: RFS-08, RFS-11, RFS-35, RFS-41

**Verification:** Matched-condition qualified reference cases, silhouette and differentiated handling review.

**Full completion / residual:** Complete versioned pack integration and hangar acceptance; unsupported envelopes stay unavailable.

**Issue acceptance retained:** Variant identity affects more than the title and livery; dimensions and reference cases match the chosen evidence packet within declared tolerances. Unsupported operating regions remain labeled. Include side-by-side silhouette and matched-condition handling review.

<a id="issue-96"></a>
## #96 — Add a light piston trainer with its own flight character

GitHub: [#96](https://github.com/Reedtrullz/ReedFS/issues/96) · draft **RFS-38** · **W10: Additional aircraft packs** · current **Blocked / P2 / L / Needs validation**

**Assessment — Qualification-gated scope:** Jet/two-engine UI and flap assumptions prevent a genuinely distinct trainer.

**Source context:** `src/sim/systems/engine.ts` models N1-based jet propulsion; `src/components/EngineStrip.tsx` and `src/input/flapDetents.ts` assume two jet engines and 737 flap detents.

**Owning source:** [src/components/EngineStrip.tsx](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/components/EngineStrip.tsx); [src/input/flapDetents.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/input/flapDetents.ts); [src/sim/systems/engine.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/systems/engine.ts).

**Implementation sequence:** Select one lawful trainer packet; implement single-engine propeller power/RPM and its instruments/configuration; begin warm-engine circuits.

**First-PR prerequisites:** [#69 first increment](#issue-69), [#71 first increment](#issue-71), [#72 first increment](#issue-72), [#93 first increment](#issue-93), [#99 first increment](#issue-99).
**Original full-scope dependencies:** [#69](https://github.com/Reedtrullz/ReedFS/issues/69), [#71](https://github.com/Reedtrullz/ReedFS/issues/71), [#72](https://github.com/Reedtrullz/ReedFS/issues/72), [#93](https://github.com/Reedtrullz/ReedFS/issues/93), [#99](https://github.com/Reedtrullz/ReedFS/issues/99). Original wording: P2 / L | Aircraft pack and manual flight | Depends: RFS-11, RFS-13, RFS-14, RFS-35, RFS-41

**Verification:** Trainer-specific climb/level/stall/circuit cases, RPM-animation/audio and sync/worker parity.

**Full completion / residual:** Complete convincing manual-flight pack and separate pilot review; richer starts/avionics are explicit follow-ons.

**Issue acceptance retained:** A reproducible climb, level-flight, stall/recovery and circuit set uses trainer data and instruments, not scaled 737 constants. Propeller animation/audio agrees with RPM. Instructor/pilot review remains a separate acceptance gate; no flight-training certification claim.

<a id="issue-97"></a>
## #97 — Explore a regional turboprop and short-field route pack

GitHub: [#97](https://github.com/Reedtrullz/ReedFS/issues/97) · draft **RFS-39** · **W10: Additional aircraft packs** · current **Blocked / P3 / L / Needs validation**

**Assessment — Qualification-gated scope:** Turboprop propulsion/reference eligibility has not been established.

**Source context:** `src/sim/systems/engine.ts` is jet-oriented; `src/sim/systems/ground.ts` and `src/sim/scenarios.ts` expose runway/contact and regional scenario paths to extend.

**Owning source:** [src/sim/scenarios.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/scenarios.ts); [src/sim/systems/engine.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/systems/engine.ts); [src/sim/systems/ground.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/systems/ground.ts).

**Implementation sequence:** Produce a bounded propulsion/source feasibility case; choose one supported airplane and airport pair; implement torque/RPM/feather/beta only after qualification.

**First-PR prerequisites:** [#69 first increment](#issue-69), [#73 first increment](#issue-73), [#84 first increment](#issue-84), [#93 first increment](#issue-93), [#99 first increment](#issue-99).
**Original full-scope dependencies:** [#69](https://github.com/Reedtrullz/ReedFS/issues/69), [#73](https://github.com/Reedtrullz/ReedFS/issues/73), [#84](https://github.com/Reedtrullz/ReedFS/issues/84), [#93](https://github.com/Reedtrullz/ReedFS/issues/93), [#99](https://github.com/Reedtrullz/ReedFS/issues/99). Original wording: P3 / L | Aircraft pack and regional flying | Depends: RFS-11, RFS-15, RFS-26, RFS-35, RFS-41

**Verification:** Engine-out/feather drag signs, ground-only beta/reverse and runway eligibility.

**Full completion / residual:** Deliver exploration findings if infeasible; full pack proceeds only with demonstrated source/playability gates.

**Issue acceptance retained:** Engine-out asymmetry, feathered drag and ground reverse have bounded tests and explicit evidence status. Route/runway eligibility is validated; beta cannot silently operate in unsupported flight conditions. Ship only after source and playability gates pass.

<a id="issue-98"></a>
## #98 — Explore a glider energy laboratory

GitHub: [#98](https://github.com/Reedtrullz/ReedFS/issues/98) · draft **RFS-40** · **W10: Additional aircraft packs** · current **Blocked / P3 / L / Needs validation**

**Assessment — Qualification-gated scope:** Current jet-oriented contract cannot represent a qualified unpowered glider by simply removing thrust.

**Source context:** `src/sim/physics/aero.ts` and `src/sim/physics/derived.ts` already compute aerodynamic and air-relative quantities, but the aircraft state and engine paths are 737-oriented. `src/sim/weather.ts` is not a thermal forecast.

**Owning source:** [src/sim/physics/aero.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/physics/aero.ts); [src/sim/physics/derived.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/physics/derived.ts); [src/sim/weather.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/weather.ts).

**Implementation sequence:** Select a lawful glide polar; implement an unpowered profile/airbrake/variometer and one still-air air start; then author bounded lift fields.

**First-PR prerequisites:** [#69 first increment](#issue-69), [#71 first increment](#issue-71), [#80 first increment](#issue-80), [#93 first increment](#issue-93), [#99 first increment](#issue-99).
**Original full-scope dependencies:** [#69](https://github.com/Reedtrullz/ReedFS/issues/69), [#71](https://github.com/Reedtrullz/ReedFS/issues/71), [#80](https://github.com/Reedtrullz/ReedFS/issues/80), [#93](https://github.com/Reedtrullz/ReedFS/issues/93), [#99](https://github.com/Reedtrullz/ReedFS/issues/99). Original wording: P3 / L | Aircraft pack and energy practice | Depends: RFS-11, RFS-13, RFS-22, RFS-35, RFS-41

**Verification:** Independent sink/glide residuals, total-energy variometer assumptions and captured-seed replay.

**Full completion / residual:** Deliver feasibility boundary honestly; thermals/ridge lift and complete pack need qualified baseline and synthetic-weather labels.

**Issue acceptance retained:** Still-air sink/glide cases match the chosen polar within published tolerances; variometer total-energy behavior is documented. Lift-field seeds replay consistently. Clearly distinguish educational gameplay fields from real soaring-weather advice.

<a id="issue-121"></a>
## #121 — Add optional, bounded haptic flight feedback

GitHub: [#121](https://github.com/Reedtrullz/ReedFS/issues/121) · draft **RFS-63** · **W11: Effects, haptics and creative tools** · current **Intake / P3 / M / Needs validation**

**Assessment — Validation / investigation first:** Input/output availability does not establish real controller haptic support.

**Source context:** `src/input/` already handles gamepad input; `src/sim/systems/ground.ts` and aircraft state expose contact/flight events. RFS-27 addresses calibration/mappings rather than feedback output.

**Owning source:** [src/input/GamepadManager.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/input/GamepadManager.ts); [src/input/InputManager.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/input/InputManager.ts); [src/input/__tests__/GamepadManager.hotplug.test.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/input/__tests__/GamepadManager.hotplug.test.ts); [src/input/__tests__/GamepadManager.test.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/input/__tests__/GamepadManager.test.ts); [src/input/__tests__/InputManager.test.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/input/__tests__/InputManager.test.ts); [src/input/__tests__/controlBindings.test.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/input/__tests__/controlBindings.test.ts); [src/input/__tests__/gearCommand.test.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/input/__tests__/gearCommand.test.ts); [src/input/__tests__/keyboardControls.test.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/input/__tests__/keyboardControls.test.ts); [src/input/controlBindings.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/input/controlBindings.ts); [src/input/flapDetents.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/input/flapDetents.ts); [src/input/gearCommand.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/input/gearCommand.ts); [src/input/keyboardControls.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/input/keyboardControls.ts); [src/sim/systems/ground.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/systems/ground.ts).

**Implementation sequence:** Probe one actual supported controller; implement opt-in bounded touchdown/stall pulses with intensity and cancellation.

**First-PR prerequisites:** [#72 first increment](#issue-72), [#85 first increment](#issue-85).
**Original full-scope dependencies:** [#72](https://github.com/Reedtrullz/ReedFS/issues/72), [#85](https://github.com/Reedtrullz/ReedFS/issues/85). Original wording: P3 / M | Input feel and accessibility | Depends: RFS-14, RFS-27

**Verification:** No output on pause/disable/disconnect/reset; rate limit and actual-hardware observation.

**Full completion / residual:** Publish supported/unsupported browser-device matrix; keep equivalent visual/audio cues.

**Issue acceptance retained:** No actuator output while paused, muted-for-feedback, disconnected or reset; pulses are rate-limited and cancel on user disable. Visual/audio equivalents remain available. Verify on real hardware and document unsupported paths instead of treating feature detection as proof.

<a id="issue-122"></a>
## #122 — Make aircraft effects match their emitters and conditions

GitHub: [#122](https://github.com/Reedtrullz/ReedFS/issues/122) · draft **RFS-64** · **W11: Effects, haptics and creative tools** · current **Intake / P2 / M / Needs validation**

**Assessment — Feature or extension:** Contrails use one aircraft emitter, engine 0 and altitude threshold.

**Source context:** `src/viewport/ContrailLayer.tsx` uses one aircraft-position emitter, checks engine 0 and an altitude threshold, and emits without a humidity criterion. It is a simplified effect, not a validated contrail prediction.

**Owning source:** [src/viewport/ContrailLayer.tsx](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/viewport/ContrailLayer.tsx).

**Implementation sequence:** Add named per-engine anchors and simulation-time effects; explicitly mark simplified atmosphere eligibility; implement contact-conditioned spray/smoke.

**First-PR prerequisites:** [#67 first increment](#issue-67), [#81 first increment](#issue-81), [#82 first increment](#issue-82), [#93 first increment](#issue-93), [#99 first increment](#issue-99).
**Original full-scope dependencies:** [#67](https://github.com/Reedtrullz/ReedFS/issues/67), [#81](https://github.com/Reedtrullz/ReedFS/issues/81), [#82](https://github.com/Reedtrullz/ReedFS/issues/82), [#93](https://github.com/Reedtrullz/ReedFS/issues/93), [#99](https://github.com/Reedtrullz/ReedFS/issues/99). Original wording: P2 / M | Exterior visual feedback | Depends: RFS-09, RFS-23, RFS-24, RFS-35, RFS-41

**Verification:** Correct-engine shutdown, pause/replay, dry/airborne/no-slip suppression and particle cleanup/budget.

**Full completion / residual:** Add prop-specific effects for admitted packs; never invent humidity truth.

**Issue acceptance retained:** Engine shutdown affects the correct trail; paused/replayed effects align with simulation time. Spray/smoke cannot appear airborne or on incompatible dry/no-slip states. Desktop/mobile captures verify emitter placement, density and cleanup without hiding aircraft details or sacrificing frame budgets.

<a id="issue-155"></a>
## #155 — Add flight-aware photo capture with honest provenance

GitHub: [#155](https://github.com/Reedtrullz/ReedFS/issues/155) · draft **RFS-97** · **W11: Effects, haptics and creative tools** · current **Intake / P2 / M / Needs validation**

**Assessment — Validation / investigation first:** Composite-scene capture/cross-origin behavior needs proof before a photo workflow.

**Source context:** `src/viewport/CameraManager.ts` defines flying cameras; `src/viewport/ThreeLayer.tsx` integrates aircraft/globe rendering. The reviewed scene has no dedicated capture-state/provenance workflow.

**Owning source:** [src/viewport/CameraManager.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/viewport/CameraManager.ts); [src/viewport/ThreeLayer.tsx](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/viewport/ThreeLayer.tsx).

**Implementation sequence:** Probe capture from paused/replay scene; add bounded framing/resolution, optional overlays and local provenance metadata.

**First-PR prerequisites:** [#65 first increment](#issue-65), [#88 first increment](#issue-88), [#99 first increment](#issue-99).
**Original full-scope dependencies:** [#65](https://github.com/Reedtrullz/ReedFS/issues/65), [#88](https://github.com/Reedtrullz/ReedFS/issues/88), [#99](https://github.com/Reedtrullz/ReedFS/issues/99). Original wording: P2 / M | Creative presentation | Depends: RFS-07, RFS-30, RFS-41

**Verification:** No blank download/state change, cross-origin fallback, memory cap and live/degraded/replay labels.

**Full completion / residual:** Finish accessible framing and attribution; video/camera paths remain measured follow-ons.

**Issue acceptance retained:** Capturing leaves the flight/controls intact and cannot silently claim a degraded screenshot is production scenery. Unsupported capture reports a clear fallback without blank downloads or memory spikes. Asset license/attribution requirements remain accessible; clean images do not erase provenance from the accompanying metadata.

<a id="issue-156"></a>
## #156 — Add a bounded original-livery workshop

GitHub: [#156](https://github.com/Reedtrullz/ReedFS/issues/156) · draft **RFS-98** · **W11: Effects, haptics and creative tools** · current **Intake / P3 / M / Needs validation**

**Assessment — Feature or extension:** One original texture set is distinct from a user preset/workshop contract.

**Source context:** `src/viewport/AircraftModel.ts` uses procedural materials; Round 1's material/livery proposal establishes one texture set, not a user editing contract.

**Owning source:** [src/viewport/AircraftModel.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/viewport/AircraftModel.ts).

**Implementation sequence:** Add bounded color/registration/stripe editing on one qualified template; preview and save versioned local preset with canonical compatibility.

**First-PR prerequisites:** [#68 first increment](#issue-68), [#93 first increment](#issue-93), [#99 first increment](#issue-99).
**Original full-scope dependencies:** [#68](https://github.com/Reedtrullz/ReedFS/issues/68), [#93](https://github.com/Reedtrullz/ReedFS/issues/93), [#99](https://github.com/Reedtrullz/ReedFS/issues/99). Original wording: P3 / M | Aircraft personalization | Depends: RFS-10, RFS-35, RFS-41

**Verification:** Long text/alpha/colors/size, incompatible UV version, texture disposal and no script/HTML injection.

**Full completion / residual:** Import logos/textures only with separate bounded file/rights validation; no general editor or marketplace.

**Issue acceptance retained:** Presets identify the compatible aircraft/template; incompatible UV/model revisions fail visibly. Long registrations, transparency, bad colors and excessive texture size are handled without clipping or GPU overload. Repeated previews dispose old textures; user content cannot execute scripts or inject HTML.

<a id="issue-157"></a>
## #157 — Investigate VR without committing the main runtime to it

GitHub: [#157](https://github.com/Reedtrullz/ReedFS/issues/157) · draft **RFS-99** · **W12: XR and shared-cockpit feasibility** · current **Blocked / P3 / L / Needs validation**

**Assessment — Validation / investigation first:** XR support for the dual renderer and actual headset ergonomics is unverified.

**Source context:** `src/viewport/CesiumViewport.tsx` and `src/viewport/ThreeLayer.tsx` combine two rendering owners; `src/viewport/CameraManager.ts` assumes current mono camera behavior. Stereo/XR compatibility and performance are unverified.

**Owning source:** [src/viewport/CameraManager.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/viewport/CameraManager.ts); [src/viewport/CesiumViewport.tsx](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/viewport/CesiumViewport.tsx); [src/viewport/ThreeLayer.tsx](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/viewport/ThreeLayer.tsx).

**Implementation sequence:** Design one target-headset/browser probe and stereo owner contract; measure eye scale, readability, input, motion timing and desktop return.

**First-PR prerequisites:** [#62 first increment](#issue-62), [#63 first increment](#issue-63), [#64 first increment](#issue-64), [#99 first increment](#issue-99), [#147 first increment](#issue-147).
**Original full-scope dependencies:** [#62](https://github.com/Reedtrullz/ReedFS/issues/62), [#63](https://github.com/Reedtrullz/ReedFS/issues/63), [#64](https://github.com/Reedtrullz/ReedFS/issues/64), [#99](https://github.com/Reedtrullz/ReedFS/issues/99), [#147](https://github.com/Reedtrullz/ReedFS/issues/147). Original wording: P3 / L | Immersive cockpit feasibility | Depends: RFS-04, RFS-05, RFS-06, RFS-41, RFS-89

**Verification:** Actual headset evidence and resource/frame budget; desktop nonblank output is insufficient.

**Full completion / residual:** Deliver feasibility/limits and cockpit-only alternative; full VR renderer/product commitment needs explicit reviewed decision.

**Issue acceptance retained:** Exit gate requires actual headset evidence of correctly framed stereo, readable instruments, usable input, stable motion timing and successful return to desktop. A nonblank desktop canvas is not VR proof. Report unsupported devices, resource costs and comfort limitations without claiming medical safety.

<a id="issue-158"></a>
## #158 — Design a single-authority shared-cockpit experiment

GitHub: [#158](https://github.com/Reedtrullz/ReedFS/issues/158) · draft **RFS-100** · **W12: XR and shared-cockpit feasibility** · current **Blocked / P3 / L / Needs validation**

**Assessment — Validation / investigation first:** Same-origin pop-outs do not establish a networked authority/security/latency design.

**Source context:** `src/store/simStore.ts` owns one local authority; `src/sim/simulationRuntime.ts` transports one process's steps. RFS-58 intentionally limits the first companion instruments to same-machine/same-origin use.

**Owning source:** [src/sim/simulationRuntime.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/sim/simulationRuntime.ts); [src/store/simStore.ts](https://github.com/Reedtrullz/ReedFS/blob/b3e3f937ac3be515ec17fdade97136fea20d580d/src/store/simStore.ts).

**Implementation sequence:** Write observer/copilot roles, authoritative host, session/sequence epochs, command limits and disconnect policy; review protocol/threat/latency design.

**First-PR prerequisites:** [#116 first increment](#issue-116), [#123 first increment](#issue-123), [#124 first increment](#issue-124), [#126 first increment](#issue-126), [#147 first increment](#issue-147).
**Original full-scope dependencies:** [#116](https://github.com/Reedtrullz/ReedFS/issues/116), [#123](https://github.com/Reedtrullz/ReedFS/issues/123), [#124](https://github.com/Reedtrullz/ReedFS/issues/124), [#126](https://github.com/Reedtrullz/ReedFS/issues/126), [#147](https://github.com/Reedtrullz/ReedFS/issues/147). Original wording: P3 / L | Cooperative flight feasibility | Depends: RFS-58, RFS-65, RFS-66, RFS-68, RFS-89

**Verification:** Specify adversarial reorder/duplicate/jitter/unauthorized/ownership cases and reconnect snapshot age/version.

**Full completion / residual:** Design is the initial deliverable; two-client service/transport probe and deployment remain separately authorized.

**Issue acceptance retained:** A future probe must survive jitter, reorder, duplicate messages, malicious commands, pilot/copilot conflicts and disconnect without stale control capture or unauthorized actions. Rejoining receives a version-compatible snapshot with age indicators. Capture reproducible latency/authority evidence; never call same-machine message tests multiplayer acceptance.

## Execution readback — 2026-10-08 11:12 UTC

The sections above retain the assessment snapshot. Qualified Done now includes160,162,124,125,100,101,102,123,107,150 (10 of102). PR169 plus observer repair176 are canonical/public qualified at837370b. Ready first increments170–175/177 and draft178 have explicit residual/source/device/deployment scope; their original issues stay open. New exact170 CI failed the installed-update flow; dependent merges are held for diagnosis. Current GitHub issue comments and Project16 are the live execution disposition. The complete parent audit trail is Obsidian `Personal/Projects/RFS/All-issue execution - 08-10-2026.md`, with local exact-head receipt files under `.superpowers/sdd/2026-10-08-rfs-all-issues-implementation-plan/`.

## Execution readback — 2026-10-08 14:08 UTC

Qualified Done remains160,162,124,125,100,101,102,123,107,150 (10of102). PR180 UTC clock is draft with locally qualified native clock/light, six unchanged-baseline visuals and nine affected handling/weather cases; followup c95c371 fixes evidenced cancellation/edit presentation and passed1247unit tests/full composite/native clock. Independent followup and exact-head delivery remain pending.171/172exact CI passed;170/173–175/177–179have retained update/initial-progress/bounded-flight fixture failures under diagnosis. Dependencies remain held rather than treating old receipts as fresh acceptance. The complete parent audit trail and residual scope remain in Obsidian Personal/Projects/RFS/All-issue execution - 08-10-2026.md and the102issue sections above.

## Execution readback — 2026-10-08 14:42 UTC

QualifiedDone remains10of102. Reviewed/measuredPWA two-tab andGPU/ENVAstartup fixtures propagatedthrough9source-preservedownedPRheads170–175/177–179 andpublishedwithexplicitatomicleases; freshCI/deliveryrequired. Clock33ac083 full1247/144composite/native2clock/lightPASS/CPU6startup5.470s exceedsold5s; topPWAintegration/review/PR180refreshpending. Heading134currentNOAAmodel/sourceprobe qualified12printedrows; actualcommand/datum/weakfielddesignreviewpending. No merge/issueDoneclaimisadvancedbylocalproof.

## Heading model and first reviewed PWA delivery — 2026-10-08 15:20 UTC

PR180 is ready at33ac083abdff38738b0238c06fe33659e40b697e: final native2cases passed2.3minutes, all4installedPWA/V4cases passed3.3minutes, fullcheck1247/144passed, independent startup+revised134design review passed. Project82InReview verified from105items; issuecomment6062973929 records local receipts and pending exact/dependency/canonical/public gates. No82closure.

PR170 at2f685de7b4d57c81a5cb36d3d8bf566adb64e3fb passed exactCI37793933307 (allunit/mainbrowser/visual/4PWA/Docker/security) and CodeQL37793933210/aggregate. Fresh premerge head/master/readiness verified; match-head merge preserves ancestry atb7a684fe0e344ecaa9339f68f571e8ad8ff5def3, merged15:18:07Z. CanonicalCI37799601842 and CodeQL37799602000 running. Issue118remainsopen pending canonical/public acceptance. Other current9heads retain their own CI; oldheaded results are not reused.

Heading134 movedInProgress via freshidPVTI_lAHOAB-TC84BmFlSzg_L2Ds. PinnedWMM2025 typedNOAA harmonic port matches12independent printed rows;17modeltests plus UI/reference gates79/6pass. Display control defaultsTRUE, physical/AP/LNAV/FD/saves stayTRUE; M=T−D/T=M+D through tagged MCP oneconversion; everymagneticdisplay hasSFC at0kmWGS84ellipsoid. Current2025H2000/6000rules/date2025through2029/poles/unavailableTRUEwithrefusedmagneticedit; no npmport/Grid/height/geoidclaim. UIreference switch preserves actualFDcue and snapshot/physical/route/weather/generation/commands. Nativevisible-control worker/step/save/date fixture prepared.

Firstfullcheck1271tests/147files passedlint/type/build but retainedFAILforcompressedbudget137.0KiB>136.0 (raw429.9). Boundedfeature allowance440/140 retainsabout2percentheadroom; othercategoriesunchanged. Corrected test-fixture EulerAPI/engagedFD setup and label assertions, not flightphysics. Finalcheck/native/visual/review/CI/delivery134pending.

## PWA canonical acceptance and heading qualification — 2026-10-08 15:59 UTC

PR170 canonical b7a684fe0e344ecaa9339f68f571e8ad8ff5def3: CI37799601842 andCodeQL37799602000 SUCCESS. Canonical native/mainbrowser,6visuals,4installedPWAtransactions,Docker/security/Pages/imagepublishingpassed;deploySKIPconfiguration. Ordinarypublicmetadata/index/4JS200/securityheadersmatchb7a. Issue118hadclosedautomaticallyat15:18:08Z andProjectDoneatmerge; correction topriorpending-openlog. Qualifiedcompletioncomment6063836081 andfresh105item/closedcompletedreadbackpreserved. QualifiedDone11of102.

Heading134 whole7900802KeplerPASS noCritical/Important; twoMinorRunwayTRUE/tableintegrityfixed7b3a andfollowupPASSnofindings. Original81UI/6files andfull1273/147passed at790(app429.7/136.9 within440/140). Actual7b3anative1PASS1.6minutes preservesphysical/AP/route/weather/generation/commands,oneMAGMCPconversion,unsupported2030refusal,V4save/restore/matchingworkercohort. Original6visualsPASS1.1minutes/64913msunchangedbaselines. Failednativefixturetelemetry/disclosureattemptsretained; finalcorrectednormaltogglepassed. ScreenshotrevealedMAGcurrent/selectedlabelwrap; readabilityfollowupunderqualification. NewchecksumNodeimportnotallowedbybrowserTSCcaughtbeforepublication; replacedwithall90independentpinnedCOFcanonicalJSONrowcomparisonnormalizingsignedzero, sourceSHA/digestmetadataretained. NoappNodeglobaltypes/dependencychange.

Latest174/178/179nativeCIfailGPUcoldcockpitcount5s andsecondpauseouter5s: actualcallbacks5.334/5.951/5.634s arriveafterdeadline;178serializedpaused andlateinnerPASSretained, notwholecasepass.179weatheractuallocalHTTPreset1004fulfilled;callback5.788s exceedsouter5s, lateinner1004PASS;wholecase120s(sourceverified), no90scapchange.175currentmain46PASS/2FAIL: GPUplusroute-descentwhole480s twice. Retained70MBartifact11560382733/trace; retryclock1000cost65.867s/helper40unchangedreads-before-first-click2seach;initialendedgroundwaitingDescentcoach. Independentdiagnosispending, noblanketretry/timeoutwaiver.

Primary/RFMS/envpipepreserved;Datafree34GiB. Remaining91issuescontinuewithper-itemresidualacceptance;noallissuesdoneclaim.


## Observation repairs and equilibrium design — 2026-10-08 16:53 UTC

Heading-reference product qualification completed at89d6de4: composite1274tests/147files, original six visual cases, native right-edge/no-wrap gate1.3min and independent source review pass. Eager delivery of the small Telemetry component fixed the observed empty DEBUG panel; PFD heading/bug and VS columns preserve readable one-line values. Later local stack restacks preserve all product source and docs byte-for-byte. No heading PR or delivery/closure yet.

GPU fixture b1e5c9a now observes actual cockpit readiness before count checks and actual paused status under a bounded15s window after each loss, while preserving the240s whole cap and all existing recovery assertions. Normal2cases1.2min and CPU6single-case1.6min pass, no retry; independent review passes with recorded health fields explicitly diagnostic. Nine dependent local heads restacked with backups and source-preservation checks; remote heads and their prior failed CI remain unchanged.

Route fixture e7b39562 removes the artificial pre-first-click MCP wait, retracts gear after positive rate and requires a2500ft actual climb floor. Normal route/MCP and CPU6 gates passed their selected-guidance assertions, but the retained CPU6 receipt showed3041ft/+265fpm becoming3085ft/+61fpm. Independent review correctly requests actual negative VS and falling altitude before established-descent acceptance. A follow-up visible paused-target setup/speed-control and negative-VS/20ft decrease gate is running; no passing physical-descent claim yet. Existing full-flight acceptance is still open.

Issue136 pure equilibrium/design brief independently reviewed and marked In Progress. Fixed calm weather, joint solved aircraft/controls, explicitly seeded steady engine spools, bounded force/moment residuals, provisional model qualification and no re-solve on start/reset/worker are specified. No implementation yet. Weather179 reset callback-observation repair and exact new CI/canonical delivery of the stack remain pending. Done remains11of102. Data volume34GiB free.

## Level-equilibrium solver first increment — 2026-10-09

PR183 at 7b387b5 (branch codex/rfs-level-equilibrium off c888098) delivers the #136 first increment: pitch/trim/throttle equilibrium solver over the clean-polar prestall envelope, memoized receipt object with provisional notice, ScenarioPanel readout, reset/setScenario/load parity through solvedScenarioInitialization, authored-calm fixed-weather policy, and the Level Equilibrium Engineering scenario over KPDX 10R. The solver found and fixed the mass-routing defect where updateFuel re-derived zeroFuelWeight from an unset payloadWeight, silently solving every prior trace at 49,413 kg instead of the requested 61,913 kg. Local gates: tsc clean, lint clean, full vitest 150 files/1,295 tests pass, production build pass, new browser e2e plus weather-restore regression pass (2 passed, 36.2s). Evidence boundary holds: convergence is a solver receipt, not a performance qualification; #136 stays open with full acceptance residual. PR body commits are no-gpg-sign (1Password signing hangs unattended); CI is the authority. Done remains 11 of 102 until CI and merge.

## Level-equilibrium CI resolution by disclosure — 2026-10-09

CI attempts on PR183 across two heads: c5de699 run 37929108547 failed test:e2e on the documented long-horizon fixtures (heading-reference; route-descent at the whole-case 480s cap, matching the pending independent-diagnosis pattern on main). Its owner-policy rerun passed e2e but failed test:visual on "debug help panel appears after opt-in". d02e07f (adds rfs-level-equilibrium.spec.ts to the CI test list; it had been local-only) run 37946055607 passed the complete e2e list including the new spec at 35.1s, then failed the same visual fixture; its owner-authorized rerun again passed the full pre-visual stack (deps, release, blackbox, lint, typecheck, unit, build, bundle, e2e) and failed the same visual fixture. Four CI failures of that single fixture across five attempts and two heads, against consistent local 6/6 visual passes on identical trees; all recorded fixture failures are in runs after 12:17Z on 2026-10-09 while master's last visual run (03:04Z rerun) passed, consistent with a mid-day CI-environment shift rather than change content. No test weakened, no timeout raised; rerun attempts stopped per the ledger rule. Disclosure comments 6084044674 (PR) and 6084045161/6085033484 (issue). The d02e07f run's first e2e step also ran roughly 95 minutes against a typical 8-10, matching the overloaded-runner pattern of canonical master run 37877578203's first attempt.

Weather-179 residual disposition: the reset callback-observation repair (1a7d6b5) is on master via the integration, and canonical master CI run 37877578203 (rerun, success, 2026-10-09T03:04Z) covers the repaired stack with the e2e weather-restore case passing; the "exact new CI/canonical delivery of the stack" residual is satisfied. The observed 5.3-5.9s callback receipts from the 174/178/179 branch CIs remain recorded as slow-runner timing evidence under the same environment-shift umbrella; no mechanism defect was found. Remaining open work: PR183 merge decision (owner), #136 second increment (model qualification, performance envelope, bounded flight evidence), and the CI-environment diagnosis of the visual debug-help-panel fixture family.

## Visual-CI root cause, eager-mount fix, and CI outcome — 2026-10-09

The PR183 visual failure family is diagnosed from trace evidence rather than pattern inference. Decoding the local passing trace and the CI failing trace at 0a9d8fc (Playwright frame-snapshot subtree refs) established: all three debug-panel chunks (ControlsHelp, ControlsSettings, AttitudeIndicator) were fetched in CI about 20s before the opt-in clicks (~172ms each), lazy wrappers mounted, telemetry rendered, the page kept producing frames at ~300ms cadence, but the Suspense retry committing the resolved children never flushed; the help-panel subtree refs stayed unresolved at trace end with the expect call still in flight past the 15s timeout. Locally the same code commits after 3.9-5.3s on an idle machine, so the fixture passed only while the runner stayed under render pressure thresholds. React batches all three panels into one commit, so one starved retry gated all three. The idle-chunk warmup (0a9d8fc) is falsified by the same traces: chunks were fully fetched and content still never committed.

Fix 3cf5c8a renders the three small panels eagerly (direct imports, no lazy/Suspense) and removes the dead warmup effect. Local exact-head gates: tsc, lint, vitest 1,295 pass, production build, check:bundle pass at 443.7/140.0 KiB against the 448/143 allowance, visual suite 6/6 including the opt-in fixture.

CI run 37982083531 at 3cf5c8a: attempt 1 passed secret-scan then failed test:e2e before the visual step ran (heading-reference and route-descent at the whole-case 480s cap both retries; 52 other e2e passed in 53.4m). The owner-policy rerun (attempt 2) failed the same step with a rotating set: the same two fixtures plus rfs-audio-session (30s timeout), 51 passed in 53.2m. The visual step never started in either attempt, so the root-cause fix remains locally validated only and the pre-existing fixture family now extends to runner-load e2e failures gating the visual step. Per the rerun rule no further reruns; no test weakened, no timeout raised. Disclosure comments 6089769397 (PR183) and 6089770608 (issue 136). Remaining open: PR183 merge decision (owner), #136 second increment (model qualification, performance envelope, bounded flight evidence), and the overloaded-runner environment diagnosis now covering both e2e long-horizon and visual fixtures.

## README heartbeat defect fix and solver envelope — 2026-10-09

Issue #1189 documentation defect fixed at c00469f: the README "Runtime heartbeat" section still claimed current implementation is main-thread physics with a synchronous step() diagram, contradicting the accurate worker-physics paragraph directly below it. The section now states the default is browser-Worker physics with a stepAsync/BrowserWorkerSimulationRuntime diagram and documents VITE_RFS_WORKER_PHYSICS=0 as the main-thread escape hatch. No source code changed.

Issue #136 second-increment evidence, all measured at this head without changing the solver. Performance envelope sweep: converged solutions at 180 kt (throttle 0.819, pitch 9.19 deg), 200 kt (0.709, 6.8 deg), 220 kt (0.619, 5.0 deg) at 10,000 ft; altitude 20,000 ft (0.901, 8.29 deg); gross weight 70,000 kg (0.738, 6.12 deg) and 79,000 kg (0.871, 7.36 deg); cg 10/18/25 percent all solve identically at 0.619/5.0 deg. Out-of-envelope requests fail closed with honest infeasible receipts: 160 kt at 30k/37k ft returns normal-force pitch bracket failure (level lift unreachable in prestall); 240/260/280 kt at 2,000 ft and 50,000 kg return pitch trim bracket failure with large residuals; cg 33 percent is rejected as outside aircraft limits. Cost: every solve at or under 3.8 ms and 78-80 total iterations against the 160-iteration cap. Timing sample over 200 runs after 20 warmup: p50 1.109 ms, p95 1.458 ms, p99 1.55 ms, max 2.075 ms, all converged; adequate for per-scenario-init use with about 20x headroom.

Bounded flight evidence already exists in CI: run 37982083531 at 3cf5c8a passed e2e/rfs-level-equilibrium.spec.ts in 27.7 s, verifying the converged receipt inside the real app, initial altitude within 1 ft of 10,022, and unassisted drift within 10 ft altitude, 1 kt TAS, and 0.2 deg pitch over 10 running seconds.

Non-claims: the aero model remains placeholder B737-800 data with the provisional notice; no Boeing-source model qualification has been done; convergence and drift thresholds are solver and bounded-flight receipts, not a performance qualification. #136 remains open with climb/descent/banked equilibria and source qualification residual.

CI run 37996511085 at 9255040: CodeQL and secret-scan green, unit suite passed, 52 of 54 e2e passed in 54.0m including the level-equilibrium spec at 36.4 s (fresh bounded-flight receipt at this exact head). test:e2e failed on the documented overloaded-runner family (heading-reference 240 s cap; route-descent 480 s cap, both retries); the visual step never ran. Disclosure comment 6090671924; no rerun per the ledger rule. PR #184 merge remains an owner decision.

