# FAA TCDS A16WE B737-800 engine takeoff-thrust source packet

The engine static-thrust anchor reads `src/sim/data/aircraft/b737-800-fdm.v1.ts`
as `ENGINE_STATIC_THRUST_ANCHOR_LBF` with the `b737-800-static-thrust-anchor`
lineage reference. Source ID: `faa-tcds-a16we-rev45-b738-takeoff-thrust`.
Data group: `engine`; confidence: `derived-from-source`; quality:
`manufacturer-published`.

Citation: FAA Type Certificate Data Sheet A16WE, revision 45, issued
September 1, 2010, Section VII, Boeing Model 737-700/-800 engine takeoff
thrust ratings (CFM56-7B24/26/27, five-minute takeoff, standard day,
sea-level static). The CFM56-7B27 rating is 27,300 lbf takeoff thrust;
maximum continuous is 25,900 lbf. The packet cites the TCDS; the repository
stores the numeric rating plus unit conversion and derivation notes, not
source document text.

License/redistribution: US Government work; the FAA publishes type
certificate data sheets for public use. The repository reproduces only
numeric facts and citation detail. Local retrieval used the Stanford
coursework mirror
http://large.stanford.edu/courses/2017/ph240/wu1/docs/a16we.pdf (downloaded
October 10, 2026); rgl.faa.gov was unreachable from the retrieval host, so
reviewers should confirm the current DRS location when citing externally.

Public claim boundary: "RFS anchors the B737-800 takeoff static thrust at
27,300 lbf per engine from the FAA A16WE type certificate for the CFM56-7B27
rating under five-minute standard-day sea-level-static conditions." The TCDS
lists 24,200/26,300/27,300 lbf ratings for the -7B24/-7B26/-7B27 variants;
RFS models the highest published rating. This packet supports no
certified-performance, AFM, dispatch, training, climb or cruise lapse,
fuel-consumption, EGT, or whole-aircraft claim.

Versioned data file: `src/sim/data/aircraft/b737-800-fdm.v1.ts` (FDM data
version 1.1.0). Runtime consumers: `src/sim/systems/engine.ts`
(`computeEngineThrustN`, `updateEngines`) and `src/sim/types.ts`
(`loadAircraftSpec`, whose `spec.maxThrust` is parity-tested equal to the
anchor in `src/sim/data/__tests__/b737-800-fdm-engine-anchor.test.ts`).

Verification tests: `src/sim/data/__tests__/b737-800-fdm-engine-anchor.test.ts`
proves the anchor equals 27,300, that both versioned shells and
`loadAircraftSpec` agree on it, and that
`computeEngineThrustN(100, spec, 0, 0.2)` is exactly `lbfToN(27,300)`.
Existing `src/sim/data/__tests__/b737-800-data.test.ts` coverage continues to
enforce that placeholder-lineage sections cannot overclaim; the engine
section keeps `gameplay-calibrated` section metadata while the anchor
carries its own per-value reference.

Derivation notes / limitations: the anchor is the certified five-minute
takeoff thrust at standard-day sea-level static, not a continuous-rating or
hot-day value. The placeholder lapse table's sea-level-static point (altitude
0 ft, Mach 0.2) is pinned to exactly 1.0 so the anchor is bit-exact at that
point; all other table entries are unchanged placeholder interpolants. The
N1-squared thrust law, remaining lapse grid, relative-density scaling, SFC,
spool, and EGT values remain gameplay-calibrated placeholders under the
`missing-b738-engine-lapse-source-packet` blocker. No public claim extends
beyond the anchor sentence above, and this packet does not complete issue
#69: aero, gear, tire/brake, performance, and remaining engine groups stay
blocked pending permitted source packets.
