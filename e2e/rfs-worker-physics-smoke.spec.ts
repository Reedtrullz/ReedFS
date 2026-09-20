import { expect, test, type Page } from '@playwright/test';
import {
  configureScenarioTakeoffThroughVisibleControls,
  driveVisibleSimUntil,
  holdKeyForVisibleSimTime,
  holdKey,
  openRfsBlackbox,
  readVisibleFlightNumbers,
  resetThroughVisibleControls,
  selectEnvaScenarioThroughVisibleControls,
  startRollThroughVisibleControls,
  useRealTimeVisibleSim,
} from './helpers/rfsBlackbox';

const SIMULATION_WORKER_URL_FRAGMENT = 'simulationWorker';
const MIN_STEPS_PER_SECOND = 48;
const MIN_TOTAL_DISPATCHES = 5;
const MIN_WORKER_ROUND_TRIPS = 5;
const WORKER_ROUND_TRIP_MIN_MS = 10;
const CLIMB_RADIO_ALTITUDE_FT = 60;

interface WorkerProbeWindow {
  __RFS_GET_SIMULATION_RUNTIME?: () => { stepAsync: (input: unknown) => Promise<unknown>; kind: string };
  __rfsWorkerPhysicsProbe?: { dispatched: number; steps: number; roundTripMs: number[]; kind: string };
}

function watchSimulationWorkerSpawn(page: Page): () => number {
  let spawned = 0;
  page.on('worker', (worker) => {
    if (worker.url().includes(SIMULATION_WORKER_URL_FRAGMENT)) spawned += 1;
  });
  return () => spawned;
}

test.describe('worker physics smoke', () => {
  test.describe.configure({ timeout: 420_000 });

  test('drives a real-time takeoff through the browser-worker physics runtime', async ({ page }) => {
    useRealTimeVisibleSim(page);
    const simulationWorkersSpawned = watchSimulationWorkerSpawn(page);

    await openRfsBlackbox(page);

    // Probe the actual runtime the store loop dispatches through, counting
    // stepAsync dispatches. The 500ms timeout fallback also routes through
    // stepAsync, so a dispatch-rate floor (worker round-trips tens/s vs
    // fallback <=2/s) is what proves worker physics, not mere dispatch presence.
    await page.evaluate(async () => {
      const getRuntime = (window as unknown as WorkerProbeWindow).__RFS_GET_SIMULATION_RUNTIME;
      if (typeof getRuntime !== 'function') {
        const scriptSrcs = Array.from(document.querySelectorAll('script[src]')).map((s) => s.getAttribute('src'));
        const swControlled = Boolean(navigator.serviceWorker && navigator.serviceWorker.controller);
        throw new Error('RFS smoke probe hook missing; hookType=' + typeof getRuntime + ' scriptSrcs=' + JSON.stringify(scriptSrcs) + ' swControlled=' + swControlled);
      }
      const runtime = getRuntime();
      const probe = { dispatched: 0, steps: 0, roundTripMs: [] as number[], kind: runtime.kind };
      const originalStepAsync = runtime.stepAsync.bind(runtime);
      Object.defineProperty(runtime, 'stepAsync', {
        value: (input: unknown) => {
          const startedAt = performance.now();
          probe.dispatched += 1;
          const steps = (input as { steps?: number }).steps ?? 1;
          probe.steps += steps;
          return originalStepAsync(input).then((result: unknown) => {
            probe.roundTripMs.push(performance.now() - startedAt);
            if (probe.roundTripMs.length > 200) probe.roundTripMs.shift();
            return result;
          });
        },
      });
      (window as unknown as WorkerProbeWindow).__rfsWorkerPhysicsProbe = probe;
    });

    await selectEnvaScenarioThroughVisibleControls(page);
    // selectOption leaves focus on the <select>, which would swallow every
    // subsequent ArrowUp keydown (editable-target guard). Return focus to body.
    await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
    await configureScenarioTakeoffThroughVisibleControls(page);
    await startRollThroughVisibleControls(page);

    await expect(page.getByRole('button', { name: /Cycle simulator rate target/ })).toHaveText('SIM RATE TARGET: 1X');

   // ArrowUp is a discrete key: each press nudges throttle +5%, so 20 presses
   // drive idle to takeoff thrust (same pattern as the player-loop spec).
   await holdKey(page, 'ArrowUp', 20);
    const takeoffSetup = page.getByRole('region', { name: 'Takeoff setup' });
    await expect(takeoffSetup.getByLabel('Current takeoff configuration')).toContainText(/Throttle\s+100%/, { timeout: 10_000 });

    const readDispatchCount = () => page.evaluate(() => {
      const probe = (window as unknown as WorkerProbeWindow).__rfsWorkerPhysicsProbe;
      return probe ? probe.dispatched : -1;
    });
    const rotationDeadline = Date.now() + 300_000;
    let rotated = false;
    const telemetry: Array<{ iasKt: number; vsFpm: number; raFt: number | null; dispatches: number }> = [];
    let previousDispatches = await readDispatchCount();
    while (Date.now() < rotationDeadline) {
      const numbers = await readVisibleFlightNumbers(page);
      if (numbers.iasKt >= 135 && numbers.pitchDeg < 9) {
        await holdKeyForVisibleSimTime(page, 'KeyW', 650);
      }
      if ((numbers.radioAltitudeFt ?? 0) >= 5 && numbers.verticalSpeedFpm > 100) {
        rotated = true;
        break;
      }
      await page.waitForTimeout(500);
      const dispatches = await readDispatchCount();
      telemetry.push({
        iasKt: numbers.iasKt,
        vsFpm: numbers.verticalSpeedFpm,
        raFt: numbers.radioAltitudeFt,
        dispatches: dispatches - previousDispatches,
      });
      previousDispatches = dispatches;
    }
    expect(rotated, 'aircraft did not reach positive rate within 300s of real time on worker physics; telemetry=' + JSON.stringify(telemetry.slice(-14))).toBe(true);

    await driveVisibleSimUntil(page, 'radio altitude above climb threshold on worker physics', async () => {
      const numbers = await readVisibleFlightNumbers(page);
      return numbers.radioAltitudeFt !== null && numbers.radioAltitudeFt > CLIMB_RADIO_ALTITUDE_FT;
    }, { timeoutMs: 90_000, stepMs: 500 });

    const dispatchRatePerSecond = await page.evaluate(async () => {
      const probe = (window as unknown as WorkerProbeWindow).__rfsWorkerPhysicsProbe;
      if (!probe) throw new Error('Worker physics probe was not installed.');
      const before = probe.dispatched;
      const stepsBefore = probe.steps;
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      const times = [...probe.roundTripMs].sort((a, b) => a - b);
      const mid = Math.floor(times.length / 2);
      const medianRoundTripMs = times.length === 0
        ? 0
        : times.length % 2 === 0 ? (times[mid - 1] + times[mid]) / 2 : times[mid];
      const sample = {
        dispatches: probe.dispatched - before,
        steps: probe.steps - stepsBefore,
        medianRoundTripMs,
      };
      return sample;
    });
    expect(dispatchRatePerSecond.steps).toBeGreaterThanOrEqual(MIN_STEPS_PER_SECOND);
    expect(dispatchRatePerSecond.dispatches).toBeGreaterThanOrEqual(MIN_TOTAL_DISPATCHES);
    expect(dispatchRatePerSecond.medianRoundTripMs).toBeGreaterThanOrEqual(WORKER_ROUND_TRIP_MIN_MS);

    const probe = await page.evaluate(() => (window as unknown as WorkerProbeWindow).__rfsWorkerPhysicsProbe);
    expect(probe?.kind).toBe('browser-worker');
    expect(probe?.dispatched).toBeGreaterThanOrEqual(MIN_TOTAL_DISPATCHES);
    const roundTripsWithWorkerLatency = probe?.roundTripMs.filter((ms) => ms >= WORKER_ROUND_TRIP_MIN_MS).length ?? 0;
    expect(roundTripsWithWorkerLatency).toBeGreaterThanOrEqual(MIN_WORKER_ROUND_TRIPS);
    expect(simulationWorkersSpawned()).toBeGreaterThanOrEqual(1);

    await resetThroughVisibleControls(page);
  });
});
