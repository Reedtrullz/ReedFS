import type { AircraftState, BodyStationPosition, ControlInputs, GearStationState, GroundContactType, GroundState } from '../types';
import { B737_800_SPEC, createB737GearStations } from '../types';
import { bodyToNed, nedToBody } from '../physics/frames';
import { eulerToQuat } from '../physics/quaternion';
import type { GroundSurfaceSample } from '../runwaySurface';
import { RUNWAY_FRICTION_SCALE, isPositionOnPreparedRunwayFootprint } from '../runwaySurface';
import { B737_800_FDM } from '../data/aircraft/b737-800-fdm.v1';
import type { GroundModelData } from '../data/aircraft/fdmTypes';
import { computeWheelContactGeometry, type WheelContactGeometry, type WheelStationContactGeometry } from './wheelContact';

export const ENVA_RUNWAY_ALT_FT = 56;
export const KSEA_RUNWAY_ALT_FT = 432;
export const GROUND_CONTACT_EPSILON_FT = 0.5;
const G = 9.80665;
const FT_TO_M = 0.3048;
const KT_TO_MPS = 0.514444444;
const PRE_ROTATION_MAX_PITCH_RAD = 3 * Math.PI / 180;
const MAIN_GEAR_PIVOT_MAX_PITCH_RAD = 10.5 * Math.PI / 180;
const MAIN_GEAR_PIVOT_MIN_SPEED_MPS = 125 * KT_TO_MPS;
const MAIN_GEAR_PIVOT_ELEVATOR = -0.2;
const TAIL_CONTACT_POINT_BODY_M: BodyStationPosition = {
  // Gameplay placeholder tail-skid point: aft/lower tail cone in body axes.
  // Combined with the current main-gear stations this yields a ~12.5° tailstrike
  // clearance envelope without hard-coding the strike check itself.
  x: -20.0,
  y: 0,
  z: -1.37,
};

const GEAR_CONTACT_EXTENSION_THRESHOLD = 0.95;

function actualGearExtensionFraction(state: AircraftState): number {
  const rawPosition = typeof state.config.gearPosition === 'number' && Number.isFinite(state.config.gearPosition)
    ? Math.max(0, Math.min(1, state.config.gearPosition))
    : state.config.gearDown ? 1 : 0;
  return !state.config.gearDown && rawPosition >= 0.999 ? 0 : rawPosition;
}

export const B737_GROUND_MODEL: GroundModelData = B737_800_FDM.ground;

export type GroundContactResult = GroundState;

export interface GroundContactOptions {
  normalForceN?: number;
  allowLiftoff?: boolean;
  surface?: GroundSurfaceSample;
  groundModel?: GroundModelData;
  airRelativeSpeedMps?: number;
  rotationReferenceSpeedMps?: number;
  minimumSupportedNormalForceN?: number;
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

function hasBreakawayThrustCommand(inputs: ControlInputs, groundModel: GroundModelData): boolean {
  return Math.max(inputs.throttle1, inputs.throttle2) > groundModel.friction.breakawayThrottle;
}

function isRollingForSteering(state: AircraftState, groundModel: GroundModelData): boolean {
  return Math.abs(state.velocity.u) > groundModel.friction.stopEpsilonMps;
}

function brakeDirectionForVelocity(state: AircraftState, groundModel: GroundModelData): number {
  if (state.velocity.u > groundModel.friction.stopEpsilonMps) return -1;
  if (state.velocity.u < -groundModel.friction.stopEpsilonMps) return 1;
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

function fallbackGroundSurface(groundAltFt: number): GroundSurfaceSample {
  return {
    kind: 'runway',
    onRunway: true,
    groundAltFt,
    frictionScale: RUNWAY_FRICTION_SCALE,
  };
}

function wheelContactsAtOrBelowRunway(
  geometry: WheelContactGeometry,
  includeAllWhenFuselageReferenceContacts: boolean,
): WheelStationContactGeometry[] {
  if (includeAllWhenFuselageReferenceContacts) return geometry.stations;
  return geometry.stations.filter((station) => station.runwayClearanceM <= GROUND_CONTACT_EPSILON_FT * FT_TO_M);
}

function gearStationsLoadedByWheelContacts(
  gearStations: GearStationState[],
  wheelContacts: WheelStationContactGeometry[],
): GearStationState[] {
  const contactIds = new Set(wheelContacts.map((contact) => contact.station.id));
  return gearStations.map((station) => ({
    ...station,
    weightOnWheel: contactIds.has(station.id),
  }));
}

function loadedWheelContactsOnPreparedRunway(
  wheelContacts: WheelStationContactGeometry[],
  surface: GroundSurfaceSample,
  validateWheelFootprints: boolean,
  loadedGearStations?: GearStationState[],
): boolean {
  if (!surface.onRunway) return false;
  if (!validateWheelFootprints) return true;
  const loadedStationIds = loadedGearStations
    ? new Set(loadedGearStations.filter((station) => station.weightOnWheel && station.normalForceN > 1).map((station) => station.id))
    : undefined;
  const loadedWheelContacts = loadedStationIds
    ? wheelContacts.filter((contact) => loadedStationIds.has(contact.station.id))
    : wheelContacts;
  if (loadedWheelContacts.length === 0) return false;
  return loadedWheelContacts.every((contact) => isPositionOnPreparedRunwayFootprint(contact.wheelContactPosition));
}

function maxWheelPenetrationM(wheelContacts: WheelStationContactGeometry[]): number {
  return wheelContacts.reduce((maxPenetration, contact) => Math.max(maxPenetration, contact.runwayPenetrationM), 0);
}

function maxWheelSinkRateMps(wheelContacts: WheelStationContactGeometry[]): number {
  return wheelContacts.reduce((maxSinkRate, contact) => Math.max(maxSinkRate, contact.runwayNormalSinkRateMps), 0);
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
  tailstrike = false,
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
    tailstrike,
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
  groundModel: GroundModelData = B737_GROUND_MODEL,
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
    const stationDampingForceN = groundModel.oleo.dampingRatio * criticalDampingNPerMps * compressionRateMps;
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
  groundModel: GroundModelData = B737_GROUND_MODEL,
): WheelBrakeForceBreakdown {
  let brakeNormalForceN = 0;
  let requestedBrakeForceN = 0;
  let leftBrakeForceN = 0;
  let rightBrakeForceN = 0;
  let brakeForceN = 0;
  let yawMomentNm = 0;
  let antiSkidLimited = false;
  const useAntiSkid = command.antiSkid !== false;
  const longitudinalForceDirection = brakeDirectionForVelocity(state, groundModel);
  const rollingForBraking = longitudinalForceDirection !== 0;
  const frictionScale = frictionScaleForSurface(surface);
  const stationForces: WheelBrakeStationForce[] = [];

  for (const station of gearStations) {
    const normalForceN = station.weightOnWheel && station.brakeCapable ? Math.max(0, station.normalForceN) : 0;
    const brakeCommand = brakeCommandForStation(command, station);
    const requestedStationBrakeForceN = brakeCommand * groundModel.friction.maxBrakeCoefficient * normalForceN;
    const availableStationBrakeForceN = groundModel.friction.maxBrakeFrictionCoefficient * frictionScale.brake * normalForceN;
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
    yawAccelerationRadps2: yawMomentNm / groundModel.inertia.yawInertiaKgM2,
    antiSkidLimited,
    stationForces,
  };
}

export function computeGroundRollForces(
  state: AircraftState,
  inputs: ControlInputs,
  gearStations: GearStationState[] = state.ground.gearStations,
  surface?: GroundSurfaceSample,
  groundModel: GroundModelData = B737_GROUND_MODEL,
): GroundRollForceBreakdown {
  const loadedStations = gearStations.filter((station) => station.weightOnWheel);
  const rollingNormalForceN = loadedStations.reduce((sum, station) => sum + Math.max(0, station.normalForceN), 0);
  const frictionScale = frictionScaleForSurface(surface);
  const brakeForces = computeWheelBrakeForces(
    state,
    brakeCommandFromInputs(inputs),
    gearStations,
    surface,
    groundModel,
  );
  const rollingFrictionForceN = groundModel.friction.rollingFrictionCoefficient * frictionScale.rolling * rollingNormalForceN;
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

export function computeNosewheelSteeringAngleRad(
  inputs: ControlInputs,
  forwardSpeedMps: number,
  groundModel: GroundModelData = B737_GROUND_MODEL,
): number {
  const speed = Math.abs(forwardSpeedMps);
  const fade = speed <= groundModel.steering.fadeStartMps
    ? 1
    : speed >= groundModel.steering.fadeEndMps
      ? 0
      : (groundModel.steering.fadeEndMps - speed) / (groundModel.steering.fadeEndMps - groundModel.steering.fadeStartMps);
  return clamp01(Math.abs(inputs.rudder)) * Math.sign(inputs.rudder) * groundModel.steering.maxRudderPedalNosewheelSteeringRad * fade;
}

export function computeTireSideForces(
  state: AircraftState,
  gearStations: GearStationState[] = state.ground.gearStations,
  surface?: GroundSurfaceSample,
  groundModel: GroundModelData = B737_GROUND_MODEL,
): TireSideForceBreakdown {
  let loadedNormalForceN = 0;
  let peakSideForceN = 0;
  let sideForceN = 0;
  let yawMomentNm = 0;
  let frictionLimited = false;
  const forwardReferenceMps = Math.max(Math.abs(state.velocity.u), groundModel.tire.minSlipForwardSpeedMps);
  const rollingForSteering = isRollingForSteering(state, groundModel);
  const frictionScale = frictionScaleForSurface(surface);

  for (const station of gearStations) {
    const normalForceN = station.weightOnWheel ? Math.max(0, station.normalForceN) : 0;
    if (normalForceN <= 0) continue;

    loadedNormalForceN += normalForceN;
    const lateralVelocityAtStationMps = state.velocity.v + state.angularVel.r * station.positionBodyM.x;
    const steeringAngleRad = station.steerable && rollingForSteering ? station.steeringAngleRad : 0;
    const slipAngleRad = Math.atan2(lateralVelocityAtStationMps, forwardReferenceMps) - steeringAngleRad;
    const stationPeakSideForceN = groundModel.tire.maxSideFrictionCoefficient * frictionScale.side * normalForceN;
    const desiredSideForceN = -groundModel.tire.corneringStiffnessPerNormal * normalForceN * slipAngleRad;
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
    yawAccelerationRadps2: yawMomentNm / groundModel.inertia.yawInertiaKgM2,
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

function applyTouchdownDamping(state: AircraftState, sinkRateMps: number, groundModel: GroundModelData): void {
  if (sinkRateMps < groundModel.contact.touchdownMinSinkRateMps) return;
  state.angularVel.p *= groundModel.contact.touchdownAngularDamping;
  state.angularVel.q *= groundModel.contact.touchdownAngularDamping;
  state.angularVel.r *= groundModel.contact.touchdownAngularDamping;
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

function applyGearUpContactDamping(
  state: AircraftState,
  contact: GroundContactType,
  dt: number,
  groundModel: GroundModelData,
): void {
  const crashed = contact === 'crashed';
  applyRunwayTangentSlideDecel(
    state,
    crashed ? groundModel.contact.crashSlideDecelMps2 : groundModel.contact.bellySlideDecelMps2,
    dt,
  );

  const angularRetentionPerSecond = crashed
    ? groundModel.contact.crashContactAngularRetentionPerSecond
    : groundModel.contact.bellyContactAngularRetentionPerSecond;
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
  groundModel: GroundModelData = B737_GROUND_MODEL,
): void {
  const tireSideForces = computeTireSideForces(state, gearStations, surface, groundModel);
  const previousLateralVelocity = state.velocity.v;
  const lateralDelta = tireSideForces.lateralAccelerationMps2 * Math.max(0, dt);
  const nextLateralVelocity = previousLateralVelocity + lateralDelta;
  const effectiveNeutralSteering = !isRollingForSteering(state, groundModel)
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
  groundModel: GroundModelData = B737_GROUND_MODEL,
): GearStationState[] {
  const steeringAngleRad = computeNosewheelSteeringAngleRad(inputs, state.velocity.u, groundModel);
  const nextStations = gearStations.map((station) => (
    station.id === 'nose' ? { ...station, steeringAngleRad } : station
  ));
  const speed = state.velocity.u;
  if (Math.abs(speed) > groundModel.friction.stopEpsilonMps && Math.abs(steeringAngleRad) > 1e-6) {
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
  groundModel: GroundModelData = B737_GROUND_MODEL,
): void {
  const speed = state.velocity.u;
  const breakawayThrust = hasBreakawayThrustCommand(inputs, groundModel);

  if (Math.abs(speed) <= groundModel.friction.stopEpsilonMps && !breakawayThrust) {
    state.velocity.u = 0;
    return;
  }

  const forces = computeGroundRollForces(state, inputs, gearStations, surface, groundModel);
  const decel = forces.accelerationMps2 * Math.max(0, dt);
  state.angularVel.r += forces.yawAccelerationRadps2 * Math.max(0, dt);

  if (speed > 0) {
    state.velocity.u = Math.max(0, speed - decel);
  } else {
    state.velocity.u = Math.min(0, speed + decel);
  }
}

function stationCompressionM(station: GearStationState, normalForceN: number): number {
  if (normalForceN <= 0) return 0;
  return clamp(normalForceN / station.springStiffnessNPerM, 0, station.maxCompressionM);
}

function groundSpeedMps(state: AircraftState): number {
  return Math.hypot(state.velocity.u, state.velocity.v);
}

function mainGearPivotReference(gearStations: GearStationState[]): BodyStationPosition | undefined {
  const mains = gearStations.filter((station) => station.id === 'leftMain' || station.id === 'rightMain');
  if (mains.length === 0) return undefined;

  return {
    x: mains.reduce((sum, station) => sum + station.positionBodyM.x, 0) / mains.length,
    y: mains.reduce((sum, station) => sum + station.positionBodyM.y, 0) / mains.length,
    z: mains.reduce((sum, station) => sum + station.positionBodyM.z, 0) / mains.length,
  };
}

function pitchPlaneDownM(position: BodyStationPosition, pitchRad: number): number {
  return -Math.sin(pitchRad) * position.x + Math.cos(pitchRad) * position.z;
}

function tailClearanceAboveMainGearPlaneM(gearStations: GearStationState[], pitchRad: number): number {
  const mainReference = mainGearPivotReference(gearStations);
  if (!mainReference) return Number.POSITIVE_INFINITY;
  return pitchPlaneDownM(mainReference, pitchRad) - pitchPlaneDownM(TAIL_CONTACT_POINT_BODY_M, pitchRad);
}

function tailstrikePitchLimitRad(gearStations: GearStationState[]): number {
  const mainReference = mainGearPivotReference(gearStations);
  if (!mainReference) return MAIN_GEAR_PIVOT_MAX_PITCH_RAD;
  const longitudinalArmM = Math.max(1, mainReference.x - TAIL_CONTACT_POINT_BODY_M.x);
  const verticalArmM = Math.max(0, mainReference.z - TAIL_CONTACT_POINT_BODY_M.z);
  return Math.atan2(verticalArmM, longitudinalArmM);
}

function noseGearPitchMomentAboutMainGearNm(gearStations: GearStationState[]): number {
  const mainReference = mainGearPivotReference(gearStations);
  const nose = gearStations.find((station) => station.id === 'nose');
  if (!mainReference || !nose || nose.normalForceN <= 0) return 0;
  return Math.max(0, (nose.positionBodyM.x - mainReference.x) * nose.normalForceN);
}

function allowsMainGearPivot(state: AircraftState, inputs: ControlInputs, options: GroundContactOptions): boolean {
  const rotationSpeedMps = options.rotationReferenceSpeedMps ?? MAIN_GEAR_PIVOT_MIN_SPEED_MPS;
  const airspeedMps = options.airRelativeSpeedMps ?? groundSpeedMps(state);
  return airspeedMps >= rotationSpeedMps && inputs.elevator <= MAIN_GEAR_PIVOT_ELEVATOR;
}

function redistributeForMainGearPivot(gearStations: GearStationState[], allowMainGearPivot: boolean): GearStationState[] {
  if (!allowMainGearPivot) return gearStations;
  const nose = gearStations.find((station) => station.id === 'nose');
  const mains = gearStations.filter((station) => station.id === 'leftMain' || station.id === 'rightMain');
  const mainReference = mainGearPivotReference(gearStations);
  if (!nose || mains.length === 0 || !mainReference || nose.normalForceN <= 0) return gearStations;

  const noseMomentNm = noseGearPitchMomentAboutMainGearNm(gearStations);
  const noseMomentArmM = Math.max(1, nose.positionBodyM.x - mainReference.x);
  const noseUnloadN = Math.min(nose.normalForceN, noseMomentNm / noseMomentArmM);
  const mainLoadGainN = noseUnloadN / mains.length;
  return gearStations.map((station) => {
    const normalForceN = station.id === 'nose'
      ? Math.max(0, station.normalForceN - noseUnloadN)
      : station.id === 'leftMain' || station.id === 'rightMain'
        ? station.normalForceN + mainLoadGainN
        : station.normalForceN;
    return {
      ...station,
      normalForceN,
      compressionM: stationCompressionM(station, normalForceN),
      weightOnWheel: normalForceN > 1,
    };
  });
}

function stabilizeGroundAttitude(
  state: AircraftState,
  allowMainGearPivot: boolean,
  gearStations: GearStationState[],
  groundModel: GroundModelData = B737_GROUND_MODEL,
): boolean {
  const clampedPhi = Math.max(-groundModel.attitude.maxGroundRollRad, Math.min(groundModel.attitude.maxGroundRollRad, state.attitude.phi));
  const tailstrike = tailClearanceAboveMainGearPlaneM(gearStations, state.attitude.theta) <= 0;
  const pivotPitchLimitRad = Math.min(MAIN_GEAR_PIVOT_MAX_PITCH_RAD, tailstrikePitchLimitRad(gearStations));
  const maxPitch = allowMainGearPivot
    ? Math.min(groundModel.attitude.maxGroundPitchRad, pivotPitchLimitRad)
    : Math.min(groundModel.attitude.maxGroundPitchRad, PRE_ROTATION_MAX_PITCH_RAD);
  const clampedTheta = Math.max(groundModel.attitude.minGroundPitchRad, Math.min(maxPitch, state.attitude.theta));

  if (clampedPhi !== state.attitude.phi || clampedTheta !== state.attitude.theta) {
    state.attitude.phi = clampedPhi;
    state.attitude.theta = clampedTheta;
    state.angularVel.p = 0;
    state.angularVel.q = 0;
    state.quaternion = eulerToQuat(clampedPhi, clampedTheta, state.attitude.psi);
  }

  return tailstrike;
}

export function applyGroundContact(
  state: AircraftState,
  inputs: ControlInputs,
  dt: number,
  groundAltFt = KSEA_RUNWAY_ALT_FT,
  options: GroundContactOptions = {},
): GroundContactResult {
  const groundModel = options.groundModel ?? B737_GROUND_MODEL;
  const gearAvailableForContact = actualGearExtensionFraction(state) >= GEAR_CONTACT_EXTENSION_THRESHOLD;
  const contactSurface = options.surface ?? fallbackGroundSurface(groundAltFt);
  const atOrBelowGround = state.position.alt <= groundAltFt + GROUND_CONTACT_EPSILON_FT;
  const wheelGeometry = computeWheelContactGeometry(state, B737_800_SPEC, contactSurface);
  const establishedNearbyGearContact = state.ground.weightOnWheels
    && state.ground.contact === 'gear'
    && Math.abs(state.position.alt - groundAltFt) <= 30;
  const wheelContacts = wheelContactsAtOrBelowRunway(wheelGeometry, atOrBelowGround || establishedNearbyGearContact);
  const hasWheelContact = wheelContacts.length > 0;
  const runwayDownMps = bodyToNed(state.velocity, state.attitude).down;
  const contactSinkRateMps = Math.max(runwayDownMps, maxWheelSinkRateMps(wheelContacts));
  const touchdownSinkRateMps = !state.ground.weightOnWheels && runwayDownMps > 0 ? runwayDownMps : undefined;
  const preliminarySurfaceOnRunway = contactSurface.onRunway;

  if (contactSurface.kind === 'unsupportedTerrain' && !state.ground.weightOnWheels) {
    return setGroundState(state, groundAltFt, 'none', false, 0, undefined, undefined, false);
  }

  if (!atOrBelowGround && !hasWheelContact) {
    return setGroundState(state, groundAltFt, 'none', false, 0);
  }

  if (!state.ground.weightOnWheels && state.position.alt >= groundAltFt && runwayDownMps < 0) {
    return setGroundState(state, groundAltFt, 'none', false, 0);
  }

  if (options.allowLiftoff && gearAvailableForContact && state.ground.weightOnWheels) {
    state.position.alt = Math.max(state.position.alt, groundAltFt + 0.001);
    return setGroundState(state, groundAltFt, 'none', false, 0);
  }

  if (!gearAvailableForContact) {
    const contact: GroundContactType = state.ground.contact === 'crashed' || runwayDownMps > 5 ? 'crashed' : 'belly';
    state.position.alt = Math.max(state.position.alt, groundAltFt);
    applyGearUpContactDamping(state, contact, dt, groundModel);
    constrainRunwayNormalVelocity(state);
    return setGroundState(
      state,
      groundAltFt,
      contact,
      false,
      options.normalForceN ?? grossWeightForceN(state),
      undefined,
      undefined,
      preliminarySurfaceOnRunway,
    );
  }

  const residualGearNormalForceN = options.normalForceN ?? grossWeightForceN(state);
  const staticGearNormalForceN = hasWheelContact && !options.allowLiftoff
    ? Math.max(residualGearNormalForceN, options.minimumSupportedNormalForceN ?? 0)
    : residualGearNormalForceN;
  const contactPenetrationM = atOrBelowGround
    ? Math.max(0, (groundAltFt - state.position.alt) * FT_TO_M)
    : maxWheelPenetrationM(wheelContacts);
  const gearStationsForLoads = gearStationsLoadedByWheelContacts(
    createB737GearStations(staticGearNormalForceN, true),
    wheelContacts,
  );
  const oleoLoads = computeOleoStrutLoads(gearStationsForLoads, {
    totalStaticNormalForceN: staticGearNormalForceN,
    referenceWeightN: grossWeightForceN(state),
    groundPenetrationM: contactPenetrationM,
    runwayDownMps: contactSinkRateMps,
  }, groundModel);
  const gearNormalForceN = oleoLoads.totalNormalForceN;
  let loadedGearStations = oleoLoads.gearStations;
  state.position.alt = atOrBelowGround ? groundAltFt : state.position.alt + contactPenetrationM / FT_TO_M;

  const allowMainGearPivot = allowsMainGearPivot(state, inputs, options);
  const tailstrike = stabilizeGroundAttitude(state, allowMainGearPivot, loadedGearStations, groundModel);
  loadedGearStations = redistributeForMainGearPivot(loadedGearStations, allowMainGearPivot);
  applyTouchdownDamping(state, touchdownSinkRateMps ?? 0, groundModel);
  loadedGearStations = applyNosewheelSteering(state, inputs, loadedGearStations, groundModel);
  applyTireSideForces(state, dt, loadedGearStations, contactSurface, groundModel);
  applyLongitudinalGroundDecel(state, inputs, dt, loadedGearStations, contactSurface, groundModel);
  if (Math.abs(state.velocity.u) <= groundModel.friction.stopEpsilonMps && !hasBreakawayThrustCommand(inputs, groundModel)) {
    state.velocity.u = 0;
  }
  constrainRunwayNormalVelocity(state);
  if (Math.abs(state.velocity.u) <= groundModel.friction.stopEpsilonMps && !hasBreakawayThrustCommand(inputs, groundModel)) {
    state.velocity.u = 0;
  }

  const finalSurfaceOnRunway = loadedWheelContactsOnPreparedRunway(
    wheelContacts,
    contactSurface,
    options.surface !== undefined,
    loadedGearStations,
  );

  return setGroundState(
    state,
    groundAltFt,
    'gear',
    true,
    gearNormalForceN,
    loadedGearStations,
    touchdownSinkRateMps,
    finalSurfaceOnRunway,
    tailstrike,
  );
}
