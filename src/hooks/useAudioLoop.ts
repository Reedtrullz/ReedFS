import { useCallback, useEffect, useRef } from 'react';
import { useSimStore } from '../store/simStore';
import { EngineSound } from '../audio/EngineSound';
import { AmbientSounds } from '../audio/AmbientSounds';
import { cancelGPWSSpeech, resetGPWS, updateGPWS, type AudioCaptionEvent } from '../audio/GPWS';
import { clampAudioUnit } from '../audio/audioMapping';
import { computeDerived } from '../sim/physics/derived';
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
  const ambientRef = useRef<AmbientSounds | null>(null);
  const lastOnGroundRef = useRef(true);

  useEffect(() => {
    if (!enabled) return undefined;

    if (!enginesRef.current) {
      enginesRef.current = [new EngineSound(0), new EngineSound(1)];
    }
    if (!ambientRef.current) {
      ambientRef.current = new AmbientSounds();
    }

    return () => {
      cancelGPWSSpeech();
      enginesRef.current?.forEach((e) => e.dispose());
      enginesRef.current = null;
      ambientRef.current?.dispose();
      ambientRef.current = null;
    };
  }, [enabled]);

  useEffect(() => {
    if (!speechEnabled || masterVolume === 0) cancelGPWSSpeech();
  }, [masterVolume, speechEnabled]);

  useEffect(() => {
    const silence = () => {
      enginesRef.current?.forEach((engine) => engine.update(0));
      ambientRef.current?.silence();
      lastOnGroundRef.current = true;
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
    if (!running) {
      enginesRef.current?.forEach((engine) => engine.update(0));
      ambientRef.current?.silence();
      if (enabled) lastOnGroundRef.current = true;
      cancelGPWSSpeech();
      return;
    }

    const engines = enginesRef.current;
    if (engines) {
      engines[0].update(a.engines[0].n1);
      engines[1].update(a.engines[1].n1);
    }

    const onGround = a.ground.weightOnWheels || a.ground.contact === 'gear';
    const ambient = ambientRef.current;
    if (enabled && ambient) {
      const derived = computeDerived(a, state.wind);
      ambient.update({
        iasKnots: derived.ias,
        groundSpeedKnots: derived.gs,
        onGround,
        brake: state.effectiveControls.brake,
        flapSetting: a.config.flapSetting,
        flapTarget: state.effectiveControls.flapLever,
        gearPosition: a.config.gearPosition,
        gearTarget: state.effectiveControls.gearLever === 'DOWN' ? 1 : 0,
      });
      if (onGround && !lastOnGroundRef.current) {
        ambient.touchdown(Math.min(3, Math.max(0.15, a.ground.lastTouchdownSinkRateMps)));
      }
      lastOnGroundRef.current = onGround;
    }

    updateGPWS(a, { captionsEnabled, speechEnabled, masterVolume, onCaption });
  }, [captionsEnabled, enabled, masterVolume, onCaption, speechEnabled]);
}
