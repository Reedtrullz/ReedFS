# CI maintenance — 2026-09-08

## Action pinning

The old release guard duplicated action SHAs from the workflows. Dependabot therefore failed `check:release` on every legitimate action update. The new guard parses all `.github/workflows/*.yml` and `*.yaml`, validates every step/job action reference as a full commit SHA, retains the required-action list, and requires every CodeQL action reference to share one SHA. Comments and shell text cannot satisfy required actions. Invalid YAML and duplicate mapping keys fail closed. Local and Docker action references are not currently allowed by this repository policy.

The workflow pin is now the sole version declaration. SHA syntax is not provenance verification: review the upstream release and diff before merging upgrades. Existing CI, image scanning, branch protection and post-merge release verification remain required.

## Browser runtime investigation

Both runs passed all 23 tests with one worker and no retries shown in their test sequence:

- [CI34224214283](https://github.com/Reedtrullz/ReedFS/actions/runs/34224214283): browser suite9.3 minutes; later Docker scan failed on libuuid (fixed in PR33).
- [CI34232522970](https://github.com/Reedtrullz/ReedFS/actions/runs/34232522970): browser suite17.1 minutes; entire release passed.

The following are approximate seconds between successive test-start log timestamps, grouped by file. They include teardown/startup overhead, not just test-body execution. The last interval ends at the suite summary.

| File | 9.3-minute run | 17.1-minute run |
|---|---:|---:|
| rfs-blackbox-player-loop | 192.5 | 325.9 |
| rfs-route | 111.6 | 192.9 |
| rfs-route-descent | 81.4 | 184.0 |
| rfs-responsive-accessibility | 34.8 | 69.1 |
| rfs-flight | 34.3 | 66.3 |
| rfs-browser-assisted-airborne-mcp | 33.2 | 65.9 |
| rfs-truth-flow | 36.4 | 64.0 |
| rfs-runway-pair-routing | 29.8 | 55.6 |

The three largest files account for about69% of the slower run. Slowdown appears across every file, so these logs do not establish a single timeout or one broken helper as the cause. Runner/rendering contention is a hypothesis, not a measured CPU diagnosis.

The visible takeoff/descent tests install Playwright's clock and repeatedly call `page.clock.runFor` through `advanceVisibleSimTime` while exercising the actual simulation and rendering. Switching to `fastForward`, increasing sim rate, removing samples or skipping scenarios would change that proof. The existing continuous full-flight proof is already separate from the standard gate.

## Small improvement shipped

`test:e2e` already set `PLAYWRIGHT_JSON_OUTPUT_NAME=test-results/e2e-timings.json` but only selected the line reporter, so no JSON report was generated. It now selects `list,json`: CI logs expose each test's duration and the configured local JSON file is generated. The JSON file is not uploaded as a GitHub artifact. No timing budget is added until enough comparable measurements exist; no test, retry, worker count, simulation cadence or assertion was removed. No speedup is claimed.

A future speed experiment should compare one versus two workers on the same commit and runner class, measuring exact per-test durations, failures/retries and CPU pressure. Keep the single-worker default until that experiment demonstrates an improvement without reducing proof reliability.

## Validation finding

The first PR scan caught exponential regex backtracking in the new validator. A bounded subprocess test reproduced the timeout; removing slash from the repeated path-segment class eliminates ambiguous partitioning. The regression passes after the fix. Branch protection now also requires the separate `CodeQL` findings result, because a successful analysis job alone does not mean no new findings.

## Other observation

Installing dependencies reported nine existing npm advisories in @babel/core, brace-expansion, browserslist, dompurify, nanoid, postcss, protobufjs, undici and vite. The new YAML parser is not flagged. These dependencies were not upgraded in this focused change; package-lock changes add only yaml. Runtime image scanning is a separate gate and does not establish npm dependency safety.
