import { describe, expect, it } from 'vitest';
import { advanceSimulationStep } from '../../simulationStep';
import { createAutopilotControllerState } from '../autopilot';
import { B737_800_SPEC, createInitialState } from '../../types';
import type { AircraftState } from '../../types';
import type { AutopilotState } from '@shared/autopilot/autopilotTypes';
import { eulerToQuat } from '../../physics/quaternion';
import { bodyToNed } from '../../physics/frames';
import { createNoRouteStatus } from '../../systems/navigation';
import { buildGuidanceState } from '../../guidanceState';
import { KSEA_TUTORIAL_SCENARIO } from '../../scenarios';

const DT = 1 / 60;
const SIM_SECONDS = 60;
const FPM_PER_MS = 196.850394;

function makeAp(): AutopilotState {
  return {
    boeing: { courseL:0,courseR:0,speed:null,mach:null,heading:0,altitude:0,verticalSpeed:null,
      fdLeft:false,fdRight:false,autothrottleArm:false,
      n1:false,speedMode:false,lnav:false,vnav:false,lvlChg:false,hdgSel:false,vorLoc:false,app:false,altHold:false,vs:false,
      cmdA:true,cmdB:false,cwsA:false,cwsB:false },
    airbus: { speed:null,speedManaged:false,heading:null,headingManaged:false,altitude:0,altitudeManaged:false,
      verticalSpeed:null,fpa:null,fd1:false,fd2:false,athr:false,ap1:false,ap2:false,
      loc:false,appr:false,exped:false,hdgTrkMode:'HDG_VS',metricAltitude:false,speedMachMode:'SPD' },
    truth: {
      lateralActive: 'LNAV', verticalActive: 'VS', thrustActive: 'SPEED',
      autopilotStatus: 'CMD_A',
      lastModeChangeTimestamps: { thrust:0, lateral:0, vertical:0 },
    },
  };
}

function airborneLevelState(): AircraftState {
  const s = createInitialState(B737_800_SPEC);
  s.position.alt = 5000;
  s.velocity = { u: 128.6, v: 0, w: 0 };
  s.attitude = { phi: 0, theta: 0, psi: 0 };
  s.quaternion = eulerToQuat(0, 0, 0);
  s.config.flapSetting = 0;
  s.config.gearDown = false;
  s.config.gearPosition = 0;
  s.config.stabilizerTrimUnits = 5.0;
  s.ground = {
    aglFt: 5000,
    groundAltFt: 0,
    weightOnWheels: false,
    normalForceN: 0,
    lastTouchdownSinkRateMps: 0,
    onRunway: false,
    contact: 'none',
    tailstrike: false,
    gearStations: [],
  };
  for (const engine of s.engines) {
    engine.running = true;
    engine.n1 = 40;
    engine.n2 = 60;
    engine.thrust = 20000;
  }
  return s;
}

function currentVsFpm(s: AircraftState): number {
  return -bodyToNed(s.velocity, s.attitude).down * FPM_PER_MS;
}

describe('selected VS descent tracking (route descent regression)', () => {
  it('produces actual descent through advanceSimulationStep when VS -900 is engaged from level flight with nose-up trim', () => {
    const ap = makeAp();
    ap.boeing.lnav = true;
    ap.boeing.vs = true;
    ap.boeing.speedMode = true;
    ap.boeing.autothrottleArm = true;
    ap.boeing.verticalSpeed = -900;
    ap.boeing.speed = 250;
    ap.boeing.altitude = 15500;

    let aircraft = airborneLevelState();
    let controller = createAutopilotControllerState();
    let guidance = buildGuidanceState({
      scenario: KSEA_TUTORIAL_SCENARIO,
      status: 'running',
      aircraft,
      controls: {
        elevator: 0, aileron: 0, rudder: 0,
        throttle1: 0, throttle2: 0,
        flapLever: 0, gearLever: 'UP', spoilers: 0, brake: 0,
      },
    });
    const vsSamples: number[] = [];

    for (let step = 0; step < SIM_SECONDS * 60; step += 1) {
      const result = advanceSimulationStep({
        aircraft,
        spec: B737_800_SPEC,
        pilotInputs: {
          elevator: 0, aileron: 0, rudder: 0,
          throttle1: 0, throttle2: 0,
          flapLever: 0, gearLever: 'UP', spoilers: 0, brake: 0,
        },
        apState: ap,
        apControllerState: controller,
        flightPlan: null,
        activeLegIndex: null,
        routeStatus: createNoRouteStatus(),
        wind: null,
        dt: DT,
        status: 'running',
        selectedScenarioId: KSEA_TUTORIAL_SCENARIO.id,
        guidance,
      });
      aircraft = result.aircraft;
      controller = result.apControllerState;
      guidance = result.guidance;
      if (step % 120 === 0) vsSamples.push(Math.round(currentVsFpm(aircraft)));
    }

    expect(vsSamples.length).toBeGreaterThan(0);
    expect(vsSamples[vsSamples.length - 1]).toBeLessThanOrEqual(-800);
    expect(vsSamples.join(',')).toMatch(/^-\d+(,-\d+)*$/);
  });
});
