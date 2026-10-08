import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSimStore } from '../simStore';
import { advanceSimulationBatch, type SimulationStepInput, type SimulationStepResult } from '../../sim/simulationStep';
import { mainThreadSimulationRuntime, workerHandlerSimulationRuntime, setSimulationRuntimeForTests, type AsyncSimulationRuntime } from '../../sim/simulationRuntime';
import { createDefaultAutopilotState } from '../../instruments/defaultAutopilotState';
import { createRunwayToRunwayFlight } from '../../sim/flightPlanLoader';

beforeEach(() => { useSimStore.getState().reset(); useSimStore.getState().start(); });
afterEach(() => { setSimulationRuntimeForTests(mainThreadSimulationRuntime); vi.restoreAllMocks(); });

function delayed() {
  const calls: Array<{ input: SimulationStepInput; finish: (result: SimulationStepResult) => void }> = [];
  const runtime: AsyncSimulationRuntime = {
    kind: 'browser-worker', step: () => { throw new Error('wrong path'); },
    stepAsync: (input) => new Promise((finish) => { calls.push({ input: structuredClone(input), finish }); }),
  };
  setSimulationRuntimeForTests(runtime);
  return { calls, complete: (index: number) => { const call = calls[index]; call.finish(advanceSimulationBatch({ ...call.input, cloneAircraft: true }, call.input.steps ?? 1)); } };
}

async function dispatch(stub: ReturnType<typeof delayed>) {
  useSimStore.getState().tickAsync(16);
  await vi.waitFor(() => expect(stub.calls).toHaveLength(1));
}

describe('accepted commands at simulation boundaries', () => {
  it('AP disconnect fences an in-flight controller result', async () => {
    const ap = createDefaultAutopilotState(); ap.truth.autopilotStatus = 'CMD_A'; ap.boeing.cmdA = true;
    useSimStore.getState().setApState(ap);
    const stub = delayed(); await dispatch(stub);
    const previousGeneration = useSimStore.getState().asyncPhysicsGeneration;
    useSimStore.getState().setApState(null);
    const current = useSimStore.getState(); const generation = current.asyncPhysicsGeneration;
    const result = advanceSimulationBatch({ ...stub.calls[0].input, cloneAircraft: true }, 1);
    result.apControllerState.rollPid.value = 123;
    stub.calls[0].finish(result);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(useSimStore.getState().apControllerState).toBe(current.apControllerState);
    expect(useSimStore.getState().apState).toBeNull();
    expect(generation).toBeGreaterThan(previousGeneration);
  });
  it('EXEC fences the old route but staging remains inert', async () => {
    const fp = createRunwayToRunwayFlight({ originAirport: 'KSEA', originRunway: '16L', destinationAirport: 'KPDX', destinationRunway: '10R' });
    useSimStore.getState().setFlightPlan(fp);
    const stub = delayed(); await dispatch(stub);
    const generation = useSimStore.getState().asyncPhysicsGeneration;
    useSimStore.getState().stageDirectTo('KSEAKPDX_ENR');
    expect(useSimStore.getState().asyncPhysicsGeneration).toBe(generation);
    useSimStore.getState().executeRouteEdit();
    const executed = useSimStore.getState();
    stub.complete(0); await new Promise((resolve) => setTimeout(resolve, 0));
    expect(useSimStore.getState().routeStatus).toBe(executed.routeStatus);
    expect(useSimStore.getState().flightPlan).toBe(executed.flightPlan);
    expect(useSimStore.getState().asyncPhysicsGeneration).toBeGreaterThan(generation);
  });
  it('samples newer throttle at the next bounded chunk and records applied revisions', async () => {
    useSimStore.setState({ fixedStepAccumulatorSeconds: 32 / 60, lastFrameTime: 16, simRate: 4 });
    const stub = delayed(); await dispatch(stub);
    expect(stub.calls[0].input.steps).toBeLessThanOrEqual(16);
    useSimStore.getState().setInput({ throttle1: 0.8, throttle2: 0.8 });
    const accepted = useSimStore.getState().commandRevisions;
    stub.complete(0);
    await vi.waitFor(() => expect(stub.calls).toHaveLength(2));
    expect(stub.calls[1].input.pilotInputs.throttle1).toBe(0.8);
    stub.complete(1);
    await vi.waitFor(() => expect(useSimStore.getState().asyncPhysicsInFlight).toBe(false));
    const committed = useSimStore.getState().simulationCommit;
    expect(committed?.revisions.pilot).toBe(accepted.pilot);
    expect(committed?.stepIndex).toBe(32);
    expect(committed?.batchSteps).toBeLessThanOrEqual(16);
  });
  it('retains frames banked while waiting and their latest wall timestamp', async () => {
    const stub = delayed(); await dispatch(stub);
    useSimStore.getState().tickAsync(116);
    stub.complete(0);
    await vi.waitFor(() => expect(useSimStore.getState().asyncPhysicsInFlight).toBe(false));
    expect(useSimStore.getState().fixedStepAccumulatorSeconds).toBeCloseTo(0.1);
    expect(useSimStore.getState().lastFrameTime).toBe(116);
  });
  it('bounds accelerated synchronous catch-up and records dropped time', () => {
    const step = vi.fn((input: SimulationStepInput) => advanceSimulationBatch(input, input.steps ?? 1));
    setSimulationRuntimeForTests({ kind: 'main-thread', step });
    useSimStore.setState({ fixedStepAccumulatorSeconds: 100, simRate: 64, lastFrameTime: 16 });
    useSimStore.getState().tick(16);
    expect(step.mock.calls[0][0].steps).toBeLessThanOrEqual(128);
    expect(useSimStore.getState().droppedSimulationTimeSeconds).toBeGreaterThan(97);
  });
  it('held trim preserves newer intent without starving in-flight physics', async () => {
    useSimStore.setState({ fixedStepAccumulatorSeconds: 32 / 60, lastFrameTime: 16, simRate: 4 });
    const stub = delayed(); await dispatch(stub);
    const generation = useSimStore.getState().asyncPhysicsGeneration;
    const simulatedTrim = stub.calls[0].input.aircraft.config.stabilizerTrimUnits;
    useSimStore.getState().applyInputActions({ trimDelta: 1 }, 1 / 60);
    const requestedTrim = useSimStore.getState().inputManager.stabilizerTrimUnits;
    expect(requestedTrim).not.toBe(simulatedTrim);
    expect(useSimStore.getState().asyncPhysicsGeneration).toBe(generation);
    stub.complete(0);
    await vi.waitFor(() => expect(stub.calls).toHaveLength(2));
    expect(useSimStore.getState().aircraft.config.stabilizerTrimUnits).toBe(requestedTrim);
    expect(useSimStore.getState().simulationCommit?.observation.aircraft.config.stabilizerTrimUnits).toBe(simulatedTrim);
    expect(stub.calls[1].input.aircraft.config.stabilizerTrimUnits).toBe(requestedTrim);
    stub.complete(1);
    await vi.waitFor(() => expect(useSimStore.getState().asyncPhysicsInFlight).toBe(false));
  });
  it('excludes paused wall time from achieved rate and clears commits on reset', () => {
    const clock = vi.spyOn(performance, 'now'); clock.mockReturnValue(1000);
    useSimStore.getState().tick(16);
    clock.mockReturnValue(2000); useSimStore.getState().pause();
    clock.mockReturnValue(102000); useSimStore.getState().resume();
    expect(useSimStore.getState().simulationCommit?.achievedSimRate).toBeNull();
    clock.mockReturnValue(103000); useSimStore.getState().tick(16);
    expect(useSimStore.getState().simulationCommit?.achievedSimRate).toBeCloseTo(1 / 60);
    useSimStore.getState().reset();
    expect(useSimStore.getState().simulationCommit).toBeNull();
  });
  it('reports first application latency rather than aging the last command forever', () => {
    const clock = vi.spyOn(performance, 'now'); clock.mockReturnValue(1000);
    useSimStore.getState().setInput({ throttle1: 0.7 });
    clock.mockReturnValue(1100); useSimStore.getState().tick(16);
    expect(useSimStore.getState().simulationCommit?.commandLatencyMs).toBe(100);
    clock.mockReturnValue(2100); useSimStore.getState().tick(33);
    expect(useSimStore.getState().simulationCommit?.stepIndex).toBe(2);
    expect(useSimStore.getState().simulationCommit?.commandLatencyMs).toBe(100);
  });
  it('sync and worker-handler lanes commit equivalent explicit command schedules', async () => {
    const run = async (asyncLane: boolean) => {
      setSimulationRuntimeForTests(asyncLane ? workerHandlerSimulationRuntime : mainThreadSimulationRuntime);
      useSimStore.getState().reset(); useSimStore.getState().start();
      const base = useSimStore.getState().commandRevisions;
      const snapshots = [];
      for (const command of [
        () => useSimStore.getState().setInput({ throttle1: 0.6, throttle2: 0.6 }),
        () => useSimStore.getState().setApState(createDefaultAutopilotState()),
        () => useSimStore.getState().setApState(null),
        () => useSimStore.getState().setFlightPlan(createRunwayToRunwayFlight({ originAirport: 'KSEA', originRunway: '16L', destinationAirport: 'KPDX', destinationRunway: '10R' })),
        () => { useSimStore.getState().stageDirectTo('KSEAKPDX_ENR'); useSimStore.getState().executeRouteEdit(); },
        () => useSimStore.getState().applyInputActions({ trimDelta: 0.2 }, 1 / 60),
      ]) {
        command();
        useSimStore.setState({ lastFrameTime: 16, fixedStepAccumulatorSeconds: 1 / 60 });
        if (asyncLane) { useSimStore.getState().tickAsync(16); await vi.waitFor(() => expect(useSimStore.getState().asyncPhysicsInFlight).toBe(false)); }
        else useSimStore.getState().tick(16);
        const s = useSimStore.getState(); const commit = s.simulationCommit!;
        snapshots.push(structuredClone({ aircraft: s.aircraft, controllers: s.apControllerState, route: s.routeStatus,
          guidance: s.guidance, step: commit.stepIndex, applied: Object.fromEntries(Object.entries(commit.revisions).map(([key, value]) => [key, value - base[key as keyof typeof base]])) }));
      }
      return snapshots;
    };
    expect(await run(true)).toEqual(await run(false));
  });
});
