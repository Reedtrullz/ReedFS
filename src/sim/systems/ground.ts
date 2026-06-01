import type { AircraftState, ControlInputs, GearStationState, GroundContactType, GroundState } from '../types';
import { createB737GearStations } from '../types';
import { bodyToNed, nedToBody } from '../physics/frames';
import { eulerToQuat } from '../physics/quaternion';
import type { GroundSurfaceSample } from '../runwaySurface';
import { RUNWAY_FRICTION_SCALE } from '../runwaySurface';

export const ENVA_RUNWAY_ALT_FT = 56;
export const KSEA_RUNWAY_ALT_FT = 432;
export const GROUND_CONTACT_EPSILON_FT = 0.5;
const G = 9.80665;
const FT_TO_M = 0.3048;

const ROLLING_FRICTION_COEFFICIENT = 0.35 / G;
const MAX_BRAKE_COEFFICIENT = 6.0 / G;
const MAX_BRAKE_FRICTION_COEFFICIENT = 0.55;
const STOP_EPSILON_MPS = 0.05;
const BREAKAWAY_THROTTLE = 0.05;
const MIN_GROUND_PITCH_RAD = 0;
const MAX_GROUND_PITCH_RAD = 0.35;
const MAX_GROUND_ROLL_RAD = 0.2;
const MAX_RUDDER_PEDAL_NOSEWHEEL_STEERING_RAD = 7 * Math.PI / 180;
const STEERING_FADE_START_MPS = 30;
const STEERING_FADE_END_MPS = 70;
const TOUCHDOWN_MIN_SINK_RATE_MPS = 0.25;
const TOUCHDOWN_ANGULAR_DAMPING = 0.35;
const BELLY_SLIDE_DECEL_MPS2 = 4.0;
const CRASH_SLIDE_DECEL_MPS2 = 9.0;
const BELLY_CONTACT_ANGULAR_RETENTION_PER_SECOND = 0.7;
const CRASH_CONTACT_ANGULAR_RETENTION_PER_SECOND = 0.25;
const OLEO_DAMPING_RATIO = 0.35;
const TIRE_CORNERING_STIFFNESS_PER_NORMAL = 3.2;
const MAX_TIRE_SIDE_FRICTION_COEFFICIENT = 0.45;
const MIN_SLIP_FORWARD_SPEED_MPS = 2;
// Mirrors the current B737-800 yaw inertia so ground.ts can stay spec-agnostic for this pure tire helper.
const APPROX_B737_YAW_INERTIA_KGM2 = 4_610_000;

export type GroundContactResult = GroundState;

export interface GroundContactOptions {
  normalForceN?: number;
  allowLiftoff?: boolean;
  surface?: GroundSurfaceSample;
}

export interface GroundRollForceBreakdown {
  rollingNormalForceN: number;
  brakeNormalForceN: number;
  rollingFrictionForceN: number;
  brakeForceN: number;
  retardingForceN: number;
  accelerationMps2: number;
  yawMomentNm: number;
  yawAccelerationRadps2: number;
  antiSkidLimited: boolean;
}

export interface BrakeCommand {
  leftBrake: number;
  rightBrake: number;
  antiSkid?: boolean;
}

export interface WheelBrakeStationForce {
  stationId: GearStationState['id'];
  brakeCommand: number;
  normalForceN: number;
  requestedBrakeForceN: number;
  brakeForceN: number;
  antiSkidLimited: boolean;
}

export interface WheelBrakeForceBreakdown {
  brakeNormalForceN: number;
  requestedBrakeForceN: number;
  leftBrakeForceN: number;
  rightBrakeForceN: number;
  brakeForceN: number;
  yawMomentNm: number;
  yawAccelerationRadps2: number;
  antiSkidLimited: boolean;
  stationForces: WheelBrakeStationForce[];
}

export interface TireSideForceBreakdown {
  loadedNormalForceN: number;
  peakSideForceN: number;
  sideForceN: number;
  yawMomentNm: number;
  lateralAccelerationMps2: number;
  yawAccelerationRadps2: number;
  frictionLimited: boolean;
}

export interface OleoStrutLoadOptions {
  totalStaticNormalForceN: number;
  referenceWeightN?: number;
  groundPenetrationM: number;
  runwayDownMps: number;
}

export interface OleoStrutLoadBreakdown {
  totalNormalForceN: number;
  springForceN: number;
  dampingForceN: number;
  gearStations: GearStationState[];
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampSymmetric(value: number, limit: number): number {
  return clamp(value, -limit, limit);
}

function hasBreakawayThrustCommand(inputs: ControlInputs): boolean {
  return Math.max(inputs.throttle1, inputs.throttle2) > BREAKAWAY_THROTTLE;
}

function isRollingForSteering(state: AircraftState): boolean {
  return Math.abs(state.velocity.u) > STOP_EPSILON_MPS;
}

function brakeDirectionForVelocity(state: AircraftState): number {
  if (state.velocity.u > STOP_EPSILON_MPS) return -1;
  if (state.velocity.u < -STOP_EPSILON_MPS) return 1;
  return 0;
}

function brakeCommandForStation(command: BrakeCommand, station: GearStationState): number {
  if (!station.brakeCapable) return 0;
  if (station.id === 'leftMain') return clamp01(command.leftBrake);
  if (station.id === 'rightMain') return clamp01(command.rightBrake);
  return 0;
}

export function brakeCommandFromInputs(inputs: ControlInputs): BrakeCommand {
  const symmetricBrake = clamp01(inputs.brake);
  return {
    leftBrake: Math.max(symmetricBrake, clamp01(inputs.leftBrake ?? 0)),
    rightBrake: Math.max(symmetricBrake, clamp01(inputs.rightBrake ?? 0)),
  };
}

function frictionScaleForSurface(surface?: GroundSurfaceSample) {
  return surface?.frictionScale ?? RUNWAY_FRICTION_SCALE;
}

function grossWeightForceN(state: AircraftState): number {
  return Math.max(0, state.grossWeight) * G;
}

function setGroundState(
  state: AircraftState,
  groundAltFt: number,
  contact: GroundContactType,
  weightOnWheels: boolean,
  normalForceN: number,
  gearStationsOverride?: GearStationState[],
  touchdownSinkRateMps?: number,
  onRunway = contact !== 'none',
): GroundState {
  const aglFt = Math.max(0, state.position.alt - groundAltFt);
  const gearStations = gearStationsOverride ?? createB737GearStations(
    contact === 'gear' && weightOnWheels ? normalForceN : 0,
    contact === 'gear' && weightOnWheels,
  );
  const lastTouchdownSinkRateMps = touchdownSinkRateMps !== undefined
    ? touchdownSinkRateMps
    : contact === 'gear' && weightOnWheels
      ? state.ground.lastTouchdownSinkRateMps
      : 0;
  const ground: GroundState = {
    aglFt,
    groundAltFt,
    weightOnWheels,
    normalForceN,
    lastTouchdownSinkRateMps,
    onRunway: contact !== 'none' && onRunway,
    contact,
    gearStations,
  };
  state.ground = ground;
  return ground;
}

export function constrainRunwayNormalVelocity(state: AircraftState): void {
  const ned = bodyToNed(state.velocity, state.attitude);
  state.velocity = nedToBody({ ...ned, down: 0 }, state.attitude);
}

export function computeOleoStrutLoads(
  gearStations: GearStationState[],
  options: OleoStrutLoadOptions,
): OleoStrutLoadBreakdown {
  const totalStaticNormalForceN = Math.max(0, options.totalStaticNormalForceN);
  const referenceWeightN = Math.max(totalStaticNormalForceN, Math.max(0, options.referenceWeightN ?? 0));
  const groundPenetrationM = Math.max(0, options.groundPenetrationM);
  const compressionRateMps = Math.max(0, options.runwayDownMps);
  let springForceN = 0;
  let dampingForceN = 0;

  const loadedGearStations = gearStations.map((station) => {
    const staticStationForceN = station.weightOnWheel ? totalStaticNormalForceN * station.staticLoadFraction : 0;
    const referenceStationForceN = station.weightOnWheel ? referenceWeightN * station.staticLoadFraction : 0;
    if (!station.weightOnWheel || (staticStationForceN <= 0 && groundPenetrationM <= 0 && compressionRateMps <= 0)) {
      return { ...station, compressionM: 0, normalForceN: 0 };
    }

    const staticCompressionM = staticStationForceN / station.springStiffnessNPerM;
    const compressionM = clamp(staticCompressionM + groundPenetrationM, 0, station.maxCompressionM);
    const stationSpringForceN = station.springStiffnessNPerM * compressionM;
    const effectiveStationMassKg = Math.max(referenceStationForceN, stationSpringForceN) / G;
    const criticalDampingNPerMps = 2 * Math.sqrt(station.springStiffnessNPerM * effectiveStationMassKg);
    const stationDampingForceN = OLEO_DAMPING_RATIO * criticalDampingNPerMps * compressionRateMps;
    const normalForceN = stationSpringForceN + stationDampingForceN;

    springForceN += stationSpringForceN;
    dampingForceN += stationDampingForceN;

    return {
      ...station,
      compressionM,
      normalForceN,
      weightOnWheel: station.weightOnWheel,
    };
  });

  return {
    totalNormalForceN: springForceN + dampingForceN,
    springForceN,
    dampingForceN,
    gearStations: loadedGearStations,
  };
}

export function computeWheelBrakeForces(
  state: AircraftState,
  command: BrakeCommand,
  gearStations: GearStationState[] = state.ground.gearStations,
  surface?: GroundSurfaceSample,
): WheelBrakeForceBreakdown {
  let brakeNormalForceN = 0;
  let requestedBrakeForceN = 0;
  let leftBrakeForceN = 0;
  let rightBrakeForceN = 0;
  let brakeForceN = 0;
  let yawMomentNm = 0;
  let antiSkidLimited = false;
  const useAntiSkid = command.antiSkid !== false;
  const longitudinalForceDirection = brakeDirectionForVelocity(state);
  const rollingForBraking = longitudinalForceDirection !== 0;
  const frictionScale = frictionScaleForSurface(surface);
  const stationForces: WheelBrakeStationForce[] = [];

  for (const station of gearStations) {
    const normalForceN = station.weightOnWheel && station.brakeCapable ? Math.max(0, station.normalForceN) : 0;
    const brakeCommand = brakeCommandForStation(command, station);
    const requestedStationBrakeForceN = brakeCommand * MAX_BRAKE_COEFFICIENT * normalForceN;
    const availableStationBrakeForceN = MAX_BRAKE_FRICTION_COEFFICIENT * frictionScale.brake * normalForceN;
    const stationAntiSkidLimited = rollingForBraking && useAntiSkid && requestedStationBrakeForceN > availableStationBrakeForceN + 1e-9;
    const stationBrakeForceN = rollingForBraking
      ? useAntiSkid
        ? Math.min(requestedStationBrakeForceN, availableStationBrakeForceN)
        : requestedStationBrakeForceN
      : 0;

    if (normalForceN > 0) {
      brakeNormalForceN += normalForceN;
    }
    requestedBrakeForceN += requestedStationBrakeForceN;
    brakeForceN += stationBrakeForceN;
    if (station.id === 'leftMain') leftBrakeForceN += stationBrakeForceN;
    if (station.id === 'rightMain') rightBrakeForceN += stationBrakeForceN;
    if (stationAntiSkidLimited) antiSkidLimited = true;

    const longitudinalForceN = stationBrakeForceN * longitudinalForceDirection;
    yawMomentNm += -station.positionBodyM.y * longitudinalForceN;
    stationForces.push({
      stationId: station.id,
      brakeCommand,
      normalForceN,
      requestedBrakeForceN: requestedStationBrakeForceN,
      brakeForceN: stationBrakeForceN,
      antiSkidLimited: stationAntiSkidLimited,
    });
  }

  return {
    brakeNormalForceN,
    requestedBrakeForceN,
    leftBrakeForceN,
    rightBrakeForceN,
    brakeForceN,
    yawMomentNm,
    yawAccelerationRadps2: yawMomentNm / APPROX_B737_YAW_INERTIA_KGM2,
    antiSkidLimited,
    stationForces,
  };
}

export function computeGroundRollForces(
  state: AircraftState,
  inputs: ControlInputs,
  gearStations: GearStationState[] = state.ground.gearStations,
  surface?: GroundSurfaceSample,
): GroundRollForceBreakdown {
  const loadedStations = gearStations.filter((station) => station.weightOnWheel);
  const rollingNormalForceN = loadedStations.reduce((sum, station) => sum + Math.max(0, station.normalForceN), 0);
  const frictionScale = frictionScaleForSurface(surface);
  const brakeForces = computeWheelBrakeForces(
    state,
    brakeCommandFromInputs(inputs),
    gearStations,
    surface,
  );
  const rollingFrictionForceN = ROLLING_FRICTION_COEFFICIENT * frictionScale.rolling * rollingNormalForceN;
  const retardingForceN = rollingFrictionForceN + brakeForces.brakeForceN;
  return {
    rollingNormalForceN,
    brakeNormalForceN: brakeForces.brakeNormalForceN,
    rollingFrictionForceN,
    brakeForceN: brakeForces.brakeForceN,
    retardingForceN,
    accelerationMps2: retardingForceN / Math.max(1, state.grossWeight),
    yawMomentNm: brakeForces.yawMomentNm,
    yawAccelerationRadps2: brakeForces.yawAccelerationRadps2,
    antiSkidLimited: brakeForces.antiSkidLimited,
  };
}

export function computeNosewheelSteeringAngleRad(inputs: ControlInputs, forwardSpeedMps: number): number {
  const speed = Math.abs(forwardSpeedMps);
  const fade = speed <= STEERING_FADE_START_MPS
    ? 1
    : speed >= STEERING_FADE_END_MPS
      ? 0
      : (STEERING_FADE_END_MPS - speed) / (STEERING_FADE_END_MPS - STEERING_FADE_START_MPS);
  return clamp01(Math.abs(inputs.rudder)) * Math.sign(inputs.rudder) * MAX_RUDDER_PEDAL_NOSEWHEEL_STEERING_RAD * fade;
}

export function computeTireSideForces(
  state: AircraftState,
  gearStations: GearStationState[] = state.ground.gearStations,
  surface?: GroundSurfaceSample,
): TireSideForceBreakdown {
  let loadedNormalForceN = 0;
  let peakSideForceN = 0;
  let sideForceN = 0;
  let yawMomentNm = 0;
  let frictionLimited = false;
  const forwardReferenceMps = Math.max(Math.abs(state.velocity.u), MIN_SLIP_FORWARD_SPEED_MPS);
  const rollingForSteering = isRollingForSteering(state);
  const frictionScale = frictionScaleForSurface(surface);

  for (const station of gearStations) {
    const normalForceN = station.weightOnWheel ? Math.max(0, station.normalForceN) : 0;
    if (normalForceN <= 0) continue;

    loadedNormalForceN += normalForceN;
    const lateralVelocityAtStationMps = state.velocity.v + state.angularVel.r * station.positionBodyM.x;
    const steeringAngleRad = station.steerable && rollingForSteering ? station.steeringAngleRad : 0;
    const slipAngleRad = Math.atan2(lateralVelocityAtStationMps, forwardReferenceMps) - steeringAngleRad;
    const stationPeakSideForceN = MAX_TIRE_SIDE_FRICTION_COEFFICIENT * frictionScale.side * normalForceN;
    const desiredSideForceN = -TIRE_CORNERING_STIFFNESS_PER_NORMAL * normalForceN * slipAngleRad;
    const stationSideForceN = clampSymmetric(desiredSideForceN, stationPeakSideForceN);

    if (Math.abs(desiredSideForceN) > stationPeakSideForceN + 1e-9) {
      frictionLimited = true;
    }

    peakSideForceN += stationPeakSideForceN;
    sideForceN += stationSideForceN;
    yawMomentNm += station.positionBodyM.x * stationSideForceN;
  }

  return {
    loadedNormalForceN,
    peakSideForceN,
    sideForceN,
    yawMomentNm,
    lateralAccelerationMps2: sideForceN / Math.max(1, state.grossWeight),
    yawAccelerationRadps2: yawMomentNm / APPROX_B737_YAW_INERTIA_KGM2,
    frictionLimited,
  };
}

function wheelBaseM(gearStations: GearStationState[]): number {
  const nose = gearStations.find((station) => station.id === 'nose');
  const mains = gearStations.filter((station) => station.id === 'leftMain' || station.id === 'rightMain');
  if (!nose || mains.length === 0) return 18;
  const mainX = mains.reduce((sum, station) => sum + station.positionBodyM.x, 0) / mains.length;
  return Math.max(1, nose.positionBodyM.x - mainX);
}

function applyTouchdownDamping(state: AircraftState, sinkRateMps: number): void {
  if (sinkRateMps < TOUCHDOWN_MIN_SINK_RATE_MPS) return;
  state.angularVel.p *= TOUCHDOWN_ANGULAR_DAMPING;
  state.angularVel.q *= TOUCHDOWN_ANGULAR_DAMPING;
  state.angularVel.r *= TOUCHDOWN_ANGULAR_DAMPING;
}

function applyRunwayTangentSlideDecel(state: AircraftState, decelMps2: number, dt: number): void {
  const runwayVelocity = bodyToNed(state.velocity, state.attitude);
  const slideSpeedMps = Math.hypot(runwayVelocity.north, runwayVelocity.east);
  if (slideSpeedMps <= 0) return;

  const nextSlideSpeedMps = Math.max(0, slideSpeedMps - decelMps2 * Math.max(0, dt));
  const scale = nextSlideSpeedMps / slideSpeedMps;
  state.velocity = nedToBody({
    ...runwayVelocity,
    north: runwayVelocity.north * scale,
    east: runwayVelocity.east * scale,
  }, state.attitude);
}

function applyGearUpContactDamping(state: AircraftState, contact: GroundContactType, dt: number): void {
  const crashed = contact === 'crashed';
  applyRunwayTangentSlideDecel(state, crashed ? CRASH_SLIDE_DECEL_MPS2 : BELLY_SLIDE_DECEL_MPS2, dt);

  const angularRetentionPerSecond = crashed
    ? CRASH_CONTACT_ANGULAR_RETENTION_PER_SECOND
    : BELLY_CONTACT_ANGULAR_RETENTION_PER_SECOND;
  const angularDamping = Math.pow(angularRetentionPerSecond, Math.max(0, dt));
  state.angularVel.p *= angularDamping;
  state.angularVel.q *= angularDamping;
  state.angularVel.r *= angularDamping;
}

function applyTireSideForces(
  state: AircraftState,
  dt: number,
  gearStations: GearStationState[],
  surface?: GroundSurfaceSample,
): void {
  const tireSideForces = computeTireSideForces(state, gearStations, surface);
  const previousLateralVelocity = state.velocity.v;
  const lateralDelta = tireSideForces.lateralAccelerationMps2 * Math.max(0, dt);
  const nextLateralVelocity = previousLateralVelocity + lateralDelta;
  const effectiveNeutralSteering = !isRollingForSteering(state)
    || gearStations.every((station) => Math.abs(station.steeringAngleRad) < 1e-6);
  const forceOpposesSlip = previousLateralVelocity !== 0
    && Math.sign(tireSideForces.sideForceN) === -Math.sign(previousLateralVelocity);

  if (
    effectiveNeutralSteering &&
    forceOpposesSlip &&
    nextLateralVelocity !== 0 &&
    Math.sign(nextLateralVelocity) !== Math.sign(previousLateralVelocity)
  ) {
    state.velocity.v = 0;
  } else {
    state.velocity.v = nextLateralVelocity;
  }

  state.angularVel.r += tireSideForces.yawAccelerationRadps2 * Math.max(0, dt);
}

function applyNosewheelSteering(
  state: AircraftState,
  inputs: ControlInputs,
  gearStations: GearStationState[],
): GearStationState[] {
  const steeringAngleRad = computeNosewheelSteeringAngleRad(inputs, state.velocity.u);
  const nextStations = gearStations.map((station) => (
    station.id === 'nose' ? { ...station, steeringAngleRad } : station
  ));
  const speed = state.velocity.u;
  if (Math.abs(speed) > STOP_EPSILON_MPS && Math.abs(steeringAngleRad) > 1e-6) {
    state.angularVel.r = (speed / wheelBaseM(nextStations)) * Math.tan(steeringAngleRad);
  }

  return nextStations;
}

function applyLongitudinalGroundDecel(
  state: AircraftState,
  inputs: ControlInputs,
  dt: number,
  gearStations: GearStationState[],
  surface?: GroundSurfaceSample,
): void {
  const speed = state.velocity.u;
  const breakawayThrust = hasBreakawayThrustCommand(inputs);

  if (Math.abs(speed) <= STOP_EPSILON_MPS && !breakawayThrust) {
    state.velocity.u = 0;
    return;
  }

  const forces = computeGroundRollForces(state, inputs, gearStations, surface);
  const decel = forces.accelerationMps2 * Math.max(0, dt);
  state.angularVel.r += forces.yawAccelerationRadps2 * Math.max(0, dt);

  if (speed > 0) {
    state.velocity.u = Math.max(0, speed - decel);
  } else {
    state.velocity.u = Math.min(0, speed + decel);
  }
}

function stabilizeGroundAttitude(state: AircraftState): void {
  const clampedPhi = Math.max(-MAX_GROUND_ROLL_RAD, Math.min(MAX_GROUND_ROLL_RAD, state.attitude.phi));
  const clampedTheta = Math.max(MIN_GROUND_PITCH_RAD, Math.min(MAX_GROUND_PITCH_RAD, state.attitude.theta));

  if (clampedPhi === state.attitude.phi && clampedTheta === state.attitude.theta) {
    return;
  }

  state.attitude.phi = clampedPhi;
  state.attitude.theta = clampedTheta;
  state.angularVel.p = 0;
  state.angularVel.q = 0;
  state.quaternion = eulerToQuat(clampedPhi, clampedTheta, state.attitude.psi);
}

export function applyGroundContact(
  state: AircraftState,
  inputs: ControlInputs,
  dt: number,
  groundAltFt = KSEA_RUNWAY_ALT_FT,
  options: GroundContactOptions = {},
): GroundContactResult {
  const gearAvailableForContact = state.config.gearDown || inputs.gearLever === 'DOWN';
  const atOrBelowGround = state.position.alt <= groundAltFt + GROUND_CONTACT_EPSILON_FT;
  const runwayDownMps = bodyToNed(state.velocity, state.attitude).down;
  const touchdownSinkRateMps = !state.ground.weightOnWheels && runwayDownMps > 0 ? runwayDownMps : undefined;
  const surfaceOnRunway = options.surface?.onRunway ?? true;

  if (!atOrBelowGround) {
    return setGroundState(state, groundAltFt, 'none', false, 0);
  }

  if (!state.ground.weightOnWheels && state.position.alt >= groundAltFt && runwayDownMps < 0) {
    return setGroundState(state, groundAltFt, 'none', false, 0);
  }

  if (options.allowLiftoff && gearAvailableForContact && state.ground.weightOnWheels) {
    state.position.alt = Math.max(state.position.alt, groundAltFt);
    return setGroundState(state, groundAltFt, 'none', false, 0);
  }

  if (!gearAvailableForContact) {
    const contact: GroundContactType = state.ground.contact === 'crashed' || runwayDownMps > 5 ? 'crashed' : 'belly';
    state.position.alt = groundAltFt;
    applyGearUpContactDamping(state, contact, dt);
    constrainRunwayNormalVelocity(state);
    return setGroundState(
      state,
      groundAltFt,
      contact,
      false,
      options.normalForceN ?? grossWeightForceN(state),
      undefined,
      undefined,
      surfaceOnRunway,
    );
  }

  const staticGearNormalForceN = options.normalForceN ?? grossWeightForceN(state);
  const groundPenetrationM = Math.max(0, (groundAltFt - state.position.alt) * FT_TO_M);
  const oleoLoads = computeOleoStrutLoads(createB737GearStations(staticGearNormalForceN, true), {
    totalStaticNormalForceN: staticGearNormalForceN,
    referenceWeightN: grossWeightForceN(state),
    groundPenetrationM,
    runwayDownMps,
  });
  const gearNormalForceN = oleoLoads.totalNormalForceN;
  let loadedGearStations = oleoLoads.gearStations;
  state.position.alt = groundAltFt;
  state.config.gearDown = true;

  stabilizeGroundAttitude(state);
  applyTouchdownDamping(state, touchdownSinkRateMps ?? 0);
  loadedGearStations = applyNosewheelSteering(state, inputs, loadedGearStations);
  applyTireSideForces(state, dt, loadedGearStations, options.surface);
  applyLongitudinalGroundDecel(state, inputs, dt, loadedGearStations, options.surface);
  constrainRunwayNormalVelocity(state);

  return setGroundState(
    state,
    groundAltFt,
    'gear',
    true,
    gearNormalForceN,
    loadedGearStations,
    touchdownSinkRateMps,
    surfaceOnRunway,
  );
}
