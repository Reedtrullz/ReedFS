import type { AutopilotState, LateralMode, VerticalMode } from '@shared/autopilot/autopilotTypes';
import type { SimStore } from './simStore';
import { computeDerived } from '../sim/physics/derived';
import { quatToEuler } from '../sim/physics/quaternion';
import { deriveDisplayFmaTruth } from '../sim/systems/fmaTruth';
import { deriveEffectiveAutoflightTruth } from '../sim/systems/effectiveAutoflightTruth';
import { takeoffCueText } from '../sim/takeoffCue';
import { createDefaultAutopilotState, createDefaultAutopilotStateFromAircraft } from '../instruments/defaultAutopilotState';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function finiteNumber(value: number | null | undefined): number | null {
  return Number.isFinite(value) ? (value as number) : null;
}

function finiteTarget(value: number | null | undefined, fallback: number): number {
  return Number.isFinite(value) ? value as number : fallback;
}

function wrapHeadingDeg(value: number): number {
  return ((Math.round(value) % 360) + 360) % 360;
}

function selectedSpeedKt(apState: AutopilotState | null): number {
  return clamp(Math.round(finiteTarget(apState?.boeing.speed, 250)), 100, 340);
}

function selectedHeadingDeg(apState: AutopilotState | null): number {
  return wrapHeadingDeg(finiteTarget(apState?.boeing.heading, 0));
}

function selectedAltitudeFt(apState: AutopilotState | null): number {
  return clamp(Math.round(finiteTarget(apState?.boeing.altitude, 10000) / 100) * 100, 0, 41000);
}

function selectedVerticalSpeedFpm(apState: AutopilotState | null): number {
  return clamp(Math.round(finiteTarget(apState?.boeing.verticalSpeed, 0) / 100) * 100, -6000, 6000);
}

function modeText(value: string | undefined): string {
  return value && value.length > 0 ? value : 'OFF';
}

function shallowEqualRecord<T extends object>(a: T | null, b: T): boolean {
  if (a === null) return false;
  const keys = Object.keys(b) as Array<keyof T>;
  return keys.every((key) => Object.is(a[key], b[key]));
}

// ── PFD primitive selectors ─────────────────────────────────────────────

export const selectPfdFlightPlan = (s: SimStore) => s.flightPlan;
export const selectPfdRouteStatus = (s: SimStore) => s.routeStatus;
export const selectPfdApStateForGuidance = (s: SimStore) => s.apState;
export const selectPfdIas = (s: SimStore) => Math.max(0, computeDerived(s.aircraft, s.wind).ias);
export const selectPfdAltitude = (s: SimStore) => Math.max(0, s.aircraft.position.alt);
export const selectPfdLatitude = (s: SimStore) => s.aircraft.position.lat;
export const selectPfdLongitude = (s: SimStore) => s.aircraft.position.lon;
export const selectPfdVelocityU = (s: SimStore) => s.aircraft.velocity.u;
export const selectPfdVelocityV = (s: SimStore) => s.aircraft.velocity.v;
export const selectPfdVelocityW = (s: SimStore) => s.aircraft.velocity.w;
export const selectPfdVerticalSpeed = (s: SimStore) => computeDerived(s.aircraft, s.wind).vs;
export const selectPfdPitchDeg = (s: SimStore) => (quatToEuler(s.aircraft.quaternion).theta * 180) / Math.PI;
export const selectPfdRollDeg = (s: SimStore) => (quatToEuler(s.aircraft.quaternion).phi * 180) / Math.PI;
export const selectPfdHeadingDeg = (s: SimStore) => ((quatToEuler(s.aircraft.quaternion).psi * 180) / Math.PI + 360) % 360;
export const selectPfdRadioAltitude = (s: SimStore): number | null => {
  const ground = s.aircraft.ground;
  if (!ground) return null;
  const aglFt = Number.isFinite(ground.aglFt)
    ? ground.aglFt
    : s.aircraft.position.alt - ground.groundAltFt;
  if (!Number.isFinite(aglFt) || aglFt < 0 || aglFt >= 2500) return null;
  return Math.floor(aglFt);
};
export const selectPfdHasMcpTargets = (s: SimStore) => s.apState != null;
export const selectPfdSelectedSpeed = (s: SimStore) => s.apState?.boeing.speed ?? null;
export const selectPfdSelectedHeading = (s: SimStore) => s.apState?.boeing.heading ?? null;
export const selectPfdSelectedAltitude = (s: SimStore) => s.apState?.boeing.altitude ?? null;
export const selectPfdSelectedVerticalSpeed = (s: SimStore) => s.apState?.boeing.verticalSpeed ?? null;
export const selectPfdFlightDirectorEnabled = (s: SimStore) => Boolean(s.apState?.boeing.fdLeft || s.apState?.boeing.fdRight);
export const selectPfdSelectedScenarioId = (s: SimStore) => s.selectedScenarioId;
export const selectPfdFlightPhase = (s: SimStore) => s.aircraft.flightPhase;
export const selectPfdTakeoffCue = (s: SimStore): string | null => {
  if (!s.aircraft.ground) return null;
  const derived = computeDerived(s.aircraft, s.wind);
  return takeoffCueText(s.aircraft, derived.ias, s.selectedScenarioId);
};

export function selectPfdFmaText(kind: 'thrustActive' | 'lateralActive' | 'verticalActive' | 'autopilotStatus') {
  return (s: SimStore) => modeText(deriveDisplayFmaTruth(s.apState, {
    aircraft: s.aircraft,
    flightPlan: s.flightPlan,
    routeStatus: s.routeStatus,
  })[kind]);
}

export function selectPfdManagedSpeedKt(s: SimStore): number | null {
  const truth = deriveDisplayFmaTruth(s.apState, {
    aircraft: s.aircraft,
    flightPlan: s.flightPlan,
    routeStatus: s.routeStatus,
  }) as ReturnType<typeof deriveDisplayFmaTruth> & { managedSpeedKt?: number };
  return finiteNumber(truth.managedSpeedKt);
}

// ── MCP view model ──────────────────────────────────────────────────────

export type EnabledMcpMode = 'HDG_SEL' | 'LNAV' | 'VNAV' | 'ALT_HOLD' | 'VS' | 'SPEED' | 'N1' | 'OFF';

export interface McpModeAvailability {
  available: boolean;
  reason: string | null;
}

export interface McpModeAvailabilityState {
  status: SimStore['status'];
  weightOnWheels: boolean;
  autothrottleArmed: boolean;
  lnavAvailable: boolean;
  lnavUnavailableReason: string | null;
  vnavBackedMode: VerticalMode;
}

const VNAV_DISPLAY_MODES = new Set<VerticalMode>(['VNAV', 'VNAV_PTH', 'ALT*', 'ALT_HOLD']);

function deriveBackedVnavMode(
  apState: AutopilotState | null,
  context: Parameters<typeof deriveEffectiveAutoflightTruth>[1],
): VerticalMode {
  const aircraft = context?.aircraft;
  const probe = structuredClone(
    apState ?? (aircraft ? createDefaultAutopilotStateFromAircraft(aircraft) : createDefaultAutopilotState()),
  );
  probe.truth.autopilotStatus = 'CMD_A';
  probe.truth.verticalActive = 'VNAV';
  probe.boeing.cmdA = true;
  probe.boeing.vnav = true;
  probe.boeing.altHold = false;
  probe.boeing.vs = false;

  return deriveEffectiveAutoflightTruth(probe, context).verticalActive;
}

function mcpGuidanceAvailabilityReason(state: McpModeAvailabilityState): string | null {
  if (state.status !== 'running') return 'start the simulator and get airborne first';
  if (state.weightOnWheels) return 'aircraft must be airborne';
  return null;
}

function mcpThrustAvailabilityReason(state: McpModeAvailabilityState): string | null {
  if (state.status !== 'running') return 'start the simulator first';
  if (!state.autothrottleArmed) return 'autothrottle must be armed';
  return null;
}

function isThrustMode(mode: EnabledMcpMode): mode is 'SPEED' | 'N1' {
  return mode === 'SPEED' || mode === 'N1';
}

export function mcpModeAvailability(state: McpModeAvailabilityState, mode: EnabledMcpMode): McpModeAvailability {
  if (mode === 'OFF') return { available: true, reason: null };

  const thrustReason = isThrustMode(mode) ? mcpThrustAvailabilityReason(state) : null;
  const guidanceReason = isThrustMode(mode) ? null : mcpGuidanceAvailabilityReason(state);
  const routeReason = mode === 'LNAV' && !state.lnavAvailable
    ? `LNAV unavailable: ${state.lnavUnavailableReason ?? 'route guidance unavailable'}`
    : null;
  const vnavReason = mode === 'VNAV' && state.vnavBackedMode === 'OFF'
    ? 'VNAV unavailable: no active altitude constraint'
    : null;
  const reasons = [thrustReason, guidanceReason, routeReason, vnavReason].filter((reason): reason is string => Boolean(reason));
  return {
    available: reasons.length === 0,
    reason: reasons.length > 0 ? reasons.join('; ') : null,
  };
}

export interface McpViewModel {
  latActive: LateralMode;
  vertActive: VerticalMode;
  thrActive: string;
  vnavAvailable: boolean;
  vnavActive: boolean;
  fdLeft: boolean;
  fdRight: boolean;
  displayedLatActive: LateralMode;
  modeAvailability: Record<EnabledMcpMode, McpModeAvailability>;
  unavailableSummary: string | null;
  speedTarget: number;
  headingTarget: number;
  altitudeTarget: number;
  verticalSpeedTarget: number;
}

let lastMcpVm: McpViewModel | null = null;

export function selectMcpViewModel(s: SimStore): McpViewModel {
  const effectiveTruth = deriveEffectiveAutoflightTruth(s.apState, {
    aircraft: s.aircraft,
    flightPlan: s.flightPlan,
    routeStatus: s.routeStatus,
  });
  const latActive = effectiveTruth.lateralActive;
  const vertActive = effectiveTruth.verticalActive;
  const thrActive = effectiveTruth.thrustActive;
  const backedVnavMode = deriveBackedVnavMode(s.apState, {
    aircraft: s.aircraft,
    flightPlan: s.flightPlan,
    routeStatus: s.routeStatus,
  });
  const vnavAvailable = backedVnavMode !== 'OFF';
  const vnavActive = Boolean(s.apState?.boeing.vnav) && VNAV_DISPLAY_MODES.has(vertActive);
  const lnavAvailable = s.routeStatus.lnavAvailable;
  const displayedLatActive = latActive === 'LNAV' && !lnavAvailable ? 'OFF' : latActive;
  const displayApState = s.apState ?? createDefaultAutopilotStateFromAircraft(s.aircraft, s.wind);
  const availabilityState: McpModeAvailabilityState = {
    status: s.status,
    weightOnWheels: s.aircraft.ground.weightOnWheels,
    autothrottleArmed: displayApState.boeing.autothrottleArm,
    lnavAvailable,
    lnavUnavailableReason: s.routeStatus.lnavUnavailableReason,
    vnavBackedMode: backedVnavMode,
  };
  const modeAvailability: Record<EnabledMcpMode, McpModeAvailability> = {
    HDG_SEL: mcpModeAvailability(availabilityState, 'HDG_SEL'),
    LNAV: mcpModeAvailability(availabilityState, 'LNAV'),
    VNAV: mcpModeAvailability(availabilityState, 'VNAV'),
    ALT_HOLD: mcpModeAvailability(availabilityState, 'ALT_HOLD'),
    VS: mcpModeAvailability(availabilityState, 'VS'),
    SPEED: mcpModeAvailability(availabilityState, 'SPEED'),
    N1: mcpModeAvailability(availabilityState, 'N1'),
    OFF: mcpModeAvailability(availabilityState, 'OFF'),
  };
  const unavailableSummary = [modeAvailability.SPEED, modeAvailability.VS, modeAvailability.N1, modeAvailability.LNAV]
    .find((availability) => !availability.available)?.reason ?? null;

  const next: McpViewModel = {
    latActive,
    vertActive,
    thrActive,
    vnavAvailable,
    vnavActive,
    fdLeft: s.apState?.boeing.fdLeft ?? false,
    fdRight: s.apState?.boeing.fdRight ?? false,
    displayedLatActive,
    modeAvailability,
    unavailableSummary,
    speedTarget: selectedSpeedKt(displayApState),
    headingTarget: selectedHeadingDeg(displayApState),
    altitudeTarget: selectedAltitudeFt(displayApState),
    verticalSpeedTarget: selectedVerticalSpeedFpm(displayApState),
  };

  if (
    lastMcpVm
    && lastMcpVm.latActive === next.latActive
    && lastMcpVm.vertActive === next.vertActive
    && lastMcpVm.thrActive === next.thrActive
    && lastMcpVm.vnavAvailable === next.vnavAvailable
    && lastMcpVm.vnavActive === next.vnavActive
    && lastMcpVm.fdLeft === next.fdLeft
    && lastMcpVm.fdRight === next.fdRight
    && lastMcpVm.displayedLatActive === next.displayedLatActive
    && lastMcpVm.unavailableSummary === next.unavailableSummary
    && lastMcpVm.speedTarget === next.speedTarget
    && lastMcpVm.headingTarget === next.headingTarget
    && lastMcpVm.altitudeTarget === next.altitudeTarget
    && lastMcpVm.verticalSpeedTarget === next.verticalSpeedTarget
    && (Object.keys(next.modeAvailability) as EnabledMcpMode[]).every((mode) => (
      lastMcpVm?.modeAvailability[mode].available === next.modeAvailability[mode].available
      && lastMcpVm?.modeAvailability[mode].reason === next.modeAvailability[mode].reason
    ))
  ) {
    return lastMcpVm;
  }
  lastMcpVm = next;
  return next;
}

// ── Telemetry view model ────────────────────────────────────────────────

export interface TelemetryViewModel {
  status: SimStore['status'];
  takeoffCue: string | null;
  altitudeFt: number;
  iasKt: number;
  tasKt: number;
  groundSpeedKt: number;
  verticalSpeedFpm: number;
  mach: number;
  aoaRad: number;
  headingDeg: number;
  pitchDeg: number;
  rollDeg: number;
  leftN1: number;
  rightN1: number;
  totalFuelKg: number;
  grossWeightKg: number;
  flapSetting: number;
  gearDown: boolean;
}

let lastTelemetryVm: TelemetryViewModel | null = null;

export function selectTelemetryViewModel(s: SimStore): TelemetryViewModel {
  const d = computeDerived(s.aircraft, s.wind);
  const euler = quatToEuler(s.aircraft.quaternion);
  const next: TelemetryViewModel = {
    status: s.status,
    takeoffCue: takeoffCueText(s.aircraft, d.ias, s.selectedScenarioId),
    altitudeFt: s.aircraft.position.alt,
    iasKt: d.ias,
    tasKt: d.tas,
    groundSpeedKt: d.gs,
    verticalSpeedFpm: d.vs,
    mach: d.mach,
    aoaRad: d.aoa,
    headingDeg: (euler.psi * 180) / Math.PI,
    pitchDeg: (euler.theta * 180) / Math.PI,
    rollDeg: (euler.phi * 180) / Math.PI,
    leftN1: s.aircraft.engines[0].n1,
    rightN1: s.aircraft.engines[1].n1,
    totalFuelKg: s.aircraft.fuel.totalFuel,
    grossWeightKg: s.aircraft.grossWeight,
    flapSetting: s.aircraft.config.flapSetting,
    gearDown: s.aircraft.config.gearDown,
  };
  if (shallowEqualRecord(lastTelemetryVm, next)) return lastTelemetryVm as TelemetryViewModel;
  lastTelemetryVm = next;
  return next;
}

// ── Engine strip view model ─────────────────────────────────────────────

export interface EngineStripViewModel {
  leftN1: number;
  rightN1: number;
  flapsActual: number;
  gearDownActual: boolean;
  gearPositionActual: number;
  throttleCommandPercent: number;
  flapCommand: number;
  gearCommand: SimStore['effectiveControls']['gearLever'];
}

let lastEngineStripVm: EngineStripViewModel | null = null;

export function selectEngineStripViewModel(s: SimStore): EngineStripViewModel {
  const next: EngineStripViewModel = {
    leftN1: s.aircraft.engines[0].n1,
    rightN1: s.aircraft.engines[1].n1,
    flapsActual: s.aircraft.config.flapSetting,
    gearDownActual: s.aircraft.config.gearDown,
    gearPositionActual: s.aircraft.config.gearPosition,
    throttleCommandPercent: Math.round(Math.max(s.effectiveControls.throttle1, s.effectiveControls.throttle2) * 100),
    flapCommand: s.effectiveControls.flapLever,
    gearCommand: s.effectiveControls.gearLever,
  };
  if (shallowEqualRecord(lastEngineStripVm, next)) return lastEngineStripVm as EngineStripViewModel;
  lastEngineStripVm = next;
  return next;
}
