# RFS E2E Proof Stability Closeout — 2026-06-16

## Scope

This closeout records the local implementation of `docs/plans/2026-06-16-rfs-e2e-proof-stability-next-work.md` for the default visible-control browser-proof blocker.

## What changed

- `EngineStrip` now exposes an accessible named `region` (`Engine, flap, and gear status`) so black-box browser helpers can read durable throttle/flap/gear command and actual state after `TakeoffSetupPanel` is phase-gated away.
- `e2e/helpers/rfsBlackbox.ts` now has DOM-only EngineStrip readback helpers. The manifest-listed black-box helper remains visible-boundary only: no `src/` imports, no Zustand/store reads, and no hidden state mutation.
- `e2e/rfs-blackbox-player-loop.spec.ts` no longer asserts post-positive-rate gear/throttle/flap truth through the phase-gated `Takeoff setup` panel. It keeps setup-panel assertions for pre-roll setup and uses EngineStrip for post-positive-rate readbacks.
- `RfsShell` keeps mouse cleanup controls visible during dirty `CLIMB` only while gear/flaps still need cleanup, then hides the setup panel after clean climb.
- Narrow responsive layout now caps the scrollable takeoff setup panel at 200px at `max-width: 1360px`, preserving the visible cleanup controls without overlapping the simulator controls at 1024px.
- `e2e/rfs-truth-flow.spec.ts` now reflects the current ENVA default route contract (`ENVA→ENGM`) while preserving the no-hidden-AP and pre-positive-rate gear-gating assertions.

## Local evidence

Commands run with Node 22 (`source ~/.nvm/nvm.sh && nvm use 22 >/dev/null`):

- Focused reproduction before fix: `CI=1 VITE_RFS_VISUAL_TEST=0 npx playwright test e2e/rfs-blackbox-player-loop.spec.ts -g "keyboard controls" --workers=1 --reporter=line --timeout=360000` timed out waiting for `Takeoff setup` / `Current takeoff configuration` while the visible app had progressed to `PHASE DESCENT` with EngineStrip still showing throttle/flap/gear state.
- Focused keyboard proof after fix: `CI=1 VITE_RFS_VISUAL_TEST=0 npx playwright test e2e/rfs-blackbox-player-loop.spec.ts -g "keyboard controls" --workers=1 --reporter=line --timeout=360000` — PASS, `1 passed (1.8m)`.
- Full player-loop spec: `CI=1 VITE_RFS_VISUAL_TEST=0 npx playwright test e2e/rfs-blackbox-player-loop.spec.ts --workers=1 --reporter=line --timeout=360000` — PASS, `4 passed (3.7m)`.
- Local aggregate gate on final tree: `npm run check` — PASS, including release/black-box guards, lint, typecheck, `100 passed` Vitest files / `915 passed` tests, production build, and bundle budget.
- Default E2E spec list on final tree against a verified local Vite server: `VITE_RFS_VISUAL_TEST=0 env -u CI ./node_modules/.bin/playwright test e2e/rfs-blackbox-player-loop.spec.ts e2e/rfs-browser-assisted-airborne-mcp.spec.ts e2e/rfs-flight.spec.ts e2e/rfs-responsive-accessibility.spec.ts e2e/rfs-route-descent.spec.ts e2e/rfs-route.spec.ts e2e/rfs-truth-flow.spec.ts --workers=1 --reporter=line` — PASS, `28 passed (13.1m)`. A prior final-tree `npm run test:e2e` attempt is not counted as product proof because the Playwright-owned Vite webServer exited and 27 tests failed at `page.goto('/')` with `ERR_CONNECTION_REFUSED`; no product assertions failed in that run.
- Visual gate on final tree: `CI=1 npm run test:visual` — PASS, `6 passed (1.1m)`, visual timing budget OK (`total 65587ms`, `max 26946ms`).
- Explicit slow full-flight gate on final tree: `RFS_FINAL_FULL_FLIGHT=1 npm run test:e2e:full-flight` — PASS, `1 passed (2.6m)`.

## Proof boundaries / non-claims

- This is local evidence only until pushed and verified by a completed successful GitHub Actions run for the exact pushed SHA.
- This is not live/deployed evidence until `/rfs-version.json` reports the exact deployed SHA.
- The explicit slow full-flight gate passed locally for this tree, but it does not prove default CI runs that slow gate, live deployment, continuous full-route KSEA→KPDX without the spec's deliberate scenario reset boundary, or source-backed/certified 737 realism.
- Seeded/scoped route, descent, and landing browser proofs remain bounded regression guards unless the explicit slow full-flight gate is run and passes for the exact tree being claimed.
