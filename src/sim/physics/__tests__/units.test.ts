import { describe, it, expect } from 'vitest';
import { ktToMs, msToKt, ftToM, mToFt, fpmToMs, msToFpm, lbfToN, degToRad, radToDeg } from '../units';

describe('units', () => {
  it('ktToMs', () => expect(ktToMs(100)).toBeCloseTo(51.4444, 1));
  it('msToKt', () => expect(msToKt(51.4444)).toBeCloseTo(100, 0));
  it('ftToM', () => expect(ftToM(1000)).toBeCloseTo(304.8, 1));
  it('mToFt', () => expect(mToFt(304.8)).toBeCloseTo(1000, 0));
  it('fpmToMs', () => expect(fpmToMs(1000)).toBeCloseTo(5.08, 1));
  it('msToFpm', () => expect(msToFpm(5.08)).toBeCloseTo(1000, -1));
  it('lbfToN', () => expect(lbfToN(1000)).toBeCloseTo(4448.22, 0));
  it('degToRad', () => expect(degToRad(180)).toBeCloseTo(Math.PI));
  it('radToDeg', () => expect(radToDeg(Math.PI)).toBeCloseTo(180));
});
