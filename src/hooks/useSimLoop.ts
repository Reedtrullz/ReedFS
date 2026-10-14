import { useEffect, useRef } from 'react';
import { useSimStore } from '../store/simStore';
import { FrameScheduler, type FramePhase } from '../runtime/frameScheduler';

export interface UseSimLoopOptions {
  readonly onInputFrame?: FramePhase;
  readonly onRenderEffectsFrame?: FramePhase;
  readonly onAudioFrame?: FramePhase;
}

export function useSimLoop(options: UseSimLoopOptions = {}) {
  const tickRef = useRef(useSimStore.getState().tickAsync);
  const inputFrameRef = useRef(options.onInputFrame);
  const renderEffectsFrameRef = useRef(options.onRenderEffectsFrame);
  const audioFrameRef = useRef(options.onAudioFrame);

  useEffect(() => {
    inputFrameRef.current = options.onInputFrame;
    renderEffectsFrameRef.current = options.onRenderEffectsFrame;
    audioFrameRef.current = options.onAudioFrame;
  }, [options.onInputFrame, options.onRenderEffectsFrame, options.onAudioFrame]);

  useEffect(() => {
    const unsub = useSimStore.subscribe((s) => { tickRef.current = s.tickAsync; });
    const scheduler = new FrameScheduler({
      input: (context) => inputFrameRef.current?.(context),
      fixedSimulation: ({ timestamp }) => tickRef.current(timestamp),
      renderEffects: (context) => renderEffectsFrameRef.current?.(context),
      audio: (context) => audioFrameRef.current?.(context),
    });
    scheduler.start();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void useSimStore.getState().catchUpBackgroundTime(performance.now());
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      scheduler.stop();
      unsub();
    };
  }, []);
}
