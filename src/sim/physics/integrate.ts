import type { AircraftState, AircraftSpec, ControlInputs } from '../types';
import { computeAero } from './aero';
import { geodeticToEcef, ecefToGeodetic, ecefToEnu, enuToEcef } from './geodesy';
import { ftToM, mToFt } from './units';

const G = 9.80665;

export function integrate(
  state: AircraftState,
  inputs: ControlInputs,
  spec: AircraftSpec,
  dt: number,
): void {
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

  // ── Euler angle rates ──
  const phiDot = p + q * sinPhi * Math.tan(theta) + r * cosPhi * Math.tan(theta);
  const thetaDot = q * cosPhi - r * sinPhi;
  const psiDot = (q * sinPhi + r * cosPhi) / Math.max(0.001, cosTheta);

  state.attitude.phi += phiDot * dt;
  state.attitude.theta += thetaDot * dt;
  state.attitude.psi += psiDot * dt;

  while (state.attitude.psi < 0) state.attitude.psi += 2 * Math.PI;
  while (state.attitude.psi >= 2 * Math.PI) state.attitude.psi -= 2 * Math.PI;

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

  // ── Engine spool ──
  const n1Tc = 1.5;
  state.engines[0].n1 += (inputs.throttle1 * 100 - state.engines[0].n1) * (dt / n1Tc);
  state.engines[1].n1 += (inputs.throttle2 * 100 - state.engines[1].n1) * (dt / n1Tc);
  state.engines[0].running = state.engines[0].n1 > 0.5;
  state.engines[1].running = state.engines[1].n1 > 0.5;

  // ── Fuel burn ──
  const ff = (state.engines[0].n1 + state.engines[1].n1) * 0.15;
  state.fuel.totalFuel = Math.max(0, state.fuel.totalFuel - (ff / 3600) * dt);
  state.grossWeight = spec.emptyWeight + state.fuel.totalFuel;

  // ── Config ──
  state.config.flapSetting = inputs.flapLever;
  state.config.gearDown = inputs.gearLever === 'DOWN';
  state.config.spoilersDeployed = inputs.spoilers > 0.5;
  state.config.speedBrake = inputs.spoilers;

  // ── Clock ──
  state.simTime += dt * 1000;
}
