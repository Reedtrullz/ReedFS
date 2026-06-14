import { describe, expect, it, vi } from 'vitest';
import fpsMonitorSource from '../../components/FPSMonitor.tsx?raw';
import contrailLayerSource from '../../viewport/ContrailLayer.tsx?raw';
import { FrameScheduler } from '../frameScheduler';

function createClock() {
  let nextHandle = 1;
  const callbacks = new Map<number, FrameRequestCallback>();
  return {
    requestAnimationFrame: vi.fn((callback: FrameRequestCallback) => {
      const handle = nextHandle++;
      callbacks.set(handle, callback);
      return handle;
    }),
    cancelAnimationFrame: vi.fn((handle: number) => {
      callbacks.delete(handle);
    }),
    run(handle: number, timestamp: number) {
      const callback = callbacks.get(handle);
      if (!callback) throw new Error(`missing RAF callback ${handle}`);
      callbacks.delete(handle);
      callback(timestamp);
    },
    handles() {
      return [...callbacks.keys()];
    },
  };
}

describe('FrameScheduler', () => {
  it('runs input, fixed simulation, render/effects, and audio in one deterministic frame order', () => {
    const phases: string[] = [];
    const scheduler = new FrameScheduler({
      input: ({ dt }) => phases.push(`input:${dt.toFixed(3)}`),
      fixedSimulation: ({ timestamp }) => phases.push(`sim:${timestamp}`),
      renderEffects: () => phases.push('render-effects'),
      audio: () => phases.push('audio'),
    });

    scheduler.runFrame(1000);
    scheduler.runFrame(1025);

    expect(phases).toEqual([
      'input:0.017',
      'sim:1000',
      'render-effects',
      'audio',
      'input:0.025',
      'sim:1025',
      'render-effects',
      'audio',
    ]);
  });

  it('clamps long frame deltas before input polling uses them', () => {
    const inputDts: number[] = [];
    const scheduler = new FrameScheduler({
      input: ({ dt }) => inputDts.push(dt),
      fixedSimulation: () => undefined,
    });

    scheduler.runFrame(1000);
    scheduler.runFrame(1300);

    expect(inputDts).toEqual([1 / 60, 0.05]);
  });

  it('owns exactly one RAF loop and ignores duplicate start calls', () => {
    const clock = createClock();
    const phases: string[] = [];
    const scheduler = new FrameScheduler(
      {
        input: () => phases.push('input'),
        fixedSimulation: () => phases.push('sim'),
        renderEffects: () => phases.push('render-effects'),
        audio: () => phases.push('audio'),
      },
      clock,
    );

    scheduler.start();
    scheduler.start();

    expect(clock.requestAnimationFrame).toHaveBeenCalledTimes(1);
    expect(clock.handles()).toEqual([1]);

    clock.run(1, 1000);

    expect(phases).toEqual(['input', 'sim', 'render-effects', 'audio']);
    expect(clock.requestAnimationFrame).toHaveBeenCalledTimes(2);
    expect(clock.handles()).toEqual([2]);

    scheduler.stop();

    expect(clock.cancelAnimationFrame).toHaveBeenCalledWith(2);
    expect(clock.handles()).toEqual([]);
  });

  it('keeps render/effects layers out of independent RAF loops', () => {
    expect(`${contrailLayerSource}\n${fpsMonitorSource}`).not.toMatch(/requestAnimationFrame|cancelAnimationFrame/);
  });
});
