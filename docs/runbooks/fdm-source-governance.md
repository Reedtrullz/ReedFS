# RFS FDM and Performance Source Governance

This runbook governs how RFS may replace gameplay-calibrated flight-dynamics and performance placeholders with source-backed data. It is a precondition for tuning constants toward realism: source acquisition, license review, or redistribution limits may block full realism remediation for a data group.

Current RFS B737-800 FDM and performance values must be treated as gameplay-calibrated placeholders unless the versioned data metadata for that exact group says otherwise. The existing metadata shell is an audit boundary, not a certified-data claim.

## Required source packet per data group

Before changing a data group from placeholder tuning to source-backed or derived-from-source values, attach a source packet to the versioned data shell and review it with the code change. Each packet must include:

- Source ID and citation.
  - Use a stable ID that can be referenced from data metadata and tests.
  - Include title, author/publisher when known, revision/date, URL or archive location, and page/table/section where the value comes from.
- License/redistribution permission.
  - Record whether the source can be redistributed, quoted, summarized, or only cited.
  - If the source cannot be redistributed in-repo, store only permitted derived values plus enough citation detail for reviewers to verify access.
- Data group: one of `aero`, `engine`, `gear`, `tire/brake`, `performance card`, `weather/atmosphere`, or `runway/airport`.
- Confidence: one of `source-backed`, `derived-from-source`, or `gameplay-calibrated placeholder`.
  - `source-backed`: the runtime value is directly supported by the cited source within the packet's stated conditions.
  - `derived-from-source`: the value is computed, interpolated, converted, or fit from cited source material; include the derivation notes and assumptions.
  - `gameplay-calibrated placeholder`: the value is tuned for RFS behavior only; it may coexist with the metadata shell but cannot support realism/certification claims.
- Claim boundary allowed in public docs.
  - State the strongest public wording allowed for this packet, including limitations such as weight, configuration, airport/runway, atmosphere, or interpolation range.
  - Default wording for placeholders is: "RFS gameplay-calibrated placeholder; not certified aircraft data and not suitable for real-world use."
- Tests that prove runtime reads this group from the versioned data shell.
  - Include data-shape/metadata tests that fail if source IDs, confidence, or claim boundaries are missing.
  - Include at least one runtime consumer test for the group, proving the simulator reads the versioned shell rather than an untracked hardcoded duplicate.
  - For performance cards, keep ownership/test-consumer metadata visible so test-only bounds are not mistaken for AFM, dispatch, or Boeing-published tables.

Suggested packet fields:

```md
- Source ID:
- Citation:
- License/redistribution:
- Data group:
- Confidence:
- Public claim boundary:
- Versioned data file(s):
- Runtime consumer(s):
- Verification test(s):
- Derivation notes / limitations:
```

## Prohibited claims

- No certified training, dispatch, AFM, maintenance, or Boeing-published claim unless the exact source permits that claim.
- No mixing placeholder and source-backed values without visible metadata.
- Do not describe a whole model, aircraft, route, or performance card as source-backed when only one data group or one operating condition has source support.
- Do not convert public-reference, research, gameplay, or derived values into manufacturer/certified claims by implication.
- Do not quote or redistribute source material beyond its license; cite it instead when redistribution is not allowed.

## Verification checklist

Use this checklist before merging any FDM/performance data-quality change:

1. The data group is classified as `aero`, `engine`, `gear`, `tire/brake`, `performance card`, `weather/atmosphere`, or `runway/airport`.
2. Every changed value has a source packet or remains explicitly marked `gameplay-calibrated placeholder`.
3. Public docs and UI copy use only the packet's claim boundary.
4. Placeholder and source-backed values are split or individually tagged so reviewers can see the difference.
5. Tests prove the runtime reads the group from the versioned data shell.
6. Any missing source, unclear license, or insufficient redistribution permission is recorded as a blocker instead of being tuned around.

## Current source boundary

As of this runbook, RFS may document that the FDM pipeline has source-lineage metadata, performance cards have visible ownership/test-consumer metadata, and both are governed by versioned data shells. It must not claim the current B737-800 FDM or performance cards are certified, Boeing-published, AFM-backed, dispatch-ready, or training-grade unless future per-group metadata and source packets explicitly permit that claim.

## 2026-06-16 source-packet disposition

Task 14A disposition: no permitted source-backed replacement is available in this repository for the reviewed B737-800 FDM/performance groups. P1.1 is therefore blocked rather than reduced: current runtime values stay `gameplay-calibrated` / placeholder and public docs must keep the non-claim boundary above.

| Missing source packet ID | Data group | Current in-repo packet / source ID | License / redistribution permission | Quality tier | Allowed public claim boundary |
|---|---|---|---|---|---|
| `missing-b738-aero-polars-source-packet` | Aero polars, control derivatives, pitch/roll/yaw moment coefficients, ground-effect placeholders | No permitted packet; current lineage is `rfs-gameplay-calibrated-placeholder-v1` | Not established; no redistributable source packet in repo | Blocked placeholder | “Gameplay-calibrated placeholder; not certified aircraft data, not AFM/Boeing-published data, and not suitable for real-world use.” |
| `missing-b738-engine-lapse-source-packet` | Engine spool, fuel-flow, N1/N2/EGT, thrust-lapse table | No permitted packet; current lineage is `rfs-gameplay-calibrated-placeholder-v1` | Not established; no redistributable source packet in repo | Blocked placeholder | Same placeholder/non-certified boundary; no engine-performance or dispatch claim. |
| `missing-b738-gear-transit-source-packet` | Gear/flap transit timing and gear-station geometry/load/stiffness placeholders | No permitted packet; current lineage is `rfs-gameplay-calibrated-placeholder-v1` | Not established; no redistributable source packet in repo | Blocked placeholder | Same placeholder/non-certified boundary; no maintenance, structural, or certified-configuration claim. |
| `missing-b738-tire-brake-ground-source-packet` | Tire friction, brake force, anti-skid, nosewheel steering, side-load, off-runway friction, belly/crash slide behavior | No permitted packet; current lineage is `rfs-gameplay-calibrated-placeholder-v1` | Not established; no redistributable source packet in repo | Blocked placeholder | Same placeholder/non-certified boundary; no runway-performance, brake-energy, or contaminated-runway claim. |
| `missing-b738-performance-card-source-packet` | Takeoff V-speeds, climb envelope, approach/VREF, landing sink/touchdown/stopping bounds | No permitted packet; current performance-card ownership says gameplay envelope / non-AFM | Not established; no redistributable source packet in repo | Blocked placeholder | “Automated acceptance envelope only; broad gameplay bounds, not AFM, Boeing-published, dispatch, or training data.” |
| `missing-airport-runway-source-packet` | Airport/runway geometry and synthetic approach fixtures beyond the bundled KSEA/KPDX prepared-surface references | No permitted packet for an authoritative airport/runway database; KPDX 10R approach fixture is synthetic | Not established; no redistributable airport procedure/source packet in repo | Blocked/synthetic fixture | “Synthetic simulator fixture for route/landing tests; not official procedure, navigation, or airport data.” |

To unblock any row, add a reviewed source packet with citation, license/redistribution decision, quality tier, allowed claim boundary, derivation notes, and tests that fail if the data group is silently mixed with placeholder lineage.
