import { expect, type Page } from '@playwright/test';

import { readVisibleFlightNumbers } from './rfsBlackbox';

export async function fastForwardToPositiveRateThroughBrowserSim(page: Page): Promise<void> {
  await page.evaluate(async () => {
    interface BrowserAircraftState {
      ground: { aglFt: number; weightOnWheels: boolean };
      position: { alt: number };
    }
    interface BrowserControlInputs { elevator: number }
    interface BrowserSimState {
      aircraft: BrowserAircraftState;
      wind: unknown;
      simulationTimeSeconds: number;
      lastFrameTime: number;
      tick: (timestamp: number) => void;
      setInput: (partial: Partial<BrowserControlInputs>) => void;
    }
    interface BrowserSimStore { getState: () => BrowserSimState }
    interface BrowserDerivedState { ias: number; vs: number }

    const fixedStepMs = 1000 / 60;
    const maxRollFrames = 60 * 80;
    const maxRotateFrames = 60 * 12;
    const simStoreModule = '/src/store/simStore.ts';
    const derivedModule = '/src/sim/physics/derived.ts';
    const { useSimStore } = await import(simStoreModule) as { useSimStore: BrowserSimStore };
    const { computeDerived } = await import(derivedModule) as {
      computeDerived: (aircraft: BrowserAircraftState, wind: unknown) => BrowserDerivedState;
    };

    const advanceOneFrame = (): BrowserDerivedState => {
      const state = useSimStore.getState();
      const nextTimestamp = (state.lastFrameTime > 0 ? state.lastFrameTime : state.simulationTimeSeconds * 1000) + fixedStepMs;
      state.tick(nextTimestamp);
      const nextState = useSimStore.getState();
      return computeDerived(nextState.aircraft, nextState.wind);
    };

    let derived = computeDerived(useSimStore.getState().aircraft, useSimStore.getState().wind);
    for (let frame = 0; frame < maxRollFrames && derived.ias < 135; frame += 1) {
      derived = advanceOneFrame();
    }
    if (derived.ias < 135) throw new Error(`visible proof did not reach legal rotation speed; IAS=${derived.ias.toFixed(1)}kt`);

    useSimStore.getState().setInput({ elevator: -1 });
    try {
      for (let frame = 0; frame < maxRotateFrames; frame += 1) {
        derived = advanceOneFrame();
        const aircraft = useSimStore.getState().aircraft;
        if (aircraft.ground.aglFt > 20 && derived.vs > 100 && !aircraft.ground.weightOnWheels) return;
      }
      const state = useSimStore.getState();
      throw new Error(`visible proof did not establish positive rate; RA=${state.aircraft.ground.aglFt.toFixed(1)}ft VS=${derived.vs.toFixed(0)}fpm`);
    } finally {
      useSimStore.getState().setInput({ elevator: 0 });
    }
  });

  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

  const numbers = await readVisibleFlightNumbers(page);
  expect(numbers.iasKt).toBeGreaterThanOrEqual(135);
  expect(numbers.radioAltitudeFt).not.toBeNull();
  expect(numbers.radioAltitudeFt).toBeGreaterThan(20);
  expect(numbers.verticalSpeedFpm).toBeGreaterThan(100);
}
