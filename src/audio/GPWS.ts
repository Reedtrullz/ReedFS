import type { AircraftState } from '../sim/types';

function checkMode1(state: AircraftState): string | null {
  const descentRate = -state.velocity.w * 196.85;
  const alt = state.position.alt;
  if (alt < 2500 && descentRate > 5000) return 'SINK RATE';
  if (alt < 1000 && descentRate > 2000) return 'PULL UP';
  return null;
}

function checkMode4(state: AircraftState): string | null {
  const alt = state.position.alt;
  if (alt < 500 && !state.config.gearDown && state.velocity.u > 10) return 'TOO LOW GEAR';
  if (alt < 200 && state.config.flapSetting < 15 && state.velocity.u > 10) return 'TOO LOW FLAPS';
  return null;
}

function checkMode5(state: AircraftState): string | null {
  const alt = state.position.alt;
  const descentRate = -state.velocity.w * 196.85;
  if (alt < 1000 && descentRate > 500) return 'GLIDESLOPE';
  return null;
}

export function checkGPWS(state: AircraftState): string | null {
  return checkMode1(state) ?? checkMode4(state) ?? checkMode5(state);
}

let lastAlert = '';
let lastAlertTime = 0;

export function updateGPWS(state: AircraftState): void {
  const now = performance.now();
  const alert = checkGPWS(state);
  if (alert && alert !== lastAlert && now - lastAlertTime > 3000) {
    lastAlert = alert;
    lastAlertTime = now;
    speakCallout(alert);
  }
}

function speakCallout(text: string): void {
  if (typeof speechSynthesis === 'undefined') return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.8;
  utterance.pitch = 0.9;
  utterance.volume = 0.7;
  speechSynthesis.speak(utterance);
}
