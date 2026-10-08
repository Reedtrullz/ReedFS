import { useCallback, useEffect, useRef } from 'react';
import { useSimStore } from '../store/simStore';
import { EngineSound } from '../audio/EngineSound';
import { cancelGPWSSpeech, resetGPWS, updateGPWS, type AudioCaptionEvent } from '../audio/GPWS';
import { clampAudioUnit } from '../audio/audioMapping';
import type { FramePhase } from '../runtime/frameScheduler';

export interface UseAudioLoopOptions {
  enabled?: boolean;
  captionsEnabled?: boolean;
  speechEnabled?: boolean;
  masterVolume?: number;
  onCaption?: (event: AudioCaptionEvent) => void;
  onSessionSilenced?: () => void;
}

export function useAudioLoop(options: boolean | UseAudioLoopOptions = false): FramePhase {
  const enabled = typeof options === 'boolean' ? options : options.enabled ?? false;
  const captionsEnabled = typeof options === 'boolean' ? true : options.captionsEnabled ?? true;
  const speechEnabled = typeof options === 'boolean' ? enabled : options.speechEnabled ?? enabled;
  const masterVolume = clampAudioUnit(typeof options === 'boolean' ? 0.5 : options.masterVolume ?? 0.5);
  const onCaption = typeof options === 'boolean' ? undefined : options.onCaption;
  const onSessionSilenced = typeof options === 'boolean' ? undefined : options.onSessionSilenced;
  const enginesRef = useRef<EngineSound[] | null>(null);

  useEffect(() => {
    if (!enabled) return undefined;

    // Create engine sounds only after the player explicitly enables audio.
    if (!enginesRef.current) {
      enginesRef.current = [new EngineSound(0), new EngineSound(1)];
    }

    return () => {
      cancelGPWSSpeech();
      enginesRef.current?.forEach((e) => e.dispose());
      enginesRef.current = null;
    };
  }, [enabled]);

  useEffect(() => {
    if (!speechEnabled || masterVolume === 0) cancelGPWSSpeech();
  }, [masterVolume, speechEnabled]);

  useEffect(() => {
    const silence = () => {
      enginesRef.current?.forEach((engine) => engine.update(0));
      resetGPWS();
      onSessionSilenced?.();
    };
    const unsubscribe = useSimStore.subscribe((next, previous) => {
      if (next.status !== previous.status || next.selectedScenarioId !== previous.selectedScenarioId || next.simulationTimeSeconds < previous.simulationTimeSeconds) {
        silence();
      }
    });
    const visibility = () => { if (document.visibilityState === 'hidden') silence(); };
    document.addEventListener('visibilitychange', visibility);
    return () => { unsubscribe(); document.removeEventListener('visibilitychange', visibility); silence(); };
  }, [onSessionSilenced]);

  return useCallback(() => {
    const state = useSimStore.getState();
    const a = state.aircraft;
    const running = state.status === 'running' && document.visibilityState !== 'hidden';
    if (enabled && enginesRef.current) {
      enginesRef.current[0].update(running ? a.engines[0].n1 : 0);
      enginesRef.current[1].update(running ? a.engines[1].n1 : 0);
    }
    if (running) updateGPWS(a, { captionsEnabled, speechEnabled, masterVolume, onCaption });
    else cancelGPWSSpeech();
  }, [captionsEnabled, enabled, masterVolume, onCaption, speechEnabled]);
}
