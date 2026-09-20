# RFS — Agent Knowledge Base

**Verified:** 2026-09-20 (truth pass; every claim below checked against the working tree)
**Stack:** TypeScript ~6.0 + React 19 + Vite + Cesium 1.141 + Three.js 0.184 + Zustand

## Overview

Browser-native Boeing 737-800 flight simulator. Physics runs in `src/sim` (worker-capable), rendering in `src/viewport` (Cesium globe + Three.js aircraft layer), UI in React, state in Zustand slices. Sibling dependency `@virtual-cdu/shared` from `../RFMS/shared` (sync via `npm run bootstrap`).

## Structure

- `src/sim/` — physics, systems, autopilot, FMS, flight model (~948 KiB)
- `src/viewport/` — Cesium/Three.js rendering, camera, aircraft model
- `src/components/` — React UI (RouteBuilder, ScenarioPanel, Telemetry)
- `src/store/` — Zustand slices (aircraft, autoflight, input, route, persistence)
- `src/instruments/` — MCP/PFD/CDU components
- `src/input/` — gamepad + keyboard input
- `src/audio/` — GPWS speech cues
- `e2e/` — Playwright blackbox scenario tests
- `dist/` — build output (gitignored; PWA precache generated at build time)

## Where to Look

| Task | Location |
|------|----------|
| Physics worker loop | `src/sim/simulationWorker.ts` |
| Step integration | `src/sim/simulationStep.ts` |
| Central state | `src/store/simStore.ts` |
| 3D viewport | `src/viewport/CesiumViewport.tsx` |
| Weather/METAR | `src/sim/weather.ts`, `src/app/useScenarioWeather.ts` |
| PFD selectors | `src/store/selectors.ts` |

## Conventions

- Node 22 (CI pins 22; no .nvmrc — local machines may need explicit PATH)
- ESM-only (`"type": "module"`), strict TypeScript
- Path aliases: `@/` → src, `@shared` → `../RFMS/shared`
- Vitest unit tests (`*.test.ts`), Playwright e2e (`e2e/*.spec.ts`)
- Vendor chunk splitting: three.js isolated; bundle budgets enforced by `check:bundle`
- Physics constants toward B737-800 source-lineaged data
- No console.log and no TODO/FIXME comments in source (verified: zero)
- PWA app-shell service worker via vite-plugin-pwa (auto-update, precache ~1000 KiB)
- Worker physics behind `VITE_RFS_WORKER_PHYSICS=1` is a parity/protocol path; `simStore.tick()` remains synchronous, so production physics is main-thread until the frame scheduler becomes async-aware

## Verified State (2026-09-20)

- No `any` type leaks in src outside comments
- `dist/`, `.env`, and `*.tsbuildinfo` are all gitignored; none are tracked
- No SimConnect/MSFS bridge exists (references appear only in archived plan docs)
- Test naming is consistent: unit = `.test.ts`, e2e = `.spec.ts` under `e2e/`
- Weather chain: METAR (wind, QNH, temp, visibility, clouds) → store `weather` state → density-altitude physics + baro-indicated PFD altitude (27 ft/hPa vs 1013.25); FD/AP/VNAV guidance truth stays in true altitude

## Commands

```bash
npm run dev          # Vite dev server
npm run check        # composite gate: deps, release, blackbox, lint, typecheck, test, build, bundle
npm run test         # Vitest unit tests
npm run test:e2e     # Playwright e2e
npm run test:visual  # Cesium/rendering visual tests
npm run lint         # ESLint
```

## Local Machine Notes

- The `~/.local/bin/node` shim is broken on this machine; use `export PATH=~/.nvm/versions/node/v22.22.3/bin:$PATH` before npm/npx
- npm installs need `--legacy-peer-deps`

