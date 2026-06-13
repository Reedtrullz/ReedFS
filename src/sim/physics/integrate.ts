import type { AircraftState, AircraftSpec, ControlInputs, FlightPhase } from '../types';
import { computeAero } from './aero';
import { updateEngines } from '../systems/engine';
import { updateFuel } from '../systems/fuel';
import { updateElectrical } from '../systems/electrical';
import { updateHydraulic } from '../systems/hydraulic';
import { applyGroundContact, constrainRunwayNormalVelocity, GROUND_CONTACT_EPSILON_FT } from '../systems/ground';
import { geodeticToEcef, ecefToGeodetic, ecefToEnu, enuToEcef } from './geodesy';
import { bodyToNed } from './frames';
import { ftToM, ktToMs, mToFt } from './units';
import { quatDerivative, quatNormalize, quatToEuler } from './quaternion';
import type { WindInfo } from '../weather';
import { sampleSupportedAirportSurface } from '../runwaySurface';
import { computeAirRelativeVelocity } from '../systems/environment';

const G = 9.80665;
const TAKEOFF_ASSIST_MIN_HEIGHT_FT = 50;
const MS_TO_KT = 1.94384449;
const TAXI_SPEED_THRESHOLD_KT = 15;
const STOPPED_SPEED_THRESHOLD_KT = 2.5;
const TOUCHDOWN_MIN_DWELL_MS = 120;
const DEROTATION_MIN_DWELL_MS = 120;
const DEROTATION_COMPLETE_PITCH_RAD = 2.5 * Math.PI / 180;
// Release only when the gear is almost unloaded and the aircraft has both
// plausible 737 takeoff energy and a positive rotation attitude. This prevents
// fake liftoff from pitch projection or low-speed over-rotation.
const LIFTOFF_NORMAL_FORCE_FRACTION = 0.14;
const MIN_LIFTOFF_PITCH_RAD = 3 * Math.PI / 180;
const LIGHT_LIFTOFF_REFERENCE_WEIGHT_KG = 50_000;
const MEDIUM_LIFTOFF_REFERENCE_WEIGHT_KG = 62_000;
const HEAVY_LIFTOFF_REFERENCE_WEIGHT_KG = 78_000;
const LIGHT_LIFTOFF_REFERENCE_SPEED_KT = 137;
const MEDIUM_LIFTOFF_REFERENCE_SPEED_KT = 149;
const HEAVY_LIFTOFF_REFERENCE_SPEED_KT = 170;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function setFlightPhase(state: AircraftState, phase: FlightPhase): void {
  if (state.flightPhase !== phase) {
    state.flightPhase = phase;
    state.flightPhaseStartedMs = state.simTime;
  }
}

function phaseElapsedMs(state: AircraftState): number {
  return Math.max(0, state.simTime - (state.flightPhaseStartedMs ?? state.simTime));
}

function hasLandingTouchdownRecord(state: AircraftState): boolean {
  return state.ground.lastTouchdownSinkRateMps > 0;
}

function updateTakeoffPhase(state: AircraftState): void {
  const heightAboveRunwayFt = state.position.alt - state.ground.groundAltFt;
  const positiveRate = bodyToNed(state.velocity, state.attitude).down < -0.25;

  if (state.flightPhase === 'TAKEOFF' && heightAboveRunwayFt >= TAKEOFF_ASSIST_MIN_HEIGHT_FT && !state.ground.weightOnWheels && positiveRate) {
    setFlightPhase(state, 'CLIMB');
  }
}

function groundSpeedKt(state: AircraftState): number {
  return Math.max(0, Math.hypot(state.velocity.u, state.velocity.v)) * MS_TO_KT;
}

function noseGearHasWeight(state: AircraftState): boolean {
  return state.ground.gearStations.some((station) => station.id === 'nose' && station.weightOnWheel && station.normalForceN > 1);
}

function rolloutPhaseForSpeed(state: AircraftState): 'ROLLOUT' | 'TAXI' | 'STOPPED' {
  const speedKt = groundSpeedKt(state);
  if (speedKt <= STOPPED_SPEED_THRESHOLD_KT) return 'STOPPED';
  if (speedKt <= TAXI_SPEED_THRESHOLD_KT) return 'TAXI';
  return 'ROLLOUT';
}

function updateLandingPhase(state: AircraftState, context: { wasPostLandingTaxiBeforeGroundContact?: boolean } = {}): void {
  const onLandingGear = state.ground.weightOnWheels && state.ground.contact === 'gear';
  const postLandingTaxi = state.flightPhase === 'TAXI'
    && (hasLandingTouchdownRecord(state) || context.wasPostLandingTaxiBeforeGroundContact);
  const landingGroundPhase = state.flightPhase === 'TOUCHDOWN'
    || state.flightPhase === 'DEROTATION'
    || state.flightPhase === 'ROLLOUT'
    || state.flightPhase === 'STOPPED'
    || postLandingTaxi;

  if (!onLandingGear) {
    if (landingGroundPhase) setFlightPhase(state, 'APPROACH');
    return;
  }

  if (state.flightPhase === 'APPROACH' || state.flightPhase === 'DESCENT') {
    setFlightPhase(state, 'TOUCHDOWN');
    return;
  }

  if (state.flightPhase === 'TOUCHDOWN') {
    if (phaseElapsedMs(state) >= TOUCHDOWN_MIN_DWELL_MS) setFlightPhase(state, 'DEROTATION');
    return;
  }

  if (state.flightPhase === 'DEROTATION') {
    if (
      phaseElapsedMs(state) >= DEROTATION_MIN_DWELL_MS
      && (noseGearHasWeight(state) || state.attitude.theta <= DEROTATION_COMPLETE_PITCH_RAD)
    ) {
      setFlightPhase(state, rolloutPhaseForSpeed(state));
    }
    return;
  }

  if (state.flightPhase === 'ROLLOUT' || postLandingTaxi || state.flightPhase === 'STOPPED' || state.flightPhase === 'LANDED') {
    setFlightPhase(state, rolloutPhaseForSpeed(state));
  }
}

function estimateNormalForceN(state: AircraftState, aero: { lift: number; thrust: number; weight: number }): number {
  const verticalThrustN = aero.thrust * Math.sin(state.attitude.theta);
  return clamp(aero.weight - aero.lift - verticalThrustN, 0, aero.weight);
}

function estimateMinimumLiftoffSpeedMps(state: AircraftState): number {
  const grossWeightKg = Math.max(0, state.grossWeight);
  if (grossWeightKg <= MEDIUM_LIFTOFF_REFERENCE_WEIGHT_KG) {
    const fraction = clamp(
      (grossWeightKg - LIGHT_LIFTOFF_REFERENCE_WEIGHT_KG)
        / (MEDIUM_LIFTOFF_REFERENCE_WEIGHT_KG - LIGHT_LIFTOFF_REFERENCE_WEIGHT_KG),
      0,
      1,
    );
    return ktToMs(LIGHT_LIFTOFF_REFERENCE_SPEED_KT + fraction * (MEDIUM_LIFTOFF_REFERENCE_SPEED_KT - LIGHT_LIFTOFF_REFERENCE_SPEED_KT));
  }

  const fraction = clamp(
    (grossWeightKg - MEDIUM_LIFTOFF_REFERENCE_WEIGHT_KG)
      / (HEAVY_LIFTOFF_REFERENCE_WEIGHT_KG - MEDIUM_LIFTOFF_REFERENCE_WEIGHT_KG),
    0,
    1,
  );
  return ktToMs(MEDIUM_LIFTOFF_REFERENCE_SPEED_KT + fraction * (HEAVY_LIFTOFF_REFERENCE_SPEED_KT - MEDIUM_LIFTOFF_REFERENCE_SPEED_KT));
}

function airRelativeSpeedMps(state: AircraftState, wind: WindInfo | null): number {
  const airRelativeVelocity = computeAirRelativeVelocity(state, wind);
  return Math.hypot(airRelativeVelocity.u, airRelativeVelocity.v, airRelativeVelocity.w);
}

function shouldAllowLiftoff(state: AircraftState, airspeedMps: number, normalForceN: number, weightN: number): boolean {
  return (
    normalForceN <= weightN * LIFTOFF_NORMAL_FORCE_FRACTION &&
    airspeedMps >= estimateMinimumLiftoffSpeedMps(state) &&
    state.attitude.theta >= MIN_LIFTOFF_PITCH_RAD
  );
}

function applyPilotConfiguration(state: AircraftState, controls: ControlInputs, weightOnWheels = state.ground.weightOnWheels): void {
  state.config.flapSetting = controls.flapLever;
  state.config.gearDown = weightOnWheels ? true : controls.gearLever === 'DOWN';
  state.config.spoilersDeployed = controls.spoilers > 0.5;
  state.config.speedBrake = controls.spoilers;
}

export function integrate(
  state: AircraftState,
  controls: ControlInputs,
  spec: AircraftSpec,
  dt: number,
  wind?: WindInfo | null,
): void {
  // ── Systems (must run before aero so engine/fuel state is current) ──
  // Pilot-facing configuration controls must be visible to the same tick's aero solve.
  // Ground contact re-applies the gear safety rule after liftoff/contact resolution.
  applyPilotConfiguration(state, controls);
  updateEngines(state, controls, spec, dt, wind ?? null);
  updateFuel(state, spec, dt);
  updateElectrical(state, dt);
  updateHydraulic(state, dt);

  const aero = computeAero(state, controls, spec, undefined, wind ?? null);
  const mass = state.grossWeight;
  const { p, q, r } = state.angularVel;

  // ── Angular acceleration (Euler's equations) ──
  const ixx = spec.ixx, iyy = spec.iyy, izz = spec.izz, ixz = spec.ixz;
  const pDot = (aero.rollMoment + (iyy - izz) * q * r + ixz * p * q) / ixx;
  const qDot = (aero.pitchMoment + (izz - ixx) * p * r + ixz * (r * r - p * p)) / iyy;
  const rDot = (aero.yawMoment + (ixx - iyy) * p * q - ixz * q * r) / izz;

  state.angularVel.p += pDot * dt;
  state.angularVel.q += qDot * dt;
  state.angularVel.r += rDot * dt;

  // ── Quaternion derivative (replaces Euler angle rates — no gimbal lock) ──
  const qdot = quatDerivative(state.quaternion, state.angularVel);
  state.quaternion.q0 += qdot.q0 * dt;
  state.quaternion.q1 += qdot.q1 * dt;
  state.quaternion.q2 += qdot.q2 * dt;
  state.quaternion.q3 += qdot.q3 * dt;
  const norm = quatNormalize(state.quaternion);
  state.quaternion = norm;

  // Compute Euler angles from quaternion (for backward compat with display/body-NED rotation)
  const euler = quatToEuler(norm);
  state.attitude.phi = euler.phi;
  state.attitude.theta = euler.theta;
  state.attitude.psi = euler.psi;

  // Recompute trig for updated attitude
  const sphi = Math.sin(state.attitude.phi), cphi = Math.cos(state.attitude.phi);
  const stht = Math.sin(state.attitude.theta), ctht = Math.cos(state.attitude.theta);

  // ── Body velocity update ──
  // Body axes: x forward, y right, z down. Gravity is positive down in NED.
  const gx = -G * stht;
  const gy = G * ctht * sphi;
  const gz = G * ctht * cphi;

  const udot = aero.thrust / mass + aero.dragBodyX / mass + gx - q * state.velocity.w + r * state.velocity.v;
  const vdot = aero.side / mass + gy - r * state.velocity.u + p * state.velocity.w;
  const wdot = -aero.lift / mass + gz - p * state.velocity.v + q * state.velocity.u;

  state.velocity.u += udot * dt;
  state.velocity.v += vdot * dt;
  state.velocity.w += wdot * dt;

  const preIntegrationSurface = sampleSupportedAirportSurface(state.position);
  const nearRunwaySurface = state.position.alt <= preIntegrationSurface.groundAltFt + GROUND_CONTACT_EPSILON_FT;
  const normalForceN = nearRunwaySurface ? estimateNormalForceN(state, aero) : 0;
  const airspeedMps = airRelativeSpeedMps(state, wind ?? null);
  const rotationReferenceSpeedMps = estimateMinimumLiftoffSpeedMps(state);
  const allowLiftoff = state.ground.weightOnWheels
    && nearRunwaySurface
    && shouldAllowLiftoff(state, airspeedMps, normalForceN, aero.weight);

  if (state.ground.weightOnWheels && nearRunwaySurface && !allowLiftoff) {
    constrainRunwayNormalVelocity(state);
  }

  // ── Position update via ECEF/ENU ──
  // Body→NED rotation for current attitude
  const { phi: ph, theta: th, psi: ps } = state.attitude;
  const sph = Math.sin(ph), cph = Math.cos(ph);
  const sth = Math.sin(th), cth = Math.cos(th);
  const sps = Math.sin(ps), cps = Math.cos(ps);

  const vn = cth * cps * state.velocity.u + (sph * sth * cps - cph * sps) * state.velocity.v + (cph * sth * cps + sph * sps) * state.velocity.w;
  const ve = cth * sps * state.velocity.u + (sph * sth * sps + cph * cps) * state.velocity.v + (cph * sth * sps - sph * cps) * state.velocity.w;
  const vd = -sth * state.velocity.u + sph * cth * state.velocity.v + cph * cth * state.velocity.w; // positive down

  const altM = state.position.alt * ftToM(1);
  const refEcef = geodeticToEcef(state.position.lat, state.position.lon, 0);
  const posEcef = geodeticToEcef(state.position.lat, state.position.lon, altM);
  // Current position as ENU offset from reference point at surface
  const enu = ecefToEnu(posEcef, refEcef, state.position.lat, state.position.lon);
  enu.e += ve * dt;
  enu.n += vn * dt;
  enu.u += -vd * dt;
  const newEcef = enuToEcef(enu, refEcef, state.position.lat, state.position.lon);
  const geo = ecefToGeodetic(newEcef.x, newEcef.y, newEcef.z);
  state.position.lat = geo.lat;
  state.position.lon = geo.lon;
  state.position.alt = geo.alt * mToFt(1);

  // ── Ground contact constraint ──
  // Sample supported-airport runway/off-runway rectangles and use the resulting
  // ground surface as a post-solve constraint so free-flight equations and
  // wind/velocity sign conventions remain unchanged.
  const wasPostLandingTaxiBeforeGroundContact = state.flightPhase === 'TAXI' && hasLandingTouchdownRecord(state);
  const groundSurface = sampleSupportedAirportSurface(state.position);
  const groundContact = applyGroundContact(state, controls, dt, groundSurface.groundAltFt, {
    allowLiftoff,
    normalForceN,
    surface: groundSurface,
    airRelativeSpeedMps: airspeedMps,
    rotationReferenceSpeedMps,
    minimumSupportedNormalForceN: state.ground.weightOnWheels && !allowLiftoff ? aero.weight : 0,
  });

  // ── Config ──
  applyPilotConfiguration(state, controls, groundContact.weightOnWheels);
  updateTakeoffPhase(state);
  updateLandingPhase(state, { wasPostLandingTaxiBeforeGroundContact });

  // ── Clock ──
  state.simTime += dt * 1000;
  // Time of day: 1 hour per 30 real seconds at 1x simulation
  state.timeOfDay = (state.timeOfDay + dt / 30) % 24;
}
