import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SimStore } from '../simStore';
import type { SimulationCommit } from '../commandBoundaries';
import { appliedCommandLatency, commandBoundaryPatch, commitRate } from '../commandBoundaries';

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

describe('commandBoundaryPatch', () => {
  afterEach(() => vi.restoreAllMocks());

  const baseState = (overrides: Partial<SimStore> = {}) => ({
    inputManager: { stabilizerTrimUnits: 0 },
    pilotInputs: { elevator: 0 },
    apState: {},
    flightPlan: {},
    wind: {},
    weather: {},
    aircraft: {},
    status: 'running',
    simulationCommit: null,
    commandRevisions: { pilot: 0, autoflight: 0, route: 0, environment: 0 },
    commandAcceptedAtMs: 0,
    asyncPhysicsGeneration: 2,
    asyncPhysicsInFlight: true,
    asyncReservedSteps: 30,
    fixedStepAccumulatorSeconds: 1,
    simulationTimeSeconds: 42,
    ...overrides,
  }) as unknown as SimStore;

  const base = baseState();
  const commit = (overrides: Partial<SimulationCommit> = {}): SimulationCommit => ({
    stepIndex: 1,
    revisions: { pilot: 0, autoflight: 0, route: 0, environment: 0 },
    committedAtMs: 0,
    batchSteps: 1,
    batchDurationMs: 0,
    commandLatencyMs: 0,
    achievedSimRate: 4,
    rateWindowStartMs: 1,
    rateWindowStartSimSeconds: 2,
    observation: {} as SimulationCommit['observation'],
    ...overrides,
  });

  it('records pilot acceptance without changing the physics epoch', () => {
    vi.spyOn(performance, 'now').mockReturnValue(777);
    const result = commandBoundaryPatch(baseState(), { pilotInputs: { ...base.pilotInputs, elevator: 0.5 } });
    expect(result.commandRevisions).toEqual({ pilot: 1, autoflight: 0, route: 0, environment: 0 });
    expect(result.commandAcceptedAtMs).toBe(777);
    expect(result).not.toHaveProperty('asyncPhysicsGeneration');
  });

  it('ignores unchanged pilot input values', () => {
    const result = commandBoundaryPatch(baseState(), { pilotInputs: { ...base.pilotInputs, elevator: 0 } });
    expect(result).not.toHaveProperty('commandRevisions');
    expect(result).not.toHaveProperty('commandAcceptedAtMs');
  });

  it('fences physics for a replacement autoflight state', () => {
    const result = commandBoundaryPatch(baseState(), { apState: structuredClone(base.apState) });
    expect(result.commandRevisions).toEqual({ pilot: 0, autoflight: 1, route: 0, environment: 0 });
    expect(result.asyncPhysicsGeneration).toBe(3);
    expect(result.asyncPhysicsInFlight).toBe(false);
    expect(result.asyncReservedSteps).toBe(0);
  });

  it('increments route and environment revisions once per patch', () => {
    expect(commandBoundaryPatch(baseState(), { flightPlan: structuredClone(base.flightPlan) }).commandRevisions).toEqual({ pilot: 0, autoflight: 0, route: 1, environment: 0 });
    expect(commandBoundaryPatch(baseState(), { wind: structuredClone(base.wind) }).commandRevisions).toEqual({ pilot: 0, autoflight: 0, route: 0, environment: 1 });
    expect(commandBoundaryPatch(baseState(), { wind: structuredClone(base.wind), weather: structuredClone(base.weather) }).commandRevisions).toEqual({ pilot: 0, autoflight: 0, route: 0, environment: 1 });
  });

  it('accounts for reserved steps only for running fences without an explicit accumulator', () => {
    expect(commandBoundaryPatch(baseState(), { apState: structuredClone(base.apState) }).fixedStepAccumulatorSeconds).toBe(1.5);
    expect(commandBoundaryPatch(baseState({ status: 'paused' }), { apState: structuredClone(base.apState) })).not.toHaveProperty('fixedStepAccumulatorSeconds');
    expect(commandBoundaryPatch(baseState(), { apState: structuredClone(base.apState), fixedStepAccumulatorSeconds: 9 }).fixedStepAccumulatorSeconds).toBe(9);
  });

  it('resets rate measurement on status changes but leaves same-status commits alone', () => {
    vi.spyOn(performance, 'now').mockReturnValue(777);
    const simulationCommit = commit();
    const result = commandBoundaryPatch(baseState({ simulationCommit }), { status: 'paused' });
    expect(result.simulationCommit).toEqual({ ...simulationCommit, achievedSimRate: null, rateWindowStartMs: 777, rateWindowStartSimSeconds: 42 });
    expect(commandBoundaryPatch(baseState({ simulationCommit }), { status: 'running' })).not.toHaveProperty('simulationCommit');
  });

  it('clears the commit on simulation time changes and stopping', () => {
    const simulationCommit = commit();
    expect(commandBoundaryPatch(baseState({ simulationCommit }), { simulationTimeSeconds: 50 }).simulationCommit).toBeNull();
    expect(commandBoundaryPatch(baseState({ simulationCommit }), { status: 'stopped' }).simulationCommit).toBeNull();
  });

  it('treats trim-only aircraft replacement as a pilot intent when requested', () => {
    const patch: Partial<SimStore> = { aircraft: { ...base.aircraft }, inputManager: { ...base.inputManager, stabilizerTrimUnits: 1 } };
    const trimOnly = commandBoundaryPatch(baseState(), patch, true);
    expect(trimOnly.commandRevisions).toEqual({ pilot: 1, autoflight: 0, route: 0, environment: 0 });
    expect(trimOnly).not.toHaveProperty('asyncPhysicsGeneration');
    expect(commandBoundaryPatch(baseState(), patch, false).asyncPhysicsGeneration).toBe(3);
  });

  it('honors an explicit physics generation while fencing in-flight work', () => {
    const result = commandBoundaryPatch(baseState(), { asyncPhysicsGeneration: 9 });
    expect(result.asyncPhysicsGeneration).toBe(9);
    expect(result.asyncPhysicsInFlight).toBe(false);
  });

  it('increments pilot revision from its existing value and preserves other revisions', () => {
    const state = baseState({ commandRevisions: { pilot: 3, autoflight: 4, route: 5, environment: 6 } });
    expect(commandBoundaryPatch(state, { pilotInputs: { ...base.pilotInputs, elevator: 0.5 } }).commandRevisions)
      .toEqual({ pilot: 4, autoflight: 4, route: 5, environment: 6 });
  });

  it('increments autoflight revision from its existing value and preserves other revisions', () => {
    const state = baseState({ commandRevisions: { pilot: 3, autoflight: 4, route: 5, environment: 6 } });
    expect(commandBoundaryPatch(state, { apState: structuredClone(base.apState) }).commandRevisions)
      .toEqual({ pilot: 3, autoflight: 5, route: 5, environment: 6 });
  });

  it('increments route revision from its existing value and preserves other revisions', () => {
    const state = baseState({ commandRevisions: { pilot: 3, autoflight: 4, route: 5, environment: 6 } });
    expect(commandBoundaryPatch(state, { flightPlan: structuredClone(base.flightPlan) }).commandRevisions)
      .toEqual({ pilot: 3, autoflight: 4, route: 6, environment: 6 });
  });

  it('increments environment revision from its existing value and preserves other revisions', () => {
    const state = baseState({ commandRevisions: { pilot: 3, autoflight: 4, route: 5, environment: 6 } });
    expect(commandBoundaryPatch(state, { wind: structuredClone(base.wind) }).commandRevisions)
      .toEqual({ pilot: 3, autoflight: 4, route: 5, environment: 7 });
  });

  it('increments autoflight and route revisions together from their existing values', () => {
    const state = baseState({ commandRevisions: { pilot: 3, autoflight: 4, route: 5, environment: 6 } });
    expect(commandBoundaryPatch(state, { apState: structuredClone(base.apState), flightPlan: structuredClone(base.flightPlan) }).commandRevisions)
      .toEqual({ pilot: 3, autoflight: 5, route: 6, environment: 6 });
  });
});
