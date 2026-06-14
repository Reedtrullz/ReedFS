import type { AircraftState } from '../sim/types';
import { bodyToNed } from '../sim/physics/frames';
import { quatToEuler } from '../sim/physics/quaternion';
import { mapGpwsCalloutToSpeechParams } from './audioMapping';

const MPS_TO_FPM = 196.85;

interface GpwsKinematics {
  aglFt: number;
  descentRateFpm: number;
  groundSpeedMps: number;
  weightOnWheels: boolean;
}

function gpwsKinematics(state: AircraftState): GpwsKinematics {
  const groundAltFt = state.ground?.groundAltFt ?? 0;
  const aglFt = Math.max(0, state.ground?.aglFt ?? state.position.alt - groundAltFt);
  const nedVelocity = bodyToNed(state.velocity, state.attitude);
  return {
    aglFt,
    descentRateFpm: Math.max(0, nedVelocity.down * MPS_TO_FPM),
    groundSpeedMps: Math.hypot(nedVelocity.north, nedVelocity.east),
    weightOnWheels: state.ground?.weightOnWheels ?? false,
  };
}

function checkMode1(state: AircraftState): string | null {
  const { aglFt, descentRateFpm, weightOnWheels } = gpwsKinematics(state);
  if (weightOnWheels) return null;
  if (aglFt < 2500 && descentRateFpm > 5000) return 'SINK RATE';
  if (aglFt < 1000 && descentRateFpm > 2000) return 'PULL UP';
  return null;
}

function checkMode4(state: AircraftState): string | null {
  const { aglFt, groundSpeedMps, weightOnWheels } = gpwsKinematics(state);
  if (weightOnWheels || groundSpeedMps <= 10) return null;
  if (state.flightPhase === 'TAKEOFF' || state.flightPhase === 'CLIMB') return null;
  if (aglFt < 500 && !state.config.gearDown) return 'TOO LOW GEAR';
  if (aglFt < 200 && state.config.flapSetting < 15) return 'TOO LOW FLAPS';
  return null;
}

function checkMode5(state: AircraftState): string | null {
  const { aglFt, descentRateFpm, weightOnWheels } = gpwsKinematics(state);
  if (weightOnWheels) return null;
  if (aglFt < 1000 && descentRateFpm > 500) return 'GLIDESLOPE';
  return null;
}

function checkMode2(state: AircraftState): string | null {
  const { aglFt, descentRateFpm, weightOnWheels } = gpwsKinematics(state);
  if (weightOnWheels) return null;
  if (aglFt < 1500 && descentRateFpm > 3000) return 'TERRAIN';
  if (aglFt < 800 && descentRateFpm > 2000) return 'PULL UP';
  return null;
}

function checkMode3(state: AircraftState): string | null {
  const { aglFt, descentRateFpm, weightOnWheels } = gpwsKinematics(state);
  if (state.flightPhase === 'TAKEOFF' && !weightOnWheels && aglFt < 1000 && descentRateFpm > 200) return "DON'T SINK";
  return null;
}

function checkMode6(state: AircraftState): string | null {
  const bankDeg = Math.abs((quatToEuler(state.quaternion).phi * 180) / Math.PI);
  if (bankDeg > 35) return 'BANK ANGLE';
  return null;
}

export function checkGPWS(state: AircraftState): string | null {
  return checkMode1(state) ?? checkMode2(state) ?? checkMode3(state) ?? checkMode4(state) ?? checkMode5(state) ?? checkMode6(state);
}

export interface AudioCaptionEvent {
  kind: 'gpws';
  text: string;
  timestampMs: number;
}

export interface GpwsUpdateOptions {
  nowMs?: number;
  captionsEnabled?: boolean;
  speechEnabled?: boolean;
  onCaption?: (event: AudioCaptionEvent) => void;
}

let lastAlert = '';
let lastAlertTime = 0;

export function updateGPWS(state: AircraftState, options: GpwsUpdateOptions = {}): void {
  const now = options.nowMs ?? performance.now();
  const alert = checkGPWS(state);
  const shouldCaption = options.captionsEnabled ?? true;
  const shouldSpeak = options.speechEnabled ?? true;
  if (!shouldCaption && !shouldSpeak) return;
  if (alert && alert !== lastAlert && now - lastAlertTime > 3000) {
    lastAlert = alert;
    lastAlertTime = now;
    if (shouldCaption) {
      options.onCaption?.({ kind: 'gpws', text: alert, timestampMs: now });
    }
    if (shouldSpeak) {
      speakCallout(alert);
    }
  }
}

function speakCallout(text: string): void {
  if (typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') return;
  const speech = mapGpwsCalloutToSpeechParams(text);
  const utterance = new SpeechSynthesisUtterance(speech.text);
  utterance.rate = speech.rate;
  utterance.pitch = speech.pitch;
  utterance.volume = speech.volume;
  speechSynthesis.speak(utterance);
}
