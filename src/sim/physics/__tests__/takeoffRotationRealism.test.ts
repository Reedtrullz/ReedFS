import { describe, expect, it } from 'vitest';
import { buildGuidanceState } from '../../guidanceState';
import { createAircraftStateForScenario, KSEA_TUTORIAL_SCENARIO } from '../../scenarios';
import { B737_800_SPEC, type ControlInputs } from '../../types';
import { eulerToQuat } from '../quaternion';

const KT_TO_MS = 1 / 1.94384449;
const DEG_TO_RAD = Math.PI / 180;

const configuredNeutralInputs: ControlInputs = {
  elevator: 0,
  aileron: 0,
  rudder: 0,
  throttle1: 1,
  throttle2: 1,
  flapLever: KSEA_TUTORIAL_SCENARIO.flapSetting,
  gearLever: 'DOWN',
  spoilers: 0,
  brake: 0,
};

function kseaTakeoffStateAtDogfoodSample() {
  const aircraft = createAircraftStateForScenario(B737_800_SPEC, KSEA_TUTORIAL_SCENARIO);
  aircraft.flightPhase = 'TAKEOFF';
  aircraft.velocity.u = 89 * KT_TO_MS;
  aircraft.attitude.theta = 6.7 * DEG_TO_RAD;
  aircraft.quaternion = eulerToQuat(aircraft.attitude.phi, aircraft.attitude.theta, aircraft.attitude.psi);
  aircraft.ground.weightOnWheels = true;
  aircraft.ground.aglFt = 0;
  aircraft.ground.contact = 'gear';
  aircraft.config.gearDown = true;
  return aircraft;
}

describe('takeoff rotation realism', () => {
  it('keeps the dogfood 89 kt / 6.7° pitch sample in takeoff-roll when elevator is neutral', () => {
    // Regression for the 2026-06-13 dogfood sample only: this is a guard against
    // pitch-alone rotation guidance, not a certified B737-800 calibration claim.
    const guidance = buildGuidanceState({
      scenario: KSEA_TUTORIAL_SCENARIO,
      status: 'running',
      aircraft: kseaTakeoffStateAtDogfoodSample(),
      controls: configuredNeutralInputs,
    });

    expect(guidance.phase).toBe('takeoff-roll');
    expect(guidance.activeTutorialStep?.id).toBe('advance-thrust');
  });
});
