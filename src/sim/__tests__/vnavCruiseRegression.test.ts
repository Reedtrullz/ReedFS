import { describe, expect, it } from 'vitest';
import { B737_800_SPEC } from '../types';
import { buildGuidanceState } from '../guidanceState';
import { createRunwayToRunwayFlightWithRunways } from '../flightPlanLoader';
import { createAircraftStateForScenario, KSEA_TUTORIAL_SCENARIO } from '../scenarios';
import { computeRouteStatus } from '../systems/navigation';
import { createAutopilotControllerState } from '../systems/autopilot';
import { deriveEffectiveAutoflightTruth } from '../systems/effectiveAutoflightTruth';
import { advanceSimulationStep } from '../simulationStep';
import { createDefaultAutopilotStateFromAircraft } from '../../instruments/defaultAutopilotState';

describe('VNAV cruise regression', () => {
  it('holds cruise altitude between the enroute constraint and TOD', () => {
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

    let ias = 0;
    let simSeconds = 0;
    while (ias < 145 && simSeconds < 90) {
      step(0, 1);
      simSeconds += 1 / 60;
      ias = Math.hypot(aircraft.velocity.u, aircraft.velocity.v) * 1.944;
    }
    while (simSeconds < 240 && aircraft.position.alt < 3_000) {
      const pull = aircraft.attitude.theta * 180 / Math.PI < 10 ? -0.45 : -0.15;
      step(pull, 1);
      simSeconds += 1 / 60;
    }
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

    const log: string[] = [];
    let sawAltHold = false;
    let sawVnavPthLeg2 = false;
    for (let frame = 0; frame < 60 * 1800; frame += 1) {
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

      if (frame % 60 === 0) {
        const truth = deriveEffectiveAutoflightTruth(ap, { aircraft, flightPlan, routeStatus: rs });
        sawAltHold = sawAltHold || truth.verticalActive === 'ALT_HOLD';
        sawVnavPthLeg2 = sawVnavPthLeg2 || (truth.verticalActive === 'VNAV_PTH' && activeLegIndex === 2);
        const iasKt = Math.hypot(aircraft.velocity.u, aircraft.velocity.v) * 1.944;
        const vsFpm = aircraft.velocity.w * -196.85;
        log.push(
          't=' + (frame / 60).toFixed(0) + 's alt=' + aircraft.position.alt.toFixed(0) + ' ias=' + iasKt.toFixed(0) + ' vs=' + vsFpm.toFixed(0)
          + ' leg=' + activeLegIndex + ' fma=' + truth.verticalActive + ' armed=' + (truth.verticalArmed ?? '-')
          + ' phase=' + aircraft.flightPhase + ' wow=' + aircraft.ground.weightOnWheels
          + ' thr1=' + (result.controls.effectiveControls.throttle1?.toFixed(2) ?? '-')
          + ' n1=' + aircraft.engines[0].n1.toFixed(0)
        );
        if (sawAltHold && sawVnavPthLeg2) break;
      }
    }
    expect(log.join('\n')).toContain('fma=ALT_HOLD');
    expect(log.join('\n')).toMatch(/leg=2 fma=VNAV_PTH/);
  }, 30_000);
});
