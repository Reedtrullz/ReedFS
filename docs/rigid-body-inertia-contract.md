# Coupled rigid-body inertia

Body axes are x forward, y right, z down. Roll/pitch/yaw rates and moments use those axes. Inertia is constant within a fixed step, measured in kg m²; moments are N m and angular acceleration is rad/s². The selected symmetric-body tensor is:

```
I = [ Ixx   0  -Ixz ]
    [   0 Iyy     0 ]
    [-Ixz   0   Izz ]
```

Euler's vector equation is `I omegaDot = M - omega cross (I omega)`. The roll and yaw derivatives share a 2x2 solve with determinant `Ixx Izz - Ixz²`. Dividing each equation by a diagonal entry ignores the other derivative. The pitch equation already has the corresponding product-of-inertia term. The simulator retains its explicit rate update and normalized quaternion update; it changes the coupled solve, not the integration algorithm or aircraft constants.

Primary reference: Wayne Johnson, NASA/TP–20220000355/APPX-A, NDARC Theory Appendix A, March 2023, §8–6, printed p.91 (PDF p.97), [NASA document20230003601](https://ntrs.nasa.gov/citations/20230003601). NASA identifies it as government work permitting public use. The reference supports generic mechanics; it does not qualify RFS's aircraft inertia or coefficients as Boeing data.

Independent tests multiply the complete tensor by the observed integration derivative and add the cross product, checking the residual against zero or separately sampled aerodynamic moments. Both product-of-inertia signs are tested. A synthetic torque-free body with zero wing area checks quaternion norm, bounded three-second energy drift and convergence at60/120/240Hz against1920Hz. Existing takeoff, stall and AP tests remain required preservation checks.

## Force correction remains pending

Nonzero angle-of-attack/sideslip tests independently reproduced incomplete wind-to-body force resolution. A complete transformation passed those analytic cases but made the unchanged gear-down/flaps5 rotation case climb6195.5ft/min against its4200ft/min limit. That force candidate and its test evidence are retained in the execution ledger and excluded from delivered physics pending model/performance qualification. No coefficient, test threshold or aircraft-validity claim is adjusted to hide the discrepancy. Issue #70 remains partial, with source-qualified data #69 and engine/performance work #74 still relevant.
