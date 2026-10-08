# Restored weather authority

A saved flight restores its recorded wind, pressure, temperature, visibility,
cloud cover and deterministic cloud/gust seeds. Restoring a running save pauses
the flight. The restored atmosphere remains authoritative until reset or scenario
selection; the visible load message states that choice. Loading a runway route
preserves this restored atmosphere, including an explicitly absent wind field.

Scenario selection, reset, save restoration and last-valid-checkpoint recovery
advance a weather session epoch. The weather hook checks the captured epoch as
well as the scenario identity before applying an asynchronous METAR response.
Restoration also suppresses fallback reseeding and new live requests. These
weather boundaries are separate from physics generations: autopilot or route
commands do not restart weather requests. A reset to the same scenario starts a
fresh request and does not accept the prior response.

Cloud rendering reads the effective stored weather and its seeds/anchor. It does
not substitute the authored scenario seed after restoring a different saved
atmosphere. Legacy saves without recorded weather still restore the documented
scenario defaults, rather than claiming exact historical weather.

Qualification uses actual store/React regression cases and a browser test with
held local HTTP METAR responses. The old implementation demonstrably overwrites
a restored QNH of987 with1030 and replaces wind, temperature, clouds and seeds.
The repaired test preserves the paused aircraft and its physics generation,
then confirms reset accepts a fresh response. The selected browser command
configures a local test endpoint; unhandled requests resolve to no weather update.
This does not qualify a live provider, physical rendering device, or continuous
full flight. Simulation UTC and the atmosphere source identity are tracked by
the separate clock/compatibility increment.
