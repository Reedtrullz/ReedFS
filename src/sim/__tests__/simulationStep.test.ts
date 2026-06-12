import { beforeEach, describe, expect, it } from 'vitest';
import type { FlightPlan } from '@shared/types/fmc';
import type { AutopilotState } from '@shared/autopilot/autopilotTypes';
import type { AutopilotCommands, ControlInputs } from '../types';
import { B737_800_SPEC, createInitialState } from '../types';
import { buildGuidanceState } from '../guidanceState';
import { KSEA_TUTORIAL_SCENARIO } from '../scenarios';
import { createNoRouteStatus } from '../systems/navigation';
import { resetAutopilotPID } from '../systems/autopilot';
import { advanceSimulationStep, composeControlsSlice } from '../simulationStep';

function tutorialControls(): ControlInputs {
  return {
    elevator: 0,
    aileron: 0,
    rudder: 0,
    throttle1: 0,
    throttle2: 0,
    flapLever: KSEA_TUTORIAL_SCENARIO.flapSetting,
    gearLever: 'DOWN',
    spoilers: 0,
    brake: 0,
  };
}

function turnAnticipationPlan(): FlightPlan {
  return {
    origin: 'ORIG',
    destination: 'DEST',
    flightNumber: 'TST124',
    route: 'ORIG MID DEST',
    waypoints: [
      { ident: 'ORIG', lat: 47.0, lon: -122.0, discontinuity: false },
      { ident: 'MID', lat: 47.2, lon: -122.0, discontinuity: false },
      { ident: 'DEST', lat: 47.2, lon: -121.8, discontinuity: false },
    ],
  };
}

function aircraftApproachingTurn(): ReturnType<typeof createInitialState> {
  const aircraft = createInitialState(B737_800_SPEC);
  aircraft.position.lat = 47.185;
  aircraft.position.lon = -122.0;
  aircraft.attitude.psi = 0;
  aircraft.velocity.u = 128.6;
  return aircraft;
}

function lnavAutopilotState(): AutopilotState {
  return {
    boeing: {
      courseL: 0,
      courseR: 0,
      speed: null,
      mach: null,
      heading: 0,
      altitude: 0,
      verticalSpeed: null,
      fdLeft: false,
      fdRight: false,
      autothrottleArm: false,
      n1: false,
      speedMode: false,
      lnav: true,
      vnav: false,
      lvlChg: false,
      hdgSel: false,
      vorLoc: false,
      app: false,
      altHold: true,
      vs: false,
      cmdA: true,
      cmdB: false,
      cwsA: false,
      cwsB: false,
    },
    airbus: {
      speed: null,
      speedManaged: false,
      heading: null,
      headingManaged: false,
      altitude: 0,
      altitudeManaged: false,
      verticalSpeed: null,
      fpa: null,
      fd1: false,
      fd2: false,
      athr: false,
      ap1: false,
      ap2: false,
      loc: false,
      appr: false,
      exped: false,
      hdgTrkMode: 'HDG_VS',
      metricAltitude: false,
      speedMachMode: 'SPD',
    },
    truth: {
      lateralActive: 'LNAV',
      verticalActive: 'ALT_HOLD',
      thrustActive: 'OFF',
      autopilotStatus: 'CMD_A',
      lastModeChangeTimestamps: { thrust: 0, lateral: 0, vertical: 0 },
    },
  };
}

function n1AutopilotState(): AutopilotState {
  const state = lnavAutopilotState();
  return {
    ...state,
    boeing: {
      ...state.boeing,
      autothrottleArm: true,
      n1: true,
      speedMode: false,
    },
    truth: {
      ...state.truth,
      thrustActive: 'N1',
      autopilotStatus: 'CMD_A',
    },
  };
}

beforeEach(() => resetAutopilotPID());

describe('advanceSimulationStep', () => {
  it('filters stale AP commands when backed AP modes are effectively unavailable', () => {
    const pilotInputs = tutorialControls();
    pilotInputs.elevator = 0.12;
    pilotInputs.aileron = -0.08;
    pilotInputs.throttle1 = 0.21;
    pilotInputs.throttle2 = 0.23;
    const apState = lnavAutopilotState();
    apState.truth.lateralActive = 'HDG_SEL';
    apState.truth.verticalActive = 'ALT_HOLD';
    apState.truth.thrustActive = 'SPEED';
    apState.truth.autopilotStatus = 'CMD_A';
    apState.boeing.cmdA = true;
    apState.boeing.hdgSel = false;
    apState.boeing.altHold = false;
    apState.boeing.autothrottleArm = true;
    apState.boeing.speedMode = false;
    const apCommands: AutopilotCommands = {
      elevator: -0.7,
      aileron: 0.6,
      throttle1: 0.9,
      throttle2: 0.85,
    };

    const controls = composeControlsSlice(pilotInputs, apCommands, apState, {
      routeStatus: createNoRouteStatus(),
    });

    expect(controls.apCommands).toEqual({});
    expect(controls.effectiveControls).toEqual(expect.objectContaining({
      elevator: 0.12,
      aileron: -0.08,
      throttle1: 0.21,
      throttle2: 0.23,
    }));
    expect(controls.effectiveControls.elevator).toBe(controls.pilotInputs.elevator);
    expect(controls.effectiveControls.aileron).toBe(controls.pilotInputs.aileron);
    expect(controls.effectiveControls.throttle1).toBe(controls.pilotInputs.throttle1);
    expect(controls.effectiveControls.throttle2).toBe(controls.pilotInputs.throttle2);
    expect(controls.inputs).toBe(controls.effectiveControls);
  });

  it('does not mutate the input aircraft snapshot', () => {
    const aircraft = createInitialState(B737_800_SPEC);
    const pilotInputs = tutorialControls();
    const guidance = buildGuidanceState({
      scenario: KSEA_TUTORIAL_SCENARIO,
      status: 'running',
      aircraft,
      controls: pilotInputs,
    });
    const before = structuredClone(aircraft);

    const result = advanceSimulationStep({
      aircraft,
      spec: B737_800_SPEC,
      pilotInputs,
      apState: null,
      flightPlan: null,
      activeLegIndex: null,
      routeStatus: createNoRouteStatus(),
      wind: null,
      dt: 1 / 60,
      status: 'running',
      selectedScenarioId: KSEA_TUTORIAL_SCENARIO.id,
      guidance,
    });

    expect(aircraft).toEqual(before);
    expect(result.aircraft).not.toBe(aircraft);
    expect(result.routeStatus).toEqual(createNoRouteStatus());
    expect(result.activeLegIndex).toBeNull();
    expect(result.controls.inputs).toBe(result.controls.effectiveControls);
  });

  it('stores anticipated route feedback before overflying the turn waypoint without AP', () => {
    const aircraft = aircraftApproachingTurn();
    const pilotInputs = tutorialControls();
    const flightPlan = turnAnticipationPlan();
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
      routeStatus: createNoRouteStatus(),
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

  it('uses the anticipated active leg for engaged LNAV AP commands before integration', () => {
    const aircraft = aircraftApproachingTurn();
    aircraft.attitude.psi = 0;
    const pilotInputs = tutorialControls();
    const flightPlan = turnAnticipationPlan();
    const apState = lnavAutopilotState();
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
      routeStatus: createNoRouteStatus(),
      wind: null,
      dt: 1 / 60,
      status: 'running',
      selectedScenarioId: KSEA_TUTORIAL_SCENARIO.id,
      guidance,
    });

    expect(result.apCommands.aileron).toBeGreaterThan(0);
    expect(result.activeLegIndex).toBe(1);
  });

  it('feeds N1 autothrottle commands into effective controls before engine integration', () => {
    const aircraft = createInitialState(B737_800_SPEC);
    aircraft.flightPhase = 'TAKEOFF';
    aircraft.engines[0].n1 = 0;
    aircraft.engines[1].n1 = 0;
    const pilotInputs = tutorialControls();
    const apState = n1AutopilotState();
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
      flightPlan: null,
      activeLegIndex: null,
      routeStatus: createNoRouteStatus(),
      wind: null,
      dt: 1 / 60,
      status: 'running',
      selectedScenarioId: KSEA_TUTORIAL_SCENARIO.id,
      guidance,
    });

    expect(result.apCommands.throttle1).toBeGreaterThan(0);
    expect(result.controls.effectiveControls.throttle1).toBe(result.apCommands.throttle1);
    expect(result.controls.pilotInputs.throttle1).toBe(0);
    expect(result.controls.inputs).toBe(result.controls.effectiveControls);
    expect(result.aircraft.engines[0].n1).toBeGreaterThan(0);
  });
});
