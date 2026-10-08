import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

test('actual worker preserves finite flap extension and retraction with synchronous parity', async ({ page }, testInfo) => {
  await page.goto('/e2e/fixtures/runtime.html');
  const evidence = await page.evaluate(async () => {
    const storePath = '/src/store/simStore.ts'; const runtimePath = '/src/sim/simulationRuntime.ts';
    const stepPath = '/src/sim/simulationStep.ts';
    const { useSimStore } = await import(/* @vite-ignore */ storePath);
    const { createSimulationRuntime } = await import(/* @vite-ignore */ runtimePath);
    const { advanceSimulationBatch } = await import(/* @vite-ignore */ stepPath);
    let fallbackCalls = 0;
    const runtime = createSimulationRuntime({ env: { VITE_RFS_WORKER_PHYSICS: '1' }, workerTimeoutMs: 10000,
      fallback: { kind: 'main-thread', step: () => { fallbackCalls++; throw new Error('flap transit cannot substitute fallback'); } } });
    if (runtime.kind !== 'browser-worker') throw new Error('actual flap worker unavailable');
    const rows = [];
    try {
      for (const [initial, target] of [[0, 40], [40, 0]]) {
        useSimStore.getState().reset(); const s = useSimStore.getState();
        const aircraft = structuredClone(s.aircraft);
        aircraft.position.alt = 10000; aircraft.velocity = { u: 100, v: 0, w: 5 };
        aircraft.ground.weightOnWheels = false; aircraft.ground.contact = 'none';
        aircraft.config.flapSetting = initial; aircraft.config.gearDown = false; aircraft.config.gearPosition = 0;
        let input = { aircraft, spec: s.spec, pilotInputs: { ...s.pilotInputs, flapLever: target,
          gearLever: 'UP', throttle1: .6, throttle2: .6, fuelCutoff1: false, fuelCutoff2: false }, apState: null,
          flightPlan: null, activeLegIndex: null, routeStatus: s.routeStatus, wind: null, weather: s.weather,
          dt: 1 / 60, steps: 16, status: 'running', selectedScenarioId: s.selectedScenarioId,
          guidance: s.guidance, apControllerState: s.apControllerState };
        let parity = true; let finite = true; const positions = [initial];
        for (let chunk = 0; chunk < 31; chunk++) {
          const expected = advanceSimulationBatch(structuredClone(input), 16); const actual = await runtime.stepAsync(input);
          parity &&= JSON.stringify(actual) === JSON.stringify(expected);
          finite &&= [...Object.values(actual.aircraft.velocity), ...Object.values(actual.aircraft.attitude),
            ...Object.values(actual.aircraft.position)].every(Number.isFinite);
          positions.push(actual.aircraft.config.flapSetting);
          input = { ...input, aircraft: actual.aircraft, routeStatus: actual.routeStatus,
            guidance: actual.guidance, apControllerState: actual.apControllerState };
        }
        rows.push({ initial, target, positions, parity, finite, simTimeMs: input.aircraft.simTime });
      }
      return { rows, fallbackCalls, health: runtime.diagnosticState?.() };
    } finally { runtime.dispose(); }
  });
  expect(evidence.fallbackCalls).toBe(0); expect(evidence.health?.executionBackend).toBe('browser-worker');
  for (const row of evidence.rows) {
    expect(row.parity).toBe(true); expect(row.finite).toBe(true); expect(row.positions.at(-1)).toBeCloseTo(row.target, 8);
    expect(row.simTimeMs).toBeGreaterThan(8000);
    expect(row.positions.every((position, i) => i === 0 || (row.target > row.initial
      ? position >= row.positions[i - 1] : position <= row.positions[i - 1]))).toBe(true);
  }
  const path = testInfo.outputPath('native-flap-transit-qualification.json');
  await writeFile(path, JSON.stringify(evidence, null, 2));
  await testInfo.attach('native-flap-transit-qualification', { path, contentType: 'application/json' });
});
