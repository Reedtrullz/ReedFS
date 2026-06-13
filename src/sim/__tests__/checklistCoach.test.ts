import { describe, expect, it } from 'vitest';
import { KSEA_TUTORIAL_SCENARIO, createAircraftStateForScenario } from '../scenarios';
import { B737_800_SPEC, type ControlInputs } from '../types';
import { buildGuidanceChecklist, buildTakeoffChecklist, coachMessageForState } from '../checklistCoach';

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

function setFlightPhaseForTest(aircraft: ReturnType<typeof createAircraftStateForScenario>, phase: string) {
  aircraft.flightPhase = phase as typeof aircraft.flightPhase;
}

describe('checklistCoach', () => {
  it('marks runway setup items complete for a configured tutorial scenario', () => {
    const aircraft = createAircraftStateForScenario(B737_800_SPEC, KSEA_TUTORIAL_SCENARIO);
    const checklist = buildTakeoffChecklist(KSEA_TUTORIAL_SCENARIO, aircraft, configuredInputs);

    expect(checklist.map((item) => item.label)).toEqual(expect.arrayContaining([
      'Flaps set for takeoff',
      'Gear down',
      'Stabilizer trim set',
      'Speedbrakes retracted',
    ]));
    expect(checklist.filter((item) => item.complete)).toHaveLength(checklist.length);
  });

  it('coaches the next action from the current takeoff state', () => {
    const aircraft = createAircraftStateForScenario(B737_800_SPEC, KSEA_TUTORIAL_SCENARIO);

    expect(coachMessageForState('stopped', aircraft, configuredInputs, KSEA_TUTORIAL_SCENARIO)).toMatch(/start roll/i);
    expect(coachMessageForState('running', aircraft, { ...configuredInputs, throttle1: 0.35, throttle2: 0.35 }, KSEA_TUTORIAL_SCENARIO)).toMatch(/takeoff thrust/i);
  });

  it('treats START ROLL zeroed flaps and trim as pilot setup instructions before thrust', () => {
    const aircraft = createAircraftStateForScenario(B737_800_SPEC, KSEA_TUTORIAL_SCENARIO);
    aircraft.flightPhase = 'TAKEOFF';
    aircraft.config.flapSetting = 0;
    aircraft.config.stabilizerTrimUnits = 0;

    const message = coachMessageForState('running', aircraft, {
      ...configuredInputs,
      flapLever: 0,
      throttle1: 0,
      throttle2: 0,
    }, KSEA_TUTORIAL_SCENARIO);

    expect(message).toMatch(/set flaps 5/i);
    expect(message).toMatch(/trim 5\.0/i);
    expect(message).toMatch(/takeoff thrust/i);
  });

  it('coaches climb instead of re-running the before-takeoff gear check after cleanup', () => {
    const aircraft = createAircraftStateForScenario(B737_800_SPEC, KSEA_TUTORIAL_SCENARIO);
    aircraft.ground.weightOnWheels = false;
    aircraft.ground.aglFt = 80;
    aircraft.velocity.w = -1.5;
    aircraft.config.gearDown = false;

    expect(coachMessageForState('running', aircraft, { ...configuredInputs, throttle1: 1, throttle2: 1, gearLever: 'UP' }, KSEA_TUTORIAL_SCENARIO)).toMatch(/climb stable/i);
  });

  it('does not mark positive rate established in cleanup checklists while descending', () => {
    const aircraft = createAircraftStateForScenario(B737_800_SPEC, KSEA_TUTORIAL_SCENARIO);
    aircraft.ground.weightOnWheels = false;
    aircraft.ground.aglFt = 80;
    aircraft.velocity.w = 2;

    for (const phase of ['positive-rate', 'climb'] as const) {
      const checklist = buildGuidanceChecklist(KSEA_TUTORIAL_SCENARIO, aircraft, configuredInputs, phase);
      expect(checklist).toContainEqual(expect.objectContaining({
        id: 'positive-rate',
        label: 'Positive rate established',
        complete: false,
      }));
    }
  });

  it('does not coach gear retraction while airborne but descending', () => {
    const aircraft = createAircraftStateForScenario(B737_800_SPEC, KSEA_TUTORIAL_SCENARIO);
    aircraft.flightPhase = 'TAKEOFF';
    aircraft.ground.weightOnWheels = false;
    aircraft.ground.aglFt = 80;
    aircraft.velocity.w = 2;
    aircraft.config.gearDown = true;

    const message = coachMessageForState('running', aircraft, {
      ...configuredInputs,
      throttle1: 1,
      throttle2: 1,
      gearLever: 'DOWN',
    }, KSEA_TUTORIAL_SCENARIO);

    expect(message).not.toMatch(/positive rate: raise the gear/i);
    expect(message).toMatch(/rotate|climb/i);
  });

  it('coaches explicit landing phase machine without takeoff instructions', () => {
    const cases = [
      ['TOUCHDOWN', 'touchdown', /touchdown/i],
      ['DEROTATION', 'derotation', /derotation|lower the nose/i],
      ['ROLLOUT', 'landing-rollout', /rollout|brak/i],
      ['TAXI', 'taxi', /taxi/i],
      ['STOPPED', 'stopped', /stopped|reset/i],
    ] as const;

    for (const [flightPhase, checklistPhase, expectedMessage] of cases) {
      const aircraft = createAircraftStateForScenario(B737_800_SPEC, KSEA_TUTORIAL_SCENARIO);
      setFlightPhaseForTest(aircraft, flightPhase);
      aircraft.ground.weightOnWheels = true;
      aircraft.ground.contact = 'gear';
      aircraft.ground.aglFt = 0;
      aircraft.ground.lastTouchdownSinkRateMps = 1.2;
      aircraft.velocity.u = flightPhase === 'STOPPED' ? 0.4 : 18;

      const controls = { ...configuredInputs, throttle1: 0, throttle2: 0, spoilers: 1, brake: 0.8 };
      const checklist = buildGuidanceChecklist(
        KSEA_TUTORIAL_SCENARIO,
        aircraft,
        controls,
        checklistPhase as Parameters<typeof buildGuidanceChecklist>[3],
      );
      const message = coachMessageForState('running', aircraft, controls, KSEA_TUTORIAL_SCENARIO);

      expect(checklist.length).toBeGreaterThan(0);
      expect(checklist.map((item) => item.label).join(' ')).toMatch(/touchdown|derotation|rollout|taxi|reset|stopped/i);
      expect(message).toMatch(expectedMessage);
      expect(message).not.toMatch(/takeoff thrust/i);
    }
  });

  it('coaches landed rollout toward braking and reset without takeoff thrust instructions', () => {
    const aircraft = createAircraftStateForScenario(B737_800_SPEC, KSEA_TUTORIAL_SCENARIO);
    aircraft.flightPhase = 'LANDED';
    aircraft.ground.weightOnWheels = true;
    aircraft.ground.aglFt = 0;
    aircraft.ground.contact = 'gear';
    aircraft.velocity.u = 18;

    const message = coachMessageForState('running', aircraft, {
      ...configuredInputs,
      throttle1: 0,
      throttle2: 0,
      brake: 0.8,
      spoilers: 1,
    }, KSEA_TUTORIAL_SCENARIO);

    expect(message).toMatch(/landing|landed/i);
    expect(message).toMatch(/rollout|brak/i);
    expect(message).toMatch(/reset/i);
    expect(message).not.toMatch(/takeoff thrust/i);
  });
});
