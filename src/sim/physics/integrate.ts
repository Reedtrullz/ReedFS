import type { AircraftState, AircraftSpec, ControlInputs } from '../types';
import { computeAero } from './aero';
import { updateEngines } from '../systems/engine';
import { updateFuel } from '../systems/fuel';
import { updateElectrical } from '../systems/electrical';
import { updateHydraulic } from '../systems/hydraulic';
import { applyGroundContact, constrainRunwayNormalVelocity, GROUND_CONTACT_EPSILON_FT, KSEA_RUNWAY_ALT_FT } from '../systems/ground';
import { geodeticToEcef, ecefToGeodetic, ecefToEnu, enuToEcef } from './geodesy';
import { bodyToNed } from './frames';
import { ftToM, ktToMs, mToFt } from './units';
import { quatDerivative, quatNormalize, quatToEuler } from './quaternion';
import type { AutopilotState } from '@shared/autopilot/autopilotTypes';
import type { FlightPlan } from '@shared/types/fmc';
import type { WindInfo } from '../weather';
import { sampleKseaSurface } from '../runwaySurface';

const G = 9.80665;
const TAKEOFF_ASSIST_MIN_HEIGHT_FT = 50;
// Release only when the gear is almost unloaded and the aircraft has both
// plausible 737 takeoff energy and a positive rotation attitude. This prevents
// fake liftoff from pitch projection or low-speed over-rotation.
const LIFTOFF_NORMAL_FORCE_FRACTION = 0.08;
const MIN_LIFTOFF_SPEED_MPS = ktToMs(125);
const MIN_LIFTOFF_PITCH_RAD = 3 * Math.PI / 180;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function updateTakeoffPhase(state: AircraftState): void {
  const heightAboveRunwayFt = state.position.alt - KSEA_RUNWAY_ALT_FT;
  const positiveRate = bodyToNed(state.velocity, state.attitude).down < -0.25;

  if (state.flightPhase === 'TAKEOFF' && heightAboveRunwayFt >= TAKEOFF_ASSIST_MIN_HEIGHT_FT && !state.ground.weightOnWheels && positiveRate) {
    state.flightPhase = 'CLIMB';
  }
}

function updateLandingPhase(state: AircraftState): void {
  if (
    (state.flightPhase === 'APPROACH' || state.flightPhase === 'DESCENT') &&
    state.ground.weightOnWheels &&
    state.ground.contact === 'gear'
  ) {
    state.flightPhase = 'LANDED';
  }
}

function estimateNormalForceN(state: AircraftState, aero: { lift: number; thrust: number; weight: number }): number {
  const verticalThrustN = aero.thrust * Math.sin(state.attitude.theta);
  return clamp(aero.weight - aero.lift - verticalThrustN, 0, aero.weight);
}

function shouldAllowLiftoff(state: AircraftState, normalForceN: number, weightN: number): boolean {
  const speedMps = Math.hypot(state.velocity.u, state.velocity.v, state.velocity.w);
  return (
    normalForceN <= weightN * LIFTOFF_NORMAL_FORCE_FRACTION &&
    speedMps >= MIN_LIFTOFF_SPEED_MPS &&
    state.attitude.theta >= MIN_LIFTOFF_PITCH_RAD
  );
}

export function integrate(
  state: AircraftState,
  controls: ControlInputs,
  spec: AircraftSpec,
  dt: number,
  apState?: AutopilotState | null,
  flightPlan?: FlightPlan | null,
  wind?: WindInfo | null,
): void {
  // Autopilot is composed upstream. These legacy parameters are intentionally
  // accepted for older call sites, but the integrator consumes only effective controls.
  void apState;
  void flightPlan;

  // ── Systems (must run before aero so engine/fuel state is current) ──
  updateEngines(state, controls, spec, dt);
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

  const preIntegrationSurface = sampleKseaSurface(state.position);
  const nearRunwaySurface = state.position.alt <= preIntegrationSurface.groundAltFt + GROUND_CONTACT_EPSILON_FT;
  const normalForceN = nearRunwaySurface ? estimateNormalForceN(state, aero) : 0;
  const allowLiftoff = state.ground.weightOnWheels && nearRunwaySurface && shouldAllowLiftoff(state, normalForceN, aero.weight);

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
  // First surface-aware slice: sample KSEA runway rectangles and use the
  // resulting ground surface as a post-solve constraint so free-flight equations
  // and wind/velocity sign conventions remain unchanged.
  const groundSurface = sampleKseaSurface(state.position);
  const groundContact = applyGroundContact(state, controls, dt, groundSurface.groundAltFt, {
    allowLiftoff,
    normalForceN,
    surface: groundSurface,
  });

  // ── Config ──
  state.config.flapSetting = controls.flapLever;
  state.config.gearDown = groundContact.weightOnWheels ? true : controls.gearLever === 'DOWN';
  state.config.spoilersDeployed = controls.spoilers > 0.5;
  state.config.speedBrake = controls.spoilers;
  updateTakeoffPhase(state);
  updateLandingPhase(state);

  // ── Clock ──
  state.simTime += dt * 1000;
  // Time of day: 1 hour per 30 real seconds at 1x simulation
  state.timeOfDay = (state.timeOfDay + dt / 30) % 24;
}
