import { describe, it, expect } from 'vitest';
import { updateEngines } from '../engine';
import { createInitialState, B737_800_SPEC } from '../../types';
import type { ControlInputs } from '../../types';

const idle: ControlInputs = { elevator:0,aileron:0,rudder:0,throttle1:0,throttle2:0,flapLever:0,gearLever:'DOWN',spoilers:0,brake:0 };

describe('updateEngines', () => {
  it('N1 spools toward TOGA when commanded', () => {
    const s = createInitialState(B737_800_SPEC);
    updateEngines(s, { ...idle, throttle1: 1, throttle2: 1 }, B737_800_SPEC, 1);
    expect(s.engines[0].n1).toBeGreaterThan(0);
    expect(s.engines[0].n1).toBeLessThan(100);
  });

  it('N2 spools faster than N1', () => {
    const s = createInitialState(B737_800_SPEC);
    updateEngines(s, { ...idle, throttle1: 1, throttle2: 1 }, B737_800_SPEC, 3);
    expect(s.engines[0].n2).toBeGreaterThan(s.engines[0].n1);
  });

  it('fuelFlow increases with N1', () => {
    const s = createInitialState(B737_800_SPEC);
    s.engines[0].n1 = 90; s.engines[0].running = true;
    updateEngines(s, { ...idle, throttle1: 0.9, throttle2: 0.9 }, B737_800_SPEC, 0);
    expect(s.engines[0].fuelFlow).toBeGreaterThan(100);
  });

  it('N1 spools down slower than up', () => {
    const s = createInitialState(B737_800_SPEC);
    s.engines[0].n1 = 90; s.engines[0].running = true;
    // Command to idle, 1 second
    updateEngines(s, idle, B737_800_SPEC, 1);
    // Should still be fairly high (slow spool-down)
    expect(s.engines[0].n1).toBeGreaterThan(40);
  });
});
