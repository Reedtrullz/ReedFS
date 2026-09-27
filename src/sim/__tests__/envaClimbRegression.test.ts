import { describe, expect, it } from 'vitest';
import { B737_800_SPEC } from '../types';
import { buildGuidanceState } from '../guidanceState';
import { createEnvaEngmFlight } from '../flightPlanLoader';
import { createAircraftStateForScenario, ENVA_TUTORIAL_SCENARIO } from '../scenarios';
import { computeRouteStatus } from '../systems/navigation';
import { createAutopilotControllerState } from '../systems/autopilot';
import { deriveEffectiveAutoflightTruth } from '../systems/effectiveAutoflightTruth';
import { advanceSimulationStep } from '../simulationStep';
import { createDefaultAutopilotStateFromAircraft } from '../../instruments/defaultAutopilotState';

describe('ENVA climb regression', () => {
  it('flies the LNAV/SPD/VS climb to the enroute descent leg without departing controlled flight', { timeout: 240_000 }, () => {
    const aircraft = createAircraftStateForScenario(B737_800_SPEC, ENVA_TUTORIAL_SCENARIO);
    const flightPlan = createEnvaEngmFlight();
    let guidance = buildGuidanceState({
      scenario: ENVA_TUTORIAL_SCENARIO,
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

    const mkInputs = (elevator: number, throttle: number, flapLever: number, gearLever: 'UP' | 'DOWN') => ({
      elevator, aileron: 0, rudder: 0,
      throttle1: throttle, throttle2: throttle,
      flapLever, gearLever, spoilers: 0, brake: 0,
    });

    const step = (elevator: number, throttle: number, flapLever: number, gearLever: 'UP' | 'DOWN', apState: Parameters<typeof advanceSimulationStep>[0]['apState'] = null) => {
      const routeStatus = computeRouteStatus(aircraft, flightPlan, activeLegIndex);
      const result = advanceSimulationStep({
        aircraft,
        spec: B737_800_SPEC,
        pilotInputs: mkInputs(elevator, throttle, flapLever, gearLever),
        apState,
        flightPlan,
        activeLegIndex,
        routeStatus,
        wind: null,
        dt: 1 / 60,
        status: 'running',
        selectedScenarioId: ENVA_TUTORIAL_SCENARIO.id,
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
      step(0, 1, 5, 'DOWN');
      simSeconds += 1 / 60;
      ias = Math.hypot(aircraft.velocity.u, aircraft.velocity.v) * 1.944;
    }
    while (simSeconds < 240 && aircraft.position.alt < 3_000) {
      const pull = aircraft.attitude.theta * 180 / Math.PI < 10 ? -0.45 : -0.15;
      step(pull, 1, 5, 'DOWN');
      simSeconds += 1 / 60;
    }
    step(0, 1, 0, 'UP');

    const ap = createDefaultAutopilotStateFromAircraft(aircraft);
    ap.boeing.speed = 210;
    // Mirror the e2e proof exactly: MCP 16000 keeps the VS climb running all
    // the way to the enroute descent leg, exercising high-altitude energy
    // management that the earlier 10000 ft harness never reached.
    ap.boeing.altitude = 16000;
    ap.boeing.verticalSpeed = 800;
    ap.truth.autopilotStatus = 'CMD_A';
    ap.boeing.cmdA = true;
    ap.truth.thrustActive = 'SPEED';
    ap.boeing.speedMode = true;
    ap.truth.lateralActive = 'LNAV';
    ap.boeing.lnav = true;
    ap.truth.verticalActive = 'VS';
    ap.boeing.vs = true;

    const log: string[] = [];
    let minIasAfterCleanup = 999;
    let lastLoggedAlt = aircraft.position.alt;
    for (let frame = 0; frame < 60 * 2400; frame += 1) {
      const rs = computeRouteStatus(aircraft, flightPlan, activeLegIndex);
      const result = advanceSimulationStep({
        aircraft, spec: B737_800_SPEC,
        pilotInputs: mkInputs(0, 1, 0, 'UP'),
        apState: ap, flightPlan, activeLegIndex, routeStatus: rs,
        wind: ENVA_TUTORIAL_SCENARIO.wind, dt: 1 / 60, status: 'running',
        selectedScenarioId: ENVA_TUTORIAL_SCENARIO.id,
        guidance, apControllerState, cloneAircraft: false,
      });
      activeLegIndex = result.activeLegIndex;
      apControllerState = result.apControllerState;
      guidance = result.guidance;

      const iasKt = Math.hypot(aircraft.velocity.u, aircraft.velocity.v) * 1.944;
      if (aircraft.ground.aglFt > 500) minIasAfterCleanup = Math.min(minIasAfterCleanup, iasKt);

      if (frame % 60 === 0) {
        const truth = deriveEffectiveAutoflightTruth(ap, { aircraft, flightPlan, routeStatus: rs });
        const vsFpm = (aircraft.position.alt - lastLoggedAlt) * 60;
        lastLoggedAlt = aircraft.position.alt;
        log.push(
          't=' + (frame / 60).toFixed(0) + 's alt=' + aircraft.position.alt.toFixed(0) + ' ias=' + iasKt.toFixed(0) + ' vs=' + vsFpm.toFixed(0)
          + ' leg=' + activeLegIndex + ' fma=' + truth.verticalActive
          + ' phase=' + aircraft.flightPhase + ' wow=' + aircraft.ground.weightOnWheels
          + ' pitch=' + (aircraft.attitude.theta * 180 / Math.PI).toFixed(1)
          + ' n1=' + aircraft.engines[0].n1.toFixed(0)
        );
      }
      // Mirror the e2e gate exactly: the descent setup begins while the VS
      // climb is still running below the MCP, not after a clean level-off.
      if ((activeLegIndex ?? 0) >= 2) break;
    }

    expect(log.join('\n')).toMatch(/leg=1 /);
    expect(minIasAfterCleanup).toBeGreaterThan(140);

    // Stage 2: mirror the e2e descent setup (ALT 2100 / SPD 190 / VS -900) and
    // verify VS altitude capture actually levels the aircraft before terrain.
    ap.boeing.altitude = 2100;
    ap.boeing.speed = 190;
    ap.boeing.verticalSpeed = -900;
    lastLoggedAlt = aircraft.position.alt;
    let minIasDescent = 999;
    let capturedAltHold = false;
    for (let frame = 0; frame < 60 * 1200; frame += 1) {
      const rs = computeRouteStatus(aircraft, flightPlan, activeLegIndex);
      const result = advanceSimulationStep({
        aircraft, spec: B737_800_SPEC,
        pilotInputs: mkInputs(0, 1, 0, 'UP'),
        apState: ap, flightPlan, activeLegIndex, routeStatus: rs,
        wind: null, dt: 1 / 60, status: 'running',
        selectedScenarioId: ENVA_TUTORIAL_SCENARIO.id,
        guidance, apControllerState, cloneAircraft: false,
      });
      activeLegIndex = result.activeLegIndex;
      apControllerState = result.apControllerState;
      guidance = result.guidance;

      const iasKt = Math.hypot(aircraft.velocity.u, aircraft.velocity.v) * 1.944;
      minIasDescent = Math.min(minIasDescent, iasKt);
      if (frame % 60 === 0) {
        const truth = deriveEffectiveAutoflightTruth(ap, { aircraft, flightPlan, routeStatus: rs });
        const vsFpm = (aircraft.position.alt - lastLoggedAlt) * 60;
        lastLoggedAlt = aircraft.position.alt;
        log.push(
          'D t=' + (frame / 60).toFixed(0) + 's alt=' + aircraft.position.alt.toFixed(0) + ' ias=' + iasKt.toFixed(0) + ' vs=' + vsFpm.toFixed(0)
          + ' leg=' + activeLegIndex + ' fma=' + truth.verticalActive
          + ' phase=' + aircraft.flightPhase + ' wow=' + aircraft.ground.weightOnWheels
          + ' pitch=' + (aircraft.attitude.theta * 180 / Math.PI).toFixed(1)
        );
      }
      const descentTruth = deriveEffectiveAutoflightTruth(ap, { aircraft, flightPlan, routeStatus: rs });
      if (descentTruth.verticalActive === 'ALT_HOLD') capturedAltHold = true;
      if (aircraft.ground.weightOnWheels || aircraft.ground.contact === 'crashed') break;
    }

    const descentLog = log.filter((line) => line.startsWith('D '));
    expect(capturedAltHold, [...descentLog.slice(0, 16), ...descentLog.slice(20, 60), ...descentLog.slice(-6)].join('\n')).toBe(true);
    expect(minIasDescent).toBeGreaterThan(140);

    // Stage 3: mirror the e2e overshoot profile (MCP 1000, only ~325 ft above
    // the ENGM 675 ft field). The capture taper must level off instead of
    // amplifying the dive into terrain, and the aircraft must stay controllable
    // while flying the remaining legs.
    ap.boeing.altitude = 1000;
    ap.boeing.speed = 190;
    ap.boeing.verticalSpeed = -900;
    lastLoggedAlt = aircraft.position.alt;
    let minIasStage3 = 999;
    let stage3Crashed = false;
    for (let poll = 0; poll < 60 * 1200 / 16; poll += 1) {
      for (let sub = 0; sub < 16; sub += 1) {
        const rs = computeRouteStatus(aircraft, flightPlan, activeLegIndex);
        const result = advanceSimulationStep({
          aircraft, spec: B737_800_SPEC,
          pilotInputs: mkInputs(0, 1, 0, 'UP'),
          apState: ap, flightPlan, activeLegIndex, routeStatus: rs,
          wind: ENVA_TUTORIAL_SCENARIO.wind, dt: 1 / 60, status: 'running',
          selectedScenarioId: ENVA_TUTORIAL_SCENARIO.id,
          guidance, apControllerState, cloneAircraft: false,
        });
        activeLegIndex = result.activeLegIndex;
        apControllerState = result.apControllerState;
        guidance = result.guidance;

        const iasKt = Math.hypot(aircraft.velocity.u, aircraft.velocity.v) * 1.944;
        minIasStage3 = Math.min(minIasStage3, iasKt);
        if (aircraft.ground.contact === 'crashed') stage3Crashed = true;
      }
      if (poll % 4 === 0) {
        const truth = deriveEffectiveAutoflightTruth(ap, { aircraft, flightPlan, routeStatus: computeRouteStatus(aircraft, flightPlan, activeLegIndex) });
        const vsFpm = (aircraft.position.alt - lastLoggedAlt) * 60;
        lastLoggedAlt = aircraft.position.alt;
        log.push(
          'S3 t=' + (poll * 16 / 60).toFixed(0) + 's alt=' + aircraft.position.alt.toFixed(0) + ' ias=' + (Math.hypot(aircraft.velocity.u, aircraft.velocity.v) * 1.944).toFixed(0) + ' vs=' + vsFpm.toFixed(0)
          + ' leg=' + activeLegIndex + ' fma=' + truth.verticalActive
          + ' phase=' + aircraft.flightPhase + ' wow=' + aircraft.ground.weightOnWheels
        );
      }
      if (stage3Crashed || (activeLegIndex ?? 0) >= 3) break;
    }

    const stage3Log = log.filter((line) => line.startsWith('S3 '));
    expect(stage3Crashed, stage3Log.join('\n')).toBe(false);
    expect(activeLegIndex ?? 0, stage3Log.join('\n')).toBeGreaterThanOrEqual(3);
    expect(minIasStage3).toBeGreaterThan(140);
  });
});
