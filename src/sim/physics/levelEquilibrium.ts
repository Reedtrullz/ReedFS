import { B737_800_FDM } from '../data/aircraft/b737-800-fdm.v1';
import { atmosphereForDensityAltitude, type DensityAltitudeWeather } from './atmosphere';
import { computeAero } from './aero';
import { solvePitchTrimForState } from './trimSolver';
import { updateEngines } from '../systems/engine';
import { eulerToQuat } from './quaternion';
import { bodyToNed } from './frames';
import { createB737GearStations, type AircraftSpec, type AircraftState, type ControlInputs } from '../types';
import type { WindInfo } from '../weather';
import { ktToMs } from './units';

export const LEVEL_EQUILIBRIUM_TOLERANCES = {
  forceN: 0.1,
  momentNm: 0.1,
  maxAngleIterations: 60,
  maxTrimIterations: 50,
  maxThrottleIterations: 50,
  initialDownVelocityMs: 1e-8,
} as const;

const G = 9.80665;
const SOLVER_ID = 'rfs-level-equilibrium-v1';
const AERO_MODEL_ID = 'b737-800-fdm';
const GROUND_CLEARANCE_FT = 1_000;
const AOA_MARGIN_RAD = 2 * Math.PI / 180;
const CLEAN_POLAR = B737_800_FDM.aero.flapPolars[0];
const ENGINE_MODEL = B737_800_FDM.engine;

export interface LevelEquilibriumFuelRequest {
  centerTank: number;
  leftTank: number;
  rightTank: number;
}

export interface LevelEquilibriumRequest {
  targetTasKt: number;
  altitudeFt: number;
  weather: DensityAltitudeWeather;
  spec: AircraftSpec;
  grossWeightKg: number;
  cgPercent: number;
  fuel: LevelEquilibriumFuelRequest;
  state?: AircraftState;
}

export interface LevelEquilibriumControls extends ControlInputs {
  throttle: number;
  trimUnits: number;
}

export interface LevelEquilibriumProvenance {
  solverId: string;
  aeroModelId: string;
  engineModelId: string;
  weatherQnhHpa: number;
  weatherSurfaceTemperatureC: number;
  targetTasKt: number;
  altitudeFt: number;
  grossWeightKg: number;
  cgPercent: number;
}

export interface LevelEquilibriumInfeasible {
  status: 'infeasible';
  reason: string;
  provenance: LevelEquilibriumProvenance;
}

export interface LevelEquilibriumConverged {
  status: 'converged';
  aircraft: AircraftState;
  controls: LevelEquilibriumControls;
  residuals: {
    normalForceN: number;
    axialForceN: number;
    sideForceN: number;
    pitchMomentNm: number;
    rollMomentNm: number;
    yawMomentNm: number;
    initialDownVelocityMs: number;
  };
  tolerances: typeof LEVEL_EQUILIBRIUM_TOLERANCES;
  angleIterations: number;
  trimIterations: number;
  throttleIterations: number;
  provenance: LevelEquilibriumProvenance;
}

export type LevelEquilibriumResult = LevelEquilibriumConverged | LevelEquilibriumInfeasible;

function provenanceFor(request: LevelEquilibriumRequest): LevelEquilibriumProvenance {
  return {
    solverId: SOLVER_ID,
    aeroModelId: AERO_MODEL_ID,
    engineModelId: AERO_MODEL_ID,
    weatherQnhHpa: request.weather.qnhHpa,
    weatherSurfaceTemperatureC: request.weather.surfaceTemperatureC,
    targetTasKt: request.targetTasKt,
    altitudeFt: request.altitudeFt,
    grossWeightKg: request.grossWeightKg,
    cgPercent: request.cgPercent,
  };
}

function infeasible(reason: string, provenance: LevelEquilibriumProvenance): LevelEquilibriumInfeasible {
  return { status: 'infeasible', reason, provenance };
}

function validateRequest(request: LevelEquilibriumRequest, wind: WindInfo | null): string | null {
  if (!Number.isFinite(request.targetTasKt) || request.targetTasKt <= 0) return 'target TAS must be finite and positive';
  if (!Number.isFinite(request.altitudeFt) || request.altitudeFt <= 0) return 'altitude must be finite and above ground';
  if (!Number.isFinite(request.grossWeightKg) || request.grossWeightKg <= 0) return 'gross weight must be finite and positive';
  if (!Number.isFinite(request.cgPercent)) return 'CG must be finite';
  if (request.cgPercent < request.spec.cgLimits[0] || request.cgPercent > request.spec.cgLimits[1]) return 'CG outside aircraft limits';
  if (request.grossWeightKg > request.spec.maxTakeoffWeight) return 'gross weight exceeds MTOW';
  if (!Number.isFinite(request.weather.qnhHpa) || !Number.isFinite(request.weather.surfaceTemperatureC)) return 'weather must be finite';
  if (request.fuel.centerTank <= 0 || request.fuel.leftTank <= 0 || request.fuel.rightTank <= 0) return 'all tank loads must be positive';
  const requestFuelTotalKg = request.fuel.centerTank + request.fuel.leftTank + request.fuel.rightTank;
  if (request.grossWeightKg <= request.spec.emptyWeight + requestFuelTotalKg) return 'gross weight must cover airframe and fuel';
  if (wind && (wind.speed >= 0.5 || (wind.gustSpeed !== undefined && wind.gustSpeed >= 0.5))) return 'wind and gusts are unsupported; calm air only';
  return null;
}

function syntheticBaseState(request: LevelEquilibriumRequest): AircraftState {
  const fuelTotalKg = request.fuel.centerTank + request.fuel.leftTank + request.fuel.rightTank;
  const state: AircraftState = {
    position: { lat: 0, lon: 0, alt: request.altitudeFt },
    velocity: { u: 0, v: 0, w: 0 },
    attitude: { phi: 0, theta: 0, psi: 0 },
    quaternion: eulerToQuat(0, 0, 0),
    angularVel: { p: 0, q: 0, r: 0 },
    config: {
      flapSetting: 0,
      gearDown: false,
      gearPosition: 0,
      spoilersArmed: false,
      spoilersDeployed: false,
      speedBrake: 0,
      stabilizerTrimUnits: 0,
    },
    engines: [
      { n1: 0, n2: 0, egt: 20, fuelFlow: 0, thrust: 0, running: false },
      { n1: 0, n2: 0, egt: 20, fuelFlow: 0, thrust: 0, running: false },
    ],
    fuel: {
      totalFuel: fuelTotalKg,
      fuelFlowTotal: 0,
      centerTank: request.fuel.centerTank,
      leftTank: request.fuel.leftTank,
      rightTank: request.fuel.rightTank,
    },
    electrical: { gen1Online: true, gen2Online: true, acBusPowered: true, batteryVolts: 28 },
    hydraulic: { systemAPsi: 3000, systemBPsi: 3000, standbyPsi: 0 },
    zeroFuelWeight: request.grossWeightKg - fuelTotalKg,
    zeroFuelCg: request.cgPercent,
    grossWeight: request.grossWeightKg,
    payloadWeight: request.grossWeightKg - request.spec.emptyWeight - fuelTotalKg,
    cg: request.cgPercent,
    ground: {
      aglFt: request.altitudeFt,
      groundAltFt: 0,
      weightOnWheels: false,
      normalForceN: 0,
      lastTouchdownSinkRateMps: 0,
      onRunway: false,
      contact: 'none',
      tailstrike: false,
      gearStations: createB737GearStations(0, false),
    },
    simTime: 0,
    utcEpochMs: 0,
    timeOfDay: 12,
    flightPhase: 'CRUISE',
    flightPhaseStartedMs: 0,
  };
  return state;
}

function baseStateFor(request: LevelEquilibriumRequest): AircraftState {
  const state = request.state ? structuredClone(request.state) : syntheticBaseState(request);
  state.position.alt = request.altitudeFt;
  const fuelTotalKg = request.fuel.centerTank + request.fuel.leftTank + request.fuel.rightTank;
  state.fuel = {
    totalFuel: fuelTotalKg,
    fuelFlowTotal: 0,
    centerTank: request.fuel.centerTank,
    leftTank: request.fuel.leftTank,
    rightTank: request.fuel.rightTank,
  };
  state.payloadWeight = request.grossWeightKg - request.spec.emptyWeight - fuelTotalKg;
  state.zeroFuelWeight = request.grossWeightKg - fuelTotalKg;
  state.grossWeight = request.grossWeightKg;
  state.zeroFuelCg = request.cgPercent;
  state.cg = request.cgPercent;
  state.config = {
    flapSetting: 0,
    gearDown: false,
    gearPosition: 0,
    spoilersArmed: false,
    spoilersDeployed: false,
    speedBrake: 0,
    stabilizerTrimUnits: 0,
  };
  state.ground = {
    ...state.ground,
    aglFt: request.altitudeFt - state.ground.groundAltFt,
    weightOnWheels: false,
    normalForceN: 0,
    onRunway: false,
    contact: 'none',
    tailstrike: false,
    gearStations: createB737GearStations(0, false),
  };
  return state;
}

function baseControls(): ControlInputs {
  return {
    elevator: 0,
    aileron: 0,
    rudder: 0,
    throttle1: 0,
    throttle2: 0,
    fuelCutoff1: false,
    fuelCutoff2: false,
    flapLever: 0,
    gearLever: 'UP',
    spoilers: 0,
    brake: 0,
  };
}

function seedEngines(state: AircraftState, controls: ControlInputs, throttle: number, spec: AircraftSpec, weather: DensityAltitudeWeather): void {
  const n1 = ENGINE_MODEL.idleN1Percent + throttle * (ENGINE_MODEL.togaN1Percent - ENGINE_MODEL.idleN1Percent);
  const n2 = ENGINE_MODEL.idleN2Percent + (n1 - ENGINE_MODEL.idleN1Percent) * ENGINE_MODEL.n2PerN1Percent;
  for (const engine of state.engines) {
    engine.n1 = n1;
    engine.n2 = n2;
    engine.running = true;
  }
  updateEngines(state, { ...controls, throttle1: throttle, throttle2: throttle }, spec, 0, null, weather);
}

function normalForceResidualForPitch(
  state: AircraftState,
  controls: ControlInputs,
  spec: AircraftSpec,
  pitchRad: number,
  targetTasMs: number,
  weather: DensityAltitudeWeather,
): { residual: number; lift: number } {
  const candidate = structuredClone(state);
  candidate.attitude.theta = pitchRad;
  candidate.quaternion = eulerToQuat(candidate.attitude.phi, pitchRad, candidate.attitude.psi);
  candidate.velocity.u = targetTasMs * Math.cos(pitchRad);
  candidate.velocity.w = targetTasMs * Math.sin(pitchRad);
  const aero = computeAero(candidate, controls, spec, undefined, null, weather);
  const weightN = candidate.grossWeight * G;
  const tasMs = Math.hypot(candidate.velocity.u, candidate.velocity.v, candidate.velocity.w);
  const cosThetaW = tasMs > 0 ? candidate.velocity.u / tasMs : 1;
  return { residual: aero.lift - weightN * cosThetaW, lift: aero.lift };
}

function bracketRoot(lower: number, upper: number, evaluate: (value: number) => number, maxIterations: number): { root: number; iterations: number } | null {
  let low = lower;
  let high = upper;
  let lowValue = evaluate(low);
  const highValue = evaluate(high);
  if (lowValue === 0) return { root: low, iterations: 0 };
  if (highValue === 0) return { root: high, iterations: 0 };
  if (Math.sign(lowValue) === Math.sign(highValue)) return null;
  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    const mid = (low + high) / 2;
    const midValue = evaluate(mid);
    if (midValue === 0 || (high - low) / 2 < 1e-9) return { root: mid, iterations: iteration };
    if (Math.sign(lowValue) === Math.sign(midValue)) {
      low = mid;
      lowValue = midValue;
    } else {
      high = mid;
    }
  }
  return { root: (low + high) / 2, iterations: maxIterations };
}

function throttleResidualFor(state: AircraftState, controls: ControlInputs, spec: AircraftSpec, throttle: number, weather: DensityAltitudeWeather): { residual: number; thrust: number; dragBodyX: number } {
  const candidate = structuredClone(state);
  seedEngines(candidate, controls, throttle, spec, weather);
  const aero = computeAero(candidate, { ...controls, throttle1: throttle, throttle2: throttle }, spec, undefined, null, weather);
  const weightN = candidate.grossWeight * G;
  const tasMs = Math.hypot(candidate.velocity.u, candidate.velocity.v, candidate.velocity.w);
  const sinThetaW = tasMs > 0 ? candidate.velocity.w / tasMs : 0;
  return {
    residual: aero.thrust + aero.dragBodyX + aero.liftBodyX - weightN * sinThetaW,
    thrust: aero.thrust,
    dragBodyX: aero.dragBodyX,
  };
}

export function solveLevelEquilibrium(
  request: LevelEquilibriumRequest,
  wind: WindInfo | null = null,
): LevelEquilibriumResult {
  const provenance = provenanceFor(request);
  const validationFailure = validateRequest(request, wind);
  if (validationFailure) return infeasible(validationFailure, provenance);

  const { targetTasKt, altitudeFt, weather, spec } = request;
  if (altitudeFt < GROUND_CLEARANCE_FT) return infeasible('altitude must clear the ground-effect domain', provenance);
  const targetTasMs = ktToMs(targetTasKt);
  const atmosphere = atmosphereForDensityAltitude(altitudeFt, weather);
  if (targetTasMs >= atmosphere.speedOfSound) return infeasible('target TAS must remain subsonic', provenance);

  const state = baseStateFor(request);
  state.velocity.u = targetTasMs;
  state.velocity.v = 0;
  state.velocity.w = 0;
  const controls = baseControls();

  const stallAoaRad = CLEAN_POLAR.alphaZeroLiftRad + CLEAN_POLAR.clMax / CLEAN_POLAR.clAlpha;
  const lowerPitchRad = CLEAN_POLAR.alphaZeroLiftRad + AOA_MARGIN_RAD;
  const upperPitchRad = stallAoaRad - AOA_MARGIN_RAD;
  if (upperPitchRad <= lowerPitchRad) return infeasible('clean polar prestall domain is empty with margin', provenance);

  const angleSolution = bracketRoot(
    lowerPitchRad,
    upperPitchRad,
    (pitch) => normalForceResidualForPitch(state, controls, spec, pitch, targetTasMs, weather).residual,
    LEVEL_EQUILIBRIUM_TOLERANCES.maxAngleIterations,
  );
  if (!angleSolution) {
    return infeasible('normal-force pitch bracket failed: level lift unreachable in prestall clean domain', provenance);
  }
  const solvedPitchRad = angleSolution.root;
  state.attitude.theta = solvedPitchRad;
  state.quaternion = eulerToQuat(state.attitude.phi, solvedPitchRad, state.attitude.psi);
  state.velocity.u = targetTasMs * Math.cos(solvedPitchRad);
  state.velocity.w = targetTasMs * Math.sin(solvedPitchRad);

  const trimSolution = solvePitchTrimForState(state, controls, spec, {
    elevator: 0,
    minTrimUnits: 0,
    maxTrimUnits: 15,
    toleranceNm: LEVEL_EQUILIBRIUM_TOLERANCES.momentNm,
    maxIterations: LEVEL_EQUILIBRIUM_TOLERANCES.maxTrimIterations,
  });
  if (!trimSolution.converged) {
    return infeasible(`pitch trim bracket failed at solved AoA: residual ${trimSolution.pitchMomentNm.toFixed(3)} Nm`, provenance);
  }
  state.config.stabilizerTrimUnits = trimSolution.stabilizerTrimUnits;

  const throttleSolution = bracketRoot(
    0,
    1,
    (throttle) => throttleResidualFor(state, controls, spec, throttle, weather).residual,
    LEVEL_EQUILIBRIUM_TOLERANCES.maxThrottleIterations,
  );
  if (!throttleSolution) {
    const idle = throttleResidualFor(state, controls, spec, 0, weather);
    const toga = throttleResidualFor(state, controls, spec, 1, weather);
    const direction = idle.residual > 0 && toga.residual > 0
      ? 'idle thrust already exceeds axial requirement'
      : 'TOGA thrust insufficient for axial requirement';
    return infeasible(`steady-throttle bracket failed: ${direction}`, provenance);
  }
  const solvedThrottle = Math.min(1, Math.max(0, throttleSolution.root));
  seedEngines(state, controls, solvedThrottle, spec, weather);

  const committedControls: ControlInputs = {
    ...controls,
    throttle1: solvedThrottle,
    throttle2: solvedThrottle,
  };
  const aero = computeAero(state, committedControls, spec, undefined, null, weather);
  const weightN = request.grossWeightKg * G;
  const tasMs = Math.hypot(state.velocity.u, state.velocity.v, state.velocity.w);
  const cosThetaW = tasMs > 0 ? state.velocity.u / tasMs : 1;
  const sinThetaW = tasMs > 0 ? state.velocity.w / tasMs : 0;
  const residuals = {
    normalForceN: aero.lift - weightN * cosThetaW,
    axialForceN: aero.thrust + aero.dragBodyX + aero.liftBodyX - weightN * sinThetaW,
    sideForceN: aero.side + aero.dragBodyY,
    pitchMomentNm: aero.pitchMoment,
    rollMomentNm: aero.rollMoment,
    yawMomentNm: aero.yawMoment,
    initialDownVelocityMs: bodyToNed(state.velocity, state.attitude).down,
  };
  const { forceN, momentNm } = LEVEL_EQUILIBRIUM_TOLERANCES;
  if (Math.abs(residuals.normalForceN) > forceN) return infeasible(`normal-force residual ${residuals.normalForceN.toFixed(3)} N exceeds tolerance`, provenance);
  if (Math.abs(residuals.axialForceN) > forceN) return infeasible(`axial-force residual ${residuals.axialForceN.toFixed(3)} N exceeds tolerance`, provenance);
  if (Math.abs(residuals.sideForceN) > forceN) return infeasible(`side-force residual ${residuals.sideForceN.toFixed(3)} N exceeds tolerance`, provenance);
  if (Math.abs(residuals.pitchMomentNm) > momentNm) return infeasible(`pitch-moment residual ${residuals.pitchMomentNm.toFixed(3)} Nm exceeds tolerance`, provenance);
  if (Math.abs(residuals.rollMomentNm) > momentNm) return infeasible(`roll-moment residual ${residuals.rollMomentNm.toFixed(3)} Nm exceeds tolerance`, provenance);
  if (Math.abs(residuals.yawMomentNm) > momentNm) return infeasible(`yaw-moment residual ${residuals.yawMomentNm.toFixed(3)} Nm exceeds tolerance`, provenance);
  if (Math.abs(residuals.initialDownVelocityMs) > LEVEL_EQUILIBRIUM_TOLERANCES.initialDownVelocityMs) {
    return infeasible(`initial down velocity ${residuals.initialDownVelocityMs.toFixed(9)} m/s exceeds tolerance`, provenance);
  }

  return {
    status: 'converged',
    aircraft: state,
    controls: {
      ...committedControls,
      throttle: solvedThrottle,
      trimUnits: trimSolution.stabilizerTrimUnits,
    },
    residuals,
    tolerances: LEVEL_EQUILIBRIUM_TOLERANCES,
    angleIterations: angleSolution.iterations,
    trimIterations: trimSolution.iterations,
    throttleIterations: throttleSolution.iterations,
    provenance,
  };
}
