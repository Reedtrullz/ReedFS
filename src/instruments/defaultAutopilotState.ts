import type { AutopilotState } from '@shared/autopilot/autopilotTypes';
import type { AircraftState } from '../sim/types';
import type { WindInfo } from '../sim/weather';
import { computeDerived } from '../sim/physics/derived';
import { quatToEuler } from '../sim/physics/quaternion';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function wrapHeadingDeg(value: number): number {
  return ((Math.round(value) % 360) + 360) % 360;
}

export function createDefaultAutopilotState(): AutopilotState {
  return {
    boeing: {
      courseL: 0,
      courseR: 0,
      speed: null,
      mach: null,
      heading: 0,
      altitude: 10000,
      verticalSpeed: null,
      fdLeft: false,
      fdRight: false,
      autothrottleArm: true,
      n1: false,
      speedMode: false,
      lnav: false,
      vnav: false,
      lvlChg: false,
      hdgSel: false,
      vorLoc: false,
      app: false,
      altHold: false,
      vs: false,
      cmdA: false,
      cmdB: false,
      cwsA: false,
      cwsB: false,
    },
    airbus: {
      speed: null,
      speedManaged: false,
      heading: null,
      headingManaged: false,
      altitude: 10000,
      altitudeManaged: false,
      verticalSpeed: null,
      fpa: null,
      fd1: false,
      fd2: false,
      athr: false,
      ap1: false,
      ap2: false,
      loc: false,
      appr: false,
      exped: false,
      hdgTrkMode: 'HDG_VS',
      metricAltitude: false,
      speedMachMode: 'SPD',
    },
    truth: {
      lateralActive: 'OFF',
      verticalActive: 'OFF',
      thrustActive: 'OFF',
      autopilotStatus: 'OFF',
      lastModeChangeTimestamps: { thrust: 0, lateral: 0, vertical: 0 },
    },
  };
}

export function createDefaultAutopilotStateFromAircraft(
  aircraft: AircraftState,
  wind: WindInfo | null = null,
): AutopilotState {
  const ap = createDefaultAutopilotState();
  const headingDeg = quatToEuler(aircraft.quaternion).psi * 180 / Math.PI;
  const ias = Math.max(0, computeDerived(aircraft, wind).ias);

  ap.boeing.heading = wrapHeadingDeg(headingDeg);
  ap.boeing.altitude = clamp(Math.round(aircraft.position.alt / 100) * 100, 0, 41000);
  ap.boeing.speed = clamp(Math.round(ias), 100, 340);

  return ap;
}
