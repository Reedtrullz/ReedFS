import { describe, expect, it, vi } from 'vitest';
import { useSimStore } from '../simStore';
import { setSimulationRuntimeForTests, type AsyncSimulationRuntime } from '../../sim/simulationRuntime';
import type { SimulationStepInput } from '../../sim/simulationStep';
import { B737_800_SPEC, createInitialState } from '../../sim/types';
import { buildGuidanceState } from '../../sim/guidanceState';
import { ENVA_TUTORIAL_SCENARIO } from '../../sim/scenarios';
import { createNoRouteStatus } from '../../sim/systems/navigation';
import { createAutopilotControllerState } from '../../sim/systems/autopilot';

function asyncRuntimeStub() {
  const calls: Array<{ aircraftAltFt: number }> = [];
  const stepsRequested: number[] = [];
  return {
    calls,
    stepsRequested,
    runtime: {
      kind: 'browser-worker' as const,
      step: () => { throw new Error('sync step should not be used by tickAsync'); },
      stepAsync: (input: SimulationStepInput) => {
        calls.push({ aircraftAltFt: input.aircraft.position.alt });
        stepsRequested.push(input.steps ?? 1);
        const result = {
          aircraft: structuredClone(input.aircraft),
          routeStatus: createNoRouteStatus(),
          activeLegIndex: null,
          apCommands: {},
          controls: { pilotInputs: {} as never, apCommands: {}, effectiveControls: {} as never, inputs: {} as never },
          guidance: input.guidance,
          apControllerState: input.apControllerState ?? createAutopilotControllerState(),
        };
        return Promise.resolve(result);
      },
    } satisfies AsyncSimulationRuntime,
  };
}

function seedRunningScenario() {
  const aircraft = createInitialState(B737_800_SPEC);
  const pilotInputs = {
    elevator: 0, aileron: 0, rudder: 0, throttle1: 0.3, throttle2: 0.3,
    flapLever: 0, gearLever: 'DOWN' as const, spoilers: 0, brake: 0,
  };
  useSimStore.setState({
    status: 'running',
    lastFrameTime: 0,
    fixedStepAccumulatorSeconds: 0,
    simulationTimeSeconds: 0,
    droppedSimulationTimeSeconds: 0,
    simRate: 1,
    aircraft,
    pilotInputs,
    flightPlan: null,
    activeLegIndex: null,
    routeStatus: createNoRouteStatus(),
    guidance: buildGuidanceState({ scenario: ENVA_TUTORIAL_SCENARIO, status: 'running', aircraft, controls: pilotInputs }),
    apState: null,
    apControllerState: {
      pitch: { integrator: 0, lastMeasurement: 0 },
      roll: { integrator: 0, lastMeasurement: 0 },
      thrust: { integrator: 0, lastMeasurement: 0 },
    } as never,
  });
}

describe('tickAsync bridge', () => {
  it('falls back to synchronous tick when the active runtime has no stepAsync', async () => {
    const restore = setSimulationRuntimeForTests({ kind: 'main-thread', step: (input) => ({ aircraft: structuredClone(input.aircraft), routeStatus: createNoRouteStatus(), activeLegIndex: null, apCommands: {}, controls: { pilotInputs: input.pilotInputs, apCommands: {}, effectiveControls: input.pilotInputs, inputs: input.pilotInputs }, guidance: input.guidance, apControllerState: input.apControllerState ?? createAutopilotControllerState() }) });
    seedRunningScenario();
    useSimStore.getState().tickAsync(16);
    await Promise.resolve();
    expect(useSimStore.getState().asyncPhysicsInFlight).toBe(false);
    expect(useSimStore.getState().simulationTimeSeconds).toBeGreaterThan(0);
    restore();
  });

  it('dispatches one fixed-step batch through stepAsync and applies results without stale state', async () => {
    const stub = asyncRuntimeStub();
    const restore = setSimulationRuntimeForTests(stub.runtime);
    seedRunningScenario();
    useSimStore.setState({ fixedStepAccumulatorSeconds: 3 * (1 / 60), lastFrameTime: 16 });
    useSimStore.getState().tickAsync(16);
    await vi.waitFor(() => expect(useSimStore.getState().asyncPhysicsInFlight).toBe(false));
    expect(stub.calls.length).toBe(1);
    expect(stub.stepsRequested[0]).toBe(3);
    expect(useSimStore.getState().simulationTimeSeconds).toBeCloseTo(3 / 60, 6);
    expect(useSimStore.getState().fixedStepAccumulatorSeconds).toBeCloseTo(0, 6);
    restore();
  });

  it('uses the async path through an async runtime so sync fallback is not silently used', async () => {
    const stub = asyncRuntimeStub();
    const restore = setSimulationRuntimeForTests(stub.runtime);
    seedRunningScenario();
    useSimStore.setState({ fixedStepAccumulatorSeconds: 2 * (1 / 60), lastFrameTime: 16 });
    useSimStore.getState().tickAsync(16);
    expect(useSimStore.getState().asyncPhysicsInFlight).toBe(true);
    await vi.waitFor(() => expect(useSimStore.getState().asyncPhysicsInFlight).toBe(false));
    expect(stub.calls.length).toBe(1);
    expect(stub.stepsRequested[0]).toBe(2);
    expect(useSimStore.getState().simulationTimeSeconds).toBeCloseTo(2 / 60, 6);
    expect(useSimStore.getState().fixedStepAccumulatorSeconds).toBeCloseTo(0, 6);
    restore();
  });

  it('discards in-flight results when reset bumps the generation', async () => {
    const stub = asyncRuntimeStub();
    const restore = setSimulationRuntimeForTests(stub.runtime);
    seedRunningScenario();
    useSimStore.setState({ fixedStepAccumulatorSeconds: 3 * (1 / 60) });
    useSimStore.getState().tickAsync(16);
    const inFlight = useSimStore.getState().asyncPhysicsInFlight;
    useSimStore.getState().reset();
    expect(useSimStore.getState().asyncPhysicsGeneration).toBe(1);
    expect(useSimStore.getState().asyncPhysicsInFlight).toBe(false);
    await vi.waitFor(() => expect(stub.calls.length).toBeGreaterThan(0));
    await Promise.resolve();
    expect(useSimStore.getState().status).toBe('stopped');
    expect(inFlight).toBe(true);
    restore();
  });

  it('coalesces frames while a batch is in flight instead of queueing a second batch', async () => {
    const stub = asyncRuntimeStub();
    const restore = setSimulationRuntimeForTests(stub.runtime);
    seedRunningScenario();
    useSimStore.setState({ fixedStepAccumulatorSeconds: 3 * (1 / 60), lastFrameTime: 16 });
    useSimStore.getState().tickAsync(16);
    useSimStore.getState().tickAsync(32);
    useSimStore.getState().tickAsync(48);
    expect(useSimStore.getState().asyncPhysicsInFlight).toBe(true);
    await vi.waitFor(() => expect(useSimStore.getState().asyncPhysicsInFlight).toBe(false));
    expect(stub.calls.length).toBe(1);
    expect(stub.stepsRequested[0]).toBe(3);
    restore();
  });
  it('preserves pilot input changes that land while a batch is in flight', async () => {
    const stub = asyncRuntimeStub();
    const restore = setSimulationRuntimeForTests(stub.runtime);
    seedRunningScenario();
    useSimStore.setState({ fixedStepAccumulatorSeconds: 2 * (1 / 60), lastFrameTime: 16 });
    useSimStore.getState().tickAsync(16);
    // Simulate an ArrowUp throttle press landing mid-flight, as a real keydown
    // would while the worker round trip is pending.
    useSimStore.setState({ pilotInputs: { ...useSimStore.getState().pilotInputs, throttle1: 1, throttle2: 1 } });
    await vi.waitFor(() => expect(useSimStore.getState().asyncPhysicsInFlight).toBe(false));
    expect(useSimStore.getState().pilotInputs.throttle1).toBe(1);
    expect(useSimStore.getState().pilotInputs.throttle2).toBe(1);
    expect(useSimStore.getState().effectiveControls.throttle1).toBe(1);
    expect(useSimStore.getState().simulationTimeSeconds).toBeCloseTo(2 / 60, 6);
    restore();
  });
});
