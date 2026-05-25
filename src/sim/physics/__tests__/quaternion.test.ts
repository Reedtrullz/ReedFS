import { describe, it, expect } from 'vitest';
import { eulerToQuat, quatToEuler, quatDerivative, quatNormalize } from '../quaternion';

describe('eulerToQuat', () => {
  it('zero attitude is identity quaternion', () => {
    const q = eulerToQuat(0, 0, 0);
    expect(q.q0).toBeCloseTo(1);
    expect(q.q1).toBeCloseTo(0);
    expect(q.q2).toBeCloseTo(0);
    expect(q.q3).toBeCloseTo(0);
  });

  it('90° roll', () => {
    const q = eulerToQuat(Math.PI / 2, 0, 0);
    expect(q.q0).toBeCloseTo(Math.cos(Math.PI / 4)); // cos(45°) ≈ 0.707
    expect(q.q1).toBeCloseTo(Math.sin(Math.PI / 4)); // sin(45°) ≈ 0.707
  });
});

describe('quatToEuler round-trip', () => {
  it('90° yaw round-trip', () => {
    const q = eulerToQuat(0, 0, Math.PI / 2);
    const e = quatToEuler(q);
    expect(e.phi).toBeCloseTo(0);
    expect(e.theta).toBeCloseTo(0);
    expect(e.psi).toBeCloseTo(Math.PI / 2, 4);
  });

  it('45° pitch round-trip', () => {
    const q = eulerToQuat(0, Math.PI / 4, 0);
    const e = quatToEuler(q);
    expect(e.theta).toBeCloseTo(Math.PI / 4, 4);
  });
});

describe('quatDerivative', () => {
  it('pure roll rate produces q1 derivative', () => {
    const q = eulerToQuat(0, 0, 0);
    const omega = { p: 2, q: 0, r: 0 };
    const qdot = quatDerivative(q, omega);
    expect(qdot.q0).toBeCloseTo(0);
    expect(qdot.q1).toBeCloseTo(1); // half of angular rate
    expect(qdot.q2).toBeCloseTo(0);
    expect(qdot.q3).toBeCloseTo(0);
  });

  it('applies positive body pitch rate with a 180 degree heading', () => {
    const q = eulerToQuat(0, 0, Math.PI);
    const qdot = quatDerivative(q, { p: 0, q: 2, r: 0 });
    const next = quatNormalize({
      q0: q.q0 + qdot.q0 * 0.01,
      q1: q.q1 + qdot.q1 * 0.01,
      q2: q.q2 + qdot.q2 * 0.01,
      q3: q.q3 + qdot.q3 * 0.01,
    });

    expect(quatToEuler(next).theta).toBeGreaterThan(0);
  });
});

describe('quatNormalize', () => {
  it('normalizes non-unit quaternion', () => {
    const q = { q0: 2, q1: 0, q2: 0, q3: 0 };
    const n = quatNormalize(q);
    expect(n.q0).toBeCloseTo(1);
  });
});
