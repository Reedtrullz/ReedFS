import { beforeEach, describe, expect, it } from 'vitest';
import type { FlightPlan } from '@shared/types/fmc';
import type { AutopilotState } from '@shared/autopilot/autopilotTypes';
import type { AutopilotCommands, ControlInputs } from '../types';
import { B737_800_SPEC, createInitialState } from '../types';
import { buildGuidanceState } from '../guidanceState';
import { KSEA_TUTORIAL_SCENARIO } from '../scenarios';
import { computeRouteStatus, createNoRouteStatus } from '../systems/navigation';
import { resetAutopilotPID } from '../systems/autopilot';
import { eulerToQuat } from '../physics/quaternion';
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

function finalLegCompletionPlan(): FlightPlan {
  return {
    origin: 'ORIG',
    destination: 'DEST',
    flightNumber: 'TST125',
    route: 'ORIG DEST',
    waypoints: [
      { ident: 'ORIG', lat: 47.0, lon: -122.0, discontinuity: false },
      { ident: 'DEST', lat: 47.02, lon: -122.0, discontinuity: false },
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

function speedAutothrottleOnlyState(): AutopilotState {
  const state = lnavAutopilotState();
  return {
    ...state,
    boeing: {
      ...state.boeing,
      speed: 240,
      autothrottleArm: true,
      speedMode: true,
      n1: false,
      lnav: false,
      hdgSel: false,
      altHold: false,
      cmdA: false,
    },
    truth: {
      ...state.truth,
      lateralActive: 'OFF',
      verticalActive: 'OFF',
      thrustActive: 'SPEED',
      autopilotStatus: 'OFF',
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

  it('lets A/T-only SPEED own throttles while pilot pitch and roll remain effective', () => {
    const pilotInputs = { ...tutorialControls(), elevator: 0.18, aileron: -0.12, throttle1: 0.2, throttle2: 0.2 };
    const apState = speedAutothrottleOnlyState();
    const apCommands: AutopilotCommands = {
      elevator: -0.7,
      aileron: 0.6,
      throttle1: 0.64,
      throttle2: 0.64,
    };

    const controls = composeControlsSlice(pilotInputs, apCommands, apState, {
      routeStatus: createNoRouteStatus(),
    });

    expect(controls.apCommands.elevator).toBeUndefined();
    expect(controls.apCommands.aileron).toBeUndefined();
    expect(controls.apCommands.throttle1).toBe(0.64);
    expect(controls.apCommands.throttle2).toBe(0.64);
    expect(controls.effectiveControls.elevator).toBe(pilotInputs.elevator);
    expect(controls.effectiveControls.aileron).toBe(pilotInputs.aileron);
    expect(controls.effectiveControls.throttle1).toBe(0.64);
    expect(controls.effectiveControls.throttle2).toBe(0.64);
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

  it('clears LNAV lateral command ownership in the same tick that completes the final route leg', () => {
    const aircraft = createInitialState(B737_800_SPEC);
    aircraft.position = { lat: 47.010, lon: -122.0, alt: 5_000 };
    aircraft.velocity = { u: 300, v: 0, w: 0 };
    aircraft.attitude = { phi: 0, theta: 0, psi: 0.1 };
    aircraft.quaternion = eulerToQuat(aircraft.attitude.phi, aircraft.attitude.theta, aircraft.attitude.psi);
    aircraft.config.gearDown = false;
    aircraft.ground = {
      ...aircraft.ground,
      weightOnWheels: false,
      aglFt: 4_500,
      contact: 'none',
      onRunway: false,
    };
    aircraft.flightPhase = 'CRUISE';
    const pilotInputs = { ...tutorialControls(), aileron: 0.25, flapLever: 0, gearLever: 'UP' as const };
    const flightPlan = finalLegCompletionPlan();
    const apState = lnavAutopilotState();
    apState.truth.verticalActive = 'OFF';
    apState.boeing.altHold = false;
    const routeBeforeTick = computeRouteStatus(aircraft, flightPlan, 0);
    const guidance = buildGuidanceState({
      scenario: KSEA_TUTORIAL_SCENARIO,
      status: 'running',
      aircraft,
      controls: pilotInputs,
    });

    expect(routeBeforeTick.lnavAvailable).toBe(true);
    expect(routeBeforeTick.routeComplete).toBe(false);

    const result = advanceSimulationStep({
      aircraft,
      spec: B737_800_SPEC,
      pilotInputs,
      apState,
      flightPlan,
      activeLegIndex: 0,
      routeStatus: routeBeforeTick,
      wind: null,
      dt: 1,
      status: 'running',
      selectedScenarioId: KSEA_TUTORIAL_SCENARIO.id,
      guidance,
    });

    expect(result.routeStatus.routeComplete).toBe(true);
    expect(result.routeStatus.lnavAvailable).toBe(false);
    expect(result.apCommands.aileron).toBeUndefined();
    expect(result.controls.apCommands.aileron).toBeUndefined();
    expect(result.controls.effectiveControls.aileron).toBe(pilotInputs.aileron);
  });

  it('feeds SPEED autothrottle-only commands into integration without overriding pilot pitch or roll', () => {
    const aircraft = createInitialState(B737_800_SPEC);
    aircraft.flightPhase = 'CRUISE';
    aircraft.ground = { ...aircraft.ground, weightOnWheels: false, contact: 'none', onRunway: false, aglFt: 5000 };
    aircraft.velocity.u = 80;
    aircraft.engines[0].n1 = 0;
    aircraft.engines[1].n1 = 0;
    const pilotInputs = { ...tutorialControls(), elevator: 0.16, aileron: -0.09, throttle1: 0, throttle2: 0, flapLever: 0, gearLever: 'UP' as const };
    const apState = speedAutothrottleOnlyState();
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

    expect(result.apCommands.elevator).toBeUndefined();
    expect(result.apCommands.aileron).toBeUndefined();
    expect(result.apCommands.throttle1).toBeGreaterThan(pilotInputs.throttle1);
    expect(result.apCommands.throttle2).toBe(result.apCommands.throttle1);
    expect(result.controls.effectiveControls.elevator).toBe(pilotInputs.elevator);
    expect(result.controls.effectiveControls.aileron).toBe(pilotInputs.aileron);
    expect(result.controls.effectiveControls.throttle1).toBe(result.apCommands.throttle1);
    expect(result.aircraft.engines[0].n1).toBeGreaterThan(0);
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
