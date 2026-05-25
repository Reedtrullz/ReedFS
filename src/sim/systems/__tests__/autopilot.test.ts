import { describe, it, expect, beforeEach } from 'vitest';
import { updateAutopilot, resetAutopilotPID } from '../autopilot';
import { createInitialState, B737_800_SPEC } from '../../types';
import type { ControlInputs } from '../../types';
import type { AutopilotState } from '@shared/autopilot/autopilotTypes';

beforeEach(() => resetAutopilotPID());

function makeAp(lateral: string, vertical: string, thrust: string): AutopilotState {
  return {
    boeing: { courseL:0,courseR:0,speed:null,mach:null,heading:0,altitude:0,verticalSpeed:null,
      fdLeft:false,fdRight:false,autothrottleArm:false,
      n1:false,speedMode:false,lnav:false,vnav:false,lvlChg:false,hdgSel:false,vorLoc:false,app:false,altHold:false,vs:false,
      cmdA:true,cmdB:false,cwsA:false,cwsB:false },
    airbus: { speed:null,speedManaged:false,heading:null,headingManaged:false,altitude:0,altitudeManaged:false,
      verticalSpeed:null,fpa:null,fd1:false,fd2:false,athr:false,ap1:false,ap2:false,
      loc:false,appr:false,exped:false,hdgTrkMode:'HDG_VS',metricAltitude:false,speedMachMode:'SPD' },
    truth: {
      lateralActive: lateral as any, verticalActive: vertical as any, thrustActive: thrust as any,
      autopilotStatus: 'CMD_A',
      lastModeChangeTimestamps: { thrust:0, lateral:0, vertical:0 },
    },
  };
}

describe('updateAutopilot HDG_SEL', () => {
  it('commands right aileron to turn toward target heading', () => {
    const s = createInitialState(B737_800_SPEC);
    s.velocity.u = 128.6; // flying at 250kt
    const inputs: ControlInputs = { elevator:0,aileron:0,rudder:0,throttle1:0,throttle2:0,flapLever:0,gearLever:'UP',spoilers:0,brake:0 };
    const ap = makeAp('HDG_SEL', 'ALT_HOLD', 'SPEED');
    // aircraft heading = π (180°, pointing south), target = 0° (north)
    s.attitude.psi = Math.PI;
    updateAutopilot(s, inputs, ap, 0, 10000, 250, 1/60);
    // To turn from 180° to 0°, the shortest path is right (clockwise), aileron negative
    expect(inputs.aileron).toBeLessThan(0);
  });
});

describe('updateAutopilot ALT_HOLD', () => {
  it('pitches up when below target altitude', () => {
    const s = createInitialState(B737_800_SPEC);
    s.velocity.u = 128.6;
    s.position.alt = 9000; // 1000ft below target
    const inputs: ControlInputs = { elevator:0,aileron:0,rudder:0,throttle1:0,throttle2:0,flapLever:0,gearLever:'UP',spoilers:0,brake:0 };
    const ap = makeAp('HDG_SEL', 'ALT_HOLD', 'SPEED');
    updateAutopilot(s, inputs, ap, 0, 10000, 250, 1/60);
    // Below target → pitch up → elevator negative
    expect(inputs.elevator).toBeLessThan(0);
  });

  it('near zero elevator at target altitude', () => {
    const s = createInitialState(B737_800_SPEC);
    s.velocity.u = 128.6;
    s.position.alt = 10000;
    const inputs: ControlInputs = { elevator:0,aileron:0,rudder:0,throttle1:0,throttle2:0,flapLever:0,gearLever:'UP',spoilers:0,brake:0 };
    const ap = makeAp('HDG_SEL', 'ALT_HOLD', 'SPEED');
    updateAutopilot(s, inputs, ap, 0, 10000, 250, 1/60);
    expect(Math.abs(inputs.elevator)).toBeLessThan(0.1);
  });
});

describe('updateAutopilot SPEED', () => {
  it('advances throttle below target speed', () => {
    const s = createInitialState(B737_800_SPEC);
    s.velocity.u = 100; // 194 kts, target 250
    const inputs: ControlInputs = { elevator:0,aileron:0,rudder:0,throttle1:0,throttle2:0,flapLever:0,gearLever:'UP',spoilers:0,brake:0 };
    const ap = makeAp('HDG_SEL', 'ALT_HOLD', 'SPEED');
    updateAutopilot(s, inputs, ap, 0, 10000, 250, 1/60);
    expect(inputs.throttle1).toBeGreaterThan(0);
  });
});
