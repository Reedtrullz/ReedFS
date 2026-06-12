import { describe, expect, it } from 'vitest';
import { resolveGearLeverCommand } from '../gearCommand';

describe('resolveGearLeverCommand', () => {
  it('rejects toggle gear up before positive rate', () => {
    expect(resolveGearLeverCommand({ current: 'DOWN', positiveRate: false })).toEqual({
      gearLever: 'DOWN',
      rejectedReason: 'positive-rate-required',
    });
  });

  it('allows gear down at any time', () => {
    expect(resolveGearLeverCommand({ current: 'UP', positiveRate: false })).toEqual({
      gearLever: 'DOWN',
      rejectedReason: null,
    });
  });

  it('allows gear up after positive rate', () => {
    expect(resolveGearLeverCommand({ current: 'DOWN', positiveRate: true })).toEqual({
      gearLever: 'UP',
      rejectedReason: null,
    });
  });

  it('rejects a direct gear-up target before positive rate', () => {
    expect(resolveGearLeverCommand({ current: 'DOWN', requested: 'UP', positiveRate: false })).toEqual({
      gearLever: 'DOWN',
      rejectedReason: 'positive-rate-required',
    });
  });

  it('preserves an unchanged direct gear-up target even if positive rate is no longer present', () => {
    expect(resolveGearLeverCommand({ current: 'UP', requested: 'UP', positiveRate: false })).toEqual({
      gearLever: 'UP',
      rejectedReason: null,
    });
  });
});
