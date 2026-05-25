export interface Quaternion {
  q0: number; // scalar (w)
  q1: number; // x
  q2: number; // y
  q3: number; // z
}

export interface EulerAngles {
  phi: number;
  theta: number;
  psi: number;
}

/** Euler angles (ZYX convention: psi→theta→phi) to quaternion */
export function eulerToQuat(phi: number, theta: number, psi: number): Quaternion {
  const cphi = Math.cos(phi / 2),
    sphi = Math.sin(phi / 2);
  const ctht = Math.cos(theta / 2),
    stht = Math.sin(theta / 2);
  const cpsi = Math.cos(psi / 2),
    spsi = Math.sin(psi / 2);

  return {
    q0: cphi * ctht * cpsi + sphi * stht * spsi,
    q1: sphi * ctht * cpsi - cphi * stht * spsi,
    q2: cphi * stht * cpsi + sphi * ctht * spsi,
    q3: cphi * ctht * spsi - sphi * stht * cpsi,
  };
}

/** Quaternion to Euler angles (ZYX) */
export function quatToEuler(q: Quaternion): EulerAngles {
  const { q0, q1, q2, q3 } = q;
  const phi = Math.atan2(2 * (q0 * q1 + q2 * q3), 1 - 2 * (q1 * q1 + q2 * q2));
  const theta = Math.asin(Math.max(-1, Math.min(1, 2 * (q0 * q2 - q3 * q1))));
  const psi = Math.atan2(2 * (q0 * q3 + q1 * q2), 1 - 2 * (q2 * q2 + q3 * q3));
  return { phi, theta, psi };
}

/** Quaternion multiplication: a ⊗ b */
export function quatMultiply(a: Quaternion, b: Quaternion): Quaternion {
  return {
    q0: a.q0 * b.q0 - a.q1 * b.q1 - a.q2 * b.q2 - a.q3 * b.q3,
    q1: a.q0 * b.q1 + a.q1 * b.q0 + a.q2 * b.q3 - a.q3 * b.q2,
    q2: a.q0 * b.q2 - a.q1 * b.q3 + a.q2 * b.q0 + a.q3 * b.q1,
    q3: a.q0 * b.q3 + a.q1 * b.q2 - a.q2 * b.q1 + a.q3 * b.q0,
  };
}

/** Quaternion derivative: dq/dt = 0.5 * ω ⊗ q where ω = (0, p, q, r) */
export function quatDerivative(
  q: Quaternion,
  omega: { p: number; q: number; r: number },
): Quaternion {
  const omegaQ: Quaternion = { q0: 0, q1: omega.p, q2: omega.q, q3: omega.r };
  const result = quatMultiply(omegaQ, q);
  return {
    q0: result.q0 * 0.5,
    q1: result.q1 * 0.5,
    q2: result.q2 * 0.5,
    q3: result.q3 * 0.5,
  };
}

/** Normalize quaternion to unit length */
export function quatNormalize(q: Quaternion): Quaternion {
  const mag = Math.sqrt(q.q0 * q.q0 + q.q1 * q.q1 + q.q2 * q.q2 + q.q3 * q.q3);
  if (mag < 1e-10) return { q0: 1, q1: 0, q2: 0, q3: 0 };
  return { q0: q.q0 / mag, q1: q.q1 / mag, q2: q.q2 / mag, q3: q.q3 / mag };
}
