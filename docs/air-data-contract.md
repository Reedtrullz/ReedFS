# Air-data quantities and the supported indication boundary

RFS separates air-relative true airspeed (TAS), dynamic-pressure equivalent airspeed (EAS), compressible calibrated airspeed (CAS), and the healthy ideal IAS indication. Ground speed uses earth-relative velocity. Wind changes air-relative quantities without being subtracted from ground speed.

The PFD, SPEED autothrottle loop, telemetry, diagnostic export and IAS performance-fixture helpers deliberately use CAS as healthy ideal IAS. Position and instrument errors are zero in this model; their calibration/failure models remain issue #110. EAS is available separately and is not relabeled IAS. The shared scenario pressure/temperature atmosphere also supplies aerodynamic density and engine Mach. The scenario atmosphere is a surface-offset approximation, not a measured vertical sounding; its aircraft/environment qualification remains #69.

## Primary references and independent holdouts

- [NACA Report 837, Standard Nomenclature for Airspeeds (1946)](https://ntrs.nasa.gov/citations/19930091914): equations 1–3, printed page 2, subsonic compressible pitot relationship; Table II, page 13, CAS/impact pressure; Table IV, page 15, dimensionless impact/static pressure ratio versus Mach. Public NASA record identifies Government Work / Public Use Permitted.
- [US Standard Atmosphere 1976](https://ntrs.nasa.gov/citations/19770009539): Table 10, printed page 20 (PDF page 36), standard reference pressure 101325 Pa and sound speed 340.294 m/s. Only those constants are adopted here; the whole existing altitude profile is not newly qualified by this increment.
- [FAA JO 7110.65, section 5-7-3](https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap5_section_7.html): rounded standard-day 250-CAS/Mach examples at flight levels 240–290. This is an independent coarse check, not operational guidance or an aircraft performance requirement.

Unit holdouts use the published tables, independently of the implementation. Table IV has 0.0001 Mach printed resolution; its 0.5 ratio entry differs from the modern equation by 0.000059, so the bound is one printed last digit. Table II uses the historical 6080.2 ft nautical mile and rounded legacy constants; the bounded modern-unit CAS tolerance is 0.2%. FAA rounds Mach to .01: Mach .66 at 29000 ft converts to about 252.22 modern CAS, within the explicitly coarse 248–254 kt check. The old EAS approximation gives about 243.36 kt and fails that check. Exact equation inversions and low-speed limits supplement these independent holdouts; inversions alone are not source proof.

## Domain and failure behavior

`airData.ts` implements the ideal, calorically perfect, subsonic isentropic pitot relation. It uses `log1p`/`expm1` to avoid cancellation at very low speed. Both local and reference Mach must be below one; pressure must be finite and positive, impact pressure finite and nonnegative, and the scenario weather must pass its accepted pressure/temperature ranges.

Out-of-domain CAS is null and `airDataValid` is false. The numeric `ias` zero exists only for compatibility; consumers must honor validity. The PFD displays IAS INVALID and dashes, removes tape ticks/selected bug, and retains the other flight readouts. Telemetry shows INVALID and suppresses speed-derived takeoff cues; an unselected MCP speed starts from its explicit default when current air data is invalid. SPEED leaves thrust commands absent, preserves pilot input through composition, and freezes its integrator/slew state. It does not turn a missing indication into a zero-speed thrust demand. Diagnostics report invalid IAS/CAS as null and expose the quantity and validity without adding route/name/credential data or default position.

This increment does not qualify shock/supersonic pitot correction, aircraft-specific static-port error, transonic aerodynamics, CFM56 performance tables, or physical cockpit instruments. Existing handling/performance gates retain their thresholds; their IAS fixtures now invert CAS deliberately.
