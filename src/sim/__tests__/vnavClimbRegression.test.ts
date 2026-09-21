import { describe, expect, it } from 'vitest';
import { B737_800_SPEC } from '../types';
import { buildGuidanceState } from '../guidanceState';
import { createRunwayToRunwayFlightWithRunways } from '../flightPlanLoader';
import { createAircraftStateForScenario, KSEA_TUTORIAL_SCENARIO } from '../scenarios';
import { computeRouteStatus } from '../systems/navigation';
import { createAutopilotControllerState } from '../systems/autopilot';
import { advanceSimulationStep } from '../simulationStep';
import { createDefaultAutopilotStateFromAircraft } from '../../instruments/defaultAutopilotState';

describe('VNAV climb regression', () => {
  it('KSEA KPDX VNAV engages during initial climb and climbs to the enroute constraint', () => {
    const aircraft = createAircraftStateForScenario(B737_800_SPEC, KSEA_TUTORIAL_SCENARIO);
    let guidance = buildGuidanceState({
      scenario: KSEA_TUTORIAL_SCENARIO,
      status: 'running',
      aircraft,
      controls: {
        elevator: 0, aileron: 0, rudder: 0, throttle1: 0, throttle2: 0,
        flapLever: 5, gearLever: 'DOWN', spoilers: 0, brake: 0,
      },
    });
    aircraft.flightPhase = 'TAKEOFF';

    let apControllerState = createAutopilotControllerState();
    let activeLegIndex: number | null = null;
    const flightPlan = createRunwayToRunwayFlightWithRunways({
      originAirport: 'KSEA', originRunway: '16L',
      destinationAirport: 'KPDX', destinationRunway: '10R',
    }).flightPlan;

    const mkInputs = (elevator: number, throttle: number) => ({
      elevator, aileron: 0, rudder: 0,
      throttle1: throttle, throttle2: throttle,
      flapLever: 5, gearLever: 'DOWN' as const, spoilers: 0, brake: 0,
    });

    const step = (elevator: number, throttle: number) => {
      const routeStatus = computeRouteStatus(aircraft, flightPlan, activeLegIndex);
      const result = advanceSimulationStep({
        aircraft,
        spec: B737_800_SPEC,
        pilotInputs: mkInputs(elevator, throttle),
        apState: null,
        flightPlan,
        activeLegIndex,
        routeStatus,
        wind: null,
        dt: 1 / 60,
        status: 'running',
        selectedScenarioId: KSEA_TUTORIAL_SCENARIO.id,
        guidance,
        apControllerState,
        cloneAircraft: false,
      });
      activeLegIndex = result.activeLegIndex;
      apControllerState = result.apControllerState;
      return result;
    };

    // Roll to V_R
    let ias = 0;
    let simSeconds = 0;
    while (ias < 145 && simSeconds < 90) {
      step(0, 1);
      simSeconds += 1 / 60;
      ias = Math.hypot(aircraft.velocity.u, aircraft.velocity.v) * 1.944;
    }
    expect(ias).toBeGreaterThanOrEqual(145);

    // Rotate and climb manually to a realistic VNAV engage altitude
    while (simSeconds < 240 && aircraft.position.alt < 3_000) {
      const pull = aircraft.attitude.theta * 180 / Math.PI < 10 ? -0.45 : -0.15;
      step(pull, 1);
      simSeconds += 1 / 60;
    }
    expect(aircraft.position.alt).toBeGreaterThanOrEqual(3_000);

    // Clean up: gear up, flaps 0
    const cleanupInputs = {
      elevator: 0, aileron: 0, rudder: 0,
      throttle1: 1, throttle2: 1,
      flapLever: 0, gearLever: 'UP' as const, spoilers: 0, brake: 0,
    };
    const routeStatus = computeRouteStatus(aircraft, flightPlan, activeLegIndex);
    const cleanupResult = advanceSimulationStep({
      aircraft, spec: B737_800_SPEC, pilotInputs: cleanupInputs,
      apState: null, flightPlan, activeLegIndex, routeStatus,
      wind: null, dt: 1 / 60, status: 'running',
      selectedScenarioId: KSEA_TUTORIAL_SCENARIO.id,
      guidance, apControllerState, cloneAircraft: false,
    });
    activeLegIndex = cleanupResult.activeLegIndex;
    apControllerState = cleanupResult.apControllerState;

    // Engage AP: CMD_A, LNAV, SPEED 250, VNAV
    const ap = createDefaultAutopilotStateFromAircraft(aircraft);
    ap.boeing.speed = 250;
    ap.boeing.altitude = 15000;
    ap.truth.autopilotStatus = 'CMD_A';
    ap.boeing.cmdA = true;
    ap.truth.thrustActive = 'SPEED';
    ap.boeing.speedMode = true;
    ap.truth.lateralActive = 'LNAV';
    ap.boeing.lnav = true;
    ap.truth.verticalActive = 'VNAV';
    ap.boeing.vnav = true;

    // Climb with AP for 300 simulated seconds, log every 10s
    const log: string[] = [];
    let lastLoggedAlt = aircraft.position.alt;
    for (let frame = 0; frame < 60 * 600; frame += 1) {
      const rs = computeRouteStatus(aircraft, flightPlan, activeLegIndex);
      const result = advanceSimulationStep({
        aircraft, spec: B737_800_SPEC,
        pilotInputs: { elevator: 0, aileron: 0, rudder: 0, throttle1: 1, throttle2: 1, flapLever: 0, gearLever: 'UP', spoilers: 0, brake: 0 },
        apState: ap, flightPlan, activeLegIndex, routeStatus: rs,
        wind: null, dt: 1 / 60, status: 'running',
        selectedScenarioId: KSEA_TUTORIAL_SCENARIO.id,
        guidance, apControllerState, cloneAircraft: false,
      });
      activeLegIndex = result.activeLegIndex;
      apControllerState = result.apControllerState;
      guidance = result.guidance;

      const iasKt = Math.hypot(aircraft.velocity.u, aircraft.velocity.v) * 1.944;
      const vsFpm = ((aircraft.position.alt - lastLoggedAlt) / (1 / 60)) * 60;
      lastLoggedAlt = aircraft.position.alt;
      if (frame % 60 === 0 && frame < 60 * 25) {
        const truth = result.controls.effectiveControls;
        log.push(
          `t=${(frame / 60).toFixed(0)}s alt=${aircraft.position.alt.toFixed(0)} ias=${iasKt.toFixed(0)} vs=${vsFpm.toFixed(0)} `
          + `leg=${activeLegIndex} phase=${aircraft.flightPhase} wow=${aircraft.ground.weightOnWheels}`
          + ` pitch=${(aircraft.attitude.theta * 180 / Math.PI).toFixed(1)} throttle=${truth.throttle1?.toFixed(2) ?? '-'}`,
        );
      }
    }
    expect(log.join('\n')).toMatch(/t=24s/);
    expect(aircraft.position.alt).toBeGreaterThanOrEqual(11_000);
  });
});
