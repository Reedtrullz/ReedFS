import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { openRfs } from './helpers/rfsPage';

test('actual worker preserves independent idle, cutoff, depletion and effective-weather parity', async ({ page }, testInfo) => {
  await page.goto('/e2e/fixtures/runtime.html');
  const evidence = await page.evaluate(async () => {
    const storePath = '/src/store/simStore.ts'; const runtimePath = '/src/sim/simulationRuntime.ts';
    const stepPath = '/src/sim/simulationStep.ts'; const fdmPath = '/src/sim/data/aircraft/b737-800-fdm.v1.ts';
    const { useSimStore } = await import(/* @vite-ignore */ storePath);
    const { createSimulationRuntime } = await import(/* @vite-ignore */ runtimePath);
    const { advanceSimulationBatch } = await import(/* @vite-ignore */ stepPath);
    const { B737_800_FDM } = await import(/* @vite-ignore */ fdmPath);
    let fallbackCalls = 0;
    const runtime = createSimulationRuntime({ env: { VITE_RFS_WORKER_PHYSICS: '1' }, workerTimeoutMs: 10000,
      fallback: { kind: 'main-thread', step: () => { fallbackCalls++; throw new Error('engine boundary cannot substitute fallback'); } } });
    if (runtime.kind !== 'browser-worker') throw new Error('actual engine worker unavailable');
    const receipts = [];
    try {
      for (const name of ['idle', 'cutoff', 'depleted', 'cold', 'standard', 'hot']) {
        useSimStore.getState().reset(); const s = useSimStore.getState();
        const aircraft = structuredClone(s.aircraft);
        for (const engine of aircraft.engines) Object.assign(engine, { n1: B737_800_FDM.engine.idleN1Percent, n2: B737_800_FDM.engine.idleN2Percent, running: true });
        if (name === 'depleted') aircraft.fuel = { centerTank: 0, leftTank: 0, rightTank: 0, totalFuel: 0, fuelFlowTotal: 0 };
        const surfaceTemperatureC = name === 'cold' ? -5 : name === 'hot' ? 35 : 15;
        const input = { aircraft, spec: s.spec, pilotInputs: { ...s.pilotInputs, throttle1: name === 'cutoff' ? 1 : 0, throttle2: 0,
          fuelCutoff1: name === 'cutoff', fuelCutoff2: false }, apState: null,
          flightPlan: null, activeLegIndex: null, routeStatus: s.routeStatus, wind: null,
          weather: { ...s.weather, qnhHpa: 1013.25, surfaceTemperatureC }, dt: 1 / 60, steps: 64, status: 'running',
          selectedScenarioId: s.selectedScenarioId, guidance: s.guidance, apControllerState: s.apControllerState };
        const expected = advanceSimulationBatch(input, 64);
        const actual = await runtime.stepAsync(input);
        receipts.push({ name, parity: JSON.stringify(actual) === JSON.stringify(expected), engines: actual.aircraft.engines,
          simTimeMs: actual.aircraft.simTime, fuelFlowTotal: actual.aircraft.fuel.fuelFlowTotal });
      }
      return { receipts, fallbackCalls, backend: runtime.kind, idleN1: B737_800_FDM.engine.idleN1Percent, userAgent: navigator.userAgent };
    } finally { runtime.dispose(); }
  });
  expect(evidence.backend).toBe('browser-worker'); expect(evidence.fallbackCalls).toBe(0);
  for (const row of evidence.receipts) { expect(row.parity, row.name).toBe(true); expect(row.simTimeMs).toBeGreaterThan(1000); }
  const find = (name: string) => evidence.receipts.find((row) => row.name === name)!;
  for (const engine of find('idle').engines) { expect(engine.running).toBe(true); expect(engine.n1).toBeCloseTo(evidence.idleN1, 6); expect(engine.fuelFlow).toBeGreaterThan(0); }
  expect(find('cutoff').engines[0]).toMatchObject({ running: false, thrust: 0, fuelFlow: 0 });
  expect(find('cutoff').engines[1].running).toBe(true);
  for (const engine of find('depleted').engines) expect(engine).toMatchObject({ running: false, thrust: 0, fuelFlow: 0 });
  expect(find('cold').engines[0].thrust).toBeGreaterThan(find('standard').engines[0].thrust);
  expect(find('standard').engines[0].thrust).toBeGreaterThan(find('hot').engines[0].thrust);
  const path = testInfo.outputPath('native-engine-operating-qualification.json');
  await writeFile(path, JSON.stringify(evidence, null, 2) + '\n'); await testInfo.attach('native-engine-operating-qualification', { path, contentType: 'application/json' });
});

test('visible fuel commands remain independent through throttle and takeoff setup changes', async ({ page }) => {
  await openRfs(page);
  const setup = page.getByRole('region', { name: 'Takeoff setup' });
  await setup.getByText('Engine fuel', { exact: true }).click();
  const left = setup.getByRole('button', { name: 'Engine 1 fuel cutoff' });
  const right = setup.getByRole('button', { name: 'Engine 2 fuel cutoff' });
  await expect(left).toHaveAttribute('aria-pressed', 'false'); await expect(right).toHaveAttribute('aria-pressed', 'false');
  await left.click(); await expect(left).toHaveText('L fuel: CUTOFF');
  await setup.getByRole('button', { name: 'Throttle Up' }).click();
  await setup.getByRole('button', { name: 'Set takeoff config' }).click();
  await expect(left).toHaveAttribute('aria-pressed', 'true'); await expect(right).toHaveAttribute('aria-pressed', 'false');
  await left.click(); await expect(left).toHaveText('L fuel: ON');
});
