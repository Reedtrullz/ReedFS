import { describe, it, expect, beforeEach } from 'vitest';
import { useSimStore } from '../simStore';
import type { AutopilotState } from '@shared/autopilot/autopilotTypes';
import { KSEA_RUNWAY_ALT_FT } from '../../sim/systems/ground';

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
  it('pause → paused', () => { useSimStore.getState().start(); useSimStore.getState().pause(); expect(useSimStore.getState().status).toBe('paused'); });
  it('setInput partial', () => { useSimStore.getState().setInput({ throttle1: 0.8 }); expect(useSimStore.getState().inputs.throttle1).toBe(0.8); expect(useSimStore.getState().inputs.throttle2).toBe(0); });
  it('tick advances simTime when running', () => { useSimStore.getState().start(); const b = useSimStore.getState().aircraft.simTime; useSimStore.getState().tick(performance.now()); expect(useSimStore.getState().aircraft.simTime).toBeGreaterThanOrEqual(b); });
  it('reset clears everything', () => { useSimStore.getState().setInput({ throttle1: 1 }); useSimStore.getState().start(); useSimStore.getState().tick(1000); useSimStore.getState().reset(); expect(useSimStore.getState().status).toBe('stopped'); expect(useSimStore.getState().inputs.throttle1).toBe(0); });
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
