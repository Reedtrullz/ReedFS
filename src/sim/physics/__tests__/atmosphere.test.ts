import { describe, it, expect } from 'vitest';
import { isaAtAltitude } from '../atmosphere';

describe('ISA atmosphere', () => {
  it('sea level', () => {
    const a = isaAtAltitude(0);
    expect(a.tempC).toBeCloseTo(15, 0);
    expect(a.pressureHpa).toBeCloseTo(1013.25, -1);
    expect(a.density).toBeCloseTo(1.225, 1);
    expect(a.speedOfSound).toBeCloseTo(340.3, 0);
  });
  it('troposphere 10000ft', () => {
    const a = isaAtAltitude(10000);
    expect(a.tempC).toBeCloseTo(-4.8, 0);
    expect(a.pressureHpa).toBeLessThan(750);
  });
  it('tropopause 36000ft', () => {
    const a = isaAtAltitude(36000);
    expect(a.tempC).toBeCloseTo(-56.5, 0);
    expect(a.pressureHpa).toBeLessThan(250);
  });
  it('stratosphere 45000ft is isothermal', () => {
    const a = isaAtAltitude(45000);
    expect(a.tempC).toBeCloseTo(-56.5, 0);
  });
});
