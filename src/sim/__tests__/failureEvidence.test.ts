import { describe, expect, it } from 'vitest';
import { serializeSimulationFailure } from '../failureEvidence';

describe('local failure evidence', () => {
  it('retains nonfinite values explicitly and labels privacy-sensitive local export', () => {
    const output = JSON.parse(serializeSimulationFailure({ message: 'invalid', detectedAtIso: '2026-10-08T01:00:00Z', input: {}, result: { velocity: NaN, overflow: Infinity }, recovered: false, checkpoint: null }));
    expect(output.evidence.result).toEqual({ velocity: '[NaN]', overflow: '[Infinity]' });
    expect(output.privacy).toMatch(/position and route/);
  });
  it('contains cyclic or excessively nested diagnostics rather than failing during recovery', () => {
    const result: Record<string, unknown> = {}; result.cycle = result;
    expect(JSON.parse(serializeSimulationFailure({ message: 'invalid', detectedAtIso: '2026-10-08T01:00:00Z', input: {}, result, recovered: false, checkpoint: null })).evidence.result.cycle).toBe('[repeated reference]');
  });
});
