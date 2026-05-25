import type { AircraftState, AircraftSpec, ControlInputs } from '../types';
import { computeAero } from './aero';
import { updateEngines } from '../systems/engine';
import { updateFuel } from '../systems/fuel';
import { updateElectrical } from '../systems/electrical';
import { updateHydraulic } from '../systems/hydraulic';
import { updateAutopilot } from '../systems/autopilot';
import { computeLNAV } from '../systems/navigation';
import { computeVNAV } from '../systems/vnav';
import { geodeticToEcef, ecefToGeodetic, ecefToEnu, enuToEcef } from './geodesy';
import { ftToM, mToFt } from './units';
import { quatDerivative, quatNormalize, quatToEuler } from './quaternion';
import type { AutopilotState } from '@shared/autopilot/autopilotTypes';
import type { FlightPlan } from '@shared/types/fmc';

const G = 9.80665;

export function integrate(
  state: AircraftState,
  inputs: ControlInputs,
  spec: AircraftSpec,
  dt: number,
  apState?: AutopilotState | null,
  flightPlan?: FlightPlan | null,
): void {
  // ── Systems (must run before aero so engine/fuel state is current) ──
  updateEngines(state, inputs, spec, dt);
  updateFuel(state, spec, dt);
  updateElectrical(state, dt);
  updateHydraulic(state, dt);

  const aero = computeAero(state, inputs, spec);
  const mass = state.grossWeight;
  const { phi, theta } = state.attitude;
  const { p, q, r } = state.angularVel;
  const sinPhi = Math.sin(phi), cosPhi = Math.cos(phi);
  const sinTheta = Math.sin(theta), cosTheta = Math.cos(theta);

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
  // Gravity in body frame
  const gx = G * stht;
  const gy = -G * ctht * sphi;
  const gz = -G * ctht * cphi;

  const udot = aero.thrust / mass - aero.drag / mass + gx - q * state.velocity.w + r * state.velocity.v;
  const vdot = aero.side / mass + gy - r * state.velocity.u + p * state.velocity.w;
  const wdot = -aero.lift / mass + gz - p * state.velocity.v + q * state.velocity.u;

  state.velocity.u += udot * dt;
  state.velocity.v += vdot * dt;
  state.velocity.w += wdot * dt;

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

  // ── Config ──
  state.config.flapSetting = inputs.flapLever;
  state.config.gearDown = inputs.gearLever === 'DOWN';
  state.config.spoilersDeployed = inputs.spoilers > 0.5;
  state.config.speedBrake = inputs.spoilers;

  // ── Autopilot (overwrites inputs for next frame) ──
  if (apState && apState.truth.autopilotStatus !== 'OFF') {
    let targetHeading = state.attitude.psi;
    let targetAlt = state.position.alt;
    const targetSpeed = 250;

    // LNAV: compute desired track from flight plan
    if (apState.truth.lateralActive === 'LNAV' && flightPlan) {
      const nav = computeLNAV(state, flightPlan, 0);
      targetHeading = nav.desiredTrack;
    }

    // VNAV: compute target altitude from flight plan
    if (apState.truth.verticalActive === 'VNAV' && flightPlan) {
      const navDefault = { crossTrackError: 0, alongTrackDist: 0, desiredTrack: targetHeading, activeWaypointIndex: 0, waypointReached: false };
      const vnav = computeVNAV(state, flightPlan, navDefault);
      if (vnav.altitudeConstraint) {
        targetAlt = vnav.targetAlt;
      }
    }

    updateAutopilot(state, inputs, apState, targetHeading, targetAlt, targetSpeed, dt);
  }

  // ── Clock ──
  state.simTime += dt * 1000;
  // Time of day: 1 hour per 30 real seconds at 1x simulation
  state.timeOfDay = (state.timeOfDay + dt / 30) % 24;
}
