# Scenario UTC and lighting

The date/time control in the Scenario panel selects UTC while stopped or paused.
Every new scenario and reset starts at **24 September 2026, 12:00 UTC**. Runway
placement preserves the selected instant. One clock anchor plus committed
aircraft simulation milliseconds defines UTC; the old `timeOfDay` field is a
derived UTC hour. Sixty simulated seconds advance UTC by sixty seconds, including
accelerated operation. Dropped wall time and a pause do not advance the clock.
Clock edits fence outstanding worker results and preserve restored weather.

Inputs must be real canonical UTC dates in 1900–2100. The anchor and resolved
instant both have this range; an edit whose elapsed simulation time would put its
anchor before 1900 is refused. This prevents huge opposing values from losing
millisecond progression through floating-point cancellation. Invalid, running
or unrecovered-fault edits leave the flight unchanged.

Snapshot version 4 records the UTC clock contract and the USSA atmosphere version,
alongside existing aircraft/FDM/shared identities. Valid versions 1–3 can still be
read without writing their stored bytes. Their historical hour maps to 24 September
2026, retaining elapsed simulation time through a derived anchor. Their original
date and historical atmosphere-model identity are unknowable, and the load message
states this migration. Version 3 historical identities are checked separately;
unknown current identities, future versions, missing anchors and inconsistent
derived hours are refused. Writing a new v4 slot preserves valid legacy neighbors.

Cesium stops its independent animation clock and uses the committed instant before
rendering. JavaScript Date drops fractional milliseconds, and Cesium's conversion
back to Date can truncate another millisecond. Native qualification compares the
actual Julian clock and frame time exactly against the projected Date; the lossy
display roundtrip is bounded separately below two milliseconds. Saves and worker
results retain the original floating-point simulation milliseconds.

Globe, aircraft and cockpit use the same approximate geometric solar calculation
from latitude, longitude and UTC. Aircraft light direction converts local solar
azimuth/elevation into Earth-fixed coordinates. This reuses the prior viewport
approximation; it does not include refraction or establish ephemeris accuracy.
[NOAA's calculation notes](https://gml.noaa.gov/grad/solcalc/calcdetails.html) are
background for the distinction between geometric and apparent position, rather
than a transferred accuracy claim for this simpler implementation.

Night imagery and degraded globe color blend from 22% brightness at −6 degrees to
full brightness at +6 degrees. The sky atmosphere dims by the same blend. The
existing −2 degree globe-lighting gate protects night visibility; its atmospheric
color transition remains visible. Cockpit ambient light has a floor of 0.25 and
panel fill remains 0.7. Existing procedural runway lights and the PFD stay readable.
Visual-test mode retains its explicit deterministic full-brightness globe policy.

Native qualification uses real Cesium/Three/cockpit objects and worker commits.
The reference instrumentation only exposes existing objects to observation; it
does not replace rendering or clock behavior. Fixed local degraded-scene images
and numerical lighting observations are separate from live imagery/terrain,
photometric airport lighting, physical-device acceptance and continuous flight.
