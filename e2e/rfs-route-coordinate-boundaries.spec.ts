import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

// Seeded coordinate-boundary integration; separate from continuous flight proof.
test('actual worker preserves short dateline and polar routes, duplicates and controlled antipodes', async ({ page }, testInfo) => {
  await page.goto('/e2e/fixtures/runtime.html');
  const evidence = await page.evaluate(async () => {
    const storePath = '/src/store/simStore.ts'; const runtimePath = '/src/sim/simulationRuntime.ts';
    const stepPath = '/src/sim/simulationStep.ts'; const navPath = '/src/sim/systems/navigation.ts';
    const { useSimStore } = await import(/* @vite-ignore */ storePath);
    const { createSimulationRuntime } = await import(/* @vite-ignore */ runtimePath);
    const { advanceSimulationBatch } = await import(/* @vite-ignore */ stepPath);
    const { computeRouteStatus } = await import(/* @vite-ignore */ navPath);
    let fallbackCalls = 0;
    const runtime = createSimulationRuntime({ env: { VITE_RFS_WORKER_PHYSICS: '1' }, workerTimeoutMs: 10000,
      fallback: { kind: 'main-thread', step: () => { fallbackCalls++; throw new Error('coordinate qualification cannot substitute fallback'); } } });
    if (runtime.kind !== 'browser-worker') throw new Error('actual coordinate worker unavailable');
    const rows = [];
    try {
      for (const [name, points] of [
        ['dateline', [[0, 179], [0, -179]]], ['polar', [[89, -90], [89, 90]]],
        ['duplicate', [[0, 0], [0, 0], [0, 1]]], ['antipodal', [[0, 0], [0, 180]]],
      ] as const) {
        useSimStore.getState().reset(); const s = useSimStore.getState();
        const aircraft = structuredClone(s.aircraft); aircraft.position = { lat: points[0][0], lon: points[0][1], alt: 10000 };
        aircraft.ground.weightOnWheels = false; aircraft.ground.contact = 'none';
        const flightPlan = { origin: 'ORIG', destination: 'DEST', flightNumber: 'GEOTEST', route: 'ORIG DEST',
          waypoints: points.map(([lat, lon], index) => ({ ident: `P${index}`, lat, lon, discontinuity: false })) };
        const routeStatus = computeRouteStatus(aircraft, flightPlan, 0);
        const input = { aircraft, spec: s.spec, pilotInputs: s.pilotInputs, apState: null, flightPlan, activeLegIndex: 0,
          routeStatus, wind: null, weather: s.weather, dt: 1 / 60, steps: 2, status: 'running',
          selectedScenarioId: s.selectedScenarioId, guidance: s.guidance, apControllerState: s.apControllerState };
        const expected = advanceSimulationBatch(input, 2); const actual = await runtime.stepAsync(input);
        rows.push({ name, before: routeStatus, after: actual.routeStatus, parity: JSON.stringify(actual) === JSON.stringify(expected),
          position: actual.aircraft.position, simTimeMs: actual.aircraft.simTime });
      }
      return { rows, fallbackCalls, backend: runtime.kind, health: runtime.diagnosticState?.() };
    } finally { runtime.dispose(); }
  });
  expect(evidence.backend).toBe('browser-worker'); expect(evidence.fallbackCalls).toBe(0);
  expect(evidence.health?.executionBackend).toBe('browser-worker');
  for (const row of evidence.rows) {
    expect(row.parity, row.name).toBe(true); expect(row.simTimeMs).toBeGreaterThan(0);
    expect(Number.isFinite(row.position.lat) && Number.isFinite(row.position.lon)).toBe(true);
    expect(Math.abs(row.position.lat)).toBeLessThanOrEqual(90); expect(Math.abs(row.position.lon)).toBeLessThanOrEqual(180);
  }
  for (const name of ['dateline', 'polar']) {
    const row = evidence.rows.find((r) => r.name === name)!;
    expect(row.before.distanceToNextM).toBeCloseTo(6371000 * Math.PI / 90, 3);
    expect(row.after.lnavAvailable).toBe(true);
  }
  expect(evidence.rows[0].after.desiredTrackDegTrue).toBeCloseTo(90, 3);
  expect(evidence.rows.find((r) => r.name === 'duplicate')!.after.activeLegIndex).toBe(1);
  expect(evidence.rows.find((r) => r.name === 'antipodal')!.after.lnavUnavailableReason).toMatch(/antipodal/);
  const path = testInfo.outputPath('native-route-coordinate-qualification.json');
  await writeFile(path, JSON.stringify(evidence, null, 2));
  await testInfo.attach('native-route-coordinate-qualification', { path, contentType: 'application/json' });
});

test('malformed browser route imports reject before changing the active session', async ({ page }) => {
  await page.goto('/e2e/fixtures/runtime.html');
  const results = await page.evaluate(async () => {
    const path = '/src/store/simStore.ts'; const { useSimStore } = await import(/* @vite-ignore */ path);
    useSimStore.getState().start(); useSimStore.getState().pause();
    return [[91, 0], [0, -181], [0, NaN], [undefined, 0], [0, undefined], [null, 0], [0, null], [null, null]].map(([lat, lon]) => {
      const before = useSimStore.getState(); let rejected = false;
      try { before.setFlightPlan({ origin: 'BAD', destination: 'DEST', flightNumber: '', route: 'BAD DEST',
        waypoints: [{ ident: 'BAD', lat, lon, discontinuity: false }, { ident: 'DEST', lat: 0, lon: 1, discontinuity: false }] }); }
      catch (error) { rejected = error instanceof Error && /coordinates|flight plan/i.test(error.message); }
      return { rejected, sameState: useSimStore.getState() === before };
    });
  });
  expect(results).toEqual(Array.from({ length: 8 }, () => ({ rejected: true, sameState: true })));
});
