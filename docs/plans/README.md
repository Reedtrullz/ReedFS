# RFS Plans Directory

This directory contains both historical implementation plans and future migration plans. Do not assume a plan file describes the current repository state unless it says so explicitly.

Current source-of-truth documents:

- `../architecture.md` — current implementation architecture.
- `../physics-invariants.md` — active physics contracts and regression checklist.
- `../roadmap.md` — prioritized necessary enhancements.
- `../runbooks/branch-protection.md` and `../runbooks/release-closeout.md` — current release-governance verification runbooks; `master` branch protection is enabled/verified and live/deployed claims require exact-SHA checker evidence.
- `2026-06-16-rfs-e2e-proof-stability-next-work.md` — current immediate implementation plan after the June 16 project analysis; prioritizes restoring the red visible-control browser E2E layer with durable product-visible readbacks, preserving local/CI/live/full-flight proof boundaries, and only then resuming route/descent/full-flight depth work.
- `2026-06-15-rfs-comprehensive-remaining-work-remediation.md` — current comprehensive remediation implementation plan for the June 15 deep remaining-work review; sequences P0 proof blockers, visual/layout repair, KPDX 10R alignment, visible-control black-box/stage proof, source-data/governance disposition, docs sync, and exact-SHA commit/push/CI/live verification.
- `../reviews/2026-06-15-rfs-comprehensive-remaining-work-review.md` — latest deep remaining-work review for the current dirty `review/2026-06-14-meaningful-use-round3` tree; records local gate evidence, the historical visual/E2E blockers, route/landing mismatch, proof-boundary risks, and remaining work. Treat seeded/scoped browser plans as bounded regression guards unless current docs or exact-SHA CI/live evidence say otherwise.
- `2026-06-14-rfs-strict-meaningful-use-round3-remediation.md` — reviewed implementation plan covering RFS-R3-001 through RFS-R3-044 with Task 7 as final continuous black-box acceptance after prerequisite fixes.
- `../reviews/2026-06-14-rfs-strict-meaningful-use-round3.md` — current strict round-3 meaningful-use review; Task 7 remains blocked by visible takeoff setup truth, black-box proof scope, AP vertical truth, and route-to-approach/landing continuity gaps.
- `../reviews/2026-06-13-rfs-meaningful-use-remediation-closeout.md` — final 46-finding closeout ledger and proof-boundary record for the June 13 meaningful-use remediation pass.
- `../reviews/2026-06-12-comprehensive-project-review-remaining-work.md` — latest comprehensive project review, browser dogfood evidence, and remaining-work roadmap.
- `2026-06-12-rfs-comprehensive-remediation-program.md` — current umbrella implementation program for the 55-finding 2026-06-12 dogfood/deep-review remediation set; links and sequences the child plans below.
- `2026-06-12-rfs-p0-truth-playability-remediation.md` — current P0 player-truth plan for positive-rate/gear-up, scenario-card VR, LOAD PLAN route-vs-AP semantics, ENVA no-route feedback, and initial-climb envelope proof.
- `2026-06-12-rfs-autoflight-fms-vnav-remediation.md` — current AP/FMS/VNAV plan for constrained sample routes, VNAV MCP gating, route completion, current-aircraft MCP defaults, IAS SPEED law, FD cue parity, and real-UI route proof.
- `2026-06-12-rfs-browser-ux-accessibility-product-remediation.md` — current browser product plan for semantic landmarks/headings, ARIA toggle state, overlay/responsive layout, Cesium product posture, GPU-stall diagnostics, cockpit placeholders, save/load metadata, canvas warning cleanup, deterministic clouds, and ESLint warning cleanup.
- `2026-06-12-rfs-flight-model-ground-landing-realism-remediation.md` — current physics realism plan for FDM lineage metadata, spoiler lift dump, gear/flap transit, explicit landing rollout, crosswind/ENVA/landing envelopes, runway-condition tables, and unsupported-surface honesty.
- `2026-06-12-rfs-architecture-performance-runtime-remediation.md` — current architecture/performance plan for scenario weather metadata, worker runtime seams, App/store splitting, frame scheduling, instrument snapshots, AP controller-state ownership, App-test stabilization, and RFMS shared-dependency packaging.
- `2026-06-12-rfs-release-ci-security-oss-remediation.md` — current release/CI/security/OSS plan for local/CI gate parity, PR Docker smoke, image digest provenance, rollback verification, headers/container hardening, OSS governance, dependency automation, immutable deploy docs, branch protection, and exact-SHA closeout.
- `../reviews/2026-06-12-comprehensive-remaining-work-review.md` — earlier 2026-06-12 comprehensive remaining-work audit and evidence ledger.
- `2026-06-12-rfs-effective-autoflight-control-ownership.md` — completed/current autonomous AP/FMA truth-tightening record ensuring active ticks, flight-plan updates, effective controls, manual-input sanitization, and saved-state restore use backed/effective autoflight truth, preventing unbacked raw AP truth from retaining or applying stale AP commands.
- `2026-06-12-rfs-kpdx-landing-route-status-recompute.md` — completed/current autonomous proof-tightening record ensuring the KSEA-to-KPDX 10R landing bridge recomputes near-destination route status after the KPDX 10R short-final seed, without claiming full-route/full-flight, VNAV, or route-coupled landing proof. Older 10L wording in that plan is historical and superseded by the June 15 KPDX 10R alignment.
- `2026-06-12-rfs-ksea-extended-route-coupled-descent-bridge.md` — completed/current autonomous slice record for extending the KSEA final-route coupled descent before manual handoff into the KPDX 10R manual landing/rollout/reset bridge, without claiming full-route/full-flight, VNAV, or route-coupled landing proof. Older 10L wording in that plan is historical and superseded by the June 15 KPDX 10R alignment.
- `2026-06-12-rfs-route-bridge-structural-evidence.md` — current autonomous cleanup plan for replacing the KSEA-to-KPDX 10R landing bridge's tautological same-store boolean with structural sample-order and reset-separation assertions.
- `2026-06-12-rfs-ksea-route-to-kpdx-landing-bridge-proof.md` — current autonomous slice plan for bridging a scoped KSEA final-route configured approach/manual handoff into a KPDX 10R short-final landing/rollout/reset proof in one browser store session without claiming full-route/full-flight or continuous route-coupled landing proof. Older 10L wording in that plan is historical and superseded by the June 15 KPDX 10R alignment.
- `2026-06-12-rfs-kpdx-short-final-landing-proof.md` — current autonomous slice plan for proving a scoped KPDX destination short-final touchdown, braking rollout, and reset cleanup browser loop without claiming route-coupled landing or full-flight/full-route proof.
- `2026-06-12-rfs-ksea-route-handoff-reset-proof.md` — current autonomous slice plan for proving reset cleanup after backed KSEA final-leg route-coupled approach automation hands off truthfully to manual control.
- `2026-06-12-rfs-ksea-route-approach-manual-handoff-proof.md` — current autonomous slice plan for proving the handoff from backed KSEA final-leg route-coupled approach automation to AP/FMA OFF manual control without hidden AP/AT axis commands.
- `2026-06-12-rfs-ksea-route-coupled-approach-proof.md` — current autonomous slice plan for proving a final-leg KSEA route-coupled configured-approach gate in browser without claiming full-route/full-flight or landing proof.
- `2026-06-12-rfs-enva-descent-approach-landing-bridge-proof.md` — current autonomous slice plan for a seeded ENVA descent-to-approach/landing bridge browser proof without claiming full-flight proof.
- `2026-06-12-rfs-approach-landing-rollout-browser-proof.md` — current autonomous slice plan for truthful landing/rollout guidance plus a scoped approach-to-touchdown/rollout/reset browser proof without claiming full-flight proof.
- `2026-06-12-rfs-ksea-multi-gate-route-progression-proof.md` — current autonomous slice plan for proving multiple KSEA route leg transitions in one browser store run without claiming full-route/full-flight proof.
- `2026-06-12-rfs-ksea-second-leg-sequencing-proof.md` — current autonomous slice plan for refactoring the route-proof helper and proving second-leg KSEA route sequencing in browser without claiming full-route/full-flight proof.
- `2026-06-12-rfs-route-sequencing-browser-proof.md` — current autonomous slice plan for proving first-leg KSEA route sequencing in the browser without claiming full-route/full-flight proof.
- `2026-06-12-rfs-autoflight-truth-and-route-proof.md` — current next-slice implementation plan for effective AP/FMA/VNAV truth and KSEA LNAV route-leg browser proof.
- `2026-06-12-rfs-guidance-truth-full-flight-proof.md` — current next-slice plan for AP/FMA route truth, phase-aware guidance, and ENVA takeoff-to-clean-climb browser proof.
- `../reviews/2026-05-26-comprehensive-gameplay-review.md` — completed May comprehensive gameplay/realism/visual/cockpit audit and historical status record.
- `../reviews/templates/playability-dogfood-checklist.md` — browser dogfood checklist/report template for future playable claims.
- `2026-05-26-rfs-comprehensive-usability-realism-plan.md` — completed/current status record for usability, realism, aircraft visuals, cockpit, UI, and guidance; phases 0 through 5.5 are complete.
- `2026-05-26-rfs-next-phases-release-hardening-and-realism.md` — completed/current status record for Phase 6 release hardening, deterministic visual proof, fixed timestep/worker prep, audio, and later gear/guidance/data/product phases.
- `2026-05-27-rfs-advanced-gear-tire-ground-handling.md` — completed/current status record for tire side-load/cornering stiffness, asymmetric braking/anti-skid groundwork, dynamic oleo loads, crosswind/weathercocking runway guards, and gear-up runway-tangent belly/crash slide behavior.
- `2026-05-27-rfs-surface-aware-ground-handling.md` — completed/current status record for the original KSEA-only surface-aware ground-handling slice, off-runway friction scaling, and prepared-runway `onRunway` semantics.
- `2026-05-27-rfs-rollout-taxi-crosswind-controls.md` — completed/current status record for rollout/taxi/crosswind landing regressions, optional side-specific brake channels, and `Space`/`Z`/`X` player brake controls.
- `2026-05-27-rfs-multi-airport-surface-coverage.md` — completed/current status record for supported KSEA/KPDX prepared-runway rectangles, the generic runtime sampler, KPDX regressions, and KSEA wrapper compatibility.
- `2026-05-27-rfs-lnav-turn-anticipation.md` — completed/current status record for bounded LNAV turn-anticipation sequencing and AP/route-status integration proof.
- `2026-05-27-rfs-n1-autothrottle.md` — completed/current status record for conservative Boeing-style N1 autothrottle behavior, MCP/FMA affordance, and simulation/store integration proof.
- `2026-05-25-rfs-foundation-stabilization.md` — completed stabilization record.

Historical/target plans:

- `phase-0-foundation.md`
- `phase-1-flight-dynamics-core.md`
- `phase-1-flight-dynamics.md`
- `phase-1.5-live-viewport.md`
- `phase-2-systems-integration.md`
- `phase-3-activation-polish.md`
- `phase-4-performance-visuals.md`
- `phase-5-immersion-realism.md`
- `phase-6-scenery-content.md`
- `phase-7-ship-it.md`
- `phase-8-physics-refactor.md`
- `rfs-comprehensive-plan.md`

When starting new major work, create a new dated plan instead of editing a historical plan in place, unless the goal is to add a status note or correct an inaccurate current-state claim.
