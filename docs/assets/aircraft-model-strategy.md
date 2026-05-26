# Aircraft model strategy

## Decision

Use a procedural, contract-tested 737-like model for the next RFS visual iteration.

Do not import an external Boeing 737 GLB/FBX as the primary Phase 3 asset yet. Keep the model generated in code, but rebuild it as a procedural v2 with named groups, correct proportions, pivots for moving surfaces, and an explicit visual contract. Add GLB/glTF loading only behind the same contract after a legally clean asset with a usable node hierarchy is found.

## Why not external GLB first?

The visual problems that currently hurt gameplay are not mainly material fidelity. They are contract and runtime problems:

- the model lacks enough named parts for deterministic animation;
- it is too easy to build future camera/cockpit/animation work around an asset with the wrong axes or pivots;
- the renderer currently needs stable object identity before richer assets matter;
- legal and attribution status must be explicit before bundling third-party aircraft art.

A procedural v2 gives us control over all of that immediately. It also keeps Phase 3 testable in CI without adding binary asset churn.

## External asset reconnaissance

| Candidate | License / status observed | Technical notes | Verdict |
| --- | --- | --- | --- |
| Sketchfab `Boeing 737-800` by andriiharbut | CC Attribution 4.0 according to the model page summary | About 108.7k triangles / 74.5k vertices; textured; node hierarchy and movable surfaces not verified | Possible future reference, not a primary asset until downloaded/audited for named parts, pivots, texture size, attribution, and trademark/livery concerns |
| Sketchfab `Boeing 737 MAX-8 - Free To Download` by arjuntripathi2k10 | CC Attribution 4.0 according to the model page summary | About 137.2k triangles / 68.6k vertices; heavier than needed; MAX variant rather than current 737-800-ish sim target | Possible visual reference only; not the Phase 3 asset |
| CGTrader `Boeing 737-800 Template` | Listed as Editorial License | Small file formats are available, but editorial licensing is not appropriate for a bundled game/simulator asset | Reject for bundled use |

Three.js already provides `GLTFLoader` under `three/addons/loaders/GLTFLoader.js`, so no package dependency is required for an uncompressed glTF/GLB import later. Add Draco/KTX2/Meshopt support only if the accepted asset actually uses those extensions.

## Procedural v2 contract

The procedural model must use the existing local aircraft convention:

- `+Y` = forward / nose
- `+X` = right wing
- `+Z` = up
- units = meters-ish, with bounding box dimensions close to a 737-800:
  - length: about 39.5 m
  - span: about 35.8 m
  - height: about 12.5 m
- origin near aircraft CG / wing box, not at the nose or ground contact point

Required named objects/groups:

- `fuselage`
- `cockpitWindows`
- `leftWing`, `rightWing`
- `leftFlap`, `rightFlap`
- `leftSlat`, `rightSlat` if represented
- `leftAileron`, `rightAileron`
- `horizontalStabilizer`
- `leftElevator`, `rightElevator`
- `verticalStabilizer`
- `rudder`
- `noseGear`, `leftMainGear`, `rightMainGear`
- `noseWheel`, `leftMainWheel`, `rightMainWheel` if represented separately
- `leftEngine`, `rightEngine`
- `leftFan`, `rightFan`
- `leftNavLight`, `rightNavLight`, `tailNavLight`, `beacon`, `landingLight`

Animation-critical surfaces should be groups with pivots at plausible hinge lines, not single merged meshes whose origin is at world/model center.

## Runtime budgets

Procedural v2 should stay cheap enough for the Cesium + Three overlay:

- Prefer simple geometries and shared materials.
- Avoid per-frame geometry creation.
- Keep model construction deterministic for tests.
- Keep exterior model hideable for cockpit camera mode.
- Target well under the current external candidates' 100k+ triangle range until there is proof richer art does not hurt interaction latency.

If an external GLB is adopted later, acceptance criteria are:

- license permits bundled simulator/game use and redistribution;
- attribution file is added beside the asset;
- no airline livery or trademark-sensitive markings are bundled unless explicitly acceptable;
- node names are mapped to the same visual contract above;
- moving surfaces have usable pivots or can be wrapped in pivot groups;
- compressed size and runtime triangle count are documented;
- visual contract tests pass against the imported scene.

## Implementation path

1. Task 3.2: add contract tests against `createBoeing737Model()` for required names, axes, and 737-like bounding proportions.
2. Task 3.2/3.4: rebuild `AircraftModel.ts` as procedural v2 with named groups and hinge-friendly pivots.
3. Task 3.3: introduce persistent `AircraftRenderer` so the model is created and attached once, then updated in place.
4. Task 3.4: drive visual animation state from gear, flap, control surface, N1, lights, WOW, and AGL state.
5. Later only if useful: add `loadAircraftModel()` / `AircraftModelProvider` that can load a GLB and normalize it to the same contract.

## Consequence

RFS will prioritize reliable gameplay readability over immediate photorealism. A contract-tested procedural model is the fastest safe path to visible gear/flaps/control surfaces, cockpit hiding, stable camera work, and deterministic visual regression tests.
