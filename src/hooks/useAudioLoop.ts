import { useEffect, useRef } from 'react';
import { useSimStore } from '../store/simStore';
import { EngineSound } from '../audio/EngineSound';
import { updateGPWS } from '../audio/GPWS';

export function useAudioLoop(enabled = false) {
  const enginesRef = useRef<EngineSound[] | null>(null);

  useEffect(() => {
    if (!enabled) return undefined;

    // Create engine sounds only after the player explicitly enables audio.
    if (!enginesRef.current) {
      enginesRef.current = [new EngineSound(0), new EngineSound(1)];
    }

    // Drive from sim state
    let raf: number;
    const update = () => {
      const a = useSimStore.getState().aircraft;
      if (enginesRef.current) {
        enginesRef.current[0].update(a.engines[0].n1);
        enginesRef.current[1].update(a.engines[1].n1);
      }
      updateGPWS(a);
      raf = requestAnimationFrame(update);
    };
    raf = requestAnimationFrame(update);

    return () => {
      cancelAnimationFrame(raf);
      enginesRef.current?.forEach((e) => e.dispose());
      enginesRef.current = null;
    };
  }, [enabled]);
}
