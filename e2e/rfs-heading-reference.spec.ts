import { writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { openRfs } from './helpers/rfsPage';

// Read-only observation of the real UI-owned flight. Commands use visible controls.
async function observe(page: Page) {
  return page.evaluate(async () => {
    const storePath = '/src/store/simStore.ts'; const selectorsPath = '/src/store/selectors.ts';
    const headingPath = '/src/sim/headingDisplay.ts'; const runtimePath = '/src/sim/simulationRuntime.ts';
    const cohortPath = '/src/config/buildIdentity.ts';
    const defaultApPath = '/src/instruments/defaultAutopilotState.ts';
    const { useSimStore } = await import(/* @vite-ignore */ storePath);
    const { pfdObservation } = await import(/* @vite-ignore */ selectorsPath);
    const { headingDisplayContext, headingDisplayText } = await import(/* @vite-ignore */ headingPath);
    const { getSimulationRuntime } = await import(/* @vite-ignore */ runtimePath);
    const { APP_BUILD_COHORT } = await import(/* @vite-ignore */ cohortPath);
    const { createDefaultAutopilotStateFromAircraft } = await import(/* @vite-ignore */ defaultApPath);
    const state = useSimStore.getState(); const observed = pfdObservation(state);
    const trueTarget = state.apState?.boeing.heading ?? createDefaultAutopilotStateFromAircraft(state.aircraft, state.wind).boeing.heading;
    const context = headingDisplayContext(observed.aircraft, 'magnetic');
    return { status: state.status, aircraft: state.aircraft, apState: state.apState, trueTarget,
      route: state.flightPlan, routeStatus: state.routeStatus, wind: state.wind, weather: state.weather,
      generation: state.asyncPhysicsGeneration, commandRevisions: state.commandRevisions,
      configuredCohort: APP_BUILD_COHORT, runtime: getSimulationRuntime().diagnosticState?.(), failure: Boolean(state.simulationFailure),
      context, trueLabel: headingDisplayText(trueTarget, headingDisplayContext(observed.aircraft, 'true')),
      magneticLabel: headingDisplayText(trueTarget, context) };
  });
}

test('actual worker flight keeps true orientation and targets while magnetic surface presentation converts one MCP step', async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  await openRfs(page);
  await page.getByRole('button', { name: 'START ROLL', exact: true }).click();
  const startup: unknown[] = []; const started = performance.now();
  try {
    await expect.poll(async () => {
      const value = await observe(page); startup.push({ elapsedMs: performance.now() - started, ...value });
      return value.runtime?.executionBackend === 'browser-worker' && value.aircraft.simTime > 0 && !value.failure;
    }, { timeout: 15000 }).toBe(true);
  } finally {
    const path = testInfo.outputPath('heading-startup-progress.json');
    await writeFile(path, JSON.stringify(startup, null, 2));
    await testInfo.attach('heading-startup-progress', { path, contentType: 'application/json' });
  }
  await page.getByRole('button', { name: 'PAUSE', exact: true }).click();
  await expect(page.getByRole('button', { name: 'RESUME', exact: true })).toBeVisible();
  const before = await observe(page);
  expect(before.runtime?.observedWorkerCohort).toBe(before.configuredCohort);
  expect(before.context.reference).toBe('magnetic'); expect(Math.abs(before.context.variationEastDeg!)).toBeGreaterThan(1);
  await page.getByText('Heading reference: TRUE', { exact: true }).click();
  await page.getByLabel('Heading reference', { exact: true }).selectOption('magnetic');
  const mcp = page.getByRole('region', { name: 'Mode control panel', exact: true });
  await expect(mcp).toContainText(`HDG ${before.magneticLabel}`);
  await expect(page.getByLabel('PFD heading', { exact: true })).toContainText('M SFC');
  const toggled = await observe(page);
  for (const key of ['aircraft', 'apState', 'route', 'routeStatus', 'weather', 'wind', 'generation', 'commandRevisions'] as const) {
    expect(toggled[key], key).toEqual(before[key]);
  }
  await page.getByLabel('HDG +5', { exact: true }).click();
  const stepped = await observe(page);
  const displayed = Number(before.magneticLabel.slice(0, 3));
  const expectedTrue = ((displayed + 5 + before.context.variationEastDeg!) % 360 + 360) % 360;
  expect(stepped.trueTarget).toBeCloseTo(expectedTrue, 9);
  expect(stepped.aircraft).toEqual(before.aircraft);
  await expect(mcp).toContainText(`HDG ${String((displayed + 5) % 360).padStart(3, '0')}M SFC`);
  await expect(page.getByLabel('Heading selected bug', { exact: true })).toContainText('M SFC');
  await page.getByLabel('Heading reference', { exact: true }).selectOption('true');
  expect((await observe(page)).trueTarget).toBe(stepped.trueTarget);
  await expect(mcp).toContainText(`HDG ${stepped.trueLabel}`);
  await page.getByRole('button', { name: 'OVL: FLIGHT', exact: true }).click();
  await page.getByRole('button', { name: 'OVL: MINIMAL', exact: true }).click();
  await expect(page.getByRole('button', { name: 'OVL: DEBUG', exact: true })).toBeVisible();
  await expect(page.getByLabel('Flight telemetry', { exact: true })).toContainText('HDG TRUE');
  await page.getByLabel('Save slot name').fill('Heading practice');
  await page.getByRole('button', { name: 'Save scenario state', exact: true }).click();
  await expect(page.getByText('Heading practice saved.', { exact: true })).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('rfs.scenarioSnapshot.v1')!).slots['heading-practice'].snapshot);
  expect(saved.version).toBe(4); expect(saved.apState.boeing.heading).toBe(stepped.trueTarget);
  expect(saved).not.toHaveProperty('headingReference');
  await page.getByLabel('Heading reference', { exact: true }).selectOption('magnetic');
  await page.getByText('Date and time (UTC)', { exact: true }).click();
  await page.getByLabel('UTC date and time', { exact: true }).fill('2030-01-01T00:00');
  await page.getByRole('button', { name: 'Apply UTC date/time', exact: true }).click();
  await expect(page.getByLabel('MCP heading reference warning', { exact: true })).toContainText('unsupported epoch');
  await expect(page.getByLabel('PFD heading', { exact: true })).toHaveText(/^\d{3}T$/);
  await expect(page.getByLabel('HDG +5', { exact: true })).toBeDisabled();
  const unavailable = await observe(page); expect(unavailable.trueTarget).toBe(stepped.trueTarget);
  await page.getByLabel('Saved scenario slot', { exact: true }).selectOption('heading-practice');
  await page.getByRole('button', { name: 'Load saved scenario state', exact: true }).click();
  await expect(mcp).toContainText(`HDG ${stepped.magneticLabel}`);
  const restored = await observe(page); expect(restored.aircraft).toEqual(saved.aircraft);
  expect(restored.trueTarget).toBe(saved.apState.boeing.heading); expect(restored.weather).toEqual(saved.weather);
  await page.screenshot({ path: testInfo.outputPath('native-magnetic-surface-heading.png') });
  const path = testInfo.outputPath('native-heading-reference.json');
  await writeFile(path, JSON.stringify({ scope: 'Actual worker/cohort, paused UI reference invariance, one-step conversion, unsupported epoch and v4 save/restore; surface estimate, no operational/device/full-flight qualification', before, toggled, stepped, unavailable, restored }, null, 2));
  await testInfo.attach('native-heading-reference', { path, contentType: 'application/json' });
});
