import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSimStore } from '../simStore';
import { advanceSimulationBatch, type SimulationStepInput, type SimulationStepResult } from '../../sim/simulationStep';
import { mainThreadSimulationRuntime, setSimulationRuntimeForTests, type AsyncSimulationRuntime } from '../../sim/simulationRuntime';
import { eulerToQuat } from '../../sim/physics/quaternion';
import { SCENARIO_SAVE_KEY } from '../scenarioPersistence';

afterEach(() => { setSimulationRuntimeForTests(mainThreadSimulationRuntime); });
beforeEach(() => { localStorage.clear(); useSimStore.getState().reset(); useSimStore.getState().start(); });

function failingRuntime(change: (result: SimulationStepResult) => void, async = false) {
  const step = vi.fn((input: SimulationStepInput) => {
    const result = advanceSimulationBatch(input, input.steps ?? 1);
    change(result);
    return result;
  });
  setSimulationRuntimeForTests({ kind: 'main-thread', step, ...(async ? { stepAsync: async (input: SimulationStepInput) => step(input) } : {}) });
  return step;
}

describe('simulation failure recovery', () => {
  it.each([false, true])('pauses before publishing a nonfinite result (async=%s), retains evidence and prevents retry', async (async) => {
    const previous = structuredClone(useSimStore.getState().aircraft);
    const step = failingRuntime((result) => { result.aircraft.velocity.u = NaN; }, async);
    useSimStore.getState().tickAsync(16);
    await vi.waitFor(() => expect(useSimStore.getState().status).toBe('paused'));
    expect(useSimStore.getState().aircraft).toEqual(previous);
    const failure = useSimStore.getState().simulationFailure;
    expect(failure?.result).toMatchObject({ aircraft: { velocity: { u: NaN } } });
    expect(failure?.input).toMatchObject({ aircraft: previous });
    expect(useSimStore.getState().lastValidCheckpoint?.aircraft).toEqual(previous);
    useSimStore.getState().resume();
    useSimStore.getState().start();
    useSimStore.getState().startTakeoffRoll();
    useSimStore.getState().tickAsync(32);
    expect(step).toHaveBeenCalledTimes(1);
    expect(useSimStore.getState().status).toBe('paused');
    expect(useSimStore.getState().simulationFailure).toBe(failure);
  });

  it('rejects inconsistent Euler/quaternion attitude before publication', async () => {
    failingRuntime((result) => { result.aircraft.attitude.phi += 0.4; });
    useSimStore.getState().tick(16);
    expect(useSimStore.getState().status).toBe('paused');
    expect(useSimStore.getState().simulationFailure?.message).toMatch(/attitude/i);
  });

  it('rejects a result from another scenario even if its shape is valid', () => {
    failingRuntime((result) => { result.guidance.scenarioId = 'another'; result.guidance.tutorial.scenarioId = 'another'; });
    useSimStore.getState().tick(16);
    expect(useSimStore.getState().status).toBe('paused');
    expect(useSimStore.getState().simulationFailure?.message).toMatch(/identity/i);
  });

  it('contains rejected worker batches without an infinite retry or unhandled rejection', async () => {
    const stepAsync = vi.fn(async () => { throw new Error('worker numerical failure'); });
    const runtime: AsyncSimulationRuntime = { kind: 'browser-worker', step: () => { throw new Error('wrong path'); }, stepAsync };
    setSimulationRuntimeForTests(runtime);
    useSimStore.getState().tickAsync(16);
    await vi.waitFor(() => expect(useSimStore.getState().status).toBe('paused'));
    useSimStore.getState().tickAsync(32);
    expect(stepAsync).toHaveBeenCalledTimes(1);
    expect(useSimStore.getState().simulationFailure?.message).toContain('worker numerical failure');
  });

  it('explicitly restores the last valid checkpoint paused and keeps failure evidence and saved slots', () => {
    localStorage.setItem(SCENARIO_SAVE_KEY, 'preserve-this-evidence');
    const previous = structuredClone(useSimStore.getState().aircraft);
    failingRuntime((result) => { result.aircraft.velocity.u = NaN; });
    useSimStore.getState().tick(16);
    const failure = useSimStore.getState().simulationFailure;
    const generation = useSimStore.getState().asyncPhysicsGeneration;
    useSimStore.getState().restoreLastValidCheckpoint();
    expect(useSimStore.getState().status).toBe('paused');
    expect(useSimStore.getState().aircraft).toEqual(previous);
    expect(useSimStore.getState().asyncPhysicsGeneration).toBeGreaterThan(generation);
    expect(useSimStore.getState().simulationFailure?.result).toEqual(failure?.result);
    expect(useSimStore.getState().simulationFailure?.recovered).toBe(true);
    expect(localStorage.getItem(SCENARIO_SAVE_KEY)).toBe('preserve-this-evidence');
    useSimStore.getState().resume();
    expect(useSimStore.getState().status).toBe('running');
  });

  it('accepts coherent extreme attitudes and a legitimate hard landing', () => {
    failingRuntime((result) => {
      result.aircraft.attitude = { phi: Math.PI * 0.9, theta: Math.PI * 0.49, psi: -Math.PI };
      result.aircraft.quaternion = eulerToQuat(result.aircraft.attitude.phi, result.aircraft.attitude.theta, result.aircraft.attitude.psi);
      result.aircraft.ground.contact = 'crashed';
      result.aircraft.velocity.w = 40;
    });
    useSimStore.getState().tick(16);
    expect(useSimStore.getState().status).toBe('running');
    expect(useSimStore.getState().simulationFailure?.recovered ?? true).toBe(true);
  });
});

it.each([false, true])('saved restore fences an older worker reply (rejected=%s)', async (rejected) => {
  useSimStore.getState().saveScenarioState(localStorage, { slotId: 'restore-fence', overwrite: true });
  const savedAircraft = structuredClone(useSimStore.getState().aircraft);
  let complete!: (result: SimulationStepResult) => void;
  let fail!: (error: Error) => void;
  let dispatched!: SimulationStepInput;
  const runtime: AsyncSimulationRuntime = {
    kind: 'browser-worker', step: () => { throw new Error('wrong path'); },
    stepAsync: (input) => { dispatched = input; return new Promise((resolve, reject) => { complete = resolve; fail = reject; }); },
  };
  setSimulationRuntimeForTests(runtime);
  useSimStore.getState().tickAsync(16);
  await vi.waitFor(() => expect(dispatched).toBeDefined());
  useSimStore.getState().loadScenarioState(localStorage, 'restore-fence');
  if (rejected) fail(new Error('obsolete worker fault'));
  else {
    const result = advanceSimulationBatch(dispatched, 1);
    result.aircraft.position.alt += 1000;
    complete(result);
  }
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(useSimStore.getState().aircraft).toEqual(savedAircraft);
  expect(useSimStore.getState().status).toBe('paused');
  expect(useSimStore.getState().simulationFailure?.recovered ?? true).toBe(true);
  expect(useSimStore.getState().asyncPhysicsInFlight).toBe(false);
});
