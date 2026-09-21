# RFS runway-pair continuous descent proof

Date: 2026-09-21
Scope: slice 3 of the autonomous improvement roadmap

## Goal

Prove that a generated runway-pair route (KSEA 16L to KPDX 10R) supports a
continuous, intervention-free descent from cruise-capture through the descent
fix to the approach-handoff boundary, using only route constraints and VNAV
managed guidance. No MCP altitude, vertical-speed, or speed intervention may be
used after the initial post-takeoff climb target.

## Why this is the right next proof

- Slices 1 and 2 made route edits and LNAV arming real. Slice 3 exercises the
  full constraint chain those features rely on: CLB (AT_OR_ABOVE), ENR cruise
  (AT_OR_ABOVE cruise), DES (AT_OR_BELOW), FAF (AT_OR_BELOW), RWY (AT).
- computeVNAV already models the full lifecycle (TOD distance, PATH, ALT*,
  ALT_HOLD). What is missing is an end-to-end browser proof that the lifecycle
  plays out across every leg without player intervention.
- The existing full-flight blackbox proof (ENVA to ENGM) drives descent with
  explicit MCP VS and altitude intervention. That is a different acceptance
  question and stays untouched.

## Acceptance

1. Load the generated KSEA 16L to KPDX 10R route through visible controls.
2. Fly takeoff, initial climb with MCP LNAV and a single climb altitude target.
3. After VNAV captures cruise (ALT_HOLD via managed constraint), the player
   touches no MCP altitude, VS, or speed control for the rest of the flight.
4. The sim drives through TOD entry, DES-constraint descent, FAF-constraint
   descent, and reaches approach handoff or the IF leg with:
   - FMA pitch showing the VNAV family (VNAV, VNAV_PTH, or ALT_HOLD) rather
     than VS,
   - FMA roll showing LNAV,
   - flight phase reaching DESCENT and then APPROACH without stall, overspeed,
     or terrain-impacted altitude traps.
5. Evidence is captured from visible FMA, flight-phase, and route-status text
   only. No direct state seeding or reading of internal stores.

## Explicit non-claims

- This is not an autoland proof. APP/G/S capture is covered by the existing
  full-flight blackbox acceptance and slice 3 stops before the APP gate.
- It is not a weather, scenery, or performance proof.
- A pass does not certify real-world procedure correctness; constraints are
  generated training data.

## Test placement

- e2e/rfs-full-flight-blackbox.spec.ts gains a second blackbox test so the
  long-horizon scenario keeps the existing separation from the fast CI gate.
- Locally runnable with npm run test:e2e:full-flight.
