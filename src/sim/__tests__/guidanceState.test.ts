import { describe, expect, it } from 'vitest';
import { KSEA_TUTORIAL_SCENARIO, createAircraftStateForScenario } from '../scenarios';
import { B737_800_SPEC, type ControlInputs } from '../types';
import { buildGuidanceState } from '../guidanceState';

const configuredInputs: ControlInputs = {
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

function scenarioAircraft() {
  return createAircraftStateForScenario(B737_800_SPEC, KSEA_TUTORIAL_SCENARIO);
}

describe('guidanceState', () => {
  it('derives tutorial, active step, checklist, coach, alerts, and preflight phase in one pure state', () => {
    const aircraft = scenarioAircraft();

    const guidance = buildGuidanceState({
      scenario: KSEA_TUTORIAL_SCENARIO,
      status: 'stopped',
      aircraft,
      controls: configuredInputs,
    });

    expect(guidance.scenarioId).toBe(KSEA_TUTORIAL_SCENARIO.id);
    expect(guidance.phase).toBe('preflight');
    expect(guidance.tutorial.scenarioId).toBe(KSEA_TUTORIAL_SCENARIO.id);
    expect(guidance.tutorial.stepIndex).toBe(0);
    expect(guidance.activeTutorialStep?.id).toBe('line-up');
    expect(guidance.checklist.map((item) => item.label)).toEqual(expect.arrayContaining([
      'Flaps set for takeoff',
      'Gear down',
      'Stabilizer trim set',
      'Speedbrakes retracted',
    ]));
    expect(guidance.checklist.every((item) => item.complete)).toBe(true);
    expect(guidance.coachMessage).toMatch(/start roll/i);
    expect(guidance.alerts).toEqual([]);
  });

  it('clamps requested tutorial steps and exposes the clamped active step', () => {
    const aircraft = scenarioAircraft();

    const high = buildGuidanceState({
      scenario: KSEA_TUTORIAL_SCENARIO,
      status: 'stopped',
      aircraft,
      controls: configuredInputs,
      tutorialStepIndex: 99,
    });

    expect(high.tutorial.stepIndex).toBe(KSEA_TUTORIAL_SCENARIO.tutorialSteps.length - 1);
    expect(high.activeTutorialStep?.id).toBe('rotate-positive-rate');

    const low = buildGuidanceState({
      scenario: KSEA_TUTORIAL_SCENARIO,
      status: 'stopped',
      aircraft,
      controls: configuredInputs,
      tutorialStepIndex: -10,
    });

    expect(low.tutorial.stepIndex).toBe(0);
    expect(low.activeTutorialStep?.id).toBe('line-up');
  });

  it('derives the takeoff guidance phase from aircraft and control state', () => {
    const rollingAircraft = scenarioAircraft();
    rollingAircraft.flightPhase = 'TAKEOFF';
    const takeoffControls = { ...configuredInputs, throttle1: 1, throttle2: 1 };

    expect(buildGuidanceState({
      scenario: KSEA_TUTORIAL_SCENARIO,
      status: 'running',
      aircraft: rollingAircraft,
      controls: takeoffControls,
    }).phase).toBe('takeoff-roll');

    const rejectedAircraft = structuredClone(rollingAircraft);
    rejectedAircraft.velocity.u = 45;
    const rejected = buildGuidanceState({
      scenario: KSEA_TUTORIAL_SCENARIO,
      status: 'running',
      aircraft: rejectedAircraft,
      controls: { ...configuredInputs, throttle1: 0, throttle2: 0, brake: 1, spoilers: 1 },
    });
    expect(rejected.phase).toBe('rejected-takeoff');
    expect(rejected.coachMessage).toMatch(/rejected takeoff|hold brakes|RESET/i);

    const rejectedStopped = structuredClone(rejectedAircraft);
    rejectedStopped.velocity.u = 0;
    expect(buildGuidanceState({
      scenario: KSEA_TUTORIAL_SCENARIO,
      status: 'running',
      aircraft: rejectedStopped,
      controls: { ...configuredInputs, throttle1: 0, throttle2: 0, brake: 1, spoilers: 1 },
    }).phase).toBe('rejected-takeoff');

    const rotatingAircraft = structuredClone(rollingAircraft);
    rotatingAircraft.velocity.u = 75;
    expect(buildGuidanceState({
      scenario: KSEA_TUTORIAL_SCENARIO,
      status: 'running',
      aircraft: rotatingAircraft,
      controls: takeoffControls,
    }).phase).toBe('rotation');

    const airborneGearDown = structuredClone(rotatingAircraft);
    airborneGearDown.ground.weightOnWheels = false;
    airborneGearDown.ground.aglFt = 25;
    airborneGearDown.position.alt += 25;
    expect(buildGuidanceState({
      scenario: KSEA_TUTORIAL_SCENARIO,
      status: 'running',
      aircraft: airborneGearDown,
      controls: takeoffControls,
    }).phase).toBe('positive-rate');

    const cleanClimb = structuredClone(airborneGearDown);
    cleanClimb.config.gearDown = false;
    expect(buildGuidanceState({
      scenario: KSEA_TUTORIAL_SCENARIO,
      status: 'running',
      aircraft: cleanClimb,
      controls: { ...takeoffControls, gearLever: 'UP' },
    }).phase).toBe('climb');
  });

  it('shows positive-rate cleanup instead of pre-takeoff gear-down checklist once airborne', () => {
    const aircraft = scenarioAircraft();
    aircraft.flightPhase = 'CLIMB';
    aircraft.ground.weightOnWheels = false;
    aircraft.ground.aglFt = 75;
    aircraft.position.alt += 75;
    aircraft.config.gearDown = true;

    const guidance = buildGuidanceState({
      scenario: KSEA_TUTORIAL_SCENARIO,
      status: 'running',
      aircraft,
      controls: { ...configuredInputs, throttle1: 1, throttle2: 1, gearLever: 'DOWN' },
    });

    expect(guidance.phase).toBe('positive-rate');
    expect(guidance.checklist.map((item) => item.label)).toContain('Gear up after positive rate');
    expect(guidance.checklist.map((item) => item.label)).not.toContain('Gear down');
  });

  it('shows climb cleanup complete after gear retraction', () => {
    const aircraft = scenarioAircraft();
    aircraft.flightPhase = 'CLIMB';
    aircraft.ground.weightOnWheels = false;
    aircraft.ground.aglFt = 400;
    aircraft.position.alt += 400;
    aircraft.config.gearDown = false;

    const guidance = buildGuidanceState({
      scenario: KSEA_TUTORIAL_SCENARIO,
      status: 'running',
      aircraft,
      controls: { ...configuredInputs, throttle1: 1, throttle2: 1, gearLever: 'UP' },
    });

    expect(guidance.phase).toBe('climb');
    expect(guidance.checklist).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'gear-up', label: 'Gear up', complete: true }),
      expect.objectContaining({ id: 'positive-rate', label: 'Positive rate established', complete: true }),
    ]));
    expect(guidance.checklist.map((item) => item.label)).not.toContain('Gear down');
  });
});
