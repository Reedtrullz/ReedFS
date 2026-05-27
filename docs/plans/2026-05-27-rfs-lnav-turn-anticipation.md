# RFS LNAV Turn Anticipation Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task. Parent-direct is allowed for final docs sync and deploy verification, but implementation tasks should still follow strict TDD.

**Goal:** Make LNAV advance to the next leg at a realistic turn-anticipation gate before overflying the waypoint, instead of waiting only for capture radius or passed-waypoint geometry.

**Architecture:** `src/sim/systems/navigation.ts` already computes next-leg track, turn angle, and raw turn-anticipation distance. This plan turns those metrics into a bounded sequencing gate, then verifies `resolveAutopilotTargets()` and `advanceSimulationStep()` consume the anticipated active leg through the existing store-owned route-status path. Docs are updated after code lands so the roadmap no longer lists turn-anticipation guidance as pending.

**Tech Stack:** TypeScript strict, Vitest, Zustand store, RFMS shared flight-plan types.

## Status

Completed in commits:

- `812c036 docs: add lnav turn anticipation plan`
- `3d0c879 feat: anticipate lnav route turns`
- `d7cf668 test: prove lnav turn anticipation integration`
- `docs: document lnav turn anticipation` (this docs/status commit)

Current behavior: `computeRouteStatus()` sequences route legs on capture radius, passed-waypoint geometry, or a bounded turn-anticipation gate; `advanceSimulationStep()` and AP LNAV consume the anticipated active leg through route status.

The implementation tasks below are retained as a historical execution record; current architecture and roadmap status are documented in `docs/architecture.md` and `docs/roadmap.md`.

---

## Baseline before this plan

- Before this plan, `computeRouteStatus()` validated route geometry, built legs, sequenced only when inside capture radius or already past the to-waypoint, and exposed turn metrics as informational fields.
- Before this plan, `resolveAutopilotTargets()` recomputed route status for the active leg and used the returned desired track for LNAV.
- Before this plan, `advanceSimulationStep()` computed `routeBeforeTick`, passed `routeBeforeTick.activeLegIndex` into AP command generation, integrated, recomputed route status, and stored `routeStatus.activeLegIndex`.
- At plan start, roadmap P2 still listed turn-anticipation guidance sequencing as pending.

## Design constraints

- Do not fall back to legacy `computeLNAV()` for route-coupled AP modes.
- Invalid/discontinuous/missing-coordinate routes must remain unavailable with visible reasons.
- Do not sequence merely because a route has a next leg. Require all of:
  - next leg exists;
  - current leg has a usable `from` point and positive length;
  - speed produces a finite positive turn lead;
  - current position is before the waypoint, not behind the from waypoint;
  - distance to waypoint is within the bounded turn-lead gate.
- Bound sequencing lead so short legs do not sequence immediately after the previous waypoint.
- Preserve capture-radius and passed-waypoint sequencing behavior.
- Tests must prove RED before code changes and run with Node 22.

---

## Task 1: Add anticipation-aware route sequencing in navigation

**Objective:** `computeRouteStatus()` should sequence to the next leg before the waypoint when the aircraft is inside a bounded turn-anticipation gate for a real route turn.

**Files:**
- Modify: `src/sim/systems/navigation.ts`
- Modify: `src/sim/systems/__tests__/navigation.test.ts`

**Step 1: Write failing tests**

Add tests under `describe('computeRouteStatus', ...)`:

```ts
it('sequences to the next leg inside the bounded turn-anticipation gate before the waypoint', () => {
  const fp = makePlan([
    { ident: 'ORIG', lat: 47.0, lon: -122.0, discontinuity: false },
    { ident: 'MID', lat: 47.2, lon: -122.0, discontinuity: false },
    { ident: 'DEST', lat: 47.2, lon: -121.8, discontinuity: false },
  ]);
  const state = makeState(47.185, -122.0, 128.6);

  const status = computeRouteStatus(state, fp, 0, { captureRadiusM: 100 });

  expect(status.lnavAvailable).toBe(true);
  expect(status.sequenced).toBe(true);
  expect(status.activeLegIndex).toBe(1);
  expect(status.fromIdent).toBe('MID');
  expect(status.nextWaypointIdent).toBe('DEST');
  expect(status.desiredTrackDegTrue).toBeCloseTo(90, 0);
});

it('does not turn-anticipate when the aircraft is outside the bounded lead gate', () => {
  const fp = makePlan([
    { ident: 'ORIG', lat: 47.0, lon: -122.0, discontinuity: false },
    { ident: 'MID', lat: 47.2, lon: -122.0, discontinuity: false },
    { ident: 'DEST', lat: 47.2, lon: -121.8, discontinuity: false },
  ]);
  const state = makeState(47.14, -122.0, 128.6);

  const status = computeRouteStatus(state, fp, 0, { captureRadiusM: 100 });

  expect(status.lnavAvailable).toBe(true);
  expect(status.sequenced).toBe(false);
  expect(status.activeLegIndex).toBe(0);
  expect(status.nextWaypointIdent).toBe('MID');
});

it('bounds turn anticipation so short legs do not sequence immediately after the from waypoint', () => {
  const fp = makePlan([
    { ident: 'ORIG', lat: 47.0, lon: -122.0, discontinuity: false },
    { ident: 'MID', lat: 47.01, lon: -122.0, discontinuity: false },
    { ident: 'DEST', lat: 47.01, lon: -121.99, discontinuity: false },
  ]);
  const state = makeState(47.004, -122.0, 128.6);

  const status = computeRouteStatus(state, fp, 0, { captureRadiusM: 50 });

  expect(status.sequenced).toBe(false);
  expect(status.activeLegIndex).toBe(0);
  expect(status.nextWaypointIdent).toBe('MID');
});

it('does not turn-anticipate for straight-through route geometry', () => {
  const fp = makePlan([
    { ident: 'ORIG', lat: 47.0, lon: -122.0, discontinuity: false },
    { ident: 'MID', lat: 47.2, lon: -122.0, discontinuity: false },
    { ident: 'DEST', lat: 47.4, lon: -122.0, discontinuity: false },
  ]);
  const state = makeState(47.185, -122.0, 128.6);

  const status = computeRouteStatus(state, fp, 0, { captureRadiusM: 100 });

  expect(status.sequenced).toBe(false);
  expect(status.activeLegIndex).toBe(0);
  expect(status.nextWaypointIdent).toBe('MID');
});

it('does not turn-anticipate without usable forward speed', () => {
  const fp = makePlan([
    { ident: 'ORIG', lat: 47.0, lon: -122.0, discontinuity: false },
    { ident: 'MID', lat: 47.2, lon: -122.0, discontinuity: false },
    { ident: 'DEST', lat: 47.2, lon: -121.8, discontinuity: false },
  ]);
  const state = makeState(47.185, -122.0, 0);

  const status = computeRouteStatus(state, fp, 0, { captureRadiusM: 100 });

  expect(status.sequenced).toBe(false);
  expect(status.activeLegIndex).toBe(0);
  expect(status.nextWaypointIdent).toBe('MID');
});

it('does not turn-anticipate when turn anticipation is disabled for deterministic diagnostics', () => {
  const fp = makePlan([
    { ident: 'ORIG', lat: 47.0, lon: -122.0, discontinuity: false },
    { ident: 'MID', lat: 47.2, lon: -122.0, discontinuity: false },
    { ident: 'DEST', lat: 47.2, lon: -121.8, discontinuity: false },
  ]);
  const state = makeState(47.185, -122.0, 128.6);

  const status = computeRouteStatus(state, fp, 0, {
    captureRadiusM: 100,
    turnAnticipationEnabled: false,
  });

  expect(status.sequenced).toBe(false);
  expect(status.activeLegIndex).toBe(0);
  expect(status.nextWaypointIdent).toBe('MID');
});
```

If exact latitude values prove too close/far once computed, adjust them minimally while preserving the intent: first test is outside 100 m capture but inside turn lead; second is outside turn lead.

**Step 2: Verify RED**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/systems/__tests__/navigation.test.ts
```

Expected: new anticipation test fails because `computeRouteStatus()` still stays on leg 0 until capture/passed-waypoint.

**Step 3: Implement minimal navigation changes**

In `src/sim/systems/navigation.ts`:

- Extend `RouteStatusOptions`:

```ts
export interface RouteStatusOptions {
  captureRadiusM?: number;
  turnAnticipationEnabled?: boolean;
}
```

- Add constants near existing LNAV constants:

```ts
const MAX_TURN_ANTICIPATION_LEG_FRACTION = 0.5;
```

- Replace boolean-only `shouldSequenceLeg()` with a helper that can consider the next leg and return a reason internally. A suggested shape:

```ts
type SequencingReason = 'capture' | 'passed' | 'turnAnticipation' | null;

function computeLegTurnAngleRad(leg: RouteLeg, nextLeg: RouteLeg | undefined): number | null { ... }

function turnAnticipationLeadM(
  state: AircraftState,
  leg: RouteLeg,
  nextLeg: RouteLeg | undefined,
): number | null { ... }

function sequencingReasonForLeg(
  state: AircraftState,
  leg: RouteLeg,
  nextLeg: RouteLeg | undefined,
  captureRadiusM: number,
  turnAnticipationEnabled: boolean,
): SequencingReason { ... }
```

Implementation rules:
- `capture` wins if distance to waypoint <= capture radius.
- `passed` wins if `relative.alongTrackM >= relative.legLengthM`.
- `turnAnticipation` is considered only when enabled and `nextLeg` exists.
- Use existing `groundOrTasMps()`, `computeTurnAnticipationDistanceM()`, and `normalizeSignedRad()` logic instead of duplicating math.
- Bound raw lead to `relative.legLengthM * MAX_TURN_ANTICIPATION_LEG_FRACTION` and require bounded lead > capture radius.
- Require `relative.alongTrackM >= 0` and `relative.alongTrackM < relative.legLengthM` before anticipation sequencing.
- Treat straight-through/tiny turns and unavailable/low speed as no anticipation lead.

- In the `while` loop, use the helper with `legs[legIndex + 1]`:

```ts
const turnAnticipationEnabled = options.turnAnticipationEnabled ?? true;
while (legIndex < legs.length - 1) {
  const reason = sequencingReasonForLeg(
    state,
    legs[legIndex],
    legs[legIndex + 1],
    captureRadiusM,
    turnAnticipationEnabled,
  );
  if (!reason) break;
  legIndex += 1;
  sequenced = true;
}
```

Avoid adding `sequencingReason` to `RouteStatusSnapshot` unless tests or UI need it; `sequenced` is enough for this slice.

**Step 4: Verify GREEN**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/systems/__tests__/navigation.test.ts
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx tsc -b --pretty false
```

Expected: all navigation tests and TypeScript pass.

**Step 5: Commit**

```bash
git add src/sim/systems/navigation.ts src/sim/systems/__tests__/navigation.test.ts
git -c commit.gpgsign=false commit -m "feat: anticipate lnav route turns"
```

---

## Task 2: Prove AP and simulation-step use the anticipated active leg

**Objective:** Verify the existing route-status dependency chain actually feeds anticipated active legs into AP target selection and stored route state.

**Files:**
- Modify: `src/sim/systems/__tests__/autopilot.test.ts`
- Modify: `src/sim/__tests__/simulationStep.test.ts`

**Step 1: Write failing or newly protective tests**

Add under `describe('resolveAutopilotTargets LNAV', ...)`:

```ts
it('targets the next leg heading when route status anticipates a turn before the waypoint', () => {
  const s = createInitialState(B737_800_SPEC);
  s.position.lat = 47.185;
  s.position.lon = -122.0;
  s.attitude.psi = 0;
  s.velocity.u = 128.6;
  const ap = makeAp('LNAV', 'ALT_HOLD', 'SPEED');
  const fp: FlightPlan = {
    origin: 'ORIG',
    destination: 'DEST',
    flightNumber: 'TST894',
    route: 'ORIG MID DEST',
    waypoints: [
      { ident: 'ORIG', lat: 47.0, lon: -122.0, discontinuity: false },
      { ident: 'MID', lat: 47.2, lon: -122.0, discontinuity: false },
      { ident: 'DEST', lat: 47.2, lon: -121.8, discontinuity: false },
    ],
  };

  const targets = resolveAutopilotTargets(s, ap, fp, 0);

  expect(targets.targetHeadingRad).toBeGreaterThan(60 * Math.PI / 180);
  expect(targets.targetHeadingRad).toBeLessThan(90 * Math.PI / 180);
});
```

Add to `src/sim/__tests__/simulationStep.test.ts` a helper flight plan and a test proving `advanceSimulationStep()` updates stored route feedback before overflight:

```ts
it('stores an anticipated active leg before waypoint overflight when inside the turn lead', () => {
  const aircraft = createInitialState(B737_800_SPEC);
  aircraft.position.lat = 47.185;
  aircraft.position.lon = -122.0;
  aircraft.velocity.u = 128.6;
  const pilotInputs = tutorialControls();
  const flightPlan = {
    origin: 'ORIG',
    destination: 'DEST',
    flightNumber: 'TST895',
    route: 'ORIG MID DEST',
    waypoints: [
      { ident: 'ORIG', lat: 47.0, lon: -122.0, discontinuity: false },
      { ident: 'MID', lat: 47.2, lon: -122.0, discontinuity: false },
      { ident: 'DEST', lat: 47.2, lon: -121.8, discontinuity: false },
    ],
  } satisfies FlightPlan;
  const guidance = buildGuidanceState({
    scenario: KSEA_TUTORIAL_SCENARIO,
    status: 'running',
    aircraft,
    controls: pilotInputs,
  });

  const result = advanceSimulationStep({
    aircraft,
    spec: B737_800_SPEC,
    pilotInputs,
    apState: null,
    flightPlan,
    activeLegIndex: 0,
    routeStatus: createNoRouteStatus(flightPlan),
    wind: null,
    dt: 1 / 60,
    status: 'running',
    selectedScenarioId: KSEA_TUTORIAL_SCENARIO.id,
    guidance,
  });

  expect(result.activeLegIndex).toBe(1);
  expect(result.routeStatus.fromIdent).toBe('MID');
  expect(result.routeStatus.nextWaypointIdent).toBe('DEST');
});
```

Add a second simulation-step test with an engaged LNAV AP state so this layer proves AP command generation receives the anticipated active leg before integration:

```ts
it('feeds the anticipated active leg into LNAV AP commands before integration', () => {
  const aircraft = createInitialState(B737_800_SPEC);
  aircraft.position.lat = 47.185;
  aircraft.position.lon = -122.0;
  aircraft.attitude.psi = 0;
  aircraft.velocity.u = 128.6;
  const pilotInputs = tutorialControls();
  const flightPlan = {
    origin: 'ORIG',
    destination: 'DEST',
    flightNumber: 'TST896',
    route: 'ORIG MID DEST',
    waypoints: [
      { ident: 'ORIG', lat: 47.0, lon: -122.0, discontinuity: false },
      { ident: 'MID', lat: 47.2, lon: -122.0, discontinuity: false },
      { ident: 'DEST', lat: 47.2, lon: -121.8, discontinuity: false },
    ],
  } satisfies FlightPlan;
  const apState = {
    boeing: { courseL:0,courseR:0,speed:null,mach:null,heading:0,altitude:0,verticalSpeed:null,
      fdLeft:false,fdRight:false,autothrottleArm:false,
      n1:false,speedMode:false,lnav:true,vnav:false,lvlChg:false,hdgSel:false,vorLoc:false,app:false,altHold:true,vs:false,
      cmdA:true,cmdB:false,cwsA:false,cwsB:false },
    airbus: { speed:null,speedManaged:false,heading:null,headingManaged:false,altitude:0,altitudeManaged:false,
      verticalSpeed:null,fpa:null,fd1:false,fd2:false,athr:false,ap1:false,ap2:false,
      loc:false,appr:false,exped:false,hdgTrkMode:'HDG_VS',metricAltitude:false,speedMachMode:'SPD' },
    truth: {
      lateralActive: 'LNAV', verticalActive: 'ALT_HOLD', thrustActive: 'OFF',
      autopilotStatus: 'CMD_A',
      lastModeChangeTimestamps: { thrust:0, lateral:0, vertical:0 },
    },
  } satisfies AutopilotState;
  const guidance = buildGuidanceState({
    scenario: KSEA_TUTORIAL_SCENARIO,
    status: 'running',
    aircraft,
    controls: pilotInputs,
  });

  const result = advanceSimulationStep({
    aircraft,
    spec: B737_800_SPEC,
    pilotInputs,
    apState,
    flightPlan,
    activeLegIndex: 0,
    routeStatus: createNoRouteStatus(flightPlan),
    wind: null,
    dt: 1 / 60,
    status: 'running',
    selectedScenarioId: KSEA_TUTORIAL_SCENARIO.id,
    guidance,
  });

  expect(result.apCommands.aileron).toBeGreaterThan(0);
  expect(result.activeLegIndex).toBe(1);
});
```

Add imports as needed:
- `type FlightPlan` in `simulationStep.test.ts`.
- `type AutopilotState` in `simulationStep.test.ts`.

**Step 2: Verify RED/Protective behavior**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/systems/__tests__/autopilot.test.ts src/sim/__tests__/simulationStep.test.ts
```

Expected before Task 1 would fail; after Task 1 these should pass or catch any missed integration wiring. If they pass immediately after Task 1, they are still valuable integration coverage.

**Step 3: Implement only if needed**

If Task 1 route-status sequencing already makes these tests pass, do not add production code. If they fail because AP or `advanceSimulationStep()` bypasses `routeBeforeTick.activeLegIndex`, patch the smallest integration point while preserving route-status ownership.

**Step 4: Verify**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx vitest run src/sim/systems/__tests__/navigation.test.ts src/sim/systems/__tests__/autopilot.test.ts src/sim/__tests__/simulationStep.test.ts src/store/__tests__/simStore.test.ts src/components/__tests__/RouteStatus.test.tsx
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx tsc -b --pretty false
```

**Step 5: Commit**

```bash
git add src/sim/systems/__tests__/autopilot.test.ts src/sim/__tests__/simulationStep.test.ts src/sim/systems/navigation.ts src/sim/systems/autopilot.ts src/sim/simulationStep.ts
git -c commit.gpgsign=false commit -m "test: prove lnav turn anticipation integration"
```

Only include production files in the commit if actually modified.

---

## Task 3: Update docs and roadmap current status

**Objective:** Document the new LNAV turn-anticipation behavior and remove stale roadmap language that says this specific P2 item is still pending.

**Files:**
- Modify: `docs/roadmap.md`
- Modify: `docs/architecture.md`
- Modify: `docs/plans/README.md`
- Modify: `docs/plans/2026-05-27-rfs-lnav-turn-anticipation.md`

**Step 1: Update roadmap**

In `docs/roadmap.md`:
- Add LNAV turn-anticipation sequencing to the completed baseline/guidance list.
- In P2 remaining scope, remove the bullet `Use turn anticipation metrics to advance LNAV guidance before leg transitions.`
- Leave remaining P2 bullets for RFMS route edits, N1 autothrottle, and RFMS FMA lifecycle integration.
- Keep acceptance tests wording honest: active waypoint advances at capture, passed-waypoint, or bounded turn-anticipation gates.

**Step 2: Update architecture docs**

In `docs/architecture.md`, update the navigation/guidance section to state:
- route status validates geometry;
- computes cross-track/along-track/desired-track/turn metrics;
- sequences legs on capture, passed-waypoint geometry, or bounded turn-anticipation gate;
- AP LNAV consumes store-owned/route-status active leg and does not fall back to invalid routes.

**Step 3: Update plan index and status**

In `docs/plans/README.md`, add this plan as a current/completed status record after implementation.

In this plan, add a `## Status` section near the top after implementation:

```md
## Status

Completed in commits:
- `feat: anticipate lnav route turns`
- `test: prove lnav turn anticipation integration`
- `docs: document lnav turn anticipation`

Current behavior: `computeRouteStatus()` sequences route legs on capture radius, passed-waypoint geometry, or a bounded turn-anticipation gate. `advanceSimulationStep()` and AP LNAV consume the anticipated active leg through route status.
```

**Step 4: Search stale docs**

Run targeted searches:

```bash
# Use search_files, not grep, in Hermes parent if possible.
```

Search phrases:
- `Use turn anticipation metrics to advance LNAV guidance before leg transitions`
- `turn anticipation metrics` in roadmap/current docs
- `only when the aircraft passes the sequencing gate`

Historical plan snippets can remain if clearly historical; current roadmap/architecture/plan index must not contradict current behavior.

**Step 5: Verify and commit**

```bash
git diff --check
git add docs/roadmap.md docs/architecture.md docs/plans/README.md docs/plans/2026-05-27-rfs-lnav-turn-anticipation.md
git -c commit.gpgsign=false commit -m "docs: document lnav turn anticipation"
```

---

## Final verification

Run full local gates:

```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run check && npm run test:visual
```

Run final integration audit before push.

Push and verify deploy:

```bash
git push origin master
gh run list --repo Reedtrullz/ReedFS --branch master --limit 5 --json databaseId,headSha,status,conclusion,workflowName,createdAt,url
gh run watch <new-run-id> --repo Reedtrullz/ReedFS --exit-status
gh run list --repo Reedtrullz/ReedFS --branch master --limit 1 --json databaseId,headSha,status,conclusion,workflowName,url
curl -fsSI https://fly.reidar.tech/
git status --short
```

Do not report success until GitHub Actions status is `completed`, conclusion is `success`, and the live endpoint returns HTTP 200.
