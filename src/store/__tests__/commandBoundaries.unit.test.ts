import { describe, expect, it } from 'vitest';
import type { SimStore } from '../simStore';
import type { SimulationCommit } from '../commandBoundaries';
import { appliedCommandLatency, commitRate } from '../commandBoundaries';

describe('commitRate', () => {
  it('starts a rate window when there is no previous commit', () => {
    expect(commitRate(null, 5000, 100)).toEqual({
      achievedSimRate: null,
      rateWindowStartMs: 5000,
      rateWindowStartSimSeconds: 100,
    });
  });

  it('keeps the current rate before one second has elapsed', () => {
    const previous = { rateWindowStartMs: 0, rateWindowStartSimSeconds: 0, achievedSimRate: 2 } as SimulationCommit;
    expect(commitRate(previous, 999, 3)).toEqual({
      achievedSimRate: 2,
      rateWindowStartMs: 0,
      rateWindowStartSimSeconds: 0,
    });
  });

  it('updates the rate after one second has elapsed', () => {
    const previous = { rateWindowStartMs: 0, rateWindowStartSimSeconds: 0, achievedSimRate: 2 } as SimulationCommit;
    expect(commitRate(previous, 1000, 3)).toEqual({
      achievedSimRate: 3,
      rateWindowStartMs: 1000,
      rateWindowStartSimSeconds: 3,
    });
  });

  it('clamps backwards simulation time to a zero rate', () => {
    const previous = { rateWindowStartMs: 0, rateWindowStartSimSeconds: 5, achievedSimRate: 2 } as SimulationCommit;
    expect(commitRate(previous, 2000, 1)).toEqual({
      achievedSimRate: 0,
      rateWindowStartMs: 2000,
      rateWindowStartSimSeconds: 1,
    });
  });
});

describe('appliedCommandLatency', () => {
  const revisions = { pilot: 1, autoflight: 2, route: 3, environment: 4 };
  const state = (simulationCommit: SimulationCommit | null, commandAcceptedAtMs: number) => ({
    simulationCommit,
    commandRevisions: revisions,
    commandAcceptedAtMs,
  }) as unknown as SimStore;

  it('returns committed latency when command revisions match', () => {
    const previous = { revisions, commandLatencyMs: 40 } as SimulationCommit;
    expect(appliedCommandLatency(state(previous, 1000), 1250)).toBe(40);
  });

  it('measures elapsed time when command revisions differ', () => {
    const previous = { revisions: { ...revisions, pilot: 0 } } as SimulationCommit;
    expect(appliedCommandLatency(state(previous, 1000), 1250)).toBe(250);
  });

  it('returns zero when no command acceptance time is recorded', () => {
    const previous = { revisions: { ...revisions, pilot: 0 } } as SimulationCommit;
    expect(appliedCommandLatency(state(previous, 0), 1250)).toBe(0);
  });

  it('clamps negative elapsed time to zero', () => {
    const previous = { revisions: { ...revisions, pilot: 0 } } as SimulationCommit;
    expect(appliedCommandLatency(state(previous, 1000), 900)).toBe(0);
  });

  it('measures latency when there is no previous simulation commit', () => {
    expect(appliedCommandLatency(state(null, 500), 800)).toBe(300);
  });
});
