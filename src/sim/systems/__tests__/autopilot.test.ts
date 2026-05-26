import { describe, it, expect, beforeEach } from 'vitest';
import {
  composeEffectiveControls,
  computeAutopilotCommands,
  resetAutopilotPID,
} from '../autopilot';
import { createInitialState, B737_800_SPEC } from '../../types';
import type { AutopilotCommands, ControlInputs } from '../../types';
import type { AutopilotState, LateralMode, ThrustMode, VerticalMode } from '@shared/autopilot/autopilotTypes';

beforeEach(() => resetAutopilotPID());

function makeAp(lateral: LateralMode, vertical: VerticalMode, thrust: ThrustMode): AutopilotState {
  return {
    boeing: { courseL:0,courseR:0,speed:null,mach:null,heading:0,altitude:0,verticalSpeed:null,
      fdLeft:false,fdRight:false,autothrottleArm:false,
      n1:false,speedMode:false,lnav:false,vnav:false,lvlChg:false,hdgSel:false,vorLoc:false,app:false,altHold:false,vs:false,
      cmdA:true,cmdB:false,cwsA:false,cwsB:false },
    airbus: { speed:null,speedManaged:false,heading:null,headingManaged:false,altitude:0,altitudeManaged:false,
      verticalSpeed:null,fpa:null,fd1:false,fd2:false,athr:false,ap1:false,ap2:false,
      loc:false,appr:false,exped:false,hdgTrkMode:'HDG_VS',metricAltitude:false,speedMachMode:'SPD' },
    truth: {
      lateralActive: lateral, verticalActive: vertical, thrustActive: thrust,
      autopilotStatus: 'CMD_A',
      lastModeChangeTimestamps: { thrust:0, lateral:0, vertical:0 },
    },
  };
}

function makeInputs(partial: Partial<ControlInputs> = {}): ControlInputs {
  return {
    elevator: 0,
    aileron: 0,
    rudder: 0,
    throttle1: 0,
    throttle2: 0,
    flapLever: 0,
    gearLever: 'UP',
    spoilers: 0,
    brake: 0,
    ...partial,
  };
}

describe('computeAutopilotCommands HDG_SEL', () => {
  it('commands right aileron to turn toward target heading', () => {
    const s = createInitialState(B737_800_SPEC);
    s.velocity.u = 128.6; // flying at 250kt
    const ap = makeAp('HDG_SEL', 'ALT_HOLD', 'SPEED');
    // aircraft heading = π (180°, pointing south), target = 0° (north)
    s.attitude.psi = Math.PI;
    const commands = computeAutopilotCommands(s, ap, 0, 10000, 250, 1/60);
    // To turn from 180° to 0°, the shortest path is right (clockwise), aileron negative
    expect(commands.aileron).toBeLessThan(0);
  });
});

describe('computeAutopilotCommands ALT_HOLD', () => {
  it('pitches up when below target altitude', () => {
    const s = createInitialState(B737_800_SPEC);
    s.velocity.u = 128.6;
    s.position.alt = 9000; // 1000ft below target
    const ap = makeAp('HDG_SEL', 'ALT_HOLD', 'SPEED');
    const commands = computeAutopilotCommands(s, ap, 0, 10000, 250, 1/60);
    // Below target → pitch up → elevator negative
    expect(commands.elevator).toBeLessThan(0);
  });

  it('near zero elevator at target altitude', () => {
    const s = createInitialState(B737_800_SPEC);
    s.velocity.u = 128.6;
    s.position.alt = 10000;
    const ap = makeAp('HDG_SEL', 'ALT_HOLD', 'SPEED');
    const commands = computeAutopilotCommands(s, ap, 0, 10000, 250, 1/60);
    expect(Math.abs(commands.elevator ?? 0)).toBeLessThan(0.1);
  });
});

describe('computeAutopilotCommands SPEED', () => {
  it('advances throttle below target speed', () => {
    const s = createInitialState(B737_800_SPEC);
    s.velocity.u = 100; // 194 kts, target 250
    const ap = makeAp('HDG_SEL', 'ALT_HOLD', 'SPEED');
    const commands = computeAutopilotCommands(s, ap, 0, 10000, 250, 1/60);
    expect(commands.throttle1).toBeGreaterThan(0);
  });
});

describe('composeEffectiveControls', () => {
  it('applies AP-owned axes without mutating pilot inputs', () => {
    const pilotInputs = makeInputs({
      elevator: 0.2,
      aileron: -0.2,
      rudder: 0.3,
      throttle1: 0.4,
      throttle2: 0.5,
      flapLever: 5,
      gearLever: 'DOWN',
      spoilers: 0.6,
      brake: 0.7,
    });
    const before = structuredClone(pilotInputs);
    const apCommands: AutopilotCommands = {
      elevator: -0.8,
      aileron: 0.9,
      throttle1: 0.65,
      throttle2: 0.66,
    };

    const effective = composeEffectiveControls(pilotInputs, apCommands, true);

    expect(pilotInputs).toEqual(before);
    expect(effective).not.toBe(pilotInputs);
    expect(effective).toEqual({
      ...before,
      elevator: -0.8,
      aileron: 0.9,
      throttle1: 0.65,
      throttle2: 0.66,
    });
  });

  it('leaves pilot controls effective when AP is off or manually overridden', () => {
    const pilotInputs = makeInputs({ elevator: 0.25, aileron: -0.25, throttle1: 0.2, throttle2: 0.3 });
    const apCommands: AutopilotCommands = { elevator: -0.7, aileron: 0.7, throttle1: 0.9, throttle2: 0.9 };

    expect(composeEffectiveControls(pilotInputs, apCommands, false)).toEqual(pilotInputs);
    expect(composeEffectiveControls(pilotInputs, apCommands, true, true)).toEqual(pilotInputs);
  });
});

describe('resetAutopilotPID', () => {
  it('clears accumulated PID state deterministically', () => {
    const s = createInitialState(B737_800_SPEC);
    s.velocity.u = 128.6;
    s.position.alt = 9900;
    const ap = makeAp('OFF', 'ALT_HOLD', 'OFF');

    const first = computeAutopilotCommands(s, ap, 0, 10000, 250, 1).elevator;
    for (let i = 0; i < 10; i++) {
      computeAutopilotCommands(s, ap, 0, 10000, 250, 1);
    }

    resetAutopilotPID();

    const afterReset = computeAutopilotCommands(s, ap, 0, 10000, 250, 1).elevator;
    expect(afterReset).toBeCloseTo(first ?? 0, 12);
  });
});
