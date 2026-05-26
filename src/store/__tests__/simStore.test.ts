import { describe, it, expect, beforeEach } from 'vitest';
import { useSimStore } from '../simStore';
import type { AutopilotState } from '@shared/autopilot/autopilotTypes';
import { KSEA_RUNWAY_ALT_FT } from '../../sim/systems/ground';
import { KSEA_LIGHT_PATTERN_SCENARIO, KSEA_TUTORIAL_SCENARIO } from '../../sim/scenarios';

function minimalApState(): AutopilotState {
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
      lnav: false,
      vnav: false,
      lvlChg: false,
      hdgSel: false,
      vorLoc: false,
      app: false,
      altHold: false,
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
      lateralActive: 'HDG_SEL',
      verticalActive: 'ALT_HOLD',
      thrustActive: 'SPEED',
      autopilotStatus: 'CMD_A',
      lastModeChangeTimestamps: { thrust: 0, lateral: 0, vertical: 0 },
    },
  };
}

function startTakeoffRollFromStore(): void {
  useSimStore.getState().setInput({
    throttle1: 1,
    throttle2: 1,
    flapLever: 5,
    gearLever: 'DOWN',
    brake: 0,
    elevator: 0,
  });
  useSimStore.getState().start();
}

function tickAtHz(hz: number, seconds: number): void {
  const startMs = 1000;
  for (let frame = 0; frame < seconds * hz; frame++) {
    useSimStore.getState().tick(startMs + frame * (1000 / hz));
  }
}

describe('useSimStore', () => {
  beforeEach(() => useSimStore.getState().reset());

  it('starts stopped', () => expect(useSimStore.getState().status).toBe('stopped'));
  it('start → running', () => { useSimStore.getState().start(); expect(useSimStore.getState().status).toBe('running'); });
  it('startTakeoffRoll sets inputs, running status, and TAKEOFF phase', () => {
    useSimStore.getState().startTakeoffRoll();

    const state = useSimStore.getState();
    expect(state.status).toBe('running');
    expect(state.inputs).toEqual(expect.objectContaining({
      throttle1: 1,
      throttle2: 1,
      flapLever: 5,
      gearLever: 'DOWN',
      brake: 0,
      elevator: 0,
    }));
    expect(state.aircraft.flightPhase).toBe('TAKEOFF');
  });
  it('pause → paused', () => { useSimStore.getState().start(); useSimStore.getState().pause(); expect(useSimStore.getState().status).toBe('paused'); });
  it('setInput partial', () => { useSimStore.getState().setInput({ throttle1: 0.8 }); expect(useSimStore.getState().inputs.throttle1).toBe(0.8); expect(useSimStore.getState().inputs.throttle2).toBe(0); });
  it('neutral input-manager frames do not erase external control commands', () => {
    useSimStore.setState((s) => ({ inputs: { ...s.inputs, elevator: 0.42 } }));

    useSimStore.getState().applyInputActions({}, 1 / 60);

    expect(useSimStore.getState().inputs.elevator).toBe(0.42);
  });
  it('neutral input-manager frames preserve split-throttle partial inputs', () => {
    useSimStore.getState().setInput({ throttle1: 0.8 });

    useSimStore.getState().applyInputActions({}, 1 / 60);

    expect(useSimStore.getState().inputs.throttle1).toBe(0.8);
    expect(useSimStore.getState().inputs.throttle2).toBe(0);
  });
  it('neutral input-manager frames do not erase public setInput axis commands', () => {
    useSimStore.getState().setInput({ elevator: 0.42 });

    useSimStore.getState().applyInputActions({}, 1 / 60);

    expect(useSimStore.getState().inputs.elevator).toBe(0.42);
  });
  it('public setInput axis commands detach stale input-manager recentering', () => {
    useSimStore.getState().applyInputActions({ pitch: -1 }, 1 / 60);
    expect(useSimStore.getState().inputs.elevator).toBeLessThan(0);

    useSimStore.getState().setInput({ elevator: 0.42 });
    useSimStore.getState().applyInputActions({}, 1 / 60);

    expect(useSimStore.getState().inputs.elevator).toBe(0.42);
  });
  it('neutral input-manager frames do not erase direct AP-style input mutations', () => {
    useSimStore.getState().applyInputActions({ pitch: -1 }, 1 / 60);
    expect(useSimStore.getState().inputs.elevator).toBeLessThan(0);
    useSimStore.setState((s) => ({ inputs: { ...s.inputs, elevator: 0.42 } }));

    useSimStore.getState().applyInputActions({}, 1 / 60);

    expect(useSimStore.getState().inputs.elevator).toBe(0.42);
  });
  it('throttle input-manager actions start from the live throttle lever after split-throttle input', () => {
    useSimStore.getState().setInput({ throttle1: 0.8 });

    useSimStore.getState().applyInputActions({ throttleDelta: 0.05 }, 0);

    expect(useSimStore.getState().inputs.throttle1).toBeCloseTo(0.85, 8);
    expect(useSimStore.getState().inputs.throttle2).toBeCloseTo(0.85, 8);
  });
  it('tick advances simTime when running', () => { useSimStore.getState().start(); const b = useSimStore.getState().aircraft.simTime; useSimStore.getState().tick(performance.now()); expect(useSimStore.getState().aircraft.simTime).toBeGreaterThanOrEqual(b); });
  it('reset clears everything', () => { useSimStore.getState().setInput({ throttle1: 1 }); useSimStore.getState().start(); useSimStore.getState().tick(1000); useSimStore.getState().reset(); expect(useSimStore.getState().status).toBe('stopped'); expect(useSimStore.getState().inputs.throttle1).toBe(0); });
  it('starts from the KSEA tutorial scenario mass and runway setup', () => {
    const state = useSimStore.getState();

    expect(state.selectedScenarioId).toBe(KSEA_TUTORIAL_SCENARIO.id);
    expect(state.aircraft.payloadWeight).toBe(KSEA_TUTORIAL_SCENARIO.payloadWeightKg);
    expect(state.aircraft.zeroFuelWeight).toBe(KSEA_TUTORIAL_SCENARIO.zeroFuelWeightKg);
    expect(state.aircraft.cg).toBe(KSEA_TUTORIAL_SCENARIO.cgPercent);
    expect(state.aircraft.config.stabilizerTrimUnits).toBe(KSEA_TUTORIAL_SCENARIO.stabilizerTrimUnits);
    expect(state.aircraft.fuel.totalFuel).toBe(KSEA_TUTORIAL_SCENARIO.fuel.totalFuel);
    expect(state.aircraft.ground.groundAltFt).toBe(KSEA_TUTORIAL_SCENARIO.runway.elevationFt);
  });
  it('reset returns to the selected scenario instead of hardcoded defaults', () => {
    useSimStore.getState().setScenario(KSEA_LIGHT_PATTERN_SCENARIO.id);
    useSimStore.getState().setInput({ throttle1: 1, flapLever: 30 });
    useSimStore.getState().start();
    useSimStore.getState().tick(1000);
    useSimStore.getState().reset();

    const state = useSimStore.getState();
    expect(state.selectedScenarioId).toBe(KSEA_LIGHT_PATTERN_SCENARIO.id);
    expect(state.aircraft.payloadWeight).toBe(KSEA_LIGHT_PATTERN_SCENARIO.payloadWeightKg);
    expect(state.aircraft.zeroFuelWeight).toBe(KSEA_LIGHT_PATTERN_SCENARIO.zeroFuelWeightKg);
    expect(state.aircraft.cg).toBe(KSEA_LIGHT_PATTERN_SCENARIO.cgPercent);
    expect(state.aircraft.config.stabilizerTrimUnits).toBe(KSEA_LIGHT_PATTERN_SCENARIO.stabilizerTrimUnits);
    expect(state.aircraft.config.flapSetting).toBe(KSEA_LIGHT_PATTERN_SCENARIO.flapSetting);
    expect(state.inputs.flapLever).toBe(KSEA_LIGHT_PATTERN_SCENARIO.flapSetting);
    expect(state.aircraft.ground.groundAltFt).toBe(KSEA_LIGHT_PATTERN_SCENARIO.runway.elevationFt);
    expect(state.wind).toEqual(KSEA_LIGHT_PATTERN_SCENARIO.wind);
    expect(state.inputs.throttle1).toBe(0);
  });
  it('reset restores selected scenario wind from an immutable copy', () => {
    useSimStore.getState().setScenario(KSEA_LIGHT_PATTERN_SCENARIO.id);
    const wind = useSimStore.getState().wind;
    if (wind) wind.speed = 99;

    useSimStore.getState().reset();

    expect(KSEA_LIGHT_PATTERN_SCENARIO.wind.speed).toBe(6);
    expect(useSimStore.getState().wind).toEqual(KSEA_LIGHT_PATTERN_SCENARIO.wind);
  });
  it('apState starts null', () => expect(useSimStore.getState().apState).toBeNull());
  it('setApState stores autopilot state', () => { useSimStore.getState().setApState(minimalApState()); expect(useSimStore.getState().apState).toBeTruthy(); });
  it('reset clears apState', () => { useSimStore.getState().setApState(minimalApState()); useSimStore.getState().reset(); expect(useSimStore.getState().apState).toBeNull(); });

  it('takeoff roll stays at or above runway elevation through store ticks', () => {
    const store = useSimStore.getState();
    store.setInput({
      throttle1: 1,
      throttle2: 1,
      flapLever: 5,
      gearLever: 'DOWN',
      brake: 0,
      elevator: 0,
    });
    store.start();

    for (let frame = 0; frame < 5 * 60; frame++) {
      useSimStore.getState().tick(frame * (1000 / 60));
    }

    const state = useSimStore.getState().aircraft;
    expect(state.position.alt).toBeGreaterThanOrEqual(KSEA_RUNWAY_ALT_FT - 0.01);
    expect(state.velocity.u).toBeGreaterThan(5);
    expect(state.config.gearDown).toBe(true);
  });

  it('reset then repeated takeoff roll accelerates at 120 Hz', () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      useSimStore.getState().reset();
      startTakeoffRollFromStore();

      tickAtHz(120, 20);

      const state = useSimStore.getState().aircraft;
      expect(state.position.alt).toBeGreaterThanOrEqual(KSEA_RUNWAY_ALT_FT - 0.01);
      expect(state.velocity.u).toBeGreaterThan(25);
      expect(state.config.gearDown).toBe(true);
    }
  });

  it('wind does not directly overwrite ground velocity during a tick', () => {
    useSimStore.getState().setWind({ dir: 180, speed: 20 });
    useSimStore.getState().start();

    useSimStore.getState().tick(1000);

    expect(Math.abs(useSimStore.getState().aircraft.velocity.u)).toBeLessThan(1);
  });
});
