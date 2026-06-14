import { useCallback, useEffect, useRef } from 'react';
import { useSimStore } from '../store/simStore';
import { EngineSound } from '../audio/EngineSound';
import { updateGPWS, type AudioCaptionEvent } from '../audio/GPWS';
import type { FramePhase } from '../runtime/frameScheduler';

export interface UseAudioLoopOptions {
  enabled?: boolean;
  captionsEnabled?: boolean;
  speechEnabled?: boolean;
  onCaption?: (event: AudioCaptionEvent) => void;
}

export function useAudioLoop(options: boolean | UseAudioLoopOptions = false): FramePhase {
  const enabled = typeof options === 'boolean' ? options : options.enabled ?? false;
  const captionsEnabled = typeof options === 'boolean' ? true : options.captionsEnabled ?? true;
  const speechEnabled = typeof options === 'boolean' ? enabled : options.speechEnabled ?? enabled;
  const onCaption = typeof options === 'boolean' ? undefined : options.onCaption;
  const enginesRef = useRef<EngineSound[] | null>(null);

  useEffect(() => {
    if (!enabled) return undefined;

    // Create engine sounds only after the player explicitly enables audio.
    if (!enginesRef.current) {
      enginesRef.current = [new EngineSound(0), new EngineSound(1)];
    }

    return () => {
      enginesRef.current?.forEach((e) => e.dispose());
      enginesRef.current = null;
    };
  }, [enabled]);

  return useCallback(() => {
    const a = useSimStore.getState().aircraft;
    if (enabled && enginesRef.current) {
      enginesRef.current[0].update(a.engines[0].n1);
      enginesRef.current[1].update(a.engines[1].n1);
    }
    updateGPWS(a, { captionsEnabled, speechEnabled, onCaption });
  }, [captionsEnabled, enabled, onCaption, speechEnabled]);
}
