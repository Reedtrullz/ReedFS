import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

// Bounded instrumentation lane, not flight fidelity or device qualification.
test('measure actual worker batch cost with fallback forbidden', async ({ page }, testInfo) => {
  await page.goto('/e2e/fixtures/runtime.html');
  const measurements = await page.evaluate(async () => {
    const storePath = '/src/store/simStore.ts'; const runtimePath = '/src/sim/simulationRuntime.ts';
    const { useSimStore } = await import(/* @vite-ignore */ storePath);
    const { createSimulationRuntime } = await import(/* @vite-ignore */ runtimePath);
    const runtime = createSimulationRuntime({ env: { VITE_RFS_WORKER_PHYSICS: '1' }, workerTimeoutMs: 10000,
      fallback: { kind: 'main-thread', step: () => { throw new Error('measurement cannot substitute fallback'); } } });
    if (runtime.kind !== 'browser-worker') throw new Error('actual browser worker unavailable');
    const s = useSimStore.getState();
    const input = { aircraft: s.aircraft, spec: s.spec, pilotInputs: s.pilotInputs, apState: s.apState,
      flightPlan: s.flightPlan, activeLegIndex: s.activeLegIndex, routeStatus: s.routeStatus,
      wind: s.wind, weather: s.weather, dt: 1 / 60, status: 'running', selectedScenarioId: s.selectedScenarioId,
      guidance: s.guidance, apControllerState: s.apControllerState, cloneAircraft: true };
    const sample = async (steps: number) => { const start = performance.now(); await runtime.stepAsync({ ...input, steps }); return performance.now() - start; };
    try {
      const coldMs = await sample(1);
      const batches: Array<{ steps: number; durationsMs: number[] }> = [];
      for (const steps of [16, 64, 128]) { const durationsMs = []; for (let repeat = 0; repeat < 5; repeat++) durationsMs.push(await sample(steps)); batches.push({ steps, durationsMs }); }
      return { coldMs, batches, userAgent: navigator.userAgent, hardwareConcurrency: navigator.hardwareConcurrency };
    } finally { runtime.dispose(); }
  });
  expect(measurements.batches.flatMap((row) => row.durationsMs).every((value) => Number.isFinite(value) && value >= 0)).toBe(true);
  await testInfo.attach('native-worker-batch-cost', { body: JSON.stringify(measurements, null, 2), contentType: 'application/json' });
  await writeFile(testInfo.outputPath('native-worker-batch-measurements.json'), JSON.stringify(measurements, null, 2) + '\n');
});

test('commands accepted during actual worker turns fence stale modes, routes, pause and reset', async ({ page }, testInfo) => {
  await page.goto('/e2e/fixtures/runtime.html');
  const evidence = await page.evaluate(async () => {
    const storePath = '/src/store/simStore.ts'; const runtimePath = '/src/sim/simulationRuntime.ts';
    const apPath = '/src/instruments/defaultAutopilotState.ts'; const planPath = '/src/sim/flightPlanLoader.ts';
    const { useSimStore } = await import(/* @vite-ignore */ storePath);
    const { createSimulationRuntime, setSimulationRuntimeForTests } = await import(/* @vite-ignore */ runtimePath);
    const { createDefaultAutopilotState } = await import(/* @vite-ignore */ apPath);
    const { createRunwayToRunwayFlight } = await import(/* @vite-ignore */ planPath);
    const receipts: Array<Record<string, unknown>> = [];
    const waitFor = async (predicate: () => boolean) => {
      const deadline = performance.now() + 10000;
      while (!predicate()) { if (performance.now() > deadline) throw new Error('runtime fixture deadline'); await new Promise((resolve) => setTimeout(resolve, 5)); }
    };
    for (const command of ['disconnect', 'exec', 'throttle', 'pause', 'reset', 'takeoff-config']) {
      useSimStore.getState().reset(); useSimStore.getState().start();
      const ap = createDefaultAutopilotState(); ap.truth.autopilotStatus = 'CMD_A'; ap.boeing.cmdA = true;
      useSimStore.getState().setApState(ap);
      if (command === 'takeoff-config') { useSimStore.getState().setApState(null); useSimStore.getState().applyInputActions({ trimDelta: 1 }, 1 / 60); }
      useSimStore.getState().setFlightPlan(createRunwayToRunwayFlight({ originAirport: 'KSEA', originRunway: '16L', destinationAirport: 'KPDX', destinationRunway: '10R' }));
      useSimStore.setState({ fixedStepAccumulatorSeconds: 32 / 60, lastFrameTime: 16, simRate: 64 });
      let nativeResponses = 0; let fallbackCalls = 0;
      const runtime = createSimulationRuntime({ env: { VITE_RFS_WORKER_PHYSICS: '1' }, workerTimeoutMs: 10000,
        fallback: { kind: 'main-thread', step: () => { fallbackCalls++; throw new Error('fallback forbidden in actual worker lane'); } } });
      if (runtime.kind !== 'browser-worker' || !('stepAsync' in runtime)) throw new Error('native worker unavailable');
      const nativeStep = runtime.stepAsync as (input: unknown) => Promise<unknown>;
      const turns: Array<{ input: { steps: number; pilotInputs: { throttle1: number } }; release: () => void }> = [];
      const wrapper = { kind: runtime.kind, step: runtime.step.bind(runtime), stepAsync: async (input: unknown) => {
        let release = () => {}; const barrier = new Promise<void>((resolve) => { release = resolve; });
        turns.push({ input: structuredClone(input) as typeof turns[number]['input'], release });
        const result = await nativeStep.call(runtime, input); nativeResponses++;
        await barrier; return result;
      } };
      const restore = setSimulationRuntimeForTests(wrapper);
      try {
        useSimStore.getState().tickAsync(16); await waitFor(() => turns.length === 1);
        const generation = useSimStore.getState().asyncPhysicsGeneration;
        const acceptedAt = performance.now();
        if (command === 'disconnect') useSimStore.getState().setApState(null);
        if (command === 'exec') { useSimStore.getState().stageDirectTo('KSEAKPDX_ENR'); useSimStore.getState().executeRouteEdit(); }
        if (command === 'throttle') useSimStore.getState().setInput({ throttle1: 0.8, throttle2: 0.8 });
        if (command === 'pause') useSimStore.getState().pause();
        if (command === 'reset') useSimStore.getState().reset();
        if (command === 'takeoff-config') useSimStore.getState().setTakeoffConfig();
        const accepted = useSimStore.getState(); const aircraft = accepted.aircraft; const route = accepted.routeStatus; const controller = accepted.apControllerState;
        // Artificial delivery barrier lets commands race a real worker result.
        // It is distinct from the production watchdog and a performance claim.
        turns[0].release();
        // Exercise a late observer: both real replies may precede the first poll.
        // The second publication still waits on its barrier; no receipt is faked.
        if (command === 'throttle') await waitFor(() => nativeResponses >= 2);
        await waitFor(() => nativeResponses >= 1);
        if (command === 'throttle') {
          await waitFor(() => turns.length === 2); turns[1].release();
          await waitFor(() => !useSimStore.getState().asyncPhysicsInFlight);
          const s = useSimStore.getState();
          receipts.push({ command, newerThrottle: turns[1].input.pilotInputs.throttle1, applied: s.simulationCommit?.revisions.pilot,
            accepted: accepted.commandRevisions.pilot, steps: turns.map((turn) => turn.input.steps), stepIndex: s.simulationCommit?.stepIndex,
            commandLatencyMs: s.simulationCommit?.commandLatencyMs, observedWallMs: performance.now() - acceptedAt, nativeResponses, fallbackCalls });
        } else {
          await new Promise((resolve) => setTimeout(resolve, 20));
          const s = useSimStore.getState();
          receipts.push({ command, fenced: s.asyncPhysicsGeneration > generation, unchangedAircraft: s.aircraft === aircraft,
            unchangedRoute: s.routeStatus === route, unchangedController: s.apControllerState === controller,
            oldCommitRejected: s.simulationCommit === null, status: s.status, apDisconnected: command !== 'disconnect' || s.apState === null,
            reservedTimeRetained: command !== 'takeoff-config' || Math.abs(s.fixedStepAccumulatorSeconds - 32 / 60) < 1e-9,
            nativeResponses, fallbackCalls });
        }
      } finally { restore(); runtime.dispose(); }
    }
    return receipts;
  });
  for (const row of evidence) {
    expect(row.fallbackCalls).toBe(0); expect(row.nativeResponses).toBe(row.command === 'throttle' ? 2 : 1);
    if (row.command === 'throttle') {
      expect(row.newerThrottle).toBe(0.8); expect(row.applied).toBe(row.accepted);
      expect(row.steps).toEqual([16, 16]); expect(row.stepIndex).toBe(32);
      expect(Number(row.commandLatencyMs)).toBeGreaterThanOrEqual(0);
    } else {
      expect(row.fenced).toBe(true); expect(row.unchangedAircraft).toBe(true); expect(row.unchangedRoute).toBe(true);
      expect(row.unchangedController).toBe(true); expect(row.oldCommitRejected).toBe(true); expect(row.apDisconnected).toBe(true);
      expect(row.reservedTimeRetained).toBe(true);
      if (row.command === 'pause') expect(row.status).toBe('paused');
      if (row.command === 'reset') expect(row.status).toBe('stopped');
    }
  }
  await testInfo.attach('native-worker-command-receipts', { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' });
});
