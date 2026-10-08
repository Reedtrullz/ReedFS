import type { AircraftState } from '../sim/types';
import { bodyToNed } from '../sim/physics/frames';
import { quatToEuler } from '../sim/physics/quaternion';
import { clampAudioUnit, mapGpwsCalloutToSpeechParams } from './audioMapping';

const MPS_TO_FPM = 196.85;

interface GpwsKinematics {
  aglFt: number;
  descentRateFpm: number;
  groundSpeedMps: number;
  weightOnWheels: boolean;
}

function gpwsKinematics(state: AircraftState): GpwsKinematics | null {
  const aglFt = state.ground.aglFt;
  const required = [aglFt, state.velocity.u, state.velocity.v, state.velocity.w, state.attitude.phi, state.attitude.theta, state.attitude.psi, state.config.flapSetting, ...Object.values(state.quaternion)];
  if (!required.every(Number.isFinite) || aglFt < 0 || Math.abs(Math.hypot(...Object.values(state.quaternion)) - 1) > 0.02) return null;
  const nedVelocity = bodyToNed(state.velocity, state.attitude);
  return {
    aglFt,
    descentRateFpm: Math.max(0, nedVelocity.down * MPS_TO_FPM),
    groundSpeedMps: Math.hypot(nedVelocity.north, nedVelocity.east),
    weightOnWheels: state.ground?.weightOnWheels ?? false,
  };
}

function checkMode1(kinematics: GpwsKinematics): GpwsAlert | null {
  const { aglFt, descentRateFpm, weightOnWheels } = kinematics;
  if (weightOnWheels) return null;
  if (aglFt < 1000 && descentRateFpm > 2000) return 'PULL UP';
  if (aglFt < 2500 && descentRateFpm > 5000) return 'SINK RATE';
  return null;
}

function checkMode4(state: AircraftState, kinematics: GpwsKinematics): GpwsAlert | null {
  const { aglFt, groundSpeedMps, weightOnWheels } = kinematics;
  if (weightOnWheels || groundSpeedMps <= 10) return null;
  if (state.flightPhase === 'TAKEOFF' || state.flightPhase === 'CLIMB') return null;
  if (aglFt < 500 && !state.config.gearDown) return 'TOO LOW GEAR';
  if (aglFt < 200 && state.config.flapSetting < 15) return 'TOO LOW FLAPS';
  return null;
}

function checkMode2(kinematics: GpwsKinematics): GpwsAlert | null {
  const { aglFt, descentRateFpm, weightOnWheels } = kinematics;
  if (weightOnWheels) return null;
  if (aglFt < 800 && descentRateFpm > 2000) return 'PULL UP';
  if (aglFt < 1500 && descentRateFpm > 3000) return 'TERRAIN';
  return null;
}

function checkMode3(state: AircraftState, kinematics: GpwsKinematics): GpwsAlert | null {
  const { aglFt, descentRateFpm, weightOnWheels } = kinematics;
  if (state.flightPhase === 'TAKEOFF' && !weightOnWheels && aglFt < 1000 && descentRateFpm > 200) return "DON'T SINK";
  return null;
}

function checkMode6(state: AircraftState, kinematics: GpwsKinematics): GpwsAlert | null {
  const bankDeg = Math.abs((quatToEuler(state.quaternion).phi * 180) / Math.PI);
  const { aglFt } = kinematics;
  if (bankDeg > 35 && aglFt > 500) return 'BANK ANGLE';
  return null;
}

export const GPWS_ALERT_PRIORITY = { 'PULL UP': 6, TERRAIN: 5, 'SINK RATE': 4, "DON'T SINK": 3, 'TOO LOW GEAR': 3, 'TOO LOW FLAPS': 2, 'BANK ANGLE': 1 } as const;
export type GpwsAlert = keyof typeof GPWS_ALERT_PRIORITY;

export function checkGPWS(state: AircraftState): GpwsAlert | null {
  const kinematics = gpwsKinematics(state);
  if (!kinematics || ![kinematics.descentRateFpm, kinematics.groundSpeedMps].every(Number.isFinite)) return null;
  // GLIDESLOPE is unavailable until an applicable receiver/deviation contract exists.
  const candidates = [checkMode1(kinematics), checkMode2(kinematics), checkMode3(state, kinematics), checkMode4(state, kinematics), checkMode6(state, kinematics)];
  return candidates.reduce<GpwsAlert | null>((highest, alert) => alert && (!highest || GPWS_ALERT_PRIORITY[alert] > GPWS_ALERT_PRIORITY[highest]) ? alert : highest, null);
}

export interface AudioCaptionEvent {
  kind: 'gpws';
  delivery: 'caption';
  text: string;
  timestampMs: number;
}

export interface GpwsUpdateOptions {
  nowMs?: number;
  captionsEnabled?: boolean;
  speechEnabled?: boolean;
  masterVolume?: number;
  onCaption?: (event: AudioCaptionEvent) => void;
}

const captionTimes = new Map<GpwsAlert, number>();
const speechTimes = new Map<GpwsAlert, number>();
const GPWS_REPEAT_INTERVAL_MS = 3000;
let active: { alert: GpwsAlert; utterance: SpeechSynthesisUtterance; volume: number } | null = null;
let captionAlert: GpwsAlert | null = null;

function cancelActiveSpeech(): void {
  if (active) {
    active = null;
    try { globalThis.speechSynthesis?.cancel(); } catch { /* Captions remain independent of browser speech failures. */ }
  }
}

export function cancelGPWSSpeech(): void {
  cancelActiveSpeech();
  speechTimes.clear();
}

export function resetGPWS(): void {
  cancelGPWSSpeech();
  captionTimes.clear();
  captionAlert = null;
}

function due(times: Map<GpwsAlert, number>, alert: GpwsAlert, now: number): boolean {
  const previous = times.get(alert);
  return previous === undefined || now < previous || now - previous >= GPWS_REPEAT_INTERVAL_MS;
}

export function updateGPWS(state: AircraftState, options: GpwsUpdateOptions = {}): void {
  const now = options.nowMs ?? performance.now();
  if (!Number.isFinite(now)) return;
  const alert = checkGPWS(state);
  const volume = clampAudioUnit(options.masterVolume ?? 1);
  const shouldSpeak = (options.speechEnabled ?? true) && volume > 0;
  // Only the currently selected condition can own speech. Repeats never enqueue
  // while it is active; changes replace obsolete speech, including urgent alerts.
  if (!alert || !shouldSpeak) cancelGPWSSpeech();
  else if (active && (active.alert !== alert || active.volume !== volume)) {
    if (active.volume !== volume) speechTimes.delete(active.alert);
    cancelActiveSpeech();
  }
  if (!alert) { captionAlert = null; return; }
  if (!(options.captionsEnabled ?? true)) captionAlert = null;
  else if (captionAlert !== alert || due(captionTimes, alert, now)) {
    captionAlert = alert;
    captionTimes.set(alert, now);
    options.onCaption?.({ kind: 'gpws', delivery: 'caption', text: alert, timestampMs: now });
  }
  if (!shouldSpeak || active || !due(speechTimes, alert, now)) return;
  speechTimes.set(alert, now);
  speakCallout(alert, volume);
}

function speakCallout(alert: GpwsAlert, volume: number): void {
  if (typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') return;
  try {
    const speech = mapGpwsCalloutToSpeechParams(alert);
    const utterance = new SpeechSynthesisUtterance(speech.text);
    utterance.rate = speech.rate;
    utterance.pitch = speech.pitch;
    utterance.volume = speech.volume * volume;
    const delivery = { alert, utterance, volume };
    active = delivery;
    const finish = () => { if (active === delivery) active = null; };
    utterance.onend = finish;
    utterance.onerror = finish;
    speechSynthesis.speak(utterance);
  } catch {
    active = null;
  }
}
