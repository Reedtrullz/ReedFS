# Reproducing RFS acceptance

Use Node 22 and an isolated RFS/RFMS sibling pair. `npm run bootstrap` creates or
switches `../RFMS`; it must never be used against a checkout containing work to
preserve. `npm run bootstrap:check` is read-only and fails for missing,
unversioned, mismatched or dirty dependencies. The required shared commit is
`810fc9652da431eaf8978b85bf4af131605559b5`.

```sh
node --version                       # must be 22.x
npm run bootstrap                    # only in the isolated pair
npm run bootstrap:check
npm ci --legacy-peer-deps
npm run check
npm run test:e2e
npm run test:visual
npm run test:e2e:worker-physics
npm run test:e2e:full-flight
```

## Evidence boundaries

| Capability | Reproducible gate | What it proves / remaining acceptance |
| --- | --- | --- |
| Dependency/build identity | clean pinned sibling, bootstrap:check, clean install, version metadata | exact local inputs; canonical CI and public revision need separate receipts |
| Unit/runtime correctness | `npm run check` | unit/lint/types/build/budgets; no claim of real browser/device or aircraft fidelity |
| Selected player flows | `npm run test:e2e` | named visible-control browser scenarios; not a continuous full flight |
| Browser worker | `test:e2e:worker-physics` | actual worker dispatch/takeoff path; handler parity alone is insufficient |
| Continuous ENVA route | `test:e2e:full-flight` | current ENVA takeoff through descent/autoland; KSEA/KPDX continuous coverage is still pending |
| Rendering | `test:visual` | seeded visual checks; real scene/cockpit and hardware acceptance remain separate |
| Flight model | independently derived analytic fixtures and qualified aircraft source packets | math consistency and supported data envelope; neither screenshots nor tuning certify handling |
| Audio/devices/XR | rendered audio probes, listening and actual supported device trials | test doubles do not establish listening/device/headset acceptance |
| Release/security | native full CI, CodeQL, secret scan, hardened image smoke/Trivy | exact candidate and canonical gates, with unchanged policies |
| Delivery | normal enabled delivery, public exact revision/assets/headers | live delivered identity; local checks or HTTP 200 alone are insufficient |

Keep receipts pinned to the commit, shared dependency identity, runtime, command
and result. Name unsupported or untested scope explicitly. Update this matrix as
new gates land; preserve the existing ENVA, blackbox, CSP/PWA and release guards.

## Worker validation bundle cost (2026-10-08)

On Node22, unchanged application baseline was364.6KiB raw/114.9KiB gzip. Full finite worker boundary validation measured381.3/120.1; compact state shape measured380.6/119.8. Terser measured414.8/123.1 and was rejected. The app budget is rebaselined to400/126 with roughly5% headroom; all other category budgets and native security thresholds remain unchanged. This is an explicit feature allowance for duplicated app/worker validation, subject to independent review and native CI; it does not establish device performance. Real-browser protocol checks and existing worker/player flows remain required.
