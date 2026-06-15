import { describe, expect, it } from 'vitest';
import { createDefaultAutopilotState, createDefaultAutopilotStateFromAircraft } from '../defaultAutopilotState';
import { deriveDisplayFmaTruth } from '../../sim/systems/fmaTruth';
import { B737_800_SPEC, createInitialState } from '../../sim/types';
import { eulerToQuat } from '../../sim/physics/quaternion';
import { ktToMs } from '../../sim/physics/units';

describe('createDefaultAutopilotState', () => {
  it('keeps raw AP command channels unbacked when AP truth is OFF', () => {
    const ap = createDefaultAutopilotState();

    expect(ap.truth.autopilotStatus).toBe('OFF');
    expect(ap.boeing.cmdA).toBe(false);
    expect(ap.boeing.cmdB).toBe(false);
    expect(ap.boeing.cwsA).toBe(false);
    expect(ap.boeing.cwsB).toBe(false);
    expect(deriveDisplayFmaTruth(ap).autopilotStatus).toBe('OFF');
  });

  it('seeds Boeing heading and altitude from aircraft without creating a managed speed intervention', () => {
    const aircraft = createInitialState(B737_800_SPEC);
    aircraft.position.alt = 432;
    aircraft.attitude = { phi: 0, theta: 0, psi: 163 * Math.PI / 180 };
    aircraft.quaternion = eulerToQuat(aircraft.attitude.phi, aircraft.attitude.theta, aircraft.attitude.psi);
    aircraft.velocity = { u: ktToMs(150), v: 0, w: 0 };

    const ap = createDefaultAutopilotStateFromAircraft(aircraft);

    expect(ap.boeing.heading).toBe(163);
    expect(ap.boeing.altitude).toBe(400);
    expect(ap.boeing.speed).toBeNull();
    expect(ap.truth.autopilotStatus).toBe('OFF');
    expect(ap.truth.lateralActive).toBe('OFF');
    expect(ap.truth.verticalActive).toBe('OFF');
    expect(ap.truth.thrustActive).toBe('OFF');
    expect(ap.boeing.cmdA).toBe(false);
    expect(ap.boeing.cmdB).toBe(false);
    expect(ap.boeing.cwsA).toBe(false);
    expect(ap.boeing.cwsB).toBe(false);
  });
});
